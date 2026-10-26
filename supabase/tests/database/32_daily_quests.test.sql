-- デイリークエストの達成記録とコイン（1つ3コイン、その日の分を全部達成でさらに5）
begin;
select plan(33);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000ab11', 'q1@example.test'),
  ('00000000-0000-0000-0000-00000000ab12', 'q2@example.test'),
  ('00000000-0000-0000-0000-00000000ab19', 'q9@example.test'),
  ('00000000-0000-0000-0000-00000000ab10', 'q0@example.test');
insert into public.users (id, role, display_name, grade) values
  ('00000000-0000-0000-0000-00000000ab11', 'student', 'タスクのある子', 8),
  ('00000000-0000-0000-0000-00000000ab12', 'student', 'タスクのない子', 8),
  ('00000000-0000-0000-0000-00000000ab19', 'club_admin', '［管理者名］', null),
  ('00000000-0000-0000-0000-00000000ab10', 'operator', '運営', null);
insert into public.clubs (id, name) values ('11111111-1111-1111-1111-1111111ab101', '［クラブ名］Q');
insert into public.club_members (club_id, user_id, member_role, status) values
  ('11111111-1111-1111-1111-1111111ab101', '00000000-0000-0000-0000-00000000ab11', 'student', 'approved'),
  ('11111111-1111-1111-1111-1111111ab101', '00000000-0000-0000-0000-00000000ab12', 'student', 'approved'),
  ('11111111-1111-1111-1111-1111111ab101', '00000000-0000-0000-0000-00000000ab19', 'club_admin', 'approved');
insert into public.tasks (id, club_id, title, subject, kind, reward_coins) values
  ('22222222-2222-2222-2222-2222222ab101', '11111111-1111-1111-1111-1111111ab101', '英語 配信', '英語', 'assigned', 10);
insert into public.user_tasks (id, task_id, student_id, task_date) values
  ('33333333-3333-3333-3333-3333333ab101', '22222222-2222-2222-2222-2222222ab101', '00000000-0000-0000-0000-00000000ab11', private.jst_today());

------------------------------------------------------------------------------
-- 1. 配信タスクのない生徒：クエストは2つだけ
------------------------------------------------------------------------------
select is((select count(*)::int from private.quest_state('00000000-0000-0000-0000-00000000ab12', private.jst_today()) q where q.applicable), 2,
  '今日の配信タスクがなければ、クエストは2つ');
select is((select count(*)::int from private.quest_state('00000000-0000-0000-0000-00000000ab11', private.jst_today()) q where q.applicable), 3,
  '配信タスクがあれば3つ');

------------------------------------------------------------------------------
-- 2. 1教科だけでは、まだどれも達成しない
------------------------------------------------------------------------------
set local role authenticated;
do $$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000ab12"}', true); end $$;
select is(jsonb_array_length(public.record_study_tag('数学') -> 'new_quests'), 0, '1教科では、まだ達成しない');
select is((select balance from public.coin_balances where student_id = '00000000-0000-0000-0000-00000000ab12'), 1,
  'コインは学習した日の1だけ');

------------------------------------------------------------------------------
-- 3. 2教科で「2教科を記録」を達成し、3コイン付く
------------------------------------------------------------------------------
select is((public.record_study_tag('国語') -> 'new_quests' -> 0 ->> 'key'), 'subjects', '2教科目で「2教科」を達成');
select is((public.record_study_tag('理科') -> 'new_quests')::text, '[]', '3教科目では、新しい達成はない');
select is((select balance from public.coin_balances where student_id = '00000000-0000-0000-0000-00000000ab12'), 4,
  '学習した日 1 + クエスト 3');
select is((select coins::int from public.quest_achievements
            where student_id = '00000000-0000-0000-0000-00000000ab12' and quest_key = 'subjects'), 3,
  '達成の記録にコインが残る');
select is((select count(*)::int from public.quest_achievements where student_id = '00000000-0000-0000-0000-00000000ab12'), 1,
  'まだ「全部達成」はしていない');
reset role;

------------------------------------------------------------------------------
-- 4. 15分のタイマーで「合計15分」を達成し、2つ揃って全部達成になる
------------------------------------------------------------------------------
set local role authenticated;
do $$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000ab12"}', true); end $$;
select lives_ok($$select public.start_study_timer('社会')$$, 'タイマーを始める');
reset role;
update public.study_records set started_at = now() - interval '16 minutes'
 where student_id = '00000000-0000-0000-0000-00000000ab12' and ended_at is null;
set local role authenticated;
do $$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000ab12"}', true); end $$;
select lives_ok($$select public.stop_study_timer()$$, 'タイマーを終える');
select is((select array_agg(quest_key order by quest_key)::text from public.quest_achievements
            where student_id = '00000000-0000-0000-0000-00000000ab12'), '{all,minutes,subjects}',
  '「15分」と「全部達成」が増える');
