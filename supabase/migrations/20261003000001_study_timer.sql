-- 勉強タイマー：スライドで始め、スライドで終える。アプリを閉じる・決まった時間がたつ（消し忘れ防止）でも止まる。
-- 積み重ねた時間を、ブロック（［仮］15分）ごとにコインの報酬にする。
-- 仕様書 4章の 03「15分集中モード」を、時間を積み上げる形に広げたもの。

-- ［仮］の値を足す（既存の値はそのまま）
create or replace function nobit_config() returns jsonb
language sql immutable as $$
  select jsonb_build_object(
    'consent_version',         '2026-10-v1',  -- 保護者同意の文面の版（閲覧範囲を変えたら上げる）
    'default_task_reward',     10,            -- ［仮］運営設定タスク
    'free_entry_reward',       5,             -- ［仮］自由登録
    'free_entry_daily_limit',  3,             -- ［仮］自由登録は1日3件まで
    'ticket_max',              2,             -- ［仮］休息チケットの所持上限
    'study_max_minutes',       120,           -- ［仮］消し忘れ防止。始めてからこの時間で自動で止める
    'study_idle_minutes',      10,            -- ［仮］画面が開いていない時間がこれを超えたら、アプリを閉じたとみなす
    'study_block_minutes',     15,            -- ［仮］報酬の単位（1日の合計時間で数える）
    'study_block_reward',      5,             -- ［仮］1ブロックのコイン
    'study_daily_block_limit', 8              -- ［仮］1日に報酬を出すブロックの上限（15分×8＝2時間）
  )
$$;

-- focus_sessions を勉強タイマーの記録に使う
alter table focus_sessions drop constraint if exists focus_sessions_focused_seconds_check;
alter table focus_sessions
  add column study_date      date,
  add column last_seen_at    timestamptz,
  add column end_reason      text check (end_reason in ('manual', 'app_closed', 'idle', 'time_limit')),
  add column request_id      uuid unique,
  add column acknowledged_at timestamptz,
  add constraint focus_sessions_seconds_range check (focused_seconds between 0 and 86400);
update focus_sessions set study_date = nobit_jst_date(started_at), last_seen_at = started_at where study_date is null;
alter table focus_sessions alter column study_date set not null;
create unique index focus_sessions_one_active on focus_sessions (user_id) where ended_at is null;
create index focus_sessions_user_date on focus_sessions (user_id, study_date);

alter table coin_transactions drop constraint coin_transactions_reason_check;
alter table coin_transactions add constraint coin_transactions_reason_check
  check (reason in ('task', 'free_task', 'study', 'quest', 'mission', 'gacha_duplicate', 'adjustment'));

-- 勉強時間はクラブ管理者の閲覧範囲（完了したタスクと記録の帯）に入らない。
-- 本人の時間は RPC で返し、表を直接読めるのは運営だけにする。
drop policy focus_sessions_read on focus_sessions;
create policy focus_sessions_read on focus_sessions for select to authenticated using (nobit_is_operator());
-- daily_activity は記録の帯に使う列だけを読めるようにする（起動回数と勉強時間は出さない）
revoke select on daily_activity from authenticated;
grant select (club_id, user_id, activity_date, completed_count, rest_kind, judged_at) on daily_activity to authenticated;

-- その日の勉強時間と、報酬を出したブロック数
create function nobit_study_day(p_user uuid, p_date date) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'seconds', coalesce(sum(focused_seconds), 0),
    'blocks',  least(coalesce(sum(focused_seconds), 0) / ((nobit_config() ->> 'study_block_minutes')::int * 60),
                     (nobit_config() ->> 'study_daily_block_limit')::int))
  from focus_sessions where user_id = p_user and study_date = p_date and ended_at is not null
$$;

-- その日の合計時間に応じてブロックの報酬を出す。ブロックごとに台帳のIDが決まるので、何度呼んでも二重に出ない。
create function nobit_grant_study_rewards(p_user uuid, p_date date) returns integer
language plpgsql volatile security definer set search_path = public as $$
declare
  u        users;
  v_blocks integer := (nobit_study_day(p_user, p_date) ->> 'blocks')::int;
  v_reward integer := (nobit_config() ->> 'study_block_reward')::int;
  v_total  integer := 0;
  b        integer;
begin
  select * into u from users where id = p_user;
  for b in 1 .. v_blocks loop
    insert into coin_transactions (club_id, user_id, amount, reason, source_type, source_id, note)
    values (u.club_id, u.id, v_reward, 'study', 'study_block',
            md5(u.id::text || ':' || p_date::text || ':' || b::text)::uuid,
            p_date::text || ' ' || b::text || 'ブロック目')
    on conflict (source_type, source_id) do nothing;
    if found then v_total := v_total + v_reward; end if;
  end loop;
  if v_total > 0 then
    update users set coin_balance = coin_balance + v_total where id = u.id;
  end if;
  return v_total;
