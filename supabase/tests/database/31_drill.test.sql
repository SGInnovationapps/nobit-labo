-- ドリル（ラボドリの統合）：問題バンク・出題・採点・学習の記録への結びつけ
begin;
select plan(51);

-- 問題バンクは本番のデータ（マイグレーションの 20261016160000_questions.sql）が入っているので、
-- このテストの中だけ空にしてから始める（begin 〜 rollback の中なので、データは残る）
delete from public.drill_answers;
delete from public.drill_sessions;
delete from public.questions;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000d101', 'dr1@example.test'),
  ('00000000-0000-0000-0000-00000000d102', 'dr2@example.test'),
  ('00000000-0000-0000-0000-00000000d103', 'dr3@example.test'),
  ('00000000-0000-0000-0000-00000000d109', 'dr9@example.test'),
  ('00000000-0000-0000-0000-00000000d100', 'dr0@example.test');
insert into public.users (id, role, display_name, grade) values
  ('00000000-0000-0000-0000-00000000d101', 'student', '承認済みの子', 8),
  ('00000000-0000-0000-0000-00000000d102', 'student', '承認待ちの子', 7),
  ('00000000-0000-0000-0000-00000000d103', 'student', '所属のない子', 8),
  ('00000000-0000-0000-0000-00000000d109', 'club_admin', '［管理者名］', null),
  ('00000000-0000-0000-0000-00000000d100', 'operator', '運営', null);
insert into public.clubs (id, name) values ('11111111-1111-1111-1111-11111111d101', '［クラブ名］D');
insert into public.club_members (club_id, user_id, member_role, status) values
  ('11111111-1111-1111-1111-11111111d101', '00000000-0000-0000-0000-00000000d101', 'student', 'approved'),
  ('11111111-1111-1111-1111-11111111d101', '00000000-0000-0000-0000-00000000d102', 'student', 'pending'),
  ('11111111-1111-1111-1111-11111111d101', '00000000-0000-0000-0000-00000000d109', 'club_admin', 'approved');

------------------------------------------------------------------------------
-- 1. 問題バンクの作り（正解が誤答にまぎれていない・選択肢は4つ）
------------------------------------------------------------------------------
select throws_ok($$
  insert into public.questions (id, subject, grade, category, body, answer, distractors)
  values ('bad_1', '理科', 1, '気体', '問', 'あ', array['あ','い','う'])$$,
  '23514', null, '正解が誤答にも入っている問題は作れない');

select throws_ok($$
  insert into public.questions (id, subject, grade, category, body, answer, distractors)
  values ('bad_2', '理科', 1, '気体', '問', 'あ', array['い','う'])$$,
  '23514', null, '誤答が3つない問題は作れない');

select throws_ok($$
  insert into public.questions (id, subject, grade, category, body, answer, distractors)
  values ('bad_3', '数学', 1, '計算', '問', 'あ', array['い','う','え'])$$,
  '23514', null, 'ドリルのない教科（数学）は作れない');

------------------------------------------------------------------------------
-- 2. 取り込み（運営だけ。ラボドリの形から choice_1 を正解として入れる）
------------------------------------------------------------------------------
set local role authenticated;
do $$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000d101"}', true); end $$;
select throws_ok($$select public.import_questions('[]'::jsonb)$$, 'P0001', 'forbidden',
  '生徒は問題を取り込めない');
select throws_ok($$select count(*) from public.questions$$, '42501', null,
  '生徒は問題バンクを直接読めない（正解が入っているため）');
reset role;

