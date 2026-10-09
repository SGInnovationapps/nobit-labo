-- 定時の処理（日次判定・アラートの生成・休息チケット）と権限

-- アラートの既定（仕様書 6章）。送り方はすべて手動（manual）から始める。
insert into alert_rules (kind, enabled, params, template, delivery) values
  ('not_started',      true,  '{"after_hour": 18}',          '今日のクエスト、あと{残り数}つだよ！',                 'manual'),
  ('gap',              true,  '{"days": 3}',                 '今日も、ひとつ育てよう。短いタスクからで大丈夫。',     'manual'),
  ('streak_milestone', true,  '{"milestones": [7, 30, 100]}', '{連続日数}日連続記録達成！おめでとう！',               'manual'),
  ('badge',            false, '{}',                          '新しいバッジをゲットしたよ！',                         'manual'),
  ('club_mission',     false, '{}',                          '新しいクラブミッションが始まったよ！',                 'manual');

-- 日次判定（JST 0:05 に前日分）。連続記録が途切れた生徒は current を 0 にし、最長記録は残す。
create function nobit_daily_close(p_date date) returns integer
language plpgsql volatile security definer set search_path = public as $$
declare
  st     record;
  v_rest rest_kind;
  v_gap  integer;
  v_days integer := coalesce((select (params ->> 'days')::int from alert_rules
                               where kind = 'gap' and club_id is null), 3);
  n      integer := 0;
begin
  for st in
    select u.id, u.club_id from users u
      join club_members m on m.user_id = u.id and m.club_id = u.club_id and m.status = 'approved'
     where u.role = 'student' and nobit_jst_date(m.decided_at) <= p_date
  loop
    v_rest := nobit_rest_kind(st.id, p_date);
    insert into daily_activity (club_id, user_id, activity_date, rest_kind, judged_at)
    values (st.club_id, st.id, p_date, v_rest, now())
    on conflict (user_id, activity_date) do update set rest_kind = excluded.rest_kind, judged_at = now();

    if v_rest is null and not exists (select 1 from daily_activity
                                       where user_id = st.id and activity_date = p_date and completed_count > 0) then
      update streaks set current = 0, broken_on = p_date, updated_at = now()
       where user_id = st.id and current > 0 and last_achieved_date < p_date;
    end if;

    v_gap := nobit_gap_days(st.id, p_date);
    if v_gap = v_days then
      perform nobit_raise_alert(st.id, 'gap', p_date + 1, jsonb_build_object('gap_days', v_gap));
    end if;
    n := n + 1;
  end loop;

  -- その日のうちに意味がなくなったアラートを片づける
  update alerts set status = 'dismissed'
   where status = 'open' and ((kind = 'not_started' and alert_date <= p_date) or alert_date < p_date - 7);
  return n;
end $$;

-- 未着手のアラート（毎時）。after_hour 時以降、その日のタスクが1件も完了していない生徒に出す。
create function nobit_alert_not_started() returns integer
language plpgsql volatile security definer set search_path = public as $$
declare
  v_today date := nobit_today();
  v_hour  integer := extract(hour from nobit_now() at time zone 'Asia/Tokyo');
  v_after integer := coalesce((select (params ->> 'after_hour')::int from alert_rules
                                where kind = 'not_started' and club_id is null), 18);
  st      record;
  v_tasks jsonb;
  v_open  integer;
  n       integer := 0;
begin
  if v_hour < v_after then return 0; end if;
  perform nobit_materialize_club(null, v_today);
  for st in
    select u.id from users u
      join club_members m on m.user_id = u.id and m.club_id = u.club_id and m.status = 'approved'
     where u.role = 'student'
  loop
    continue when nobit_rest_kind(st.id, v_today) is not null;
    continue when exists (select 1 from daily_activity
                           where user_id = st.id and activity_date = v_today and completed_count > 0);
    v_tasks := nobit_day_tasks(st.id, v_today);
    select count(*) into v_open from jsonb_array_elements(v_tasks) e
     where e ->> 'completed_at' is null and not (e ->> 'is_free')::boolean;
    if v_open > 0 and nobit_raise_alert(st.id, 'not_started', v_today, jsonb_build_object('remaining', v_open)) is not null then
      n := n + 1;
    end if;
  end loop;
  return n;
end $$;

-- ［仮］休息チケットを毎週月曜 0:00 に1枚配る（所持は2枚まで）
create function nobit_grant_weekly_tickets(p_monday date) returns integer
language plpgsql volatile security definer set search_path = public as $$
declare
  v_max integer := (nobit_config() ->> 'ticket_max')::int;
  n     integer;
begin
  insert into rest_tickets (club_id, user_id, granted_for_week)
  select u.club_id, u.id, p_monday
    from users u
    join club_members m on m.user_id = u.id and m.club_id = u.club_id and m.status = 'approved'
   where u.role = 'student'
     and (select count(*) from rest_tickets r where r.user_id = u.id and r.used_on is null) < v_max
  on conflict (user_id, granted_for_week) do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

-- pg_cron（Supabase では使える。ローカルのテスト用 PostgreSQL では飛ばす）
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    execute 'create extension if not exists pg_cron';
    -- JST 0:05 = UTC 15:05
    perform cron.schedule('nobit-daily-close', '5 15 * * *',
      $job$select nobit_daily_close(nobit_today() - 1); select nobit_materialize_club(null, nobit_today());$job$);
    -- 毎時0分（after_hour 前は何もしない）
    perform cron.schedule('nobit-alert-not-started', '0 * * * *',
      $job$select nobit_alert_not_started();$job$);
    -- 月曜 JST 0:00 = 日曜 UTC 15:00
    perform cron.schedule('nobit-weekly-tickets', '0 15 * * 0',
      $job$select nobit_grant_weekly_tickets(nobit_today());$job$);
  end if;
end $$;

-- ---------------------------------------------------------------
-- 権限。画面から呼べる関数だけを authenticated に開ける。
-- ---------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;
grant select on all tables in schema public to authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;

grant execute on function
  nobit_me(), nobit_is_operator(), nobit_can_view_club(uuid), nobit_admin_club_ids(),
  club_by_invite(text), student_status(), register_student(text, text, text, text),
  touch_open(), my_home(), complete_task(uuid, uuid), add_free_task(subject_code, text, uuid),
  mark_comment_read(uuid), set_line_contact(boolean),
  admin_claim(), admin_overview(uuid), admin_alerts(uuid), admin_mark_contacted(uuid), admin_dismiss_alert(uuid),
  admin_student_detail(uuid), admin_post_comment(uuid, text),
  admin_tasks(), admin_create_task(uuid[], text, subject_code, recurrence, date, date, smallint[], date, integer, integer),
  admin_archive_task(uuid), admin_set_free_entry(uuid, boolean), admin_clubs_free_entry(),
  admin_create_club(text), admin_regenerate_invite(uuid), admin_club_settings(uuid),
  admin_decide_member(uuid, boolean), admin_add_club_admin(uuid, text, text), admin_remove_club_admin(uuid, uuid),
  admin_add_event(uuid, text, text, date, date), admin_delete_event(uuid)
to authenticated;

-- この先に追加する関数も、明示して開けるまでは呼べないようにする
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
