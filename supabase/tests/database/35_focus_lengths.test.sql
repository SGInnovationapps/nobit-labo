-- 集中モードの長さ（15・25・50 分）と、長さに応じた達成ボーナス（1 日 1 回）
begin;
select plan(12);

insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000e5', 'e5@example.test');
insert into public.users (id, role, display_name, grade) values ('00000000-0000-0000-0000-0000000000e5', 'student', 'e5', 8);
insert into public.clubs (id, name) values ('11111111-1111-1111-1111-1111111111e5', '［クラブ名］E');
insert into public.club_members (club_id, user_id, member_role, status) values
  ('11111111-1111-1111-1111-1111111111e5', '00000000-0000-0000-0000-0000000000e5', 'student', 'approved');

select is(private.focus_bonus_coins(900), 5, '15 分は 5 コイン');
select is(private.focus_bonus_coins(1500), 8, '25 分は 8 コイン');
select is(private.focus_bonus_coins(3000), 15, '50 分は 15 コイン');
select is((select name from public.badge_defs where code = 'focus_first'), '集中チャレンジャー', 'バッジの名前は長さを問わない');

set local role authenticated;
do $$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e5"}', true); end $$;

select throws_ok($$select public.start_focus_session('数学', null, 30)$$, 'P0001', 'invalid_minutes', '15・25・50 分以外は始められない');

-- 長さを渡さなければ 15 分（古い画面の呼び方）
select lives_ok($$select public.start_focus_session('数学')$$, '長さを省くと 15 分で始まる');
select is((select focus_target_seconds from public.study_records where ended_at is null), 900, '目標は 900 秒');
select lives_ok($$select public.cancel_study_timer()$$, 'やめる');

-- 50 分を最後まで
select is((public.start_focus_session('英語', null, 50) ->> 'focus_target_seconds')::int, 3000, '50 分で始める');
reset role;
update public.study_records set started_at = now() - interval '51 minutes' where ended_at is null;
set local role authenticated;
do $$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e5"}', true); end $$;
select is((select (r ->> 'focus_bonus')::int * 10000 + (r ->> 'duration_seconds')::int from (select public.stop_study_timer() as r) x),
  15 * 10000 + 3000, '50 分の達成は 15 コイン、記録は 50 分');

-- 同じ日の 2 回目（25 分）は、達成してもボーナスなし
select lives_ok($$select public.start_focus_session('国語', null, 25)$$, '25 分で始める');
reset role;
update public.study_records set started_at = now() - interval '26 minutes' where ended_at is null;
set local role authenticated;
do $$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e5"}', true); end $$;
select is((public.stop_study_timer() ->> 'focus_bonus')::int, 0, '達成ボーナスは 1 日 1 回');

select * from finish();
rollback;
