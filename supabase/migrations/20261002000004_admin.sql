-- 管理画面（運営・クラブ管理者）の RPC

-- 記録のない日が何日続いているか（p_upto から遡る。休息日は数えずに飛ばす。承認前の日は数えない）
create function nobit_gap_days(p_user uuid, p_upto date) returns integer
language plpgsql stable security definer set search_path = public as $$
declare
  d       date := p_upto;
  n       integer := 0;
  v_since date;
begin
  select nobit_jst_date(coalesce(m.decided_at, m.created_at)) into v_since
    from users u join club_members m on m.user_id = u.id and m.club_id = u.club_id
   where u.id = p_user;
  while v_since is not null and d >= v_since and n < 60 loop
    exit when exists (select 1 from daily_activity
                       where user_id = p_user and activity_date = d and completed_count > 0);
    if nobit_rest_kind(p_user, d) is null then n := n + 1; end if;
    d := d - 1;
  end loop;
  return n;
end $$;

-- 承認済みの生徒全員に p_date のタスクを用意する
create function nobit_materialize_club(p_club uuid, p_date date) returns void
language sql volatile security definer set search_path = public as $$
  select nobit_materialize_user(u.id, p_date)
    from users u join club_members m on m.user_id = u.id and m.club_id = u.club_id and m.status = 'approved'
   where u.role = 'student' and (p_club is null or u.club_id = p_club)
$$;

-- 管理画面に入ったときに呼ぶ。招待済みのメールなら、この認証ユーザーと結びつける。
create function admin_claim() returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_email text := lower(auth.jwt() ->> 'email');
  u users;
begin
  if auth.uid() is null then
    raise exception 'login_required' using errcode = '42501';
  end if;
  select * into u from users where auth_user_id = auth.uid();
  if u.id is null and v_email is not null then
    update users set auth_user_id = auth.uid()
     where lower(email) = v_email and role in ('operator', 'club_admin') and auth_user_id is null
    returning * into u;
  end if;
  if u.id is null or u.role = 'student' then
    return jsonb_build_object('role', null);
  end if;
  return jsonb_build_object(
    'role', u.role, 'display_name', u.display_name, 'email', u.email,
    'clubs', (select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name) order by c.name), '[]'::jsonb)
                from clubs c where c.id in (select nobit_admin_club_ids())));
end $$;

-- 09 生徒一覧。既定の並びは対応が必要な順。
create function admin_overview(p_club uuid) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_today date := nobit_today();
  v_op    boolean := nobit_is_operator();
  v_rows  jsonb;
  c       clubs;
begin
  perform nobit_require_club(p_club);
  perform nobit_materialize_club(p_club, v_today);
  select * into c from clubs where id = p_club;

  with base as (
    select u.id, u.display_name, u.grade, u.line_friend_status, u.line_contact_opt_in,
           coalesce(nobit_current_streak(u.id), 0) as cur,
           coalesce(s.best, 0) as best,
           (select max(activity_date) from daily_activity a
             where a.user_id = u.id and a.completed_count > 0) as last_study,
           nobit_rest_kind(u.id, v_today) as rest_today,
           nobit_day_tasks(u.id, v_today, not v_op) as tasks,
           nobit_gap_days(u.id, v_today - 1) as gap_days,
           exists (select 1 from alerts al
                    where al.user_id = u.id and al.status = 'contacted'
                      and al.contacted_at > nobit_now() - interval '2 days'
                      and not exists (select 1 from user_tasks x
                                       where x.user_id = u.id and x.completed_at > al.contacted_at)) as contacted_no_progress,
           case when v_op then (select count(*) from alerts al where al.user_id = u.id and al.status = 'open') else 0 end as open_alerts
      from users u
      join club_members m on m.user_id = u.id and m.club_id = p_club and m.status = 'approved'
      left join streaks s on s.user_id = u.id
     where u.role = 'student' and u.club_id = p_club
  ), counted as (
    select b.*,
           jsonb_array_length(b.tasks) as total,
           (select count(*) from jsonb_array_elements(b.tasks) e where e ->> 'completed_at' is not null) as done
      from base b
  ), stated as (
    select c2.*,
           case
             when c2.done = 0 and c2.rest_today is not null then 'rest'
             when c2.done = 0 then 'not_started'
             when c2.done >= c2.total then 'all_done'
             else 'partial'
           end as state
      from counted c2
  ), scored as (
    select st.*,
           case
             when st.gap_days >= 3 then 300 + st.gap_days
             when st.contacted_no_progress then 200
             when st.state = 'not_started' and st.total > 0 then 100
             when st.state = 'partial' then 50
             else 0
           end + case when st.open_alerts > 0 then 20 else 0 end as need
      from stated st
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', id, 'display_name', display_name, 'grade', grade,
           'state', state, 'done', done, 'total', total, 'tasks', tasks,
           'streak', cur, 'best', best, 'last_study', last_study, 'gap_days', gap_days,
           'need', need, 'open_alerts', open_alerts,
           'friend_status', line_friend_status, 'line_contact_opt_in', line_contact_opt_in,
           'strip', nobit_strip(id, v_today - 13, v_today))
         order by need desc, display_name), '[]'::jsonb)
    into v_rows
    from scored;

  return jsonb_build_object(
    'club',  jsonb_build_object('id', c.id, 'name', c.name),
    'today', v_today,
    'summary', jsonb_build_object(
      'all_done',    (select count(*) from jsonb_array_elements(v_rows) e where e ->> 'state' = 'all_done'),
      'partial',     (select count(*) from jsonb_array_elements(v_rows) e where e ->> 'state' = 'partial'),
      'not_started', (select count(*) from jsonb_array_elements(v_rows) e where e ->> 'state' = 'not_started'),
      'rest',        (select count(*) from jsonb_array_elements(v_rows) e where e ->> 'state' = 'rest'),
      'students',    jsonb_array_length(v_rows)),
    'club_strip', (
      select jsonb_agg(jsonb_build_object('d', d::date, 'n', coalesce(sum_n, 0)) order by d)
        from generate_series(v_today - 13, v_today, interval '1 day') d
        left join lateral (
          select sum(a.completed_count) as sum_n from daily_activity a
            join club_members m on m.user_id = a.user_id and m.club_id = p_club and m.status = 'approved'
           where a.club_id = p_club and a.activity_date = d::date) x on true),
    'students', v_rows);
