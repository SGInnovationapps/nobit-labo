-- 生徒1人の記録を削除する（保護者から、公式LINE のチャットで依頼があったとき）
-- Supabase の SQL Editor で実行する。［LINEユーザーID］は、管理画面の生徒の詳細で確認する。
-- 1. 下の「対象の確認」だけを先に実行し、本人であることを確かめる
-- 2. 確認できたら、「削除」を実行する（元に戻せない）
-- 削除されるもの：生徒のアカウント、所属、同意、記録、コイン台帳、ガチャ、バッジ、連絡の記録など（users に連なるもの）
-- 残るもの：クラブ、タスクの配信、クラブ全体の合計（個人は特定できない）

-- ■ 対象の確認
select u.id, u.display_name, u.grade, c.name as club, la.line_user_id, la.friend_status
from public.users u
left join public.club_members m on m.user_id = u.id and m.status in ('pending', 'approved')
left join public.clubs c on c.id = m.club_id
left join public.line_accounts la on la.user_id = u.id
where la.line_user_id = '［LINEユーザーID］';

-- ■ 削除（上の結果が1行で、本人と確認できたときだけ）
begin;
with target as (
  select la.user_id, la.line_user_id from public.line_accounts la where la.line_user_id = '［LINEユーザーID］'
), gone_friend as (
  delete from public.line_friends f using target t where f.line_user_id = t.line_user_id returning 1
)
delete from auth.users a using target t where a.id = t.user_id;
-- 件数が「DELETE 1」であることを確認してから commit する
commit;
