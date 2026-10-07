-- NOBIT! Phase 1 の土台：テーブル・RLS・報酬系の関数
--
-- 対象は仕様書 v1.5 の 7 章のうち、Phase 1（画面 01・02・09・10・11・14 と保護者同意）に必要なものだけ。
-- コイン・バッジ・ガチャ・休息チケット・大会日・アラートなどは、各フェーズのマイグレーションで足す。
--
-- 仕様書の Users と DailyActivity は、閲覧範囲を分けるために次のとおり分割している。
--   Users          -> users（本人情報）＋ line_accounts（LINE 識別子・友だち状態。本人と運営だけが読める）
--   DailyActivity  -> daily_activity（学習記録。クラブ管理者も読める）
--                     ＋ app_opens（アプリ起動記録。本人と運営だけが読める）
-- 全テーブルに club_id を持たせる方針だが、users だけは持たない（運営はクラブに属さないため。所属は club_members）。
--
-- Supabase では public に作ったテーブルの権限が anon / authenticated に自動で付くため、
-- このファイルの末尾で必要な権限だけに絞り直している。次回以降のマイグレーションでも同じ手順を踏むこと。

------------------------------------------------------------------------------
-- 0. 補助スキーマと日付の関数
------------------------------------------------------------------------------

create schema if not exists private;
grant usage on schema private to authenticated;

-- 連続記録の判定は日本時間（JST）が基準。締めは 24:00。
create function private.jst_date(p_at timestamptz)
returns date
language sql
stable
set search_path = ''
as $$
  select (p_at at time zone 'Asia/Tokyo')::date
$$;

create function private.jst_today()
returns date
language sql
stable
set search_path = ''
as $$
  select private.jst_date(now())
$$;

create function private.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

------------------------------------------------------------------------------
-- 1. テーブル
------------------------------------------------------------------------------

-- 1-1. users：ロールと表示名・学年。Supabase の認証ユーザーと 1 対 1
create table public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  role text not null check (role in ('student', 'club_admin', 'operator')),
  display_name text check (display_name is null or char_length(btrim(display_name)) between 1 and 20),
  -- 7 = 中1 ... 12 = 高3
  grade smallint check (grade is null or grade between 7 and 12),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.users is '利用者。ロールは student / club_admin / operator。ロールの変更は service_role だけが行う。';
comment on column public.users.grade is '7 = 中1、8 = 中2、9 = 中3、10 = 高1、11 = 高2、12 = 高3';

-- 1-2. line_accounts：LINE の識別子と公式LINE の友だち状態（将来の push 切り替え用に記録しておく）
create table public.line_accounts (
  user_id uuid primary key references public.users (id) on delete cascade,
  line_user_id text not null unique,
  friend_status text not null default 'unknown' check (friend_status in ('unknown', 'friend', 'blocked')),
  contact_allowed boolean not null default true,
  friend_status_updated_at timestamptz,
  created_at timestamptz not null default now()
);
comment on table public.line_accounts is 'LINE の識別子と友だち状態。読めるのは本人と運営だけ。書き込みは service_role（ログイン処理・Webhook）だけ。';

-- 1-3. clubs
create table public.clubs (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  invite_code text not null unique
    default substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)
    check (invite_code ~ '^[a-z0-9]{8,32}$'),
  allow_free_tasks boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on column public.clubs.allow_free_tasks is '生徒の自由登録のオンオフ';

-- 1-4. club_members：クラブへの所属と承認状態、クラブ管理者の担当関係
create table public.club_members (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete restrict,
  user_id uuid not null references public.users (id) on delete cascade,
  member_role text not null check (member_role in ('student', 'club_admin')),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'left')),
  reviewed_by uuid references public.users (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint club_members_admin_never_pending check (member_role = 'student' or status in ('approved', 'left'))
);
-- 1 人が同時に属せるクラブは 1 つ。却下・退会の履歴は残る
create unique index club_members_one_live_membership
  on public.club_members (user_id) where status in ('pending', 'approved');
create index club_members_club_status_idx on public.club_members (club_id, status);

-- 1-5. consent_scope_versions / parental_consents：保護者同意と、同意した閲覧範囲の版
create table public.consent_scope_versions (
  version integer primary key check (version > 0),
  summary text not null,
  effective_from timestamptz not null default now()
);
comment on table public.consent_scope_versions is
  'クラブ管理者の閲覧範囲の版。範囲を変えたら新しい版を足し、保護者の同意を取り直す。画面の文面は別に持つ。';

