-- 招待コード → 保護者同意 → 所属承認、自由登録、応援コメント
begin;
select plan(31);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'op@example.test'),
  ('00000000-0000-0000-0000-0000000000a2', 'adminA@example.test'),
  ('00000000-0000-0000-0000-0000000000a3', 'adminB@example.test'),
  ('00000000-0000-0000-0000-0000000000b1', 's1@example.test'),
  ('00000000-0000-0000-0000-0000000000b2', 's2@example.test'),
  ('00000000-0000-0000-0000-0000000000b3', 's3@example.test'),
  ('00000000-0000-0000-0000-0000000000b4', 's4@example.test');
insert into public.users (id, role, display_name, grade) values
  ('00000000-0000-0000-0000-0000000000a1', 'operator', '運営', null),
  ('00000000-0000-0000-0000-0000000000a2', 'club_admin', '［管理者名］A', null),
  ('00000000-0000-0000-0000-0000000000a3', 'club_admin', '［管理者名］B', null),
  ('00000000-0000-0000-0000-0000000000b1', 'student', 'n1', 7),   -- 新規：これから申し込む
  ('00000000-0000-0000-0000-0000000000b2', 'student', null, null),-- プロフィール未入力
  ('00000000-0000-0000-0000-0000000000b3', 'student', 'n3', 8),   -- 承認済み
  ('00000000-0000-0000-0000-0000000000b4', 'student', 'n4', 9);   -- 却下用
insert into public.clubs (id, name, invite_code) values
  ('11111111-1111-1111-1111-11111111111a', '［クラブ名］A', 'invitecodea1'),
  ('11111111-1111-1111-1111-11111111111b', '［クラブ名］B', 'invitecodeb1');
insert into public.club_members (club_id, user_id, member_role, status) values
  ('11111111-1111-1111-1111-11111111111a', '00000000-0000-0000-0000-0000000000a2', 'club_admin', 'approved'),
  ('11111111-1111-1111-1111-11111111111b', '00000000-0000-0000-0000-0000000000a3', 'club_admin', 'approved'),
  ('11111111-1111-1111-1111-11111111111a', '00000000-0000-0000-0000-0000000000b3', 'student', 'approved');

-- ===== s1 が申し込む =====
set local role authenticated;
do $$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1"}', true); end $$;

select throws_ok($$select public.join_club('wrongcode')$$, 'P0001', 'invalid_invite_code', '招待コードが違うと申し込めない');
select is((public.join_club(' INVITECODEA1 ') ->> 'status'), 'pending', '招待コード（大文字・空白つき）で申請中になる');
select throws_ok($$select public.join_club('invitecodeb1')$$, 'P0001', 'already_member', '申請中は別のクラブに申し込めない');
select is((select count(*)::int from public.clubs), 1, '申請中の生徒は所属先のクラブ名を読める（他は読めない）');
select is((select count(*)::int from public.club_members), 1, '生徒は自分の所属だけ読める');
update public.club_members set status = 'approved' where user_id = '00000000-0000-0000-0000-0000000000b1';
select is((select status from public.club_members where user_id = '00000000-0000-0000-0000-0000000000b1'), 'pending', '生徒は自分の所属を承認できない');

-- 管理者は、同意とプロフィールが揃うまで承認できない
do $$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a2"}', true); end $$;
select throws_ok(
  format($$select public.review_membership(%L, true)$$, (select id from public.club_members where user_id = '00000000-0000-0000-0000-0000000000b1')),
  'P0001', 'consent_required', '保護者同意がないと承認できない');

-- 同意：自分が申し込んだクラブについてだけ記録できる
do $$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1"}', true); end $$;
select throws_ok($$insert into public.parental_consents (club_id, student_id, scope_version) values ('11111111-1111-1111-1111-11111111111b','00000000-0000-0000-0000-0000000000b1',2)$$,
  '42501', null, '所属していないクラブへの同意は記録できない');
select throws_ok($$insert into public.parental_consents (club_id, student_id, scope_version) values ('11111111-1111-1111-1111-11111111111a','00000000-0000-0000-0000-0000000000b3',2)$$,
  '42501', null, '他の生徒の名前で同意を記録できない');
select lives_ok($$insert into public.parental_consents (club_id, student_id, scope_version) values ('11111111-1111-1111-1111-11111111111a','00000000-0000-0000-0000-0000000000b1',2)$$,
  '自分の所属クラブへの同意を記録できる');
select throws_ok($$update public.parental_consents set scope_version = 1$$, '42501', null, '同意の記録は更新できない');
select throws_ok($$delete from public.parental_consents$$, '42501', null, '同意の記録は削除できない');

-- 別のクラブの管理者は承認できない
do $$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a3"}', true); end $$;
select throws_ok(
  format($$select public.review_membership(%L, true)$$, (select id from public.club_members where user_id = '00000000-0000-0000-0000-0000000000b1')),
  'P0001', 'membership_not_found', '他クラブの管理者には所属の申請が見えず、承認できない');

-- 生徒は承認できない
do $$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b3"}', true); end $$;
select throws_ok(
  $$select public.review_membership('00000000-0000-0000-0000-000000000000', true)$$,
  'P0001', 'membership_not_found', '生徒は承認の関数を使えない（見つからない扱い）');

