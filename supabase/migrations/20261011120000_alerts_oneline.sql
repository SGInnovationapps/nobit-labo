-- v1.7 ③：アラートの1行化（生徒ごと）、「コピーして連絡済み」、未着手の初期値オフ、連絡後3日の抑止、LINE の表示名
-- ［仮］画面側で生徒ごとにまとめる。DB は、まとめて連絡済みにする関数と、LINE の表示名の列を足す。

-- LINE の表示名（ログイン処理が更新する。運営だけが読める）
alter table public.line_accounts add column line_display_name text
  check (line_display_name is null or char_length(line_display_name) between 1 and 100);

-- 未着手は初期値オフ（既存のクラブも、いったんオフにそろえる）
create or replace function private.seed_alert_rules(p_club_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.alert_rules (club_id, kind, enabled, threshold_days, template)
  values
    (p_club_id, 'not_started',      false, null, '今日のクエスト、あと1つだよ！'),
    (p_club_id, 'gap',              true,  3,    '今日も、ひとつ育てよう。短いタスクからで大丈夫。'),
    (p_club_id, 'streak_broken',    true,  null, '今日から、また始めよう。短いタスクからで大丈夫。'),
    (p_club_id, 'task_overdue',     true,  null, '期限が過ぎたタスクがあるよ。まずは1つから。'),
    (p_club_id, 'streak_milestone', true,  null, '7日連続記録達成！おめでとう！'),
    (p_club_id, 'badge_earned',     true,  null, '新しいバッジをゲットしたよ！'),
    (p_club_id, 'club_mission',     true,  null, '新しいクラブミッションが始まったよ！')
  on conflict (club_id, kind) do nothing;
$$;
update public.alert_rules set enabled = false where kind = 'not_started';
-- オフにした種類の、対応中のアラートは閉じる
update public.alerts set status = 'dismissed', resolved_at = now() where kind = 'not_started' and status = 'open';

-- 連絡済みから3日は、再開系（未着手・記録が空いた・連続記録が途切れた）を新しく出さない
do $$
declare
  d text;
  k text;
begin
  d := pg_get_functiondef('private.generate_alerts(timestamptz)'::regprocedure);
  k := E'   where c.kind is not null and coalesce(r.enabled, true)\n  on conflict do nothing;';
  if position(k in d) = 0 then
    raise exception 'generate_alerts の差し替え位置が見つかりません';
  end if;
  d := replace(d, k, E'   where c.kind is not null and coalesce(r.enabled, true)\n'
    || E'     and not (\n'
    || E'       c.kind in (''not_started'', ''gap'', ''streak_broken'')\n'
    || E'       and exists (\n'
    || E'         select 1 from public.alerts x\n'
    || E'          where x.student_id = c.student_id and x.contacted_at is not null\n'
    || E'            and x.contacted_at > p_now - interval ''3 days''\n'
    || E'       )\n'
    || E'     )\n'
    || E'  on conflict do nothing;');
  execute d;
end;
$$;

-- 一覧用：LINE の表示名を足す
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
  la.line_display_name
from public.alerts a
join public.users u on u.id = a.student_id
left join public.alert_rules r on r.club_id = a.club_id and r.kind = a.kind
left join public.line_accounts la on la.user_id = a.student_id;

------------------------------------------------------------------------------
-- まとめて連絡済み／取り消し（運営のみ）
------------------------------------------------------------------------------
create function public.mark_alerts_contacted(p_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_n integer;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  if not private.is_operator() then
    raise exception 'forbidden';
  end if;
  update public.alerts
     set status = 'contacted', contacted_by = v_uid, contacted_at = now(), send_method = 'manual', send_result = 'manual'
   where id = any (p_ids) and status = 'open';
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- 押し間違いの取り消し：連絡済みにして30分以内だけ
create function public.undo_alerts_contacted(p_ids uuid[])
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
   where id = any (p_ids) and status = 'contacted' and contacted_at > now() - interval '30 minutes';
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

create function public.dismiss_alerts(p_ids uuid[])
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
  update public.alerts set status = 'dismissed', resolved_at = now() where id = any (p_ids) and status = 'open';
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

revoke all on function public.mark_alerts_contacted(uuid[]) from public, anon, authenticated;
revoke all on function public.undo_alerts_contacted(uuid[]) from public, anon, authenticated;
revoke all on function public.dismiss_alerts(uuid[]) from public, anon, authenticated;
grant execute on function public.mark_alerts_contacted(uuid[]) to authenticated;
grant execute on function public.undo_alerts_contacted(uuid[]) to authenticated;
grant execute on function public.dismiss_alerts(uuid[]) to authenticated;
