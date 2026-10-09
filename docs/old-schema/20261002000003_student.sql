-- 共通の処理と生徒アプリの RPC

create function nobit_new_invite_code() returns text
language plpgsql volatile set search_path = public as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';  -- 読み違えやすい I O 0 1 を除く
  code text;
begin
  loop
    select string_agg(substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1), '')
      into code from generate_series(1, 8);
    exit when not exists (select 1 from clubs where invite_code = code);
  end loop;
  return code;
end $$;

-- 休息日の種類（チケットを使った日／クラブの大会・遠征・合宿日）。休息日でなければ null。
create function nobit_rest_kind(p_user uuid, p_date date) returns rest_kind
language sql stable security definer set search_path = public as $$
  select case
    when exists (select 1 from rest_tickets r where r.user_id = p_user and r.used_on = p_date)
      then 'ticket'::rest_kind
    when exists (select 1 from club_events e join users u on u.club_id = e.club_id
                  where u.id = p_user and p_date between e.starts_on and e.ends_on)
      then 'club_event'::rest_kind
  end
$$;

-- p_from〜p_to がすべて休息日なら true（範囲が空でも true）
create function nobit_gap_is_rest(p_user uuid, p_from date, p_to date) returns boolean
language sql stable security definer set search_path = public as $$
  select not exists (
    select 1 from generate_series(p_from, p_to, interval '1 day') d
     where nobit_rest_kind(p_user, d::date) is null)
$$;

-- 表示用の連続記録。締めの処理を待たずに、途切れていれば 0 を返す。
create function nobit_current_streak(p_user uuid) returns integer
language sql stable security definer set search_path = public as $$
  select case
    when s.last_achieved_date is null then 0
    when s.last_achieved_date >= nobit_today() - 1 then s.current
    when nobit_gap_is_rest(p_user, s.last_achieved_date + 1, nobit_today() - 1) then s.current
    else 0 end
  from streaks s where s.user_id = p_user
$$;

-- そのタスクが p_date に出るか
create function nobit_task_on(t tasks, p_date date) returns boolean
language sql stable as $$
  select t.archived_at is null
     and t.starts_on <= p_date
     and (t.ends_on is null or t.ends_on >= p_date)
     and case t.recurrence
           when 'daily'  then true
           when 'weekly' then extract(isodow from p_date)::smallint = any (t.weekdays)
           when 'once'   then p_date <= t.due_date
         end
$$;

-- 生徒の p_date のタスクを用意する（once は開始日の1件だけ）
create function nobit_materialize_user(p_user uuid, p_date date) returns void
language sql volatile security definer set search_path = public as $$
  insert into user_tasks (club_id, user_id, task_id, task_date)
  select t.club_id, u.id, t.id, case when t.recurrence = 'once' then t.starts_on else p_date end
    from users u
    join club_members m on m.user_id = u.id and m.club_id = u.club_id and m.status = 'approved'
    join tasks t on t.club_id = u.club_id
   where u.id = p_user and u.role = 'student' and nobit_task_on(t, p_date)
  on conflict (user_id, task_id, task_date) where task_id is not null do nothing
$$;

-- その日のタスク。未完了が上、完了は時刻順。p_hide_free で自由登録の内容を伏せる（クラブ管理者用）。
create function nobit_day_tasks(p_user uuid, p_date date, p_hide_free boolean default false) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x order by (x ->> 'completed_at') is not null, x ->> 'completed_at', x ->> 'title'), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'id',             ut.id,
      'title',          case when ut.is_free then case when p_hide_free then null else ut.free_title end else t.title end,
      'subject',        case when ut.is_free then case when p_hide_free then null else ut.free_subject end else t.subject end,
      'is_free',        ut.is_free,
      'est_minutes',    t.est_minutes,
      'reward_coins',   t.reward_coins,
      'recurrence',     t.recurrence,
      'due_date',       t.due_date,
      'completed_at',   ut.completed_at,
      'completed_time', to_char(ut.completed_at at time zone 'Asia/Tokyo', 'HH24:MI')) as x
    from user_tasks ut
    left join tasks t on t.id = ut.task_id
   where ut.user_id = p_user
     and (
          (ut.task_date = p_date and t.recurrence is distinct from 'once'
             and (ut.completed_at is not null or t.archived_at is null))
       or (t.recurrence = 'once' and ut.completed_at is null and t.archived_at is null
             and p_date between t.starts_on and t.due_date)
       or (t.recurrence = 'once' and ut.completed_at is not null
             and nobit_jst_date(ut.completed_at) = p_date)
     )
  ) s
