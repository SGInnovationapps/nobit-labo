# 調べたことのメモ

作業中に調べた事実、ハマったこと、次回の自分への申し送り。
決定事項は DECISIONS.md に、事実とメモはここに。

各作業ブロックの終わりに、ここへ数行追記してから終わる。

---

## LINE

- ユーザーIDはプロバイダー単位。同じプロバイダー配下ならチャネルの種類が違っても
  同じ値になる。プロバイダーが違うと同じ人でも別の値になる
- 未認証ミニアプリでも Messaging API とシェアターゲットピッカーは使える。
  サービスメッセージ・LINE内検索掲載・アプリ内課金は認証済み限定
- 外部ブラウザでは `liff.init()` だけではログインされない。`liff.login()` を呼ぶか
  `withLoginOnExternalBrowser: true` を指定する
- 外部ブラウザで使えないもの: `sendMessages` / `openWindow` / `closeWindow` / `scanCode`
- 応答メッセージ（リプライ）はメッセージ通数にカウントされない。
  プッシュ・マルチキャスト・ブロードキャストはカウントされる
- 通数は「送信リクエスト数 × 送信対象人数」。1リクエストに吹き出しを複数入れても増えない

### Clubena ミニアプリのチャネル（工程1-3）

チャネルシークレットはここに書かない（Supabase の Secrets にだけ置く）。

| | LIFF ID | チャネルID |
|---|---|---|
| 開発用 | `2012160402-vA9GMKfg` | `2012160402` |
| 審査用 | `2012160403-I8aaG2ov` | `2012160403` |
| 本番用 | `2012160404-XJezPsbh` | `2012160404` |

- `config.js` の `LIFF_ID_DEV` に開発用、`LIFF_ID_PROD` に本番用を入れた。審査用はコードでは使わない
- チャネルIDは LINE Developers の各チャネルの「チャネル基本設定」で確かめた値。
  工程3の `line-auth` は、この3つのどれかが aud に入っているトークンだけを受け付ける

## Supabase

- Edge Function に最初から入っている環境変数（2026-10-22、`supabase/supabase` のドキュメントのソース
  `apps/docs/content/guides/functions/secrets.mdx` で確認。supabase.com はこの作業環境から開けなかった）:
  `SUPABASE_URL`、`SUPABASE_SECRET_KEYS`（新しい形式の管理用キー。JSON で、ふつうは `default` を使う）、
  `SUPABASE_PUBLISHABLE_KEYS`、`SUPABASE_DB_URL`。従来の形式は `SUPABASE_SERVICE_ROLE_KEY`・`SUPABASE_ANON_KEY`。
  `line-auth` は `SUPABASE_SECRET_KEYS` を優先し、なければ `SUPABASE_SERVICE_ROLE_KEY` を使う。
  自分で足す Secrets の名前は `SUPABASE_` で始められない
- 仮のメールアドレス `…@users.clubena.invalid` は使える（2026-10-22、Supabase Auth のソース `supabase/auth` の master で確認）:
  - 管理用の作成（`admin/users`）・`generateLink`・`verify` のメールの検査は `validateEmail` だけで、これは書式のチェックのみ
    （`internal/api/mail.go`）
  - `.invalid` などを断る検査（`internal/mailer/validateclient`）は、**実際にメールを送るとき**にだけ働く。
    `line-auth` はメールを送らないので引っかからない
  - これらの管理用の処理は「新規登録を許可する」の設定を見ていない。画面からの新規登録は閉じたままでよい
  - 注意：この台帳の人に、パスワード再設定などのメールを送る操作をすると失敗する（送らないので問題ない）
- Supabase Auth の `verify` は、接続元のIPごとに回数を制限している（既定は約30回で、少しずつ回復する。
  ドキュメントの `auth/rate-limits.mdx`）。`line-auth` が呼ぶ `verify` は、全員分が Edge Function のIPから来る扱いになる。
  招待案内を一斉に配る前（工程13-7）に、ダッシュボード → Authentication → Rate Limits で上限を見直す。
  利用者のIPを渡す仕組み（`Sb-Forwarded-For`）もあるが、新しい形式の管理用キーとダッシュボードでの設定が要る
- Edge Function の verify_jwt を切るには、`supabase functions deploy line-auth --no-verify-jwt`。
  `supabase/config.toml` の `[functions.line-auth] verify_jwt = false` でもよい（このリポジトリには config.toml がない）

## Cloudflare

