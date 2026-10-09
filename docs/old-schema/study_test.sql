-- 勉強タイマーの受入テスト（phase1_test.sql のあとに、同じ DB で流す）
set client_min_messages = notice;
\set op  '00000000-0000-0000-0000-0000000000a1'
\set ca1 '00000000-0000-0000-0000-0000000000a2'
\set s1  '00000000-0000-0000-0000-0000000000b1'
\set s2  '00000000-0000-0000-0000-0000000000b2'
select id as s1_id, club_id as club_a from users where line_user_id = 'Uline1' \gset
select coin_balance as coins_before from users where line_user_id = 'Uline1' \gset

-- スライドで始め、スライドで終える ------------------------------------------------
select test.at('2026-10-22 16:00+09');
select test.as_user(:'s1', null, 'Uline1');
set role authenticated;
select test.ok(study_status() -> 'active' = 'null'::jsonb, '始める前は動いていない');
select start_study('22222222-2222-2222-2222-222222222222') -> 'active' ->> 'id' as sess1 \gset
select test.ok(start_study(gen_random_uuid()) -> 'active' ->> 'id' = :'sess1', '動いている間に始めても、同じタイマーを続ける');
select test.ok((select count(*) from focus_sessions) = 0, '生徒は勉強の記録を表から直接は読めない（RPC で返す）');
select test.at('2026-10-22 16:05+09');
select test.ok((study_heartbeat(:'sess1') ->> 'active')::boolean, '画面が開いている間は続く');
select test.at('2026-10-22 16:12+09');
select study_heartbeat(:'sess1');
select test.at('2026-10-22 16:19+09');
select study_heartbeat(:'sess1');
select test.at('2026-10-22 16:20+09');
select end_study(:'sess1') as r1 \gset
select test.ok((:'r1'::jsonb ->> 'seconds')::int = 1200, 'スライドで終えると、始めてからの時間を記録する（20分）');
select test.ok((:'r1'::jsonb ->> 'coins')::int = 5, '15分たまると1ブロックの報酬');
select test.ok((:'r1'::jsonb ->> 'started_time') = '16:00' and (:'r1'::jsonb ->> 'ended_time') = '16:20', '始めた時刻と終えた時刻が残る');
select test.ok((end_study(:'sess1') ->> 'already')::boolean, '二度目の終了は記録しなおさない');
select test.ok(study_status() -> 'pending_result' = 'null'::jsonb, '自分で終えた記録は、あとで見せなおさない');
reset role;
select test.ok((select coin_balance - :coins_before from users where id = :'s1_id') = 5, 'コインは1回だけ');

-- 1日の合計で数える（10分＋20分で2ブロック目）
select test.at('2026-10-22 16:30+09');
select test.as_user(:'s1', null, 'Uline1');
set role authenticated;
select start_study(gen_random_uuid()) -> 'active' ->> 'id' as sess2 \gset
select test.at('2026-10-22 16:36+09');
select study_heartbeat(:'sess2');
select test.at('2026-10-22 16:40+09');
select test.ok((end_study(:'sess2') ->> 'coins')::int = 5, '1日の合計が30分で2ブロック目の報酬');
select test.ok((study_status() -> 'today' ->> 'seconds')::int = 1800, '今日の勉強時間は合計で返す');

-- アプリを閉じたとき
select test.at('2026-10-22 17:00+09');
select start_study(gen_random_uuid()) -> 'active' ->> 'id' as sess3 \gset
select test.at('2026-10-22 17:04+09');
select test.ok(end_study(:'sess3', 'app_closed') ->> 'end_reason' = 'app_closed', 'アプリを閉じると、その時刻で止める');
select test.ok(study_status() -> 'pending_result' ->> 'id' = :'sess3', '閉じて止まった記録は、次に開いたときに見せる');
select ack_study(:'sess3');
select test.ok(study_status() -> 'pending_result' = 'null'::jsonb, '見たあとは出さない');

