# v1.7 バッチ1：テスト → ビルド → DB 反映 → コミット → プッシュ。リポジトリのルートで実行する
$ErrorActionPreference = 'Stop'
if (Test-Path src/home/FreeTaskSheet.tsx) { Remove-Item src/home/FreeTaskSheet.tsx }
node --experimental-strip-types --test test/*.test.ts
if ($LASTEXITCODE -ne 0) { throw 'テストが失敗しました' }
npm run build
if ($LASTEXITCODE -ne 0) { throw 'ビルドが失敗しました' }
supabase db push
if ($LASTEXITCODE -ne 0) { throw 'supabase db push が失敗しました' }
git add -A
git commit -m "v1.7 バッチ1：記録の整理・報酬の3ルール・追加ガチャ"
git push origin main