$$;

-- 記録の帯。n は完了タスク数、rest は休息日の種類。
create function nobit_strip(p_user uuid, p_from date, p_to date) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'd',    d::date,
           'n',    coalesce(a.completed_count, 0),
           'rest', coalesce(a.rest_kind, nobit_rest_kind(p_user, d::date))) order by d), '[]'::jsonb)
    from generate_series(p_from, p_to, interval '1 day') d
    left join daily_activity a on a.user_id = p_user and a.activity_date = d::date
$$;

create function nobit_render(p_template text, p_name text, p_remaining integer, p_streak integer) returns text
language sql immutable as $$
  select replace(replace(replace(p_template,
           '{名前}', coalesce(p_name, '')),
           '{残り数}', coalesce(p_remaining::text, '')),
           '{連続日数}', coalesce(p_streak::text, ''))
$$;

-- アラートを1件出す。同じ生徒・種類・日には1件だけ。LINE 連絡を止めている生徒には出さない。
create function nobit_raise_alert(p_user uuid, p_kind alert_kind, p_date date, p_detail jsonb) returns uuid
language plpgsql volatile security definer set search_path = public as $$
declare
  u users;
  r alert_rules;
  v_id uuid;
begin
  select * into u from users where id = p_user;
  if u.id is null or not u.line_contact_opt_in then return null; end if;
  select * into r from alert_rules
   where kind = p_kind and (club_id = u.club_id or club_id is null)
   order by club_id nulls last limit 1;
  if r.id is null or not r.enabled then return null; end if;
  insert into alerts (club_id, user_id, kind, alert_date, detail, message, delivery)
  values (u.club_id, u.id, p_kind, p_date, p_detail,
          nobit_render(r.template, u.display_name, (p_detail ->> 'remaining')::int,
                       coalesce((p_detail ->> 'streak')::int, nobit_current_streak(u.id), 0)),
          r.delivery)
  on conflict (user_id, kind, alert_date) do nothing
  returning id into v_id;
  return v_id;
end $$;

-- 完了の後処理（コイン・日別記録・連続記録・節目のアラート）を1つのトランザクションで行う。
-- 呼ぶ側で users の行をロックし、user_tasks.completed_at を入れてから呼ぶ。
create function nobit_apply_completion(p_user uuid, p_user_task uuid) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  u        users;
  ut       user_tasks;
  t        tasks;
  s        streaks;
  r        alert_rules;
  v_today  date := nobit_today();
  v_coins  integer := 0;
  v_count  integer;
  v_new    integer;
  v_resume boolean := false;
