-- 仕様書 5-4：条件を満たすともらえるバッジ（ストリーク・教科・行動・イベント）と獲得判定
--
--   ガチャで得る景品のバッジ（items / user_items）とは別に持つ。獲得は最初の 1 回だけ、消えない
--   初期版は少数：ストリーク 3 日・7 日・30 日、初めての教科 5 つ、15 分チャレンジャー、集中のつみかさね（10 回）、
--   クラブミッション参加。［仮］朝活ハンターは「朝」の定義が未定のため入れない
--   判定は記録のたび（record_outcome）に行い、新しく得たバッジを結果に返す（画面 02 を出す条件）
--   バッジはクラブ管理者に見せない（運営と本人だけ）

------------------------------------------------------------------------------
-- 1. 定義と獲得
------------------------------------------------------------------------------
create table public.badge_defs (
  code text primary key,
  name text not null,
  category text not null check (category in ('streak', 'subject', 'action', 'event')),
  rarity text not null check (rarity in ('normal', 'rare', 'super_rare')),
  -- 条件の数（日数・回数）。進み具合は progress / goal で出す
  goal integer not null check (goal > 0),
  -- 教科のバッジだけ：対象の教科
  param text,
  condition text not null,
  sort_order integer not null default 0,
  active boolean not null default true
);
comment on table public.badge_defs is '条件を満たすともらえるバッジの定義。全クラブ共通。運営だけが変えられる（書き込み権限は付けない）。';

create table public.user_badges (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete restrict,
  student_id uuid not null references public.users (id) on delete cascade,
  badge_code text not null references public.badge_defs (code) on delete restrict,
  earned_on date not null,
  earned_at timestamptz not null default now(),
  unique (student_id, badge_code)
);
comment on table public.user_badges is '獲得したバッジ。書き込みは関数だけ。クラブ管理者には見せない。';
create index user_badges_club_idx on public.user_badges (club_id, earned_at);

alter table public.badge_defs enable row level security;
alter table public.user_badges enable row level security;
create policy badge_defs_select on public.badge_defs for select to authenticated using (true);
create policy user_badges_select on public.user_badges for select to authenticated
  using (student_id = (select auth.uid()) or (select private.is_operator()));
revoke all on public.badge_defs, public.user_badges from anon, authenticated;
grant select on public.badge_defs, public.user_badges to authenticated;

insert into public.badge_defs (code, name, category, rarity, goal, param, condition, sort_order) values
  ('streak_3',      '3日連続',               'streak',  'normal',     3,  null,   '3日連続で学習を記録する', 10),
  ('streak_7',      '7日連続',               'streak',  'rare',       7,  null,   '7日連続で学習を記録する', 20),
  ('streak_30',     '30日連続',              'streak',  'super_rare', 30, null,   '30日連続で学習を記録する', 30),
  ('subject_eng',   '英語のはじめて',         'subject', 'normal',     1,  '英語', '英語を初めて記録する', 40),
  ('subject_math',  '数学のはじめて',         'subject', 'normal',     1,  '数学', '数学を初めて記録する', 41),
  ('subject_jpn',   '国語のはじめて',         'subject', 'normal',     1,  '国語', '国語を初めて記録する', 42),
  ('subject_sci',   '理科のはじめて',         'subject', 'normal',     1,  '理科', '理科を初めて記録する', 43),
  ('subject_soc',   '社会のはじめて',         'subject', 'normal',     1,  '社会', '社会を初めて記録する', 44),
  ('focus_first',   '15分チャレンジャー',     'action',  'normal',     1,  null,   '15分集中を初めて達成する', 50),
  ('focus_10',      '集中のつみかさね',       'action',  'rare',       10, null,   '15分集中を10回達成する', 60),
  ('mission_join',  'クラブミッション参加',   'event',   'normal',     1,  null,   'クラブミッションに初めて参加する', 70);

------------------------------------------------------------------------------
-- 2. 進み具合と判定
------------------------------------------------------------------------------
create function private.badge_progress(p_student_id uuid, p_code text)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  d public.badge_defs;
  v integer := 0;
begin
  select * into d from public.badge_defs where code = p_code;
  if not found then
    return 0;
  end if;
  if d.category = 'streak' then
    -- 途切れても最長記録は消えない
    select coalesce(max(s.longest_days), 0) into v from public.streaks s where s.student_id = p_student_id;
  elsif d.category = 'subject' then
    -- 教科の記録（タグ・タイマー）か、その教科の配信タスクの完了が 1 件あれば
    select case when exists (
             select 1 from public.study_records sr
              where sr.student_id = p_student_id and sr.subject = d.param and sr.ended_at is not null
           ) or exists (
             select 1 from public.user_tasks ut join public.tasks t on t.id = ut.task_id
              where ut.student_id = p_student_id and ut.completed_at is not null and t.subject = d.param
           ) then 1 else 0 end into v;
  elsif d.category = 'action' then
    select count(*)::integer into v from public.study_records sr
     where sr.student_id = p_student_id and sr.focus_achieved is true;
  elsif d.category = 'event' then
    select count(*)::integer into v from public.mission_participants mp where mp.student_id = p_student_id;
  end if;
  return least(v, d.goal);
