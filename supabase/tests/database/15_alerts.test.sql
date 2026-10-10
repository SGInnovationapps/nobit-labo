-- アラートの生成・解消・連絡済みの記録・権限
begin;
select plan(20);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000c1', 'c1@example.test'), ('00000000-0000-0000-0000-0000000000c2', 'c2@example.test'),
  ('00000000-0000-0000-0000-0000000000c3', 'c3@example.test'), ('00000000-0000-0000-0000-0000000000c4', 'c4@example.test'),
  ('00000000-0000-0000-0000-0000000000c5', 'c5@example.test'), ('00000000-0000-0000-0000-0000000000c6', 'c6@example.test'),
  ('00000000-0000-0000-0000-0000000000c7', 'c7@example.test'), ('00000000-0000-0000-0000-0000000000c8', 'c8@example.test');
insert into public.users (id, role, display_name, grade) values
  ('00000000-0000-0000-0000-0000000000c1', 'student', 'gap', 7),
  ('00000000-0000-0000-0000-0000000000c2', 'student', 'broken', 8),
  ('00000000-0000-0000-0000-0000000000c3', 'student', 'rest', 9),
  ('00000000-0000-0000-0000-0000000000c4', 'student', 'notstarted', 7),
  ('00000000-0000-0000-0000-0000000000c5', 'student', 'milestone', 8),
  ('00000000-0000-0000-0000-0000000000c6', 'student', 'overdue', 9),
  ('00000000-0000-0000-0000-0000000000c7', 'operator', '［運営］', null),
  ('00000000-0000-0000-0000-0000000000c8', 'club_admin', '［管理者名］', null);
insert into public.clubs (id, name) values ('11111111-1111-1111-1111-1111111111c1', '［クラブ名］'), ('11111111-1111-1111-1111-1111111111c2', '［クラブ名］B');
insert into public.club_members (club_id, user_id, member_role, status, reviewed_at) values
  ('11111111-1111-1111-1111-1111111111c1', '00000000-0000-0000-0000-0000000000c1', 'student', 'approved', now() - interval '60 days'),
  ('11111111-1111-1111-1111-1111111111c1', '00000000-0000-0000-0000-0000000000c2', 'student', 'approved', now() - interval '60 days'),
  ('11111111-1111-1111-1111-1111111111c2', '00000000-0000-0000-0000-0000000000c3', 'student', 'approved', now() - interval '60 days'),
  ('11111111-1111-1111-1111-1111111111c1', '00000000-0000-0000-0000-0000000000c4', 'student', 'approved', now() - interval '60 days'),
  ('11111111-1111-1111-1111-1111111111c1', '00000000-0000-0000-0000-0000000000c5', 'student', 'approved', now() - interval '60 days'),
  ('11111111-1111-1111-1111-1111111111c1', '00000000-0000-0000-0000-0000000000c6', 'student', 'approved', now() - interval '60 days'),
  ('11111111-1111-1111-1111-1111111111c1', '00000000-0000-0000-0000-0000000000c8', 'club_admin', 'approved', now());

insert into public.streaks (student_id, club_id, current_days, longest_days, last_achieved_date) values
  ('00000000-0000-0000-0000-0000000000c1', '11111111-1111-1111-1111-1111111111c1', 2, 2, private.jst_today() - 5),
  ('00000000-0000-0000-0000-0000000000c2', '11111111-1111-1111-1111-1111111111c1', 5, 5, private.jst_today() - 2),
  ('00000000-0000-0000-0000-0000000000c3', '11111111-1111-1111-1111-1111111111c2', 4, 4, private.jst_today() - 5),
  ('00000000-0000-0000-0000-0000000000c4', '11111111-1111-1111-1111-1111111111c1', 1, 1, private.jst_today() - 1),
  ('00000000-0000-0000-0000-0000000000c5', '11111111-1111-1111-1111-1111111111c1', 7, 7, private.jst_today() - 1),
  ('00000000-0000-0000-0000-0000000000c6', '11111111-1111-1111-1111-1111111111c1', 1, 1, private.jst_today() - 1);
-- 配信タスク（今日・未完了）と、期限切れのタスク
insert into public.tasks (id, club_id, title, subject, starts_on, due_on, recurrence) values
  ('22222222-2222-2222-2222-2222222222c1', '11111111-1111-1111-1111-1111111111c1', '今日の課題', '英語', private.jst_today(), null, 'none'),
  ('22222222-2222-2222-2222-2222222222c2', '11111111-1111-1111-1111-1111111111c1', '期限切れ', '数学', private.jst_today() - 5, private.jst_today() - 2, 'none');
insert into public.user_tasks (task_id, student_id, task_date) values
  ('22222222-2222-2222-2222-2222222222c1', '00000000-0000-0000-0000-0000000000c4', private.jst_today());

insert into public.club_events (club_id, event_date, kind, created_by)
select '11111111-1111-1111-1111-1111111111c2', (private.jst_today() - g)::date, 'camp', '00000000-0000-0000-0000-0000000000c7' from generate_series(1, 4) g;

