-- Phase 1 の受入テスト（DB で確かめられる項目）
-- scripts/test-db.sh から実行する。失敗すると psql がエラーで止まる。

create schema test;
create function test.as_user(p_auth uuid, p_email text default null, p_line text default null) returns void
language sql as $$
  select set_config('request.jwt.claims', jsonb_strip_nulls(jsonb_build_object(
    'sub', p_auth, 'role', 'authenticated', 'email', p_email,
    'app_metadata', case when p_line is null then null else jsonb_build_object('line_user_id', p_line) end))::text, false)
$$;
create function test.at(p_ts text) returns void
language sql as $$ select set_config('nobit.test_now', p_ts, false) $$;
create function test.ok(p_cond boolean, p_msg text) returns void
language plpgsql as $$
begin
  if p_cond is not true then raise exception 'FAIL: %', p_msg; end if;
  raise notice 'ok - %', p_msg;
end $$;
create function test.expect_error(p_sql text, p_code text) returns void
language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlerrm like '%' || p_code || '%' then
      raise notice 'ok - rejected with %', p_code;
      return;
    end if;
    raise exception 'FAIL: expected % but got %', p_code, sqlerrm;
  end;
  raise exception 'FAIL: expected % but it succeeded: %', p_code, p_sql;
end $$;
grant usage on schema test to authenticated;
grant execute on all functions in schema test to authenticated;
set client_min_messages = notice;

\set op  '00000000-0000-0000-0000-0000000000a1'
\set ca1 '00000000-0000-0000-0000-0000000000a2'
\set ca2 '00000000-0000-0000-0000-0000000000a3'
\set s1  '00000000-0000-0000-0000-0000000000b1'
\set s2  '00000000-0000-0000-0000-0000000000b2'
\set s3  '00000000-0000-0000-0000-0000000000b3'

insert into auth.users (id, email) values
  (:'op', 'op@example.com'), (:'ca1', 'ca1@example.com'), (:'ca2', 'ca2@example.com'),
  (:'s1', null), (:'s2', null), (:'s3', null);
insert into users (role, email, display_name) values ('operator', 'op@example.com', '運営');
select test.at('2026-10-05 09:00+09');   -- 月曜

-- 運営：クラブの作成とクラブ管理者の追加 -----------------------------------------
select test.as_user(:'op', 'op@example.com');
set role authenticated;
select test.ok(admin_claim() ->> 'role' = 'operator', '運営は初回ログインでメールから結びつく');
select admin_create_club('［クラブ名］A') ->> 'id' as club_a \gset
select admin_create_club('［クラブ名］B') ->> 'id' as club_b \gset
select admin_add_club_admin(:'club_a', 'ca1@example.com', '［管理者名］A');
select admin_add_club_admin(:'club_b', 'ca2@example.com', '［管理者名］B');
reset role;
select invite_code as inv_a from clubs where id = :'club_a' \gset
select invite_code as inv_b from clubs where id = :'club_b' \gset

-- 生徒：保護者同意つきの登録 ----------------------------------------------------
select test.as_user(:'s1', null, 'Uline1');
set role authenticated;
select test.expect_error($$select register_student('NOPE0000', '生徒1', '中2', '2026-10-v1')$$, 'invite_not_found');
select test.expect_error(format($$select register_student(%L, '生徒1', '中2', 'old')$$, :'inv_a'), 'consent_required');
select test.ok(club_by_invite(:'inv_a') ->> 'name' = '［クラブ名］A', '招待コードからクラブ名が出る');
select test.ok(register_student(:'inv_a', '生徒1', '中2', '2026-10-v1') ->> 'state' = 'pending', '登録直後は承認待ち');
select test.expect_error(format($$select register_student(%L, '生徒1', '中2', '2026-10-v1')$$, :'inv_a'), 'already_registered');
select test.expect_error('select my_home()', 'student_not_approved');
reset role;
select test.as_user(:'s2', null, 'Uline2');
set role authenticated;
select register_student(:'inv_a', '生徒2', '高1', '2026-10-v1');
reset role;
select test.as_user(:'s3', null, 'Uline3');
set role authenticated;
select register_student(:'inv_b', '生徒3', '中3', '2026-10-v1');
reset role;
select test.ok((select count(*) from parental_consents) = 3, '保護者同意が版つきで残る');

