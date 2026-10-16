-- 生徒の記録を削除する（保護者から公式LINE のチャットで依頼があったとき、テスト用のアカウントを片づけるとき）
-- Supabase の SQL Editor で、1 → 2 → 3 の順に、ブロックごとに選んで実行する。
--
-- 削除されるもの：生徒のアカウント、所属、保護者の同意、学習の記録、コイン台帳、ガチャ、バッジ、連絡の記録（users に連なるもの）
-- 残るもの：クラブ、配信したタスクの定義、クラブ全体の合計（個人は特定できない）。
--           公式LINE の友だち状態（line_friends）も残す。本人が登録し直したときに引き継ぐため。
--
-- SQL Editor は、実行するたびに別のトランザクションになる。begin / commit で区切って
-- 途中で確かめることはできないので、2 で対象を確かめてから 3 を実行する。

-- ■ 1. 生徒の一覧（新しい順）。消したい生徒の id を、この結果から控える
select
  u.id,
  u.display_name as 表示名,
  u.grade as 学年,
  c.name as クラブ,
  m.status as 所属,
  la.line_display_name as LINEの名前,
  la.line_user_id as LINEのID,
  (select count(*) from public.daily_activity d where d.student_id = u.id) as 学習日数,
  u.created_at as 登録日時
from public.users u
left join public.club_members m on m.user_id = u.id and m.status in ('pending', 'approved')
left join public.clubs c on c.id = m.club_id
left join public.line_accounts la on la.user_id = u.id
where u.role = 'student'
order by u.created_at desc;


-- ■ 2. 消す前の確認（1 で控えた id を入れる。1人なら1つ、複数ならカンマで並べる）
--      結果の行数と中身が、消したい生徒と合っているかを必ず確かめる
select u.id, u.display_name as 表示名, c.name as クラブ, la.line_display_name as LINEの名前, u.created_at as 登録日時
from public.users u
left join public.club_members m on m.user_id = u.id and m.status in ('pending', 'approved')
left join public.clubs c on c.id = m.club_id
left join public.line_accounts la on la.user_id = u.id
where u.id in ('［生徒のid］');


-- ■ 3. 削除（2 の結果が正しいときだけ。元に戻せない）
--      消した行が返るので、件数と中身をもう一度確かめる
delete from auth.users
where id in ('［生徒のid］')
returning id, email;


-- ■ 4. 確認（0 行なら削除できている）
select u.id, u.display_name from public.users u where u.id in ('［生徒のid］');
