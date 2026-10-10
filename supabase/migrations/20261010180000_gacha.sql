-- 無料ガチャとコレクション（画面04・05）。追加のマイグレーションで作る（25 テーブル設計の Items / UserItems / GachaDraws）。
-- ［仮］ 確率：ノーマル70%・レア25%・スーパーレア5%。重複はコインに交換（5 / 15 / 50）。
-- 引ける条件：その日に学習記録が 1 件以上ある日だけ。1 日 1 回（JST 0:00 でリセット）。
-- 設定中の称号・背景は user_items.equipped で持つ（仕様書の Users の項目の代わり）。

------------------------------------------------------------------------------
-- 1. コインの台帳：理由と元の種類を足す
------------------------------------------------------------------------------
alter table public.coin_transactions drop constraint coin_transactions_reason_check;
alter table public.coin_transactions add constraint coin_transactions_reason_check
  check (reason in ('task_complete', 'study_plain', 'study_content', 'focus_complete', 'gacha_duplicate'));
alter table public.coin_transactions drop constraint coin_transactions_source_type_check;
alter table public.coin_transactions add constraint coin_transactions_source_type_check
  check (source_type in ('user_task', 'study_record', 'focus_session', 'gacha_draw'));

------------------------------------------------------------------------------
-- 2. items：景品の定義（全クラブ共通）
------------------------------------------------------------------------------
create table public.items (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  category text not null check (category in ('title', 'background', 'decoration', 'badge')),
  rarity text not null check (rarity in ('normal', 'rare', 'super_rare')),
  sort_order integer not null default 0,
  active boolean not null default true
);
comment on table public.items is 'ガチャの景品の定義（称号・背景・装飾・ガチャ限定バッジ）。全クラブ共通。運営だけが変えられる。';

create table public.user_items (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete restrict,
  student_id uuid not null references public.users (id) on delete cascade,
  item_id uuid not null references public.items (id) on delete restrict,
  category text not null,
  acquired_at timestamptz not null default now(),
  acquired_via text not null default 'gacha' check (acquired_via in ('gacha')),
  equipped boolean not null default false,
  unique (student_id, item_id)
);
comment on table public.user_items is '所持している景品。設定中の称号・背景・装飾は equipped。クラブ管理者には見せない。';
-- 設定中にできるのは、カテゴリごとに 1 つ
create unique index user_items_one_equipped
  on public.user_items (student_id, category) where equipped;

create table public.gacha_draws (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete restrict,
  student_id uuid not null references public.users (id) on delete cascade,
  drawn_on date not null,
  drawn_at timestamptz not null default now(),
  item_id uuid not null references public.items (id) on delete restrict,
  rarity text not null,
  duplicate boolean not null,
  coins_granted integer not null default 0,
  -- 1 日 1 回
  unique (student_id, drawn_on)
);
comment on table public.gacha_draws is 'ガチャの履歴。1 人 1 日 1 回。重複したときの交換コインも残す。';

alter table public.items enable row level security;
alter table public.user_items enable row level security;
alter table public.gacha_draws enable row level security;

create policy items_select on public.items for select to authenticated using (true);
create policy user_items_select on public.user_items for select to authenticated
  using (student_id = (select auth.uid()) or (select private.is_operator()));
create policy gacha_draws_select on public.gacha_draws for select to authenticated
  using (student_id = (select auth.uid()) or (select private.is_operator()));

revoke all on public.items, public.user_items, public.gacha_draws from anon, authenticated;
grant select on public.items, public.user_items, public.gacha_draws to authenticated;

