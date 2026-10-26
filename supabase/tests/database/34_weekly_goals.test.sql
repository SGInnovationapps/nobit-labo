-- 週の学習目標（本人が3〜7日を選ぶ。達成した週はごほうびのガチャ1回）と、
-- ウィークリークエスト「同じ教科を週3日」（10コイン）
begin;
select plan(49);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000ac11', 'w1@example.test'),
  ('00000000-0000-0000-0000-00000000ac12', 'w2@example.test'),
  ('00000000-0000-0000-0000-00000000ac13', 'w3@example.test'),
  ('00000000-0000-0000-0000-00000000ac19', 'w9@example.test'),
  ('00000000-0000-0000-0000-00000000ac10', 'w0@example.test');
insert into public.users (id, role, display_name, grade) values
  ('00000000-0000-0000-0000-00000000ac11', 'student', '週の子1', 8),
  ('00000000-0000-0000-0000-00000000ac12', 'student', '週の子2', 8),
  ('00000000-0000-0000-0000-00000000ac13', 'student', '週の子3', 8),
  ('00000000-0000-0000-0000-00000000ac19', 'club_admin', '［管理者名］', null),
  ('00000000-0000-0000-0000-00000000ac10', 'operator', '運営', null);
insert into public.clubs (id, name) values ('11111111-1111-1111-1111-1111111ac101', '［クラブ名］W');
insert into public.club_members (club_id, user_id, member_role, status) values
  ('11111111-1111-1111-1111-1111111ac101', '00000000-0000-0000-0000-00000000ac11', 'student', 'approved'),
  ('11111111-1111-1111-1111-1111111ac101', '00000000-0000-0000-0000-00000000ac12', 'student', 'approved'),
  ('11111111-1111-1111-1111-1111111ac101', '00000000-0000-0000-0000-00000000ac13', 'student', 'approved'),
  ('11111111-1111-1111-1111-1111111ac101', '00000000-0000-0000-0000-00000000ac19', 'club_admin', 'approved');

-- 過去の決まった週で確かめる（2026-10-05 月 〜 10-11 日）
-- 生徒1：英語を月・火・水、数学を木、休息日（記録なし）の金
insert into public.daily_activity (club_id, student_id, activity_date, completed_count) values
  ('11111111-1111-1111-1111-1111111ac101', '00000000-0000-0000-0000-00000000ac11', '2026-10-05', 1),
  ('11111111-1111-1111-1111-1111111ac101', '00000000-0000-0000-0000-00000000ac11', '2026-10-06', 1),
  ('11111111-1111-1111-1111-1111111ac101', '00000000-0000-0000-0000-00000000ac11', '2026-10-07', 1),
  ('11111111-1111-1111-1111-1111111ac101', '00000000-0000-0000-0000-00000000ac11', '2026-10-08', 1),
  ('11111111-1111-1111-1111-1111111ac101', '00000000-0000-0000-0000-00000000ac11', '2026-10-09', 0);
insert into public.study_records (club_id, student_id, kind, subject, started_at, ended_at, record_date) values
  ('11111111-1111-1111-1111-1111111ac101', '00000000-0000-0000-0000-00000000ac11', 'tag', '英語', '2026-10-05 18:00+09', '2026-10-05 18:00+09', '2026-10-05'),
  ('11111111-1111-1111-1111-1111111ac101', '00000000-0000-0000-0000-00000000ac11', 'tag', '英語', '2026-10-06 18:00+09', '2026-10-06 18:00+09', '2026-10-06'),
  ('11111111-1111-1111-1111-1111111ac101', '00000000-0000-0000-0000-00000000ac11', 'tag', '数学', '2026-10-08 18:00+09', '2026-10-08 18:00+09', '2026-10-08');

------------------------------------------------------------------------------
-- 1. 目標の初期値と、週の行
------------------------------------------------------------------------------
select is((select weekly_target_days::int from public.users where id = '00000000-0000-0000-0000-00000000ac11'), 5,
  '目標の初期値は5日');
select is(private.evaluate_week('00000000-0000-0000-0000-00000000ac11', '11111111-1111-1111-1111-1111111ac101', '2026-10-08'),
  '{}'::jsonb, '4日・英語2日では、まだどれも達成しない');