begin
  select * into u  from users where id = p_user;
  select * into ut from user_tasks where id = p_user_task;
  select * into t  from tasks where id = ut.task_id;

  -- コイン（台帳の一意制約で二重付与を防ぐ）
  if ut.is_free then
    if (select count(*) from user_tasks
         where user_id = p_user and is_free and task_date = v_today)
       <= (nobit_config() ->> 'free_entry_daily_limit')::int then
      v_coins := (nobit_config() ->> 'free_entry_reward')::int;
    end if;
  else
    v_coins := t.reward_coins;
  end if;
  if v_coins > 0 then
    insert into coin_transactions (club_id, user_id, amount, reason, source_type, source_id)
    values (u.club_id, u.id, v_coins, case when ut.is_free then 'free_task' else 'task' end, 'user_task', ut.id)
    on conflict (source_type, source_id) do nothing;
    if found then
      update users set coin_balance = coin_balance + v_coins where id = u.id;
    else
      v_coins := 0;
    end if;
  end if;

  -- 日別の記録（学習。起動とは別に数える）
  insert into daily_activity (club_id, user_id, activity_date, completed_count)
  values (u.club_id, u.id, v_today, 1)
  on conflict (user_id, activity_date)
  do update set completed_count = daily_activity.completed_count + 1
  returning completed_count into v_count;

  -- 連続記録（その日の最初の完了で進める）
  insert into streaks (user_id, club_id) values (u.id, u.club_id) on conflict (user_id) do nothing;
  select * into s from streaks where user_id = u.id for update;
  if v_count = 1 and (s.last_achieved_date is null or s.last_achieved_date < v_today) then
    if s.last_achieved_date is not null and s.current > 0
       and nobit_gap_is_rest(u.id, s.last_achieved_date + 1, v_today - 1) then
      v_new := s.current + 1;
    else
      v_new := 1;
      v_resume := s.last_achieved_date is not null;
    end if;
    update streaks
       set current = v_new, best = greatest(best, v_new), last_achieved_date = v_today,
           broken_on = null, updated_at = now()
     where user_id = u.id;

    select * into r from alert_rules
     where kind = 'streak_milestone' and (club_id = u.club_id or club_id is null)
     order by club_id nulls last limit 1;
    if r.id is not null and coalesce(r.params -> 'milestones', '[]'::jsonb) @> to_jsonb(v_new) then
      perform nobit_raise_alert(u.id, 'streak_milestone', v_today, jsonb_build_object('streak', v_new));
    end if;
  else
    v_new := s.current;
  end if;

  return jsonb_build_object(
    'already',        false,
    'user_task_id',   ut.id,
    'title',          coalesce(t.title, ut.free_title),
    'subject',        coalesce(t.subject, ut.free_subject),
    'is_free',        ut.is_free,
    'completed_time', to_char(ut.completed_at at time zone 'Asia/Tokyo', 'HH24:MI'),
    'coins',          v_coins,
    'coin_balance',   (select coin_balance from users where id = u.id),
    'today_count',    v_count,
    'streak',         v_new,
    'best',           (select best from streaks where user_id = u.id),
    'resumed',        v_resume,
    'strip',          nobit_strip(u.id, v_today - 29, v_today));
end $$;

-- ---------------------------------------------------------------
-- 生徒アプリの RPC
-- ---------------------------------------------------------------

-- 招待コードからクラブ名を出す（登録画面で使う）
create function club_by_invite(p_code text) returns jsonb
language sql stable security definer set search_path = public as $$
  select case when auth.uid() is null then null else
    (select jsonb_build_object('name', c.name) from clubs c where c.invite_code = upper(trim(p_code)))
  end
$$;

create function student_status() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  u users;
  m club_members;
  c clubs;
begin
  select * into u from users where auth_user_id = auth.uid();
  if u.id is null then
    return jsonb_build_object('state', 'unregistered', 'consent_version', nobit_config() ->> 'consent_version');
  end if;
  if u.role <> 'student' then
    return jsonb_build_object('state', 'not_student');
  end if;
  select * into m from club_members where user_id = u.id and club_id = u.club_id;
  select * into c from clubs where id = u.club_id;
  return jsonb_build_object(
    'state',           m.status,
    'club_name',       c.name,
    'display_name',    u.display_name,
    'grade',           u.grade,
    'friend_status',   u.line_friend_status,
    'consent_version', nobit_config() ->> 'consent_version');
end $$;

-- 登録（保護者同意・学年・表示名）。LINE 識別子はログイン時にサーバーが入れた app_metadata から取る。
create function register_student(p_invite_code text, p_display_name text, p_grade text, p_consent_version text)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_auth   uuid := auth.uid();
  v_line   text := auth.jwt() -> 'app_metadata' ->> 'line_user_id';
  v_friend text := coalesce(auth.jwt() -> 'app_metadata' ->> 'line_friend', 'unknown');
  v_name   text := trim(p_display_name);
  c        clubs;
  u        users;
  v_status member_status;
