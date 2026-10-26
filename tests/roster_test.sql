-- =============================================================================
-- tests/roster_test.sql  会員名簿（staff_roster）と会員規約の改定・クラスの設定（014_roster_settings.sql）のテスト
--
-- 【何を確かめるか】
--   会員名簿（staff_roster）
--     - 未ログインは読めない。保護者が読んでも0行。事務担当は自分のクラブの全員（他のクラブは出ない）
--     - 学年は grade_label、学年の数は grade_number、年齢は age_on と一致する
--     - クラス名・保護者のつながりの数・最後に同意した規約の版と方法が出る
--     - コーチには担当クラスの子だけ（つながり・同意は見えないので 0 と空）
--   会員規約の改定（publish_terms）
--     - 事務担当だけ。空・空白だけ・2万文字を超える本文は invalid_input、いまの版と同じ本文は unchanged
--     - 改定すると版が1つ上がる（クラブごと）。前後の空白は落とし、公開した人が残る。前の版は消えない
--     - 改定のあと、前の版にしか同意していない子は「未同意」になる（保護者の再同意の画面が出る、工程4-9）
--   クラスの設定（classes に直接書く）
--     - 事務担当は追加・変更できる。同じ名前・対象学年の逆転は断られる
--     - コーチ・保護者は書けない
--
-- 【使い方】
--   bash tests/local/run.sh   （admission_test.sql のあとに自動で流れる）
--   最後にすべて巻き戻すので、データベースには何も残らない。
-- =============================================================================

begin;

\o /dev/null

-- -----------------------------------------------------------------------------
-- テストの道具（apply_test.sql と同じ形）
-- -----------------------------------------------------------------------------
create schema roster_test;

create table roster_test.results (
  no      serial primary key,
  label   text not null,
  ok      boolean not null,
  detail  text
);

create function roster_test.expect(p_label text, p_actual text, p_expected text) returns void
language sql as $$
  insert into roster_test.results (label, ok, detail)
  values (p_label, p_actual is not distinct from p_expected,
          format('結果 %s ／ 期待 %s', coalesce(p_actual, '空'), coalesce(p_expected, '空')))
$$;

create function roster_test.expect_denied(p_label text, p_sql text) returns void
language plpgsql as $$
begin
  execute p_sql;
  insert into roster_test.results (label, ok, detail) values (p_label, false, '拒否されなかった');
exception when others then
  insert into roster_test.results (label, ok, detail) values (p_label, true, '拒否: ' || sqlerrm);
end;
$$;

create function roster_test.as_user(p_user text) returns void
language sql as $$
  select set_config('request.jwt.claims', case when p_user is null then '{}' else json_build_object('sub', p_user)::text end, true)
$$;

grant usage on schema roster_test to anon, authenticated, service_role;
grant all on all tables in schema roster_test to anon, authenticated, service_role;
grant all on all sequences in schema roster_test to anon, authenticated, service_role;
grant execute on all functions in schema roster_test to anon, authenticated, service_role;


-- -----------------------------------------------------------------------------
-- テストデータ（管理者として入れる）
--   クラブ A（itami）: クラス X・Y、規約 第1版・第2版
--     あい（在籍・X・保護者 G とつながり・第1版と第2版にアプリで同意）
--     いつき（在籍・Y・つながりなし・第1版に紙で同意）
--     うみ（申込中）、えま（退会）
--   クラブ B（ace）: クラス W、在籍1人、規約なし
--   人: b…01 A の事務担当、b…02 A のコーチ（X の担当）、b…03 A の保護者 G、b…04 B の事務担当
-- -----------------------------------------------------------------------------
insert into clubs (id, slug, name) values
  ('e9000000-0000-0000-0000-00000000000a', 'itami', '伊丹体操クラブ'),
  ('e9000000-0000-0000-0000-00000000000b', 'ace',   'エース体操クラブ');

insert into auth.users (id, email)
select ('b1000000-0000-0000-0000-00000000000' || n)::uuid, gen_random_uuid() || '@users.clubena.invalid'
  from generate_series(1, 4) as n;

insert into profiles (user_id, club_id, role) values
  ('b1000000-0000-0000-0000-000000000001', 'e9000000-0000-0000-0000-00000000000a', 'admin'),
  ('b1000000-0000-0000-0000-000000000002', 'e9000000-0000-0000-0000-00000000000a', 'coach'),
  ('b1000000-0000-0000-0000-000000000003', 'e9000000-0000-0000-0000-00000000000a', 'guardian'),
  ('b1000000-0000-0000-0000-000000000004', 'e9000000-0000-0000-0000-00000000000b', 'admin');

