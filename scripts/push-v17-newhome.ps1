# v1.7 新ホーム：テスト → ビルド → DB 反映 → Edge Function 反映 → コミット → プッシュ。リポジトリのルートで実行する
$ErrorActionPreference = 'Stop'
if (Test-Path src/home/Resume.tsx) { Remove-Item src/home/Resume.tsx }
if (Test-Path harness/shot_resume.mjs) { Remove-Item harness/shot_resume.mjs }
node --experimental-strip-types --test test/*.test.ts
if ($LASTEXITCODE -ne 0) { throw 'テストが失敗しました' }
npm run build
if ($LASTEXITCODE -ne 0) { throw 'ビルドが失敗しました' }
git add -A
git commit -m "v1.7 新ホーム：5状態の切り替え・今日の記録・再開の統合"
git push origin main
