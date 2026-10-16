-- ラボドリの統合（2）：出題・採点と、学習の記録への結びつけ
--
-- 正解は画面に渡さない。出題のたびに選択肢をサーバー側で並べ替えて返し、
-- 採点も answer_drill の中で行う（画面から送るのは、選んだ選択肢の文字列）。

-- ===== 出題の対象 =====

-- 「まちがえた問題」：同じ問題の最後の回答が不正解のもの（次に正解すると外れる）
create function private.drill_wrong_ids(p_student_id uuid, p_subject text, p_grade_max smallint)
returns table (question_id text)
language sql
stable
security definer
set search_path = ''
as $$
  select q.id
    from (
      select distinct on (da.question_id) da.question_id, da.correct
        from public.drill_answers da
       where da.student_id = p_student_id
       -- 同じ時刻に並んだときは、あとから入れた行（id が大きいほう）を最後の回答とする
       order by da.question_id, da.answered_at desc, da.id desc
    ) a
    join public.questions q on q.id = a.question_id
   where not a.correct and q.active and q.subject = p_subject and q.grade <= p_grade_max
$$;

-- 出題の候補。mode は mixed（おまかせ）／unit（単元）／wrong（まちがえた問題）
create function private.drill_pool(
  p_student_id uuid, p_subject text, p_grade_max smallint, p_mode text, p_category text
)
returns table (question_id text)
language sql
stable
security definer
set search_path = ''
as $$
  select q.id
    from public.questions q
   where q.active and q.subject = p_subject and q.grade <= p_grade_max
     and (p_mode <> 'unit' or q.category = p_category)
     and (p_mode <> 'wrong' or q.id in (select w.question_id from private.drill_wrong_ids(p_student_id, p_subject, p_grade_max) w))
$$;

-- ===== 生徒の画面で使う一覧（ドリルの入口）=====