select is((select target_days::int from public.weekly_progress
            where student_id = '00000000-0000-0000-0000-00000000ac11' and week_start = '2026-10-05'), 5,
  '週の行は本人の目標（5日）で作られる');
select is(private.week_study_days('00000000-0000-0000-0000-00000000ac11', '2026-10-05'), 4,
  '休息日（記録0）は学習した日に数えない');
select throws_ok($$insert into public.weekly_progress (student_id, club_id, week_start, target_days)
  values ('00000000-0000-0000-0000-00000000ac12', '11111111-1111-1111-1111-1111111ac101', '2026-10-06', 5)$$,
  '23514', null, '週の始まりは月曜だけ');

------------------------------------------------------------------------------
-- 2. 同じ教科を週3日：英語の3日目で10コイン
------------------------------------------------------------------------------
insert into public.study_records (club_id, student_id, kind, subject, started_at, ended_at, record_date) values
  ('11111111-1111-1111-1111-1111111ac101', '00000000-0000-0000-0000-00000000ac11', 'tag', '英語', '2026-10-07 18:00+09', '2026-10-07 18:00+09', '2026-10-07');
select is(private.evaluate_week('00000000-0000-0000-0000-00000000ac11', '11111111-1111-1111-1111-1111111ac101', '2026-10-08'),
  '{"subject_quest": {"subject": "英語", "coins": 10}}'::jsonb, '英語が3日になって、ウィークリーを達成');
select is((select sum(amount)::int from public.coin_transactions
            where student_id = '00000000-0000-0000-0000-00000000ac11' and reason = 'weekly_quest'), 10,
  '台帳に weekly_quest で10コイン');
select is(private.evaluate_week('00000000-0000-0000-0000-00000000ac11', '11111111-1111-1111-1111-1111111ac101', '2026-10-08'),
  '{}'::jsonb, 'もう一度判定しても、新しい達成はない');
select is((select count(*)::int from public.coin_transactions
            where student_id = '00000000-0000-0000-0000-00000000ac11' and reason = 'weekly_quest'), 1,
  'ウィークリーのコインは週1回');
select is((select subject_quest_subject from public.weekly_progress
            where student_id = '00000000-0000-0000-0000-00000000ac11' and week_start = '2026-10-05'), '英語',
  '達成した教科が残る');

------------------------------------------------------------------------------
-- 3. 5日目で週の目標を達成
------------------------------------------------------------------------------
insert into public.daily_activity (club_id, student_id, activity_date, completed_count) values
  ('11111111-1111-1111-1111-1111111ac101', '00000000-0000-0000-0000-00000000ac11', '2026-10-11', 2);
select is(private.evaluate_week('00000000-0000-0000-0000-00000000ac11', '11111111-1111-1111-1111-1111111ac101', '2026-10-11'),
  '{"goal": {"target_days": 5, "days": 5}}'::jsonb, '5日目で週の目標を達成');
select isnt((select goal_achieved_at from public.weekly_progress
              where student_id = '00000000-0000-0000-0000-00000000ac11' and week_start = '2026-10-05'), null,
  '達成の時刻が残る');
select is(private.evaluate_week('00000000-0000-0000-0000-00000000ac11', '11111111-1111-1111-1111-1111111ac101', '2026-10-11'),
  '{}'::jsonb, '達成は1回だけ返す');

------------------------------------------------------------------------------
-- 4. ごほうびのガチャ：翌週のうちに1回、コインなし・その日の記録なしで引ける
------------------------------------------------------------------------------
select is((private.draw_gacha_reward_at('00000000-0000-0000-0000-00000000ac11', '2026-10-14 07:00+09', 0.1, 0.0) ->> 'reward_week'),
  '2026-10-05', '先週の達成分を、翌週に引ける（その日の記録がなくても）');
select is((select reward_week::text from public.gacha_draws
            where student_id = '00000000-0000-0000-0000-00000000ac11' and drawn_on = '2026-10-14'), '2026-10-05',
  'ガチャの記録に、どの週のごほうびかが残る');
select is((select is_extra from public.gacha_draws
            where student_id = '00000000-0000-0000-0000-00000000ac11' and drawn_on = '2026-10-14'), false,
  'ごほうびは追加ガチャには数えない');
