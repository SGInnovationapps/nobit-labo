-- ラボドリの統合（v1.8 5-8章）：問題バンクと、ドリルの出題・採点
--
-- 方針（仕様書 v1.8）
-- ・ラボドリ（英語・理科・社会の四択、中1〜中3）を、別アプリにせず「教科の記録」の中のドリルとして持つ
-- ・正解は画面側に渡さない。選択肢はサーバー側で並べ替えて返し、採点もサーバー側で行う
-- ・10問を解き終えたら、その教科の記録にする。同じ教科を記録ずみなら、記録の内容に追記する
-- ・途中でやめたら記録にしない（解いた分は正解率と「まちがえた問題」に反映する）
-- ・正解数と単元別の結果は運営だけが見る。クラブ管理者には見せない
--
-- このファイルはテーブルと問題バンクの出し入れまで。出題・採点は次のマイグレーション。

-- ===== 問題バンク =====
-- 全クラブ共通のデータなので、club_id を持たない（「すべてのテーブルに club_id」の例外。v1.8 7章）
create table public.questions (
  -- id はラボドリの questions.json の値をそのまま使う（取り込み直しても同じ問題が同じ id になる）
  id text primary key check (id ~ '^[A-Za-z0-9_.:-]{1,48}$'),
  subject text not null check (subject in ('英語', '理科', '社会')),
  grade smallint not null check (grade between 1 and 3),
  category text not null check (char_length(btrim(category)) between 1 and 60),
  difficulty smallint not null default 1 check (difficulty between 1 and 3),
  body text not null check (char_length(btrim(body)) between 1 and 400),
  answer text not null check (char_length(btrim(answer)) between 1 and 120),
  distractors text[] not null check (
    array_length(distractors, 1) = 3
    and btrim(coalesce(distractors[1], '')) <> ''
    and btrim(coalesce(distractors[2], '')) <> ''
    and btrim(coalesce(distractors[3], '')) <> ''
  ),
  explanation text check (explanation is null or char_length(explanation) <= 400),
  image_url text check (image_url is null or char_length(image_url) <= 300),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- 正解が誤答にも入っていると、選択肢が2つ正解になる
  constraint questions_answer_not_in_distractors check (not (answer = any (distractors)))
);
comment on table public.questions is 'ドリルの問題バンク（ラボドリ由来）。全クラブ共通のため club_id を持たない。生徒は直接読めず、出題と採点は関数を通す。';

create index questions_pick_idx on public.questions (subject, grade, category) where active;

create trigger questions_touch before update on public.questions
  for each row execute function private.touch_updated_at();

alter table public.questions enable row level security;
-- 正解が入っているので、画面からは一切読ませない（出題・採点は security definer の関数だけ）
revoke all on public.questions from anon, authenticated;

-- ===== ドリル1回分 =====
create table public.drill_sessions (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete restrict,
  student_id uuid not null references public.users (id) on delete cascade,
  subject text not null check (subject in ('英語', '理科', '社会')),
  mode text not null check (mode in ('mixed', 'unit', 'wrong')),
  category text,
  grade_max smallint not null check (grade_max between 1 and 3),
  total smallint not null check (total between 1 and 50),
  answered smallint not null default 0 check (answered >= 0),
  correct smallint not null default 0 check (correct >= 0),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  finished boolean not null default false,
  -- 解き終えたときに作る／結びつける学習の記録
  study_record_id uuid references public.study_records (id) on delete set null,
  -- ドリルの配信タスクから始めたとき
  user_task_id uuid references public.user_tasks (id) on delete set null,
  constraint drill_sessions_unit_category check (mode <> 'unit' or category is not null),
  constraint drill_sessions_counts check (correct <= answered and answered <= total),
  constraint drill_sessions_finished check ((ended_at is null) = (not finished))
);
comment on table public.drill_sessions is 'ドリル1回分。正解数は運営だけが読む（クラブ管理者には見せない）。';