-- 単元ごとの正解率。まだ解いていない単元も出す
create function public.my_drill_units(p_subject text, p_grade_max smallint default 3)
returns table (category text, questions integer, tried integer, correct integer, percent integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  return query
    select q.category,
           count(*)::int as questions,
           count(a.question_id)::int as tried,
           count(*) filter (where a.correct)::int as correct,
           case when count(a.question_id) = 0 then 0
                else round(100.0 * count(*) filter (where a.correct) / count(a.question_id))::int
           end as percent
      from public.questions q
      left join lateral (
        select distinct on (da.question_id) da.question_id, da.correct
          from public.drill_answers da
         where da.student_id = v_uid and da.question_id = q.id
         order by da.question_id, da.answered_at desc, da.id desc
      ) a on true
     where q.active and q.subject = p_subject and q.grade <= coalesce(p_grade_max, 3)
     group by q.category
     order by q.category;
end;
$$;
revoke all on function public.my_drill_units(text, smallint) from public, anon;
grant execute on function public.my_drill_units(text, smallint) to authenticated;

-- 「まちがえた問題」の件数（入口のボタンに出す）
create function public.my_drill_wrong_count(p_subject text, p_grade_max smallint default 3)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  return (select count(*)::int from private.drill_wrong_ids(v_uid, p_subject, coalesce(p_grade_max, 3::smallint)));
end;
$$;
revoke all on function public.my_drill_wrong_count(text, smallint) from public, anon;
grant execute on function public.my_drill_wrong_count(text, smallint) to authenticated;

-- ===== 1問を取り出す =====

-- 選択肢は毎回並べ替えて返す。正解がどれかは返さない
create function private.drill_question_json(p_session public.drill_sessions)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_q public.questions;
begin
  select q.* into v_q
    from private.drill_pool(p_session.student_id, p_session.subject, p_session.grade_max, p_session.mode, p_session.category) p
    join public.questions q on q.id = p.question_id
   where not exists (
     select 1 from public.drill_answers da where da.session_id = p_session.id and da.question_id = q.id
   )
   order by random()
   limit 1;
  if not found then
    return null;
  end if;
  return jsonb_build_object(
    'id', v_q.id,
    'subject', v_q.subject,
    'grade', v_q.grade,
    'category', v_q.category,
    'body', v_q.body,
    'image_url', v_q.image_url,
    'choices', (select jsonb_agg(c order by random()) from unnest(array[v_q.answer] || v_q.distractors) as c)
  );
end;
$$;

-- ===== 始める =====

create function public.start_drill(
  p_subject text,
  p_mode text default 'mixed',
  p_category text default null,
  p_grade_max smallint default null,
  p_total smallint default 10,
  p_user_task_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_club_id uuid;
  v_grade_max smallint;
  v_total smallint := coalesce(p_total, 10);
  v_pool integer;
  v_session public.drill_sessions;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  v_club_id := private.my_usable_club_id();
  if v_club_id is null then
    raise exception 'not_approved_student';
  end if;
  if p_subject is null or p_subject not in ('英語', '理科', '社会') then
    raise exception 'invalid_subject' using errcode = '23514';
  end if;
  if p_mode is null or p_mode not in ('mixed', 'unit', 'wrong') then
    raise exception 'invalid_mode';
  end if;
  if p_mode = 'unit' and nullif(btrim(coalesce(p_category, '')), '') is null then
    raise exception 'category_required';
  end if;
  if v_total < 1 or v_total > 50 then
    raise exception 'invalid_total';
  end if;

  -- 学年は、入っていなければ本人の学年から（中1=7, 中2=8, 中3=9）
  v_grade_max := coalesce(
    p_grade_max,
    (select greatest(1, least(3, u.grade - 6))::smallint from public.users u where u.id = v_uid),
    3
  );

  -- やりかけが残っていたら、そこで終わりにする（記録は作らない）
  update public.drill_sessions
     set finished = true, ended_at = now()
   where student_id = v_uid and not finished;

  select count(*) into v_pool
    from private.drill_pool(v_uid, p_subject, v_grade_max, p_mode, p_category);
  if v_pool = 0 then
    raise exception 'no_questions';
  end if;

  insert into public.drill_sessions (club_id, student_id, subject, mode, category, grade_max, total, user_task_id)
  values (v_club_id, v_uid, p_subject, p_mode, nullif(btrim(coalesce(p_category, '')), ''), v_grade_max,
          least(v_total, v_pool)::smallint, p_user_task_id)
  returning * into v_session;

  return jsonb_build_object(
    'session_id', v_session.id,
    'subject', v_session.subject,
    'mode', v_session.mode,
    'category', v_session.category,
    'total', v_session.total,
    'answered', 0,
    'correct', 0,
    'question', private.drill_question_json(v_session)
  );
end;
$$;
revoke all on function public.start_drill(text, text, text, smallint, smallint, uuid) from public, anon;
grant execute on function public.start_drill(text, text, text, smallint, smallint, uuid) to authenticated;

-- ===== 次の1問 =====

create function public.drill_next(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_session public.drill_sessions;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  select * into v_session from public.drill_sessions s where s.id = p_session_id and s.student_id = v_uid;
  if not found then
    raise exception 'session_not_found';
  end if;
  if v_session.finished or v_session.answered >= v_session.total then
    return jsonb_build_object('question', null, 'answered', v_session.answered, 'total', v_session.total);
  end if;
  return jsonb_build_object(
    'question', private.drill_question_json(v_session),
    'answered', v_session.answered,
    'total', v_session.total
  );
end;
$$;
revoke all on function public.drill_next(uuid) from public, anon;
grant execute on function public.drill_next(uuid) to authenticated;

-- ===== 解き終えたときの記録 =====

-- 10問を解き終えたら、その教科の記録にする。
-- ドリルの配信タスクから始めたときは、そのタスクの完了をもって記録とする（報酬の二重付与を避ける）。
create function private.finish_drill(p_session_id uuid, p_at timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_s public.drill_sessions;
  v_date date := private.jst_date(p_at);
  v_label text;
  v_note text;
  v_existing public.study_records;
  v_record_id uuid;
  v_task jsonb;
  v_outcome jsonb := '{}'::jsonb;
  v_coins integer := 0;
begin
  select * into v_s from public.drill_sessions s where s.id = p_session_id for update;
  if not found or v_s.finished then
    raise exception 'session_not_found';
  end if;

  update public.drill_sessions set finished = true, ended_at = p_at where id = p_session_id;

  -- 途中でやめたときは記録にしない（解いた分は drill_answers に残る）
  if v_s.answered < v_s.total then
    return jsonb_build_object('recorded', false, 'reason', 'not_finished');
  end if;

  -- 配信タスクのドリルは、タスクの完了が記録になる（正解数は問わない）
  if v_s.user_task_id is not null then
    begin
      v_task := private.complete_task_at(v_s.user_task_id, v_s.student_id, p_at);
    exception when others then
      v_task := null;
    end;
    if v_task is not null then
      return jsonb_build_object('recorded', true, 'via', 'task') || v_task;
    end if;
  end if;

  v_label := case v_s.mode when 'unit' then v_s.category when 'wrong' then 'まちがえた問題' else 'おまかせ' end;
  v_note := 'ドリル ' || v_label || ' ' || v_s.correct || '/' || v_s.total;

  perform pg_advisory_xact_lock(hashtext(v_s.student_id::text || ':' || v_s.subject || ':' || v_date::text));

  select * into v_existing
    from public.study_records r
   where r.student_id = v_s.student_id and r.kind = 'tag' and r.subject = v_s.subject and r.record_date = v_date
   order by r.started_at
   limit 1;

  if found then
    -- 同じ教科を記録ずみ：新しい記録は作らず、内容に書き足す（60文字に収まるときだけ）
    v_record_id := v_existing.id;
    update public.study_records
       set content = case
             when coalesce(btrim(v_existing.content), '') = '' then left(v_note, 60)
             when char_length(v_existing.content || ' ' || v_note) <= 60 then v_existing.content || ' ' || v_note
             else v_existing.content
           end
     where id = v_existing.id;
  else
    insert into public.study_records (club_id, student_id, kind, subject, content, started_at, ended_at, record_date)
    values (v_s.club_id, v_s.student_id, 'tag', v_s.subject, left(v_note, 60), v_s.started_at, p_at, v_date)
    returning id into v_record_id;

    perform private.record_study_activity(v_s.student_id, v_s.club_id, v_date);
    v_coins := private.award_study_day(v_s.student_id, v_s.club_id, v_date);
  end if;

  update public.drill_sessions set study_record_id = v_record_id where id = p_session_id;
  v_outcome := private.record_outcome(v_s.student_id, v_date);

  return v_outcome || jsonb_build_object(
    'recorded', true, 'via', 'tag', 'record_id', v_record_id, 'recorded_at', p_at,
    'already_recorded', v_existing.id is not null, 'coins_granted', v_coins
  );
end;
$$;

-- ===== 答える =====

create function private.answer_drill_at(p_session_id uuid, p_question_id text, p_choice text, p_at timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_s public.drill_sessions;
  v_q public.questions;
  v_correct boolean;
  v_rows integer;
  v_result jsonb := '{}'::jsonb;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  select * into v_s from public.drill_sessions s where s.id = p_session_id and s.student_id = v_uid for update;
  if not found then
    raise exception 'session_not_found';
  end if;
  if v_s.finished then
    raise exception 'session_finished';
  end if;
  if v_s.answered >= v_s.total then
    raise exception 'session_finished';
  end if;

  select * into v_q from public.questions q where q.id = p_question_id and q.active;
  if not found then
    raise exception 'question_not_found';
  end if;
  if v_q.subject <> v_s.subject or v_q.grade > v_s.grade_max then
    raise exception 'question_out_of_range';
  end if;

  v_correct := (p_choice is not null and p_choice = v_q.answer);

  -- 同じ問題への二度目の回答は受け付けない（点数を稼げないように）
  insert into public.drill_answers (session_id, club_id, student_id, question_id, correct, answered_at)
  values (p_session_id, v_s.club_id, v_uid, p_question_id, v_correct, p_at)
  on conflict (session_id, question_id) do nothing;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    raise exception 'already_answered';
  end if;

  update public.drill_sessions
     set answered = answered + 1, correct = correct + (case when v_correct then 1 else 0 end)
   where id = p_session_id
  returning * into v_s;

  if v_s.answered >= v_s.total then
    v_result := private.finish_drill(p_session_id, p_at);
  end if;

  return jsonb_build_object(
    'correct', v_correct,
    'answer', v_q.answer,
    'explanation', v_q.explanation,
    'answered', v_s.answered,
    'total', v_s.total,
    'correct_count', v_s.correct,
    'finished', v_s.answered >= v_s.total,
    'result', case when v_s.answered >= v_s.total then v_result else null end
  );
end;
$$;

create function public.answer_drill(p_session_id uuid, p_question_id text, p_choice text)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select private.answer_drill_at(p_session_id, p_question_id, p_choice, now())
$$;
revoke all on function public.answer_drill(uuid, text, text) from public, anon;
grant execute on function public.answer_drill(uuid, text, text) to authenticated;

-- ===== やめる =====

create function public.abandon_drill(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_s public.drill_sessions;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  select * into v_s from public.drill_sessions s where s.id = p_session_id and s.student_id = v_uid;
  if not found then
    raise exception 'session_not_found';
  end if;
  if v_s.finished then
    return jsonb_build_object('recorded', false, 'reason', 'already_finished');
  end if;
  return private.finish_drill(p_session_id, now());
end;
$$;
revoke all on function public.abandon_drill(uuid) from public, anon;
grant execute on function public.abandon_drill(uuid) to authenticated;

-- ===== 結果の画面で出す、単元の伸び =====

create function public.drill_result(p_session_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_s public.drill_sessions;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  select * into v_s from public.drill_sessions s where s.id = p_session_id and s.student_id = v_uid;
  if not found then
    raise exception 'session_not_found';
  end if;
  return jsonb_build_object(
    'session_id', v_s.id,
    'subject', v_s.subject,
    'mode', v_s.mode,
    'category', v_s.category,
    'total', v_s.total,
    'answered', v_s.answered,
    'correct', v_s.correct,
    'finished', v_s.finished,
    'missed', (
      select coalesce(jsonb_agg(jsonb_build_object('question', q.body, 'answer', q.answer, 'explanation', q.explanation)
                                order by da.answered_at), '[]'::jsonb)
        from public.drill_answers da
        join public.questions q on q.id = da.question_id
       where da.session_id = v_s.id and not da.correct
    )
  );
end;
$$;
revoke all on function public.drill_result(uuid) from public, anon;
grant execute on function public.drill_result(uuid) to authenticated;
