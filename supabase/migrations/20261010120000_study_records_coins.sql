-- 仕様書 v1.6：学習記録の入口を「タスク完了・教科タグ・タイマー」の 3 つにする
--
--   1. study_records     教科タグ（事後のワンタップ）とタイマーの記録。教科・内容はクラブ管理者に見せない
--   2. coin_transactions コインの台帳。残高は台帳の合計（coin_balances ビュー）
--   3. record_study_activity  学習日の記録と連続記録の更新を 1 か所に集める（タスク完了からも使う）
--   4. complete_task_at / register_free_task を改める（連続記録の共通化、コインの付与、自由登録は 3 コイン）
--   5. 閲覧範囲の版 2（教科タグ・タイマーの記録も記録の帯に数える）。保護者の同意を取り直す
--
-- コインの付与［仮含む］
--   配信タスクの完了         ：tasks.reward_coins（運営が設定）
--   自由登録のタスクの完了   ：3 コイン（1 日 3 件まで登録できるので、実質 1 日 9 コインまで）
--   内容を書かない教科タグ・タイマー：1 日に 1 コインまで
--   内容を書いたタイマー     ：1 件 3 コイン、1 日 3 件まで

------------------------------------------------------------------------------
-- 1. study_records
------------------------------------------------------------------------------

create table public.study_records (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete restrict,
  student_id uuid not null references public.users (id) on delete cascade,
  kind text not null check (kind in ('tag', 'timer')),
  subject text not null check (subject in ('英語', '数学', '国語', '理科', '社会')),
  content text check (content is null or char_length(btrim(content)) between 1 and 60),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  duration_seconds integer check (duration_seconds is null or duration_seconds >= 0),
  -- 記録した日（JST）。終えたときに入る。実行中のタイマーは null
  record_date date,
  created_at timestamptz not null default now(),
  constraint study_records_finished check ((ended_at is null) = (record_date is null)),
  constraint study_records_tag_shape check (kind <> 'tag' or (content is null and ended_at is not null)),
  constraint study_records_order check (ended_at is null or ended_at >= started_at)
);
comment on table public.study_records is
  '教科タグ（kind=tag：事後にワンタップ）とタイマー（kind=timer：内容の記入→開始→終了）の記録。書き込みは関数だけ。クラブ管理者には見せない。';
comment on column public.study_records.content is 'タイマーの開始前に書く内容（任意）。クラブ管理者には見せない。';
create index study_records_student_date_idx on public.study_records (student_id, record_date);
-- 実行中のタイマーは 1 人 1 つ
create unique index study_records_one_running on public.study_records (student_id) where ended_at is null;

alter table public.study_records enable row level security;
create policy study_records_select on public.study_records for select to authenticated
  using (student_id = (select auth.uid()) or (select private.is_operator()));

------------------------------------------------------------------------------
-- 2. coin_transactions：コインの台帳（増減はすべてここに残す）
------------------------------------------------------------------------------

create table public.coin_transactions (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete restrict,
  student_id uuid not null references public.users (id) on delete cascade,
  amount integer not null check (amount <> 0),
  reason text not null check (reason in ('task_complete', 'study_plain', 'study_content')),
  -- 何の記録に対する付与か。同じ記録に二重に付与しない
  source_type text not null check (source_type in ('user_task', 'study_record')),
  source_id uuid not null,
  granted_on date not null,
  created_at timestamptz not null default now(),
  unique (source_type, source_id)
);
comment on table public.coin_transactions is 'コインの台帳。残高は coin_balances（台帳の合計）。書き込みは関数だけ。';
create index coin_transactions_student_idx on public.coin_transactions (student_id, created_at desc);
-- 内容を書かない記録のコインは、1 日に 1 回だけ
create unique index coin_transactions_plain_daily
  on public.coin_transactions (student_id, granted_on) where reason = 'study_plain';

alter table public.coin_transactions enable row level security;
create policy coin_transactions_select on public.coin_transactions for select to authenticated
  using (student_id = (select auth.uid()) or (select private.is_operator()));

create view public.coin_balances
with (security_invoker = true)
as
select ct.student_id, sum(ct.amount)::integer as balance
  from public.coin_transactions ct
 group by ct.student_id;

revoke all on public.study_records, public.coin_transactions, public.coin_balances from anon, authenticated;
grant select on public.study_records, public.coin_transactions, public.coin_balances to authenticated;

------------------------------------------------------------------------------
-- 3. 学習日の記録と連続記録（どの入口から記録しても同じ扱い）
------------------------------------------------------------------------------

create function private.record_study_activity(p_student_id uuid, p_club_id uuid, p_date date)
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
  elsif v_streak.last_achieved_date = p_date - 1 then
    v_new_current := v_streak.current_days + 1;      -- 前の日から続いている
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
comment on function private.record_study_activity(uuid, uuid, date) is
  '学習の記録 1 件ぶん：記録の帯の数を 1 増やし、連続記録を更新する。同じ日に何件記録しても連続記録は 1 日。';

