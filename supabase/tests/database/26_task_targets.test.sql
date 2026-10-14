-- v1.7［仮］：配信タスクの学年の対象（sync_today_tasks・アラート）と、標準報酬10コイン
begin;
select plan(11);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000b1', 'b1@example.test'), ('00000000-0000-0000-0000-0000000000b2', 'b2@example.test'),
  ('00000000-0000-0000-0000-0000000000b3', 'b3@example.test'), ('00000000-0000-0000-0000-0000000000b4', 'b4@example.test');
insert into public.users (id, role, display_name, grade) values
  ('00000000-0000-0000-0000-0000000000b1', 'student', 'g7', 7), ('00000000-0000-0000-0000-0000000000b2', 'student', 'g9', 9),
  ('00000000-0000-0000-0000-0000000000b3', 'student', 'g10', 10), ('00000000-0000-0000-0000-0000000000b4', 'operator', '運営', null);
insert into public.clubs (id, name) values ('11111111-1111-1111-1111-1111111111b1', '［クラブ名］B');
insert into public.club_members (club_id, user_id, member_role, status) values
  ('11111111-1111-1111-1111-1111111111b1', '00000000-0000-0000-0000-0000000000b1', 'student', 'approved'),
  ('11111111-1111-1111-1111-1111111111b1', '00000000-0000-0000-0000-0000000000b2', 'student', 'approved'),
  ('11111111-1111-1111-1111-1111111111b1', '00000000-0000-0000-0000-0000000000b3', 'student', 'approved');

-- 運営が作る：全学年・中1〜中2・高1〜高2（報酬は指定しない）
insert into public.tasks (id, club_id, title, subject, starts_on, recurrence, target_grades) values
  ('22222222-2222-2222-2222-2222222222b1', '11111111-1111-1111-1111-1111111111b1', '全学年', '英語', private.jst_today(), 'daily', null),
  ('22222222-2222-2222-2222-2222222222b2', '11111111-1111-1111-1111-1111111111b1', '中学生向け', '数学', private.jst_today(), 'daily', array[7, 8]::smallint[]),
  ('22222222-2222-2222-2222-2222222222b3', '11111111-1111-1111-1111-1111111111b1', '高校生向け', '国語', private.jst_today(), 'daily', array[10, 11]::smallint[]);

select is((select reward_coins from public.tasks where id = '22222222-2222-2222-2222-2222222222b1'), 10, '配信タスクの報酬は、指定しなければ10コイン');
select throws_ok($$insert into public.tasks (club_id, title, subject, target_grades) values ('11111111-1111-1111-1111-1111111111b1', 'x', '英語', array[6]::smallint[])$$, '23514', null, '範囲外の学年は入れられない');
select throws_ok($$insert into public.tasks (club_id, title, subject, target_grades) values ('11111111-1111-1111-1111-1111111111b1', 'x', '英語', array[]::smallint[])$$, '23514', null, '空の学年は入れられない（全学年は null）');

set local role authenticated;
do $$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1"}', true); end $$;
select is((public.sync_today_tasks() ->> 'created')::int, 2, '中1は、全学年と中学生向けを受け取る');
select is((select count(*)::int from public.user_tasks), 2, '中1の今日のタスクは2件');
do $$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b2"}', true); end $$;
select is((public.sync_today_tasks() ->> 'created')::int, 1, '中3は、全学年だけ受け取る');
do $$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b3"}', true); end $$;
select is((select string_agg(t.title, ',' order by t.title) from public.user_tasks u join public.tasks t on t.id = u.task_id), null, '展開前は0件');
select is((public.sync_today_tasks() ->> 'created')::int, 2, '高1は、全学年と高校生向けを受け取る');
select is((select string_agg(t.title, ',' order by t.title) from public.user_tasks u join public.tasks t on t.id = u.task_id), '全学年,高校生向け', '高1が受け取ったのは、全学年と高校生向け');

-- アラート「配信タスクが未完了」：期限が過ぎた分は、学年の対象の生徒にだけ出る
reset role;
insert into public.tasks (id, club_id, title, subject, starts_on, due_on, recurrence, target_grades) values
  ('22222222-2222-2222-2222-2222222222b4', '11111111-1111-1111-1111-1111111111b1', '中1だけ・期限切れ', '理科', private.jst_today() - 5, private.jst_today() - 1, 'none', array[7]::smallint[]);
select private.generate_alerts(now());
select is((select count(*)::int from public.alerts where kind = 'task_overdue' and student_id = '00000000-0000-0000-0000-0000000000b1'), 1, '対象の中1には「期限が過ぎた」が出る');
select is((select count(*)::int from public.alerts where kind = 'task_overdue' and student_id in ('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000b3')), 0, '対象でない学年には出ない');

select * from finish();
rollback;
