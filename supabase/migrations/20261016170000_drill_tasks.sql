-- ドリルの配信タスク（仕様書 v1.8 5-8章）
--
-- 運営がタスクに「ドリル」の指定（教科・単元・問題数）を付けて配信できるようにする。
-- 生徒はそのタスクからドリルを始め、正解数を問わず解き終えると、そのタスクが完了になる。
-- 完了の処理は private.finish_drill が行うので、ふつうの「完了」ボタンからは完了させない。

alter table public.tasks
  add column drill_subject text
    check (drill_subject is null or drill_subject in ('英語', '理科', '社会')),
  add column drill_category text
    check (drill_category is null or char_length(btrim(drill_category)) between 1 and 60),
  add column drill_total smallint
    check (drill_total is null or drill_total between 1 and 50),
  add column drill_grade_max smallint
    check (drill_grade_max is null or drill_grade_max between 1 and 3);

comment on column public.tasks.drill_subject is 'ドリルのタスクのときだけ入る。ここが null でなければドリルのタスク';
comment on column public.tasks.drill_category is '単元。null なら、その教科のおまかせ';
comment on column public.tasks.drill_grade_max is '出題の範囲（1〜3）。null なら生徒の学年まで';

-- ドリルの指定は、そろっているか、まるごとないか。教科はタスクの教科とそろえる。
-- 生徒の自由登録ではドリルのタスクを作れない
alter table public.tasks add constraint tasks_drill_shape check (
  drill_subject is null
  or (subject = drill_subject and drill_total is not null and kind = 'assigned')
);
-- ドリルの指定がないのに、単元や問題数だけが入っているのを防ぐ
alter table public.tasks add constraint tasks_drill_fields check (
  drill_subject is not null
  or (drill_category is null and drill_total is null and drill_grade_max is null)
);

-- ===== 「完了」ボタンからは完了させない =====
create or replace function public.complete_task(p_user_task_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  -- ドリルのタスクは、問題を解き終えたときだけ完了になる（private.finish_drill が行う）
  if exists (
    select 1
      from public.user_tasks ut
      join public.tasks t on t.id = ut.task_id
     where ut.id = p_user_task_id and ut.student_id = v_uid and t.drill_subject is not null
  ) then
    raise exception 'drill_task_needs_drill';
  end if;
  return private.complete_task_at(p_user_task_id, v_uid, now());
end;
$$;

-- ===== タスクから始めるドリルは、タスクの指定どおりに出す =====
-- 画面から渡された教科や単元ではなく、運営が決めた指定を使う
create or replace function public.start_drill(
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
  v_subject text := p_subject;
  v_mode text := p_mode;
  v_category text := nullif(btrim(coalesce(p_category, '')), '');
  v_grade_max smallint;
  v_total smallint := coalesce(p_total, 10);
  v_pool integer;
  v_task record;
  v_session public.drill_sessions;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  v_club_id := private.my_usable_club_id();
  if v_club_id is null then
    raise exception 'not_approved_student';
  end if;

  -- タスクから始めたときは、運営が決めた指定で上書きする
  if p_user_task_id is not null then
    select t.drill_subject, t.drill_category, t.drill_total, t.drill_grade_max, ut.completed_at
      into v_task
      from public.user_tasks ut
      join public.tasks t on t.id = ut.task_id
     where ut.id = p_user_task_id and ut.student_id = v_uid;
    if not found then
      raise exception 'task_not_found';
    end if;
    if v_task.drill_subject is null then
      raise exception 'not_a_drill_task';
    end if;
    if v_task.completed_at is not null then
      raise exception 'already_completed';
    end if;
    v_subject := v_task.drill_subject;
    v_category := v_task.drill_category;
    v_mode := case when v_task.drill_category is null then 'mixed' else 'unit' end;
    v_total := v_task.drill_total;
    if v_task.drill_grade_max is not null then
      v_grade_max := v_task.drill_grade_max;
    end if;
  end if;

  if v_subject is null or v_subject not in ('英語', '理科', '社会') then
    raise exception 'invalid_subject' using errcode = '23514';
  end if;
  if v_mode is null or v_mode not in ('mixed', 'unit', 'wrong') then
    raise exception 'invalid_mode';
  end if;
  if v_mode = 'unit' and v_category is null then
    raise exception 'category_required';
  end if;
  if v_total < 1 or v_total > 50 then
    raise exception 'invalid_total';
  end if;

  -- 学年は、入っていなければ本人の学年から（中1=7, 中2=8, 中3=9）
  v_grade_max := coalesce(
    v_grade_max,
    p_grade_max,
    (select greatest(1, least(3, u.grade - 6))::smallint from public.users u where u.id = v_uid),
    3
  );

  -- やりかけが残っていたら、そこで終わりにする（記録は作らない）
  update public.drill_sessions
     set finished = true, ended_at = now()
   where student_id = v_uid and not finished;

  select count(*) into v_pool
    from private.drill_pool(v_uid, v_subject, v_grade_max, v_mode, v_category);
  if v_pool = 0 then
    raise exception 'no_questions';
  end if;

  insert into public.drill_sessions (club_id, student_id, subject, mode, category, grade_max, total, user_task_id)
  values (v_club_id, v_uid, v_subject, v_mode, v_category, v_grade_max,
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

-- ===== 管理画面：配信できる単元の一覧（運営だけ）=====
-- タスクを作るときに、教科ごとの単元と問題数を選べるようにする
create function public.drill_categories(p_subject text, p_grade_max smallint default 3)
returns table (category text, questions integer, grades smallint[])
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
    select q.category, count(*)::int, array_agg(distinct q.grade order by q.grade)
      from public.questions q
     where q.active and q.subject = p_subject and q.grade <= coalesce(p_grade_max, 3::smallint)
     group by q.category
     order by q.category;
end;
$$;
revoke all on function public.drill_categories(text, smallint) from public, anon;
grant execute on function public.drill_categories(text, smallint) to authenticated;
