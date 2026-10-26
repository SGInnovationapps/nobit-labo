-- 週の学習目標とウィークリークエスト（仕様書 5-6・5-7、バッチ13）
--
-- ［確定 2026-10-26］
-- ・週は月〜日（JST）。休息チケットの区切りと同じ
-- ・週の学習目標：本人が 3〜7 日から選ぶ（初期 5 日）。学習した日がその数に届いた週は、
--   追加ガチャを1回無料で引ける（今週か、先週の分まで）
-- ・目標の変更は翌週から。ただし、その週にまだ記録がなければ今週から変わる
--   （届きそうになってから目標を下げて特典を取る、を防ぐ）
-- ・ウィークリークエスト：「同じ教科を週3日」で 10 コイン（週1回）
-- ・学習した日は、休息日を数えない（daily_activity の記録がある日だけ）

-- ===== 台帳の理由 =====
alter table public.coin_transactions drop constraint coin_transactions_reason_check;
alter table public.coin_transactions add constraint coin_transactions_reason_check check (
  reason in ('task_complete', 'study_plain', 'study_content', 'focus_complete', 'gacha_duplicate',
             'mission_personal', 'mission_club', 'study_day', 'gacha_extra',
             'daily_quest', 'quest_bonus', 'admin_adjust', 'weekly_quest')
);
alter table public.coin_transactions drop constraint coin_transactions_source_type_check;
alter table public.coin_transactions add constraint coin_transactions_source_type_check check (
  source_type in ('user_task', 'study_record', 'focus_session', 'gacha_draw',
                  'mission_personal', 'mission_club', 'study_day', 'gacha_cost',
                  'daily_quest', 'admin_adjust', 'weekly_quest')
);

-- ===== 本人が選ぶ目標の日数 =====
alter table public.users
  add column weekly_target_days smallint not null default 5
    check (weekly_target_days between 3 and 7);
comment on column public.users.weekly_target_days is '週の学習目標（日数）。変えると翌週から効く（その週にまだ記録がなければ今週から）';

-- ===== 週ごとの進み =====
create table public.weekly_progress (
  student_id uuid not null references public.users (id) on delete cascade,
  club_id uuid not null references public.clubs (id) on delete restrict,
  week_start date not null check (extract(isodow from week_start) = 1),
  target_days smallint not null check (target_days between 3 and 7),
  goal_achieved_at timestamptz,
  -- 目標を達成した週の、無料ガチャ（1回）
  reward_draw_id uuid,
  reward_used_at timestamptz,
  -- 「同じ教科を週3日」
  subject_quest_subject text,
  subject_quest_coins integer,
  subject_quest_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (student_id, week_start),
  constraint weekly_progress_reward_after_goal check (reward_used_at is null or goal_achieved_at is not null)
);
comment on table public.weekly_progress is '週の学習目標とウィークリークエスト。1人1週1行';

create index weekly_progress_club_week_idx on public.weekly_progress (club_id, week_start);

alter table public.weekly_progress enable row level security;
revoke all on public.weekly_progress from anon;
revoke insert, update, delete, truncate on public.weekly_progress from authenticated;
create policy weekly_progress_select on public.weekly_progress for select to authenticated
  using (student_id = (select auth.uid()) or (select private.is_operator()));

-- ===== ガチャ：週の目標のごほうびで引いた分 =====
-- 無料（毎日）・追加（コイン）とは別の枠にする。ごほうびで引いても、その日の無料と追加は残る
alter table public.gacha_draws add column reward_week date;
drop index public.gacha_draws_free_daily;
drop index public.gacha_draws_extra_daily;
create unique index gacha_draws_free_daily on public.gacha_draws (student_id, drawn_on) where not is_extra and reward_week is null;
create unique index gacha_draws_extra_daily on public.gacha_draws (student_id, drawn_on) where is_extra and reward_week is null;
create unique index gacha_draws_reward_weekly on public.gacha_draws (student_id, reward_week) where reward_week is not null;

-- ===== 判定 =====