set local role authenticated;
do $$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000d100"}', true); end $$;
select is((public.import_questions($$[
    {"id":"sci_1_001","subject":"理科","grade":1,"category":"気体の性質","difficulty":1,
     "question":"酸素を集める方法はどれか","choice_1":"水上置換","choice_2":"上方置換","choice_3":"下方置換","choice_4":"加熱",
     "explanation":"酸素は水に溶けにくい"},
    {"id":"sci_1_002","subject":"理科","grade":1,"category":"気体の性質",
     "question":"二酸化炭素を通すと白くにごる液はどれか","choice_1":"石灰水","choice_2":"食塩水","choice_3":"砂糖水","choice_4":"油"},
    {"id":"sci_1_003","subject":"理科","grade":1,"category":"気体の性質",
     "question":"水素に火を近づけるとどうなるか","choice_1":"音を立てて燃える","choice_2":"消える","choice_3":"白くにごる","choice_4":"変化しない"},
    {"id":"sci_2_001","subject":"理科","grade":2,"category":"化学変化",
     "question":"鉄が酸素と結びつく変化はどれか","choice_1":"酸化","choice_2":"還元","choice_3":"蒸発","choice_4":"融解"},
    {"id":"sci_3_001","subject":"理科","grade":3,"category":"運動とエネルギー",
     "question":"物体にはたらく力がつり合っているときの運動はどれか","choice_1":"等速直線運動","choice_2":"加速","choice_3":"静止だけ","choice_4":"自由落下"},
    {"id":"eng_1_001","subject":"英語","grade":1,"category":"be動詞",
     "question":"I ___ a student. に入るのはどれか","choice_1":"am","choice_2":"is","choice_3":"are","choice_4":"be"}
  ]$$::jsonb) ->> 'added')::int, 6, '運営は6問を取り込める');
select is((select count(*)::int from public.question_bank_summary()), 2, '内訳は教科ごとに出る');
reset role;

select is((select answer from public.questions where id = 'sci_1_001'), '水上置換',
  'choice_1 が正解として入る');
select is((select distractors from public.questions where id = 'sci_1_001'),
  array['上方置換','下方置換','加熱'], 'choice_2〜4 が誤答として入る');

------------------------------------------------------------------------------
-- 3. 始める（所属と教科と単元の確かめ）
------------------------------------------------------------------------------
set local role authenticated;
do $$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000d103"}', true); end $$;
select throws_ok($$select public.start_drill('理科')$$, 'P0001', 'not_approved_student',
  '所属のない生徒は始められない');
reset role;

set local role authenticated;
do $$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000d102"}', true); end $$;
select lives_ok($$select public.start_drill('理科', 'mixed', null, 3::smallint, 3::smallint)$$,
  '承認待ちの生徒も始められる');
reset role;

set local role authenticated;
do $$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000d101"}', true); end $$;
select throws_ok($$select public.start_drill('数学')$$, '23514', null, 'ドリルのない教科は始められない');
select throws_ok($$select public.start_drill('理科', 'unit')$$, 'P0001', 'category_required',
  '単元を選ぶときは単元が要る');
select throws_ok($$select public.start_drill('社会')$$, 'P0001', 'no_questions',
  '問題のない教科は始められない');

-- 学年を入れなければ、本人の学年まで（中2 → 中1・中2 の問題だけ）
select is((public.start_drill('理科', 'mixed', null, null, 10::smallint) ->> 'total')::int, 4,
  '中2 の生徒には中3 の問題を出さない（4問）');
select is((select grade_max::int from public.drill_sessions where student_id = '00000000-0000-0000-0000-00000000d101'
            and not finished), 2, '出題の範囲は中2 まで');

-- 単元を選ぶと、その単元だけ
select is((public.start_drill('理科', 'unit', '気体の性質', 3::smallint, 10::smallint) ->> 'total')::int, 3,
  '単元を選ぶと、その単元の3問だけ');
select is((select count(*)::int from public.drill_sessions
            where student_id = '00000000-0000-0000-0000-00000000d101' and not finished), 1,
  'やりかけは1つだけ残る（前のものは終わりになる）');

------------------------------------------------------------------------------
-- 4. 出題：正解を画面に渡さない
------------------------------------------------------------------------------
select ok((public.drill_next((select id from public.drill_sessions where student_id = '00000000-0000-0000-0000-00000000d101' and not finished))
            -> 'question' -> 'choices') is not null, '選択肢は4つ返る');
select is(jsonb_array_length(public.drill_next((select id from public.drill_sessions
            where student_id = '00000000-0000-0000-0000-00000000d101' and not finished)) -> 'question' -> 'choices'), 4,
  '選択肢はちょうど4つ');
select ok(not (public.drill_next((select id from public.drill_sessions
            where student_id = '00000000-0000-0000-0000-00000000d101' and not finished)) -> 'question' ? 'answer'),
  'どれが正解かは返さない');