insert into public.consent_scope_versions (version, summary) values
  (1, 'クラブ管理者が閲覧できるのは完了したタスクと記録の帯まで。自由登録の内容は含まない。NOBIT! 公式LINE から学習に関する連絡（手作業・自動の両方）が届く。');

create table public.parental_consents (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete restrict,
  student_id uuid not null references public.users (id) on delete cascade,
  scope_version integer not null references public.consent_scope_versions (version),
  consented_at timestamptz not null default now(),
  unique (student_id, club_id, scope_version)
);
create index parental_consents_club_idx on public.parental_consents (club_id);

-- 1-6. tasks：運営が配信するタスクと、生徒の自由登録
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete restrict,
  kind text not null default 'assigned' check (kind in ('assigned', 'free')),
  owner_id uuid references public.users (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 60),
  subject text not null check (subject in ('英語', '数学', '国語', '理科', '社会')),
  starts_on date not null default private.jst_today(),
  due_on date,
  recurrence text not null default 'none' check (recurrence in ('none', 'daily', 'weekdays', 'weekly')),
  estimated_minutes integer check (estimated_minutes is null or estimated_minutes between 1 and 600),
  reward_coins integer not null default 0 check (reward_coins >= 0),
  created_by uuid references public.users (id) on delete set null,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tasks_free_has_owner check ((kind = 'free') = (owner_id is not null)),
  constraint tasks_due_after_start check (due_on is null or due_on >= starts_on)
);
comment on column public.tasks.kind is 'assigned = 運営が配信、free = 生徒の自由登録（owner_id の本人だけが読める）';
comment on column public.tasks.reward_coins is 'コインは Phase 2 から付与する。それまでは 0 のまま。';
create index tasks_club_kind_idx on public.tasks (club_id, kind);

-- 1-7. user_tasks：生徒ごとの割当と完了。繰り返しのタスクは日ごとに 1 行
create table public.user_tasks (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete cascade,
  student_id uuid not null references public.users (id) on delete cascade,
  club_id uuid not null references public.clubs (id) on delete restrict,
  is_free boolean not null,
  task_date date not null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (task_id, student_id, task_date)
);
comment on column public.user_tasks.club_id is 'トリガーが tasks から写す。';
comment on column public.user_tasks.is_free is 'トリガーが tasks.kind から写す。クラブ管理者に自由登録の中身を見せないために使う。';
comment on column public.user_tasks.completed_at is '完了時刻。complete_task() だけが書く。';
create index user_tasks_student_date_idx on public.user_tasks (student_id, task_date);
create index user_tasks_club_date_idx on public.user_tasks (club_id, task_date);

-- 1-8. app_opens：アプリ起動記録。学習記録（daily_activity）とは分け、開いただけでは学習と判定しない
create table public.app_opens (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete restrict,
  student_id uuid not null references public.users (id) on delete cascade,
  opened_on date not null,
  first_opened_at timestamptz not null default now(),
  unique (student_id, opened_on)
);

-- 1-9. daily_activity：日別の学習記録（記録の帯の元）
create table public.daily_activity (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete restrict,
  student_id uuid not null references public.users (id) on delete cascade,
  activity_date date not null,
  completed_count smallint not null default 0 check (completed_count >= 0),
  unique (student_id, activity_date)
);
comment on column public.daily_activity.activity_date is '日本時間（JST）の日付';
create index daily_activity_club_date_idx on public.daily_activity (club_id, activity_date);

-- 1-10. streaks：連続記録。途切れても最長記録は消さない
create table public.streaks (
  student_id uuid primary key references public.users (id) on delete cascade,
  club_id uuid not null references public.clubs (id) on delete restrict,
  current_days integer not null default 0 check (current_days >= 0),
  longest_days integer not null default 0 check (longest_days >= 0),
  last_achieved_date date
);
comment on column public.streaks.current_days is
  '最後に達成した日の時点の連続日数。今日表示する値は streak_status ビューを使う（途切れていれば 0）。';

-- 1-11. support_comments：クラブ管理者のアプリ内の応援コメント
create table public.support_comments (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete restrict,
  student_id uuid not null references public.users (id) on delete cascade,
  author_id uuid not null references public.users (id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 300),
  created_at timestamptz not null default now()
);
create index support_comments_student_idx on public.support_comments (student_id, created_at desc);
create index support_comments_club_idx on public.support_comments (club_id);