create index drill_sessions_student_idx on public.drill_sessions (student_id, started_at desc);
-- 1人が同時に進められるドリルは1つ
create unique index drill_sessions_one_running on public.drill_sessions (student_id) where not finished;

alter table public.drill_sessions enable row level security;
create policy drill_sessions_select on public.drill_sessions for select to authenticated
  using (student_id = (select auth.uid()) or (select private.is_operator()));

-- ===== 1問ごとの回答 =====
create table public.drill_answers (
  id bigint generated always as identity primary key,
  session_id uuid not null references public.drill_sessions (id) on delete cascade,
  club_id uuid not null references public.clubs (id) on delete restrict,
  student_id uuid not null references public.users (id) on delete cascade,
  question_id text not null references public.questions (id) on delete cascade,
  correct boolean not null,
  answered_at timestamptz not null default now(),
  unique (session_id, question_id)
);
comment on table public.drill_answers is '問題ごとの回答。単元ごとの正解率と「まちがえた問題」をここから計算する。';

create index drill_answers_student_q_idx on public.drill_answers (student_id, question_id, answered_at desc);

alter table public.drill_answers enable row level security;
create policy drill_answers_select on public.drill_answers for select to authenticated
  using (student_id = (select auth.uid()) or (select private.is_operator()));

-- ===== 問題バンクの出し入れ（運営だけ）=====

-- 取り込み。ラボドリの questions.json と同じ形の配列を渡す。
-- 1件：{"id","subject","grade","category","difficulty","question","choice_1".."choice_4","explanation","image_url"}
-- choice_1 が正解、choice_2〜4 が誤答（ラボドリの決まり）。同じ id は上書きする。
create function public.import_questions(p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before integer;
  v_after integer;
begin
  if (select auth.uid()) is null then
    raise exception 'not_authenticated';
  end if;
  if not private.is_operator() then
    raise exception 'forbidden';
  end if;
  if jsonb_typeof(p_rows) <> 'array' then
    raise exception 'rows_must_be_array';
  end if;

  select count(*) into v_before from public.questions;

  insert into public.questions (id, subject, grade, category, difficulty, body, answer, distractors, explanation, image_url)
  select r.id, r.subject, r.grade, btrim(r.category), coalesce(r.difficulty, 1), r.question, r.choice_1,
         array[r.choice_2, r.choice_3, r.choice_4], nullif(btrim(coalesce(r.explanation, '')), ''),
         nullif(btrim(coalesce(r.image_url, '')), '')
    from jsonb_to_recordset(p_rows) as r(
      id text, subject text, grade smallint, category text, difficulty smallint, question text,
      choice_1 text, choice_2 text, choice_3 text, choice_4 text, explanation text, image_url text
    )
  on conflict (id) do update
    set subject = excluded.subject, grade = excluded.grade, category = excluded.category,
        difficulty = excluded.difficulty, body = excluded.body, answer = excluded.answer,
        distractors = excluded.distractors, explanation = excluded.explanation, image_url = excluded.image_url,
        active = true;

  select count(*) into v_after from public.questions;
  return jsonb_build_object('received', jsonb_array_length(p_rows), 'added', v_after - v_before, 'total', v_after);
end;
$$;
revoke all on function public.import_questions(jsonb) from public, anon;
grant execute on function public.import_questions(jsonb) to authenticated;

-- 問題バンクの内訳（運営の管理画面で、教科ごとの単元数と問題数を出す）
create function public.question_bank_summary()
returns table (subject text, units integer, questions integer, grades smallint[])
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'not_authenticated';
  end if;
  if not private.is_operator() then
    raise exception 'forbidden';
  end if;
  return query
    select q.subject,
           count(distinct q.category)::int,
           count(*)::int,
           array_agg(distinct q.grade order by q.grade)
      from public.questions q
     where q.active
     group by q.subject
     order by q.subject;
end;
$$;
revoke all on function public.question_bank_summary() from public, anon;
grant execute on function public.question_bank_summary() to authenticated;
