-- アラートの生成と、連絡済みの記録（運営のみ）。
-- 運営が管理画面を開いたときに refresh_alerts() で生成・解消する。定時実行に切り替えるときも同じ関数を呼ぶ。
-- 連絡は手動（公式LINE のチャット）。送信ボタンは持たず、送ったあとに「連絡済み」を記録する。

create table public.alerts (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  student_id uuid not null references public.users (id) on delete cascade,
  kind text not null check (kind in (
    'not_started', 'gap', 'streak_broken', 'task_overdue', 'streak_milestone', 'badge_earned', 'club_mission'
  )),
  /** 同じ原因は 1 件にまとめる。途切れ・空いた日は 'absence'、出来事は出来事ごとのキー */
  cause text not null,
  detail jsonb not null default '{}'::jsonb,
  occurred_on date not null,
  status text not null default 'open' check (status in ('open', 'contacted', 'resolved', 'dismissed')),
  contacted_by uuid references public.users (id) on delete set null,
  contacted_at timestamptz,
  send_method text not null default 'manual' check (send_method in ('manual', 'auto')),
  send_result text,
  resolved_at timestamptz,
  /** 連絡したあとに学習を再開して解消したか（アラート後の学習再開率の集計に使う） */
  resumed_after_contact boolean,
  created_at timestamptz not null default now(),
  check ((status = 'contacted') = (contacted_at is not null) or status in ('resolved', 'dismissed'))
);
comment on table public.alerts is '対応アラート。書き込みは関数だけ。運営だけが読める。';
create unique index alerts_one_active on public.alerts (student_id, cause) where status in ('open', 'contacted');
create unique index alerts_event_once on public.alerts (student_id, cause)
  where kind in ('streak_milestone', 'badge_earned', 'club_mission');
create index alerts_club_status_idx on public.alerts (club_id, status);

alter table public.alerts enable row level security;
create policy alerts_select on public.alerts for select to authenticated
  using ((select private.is_operator()));
revoke all on public.alerts from anon, authenticated;
grant select on public.alerts to authenticated;

------------------------------------------------------------------------------
-- 生成と解消
------------------------------------------------------------------------------
create function private.generate_alerts(p_now timestamptz)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := private.jst_date(p_now);
  v_hour integer := extract(hour from p_now at time zone 'Asia/Tokyo')::integer;
