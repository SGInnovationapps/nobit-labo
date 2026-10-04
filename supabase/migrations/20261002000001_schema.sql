-- NOBIT! 基本仕様書 v1.4 7章「データベース設計」の25テーブル
-- すべての生徒データに club_id を持たせ、クラブ単位で分ける。
-- 書き込みは画面から直接行わず、すべて RPC（security definer の関数）を通す。

create type nobit_role    as enum ('student', 'club_admin', 'operator');
create type member_status as enum ('pending', 'approved', 'rejected', 'left');
create type member_role   as enum ('student', 'club_admin');
create type subject_code  as enum ('english', 'math', 'japanese', 'science', 'social');
create type recurrence    as enum ('once', 'daily', 'weekly');
create type rest_kind     as enum ('ticket', 'club_event');
create type alert_kind    as enum ('not_started', 'gap', 'streak_milestone', 'badge', 'club_mission');
create type alert_status  as enum ('open', 'contacted', 'dismissed');
create type delivery_mode as enum ('manual', 'push');
create type friend_status as enum ('unknown', 'friend', 'not_friend', 'blocked');
create type rarity        as enum ('normal', 'rare', 'super_rare');

-- クラブ
create table clubs (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null check (length(name) between 1 and 60),
  invite_code        text not null unique,
  free_entry_enabled boolean not null default true,
  created_at         timestamptz not null default now()
);

-- ユーザー（生徒・クラブ管理者・運営）
-- 生徒は LINE 識別子、管理者はメールで本人を確かめる。auth_user_id は初回ログインで結びつく。
create table users (
  id                   uuid primary key default gen_random_uuid(),
  auth_user_id         uuid unique references auth.users (id) on delete set null,
  role                 nobit_role not null,
  club_id              uuid references clubs (id),            -- 生徒の所属クラブ（運営・クラブ管理者は null）
  line_user_id         text unique,
  email                text unique,
  display_name         text not null check (length(display_name) between 1 and 20),
  grade                text check (grade in ('中1', '中2', '中3', '高1', '高2', '高3')),
  coin_balance         integer not null default 0 check (coin_balance >= 0),
  title_item_id        uuid,
  background_item_id   uuid,
  line_friend_status   friend_status not null default 'unknown',
  line_contact_opt_in  boolean not null default true,       -- 生徒が LINE への連絡を止められる設定
  created_at           timestamptz not null default now(),
  check (role <> 'student' or (line_user_id is not null and club_id is not null)),
  check (role = 'student' or email is not null)
);

-- クラブへの所属（生徒の承認状態、クラブ管理者の担当）
create table club_members (
  id          uuid primary key default gen_random_uuid(),
  club_id     uuid not null references clubs (id) on delete cascade,
  user_id     uuid not null references users (id) on delete cascade,
  member_role member_role not null,
  status      member_status not null default 'pending',
  decided_by  uuid references users (id),
  decided_at  timestamptz,
  created_at  timestamptz not null default now(),
  unique (club_id, user_id)
);

-- 大会・遠征・合宿日（クラブ単位の休息日）［仮］
create table club_events (
  id         uuid primary key default gen_random_uuid(),
  club_id    uuid not null references clubs (id) on delete cascade,
  kind       text not null check (kind in ('大会', '遠征', '合宿')),
  title      text not null default '' check (length(title) <= 40),
  starts_on  date not null,
  ends_on    date not null,
  created_by uuid references users (id),
  created_at timestamptz not null default now(),
  check (ends_on >= starts_on and ends_on - starts_on <= 30)
);

-- 保護者の同意（同意した閲覧範囲の版）
create table parental_consents (
  id              uuid primary key default gen_random_uuid(),
  club_id         uuid not null references clubs (id) on delete cascade,
  user_id         uuid not null references users (id) on delete cascade,
  consent_version text not null,
  agreed_at       timestamptz not null default now(),
  unique (user_id, consent_version)
);

-- ラボプリ教材のひな型［仮］（club_id が null なら全クラブ共通）
create table task_templates (
  id            uuid primary key default gen_random_uuid(),
  club_id       uuid references clubs (id) on delete cascade,
  material_code text not null unique,
  subject       subject_code not null,
  grade         text check (grade in ('中1', '中2', '中3', '高1', '高2', '高3')),
  title         text not null,
  est_minutes   integer not null default 15 check (est_minutes between 1 and 180),
  reward_coins  integer not null default 10 check (reward_coins between 0 and 100),
  qr_url        text,
  created_at    timestamptz not null default now()
);