begin
  if v_auth is null or v_line is null then
    raise exception 'line_login_required' using errcode = '42501';
  end if;
  if p_consent_version is distinct from nobit_config() ->> 'consent_version' then
    raise exception 'consent_required' using errcode = '22023';
  end if;
  if v_name is null or length(v_name) not between 1 and 20 then
    raise exception 'display_name_invalid' using errcode = '22023';
  end if;
  if p_grade not in ('中1', '中2', '中3', '高1', '高2', '高3') then
    raise exception 'grade_invalid' using errcode = '22023';
  end if;
  select * into c from clubs where invite_code = upper(trim(p_invite_code));
  if c.id is null then
    raise exception 'invite_not_found' using errcode = 'P0002';
  end if;

  select * into u from users where auth_user_id = v_auth or line_user_id = v_line limit 1;
  if u.id is not null then
    select status into v_status from club_members where user_id = u.id and club_id = u.club_id;
    if u.role <> 'student' or v_status in ('pending', 'approved') then
      raise exception 'already_registered' using errcode = '23505';
    end if;
    -- 承認されなかった・退会した生徒は、別の招待から申し込み直せる
    update users set auth_user_id = v_auth, club_id = c.id, display_name = v_name, grade = p_grade
     where id = u.id;
    update streaks set club_id = c.id where user_id = u.id;
  else
    insert into users (auth_user_id, role, club_id, line_user_id, display_name, grade, line_friend_status)
    values (v_auth, 'student', c.id, v_line, v_name, p_grade,
            case when v_friend in ('friend', 'not_friend', 'blocked') then v_friend::friend_status else 'unknown' end)
    returning * into u;
    insert into streaks (user_id, club_id) values (u.id, c.id);
  end if;

  insert into club_members (club_id, user_id, member_role, status)
  values (c.id, u.id, 'student', 'pending')
  on conflict (club_id, user_id) do update set status = 'pending', decided_by = null, decided_at = null;

  insert into parental_consents (club_id, user_id, consent_version)
  values (c.id, u.id, p_consent_version)
  on conflict (user_id, consent_version) do update set agreed_at = now(), club_id = excluded.club_id;

  return student_status();
end $$;

-- アプリの起動記録（学習とは別に数える。開いただけでは学習にしない）
create function touch_open() returns void
language plpgsql volatile security definer set search_path = public as $$
declare me users := nobit_require_student();
begin
  insert into daily_activity (club_id, user_id, activity_date, open_count, first_opened_at)
  values (me.club_id, me.id, nobit_today(), 1, nobit_now())
  on conflict (user_id, activity_date)
  do update set open_count = daily_activity.open_count + 1,
                first_opened_at = coalesce(daily_activity.first_opened_at, excluded.first_opened_at);
end $$;

-- 01 ホーム
create function my_home() returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  me       users := nobit_require_student();
  v_today  date := nobit_today();
  s        streaks;
  c        clubs;
  cm       support_comments;
  v_limit  integer := (nobit_config() ->> 'free_entry_daily_limit')::int;
  v_used   integer;
begin
  perform nobit_materialize_user(me.id, v_today);
  select * into s from streaks where user_id = me.id;
  select * into c from clubs where id = me.club_id;
  select * into cm from support_comments
   where user_id = me.id and created_at > nobit_now() - interval '7 days'
   order by created_at desc limit 1;
  select count(*) into v_used from user_tasks where user_id = me.id and is_free and task_date = v_today;

  return jsonb_build_object(
    'today', v_today,
    'me', jsonb_build_object(
      'display_name',        me.display_name,
      'grade',               me.grade,
      'club_name',           c.name,
      'coins',               me.coin_balance,
      'line_contact_opt_in', me.line_contact_opt_in,
      'friend_status',       me.line_friend_status),
    'streak', jsonb_build_object(
      'current',            coalesce(nobit_current_streak(me.id), 0),
      'best',               coalesce(s.best, 0),
      'last_achieved_date', s.last_achieved_date,
      'broken_on',          s.broken_on),
    'strip',      nobit_strip(me.id, v_today - 29, v_today),
    'tasks',      nobit_day_tasks(me.id, v_today),
    'today_rest', nobit_rest_kind(me.id, v_today),
    'free_entry', jsonb_build_object('enabled', c.free_entry_enabled, 'remaining', greatest(v_limit - v_used, 0)),
    'comment', case when cm.id is null then null else jsonb_build_object(
      'id', cm.id, 'body', cm.body, 'created_at', cm.created_at, 'read', cm.read_at is not null,
      'author', (select display_name from users where id = cm.author_id)) end);
