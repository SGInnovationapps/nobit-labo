-- v1.7：学習した日の1コイン、同じ教科は1日1回、内容の事後記入、タスクからのタイマー、最初の記録の判定、追加ガチャ
begin;
select plan(25);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000f1', 'f1@example.test'), ('00000000-0000-0000-0000-0000000000f2', 'f2@example.test');
insert into public.users (id, role, display_name, grade) values
  ('00000000-0000-0000-0000-0000000000f1', 'student', 'f1', 7), ('00000000-0000-0000-0000-0000000000f2', 'student', 'f2', 8);
insert into public.clubs (id, name) values ('11111111-1111-1111-1111-1111111111f1', '［クラブ名］F');
insert into public.club_members (club_id, user_id, member_role, status) values
  ('11111111-1111-1111-1111-1111111111f1', '00000000-0000-0000-0000-0000000000f1', 'student', 'approved'),
  ('11111111-1111-1111-1111-1111111111f1', '00000000-0000-0000-0000-0000000000f2', 'student', 'approved');
insert into public.tasks (id, club_id, title, subject, reward_coins) values
  ('22222222-2222-2222-2222-2222222222f1', '11111111-1111-1111-1111-1111111111f1', '英語 配信', '英語', 10);
insert into public.user_tasks (id, task_id, student_id, task_date) values
  ('33333333-3333-3333-3333-3333333333f1', '22222222-2222-2222-2222-2222222222f1', '00000000-0000-0000-0000-0000000000f1', private.jst_today()),
  ('33333333-3333-3333-3333-3333333333f2', '22222222-2222-2222-2222-2222222222f1', '00000000-0000-0000-0000-0000000000f2', private.jst_today());

set local role authenticated;
do $$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000f1"}', true); end $$;

-- 教科の記録：最初の記録の判定、同じ教科は1日1回
select is((public.record_study_tag('数学') ->> 'first_of_day')::boolean, true, '教科の最初の記録は、その日の最初の記録');
select is((public.record_study_tag('数学') ->> 'already_recorded')::boolean, true, '同じ教科の2回目は記録済みとして返る');
select is((public.record_study_tag('数学') ->> 'coins_granted')::int, 0, '同じ教科の2回目はコインなし');
select is((select count(*)::int from public.study_records where kind = 'tag'), 1, '同じ教科は1日1件のまま');
select is((public.record_study_tag('英語') ->> 'first_of_day')::boolean, false, '2件目はその日の最初ではない');
select is((select completed_count::int from public.daily_activity), 2, '記録の数は2（数学・英語）');
select is((select balance from public.coin_balances), 1, '学習した日の1コインだけ');

-- 内容は事後にも書ける。自分の記録だけ
select lives_ok($$select public.set_study_content((select id from public.study_records where subject = '数学'), '  二次関数  ')$$, '内容を事後に書ける');
select is((select content from public.study_records where subject = '数学'), '二次関数', '内容は前後の空白を除いて保存される');
select is((select balance from public.coin_balances), 1, '内容を書いてもコインは増えない');
select throws_ok($$select public.set_study_content((select id from public.study_records where subject = '数学'), repeat('あ', 61))$$, 'P0001', 'content_too_long', '内容は60文字まで');
select lives_ok($$select public.set_study_content((select id from public.study_records where subject = '数学'), '')$$, '空にすると内容は消える');
select is((select content from public.study_records where subject = '数学'), null, '内容が消える');

-- タスクの行から始めたタイマー：終えるとタスクも完了する。記録の数は1件だけ増える
select lives_ok($$select public.start_study_timer('英語', '英語 配信', '33333333-3333-3333-3333-3333333333f1')$$, 'タスクの行からタイマーを始められる');
select is((public.stop_study_timer() ->> 'task_completed')::boolean, true, '終えるとタスクが完了する');
select is((select count(*)::int from public.user_tasks where completed_at is not null and student_id = '00000000-0000-0000-0000-0000000000f1'), 1, 'タスクは完了済み');
select is((select completed_count::int from public.daily_activity), 3, '記録の数は1件だけ増える');
select is((select balance from public.coin_balances), 11, '配信タスクの10コインが付く（学習した日の1コインは付与済み）');

-- 他人のタスクではタイマーを始められない
select throws_ok($$select public.start_study_timer('英語', null, '33333333-3333-3333-3333-3333333333f2')$$, 'P0001', 'task_not_found', '他の生徒のタスクでは始められない');

-- 追加ガチャ：無料の1回のあと、30コインで1日1回
select throws_ok($$select public.draw_gacha_extra()$$, 'P0001', 'free_draw_first', '無料の1回の前は追加で引けない');
reset role;
select private.draw_gacha_at('00000000-0000-0000-0000-0000000000f1', now(), 0.1, 0.0);
set local role authenticated;
do $$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000f1"}', true); end $$;
select throws_ok($$select public.draw_gacha_extra()$$, 'P0001', 'not_enough_coins', 'コインが足りないと追加で引けない（残高11）');
reset role;
insert into public.coin_transactions (club_id, student_id, amount, reason, source_type, source_id, granted_on)
values ('11111111-1111-1111-1111-1111111111f1', '00000000-0000-0000-0000-0000000000f1', 30, 'mission_personal', 'mission_personal', gen_random_uuid(), private.jst_today());
set local role authenticated;
do $$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000f1"}', true); end $$;
select is((public.draw_gacha_extra() ->> 'extra')::boolean, true, '追加ガチャを引ける');
select is((select balance from public.coin_balances), 41 - 30 + coalesce((select coins_granted from public.gacha_draws where is_extra), 0) + coalesce((select coins_granted from public.gacha_draws where not is_extra), 0), '30コインが引かれる（重複の交換コインは別）');
select throws_ok($$select public.draw_gacha_extra()$$, 'P0001', 'already_drawn_extra', '追加は1日1回まで');
select is((select count(*)::int from public.gacha_draws where student_id = '00000000-0000-0000-0000-0000000000f1'), 2, '無料1回と追加1回');

select * from finish();
rollback;