-- 運営が配信するタスク。複数クラブへの配信は group_id でまとめ、行はクラブごとに持つ。
create table tasks (
  id           uuid primary key default gen_random_uuid(),
  club_id      uuid not null references clubs (id) on delete cascade,
  group_id     uuid not null,
  template_id  uuid references task_templates (id),
  title        text not null check (length(title) between 1 and 40),
  subject      subject_code not null,
  recurrence   recurrence not null,
  due_date     date,                                     -- once のときの期限
  weekdays     smallint[] check (weekdays <@ array[1,2,3,4,5,6,7]::smallint[]), -- weekly のとき（1=月）
  starts_on    date not null,
  ends_on      date,
  est_minutes  integer not null default 15 check (est_minutes between 1 and 180),
  reward_coins integer not null default 10 check (reward_coins between 0 and 100),
  created_by   uuid references users (id),
  archived_at  timestamptz,
  created_at   timestamptz not null default now(),
  check (recurrence <> 'once'   or (due_date is not null and due_date >= starts_on)),
  check (recurrence <> 'weekly' or cardinality(weekdays) > 0),
  check (ends_on is null or ends_on >= starts_on)
);
create index tasks_club_idx on tasks (club_id) where archived_at is null;

-- 生徒ごとのタスク（運営設定タスクの割当と、自由登録）
-- 自由登録の内容（free_title）はクラブ管理者に見せない。
create table user_tasks (
  id                    uuid primary key default gen_random_uuid(),
  club_id               uuid not null references clubs (id) on delete cascade,
  user_id               uuid not null references users (id) on delete cascade,
  task_id               uuid references tasks (id) on delete cascade,
  task_date             date not null,                   -- daily/weekly はその日、once は開始日
  is_free               boolean not null default false,
  free_title            text check (length(free_title) <= 40),
  free_subject          subject_code,
  completed_at          timestamptz,
  completion_request_id uuid unique,
  created_at            timestamptz not null default now(),
  check (is_free = (task_id is null)),
  check (not is_free or (free_title is not null and free_subject is not null and completed_at is not null))
);
create unique index user_tasks_once_per_day on user_tasks (user_id, task_id, task_date) where task_id is not null;
create index user_tasks_user_date on user_tasks (user_id, task_date);
create index user_tasks_completed on user_tasks (user_id, completed_at) where completed_at is not null;

-- 15分集中モード（Phase 2）
create table focus_sessions (
  id              uuid primary key default gen_random_uuid(),
  club_id         uuid not null references clubs (id) on delete cascade,
  user_id         uuid not null references users (id) on delete cascade,
  user_task_id    uuid references user_tasks (id) on delete set null,
  started_at      timestamptz not null default now(),
  ended_at        timestamptz,
  focused_seconds integer not null default 0 check (focused_seconds between 0 and 7200)
);

-- 日別の記録。起動（open_count）と学習（completed_count）を分けて持つ。
create table daily_activity (
  club_id         uuid not null references clubs (id) on delete cascade,
  user_id         uuid not null references users (id) on delete cascade,
  activity_date   date not null,
  open_count      integer not null default 0,
  first_opened_at timestamptz,
  completed_count integer not null default 0,
  study_seconds   integer not null default 0,
  rest_kind       rest_kind,                             -- 日次判定で確定する
  judged_at       timestamptz,
  primary key (user_id, activity_date)
);
create index daily_activity_club_date on daily_activity (club_id, activity_date);

-- 連続記録
create table streaks (
  user_id            uuid primary key references users (id) on delete cascade,
  club_id            uuid not null references clubs (id) on delete cascade,
  current            integer not null default 0,
  best               integer not null default 0,
  last_achieved_date date,
  broken_on          date,                               -- 途切れた日（再開画面 08 で使う）
  updated_at         timestamptz not null default now()
);

-- バッジ（Phase 2）
create table badges (
  id         uuid primary key default gen_random_uuid(),
  club_id    uuid references clubs (id) on delete cascade,
  code       text not null unique,
  name       text not null,
  category   text not null check (category in ('streak', 'subject', 'action', 'event')),
  rarity     rarity not null default 'normal',
  condition  jsonb not null default '{}'
);
create table user_badges (
  id        uuid primary key default gen_random_uuid(),
  club_id   uuid not null references clubs (id) on delete cascade,
  user_id   uuid not null references users (id) on delete cascade,
  badge_id  uuid not null references badges (id),
  earned_at timestamptz not null default now(),
  unique (user_id, badge_id)
);

-- アイテム（背景・装飾・称号。Phase 2）
create table items (
  id      uuid primary key default gen_random_uuid(),
  club_id uuid references clubs (id) on delete cascade,
  kind    text not null check (kind in ('title', 'background', 'decoration')),
  name    text not null,
  rarity  rarity not null default 'normal'
);
create table user_items (
  id          uuid primary key default gen_random_uuid(),
  club_id     uuid not null references clubs (id) on delete cascade,
  user_id     uuid not null references users (id) on delete cascade,
  item_id     uuid not null references items (id),
  source      text not null check (source in ('gacha', 'badge', 'mission')),
  acquired_at timestamptz not null default now(),
  unique (user_id, item_id)
);
alter table users add foreign key (title_item_id) references items (id);
alter table users add foreign key (background_item_id) references items (id);

