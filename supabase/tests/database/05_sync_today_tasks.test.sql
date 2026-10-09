-- 配信タスクの今日への展開
begin;
select plan(9);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000c1', 'c1@example.test'),
  ('00000000-0000-0000-0000-0000000000c2', 'c2@example.test'),
  ('00000000-0000-0000-0000-0000000000c3', 'c3@example.test');
insert into public.users (id, role, display_name, grade) values
  ('00000000-0000-0000-0000-0000000000c1', 'student', 'c1', 7),
  ('00000000-0000-0000-0000-0000000000c2', 'student', 'c2', 8),
  ('00000000-0000-0000-0000-0000000000c3', 'student', 'c3', 9);
insert into public.clubs (id, name) values
  ('11111111-1111-1111-1111-1111111111a1', '［クラブ名］A'),
  ('11111111-1111-1111-1111-1111111111b1', '［クラブ名］B');
insert into public.club_members (club_id, user_id, member_role, status) values
  ('11111111-1111-1111-1111-1111111111a1', '00000000-0000-0000-0000-0000000000c1', 'student', 'approved'),
  ('11111111-1111-1111-1111-1111111111a1', '00000000-0000-0000-0000-0000000000c3', 'student', 'pending'),
  ('11111111-1111-1111-1111-1111111111b1', '00000000-0000-0000-0000-0000000000c2', 'student', 'approved');

insert into public.tasks (id, club_id, title, subject, starts_on, due_on, recurrence, archived_at) values
  ('22222222-2222-2222-2222-2222222222a1', '11111111-1111-1111-1111-1111111111a1', '毎日', '英語', private.jst_today() - 3, null, 'daily', null),
  ('22222222-2222-2222-2222-2222222222a2', '11111111-1111-1111-1111-1111111111a1', '今日だけ', '数学', private.jst_today(), null, 'none', null),
  ('22222222-2222-2222-2222-2222222222a3', '11111111-1111-1111-1111-1111111111a1', '明日から', '国語', private.jst_today() + 1, null, 'daily', null),
  ('22222222-2222-2222-2222-2222222222a4', '11111111-1111-1111-1111-1111111111a1', '終了済み', '理科', private.jst_today() - 5, private.jst_today() - 1, 'daily', null),
  ('22222222-2222-2222-2222-2222222222a5', '11111111-1111-1111-1111-1111111111a1', '取り下げ', '社会', private.jst_today() - 1, null, 'daily', now()),
  ('22222222-2222-2222-2222-2222222222b1', '11111111-1111-1111-1111-1111111111b1', '他クラブ', '英語', private.jst_today(), null, 'daily', null);

set local role authenticated;
do $$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1"}', true); end $$;

select is((public.sync_today_tasks() ->> 'created')::int, 2, '開始済み・期間内・取り下げなしの 2 件だけ展開する');
select is((select count(*)::int from public.user_tasks where student_id = '00000000-0000-0000-0000-0000000000c1'), 2, 'user_tasks は 2 行');
select is((public.sync_today_tasks() ->> 'created')::int, 0, '2 回目は何も作らない（二重に作らない）');
select is((select count(*)::int from public.user_tasks), 2, '行数は変わらない');

-- 「今日だけ」を完了すると、翌日以降は出さない（同じ日の再呼び出しでも増えない）
select lives_ok($$ select public.complete_task((select id from public.user_tasks where task_id = '22222222-2222-2222-2222-2222222222a2')) $$, '展開したタスクを完了できる');
select is((public.sync_today_tasks() ->> 'created')::int, 0, '完了後に再展開しても増えない');

-- 他クラブのタスクは展開されない
select is((select count(*)::int from public.user_tasks where task_id = '22222222-2222-2222-2222-2222222222b1'), 0, '他クラブのタスクは入らない');

-- 承認前の生徒は呼べない
do $$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c3"}', true); end $$;
select throws_ok($$ select public.sync_today_tasks() $$, 'not_approved_student', '承認前の生徒は展開できない');

-- 未ログインは呼べない
reset role;
set local role anon;
select throws_ok($$ select public.sync_today_tasks() $$, '42501', null, 'anon は実行できない');

select * from finish();
rollback;