end;
$$;

-- 条件を満たしたのに未獲得のバッジを付け、新しく得たものを返す
create function private.evaluate_badges(p_student_id uuid, p_club_id uuid, p_date date)
returns jsonb
language sql
volatile
security definer
set search_path = ''
as $$
  with ins as (
    insert into public.user_badges (club_id, student_id, badge_code, earned_on)
    select p_club_id, p_student_id, d.code, p_date
      from public.badge_defs d
     where d.active
       and not exists (select 1 from public.user_badges ub where ub.student_id = p_student_id and ub.badge_code = d.code)
       and private.badge_progress(p_student_id, d.code) >= d.goal
    on conflict (student_id, badge_code) do nothing
    returning badge_code
  )
  select coalesce(jsonb_agg(jsonb_build_object('code', d.code, 'name', d.name, 'rarity', d.rarity) order by d.sort_order), '[]'::jsonb)
    from ins join public.badge_defs d on d.code = ins.badge_code;
$$;

------------------------------------------------------------------------------
-- 3. 記録の結果に、新しく得たバッジを入れる
------------------------------------------------------------------------------
create or replace function private.record_outcome(p_student_id uuid, p_date date)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
  v_current integer;
  v_longest integer;
  v_club uuid;
  v_first boolean;
  v_badges jsonb;
begin
  select da.completed_count into v_count from public.daily_activity da
   where da.student_id = p_student_id and da.activity_date = p_date;
  select s.current_days, s.longest_days, s.club_id into v_current, v_longest, v_club from public.streaks s where s.student_id = p_student_id;
  v_first := coalesce(v_count, 0) = 1;
  v_badges := case when v_club is null then '[]'::jsonb else private.evaluate_badges(p_student_id, v_club, p_date) end;
  return jsonb_build_object(
    'completed_today', coalesce(v_count, 0),
    'current_days', coalesce(v_current, 0),
    'longest_days', coalesce(v_longest, 0),
    'first_of_day', v_first,
    -- 節目（7・30・100 日）に、その日の最初の記録で届いた
    'milestone', v_first and coalesce(v_current, 0) in (7, 30, 100),
    'new_badges', v_badges
  );
end;
$$;

------------------------------------------------------------------------------
-- 4. 生徒の画面：バッジの一覧（獲得日と、未獲得の進み具合）
------------------------------------------------------------------------------
create function public.my_badges()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'code', d.code, 'name', d.name, 'category', d.category, 'rarity', d.rarity, 'goal', d.goal,
           'condition', d.condition,
           'earned_on', ub.earned_on,
           'progress', case when ub.id is not null then d.goal else private.badge_progress((select auth.uid()), d.code) end
         ) order by d.sort_order), '[]'::jsonb)
    from public.badge_defs d
    left join public.user_badges ub on ub.badge_code = d.code and ub.student_id = (select auth.uid())
   where d.active and (select auth.uid()) is not null;
$$;

------------------------------------------------------------------------------
-- 5. 運営のアラート：バッジ獲得に、条件でもらえるバッジも含める（連続記録の節目は別のアラートがあるので除く）
------------------------------------------------------------------------------
do $$
declare
  d text := pg_get_functiondef('private.generate_alerts'::regproc);
  k text := E'   where ui.category = ''badge'' and private.jst_date(ui.acquired_at) >= v_today - 1;\n';
begin
  if position(k in d) = 0 then
    raise exception 'generate_alerts の形が想定と違います';
  end if;
  d := replace(d, k, k || E'\n  insert into cur\n'
    || E'  select ub.club_id, ub.student_id, ''badge_earned'', ''ubadge:'' || ub.id,\n'
    || E'         jsonb_build_object(''item'', bd.name), ub.earned_on, true, false\n'
    || E'    from public.user_badges ub\n'
    || E'    join public.badge_defs bd on bd.code = ub.badge_code\n'
    || E'   where bd.category <> ''streak'' and ub.earned_on >= v_today - 1;\n');
  execute d;
end $$;

------------------------------------------------------------------------------
-- 6. 権限
------------------------------------------------------------------------------
revoke all on function private.badge_progress(uuid, text), private.evaluate_badges(uuid, uuid, date), private.record_outcome(uuid, date) from public, anon, authenticated;
revoke all on function public.my_badges() from public, anon;
grant execute on function public.my_badges() to authenticated;

------------------------------------------------------------------------------
-- 7. すでにいる生徒の分を、今の記録から付ける（画面は出さない）
--    獲得日は最初の学習日（なければ 2 日前）。運営のアラートに一斉に出ないよう、昨日以降にはしない
------------------------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in select s.student_id, s.club_id from public.streaks s loop
    perform private.evaluate_badges(
      r.student_id, r.club_id,
      least(private.jst_today() - 2,
            coalesce((select min(da.activity_date) from public.daily_activity da where da.student_id = r.student_id), private.jst_today() - 2)));
  end loop;
end $$;
