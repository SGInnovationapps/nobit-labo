-- v1.7 ④：休息チケット（毎週月曜に1枚・所持は2枚まで・生徒が自分で使う）と、さかのぼり
-- 休息チケットは連続記録だけを守る。学習日には数えない（daily_activity は作らない）。
-- ［仮］さかのぼり：途切れた翌日の24:00まで＝「昨日」を休息日にできる。今日も使える。
-- ［仮］最初の1枚は、はじめて開いた週の分として付く。

create table public.rest_tickets (
  student_id uuid primary key references public.users (id) on delete cascade,
  club_id uuid not null references public.clubs (id) on delete restrict,
  balance integer not null check (balance between 0 and 2),
  /** 最後に付与した週の月曜日 */
  last_granted_week date not null
);
comment on table public.rest_tickets is '休息チケットの所持数。書き込みは関数だけ。';

create table public.rest_ticket_uses (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.users (id) on delete cascade,
  club_id uuid not null references public.clubs (id) on delete restrict,
  rest_date date not null,
  used_at timestamptz not null default now(),
  unique (student_id, rest_date)
);
comment on table public.rest_ticket_uses is '休息チケットで休息日にした日。書き込みは関数だけ。';
create index rest_ticket_uses_club_idx on public.rest_ticket_uses (club_id, rest_date);

alter table public.rest_tickets enable row level security;
alter table public.rest_ticket_uses enable row level security;
create policy rest_tickets_select on public.rest_tickets for select to authenticated
  using (student_id = (select auth.uid()) or (select private.is_operator()));
-- 休息日は記録の帯に紫で出る範囲なので、クラブ管理者は自クラブの承認済みの生徒の分を読める
create policy rest_ticket_uses_select on public.rest_ticket_uses for select to authenticated
  using (
    student_id = (select auth.uid())
    or (select private.is_operator())
    or (club_id in (select private.admin_club_ids()) and (select private.is_approved_student(club_id, student_id)))
  );
revoke all on public.rest_tickets, public.rest_ticket_uses from anon, authenticated;
grant select on public.rest_tickets, public.rest_ticket_uses to authenticated;

------------------------------------------------------------------------------
-- 休息日の判定（大会・遠征・合宿日 または 休息チケット）。連続記録・アラートで共通に使う
------------------------------------------------------------------------------
create function private.is_rest_day(p_student_id uuid, p_club_id uuid, p_date date)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.club_events e where e.club_id = p_club_id and e.event_date = p_date)
      or exists (select 1 from public.rest_ticket_uses u where u.student_id = p_student_id and u.rest_date = p_date)
$$;
revoke all on function private.is_rest_day(uuid, uuid, date) from public, anon, authenticated;
grant execute on function private.is_rest_day(uuid, uuid, date) to authenticated;

create function private.week_start(p_date date)
returns date
language sql
immutable
as $$
  select p_date - (extract(isodow from p_date)::integer - 1)
$$;

------------------------------------------------------------------------------
-- 連続記録の判定を、共通の休息日にそろえる
------------------------------------------------------------------------------
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
       where not private.is_rest_day(s.student_id, s.club_id, d.day::date)
    ) then s.current_days
    else 0
  end as current_days,
  s.longest_days,
  s.last_achieved_date,
  s.resume_seen_for
from public.streaks s;

do $$
declare
  d text;
  pat text := 'select 1 from public\.club_events e where e\.club_id = (p_club_id|s\.club_id) and e\.event_date = d\.day::date';
  r record;
  nd text;
begin
  for r in
    select p.oid, p.proname
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'private' and p.proname in ('record_study_activity', 'generate_alerts')
  loop
    d := pg_get_functiondef(r.oid);
    nd := regexp_replace(
      d, pat,
      case when r.proname = 'record_study_activity'
           then 'select 1 where private.is_rest_day(p_student_id, p_club_id, d.day::date)'
           else 'select 1 where private.is_rest_day(s.student_id, s.club_id, d.day::date)' end,
      'g');
    if nd = d then
      raise exception '% の差し替え位置が見つかりません', r.proname;
    end if;
    execute nd;
  end loop;