-- updated_at
create trigger users_touch before update on public.users
  for each row execute function private.touch_updated_at();
create trigger clubs_touch before update on public.clubs
  for each row execute function private.touch_updated_at();
create trigger tasks_touch before update on public.tasks
  for each row execute function private.touch_updated_at();

-- 表示用：今日の時点で連続記録が生きているか（最後の達成が昨日以降なら生きている）
create view public.streak_status
with (security_invoker = true)
as
select
  s.student_id,
  s.club_id,
  case when s.last_achieved_date >= private.jst_today() - 1 then s.current_days else 0 end as current_days,
  s.longest_days,
  s.last_achieved_date
from public.streaks s;

------------------------------------------------------------------------------
-- 2. RLS の補助関数（呼び出した本人の権限を調べる）
------------------------------------------------------------------------------

create function private.my_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select u.role from public.users u where u.id = (select auth.uid())
$$;

create function private.is_operator()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(private.my_role() = 'operator', false)
$$;

-- 自分が担当している（承認済みの）クラブ
create function private.admin_club_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select cm.club_id
  from public.club_members cm
  join public.users u on u.id = cm.user_id
  where cm.user_id = (select auth.uid())
    and cm.member_role = 'club_admin'
    and cm.status = 'approved'
    and u.role = 'club_admin'
$$;

create function private.is_club_admin(p_club_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from private.admin_club_ids() as c(id) where c.id = p_club_id)
$$;

-- 自分が承認済みの生徒として属しているクラブ
create function private.my_student_club_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select cm.club_id
  from public.club_members cm
  join public.users u on u.id = cm.user_id
  where cm.user_id = (select auth.uid())
    and cm.member_role = 'student'
    and cm.status = 'approved'
    and u.role = 'student'
  limit 1
$$;

-- 申請中を含め、自分が属しているクラブ（クラブ名の表示用）
create function private.my_membership_club_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select cm.club_id
  from public.club_members cm
  where cm.user_id = (select auth.uid())
    and cm.status in ('pending', 'approved')
$$;

------------------------------------------------------------------------------
-- 3. user_tasks のトリガー：club_id と is_free を tasks から写し、割当先を確かめる
------------------------------------------------------------------------------

create function private.user_tasks_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_task record;
begin
  select t.club_id, t.kind, t.owner_id
    into v_task
    from public.tasks t
   where t.id = new.task_id;
  if not found then
    raise exception 'task_not_found';
  end if;

  if v_task.kind = 'free' and v_task.owner_id is distinct from new.student_id then
    raise exception 'free_task_owner_mismatch';
  end if;

  if not exists (
    select 1
      from public.club_members cm
     where cm.user_id = new.student_id
       and cm.club_id = v_task.club_id
       and cm.member_role = 'student'
       and cm.status = 'approved'
  ) then
    raise exception 'not_approved_student';
  end if;

  new.club_id := v_task.club_id;
  new.is_free := (v_task.kind = 'free');
  return new;
end;
$$;

create trigger user_tasks_fill before insert on public.user_tasks
  for each row execute function private.user_tasks_before_insert();

------------------------------------------------------------------------------
-- 4. RLS
------------------------------------------------------------------------------

alter table public.users enable row level security;
alter table public.line_accounts enable row level security;
alter table public.clubs enable row level security;
alter table public.club_members enable row level security;
alter table public.consent_scope_versions enable row level security;
alter table public.parental_consents enable row level security;
alter table public.tasks enable row level security;
alter table public.user_tasks enable row level security;
alter table public.app_opens enable row level security;
alter table public.daily_activity enable row level security;
alter table public.streaks enable row level security;
alter table public.support_comments enable row level security;

-- users：本人、運営、自クラブのクラブ管理者
create policy users_select on public.users for select to authenticated
  using (
    id = (select auth.uid())
    or (select private.is_operator())
    or exists (
      select 1 from public.club_members cm
      where cm.user_id = users.id
        and cm.club_id in (select private.admin_club_ids())
    )
  );
-- 更新できる列は表示名と学年だけ（列の権限で絞る）
create policy users_update on public.users for update to authenticated
  using (id = (select auth.uid()) or (select private.is_operator()))
  with check (id = (select auth.uid()) or (select private.is_operator()));

