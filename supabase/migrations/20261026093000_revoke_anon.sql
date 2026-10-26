-- 匿名（anon）からの読み取りを、あとから足したテーブルでも閉じる
--
-- RLS の方針は「匿名は何も触れない」。これらのテーブルは RLS が有効で、anon には
-- ポリシーがないため行は返らないが、テーブルへの GRANT だけが残っていた。
-- 既存のテーブルにそろえて、権限そのものを取り上げる。
-- （32_daily_quests のテストで見つかった。01_rls_enabled にも、全テーブルを見る検査を足してある）

revoke all on public.quest_achievements from anon;
revoke all on public.drill_sessions from anon;
revoke all on public.drill_answers from anon;
revoke all on public.weekly_digest_log from anon;

-- private の関数は、画面からは呼べない（本体は security definer の public 関数を通す）
revoke all on function private.quest_state(uuid, date) from public, anon, authenticated;
revoke all on function private.evaluate_quests(uuid, uuid, date) from public, anon, authenticated;
revoke all on function private.drill_pool(uuid, text, smallint, text, text) from public, anon, authenticated;
revoke all on function private.drill_wrong_ids(uuid, text, smallint) from public, anon, authenticated;
revoke all on function private.drill_question_json(public.drill_sessions) from public, anon, authenticated;
revoke all on function private.finish_drill(uuid, timestamptz) from public, anon, authenticated;
revoke all on function private.answer_drill_at(uuid, text, text, timestamptz) from public, anon, authenticated;
