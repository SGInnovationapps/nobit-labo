-- 集中モードの長さを 15・25・50 分から選べるようにする（これまでは 15 分だけ）
-- ［仮］達成ボーナスは 15 分 5・25 分 8・50 分 15 コイン。1 日 1 回（その日の最初の達成）は変えない。
-- 画面の古い版は p_minutes を渡さないので、既定の 15 分で始まる。

comment on column public.study_records.focus_target_seconds is '集中モードの目標秒数（15 分 900・25 分 1500・50 分 3000）。通常のタイマーは null。';

------------------------------------------------------------------------------
-- 達成ボーナスのコイン（目標秒数から）
------------------------------------------------------------------------------
create function private.focus_bonus_coins(p_target_seconds integer)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case p_target_seconds
    when 1500 then 8
    when 3000 then 15
    else 5
  end
$$;
revoke all on function private.focus_bonus_coins(integer) from public, anon, authenticated;

------------------------------------------------------------------------------
-- 集中モードを始める：長さ（分）を選ぶ
------------------------------------------------------------------------------
drop function public.start_focus_session(text, text);

create function public.start_focus_session(p_subject text, p_content text default null, p_minutes integer default 15)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_club_id uuid := private.my_usable_club_id();
  v_content text := nullif(btrim(coalesce(p_content, '')), '');
  v_row public.study_records;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  if v_club_id is null then
    raise exception 'not_approved_student';
  end if;
  if p_minutes is null or p_minutes not in (15, 25, 50) then
    raise exception 'invalid_minutes';
  end if;
  if exists (select 1 from public.study_records r where r.student_id = v_uid and r.ended_at is null) then
    raise exception 'timer_already_running';
  end if;
  insert into public.study_records (club_id, student_id, kind, subject, content, focus_target_seconds)
  values (v_club_id, v_uid, 'timer', p_subject, v_content, p_minutes * 60)
  returning * into v_row;
  return jsonb_build_object('record_id', v_row.id, 'started_at', v_row.started_at,
                            'focus_target_seconds', v_row.focus_target_seconds);
end;
$$;
revoke all on function public.start_focus_session(text, text, integer) from public, anon, authenticated;
grant execute on function public.start_focus_session(text, text, integer) to authenticated;

------------------------------------------------------------------------------
-- タイマーを終える：達成ボーナスを長さに合わせる（ほかは v17 のまま）
------------------------------------------------------------------------------
create or replace function private.stop_study_timer_at(p_student_id uuid, p_at timestamptz, p_minutes integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rec public.study_records;
  v_end_at timestamptz;
  v_elapsed integer;
  v_seconds integer;
  v_ended timestamptz;
  v_date date;
  v_task_coins integer := 0;
  v_day_coin integer := 0;
  v_bonus integer := 0;
  v_achieved boolean;
  v_task jsonb;
  v_outcome jsonb;
begin
  select * into v_rec
    from public.study_records r
   where r.student_id = p_student_id and r.ended_at is null
   for update;
  if not found then
    raise exception 'no_running_timer';
  end if;

  if v_rec.focus_target_seconds is not null then
    if p_minutes is not null then
      raise exception 'invalid_minutes';
    end if;
    v_end_at := coalesce(v_rec.paused_at, p_at);
    v_elapsed := greatest(0, floor(extract(epoch from (v_end_at - v_rec.started_at)))::integer - v_rec.paused_seconds);
    v_seconds := least(v_elapsed, v_rec.focus_target_seconds);
    v_achieved := v_seconds >= v_rec.focus_target_seconds;
    v_ended := v_rec.started_at + make_interval(secs => v_seconds + v_rec.paused_seconds);
    if v_ended > p_at then
      v_ended := p_at;
    end if;
  else
    v_elapsed := greatest(0, floor(extract(epoch from (p_at - v_rec.started_at)))::integer);
    if p_minutes is not null then
      if p_minutes < 0 or p_minutes * 60 > v_elapsed then
        raise exception 'invalid_minutes';
      end if;
      v_seconds := p_minutes * 60;
      v_ended := v_rec.started_at + make_interval(secs => v_seconds);
    else
      v_seconds := v_elapsed;
      v_ended := p_at;
    end if;
    v_achieved := null;
  end if;
  v_date := private.jst_date(v_ended);

  update public.study_records
     set ended_at = v_ended, duration_seconds = v_seconds, record_date = v_date,
         paused_at = null, focus_achieved = v_achieved
   where id = v_rec.id;

  -- タスクの行から始めたタイマーで、そのタスクがまだ未完了なら、タスクの完了として記録する（記録の数は 1 件）
  if v_rec.user_task_id is not null and exists (
    select 1 from public.user_tasks ut where ut.id = v_rec.user_task_id and ut.completed_at is null and ut.task_date <= v_date
  ) then
    v_task := private.complete_task_at(v_rec.user_task_id, p_student_id, v_ended);
    v_task_coins := coalesce((v_task ->> 'task_coins')::integer, 0);
    v_day_coin := coalesce((v_task ->> 'day_coin')::integer, 0);
  else
    perform private.record_study_activity(p_student_id, v_rec.club_id, v_date);
    v_day_coin := private.award_study_day(p_student_id, v_rec.club_id, v_date);
  end if;

  -- ［仮］集中モードの達成ボーナスは長さで変える（15 分 5・25 分 8・50 分 15）。1 日 1 回（その日の最初の達成）
  if v_achieved then
    if not exists (select 1 from public.coin_transactions ct
                    where ct.student_id = p_student_id and ct.reason = 'focus_complete' and ct.granted_on = v_date) then
      v_bonus := private.focus_bonus_coins(v_rec.focus_target_seconds);
      insert into public.coin_transactions (club_id, student_id, amount, reason, source_type, source_id, granted_on)
      values (v_rec.club_id, p_student_id, v_bonus, 'focus_complete', 'focus_session', v_rec.id, v_date);
    end if;
  end if;

  v_outcome := private.record_outcome(p_student_id, v_date);
  return v_outcome || jsonb_build_object(
    'record_id', v_rec.id, 'duration_seconds', v_seconds, 'ended_at', v_ended,
    'coins_granted', v_task_coins + v_day_coin, 'focus_achieved', coalesce(v_achieved, false), 'focus_bonus', v_bonus,
    'task_completed', v_task is not null
  );
end;
$$;
revoke all on function private.stop_study_timer_at(uuid, timestamptz, integer) from public, anon, authenticated;

------------------------------------------------------------------------------
-- バッジの文言（どの長さでも数える）
------------------------------------------------------------------------------
update public.badge_defs set name = '集中チャレンジャー', condition = '集中モードを初めて最後まで続ける' where code = 'focus_first';
update public.badge_defs set condition = '集中モードを10回、最後まで続ける' where code = 'focus_10';