-- 朝（10 時）：未着手はまだ出さない
select private.generate_alerts((private.jst_today()::timestamp + interval '10 hours') at time zone 'Asia/Tokyo');
select is((select count(*)::int from public.alerts where kind = 'not_started'), 0, '16 時前は未着手を出さない');
select is((select kind from public.alerts where student_id = '00000000-0000-0000-0000-0000000000c1' and kind in ('gap', 'streak_broken')), 'gap', '3 日以上空いたら「記録が空いた」');
select is((select kind from public.alerts where student_id = '00000000-0000-0000-0000-0000000000c2' and kind in ('gap', 'streak_broken')), 'streak_broken', '3 日以上続いた連続記録が 1 日空いたら「途切れた」');
select is((select kind from public.alerts where student_id = '00000000-0000-0000-0000-0000000000c5' and kind = 'streak_milestone'), 'streak_milestone', '7 日目の節目');
select is((select count(*)::int from public.alerts where student_id = '00000000-0000-0000-0000-0000000000c6' and kind = 'task_overdue'), 1, '期限切れの配信タスク');

-- 同じ原因は 1 件にまとめる
select private.generate_alerts((private.jst_today()::timestamp + interval '11 hours') at time zone 'Asia/Tokyo');
select is((select count(*)::int from public.alerts where student_id = '00000000-0000-0000-0000-0000000000c1' and kind in ('gap', 'streak_broken')), 1, '何度生成しても 1 件');

-- 夕方（18 時）：未着手（v1.7：初期値はオフなので、オンにして確かめる）
update public.alert_rules set enabled = true where kind = 'not_started';
select private.generate_alerts((private.jst_today()::timestamp + interval '18 hours') at time zone 'Asia/Tokyo');
select is((select count(*)::int from public.alerts where student_id = '00000000-0000-0000-0000-0000000000c4' and kind = 'not_started'), 1, '16 時以降は未着手を出す');

-- 休息日（大会など）は数えない
select is((select count(*)::int from public.alerts where student_id = '00000000-0000-0000-0000-0000000000c3' and kind in ('gap', 'streak_broken')), 0, '休息日だけの空白では出ない');

-- オフにした種類は出さない
update public.alert_rules set enabled = false where kind = 'badge_earned';
insert into public.items (id, code, name, category, rarity, sort_order) values ('33333333-3333-3333-3333-3333333333c1', 'test_badge', 'テスト', 'badge', 'normal', 999);
insert into public.user_items (club_id, student_id, item_id, category) values ('11111111-1111-1111-1111-1111111111c1', '00000000-0000-0000-0000-0000000000c1', '33333333-3333-3333-3333-3333333333c1', 'badge');
select private.generate_alerts(now());
select is((select count(*)::int from public.alerts where kind = 'badge_earned'), 0, 'オフの種類は出さない');
update public.alert_rules set enabled = true where kind = 'badge_earned';
select private.generate_alerts(now());
select is((select count(*)::int from public.alerts where kind = 'badge_earned'), 1, 'オンに戻すと出る');

-- 権限
set local role authenticated;
do $$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c8"}', true); end $$;
select is((select count(*)::int from public.alerts), 0, 'クラブ管理者はアラートを読めない');
select throws_ok($$select public.refresh_alerts()$$, 'P0001', 'forbidden', 'クラブ管理者は生成できない');

do $$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c7"}', true); end $$;
select lives_ok($$select public.refresh_alerts()$$, '運営は生成できる');
select lives_ok(format($$select public.mark_alert_contacted(%L)$$, (select id from public.alerts where student_id = '00000000-0000-0000-0000-0000000000c1' and kind = 'gap')), '連絡済みを記録できる');
select is((select status from public.alert_list where student_id = '00000000-0000-0000-0000-0000000000c1' and kind = 'gap'), 'contacted', '状態が連絡済みになる');
select throws_ok(format($$select public.mark_alert_contacted(%L)$$, (select id from public.alerts where student_id = '00000000-0000-0000-0000-0000000000c1' and kind = 'gap')), 'P0001', 'not_open', '2 度は記録できない');
select lives_ok(format($$select public.dismiss_alert(%L)$$, (select id from public.alerts where kind = 'task_overdue' limit 1)), '見送れる');
reset role;

-- 連絡後 7 日間の完了タスク数
insert into public.user_tasks (task_id, student_id, task_date, completed_at) values
  ('22222222-2222-2222-2222-2222222222c1', '00000000-0000-0000-0000-0000000000c1', private.jst_today(), now() + interval '1 minute');
select is((select completed_after_contact from public.alert_list where student_id = '00000000-0000-0000-0000-0000000000c1' and kind = 'gap'), 1, '連絡後の完了タスク数');

-- 連絡のあとに学習を再開すると、解消されて「連絡後に再開」と記録される
insert into public.daily_activity (club_id, student_id, activity_date, completed_count) values ('11111111-1111-1111-1111-1111111111c1', '00000000-0000-0000-0000-0000000000c1', private.jst_today(), 1);
update public.streaks set last_achieved_date = private.jst_today(), current_days = 1 where student_id = '00000000-0000-0000-0000-0000000000c1';
select private.generate_alerts(now());
select is((select resumed_after_contact from public.alerts where student_id = '00000000-0000-0000-0000-0000000000c1' and kind = 'gap'), true, '連絡後に再開');
select is((select status from public.alerts where student_id = '00000000-0000-0000-0000-0000000000c1' and kind = 'gap'), 'resolved', 'アラートが解消される');

select * from finish();
rollback;