select is((select count(*)::int from public.coin_transactions
            where student_id = '00000000-0000-0000-0000-00000000ac11' and reason = 'gacha_extra'), 0,
  'コインは使わない');
select isnt((select reward_used_at from public.weekly_progress
              where student_id = '00000000-0000-0000-0000-00000000ac11' and week_start = '2026-10-05'), null,
  '使ったことが週の行に残る');
select is((select reward_draw_id from public.weekly_progress
            where student_id = '00000000-0000-0000-0000-00000000ac11' and week_start = '2026-10-05'),
  (select id from public.gacha_draws where student_id = '00000000-0000-0000-0000-00000000ac11' and drawn_on = '2026-10-14'),
  '引いたガチャと結びつく');
select throws_ok($$select private.draw_gacha_reward_at('00000000-0000-0000-0000-00000000ac11', '2026-10-14 08:00+09', 0.1, 0.0)$$,
  'P0001', 'no_weekly_reward', 'ごほうびは1週1回');

-- その日の無料ガチャは、ごほうびとは別に残る
insert into public.daily_activity (club_id, student_id, activity_date, completed_count) values
  ('11111111-1111-1111-1111-1111111ac101', '00000000-0000-0000-0000-00000000ac11', '2026-10-14', 1);
select lives_ok($$select private.draw_gacha_core('00000000-0000-0000-0000-00000000ac11', '2026-10-14 18:00+09', 0.1, 0.0, false)$$,
  'ごほうびを引いた日も、その日の無料ガチャは引ける');
select throws_ok($$select private.draw_gacha_core('00000000-0000-0000-0000-00000000ac11', '2026-10-14 19:00+09', 0.1, 0.0, false)$$,
  'P0001', 'already_drawn', '無料ガチャは今までどおり1日1回');

------------------------------------------------------------------------------
-- 5. 2週たったごほうびは引けない。タスクの教科も数える
------------------------------------------------------------------------------
insert into public.tasks (id, club_id, title, subject, kind, reward_coins) values
  ('22222222-2222-2222-2222-2222222ac101', '11111111-1111-1111-1111-1111111ac101', '数学 配信', '数学', 'assigned', 10);
insert into public.user_tasks (id, task_id, student_id, task_date, completed_at) values
  ('33333333-3333-3333-3333-3333333ac101', '22222222-2222-2222-2222-2222222ac101', '00000000-0000-0000-0000-00000000ac12', '2026-10-05', '2026-10-05 18:00+09'),
  ('33333333-3333-3333-3333-3333333ac102', '22222222-2222-2222-2222-2222222ac101', '00000000-0000-0000-0000-00000000ac12', '2026-10-06', '2026-10-06 18:00+09');
insert into public.study_records (club_id, student_id, kind, subject, started_at, ended_at, record_date) values
  ('11111111-1111-1111-1111-1111111ac101', '00000000-0000-0000-0000-00000000ac12', 'tag', '数学', '2026-10-06 19:00+09', '2026-10-06 19:00+09', '2026-10-06'),
  ('11111111-1111-1111-1111-1111111ac101', '00000000-0000-0000-0000-00000000ac12', 'tag', '数学', '2026-10-07 18:00+09', '2026-10-07 18:00+09', '2026-10-07');
insert into public.daily_activity (club_id, student_id, activity_date, completed_count) values
  ('11111111-1111-1111-1111-1111111ac101', '00000000-0000-0000-0000-00000000ac12', '2026-10-05', 1),
  ('11111111-1111-1111-1111-1111111ac101', '00000000-0000-0000-0000-00000000ac12', '2026-10-06', 2),
  ('11111111-1111-1111-1111-1111111ac101', '00000000-0000-0000-0000-00000000ac12', '2026-10-07', 1);
update public.users set weekly_target_days = 3 where id = '00000000-0000-0000-0000-00000000ac12';
select is(private.evaluate_week('00000000-0000-0000-0000-00000000ac12', '11111111-1111-1111-1111-1111111ac101', '2026-10-07'),
  '{"goal": {"target_days": 3, "days": 3}, "subject_quest": {"subject": "数学", "coins": 10}}'::jsonb,
  'タスク2日＋教科の記録（同じ日は1日）で数学3日。目標3日も達成');