- `clubena` は Pages ではなく **Workers**（静的配信）として作られている。
  URLは `https://clubena.（アカウントのサブドメイン）.workers.dev/`。Cloudflare の clubena →「Domains」タブで確かめる
- 設定はリポジトリ直下の `wrangler.jsonc`。`public/` をそのまま配信し、ビルドはしない。
  push すると Workers Builds が `npx wrangler deploy` で公開する（本番のブランチは Cloudflare の Settings → Build で決まる）
- Workers では `_redirects` の `/* /index.html 200` は「無限ループ」として無視され、`/itami/` などが 404 になる
  （2026-10-22 に `wrangler dev` で確認）。代わりに `wrangler.jsonc` の `"not_found_handling": "single-page-application"` で、
  ファイルがないURLに index.html を返す。実在するファイル（/js/… /css/…）はそのまま返る
- 2026-10-22 のビルド失敗2件（`/* /index.html 200` を含む版）も、この規則が原因と見られる。`/* / 200` に変えた版は成功していた
- 本番以外のブランチ（PR）は `npx wrangler preview` でプレビュー公開される。このコマンドは設定に `"previews": {}` がないと
  「missing a `previews` block」で止まる（2026-10-22 のPR #2 で確認）
- 手元で本番と同じ動きを見るときは `npx wrangler dev`（`npx serve public` は /itami/ を index.html にしない）

## 作業ログ

<!-- 日付と、どこまでやったか、次に何をするか -->

- 2026-10-22 工程3-2・3-3：`line-auth`（100行ちょうど）と `008_auth.sql`（登録の SQL 関数・006 の search_path 固定）を作った。
  手元のテストは rls_test.sql 288件・auth_rpc_test.sql 55件がすべて合格。`deno check`・`deno lint`（Deno 2.5.6）も通過。
  LINE と Supabase Auth の代わりを置いた手元の確かめ（コミットしていない）で、Edge Function の流れ25項目も確かめた。
  `/dev/` の診断画面に「line-auth を呼ぶ」ボタンを足した。
  次：`docs/LINE_AUTH.md` 10章の手順で本番に 008 を流し、公開して、スマホで確かめる（工程3-4）
- 2026-10-23 工程3-5：`tests/test-auth.js`（Deno のテスト、15項目）を作り、`run.sh` から流れるようにした。
  **外部はすべてモックで、手元だけで動く。本物の LINE（api.line.me）にも本番の Supabase にも触れない**（権限なしで動き、
  空のキャッシュでも何もダウンロードしない）。テストのため、line-auth の処理の中身を `handler.ts` に分け、
  LINE への fetch と管理クライアントを引数で受け取る形にした。`index.ts` は本物の部品を渡すだけ（公開時の動きは同じ。
  前回の25項目の確かめを分けたあとの版にも流して、全部合格）。④〜⑩は引き続き `auth_rpc_test.sql` で確かめる
- 2026-10-23 工程3-6・3-7：`public/js/auth-line.js`（画面側のログイン・招待コードの入力）を作り、`main.js` につないだ。
  supabase-js は CDN（jsDelivr の `+esm`）から 2.117.3 を固定で読む（npm の公開記録で実在を確認。2.118.0 は公開から1週間ほどなので1つ前に）。
  jsDelivr はこの作業環境から開けなかったので、手元の確かめは npm から取った同じ版のブラウザ用ビルドに差し替えて行った（28項目、コミットしていない）。
  セッションの保存先はクラブごと（`clubena-auth-<クラブ>`）。LINEの中では `liff.login` が使えないので、期限切れのときは開き直して取り直す。
  確かめ用のクラブ `trial` を `CLUBS` に足した（工程13-7 の前に消す）。次：`LINE_AUTH.md` 11章の手順でスマホ・パソコンで確かめる
- 2026-10-24 工程3-6・3-7：11章のスマホ確認が済んだ（確認はあなたが実施）。WORK_PLAN を済みにした
- 2026-10-24 工程4-1〜4-4：保護者のホーム（`public/js/parent-home.js`）・下のタブ・きょうだい切替と、ビューの `009_parent_views.sql`
  （`my_children`・`my_notices`、security_invoker）を作った。ホームを開く問い合わせは3つを同時に。学年は `grade_label` の値をそのまま出す。
  RLS テストに「保護者は自分の子のビューの行しか見えない」などを足して 314件合格。
  手元で PostgREST 12.2.12 を手元の DB につなぎ、ブラウザで24項目を確かめた（コミットしていない。手元の表示までの時間は0.1秒台で、実機の値ではない）。
  BIZ UDPGothic を Google Fonts から読むようにした（display=swap）。次：`docs/PARENT_SCREEN.md` の手順で実機の秒数を3回測る
