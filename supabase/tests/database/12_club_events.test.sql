-- 大会日の登録：権限・過去日・重複・連続記録の保護・見える範囲
begin;
select plan(16);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000f1', 'f1@example.test'),
  ('00000000-0000-0000-0000-0000000000f2', 'f2@example.test'),
  ('00000000-0000-0000-0000-0000000000f3', 'f3@example.test'),
  ('00000000-0000-0000-0000-0000000000f4', 'f4@example.test'),
  ('00000000-0000-0000-0000-0000000000f5', 'f5@example.test');
insert into public.users (id, role, display_name, grade) values
  ('00000000-0000-0000-0000-0000000000f1', 'student', 'f1', 7),
  ('00000000-0000-0000-0000-0000000000f2', 'student', 'f2', 8),
  ('00000000-0000-0000-0000-0000000000f3', 'club_admin', '［管理者名］A', null),
  ('00000000-0000-0000-0000-0000000000f4', 'club_admin', '［管理者名］B', null),
  ('00000000-0000-0000-0000-0000000000f5', 'student', 'f5', 9);
insert into public.clubs (id, name) values
  ('11111111-1111-1111-1111-1111111111f1', '［クラブ名］A'),
  ('11111111-1111-1111-1111-1111111111f2', '［クラブ名］B');
insert into public.club_members (club_id, user_id, member_role, status) values
  ('11111111-1111-1111-1111-1111111111f1', '00000000-0000-0000-0000-0000000000f1', 'student', 'approved'),
  ('11111111-1111-1111-1111-1111111111f1', '00000000-0000-0000-0000-0000000000f2', 'student', 'approved'),
  ('11111111-1111-1111-1111-1111111111f1', '00000000-0000-0000-0000-0000000000f3', 'club_admin', 'approved'),
  ('11111111-1111-1111-1111-1111111111f2', '00000000-0000-0000-0000-0000000000f4', 'club_admin', 'approved'),
  ('11111111-1111-1111-1111-1111111111f2', '00000000-0000-0000-0000-0000000000f5', 'student', 'approved');

-- 権限
set local role authenticated;
do $$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000f1"}', true); end $$;
select throws_ok($$select public.add_club_event('11111111-1111-1111-1111-1111111111f1', private.jst_today() + 5, 'tournament')$$, 'P0001', 'forbidden', '生徒は登録できない');

do $$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000f4"}', true); end $$;
select throws_ok($$select public.add_club_event('11111111-1111-1111-1111-1111111111f1', private.jst_today() + 5, 'tournament')$$, 'P0001', 'forbidden', '他クラブの管理者は登録できない');

do $$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000f3"}', true); end $$;
select lives_ok($$select public.add_club_event('11111111-1111-1111-1111-1111111111f1', private.jst_today() + 5, 'tournament', '県大会')$$, '自クラブの管理者は登録できる');
select throws_ok($$select public.add_club_event('11111111-1111-1111-1111-1111111111f1', private.jst_today() + 5, 'camp')$$, 'P0001', 'already_registered', '同じ日は重ねて登録できない');
select throws_ok($$select public.add_club_event('11111111-1111-1111-1111-1111111111f1', private.jst_today() - 1, 'camp')$$, 'P0001', 'past_date', '過去の日は登録できない');
select throws_ok($$select public.add_club_event('11111111-1111-1111-1111-1111111111f1', private.jst_today() + 400, 'camp')$$, 'P0001', 'too_far', '1 年より先は登録できない');
select throws_ok($$select public.add_club_event('11111111-1111-1111-1111-1111111111f1', private.jst_today() + 6, 'other')$$, '23514', null, '種別は大会・遠征・合宿のみ');

-- 見える範囲
select is((select count(*)::int from public.club_events), 1, '自クラブの管理者は自クラブの日程が見える');
do $$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000f2"}', true); end $$;
select is((select count(*)::int from public.club_events), 1, '同じクラブの生徒は見える');
do $$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000f5"}', true); end $$;
select is((select count(*)::int from public.club_events), 0, '他クラブの生徒は見えない');

-- 削除
do $$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000f4"}', true); end $$;
select throws_ok(format($$select public.remove_club_event(%L)$$, (select id from public.club_events where false union all select '00000000-0000-0000-0000-000000000000'::uuid limit 1)), 'P0001', 'not_found', '存在しない予定は削除できない');
do $$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000f3"}', true); end $$;
select lives_ok(format($$select public.remove_club_event(%L)$$, (select id from public.club_events where kind = 'tournament')), '自クラブの管理者は削除できる');
reset role;

-- 連続記録：間の日がすべて休息日なら続く（postgres で日付を直接指定）
insert into public.streaks (student_id, club_id, current_days, longest_days, last_achieved_date)
values ('00000000-0000-0000-0000-0000000000f1', '11111111-1111-1111-1111-1111111111f1', 3, 3, private.jst_today() - 3),
       ('00000000-0000-0000-0000-0000000000f2', '11111111-1111-1111-1111-1111111111f1', 3, 3, private.jst_today() - 3);
insert into public.club_events (club_id, event_date, kind, created_by) values
  ('11111111-1111-1111-1111-1111111111f1', private.jst_today() - 2, 'trip', '00000000-0000-0000-0000-0000000000f3'),
  ('11111111-1111-1111-1111-1111111111f1', private.jst_today() - 1, 'trip', '00000000-0000-0000-0000-0000000000f3');

select is((select current_days from public.streak_status where student_id = '00000000-0000-0000-0000-0000000000f1'), 3, '間が休息日だけなら表示上も続いている');
select private.record_study_activity('00000000-0000-0000-0000-0000000000f1', '11111111-1111-1111-1111-1111111111f1', private.jst_today());
select is((select current_days from public.streaks where student_id = '00000000-0000-0000-0000-0000000000f1'), 4, '休息日をはさんでも連続記録が +1');

-- 休息日が 1 日だけ足りない場合は途切れる
delete from public.club_events where event_date = private.jst_today() - 1;
select is((select current_days from public.streak_status where student_id = '00000000-0000-0000-0000-0000000000f2'), 0, '休息日でない空白日があれば表示上は途切れる');
select private.record_study_activity('00000000-0000-0000-0000-0000000000f2', '11111111-1111-1111-1111-1111111111f1', private.jst_today());
select is((select current_days from public.streaks where student_id = '00000000-0000-0000-0000-0000000000f2'), 1, '途切れたら 1 から');

select * from finish();
rollback;
