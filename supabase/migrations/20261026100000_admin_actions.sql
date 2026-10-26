-- 運営のコイン調整と、操作履歴（仕様書 5章・7章「操作履歴を残す」）
--
-- 生徒のコインが合わなくなったとき、運営が増減して直せるようにする。
-- 理由を必ず書かせ、だれが・いつ・いくら・なぜを操作履歴に残す。
-- 履歴は運営だけが読め、あとから書き換えられない（更新・削除のポリシーを置かない）。

alter table public.coin_transactions drop constraint coin_transactions_reason_check;
alter table public.coin_transactions add constraint coin_transactions_reason_check check (
  reason in ('task_complete', 'study_plain', 'study_content', 'focus_complete', 'gacha_duplicate',
             'mission_personal', 'mission_club', 'study_day', 'gacha_extra',
             'daily_quest', 'quest_bonus', 'admin_adjust')
);
alter table public.coin_transactions drop constraint coin_transactions_source_type_check;
alter table public.coin_transactions add constraint coin_transactions_source_type_check check (
  source_type in ('user_task', 'study_record', 'focus_session', 'gacha_draw',
                  'mission_personal', 'mission_club', 'study_day', 'gacha_cost',
                  'daily_quest', 'admin_adjust')
);

create table public.admin_actions (
  id bigint generated always as identity primary key,
  -- 行った人。アカウントを消しても履歴は残す
  actor_id uuid references public.users (id) on delete set null,
  actor_name text,
  club_id uuid references public.clubs (id) on delete set null,
  target_student_id uuid references public.users (id) on delete set null,
  action text not null check (action in ('coin_adjust')),
  /** 行った内容（コイン調整なら {"amount": -5}） */
  detail jsonb not null default '{}'::jsonb,
  note text not null check (char_length(btrim(note)) between 1 and 200),
  created_at timestamptz not null default now()
);
comment on table public.admin_actions is '運営の操作履歴。読めるのは運営だけ。あとから書き換えない';

create index admin_actions_student_idx on public.admin_actions (target_student_id, created_at desc);
create index admin_actions_created_idx on public.admin_actions (created_at desc);

alter table public.admin_actions enable row level security;
revoke all on public.admin_actions from anon;
-- 書き込みは関数（security definer）だけ。画面からは読むことしかできない
revoke insert, update, delete, truncate on public.admin_actions from authenticated;
-- 読むのは運営だけ
create policy admin_actions_select on public.admin_actions for select to authenticated
  using ((select private.is_operator()));

-- ===== コインの調整 =====
create function public.adjust_student_coins(p_student_id uuid, p_amount integer, p_note text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_note text := btrim(coalesce(p_note, ''));
  v_club uuid;
  v_balance integer;
  v_actor text;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  if not private.is_operator() then
    raise exception 'forbidden';
  end if;
  if p_amount is null or p_amount = 0 then
    raise exception 'invalid_amount';
  end if;
  if abs(p_amount) > 1000 then
    raise exception 'amount_too_large';
  end if;
  if char_length(v_note) < 1 or char_length(v_note) > 200 then
    raise exception 'note_required';
  end if;

  select cm.club_id into v_club
    from public.club_members cm
   where cm.user_id = p_student_id and cm.member_role = 'student'
     and cm.status in ('approved', 'pending')
   limit 1;
  if v_club is null then
    raise exception 'student_not_found';
  end if;

  select coalesce(sum(t.amount), 0) into v_balance
    from public.coin_transactions t where t.student_id = p_student_id;
  if v_balance + p_amount < 0 then
    raise exception 'balance_would_be_negative';
  end if;

  insert into public.coin_transactions (club_id, student_id, amount, reason, source_type, source_id, granted_on)
  values (v_club, p_student_id, p_amount, 'admin_adjust', 'admin_adjust', gen_random_uuid(), private.jst_today());

  select u.display_name into v_actor from public.users u where u.id = v_uid;
  insert into public.admin_actions (actor_id, actor_name, club_id, target_student_id, action, detail, note)
  values (v_uid, v_actor, v_club, p_student_id, 'coin_adjust', jsonb_build_object('amount', p_amount), v_note);

  return jsonb_build_object('amount', p_amount, 'balance', v_balance + p_amount);
end;
$$;
revoke all on function public.adjust_student_coins(uuid, integer, text) from public, anon;
grant execute on function public.adjust_student_coins(uuid, integer, text) to authenticated;

-- ===== 操作履歴を読む（運営だけ）=====

-- 1人分（生徒の詳細に出す）
create function public.student_admin_actions(p_student_id uuid, p_limit integer default 20)
returns table (id bigint, actor_name text, action text, detail jsonb, note text, created_at timestamptz)
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
    select a.id, a.actor_name, a.action, a.detail, a.note, a.created_at
      from public.admin_actions a
     where a.target_student_id = p_student_id
     -- 同じ時刻に並んだときは、あとから入れた行（id が大きいほう）を新しいものとして扱う
     order by a.created_at desc, a.id desc
     limit greatest(1, least(coalesce(p_limit, 20), 200));
end;
$$;
revoke all on function public.student_admin_actions(uuid, integer) from public, anon;
grant execute on function public.student_admin_actions(uuid, integer) to authenticated;

-- 全体（運営の確認用）
create function public.recent_admin_actions(p_days integer default 30)
returns table (id bigint, actor_name text, student_name text, action text, detail jsonb, note text, created_at timestamptz)
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
    select a.id, a.actor_name, u.display_name, a.action, a.detail, a.note, a.created_at
      from public.admin_actions a
      left join public.users u on u.id = a.target_student_id
     where a.created_at >= now() - make_interval(days => greatest(1, least(coalesce(p_days, 30), 365)))
     order by a.created_at desc, a.id desc
     limit 500;
end;
$$;
revoke all on function public.recent_admin_actions(integer) from public, anon;
grant execute on function public.recent_admin_actions(integer) to authenticated;
