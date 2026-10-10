-- 教科タグ・タイマー・コイン台帳・連続記録の共通化・同意の版 2
begin;
select plan(35);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000c1', 'c1@example.test'),
  ('00000000-0000-0000-0000-0000000000c2', 'c2@example.test'),
  ('00000000-0000-0000-0000-0000000000c3', 'c3@example.test');
insert into public.users (id, role, display_name, grade) values
  ('00000000-0000-0000-0000-0000000000c1', 'student', 'c1', 7),
  ('00000000-0000-0000-0000-0000000000c2', 'student', 'c2', 8),
  ('00000000-0000-0000-0000-0000000000c3', 'club_admin', '［管理者名］', null);
insert into public.clubs (id, name, allow_free_tasks) values ('11111111-1111-1111-1111-1111111111c1', '［クラブ名］C', true);
insert into public.club_members (club_id, user_id, member_role, status) values
  ('11111111-1111-1111-1111-1111111111c1', '00000000-0000-0000-0000-0000000000c1', 'student', 'approved'),
  ('11111111-1111-1111-1111-1111111111c1', '00000000-0000-0000-0000-0000000000c2', 'student', 'approved'),
  ('11111111-1111-1111-1111-1111111111c1', '00000000-0000-0000-0000-0000000000c3', 'club_admin', 'approved');
insert into public.tasks (id, club_id, title, subject, reward_coins) values
  ('22222222-2222-2222-2222-2222222222c1', '11111111-1111-1111-1111-1111111111c1', '英語 配信', '英語', 10);
insert into public.user_tasks (id, task_id, student_id, task_date) values
  ('33333333-3333-3333-3333-3333333333c1', '22222222-2222-2222-2222-2222222222c1', '00000000-0000-0000-0000-0000000000c1', private.jst_today());

-- ===== c1：教科タグ =====
set local role authenticated;
do $$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1"}', true); end $$;

select is((public.record_study_tag('数学') ->> 'coins_granted')::int, 1, '教科タグ 1 回目：1 コイン');
select is((public.record_study_tag('英語') ->> 'coins_granted')::int, 0, '教科タグ 2 回目（別の教科）：学習した日の 1 コインは 1 日 1 回');
select is((select completed_count::int from public.daily_activity), 2, '教科タグ 2 件で記録の帯の数は 2');
select is((select current_days::int from public.streaks), 1, '教科タグだけで連続記録が 1 日になる');
select throws_ok($$select public.record_study_tag('体育')$$, '23514', null, '教科以外は記録できない');

-- 同じ日にタスクを完了しても、連続記録は 1 日のまま。配信タスクは運営の設定どおりのコイン
select is((public.complete_task('33333333-3333-3333-3333-3333333333c1') ->> 'coins_granted')::int, 10, '配信タスクの完了：設定したコイン（10）');
select is((public.complete_task('33333333-3333-3333-3333-3333333333c1') ->> 'coins_granted')::int, 0, '二重に完了してもコインは増えない');
select is((select current_days::int from public.streaks), 1, 'タグとタスクが同じ日なら連続記録は 1 日');
select is((select completed_count::int from public.daily_activity), 3, '記録の帯の数は 3（タグ 2 + タスク 1）');
select is((select balance from public.coin_balances), 11, 'コイン残高は台帳の合計（1 + 10）');

-- ===== c1：タイマー（内容なし）=====
select is((public.start_study_timer('国語') ->> 'record_id') is not null, true, 'タイマーを始められる');
select throws_ok($$select public.start_study_timer('理科')$$, 'P0001', 'timer_already_running', 'タイマーは同時に 1 つだけ');
select is((public.stop_study_timer() ->> 'coins_granted')::int, 0, '内容なしのタイマー：その日の 1 コインはもう付与済み');
select throws_ok($$select public.stop_study_timer()$$, 'P0001', 'no_running_timer', '実行中でなければ終えられない');
select is((select completed_count::int from public.daily_activity), 4, 'タイマー終了で記録の帯の数が増える');

-- ===== c1：タイマー（内容つき）：1 件 3 コイン、1 日 3 件まで =====
select is((public.start_study_timer('理科', '  光の屈折の復習  ') ->> 'record_id') is not null, true, '内容つきで開始（前後の空白は除く）');
select is((public.stop_study_timer() ->> 'coins_granted')::int, 0, 'v1.7：内容つきでも内容の報酬は付かない（学習した日の 1 コインは付与済み）');
select is((select content from public.study_records where content is not null limit 1), '光の屈折の復習', '内容は保存される');
select lives_ok($$select public.start_study_timer('社会', '年表'); select public.stop_study_timer()$$, '内容つき 2 件目');
select lives_ok($$select public.start_study_timer('社会', '地図'); select public.stop_study_timer()$$, '内容つき 3 件目');
select lives_ok($$select public.start_study_timer('社会', '用語')$$, '内容つき 4 件目を開始');
select is((public.stop_study_timer() ->> 'coins_granted')::int, 0, '内容つき 4 件目：コインは付かない');
select is((select balance from public.coin_balances), 11, '残高：学習した日 1 + 配信タスク 10（内容の報酬はなし）');
select is((select current_days::int from public.streaks), 1, '何件記録しても連続記録は 1 日');

-- 取り消し
select lives_ok($$select public.start_study_timer('英語', 'やめる')$$, '取り消し用に開始');
select lives_ok($$select public.cancel_study_timer()$$, '間違えて始めたタイマーはやめられる');
select is((select count(*)::int from public.study_records where ended_at is null), 0, 'やめたタイマーは残らない');

-- ===== 終了し忘れの修正（c2）=====
reset role;
set local role authenticated;
do $$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c2"}', true); end $$;
select lives_ok($$select public.start_study_timer('数学', '問題集')$$, 'c2 がタイマーを開始');
reset role;
update public.study_records set started_at = now() - interval '3 hours' where student_id = '00000000-0000-0000-0000-0000000000c2';
set local role authenticated;
do $$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c2"}', true); end $$;
select throws_ok($$select public.stop_study_timer(200)$$, 'P0001', 'invalid_minutes', '経過時間（180 分）より長くは直せない');
select is((public.stop_study_timer(45) ->> 'duration_seconds')::int, 2700, '終了し忘れは学習した分数（45 分）に直せる');

-- ===== 見える範囲 =====
-- クラブ管理者：教科・内容・コインは見えない。記録の帯の数だけ見える
do $$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c3"}', true); end $$;
select is((select count(*)::int from public.study_records), 0, 'クラブ管理者には教科タグ・タイマーの記録（教科・内容）が見えない');
select is((select count(*)::int from public.coin_transactions), 0, 'クラブ管理者にはコインの台帳が見えない');
select ok((select count(*)::int from public.daily_activity) >= 2, 'クラブ管理者は記録の帯の数だけ読める');

-- 他の生徒の記録は見えない
do $$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c2"}', true); end $$;
select is((select count(*)::int from public.study_records where student_id = '00000000-0000-0000-0000-0000000000c1'), 0, '他の生徒の記録は見えない');
select throws_ok($$insert into public.coin_transactions (club_id, student_id, amount, reason, source_type, source_id, granted_on) values ('11111111-1111-1111-1111-1111111111c1','00000000-0000-0000-0000-0000000000c2', 99, 'task_complete', 'user_task', gen_random_uuid(), current_date)$$, '42501', null, 'コインを直接書けない');

select * from finish();
rollback;
