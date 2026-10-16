# β版の試験運用：設定と確認の手順

β版を生徒に配る前に、運営（本人）が上から順に済ませる。コードの作業はすべて済んでいて、ここに並ぶのは設定・実機での確認・運用の準備だけ。
［プロジェクトREF］は Supabase のプロジェクト（`supabase/config.toml` の production）、［クラブ名］［管理者名］は配るときの値に置き換える。

進め方の目安：1週目に A〜C と自分の端末での通し確認 → 2週目に1つのクラブで生徒2〜3人 → 3週目にそのクラブ全体。

## A. 本番の設定

### LINE ミニアプリ（LINE Developers）
- [ ] 本番に使うミニアプリのチャネル（Published）の LIFF ID を控える。エンドポイント URL は Cloudflare の公開先（`https://nobit-labo.gymspiral.workers.dev/`）
- [ ] Scope は `openid` と `profile`（表示名の初期値に LINE の名前を使う）
- [ ] ミニアプリのチャネルと公式LINE（Messaging API）のチャネルが、同じプロバイダーにあること（ユーザー ID がそろう前提）

### Cloudflare（Workers のビルド）
- [ ] ビルドの変数に `VITE_SUPABASE_URL`、`VITE_SUPABASE_PUBLISHABLE_KEY`、`VITE_LIFF_ID`（本番の LIFF ID）を入れる。ブラウザに渡してよい値だけを置く
- [ ] main への push で公開され、`/` と `/admin` の両方が開くこと

### Supabase
- [ ] マイグレーションの反映：`supabase db push --include-all`（push 用のスクリプトが行う）
- [ ] Edge Function の反映（4つ）
  - `supabase functions deploy line-login`
  - `supabase functions deploy club-admin --no-verify-jwt`
  - `supabase functions deploy line-webhook --no-verify-jwt`
  - `supabase functions deploy weekly-digest --no-verify-jwt`（週1メールを使うとき）
- [ ] シークレット（`supabase secrets set 名前=値`）
  | 名前 | 使う関数 | 値 |
  |---|---|---|
  | `LINE_CHANNEL_IDS` | line-login | ミニアプリのチャネル ID。Developing・Review・Published を使うならカンマ区切りで全部 |
  | `ALLOWED_ORIGINS` | line-login、club-admin | `https://nobit-labo.gymspiral.workers.dev`（手元で試すなら `,http://localhost:5173` を足す） |
  | `LINE_MESSAGING_CHANNEL_SECRET` | line-webhook | 公式LINE（Messaging API）のチャネルシークレット |
  | `RESEND_API_KEY`、`MAIL_FROM`、`ADMIN_URL`、`DIGEST_SECRET` | weekly-digest | 週1メール用（β後に回してよい） |
- [ ] 以前の `auth-line` 関数がダッシュボードに残っていたら削除する（push 用のスクリプトが削除を試みる。いまの画面は line-login だけを使う）
- [ ] 運営のアカウント（済んでいなければ）：管理画面でログインリンクを送って一度ログインし、SQL Editor で次を実行する
  `insert into public.users (id, role, display_name) select id, 'operator', '運営' from auth.users where email = '［運営のメール］' on conflict (id) do update set role = 'operator';`
- [ ] 定時のアラート生成（pg_cron）：Database > Extensions で pg_cron が有効で、`select jobname, schedule from cron.job;` に `nobit-generate-alerts` があること
- [ ] 週1メール（β後でよい）：Resend の送信元ドメインの認証、pg_net を有効にして `scripts/schedule-weekly-digest.sql` を1回実行

### 公式LINE（LINE Official Account Manager）
設定する文言（プロフィール・あいさつメッセージ）は `docs/beta-guide.md` の4章にある。

- [ ] Webhook の検証（済み）。応答設定で「チャット」をオン、「Webhook」もオン
- [ ] プロフィール：アカウント名・ステータスメッセージ・説明文・プロフィール画像
- [ ] あいさつメッセージ：3吹き出し。［ミニアプリのURL］を本番の値に置き換える（配信通数に数えない）
- [ ] リッチメニュー：ホーム・ふりかえり・コレクション・ミッションの4つの入口

### GitHub
- [ ] main への push で GitHub Actions（CI）が通ること（アプリの型・lint・テスト・ビルド、DB のマイグレーション・lint・pgTAP）

## B. 実機での通し確認

iPhone と Android の両方で、LINE から開く。日付をまたぐ確認があるので、数日に分けて行う。

- [ ] 導入：招待QR → 友だち追加 → ミニアプリ → LINE ログイン → 保護者同意（版 3）→ 学年 → 表示名 → 承認待ち → 管理画面で承認
- [ ] 承認待ちの間も記録でき、承認したあとにクラブ管理者に見えるようになる
- [ ] 記録：タスクの完了、教科の記録、タイマー、15分集中（途中で終える／達成する）、ガチャ（無料・追加）、休息チケット（その日・さかのぼり）
- [ ] JST 24:00 をまたいで、連続日数・今日の記録・ガチャが切り替わる。途切れたあとに「再開」の状態が出る
- [ ] 表示の速さ：LINE で初めて開いたときと、2回目に開いたときの、ホームが出るまでの時間を測って控える（ライブラリは端末に残るので、2回目以降は速くなるはず）
- [ ] 管理画面：運営は PC で、対応アラート・コピーして連絡済み・取り消し・生徒の詳細。クラブ管理者はスマホで、今週の人数・「見たよ」・承認・大会日の登録
- [ ] 画面のエラー：対応アラートの上に「画面のエラー」の行が出ること。通し確認の途中で出たものは、ここで中身を確かめる
- [ ] 公式LINE をブロック → 管理画面に「ブロック中」が出る。ブロックを外すと戻る

## C. 運用の準備

- [ ] クラブを作り、クラブ管理者を追加し（画面14）、招待QRを印刷する
- [ ] 最初の4週間分の配信タスクを、くり返し（平日・毎週）で作る（画面11）。配信が途切れると生徒のホームが空になる
- [ ] 案内文と保護者向けの説明（`docs/beta-guide.md`）の［クラブ名］［管理者名］を置き換えて配る
- [ ] 記録の削除の予行：テスト用の生徒で `scripts/delete-student.sql` を最後まで流す
- [ ] 毎日の運用：対応アラートを見て、公式LINE のチャットから送り、「コピーして連絡済み」（1日15〜30分の見込み、手で送る目安は1日20件）
- [ ] 毎週の確認：`scripts/beta-metrics.sql` で、記録した生徒の割合・週の学習日数・タイマーの利用・連絡後の再開率・画面のエラーを見る

## 預かる情報について（画面のエラーの記録）

画面のエラーの記録では、エラーの文面、発生した画面のパス、端末の種類（OS と LINE の版）、アプリの版を、本人のアカウントと結びつけて30日間（ログイン前の分は7日間）保存する。読めるのは運営だけ。トークンらしい長い英数字とメールアドレスは伏せ、URL の ? と # 以降は送らない。

同意の版 3 の「使いみち」にある「サービスをよくすること」の範囲と考えているが、「預かる情報」には端末の種類を挙げていない。運営の者が変わるとき（版 4）に、「アプリの不具合の記録（端末の種類を含む）」を預かる情報に加える。
