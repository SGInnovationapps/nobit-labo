-- v1.7 ③：未着手の初期値オフ、連絡後3日の抑止、まとめて連絡済み／取り消し、LINE の表示名
begin;
select plan(13);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000b1', 'b1@example.test'), ('00000000-0000-0000-0000-0000000000b2', 'b2@example.test'),
  ('00000000-0000-0000-0000-0000000000b3', 'b3@example.test');
insert into public.users (id, role, display_name, grade) values
  ('00000000-0000-0000-0000-0000000000b1', 'student', 'ns', 7),
  ('00000000-0000-0000-0000-0000000000b2', 'student', 'gap', 8),
  ('00000000-0000-0000-0000-0000000000b3', 'operator', '［運営］', null);
insert into public.clubs (id, name) values ('11111111-1111-1111-1111-1111111111b1', '［クラブ名］');
insert into public.club_members (club_id, user_id, member_role, status, reviewed_at) values
  ('11111111-1111-1111-1111-1111111111b1', '00000000-0000-0000-0000-0000000000b1', 'student', 'approved', now() - interval '60 days'),
  ('11111111-1111-1111-1111-1111111111b1', '00000000-0000-0000-0000-0000000000b2', 'student', 'approved', now() - interval '60 days');
insert into public.line_accounts (user_id, line_user_id, line_display_name) values
  ('00000000-0000-0000-0000-0000000000b2', 'U00000000000000000000000000000b2', 'LINEの名前');
insert into public.streaks (student_id, club_id, current_days, longest_days, last_achieved_date) values
  ('00000000-0000-0000-0000-0000000000b1', '11111111-1111-1111-1111-1111111111b1', 1, 1, private.jst_today() - 1),
  ('00000000-0000-0000-0000-0000000000b2', '11111111-1111-1111-1111-1111111111b1', 2, 2, private.jst_today() - 5);
insert into public.tasks (id, club_id, title, subject, starts_on, recurrence) values
  ('22222222-2222-2222-2222-2222222222b1', '11111111-1111-1111-1111-1111111111b1', '今日の課題', '英語', private.jst_today(), 'none');
insert into public.user_tasks (task_id, student_id, task_date) values
  ('22222222-2222-2222-2222-2222222222b1', '00000000-0000-0000-0000-0000000000b1', private.jst_today());

select is((select enabled from public.alert_rules where club_id = '11111111-1111-1111-1111-1111111111b1' and kind = 'not_started'), false, '未着手は初期値オフ');
select is((select enabled from public.alert_rules where club_id = '11111111-1111-1111-1111-1111111111b1' and kind = 'gap'), true, '記録が空いたは初期値オン');

select private.generate_alerts((private.jst_today()::timestamp + interval '18 hours') at time zone 'Asia/Tokyo');
select is((select count(*)::int from public.alerts where kind = 'not_started'), 0, '未着手は、夕方でも出ない');
select is((select count(*)::int from public.alerts where student_id = '00000000-0000-0000-0000-0000000000b2' and kind = 'gap'), 1, '記録が空いたは出る');

set local role authenticated;
do $$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b3"}', true); end $$;
select is((select line_display_name from public.alert_list where student_id = '00000000-0000-0000-0000-0000000000b2'), 'LINEの名前', '一覧に LINE の表示名が出る');
select is(public.mark_alerts_contacted(array(select id from public.alerts where student_id = '00000000-0000-0000-0000-0000000000b2')), 1, 'まとめて連絡済みにできる');
select is(public.undo_alerts_contacted(array(select id from public.alerts where student_id = '00000000-0000-0000-0000-0000000000b2')), 1, '30分以内なら取り消せる');
select is((select status from public.alerts where student_id = '00000000-0000-0000-0000-0000000000b2'), 'open', '取り消すと対応待ちに戻る');
select is(public.mark_alerts_contacted(array(select id from public.alerts where student_id = '00000000-0000-0000-0000-0000000000b2')), 1, 'もう一度、連絡済みにする');

-- 連絡から3日は再開系を出さない（解消されたあとに、また空いても出さない）
reset role;
update public.alerts set status = 'resolved', resolved_at = now() where student_id = '00000000-0000-0000-0000-0000000000b2';
select private.generate_alerts((private.jst_today()::timestamp + interval '19 hours') at time zone 'Asia/Tokyo');
select is((select count(*)::int from public.alerts where student_id = '00000000-0000-0000-0000-0000000000b2' and status = 'open'), 0, '連絡から3日は再開系を出さない');
update public.alerts set contacted_at = now() - interval '4 days' where student_id = '00000000-0000-0000-0000-0000000000b2';
select private.generate_alerts((private.jst_today()::timestamp + interval '20 hours') at time zone 'Asia/Tokyo');
select is((select count(*)::int from public.alerts where student_id = '00000000-0000-0000-0000-0000000000b2' and status = 'open'), 1, '3日たてば、また出る');

-- 古い連絡は取り消せない／クラブ管理者（運営以外）は使えない
update public.alerts set status = 'contacted', contacted_at = now() - interval '2 hours' where student_id = '00000000-0000-0000-0000-0000000000b2' and status = 'open';
set local role authenticated;
do $$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b3"}', true); end $$;
select is(public.undo_alerts_contacted(array(select id from public.alerts where student_id = '00000000-0000-0000-0000-0000000000b2')), 0, '30分より前の連絡は取り消せない');
do $$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1"}', true); end $$;
select throws_ok($$select public.mark_alerts_contacted(array[]::uuid[])$$, 'P0001', 'forbidden', '運営以外は使えない');

select * from finish();
rollback;