insert into classes (id, club_id, name, grade_min, grade_max, sort_order) values
  ('e9100000-0000-0000-0000-000000000001', 'e9000000-0000-0000-0000-00000000000a', 'クラスX', 1, 3, 1),
  ('e9100000-0000-0000-0000-000000000002', 'e9000000-0000-0000-0000-00000000000a', 'クラスY', 4, 6, 2),
  ('e9100000-0000-0000-0000-000000000003', 'e9000000-0000-0000-0000-00000000000b', 'クラスW', null, null, 1);

insert into coach_assignments (club_id, coach_user_id, class_id) values
  ('e9000000-0000-0000-0000-00000000000a', 'b1000000-0000-0000-0000-000000000002', 'e9100000-0000-0000-0000-000000000001');

insert into terms_versions (id, club_id, version, body, published_at) values
  ('e9300000-0000-0000-0000-000000000001', 'e9000000-0000-0000-0000-00000000000a', 1, '第1版の本文', now() - interval '60 day'),
  ('e9300000-0000-0000-0000-000000000002', 'e9000000-0000-0000-0000-00000000000a', 2, '第2版の本文', now() - interval '30 day');

insert into members (id, club_id, status, member_no, approved_at, family_name, given_name, family_kana, given_kana, birth_date, class_id) values
  ('e9200000-0000-0000-0000-000000000001', 'e9000000-0000-0000-0000-00000000000a', 'active', 1, now(), '青木', 'あい',   'あおき',   'あい',   '2018-04-01', 'e9100000-0000-0000-0000-000000000001'),
  ('e9200000-0000-0000-0000-000000000002', 'e9000000-0000-0000-0000-00000000000a', 'active', 2, now(), '井上', 'いつき', 'いのうえ', 'いつき', '2015-04-02', 'e9100000-0000-0000-0000-000000000002'),
  ('e9200000-0000-0000-0000-000000000009', 'e9000000-0000-0000-0000-00000000000b', 'active', 1, now(), '加藤', 'きら',   'かとう',   'きら',   '2016-01-01', 'e9100000-0000-0000-0000-000000000003');
insert into members (id, club_id, status, family_name, given_name, family_kana, given_kana, birth_date) values
  ('e9200000-0000-0000-0000-000000000003', 'e9000000-0000-0000-0000-00000000000a', 'pending', '上田', 'うみ', 'うえだ', 'うみ', '2020-12-31');
insert into members (id, club_id, status, member_no, approved_at, withdrawn_on, family_name, given_name, family_kana, given_kana, birth_date, class_id) values
  ('e9200000-0000-0000-0000-000000000004', 'e9000000-0000-0000-0000-00000000000a', 'withdrawn', 3, now() - interval '400 day', current_date - 10,
   '江藤', 'えま', 'えとう', 'えま', '2012-07-07', 'e9100000-0000-0000-0000-000000000002');

insert into guardian_members (club_id, guardian_user_id, member_id) values
  ('e9000000-0000-0000-0000-00000000000a', 'b1000000-0000-0000-0000-000000000003', 'e9200000-0000-0000-0000-000000000001');

insert into terms_consents (club_id, member_id, terms_version_id, method, consented_by, recorded_by, consented_at) values
  ('e9000000-0000-0000-0000-00000000000a', 'e9200000-0000-0000-0000-000000000001', 'e9300000-0000-0000-0000-000000000001', 'app',   'b1000000-0000-0000-0000-000000000003', null, now() - interval '50 day'),
  ('e9000000-0000-0000-0000-00000000000a', 'e9200000-0000-0000-0000-000000000001', 'e9300000-0000-0000-0000-000000000002', 'app',   'b1000000-0000-0000-0000-000000000003', null, now() - interval '20 day'),
  ('e9000000-0000-0000-0000-00000000000a', 'e9200000-0000-0000-0000-000000000002', 'e9300000-0000-0000-0000-000000000001', 'paper', null, 'b1000000-0000-0000-0000-000000000001', now() - interval '50 day');


-- =============================================================================
-- 1. 会員名簿
-- =============================================================================
set local role anon;
select roster_test.as_user(null);
select roster_test.expect_denied('未ログイン（anon）は名簿を読めない', $q$ select * from staff_roster $q$);

