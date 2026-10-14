-- 公式LINE の準備（仕様書 6章「将来の自動送信」）：友だち状態の記録と、生徒の連絡の受け取り設定
--
-- 1) 友だち状態：公式LINE の Webhook（follow / unfollow）を、Edge Function line-webhook が apply_friend_event で記録する。
--    友だち追加はミニアプリのログインより先に起きる（導入の流れ）ため、line_accounts がまだない人の分も line_friends に残し、
--    line_accounts ができた時点で引き継ぐ。順序が入れ替わって届いた古い出来事では、新しい状態を上書きしない。
-- 2) 連絡の受け取り：生徒が自分で止められる（set_contact_allowed）。止めた生徒には、運営のアラートを出さない。

create table public.line_friends (
  line_user_id text primary key,
  status text not null check (status in ('friend', 'blocked')),
  event_at timestamptz not null,
  updated_at timestamptz not null default now()
);
alter table public.line_friends enable row level security;
revoke all on public.line_friends from public, anon, authenticated;
comment on table public.line_friends is '公式LINE の友だち状態（Webhook の記録）。service_role だけが読み書きする。';

create function public.apply_friend_event(p_line_user_id text, p_status text, p_event_at timestamptz)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_status not in ('friend', 'blocked') or p_line_user_id !~ '^U[0-9a-f]{32}$' then
    raise exception 'invalid_event';
  end if;

  insert into public.line_friends as f (line_user_id, status, event_at)
  values (p_line_user_id, p_status, p_event_at)
  on conflict (line_user_id) do update
     set status = excluded.status, event_at = excluded.event_at, updated_at = now()
   where f.event_at <= excluded.event_at;

  -- すでにログインしている人には、いまの状態（上の判定で残った方）を反映する
  update public.line_accounts la
     set friend_status = f.status, friend_status_updated_at = f.event_at
    from public.line_friends f
   where f.line_user_id = la.line_user_id and la.line_user_id = p_line_user_id;
end;
$$;
revoke all on function public.apply_friend_event(text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.apply_friend_event(text, text, timestamptz) to service_role;

-- line_accounts ができるとき、先に届いていた友だち状態を引き継ぐ
create function private.line_account_friend_default()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_f record;
begin
  select status, event_at into v_f from public.line_friends where line_user_id = new.line_user_id;
  if found then
    new.friend_status := v_f.status;
    new.friend_status_updated_at := v_f.event_at;
  end if;
  return new;
end;
$$;
create trigger line_accounts_friend_default
  before insert on public.line_accounts
  for each row execute function private.line_account_friend_default();

-- 生徒が自分の連絡の受け取りを切り替える（本人の行だけ）
create function public.set_contact_allowed(p_allowed boolean)
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
  if p_allowed is null then
    raise exception 'invalid_value';
  end if;
  update public.line_accounts set contact_allowed = p_allowed where user_id = v_uid;
  if not found then
    raise exception 'no_line_account';
  end if;
end;
$$;
revoke all on function public.set_contact_allowed(boolean) from public, anon;
grant execute on function public.set_contact_allowed(boolean) to authenticated;

-- 連絡を止めた生徒には、運営のアラートを出さない（アラートは公式LINE で連絡するためのものなので）。
-- すでに出ているものは、次の生成で「原因なし」として解消される
do $$
declare
  d text := pg_get_functiondef('private.generate_alerts(timestamptz)'::regprocedure);
  anchor text := E'  -- 設定でオンの種類だけ、新しく出す';
  patch text := E'  -- 連絡を止めた生徒には出さない\n  delete from cur c using public.line_accounts la\n   where la.user_id = c.student_id and not la.contact_allowed;\n\n';
begin
  if position(anchor in d) = 0 then
    raise exception 'generate_alerts: anchor not found';
  end if;
  d := replace(d, anchor, patch || anchor);
  execute d;
end;
$$;

-- 一覧用：友だち状態を足す（運営だけが読める。security_invoker のため、クラブ管理者には null）
create or replace view public.alert_list
with (security_invoker = true)
as
select
  a.id, a.club_id, a.student_id, a.kind, a.detail, a.occurred_on, a.status,
  a.contacted_at, a.resolved_at, a.resumed_after_contact, a.created_at,
  u.display_name, u.grade,
  r.template,
  case when a.contacted_at is null then null else (
    select count(*)::int from public.user_tasks ut
     where ut.student_id = a.student_id and ut.completed_at >= a.contacted_at
       and ut.completed_at < a.contacted_at + interval '7 days'
  ) end as completed_after_contact,
  la.line_display_name,
  la.friend_status
from public.alerts a
join public.users u on u.id = a.student_id
left join public.alert_rules r on r.club_id = a.club_id and r.kind = a.kind
left join public.line_accounts la on la.user_id = a.student_id;