-- コインの台帳。同じ根拠（source_type, source_id）からは1回しか付与しない。
create table coin_transactions (
  id          uuid primary key default gen_random_uuid(),
  club_id     uuid not null references clubs (id) on delete cascade,
  user_id     uuid not null references users (id) on delete cascade,
  amount      integer not null check (amount <> 0),
  reason      text not null check (reason in ('task', 'free_task', 'quest', 'mission', 'gacha_duplicate', 'adjustment')),
  source_type text not null,
  source_id   uuid not null,
  note        text,
  created_by  uuid references users (id),
  created_at  timestamptz not null default now(),
  unique (source_type, source_id)
);
create index coin_transactions_user on coin_transactions (user_id, created_at desc);

-- クエスト（Phase 2）
create table quests (
  id           uuid primary key default gen_random_uuid(),
  club_id      uuid references clubs (id) on delete cascade,
  code         text not null unique,
  period       text not null check (period in ('daily', 'weekly')),
  title        text not null,
  condition    jsonb not null default '{}',
  reward_coins integer not null default 0,
  active       boolean not null default true
);
create table user_quests (
  id           uuid primary key default gen_random_uuid(),
  club_id      uuid not null references clubs (id) on delete cascade,
  user_id      uuid not null references users (id) on delete cascade,
  quest_id     uuid not null references quests (id),
  period_start date not null,
  progress     integer not null default 0,
  target       integer not null,
  achieved_at  timestamptz,
  unique (user_id, quest_id, period_start)
);

-- クラブミッション（Phase 4）
create table missions (
  id              uuid primary key default gen_random_uuid(),
  club_id         uuid not null references clubs (id) on delete cascade,
  title           text not null,
  starts_on       date not null,
  ends_on         date not null,
  metric          text not null check (metric in ('tasks', 'study_days', 'focus_minutes')),
  club_target     integer,
  personal_target integer,
  reward_coins    integer not null default 0,
  created_by      uuid references users (id),
  created_at      timestamptz not null default now(),
  check (ends_on >= starts_on)
);
create table mission_participants (
  id          uuid primary key default gen_random_uuid(),
  club_id     uuid not null references clubs (id) on delete cascade,
  mission_id  uuid not null references missions (id) on delete cascade,
  user_id     uuid not null references users (id) on delete cascade,
  progress    integer not null default 0,
  achieved_at timestamptz,
  unique (mission_id, user_id)
);

-- クラブ管理者の応援コメント（アプリ内だけに表示）
create table support_comments (
  id         uuid primary key default gen_random_uuid(),
  club_id    uuid not null references clubs (id) on delete cascade,
  user_id    uuid not null references users (id) on delete cascade,  -- 宛先の生徒
  author_id  uuid not null references users (id),
  body       text not null check (length(body) between 1 and 200),
  read_at    timestamptz,
  created_at timestamptz not null default now()
);
create index support_comments_user on support_comments (user_id, created_at desc);

-- アラートの種類ごとの設定（club_id が null なら全クラブの既定）
create table alert_rules (
  id       uuid primary key default gen_random_uuid(),
  club_id  uuid references clubs (id) on delete cascade,
  kind     alert_kind not null,
  enabled  boolean not null default true,
  params   jsonb not null default '{}',
  template text not null,
  delivery delivery_mode not null default 'manual',     -- push に切り替えるまで manual のまま
  unique nulls not distinct (club_id, kind)
);

-- 対応アラート。運営が公式LINE のチャットから送り、連絡済みを記録する。
create table alerts (
  id           uuid primary key default gen_random_uuid(),
  club_id      uuid not null references clubs (id) on delete cascade,
  user_id      uuid not null references users (id) on delete cascade,
  kind         alert_kind not null,
  alert_date   date not null,
  detail       jsonb not null default '{}',
  message      text not null,
  status       alert_status not null default 'open',
  delivery     delivery_mode not null default 'manual',
  contacted_by uuid references users (id),
  contacted_at timestamptz,
  send_result  text,                                     -- 将来の自動送信の結果
  retry_key    uuid not null unique default gen_random_uuid(), -- 将来の自動送信で二重に届かないようにする
  created_at   timestamptz not null default now(),
  unique (user_id, kind, alert_date)
);
create index alerts_open on alerts (club_id, status, alert_date desc);

-- 休息チケット（Phase 2 で生徒が使う）
create table rest_tickets (
  id               uuid primary key default gen_random_uuid(),
  club_id          uuid not null references clubs (id) on delete cascade,
  user_id          uuid not null references users (id) on delete cascade,
  granted_for_week date not null,                        -- その週の月曜
  granted_at       timestamptz not null default now(),
  used_on          date,
  unique (user_id, granted_for_week)
);
create unique index rest_tickets_one_per_day on rest_tickets (user_id, used_on) where used_on is not null;

-- 無料ガチャ（Phase 2）
create table gacha_draws (
  id              uuid primary key default gen_random_uuid(),
  club_id         uuid not null references clubs (id) on delete cascade,
  user_id         uuid not null references users (id) on delete cascade,
  draw_date       date not null,
  item_id         uuid references items (id),
  duplicate       boolean not null default false,
  converted_coins integer not null default 0,
  created_at      timestamptz not null default now(),
  unique (user_id, draw_date)
);
