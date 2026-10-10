-- 15分集中モード：一時停止・達成・途中終了・ボーナス（1 日 1 回）
begin;
select plan(16);

insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000d1', 'd1@example.test');
insert into public.users (id, role, display_name, grade) values ('00000000-0000-0000-0000-0000000000d1', 'student', 'd1', 7);
insert into public.clubs (id, name) values ('11111111-1111-1111-1111-1111111111d1', '［クラブ名］D');
insert into public.club_members (club_id, user_id, member_role, status) values
  ('11111111-1111-1111-1111-1111111111d1', '00000000-0000-0000-0000-0000000000d1', 'student', 'approved');

set local role authenticated;
do $$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d1"}', true); end $$;

-- 1 回目：一時停止をはさんで 15 分に届く
select lives_ok($$select public.start_focus_session('数学')$$, '集中モードを始められる');
select throws_ok($$select public.start_focus_session('英語')$$, 'P0001', 'timer_already_running', '同時に 1 つだけ');
select lives_ok($$select public.pause_focus_session()$$, '一時停止できる');
reset role;
-- 開始 20 分前、うち 5 分は一時停止していた、という状態にする
update public.study_records set started_at = now() - interval '20 minutes', paused_at = now() - interval '5 minutes'
 where student_id = '00000000-0000-0000-0000-0000000000d1';
set local role authenticated;
do $$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d1"}', true); end $$;
select lives_ok($$select public.resume_focus_session()$$, '再開できる');
select is((select paused_seconds from public.study_records where ended_at is null), 300, '一時停止していた 5 分が積まれる');
select is((select paused_at is null from public.study_records where ended_at is null), true, '再開すると停止中ではなくなる');
select throws_ok($$select public.stop_study_timer(10)$$, 'P0001', 'invalid_minutes', '集中モードは分数を直せない');

select is((public.stop_study_timer() ->> 'focus_achieved')::boolean, true, '一時停止を除いて 15 分に届けば達成');
select is((select duration_seconds from public.study_records where focus_achieved), 900, '記録の時間は目標の 15 分まで');
select is((select balance from public.coin_balances), 6, 'コイン：記録 1 + 達成ボーナス 5（［仮］）');

-- 2 回目：同じ日の達成ボーナスは付かない
select lives_ok($$select public.start_focus_session('国語')$$, '2 回目を始める');
reset role;
update public.study_records set started_at = now() - interval '16 minutes' where ended_at is null;
set local role authenticated;
do $$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d1"}', true); end $$;
select is((public.stop_study_timer() ->> 'focus_bonus')::int, 0, '達成ボーナスは 1 日 1 回');
select is((select balance from public.coin_balances), 6, 'コインは増えない');

-- 途中で終える：経過した時間は残り、達成にはならない
select lives_ok($$select public.start_focus_session('理科', '電流')$$, '内容つきで始める');
reset role;
update public.study_records set started_at = now() - interval '7 minutes' where ended_at is null;
set local role authenticated;
do $$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d1"}', true); end $$;
select is((select d between 419 and 421 from (select (public.stop_study_timer() ->> 'duration_seconds')::int as d) x), true, '途中で終えると経過した 7 分が残る');
select is((select count(*)::int from public.study_records where focus_achieved is false), 1, '途中終了は達成にならない');

select * from finish();
rollback;
