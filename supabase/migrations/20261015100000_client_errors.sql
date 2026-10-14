-- 画面のエラーの記録（β版の運用で、生徒からの連絡を待たずに不具合に気づくため）
-- 生徒のミニアプリと管理画面が、起きたエラーを log_client_error で送る。ログイン前（LINE ログインの失敗など）も送れる。
-- 運営だけが recent_client_errors で読む。クラブ管理者と生徒は読めない。
-- 預かるのは、エラーの文面・発生場所（URL のパスだけ。? と # 以降は捨てる）・端末の種類（OS と LINE の版）・アプリの版。
-- 長い英数字（トークンなど）は、画面側とここの両方で伏せる。
-- 保存期間：ログインしている人の分は30日、ログイン前の分は7日。

create table public.client_errors (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  last_at timestamptz not null default now(),
  repeats integer not null default 1 check (repeats >= 1),
  club_id uuid references public.clubs (id) on delete set null,
  user_id uuid references public.users (id) on delete cascade,
  app text not null check (app in ('student', 'admin')),
  kind text not null check (kind in ('error', 'rejection', 'render', 'handled')),
  message text not null check (char_length(message) between 1 and 500),
  stack text check (stack is null or char_length(stack) <= 2000),
  path text check (path is null or char_length(path) <= 200),
  device text check (device is null or char_length(device) <= 80),
  app_version text check (app_version is null or char_length(app_version) <= 40)
);
comment on table public.client_errors is '画面で起きたエラーの記録。運営だけが読む。同じエラーは10分以内なら repeats を増やして1行にまとめる。';

create index client_errors_last_at_idx on public.client_errors (last_at desc);
create index client_errors_user_idx on public.client_errors (user_id, last_at desc);

alter table public.client_errors enable row level security;
create policy client_errors_select on public.client_errors for select to authenticated
  using ((select private.is_operator()));
revoke insert, update, delete, truncate on public.client_errors from anon, authenticated;
revoke select on public.client_errors from anon;

-- 長い英数字（JWT・アクセストークン・招待コードなど）とメールアドレスを伏せる
create function private.redact_client_text(p text, p_max integer)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(
    left(
      btrim(regexp_replace(
        regexp_replace(coalesce(p, ''), '[A-Za-z0-9_-]{24,}(\.[A-Za-z0-9_-]{8,}){0,2}', '[…]', 'g'),
        '[^\s@<>()"'']+@[^\s@<>()"'']+\.[A-Za-z]{2,}', '[mail]', 'g')),
      p_max),
    '')
$$;

create function public.log_client_error(
  p_app text,
  p_kind text,
  p_message text,
  p_stack text default null,
  p_path text default null,
  p_device text default null,
  p_app_version text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_club uuid;
  v_message text := private.redact_client_text(p_message, 500);
  v_path text := left(split_part(split_part(coalesce(p_path, ''), '?', 1), '#', 1), 200);
  v_recent integer;
begin
  if p_app is null or p_app not in ('student', 'admin') then
    raise exception 'invalid_app';
  end if;
  if p_kind is null or p_kind not in ('error', 'rejection', 'render', 'handled') then
    raise exception 'invalid_kind';
  end if;
  if v_message is null then
    return;
  end if;
  v_path := nullif(v_path, '');

  -- users にいる人だけを結びつける（ログイン直後で users がまだない人は、ログイン前と同じ扱い）
  select u.id into v_uid from public.users u where u.id = (select auth.uid());

  -- 送りすぎを止める：1人1時間30件、ログイン前の分は全体で1時間100件、全体で1時間600件
  if v_uid is not null then
    select count(*) into v_recent from public.client_errors e
     where e.user_id = v_uid and e.occurred_at > now() - interval '1 hour';
    if v_recent >= 30 then return; end if;
  else
    select count(*) into v_recent from public.client_errors e
     where e.user_id is null and e.occurred_at > now() - interval '1 hour';
    if v_recent >= 100 then return; end if;
  end if;
  select count(*) into v_recent from public.client_errors e where e.occurred_at > now() - interval '1 hour';
  if v_recent >= 600 then return; end if;

  -- 同じ人の同じエラーは、10分以内なら1行にまとめる
  update public.client_errors e
     set repeats = e.repeats + 1, last_at = now()
   where e.user_id is not distinct from v_uid
     and e.app = p_app
     and e.kind = p_kind
     and e.message = v_message
     and e.path is not distinct from v_path
     and e.last_at > now() - interval '10 minutes';
  if found then
    return;
  end if;

  if v_uid is not null then
    select cm.club_id into v_club
      from public.club_members cm
     where cm.user_id = v_uid and cm.status in ('approved', 'pending')
     order by (cm.status = 'approved') desc, cm.created_at desc
     limit 1;
  end if;

  insert into public.client_errors (club_id, user_id, app, kind, message, stack, path, device, app_version)
  values (
    v_club, v_uid, p_app, p_kind, v_message,
    private.redact_client_text(p_stack, 2000),
    v_path,
    private.redact_client_text(p_device, 80),
    private.redact_client_text(p_app_version, 40)
  );

  -- 古い記録を消す（ログインしている人の分は30日、ログイン前の分は7日）
  delete from public.client_errors e
   where e.last_at < now() - interval '30 days'
      or (e.user_id is null and e.last_at < now() - interval '7 days');
end;
$$;
revoke all on function public.log_client_error(text, text, text, text, text, text, text) from public;
grant execute on function public.log_client_error(text, text, text, text, text, text, text) to anon, authenticated;

-- 運営が読む：直近の記録（新しい順、最大100件）
create function public.recent_client_errors(p_days integer default 7)
returns table (
  id bigint,
  occurred_at timestamptz,
  last_at timestamptz,
  repeats integer,
  app text,
  kind text,
  message text,
  stack text,
  path text,
  device text,
  app_version text,
  display_name text,
  club_name text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'not_authenticated';
  end if;
  if not private.is_operator() then
    raise exception 'forbidden';
  end if;
  return query
    select e.id, e.occurred_at, e.last_at, e.repeats, e.app, e.kind, e.message, e.stack, e.path, e.device, e.app_version,
           u.display_name, c.name
      from public.client_errors e
      left join public.users u on u.id = e.user_id
      left join public.clubs c on c.id = e.club_id
     where e.last_at > now() - make_interval(days => greatest(1, least(coalesce(p_days, 7), 30)))
     order by e.last_at desc
     limit 100;
end;
$$;
revoke all on function public.recent_client_errors(integer) from public, anon;
grant execute on function public.recent_client_errors(integer) to authenticated;
