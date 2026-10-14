# β配布の準備：保護者同意 版3（運営 ACE LABO、連絡を止められること、記録の削除の依頼先）。テスト → ビルド → DB 反映 → コミット → プッシュ。リポジトリのルートで実行する
$ErrorActionPreference = 'Stop'
node --experimental-strip-types --test test/*.test.ts
if ($LASTEXITCODE -ne 0) { throw 'テストが失敗しました' }
npm run build
if ($LASTEXITCODE -ne 0) { throw 'ビルドが失敗しました' }
supabase db push --include-all
if ($LASTEXITCODE -ne 0) { throw 'supabase db push が失敗しました' }
git add -A
git commit -m "β配布の準備：保護者同意 版3（運営 ACE LABO）、記録の削除の手順、案内文"
git push origin main
