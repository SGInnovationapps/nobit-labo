-- 運営のコイン調整と、操作履歴
begin;
select plan(28);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000ac01', 'a1@example.test'),
  ('00000000-0000-0000-0000-00000000ac09', 'a9@example.test'),
  ('00000000-0000-0000-0000-00000000ac00', 'a0@example.test');
insert into public.users (id, role, display_name, grade) values
  ('00000000-0000-0000-0000-00000000ac01', 'student', '生徒', 8),
  ('00000000-0000-0000-0000-00000000ac09', 'club_admin', '［管理者名］', null),
  ('00000000-0000-0000-0000-00000000ac00', 'operator', '運営', null);
insert into public.clubs (id, name) values ('11111111-1111-1111-1111-1111111ac001', '［クラブ名］A');
insert into public.club_members (club_id, user_id, member_role, status) values
  ('11111111-1111-1111-1111-1111111ac001', '00000000-0000-0000-0000-00000000ac01', 'student', 'approved'),
  ('11111111-1111-1111-1111-1111111ac001', '00000000-0000-0000-0000-00000000ac09', 'club_admin', 'approved');
-- 生徒にコインを 20 持たせる
insert into public.coin_transactions (club_id, student_id, amount, reason, source_type, source_id, granted_on)
values ('11111111-1111-1111-1111-1111111ac001', '00000000-0000-0000-0000-00000000ac01', 20, 'task_complete', 'user_task', gen_random_uuid(), private.jst_today());

------------------------------------------------------------------------------
-- 1. 呼べる人
------------------------------------------------------------------------------
set local role authenticated;
do $$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000ac01"}', true); end $$;
select throws_ok($$select public.adjust_student_coins('00000000-0000-0000-0000-00000000ac01', 5, 'じぶんで足す')$$,
  'P0001', 'forbidden', '生徒は自分のコインを足せない');
reset role;

set local role authenticated;
do $$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000ac09"}', true); end $$;
select throws_ok($$select public.adjust_student_coins('00000000-0000-0000-0000-00000000ac01', 5, 'クラブから')$$,
  'P0001', 'forbidden', 'クラブ管理者も調整できない');
select throws_ok($$select * from public.student_admin_actions('00000000-0000-0000-0000-00000000ac01')$$,
  'P0001', 'forbidden', 'クラブ管理者は操作履歴を読めない');
select is((select count(*)::int from public.admin_actions), 0, 'クラブ管理者に履歴の行は見えない');
reset role;

------------------------------------------------------------------------------
-- 2. 入力の確かめ
------------------------------------------------------------------------------
set local role authenticated;
do $$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000ac00"}', true); end $$;
select throws_ok($$select public.adjust_student_coins('00000000-0000-0000-0000-00000000ac01', 0, '理由')$$,
  'P0001', 'invalid_amount', '0 は調整にならない');
select throws_ok($$select public.adjust_student_coins('00000000-0000-0000-0000-00000000ac01', 1001, '理由')$$,
  'P0001', 'amount_too_large', '一度に動かせるのは 1000 まで');
select throws_ok($$select public.adjust_student_coins('00000000-0000-0000-0000-00000000ac01', 5, '  ')$$,
  'P0001', 'note_required', '理由は必ず書く');
select throws_ok($$select public.adjust_student_coins('00000000-0000-0000-0000-00000000ac01', 5, repeat('あ', 201))$$,
  'P0001', 'note_required', '理由は 200 文字まで');
select throws_ok($$select public.adjust_student_coins('00000000-0000-0000-0000-00000000ac00', 5, '運営に足す')$$,
  'P0001', 'student_not_found', '生徒でない人には足せない');
select throws_ok($$select public.adjust_student_coins('00000000-0000-0000-0000-00000000ac01', -21, '引きすぎ')$$,
  'P0001', 'balance_would_be_negative', '残高をマイナスにはできない');

------------------------------------------------------------------------------
-- 3. 足す・引く
------------------------------------------------------------------------------
select is((public.adjust_student_coins('00000000-0000-0000-0000-00000000ac01', 10, 'ガチャの不具合のお詫び') ->> 'balance')::int, 30,
  '足すと残高が増える');
select is((select balance from public.coin_balances where student_id = '00000000-0000-0000-0000-00000000ac01'), 30,
  '台帳の合計も 30');
select is((public.adjust_student_coins('00000000-0000-0000-0000-00000000ac01', -5, '二重に付いた分を戻す') ->> 'balance')::int, 25,
  '引くと残高が減る');
select is((select balance from public.coin_balances where student_id = '00000000-0000-0000-0000-00000000ac01'), 25,
  '台帳の合計も 25');
select is((select count(*)::int from public.coin_transactions
            where student_id = '00000000-0000-0000-0000-00000000ac01' and reason = 'admin_adjust'), 2,
  '台帳に調整が 2 行残る');
select is((select sum(amount)::int from public.coin_transactions
            where student_id = '00000000-0000-0000-0000-00000000ac01' and reason = 'admin_adjust'), 5,
  '調整の合計は +5');
select is((public.adjust_student_coins('00000000-0000-0000-0000-00000000ac01', -25, '全部戻す') ->> 'balance')::int, 0,
  'ちょうど 0 にはできる');
select is((public.adjust_student_coins('00000000-0000-0000-0000-00000000ac01', 25, '戻しすぎたので返す') ->> 'balance')::int, 25,
  '戻せる');

------------------------------------------------------------------------------
-- 4. 操作履歴
------------------------------------------------------------------------------
select is((select count(*)::int from public.student_admin_actions('00000000-0000-0000-0000-00000000ac01')), 4,
  '調整の数だけ履歴が残る');
select is((select note from public.student_admin_actions('00000000-0000-0000-0000-00000000ac01', 1)), '戻しすぎたので返す',
  '新しい順に出る');
select is((select (detail ->> 'amount')::int from public.student_admin_actions('00000000-0000-0000-0000-00000000ac01', 1)), 25,
  '動かした額が残る');
select is((select actor_name from public.student_admin_actions('00000000-0000-0000-0000-00000000ac01', 1)), '運営',
  'だれが行ったかが残る');
select is((select count(*)::int from public.recent_admin_actions(30)), 4, '全体の履歴にも出る');
select is((select student_name from public.recent_admin_actions(30) limit 1), '生徒', '全体の履歴には生徒の名前も出る');
select is((select count(*)::int from public.recent_admin_actions(0)), 4, '日数が 0 でも 1 日として扱う');
reset role;

------------------------------------------------------------------------------
-- 5. 履歴は書き換えられない
------------------------------------------------------------------------------
set local role authenticated;
do $$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000ac00"}', true); end $$;
select throws_ok($$update public.admin_actions set note = 'すりかえ'$$, '42501', null, '運営でも履歴は書き換えられない');
select throws_ok($$delete from public.admin_actions$$, '42501', null, '運営でも履歴は消せない');
reset role;

select is(has_table_privilege('anon', 'public.admin_actions', 'select'), false, 'anon は履歴を読めない');

select * from finish();
rollback;
