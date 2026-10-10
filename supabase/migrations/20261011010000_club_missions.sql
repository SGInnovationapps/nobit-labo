-- クラブミッション（画面07・12）。運営が作り、生徒が参加し、クラブ全体と個人の目標に報酬を付ける。
-- 生徒には、クラブ全体の数字と自分の数字だけを見せる（他の生徒の名前や順位は出さない）。
-- ［仮］数える記録は「学習の記録数」と「学習した日数」。報酬はコイン。クラブの期間は重ねない。

------------------------------------------------------------------------------
-- 1. コインの台帳：理由と元の種類を足す
------------------------------------------------------------------------------
alter table public.coin_transactions drop constraint coin_transactions_reason_check;
alter table public.coin_transactions add constraint coin_transactions_reason_check
  check (reason in ('task_complete', 'study_plain', 'study_content', 'focus_complete', 'gacha_duplicate', 'mission_personal', 'mission_club'));
alter table public.coin_transactions drop constraint coin_transactions_source_type_check;
alter table public.coin_transactions add constraint coin_transactions_source_type_check
  check (source_type in ('user_task', 'study_record', 'focus_session', 'gacha_draw', 'mission_personal', 'mission_club'));

------------------------------------------------------------------------------
-- 2. テーブル
------------------------------------------------------------------------------
create table public.club_missions (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 40),
  description text check (description is null or char_length(btrim(description)) between 1 and 100),
  metric text not null check (metric in ('records', 'study_days')),
  starts_on date not null,
  ends_on date not null,
  club_goal integer not null check (club_goal between 1 and 100000),
  personal_goal integer not null check (personal_goal between 1 and 1000),
  reward_personal_coins integer not null default 0 check (reward_personal_coins between 0 and 1000),
  reward_club_coins integer not null default 0 check (reward_club_coins between 0 and 1000),
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  cancelled_at timestamptz,
  check (ends_on >= starts_on and ends_on - starts_on <= 92)
);
comment on table public.club_missions is 'クラブミッションの定義。書き込みは関数だけ。';
create index club_missions_club_idx on public.club_missions (club_id, starts_on);

create table public.mission_participants (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid not null references public.club_missions (id) on delete cascade,
  club_id uuid not null references public.clubs (id) on delete cascade,
  student_id uuid not null references public.users (id) on delete cascade,
  joined_at timestamptz not null default now(),
  personal_rewarded_at timestamptz,
  club_rewarded_at timestamptz,
  unique (mission_id, student_id)
);
comment on table public.mission_participants is 'ミッションへの参加と、報酬を付けたかどうか。書き込みは関数だけ。';
create index mission_participants_student_idx on public.mission_participants (student_id);

alter table public.club_missions enable row level security;
alter table public.mission_participants enable row level security;
create policy club_missions_select on public.club_missions for select to authenticated
  using (club_id = (select private.my_student_club_id()) or (select private.is_club_admin(club_id)) or (select private.is_operator()));
create policy mission_participants_select on public.mission_participants for select to authenticated
  using (student_id = (select auth.uid()) or (select private.is_operator()));
revoke all on public.club_missions, public.mission_participants from anon, authenticated;
grant select on public.club_missions, public.mission_participants to authenticated;

------------------------------------------------------------------------------
-- 3. 進みの計算と報酬
------------------------------------------------------------------------------
create function private.mission_progress(p_metric text, p_from date, p_to date, p_student uuid, p_today date)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select case p_metric
           when 'records' then coalesce(sum(da.completed_count), 0)::int
           else (count(*) filter (where da.completed_count > 0))::int
         end
    from public.daily_activity da
   where da.student_id = p_student
     and da.activity_date between p_from and least(p_to, p_today);
$$;
revoke all on function private.mission_progress(text, date, date, uuid, date) from public, anon, authenticated;