-- コインの付与。同じ記録には 1 回だけ（二重に呼ばれても増えない）。付与した枚数を返す
create function private.grant_coins(
  p_student_id uuid, p_club_id uuid, p_amount integer, p_reason text,
  p_source_type text, p_source_id uuid, p_date date
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_amount <= 0 then
    return 0;
  end if;
  insert into public.coin_transactions (club_id, student_id, amount, reason, source_type, source_id, granted_on)
  values (p_club_id, p_student_id, p_amount, p_reason, p_source_type, p_source_id, p_date)
  on conflict do nothing
  returning id into v_id;
  return case when v_id is null then 0 else p_amount end;
end;
$$;

------------------------------------------------------------------------------
-- 4. タスクの完了（連続記録の共通化とコインの付与）
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
  v_completed_today smallint;
  v_current integer;
  v_longest integer;
  v_coins integer := 0;
  v_reward integer;
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
    select 1
      from public.club_members cm
     where cm.user_id = p_student_id
       and cm.club_id = v_ut.club_id
       and cm.member_role = 'student'
       and cm.status = 'approved'
  ) then
    raise exception 'not_approved_student';
  end if;

  if v_ut.completed_at is not null then
    v_already := true;
  else
    -- 先の日付のタスクは、その日になるまで完了できない
    if v_ut.task_date > v_today then
      raise exception 'task_not_yet_available';
    end if;

    update public.user_tasks
       set completed_at = p_at
     where id = v_ut.id;

    perform private.record_study_activity(p_student_id, v_ut.club_id, v_today);

    select t.reward_coins into v_reward from public.tasks t where t.id = v_ut.task_id;
    v_coins := private.grant_coins(p_student_id, v_ut.club_id, coalesce(v_reward, 0), 'task_complete',
                                   'user_task', v_ut.id, v_today);
  end if;

  select da.completed_count
    into v_completed_today
    from public.daily_activity da
   where da.student_id = p_student_id
     and da.activity_date = private.jst_date(coalesce(v_ut.completed_at, p_at));

  select s.current_days, s.longest_days
    into v_current, v_longest
    from public.streaks s
   where s.student_id = p_student_id;

  return jsonb_build_object(
    'user_task_id', v_ut.id,
    'completed_at', coalesce(v_ut.completed_at, p_at),
    'already_completed', v_already,
    'completed_today', coalesce(v_completed_today, 0),
    'current_days', coalesce(v_current, 0),
    'longest_days', coalesce(v_longest, 0),
    'coins_granted', v_coins
  );
end;
$$;

