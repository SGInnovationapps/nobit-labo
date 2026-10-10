# v1.7 バッチ2〜4：テスト → ビルド → DB 反映 → Edge Function 反映 → コミット → プッシュ。リポジトリのルートで実行する
$ErrorActionPreference = 'Stop'
node --experimental-strip-types --test test/*.test.ts
if ($LASTEXITCODE -ne 0) { throw 'テストが失敗しました' }
npm run build
if ($LASTEXITCODE -ne 0) { throw 'ビルドが失敗しました' }
supabase db push
if ($LASTEXITCODE -ne 0) { throw 'supabase db push が失敗しました' }
supabase functions deploy line-login
if ($LASTEXITCODE -ne 0) { throw 'line-login の反映が失敗しました' }
git add -A
git commit -m "v1.7 バッチ2〜4：承認前の利用・一括承認・期間登録、アラートの1行化、見たよ・定型文、クエスト・休息チケット"
git push origin main
