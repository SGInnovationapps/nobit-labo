begin;
select plan(13);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000d1', 'd1@example.test'), ('00000000-0000-0000-0000-0000000000d2', 'd2@example.test'),
  ('00000000-0000-0000-0000-0000000000d3', 'op@example.test');
insert into public.users (id, role, display_name, grade) values
  ('00000000-0000-0000-0000-0000000000d1', 'student', 'd1', 7), ('00000000-0000-0000-0000-0000000000d2', 'student', 'd2', 8),
  ('00000000-0000-0000-0000-0000000000d3', 'operator', '運営', null);
insert into public.line_accounts (user_id, line_user_id) values ('00000000-0000-0000-0000-0000000000d1', 'U11111111111111111111111111111111');
insert into public.clubs (id, name) values ('11111111-1111-1111-1111-1111111111d1', '［クラブ名］D');
insert into public.club_members (club_id, user_id, member_role, status, reviewed_at) values
  ('11111111-1111-1111-1111-1111111111d1', '00000000-0000-0000-0000-0000000000d1', 'student', 'approved', now() - interval '20 days'),
  ('11111111-1111-1111-1111-1111111111d1', '00000000-0000-0000-0000-0000000000d2', 'student', 'approved', now() - interval '20 days');

-- 友だち状態：反映、順序の入れ替わり、不正な入力
select public.apply_friend_event('U11111111111111111111111111111111', 'friend', '2026-10-10T00:00:00Z');
select is((select friend_status from public.line_accounts where user_id = '00000000-0000-0000-0000-0000000000d1'), 'friend', 'follow で友だちになる');
select public.apply_friend_event('U11111111111111111111111111111111', 'blocked', '2026-10-11T00:00:00Z');
select is((select friend_status from public.line_accounts where user_id = '00000000-0000-0000-0000-0000000000d1'), 'blocked', 'unfollow でブロック中になる');
select public.apply_friend_event('U11111111111111111111111111111111', 'friend', '2026-10-10T12:00:00Z');
select is((select friend_status from public.line_accounts where user_id = '00000000-0000-0000-0000-0000000000d1'), 'blocked', '古い出来事（順序の入れ替わり）では上書きしない');
select throws_ok($$select public.apply_friend_event('Uzzzz', 'friend', now())$$, 'P0001', 'invalid_event', '不正な LINE ユーザー ID は受け付けない');
select throws_ok($$select public.apply_friend_event('U11111111111111111111111111111111', 'x', now())$$, 'P0001', 'invalid_event', '不正な状態は受け付けない');

-- ログインより先に友だち追加された人：line_accounts ができたとき引き継ぐ
select public.apply_friend_event('U22222222222222222222222222222222', 'friend', '2026-10-09T00:00:00Z');
insert into public.line_accounts (user_id, line_user_id) values ('00000000-0000-0000-0000-0000000000d2', 'U22222222222222222222222222222222');
select is((select friend_status from public.line_accounts where user_id = '00000000-0000-0000-0000-0000000000d2'), 'friend', '先に友だち追加された状態を引き継ぐ');
select is((select friend_status from public.line_accounts where user_id = '00000000-0000-0000-0000-0000000000d1' limit 1), 'blocked', '他の人の状態は変わらない');

-- 連絡の受け取り：本人だけが切り替えられ、止めた人にはアラートを出さない
update public.club_members set reviewed_at = now() - interval '20 days';
select private.generate_alerts(now());
select ok(exists (select 1 from public.alerts where student_id = '00000000-0000-0000-0000-0000000000d1' and kind = 'gap'), '記録が空いた生徒には、アラートが出る');

set local role authenticated;
do $$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d1"}', true); end $$;
select lives_ok($$select public.set_contact_allowed(false)$$, '本人は連絡を止められる');
select is((select contact_allowed from public.line_accounts), false, '止めた状態が記録される');
select throws_ok($$select public.set_contact_allowed(null)$$, 'P0001', 'invalid_value', 'null は受け付けない');
reset role;
select private.generate_alerts(now());
select is((select status from public.alerts where student_id = '00000000-0000-0000-0000-0000000000d1' and kind = 'gap' order by created_at desc limit 1), 'resolved', '止めた生徒の出ていたアラートは解消される');

set local role authenticated;
do $$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d2"}', true); end $$;
select throws_ok($$select * from public.line_friends$$, '42501', null, '生徒は友だち状態の記録を読めない');
select * from finish();
rollback;