reset role;

------------------------------------------------------------------------------
-- 5. 採点と、解き終えたときの記録（3問を全問正解で解き終える）
------------------------------------------------------------------------------
create function pg_temp.play(p_session uuid, p_correct_count int, p_total int)
returns void language plpgsql security definer as $$
declare
  v_q jsonb;
  v_ans text;
  v_i int := 0;
begin
  loop
    v_q := public.drill_next(p_session) -> 'question';
    -- 解き終えると question は JSON の null で返る（SQL の NULL ではない）
    exit when v_q is null or jsonb_typeof(v_q) = 'null';
    v_i := v_i + 1;
    select q.answer into v_ans from public.questions q where q.id = v_q ->> 'id';
    perform public.answer_drill(p_session, v_q ->> 'id',
      case when v_i <= p_correct_count then v_ans else 'でたらめ' end);
    exit when v_i >= p_total;
  end loop;
end;
$$;

set local role authenticated;
do $$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000d101"}', true); end $$;
select pg_temp.play((select id from public.drill_sessions where student_id = '00000000-0000-0000-0000-00000000d101' and not finished), 2, 3);

select is((select count(*)::int from public.drill_sessions
            where student_id = '00000000-0000-0000-0000-00000000d101' and not finished), 0,
  '解き終えたドリルは終わりになる');
select is((select correct::int from public.drill_sessions
            where student_id = '00000000-0000-0000-0000-00000000d101' and finished and answered = 3), 2,
  '正解は2問と数える');
select is((select count(*)::int from public.drill_answers
            where student_id = '00000000-0000-0000-0000-00000000d101'), 3, '1問ごとの回答が残る');
select is((select count(*)::int from public.study_records
            where student_id = '00000000-0000-0000-0000-00000000d101'), 1, '教科の記録が1件できる');
select is((select kind || '/' || subject from public.study_records
            where student_id = '00000000-0000-0000-0000-00000000d101'), 'tag/理科',
  '理科の教科の記録として残る');
select is((select content from public.study_records where student_id = '00000000-0000-0000-0000-00000000d101'),
  'ドリル 気体の性質 2/3', '内容に単元と正解数が入る');
select is((select completed_count::int from public.daily_activity
            where student_id = '00000000-0000-0000-0000-00000000d101'), 1, '記録の帯に1件');
select is((select current_days::int from public.streaks
            where student_id = '00000000-0000-0000-0000-00000000d101'), 1, '連続記録が1日になる');
select ok((select id from public.drill_sessions where student_id = '00000000-0000-0000-0000-00000000d101'
            and answered = 3) is not null
          and (select study_record_id from public.drill_sessions
                where student_id = '00000000-0000-0000-0000-00000000d101' and answered = 3) is not null,
  'ドリルと記録が結びつく');

------------------------------------------------------------------------------
-- 6. 同じ教科を記録ずみなら、記録は増やさず内容に書き足す
------------------------------------------------------------------------------
select is((public.start_drill('理科', 'unit', '化学変化', 3::smallint, 10::smallint) ->> 'total')::int, 1,
  '別の単元で、もう1回始められる');
select pg_temp.play((select id from public.drill_sessions where student_id = '00000000-0000-0000-0000-00000000d101' and not finished), 1, 1);
select is((select count(*)::int from public.study_records
            where student_id = '00000000-0000-0000-0000-00000000d101'), 1, '記録は増やさない');
select is((select content from public.study_records where student_id = '00000000-0000-0000-0000-00000000d101'),
  'ドリル 気体の性質 2/3 ドリル 化学変化 1/1', '内容に書き足す');
select is((select completed_count::int from public.daily_activity
            where student_id = '00000000-0000-0000-0000-00000000d101'), 1, '記録の数は増えない（同じ教科は1日1回）');

------------------------------------------------------------------------------
-- 7. 途中でやめたら記録にしない（解いた分は正解率に残る）
------------------------------------------------------------------------------
select is((public.start_drill('英語', 'mixed', null, 3::smallint, 1::smallint) ->> 'total')::int, 1, '英語を始める');
select is((public.abandon_drill((select id from public.drill_sessions
            where student_id = '00000000-0000-0000-0000-00000000d101' and not finished)) ->> 'reason'), 'not_finished',
  '途中でやめたドリルは記録にしない');
