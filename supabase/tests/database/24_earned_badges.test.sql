-- 仕様書 5-4：条件でもらえるバッジ（ストリーク・教科・行動・イベント）と獲得判定
begin;
select plan(19);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000d1', 'd1@example.test'), ('00000000-0000-0000-0000-0000000000d2', 'd2@example.test'),
  ('00000000-0000-0000-0000-0000000000d3', 'd3@example.test'), ('00000000-0000-0000-0000-0000000000d4', 'd4@example.test');
insert into public.users (id, role, display_name, grade) values
  ('00000000-0000-0000-0000-0000000000d1', 'student', 'badge', 7), ('00000000-0000-0000-0000-0000000000d2', 'club_admin', '［管理者名］', null),
  ('00000000-0000-0000-0000-0000000000d3', 'operator', '運営', null), ('00000000-0000-0000-0000-0000000000d4', 'student', 'other', 8);
insert into public.clubs (id, name) values ('11111111-1111-1111-1111-1111111111d1', '［クラブ名］D');
insert into public.club_members (club_id, user_id, member_role, status) values
  ('11111111-1111-1111-1111-1111111111d1', '00000000-0000-0000-0000-0000000000d1', 'student', 'approved'),
  ('11111111-1111-1111-1111-1111111111d1', '00000000-0000-0000-0000-0000000000d2', 'club_admin', 'approved'),
  ('11111111-1111-1111-1111-1111111111d1', '00000000-0000-0000-0000-0000000000d4', 'student', 'approved');
-- 2日続いている状態から始める（今日の記録で3日になる）
insert into public.streaks (student_id, club_id, current_days, longest_days, last_achieved_date) values
  ('00000000-0000-0000-0000-0000000000d1', '11111111-1111-1111-1111-1111111111d1', 2, 2, private.jst_today() - 1);

set local role authenticated;
do $$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d1"}', true); end $$;

-- 教科の最初の記録：教科のバッジと、3日連続のバッジが一緒に付く
select is((select jsonb_array_length(public.my_badges())), 11, '定義は11個');
select is((public.record_study_tag('英語') -> 'new_badges' -> 0 ->> 'code'), 'streak_3', '3日目の記録で3日連続のバッジ');
select is((select count(*)::int from public.user_badges), 2, '3日連続と英語のはじめて（2個）');
select is((public.record_study_tag('英語') -> 'new_badges')::text, '[]', '同じ記録をくり返しても、新しいバッジは付かない');
select is((public.record_study_tag('数学') -> 'new_badges' -> 0 ->> 'code'), 'subject_math', '別の教科で、その教科のはじめてが付く');
select is((select count(*)::int from public.user_badges), 3, '3個になる');

-- 進み具合：未獲得は進み、獲得済みは満点
select is((select (b ->> 'progress')::int from jsonb_array_elements(public.my_badges()) b where b ->> 'code' = 'streak_7'), 3, '7日連続は 3 / 7');
select is((select (b ->> 'progress')::int from jsonb_array_elements(public.my_badges()) b where b ->> 'code' = 'subject_eng'), 1, '獲得済みは満点');
select is((select b ->> 'earned_on' from jsonb_array_elements(public.my_badges()) b where b ->> 'code' = 'subject_eng'), private.jst_today()::text, '獲得日が入る');
select is((select b ->> 'earned_on' from jsonb_array_elements(public.my_badges()) b where b ->> 'code' = 'streak_7'), null, '未獲得は獲得日なし');

-- 行動：15分集中の達成（記録を直接入れて判定する）
reset role;
insert into public.study_records (club_id, student_id, kind, subject, started_at, ended_at, duration_seconds, record_date, focus_achieved, focus_target_seconds)
select '11111111-1111-1111-1111-1111111111d1', '00000000-0000-0000-0000-0000000000d1', 'timer', '理科', now() - interval '20 minutes', now() - interval '5 minutes', 900, private.jst_today(), true, 900;
select is((private.evaluate_badges('00000000-0000-0000-0000-0000000000d1', '11111111-1111-1111-1111-1111111111d1', private.jst_today())) -> 0 ->> 'code', 'subject_sci', '理科のはじめてが付く（教科の記録）');
select is((select count(*)::int from public.user_badges where student_id = '00000000-0000-0000-0000-0000000000d1' and badge_code = 'focus_first'), 1, '15分チャレンジャーが付く');
select is((select private.badge_progress('00000000-0000-0000-0000-0000000000d1', 'focus_10')), 1, '集中のつみかさねは 1 / 10');

-- 途切れても最長記録のぶんは消えない
update public.streaks set current_days = 0 where student_id = '00000000-0000-0000-0000-0000000000d1';
select is((select count(*)::int from public.user_badges where student_id = '00000000-0000-0000-0000-0000000000d1' and badge_code = 'streak_3'), 1, '連続記録が途切れても、獲得したバッジは消えない');

-- 運営のアラート：教科のバッジは出る。連続記録のバッジは節目のアラートがあるので出さない
select private.generate_alerts(now());
select is((select count(*)::int from public.alerts where student_id = '00000000-0000-0000-0000-0000000000d1' and kind = 'badge_earned' and detail ->> 'item' = '理科のはじめて'), 1, '教科のバッジは運営のアラートに出る');
select is((select count(*)::int from public.alerts where student_id = '00000000-0000-0000-0000-0000000000d1' and kind = 'badge_earned' and detail ->> 'item' = '3日連続'), 0, '連続記録のバッジはバッジのアラートに出さない');

-- 見える範囲：クラブ管理者は読めない。運営と本人は読める。他の生徒のものは読めない
set local role authenticated;
do $$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d2"}', true); end $$;
select is((select count(*)::int from public.user_badges), 0, 'クラブ管理者はバッジの獲得を読めない');
do $$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d4"}', true); end $$;
select is((select count(*)::int from public.user_badges), 0, '他の生徒の獲得は読めない');
do $$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d3"}', true); end $$;
select ok((select count(*)::int from public.user_badges) >= 4, '運営は読める');

select * from finish();
rollback;
