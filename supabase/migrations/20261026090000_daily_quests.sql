-- デイリークエストの達成記録とコイン（仕様書 5-5・5-7）
--
-- クエストは3つ（配信タスクを1つ完了・合計15分・2教科）。今日の配信タスクがない生徒には
-- 1つめを出さないので、その日のクエストは2つになる（画面の questsOf と同じ数え方）。
-- ［確定］1つ達成で3コイン、その日のクエストを全部達成でさらに5コイン（1日 最大14）。
--
-- 記録のたびに判定する。達成の記録と台帳の両方に重なり防止があるので、二重には付かない。

alter table public.coin_transactions drop constraint coin_transactions_reason_check;
alter table public.coin_transactions add constraint coin_transactions_reason_check check (
  reason in ('task_complete', 'study_plain', 'study_content', 'focus_complete', 'gacha_duplicate',
             'mission_personal', 'mission_club', 'study_day', 'gacha_extra',
             'daily_quest', 'quest_bonus')
);
alter table public.coin_transactions drop constraint coin_transactions_source_type_check;
alter table public.coin_transactions add constraint coin_transactions_source_type_check check (
  source_type in ('user_task', 'study_record', 'focus_session', 'gacha_draw',
                  'mission_personal', 'mission_club', 'study_day', 'gacha_cost',
                  'daily_quest')
);

create table public.quest_achievements (
  id bigint generated always as identity primary key,
  club_id uuid not null references public.clubs (id) on delete restrict,
  student_id uuid not null references public.users (id) on delete cascade,
  quest_date date not null,
  -- all は、その日のクエストを全部達成したときのボーナス
  quest_key text not null check (quest_key in ('assigned', 'minutes', 'subjects', 'all')),
  coins integer not null default 0 check (coins >= 0),
  achieved_at timestamptz not null default now(),
  unique (student_id, quest_date, quest_key)
);
comment on table public.quest_achievements is 'デイリークエストの達成。1人1日1クエスト1行で、二重付与を防ぐ';

create index quest_achievements_student_idx on public.quest_achievements (student_id, quest_date desc);

alter table public.quest_achievements enable row level security;
create policy quest_achievements_select on public.quest_achievements for select to authenticated
  using (student_id = (select auth.uid()) or (select private.is_operator()));

-- ===== 判定 =====

-- その日のクエストの達成状況。画面の questsOf と同じ数え方にそろえる
create function private.quest_state(p_student_id uuid, p_date date)
returns table (quest_key text, applicable boolean, done boolean)
language sql
stable
security definer
set search_path = ''
as $$
  with assigned as (
    select count(*) as total, count(*) filter (where ut.completed_at is not null) as done
      from public.user_tasks ut
     where ut.student_id = p_student_id and ut.task_date = p_date and not ut.is_free
  ),
  minutes as (
    select coalesce(sum(r.duration_seconds), 0) as secs
      from public.study_records r
     where r.student_id = p_student_id and r.record_date = p_date and r.kind = 'timer'
  ),
  subjects as (
    select count(distinct s) as n from (
      select t.subject as s
        from public.user_tasks ut
        join public.tasks t on t.id = ut.task_id
       where ut.student_id = p_student_id and ut.task_date = p_date and ut.completed_at is not null
      union
      select r.subject
        from public.study_records r
       where r.student_id = p_student_id and r.record_date = p_date and r.ended_at is not null
    ) x
  )
  select 'assigned', (select total from assigned) > 0, (select done from assigned) >= 1
  union all
  select 'minutes', true, (select secs from minutes) >= 15 * 60
  union all
  select 'subjects', true, (select n from subjects) >= 2
$$;

-- 達成したクエストを記録し、コインを付ける。新しく達成した分だけを返す
create function private.evaluate_quests(p_student_id uuid, p_club_id uuid, p_date date)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_new jsonb := '[]'::jsonb;
  v_row record;
  v_coins integer;
  v_applicable integer;
  v_done integer;
