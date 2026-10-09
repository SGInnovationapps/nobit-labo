-- 配信されたタスクを、生徒の「今日のタスク」（user_tasks）に展開する
-- 生徒がホームを開いたときに呼ぶ。何度呼んでも二重には作らない（task_id, student_id, task_date が一意）。
--
-- 繰り返しの扱い［仮］
--   none     ：starts_on から due_on（なければ starts_on の 1 日）まで。完了したら以降は出さない
--   daily    ：starts_on から due_on（なければ無期限）まで毎日
--   weekdays ：上と同じ範囲の月〜金
--   weekly   ：上と同じ範囲で、starts_on と同じ曜日
create function public.sync_today_tasks()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_club_id uuid := private.my_student_club_id();
  v_today date := private.jst_today();
  v_created integer;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  if v_club_id is null then
    raise exception 'not_approved_student';
  end if;

  with due as (
    select t.id
      from public.tasks t
     where t.club_id = v_club_id
       and t.kind = 'assigned'
       and t.archived_at is null
       and t.starts_on <= v_today
       and (
         case t.recurrence
           when 'none' then
             v_today <= coalesce(t.due_on, t.starts_on)
             and not exists (
               select 1 from public.user_tasks u
                where u.task_id = t.id and u.student_id = v_uid and u.completed_at is not null
             )
           when 'daily' then
             t.due_on is null or v_today <= t.due_on
           when 'weekdays' then
             (t.due_on is null or v_today <= t.due_on)
             and extract(isodow from v_today) between 1 and 5
           when 'weekly' then
             (t.due_on is null or v_today <= t.due_on)
             and extract(isodow from v_today) = extract(isodow from t.starts_on)
         end
       )
  ), ins as (
    insert into public.user_tasks (task_id, student_id, task_date)
    select d.id, v_uid, v_today from due d
    on conflict (task_id, student_id, task_date) do nothing
    returning 1
  )
  select count(*) into v_created from ins;

  return jsonb_build_object('created', v_created, 'task_date', v_today);
end;
$$;

revoke all on function public.sync_today_tasks() from public, anon, authenticated;
grant execute on function public.sync_today_tasks() to authenticated;
