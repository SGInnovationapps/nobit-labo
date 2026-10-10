-- 仕様書 v1.7（［仮］）：記録の整理・報酬の3ルール・追加ガチャ
--
--   1. コインの報酬：学習した日 1 コイン（入口を問わず）／配信タスク（運営設定、標準 10）／15 分集中の達成 5。内容の記入には付けない
--   2. 教科の記録：同じ教科は 1 日 1 回。内容は事後にも書ける（set_study_content）
--   3. タイマーはタスクの行からも始められる。終えると、そのタスクも完了する
--   4. 記録の結果に「その日の最初の記録か」「連続記録の節目か」を返す（全面のシートを出すかの判断）
--   5. 追加ガチャ：無料の 1 回のあと、30 コイン［仮］で 1 日 1 回まで

------------------------------------------------------------------------------
-- 1. 台帳の種類
------------------------------------------------------------------------------
alter table public.coin_transactions drop constraint coin_transactions_reason_check;
alter table public.coin_transactions add constraint coin_transactions_reason_check
  check (reason in ('task_complete', 'study_plain', 'study_content', 'focus_complete', 'gacha_duplicate',
                    'mission_personal', 'mission_club', 'study_day', 'gacha_extra'));
alter table public.coin_transactions drop constraint coin_transactions_source_type_check;
alter table public.coin_transactions add constraint coin_transactions_source_type_check
  check (source_type in ('user_task', 'study_record', 'focus_session', 'gacha_draw', 'mission_personal', 'mission_club',
                         'study_day', 'gacha_cost'));
-- 学習した日の 1 コインは、1 日に 1 回だけ
create unique index coin_transactions_study_day_daily
  on public.coin_transactions (student_id, granted_on) where reason = 'study_day';

------------------------------------------------------------------------------
-- 2. 教科の記録と内容
------------------------------------------------------------------------------
-- 教科タグにも内容を足せるようにする（内容はクラブ管理者に見せない）
alter table public.study_records drop constraint study_records_tag_shape;
alter table public.study_records add constraint study_records_tag_shape check (kind <> 'tag' or ended_at is not null);
-- タスクの行から始めたタイマー（終えるとそのタスクも完了する）
alter table public.study_records add column user_task_id uuid references public.user_tasks (id) on delete set null;

