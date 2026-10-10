-- v1.7 ②：承認待ちの間も使える／一括承認／大会日の期間登録
-- ［仮］承認待ちの生徒は、記録・タスク・ガチャを使える。承認まではクラブ管理者に見えず、クラブの合計にも数えない。
-- ミッションへの参加は承認後（join_mission は my_student_club_id のまま＝承認済みだけ）。

------------------------------------------------------------------------------
-- 使えるクラブ（承認済み または 承認待ち）
------------------------------------------------------------------------------
create function private.my_usable_club_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select cm.club_id
  from public.club_members cm
  join public.users u on u.id = cm.user_id
  where cm.user_id = (select auth.uid())
    and cm.member_role = 'student'
    and cm.status in ('approved', 'pending')
    and u.role = 'student'
  order by (cm.status = 'approved') desc
  limit 1
$$;
revoke all on function private.my_usable_club_id() from public, anon, authenticated;
grant execute on function private.my_usable_club_id() to authenticated;

-- クラブ管理者から見える生徒は承認済みだけ
create function private.is_approved_student(p_club_id uuid, p_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.club_members cm
     where cm.club_id = p_club_id and cm.user_id = p_student_id
       and cm.member_role = 'student' and cm.status = 'approved'
  )
$$;
revoke all on function private.is_approved_student(uuid, uuid) from public, anon, authenticated;
grant execute on function private.is_approved_student(uuid, uuid) to authenticated;

------------------------------------------------------------------------------
-- 既存の関数を「承認待ちも可」に差し替える（本体は pg_get_functiondef で複製して置換）
------------------------------------------------------------------------------
do $$
declare
  r record;
  d text;
begin
  for r in
    select p.oid
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where (n.nspname = 'public' and p.proname in ('sync_today_tasks', 'register_free_task', 'start_focus_session', 'start_study_timer'))
        or (n.nspname = 'private' and p.proname in ('complete_task_at', 'record_study_tag_at', 'draw_gacha_core'))
  loop
    d := pg_get_functiondef(r.oid);
    d := replace(d, 'private.my_student_club_id()', 'private.my_usable_club_id()');
    d := replace(d, 'cm.status = ''approved''', 'cm.status in (''approved'', ''pending'')');
    execute d;
  end loop;
end;
$$;

------------------------------------------------------------------------------
-- クラブ管理者の閲覧は承認済みの生徒だけ
------------------------------------------------------------------------------
drop policy user_tasks_select on public.user_tasks;
create policy user_tasks_select on public.user_tasks for select to authenticated
  using (
    student_id = (select auth.uid())
    or (select private.is_operator())
    or (not is_free and club_id in (select private.admin_club_ids())
        and (select private.is_approved_student(club_id, student_id)))
  );

drop policy daily_activity_select on public.daily_activity;
create policy daily_activity_select on public.daily_activity for select to authenticated
  using (
    student_id = (select auth.uid())
    or (select private.is_operator())
    or (club_id in (select private.admin_club_ids())
        and (select private.is_approved_student(club_id, student_id)))
  );

drop policy streaks_select on public.streaks;
create policy streaks_select on public.streaks for select to authenticated
  using (
    student_id = (select auth.uid())
    or (select private.is_operator())
    or (club_id in (select private.admin_club_ids())
        and (select private.is_approved_student(club_id, student_id)))
  );

------------------------------------------------------------------------------
-- 一括承認
------------------------------------------------------------------------------
create function public.review_memberships(p_ids uuid[], p_approve boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_ok integer := 0;
  v_failed jsonb := '[]'::jsonb;
begin
  if (select auth.uid()) is null then
    raise exception 'not_authenticated';
  end if;
  if p_ids is null or coalesce(array_length(p_ids, 1), 0) = 0 then
    return jsonb_build_object('done', 0, 'failed', v_failed);
  end if;
  if array_length(p_ids, 1) > 100 then
    raise exception 'too_many';
  end if;
  foreach v_id in array p_ids loop
    begin
      perform public.review_membership(v_id, p_approve);
      v_ok := v_ok + 1;
    exception when others then
      v_failed := v_failed || jsonb_build_array(jsonb_build_object('id', v_id, 'reason', sqlerrm));
    end;
  end loop;
  return jsonb_build_object('done', v_ok, 'failed', v_failed);
end;
$$;
revoke all on function public.review_memberships(uuid[], boolean) from public, anon, authenticated;
grant execute on function public.review_memberships(uuid[], boolean) to authenticated;

------------------------------------------------------------------------------
-- 大会日の期間登録（最大31日。登録済みの日は飛ばす）
------------------------------------------------------------------------------
create function public.add_club_events_range(
  p_club_id uuid, p_from date, p_to date, p_kind text, p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_added integer;
  v_total integer;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  if not (private.is_club_admin(p_club_id) or private.is_operator()) then
    raise exception 'forbidden';
  end if;
  if p_to < p_from then
    raise exception 'bad_range';
  end if;
  if p_from < private.jst_today() then
    raise exception 'past_date';
  end if;
  if p_to > private.jst_today() + 365 then
    raise exception 'too_far';
  end if;
  v_total := (p_to - p_from) + 1;
  if v_total > 31 then
    raise exception 'range_too_long';
  end if;
  insert into public.club_events (club_id, event_date, kind, note, created_by)
  select p_club_id, d::date, p_kind, v_note, v_uid
    from generate_series(p_from, p_to, interval '1 day') as g(d)
  on conflict (club_id, event_date) do nothing;
  get diagnostics v_added = row_count;
  return jsonb_build_object('added', v_added, 'skipped', v_total - v_added);
end;
$$;
revoke all on function public.add_club_events_range(uuid, date, date, text, text) from public, anon, authenticated;
grant execute on function public.add_club_events_range(uuid, date, date, text, text) to authenticated;
