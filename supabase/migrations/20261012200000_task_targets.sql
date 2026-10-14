-- 仕様書 v1.7［仮］：タスクの複製と、複数クラブ・学年への一括配信
--
--   1. tasks.target_grades：配信する学年（7＝中1 … 12＝高3）。null は全学年
--      生徒への展開（sync_today_tasks）と、運営のアラート（期限が過ぎた未完了）を、学年の対象に合わせる
--   2. 配信タスクの報酬は標準 10 コイン［仮］。これまで作成画面が報酬を送らず、既定の 0 のままだった
--      すでにある配信タスクで 0 のものも 10 にそろえる（自由登録のタスクは別の規則なので触らない）

------------------------------------------------------------------------------
-- 1. 学年の対象
------------------------------------------------------------------------------
alter table public.tasks add column target_grades smallint[]
  check (target_grades is null
         or (cardinality(target_grades) between 1 and 6 and target_grades <@ array[7, 8, 9, 10, 11, 12]::smallint[]));
comment on column public.tasks.target_grades is '配信する学年（7＝中1 … 12＝高3）。null は全学年。配信タスク（assigned）だけで使う。';

-- 生徒の今日のタスクへの展開：学年の対象に合う分だけ
do $$
declare
  d text := pg_get_functiondef('public.sync_today_tasks'::regproc);
  k text := E'       and t.archived_at is null\n       and t.starts_on <= v_today\n';
begin
  if position(k in d) = 0 then
    raise exception 'sync_today_tasks の形が想定と違います';
  end if;
  d := replace(d, k, E'       and t.archived_at is null\n'
    || E'       and (t.target_grades is null\n'
    || E'            or (select u.grade from public.users u where u.id = v_uid) = any (t.target_grades))\n'
    || E'       and t.starts_on <= v_today\n');
  execute d;
end $$;

-- 運営のアラート「配信タスクが未完了」：学年の対象にならない生徒には出さない
do $$
declare
  d text := pg_get_functiondef('private.generate_alerts'::regproc);
  k text := E'       where t.club_id = s.club_id and t.kind = ''assigned'' and t.recurrence = ''none''\n';
begin
  if position(k in d) = 0 then
    raise exception 'generate_alerts の形が想定と違います';
  end if;
  d := replace(d, k, k
    || E'         and (t.target_grades is null\n'
    || E'              or (select u.grade from public.users u where u.id = s.user_id) = any (t.target_grades))\n');
  execute d;
end $$;

------------------------------------------------------------------------------
-- 2. 配信タスクの標準報酬
------------------------------------------------------------------------------
alter table public.tasks alter column reward_coins set default 10;
update public.tasks set reward_coins = 10 where kind = 'assigned' and reward_coins = 0;
