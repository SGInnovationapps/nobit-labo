-- 生徒一覧・詳細・応援：クラブ管理者の読み取り範囲と、応援コメントの権限
begin;
select plan(11);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000e1', 'opx@example.test'),
  ('00000000-0000-0000-0000-0000000000e2', 'admA@example.test'),
  ('00000000-0000-0000-0000-0000000000e3', 'admB@example.test'),
  ('00000000-0000-0000-0000-0000000000e4', 'stuA@example.test'),
  ('00000000-0000-0000-0000-0000000000e5', 'stuB@example.test');
insert into public.users (id, role, display_name, grade) values
  ('00000000-0000-0000-0000-0000000000e1', 'operator', 'op', null),
  ('00000000-0000-0000-0000-0000000000e2', 'club_admin', 'admA', null),
  ('00000000-0000-0000-0000-0000000000e3', 'club_admin', 'admB', null),
  ('00000000-0000-0000-0000-0000000000e4', 'student', 'stuA', 8),
  ('00000000-0000-0000-0000-0000000000e5', 'student', 'stuB', 9);
insert into public.clubs (id, name) values
  ('11111111-1111-1111-1111-1111111111e1', '［クラブ名］A'),
  ('11111111-1111-1111-1111-1111111111e2', '［クラブ名］B');
insert into public.club_members (club_id, user_id, member_role, status) values
  ('11111111-1111-1111-1111-1111111111e1', '00000000-0000-0000-0000-0000000000e2', 'club_admin', 'approved'),
  ('11111111-1111-1111-1111-1111111111e2', '00000000-0000-0000-0000-0000000000e3', 'club_admin', 'approved'),
  ('11111111-1111-1111-1111-1111111111e1', '00000000-0000-0000-0000-0000000000e4', 'student', 'approved'),
  ('11111111-1111-1111-1111-1111111111e2', '00000000-0000-0000-0000-0000000000e5', 'student', 'approved');
insert into public.tasks (id, club_id, kind, owner_id, title, subject) values
  ('22222222-2222-2222-2222-2222222222e1', '11111111-1111-1111-1111-1111111111e1', 'assigned', null, '配信', '英語'),
  ('22222222-2222-2222-2222-2222222222e2', '11111111-1111-1111-1111-1111111111e1', 'free', '00000000-0000-0000-0000-0000000000e4', '自由登録の中身', '数学');
insert into public.user_tasks (id, task_id, student_id, task_date) values
  ('33333333-3333-3333-3333-3333333333e1', '22222222-2222-2222-2222-2222222222e1', '00000000-0000-0000-0000-0000000000e4', private.jst_today()),
  ('33333333-3333-3333-3333-3333333333e2', '22222222-2222-2222-2222-2222222222e2', '00000000-0000-0000-0000-0000000000e4', private.jst_today());

-- 生徒 A が両方を完了する
set local role authenticated;
do $$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e4"}', true); end $$;
do $$ begin
  perform public.complete_task('33333333-3333-3333-3333-3333333333e1');
  perform public.complete_task('33333333-3333-3333-3333-3333333333e2');
end $$;

-- 生徒 A：自分あての応援はまだ読めない（なし）
select is((select count(*)::int from public.support_comments), 0, '応援の前は 0 件');

-- クラブ管理者 A：自クラブの生徒の記録を読める。自由登録は見えない
do $$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e2"}', true); end $$;
select is((select count(*)::int from public.streak_status), 1, '自クラブの連続記録だけ読める');
select is((select completed_count::int from public.daily_activity), 2, '日別の完了数は読める');
select is((select count(*)::int from public.user_tasks where is_free = false), 1, '配信されたタスクの割り当ては読める');
select is((select count(*)::int from public.user_tasks where is_free = true), 0, '自由登録の割り当ては見えない');
select is((select count(*)::int from public.tasks where kind = 'free'), 0, '自由登録の中身は見えない');

-- 応援：自クラブの生徒には書ける。他クラブの生徒には書けない
select lives_ok($$ insert into public.support_comments (club_id, student_id, author_id, body)
  values ('11111111-1111-1111-1111-1111111111e1', '00000000-0000-0000-0000-0000000000e4', '00000000-0000-0000-0000-0000000000e2', '応援') $$, '自クラブの生徒に応援を書ける');
select throws_ok($$ insert into public.support_comments (club_id, student_id, author_id, body)
  values ('11111111-1111-1111-1111-1111111111e2', '00000000-0000-0000-0000-0000000000e5', '00000000-0000-0000-0000-0000000000e2', '他クラブ') $$, '42501', null, '他クラブの生徒には書けない');

-- 生徒 A：自分あての応援は読める。生徒 B は読めない
select is((select count(*)::int from public.support_comments), 1, '自分あての応援を読める') from (select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e4"}', true)) x;
select is((select count(*)::int from public.support_comments), 0, '他の生徒あての応援は読めない') from (select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e5"}', true)) x;

-- 運営：クラブをまたいで読める。応援は書けない（運営は公式LINE のチャットから送る）
do $$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e1"}', true); end $$;
select throws_ok($$ insert into public.support_comments (club_id, student_id, author_id, body)
  values ('11111111-1111-1111-1111-1111111111e1', '00000000-0000-0000-0000-0000000000e4', '00000000-0000-0000-0000-0000000000e1', '運営') $$, '42501', null, '運営は、アプリ内の応援を書けない');

select * from finish();
rollback;