begin
  if p_club_id is null then
    return v_new;
  end if;

  for v_row in
    select q.quest_key from private.quest_state(p_student_id, p_date) q
     where q.applicable and q.done
       and not exists (
         select 1 from public.quest_achievements a
          where a.student_id = p_student_id and a.quest_date = p_date and a.quest_key = q.quest_key
       )
  loop
    v_coins := private.grant_coins(
      p_student_id, p_club_id, 3, 'daily_quest', 'daily_quest',
      md5(p_student_id::text || ':' || p_date::text || ':' || v_row.quest_key)::uuid, p_date
    );
    insert into public.quest_achievements (club_id, student_id, quest_date, quest_key, coins)
    values (p_club_id, p_student_id, p_date, v_row.quest_key, v_coins)
    on conflict (student_id, quest_date, quest_key) do nothing;
    v_new := v_new || jsonb_build_object('key', v_row.quest_key, 'coins', v_coins);
  end loop;

  -- その日のクエストを全部達成したら、ボーナス
  select count(*) filter (where q.applicable), count(*) filter (where q.applicable and q.done)
    into v_applicable, v_done
    from private.quest_state(p_student_id, p_date) q;

  if v_applicable > 0 and v_done = v_applicable
     and not exists (
       select 1 from public.quest_achievements a
        where a.student_id = p_student_id and a.quest_date = p_date and a.quest_key = 'all'
     ) then
    v_coins := private.grant_coins(
      p_student_id, p_club_id, 5, 'quest_bonus', 'daily_quest',
      md5(p_student_id::text || ':' || p_date::text || ':all')::uuid, p_date
    );
    insert into public.quest_achievements (club_id, student_id, quest_date, quest_key, coins)
    values (p_club_id, p_student_id, p_date, 'all', v_coins)
    on conflict (student_id, quest_date, quest_key) do nothing;
    v_new := v_new || jsonb_build_object('key', 'all', 'coins', v_coins);
  end if;

  return v_new;
end;
$$;

-- ===== 記録のたびに判定する =====
-- record_outcome は、タスクの完了・教科の記録・タイマー・ドリルのすべての入口から呼ばれる
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
begin
  select da.completed_count into v_count from public.daily_activity da
   where da.student_id = p_student_id and da.activity_date = p_date;
  select s.current_days, s.longest_days, s.club_id into v_current, v_longest, v_club from public.streaks s where s.student_id = p_student_id;
  v_first := coalesce(v_count, 0) = 1;
  v_badges := case when v_club is null then '[]'::jsonb else private.evaluate_badges(p_student_id, v_club, p_date) end;
  v_quests := case when v_club is null then '[]'::jsonb else private.evaluate_quests(p_student_id, v_club, p_date) end;
  return jsonb_build_object(
    'completed_today', coalesce(v_count, 0),
    'current_days', coalesce(v_current, 0),
    'longest_days', coalesce(v_longest, 0),
    'first_of_day', v_first,
    -- 節目（7・30・100 日）に、その日の最初の記録で届いた
    'milestone', v_first and coalesce(v_current, 0) in (7, 30, 100),
    'new_badges', v_badges,
    'new_quests', v_quests
  );
end;
$$;

-- ===== 生徒の画面：クエストの達成履歴（06 ふりかえり）=====
create function public.my_quest_history(p_from date, p_to date)
returns table (quest_date date, keys text[], coins integer)
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
    select a.quest_date,
           array_agg(a.quest_key order by a.quest_key),
           sum(a.coins)::int
      from public.quest_achievements a
     where a.student_id = v_uid and a.quest_date between p_from and p_to
     group by a.quest_date
     order by a.quest_date;
end;
$$;
revoke all on function public.my_quest_history(date, date) from public, anon;
grant execute on function public.my_quest_history(date, date) to authenticated;
