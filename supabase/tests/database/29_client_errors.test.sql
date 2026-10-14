-- 画面のエラーの記録：送る・まとめる・伏せる・送りすぎを止める・運営だけが読む・古い記録を消す
begin;
select plan(24);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000e1', 'e1@example.test'),
  ('00000000-0000-0000-0000-0000000000e2', 'e2@example.test'),
  ('00000000-0000-0000-0000-0000000000e9', 'e9@example.test');
insert into public.users (id, role, display_name, grade) values
  ('00000000-0000-0000-0000-0000000000e1', 'student', '生徒E1', 8),
  ('00000000-0000-0000-0000-0000000000e2', 'club_admin', '［管理者名］', null),
  ('00000000-0000-0000-0000-0000000000e9', 'operator', '［運営］', null);
insert into public.clubs (id, name) values ('11111111-1111-1111-1111-1111111111e0', '［クラブ名］E');
insert into public.club_members (club_id, user_id, member_role, status) values
  ('11111111-1111-1111-1111-1111111111e0', '00000000-0000-0000-0000-0000000000e1', 'student', 'pending'),
  ('11111111-1111-1111-1111-1111111111e0', '00000000-0000-0000-0000-0000000000e2', 'club_admin', 'approved');

-- ===== ログイン前（anon）=====
set local role anon;
select lives_ok($$select public.log_client_error('student', 'error',
  'LINE login failed: token eyJhbGciOiJIUzI1NiJ9abcdefghijkl.eyJzdWIiOiIxMjM0NTY3ODkwIn0x.SflKxwRJSMeKKF2QT4fwpM for a@b.example',
  null, '/?liff.state=%2Finvite%3Dabc&code=xyz#access_token=zzz', 'iOS 18.1 · LINE 15.2.0', '2026-10-15')$$,
  'ログイン前でも送れる');
select is(has_table_privilege('anon', 'public.client_errors', 'select'), false, 'anon は表を読めない');
select is(has_function_privilege('anon', 'public.recent_client_errors(integer)', 'execute'), false, 'anon は一覧を呼べない');
reset role;

select is((select count(*)::int from public.client_errors where user_id is null), 1, 'ログイン前の分が1行入る');
select is((select path from public.client_errors where user_id is null), '/', 'パスは ? と # 以降を捨てる');
select ok((select message from public.client_errors where user_id is null) not like '%eyJ%', 'トークンらしい長い英数字は伏せる');
select ok((select message from public.client_errors where user_id is null) like '%[mail]%', 'メールアドレスは伏せる');

-- ===== 生徒（承認待ち）=====
set local role authenticated;
do $$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e1"}', true); end $$;
select lives_ok($$select public.log_client_error('student', 'handled', 'TypeError: x is undefined', 'at Home', '/', 'Android 14 · LINE 15.1.0', 'abc1234')$$,
  '生徒が送れる');
select lives_ok($$select public.log_client_error('student', 'handled', 'TypeError: x is undefined', 'at Home', '/', 'Android 14 · LINE 15.1.0', 'abc1234')$$,
  '同じエラーをもう一度送れる');
select throws_ok($$select public.log_client_error('other', 'error', 'x')$$, 'P0001', 'invalid_app', 'app の値を確かめる');
select throws_ok($$select public.log_client_error('student', 'boom', 'x')$$, 'P0001', 'invalid_kind', 'kind の値を確かめる');
select lives_ok($$select public.log_client_error('student', 'error', '   ')$$, '空の文面は黙って捨てる');
select is((select count(*)::int from public.client_errors), 0, '生徒は表を読めない（RLS）');
select throws_ok('select * from public.recent_client_errors()', 'P0001', 'forbidden', '生徒は一覧を呼べない');
reset role;

select is((select count(*)::int from public.client_errors where user_id = '00000000-0000-0000-0000-0000000000e1'), 1,
  '同じエラーは10分以内なら1行にまとめる');
select is((select repeats from public.client_errors where user_id = '00000000-0000-0000-0000-0000000000e1'), 2, 'まとめた回数を数える');
select is((select club_id from public.client_errors where user_id = '00000000-0000-0000-0000-0000000000e1'),
  '11111111-1111-1111-1111-1111111111e0'::uuid, '承認待ちでもクラブを結びつける');

-- 送りすぎ：1人1時間30件まで（すでに1件ある）
set local role authenticated;
do $$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e1"}', true); end $$;
select public.log_client_error('student', 'error', 'loop ' || n) from generate_series(1, 40) as n;
reset role;
select is((select count(*)::int from public.client_errors where user_id = '00000000-0000-0000-0000-0000000000e1'), 30,
  '1人1時間30件で止める');

-- ===== クラブ管理者と運営 =====
set local role authenticated;
do $$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e2"}', true); end $$;
select throws_ok('select * from public.recent_client_errors()', 'P0001', 'forbidden', 'クラブ管理者は一覧を呼べない');
select is((select count(*)::int from public.client_errors), 0, 'クラブ管理者は表を読めない');

do $$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e9"}', true); end $$;
select is((select count(*)::int from public.recent_client_errors()), 31, '運営は一覧を読める');
select is((select display_name from public.recent_client_errors() where message = 'TypeError: x is undefined'), '生徒E1',
  '一覧に表示名が付く');
reset role;

-- ===== 古い記録を消す =====
insert into public.client_errors (user_id, app, kind, message, occurred_at, last_at) values
  ('00000000-0000-0000-0000-0000000000e2', 'admin', 'error', 'old signed-in', now() - interval '31 days', now() - interval '31 days'),
  (null, 'student', 'error', 'old anon', now() - interval '8 days', now() - interval '8 days');
select public.log_client_error('admin', 'error', 'trigger cleanup');
select is((select count(*)::int from public.client_errors where message in ('old signed-in', 'old anon')), 0,
  '30日（ログイン前は7日）を過ぎた記録を消す');

-- 生徒を削除すると、その生徒の記録も消える
delete from auth.users where id = '00000000-0000-0000-0000-0000000000e1';
select is((select count(*)::int from public.client_errors where message like 'loop %'), 0, '生徒を削除すると記録も消える');

select * from finish();
rollback;
