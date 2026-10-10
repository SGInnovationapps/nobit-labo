-- 再開画面：見たことの記録は本人の分だけ。次の途切れではまた出せる
begin;
select plan(6);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'a1@example.test'),
  ('00000000-0000-0000-0000-0000000000a2', 'a2@example.test');
insert into public.users (id, role, display_name, grade) values
  ('00000000-0000-0000-0000-0000000000a1', 'student', 'a1', 7),
  ('00000000-0000-0000-0000-0000000000a2', 'student', 'a2', 8);
insert into public.clubs (id, name) values ('11111111-1111-1111-1111-1111111111a1', '［クラブ名］');
insert into public.club_members (club_id, user_id, member_role, status) values
  ('11111111-1111-1111-1111-1111111111a1', '00000000-0000-0000-0000-0000000000a1', 'student', 'approved'),
  ('11111111-1111-1111-1111-1111111111a1', '00000000-0000-0000-0000-0000000000a2', 'student', 'approved');
insert into public.streaks (student_id, club_id, current_days, longest_days, last_achieved_date) values
  ('00000000-0000-0000-0000-0000000000a1', '11111111-1111-1111-1111-1111111111a1', 5, 9, private.jst_today() - 6),
  ('00000000-0000-0000-0000-0000000000a2', '11111111-1111-1111-1111-1111111111a1', 3, 3, private.jst_today() - 6);

select is((select current_days from public.streak_status where student_id = '00000000-0000-0000-0000-0000000000a1'), 0, '途切れている');
select is((select resume_seen_for from public.streak_status where student_id = '00000000-0000-0000-0000-0000000000a1'), null, '最初は見ていない');

set local role authenticated;
do $$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1"}', true); end $$;
select lives_ok($$select public.mark_resume_seen()$$, '見たことを記録できる');
select is((select resume_seen_for from public.streak_status), private.jst_today() - 6, 'その途切れで見たことになる');
reset role;

select is((select resume_seen_for from public.streaks where student_id = '00000000-0000-0000-0000-0000000000a2'), null, '他の生徒には影響しない');

-- 学習を再開して、また途切れたら、新しい途切れとして出せる（最後の達成日が変わる）
update public.streaks set last_achieved_date = private.jst_today() - 20 where student_id = '00000000-0000-0000-0000-0000000000a1';
select isnt((select resume_seen_for from public.streak_status where student_id = '00000000-0000-0000-0000-0000000000a1'), (select last_achieved_date from public.streaks where student_id = '00000000-0000-0000-0000-0000000000a1'), '別の途切れは未表示');

select * from finish();
rollback;
