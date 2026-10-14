# NOBIT!（ノビット）

ジュニア体操クラブに通う中学生・高校生の学習記録 LINE ミニアプリと、その管理画面。運営ブランドは NOBIT! LABO（β版の間の運営は ACE LABO）。

正式な基準は「NOBIT! 基本仕様書」（https://claude.ai/code/artifact/d4dc8dcd-d7f8-4904-ae78-d5b9b2c73514）。仕様書と実装の対応は `docs/spec-v1.7-gap.md`。

## 構成

| 部分 | 場所 | 中身 |
|---|---|---|
| 生徒のミニアプリ | `src/`（`/`） | React + TypeScript + Vite。LIFF で LINE ログイン |
| 管理画面 | `src/admin/`（`/admin`） | 運営とクラブ管理者。メールリンクでログイン。生徒のミニアプリには読み込まない |
| DB | `supabase/migrations/` | Supabase（PostgreSQL）。RLS でクラブごとに分け、報酬はサーバー側の関数で処理する |
| Edge Function | `supabase/functions/` | `line-login`（LINE の ID トークン → セッション）、`line-webhook`（公式LINE の友だち状態）、`club-admin`（クラブ管理者の追加・解除）、`weekly-digest`（管理者への週1メール） |
| 公開 | `wrangler.toml` | Cloudflare Workers の静的アセット。main への push でビルドして公開。`public/_headers` でキャッシュ |
| 画面の確認用 | `harness/` | 画面の部品をダミーのデータで出す（`npx vite` → `/harness/admin.html#alertlist` など） |

## 手元で動かす

```sh
npm ci
npm run dev        # http://localhost:5173（生徒） / http://localhost:5173/admin（管理）
```

ビルドの変数（`.env.local`。ブラウザに渡してよい値だけ）：

| 名前 | 値 |
|---|---|
| `VITE_SUPABASE_URL` | Supabase の URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase の publishable key |
| `VITE_LIFF_ID` | ミニアプリの LIFF ID（開発用・審査用・本番用で異なる） |

Edge Function のシークレット（LINE のチャネルシークレットなど）は Supabase 側にだけ置き、リポジトリにもフロントにも置かない。一覧は `docs/beta-setup.md`。

## テスト

```sh
npx tsc -p tsconfig.app.json --noEmit                  # 型
npx oxlint src test supabase/functions                 # lint
node --experimental-strip-types --test test/*.test.ts  # 画面のロジック
for t in supabase/functions/*/handler.test.ts; do node --experimental-strip-types "$t"; done  # Edge Function
npm run build
```

DB のテスト（pgTAP、`supabase/tests/database/`）は Docker で Supabase を起動して流す。

```sh
npx supabase start
npx supabase test db
```

GitHub Actions（`.github/workflows/ci.yml`）が、main への PR と push で上のすべてを流す。

## 反映

- 画面：main に push すると Cloudflare がビルドして公開する
- DB：`supabase db push --include-all`
- Edge Function：`supabase functions deploy <名前>`（フラグは `docs/beta-setup.md`）

作業のまとまりごとに `scripts/push-*.ps1`（Windows の PowerShell、リポジトリのルートで実行）が、テスト → ビルド → DB の反映 → コミット → プッシュをまとめて行う。

## 運用

| 文書・スクリプト | 用途 |
|---|---|
| `docs/beta-setup.md` | β版の設定と確認の手順 |
| `docs/beta-guide.md` | 生徒・保護者・クラブ管理者への案内文 |
| `scripts/beta-metrics.sql` | 試験運用で見る数字（SQL Editor で実行） |
| `scripts/delete-student.sql` | 保護者の依頼で生徒の記録を削除する |
| `scripts/schedule-weekly-digest.sql` | 管理者への週1メールの定時実行を登録する |

画面で起きたエラーは `client_errors` に記録され、運営は管理画面の対応アラートの上で確かめられる。
