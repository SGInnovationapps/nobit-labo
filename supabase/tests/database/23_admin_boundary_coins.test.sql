-- v1.7：クラブ管理者に見せない範囲（教科・内容・コイン）と、コイン台帳の整合
--   見せるのは完了した配信タスクと記録の数まで。運営はコイン台帳を読める
begin;
select plan(14);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000e1', 'e1@example.test'), ('00000000-0000-0000-0000-0000000000e2', 'e2@example.test'),
  ('00000000-0000-0000-0000-0000000000e3', 'e3@example.test'), ('00000000-0000-0000-0000-0000000000e4', 'e4@example.test');
insert into public.users (id, role, display_name, grade) values
  ('00000000-0000-0000-0000-0000000000e1', 'student', 'coin', 7), ('00000000-0000-0000-0000-0000000000e2', 'club_admin', '［管理者名］', null),
  ('00000000-0000-0000-0000-0000000000e3', 'operator', '運営', null), ('00000000-0000-0000-0000-0000000000e4', 'club_admin', '［管理者名］B', null);
insert into public.clubs (id, name) values
  ('11111111-1111-1111-1111-1111111111e1', '［クラブ名］E'), ('11111111-1111-1111-1111-1111111111e2', '［クラブ名］E2');
insert into public.club_members (club_id, user_id, member_role, status) values
  ('11111111-1111-1111-1111-1111111111e1', '00000000-0000-0000-0000-0000000000e1', 'student', 'approved'),
  ('11111111-1111-1111-1111-1111111111e1', '00000000-0000-0000-0000-0000000000e2', 'club_admin', 'approved'),
  ('11111111-1111-1111-1111-1111111111e2', '00000000-0000-0000-0000-0000000000e4', 'club_admin', 'approved');
insert into public.tasks (id, club_id, title, subject, reward_coins) values
  ('22222222-2222-2222-2222-2222222222e1', '11111111-1111-1111-1111-1111111111e1', '英語 配信', '英語', 10);
insert into public.user_tasks (id, task_id, student_id, task_date) values
  ('33333333-3333-3333-3333-3333333333e1', '22222222-2222-2222-2222-2222222222e1', '00000000-0000-0000-0000-0000000000e1', private.jst_today());

-- 生徒の記録：配信タスクの完了（10＋学習した日1）、教科の記録（内容つき）
set local role authenticated;
do $$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e1"}', true); end $$;
select lives_ok($$select public.complete_task('33333333-3333-3333-3333-3333333333e1')$$, '配信タスクを完了できる');
select lives_ok($$select public.record_study_tag('数学')$$, '教科を記録できる');
select lives_ok($$select public.set_study_content((select id from public.study_records where subject = '数学'), '二次関数')$$, '内容を書ける');
select is((select balance from public.coin_balances), 17, '台帳の残高は、配信タスク10＋学習した日1＋デイリークエスト3×2');
select is((select count(*)::int from public.coin_transactions), 4, '台帳は4行（配信タスク・学習した日・クエスト2つ）');
-- 二重完了で増えない
select lives_ok($$select public.complete_task('33333333-3333-3333-3333-3333333333e1')$$, '同じタスクを重ねて完了しても失敗しない');
select is((select balance from public.coin_balances), 17, '二重に付与されない');

-- クラブ管理者：記録の数と完了した配信タスクは見える。教科・内容・コインは見えない
reset role;
set local role authenticated;
do $$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e2"}', true); end $$;
select is((select completed_count::int from public.daily_activity), 2, 'クラブ管理者は記録の数を読める');
select is((select count(*)::int from public.user_tasks where completed_at is not null), 1, 'クラブ管理者は完了した配信タスクを読める');
select is((select count(*)::int from public.study_records), 0, 'クラブ管理者は教科・内容の記録を読めない');
select is((select count(*)::int from public.coin_transactions), 0, 'クラブ管理者はコインの台帳を読めない');
select is((select count(*)::int from public.coin_balances), 0, 'クラブ管理者はコインの残高を読めない');

-- 運営：コインの台帳を読める
reset role;
set local role authenticated;
do $$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e3"}', true); end $$;
select is((select balance from public.coin_balances where student_id = '00000000-0000-0000-0000-0000000000e1'), 17, '運営はコインの残高を読める');

-- 他クラブのクラブ管理者は、このクラブの記録の数も読めない
reset role;
set local role authenticated;
do $$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e4"}', true); end $$;
select is((select count(*)::int from public.daily_activity), 0, '他クラブのクラブ管理者は記録の数を読めない');

select * from finish();
rollback;
