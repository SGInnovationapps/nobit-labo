# v1.7 バッチ5〜10 をまとめて反映する（累積版）。テスト → ビルド → DB 反映 → 関数の反映 → コミット → プッシュ。リポジトリのルートで実行する
$ErrorActionPreference = 'Stop'
node --experimental-strip-types --test test/*.test.ts
if ($LASTEXITCODE -ne 0) { throw 'テストが失敗しました' }
npm run build
if ($LASTEXITCODE -ne 0) { throw 'ビルドが失敗しました' }
supabase db push --include-all
if ($LASTEXITCODE -ne 0) { throw 'supabase db push が失敗しました' }
foreach ($fn in 'line-login', 'club-admin', 'weekly-digest') {
  $flag = if ($fn -eq 'line-login') { @() } else { @('--no-verify-jwt') }
  supabase functions deploy $fn @flag
  if ($LASTEXITCODE -ne 0) { throw "$fn の反映が失敗しました" }
}
git add -A
git commit -m "v1.7 バッチ5〜10：クラブ管理者の見える範囲、バッジ、導入の入口、複製と一括配信、週1メール、差し込み・管理者の追加解除・推移・CI"
git push origin main

