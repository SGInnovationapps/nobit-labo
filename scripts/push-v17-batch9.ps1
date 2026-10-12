# v1.7 バッチ9：クラブ管理者への週1メール「今週の記録」。DB 反映 → 関数の反映 → コミット → プッシュ。リポジトリのルートで実行する
$ErrorActionPreference = 'Stop'
supabase db push
if ($LASTEXITCODE -ne 0) { throw 'supabase db push が失敗しました' }
supabase functions deploy weekly-digest --no-verify-jwt
if ($LASTEXITCODE -ne 0) { throw 'weekly-digest の反映が失敗しました' }
git add -A
git commit -m "v1.7 バッチ9：クラブ管理者への週1メール「今週の記録」"
git push origin main