end $$;

-- 02 タスク完了（同じタスクを何度押しても報酬は1回）
create function complete_task(p_user_task_id uuid, p_request_id uuid) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  me      users := nobit_require_student();
  v_today date := nobit_today();
  ut      user_tasks;
  t       tasks;
begin
  perform 1 from users where id = me.id for update;   -- 同じ生徒の完了処理を1本ずつにする
  select * into ut from user_tasks where id = p_user_task_id and user_id = me.id for update;
  if ut.id is null then
    raise exception 'task_not_found' using errcode = 'P0002';
  end if;
  if ut.completed_at is not null then
    return jsonb_build_object(
      'already', true, 'user_task_id', ut.id, 'coins', 0,
      'completed_time', to_char(ut.completed_at at time zone 'Asia/Tokyo', 'HH24:MI'),
      'today_count', (select completed_count from daily_activity where user_id = me.id and activity_date = v_today),
      'streak', nobit_current_streak(me.id),
      'strip', nobit_strip(me.id, v_today - 29, v_today));
  end if;
  select * into t from tasks where id = ut.task_id;
  if t.archived_at is not null then
    raise exception 'task_archived' using errcode = '22023';
  end if;
  if not (ut.task_date = v_today or (t.recurrence = 'once' and v_today between t.starts_on and t.due_date)) then
    raise exception 'task_not_today' using errcode = '22023';
  end if;
  update user_tasks set completed_at = nobit_now(), completion_request_id = p_request_id where id = ut.id;
  return nobit_apply_completion(me.id, ut.id);
end $$;

-- やった勉強を記録する（自由登録）。記録した時点で完了として扱う。
create function add_free_task(p_subject subject_code, p_title text, p_request_id uuid) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  me      users := nobit_require_student();
  v_today date := nobit_today();
  v_title text := trim(p_title);
  v_id    uuid;
begin
  perform 1 from users where id = me.id for update;
  select id into v_id from user_tasks where completion_request_id = p_request_id and user_id = me.id;
  if v_id is not null then
    return jsonb_build_object('already', true, 'user_task_id', v_id, 'coins', 0);
  end if;
  if not (select free_entry_enabled from clubs where id = me.club_id) then
    raise exception 'free_entry_disabled' using errcode = '42501';
  end if;
  if v_title is null or length(v_title) not between 1 and 40 then
    raise exception 'title_invalid' using errcode = '22023';
  end if;
  if (select count(*) from user_tasks where user_id = me.id and is_free and task_date = v_today)
     >= (nobit_config() ->> 'free_entry_daily_limit')::int then
    raise exception 'free_entry_limit' using errcode = '22023';
  end if;
  insert into user_tasks (club_id, user_id, task_date, is_free, free_title, free_subject, completed_at, completion_request_id)
  values (me.club_id, me.id, v_today, true, v_title, p_subject, nobit_now(), p_request_id)
  returning id into v_id;
  return nobit_apply_completion(me.id, v_id);
end $$;

create function mark_comment_read(p_comment_id uuid) returns void
language sql volatile security definer set search_path = public as $$
  update support_comments set read_at = coalesce(read_at, now())
   where id = p_comment_id and user_id = (nobit_require_student()).id
$$;

-- 生徒が LINE への連絡を止める・受け取る
create function set_line_contact(p_opt_in boolean) returns boolean
language sql volatile security definer set search_path = public as $$
  update users set line_contact_opt_in = p_opt_in
   where id = (nobit_require_student()).id
  returning line_contact_opt_in
$$;
