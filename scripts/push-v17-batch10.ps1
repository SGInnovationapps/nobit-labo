# v1.7 バッチ10：文面の差し込み、クラブ管理者の追加・解除、ふりかえりの推移とチケット、GitHub Actions。テスト → ビルド → 関数の反映 → コミット → プッシュ。リポジトリのルートで実行する
$ErrorActionPreference = 'Stop'
node --experimental-strip-types --test test/*.test.ts
if ($LASTEXITCODE -ne 0) { throw 'テストが失敗しました' }
npm run build
if ($LASTEXITCODE -ne 0) { throw 'ビルドが失敗しました' }
supabase functions deploy club-admin --no-verify-jwt
if ($LASTEXITCODE -ne 0) { throw 'club-admin の反映が失敗しました' }
git add -A
git commit -m "v1.7 バッチ10：文面の差し込み、クラブ管理者の追加・解除、ふりかえりの推移とチケット、GitHub Actions"
git push origin main