-- その週に学習した日（休息日は数えない）
create function private.week_study_days(p_student_id uuid, p_week_start date)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::int
    from public.daily_activity da
   where da.student_id = p_student_id
     and da.activity_date between p_week_start and p_week_start + 6
     and da.completed_count > 0
$$;

-- その週に、教科ごとに何日記録したか（多い順）。教科の記録・タイマー・完了したタスク
create function private.week_subject_days(p_student_id uuid, p_week_start date)
returns table (subject text, days integer)
language sql
stable
security definer
set search_path = ''
as $$
  select x.subject, count(distinct x.d)::int
    from (
      select r.subject, r.record_date as d
        from public.study_records r
       where r.student_id = p_student_id and r.ended_at is not null
         and r.record_date between p_week_start and p_week_start + 6
      union
      select t.subject, ut.task_date
        from public.user_tasks ut
        join public.tasks t on t.id = ut.task_id
       where ut.student_id = p_student_id and ut.completed_at is not null
         and ut.task_date between p_week_start and p_week_start + 6
    ) x
   group by x.subject
   order by count(distinct x.d) desc, x.subject
$$;

-- その週の行を用意する（なければ、本人の目標の日数で作る）
create function private.ensure_week(p_student_id uuid, p_club_id uuid, p_week_start date)
returns public.weekly_progress
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.weekly_progress;
begin
  insert into public.weekly_progress (student_id, club_id, week_start, target_days)
  select p_student_id, p_club_id, p_week_start, u.weekly_target_days
    from public.users u where u.id = p_student_id
  on conflict (student_id, week_start) do nothing;
  select * into v_row from public.weekly_progress w
   where w.student_id = p_student_id and w.week_start = p_week_start;
  return v_row;
end;
$$;

-- 記録のたびに呼ぶ。新しく達成したものだけを返す
create function private.evaluate_week(p_student_id uuid, p_club_id uuid, p_date date)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_week date := private.week_start(p_date);
  v_row public.weekly_progress;
  v_days integer;
  v_best record;
  v_coins integer;
  v_out jsonb := '{}'::jsonb;
begin
  if p_club_id is null then
    return v_out;
  end if;
  v_row := private.ensure_week(p_student_id, p_club_id, v_week);

  -- 週の学習目標
  if v_row.goal_achieved_at is null then
    v_days := private.week_study_days(p_student_id, v_week);
    if v_days >= v_row.target_days then
      update public.weekly_progress set goal_achieved_at = now()
       where student_id = p_student_id and week_start = v_week and goal_achieved_at is null;
      v_out := v_out || jsonb_build_object('goal', jsonb_build_object('target_days', v_row.target_days, 'days', v_days));
    end if;
  end if;

  -- 同じ教科を週3日
  if v_row.subject_quest_at is null then
    select s.subject, s.days into v_best from private.week_subject_days(p_student_id, v_week) s limit 1;
    if v_best.subject is not null and v_best.days >= 3 then
      v_coins := private.grant_coins(
        p_student_id, p_club_id, 10, 'weekly_quest', 'weekly_quest',
        md5(p_student_id::text || ':' || v_week::text || ':subject3')::uuid, p_date
      );
      update public.weekly_progress
         set subject_quest_subject = v_best.subject, subject_quest_coins = v_coins, subject_quest_at = now()
       where student_id = p_student_id and week_start = v_week and subject_quest_at is null;
      v_out := v_out || jsonb_build_object('subject_quest', jsonb_build_object('subject', v_best.subject, 'coins', v_coins));
    end if;
  end if;

  return v_out;
end;
$$;

-- ===== 記録のたびに判定する（デイリーと同じ入口）=====
create or replace function private.record_outcome(p_student_id uuid, p_date date)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
  v_current integer;
  v_longest integer;
  v_club uuid;
  v_first boolean;
  v_badges jsonb;
  v_quests jsonb;
  v_week jsonb;