-- 期間中のミッションについて、目標に届いた分の報酬を付ける（同じ報酬は 1 人 1 回）
create function private.settle_missions(p_student_id uuid, p_club_id uuid, p_today date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  m record;
  me record;
  p record;
  v_club integer;
begin
  for m in
    select * from public.club_missions cm
     where cm.club_id = p_club_id and cm.cancelled_at is null and p_today between cm.starts_on and cm.ends_on
  loop
    select * into me from public.mission_participants mp where mp.mission_id = m.id and mp.student_id = p_student_id;
    if not found then
      continue;
    end if;

    if me.personal_rewarded_at is null
       and private.mission_progress(m.metric, m.starts_on, m.ends_on, p_student_id, p_today) >= m.personal_goal then
      perform private.grant_coins(p_student_id, p_club_id, m.reward_personal_coins, 'mission_personal', 'mission_personal', me.id, p_today);
      update public.mission_participants set personal_rewarded_at = now() where id = me.id;
    end if;

    select coalesce(sum(private.mission_progress(m.metric, m.starts_on, m.ends_on, mp.student_id, p_today)), 0)::int
      into v_club
      from public.mission_participants mp where mp.mission_id = m.id;
    if v_club >= m.club_goal then
      for p in
        select mp.id, mp.student_id from public.mission_participants mp
         where mp.mission_id = m.id and mp.club_rewarded_at is null
           and private.mission_progress(m.metric, m.starts_on, m.ends_on, mp.student_id, p_today) >= 1
      loop
        perform private.grant_coins(p.student_id, p_club_id, m.reward_club_coins, 'mission_club', 'mission_club', p.id, p_today);
        update public.mission_participants set club_rewarded_at = now() where id = p.id;
      end loop;
    end if;
  end loop;
end;
$$;
revoke all on function private.settle_missions(uuid, uuid, date) from public, anon, authenticated;

-- 学習の記録のたびに、ミッションの報酬を確かめる
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
    v_new_current := v_streak.current_days;
  elsif v_streak.last_achieved_date is not null
        and p_date - v_streak.last_achieved_date <= 60
        and not exists (
          select 1
            from generate_series(v_streak.last_achieved_date + 1, p_date - 1, interval '1 day') as d(day)
           where not exists (
             select 1 from public.club_events e where e.club_id = p_club_id and e.event_date = d.day::date
           )
        ) then
    v_new_current := v_streak.current_days + 1;
  else
    v_new_current := 1;
  end if;

  update public.streaks
     set current_days = v_new_current,
         longest_days = greatest(v_streak.longest_days, v_new_current),
         last_achieved_date = greatest(coalesce(v_streak.last_achieved_date, p_date), p_date)
   where student_id = p_student_id;

  perform private.settle_missions(p_student_id, p_club_id, p_date);
end;
$$;

------------------------------------------------------------------------------
-- 4. 運営：作成・取り消し
------------------------------------------------------------------------------
create function public.create_club_mission(
  p_club_id uuid, p_title text, p_description text, p_metric text,
  p_starts_on date, p_ends_on date, p_club_goal integer, p_personal_goal integer,
  p_reward_personal integer, p_reward_club integer
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  if not private.is_operator() then
    raise exception 'forbidden';
  end if;
  if p_ends_on < p_starts_on then
    raise exception 'invalid_period';
  end if;
  if p_ends_on < private.jst_today() then
    raise exception 'past_period';
  end if;
  if exists (
    select 1 from public.club_missions cm
     where cm.club_id = p_club_id and cm.cancelled_at is null
       and cm.starts_on <= p_ends_on and cm.ends_on >= p_starts_on
  ) then
    raise exception 'period_overlap';
  end if;
  insert into public.club_missions (club_id, title, description, metric, starts_on, ends_on, club_goal, personal_goal,
                                    reward_personal_coins, reward_club_coins, created_by)
  values (p_club_id, btrim(p_title), nullif(btrim(coalesce(p_description, '')), ''), p_metric, p_starts_on, p_ends_on,
          p_club_goal, p_personal_goal, p_reward_personal, p_reward_club, v_uid)
  returning id into v_id;
  return v_id;
end;
$$;

create function public.cancel_club_mission(p_id uuid)
returns void
language plpgsql
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
  update public.club_missions set cancelled_at = now() where id = p_id and cancelled_at is null;
  if not found then
    raise exception 'not_found';
  end if;
end;
$$;

------------------------------------------------------------------------------
-- 5. 生徒：参加と、自分のクラブのミッション一覧
------------------------------------------------------------------------------
create function public.join_mission(p_mission_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_club uuid := private.my_student_club_id();
  v_m public.club_missions;
  v_today date := private.jst_today();
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  if v_club is null then
    raise exception 'not_approved_student';
  end if;
  select * into v_m from public.club_missions where id = p_mission_id and club_id = v_club and cancelled_at is null;
  if not found then
    raise exception 'not_found';
  end if;
  if v_today < v_m.starts_on then
    raise exception 'not_started';
  end if;
  if v_today > v_m.ends_on then
    raise exception 'ended';
  end if;
  insert into public.mission_participants (mission_id, club_id, student_id) values (p_mission_id, v_club, v_uid)
  on conflict do nothing;
  perform private.settle_missions(v_uid, v_club, v_today);
end;
$$;

-- ミッション 1 件の数字。viewer が null なら、クラブ全体だけ
create function private.mission_json(m public.club_missions, p_viewer uuid, p_today date)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', m.id, 'title', m.title, 'description', m.description, 'metric', m.metric,
    'starts_on', m.starts_on, 'ends_on', m.ends_on,
    'club_goal', m.club_goal, 'personal_goal', m.personal_goal,
    'reward_personal_coins', m.reward_personal_coins, 'reward_club_coins', m.reward_club_coins,
    'cancelled', m.cancelled_at is not null,
    'status', case when m.cancelled_at is not null then 'cancelled' when p_today < m.starts_on then 'upcoming'
                   when p_today > m.ends_on then 'ended' else 'active' end,
    'participants', (select count(*) from public.mission_participants mp where mp.mission_id = m.id),
    'club_progress', (select coalesce(sum(private.mission_progress(m.metric, m.starts_on, m.ends_on, mp.student_id, p_today)), 0)::int
                        from public.mission_participants mp where mp.mission_id = m.id),
    'personal_reached', (select count(*) from public.mission_participants mp
                          where mp.mission_id = m.id
                            and private.mission_progress(m.metric, m.starts_on, m.ends_on, mp.student_id, p_today) >= m.personal_goal),
    'joined', p_viewer is not null and exists (select 1 from public.mission_participants mp where mp.mission_id = m.id and mp.student_id = p_viewer),
    'my_progress', case when p_viewer is null then null
                        else private.mission_progress(m.metric, m.starts_on, m.ends_on, p_viewer, p_today) end,
    'my_personal_rewarded', p_viewer is not null and exists (select 1 from public.mission_participants mp where mp.mission_id = m.id and mp.student_id = p_viewer and mp.personal_rewarded_at is not null),
    'my_club_rewarded', p_viewer is not null and exists (select 1 from public.mission_participants mp where mp.mission_id = m.id and mp.student_id = p_viewer and mp.club_rewarded_at is not null)
  );
$$;
revoke all on function private.mission_json(public.club_missions, uuid, date) from public, anon, authenticated;

-- 生徒用：自分のクラブの、取り消されていないミッション（終わって 60 日以内まで）。他の生徒の名前は含めない
create function public.my_missions()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_club uuid := private.my_student_club_id();
  v_today date := private.jst_today();
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  if v_club is null then
    raise exception 'not_approved_student';
  end if;
  return coalesce((
    select jsonb_agg(private.mission_json(m, v_uid, v_today) order by m.starts_on desc)
      from public.club_missions m
     where m.club_id = v_club and m.cancelled_at is null and m.ends_on >= v_today - 60
  ), '[]'::jsonb);
end;
$$;

-- 運営用：クラブのミッションと、生徒ごとの進み
create function public.admin_missions(p_club_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_today date := private.jst_today();
begin
  if (select auth.uid()) is null then
    raise exception 'not_authenticated';
  end if;
  if not private.is_operator() then
    raise exception 'forbidden';
  end if;
  return coalesce((
    select jsonb_agg(
      private.mission_json(m, null, v_today) || jsonb_build_object('students', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'student_id', mp.student_id, 'display_name', u.display_name,
                 'progress', private.mission_progress(m.metric, m.starts_on, m.ends_on, mp.student_id, v_today)
               ) order by u.display_name)
          from public.mission_participants mp join public.users u on u.id = mp.student_id
         where mp.mission_id = m.id), '[]'::jsonb))
      order by m.starts_on desc)
      from public.club_missions m
     where m.club_id = p_club_id and m.cancelled_at is null
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.create_club_mission(uuid, text, text, text, date, date, integer, integer, integer, integer) from public, anon, authenticated;
revoke all on function public.cancel_club_mission(uuid) from public, anon, authenticated;
revoke all on function public.join_mission(uuid) from public, anon, authenticated;
revoke all on function public.my_missions() from public, anon, authenticated;
revoke all on function public.admin_missions(uuid) from public, anon, authenticated;
grant execute on function public.create_club_mission(uuid, text, text, text, date, date, integer, integer, integer, integer) to authenticated;
grant execute on function public.cancel_club_mission(uuid) to authenticated;
grant execute on function public.join_mission(uuid) to authenticated;
grant execute on function public.my_missions() to authenticated;
grant execute on function public.admin_missions(uuid) to authenticated;

------------------------------------------------------------------------------
-- 6. アラート「クラブミッション」：開始日と、終了の前日
------------------------------------------------------------------------------
create function private.generate_mission_alerts(p_now timestamptz)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := private.jst_date(p_now);
begin
  -- 開始日（始まった日と、その翌日まで）。クラブの承認済みの生徒全員
  insert into public.alerts (club_id, student_id, kind, cause, detail, occurred_on)
  select m.club_id, cm.user_id, 'club_mission', 'mission:' || m.id || ':start',
         jsonb_build_object('title', m.title, 'phase', 'start'), m.starts_on
    from public.club_missions m
    join public.club_members cm on cm.club_id = m.club_id and cm.member_role = 'student' and cm.status = 'approved'
    left join public.alert_rules r on r.club_id = m.club_id and r.kind = 'club_mission'
   where m.cancelled_at is null and m.starts_on between v_today - 1 and v_today and coalesce(r.enabled, true)
  on conflict do nothing;

  -- 終了の前日。個人の目標にまだ届いていない生徒だけ
  insert into public.alerts (club_id, student_id, kind, cause, detail, occurred_on)
  select m.club_id, cm.user_id, 'club_mission', 'mission:' || m.id || ':end',
         jsonb_build_object('title', m.title, 'phase', 'end'), m.ends_on - 1
    from public.club_missions m
    join public.club_members cm on cm.club_id = m.club_id and cm.member_role = 'student' and cm.status = 'approved'
    left join public.alert_rules r on r.club_id = m.club_id and r.kind = 'club_mission'
   where m.cancelled_at is null and m.ends_on > m.starts_on
     and m.ends_on - 1 between v_today - 1 and v_today and coalesce(r.enabled, true)
     and private.mission_progress(m.metric, m.starts_on, m.ends_on, cm.user_id, v_today) < m.personal_goal
  on conflict do nothing;
end;
$$;
revoke all on function private.generate_mission_alerts(timestamptz) from public, anon, authenticated;

create or replace function public.refresh_alerts()
returns void
language plpgsql
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
  perform private.generate_alerts(now());
  perform private.generate_mission_alerts(now());
end;
$$;
