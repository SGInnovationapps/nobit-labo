-- 画面08「おかえり。また今日から。」：連続記録が途切れたあとに 1 度だけ出す。
-- 途切れごとに 1 回（最後の達成日で区別する）。見たことを streaks に残す。

alter table public.streaks add column resume_seen_for date;
comment on column public.streaks.resume_seen_for is
  '再開画面（08）を見せ終えた途切れ。last_achieved_date と同じなら、その途切れでは出さない。';

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
  s.last_achieved_date,
  s.resume_seen_for
from public.streaks s;

create function public.mark_resume_seen()
returns void
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
  update public.streaks
     set resume_seen_for = last_achieved_date
   where student_id = v_uid and last_achieved_date is not null;
end;
$$;
revoke all on function public.mark_resume_seen() from public, anon, authenticated;
grant execute on function public.mark_resume_seen() to authenticated;
