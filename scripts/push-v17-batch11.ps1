# v1.7 バッチ11：公式LINE の準備（友だち状態の Webhook、連絡の受け取り設定、ブロック中の表示）。テスト → ビルド → DB 反映 → 関数の反映 → コミット → プッシュ。リポジトリのルートで実行する
$ErrorActionPreference = 'Stop'
node --experimental-strip-types --test test/*.test.ts
if ($LASTEXITCODE -ne 0) { throw 'テストが失敗しました' }
npm run build
if ($LASTEXITCODE -ne 0) { throw 'ビルドが失敗しました' }
supabase db push --include-all
if ($LASTEXITCODE -ne 0) { throw 'supabase db push が失敗しました' }
supabase functions deploy line-webhook --no-verify-jwt
if ($LASTEXITCODE -ne 0) { throw 'line-webhook の反映が失敗しました' }
git add -A
git commit -m "v1.7 バッチ11：公式LINE の友だち状態、連絡の受け取り設定、ブロック中の表示"
git push origin main