begin
  select da.completed_count into v_count from public.daily_activity da
   where da.student_id = p_student_id and da.activity_date = p_date;
  select s.current_days, s.longest_days, s.club_id into v_current, v_longest, v_club from public.streaks s where s.student_id = p_student_id;
  v_first := coalesce(v_count, 0) = 1;
  v_badges := case when v_club is null then '[]'::jsonb else private.evaluate_badges(p_student_id, v_club, p_date) end;
  v_quests := case when v_club is null then '[]'::jsonb else private.evaluate_quests(p_student_id, v_club, p_date) end;
  v_week := case when v_club is null then '{}'::jsonb else private.evaluate_week(p_student_id, v_club, p_date) end;
  return jsonb_build_object(
    'completed_today', coalesce(v_count, 0),
    'current_days', coalesce(v_current, 0),
    'longest_days', coalesce(v_longest, 0),
    'first_of_day', v_first,
    -- 節目（7・30・100 日）に、その日の最初の記録で届いた
    'milestone', v_first and coalesce(v_current, 0) in (7, 30, 100),
    'new_badges', v_badges,
    'new_quests', v_quests,
    'new_week', v_week
  );
end;
$$;

-- ===== ガチャの本体：ごほうびの枠を足す =====
drop function public.draw_gacha();
drop function public.draw_gacha_extra();
drop function private.draw_gacha_core(uuid, timestamptz, double precision, double precision, boolean);