set local role authenticated;
select roster_test.as_user('b1000000-0000-0000-0000-000000000003');
select roster_test.expect('保護者が読んでも0行（自分の子も出ない）', (select count(*)::text from staff_roster), '0');

select roster_test.as_user('b1000000-0000-0000-0000-000000000001');
select roster_test.expect('事務担当には自分のクラブの4人（在籍2・申込中1・退会1。クラブ B は出ない）',
  (select string_agg(given_name || ':' || status, ',' order by family_kana) from staff_roster),
  'あい:active,いつき:active,うみ:pending,えま:withdrawn');
select roster_test.expect('学年・学年の数・年齢はデータベースの関数と一致する',
  (select bool_and(grade = grade_label(birth_date) and grade_no = grade_number(birth_date) and age = age_on(birth_date))::text
     from staff_roster), 'true');
select roster_test.expect('4月1日生まれは前の学年に入る（2018年4月1日のあいは、2015年4月2日のいつきの2学年下。3学年下ではない）',
  (select (max(grade_no) filter (where given_name = 'あい') - max(grade_no) filter (where given_name = 'いつき'))::text from staff_roster), '-2');
select roster_test.expect('クラス名（申込中は空）',
  (select string_agg(given_name || ':' || coalesce(class_name, '空'), ',' order by family_kana) from staff_roster),
  'あい:クラスX,いつき:クラスY,うみ:空,えま:クラスY');
select roster_test.expect('保護者のつながりの数（あいは1、ほかは0）',
  (select string_agg(given_name || ':' || guardian_count, ',' order by family_kana) from staff_roster),
  'あい:1,いつき:0,うみ:0,えま:0');
select roster_test.expect('最後に同意した規約（あい＝第2版・アプリ、いつき＝第1版・紙、ほかは空）',
  (select string_agg(given_name || ':' || coalesce(consent_version::text || consent_method, '空'), ',' order by family_kana) from staff_roster),
  'あい:2app,いつき:1paper,うみ:空,えま:空');
select roster_test.expect('退会日が出る',
  (select (withdrawn_on = current_date - 10)::text from staff_roster where given_name = 'えま'), 'true');

select roster_test.as_user('b1000000-0000-0000-0000-000000000002');
select roster_test.expect('コーチには担当クラス X の子だけ（つながり・同意は見えない）',
  (select string_agg(given_name || ':' || guardian_count || ':' || coalesce(consent_version::text, '空'), ',') from staff_roster),
  'あい:0:空');


-- =============================================================================
-- 2. 会員規約の改定
-- =============================================================================
set local role anon;
select roster_test.as_user(null);
select roster_test.expect_denied('未ログイン（anon）は改定を呼べない', $q$ select publish_terms('新しい本文') $q$);

set local role authenticated;
select roster_test.as_user('b1000000-0000-0000-0000-000000000003');
select roster_test.expect('保護者は改定できない（not_allowed）', (select publish_terms('新しい本文') ->> 'result'), 'not_allowed');
select roster_test.as_user('b1000000-0000-0000-0000-000000000002');
select roster_test.expect('コーチは改定できない（not_allowed）', (select publish_terms('新しい本文') ->> 'result'), 'not_allowed');

select roster_test.as_user('b1000000-0000-0000-0000-000000000001');
select roster_test.expect('空の本文は invalid_input', (select publish_terms('') ->> 'result'), 'invalid_input');
select roster_test.expect('空白と改行だけの本文は invalid_input', (select publish_terms(E'  \n\t ') ->> 'result'), 'invalid_input');
select roster_test.expect('2万文字を超える本文は invalid_input', (select publish_terms(repeat('あ', 20001)) ->> 'result'), 'invalid_input');
select roster_test.expect('いまの版（第2版）と同じ本文は unchanged（前後の空白は無視）',
  (select publish_terms(E'\n第2版の本文  ') ->> 'result'), 'unchanged');
select roster_test.expect('（ここまで）版は2つのまま', (select count(*)::text from terms_versions), '2');

select roster_test.expect('改定すると第3版になる',
  (select (r ->> 'result') || ':' || (r ->> 'version') from (select publish_terms(E'\n第3版の本文\n写真の扱いを足しました。\n') as r) as x), 'ok:3');