select is((select count(*)::int from public.study_records
            where student_id = '00000000-0000-0000-0000-00000000d101' and subject = '英語'), 0,
  '英語の記録はできない');

------------------------------------------------------------------------------
-- 8. まちがえた問題（最後の回答が不正解のものだけ出て、正解すると外れる）
------------------------------------------------------------------------------
select is(public.my_drill_wrong_count('理科', 3::smallint), 1, 'まちがえた問題は1問');
select is((select percent from public.my_drill_units('理科', 2::smallint) where category = '気体の性質'), 67,
  '単元の正解率は3問中2問で67%');
select is((select tried from public.my_drill_units('理科', 2::smallint) where category = '化学変化'), 1,
  '解いた問題数も単元ごとに出る');
select is((public.start_drill('理科', 'wrong', null, 3::smallint, 10::smallint) ->> 'total')::int, 1,
  'まちがえた問題だけが出る');
select pg_temp.play((select id from public.drill_sessions where student_id = '00000000-0000-0000-0000-00000000d101' and not finished), 1, 1);
select is(public.my_drill_wrong_count('理科', 3::smallint), 0, '正解するとまちがえた問題から外れる');
select throws_ok($$select public.start_drill('理科', 'wrong', null, 3::smallint, 10::smallint)$$,
  'P0001', 'no_questions', 'まちがえた問題がなければ始められない');
reset role;

------------------------------------------------------------------------------
-- 9. ドリルの配信タスク：解き終えるとタスクが完了する（記録は二重にしない）
------------------------------------------------------------------------------
insert into public.tasks (id, club_id, title, subject, kind, recurrence, starts_on) values
  ('22222222-2222-2222-2222-22222222d101', '11111111-1111-1111-1111-11111111d101', '社会 ドリル', '社会', 'assigned', 'daily', private.jst_today());
insert into public.questions (id, subject, grade, category, body, answer, distractors) values
  ('soc_1_001', '社会', 1, '地理', '日本の標準時子午線が通る市はどれか', '明石', array['京都','那覇','札幌']);

set local role authenticated;
do $$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000d101"}', true); end $$;
select lives_ok($$select public.sync_today_tasks()$$, '配信タスクを展開する');
select is((public.start_drill('社会', 'mixed', null, 3::smallint, 1::smallint,
            (select id from public.user_tasks where student_id = '00000000-0000-0000-0000-00000000d101' limit 1)) ->> 'total')::int,
  1, 'タスクからドリルを始める');
-- わざと不正解で解き終える（正解数は問わず完了する）
select pg_temp.play((select id from public.drill_sessions where student_id = '00000000-0000-0000-0000-00000000d101' and not finished), 0, 1);
select ok((select completed_at from public.user_tasks where student_id = '00000000-0000-0000-0000-00000000d101' limit 1) is not null,
  '正解できなくても、解き終えればタスクは完了する');
select is((select count(*)::int from public.study_records
            where student_id = '00000000-0000-0000-0000-00000000d101' and subject = '社会'), 0,
  'タスクの完了が記録になるので、教科の記録は作らない');
select is((select completed_count::int from public.daily_activity
            where student_id = '00000000-0000-0000-0000-00000000d101'), 2, '記録の数はタスクの分だけ増える');
reset role;

------------------------------------------------------------------------------
-- 10. 見える範囲：クラブ管理者に正解数は見せない
------------------------------------------------------------------------------
set local role authenticated;
do $$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000d109"}', true); end $$;
select is((select count(*)::int from public.drill_sessions), 0, 'クラブ管理者にドリルの結果は見えない');
select is((select count(*)::int from public.drill_answers), 0, 'クラブ管理者に1問ごとの回答は見えない');
reset role;

set local role authenticated;
do $$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000d100"}', true); end $$;
select ok((select count(*) from public.drill_sessions) > 0, '運営にはドリルの結果が見える');
reset role;

select * from finish();
rollback;