select u.id as s1_id, m.id as m_s1 from users u join club_members m on m.user_id = u.id where u.line_user_id = 'Uline1' \gset
select u.id as s2_id, m.id as m_s2 from users u join club_members m on m.user_id = u.id where u.line_user_id = 'Uline2' \gset
select u.id as s3_id, m.id as m_s3 from users u join club_members m on m.user_id = u.id where u.line_user_id = 'Uline3' \gset

-- クラブ管理者：自クラブだけを承認・閲覧できる -------------------------------------
select test.as_user(:'ca2', 'ca2@example.com');
set role authenticated;
select test.ok(admin_claim() ->> 'role' = 'club_admin', 'クラブ管理者も招待済みのメールで入れる');
select test.expect_error(format('select admin_decide_member(%L, true)', :'m_s1'), 'club_forbidden');
select test.expect_error(format('select admin_club_settings(%L)', :'club_a'), 'club_forbidden');
select admin_decide_member(:'m_s3', true);
reset role;

select test.as_user(:'ca1', 'ca1@example.com');
set role authenticated;
select admin_claim();
select test.ok(admin_club_settings(:'club_a') -> 'club' ->> 'invite_code' is null, '招待コードはクラブ管理者に出さない');
select test.ok(jsonb_array_length(admin_club_settings(:'club_a') -> 'pending') = 2, '承認待ちが2人');
select admin_decide_member(:'m_s1', true);
select admin_decide_member(:'m_s2', true);
select test.expect_error('select admin_create_task(array[gen_random_uuid()], ''x'', ''math'', ''daily'', current_date)', 'operator_only');
reset role;

-- 運営：タスクの配信 -------------------------------------------------------------
select test.as_user(:'op', 'op@example.com');
set role authenticated;
select admin_create_task(array[:'club_a', :'club_b']::uuid[], '英単語 20個', 'english', 'daily', '2026-10-05') as g_daily \gset
select admin_create_task(array[:'club_a']::uuid[], '数学プリント 第3回', 'math', 'once', '2026-10-05', '2026-10-07') as g_once \gset
select test.ok(jsonb_array_length(admin_tasks()) = 2, 'タスク一覧は配信ごとにまとまる');
reset role;

-- 生徒：完了と報酬（二重付与しない） -------------------------------------------------
select test.as_user(:'s1', null, 'Uline1');
set role authenticated;
select touch_open();
select test.ok(jsonb_array_length(my_home() -> 'tasks') = 2, '今日のタスクが2件');
select test.ok((select completed_count from daily_activity where activity_date = '2026-10-05') = 0, '開いただけでは学習にしない');
select (select e ->> 'id' from jsonb_array_elements(my_home() -> 'tasks') e where e ->> 'title' = '英単語 20個') as ut_daily \gset
select test.ok((complete_task(:'ut_daily', gen_random_uuid()) ->> 'coins')::int = 10, '完了で10コイン');
select test.ok((complete_task(:'ut_daily', gen_random_uuid()) ->> 'already')::boolean, '同じタスクの2回目は記録しなおさない');
select test.ok((select coin_balance from users where line_user_id = 'Uline1') = 10, 'コインは1回だけ');
select test.ok(my_home() -> 'tasks' -> 1 ->> 'completed_time' = '09:00', '完了したタスクは時刻で残る');

-- 自由登録（1日3件まで） ---------------------------------------------------------
select add_free_task('math', '問題集 p.12', '11111111-1111-1111-1111-111111111111');
select test.ok((add_free_task('math', '問題集 p.12', '11111111-1111-1111-1111-111111111111') ->> 'already')::boolean, '再送では二重に登録しない');
select add_free_task('science', '理科ノート', gen_random_uuid());
select add_free_task('social', '地図の確認', gen_random_uuid());
select test.expect_error($$select add_free_task('english', '4件目', gen_random_uuid())$$, 'free_entry_limit');
select test.ok((select coin_balance from users where line_user_id = 'Uline1') = 25, '自由登録は1件5コイン');
select test.ok((my_home() -> 'streak' ->> 'current')::int = 1, '最初の完了で連続1日');
reset role;

-- 他の生徒のタスクは完了できず、記録も読めない
select test.as_user(:'s2', null, 'Uline2');
set role authenticated;
select test.expect_error(format('select complete_task(%L, gen_random_uuid())', :'ut_daily'), 'task_not_found');
select test.ok((select count(*) from daily_activity where user_id = :'s1_id') = 0, '他の生徒の記録は読めない');
select test.ok(not set_line_contact(false), '生徒が LINE への連絡を止められる');
reset role;