- 2026-10-24 工程4-5・4-6：入会申込フォーム（`public/js/apply-form.js`）と、送信を受ける `010_application.sql`（`submit_application`）を作った。
  4つの段（お子さま→緊急連絡先→会員規約→確認）。生年月日は年・月・日を選ぶ形（年は1行、月・日は2行目。320px幅で欠けないように）。
  学年・年齢の計算を `public/js/grade.js` に移し、取り込み（`rules.js`）と共通にした。SQL と 3,490件を突き合わせて食い違い0件。
  テスト：`apply_test.sql` 45件、RLS 314件、ログインの登録処理 55件、取り込み 39件、すべて合格。
  画面は手元のブラウザで、データベースの代わりの部品をつないで全段を通した（コミットしていない）。
  ここから作業のしかたを変えた：ファイルはこのチャットで作り、手元に保存して PowerShell で push する（Claude Code は使わない）。
  次：`docs/PARENT_SCREEN.md`「入会申込フォーム」の確かめ方
- 2026-10-24 工程4-5・4-6：「入会申込フォーム」の確かめ方を最後まで実施（確認はあなたが実施）。WORK_PLAN を済みにした。
  確かめの途中で「読み込めませんでした」が出たのは、本番に 009・010 を流していなかったため（流して解決）
- 2026-10-24 工程4-7・4-8：予定（`public/js/parent-schedule.js`）・お知らせ（`public/js/parent-notices.js`）と、
  予定のビュー `011_schedule_view.sql`（`my_schedule`）を作った。予定は今月・来月の2か月を一度に読み、印は1回に1つ
  （中止＞出席／欠席＞欠席連絡済み＞振替で参加＞会場変更＞今日／予定）。お知らせは本文を開いたら既読（`notice_reads` に upsert、
  重なりは何もしない）。既読を付ける権限は 007 の許可で足りるので、関数は作らなかった。
  テスト：`schedule_test.sql` 21件、RLS 314件・ログインの登録処理 55件・入会申込 45件・取り込み 39件、すべて合格。
  画面は手元のブラウザで、データベースの代わりの部品をつないで確かめた（コミットしていない）。長い題名で画面が横に広がる不具合を見つけて直した
  （`.p-main > *` に `min-width: 0`）。`PARENT_SCREEN.md` の確かめ用 SQL は、手元のDBで投入→読み取り→後片付けまで流して確かめた。
  次：`docs/PARENT_SCREEN.md`「予定とお知らせ」の確かめ方
- 2026-10-24 工程4-7・4-8：「予定とお知らせ」の確かめ方を実施（確認はあなたが実施）。WORK_PLAN を済みにした
- 2026-10-24 工程4-9・4-10：登録情報（`public/js/parent-profile.js`）と、規約の同意・再同意の画面（`public/js/parent-consent.js`）を作った。
  マイグレーションはなし（007 の許可と、緊急連絡先の関数をそのまま使う）。ホームを開く問い合わせを5つにし、
  いちばん新しい規約に未同意の子がいれば、ホームの前に同意の画面を出す。緊急連絡先は「表示する」を押したときだけ読む。
  きょうだいに同じ連絡先を登録できる。「閉じる（LINEに戻る）」はLINEの中だけ。入力の確かめを `public/js/form-check.js` に移し、申込フォームと共通にした。
  テスト：`profile_test.sql` 22件、RLS 314件・ログインの登録処理 55件・入会申込 45件・予定 21件・取り込み 39件・line-auth 15件、すべて合格。
  画面は手元のブラウザで、データベースの代わりの部品をつないで確かめた（コミットしていない。390・320・1280px で横にはみ出さない）。
  一部の子だけ保存できなかったとき、緑の「できました」の見た目で出てしまう点を見つけて直した。
  `PARENT_SCREEN.md` の確かめ用 SQL は、前の工程のデータが残った状態から流して、投入→同意→改定→後片付けまで手元のDBで確かめた。
  次：`docs/PARENT_SCREEN.md`「登録情報と規約の同意」の確かめ方