-- 内容を書く・直す（自分の記録だけ。空にすると消える）
create function public.set_study_content(p_record_id uuid, p_content text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_content text := nullif(btrim(coalesce(p_content, '')), '');
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  if v_content is not null and char_length(v_content) > 60 then
    raise exception 'content_too_long';
  end if;
  update public.study_records set content = v_content
   where id = p_record_id and student_id = v_uid;
  if not found then
    raise exception 'record_not_found';
  end if;
end;
$$;

------------------------------------------------------------------------------
-- 3. 学習した日の 1 コインと、結果の判定
------------------------------------------------------------------------------
create function private.award_study_day(p_student_id uuid, p_club_id uuid, p_date date)
returns integer
language sql
security definer
set search_path = ''
as $$
  select private.grant_coins(p_student_id, p_club_id, 1, 'study_day', 'study_day',
                             md5(p_student_id::text || ':' || p_date::text)::uuid, p_date);
$$;

-- 記録の結果のうち、画面が使う共通の部分
create function private.record_outcome(p_student_id uuid, p_date date)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
  v_current integer;
  v_longest integer;
  v_first boolean;
begin
  select da.completed_count into v_count from public.daily_activity da
   where da.student_id = p_student_id and da.activity_date = p_date;
  select s.current_days, s.longest_days into v_current, v_longest from public.streaks s where s.student_id = p_student_id;
  v_first := coalesce(v_count, 0) = 1;
  return jsonb_build_object(
    'completed_today', coalesce(v_count, 0),
    'current_days', coalesce(v_current, 0),
    'longest_days', coalesce(v_longest, 0),
    'first_of_day', v_first,
    -- 節目（7・30・100 日）に、その日の最初の記録で届いた
    'milestone', v_first and coalesce(v_current, 0) in (7, 30, 100)
  );
end;
$$;

------------------------------------------------------------------------------
-- 4. タスクの完了
------------------------------------------------------------------------------
create or replace function private.complete_task_at(p_user_task_id uuid, p_student_id uuid, p_at timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ut record;
  v_today date := private.jst_date(p_at);
  v_already boolean := false;
  v_task_coins integer := 0;
  v_day_coin integer := 0;
  v_reward integer;
  v_kind text;
  v_outcome jsonb;
begin
  select ut.id, ut.club_id, ut.task_id, ut.task_date, ut.completed_at
    into v_ut
    from public.user_tasks ut
   where ut.id = p_user_task_id
     and ut.student_id = p_student_id
   for update;
  if not found then
    raise exception 'task_not_found';
  end if;

  if not exists (
    select 1 from public.club_members cm
     where cm.user_id = p_student_id and cm.club_id = v_ut.club_id
       and cm.member_role = 'student' and cm.status = 'approved'
  ) then
    raise exception 'not_approved_student';
  end if;

  if v_ut.completed_at is not null then
    v_already := true;
  else
    if v_ut.task_date > v_today then
      raise exception 'task_not_yet_available';
    end if;

    update public.user_tasks set completed_at = p_at where id = v_ut.id;
    perform private.record_study_activity(p_student_id, v_ut.club_id, v_today);

    select t.reward_coins, t.kind into v_reward, v_kind from public.tasks t where t.id = v_ut.task_id;
    -- v1.7：自分で作ったタスクにはタスクのコインを付けない（学習した日の 1 コインは付く）
    v_task_coins := private.grant_coins(p_student_id, v_ut.club_id, case when v_kind = 'free' then 0 else coalesce(v_reward, 0) end,
                                        'task_complete', 'user_task', v_ut.id, v_today);
    v_day_coin := private.award_study_day(p_student_id, v_ut.club_id, v_today);
  end if;

  v_outcome := private.record_outcome(p_student_id, private.jst_date(coalesce(v_ut.completed_at, p_at)));
  -- すでに完了していた呼び出しでは、「最初の記録」の表示は出さない
  if v_already then
    v_outcome := v_outcome || jsonb_build_object('first_of_day', false, 'milestone', false);
  end if;

  return v_outcome || jsonb_build_object(
    'user_task_id', v_ut.id,
    'completed_at', coalesce(v_ut.completed_at, p_at),
    'already_completed', v_already,
    'coins_granted', v_task_coins + v_day_coin,
    'task_coins', v_task_coins,
    'day_coin', v_day_coin
  );
end;
$$;

------------------------------------------------------------------------------
-- 5. 教科の記録（同じ教科は 1 日 1 回）
------------------------------------------------------------------------------
create or replace function private.record_study_tag_at(p_student_id uuid, p_subject text, p_at timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_club_id uuid;
  v_date date := private.jst_date(p_at);
  v_id uuid;
  v_existing public.study_records;
  v_day_coin integer;
  v_outcome jsonb;
begin
  select cm.club_id into v_club_id
    from public.club_members cm
   where cm.user_id = p_student_id and cm.member_role = 'student' and cm.status = 'approved';
  if v_club_id is null then
    raise exception 'not_approved_student';
  end if;
  if p_subject not in ('英語', '数学', '国語', '理科', '社会') then
    raise exception 'invalid_subject' using errcode = '23514';
  end if;

  -- 同時に 2 回押されても 1 件にする
  perform pg_advisory_xact_lock(hashtext(p_student_id::text || ':' || p_subject || ':' || v_date::text));

  select * into v_existing
    from public.study_records r
   where r.student_id = p_student_id and r.kind = 'tag' and r.subject = p_subject and r.record_date = v_date
   order by r.started_at limit 1;
  if found then
    return private.record_outcome(p_student_id, v_date)
      || jsonb_build_object('record_id', v_existing.id, 'already_recorded', true, 'recorded_at', v_existing.started_at,
                            'coins_granted', 0, 'first_of_day', false, 'milestone', false);
  end if;

  insert into public.study_records (club_id, student_id, kind, subject, started_at, ended_at, record_date)
  values (v_club_id, p_student_id, 'tag', p_subject, p_at, p_at, v_date)
  returning id into v_id;

  perform private.record_study_activity(p_student_id, v_club_id, v_date);
  v_day_coin := private.award_study_day(p_student_id, v_club_id, v_date);
  v_outcome := private.record_outcome(p_student_id, v_date);

  return v_outcome || jsonb_build_object('record_id', v_id, 'already_recorded', false, 'recorded_at', p_at,
                                         'coins_granted', v_day_coin);
end;
$$;

------------------------------------------------------------------------------
-- 6. タイマー（タスクの行から始められる。終えるとそのタスクも完了する）
------------------------------------------------------------------------------
drop function public.start_study_timer(text, text);
create function public.start_study_timer(p_subject text, p_content text default null, p_user_task_id uuid default null)
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
  if p_user_task_id is not null and not exists (
    select 1 from public.user_tasks ut where ut.id = p_user_task_id and ut.student_id = v_uid
  ) then
    raise exception 'task_not_found';
  end if;

  insert into public.study_records (club_id, student_id, kind, subject, content, user_task_id)
  values (v_club_id, v_uid, 'timer', p_subject, v_content, p_user_task_id)
  returning * into v_row;

  return jsonb_build_object('record_id', v_row.id, 'started_at', v_row.started_at);
end;
$$;

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

  -- ［仮］15 分集中の達成は 5 コイン、1 日 1 回（内容の記入には付けない）
  if v_achieved then
    if not exists (select 1 from public.coin_transactions ct
                    where ct.student_id = p_student_id and ct.reason = 'focus_complete' and ct.granted_on = v_date) then
      insert into public.coin_transactions (club_id, student_id, amount, reason, source_type, source_id, granted_on)
      values (v_rec.club_id, p_student_id, 5, 'focus_complete', 'focus_session', v_rec.id, v_date);
      v_bonus := 5;
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

------------------------------------------------------------------------------
-- 7. 追加ガチャ（無料の 1 回のあと、30 コイン［仮］で 1 日 1 回まで）
------------------------------------------------------------------------------
alter table public.gacha_draws add column is_extra boolean not null default false;
alter table public.gacha_draws drop constraint gacha_draws_student_id_drawn_on_key;
create unique index gacha_draws_free_daily on public.gacha_draws (student_id, drawn_on) where not is_extra;
create unique index gacha_draws_extra_daily on public.gacha_draws (student_id, drawn_on) where is_extra;

create function private.draw_gacha_core(p_student_id uuid, p_at timestamptz, p_roll double precision, p_pick double precision, p_extra boolean)
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
begin
  select cm.club_id into v_club_id
    from public.club_members cm
   where cm.user_id = p_student_id and cm.member_role = 'student' and cm.status = 'approved'
   limit 1;
  if v_club_id is null then
    raise exception 'not_approved_student';
  end if;

  if not exists (
    select 1 from public.daily_activity da
     where da.student_id = p_student_id and da.activity_date = v_today and da.completed_count > 0
  ) then
    raise exception 'no_record_today';
  end if;

  if not p_extra then
    if exists (select 1 from public.gacha_draws g where g.student_id = p_student_id and g.drawn_on = v_today and not g.is_extra) then
      raise exception 'already_drawn';
    end if;
  else
    if not exists (select 1 from public.gacha_draws g where g.student_id = p_student_id and g.drawn_on = v_today and not g.is_extra) then
      raise exception 'free_draw_first';
    end if;
    if exists (select 1 from public.gacha_draws g where g.student_id = p_student_id and g.drawn_on = v_today and g.is_extra) then
      raise exception 'already_drawn_extra';
    end if;
    select coalesce(sum(ct.amount), 0)::integer into v_balance from public.coin_transactions ct where ct.student_id = p_student_id;
    if v_balance < c_extra_cost then
      raise exception 'not_enough_coins';
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

  insert into public.gacha_draws (id, club_id, student_id, drawn_on, drawn_at, item_id, rarity, duplicate, is_extra)
  values (v_draw_id, v_club_id, p_student_id, v_today, p_at, v_item.id, v_item.rarity, v_dup, p_extra);

  if p_extra then
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
    'extra', p_extra, 'extra_cost', c_extra_cost,
    'next_draw_at', ((v_today + 1)::timestamp at time zone 'Asia/Tokyo')
  );
end;
$$;

create or replace function private.draw_gacha_at(p_student_id uuid, p_at timestamptz, p_roll double precision, p_pick double precision)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select private.draw_gacha_core(p_student_id, p_at, p_roll, p_pick, false);
$$;

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
  return private.draw_gacha_core(v_uid, now(), random(), random(), true);
end;
$$;

------------------------------------------------------------------------------
-- 8. 権限
------------------------------------------------------------------------------
revoke all on function private.award_study_day(uuid, uuid, date) from public, anon, authenticated;
revoke all on function private.record_outcome(uuid, date) from public, anon, authenticated;
revoke all on function private.draw_gacha_core(uuid, timestamptz, double precision, double precision, boolean) from public, anon, authenticated;
revoke all on function public.set_study_content(uuid, text) from public, anon, authenticated;
revoke all on function public.start_study_timer(text, text, uuid) from public, anon, authenticated;
revoke all on function public.draw_gacha_extra() from public, anon, authenticated;
grant execute on function public.set_study_content(uuid, text) to authenticated;
grant execute on function public.start_study_timer(text, text, uuid) to authenticated;
grant execute on function public.draw_gacha_extra() to authenticated;