-- 自クラブの管理者が承認
do $$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a2"}', true); end $$;
select is((public.review_membership((select id from public.club_members where user_id = '00000000-0000-0000-0000-0000000000b1'), true) ->> 'status'), 'approved', '管理者A が承認できる');
select throws_ok(
  format($$select public.review_membership(%L, true)$$, (select id from public.club_members where user_id = '00000000-0000-0000-0000-0000000000b1')),
  'P0001', 'not_pending', '承認済みを再度承認できない');

-- 閲覧範囲の版が上がったら、同意を取り直すまで承認できない
reset role;
insert into public.consent_scope_versions (version, summary) values (3, '範囲を変更した版（テスト）');
insert into public.club_members (club_id, user_id, member_role, status) values
  ('11111111-1111-1111-1111-11111111111a', '00000000-0000-0000-0000-0000000000b4', 'student', 'pending');
insert into public.parental_consents (club_id, student_id, scope_version) values
  ('11111111-1111-1111-1111-11111111111a', '00000000-0000-0000-0000-0000000000b4', 2);
set local role authenticated;
do $$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a2"}', true); end $$;
select throws_ok(
  format($$select public.review_membership(%L, true)$$, (select id from public.club_members where user_id = '00000000-0000-0000-0000-0000000000b4')),
  'P0001', 'consent_required', '旧い版への同意だけでは承認できない');
select is((public.review_membership((select id from public.club_members where user_id = '00000000-0000-0000-0000-0000000000b4'), false) ->> 'status'), 'rejected', '却下は同意がなくてもできる');

-- プロフィール未入力
reset role;
insert into public.club_members (club_id, user_id, member_role, status) values
  ('11111111-1111-1111-1111-11111111111a', '00000000-0000-0000-0000-0000000000b2', 'student', 'pending');
insert into public.parental_consents (club_id, student_id, scope_version) values
  ('11111111-1111-1111-1111-11111111111a', '00000000-0000-0000-0000-0000000000b2', 3);
set local role authenticated;
do $$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a2"}', true); end $$;
select throws_ok(
  format($$select public.review_membership(%L, true)$$, (select id from public.club_members where user_id = '00000000-0000-0000-0000-0000000000b2')),
  'P0001', 'profile_incomplete', '表示名・学年が未入力だと承認できない');

-- ===== 自由登録 =====
do $$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b3"}', true); end $$;
select lives_ok($$select public.register_free_task('単語 20 個', '英語', 15)$$, '自由登録 1 件目');
select lives_ok($$select public.register_free_task('ワーク p.12', '数学')$$, '自由登録 2 件目');
select lives_ok($$select public.register_free_task('漢字', '国語')$$, '自由登録 3 件目');
select throws_ok($$select public.register_free_task('4 件目', '理科')$$, 'P0001', 'daily_limit_reached', '1 日 3 件［仮］を超えると登録できない');
select is((select count(*)::int from public.user_tasks where is_free), 3, '自由登録は本人の割当として作られ、is_free が付く');
select throws_ok($$select public.register_free_task('過去', '社会', null, current_date - 5)$$, 'P0001', 'invalid_date', '過去の日付には登録できない');
select throws_ok($$insert into public.tasks (club_id, kind, owner_id, title, subject) values ('11111111-1111-1111-1111-11111111111a','free','00000000-0000-0000-0000-0000000000b3','直接','英語')$$,
  '42501', null, 'tasks に直接は書けない');

reset role;
update public.clubs set allow_free_tasks = false where id = '11111111-1111-1111-1111-11111111111a';
set local role authenticated;
do $$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1"}', true); end $$;
select throws_ok($$select public.register_free_task('x', '英語')$$, 'P0001', 'free_tasks_disabled', 'クラブが自由登録をオフにしていると登録できない');

-- ===== 応援コメント =====
do $$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a2"}', true); end $$;
select lives_ok($$insert into public.support_comments (club_id, student_id, author_id, body) values ('11111111-1111-1111-1111-11111111111a','00000000-0000-0000-0000-0000000000b3','00000000-0000-0000-0000-0000000000a2','今週もよく続いたね')$$,
  '管理者A は自クラブの生徒に応援コメントを書ける');
select throws_ok($$insert into public.support_comments (club_id, student_id, author_id, body) values ('11111111-1111-1111-1111-11111111111a','00000000-0000-0000-0000-0000000000b4','00000000-0000-0000-0000-0000000000a2','承認前')$$,
  '42501', null, '承認前（却下）の生徒には書けない');
do $$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a3"}', true); end $$;
select throws_ok($$insert into public.support_comments (club_id, student_id, author_id, body) values ('11111111-1111-1111-1111-11111111111a','00000000-0000-0000-0000-0000000000b3','00000000-0000-0000-0000-0000000000a3','他クラブ')$$,
  '42501', null, '他クラブの管理者は書けない');
do $$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b3"}', true); end $$;
select is((select count(*)::int from public.support_comments), 1, '生徒は自分宛ての応援コメントを読める');

select * from finish();
rollback;