select throws_ok($$select private.draw_gacha_reward_at('00000000-0000-0000-0000-00000000ac12', '2026-10-19 18:00+09', 0.1, 0.0)$$,
  'P0001', 'no_weekly_reward', '2週あとには、もう引けない');
select lives_ok($$select private.draw_gacha_reward_at('00000000-0000-0000-0000-00000000ac12', '2026-10-18 23:00+09', 0.1, 0.0)$$,
  '翌週の日曜までは引ける');

------------------------------------------------------------------------------
-- 6. 目標の日数を変える
------------------------------------------------------------------------------
set local role authenticated;
do $$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000ac13"}', true); end $$;
select throws_ok($$select public.set_weekly_target(2::smallint)$$, 'P0001', 'invalid_target', '2日は選べない');
select throws_ok($$select public.set_weekly_target(8::smallint)$$, 'P0001', 'invalid_target', '8日は選べない');
select is(public.set_weekly_target(3::smallint) ->> 'applies_from', 'this_week', '今週まだ記録がなければ、今週から変わる');
select is((public.my_week() ->> 'target_days')::int, 3, '今週の目標が3日になる');
select is((public.my_week() -> 'study_dates')::text, '[]', 'まだ学習した日はない');
select is(public.my_week() ->> 'reward_available', 'false', 'ごほうびはまだない');

select ok((public.record_study_tag('英語') -> 'new_week') = '{}'::jsonb, '記録の結果に new_week が付く（1日目は何もない）');
select is(public.set_weekly_target(7::smallint) ->> 'applies_from', 'next_week', '記録した週は、翌週から変わる');
select is((public.my_week() ->> 'target_days')::int, 3, '今週の目標は3日のまま');
select is((public.my_week() ->> 'next_target_days')::int, 7, '来週からは7日');
select is(jsonb_array_length(public.my_week() -> 'study_dates'), 1, '今日が学習した日に入る');
select is((public.my_week() -> 'subject_quest' ->> 'best_days')::int, 1, '同じ教科の日数は1');
select throws_ok($$select public.draw_gacha_reward()$$, 'P0001', 'no_weekly_reward', '達成していなければ、ごほうびは引けない');

-- 画面から週の行は書きかえられない
select throws_ok($$update public.weekly_progress set goal_achieved_at = now() where student_id = '00000000-0000-0000-0000-00000000ac13'$$,
  '42501', null, '週の行は画面から書きかえられない');
select throws_ok($$update public.users set weekly_target_days = 3 where id = '00000000-0000-0000-0000-00000000ac13'$$,
  '42501', null, '目標の日数は関数でだけ変える');
reset role;

------------------------------------------------------------------------------
-- 7. 見える範囲
------------------------------------------------------------------------------
set local role authenticated;
do $$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000ac11"}', true); end $$;
select is((select count(*)::int from public.weekly_progress), 1, '生徒は自分の週の行だけ見える');
select is((select count(*)::int from public.my_weekly_history('2026-10-01', '2026-10-31')), 1, '週の達成履歴');
select is((select goal_achieved from public.my_weekly_history('2026-10-01', '2026-10-31')), true, '履歴に達成が出る');
select is((select study_days from public.my_weekly_history('2026-10-01', '2026-10-31')), 5, '履歴に学習した日数が出る');
do $$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000ac19"}', true); end $$;
select is((select count(*)::int from public.weekly_progress), 0, 'クラブ管理者には週の行を見せない');
do $$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000ac10"}', true); end $$;
select is((select count(*)::int from public.weekly_progress where club_id = '11111111-1111-1111-1111-1111111ac101'), 3,
  '運営は全員の週の行を見られる');
reset role;

select ok(not has_function_privilege('authenticated', 'private.evaluate_week(uuid, uuid, date)', 'execute'),
  '判定の本体は画面から呼べない');
select ok(not has_function_privilege('authenticated', 'private.draw_gacha_reward_at(uuid, timestamptz, double precision, double precision)', 'execute'),
  'ごほうびガチャの本体は画面から呼べない');
select ok(not has_table_privilege('anon', 'public.weekly_progress', 'select'), 'anon は週の行を読めない');

select * from finish();
rollback;