begin
  create temporary table if not exists cur (
    club_id uuid, student_id uuid, kind text, cause text, detail jsonb, occurred_on date, enabled boolean, state_kind boolean
  ) on commit drop;
  truncate cur;

  -- 学習の空白：連続記録が途切れた／記録が空いた（同じ原因として 1 件）
  insert into cur
  select s.club_id, s.student_id,
         case
           when sb.ok and coalesce(r_sb.enabled, true) then 'streak_broken'
           when gp.ok and coalesce(r_gap.enabled, true) then 'gap'
         end,
         'absence',
         jsonb_build_object('missing_days', m.missing, 'streak_days', st.current_days),
         v_today,
         true, true
    from (select cm.club_id, cm.user_id as student_id, cm.reviewed_at from public.club_members cm
           where cm.member_role = 'student' and cm.status = 'approved') s
    left join public.streaks st on st.student_id = s.student_id
    left join public.alert_rules r_gap on r_gap.club_id = s.club_id and r_gap.kind = 'gap'
    left join public.alert_rules r_sb on r_sb.club_id = s.club_id and r_sb.kind = 'streak_broken'
    cross join lateral (
      select coalesce(st.last_achieved_date, private.jst_date(coalesce(s.reviewed_at, p_now))) as base
    ) b
    cross join lateral (
      select count(*)::int as missing
        from generate_series(b.base + 1, v_today - 1, interval '1 day') as d(day)
       where not exists (select 1 from public.club_events e where e.club_id = s.club_id and e.event_date = d.day::date)
    ) m
    cross join lateral (select m.missing >= coalesce(r_gap.threshold_days, 3) as ok) gp
    cross join lateral (select st.last_achieved_date is not null and st.current_days >= 3 and m.missing >= 1 as ok) sb
   where gp.ok or sb.ok;

  -- 未着手：今日配信されたタスクがあるのに、夕方（［仮］16 時）になっても学習の記録がない
  if v_hour >= 16 then
    insert into cur
    select s.club_id, s.user_id, 'not_started', 'not_started',
           jsonb_build_object('assigned', a.total), v_today, true, true
      from public.club_members s
      cross join lateral (
        select count(*)::int as total, count(ut.completed_at)::int as done
          from public.user_tasks ut
         where ut.student_id = s.user_id and ut.task_date = v_today and not ut.is_free
      ) a
     where s.member_role = 'student' and s.status = 'approved'
       and a.total >= 1 and a.done = 0
       and not exists (select 1 from public.daily_activity da where da.student_id = s.user_id and da.activity_date = v_today);
  end if;

  -- 配信タスクが未完了：［仮］くり返さない配信タスクの期限を過ぎて、まだ完了していない
  insert into cur
  select s.club_id, s.user_id, 'task_overdue', 'task_overdue',
         jsonb_build_object('overdue', o.n), v_today, true, true
    from public.club_members s
    cross join lateral (
      select count(*)::int as n
        from public.tasks t
       where t.club_id = s.club_id and t.kind = 'assigned' and t.recurrence = 'none'
         and t.archived_at is null and t.due_on is not null and t.due_on < v_today
         and not exists (
           select 1 from public.user_tasks ut
            where ut.task_id = t.id and ut.student_id = s.user_id and ut.completed_at is not null
         )
    ) o
   where s.member_role = 'student' and s.status = 'approved' and o.n >= 1;

  -- 連続記録の節目（7・30・100 日目）。前日以降に達した分
  insert into cur
  select st.club_id, st.student_id, 'streak_milestone',
         'milestone:' || st.current_days || ':' || st.last_achieved_date,
         jsonb_build_object('days', st.current_days), st.last_achieved_date, true, false
    from public.streaks st
    join public.club_members cm on cm.user_id = st.student_id and cm.status = 'approved' and cm.member_role = 'student'
   where st.current_days in (7, 30, 100) and st.last_achieved_date >= v_today - 1;

  -- バッジ獲得（前日以降）
  insert into cur
  select ui.club_id, ui.student_id, 'badge_earned', 'badge:' || ui.id,
         jsonb_build_object('item', i.name), private.jst_date(ui.acquired_at), true, false
    from public.user_items ui
    join public.items i on i.id = ui.item_id
   where ui.category = 'badge' and private.jst_date(ui.acquired_at) >= v_today - 1;

  -- 設定でオンの種類だけ、新しく出す（同じ原因が対応中なら重ねない）
  insert into public.alerts (club_id, student_id, kind, cause, detail, occurred_on)
  select c.club_id, c.student_id, c.kind, c.cause, c.detail, c.occurred_on
    from cur c
    left join public.alert_rules r on r.club_id = c.club_id and r.kind = c.kind
   where c.kind is not null and coalesce(r.enabled, true)
  on conflict do nothing;

  -- 状態で出すアラートは、原因がなくなったら解消（連絡のあとなら、再開として記録）
  update public.alerts a
     set status = 'resolved', resolved_at = p_now, resumed_after_contact = (a.status = 'contacted')
   where a.status in ('open', 'contacted')
     and a.kind in ('not_started', 'gap', 'streak_broken', 'task_overdue')
     and not exists (select 1 from cur c where c.student_id = a.student_id and c.cause = a.cause and c.state_kind);

  -- 出来事のアラートは、3 日たったら自動で閉じる
  update public.alerts a
     set status = 'resolved', resolved_at = p_now
   where a.status in ('open', 'contacted')
     and a.kind in ('streak_milestone', 'badge_earned', 'club_mission')
     and a.occurred_on < v_today - 2;
end;
$$;
revoke all on function private.generate_alerts(timestamptz) from public, anon, authenticated;

create function public.refresh_alerts()
returns void
language plpgsql
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
  perform private.generate_alerts(now());
end;
$$;
revoke all on function public.refresh_alerts() from public, anon, authenticated;
grant execute on function public.refresh_alerts() to authenticated;

------------------------------------------------------------------------------
-- 連絡済みの記録・見送り
------------------------------------------------------------------------------
create function public.mark_alert_contacted(p_id uuid)
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
  if not private.is_operator() then
    raise exception 'forbidden';
  end if;
  update public.alerts
     set status = 'contacted', contacted_by = v_uid, contacted_at = now(), send_method = 'manual', send_result = 'manual'
   where id = p_id and status = 'open';
  if not found then
    if not exists (select 1 from public.alerts where id = p_id) then
      raise exception 'not_found';
    end if;
    raise exception 'not_open';
  end if;
end;
$$;

create function public.dismiss_alert(p_id uuid)
returns void
language plpgsql
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
  update public.alerts set status = 'dismissed', resolved_at = now() where id = p_id and status = 'open';
  if not found then
    if not exists (select 1 from public.alerts where id = p_id) then
      raise exception 'not_found';
    end if;
    raise exception 'not_open';
  end if;
end;
$$;
revoke all on function public.mark_alert_contacted(uuid) from public, anon, authenticated;
revoke all on function public.dismiss_alert(uuid) from public, anon, authenticated;
grant execute on function public.mark_alert_contacted(uuid) to authenticated;
grant execute on function public.dismiss_alert(uuid) to authenticated;

------------------------------------------------------------------------------
-- 一覧用：生徒の表示名、送る文面、連絡後 7 日間の完了タスク数
------------------------------------------------------------------------------
create view public.alert_list
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
  ) end as completed_after_contact
from public.alerts a
join public.users u on u.id = a.student_id
left join public.alert_rules r on r.club_id = a.club_id and r.kind = a.kind;
