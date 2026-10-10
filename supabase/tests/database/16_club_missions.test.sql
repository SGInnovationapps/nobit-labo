-- クラブミッション：作成の権限と検証、参加、進み、個人・クラブ報酬の二重付与なし、見える範囲、アラート
begin;
select plan(22);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000d1', 'd1@example.test'), ('00000000-0000-0000-0000-0000000000d2', 'd2@example.test'),
  ('00000000-0000-0000-0000-0000000000d3', 'd3@example.test'), ('00000000-0000-0000-0000-0000000000d4', 'd4@example.test'),
  ('00000000-0000-0000-0000-0000000000d5', 'd5@example.test'), ('00000000-0000-0000-0000-0000000000d6', 'd6@example.test');
insert into public.users (id, role, display_name, grade) values
  ('00000000-0000-0000-0000-0000000000d1', 'student', 'あさひ', 7), ('00000000-0000-0000-0000-0000000000d2', 'student', 'ゆうき', 8),
  ('00000000-0000-0000-0000-0000000000d3', 'student', 'みどり', 9), ('00000000-0000-0000-0000-0000000000d4', 'student', '他クラブ', 9),
  ('00000000-0000-0000-0000-0000000000d5', 'operator', '［運営］', null), ('00000000-0000-0000-0000-0000000000d6', 'club_admin', '［管理者名］', null);
insert into public.clubs (id, name) values ('11111111-1111-1111-1111-1111111111d1', '［クラブ名］'), ('11111111-1111-1111-1111-1111111111d2', '［クラブ名］B');
insert into public.club_members (club_id, user_id, member_role, status) values
  ('11111111-1111-1111-1111-1111111111d1', '00000000-0000-0000-0000-0000000000d1', 'student', 'approved'),
  ('11111111-1111-1111-1111-1111111111d1', '00000000-0000-0000-0000-0000000000d2', 'student', 'approved'),
  ('11111111-1111-1111-1111-1111111111d1', '00000000-0000-0000-0000-0000000000d3', 'student', 'approved'),
  ('11111111-1111-1111-1111-1111111111d2', '00000000-0000-0000-0000-0000000000d4', 'student', 'approved'),
  ('11111111-1111-1111-1111-1111111111d1', '00000000-0000-0000-0000-0000000000d6', 'club_admin', 'approved');

-- 作成（運営だけ）
set local role authenticated;
do $$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d6"}', true); end $$;
select throws_ok($$select public.create_club_mission('11111111-1111-1111-1111-1111111111d1','秋のミッション',null,'records',private.jst_today(),private.jst_today()+3,4,3,7,20)$$, 'P0001', 'forbidden', 'クラブ管理者は作れない');

do $$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d5"}', true); end $$;
select lives_ok($$select public.create_club_mission('11111111-1111-1111-1111-1111111111d1','秋のミッション','みんなで記録しよう','records',private.jst_today(),private.jst_today()+3,4,3,7,20)$$, '運営は作れる');
select throws_ok($$select public.create_club_mission('11111111-1111-1111-1111-1111111111d1','重なる',null,'records',private.jst_today()+3,private.jst_today()+5,4,3,7,20)$$, 'P0001', 'period_overlap', '期間は重ねられない');
select throws_ok($$select public.create_club_mission('11111111-1111-1111-1111-1111111111d1','過去',null,'records',private.jst_today()-9,private.jst_today()-5,4,3,7,20)$$, 'P0001', 'past_period', '終わった期間は作れない');
select throws_ok($$select public.create_club_mission('11111111-1111-1111-1111-1111111111d1','逆',null,'records',private.jst_today()+9,private.jst_today()+8,4,3,7,20)$$, 'P0001', 'invalid_period', '終了が開始より前は作れない');
select throws_ok($$select public.create_club_mission('11111111-1111-1111-1111-1111111111d1','数える記録',null,'minutes',private.jst_today()+9,private.jst_today()+10,4,3,7,20)$$, '23514', null, '数える記録は決まった種類だけ');
select lives_ok($$select public.create_club_mission('11111111-1111-1111-1111-1111111111d1','来週',null,'study_days',private.jst_today()+10,private.jst_today()+12,5,2,3,10)$$, '先の期間も作れる');
reset role;

