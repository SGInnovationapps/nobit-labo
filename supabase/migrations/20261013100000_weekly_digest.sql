-- v1.7：クラブ管理者への週1回のメール「今週の記録」の集計と、送信済みの記録
-- 載せるのは人数だけ（学習した人数・しばらく記録がない人数・応援がまだの人数）。生徒の名前は載せない。
create table public.weekly_digest_log (
  club_id uuid not null references public.clubs (id) on delete cascade,
  week_start date not null,
  sent_at timestamptz not null default now(),
  recipients int not null check (recipients >= 0),
  primary key (club_id, week_start)
);
alter table public.weekly_digest_log enable row level security;
create policy weekly_digest_log_operator on public.weekly_digest_log for select to authenticated
  using (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'operator'));

-- p_today の前日までの7日間（週の頭に送る想定）。まだ送っていないクラブだけ返す。
create function public.weekly_digest_data(p_today date default private.jst_today())
returns table (club_id uuid, club_name text, week_start date, week_end date,
               total int, studied int, idle int, unsupported int, emails text[])
language sql security definer set search_path = '' as $$
  with w as (select p_today - 7 as s, p_today - 1 as e),
  stu as (
    select cm.club_id, cm.user_id, cm.reviewed_at, st.last_achieved_date,
           coalesce(r.threshold_days, 3) as th, coalesce(r.enabled, true) as gap_on
      from public.club_members cm
      left join public.streaks st on st.student_id = cm.user_id
      left join public.alert_rules r on r.club_id = cm.club_id and r.kind = 'gap'
     where cm.member_role = 'student' and cm.status = 'approved'
  ),
  calc as (
    select s.*,
      exists (select 1 from public.daily_activity da, w
               where da.student_id = s.user_id and da.activity_date between w.s and w.e) as did,
      (select count(*)::int
         from generate_series(coalesce(s.last_achieved_date, private.jst_date(coalesce(s.reviewed_at, now()))) + 1,
                              p_today - 1, interval '1 day') d(day)
        where not private.is_rest_day(s.user_id, s.club_id, d.day::date)) as missing,
      exists (select 1 from public.support_comments sc, w
               where sc.student_id = s.user_id and sc.created_at >= (w.s::timestamp at time zone 'Asia/Tokyo')) as cheered
      from stu s
  )
  select c.id, c.name, p_today - 7, p_today - 1,
         count(k.user_id)::int,
         count(*) filter (where k.did)::int,
         count(*) filter (where k.gap_on and k.missing >= k.th)::int,
         count(*) filter (where not k.cheered)::int,
         coalesce((select array_agg(distinct u.email order by u.email)
                     from public.club_members a join auth.users u on u.id = a.user_id
                    where a.club_id = c.id and a.member_role = 'club_admin' and a.status = 'approved'
                      and u.email is not null and u.email not like '%.invalid'), '{}')
    from public.clubs c
    left join calc k on k.club_id = c.id
   where not exists (select 1 from public.weekly_digest_log l where l.club_id = c.id and l.week_start = p_today - 7)
   group by c.id, c.name;
$$;

create function public.weekly_digest_mark(p_club uuid, p_week_start date, p_recipients int)
returns void language sql security definer set search_path = '' as $$
  insert into public.weekly_digest_log (club_id, week_start, recipients) values (p_club, p_week_start, p_recipients)
  on conflict do nothing;
$$;

revoke all on function public.weekly_digest_data(date), public.weekly_digest_mark(uuid, date, int) from public, anon, authenticated;
grant execute on function public.weekly_digest_data(date), public.weekly_digest_mark(uuid, date, int) to service_role;