end;
$$;

------------------------------------------------------------------------------
-- 付与（週のはじめに1枚。開いたときにまとめて付ける）
------------------------------------------------------------------------------
create function private.sync_rest_tickets(p_student_id uuid, p_club_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_monday date := private.week_start(private.jst_today());
  v_row public.rest_tickets;
  v_weeks integer;
begin
  insert into public.rest_tickets (student_id, club_id, balance, last_granted_week)
  values (p_student_id, p_club_id, 1, v_monday)
  on conflict (student_id) do nothing;

  select * into v_row from public.rest_tickets where student_id = p_student_id for update;
  v_weeks := (v_monday - v_row.last_granted_week) / 7;
  if v_weeks > 0 then
    update public.rest_tickets
       set balance = least(2, balance + v_weeks), last_granted_week = v_monday
     where student_id = p_student_id
    returning * into v_row;
  end if;
  return v_row.balance;
end;
$$;
revoke all on function private.sync_rest_tickets(uuid, uuid) from public, anon, authenticated;

-- この日を休息日にすれば、連続記録が続くか
create function private.can_protect(p_student_id uuid, p_club_id uuid, p_date date)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_s record;
begin
  select s.current_days, s.last_achieved_date into v_s from public.streaks s where s.student_id = p_student_id;
  if not found or v_s.last_achieved_date is null or v_s.current_days < 1 then
    return false;
  end if;
  if v_s.last_achieved_date >= p_date or p_date - v_s.last_achieved_date > 60 then
    return false;
  end if;
  if private.is_rest_day(p_student_id, p_club_id, p_date) then
    return false;
  end if;
  -- 最後の達成日の翌日から前日までが、すべて休息日であること（つながるときだけ守る意味がある）
  return not exists (
    select 1
      from generate_series(v_s.last_achieved_date + 1, p_date - 1, interval '1 day') as d(day)
     where not private.is_rest_day(p_student_id, p_club_id, d.day::date)
  );
end;
$$;
revoke all on function private.can_protect(uuid, uuid, date) from public, anon, authenticated;

------------------------------------------------------------------------------
-- 生徒向け：所持数と、守れる日を返す
------------------------------------------------------------------------------
create function public.my_rest_tickets()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_club uuid := private.my_usable_club_id();
  v_today date := private.jst_today();
  v_bal integer;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  if v_club is null then
    return null;
  end if;
  v_bal := private.sync_rest_tickets(v_uid, v_club);
  return jsonb_build_object(
    'balance', v_bal,
    'next_grant_on', private.week_start(v_today) + 7,
    'can_protect_today', v_bal > 0 and private.can_protect(v_uid, v_club, v_today),
    'can_protect_yesterday', v_bal > 0 and private.can_protect(v_uid, v_club, v_today - 1)
  );
end;
$$;

create function public.use_rest_ticket(p_date date)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_club uuid := private.my_usable_club_id();
  v_today date := private.jst_today();
  v_bal integer;
  v_days integer;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  if v_club is null then
    raise exception 'not_student';
  end if;
  if p_date is null or p_date not in (v_today, v_today - 1) then
    raise exception 'date_not_allowed';
  end if;
  v_bal := private.sync_rest_tickets(v_uid, v_club);
  if v_bal < 1 then
    raise exception 'no_ticket';
  end if;
  if not private.can_protect(v_uid, v_club, p_date) then
    raise exception 'cannot_protect';
  end if;
  insert into public.rest_ticket_uses (student_id, club_id, rest_date) values (v_uid, v_club, p_date);
  update public.rest_tickets set balance = balance - 1 where student_id = v_uid returning balance into v_bal;
  select ss.current_days into v_days from public.streak_status ss where ss.student_id = v_uid;
  return jsonb_build_object('balance', v_bal, 'current_days', coalesce(v_days, 0));
end;
$$;

revoke all on function public.my_rest_tickets() from public, anon, authenticated;
revoke all on function public.use_rest_ticket(date) from public, anon, authenticated;
grant execute on function public.my_rest_tickets() to authenticated;
grant execute on function public.use_rest_ticket(date) to authenticated;