create function private.draw_gacha_core(
  p_student_id uuid, p_at timestamptz, p_roll double precision, p_pick double precision,
  p_extra boolean, p_reward_week date default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  c_extra_cost constant integer := 30;
  v_club_id uuid;
  v_today date := private.jst_date(p_at);
  v_rarity text;
  v_count integer;
  v_item public.items;
  v_dup boolean;
  v_draw_id uuid := gen_random_uuid();
  v_coins integer := 0;
  v_balance integer;
  v_reward boolean := p_reward_week is not null;
begin
  select cm.club_id into v_club_id
    from public.club_members cm
   where cm.user_id = p_student_id and cm.member_role = 'student' and cm.status in ('approved', 'pending')
   limit 1;
  if v_club_id is null then
    raise exception 'not_approved_student';
  end if;

  -- ごほうびの1回は、その日の記録がなくても引ける（週の目標を達成した分）
  if not v_reward then
    if not exists (
      select 1 from public.daily_activity da
       where da.student_id = p_student_id and da.activity_date = v_today and da.completed_count > 0
    ) then
      raise exception 'no_record_today';
    end if;

    if not p_extra then
      if exists (select 1 from public.gacha_draws g where g.student_id = p_student_id and g.drawn_on = v_today
                   and not g.is_extra and g.reward_week is null) then
        raise exception 'already_drawn';
      end if;
    else
      if not exists (select 1 from public.gacha_draws g where g.student_id = p_student_id and g.drawn_on = v_today
                       and not g.is_extra and g.reward_week is null) then
        raise exception 'free_draw_first';
      end if;
      if exists (select 1 from public.gacha_draws g where g.student_id = p_student_id and g.drawn_on = v_today
                   and g.is_extra and g.reward_week is null) then
        raise exception 'already_drawn_extra';
      end if;
      select coalesce(sum(ct.amount), 0)::integer into v_balance from public.coin_transactions ct where ct.student_id = p_student_id;
      if v_balance < c_extra_cost then
        raise exception 'not_enough_coins';
      end if;
    end if;
  end if;

  v_rarity := case when p_roll < 0.70 then 'normal' when p_roll < 0.95 then 'rare' else 'super_rare' end;
  select count(*) into v_count from public.items i where i.active and i.rarity = v_rarity;
  if v_count = 0 then
    raise exception 'no_items';
  end if;
  select * into v_item
    from public.items i
   where i.active and i.rarity = v_rarity
   order by i.sort_order, i.code
   offset least(floor(p_pick * v_count)::integer, v_count - 1)
   limit 1;

  v_dup := exists (select 1 from public.user_items ui where ui.student_id = p_student_id and ui.item_id = v_item.id);

  insert into public.gacha_draws (id, club_id, student_id, drawn_on, drawn_at, item_id, rarity, duplicate, is_extra, reward_week)
  values (v_draw_id, v_club_id, p_student_id, v_today, p_at, v_item.id, v_item.rarity, v_dup,
          p_extra and not v_reward, p_reward_week);

  if p_extra and not v_reward then
    insert into public.coin_transactions (club_id, student_id, amount, reason, source_type, source_id, granted_on)
    values (v_club_id, p_student_id, -c_extra_cost, 'gacha_extra', 'gacha_cost', v_draw_id, v_today);
  end if;

  if v_dup then
    v_coins := private.grant_coins(
      p_student_id, v_club_id,
      case v_item.rarity when 'normal' then 5 when 'rare' then 15 else 50 end,
      'gacha_duplicate', 'gacha_draw', v_draw_id, v_today);
    update public.gacha_draws set coins_granted = v_coins where id = v_draw_id;
  else
    insert into public.user_items (club_id, student_id, item_id, category, acquired_at)
    values (v_club_id, p_student_id, v_item.id, v_item.category, p_at);
  end if;

  return jsonb_build_object(
    'draw_id', v_draw_id, 'item_id', v_item.id, 'name', v_item.name, 'category', v_item.category,
    'rarity', v_item.rarity, 'duplicate', v_dup, 'coins_granted', v_coins, 'drawn_at', p_at,
    'extra', p_extra and not v_reward, 'reward', v_reward, 'extra_cost', c_extra_cost,
    'next_draw_at', ((v_today + 1)::timestamp at time zone 'Asia/Tokyo')
  );
end;
$$;
revoke all on function private.draw_gacha_core(uuid, timestamptz, double precision, double precision, boolean, date) from public, anon, authenticated;

create function public.draw_gacha()
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
  return private.draw_gacha_core(v_uid, now(), random(), random(), false, null);
end;
$$;
revoke all on function public.draw_gacha() from public, anon;
grant execute on function public.draw_gacha() to authenticated;

create function public.draw_gacha_extra()
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
  return private.draw_gacha_core(v_uid, now(), random(), random(), true, null);
end;
$$;
revoke all on function public.draw_gacha_extra() from public, anon;
grant execute on function public.draw_gacha_extra() to authenticated;

-- 週の目標のごほうび：今週か先週で、達成して未使用の週の分を1回引く
create function private.draw_gacha_reward_at(p_student_id uuid, p_at timestamptz, p_roll double precision, p_pick double precision)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_this date := private.week_start(private.jst_date(p_at));
  v_week date;
  v_result jsonb;
begin
  -- 同時に2回押されても1回にする
  perform pg_advisory_xact_lock(hashtext('weekly_reward:' || p_student_id::text));

  select w.week_start into v_week
    from public.weekly_progress w
   where w.student_id = p_student_id
     and w.week_start in (v_this, v_this - 7)
     and w.goal_achieved_at is not null and w.reward_used_at is null
   order by w.week_start
   limit 1;
  if v_week is null then
    raise exception 'no_weekly_reward';
  end if;

  v_result := private.draw_gacha_core(p_student_id, p_at, p_roll, p_pick, false, v_week);
  update public.weekly_progress
     set reward_used_at = p_at, reward_draw_id = (v_result ->> 'draw_id')::uuid
   where student_id = p_student_id and week_start = v_week;
  return v_result || jsonb_build_object('reward_week', v_week);
end;
$$;
revoke all on function private.draw_gacha_reward_at(uuid, timestamptz, double precision, double precision) from public, anon, authenticated;

create function public.draw_gacha_reward()
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
  return private.draw_gacha_reward_at(v_uid, now(), random(), random());
end;
$$;
revoke all on function public.draw_gacha_reward() from public, anon;
grant execute on function public.draw_gacha_reward() to authenticated;

-- ===== 目標の日数を変える =====
create function public.set_weekly_target(p_days smallint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_club uuid;
  v_week date := private.week_start(private.jst_today());
  v_row public.weekly_progress;
  v_now_too boolean := false;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  if p_days is null or p_days < 3 or p_days > 7 then
    raise exception 'invalid_target';
  end if;
  v_club := private.my_usable_club_id();
  if v_club is null then
    raise exception 'not_approved_student';
  end if;

  update public.users set weekly_target_days = p_days where id = v_uid;

  -- 今週まだ記録がなく、達成もしていなければ、今週から変える
  select * into v_row from public.weekly_progress w where w.student_id = v_uid and w.week_start = v_week;
  if private.week_study_days(v_uid, v_week) = 0 and (v_row.student_id is null or v_row.goal_achieved_at is null) then
    insert into public.weekly_progress (student_id, club_id, week_start, target_days)
    values (v_uid, v_club, v_week, p_days)
    on conflict (student_id, week_start) do update set target_days = excluded.target_days;
    v_now_too := true;
  end if;

  return jsonb_build_object('target_days', p_days, 'applies_from', case when v_now_too then 'this_week' else 'next_week' end);
end;
$$;
revoke all on function public.set_weekly_target(smallint) from public, anon;
grant execute on function public.set_weekly_target(smallint) to authenticated;

-- ===== 生徒の画面：今週のようす =====
create function public.my_week()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_today date := private.jst_today();
  v_week date := private.week_start(private.jst_today());
  v_row public.weekly_progress;
  v_pref smallint;
  v_target smallint;
  v_best record;
  v_reward_week date;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  select u.weekly_target_days into v_pref from public.users u where u.id = v_uid;
  select * into v_row from public.weekly_progress w where w.student_id = v_uid and w.week_start = v_week;
  v_target := coalesce(v_row.target_days, v_pref, 5);
  select s.subject, s.days into v_best from private.week_subject_days(v_uid, v_week) s limit 1;

  select w.week_start into v_reward_week
    from public.weekly_progress w
   where w.student_id = v_uid and w.week_start in (v_week, v_week - 7)
     and w.goal_achieved_at is not null and w.reward_used_at is null
   order by w.week_start limit 1;

  return jsonb_build_object(
    'week_start', v_week,
    'today', v_today,
    'target_days', v_target,
    'next_target_days', coalesce(v_pref, 5),
    'study_dates', (
      select coalesce(jsonb_agg(da.activity_date order by da.activity_date), '[]'::jsonb)
        from public.daily_activity da
       where da.student_id = v_uid and da.activity_date between v_week and v_week + 6 and da.completed_count > 0
    ),
    'goal_achieved', v_row.goal_achieved_at is not null,
    'reward_available', v_reward_week is not null,
    'reward_week', v_reward_week,
    'reward_used', v_row.reward_used_at is not null,
    'subject_quest', jsonb_build_object(
      'best_subject', v_best.subject,
      'best_days', coalesce(v_best.days, 0),
      'achieved', v_row.subject_quest_at is not null,
      'achieved_subject', v_row.subject_quest_subject,
      'coins', coalesce(v_row.subject_quest_coins, 0)
    )
  );
end;
$$;
revoke all on function public.my_week() from public, anon;
grant execute on function public.my_week() to authenticated;

-- ===== 生徒の画面：週の達成履歴（06 ふりかえり）=====
create function public.my_weekly_history(p_from date, p_to date)
returns table (week_start date, target_days smallint, study_days integer, goal_achieved boolean, subject_quest_subject text)
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
    select w.week_start, w.target_days, private.week_study_days(v_uid, w.week_start),
           w.goal_achieved_at is not null, w.subject_quest_subject
      from public.weekly_progress w
     where w.student_id = v_uid
       and w.week_start + 6 >= p_from and w.week_start <= p_to
     order by w.week_start;
end;
$$;
revoke all on function public.my_weekly_history(date, date) from public, anon;
grant execute on function public.my_weekly_history(date, date) to authenticated;

-- private の判定の本体は、画面から呼ばせない
revoke all on function private.week_study_days(uuid, date) from public, anon, authenticated;
revoke all on function private.week_subject_days(uuid, date) from public, anon, authenticated;
revoke all on function private.ensure_week(uuid, uuid, date) from public, anon, authenticated;
revoke all on function private.evaluate_week(uuid, uuid, date) from public, anon, authenticated;