end $$;

-- 1回分の記録を返す
create function nobit_study_result(s focus_sessions, p_coins integer) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id',           s.id,
    'started_at',   s.started_at,
    'ended_at',     s.ended_at,
    'started_time', to_char(s.started_at at time zone 'Asia/Tokyo', 'HH24:MI'),
    'ended_time',   to_char(s.ended_at at time zone 'Asia/Tokyo', 'HH24:MI'),
    'seconds',      s.focused_seconds,
    'end_reason',   s.end_reason,
    'coins',        p_coins,
    'study_date',   s.study_date,
    'day',          nobit_study_day(s.user_id, s.study_date))
$$;

-- タイマーを止めて記録する（終わりは開始から上限まで）
create function nobit_close_study(p_session uuid, p_end timestamptz, p_reason text) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  s       focus_sessions;
  v_max   interval := make_interval(mins => (nobit_config() ->> 'study_max_minutes')::int);
  v_coins integer;
begin
  update focus_sessions
     set ended_at        = least(greatest(p_end, started_at), started_at + v_max),
         focused_seconds = floor(extract(epoch from least(greatest(p_end, started_at), started_at + v_max) - started_at))::int,
         end_reason      = p_reason,
         acknowledged_at = case when p_reason = 'manual' then now() end
   where id = p_session and ended_at is null
  returning * into s;
  if s.id is null then
    return null;
  end if;
  insert into daily_activity (club_id, user_id, activity_date, study_seconds)
  values (s.club_id, s.user_id, s.study_date, s.focused_seconds)
  on conflict (user_id, activity_date)
  do update set study_seconds = daily_activity.study_seconds + excluded.study_seconds;
  v_coins := nobit_grant_study_rewards(s.user_id, s.study_date);
  return nobit_study_result(s, v_coins);
end $$;

-- 消し忘れと、閉じたアプリのタイマーを止める（定時処理と、生徒の RPC の入口で呼ぶ）
-- 画面が開いていない時間が study_idle_minutes を超えたら、最後に開いていた時刻で止める。
-- 開いていても study_max_minutes に達したら、開始から上限の時刻で止める。
create function nobit_sweep_study(p_user uuid default null) returns integer
language plpgsql volatile security definer set search_path = public as $$
declare
  s      focus_sessions;
  v_now  timestamptz := nobit_now();
  v_max  interval := make_interval(mins => (nobit_config() ->> 'study_max_minutes')::int);
  v_idle interval := make_interval(mins => (nobit_config() ->> 'study_idle_minutes')::int);
  v_seen timestamptz;
  n      integer := 0;
begin
  for s in select * from focus_sessions
            where ended_at is null and (p_user is null or user_id = p_user) for update skip locked
  loop
    v_seen := coalesce(s.last_seen_at, s.started_at);
    if v_seen + v_idle < v_now and v_seen < s.started_at + v_max then
      perform nobit_close_study(s.id, v_seen, 'idle');
      n := n + 1;
    elsif v_now >= s.started_at + v_max then
      perform nobit_close_study(s.id, s.started_at + v_max, 'time_limit');
      n := n + 1;
    end if;
  end loop;
  return n;
end $$;

-- ---------------------------------------------------------------
-- 生徒アプリの RPC
-- ---------------------------------------------------------------

-- タイマーの状態。動いているタイマー、今日の合計、本人がまだ見ていない自動停止の記録を返す。
create function study_status() returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  me      users := nobit_require_student();
  v_today date := nobit_today();
  a       focus_sessions;
  p       focus_sessions;
begin
  perform nobit_sweep_study(me.id);
  select * into a from focus_sessions where user_id = me.id and ended_at is null;
  select * into p from focus_sessions
   where user_id = me.id and ended_at is not null and acknowledged_at is null
   order by ended_at desc limit 1;
  return jsonb_build_object(
    'server_now', nobit_now(),
    'config', jsonb_build_object(
      'max_minutes',       (nobit_config() ->> 'study_max_minutes')::int,
      'idle_minutes',      (nobit_config() ->> 'study_idle_minutes')::int,
      'block_minutes',     (nobit_config() ->> 'study_block_minutes')::int,
      'block_reward',      (nobit_config() ->> 'study_block_reward')::int,
      'daily_block_limit', (nobit_config() ->> 'study_daily_block_limit')::int),
    'today', nobit_study_day(me.id, v_today),
    'active', case when a.id is null then null else jsonb_build_object(
      'id', a.id, 'started_at', a.started_at,
      'started_time', to_char(a.started_at at time zone 'Asia/Tokyo', 'HH24:MI'),
      'study_date', a.study_date, 'day', nobit_study_day(me.id, a.study_date)) end,
    'pending_result', case when p.id is null then null else nobit_study_result(p, 0) end);
