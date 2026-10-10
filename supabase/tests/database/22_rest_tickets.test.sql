-- v1.7 ④：休息チケットの付与・使用・さかのぼり、連続記録とアラートの共通の休息日
begin;
select plan(17);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000f6', 'f6@example.test'), ('00000000-0000-0000-0000-0000000000f7', 'f7@example.test'),
  ('00000000-0000-0000-0000-0000000000f8', 'f8@example.test'), ('00000000-0000-0000-0000-0000000000f9', 'f9@example.test');
insert into public.users (id, role, display_name, grade) values
  ('00000000-0000-0000-0000-0000000000f6', 'student', 'yday', 7), ('00000000-0000-0000-0000-0000000000f7', 'student', 'long', 8),
  ('00000000-0000-0000-0000-0000000000f8', 'student', 'alert', 9), ('00000000-0000-0000-0000-0000000000f9', 'club_admin', '［管理者名］', null);
insert into public.clubs (id, name) values ('11111111-1111-1111-1111-1111111111f6', '［クラブ名］T');
insert into public.club_members (club_id, user_id, member_role, status, reviewed_at) values
  ('11111111-1111-1111-1111-1111111111f6', '00000000-0000-0000-0000-0000000000f6', 'student', 'approved', now() - interval '60 days'),
  ('11111111-1111-1111-1111-1111111111f6', '00000000-0000-0000-0000-0000000000f7', 'student', 'approved', now() - interval '60 days'),
  ('11111111-1111-1111-1111-1111111111f6', '00000000-0000-0000-0000-0000000000f8', 'student', 'approved', now() - interval '60 days'),
  ('11111111-1111-1111-1111-1111111111f6', '00000000-0000-0000-0000-0000000000f9', 'club_admin', 'approved', now());
insert into public.streaks (student_id, club_id, current_days, longest_days, last_achieved_date) values
  ('00000000-0000-0000-0000-0000000000f6', '11111111-1111-1111-1111-1111111111f6', 5, 5, private.jst_today() - 2),
  ('00000000-0000-0000-0000-0000000000f7', '11111111-1111-1111-1111-1111111111f6', 4, 4, private.jst_today() - 3),
  ('00000000-0000-0000-0000-0000000000f8', '11111111-1111-1111-1111-1111111111f6', 6, 6, private.jst_today() - 4);

select is((select current_days from public.streak_status where student_id = '00000000-0000-0000-0000-0000000000f6'), 0, '昨日が空くと、連続記録は止まって見える');

set local role authenticated;
do $$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000f6"}', true); end $$;
select is((public.my_rest_tickets() ->> 'balance')::int, 1, '最初の1枚が付く');
select is((public.my_rest_tickets() ->> 'can_protect_yesterday')::boolean, true, '昨日にさかのぼって守れる');
select throws_ok($$select public.use_rest_ticket(private.jst_today() - 3)$$, 'P0001', 'date_not_allowed', '今日と昨日以外には使えない');
select is((public.use_rest_ticket(private.jst_today() - 1) ->> 'current_days')::int, 5, '昨日に使うと、連続記録が戻る');
select is((public.my_rest_tickets() ->> 'balance')::int, 0, 'チケットが減る');
select throws_ok($$select public.use_rest_ticket(private.jst_today())$$, 'P0001', 'no_ticket', 'チケットがないと使えない');
select is((select count(*)::int from public.daily_activity where student_id = '00000000-0000-0000-0000-0000000000f6'), 0, '休息日は学習日に数えない');

-- 休息日のあとの記録で、連続記録がつながる
reset role;
select private.record_study_activity('00000000-0000-0000-0000-0000000000f6', '11111111-1111-1111-1111-1111111111f6', private.jst_today());
select is((select current_days from public.streaks where student_id = '00000000-0000-0000-0000-0000000000f6'), 6, '休息日をはさんで、連続記録が1日増える');

-- 2日空いたときは、昨日だけを守っても意味がないので使えない
set local role authenticated;
do $$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000f7"}', true); end $$;
select is((public.my_rest_tickets() ->> 'can_protect_yesterday')::boolean, false, '2日空いていたら、昨日だけは守れない');
select throws_ok($$select public.use_rest_ticket(private.jst_today() - 1)$$, 'P0001', 'cannot_protect', '守れないときは使えない（チケットは減らない）');
select is((public.my_rest_tickets() ->> 'balance')::int, 1, 'チケットは減っていない');

-- 毎週月曜に1枚、所持は2枚まで
reset role;
update public.rest_tickets set balance = 0, last_granted_week = private.week_start(private.jst_today()) - 14 where student_id = '00000000-0000-0000-0000-0000000000f7';
set local role authenticated;
select is((public.my_rest_tickets() ->> 'balance')::int, 2, '2週ぶんで2枚');
reset role;
update public.rest_tickets set balance = 2, last_granted_week = private.week_start(private.jst_today()) - 7 where student_id = '00000000-0000-0000-0000-0000000000f7';
set local role authenticated;
select is((public.my_rest_tickets() ->> 'balance')::int, 2, '上限は2枚');

-- アラート：休息チケットの日は空いた日に数えない
reset role;
select private.generate_alerts((private.jst_today()::timestamp + interval '10 hours') at time zone 'Asia/Tokyo');
select is((select count(*)::int from public.alerts where student_id = '00000000-0000-0000-0000-0000000000f8' and kind in ('gap', 'streak_broken')), 1, '3日空いたら、アラートが出る');
update public.alerts set status = 'resolved' where student_id = '00000000-0000-0000-0000-0000000000f8';
insert into public.rest_ticket_uses (student_id, club_id, rest_date) values ('00000000-0000-0000-0000-0000000000f8', '11111111-1111-1111-1111-1111111111f6', private.jst_today() - 1);
select private.generate_alerts((private.jst_today()::timestamp + interval '11 hours') at time zone 'Asia/Tokyo');
select is((select detail ->> 'missing_days' from public.alerts where student_id = '00000000-0000-0000-0000-0000000000f8' and status = 'open'), '2', '休息チケットの日は、空いた日に数えない（3日 → 2日）');

-- クラブ管理者は、自クラブの休息日を読める
set local role authenticated;
do $$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000f9"}', true); end $$;
select is((select count(*)::int from public.rest_ticket_uses), 2, 'クラブ管理者は休息日を読める');

select * from finish();
rollback;
