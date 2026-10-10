-- 15分集中モード（画面03）。study_records のタイマーに「目標秒数・一時停止」を足して使う。
-- 追加のマイグレーションで作る（25 テーブル設計は変えない）。
-- ［仮］達成ボーナスは 5 コイン・1 日 1 回。確定したら仕様書を更新する。

alter table public.study_records
  add column focus_target_seconds integer check (focus_target_seconds is null or focus_target_seconds > 0),
  add column paused_at timestamptz,
  add column paused_seconds integer not null default 0 check (paused_seconds >= 0),
  add column focus_achieved boolean;
comment on column public.study_records.focus_target_seconds is '集中モードの目標秒数（15 分 = 900）。通常のタイマーは null。';
comment on column public.study_records.paused_at is '一時停止中ならその開始時刻。';
comment on column public.study_records.paused_seconds is '一時停止していた秒数の合計（再開した分）。';
comment on column public.study_records.focus_achieved is '終えたとき、目標の時間に届いたか。通常のタイマーは null。';

alter table public.coin_transactions drop constraint coin_transactions_reason_check;
alter table public.coin_transactions add constraint coin_transactions_reason_check
  check (reason in ('task_complete', 'study_plain', 'study_content', 'focus_complete'));
-- 集中モードの達成ボーナスは 1 日に 1 回だけ
create unique index coin_transactions_focus_daily
  on public.coin_transactions (student_id, granted_on) where reason = 'focus_complete';

-- 集中モードを始める（実行中のタイマーがあれば始められない）
create function public.start_focus_session(p_subject text, p_content text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_club_id uuid := private.my_student_club_id();
  v_content text := nullif(btrim(coalesce(p_content, '')), '');
  v_row public.study_records;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  if v_club_id is null then
    raise exception 'not_approved_student';
  end if;
  if exists (select 1 from public.study_records r where r.student_id = v_uid and r.ended_at is null) then
    raise exception 'timer_already_running';
  end if;
  insert into public.study_records (club_id, student_id, kind, subject, content, focus_target_seconds)
  values (v_club_id, v_uid, 'timer', p_subject, v_content, 900)
  returning * into v_row;
  return jsonb_build_object('record_id', v_row.id, 'started_at', v_row.started_at);
end;
$$;

create function private.pause_study_timer_at(p_student_id uuid, p_at timestamptz)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rec public.study_records;
begin
  select * into v_rec from public.study_records r
   where r.student_id = p_student_id and r.ended_at is null for update;
  if not found then
    raise exception 'no_running_timer';
  end if;
  if v_rec.focus_target_seconds is null then
    raise exception 'not_focus_session';
  end if;
  if v_rec.paused_at is not null then
    return;
  end if;
  update public.study_records set paused_at = p_at where id = v_rec.id;
end;
$$;

create function private.resume_study_timer_at(p_student_id uuid, p_at timestamptz)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rec public.study_records;
begin
  select * into v_rec from public.study_records r
   where r.student_id = p_student_id and r.ended_at is null for update;
  if not found then
    raise exception 'no_running_timer';
  end if;
  if v_rec.paused_at is null then
    return;
  end if;
  update public.study_records
     set paused_seconds = paused_seconds + greatest(0, floor(extract(epoch from (p_at - paused_at)))::integer),
         paused_at = null
   where id = v_rec.id;
end;
$$;

create function public.pause_focus_session() returns void
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  perform private.pause_study_timer_at(v_uid, now());
end;
$$;

create function public.resume_focus_session() returns void
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  perform private.resume_study_timer_at(v_uid, now());
end;
$$;

-- タイマーを終える。集中モードは、一時停止を除いた時間で数える（目標を超えた分は数えない）。
-- 途中で終えても、経過した時間は記録に残る。達成ボーナスは目標に届いたときだけ（1 日 1 回）。
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
  v_coins integer;
  v_bonus integer := 0;
  v_achieved boolean;
  v_current integer;
  v_longest integer;
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
    -- 一時停止中に終えたら、止めた時点までを数える
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

  perform private.record_study_activity(p_student_id, v_rec.club_id, v_date);

  if v_rec.content is not null then
    if (select count(*) from public.coin_transactions ct
         where ct.student_id = p_student_id and ct.reason = 'study_content' and ct.granted_on = v_date) < 3 then
      v_coins := private.grant_coins(p_student_id, v_rec.club_id, 3, 'study_content', 'study_record', v_rec.id, v_date);
    else
      v_coins := 0;
    end if;
  else
    v_coins := private.grant_coins(p_student_id, v_rec.club_id, 1, 'study_plain', 'study_record', v_rec.id, v_date);
  end if;

  -- ［仮］達成ボーナス 5 コイン、1 日 1 回。同じ記録に別の理由で付与済みなら (source_type, source_id) の一意で重ならないよう別の source を使う
  if v_achieved then
    if not exists (select 1 from public.coin_transactions ct
                    where ct.student_id = p_student_id and ct.reason = 'focus_complete' and ct.granted_on = v_date) then
      insert into public.coin_transactions (club_id, student_id, amount, reason, source_type, source_id, granted_on)
      values (v_rec.club_id, p_student_id, 5, 'focus_complete', 'focus_session', v_rec.id, v_date);
      v_bonus := 5;
    end if;
  end if;

  select s.current_days, s.longest_days into v_current, v_longest from public.streaks s where s.student_id = p_student_id;
  return jsonb_build_object('record_id', v_rec.id, 'duration_seconds', v_seconds, 'ended_at', v_ended,
                            'coins_granted', v_coins, 'focus_achieved', coalesce(v_achieved, false),
                            'focus_bonus', v_bonus,
                            'current_days', coalesce(v_current, 0), 'longest_days', coalesce(v_longest, 0));
end;
$$;

-- source_type に集中モードの達成を足す（同じ記録に「記録のコイン」と「達成ボーナス」を別々に残すため）
alter table public.coin_transactions drop constraint coin_transactions_source_type_check;
alter table public.coin_transactions add constraint coin_transactions_source_type_check
  check (source_type in ('user_task', 'study_record', 'focus_session'));

revoke all on function private.pause_study_timer_at(uuid, timestamptz) from public, anon, authenticated;
revoke all on function private.resume_study_timer_at(uuid, timestamptz) from public, anon, authenticated;
revoke all on function private.stop_study_timer_at(uuid, timestamptz, integer) from public, anon, authenticated;
revoke all on function public.start_focus_session(text, text) from public, anon, authenticated;
revoke all on function public.pause_focus_session() from public, anon, authenticated;
revoke all on function public.resume_focus_session() from public, anon, authenticated;
grant execute on function public.start_focus_session(text, text) to authenticated;
grant execute on function public.pause_focus_session() to authenticated;
grant execute on function public.resume_focus_session() to authenticated;