select roster_test.expect('本文の前後の空白・改行は落とし、公開した人が残る',
  (select body || '|' || created_by from terms_versions where version = 3),
  E'第3版の本文\n写真の扱いを足しました。|b1000000-0000-0000-0000-000000000001');
select roster_test.expect('前の版（第1版・第2版）は残る', (select string_agg(version::text, ',' order by version) from terms_versions), '1,2,3');
select roster_test.expect('もう一度改定すると第4版', (select publish_terms('第4版の本文') ->> 'version'), '4');

select roster_test.as_user('b1000000-0000-0000-0000-000000000004');
select roster_test.expect('クラブ B の最初の改定は第1版（クラブごとに数える）', (select publish_terms('Bの規約') ->> 'version'), '1');

-- 保護者 G から見ると、あいはいちばん新しい版（第4版）にまだ同意していない
select roster_test.as_user('b1000000-0000-0000-0000-000000000003');
select roster_test.expect('保護者から見た、いちばん新しい版は第4版',
  (select version::text from terms_versions order by version desc limit 1), '4');
select roster_test.expect('あいは第4版に未同意（次に開くと再同意の画面が出る）',
  (select (not exists (select 1 from terms_consents t join terms_versions v on v.id = t.terms_version_id
                        where t.member_id = 'e9200000-0000-0000-0000-000000000001' and v.version = 4))::text), 'true');


-- =============================================================================
-- 3. クラスの設定
-- =============================================================================
select roster_test.as_user('b1000000-0000-0000-0000-000000000001');
insert into classes (club_id, name, grade_min, grade_max, capacity, required_coaches, sort_order)
values ('e9000000-0000-0000-0000-00000000000a', '幼児クラス', -2, 0, 12, 2, 0);
select roster_test.expect('事務担当はクラスを追加できる',
  (select name || ':' || grade_min || '〜' || grade_max || ':' || capacity || ':' || required_coaches || ':' || is_active
     from classes where name = '幼児クラス'), '幼児クラス:-2〜0:12:2:true');
update classes set name = '幼児コース', is_active = false, capacity = null where name = '幼児クラス';
select roster_test.expect('事務担当は名前・使う／使わない・定員を変えられる',
  (select name || ':' || is_active || ':' || coalesce(capacity::text, '空') from classes where sort_order = 0 and club_id = 'e9000000-0000-0000-0000-00000000000a'),
  '幼児コース:false:空');
select roster_test.expect_denied('同じ名前のクラスは作れない',
  $q$ insert into classes (club_id, name) values ('e9000000-0000-0000-0000-00000000000a', 'クラスX') $q$);
select roster_test.expect_denied('対象学年の「から」が「まで」より大きいと断られる',
  $q$ update classes set grade_min = 5, grade_max = 2 where id = 'e9100000-0000-0000-0000-000000000001' $q$);
select roster_test.expect_denied('定員0は断られる',
  $q$ update classes set capacity = 0 where id = 'e9100000-0000-0000-0000-000000000001' $q$);

select roster_test.as_user('b1000000-0000-0000-0000-000000000002');
select roster_test.expect_denied('コーチはクラスを追加できない',
  $q$ insert into classes (club_id, name) values ('e9000000-0000-0000-0000-00000000000a', 'コーチが作る') $q$);
update classes set name = 'コーチが変えた' where id = 'e9100000-0000-0000-0000-000000000001';
select roster_test.as_user('b1000000-0000-0000-0000-000000000003');
update classes set name = '保護者が変えた' where id = 'e9100000-0000-0000-0000-000000000001';
reset role;
select roster_test.expect('コーチ・保護者が変えようとしても、クラス名は変わらない',
  (select name from classes where id = 'e9100000-0000-0000-0000-000000000001'), 'クラスX');


-- =============================================================================
-- 結果
-- =============================================================================
\o
\pset footer off
\echo ''
\echo '──────── 結果（会員名簿・会員規約の改定・クラスの設定） ────────'
select no as "#", case when ok then '○' else '×' end as "判定", label as "確かめたこと", detail as "詳細"
  from roster_test.results
 order by no;

select count(*) filter (where ok) as "合格", count(*) filter (where not ok) as "不合格"
  from roster_test.results;

do $$
declare
  v_ng integer;
begin
  select count(*) into v_ng from roster_test.results where not ok;
  if v_ng > 0 then
    raise exception '不合格が % 件あります。上の一覧で × の行を確かめてください。', v_ng;
  end if;
end;
$$;

rollback;
