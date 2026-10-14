-- v1.7：表示名の初期値に使う LINE の名前は、本人と運営だけが読める（クラブ管理者・他の生徒には見せない）
begin;
select plan(5);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000c1', 'c1@example.test'), ('00000000-0000-0000-0000-0000000000c2', 'c2@example.test'),
  ('00000000-0000-0000-0000-0000000000c3', 'c3@example.test'), ('00000000-0000-0000-0000-0000000000c4', 'c4@example.test');
insert into public.users (id, role, display_name, grade) values
  ('00000000-0000-0000-0000-0000000000c1', 'student', null, null), ('00000000-0000-0000-0000-0000000000c2', 'student', 'other', 8),
  ('00000000-0000-0000-0000-0000000000c3', 'club_admin', '［管理者名］', null), ('00000000-0000-0000-0000-0000000000c4', 'operator', '運営', null);
insert into public.clubs (id, name) values ('11111111-1111-1111-1111-1111111111c1', '［クラブ名］C');
insert into public.club_members (club_id, user_id, member_role, status) values
  ('11111111-1111-1111-1111-1111111111c1', '00000000-0000-0000-0000-0000000000c1', 'student', 'pending'),
  ('11111111-1111-1111-1111-1111111111c1', '00000000-0000-0000-0000-0000000000c2', 'student', 'approved'),
  ('11111111-1111-1111-1111-1111111111c1', '00000000-0000-0000-0000-0000000000c3', 'club_admin', 'approved');
insert into public.line_accounts (user_id, line_user_id, line_display_name) values
  ('00000000-0000-0000-0000-0000000000c1', 'Uc1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1', 'のびた'),
  ('00000000-0000-0000-0000-0000000000c2', 'Uc2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2', 'しずか');

set local role authenticated;
do $$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1"}', true); end $$;
select is((select line_display_name from public.line_accounts where user_id = '00000000-0000-0000-0000-0000000000c1'), 'のびた', '本人は自分の LINE の名前を読める');
select is((select count(*)::int from public.line_accounts), 1, '他の生徒の LINE の名前は読めない');
select lives_ok($$update public.users set display_name = 'のびた', grade = 8 where id = '00000000-0000-0000-0000-0000000000c1'$$, '表示名と学年を保存できる');

do $$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c3"}', true); end $$;
select is((select count(*)::int from public.line_accounts), 0, 'クラブ管理者は LINE の名前を読めない');

do $$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c4"}', true); end $$;
select is((select count(*)::int from public.line_accounts), 2, '運営は読める');

select * from finish();
rollback;
