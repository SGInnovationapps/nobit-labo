-- 承認待ちの生徒：配信タスクが展開でき、記録もできる。ただしクラブ管理者には見えない
begin;
select plan(14);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000ab01', 'g1@example.test'),
  ('00000000-0000-0000-0000-00000000ab02', 'g2@example.test'),
  ('00000000-0000-0000-0000-00000000ab03', 'g3@example.test'),
  ('00000000-0000-0000-0000-00000000ab09', 'g9@example.test');
insert into public.users (id, role, display_name, grade) values
  ('00000000-0000-0000-0000-00000000ab01', 'student', '承認待ちの子', 8),
  ('00000000-0000-0000-0000-00000000ab02', 'student', '承認済みの子', 8),
  ('00000000-0000-0000-0000-00000000ab03', 'student', '退会した子', 8),
  ('00000000-0000-0000-0000-00000000ab09', 'club_admin', '［管理者名］', null);
insert into public.clubs (id, name) values ('11111111-1111-1111-1111-1111111111ab', '［クラブ名］G');
insert into public.club_members (club_id, user_id, member_role, status) values
  ('11111111-1111-1111-1111-1111111111ab', '00000000-0000-0000-0000-00000000ab01', 'student', 'pending'),
  ('11111111-1111-1111-1111-1111111111ab', '00000000-0000-0000-0000-00000000ab02', 'student', 'approved'),
  ('11111111-1111-1111-1111-1111111111ab', '00000000-0000-0000-0000-00000000ab03', 'student', 'left'),
  ('11111111-1111-1111-1111-1111111111ab', '00000000-0000-0000-0000-00000000ab09', 'club_admin', 'approved');
insert into public.tasks (id, club_id, title, subject, kind, recurrence, starts_on) values
  ('22222222-2222-2222-2222-2222222222ab', '11111111-1111-1111-1111-1111111111ab', '英語 配信', '英語', 'assigned', 'daily', private.jst_today());

-- ===== 承認待ちの生徒 =====
set local role authenticated;
do $$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000ab01"}', true); end $$;

select lives_ok('select public.sync_today_tasks()', '承認待ちでも、配信タスクを展開できる');
select is((select count(*)::int from public.user_tasks), 1, '今日のタスクが1件見える');
select lives_ok('select public.sync_today_tasks()', '二度目でも落ちない');
select is((select count(*)::int from public.user_tasks), 1, '二重には作らない');

select is((public.complete_task((select id from public.user_tasks limit 1)) ->> 'already_completed')::boolean, false,
  '承認待ちでもタスクを完了できる');
select is((select completed_count::int from public.daily_activity), 1, '完了が記録に残る');
select is((select current_days::int from public.streaks), 1, '連続記録も進む');
select lives_ok($$select public.record_study_tag('数学')$$, '教科タグでも記録できる');
reset role;

-- ===== 退会した生徒は通さない =====
set local role authenticated;
do $$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000ab03"}', true); end $$;
-- 退会した生徒はホーム自体を出さない（アプリが「招待リンクから開いてください」に戻す）ので、ここは拒否のままでよい
select throws_ok('select public.sync_today_tasks()', 'P0001', 'not_approved_student', '退会した生徒は、これまでどおり拒否する');
select is((select count(*)::int from public.user_tasks), 0, '退会した生徒にタスクは出ない');
reset role;

-- ===== クラブ管理者からは、承認待ちの記録が見えない =====
set local role authenticated;
do $$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000ab09"}', true); end $$;
select is((select count(*)::int from public.user_tasks), 0, 'クラブ管理者に、承認待ちの生徒のタスクは見えない');
select is((select count(*)::int from public.daily_activity), 0, '記録の帯にも出ない');
reset role;

-- ===== 承認すると見えるようになる =====
update public.club_members set status = 'approved'
 where user_id = '00000000-0000-0000-0000-00000000ab01' and club_id = '11111111-1111-1111-1111-1111111111ab';

set local role authenticated;
do $$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000ab09"}', true); end $$;
select is((select count(*)::int from public.user_tasks), 1, '承認するとタスクが見える');
select is((select count(*)::int from public.daily_activity), 1, '承認すると記録も見える（承認前の分も残る）');
reset role;

select * from finish();
rollback;
