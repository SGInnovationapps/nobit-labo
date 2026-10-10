-- v1.7 ②：承認待ちの利用、一括承認、大会日の期間登録
begin;
select plan(15);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'a1@example.test'), ('00000000-0000-0000-0000-0000000000a2', 'a2@example.test'),
  ('00000000-0000-0000-0000-0000000000a3', 'a3@example.test'), ('00000000-0000-0000-0000-0000000000a4', 'a4@example.test'),
  ('00000000-0000-0000-0000-0000000000a5', 'a5@example.test');
insert into public.users (id, role, display_name, grade) values
  ('00000000-0000-0000-0000-0000000000a1', 'student', 'p1', 7),
  ('00000000-0000-0000-0000-0000000000a2', 'student', 'p2', 8),
  ('00000000-0000-0000-0000-0000000000a3', 'student', 'p3', 9),
  ('00000000-0000-0000-0000-0000000000a4', 'club_admin', '［管理者名］', null),
  ('00000000-0000-0000-0000-0000000000a5', 'student', 'ap', 7);
insert into public.clubs (id, name) values ('11111111-1111-1111-1111-1111111111a1', '［クラブ名］A');
insert into public.club_members (id, club_id, user_id, member_role, status) values
  ('44444444-4444-4444-4444-4444444444a1', '11111111-1111-1111-1111-1111111111a1', '00000000-0000-0000-0000-0000000000a1', 'student', 'pending'),
  ('44444444-4444-4444-4444-4444444444a2', '11111111-1111-1111-1111-1111111111a1', '00000000-0000-0000-0000-0000000000a2', 'student', 'pending'),
  ('44444444-4444-4444-4444-4444444444a3', '11111111-1111-1111-1111-1111111111a1', '00000000-0000-0000-0000-0000000000a3', 'student', 'pending'),
  ('44444444-4444-4444-4444-4444444444a4', '11111111-1111-1111-1111-1111111111a1', '00000000-0000-0000-0000-0000000000a4', 'club_admin', 'approved'),
  ('44444444-4444-4444-4444-4444444444a5', '11111111-1111-1111-1111-1111111111a1', '00000000-0000-0000-0000-0000000000a5', 'student', 'approved');
-- a1・a2 は同意済み、a3 は同意なし
insert into public.parental_consents (student_id, club_id, scope_version)
select s, '11111111-1111-1111-1111-1111111111a1', (select max(version) from public.consent_scope_versions)
from (values ('00000000-0000-0000-0000-0000000000a1'::uuid), ('00000000-0000-0000-0000-0000000000a2'::uuid)) v(s);

-- 承認待ちの生徒が記録できる
set local role authenticated;
do $$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1"}', true); end $$;
select is((public.record_study_tag('数学') ->> 'first_of_day')::boolean, true, '承認待ちでも教科を記録できる');
select is((select count(*)::int from public.daily_activity), 1, '承認待ちの記録の帯は本人に見える');
select is((select balance from public.coin_balances), 1, '承認待ちでも学習した日の1コインが付く');
select throws_ok($$select public.join_mission('99999999-9999-9999-9999-999999999999')$$, 'P0001', null, '承認待ちはミッションに参加できない');

-- クラブ管理者には、承認前の記録が見えない
do $$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a4"}', true); end $$;
select is((select count(*)::int from public.daily_activity), 0, '承認前の記録の帯はクラブ管理者に見えない');
select is((select count(*)::int from public.streaks), 0, '承認前の連続記録はクラブ管理者に見えない');

-- 一括承認：a1・a2 は通り、a3（同意なし）は失敗として返る
select is((public.review_memberships(array['44444444-4444-4444-4444-4444444444a1','44444444-4444-4444-4444-4444444444a2','44444444-4444-4444-4444-4444444444a3']::uuid[], true) ->> 'done')::int, 2, '同意済みの2人が承認される');
select is((select count(*)::int from public.club_members where status = 'approved' and member_role = 'student'), 3, '承認済みの生徒は3人');
select is(((public.review_memberships(array['44444444-4444-4444-4444-4444444444a3']::uuid[], true) -> 'failed') -> 0 ->> 'reason'), 'consent_required', '同意のない生徒は理由つきで失敗する');

-- 承認後は、記録がクラブ管理者に見える
select is((select count(*)::int from public.daily_activity), 1, '承認後は記録の帯が見える');

-- 大会日の期間登録
select is((public.add_club_events_range('11111111-1111-1111-1111-1111111111a1', private.jst_today() + 10, private.jst_today() + 12, 'camp', '［合宿］') ->> 'added')::int, 3, '3日分がまとめて登録される');
select is((public.add_club_events_range('11111111-1111-1111-1111-1111111111a1', private.jst_today() + 11, private.jst_today() + 13, 'camp', null) ->> 'skipped')::int, 2, '登録済みの日は飛ばす');
select throws_ok($$select public.add_club_events_range('11111111-1111-1111-1111-1111111111a1', current_date + 5, current_date + 1, 'camp', null)$$, 'P0001', 'bad_range', '終わりが始まりより前だと失敗');
select throws_ok($$select public.add_club_events_range('11111111-1111-1111-1111-1111111111a1', private.jst_today(), private.jst_today() + 40, 'camp', null)$$, 'P0001', 'range_too_long', '32日以上はまとめて登録できない');

-- 生徒は登録できない
do $$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a5"}', true); end $$;
select throws_ok($$select public.add_club_events_range('11111111-1111-1111-1111-1111111111a1', private.jst_today() + 20, private.jst_today() + 21, 'camp', null)$$, 'P0001', 'forbidden', '生徒は期間登録できない');

select * from finish();
rollback;
