-- 大会・遠征・合宿日の登録（ClubEvents）と、休息日による連続記録の保護。
-- 休息日は、クラブ管理者（または運営）が登録する。休息チケットは消費しない。
-- 休息日は連続記録を守るだけで、学習日には数えない。
-- ［仮］登録・削除できるのは今日以降の日だけ（過去の連続記録を書き換えない）。

create table public.club_events (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete restrict,
  event_date date not null,
  kind text not null check (kind in ('tournament', 'trip', 'camp')),
  note text check (note is null or char_length(btrim(note)) between 1 and 40),
  created_by uuid not null references public.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (club_id, event_date)
);
comment on table public.club_events is '大会・遠征・合宿日（クラブ単位の休息日）。書き込みは関数だけ。';
create index club_events_club_date_idx on public.club_events (club_id, event_date);

alter table public.club_events enable row level security;
create policy club_events_select on public.club_events for select to authenticated
  using (
    club_id = (select private.my_student_club_id())
    or (select private.is_club_admin(club_id))
    or (select private.is_operator())
  );
revoke all on public.club_events from anon, authenticated;
grant select on public.club_events to authenticated;

create function public.add_club_event(p_club_id uuid, p_date date, p_kind text, p_note text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_id uuid;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  if not (private.is_club_admin(p_club_id) or private.is_operator()) then
    raise exception 'forbidden';
  end if;
  if p_date < private.jst_today() then
    raise exception 'past_date';
  end if;
  if p_date > private.jst_today() + 365 then
    raise exception 'too_far';
  end if;
  insert into public.club_events (club_id, event_date, kind, note, created_by)
  values (p_club_id, p_date, p_kind, v_note, v_uid)
  returning id into v_id;
  return v_id;
exception when unique_violation then
  raise exception 'already_registered';
end;
$$;

create function public.remove_club_event(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_ev public.club_events;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  select * into v_ev from public.club_events e where e.id = p_id;
  if not found then
    raise exception 'not_found';
  end if;
  if not (private.is_club_admin(v_ev.club_id) or private.is_operator()) then
    raise exception 'forbidden';
  end if;
  if v_ev.event_date < private.jst_today() then
    raise exception 'past_date';
  end if;
  delete from public.club_events where id = p_id;
end;
$$;

revoke all on function public.add_club_event(uuid, date, text, text) from public, anon, authenticated;
revoke all on function public.remove_club_event(uuid) from public, anon, authenticated;
grant execute on function public.add_club_event(uuid, date, text, text) to authenticated;
grant execute on function public.remove_club_event(uuid) to authenticated;

------------------------------------------------------------------------------
-- 連続記録：間の日がすべて休息日なら、途切れない
------------------------------------------------------------------------------
create or replace function private.record_study_activity(p_student_id uuid, p_club_id uuid, p_date date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_streak record;
  v_new_current integer;
begin
  insert into public.daily_activity as da (club_id, student_id, activity_date, completed_count)
  values (p_club_id, p_student_id, p_date, 1)
  on conflict (student_id, activity_date)
  do update set completed_count = da.completed_count + 1;

  insert into public.streaks (student_id, club_id, current_days, longest_days, last_achieved_date)
  values (p_student_id, p_club_id, 0, 0, null)
  on conflict (student_id) do nothing;

  select s.current_days, s.longest_days, s.last_achieved_date
    into v_streak
    from public.streaks s
   where s.student_id = p_student_id
   for update;

  if v_streak.last_achieved_date is not null and v_streak.last_achieved_date >= p_date then
    v_new_current := v_streak.current_days;          -- その日はすでに達成済み
  elsif v_streak.last_achieved_date is not null
        and p_date - v_streak.last_achieved_date <= 60
        and not exists (
          select 1
            from generate_series(v_streak.last_achieved_date + 1, p_date - 1, interval '1 day') as d(day)
           where not exists (
             select 1 from public.club_events e where e.club_id = p_club_id and e.event_date = d.day::date
           )
        ) then
    v_new_current := v_streak.current_days + 1;      -- 前の日から続いている（間は休息日だけ）
  else
    v_new_current := 1;                              -- 途切れたので 1 から
  end if;

  update public.streaks
     set current_days = v_new_current,
         longest_days = greatest(v_streak.longest_days, v_new_current),
         last_achieved_date = greatest(coalesce(v_streak.last_achieved_date, p_date), p_date)
   where student_id = p_student_id;
end;
$$;

-- 表示用：今日の時点で連続記録が生きているか（最後の達成から今日の前日までが、すべて休息日か、日が空いていない）
create or replace view public.streak_status
with (security_invoker = true)
as
select
  s.student_id,
  s.club_id,
  case
    when s.last_achieved_date is null then 0
    when private.jst_today() - s.last_achieved_date > 60 then 0
    when not exists (
      select 1
        from generate_series(s.last_achieved_date + 1, private.jst_today() - 1, interval '1 day') as d(day)
       where not exists (
         select 1 from public.club_events e where e.club_id = s.club_id and e.event_date = d.day::date
       )
    ) then s.current_days
    else 0
  end as current_days,
  s.longest_days,
  s.last_achieved_date
from public.streaks s;