end $$;

-- スライドして始める。動いているタイマーがあれば、それを続ける（二重には始めない）。
create function start_study(p_request_id uuid) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  me    users := nobit_require_student();
  v_now timestamptz := nobit_now();
begin
  perform 1 from users where id = me.id for update;
  perform nobit_sweep_study(me.id);
  if not exists (select 1 from focus_sessions where user_id = me.id and ended_at is null)
     and not exists (select 1 from focus_sessions where request_id = p_request_id) then
    insert into focus_sessions (club_id, user_id, started_at, last_seen_at, study_date, request_id)
    values (me.club_id, me.id, v_now, v_now, nobit_jst_date(v_now), p_request_id);
  end if;
  return study_status();
end $$;

-- 画面が開いている間、1分ごとに呼ぶ（アプリを閉じたかどうかの判定に使う）
create function study_heartbeat(p_session_id uuid) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare me users := nobit_require_student();
begin
  perform nobit_sweep_study(me.id);
  update focus_sessions set last_seen_at = nobit_now()
   where id = p_session_id and user_id = me.id and ended_at is null;
  return jsonb_build_object('active', found, 'server_now', nobit_now());
end $$;

-- スライドして終える（p_reason = 'manual'）、またはアプリを閉じるとき（'app_closed'）に呼ぶ
create function end_study(p_session_id uuid, p_reason text default 'manual') returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  me     users := nobit_require_student();
  s      focus_sessions;
  v_res  jsonb;
begin
  if p_reason not in ('manual', 'app_closed') then
    raise exception 'reason_invalid' using errcode = '22023';
  end if;
  perform 1 from users where id = me.id for update;
  perform nobit_sweep_study(me.id);
  select * into s from focus_sessions where id = p_session_id and user_id = me.id;
  if s.id is null then
    raise exception 'study_not_found' using errcode = 'P0002';
  end if;
  if s.ended_at is not null then
    -- すでに止まっている（自動で止まった・二度押し）。記録しなおさない。
    update focus_sessions set acknowledged_at = coalesce(acknowledged_at, now()) where id = s.id and p_reason = 'manual';
    return nobit_study_result(s, 0) || jsonb_build_object('already', true);
  end if;
  v_res := nobit_close_study(s.id, nobit_now(), p_reason);
  return v_res || jsonb_build_object('already', false);
end $$;

-- 自動で止まった記録を、本人が見たことにする
create function ack_study(p_session_id uuid) returns void
language sql volatile security definer set search_path = public as $$
  update focus_sessions set acknowledged_at = coalesce(acknowledged_at, now())
   where id = p_session_id and user_id = (nobit_require_student()).id
$$;

-- ---------------------------------------------------------------
-- 管理画面（運営のみ）。勉強時間はクラブ管理者の閲覧範囲に入れない。
-- ---------------------------------------------------------------
create function admin_study_today(p_club uuid) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare v_today date := nobit_today();
begin
  perform nobit_require_operator();
  perform nobit_sweep_study(null);
  return (
    select coalesce(jsonb_object_agg(u.id, jsonb_build_object(
             'seconds', (nobit_study_day(u.id, v_today) ->> 'seconds')::int,
             'active',  exists (select 1 from focus_sessions f where f.user_id = u.id and f.ended_at is null))), '{}'::jsonb)
      from users u where u.role = 'student' and u.club_id = p_club);
end $$;

-- 10 生徒の詳細：勉強時間とコインは運営だけに返す（stable から volatile に変え、開いたときに止め忘れを片づける）
create or replace function admin_student_detail(p_student_id uuid) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  u       users;
  v_op    boolean := nobit_is_operator();
  v_today date := nobit_today();
  v_month date := date_trunc('month', nobit_today())::date;