-- line_accounts：本人と運営だけ。クラブ管理者には見せない
create policy line_accounts_select on public.line_accounts for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_operator()));

-- clubs：運営は全部、ほかは自分が属するクラブだけ
create policy clubs_select on public.clubs for select to authenticated
  using (
    (select private.is_operator())
    or id in (select private.my_membership_club_ids())
    or id in (select private.admin_club_ids())
  );
create policy clubs_write on public.clubs for all to authenticated
  using ((select private.is_operator()))
  with check ((select private.is_operator()));

-- club_members：書き込みは運営と、承認の関数（review_membership）だけ
create policy club_members_select on public.club_members for select to authenticated
  using (
    user_id = (select auth.uid())
    or (select private.is_operator())
    or club_id in (select private.admin_club_ids())
  );
create policy club_members_write on public.club_members for all to authenticated
  using ((select private.is_operator()))
  with check ((select private.is_operator()));

-- consent_scope_versions
create policy consent_scope_versions_select on public.consent_scope_versions for select to authenticated
  using (true);
create policy consent_scope_versions_write on public.consent_scope_versions for all to authenticated
  using ((select private.is_operator()))
  with check ((select private.is_operator()));

-- parental_consents：本人が自分の所属クラブについて同意を記録する。記録は更新も削除もできない
create policy parental_consents_select on public.parental_consents for select to authenticated
  using (
    student_id = (select auth.uid())
    or (select private.is_operator())
    or club_id in (select private.admin_club_ids())
  );
create policy parental_consents_insert on public.parental_consents for insert to authenticated
  with check (
    student_id = (select auth.uid())
    and (select private.my_role()) = 'student'
    and club_id in (select private.my_membership_club_ids())
    and exists (select 1 from public.consent_scope_versions v where v.version = parental_consents.scope_version)
  );

-- tasks：自由登録は本人と運営だけ。配信されたタスクは自クラブの生徒とクラブ管理者も読める
create policy tasks_select on public.tasks for select to authenticated
  using (
    (select private.is_operator())
    or (kind = 'free' and owner_id = (select auth.uid()))
    or (kind = 'assigned' and club_id in (select private.admin_club_ids()))
    or (kind = 'assigned' and club_id = (select private.my_student_club_id()))
  );
create policy tasks_write on public.tasks for all to authenticated
  using ((select private.is_operator()))
  with check ((select private.is_operator()));

-- user_tasks：クラブ管理者は配信されたタスクの分だけ（自由登録の行は見えない）
create policy user_tasks_select on public.user_tasks for select to authenticated
  using (
    student_id = (select auth.uid())
    or (select private.is_operator())
    or (not is_free and club_id in (select private.admin_club_ids()))
  );
create policy user_tasks_write on public.user_tasks for all to authenticated
  using ((select private.is_operator()))
  with check ((select private.is_operator()));

-- app_opens：本人と運営だけ。書き込みは record_app_open() だけ
create policy app_opens_select on public.app_opens for select to authenticated
  using (student_id = (select auth.uid()) or (select private.is_operator()));

-- daily_activity / streaks：記録の帯と連続記録。クラブ管理者は自クラブの分を読める。書き込みは complete_task() だけ
create policy daily_activity_select on public.daily_activity for select to authenticated
  using (
    student_id = (select auth.uid())
    or (select private.is_operator())
    or club_id in (select private.admin_club_ids())
  );
create policy streaks_select on public.streaks for select to authenticated
  using (
    student_id = (select auth.uid())
    or (select private.is_operator())
    or club_id in (select private.admin_club_ids())
  );

-- support_comments：クラブ管理者が自クラブの承認済みの生徒に書く。生徒は自分宛てだけ読める
create policy support_comments_select on public.support_comments for select to authenticated
  using (
    student_id = (select auth.uid())
    or (select private.is_operator())
    or club_id in (select private.admin_club_ids())
  );
create policy support_comments_insert on public.support_comments for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and (select private.is_club_admin(club_id))
    and exists (
      select 1 from public.club_members cm
      where cm.user_id = support_comments.student_id
        and cm.club_id = support_comments.club_id
        and cm.member_role = 'student'
        and cm.status = 'approved'
    )
  );