-- クラブ管理者には自由登録の内容を見せない、他クラブは読めない
select test.as_user(:'ca1', 'ca1@example.com');
set role authenticated;
select test.ok((select count(*) from user_tasks where is_free) = 0, 'クラブ管理者は自由登録の行を読めない');
select test.ok((select count(*) from user_tasks where not is_free) > 0, 'クラブ管理者は配信タスクの完了を読める');
select test.ok(not exists (select 1 from jsonb_array_elements(admin_student_detail(:'s1_id') -> 'history') h
                            where (h ->> 'is_free')::boolean and (h ->> 'title' is not null or h ->> 'subject' is not null)),
               '詳細でも自由登録の題名と教科は伏せる');
select test.ok((select count(*) from users where club_id = :'club_b') = 0, '他クラブの生徒は読めない');
select test.expect_error(format('select admin_overview(%L)', :'club_b'), 'club_forbidden');
select test.expect_error('select admin_alerts()', 'operator_only');
select test.ok((admin_overview(:'club_a') -> 'summary' ->> 'students')::int = 2, '自クラブの生徒一覧');
select admin_post_comment(:'s1_id', '今日もよくがんばったね');
reset role;

select test.as_user(:'op', 'op@example.com');
set role authenticated;
select test.ok(exists (select 1 from jsonb_array_elements(admin_student_detail(:'s1_id') -> 'history') h
                        where (h ->> 'is_free')::boolean and h ->> 'title' is not null), '運営には自由登録の内容が見える');
select test.expect_error(format('select admin_post_comment(%L, ''x'')', :'s1_id'), 'club_admin_only');
reset role;

select test.as_user(:'s1', null, 'Uline1');
set role authenticated;
select test.ok(my_home() -> 'comment' ->> 'body' = '今日もよくがんばったね', '応援コメントがホームに届く');
reset role;

-- 連続記録：途切れても最長は残る -----------------------------------------------------
select test.at('2026-10-06 00:05+09');
select nobit_daily_close('2026-10-05');
select test.at('2026-10-06 08:00+09');
select test.as_user(:'s1', null, 'Uline1');
set role authenticated;
select (select e ->> 'id' from jsonb_array_elements(my_home() -> 'tasks') e where e ->> 'title' = '英単語 20個') as ut \gset
select test.ok((complete_task(:'ut', gen_random_uuid()) ->> 'streak')::int = 2, '2日目で連続2日');
reset role;
select test.at('2026-10-07 00:05+09');
select nobit_daily_close('2026-10-06');
select test.at('2026-10-08 00:05+09');
select nobit_daily_close('2026-10-07');
select test.ok((select current = 0 and best = 2 and broken_on = '2026-10-07' from streaks where user_id = :'s1_id'),
               '記録のない日で途切れ、最長記録は残る');
select test.ok((select count(*) from alerts where kind = 'gap' and user_id = :'s3_id' and alert_date = '2026-10-08') = 1,
               '記録のない日が3日続くとアラート');
select test.ok((select count(*) from alerts where kind = 'gap' and user_id = :'s2_id') = 0,
               'LINE 連絡を止めた生徒にはアラートを出さない');

-- 大会日は休息日として連続記録を守る
select test.as_user(:'ca1', 'ca1@example.com');
set role authenticated;
select admin_add_event(:'club_a', '大会', '［大会名］', '2026-10-09', '2026-10-09');
reset role;
select test.at('2026-10-08 18:00+09');
select test.as_user(:'s1', null, 'Uline1');
set role authenticated;
select (select e ->> 'id' from jsonb_array_elements(my_home() -> 'tasks') e where e ->> 'title' = '英単語 20個') as ut \gset
select test.ok((complete_task(:'ut', gen_random_uuid()) ->> 'resumed')::boolean, '途切れたあとの再開を返す');
reset role;
select test.at('2026-10-09 00:05+09'); select nobit_daily_close('2026-10-08');
select test.at('2026-10-10 00:05+09'); select nobit_daily_close('2026-10-09');
select test.ok((select current from streaks where user_id = :'s1_id') = 1, '大会日は連続記録を途切れさせない');
select test.at('2026-10-10 10:00+09');
select test.as_user(:'s1', null, 'Uline1');
set role authenticated;
select (select e ->> 'id' from jsonb_array_elements(my_home() -> 'tasks') e where e ->> 'title' = '英単語 20個') as ut \gset
select test.ok((complete_task(:'ut', gen_random_uuid()) ->> 'streak')::int = 2, '大会日をはさんで連続2日');
select test.ok((select s ->> 'rest' from jsonb_array_elements(my_home() -> 'strip') s where s ->> 'd' = '2026-10-09') = 'club_event',
               '記録の帯で大会日は休息日');