begin
  select * into u from users where id = p_student_id and role = 'student';
  if u.id is null then
    raise exception 'student_not_found' using errcode = 'P0002';
  end if;
  perform nobit_require_club(u.club_id);
  perform nobit_sweep_study(u.id);

  return jsonb_build_object(
    'viewer_role', case when v_op then 'operator' else 'club_admin' end,
    'student', jsonb_build_object(
      'id', u.id, 'display_name', u.display_name, 'grade', u.grade,
      'club_id', u.club_id, 'club_name', (select name from clubs where id = u.club_id),
      'friend_status', u.line_friend_status, 'line_contact_opt_in', u.line_contact_opt_in,
      'approved_on', (select nobit_jst_date(decided_at) from club_members where user_id = u.id and club_id = u.club_id)),
    'streak', jsonb_build_object(
      'current', coalesce(nobit_current_streak(u.id), 0),
      'best', coalesce((select best from streaks where user_id = u.id), 0)),
    'month_days', (select count(*) from daily_activity
                    where user_id = u.id and activity_date >= v_month and completed_count > 0),
    -- 勉強時間は運営だけに返す（クラブ管理者の閲覧範囲は、完了したタスクと記録の帯まで）
    'focus_minutes_month', case when v_op then
      (select coalesce(sum(focused_seconds), 0) / 60 from focus_sessions
        where user_id = u.id and study_date >= v_month and ended_at is not null) end,
    'study_sessions', case when v_op then (
      select coalesce(jsonb_agg(jsonb_build_object(
               'date', f.study_date,
               'started_time', to_char(f.started_at at time zone 'Asia/Tokyo', 'HH24:MI'),
               'ended_time', to_char(f.ended_at at time zone 'Asia/Tokyo', 'HH24:MI'),
               'minutes', f.focused_seconds / 60,
               'end_reason', f.end_reason) order by f.started_at desc), '[]'::jsonb)
        from (select * from focus_sessions where user_id = u.id and ended_at is not null
               order by started_at desc limit 10) f) end,
    'strip', nobit_strip(u.id, v_today - 83, v_today),
    'subjects', (
      select coalesce(jsonb_agg(jsonb_build_object('subject', subject, 'n', n) order by n desc), '[]'::jsonb)
        from (select coalesce(t.subject, ut.free_subject) as subject, count(*) as n
                from user_tasks ut left join tasks t on t.id = ut.task_id
               where ut.user_id = u.id and ut.completed_at is not null
                 and ut.completed_at > nobit_now() - interval '30 days'
                 and (v_op or not ut.is_free)
               group by 1) s),
    'free_count_30', (select count(*) from user_tasks
                       where user_id = u.id and is_free and completed_at > nobit_now() - interval '30 days'),
    'history', (
      select coalesce(jsonb_agg(h order by h ->> 'completed_at' desc), '[]'::jsonb)
        from (select jsonb_build_object(
                       'date', nobit_jst_date(ut.completed_at),
                       'time', to_char(ut.completed_at at time zone 'Asia/Tokyo', 'HH24:MI'),
                       'completed_at', ut.completed_at,
                       'is_free', ut.is_free,
                       'title', case when ut.is_free then case when v_op then ut.free_title end else t.title end,
                       'subject', case when ut.is_free then case when v_op then ut.free_subject end else t.subject end) as h
                from user_tasks ut left join tasks t on t.id = ut.task_id
               where ut.user_id = u.id and ut.completed_at is not null
               order by ut.completed_at desc limit 40) x),
    'comments', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', sc.id, 'body', sc.body, 'created_at', sc.created_at, 'read', sc.read_at is not null,
               'author', a.display_name) order by sc.created_at desc), '[]'::jsonb)
        from (select * from support_comments where user_id = u.id order by created_at desc limit 10) sc
        join users a on a.id = sc.author_id),
    'alerts', case when not v_op then null else (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', al.id, 'kind', al.kind, 'alert_date', al.alert_date, 'status', al.status,
               'message', al.message, 'contacted_at', al.contacted_at,
               'completions_after', case when al.contacted_at is null then null else
                 (select count(*) from user_tasks x
                   where x.user_id = u.id and x.completed_at > al.contacted_at
                     and x.completed_at <= al.contacted_at + interval '24 hours') end)
             order by al.alert_date desc, al.created_at desc), '[]'::jsonb)
        from (select * from alerts where user_id = u.id order by alert_date desc, created_at desc limit 20) al) end,
    'tickets', (
      select coalesce(jsonb_agg(jsonb_build_object('week', granted_for_week, 'used_on', used_on)
                                order by granted_for_week desc), '[]'::jsonb)
        from (select * from rest_tickets where user_id = u.id order by granted_for_week desc limit 8) r),
    'coins', case when v_op then u.coin_balance end);
end $$;

-- 定時処理：5分ごとに、止め忘れと閉じたアプリのタイマーを止める
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('nobit-study-sweep', '*/5 * * * *', $job$select nobit_sweep_study(null);$job$);
  end if;
end $$;

-- 画面から呼べる関数（既定では閉じている）
grant execute on function
  study_status(), start_study(uuid), study_heartbeat(uuid), end_study(uuid, text), ack_study(uuid),
  admin_study_today(uuid)
to authenticated;