create policy support_comments_delete on public.support_comments for delete to authenticated
  using (author_id = (select auth.uid()) or (select private.is_operator()));

------------------------------------------------------------------------------
-- 5. 権限：必要なものだけに絞る（RLS の前の段階の防御）
------------------------------------------------------------------------------

revoke all on
  public.users, public.line_accounts, public.clubs, public.club_members,
  public.consent_scope_versions, public.parental_consents, public.tasks,
  public.user_tasks, public.app_opens, public.daily_activity, public.streaks,
  public.support_comments, public.streak_status
from anon, authenticated;

grant select on
  public.users, public.line_accounts, public.clubs, public.club_members,
  public.consent_scope_versions, public.parental_consents, public.tasks,
  public.user_tasks, public.app_opens, public.daily_activity, public.streaks,
  public.support_comments, public.streak_status
to authenticated;

-- users は表示名と学年だけ更新できる（ロールの変更は service_role）
grant update (display_name, grade) on public.users to authenticated;
-- 次の 5 つは RLS で運営だけに絞っている
grant insert, update, delete on
  public.clubs, public.club_members, public.consent_scope_versions, public.tasks, public.user_tasks
to authenticated;
grant insert on public.parental_consents to authenticated;
grant insert, delete on public.support_comments to authenticated;

-- RLS の補助関数と日付の関数は authenticated から呼べる必要がある
grant execute on function
  private.jst_date(timestamptz), private.jst_today(), private.my_role(), private.is_operator(),
  private.admin_club_ids(), private.is_club_admin(uuid), private.my_student_club_id(),
  private.my_membership_club_ids()
to authenticated;

------------------------------------------------------------------------------
-- 6. 関数（アプリから呼ぶ操作）
--    書き込みを RLS ではなく関数に集め、完了・連続記録・承認を 1 か所で正しく処理する
------------------------------------------------------------------------------

-- 6-1. タスクの完了：二重に完了しても記録は 1 回だけ。完了した日（JST）の学習記録と連続記録を更新する
create function private.complete_task_at(p_user_task_id uuid, p_student_id uuid, p_at timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ut record;
  v_today date := private.jst_date(p_at);
  v_already boolean := false;
  v_streak record;
  v_new_current integer;
  v_new_longest integer;
  v_completed_today smallint;
  v_current integer;
  v_longest integer;
begin
  select ut.id, ut.club_id, ut.task_date, ut.completed_at
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

    insert into public.daily_activity as da (club_id, student_id, activity_date, completed_count)
    values (v_ut.club_id, p_student_id, v_today, 1)
    on conflict (student_id, activity_date)
    do update set completed_count = da.completed_count + 1;

    insert into public.streaks (student_id, club_id, current_days, longest_days, last_achieved_date)
    values (p_student_id, v_ut.club_id, 0, 0, null)
    on conflict (student_id) do nothing;

    select s.current_days, s.longest_days, s.last_achieved_date
      into v_streak
      from public.streaks s
     where s.student_id = p_student_id
     for update;

    if v_streak.last_achieved_date is not null and v_streak.last_achieved_date >= v_today then
      v_new_current := v_streak.current_days;          -- 今日はすでに達成済み
    elsif v_streak.last_achieved_date = v_today - 1 then
      v_new_current := v_streak.current_days + 1;      -- 昨日から続いている
    else
      v_new_current := 1;                              -- 途切れたので 1 から
    end if;
    v_new_longest := greatest(v_streak.longest_days, v_new_current);

    update public.streaks
       set current_days = v_new_current,
           longest_days = v_new_longest,
           last_achieved_date = greatest(coalesce(v_streak.last_achieved_date, v_today), v_today)
     where student_id = p_student_id;
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
    'longest_days', coalesce(v_longest, 0)
  );
end;
$$;
comment on function private.complete_task_at(uuid, uuid, timestamptz) is
  '完了の本体。時刻を引数に取るのはテストのため。クライアントからは呼べない（public.complete_task だけが now() で呼ぶ）。';

create function public.complete_task(p_user_task_id uuid)
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
  return private.complete_task_at(p_user_task_id, v_uid, now());
end;
$$;

-- 6-2. アプリ起動の記録（学習とは判定しない）
create function public.record_app_open()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_club uuid := private.my_student_club_id();
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  if v_club is null then
    return;
  end if;
  insert into public.app_opens (club_id, student_id, opened_on)
  values (v_club, v_uid, private.jst_today())
  on conflict (student_id, opened_on) do nothing;
