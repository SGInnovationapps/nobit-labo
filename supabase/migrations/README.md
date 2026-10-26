# データベースの定義

番号順に流す。一度流したファイルは書き換えず、変更は新しい番号で足す。

| ファイル | 中身 |
|---|---|
| `001_core.sql` | クラブ・職員と保護者・クラス・会員・緊急連絡先・規約・担当 |
| `002_line.sql` | LINE連携・招待コード・送信記録 |
| `003_ops.sql` | 開講日・欠席・出席・振替 |
| `004_staff.sql` | シフト・お知らせ・フィードバック・引き継ぎ |
| `005_fee_tags.sql` | 料金プラン・請求・タグ |
| `006_functions.sql` | 学年と年齢を計算する関数 |
| `007_rls.sql` | 行単位の権限（RLS）と最後の検査 |
| `008_auth.sql` | LINEログインの登録処理（`line-auth` 専用の関数）・006 の関数の search_path 固定 |
| `009_parent_views.sql` | 保護者のホームが読むビュー（`my_children`・`my_notices`、security_invoker） |
| `010_application.sql` | 入会申込の送信（`submit_application`。子・つながり・緊急連絡先・規約の同意を1回で） |
| `011_schedule_view.sql` | 保護者の予定が読むビュー（`my_schedule`。クラスの回＋振替で行く回、欠席連絡・出席、security_invoker） |
| `012_staff_home.sql` | 職員のホームの「やること」（`staff_todo()`。入会承認待ち・来月分の開講・出欠未入力。呼んだ人の権限で数える） |
| `013_admission.sql` | 入会承認（`approve_member()`。会員番号の発行・クラス）と、紙の申込書からの登録（`register_paper_member()`。番号・クラス・緊急連絡先・紙での同意を1回で）。事務担当だけ、呼んだ人の権限で動く |
| `014_roster_settings.sql` | 会員名簿のビュー（`staff_roster`。学年・年齢はデータベースの関数で、職員だけ、security_invoker）と、会員規約の改定（`publish_terms()`。版を1つ上げる、事務担当だけ） |

各ファイルの先頭に、何のためのファイルかを日本語で書く。
