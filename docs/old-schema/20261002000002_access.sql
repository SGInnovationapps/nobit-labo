-- 時刻・設定・権限の共通関数と Row Level Security

-- 現在時刻。nobit.test_now はテスト専用（PostgREST からは設定できない）。
create function nobit_now() returns timestamptz
language sql stable as $$
  select coalesce(nullif(current_setting('nobit.test_now', true), '')::timestamptz, now())
$$;

-- 日本時間の「今日」。連続記録の締めは JST 24:00。
create function nobit_today() returns date
language sql stable as $$
  select (nobit_now() at time zone 'Asia/Tokyo')::date
$$;

create function nobit_jst_date(ts timestamptz) returns date
language sql immutable as $$
  select (ts at time zone 'Asia/Tokyo')::date
$$;

-- 仮置きの値をここに集める（仕様書 10章）。確定したらこの関数を差し替える。
create function nobit_config() returns jsonb
language sql immutable as $$
  select jsonb_build_object(
    'consent_version',        '2026-10-v1',  -- 保護者同意の文面の版（閲覧範囲を変えたら上げる）
    'default_task_reward',    10,            -- ［仮］運営設定タスク
    'free_entry_reward',      5,             -- ［仮］自由登録
    'free_entry_daily_limit', 3,             -- ［仮］自由登録は1日3件まで
    'ticket_max',             2              -- ［仮］休息チケットの所持上限
  )
$$;

-- ログイン中のユーザー（users.id）
create function nobit_me() returns uuid
language sql stable security definer set search_path = public as $$
  select id from users where auth_user_id = auth.uid()
$$;

create function nobit_my_role() returns nobit_role
language sql stable security definer set search_path = public as $$
  select role from users where auth_user_id = auth.uid()
$$;

create function nobit_is_operator() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'operator' from users where auth_user_id = auth.uid()), false)
$$;

-- 管理画面で扱えるクラブ（運営は全クラブ、クラブ管理者は担当クラブ）
create function nobit_admin_club_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select c.id from clubs c where nobit_is_operator()
  union
  select m.club_id
    from club_members m join users u on u.id = m.user_id
   where u.auth_user_id = auth.uid()
     and u.role = 'club_admin'
     and m.member_role = 'club_admin'
     and m.status = 'approved'
$$;

create function nobit_can_view_club(p_club uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from nobit_admin_club_ids() c where c = p_club)
$$;

create function nobit_require_operator() returns uuid
language plpgsql stable security definer set search_path = public as $$
declare v uuid;
begin
  select id into v from users where auth_user_id = auth.uid() and role = 'operator';
  if v is null then raise exception 'operator_only' using errcode = '42501'; end if;
  return v;
end $$;

create function nobit_require_club(p_club uuid) returns uuid
language plpgsql stable security definer set search_path = public as $$
begin
  if p_club is null or not nobit_can_view_club(p_club) then
    raise exception 'club_forbidden' using errcode = '42501';
  end if;
  return nobit_me();
end $$;

-- 承認済みの生徒本人（生徒の RPC の入口で使う）
create function nobit_require_student() returns users
language plpgsql stable security definer set search_path = public as $$
declare v users;
begin
  select u.* into v from users u
   where u.auth_user_id = auth.uid() and u.role = 'student'
     and exists (select 1 from club_members m
                  where m.user_id = u.id and m.club_id = u.club_id and m.status = 'approved');
  if v.id is null then raise exception 'student_not_approved' using errcode = '42501'; end if;
  return v;
end $$;

-- ---------------------------------------------------------------
-- Row Level Security
-- 画面からの直接の読み取りは select だけ許し、書き込みはすべて RPC に寄せる。
-- クラブ管理者は自クラブ以外を読めず、生徒の自由登録（is_free）も読めない。
-- ---------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'clubs','users','club_members','club_events','parental_consents','task_templates','tasks',
    'user_tasks','focus_sessions','daily_activity','streaks','badges','user_badges','items',
    'user_items','coin_transactions','quests','user_quests','missions','mission_participants',
    'support_comments','alert_rules','alerts','rest_tickets','gacha_draws']
  loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;

create policy clubs_read on clubs for select to authenticated
  using (nobit_can_view_club(id)
         or id = (select club_id from users where auth_user_id = auth.uid()));

create policy users_read on users for select to authenticated
  using (auth_user_id = auth.uid()
         or nobit_is_operator()
         or (role = 'student' and nobit_can_view_club(club_id)));

create policy club_members_read on club_members for select to authenticated
  using (user_id = nobit_me() or nobit_can_view_club(club_id));

-- 生徒本人と、そのクラブを担当する管理者が読める表
do $$
declare t text;
begin
  foreach t in array array[
    'parental_consents','focus_sessions','daily_activity','streaks','user_badges','user_items',
    'coin_transactions','user_quests','mission_participants','support_comments','rest_tickets','gacha_draws']
  loop
    execute format(
      'create policy %I on %I for select to authenticated using (user_id = nobit_me() or nobit_can_view_club(club_id))',
      t || '_read', t);
  end loop;
end $$;

-- 自由登録はクラブ管理者に見せない（運営と本人だけ）
create policy user_tasks_read on user_tasks for select to authenticated
  using (user_id = nobit_me()
         or nobit_is_operator()
         or (not is_free and nobit_can_view_club(club_id)));

-- クラブ単位の定義（自クラブの生徒と担当管理者）
create policy club_events_read on club_events for select to authenticated
  using (nobit_can_view_club(club_id)
         or club_id = (select club_id from users where auth_user_id = auth.uid()));
create policy tasks_read on tasks for select to authenticated
  using (nobit_can_view_club(club_id)
         or club_id = (select club_id from users where auth_user_id = auth.uid()));
create policy missions_read on missions for select to authenticated
  using (nobit_can_view_club(club_id)
         or club_id = (select club_id from users where auth_user_id = auth.uid()));

-- 全クラブ共通の定義（club_id が null）か自クラブのもの
do $$
declare t text;
begin
  foreach t in array array['task_templates','badges','items','quests']
  loop
    execute format(
      'create policy %I on %I for select to authenticated using (club_id is null or nobit_can_view_club(club_id) or club_id = (select club_id from users where auth_user_id = auth.uid()))',
      t || '_read', t);
  end loop;
end $$;

-- アラートは運営だけ（公式LINE の閲覧・送信は運営のみ）
create policy alerts_read on alerts for select to authenticated using (nobit_is_operator());
create policy alert_rules_read on alert_rules for select to authenticated using (nobit_is_operator());