end $$;

-- 対応アラートの一覧（運営のみ）。未対応と、直近3日に連絡済みにしたもの。
create function admin_alerts(p_club uuid default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform nobit_require_operator();
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', al.id, 'kind', al.kind, 'alert_date', al.alert_date, 'status', al.status,
             'message', al.message, 'detail', al.detail,
             'student_id', u.id, 'student_name', u.display_name, 'grade', u.grade,
             'club_id', c.id, 'club_name', c.name,
             'friend_status', u.line_friend_status,
             'contacted_at', al.contacted_at,
             'contacted_by', (select display_name from users where id = al.contacted_by),
             'completions_after', case when al.contacted_at is null then null else
               (select count(*) from user_tasks x
                 where x.user_id = u.id and x.completed_at > al.contacted_at
                   and x.completed_at <= al.contacted_at + interval '24 hours') end)
           order by (al.status = 'open') desc, al.alert_date desc, al.created_at desc), '[]'::jsonb)
      from alerts al
      join users u on u.id = al.user_id
      join clubs c on c.id = al.club_id
     where (p_club is null or al.club_id = p_club)
       and (al.status = 'open' or (al.status = 'contacted' and al.contacted_at > nobit_now() - interval '3 days')));
end $$;

-- 公式LINE のチャットから送ったあとに「連絡済み」を記録する
create function admin_mark_contacted(p_alert_id uuid) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_me uuid := nobit_require_operator();
  al   alerts;
begin
  update alerts set status = 'contacted', contacted_by = v_me, contacted_at = nobit_now()
   where id = p_alert_id and status = 'open'
  returning * into al;
  if al.id is null then
    raise exception 'alert_not_open' using errcode = 'P0002';
  end if;
  return jsonb_build_object('id', al.id, 'status', al.status, 'contacted_at', al.contacted_at);
end $$;

create function admin_dismiss_alert(p_alert_id uuid) returns void
language plpgsql volatile security definer set search_path = public as $$
begin
  perform nobit_require_operator();
  update alerts set status = 'dismissed' where id = p_alert_id and status = 'open';
end $$;

-- 10 生徒の詳細。クラブ管理者には自由登録の内容（題名・教科）を伏せる。
create function admin_student_detail(p_student_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
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
    'focus_minutes_month', (select coalesce(sum(focused_seconds), 0) / 60 from focus_sessions
                             where user_id = u.id and nobit_jst_date(started_at) >= v_month),
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
    'coins', u.coin_balance);
end $$;

-- 10 応援コメント（クラブ管理者がアプリ内に表示する）
create function admin_post_comment(p_student_id uuid, p_body text) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  u    users;
  me   users;
  v_id uuid;
begin
  select * into me from users where auth_user_id = auth.uid();
  if me.role is distinct from 'club_admin' then
    raise exception 'club_admin_only' using errcode = '42501';
  end if;
  select * into u from users where id = p_student_id and role = 'student';
  perform nobit_require_club(u.club_id);
  if p_body is null or length(trim(p_body)) not between 1 and 200 then
    raise exception 'body_invalid' using errcode = '22023';
  end if;
  insert into support_comments (club_id, user_id, author_id, body)
  values (u.club_id, u.id, me.id, trim(p_body))
  returning id into v_id;
  return jsonb_build_object('id', v_id);