select test.ok((select best from streaks) = 2, '最長記録は2のまま');
reset role;

-- 未着手のアラートと連絡済みの記録 ----------------------------------------------------
select test.at('2026-10-12 17:00+09');
select test.ok(nobit_alert_not_started() = 0, '設定した時刻より前は出さない');
select test.at('2026-10-12 19:00+09');
select test.ok(nobit_alert_not_started() = 2, '未着手の生徒（連絡を止めた生徒を除く）に出す');
select test.as_user(:'op', 'op@example.com');
set role authenticated;
select (select a ->> 'id' from jsonb_array_elements(admin_alerts(:'club_a')) a where a ->> 'kind' = 'not_started') as al \gset
select test.ok((select message from alerts where id = :'al') = '今日のクエスト、あと1つだよ！', '文面に残り数が入る');
select admin_mark_contacted(:'al');
select test.expect_error(format('select admin_mark_contacted(%L)', :'al'), 'alert_not_open');
select test.ok((select s ->> 'display_name' from jsonb_array_elements(admin_overview(:'club_a') -> 'students') s limit 1) = '生徒2',
               '生徒一覧は対応が必要な順（記録が空いた生徒が先）');
reset role;
select test.at('2026-10-12 19:30+09');
select test.as_user(:'s1', null, 'Uline1');
set role authenticated;
select (select e ->> 'id' from jsonb_array_elements(my_home() -> 'tasks') e where e ->> 'title' = '英単語 20個') as ut \gset
select complete_task(:'ut', gen_random_uuid());
reset role;
select test.as_user(:'op', 'op@example.com');
set role authenticated;
select test.ok((select (a ->> 'completions_after')::int from jsonb_array_elements(admin_alerts(:'club_a')) a where a ->> 'id' = :'al') = 1,
               '連絡済みのあとの完了数を数える');
reset role;

-- 連続記録の節目（7日） ----------------------------------------------------------
select test.as_user(:'s3', null, 'Uline3');
set role authenticated;
do $$
declare d date; v_id text;
begin
  for d in select generate_series('2026-10-13'::date, '2026-10-19'::date, interval '1 day')::date loop
    perform test.at(d::text || ' 20:00+09');
    select e ->> 'id' into v_id from jsonb_array_elements(my_home() -> 'tasks') e where e ->> 'completed_at' is null limit 1;
    perform complete_task(v_id::uuid, gen_random_uuid());
  end loop;
end $$;
reset role;
select test.ok((select message from alerts where user_id = :'s3_id' and kind = 'streak_milestone') = '7日連続記録達成！おめでとう！',
               '7日連続で節目のアラート');

-- 休息チケット（配布の上限と、使った日の扱い） ------------------------------------------
select test.ok(nobit_grant_weekly_tickets('2026-10-12') = 3, '月曜に1枚ずつ配る');
select test.ok(nobit_grant_weekly_tickets('2026-10-12') = 0, '同じ週には配らない');
select test.ok(nobit_grant_weekly_tickets('2026-10-19') = 3, '翌週も配る');
select test.ok(nobit_grant_weekly_tickets('2026-10-26') = 0, '所持は2枚まで');
update rest_tickets set used_on = '2026-10-20' where user_id = :'s3_id' and granted_for_week = '2026-10-12';
select test.at('2026-10-21 20:00+09');
select test.as_user(:'s3', null, 'Uline3');
set role authenticated;
select (select e ->> 'id' from jsonb_array_elements(my_home() -> 'tasks') e where e ->> 'completed_at' is null limit 1) as ut \gset
select test.ok((complete_task(:'ut', gen_random_uuid()) ->> 'streak')::int = 8, 'チケットを使った日は連続記録を守る');
reset role;
select test.ok((select count(*) from daily_activity where user_id = :'s3_id' and activity_date = '2026-10-20' and completed_count > 0) = 0,
               'チケットの日は学習日に数えない');

-- 台帳と残高の一致 ---------------------------------------------------------------
select test.ok(not exists (
  select 1 from users u
   where u.coin_balance <> coalesce((select sum(amount) from coin_transactions t where t.user_id = u.id), 0)),
  'コインの残高は台帳の合計と一致する');
