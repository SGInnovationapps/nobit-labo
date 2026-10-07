-- クラブ間の分離と、クラブ管理者に見せる範囲（完了したタスクと記録の帯まで）
begin;
select plan(25);

-- 登場人物（［クラブ名］A・B、［管理者名］、生徒は仮の ID のみ）
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'op@example.test'),
  ('00000000-0000-0000-0000-0000000000a2', 'adminA@example.test'),
  ('00000000-0000-0000-0000-0000000000a3', 'adminB@example.test'),
  ('00000000-0000-0000-0000-0000000000b1', 'sA1@example.test'),
  ('00000000-0000-0000-0000-0000000000b2', 'sA2@example.test'),
  ('00000000-0000-0000-0000-0000000000b3', 'sB1@example.test'),
  ('00000000-0000-0000-0000-0000000000b4', 'pA@example.test');
insert into public.users (id, role, display_name, grade) values
  ('00000000-0000-0000-0000-0000000000a1', 'operator', '運営', null),
  ('00000000-0000-0000-0000-0000000000a2', 'club_admin', '［管理者名］A', null),
  ('00000000-0000-0000-0000-0000000000a3', 'club_admin', '［管理者名］B', null),
  ('00000000-0000-0000-0000-0000000000b1', 'student', 'sA1', 7),
  ('00000000-0000-0000-0000-0000000000b2', 'student', 'sA2', 8),
  ('00000000-0000-0000-0000-0000000000b3', 'student', 'sB1', 9),
  ('00000000-0000-0000-0000-0000000000b4', 'student', 'pA', 10);
insert into public.clubs (id, name, invite_code) values
  ('11111111-1111-1111-1111-11111111111a', '［クラブ名］A', 'invitecodea1'),
  ('11111111-1111-1111-1111-11111111111b', '［クラブ名］B', 'invitecodeb1');
insert into public.club_members (club_id, user_id, member_role, status) values
  ('11111111-1111-1111-1111-11111111111a', '00000000-0000-0000-0000-0000000000a2', 'club_admin', 'approved'),
  ('11111111-1111-1111-1111-11111111111b', '00000000-0000-0000-0000-0000000000a3', 'club_admin', 'approved'),
  ('11111111-1111-1111-1111-11111111111a', '00000000-0000-0000-0000-0000000000b1', 'student', 'approved'),
  ('11111111-1111-1111-1111-11111111111a', '00000000-0000-0000-0000-0000000000b2', 'student', 'approved'),
  ('11111111-1111-1111-1111-11111111111b', '00000000-0000-0000-0000-0000000000b3', 'student', 'approved'),
  ('11111111-1111-1111-1111-11111111111a', '00000000-0000-0000-0000-0000000000b4', 'student', 'pending');
insert into public.line_accounts (user_id, line_user_id) values
  ('00000000-0000-0000-0000-0000000000b1', 'Uaaaaaaaa1'),
  ('00000000-0000-0000-0000-0000000000b3', 'Ubbbbbbbb3');
insert into public.tasks (id, club_id, kind, owner_id, title, subject) values
  ('22222222-2222-2222-2222-22222222222a', '11111111-1111-1111-1111-11111111111a', 'assigned', null, '英語 配信', '英語'),
  ('22222222-2222-2222-2222-22222222222b', '11111111-1111-1111-1111-11111111111b', 'assigned', null, '数学 配信B', '数学'),
  ('22222222-2222-2222-2222-2222222222f1', '11111111-1111-1111-1111-11111111111a', 'free', '00000000-0000-0000-0000-0000000000b1', '自由登録 sA1', '国語');
insert into public.user_tasks (id, task_id, student_id, task_date) values
  ('33333333-3333-3333-3333-3333333333a1', '22222222-2222-2222-2222-22222222222a', '00000000-0000-0000-0000-0000000000b1', private.jst_today()),
  ('33333333-3333-3333-3333-3333333333a2', '22222222-2222-2222-2222-2222222222f1', '00000000-0000-0000-0000-0000000000b1', private.jst_today()),
  ('33333333-3333-3333-3333-3333333333a3', '22222222-2222-2222-2222-22222222222a', '00000000-0000-0000-0000-0000000000b2', private.jst_today()),
  ('33333333-3333-3333-3333-3333333333b1', '22222222-2222-2222-2222-22222222222b', '00000000-0000-0000-0000-0000000000b3', private.jst_today());