------------------------------------------------------------------------------
-- 3. 景品の初期データ（15 個。［仮］名前は仮）
------------------------------------------------------------------------------
insert into public.items (code, name, category, rarity, sort_order) values
  ('title_first_step',   'はじめの一歩',     'title',      'normal',     10),
  ('title_steady',       'コツコツ見習い',   'title',      'normal',     20),
  ('title_note_friend',  'ノートの友',       'title',      'normal',     30),
  ('title_morning_pen',  '朝のペンさばき',   'title',      'rare',       40),
  ('title_idea',         'ひらめき上手',     'title',      'rare',       50),
  ('title_partner',      'ノビットの相棒',   'title',      'super_rare', 60),
  ('bg_mint_morning',    'ミント色の朝',     'background', 'normal',     10),
  ('bg_pale_sky',        'うすい空',         'background', 'normal',     20),
  ('bg_sunset_note',     '夕やけのノート',   'background', 'rare',       30),
  ('bg_violet_dawn',     '夜明けの紫',       'background', 'super_rare', 40),
  ('deco_thin_frame',    '細い線のふち',     'decoration', 'normal',     10),
  ('deco_double_frame',  '二重のふち',       'decoration', 'rare',       20),
  ('badge_first_draw',   'ガチャ初引き',     'badge',      'normal',     10),
  ('badge_collector',    'コレクター見習い', 'badge',      'rare',       20),
  ('badge_beginning',    'はじまりの札',     'badge',      'super_rare', 30);

------------------------------------------------------------------------------
-- 4. 抽選
------------------------------------------------------------------------------
-- p_roll / p_pick は 0 以上 1 未満の乱数。テストで固定できるよう引数にしてある
create function private.draw_gacha_at(p_student_id uuid, p_at timestamptz, p_roll double precision, p_pick double precision)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_club_id uuid;
  v_today date := private.jst_date(p_at);
  v_rarity text;
  v_count integer;
  v_item public.items;
  v_dup boolean;
  v_draw_id uuid := gen_random_uuid();
  v_coins integer := 0;
begin
  select cm.club_id into v_club_id
    from public.club_members cm
   where cm.user_id = p_student_id and cm.member_role = 'student' and cm.status = 'approved'
   limit 1;
  if v_club_id is null then
    raise exception 'not_approved_student';
  end if;

  if exists (select 1 from public.gacha_draws g where g.student_id = p_student_id and g.drawn_on = v_today) then
    raise exception 'already_drawn';
  end if;
  -- その日に学習記録が 1 件以上ある日だけ引ける
  if not exists (
    select 1 from public.daily_activity da
     where da.student_id = p_student_id and da.activity_date = v_today and da.completed_count > 0
  ) then
    raise exception 'no_record_today';
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

  insert into public.gacha_draws (id, club_id, student_id, drawn_on, drawn_at, item_id, rarity, duplicate)
  values (v_draw_id, v_club_id, p_student_id, v_today, p_at, v_item.id, v_item.rarity, v_dup);

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
    'next_draw_at', ((v_today + 1)::timestamp at time zone 'Asia/Tokyo')
  );
end;
$$;

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
  return private.draw_gacha_at(v_uid, now(), random(), random());
end;
$$;

------------------------------------------------------------------------------
-- 5. 称号・背景・装飾に設定する（カテゴリごとに 1 つ。もう一度選ぶと外す）
------------------------------------------------------------------------------
create function public.equip_item(p_item_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_ui public.user_items;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  select * into v_ui from public.user_items ui where ui.student_id = v_uid and ui.item_id = p_item_id for update;
  if not found then
    raise exception 'item_not_owned';
  end if;
  if v_ui.category = 'badge' then
    raise exception 'not_equippable';
  end if;
  if v_ui.equipped then
    update public.user_items set equipped = false where id = v_ui.id;
    return false;
  end if;
  update public.user_items set equipped = false where student_id = v_uid and category = v_ui.category and equipped;
  update public.user_items set equipped = true where id = v_ui.id;
  return true;
end;
$$;

revoke all on function private.draw_gacha_at(uuid, timestamptz, double precision, double precision) from public, anon, authenticated;
revoke all on function public.draw_gacha() from public, anon, authenticated;
revoke all on function public.equip_item(uuid) from public, anon, authenticated;
grant execute on function public.draw_gacha() to authenticated;
grant execute on function public.equip_item(uuid) to authenticated;