-- 自由登録：1 日 3 件まで［仮］。完了すると 3 コイン
create or replace function public.register_free_task(
  p_title text,
  p_subject text,
  p_estimated_minutes integer default null,
  p_task_date date default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  c_daily_limit constant integer := 3;
  c_reward constant integer := 3;
  v_uid uuid := (select auth.uid());
  v_club_id uuid := private.my_student_club_id();
  v_today date := private.jst_today();
  v_task_date date := coalesce(p_task_date, private.jst_today());
  v_task_id uuid;
  v_user_task_id uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  if v_club_id is null then
    raise exception 'not_approved_student';
  end if;
  if not (select c.allow_free_tasks from public.clubs c where c.id = v_club_id) then
    raise exception 'free_tasks_disabled';
  end if;
  if v_task_date < v_today then
    raise exception 'invalid_date';
  end if;
  if (
    select count(*) from public.tasks t
     where t.owner_id = v_uid
       and t.kind = 'free'
       and private.jst_date(t.created_at) = v_today
  ) >= c_daily_limit then
    raise exception 'daily_limit_reached';
  end if;

  insert into public.tasks (club_id, kind, owner_id, title, subject, starts_on, estimated_minutes, reward_coins, created_by)
  values (v_club_id, 'free', v_uid, p_title, p_subject, v_task_date, p_estimated_minutes, c_reward, v_uid)
  returning id into v_task_id;

  insert into public.user_tasks (task_id, student_id, task_date)
  values (v_task_id, v_uid, v_task_date)
  returning id into v_user_task_id;

  return jsonb_build_object('task_id', v_task_id, 'user_task_id', v_user_task_id, 'task_date', v_task_date);
end;
$$;

------------------------------------------------------------------------------
-- 5. 教科タグとタイマー
------------------------------------------------------------------------------

-- 5-1. 事後に教科をワンタップで記録する（従来の方法）
create function private.record_study_tag_at(p_student_id uuid, p_subject text, p_at timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_club_id uuid;
  v_date date := private.jst_date(p_at);
  v_id uuid;
  v_coins integer;
  v_current integer;
  v_longest integer;
begin
  select cm.club_id into v_club_id
    from public.club_members cm
   where cm.user_id = p_student_id and cm.member_role = 'student' and cm.status = 'approved';
  if v_club_id is null then
    raise exception 'not_approved_student';
  end if;

  insert into public.study_records (club_id, student_id, kind, subject, started_at, ended_at, record_date)
  values (v_club_id, p_student_id, 'tag', p_subject, p_at, p_at, v_date)
  returning id into v_id;

  perform private.record_study_activity(p_student_id, v_club_id, v_date);
  v_coins := private.grant_coins(p_student_id, v_club_id, 1, 'study_plain', 'study_record', v_id, v_date);

  select s.current_days, s.longest_days into v_current, v_longest from public.streaks s where s.student_id = p_student_id;
  return jsonb_build_object('record_id', v_id, 'coins_granted', v_coins,
                            'current_days', coalesce(v_current, 0), 'longest_days', coalesce(v_longest, 0));
end;
$$;

create function public.record_study_tag(p_subject text)
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
  return private.record_study_tag_at(v_uid, p_subject, now());
end;
$$;

-- 5-2. タイマーを始める（内容の記入は任意。先に書いてから開始する）
create function public.start_study_timer(p_subject text, p_content text default null)
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

  insert into public.study_records (club_id, student_id, kind, subject, content)
  values (v_club_id, v_uid, 'timer', p_subject, v_content)
  returning * into v_row;

  return jsonb_build_object('record_id', v_row.id, 'started_at', v_row.started_at);
end;
$$;

-- 5-3. タイマーを終える。終了し忘れたときは、学習した分数を自分で直せる（経過時間より長くはできない）
create function private.stop_study_timer_at(p_student_id uuid, p_at timestamptz, p_minutes integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rec public.study_records;
  v_elapsed integer;
  v_seconds integer;
  v_ended timestamptz;
  v_date date;
  v_coins integer;
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
  v_date := private.jst_date(v_ended);

  update public.study_records
     set ended_at = v_ended, duration_seconds = v_seconds, record_date = v_date
   where id = v_rec.id;

  perform private.record_study_activity(p_student_id, v_rec.club_id, v_date);

  if v_rec.content is not null then
    -- 内容つきは 1 件 3 コイン、1 日 3 件まで
    if (select count(*) from public.coin_transactions ct
         where ct.student_id = p_student_id and ct.reason = 'study_content' and ct.granted_on = v_date) < 3 then
      v_coins := private.grant_coins(p_student_id, v_rec.club_id, 3, 'study_content', 'study_record', v_rec.id, v_date);
    else
      v_coins := 0;
    end if;
  else
    v_coins := private.grant_coins(p_student_id, v_rec.club_id, 1, 'study_plain', 'study_record', v_rec.id, v_date);
  end if;

  select s.current_days, s.longest_days into v_current, v_longest from public.streaks s where s.student_id = p_student_id;
  return jsonb_build_object('record_id', v_rec.id, 'duration_seconds', v_seconds, 'ended_at', v_ended,
                            'coins_granted', v_coins,
                            'current_days', coalesce(v_current, 0), 'longest_days', coalesce(v_longest, 0));
end;
$$;

create function public.stop_study_timer(p_minutes integer default null)
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
  return private.stop_study_timer_at(v_uid, now(), p_minutes);
end;
$$;

-- 5-4. 間違えて始めたタイマーをやめる（記録は残さない）
create function public.cancel_study_timer()
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
  delete from public.study_records r where r.student_id = v_uid and r.ended_at is null;
end;
$$;

------------------------------------------------------------------------------
-- 6. 閲覧範囲の版 2：教科タグ・タイマーの記録も記録の帯に数える
------------------------------------------------------------------------------

insert into public.consent_scope_versions (version, summary) values
  (2, 'クラブ管理者が閲覧できるのは、完了したタスクと、教科タグ・タイマーの記録を含む記録の帯まで。教科の内訳と、生徒が書いた内容は含まない。NOBIT! 公式LINE から学習に関する連絡（手作業・自動の両方）が届く。');

------------------------------------------------------------------------------
-- 7. 実行権限
------------------------------------------------------------------------------

revoke all on function private.record_study_activity(uuid, uuid, date) from public, anon, authenticated;
revoke all on function private.grant_coins(uuid, uuid, integer, text, text, uuid, date) from public, anon, authenticated;
revoke all on function private.complete_task_at(uuid, uuid, timestamptz) from public, anon, authenticated;
revoke all on function private.record_study_tag_at(uuid, text, timestamptz) from public, anon, authenticated;
revoke all on function private.stop_study_timer_at(uuid, timestamptz, integer) from public, anon, authenticated;
revoke all on function public.record_study_tag(text) from public, anon, authenticated;
revoke all on function public.start_study_timer(text, text) from public, anon, authenticated;
revoke all on function public.stop_study_timer(integer) from public, anon, authenticated;
revoke all on function public.cancel_study_timer() from public, anon, authenticated;
revoke all on function public.register_free_task(text, text, integer, date) from public, anon, authenticated;

grant execute on function public.record_study_tag(text) to authenticated;
grant execute on function public.start_study_timer(text, text) to authenticated;
grant execute on function public.stop_study_timer(integer) to authenticated;
grant execute on function public.cancel_study_timer() to authenticated;
grant execute on function public.register_free_task(text, text, integer, date) to authenticated;
