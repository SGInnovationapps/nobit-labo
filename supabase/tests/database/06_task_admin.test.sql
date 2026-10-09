-- タスク管理：配信・取り下げは運営だけ。クラブ管理者と生徒は書けない
begin;
select plan(8);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000d1', 'op@example.test'),
  ('00000000-0000-0000-0000-0000000000d2', 'adm@example.test'),
  ('00000000-0000-0000-0000-0000000000d3', 'stu@example.test');
insert into public.users (id, role, display_name, grade) values
  ('00000000-0000-0000-0000-0000000000d1', 'operator', 'op', null),
  ('00000000-0000-0000-0000-0000000000d2', 'club_admin', 'adm', null),
  ('00000000-0000-0000-0000-0000000000d3', 'student', 'stu', 8);
insert into public.clubs (id, name) values ('11111111-1111-1111-1111-1111111111d1', '［クラブ名］');
insert into public.club_members (club_id, user_id, member_role, status) values
  ('11111111-1111-1111-1111-1111111111d1', '00000000-0000-0000-0000-0000000000d2', 'club_admin', 'approved'),
  ('11111111-1111-1111-1111-1111111111d1', '00000000-0000-0000-0000-0000000000d3', 'student', 'approved');

set local role authenticated;

-- 運営：作成できる
do $$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d1"}', true); end $$;
select lives_ok($$ insert into public.tasks (id, club_id, kind, title, subject, recurrence, starts_on, created_by)
  values ('22222222-2222-2222-2222-2222222222d1', '11111111-1111-1111-1111-1111111111d1', 'assigned', '配信', '英語', 'daily', private.jst_today(), '00000000-0000-0000-0000-0000000000d1') $$, '運営はタスクを作れる');

-- 生徒：今日の分を受け取り、未完了のまま残る
do $$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d3"}', true); end $$;
select is((public.sync_today_tasks() ->> 'created')::int, 1, '生徒は配信を受け取る');

-- クラブ管理者：作成も取り下げもできない
do $$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d2"}', true); end $$;
select throws_ok($$ insert into public.tasks (club_id, kind, title, subject) values ('11111111-1111-1111-1111-1111111111d1', 'assigned', 'x', '数学') $$, '42501', null, 'クラブ管理者は作れない');
update public.tasks set archived_at = now() where id = '22222222-2222-2222-2222-2222222222d1';
select is((select archived_at from public.tasks where id = '22222222-2222-2222-2222-2222222222d1'), null, 'クラブ管理者は取り下げられない');
select is((select count(*)::int from public.tasks where kind = 'assigned'), 1, 'クラブ管理者は配信中のタスクを読める');

-- 生徒：作れない
do $$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d3"}', true); end $$;
select throws_ok($$ insert into public.tasks (club_id, kind, title, subject) values ('11111111-1111-1111-1111-1111111111d1', 'assigned', 'x', '数学') $$, '42501', null, '生徒は配信できない');

-- 運営：取り下げ → 未完了の今日の分を消す。再度の展開では出ない
do $$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d1"}', true); end $$;
update public.tasks set archived_at = now() where id = '22222222-2222-2222-2222-2222222222d1';
delete from public.user_tasks where task_id = '22222222-2222-2222-2222-2222222222d1' and task_date >= private.jst_today() and completed_at is null;
select is((select count(*)::int from public.user_tasks), 0, '取り下げで、未完了の今日の分が消える');
do $$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d3"}', true); end $$;
select is((public.sync_today_tasks() ->> 'created')::int, 0, '取り下げたタスクは、もう展開されない');

select * from finish();
rollback;
