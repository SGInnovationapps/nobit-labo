begin;
select plan(8);
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000c1', 's1@example.test'), ('00000000-0000-0000-0000-0000000000c2', 's2@example.test'),
  ('00000000-0000-0000-0000-0000000000c3', 's3@example.test'), ('00000000-0000-0000-0000-0000000000c4', 'admin@example.test'),
  ('00000000-0000-0000-0000-0000000000c5', 'line-u0@line.nobit.invalid');
insert into public.users (id, role, display_name, grade) values
  ('00000000-0000-0000-0000-0000000000c1', 'student', 'a', 7), ('00000000-0000-0000-0000-0000000000c2', 'student', 'b', 8),
  ('00000000-0000-0000-0000-0000000000c3', 'student', 'c', 9), ('00000000-0000-0000-0000-0000000000c4', 'club_admin', '［管理者名］', null),
  ('00000000-0000-0000-0000-0000000000c5', 'club_admin', 'x', null);
insert into public.clubs (id, name) values ('11111111-1111-1111-1111-1111111111c1', '［クラブ名］C');
insert into public.club_members (club_id, user_id, member_role, status, reviewed_at) values
  ('11111111-1111-1111-1111-1111111111c1', '00000000-0000-0000-0000-0000000000c1', 'student', 'approved', now() - interval '30 days'),
  ('11111111-1111-1111-1111-1111111111c1', '00000000-0000-0000-0000-0000000000c2', 'student', 'approved', now() - interval '30 days'),
  ('11111111-1111-1111-1111-1111111111c1', '00000000-0000-0000-0000-0000000000c3', 'student', 'approved', now() - interval '30 days'),
  ('11111111-1111-1111-1111-1111111111c1', '00000000-0000-0000-0000-0000000000c4', 'club_admin', 'approved', null),
  ('11111111-1111-1111-1111-1111111111c1', '00000000-0000-0000-0000-0000000000c5', 'club_admin', 'approved', null);
-- c1 は昨日学習、c2 は5日前に学習、c3 は記録なし
insert into public.daily_activity (club_id, student_id, activity_date, completed_count) values
  ('11111111-1111-1111-1111-1111111111c1', '00000000-0000-0000-0000-0000000000c1', private.jst_today() - 1, 1),
  ('11111111-1111-1111-1111-1111111111c1', '00000000-0000-0000-0000-0000000000c2', private.jst_today() - 5, 1);
insert into public.streaks (student_id, club_id, current_days, longest_days, last_achieved_date) values
  ('00000000-0000-0000-0000-0000000000c1', '11111111-1111-1111-1111-1111111111c1', 1, 1, private.jst_today() - 1),
  ('00000000-0000-0000-0000-0000000000c2', '11111111-1111-1111-1111-1111111111c1', 1, 1, private.jst_today() - 5);
insert into public.support_comments (club_id, student_id, author_id, body) values
  ('11111111-1111-1111-1111-1111111111c1', '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000c4', 'x');

select is((select total from public.weekly_digest_data()), 3, '承認済みの生徒は3人');
select is((select studied from public.weekly_digest_data()), 2, '学習した人数は2人');
select is((select idle from public.weekly_digest_data()), 2, 'しばらく記録がない（3日以上）のは2人');
select is((select unsupported from public.weekly_digest_data()), 2, '応援がまだの生徒は2人');
select is((select emails from public.weekly_digest_data()), array['admin@example.test'], '宛先は実在のメールだけ（LINE用の仮アドレスは除く）');
select is((select week_end - week_start from public.weekly_digest_data()), 6, '対象は7日間');
select public.weekly_digest_mark('11111111-1111-1111-1111-1111111111c1', private.jst_today() - 7, 1);
select is((select count(*)::int from public.weekly_digest_data()), 0, '送信済みの週は、もう返らない');
set local role authenticated;
select throws_ok($$select * from public.weekly_digest_data()$$, '42501', null, 'ログイン中のユーザーは呼べない');
select * from finish();
rollback;
