-- タスクの完了・連続記録・アプリ起動記録
begin;
select plan(23);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000b1', 's1@example.test'),
  ('00000000-0000-0000-0000-0000000000b2', 's2@example.test'),
  ('00000000-0000-0000-0000-0000000000b3', 's3@example.test');
insert into public.users (id, role, display_name, grade) values
  ('00000000-0000-0000-0000-0000000000b1', 'student', 's1', 7),
  ('00000000-0000-0000-0000-0000000000b2', 'student', 's2', 8),
  ('00000000-0000-0000-0000-0000000000b3', 'student', 's3', 9);
insert into public.clubs (id, name) values ('11111111-1111-1111-1111-11111111111a', '［クラブ名］A');
insert into public.club_members (club_id, user_id, member_role, status) values
  ('11111111-1111-1111-1111-11111111111a', '00000000-0000-0000-0000-0000000000b1', 'student', 'approved'),
  ('11111111-1111-1111-1111-11111111111a', '00000000-0000-0000-0000-0000000000b2', 'student', 'approved'),
  ('11111111-1111-1111-1111-11111111111a', '00000000-0000-0000-0000-0000000000b3', 'student', 'pending');
insert into public.tasks (id, club_id, title, subject) values
  ('22222222-2222-2222-2222-222222222201', '11111111-1111-1111-1111-11111111111a', '英語 配信1', '英語'),
  ('22222222-2222-2222-2222-222222222202', '11111111-1111-1111-1111-11111111111a', '数学 配信2', '数学');

-- s1：今日の 2 件
insert into public.user_tasks (id, task_id, student_id, task_date) values
  ('33333333-3333-3333-3333-333333333301', '22222222-2222-2222-2222-222222222201', '00000000-0000-0000-0000-0000000000b1', private.jst_today()),
  ('33333333-3333-3333-3333-333333333302', '22222222-2222-2222-2222-222222222202', '00000000-0000-0000-0000-0000000000b1', private.jst_today()),
  ('33333333-3333-3333-3333-333333333303', '22222222-2222-2222-2222-222222222201', '00000000-0000-0000-0000-0000000000b1', private.jst_today() + 1);
-- s2：過去の日々（連続記録の検証用）。基準日 d0 = 20 日前
insert into public.user_tasks (id, task_id, student_id, task_date)
select ('33333333-3333-3333-3333-3333333333' || lpad((10 + n)::text, 2, '0'))::uuid,
       '22222222-2222-2222-2222-222222222201', '00000000-0000-0000-0000-0000000000b2',
       private.jst_today() - 20 + n
from unnest(array[0, 1, 3]) as n;

-- ===== 生徒 s1 が完了する =====
set local role authenticated;
do $$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1"}', true); end $$;

select is((public.complete_task('33333333-3333-3333-3333-333333333301') ->> 'already_completed')::boolean, false, '1 回目は新規に完了する');
select is((select completed_count::int from public.daily_activity), 1, '今日の完了数は 1');
select is((select current_days::int from public.streaks), 1, '連続記録は 1 日');

select is((public.complete_task('33333333-3333-3333-3333-333333333301') ->> 'already_completed')::boolean, true, '2 回目は「すでに完了」と返る');
select is((select completed_count::int from public.daily_activity), 1, '二重に完了しても完了数は増えない');
select is((select current_days::int from public.streaks), 1, '二重に完了しても連続記録は増えない');

select is((public.complete_task('33333333-3333-3333-3333-333333333302') ->> 'completed_today')::int, 2, '同じ日の 2 件目で完了数は 2');
select is((select current_days::int from public.streaks), 1, '同じ日に 2 件完了しても連続記録は 1 日のまま');

select throws_ok($$select public.complete_task('33333333-3333-3333-3333-333333333303')$$, 'P0001', 'task_not_yet_available', '明日のタスクは今日は完了できない');
select throws_ok($$select public.complete_task('33333333-3333-3333-3333-333333333310')$$, 'P0001', 'task_not_found', '他の生徒のタスクは完了できない');
update public.user_tasks set completed_at = now() where id = '33333333-3333-3333-3333-333333333303';
select is((select completed_at from public.user_tasks where id = '33333333-3333-3333-3333-333333333303'), null, '完了時刻を直接書き換えても反映されない');
select throws_ok($$insert into public.daily_activity (club_id, student_id, activity_date, completed_count) values ('11111111-1111-1111-1111-11111111111a','00000000-0000-0000-0000-0000000000b1', current_date - 1, 9)$$, '42501', null, '記録の帯を直接書けない');

-- アプリ起動記録は学習記録を作らない
select lives_ok($$select public.record_app_open()$$, 'アプリ起動を記録できる');
select lives_ok($$select public.record_app_open()$$, '同じ日の 2 回目も失敗しない');
select is((select count(*)::int from public.app_opens), 1, '起動記録は 1 日 1 行');

-- 認証なし
do $$ begin perform set_config('request.jwt.claims', '', true); end $$;
select throws_ok($$select public.complete_task('33333333-3333-3333-3333-333333333301')$$, 'P0001', 'not_authenticated', '未ログインでは完了できない');

-- ===== 連続記録：日付の境界は JST 24:00 =====
reset role;
-- d0 の 23:59（JST）→ d0+1 の 00:01（JST）。UTC の日付では同じ日になる組み合わせ
select is((private.complete_task_at('33333333-3333-3333-3333-333333333310', '00000000-0000-0000-0000-0000000000b2',
  ((private.jst_today() - 20)::timestamp + time '23:59') at time zone 'Asia/Tokyo') ->> 'current_days')::int, 1, 'd0 に完了：連続 1 日');
select is((private.complete_task_at('33333333-3333-3333-3333-333333333311', '00000000-0000-0000-0000-0000000000b2',
  ((private.jst_today() - 19)::timestamp + time '00:01') at time zone 'Asia/Tokyo') ->> 'current_days')::int, 2, 'JST 24:00 を挟んだ翌日の完了で連続 2 日');
select is((select count(*)::int from public.daily_activity where student_id = '00000000-0000-0000-0000-0000000000b2'), 2, 'JST の日付ごとに記録の帯が分かれる');
select is((private.complete_task_at('33333333-3333-3333-3333-333333333313', '00000000-0000-0000-0000-0000000000b2',
  ((private.jst_today() - 17)::timestamp + time '12:00') at time zone 'Asia/Tokyo') ->> 'current_days')::int, 1, '1 日空くと連続記録は 1 から数え直す');
select is((select longest_days::int from public.streaks where student_id = '00000000-0000-0000-0000-0000000000b2'), 2, '途切れても最長記録は消えない');

-- 表示用ビュー：最後の達成が昨日より前なら 0（最長記録は残る）
set local role authenticated;
do $$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b2"}', true); end $$;
select results_eq($$select current_days::int, longest_days::int from public.streak_status$$, $$values (0, 2)$$, '表示上の連続記録は 0、最長記録は 2');

-- 承認前の生徒
reset role;
select throws_ok($$select private.complete_task_at('33333333-3333-3333-3333-333333333301', '00000000-0000-0000-0000-0000000000b3', now())$$,
  'P0001', 'task_not_found', '申請中の生徒は他人のタスクを完了できない');

select * from finish();
rollback;