- 2026-10-25 工程5-1・5-2：職員の画面の枠（`public/js/staff-app.js`）と、ホームの「やること」を数える `012_staff_home.sql`（`staff_todo()`）を作った。
  左のメニューは役割（事務担当／コーチ）と開いている機能で絞り、メニューにない画面は URL を直接開いてもホームに戻す。ホーム以外は「準備中」。
  事務担当のホームは入会承認待ち・来月分の開講・出欠の未入力（過去31日）、コーチのホームは今日の担当クラスと担当クラスの出欠の未入力。
  `staff_todo()` は security invoker にして、事務担当とコーチで数える範囲を RLS に任せた。
  テスト：`staff_todo_test.sql` 15件、RLS 314件・ログインの登録処理 55件・入会申込 45件・予定 21件・登録情報 22件・取り込み 39件・line-auth 15件、すべて合格。
  画面は手元のブラウザで、データベースの代わりの部品をつないで確かめた（コミットしていない。1280・390・320px で横にはみ出さない）。
  コーチのホームで見出し「出欠の未入力」が2回出る点、PC の左のメニューで「Excel取り込み・書き出し」が変なところで折り返す点を見つけて直した。
  `STAFF_SCREEN.md` の確かめ用 SQL は、前の工程のデータが残った状態から流して、事務担当→コーチ→後片付けまで手元のDBで確かめた。
  次：`docs/STAFF_SCREEN.md` の確かめ方
- 2026-10-25 工程5-1・5-2：`STAFF_SCREEN.md` の確かめ方を実施（確認はあなたが実施）。WORK_PLAN を済みにした
- 2026-10-25 工程5-4・5-5：入会承認と紙の申込書からの登録（`public/js/staff-admission.js`）と、`013_admission.sql`
  （`approve_member()`・`register_paper_member()`）を作った。会員番号は `clubs.last_member_no` を進めて決め、欠番は使い回さない
  （取り込みでそれより大きい番号があれば、その次から）。承認すると番号を大きく出し、紙に書き写してもらう。
  一覧は家族ごと・古い順。同じふりがな・生年月日の在籍中の会員や申込があれば注意を出す。申込は取り消せる。
  紙の登録は1人ずつで、きょうだいは姓・せい・緊急連絡先を引き継げる。同意は「紙」・入力した事務担当の名義。
  生年月日の選び方・確かめ方を `form-check.js` に移し、保護者の申込フォームと共通にした（申込フォームは手元のブラウザで全段を通し直した）。
  テスト：`admission_test.sql` 37件、RLS 314件・ログインの登録処理 55件・入会申込 45件・予定 21件・登録情報 22件・やること 15件・取り込み 39件・line-auth 15件、すべて合格。
  画面は手元のブラウザで、データベースの代わりの部品をつないで確かめた（コミットしていない。1280・390・320px で横にはみ出さない）。
  320px で「クラス」の文字が縦に折れる点、PC で紙の登録の欄が横に広がりすぎる点を見つけて直した。
  `STAFF_SCREEN.md` の確かめ用 SQL は、前の工程のデータ（事務担当のまま）が残った状態から、保護者の申込→承認→紙の登録→後片付けまで手元のDBで流して確かめた。
  次：`docs/STAFF_SCREEN.md`「入会承認と紙の申込書からの登録」の確かめ方
- 2026-10-25 工程5-6・5-8：会員名簿（`public/js/staff-roster.js`）と設定：クラス・会員規約（`public/js/staff-settings.js`）、
  `014_roster_settings.sql`（ビュー `staff_roster`・関数 `publish_terms()`）を作った。名簿の学年・年齢はビューの中で `grade_label`・`age_on` を
  使い、画面で計算し直さない。名簿は絞り込み（クラス・状態・探す）と並べ方（ふりがな・番号・学年）、押すと詳しく（緊急連絡先は押したときだけ）。
  クラスは追加・変更・使わないにできる（消さない）。規約は「改定する」→確かめ→公開で版が1つ上がり、保護者は次に開いたとき同意し直す。
  テスト：`roster_test.sql` 32件、ほかの SQL のテスト（314・55・45・21・22・15・37件）・取り込み 39件・line-auth 15件、すべて合格。
  画面は手元のブラウザで、データベースの代わりの部品をつないで確かめた（コミットしていない。1280・390・320px で横にはみ出さない）。
  `STAFF_SCREEN.md` の確かめ用 SQL は、前の工程のデータが残った状態から、名簿→クラスの追加→規約の改定→保護者の再同意→後片付けまで手元のDBで流して確かめた。
  次：`docs/STAFF_SCREEN.md`「会員名簿と設定」の確かめ方
### 表示までの秒数（工程4-1。`docs/PARENT_SCREEN.md` 4章で測る）

| 日付 | 回 | ストップウォッチ | メニューの秒数 | 端末・回線 |
|---|---|---|---|---|
| | 1 | | | |
| | 2 | | | |
| | 3 | | | |