insert into public.daily_activity (club_id, student_id, activity_date, completed_count) values
  ('11111111-1111-1111-1111-11111111111a', '00000000-0000-0000-0000-0000000000b1', private.jst_today(), 2),
  ('11111111-1111-1111-1111-11111111111b', '00000000-0000-0000-0000-0000000000b3', private.jst_today(), 1);
insert into public.streaks (student_id, club_id, current_days, longest_days, last_achieved_date) values
  ('00000000-0000-0000-0000-0000000000b1', '11111111-1111-1111-1111-11111111111a', 2, 5, private.jst_today()),
  ('00000000-0000-0000-0000-0000000000b3', '11111111-1111-1111-1111-11111111111b', 1, 1, private.jst_today());
insert into public.app_opens (club_id, student_id, opened_on) values
  ('11111111-1111-1111-1111-11111111111a', '00000000-0000-0000-0000-0000000000b1', private.jst_today());

-- ===== クラブ管理者 A =====
set local role authenticated;
do $$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a2"}', true); end $$;

select results_eq($$select name from public.clubs$$, $$values ('［クラブ名］A')$$, '管理者A は自クラブだけ見える');
select is((select count(*)::int from public.users where id = '00000000-0000-0000-0000-0000000000b3'), 0, '管理者A は他クラブの生徒を読めない');
select is((select count(*)::int from public.users where id in ('00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000b4')), 2, '管理者A は自クラブの生徒（申請中を含む）を読める');
select is((select count(*)::int from public.club_members where club_id = '11111111-1111-1111-1111-11111111111b'), 0, '管理者A は他クラブの所属を読めない');
select is((select count(*)::int from public.tasks where kind = 'free'), 0, '管理者A は自由登録のタスクを読めない');
select is((select count(*)::int from public.tasks where id = '22222222-2222-2222-2222-22222222222b'), 0, '管理者A は他クラブのタスクを読めない');
select is((select count(*)::int from public.user_tasks), 2, '管理者A が読める割当は配信タスクの 2 件だけ（自由登録と他クラブは見えない）');
select is((select count(*)::int from public.daily_activity), 1, '管理者A は自クラブの記録の帯だけ読める');
select is((select count(*)::int from public.streaks), 1, '管理者A は自クラブの連続記録だけ読める');
select is((select count(*)::int from public.line_accounts), 0, '管理者A は LINE の識別子を読めない');
select is((select count(*)::int from public.app_opens), 0, '管理者A はアプリ起動記録を読めない');
select throws_ok($$update public.users set role = 'operator' where id = '00000000-0000-0000-0000-0000000000a2'$$, '42501', null, '自分のロールを書き換えられない');
select throws_ok($$insert into public.clubs (name) values ('勝手なクラブ')$$, '42501', null, '管理者はクラブを作れない');
select throws_ok($$insert into public.tasks (club_id, title, subject) values ('11111111-1111-1111-1111-11111111111a', 'x', '英語')$$, '42501', null, '管理者はタスクを配信できない（運営の仕事）');

-- ===== 生徒 sA1 =====
do $$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1"}', true); end $$;

select is((select count(*)::int from public.user_tasks), 2, '生徒は自分の割当だけ読める（配信 1 件 + 自由登録 1 件）');
select is((select count(*)::int from public.tasks), 2, '生徒は自クラブの配信タスクと自分の自由登録を読める');
select is((select count(*)::int from public.users), 1, '生徒は自分以外の利用者を読めない');
select is((select count(*)::int from public.streaks), 1, '生徒は自分の連続記録だけ読める');
select is((select count(*)::int from public.line_accounts), 1, '生徒は自分の LINE 識別子だけ読める');

-- ===== 生徒 sA2（同じクラブの別の生徒）=====
do $$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b2"}', true); end $$;

select is((select count(*)::int from public.tasks where kind = 'free'), 0, '同じクラブの別の生徒の自由登録は読めない');
select is((select count(*)::int from public.daily_activity), 0, '別の生徒の記録の帯は読めない');

-- ===== 申請中の生徒 pA =====
do $$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b4"}', true); end $$;

select is((select count(*)::int from public.tasks), 0, '申請中の生徒にはタスクが見えない');

-- ===== 運営 =====
do $$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1"}', true); end $$;

select is((select count(*)::int from public.clubs), 2, '運営は全クラブを読める');
select is((select count(*)::int from public.user_tasks), 4, '運営は全割当を読める');

-- ===== 匿名 =====
reset role;
set local role anon;
select throws_ok($$select * from public.clubs$$, '42501', null, '匿名ユーザーは clubs を読めない');

select * from finish();
rollback;