-- 画面が開いていない時間が続いたとき（閉じた合図が届かなかった場合）
select test.at('2026-10-22 18:00+09');
select start_study(gen_random_uuid()) -> 'active' ->> 'id' as sess4 \gset
select test.at('2026-10-22 18:05+09');
select study_heartbeat(:'sess4');
select test.at('2026-10-22 18:12+09');
select test.ok(study_status() -> 'active' ->> 'id' = :'sess4', '画面が消えて10分までは続く');
select test.at('2026-10-22 18:30+09');
select test.ok(study_status() -> 'pending_result' ->> 'end_reason' = 'idle', '10分を超えると、閉じたとみなして止める');
select test.ok((study_status() -> 'pending_result' ->> 'ended_time') = '18:05', '止めるのは最後に画面が開いていた時刻');
select test.ok(not (study_heartbeat(:'sess4') ->> 'active')::boolean, '止まったタイマーは続かない');
select ack_study(:'sess4');

-- 消し忘れ防止（開いたままでも上限で止まる）
select test.at('2026-10-22 19:00+09');
select start_study(gen_random_uuid()) -> 'active' ->> 'id' as sess5 \gset
do $$
declare t timestamptz;
begin
  for t in select generate_series('2026-10-22 19:05+09'::timestamptz, '2026-10-22 21:00+09'::timestamptz, interval '5 minutes') loop
    perform test.at(t::text);
    perform study_heartbeat((select (study_status() -> 'active' ->> 'id')::uuid));
  end loop;
end $$;
select test.at('2026-10-22 21:03+09');
select study_status() -> 'pending_result' as r5 \gset
select test.ok(:'r5'::jsonb ->> 'end_reason' = 'time_limit', '2時間たつと自動で止まる');
select test.ok((:'r5'::jsonb ->> 'seconds')::int = 7200, '記録は上限の2時間まで');
select test.ok((study_status() -> 'today' ->> 'blocks')::int = 8, '1日の報酬は8ブロックまで');
reset role;
select test.ok((select coin_balance - :coins_before from users where id = :'s1_id') = 40, '勉強時間の報酬は1日40コインまで');
select test.ok((select study_seconds from daily_activity where user_id = :'s1_id' and activity_date = '2026-10-22') = 1800 + 240 + 300 + 7200,
               '日別の記録に勉強時間を積む');

-- 定時処理が止め忘れを止める
select test.at('2026-10-23 07:00+09');
select test.as_user(:'s1', null, 'Uline1');
set role authenticated;
select start_study(gen_random_uuid());
reset role;
select test.at('2026-10-23 09:30+09');
select test.ok(nobit_sweep_study(null) = 1, '定時処理が、閉じたまま残ったタイマーを止める');

-- 他の生徒のタイマーは止められない
select test.as_user(:'s2', null, 'Uline2');
set role authenticated;
select test.expect_error(format('select end_study(%L)', :'sess1'), 'study_not_found');
reset role;

-- クラブ管理者には勉強時間を見せない（保護者同意の範囲外）
select test.as_user(:'ca1', 'ca1@example.com');
set role authenticated;
select test.ok((select count(*) from focus_sessions) = 0, 'クラブ管理者はタイマーの記録を読めない');
select test.expect_error('select study_seconds from daily_activity limit 1', 'permission denied');
select test.ok((select count(*) from daily_activity) > 0, '記録の帯に使う列は読める');
select test.ok(admin_student_detail(:'s1_id') -> 'focus_minutes_month' = 'null'::jsonb, '詳細でも勉強時間を返さない');
select test.ok(admin_student_detail(:'s1_id') -> 'coins' = 'null'::jsonb, '詳細でもコインを返さない');
select test.expect_error(format('select admin_study_today(%L)', :'club_a'), 'operator_only');
reset role;

select test.as_user(:'op', 'op@example.com');
set role authenticated;
select test.ok((admin_student_detail(:'s1_id') ->> 'focus_minutes_month')::int >= 158, '運営には今月の勉強時間を返す');
select test.ok(jsonb_array_length(admin_student_detail(:'s1_id') -> 'study_sessions') = 6, '運営にはタイマーの記録を返す');
select test.at('2026-10-22 22:00+09');
select test.ok((admin_study_today(:'club_a') -> :'s1_id' ->> 'seconds')::int = 9540, '運営の生徒一覧に今日の勉強時間を出す');
reset role;

select test.ok(not exists (
  select 1 from users u
   where u.coin_balance <> coalesce((select sum(amount) from coin_transactions t where t.user_id = u.id), 0)),
  'タイマーの報酬も含めて、残高は台帳の合計と一致する');
