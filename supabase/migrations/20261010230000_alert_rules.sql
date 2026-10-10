-- 画面13：アラートの設定（運営のみ）。クラブごとに、種類ごとのオンオフ・条件・送り方・文面のひな型を持つ。
-- 当面の送り方は手動（公式LINE のチャット）だけ。自動送信は push に切り替えるときに使えるようにする。

create table public.alert_rules (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  kind text not null check (kind in (
    'not_started', 'gap', 'streak_broken', 'task_overdue', 'streak_milestone', 'badge_earned', 'club_mission'
  )),
  enabled boolean not null default true,
  /** 条件の日数。「記録が空いた」だけが使う（休息日は数えない） */
  threshold_days integer check (threshold_days is null or threshold_days between 1 and 30),
  send_method text not null default 'manual' check (send_method in ('manual', 'auto')),
  template text not null check (char_length(btrim(template)) between 1 and 200),
  updated_by uuid references public.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (club_id, kind),
  check ((kind = 'gap') = (threshold_days is not null))
);
comment on table public.alert_rules is 'アラートの設定。書き込みは save_alert_rule だけ。';
create index alert_rules_club_idx on public.alert_rules (club_id);

alter table public.alert_rules enable row level security;
create policy alert_rules_select on public.alert_rules for select to authenticated
  using ((select private.is_operator()));
revoke all on public.alert_rules from anon, authenticated;
grant select on public.alert_rules to authenticated;

create function private.seed_alert_rules(p_club_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.alert_rules (club_id, kind, threshold_days, template)
  values
    (p_club_id, 'not_started',      null, '今日のクエスト、あと1つだよ！'),
    (p_club_id, 'gap',              3,    '今日も、ひとつ育てよう。短いタスクからで大丈夫。'),
    (p_club_id, 'streak_broken',    null, '今日から、また始めよう。短いタスクからで大丈夫。'),
    (p_club_id, 'task_overdue',     null, '期限が過ぎたタスクがあるよ。まずは1つから。'),
    (p_club_id, 'streak_milestone', null, '7日連続記録達成！おめでとう！'),
    (p_club_id, 'badge_earned',     null, '新しいバッジをゲットしたよ！'),
    (p_club_id, 'club_mission',     null, '新しいクラブミッションが始まったよ！')
  on conflict (club_id, kind) do nothing;
$$;
revoke all on function private.seed_alert_rules(uuid) from public, anon, authenticated;

create function private.seed_alert_rules_on_club()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.seed_alert_rules(new.id);
  return new;
end;
$$;
create trigger clubs_seed_alert_rules after insert on public.clubs
  for each row execute function private.seed_alert_rules_on_club();

-- 既存のクラブにも初期値を入れる
select private.seed_alert_rules(c.id) from public.clubs c;

create function public.save_alert_rule(
  p_club_id uuid, p_kind text, p_enabled boolean, p_threshold_days integer, p_send_method text, p_template text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_template text := btrim(coalesce(p_template, ''));
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  if not private.is_operator() then
    raise exception 'forbidden';
  end if;
  if p_send_method <> 'manual' then
    raise exception 'auto_not_available';
  end if;
  if char_length(v_template) not between 1 and 200 then
    raise exception 'invalid_template';
  end if;
  if p_kind = 'gap' and (p_threshold_days is null or p_threshold_days not between 1 and 30) then
    raise exception 'invalid_threshold';
  end if;
  update public.alert_rules
     set enabled = p_enabled,
         threshold_days = case when kind = 'gap' then p_threshold_days else null end,
         send_method = p_send_method,
         template = v_template,
         updated_by = v_uid,
         updated_at = now()
   where club_id = p_club_id and kind = p_kind;
  if not found then
    raise exception 'not_found';
  end if;
end;
$$;
revoke all on function public.save_alert_rule(uuid, text, boolean, integer, text, text) from public, anon, authenticated;
grant execute on function public.save_alert_rule(uuid, text, boolean, integer, text, text) to authenticated;