end $$;

-- 11 タスク管理（運営のみ）。複数クラブへの配信は group_id でまとめて返す。
create function admin_tasks() returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare v_today date := nobit_today();
begin
  perform nobit_require_operator();
  perform nobit_materialize_club(null, v_today);
  return (
    select coalesce(jsonb_agg(g order by g ->> 'status', g ->> 'starts_on' desc, g ->> 'title'), '[]'::jsonb)
    from (
      select jsonb_build_object(
        'group_id',     t.group_id,
        'title',        min(t.title),
        'subject',      min(t.subject::text),
        'recurrence',   min(t.recurrence::text),
        'due_date',     min(t.due_date),
        'weekdays',     jsonb_agg(to_jsonb(t.weekdays)) -> 0,
        'starts_on',    min(t.starts_on),
        'ends_on',      min(t.ends_on),
        'est_minutes',  min(t.est_minutes),
        'reward_coins', min(t.reward_coins),
        'clubs',        jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name) order by c.name),
        'status', case
          when bool_or(t.archived_at is not null) then 'ended'
          when min(t.ends_on) < v_today then 'ended'
          when min(t.recurrence::text) = 'once' and min(t.due_date) < v_today then 'ended'
          when min(t.starts_on) > v_today then 'scheduled'
          else 'active' end,
        'assigned', (select count(*) from user_tasks ut join tasks t2 on t2.id = ut.task_id
                      where t2.group_id = t.group_id
                        and (t2.recurrence = 'once' or ut.task_date = v_today)),
        'done', (select count(*) from user_tasks ut join tasks t2 on t2.id = ut.task_id
                  where t2.group_id = t.group_id and ut.completed_at is not null
                    and (t2.recurrence = 'once' or ut.task_date = v_today))) as g
      from tasks t join clubs c on c.id = t.club_id
     group by t.group_id) x);
end $$;

create function admin_create_task(
  p_club_ids uuid[], p_title text, p_subject subject_code, p_recurrence recurrence,
  p_starts_on date, p_due_date date default null, p_weekdays smallint[] default null,
  p_ends_on date default null, p_est_minutes integer default 15, p_reward_coins integer default null)
returns uuid
language plpgsql volatile security definer set search_path = public as $$
declare
  v_me    uuid := nobit_require_operator();
  v_group uuid := gen_random_uuid();
  v_club  uuid;
begin
  if p_club_ids is null or cardinality(p_club_ids) = 0 then
    raise exception 'clubs_required' using errcode = '22023';
  end if;
  foreach v_club in array p_club_ids loop
    insert into tasks (club_id, group_id, title, subject, recurrence, due_date, weekdays,
                       starts_on, ends_on, est_minutes, reward_coins, created_by)
    values (v_club, v_group, trim(p_title), p_subject, p_recurrence,
            case when p_recurrence = 'once' then p_due_date end,
            case when p_recurrence = 'weekly' then p_weekdays end,
            p_starts_on, p_ends_on, p_est_minutes,
            coalesce(p_reward_coins, (nobit_config() ->> 'default_task_reward')::int), v_me);
    perform nobit_materialize_club(v_club, nobit_today());
  end loop;
  return v_group;
end $$;

-- 配信を終える（記録は残す。未完了の分だけ生徒の画面から消える）
create function admin_archive_task(p_group_id uuid) returns void
language plpgsql volatile security definer set search_path = public as $$
begin
  perform nobit_require_operator();
  update tasks set archived_at = now() where group_id = p_group_id and archived_at is null;
end $$;

create function admin_set_free_entry(p_club_id uuid, p_enabled boolean) returns void
language plpgsql volatile security definer set search_path = public as $$
begin
  perform nobit_require_operator();
  update clubs set free_entry_enabled = p_enabled where id = p_club_id;
end $$;

create function admin_clubs_free_entry() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform nobit_require_operator();
  return (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'free_entry_enabled', free_entry_enabled)
                                    order by name), '[]'::jsonb) from clubs);
end $$;

-- 14 クラブ設定
create function admin_create_club(p_name text) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare c clubs;
begin
  perform nobit_require_operator();
  insert into clubs (name, invite_code) values (trim(p_name), nobit_new_invite_code()) returning * into c;
  return jsonb_build_object('id', c.id, 'name', c.name, 'invite_code', c.invite_code);
end $$;

create function admin_regenerate_invite(p_club_id uuid) returns text
language plpgsql volatile security definer set search_path = public as $$
declare v_code text;
begin
  perform nobit_require_operator();
  update clubs set invite_code = nobit_new_invite_code() where id = p_club_id returning invite_code into v_code;
  return v_code;
end $$;