end;
$$;

-- 6-3. 招待コードでクラブに申し込む（所属は申請中になり、クラブ管理者が承認して確定する）
create function public.join_club(p_invite_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_club record;
  v_member_id uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  if private.my_role() is distinct from 'student' then
    raise exception 'students_only';
  end if;

  select c.id, c.name
    into v_club
    from public.clubs c
   where c.invite_code = lower(btrim(p_invite_code));
  if not found then
    raise exception 'invalid_invite_code';
  end if;

  if exists (
    select 1 from public.club_members cm
     where cm.user_id = v_uid and cm.status in ('pending', 'approved')
  ) then
    raise exception 'already_member';
  end if;

  insert into public.club_members (club_id, user_id, member_role, status)
  values (v_club.id, v_uid, 'student', 'pending')
  returning id into v_member_id;

  return jsonb_build_object(
    'membership_id', v_member_id,
    'club_id', v_club.id,
    'club_name', v_club.name,
    'status', 'pending'
  );
end;
$$;

-- 6-4. 所属の承認・却下（クラブ管理者は自クラブ、運営は全クラブ）
--      承認には、表示名と学年の入力と、最新の閲覧範囲の版への保護者同意が必要
create function public.review_membership(p_membership_id uuid, p_approve boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_member record;
  v_new_status text := case when p_approve then 'approved' else 'rejected' end;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  select cm.id, cm.club_id, cm.user_id, cm.member_role, cm.status
    into v_member
    from public.club_members cm
   where cm.id = p_membership_id
   for update;
  if not found then
    raise exception 'membership_not_found';
  end if;

  if not (private.is_club_admin(v_member.club_id) or private.is_operator()) then
    raise exception 'forbidden';
  end if;
  if v_member.member_role <> 'student' or v_member.status <> 'pending' then
    raise exception 'not_pending';
  end if;

  if p_approve then
    if not exists (
      select 1 from public.users u
       where u.id = v_member.user_id
         and u.display_name is not null
         and u.grade is not null
    ) then
      raise exception 'profile_incomplete';
    end if;

    if not exists (
      select 1 from public.parental_consents pc
       where pc.student_id = v_member.user_id
         and pc.club_id = v_member.club_id
         and pc.scope_version = (select max(v.version) from public.consent_scope_versions v)
    ) then
      raise exception 'consent_required';
    end if;
  end if;

  update public.club_members
     set status = v_new_status,
         reviewed_by = v_uid,
         reviewed_at = now()
   where id = v_member.id;

  return jsonb_build_object('membership_id', v_member.id, 'status', v_new_status);
end;
$$;

-- 6-5. 生徒の自由登録：クラブの設定がオンのときだけ、1 日 3 件まで［仮］
create function public.register_free_task(
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
  c_daily_limit constant integer := 3;  -- ［仮］仕様書 10 章。確定したらここを更新する
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

  insert into public.tasks (club_id, kind, owner_id, title, subject, starts_on, estimated_minutes, created_by)
  values (v_club_id, 'free', v_uid, p_title, p_subject, v_task_date, p_estimated_minutes, v_uid)
  returning id into v_task_id;

  insert into public.user_tasks (task_id, student_id, task_date)
  values (v_task_id, v_uid, v_task_date)
  returning id into v_user_task_id;

  return jsonb_build_object('task_id', v_task_id, 'user_task_id', v_user_task_id, 'task_date', v_task_date);
end;
$$;

-- 関数の実行権限：ログイン済みのユーザーだけ。完了の本体（private）はクライアントから呼べない
revoke all on function private.complete_task_at(uuid, uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.complete_task(uuid) from public, anon, authenticated;
revoke all on function public.record_app_open() from public, anon, authenticated;
revoke all on function public.join_club(text) from public, anon, authenticated;
revoke all on function public.review_membership(uuid, boolean) from public, anon, authenticated;
revoke all on function public.register_free_task(text, text, integer, date) from public, anon, authenticated;

grant execute on function public.complete_task(uuid) to authenticated;
grant execute on function public.record_app_open() to authenticated;
grant execute on function public.join_club(text) to authenticated;
grant execute on function public.review_membership(uuid, boolean) to authenticated;
grant execute on function public.register_free_task(text, text, integer, date) to authenticated;
