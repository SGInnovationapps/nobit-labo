-- アラート生成から一時テーブルをやめる（CI の lint を通すため。出す中身は変えていない）
--
-- private.generate_alerts は、候補を一時テーブル cur に貯めてから alerts に入れていた。
-- supabase db lint（plpgsql_check）は関数を静的に読むため、実行時に作る一時テーブルを
-- 解決できず「relation "cur" does not exist」を9件のエラーとして報告し、CI が落ちていた。
-- 候補を1つの問い合わせにまとめ、jsonb の変数に持たせることで、同じ結果のまま解消する。
--
-- 変えていないこと：候補の条件、連絡を止めた生徒を除くこと、kind が null の候補も
-- 「原因あり」として残す（解消の判定に使う）こと、出すときの絞り込みと解消の条件。
-- 変えたこと：使っていなかった enabled 列をやめた（絞り込みは alert_rules 側で行っている）。

create or replace function private.generate_alerts(p_now timestamptz)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := private.jst_date(p_now);
  v_hour integer := extract(hour from p_now at time zone 'Asia/Tokyo')::integer;
  v_cur jsonb;
begin
  select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb)
    into v_cur
    from (
      -- 学習の空白：連続記録が途切れた／記録が空いた（同じ原因として 1 件）
      select s.club_id as club_id, s.student_id as student_id,
             case
               when sb.ok and coalesce(r_sb.enabled, true) then 'streak_broken'
               when gp.ok and coalesce(r_gap.enabled, true) then 'gap'
             end as kind,
             'absence' as cause,
             jsonb_build_object('missing_days', m.missing, 'streak_days', st.current_days) as detail,
             v_today as occurred_on,
             true as state_kind
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
           where not exists (select 1 where private.is_rest_day(s.student_id, s.club_id, d.day::date))
        ) m
        cross join lateral (select m.missing >= coalesce(r_gap.threshold_days, 3) as ok) gp
        cross join lateral (select st.last_achieved_date is not null and st.current_days >= 3 and m.missing >= 1 as ok) sb
       where gp.ok or sb.ok

      union all

      -- 未着手：今日配信されたタスクがあるのに、夕方（［仮］16 時）になっても学習の記録がない
      select s.club_id, s.user_id, 'not_started', 'not_started',
             jsonb_build_object('assigned', a.total), v_today, true
        from public.club_members s
        cross join lateral (
          select count(*)::int as total, count(ut.completed_at)::int as done
            from public.user_tasks ut
           where ut.student_id = s.user_id and ut.task_date = v_today and not ut.is_free
        ) a
       where v_hour >= 16
         and s.member_role = 'student' and s.status = 'approved'
         and a.total >= 1 and a.done = 0
         and not exists (select 1 from public.daily_activity da where da.student_id = s.user_id and da.activity_date = v_today)

      union all

      -- 配信タスクが未完了：［仮］くり返さない配信タスクの期限を過ぎて、まだ完了していない
      select s.club_id, s.user_id, 'task_overdue', 'task_overdue',
             jsonb_build_object('overdue', o.n), v_today, true
        from public.club_members s
        cross join lateral (
          select count(*)::int as n
            from public.tasks t
           where t.club_id = s.club_id and t.kind = 'assigned' and t.recurrence = 'none'
             and (t.target_grades is null
                  or (select u.grade from public.users u where u.id = s.user_id) = any (t.target_grades))
             and t.archived_at is null and t.due_on is not null and t.due_on < v_today
             and not exists (
               select 1 from public.user_tasks ut
                where ut.task_id = t.id and ut.student_id = s.user_id and ut.completed_at is not null
             )
        ) o
       where s.member_role = 'student' and s.status = 'approved' and o.n >= 1

      union all

      -- 連続記録の節目（7・30・100 日目）。前日以降に達した分
      select st.club_id, st.student_id, 'streak_milestone',
             'milestone:' || st.current_days || ':' || st.last_achieved_date,
             jsonb_build_object('days', st.current_days), st.last_achieved_date, false
        from public.streaks st
        join public.club_members cm on cm.user_id = st.student_id and cm.status = 'approved' and cm.member_role = 'student'
       where st.current_days in (7, 30, 100) and st.last_achieved_date >= v_today - 1

      union all

      -- バッジ獲得（前日以降）
      select ui.club_id, ui.student_id, 'badge_earned', 'badge:' || ui.id,
             jsonb_build_object('item', i.name), private.jst_date(ui.acquired_at), false
        from public.user_items ui
        join public.items i on i.id = ui.item_id
       where ui.category = 'badge' and private.jst_date(ui.acquired_at) >= v_today - 1

      union all

      select ub.club_id, ub.student_id, 'badge_earned', 'ubadge:' || ub.id,
             jsonb_build_object('item', bd.name), ub.earned_on, false
        from public.user_badges ub
        join public.badge_defs bd on bd.code = ub.badge_code
       where bd.category <> 'streak' and ub.earned_on >= v_today - 1
    ) x
   -- 連絡を止めた生徒には出さない
   where not exists (
     select 1 from public.line_accounts la
      where la.user_id = x.student_id and not la.contact_allowed
   );

  -- 設定でオンの種類だけ、新しく出す（同じ原因が対応中なら重ねない）
  insert into public.alerts (club_id, student_id, kind, cause, detail, occurred_on)
  select c.club_id, c.student_id, c.kind, c.cause, c.detail, c.occurred_on
    from jsonb_to_recordset(v_cur)
      as c(club_id uuid, student_id uuid, kind text, cause text, detail jsonb, occurred_on date, state_kind boolean)
    left join public.alert_rules r on r.club_id = c.club_id and r.kind = c.kind
   where c.kind is not null and coalesce(r.enabled, true)
     and not (
       c.kind in ('not_started', 'gap', 'streak_broken')
       and exists (
         select 1 from public.alerts x
          where x.student_id = c.student_id and x.contacted_at is not null
            and x.contacted_at > p_now - interval '3 days'
       )
     )
  on conflict do nothing;

  -- 状態で出すアラートは、原因がなくなったら解消（連絡のあとなら、再開として記録）
  with cur as materialized (
    select * from jsonb_to_recordset(v_cur) as t(student_id uuid, cause text, state_kind boolean)
  )
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