create function admin_club_settings(p_club_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_op boolean := nobit_is_operator();
  c    clubs;
begin
  perform nobit_require_club(p_club_id);
  select * into c from clubs where id = p_club_id;
  return jsonb_build_object(
    'club', jsonb_build_object(
      'id', c.id, 'name', c.name, 'free_entry_enabled', c.free_entry_enabled,
      'invite_code', case when v_op then c.invite_code end),   -- 招待QRの発行は運営だけ
    'viewer_role', case when v_op then 'operator' else 'club_admin' end,
    'pending', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'member_id', m.id, 'display_name', u.display_name, 'grade', u.grade,
               'applied_at', m.created_at,
               'consented_at', (select max(agreed_at) from parental_consents p where p.user_id = u.id))
             order by m.created_at), '[]'::jsonb)
        from club_members m join users u on u.id = m.user_id
       where m.club_id = c.id and m.member_role = 'student' and m.status = 'pending'),
    'students', (select count(*) from club_members
                  where club_id = c.id and member_role = 'student' and status = 'approved'),
    'admins', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'user_id', u.id, 'display_name', u.display_name, 'email', u.email,
               'signed_in', u.auth_user_id is not null) order by u.display_name), '[]'::jsonb)
        from club_members m join users u on u.id = m.user_id
       where m.club_id = c.id and m.member_role = 'club_admin' and m.status = 'approved'),
    'events', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', e.id, 'kind', e.kind, 'title', e.title, 'starts_on', e.starts_on, 'ends_on', e.ends_on)
             order by e.starts_on), '[]'::jsonb)
        from club_events e where e.club_id = c.id and e.ends_on >= nobit_today() - 30));
end $$;

-- 所属の承認（運営・クラブ管理者）
create function admin_decide_member(p_member_id uuid, p_approve boolean) returns void
language plpgsql volatile security definer set search_path = public as $$
declare m club_members;
begin
  select * into m from club_members where id = p_member_id and member_role = 'student';
  if m.id is null then
    raise exception 'member_not_found' using errcode = 'P0002';
  end if;
  perform nobit_require_club(m.club_id);
  if m.status <> 'pending' then
    raise exception 'member_not_pending' using errcode = '22023';
  end if;
  update club_members
     set status = case when p_approve then 'approved'::member_status else 'rejected'::member_status end,
         decided_by = nobit_me(), decided_at = nobit_now()
   where id = m.id;
  if p_approve then
    perform nobit_materialize_user(m.user_id, nobit_today());
  end if;
end $$;

-- クラブ管理者の追加・解除（運営のみ）。追加した人は、そのメールでログインすると管理画面に入れる。
create function admin_add_club_admin(p_club_id uuid, p_email text, p_display_name text) returns uuid
language plpgsql volatile security definer set search_path = public as $$
declare
  v_email text := lower(trim(p_email));
  u users;
begin
  perform nobit_require_operator();
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'email_invalid' using errcode = '22023';
  end if;
  select * into u from users where lower(email) = v_email;
  if u.id is null then
    insert into users (role, email, display_name) values ('club_admin', v_email, trim(p_display_name))
    returning * into u;
  elsif u.role <> 'club_admin' then
    raise exception 'email_in_use' using errcode = '23505';
  end if;
  insert into club_members (club_id, user_id, member_role, status, decided_by, decided_at)
  values (p_club_id, u.id, 'club_admin', 'approved', nobit_me(), now())
  on conflict (club_id, user_id) do update set status = 'approved', decided_by = nobit_me(), decided_at = now();
  return u.id;
end $$;

create function admin_remove_club_admin(p_club_id uuid, p_user_id uuid) returns void
language plpgsql volatile security definer set search_path = public as $$
begin
  perform nobit_require_operator();
  update club_members set status = 'left', decided_by = nobit_me(), decided_at = now()
   where club_id = p_club_id and user_id = p_user_id and member_role = 'club_admin';
end $$;

-- ［仮］大会・遠征・合宿日（クラブ管理者が登録。生徒全員の休息日になり、チケットは使わない）
create function admin_add_event(p_club_id uuid, p_kind text, p_title text, p_starts_on date, p_ends_on date)
returns uuid
language plpgsql volatile security definer set search_path = public as $$
declare v_id uuid;
begin
  perform nobit_require_club(p_club_id);
  insert into club_events (club_id, kind, title, starts_on, ends_on, created_by)
  values (p_club_id, p_kind, coalesce(trim(p_title), ''), p_starts_on, coalesce(p_ends_on, p_starts_on), nobit_me())
  returning id into v_id;
  return v_id;
end $$;

create function admin_delete_event(p_event_id uuid) returns void
language plpgsql volatile security definer set search_path = public as $$
declare v_club uuid;
begin
  select club_id into v_club from club_events where id = p_event_id;
  perform nobit_require_club(v_club);
  delete from club_events where id = p_event_id;
end $$;