select is((select balance from public.coin_balances where student_id = '00000000-0000-0000-0000-00000000ab12'), 12,
  '学習した日 1 + クエスト 3×2 + 全部達成 5');
select is((select coins::int from public.quest_achievements
            where student_id = '00000000-0000-0000-0000-00000000ab12' and quest_key = 'all'), 5,
  '全部達成は5コイン');
reset role;

------------------------------------------------------------------------------
-- 5. 二重に付かない
------------------------------------------------------------------------------
set local role authenticated;
do $$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000ab12"}', true); end $$;
select is((public.record_study_tag('英語') -> 'new_quests')::text, '[]', '同じ日に何度記録しても、新しい達成はない');
select is((select balance from public.coin_balances where student_id = '00000000-0000-0000-0000-00000000ab12'), 12,
  'コインも増えない');
select is((select count(*)::int from public.coin_transactions
            where student_id = '00000000-0000-0000-0000-00000000ab12' and reason in ('daily_quest', 'quest_bonus')), 3,
  'クエストの台帳は3行のまま');
reset role;

------------------------------------------------------------------------------
-- 6. 配信タスクのある生徒：3つ揃ってはじめて全部達成になる
------------------------------------------------------------------------------
set local role authenticated;
do $$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000ab11"}', true); end $$;
select is((public.complete_task('33333333-3333-3333-3333-3333333ab101') -> 'new_quests' -> 0 ->> 'key'), 'assigned',
  '配信タスクの完了で「配信タスクを1つ完了」を達成');
select is((select count(*)::int from public.quest_achievements where student_id = '00000000-0000-0000-0000-00000000ab11'), 1,
  '3つ揃っていないので、全部達成はまだ');
select is((public.record_study_tag('数学') -> 'new_quests' -> 0 ->> 'key'), 'subjects', '2教科目で「2教科」も達成');
select is((select count(*)::int from public.quest_achievements
            where student_id = '00000000-0000-0000-0000-00000000ab11' and quest_key = 'all'), 0,
  '「15分」がまだなので、全部達成にはならない');
select is((select balance from public.coin_balances where student_id = '00000000-0000-0000-0000-00000000ab11'), 17,
  '学習した日 1 + 配信タスク 10 + クエスト 3×2');
reset role;

------------------------------------------------------------------------------
-- 7. 日が変わると、また達成できる
------------------------------------------------------------------------------
insert into public.quest_achievements (club_id, student_id, quest_date, quest_key, coins) values
  ('11111111-1111-1111-1111-1111111ab101', '00000000-0000-0000-0000-00000000ab11', private.jst_today() - 1, 'subjects', 3);
select is((select count(*)::int from public.quest_achievements where student_id = '00000000-0000-0000-0000-00000000ab11'), 3,
  '昨日の達成は別の行として残る');
select throws_ok($$
  insert into public.quest_achievements (club_id, student_id, quest_date, quest_key, coins)
  values ('11111111-1111-1111-1111-1111111ab101', '00000000-0000-0000-0000-00000000ab11', private.jst_today(), 'subjects', 3)$$,
  '23505', null, '同じ日の同じクエストは1行だけ');

------------------------------------------------------------------------------
-- 8. 生徒の画面：達成履歴
------------------------------------------------------------------------------
set local role authenticated;
do $$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000ab11"}', true); end $$;
select is((select count(*)::int from public.my_quest_history(private.jst_today() - 7, private.jst_today())), 2,
  '履歴は日ごとに1行（昨日と今日）');
select is((select coins from public.my_quest_history(private.jst_today(), private.jst_today())), 6,
  '今日のクエストのコインは合計6');
select is((select keys::text from public.my_quest_history(private.jst_today(), private.jst_today())), '{assigned,subjects}',
  '達成したクエストの種類が並ぶ');
select is((select count(*)::int from public.quest_achievements), 3, '生徒には自分の達成だけが見える');
reset role;

------------------------------------------------------------------------------
-- 9. 見える範囲：クラブ管理者には見せない、運営には見せる
------------------------------------------------------------------------------
set local role authenticated;
do $$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000ab19"}', true); end $$;
select is((select count(*)::int from public.quest_achievements), 0, 'クラブ管理者にクエストの達成は見えない');
reset role;

set local role authenticated;
do $$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000ab10"}', true); end $$;
select ok((select count(*) from public.quest_achievements) >= 4, '運営には全員の達成が見える');
reset role;

------------------------------------------------------------------------------
-- 10. 作り：匿名からは触れない
------------------------------------------------------------------------------
select is(has_table_privilege('anon', 'public.quest_achievements', 'select'), false, 'anon は達成を読めない');
select is(has_function_privilege('anon', 'public.my_quest_history(date,date)', 'execute'), false, 'anon は履歴を呼べない');
select is(has_function_privilege('authenticated', 'private.evaluate_quests(uuid,uuid,date)', 'execute'), false,
  '判定の本体は authenticated から呼べない');

select * from finish();
rollback;
