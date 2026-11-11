-- 公式LINE からの送信（Messaging API の push）：再開の声かけを、運営が確認して送る
--
-- ・送れるのは「記録が空いた」「連続記録が途切れた」（再開の声かけ）だけ。お祝い・課題の通知は、これまでどおりコピーして手で送る
-- ・送るのは運営だけ。管理画面の「LINEで送る」→ Edge Function line-push → この関数で予約 → LINE に送る → 結果を記録
-- ・本人が連絡を止めている生徒、公式LINE をブロックしている生徒には送らない
-- ・月の上限は LINE 側の残り通数で止める（Edge Function が送る前に確かめる）。無料プランは月200通
-- ・同じアラートを二重に送らない：送信中（pending）のものがあれば予約しない。LINE には予約ごとの再送キー（X-Line-Retry-Key）を渡す

-- アラートの送り方に「line_api」（Messaging API で送った）を足す
alter table public.alerts drop constraint alerts_send_method_check;
alter table public.alerts add constraint alerts_send_method_check check (send_method in ('manual', 'auto', 'line_api'));

------------------------------------------------------------------------------
-- 送信の記録
------------------------------------------------------------------------------
create table public.line_pushes (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  student_id uuid not null references public.users (id) on delete cascade,
  alert_ids uuid[] not null check (cardinality(alert_ids) between 1 and 20),
  text text not null check (char_length(btrim(text)) between 1 and 500),
  retry_key uuid not null default gen_random_uuid() unique,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  error text check (error is null or char_length(error) <= 300),
  request_id text check (request_id is null or char_length(request_id) <= 100),
  created_by uuid not null references public.users (id),
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
create index line_pushes_student_idx on public.line_pushes (student_id, created_at desc);
create index line_pushes_created_idx on public.line_pushes (created_at desc);
alter table public.line_pushes enable row level security;
revoke all on public.line_pushes from public, anon, authenticated;
grant select on public.line_pushes to authenticated;
create policy line_pushes_operator_read on public.line_pushes
  for select to authenticated using ((select private.is_operator()));
comment on table public.line_pushes is '公式LINE から Messaging API で送った記録（運営だけが読める）。書き込みは Edge Function line-push（service_role）だけ。';

-- 再開の声かけとして送れる種類
create function private.line_push_kinds()
returns text[]
language sql
immutable
set search_path = ''
as $$ select array['gap', 'streak_broken'] $$;
revoke all on function private.line_push_kinds() from public, anon, authenticated;

------------------------------------------------------------------------------
-- 送る前の予約（Edge Function から。運営の確認は Edge Function が済ませている）
-- p_items: [{"alert_ids": ["…"], "text": "…"}, …]（最大50件）。結果は同じ順の配列
--   成功：{"ok": true, "push_id", "line_user_id", "text", "retry_key"}
--   失敗：{"ok": false, "reason": "not_open" | "not_push_kind" | "contact_off" | "blocked" | "no_line" | "sending" | "invalid"}
------------------------------------------------------------------------------
create function public.reserve_alert_pushes(p_operator uuid, p_items jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item jsonb;
  v_ids uuid[];
  v_text text;
  v_students uuid[];
  v_club uuid;
  v_la public.line_accounts;
  v_push public.line_pushes;
  v_out jsonb := '[]'::jsonb;
  v_reason text;
begin
  if not exists (select 1 from public.users where id = p_operator and role = 'operator') then
    raise exception 'forbidden';
  end if;
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) not between 1 and 50 then
    raise exception 'invalid_items';
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_reason := null;
    v_text := btrim(coalesce(v_item ->> 'text', ''));
    begin
      select array_agg(x::uuid) into v_ids from jsonb_array_elements_text(v_item -> 'alert_ids') x;
    exception when others then
      v_ids := null;
    end;
    if v_ids is null or cardinality(v_ids) not between 1 and 20 or char_length(v_text) not between 1 and 500 then
      v_reason := 'invalid';
    end if;

    if v_reason is null then
      -- 対象のアラートを押さえる（同時に予約されないように）
      perform 1 from public.alerts a where a.id = any (v_ids) for update;
      select array_agg(distinct a.student_id), min(a.club_id::text)::uuid into v_students, v_club
        from public.alerts a where a.id = any (v_ids);
      if v_students is null
         or cardinality(v_students) <> 1
         or (select count(*) from public.alerts a where a.id = any (v_ids)) <> cardinality(v_ids) then
        v_reason := 'invalid';
      elsif exists (select 1 from public.alerts a where a.id = any (v_ids) and a.status <> 'open') then
        v_reason := 'not_open';
      elsif not exists (select 1 from public.alerts a where a.id = any (v_ids) and a.kind = any (private.line_push_kinds())) then
        v_reason := 'not_push_kind';
      elsif exists (select 1 from public.line_pushes p
                     where p.status = 'pending' and p.alert_ids && v_ids and p.created_at > now() - interval '10 minutes') then
        v_reason := 'sending';
      end if;
    end if;

    if v_reason is null then
      select * into v_la from public.line_accounts la where la.user_id = v_students[1];
      if not found then
        v_reason := 'no_line';
      elsif not v_la.contact_allowed then
        v_reason := 'contact_off';
      elsif v_la.friend_status = 'blocked' then
        v_reason := 'blocked';
      end if;
    end if;

    if v_reason is not null then
      v_out := v_out || jsonb_build_array(jsonb_build_object('ok', false, 'reason', v_reason));
    else
      insert into public.line_pushes (club_id, student_id, alert_ids, text, created_by)
      values (v_club, v_students[1], v_ids, v_text, p_operator)
      returning * into v_push;
      v_out := v_out || jsonb_build_array(jsonb_build_object(
        'ok', true, 'push_id', v_push.id, 'line_user_id', v_la.line_user_id, 'text', v_push.text, 'retry_key', v_push.retry_key));
    end if;
  end loop;
  return v_out;
end;
$$;
revoke all on function public.reserve_alert_pushes(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.reserve_alert_pushes(uuid, jsonb) to service_role;

------------------------------------------------------------------------------
-- 送った結果（Edge Function から）。届いたら、アラートを連絡済みにする（取り消しの30分も、これまでどおり）
------------------------------------------------------------------------------
create function public.finish_alert_push(p_push_id uuid, p_ok boolean, p_request_id text default null, p_error text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_push public.line_pushes;
begin
  update public.line_pushes
     set status = case when p_ok then 'sent' else 'failed' end,
         request_id = left(p_request_id, 100),
         error = case when p_ok then null else left(coalesce(p_error, 'unknown'), 300) end,
         finished_at = now()
   where id = p_push_id and status = 'pending'
  returning * into v_push;
  if not found or not p_ok then
    return;
  end if;
  update public.alerts
     set status = 'contacted', contacted_by = v_push.created_by, contacted_at = now(),
         send_method = 'line_api', send_result = 'sent'
   where id = any (v_push.alert_ids) and status = 'open';
end;
$$;
revoke all on function public.finish_alert_push(uuid, boolean, text, text) from public, anon, authenticated;
grant execute on function public.finish_alert_push(uuid, boolean, text, text) to service_role;

------------------------------------------------------------------------------
-- 一覧用：連絡の送り方と、本人の連絡の受け取りを足す（運営だけが読める。security_invoker のため、クラブ管理者には null）
------------------------------------------------------------------------------
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
  la.friend_status,
  a.send_method,
  la.contact_allowed
from public.alerts a
join public.users u on u.id = a.student_id
left join public.alert_rules r on r.club_id = a.club_id and r.kind = a.kind
left join public.line_accounts la on la.user_id = a.student_id;

-- LINE で送ったものは、取り消しても LINE のメッセージは消えない。取り消しは手で連絡済みにしたものだけ
create or replace function public.undo_alerts_contacted(p_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n integer;
begin
  if (select auth.uid()) is null then
    raise exception 'not_authenticated';
  end if;
  if not private.is_operator() then
    raise exception 'forbidden';
  end if;
  update public.alerts
     set status = 'open', contacted_by = null, contacted_at = null, send_result = null
   where id = any (p_ids) and status = 'contacted' and send_method = 'manual'
     and contacted_at > now() - interval '30 minutes';
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;