-- 参加
set local role authenticated;
do $$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d1"}', true); end $$;
select throws_ok(format($$select public.join_mission(%L)$$, (select id from public.club_missions where title = '来週')), 'P0001', 'not_started', '始まる前は参加できない');
select lives_ok(format($$select public.join_mission(%L)$$, (select id from public.club_missions where title = '秋のミッション')), '始まっていれば参加できる');
do $$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d4"}', true); end $$;
select throws_ok(format($$select public.join_mission(%L)$$, (select id from public.club_missions where title = '秋のミッション')), 'P0001', 'not_found', '他クラブのミッションには参加できない');
do $$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d2"}', true); end $$;
select lives_ok(format($$select public.join_mission(%L)$$, (select id from public.club_missions where title = '秋のミッション')), '2 人目も参加');
reset role;

-- 進みと報酬（d3 は参加しない）
select private.record_study_activity('00000000-0000-0000-0000-0000000000d1', '11111111-1111-1111-1111-1111111111d1', private.jst_today());
select private.record_study_activity('00000000-0000-0000-0000-0000000000d1', '11111111-1111-1111-1111-1111111111d1', private.jst_today());
select private.record_study_activity('00000000-0000-0000-0000-0000000000d3', '11111111-1111-1111-1111-1111111111d1', private.jst_today());
select is((select count(*)::int from public.coin_transactions where reason = 'mission_personal'), 0, '個人目標（3）の手前では付かない');
select private.record_study_activity('00000000-0000-0000-0000-0000000000d1', '11111111-1111-1111-1111-1111111111d1', private.jst_today());
select is((select amount from public.coin_transactions where reason = 'mission_personal' and student_id = '00000000-0000-0000-0000-0000000000d1'), 7, '個人目標に届くと個人報酬');
select private.record_study_activity('00000000-0000-0000-0000-0000000000d1', '11111111-1111-1111-1111-1111111111d1', private.jst_today());
select is((select count(*)::int from public.coin_transactions where reason = 'mission_personal'), 1, '個人報酬は 1 回だけ');
-- クラブ全体 4 に届く：d1 は 4 件。d2 が 1 件で合計 5 ≥ 4
select private.record_study_activity('00000000-0000-0000-0000-0000000000d2', '11111111-1111-1111-1111-1111111111d1', private.jst_today());
select is((select count(*)::int from public.coin_transactions where reason = 'mission_club'), 2, 'クラブ目標に届くと、参加して記録した人に報酬');
select private.record_study_activity('00000000-0000-0000-0000-0000000000d2', '11111111-1111-1111-1111-1111111111d1', private.jst_today());
select is((select count(*)::int from public.coin_transactions where reason = 'mission_club'), 2, 'クラブ報酬は 1 人 1 回だけ');
select is((select count(*)::int from public.coin_transactions where reason = 'mission_club' and student_id = '00000000-0000-0000-0000-0000000000d3'), 0, '参加していない生徒には付かない');

-- 見える範囲
set local role authenticated;
do $$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d2"}', true); end $$;
select is((select (e ->> 'club_progress')::int from jsonb_array_elements(public.my_missions()) e where e ->> 'title' = '秋のミッション'), 6, '生徒に見えるクラブ全体の進み（他の生徒の記録も含む合計）');
select ok(position('あさひ' in public.my_missions()::text) = 0, '他の生徒の名前は含まれない');
do $$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d5"}', true); end $$;
select is((select jsonb_array_length(e -> 'students')::int from jsonb_array_elements(public.admin_missions('11111111-1111-1111-1111-1111111111d1')) e where e ->> 'title' = '秋のミッション'), 2, '運営には生徒ごとの進みが見える');
reset role;

-- アラート：開始日に、承認済みの生徒全員へ
select private.generate_mission_alerts(now());
select is((select count(*)::int from public.alerts where kind = 'club_mission' and detail ->> 'phase' = 'start'), 3, '開始のアラートは、承認済みの生徒 3 人（他クラブは別）');

-- 取り消し
set local role authenticated;
do $$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d5"}', true); end $$;
select lives_ok(format($$select public.cancel_club_mission(%L)$$, (select id from public.club_missions where title = '来週')), '取り消せる');
reset role;

select * from finish();
rollback;
