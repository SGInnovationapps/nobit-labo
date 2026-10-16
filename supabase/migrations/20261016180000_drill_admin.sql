-- 運営だけが見る、生徒ごとのドリルの成績（仕様書 v1.8 5-8章）
--
-- 「運営は生徒ごとの正解数・正解率・まちがえた問題を見られる。クラブ管理者は
--   ドリルタスクを完了した時刻だけ」。クラブ管理者からは、この関数は forbidden になる。

-- 1人分の全体（教科ごとの内訳つき）
create function public.student_drill_overview(p_student_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_all record;
  v_subjects jsonb;
begin
  if (select auth.uid()) is null then
    raise exception 'not_authenticated';
  end if;
  if not private.is_operator() then
    raise exception 'forbidden';
  end if;

  select count(*)::int as answered,
         count(*) filter (where da.correct)::int as correct,
         max(da.answered_at) as last_at
    into v_all
    from public.drill_answers da
   where da.student_id = p_student_id;

  select coalesce(jsonb_agg(s order by s ->> 'subject'), '[]'::jsonb) into v_subjects
    from (
      select jsonb_build_object(
               'subject', q.subject,
               'answered', count(*)::int,
               'correct', count(*) filter (where da.correct)::int,
               'percent', round(100.0 * count(*) filter (where da.correct) / count(*))::int
             ) as s
        from public.drill_answers da
        join public.questions q on q.id = da.question_id
       where da.student_id = p_student_id
       group by q.subject
    ) t;

  return jsonb_build_object(
    'answered', coalesce(v_all.answered, 0),
    'correct', coalesce(v_all.correct, 0),
    'percent', case when coalesce(v_all.answered, 0) = 0 then 0
                    else round(100.0 * v_all.correct / v_all.answered)::int end,
    'last_at', v_all.last_at,
    'sessions', (select count(*)::int from public.drill_sessions s
                  where s.student_id = p_student_id and s.finished and s.answered >= s.total),
    'abandoned', (select count(*)::int from public.drill_sessions s
                   where s.student_id = p_student_id and s.finished and s.answered < s.total),
    'subjects', v_subjects
  );
end;
$$;
revoke all on function public.student_drill_overview(uuid) from public, anon;
grant execute on function public.student_drill_overview(uuid) to authenticated;

-- 1教科の中身：単元ごとの正解率と、いまのまちがえた問題
create function public.student_drill_detail(p_student_id uuid, p_subject text, p_limit integer default 20)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_units jsonb;
  v_wrong jsonb;
begin
  if (select auth.uid()) is null then
    raise exception 'not_authenticated';
  end if;
  if not private.is_operator() then
    raise exception 'forbidden';
  end if;

  -- 単元ごと。問題ごとに最後の回答を見る（生徒の画面の正解率と同じ数え方）
  select coalesce(jsonb_agg(u order by u ->> 'category'), '[]'::jsonb) into v_units
    from (
      select jsonb_build_object(
               'category', q.category,
               'tried', count(*)::int,
               'correct', count(*) filter (where a.correct)::int,
               'percent', round(100.0 * count(*) filter (where a.correct) / count(*))::int
             ) as u
        from (
          select distinct on (da.question_id) da.question_id, da.correct
            from public.drill_answers da
           where da.student_id = p_student_id
           order by da.question_id, da.answered_at desc, da.id desc
        ) a
        join public.questions q on q.id = a.question_id
       where q.subject = p_subject
       group by q.category
    ) t;

  -- いま「まちがえた問題」に入っているもの（最後の回答が不正解）
  select coalesce(jsonb_agg(w order by w ->> 'category', w ->> 'body'), '[]'::jsonb) into v_wrong
    from (
      select jsonb_build_object(
               'id', q.id, 'category', q.category, 'grade', q.grade,
               'body', q.body, 'answer', q.answer, 'answered_at', a.answered_at
             ) as w
        from (
          select distinct on (da.question_id) da.question_id, da.correct, da.answered_at
            from public.drill_answers da
           where da.student_id = p_student_id
           order by da.question_id, da.answered_at desc, da.id desc
        ) a
        join public.questions q on q.id = a.question_id
       where not a.correct and q.subject = p_subject
       order by a.answered_at desc
       limit greatest(1, least(coalesce(p_limit, 20), 200))
    ) t;

  return jsonb_build_object('subject', p_subject, 'units', v_units, 'wrong', v_wrong);
end;
$$;
revoke all on function public.student_drill_detail(uuid, text, integer) from public, anon;
grant execute on function public.student_drill_detail(uuid, text, integer) to authenticated;
