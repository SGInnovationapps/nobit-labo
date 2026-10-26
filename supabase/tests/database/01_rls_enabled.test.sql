-- 全テーブルで RLS が有効か、匿名ユーザーが何も触れないか
begin;
select plan(24);

select is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity),
  0, 'public の全テーブルで RLS が有効');

-- 匿名は、どのテーブルにも触れない（あとから足したテーブルの取りこぼしを防ぐ）
select is(
  (select coalesce(string_agg(distinct c.relname, ', ' order by c.relname), '')
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
      and has_table_privilege('anon', c.oid, 'select, insert, update, delete')),
  '', 'anon はどのテーブルにも触れない');

-- private のうち、記録やコインを書くものは画面から直接呼べない
-- （RLS が使う判定の関数とトリガーは、authenticated から呼べてよい）
select is(
  (select coalesce(string_agg(p.proname, ', ' order by p.proname), '')
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private'
      and p.proname in ('grant_coins', 'complete_task_at', 'record_study_tag_at', 'record_study_activity',
                        'award_study_day', 'record_outcome', 'evaluate_badges', 'evaluate_quests', 'quest_state',
                        'drill_pool', 'drill_wrong_ids', 'drill_question_json', 'finish_drill', 'answer_drill_at',
                        'draw_gacha_core', 'evaluate_week', 'ensure_week', 'draw_gacha_reward_at')
      and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'))),
  '', '記録やコインを書く private の関数は、画面から呼べない');

select has_table('public', t, t || ' がある')
from unnest(array['users','line_accounts','clubs','club_members','parental_consents','tasks',
                  'user_tasks','app_opens','daily_activity','streaks','support_comments',
                  'questions','drill_sessions','drill_answers']) as t;

select is(has_table_privilege('anon', 'public.users', 'select'), false, 'anon は users を読めない');
select is(has_table_privilege('anon', 'public.tasks', 'select'), false, 'anon は tasks を読めない');
select is(has_function_privilege('anon', 'public.complete_task(uuid)', 'execute'), false, 'anon は complete_task を呼べない');
select is(has_function_privilege('authenticated', 'private.complete_task_at(uuid,uuid,timestamptz)', 'execute'), false,
  '時刻つきの完了の本体は authenticated から呼べない');
select is(has_column_privilege('authenticated', 'public.users', 'role', 'update'), false, 'role 列は更新できない');
select is(has_table_privilege('authenticated', 'public.questions', 'select'), false,
  '問題バンクは画面から読めない（正解が入っているため）');
select is(has_function_privilege('anon', 'public.start_drill(text,text,text,smallint,smallint,uuid)', 'execute'), false,
  'anon はドリルを始められない');

select * from finish();
rollback;
