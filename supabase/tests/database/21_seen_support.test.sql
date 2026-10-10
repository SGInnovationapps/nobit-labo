-- v1.7 ③：見たよ、送り主の名前つきの最新の応援
begin;
select plan(9);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000e1', 'e1@example.test'), ('00000000-0000-0000-0000-0000000000e2', 'e2@example.test'),
  ('00000000-0000-0000-0000-0000000000e3', 'e3@example.test');
insert into public.users (id, role, display_name, grade) values
  ('00000000-0000-0000-0000-0000000000e1', 'student', 's1', 7),
  ('00000000-0000-0000-0000-0000000000e2', 'club_admin', '［管理者名］', null),
  ('00000000-0000-0000-0000-0000000000e3', 'club_admin', '［別の管理者名］', null);
insert into public.clubs (id, name) values ('11111111-1111-1111-1111-1111111111e1', '［クラブ名］'), ('11111111-1111-1111-1111-1111111111e2', '［クラブ名］B');
insert into public.club_members (club_id, user_id, member_role, status) values
  ('11111111-1111-1111-1111-1111111111e1', '00000000-0000-0000-0000-0000000000e1', 'student', 'approved'),
  ('11111111-1111-1111-1111-1111111111e1', '00000000-0000-0000-0000-0000000000e2', 'club_admin', 'approved'),
  ('11111111-1111-1111-1111-1111111111e2', '00000000-0000-0000-0000-0000000000e3', 'club_admin', 'approved');

set local role authenticated;
do $$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e2"}', true); end $$;
select is(public.send_seen('00000000-0000-0000-0000-0000000000e1'), true, '見たよを送れる');
select is(public.send_seen('00000000-0000-0000-0000-0000000000e1'), false, '同じ日の2回目は増えない');
select is((select count(*)::int from public.support_comments where kind = 'seen'), 1, '見たよは1件');
select throws_ok($$insert into public.support_comments (club_id, student_id, author_id, body, kind) values ('11111111-1111-1111-1111-1111111111e1', '00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000e2', '見たよ', 'seen')$$, '42501', null, '見たよは、直接は書けない');
select lives_ok($$insert into public.support_comments (club_id, student_id, author_id, body, created_at) values ('11111111-1111-1111-1111-1111111111e1', '00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000e2', '今日もおつかれさま', now() + interval '1 second')$$, 'コメントは書ける');

-- 他のクラブの管理者は送れない
do $$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e3"}', true); end $$;
select throws_ok($$select public.send_seen('00000000-0000-0000-0000-0000000000e1')$$, 'P0001', 'forbidden', '他のクラブの管理者は送れない');

-- 生徒：最新の応援と送り主の名前
do $$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e1"}', true); end $$;
select is((select author_name from public.my_latest_support()), '［管理者名］', '送り主の名前が読める');
select is((select body from public.my_latest_support()), '今日もおつかれさま', '最新のものが返る');
select throws_ok($$select public.send_seen('00000000-0000-0000-0000-0000000000e1')$$, 'P0001', 'forbidden', '生徒は見たよを送れない');

select * from finish();
rollback;
