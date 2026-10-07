-- 全テーブルで RLS が有効か、匿名ユーザーが何も触れないか
begin;
select plan(17);

select is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity),
  0, 'public の全テーブルで RLS が有効');

select has_table('public', t, t || ' がある')
from unnest(array['users','line_accounts','clubs','club_members','parental_consents','tasks',
                  'user_tasks','app_opens','daily_activity','streaks','support_comments']) as t;

select is(has_table_privilege('anon', 'public.users', 'select'), false, 'anon は users を読めない');
select is(has_table_privilege('anon', 'public.tasks', 'select'), false, 'anon は tasks を読めない');
select is(has_function_privilege('anon', 'public.complete_task(uuid)', 'execute'), false, 'anon は complete_task を呼べない');
select is(has_function_privilege('authenticated', 'private.complete_task_at(uuid,uuid,timestamptz)', 'execute'), false,
  '時刻つきの完了の本体は authenticated から呼べない');
select is(has_column_privilege('authenticated', 'public.users', 'role', 'update'), false, 'role 列は更新できない');

select * from finish();
rollback;
