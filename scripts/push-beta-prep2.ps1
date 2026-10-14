# β配布の準備（2）：画面のエラーの記録、ライブラリの分割、旧ファイルの整理、README、β版の設定の手順。
# ZIP をリポジトリのルートに展開したあと、リポジトリのルートで実行する。
# 削除 → テスト → ビルド → DB 反映 → 使っていない関数の削除 → コミット → プッシュ
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)

# 前提：β配布の準備（1）のコミット（23dbb58）の上で作業している
git merge-base --is-ancestor 23dbb58 HEAD
if ($LASTEXITCODE -ne 0) { throw '前提のコミット 23dbb58 がありません。git pull してから、もう一度 ZIP を展開してください' }

# 旧ファイルの削除（ZIP では消せないため、ここで消す）
git rm -r -q --ignore-unmatch web netlify.toml 'name = nobit-labo.txt' supabase/functions/auth-line docs/spec-mapping.md
if ($LASTEXITCODE -ne 0) { throw '旧ファイルの削除に失敗しました' }
if (Test-Path web) { Remove-Item web -Recurse -Force }
if (Test-Path supabase/functions/auth-line) { Remove-Item supabase/functions/auth-line -Recurse -Force }
# Supabase CLI が手元で作るファイルは、リポジトリから外す（手元には残るので、supabase link はそのまま）
git rm -r -q --cached --ignore-unmatch supabase/.temp
if ($LASTEXITCODE -ne 0) { throw 'supabase/.temp を外せませんでした' }

npx tsc -p tsconfig.app.json --noEmit
if ($LASTEXITCODE -ne 0) { throw '型の検査が失敗しました' }
npx oxlint src test supabase/functions
if ($LASTEXITCODE -ne 0) { throw 'lint が失敗しました' }
node --experimental-strip-types --test test/*.test.ts
if ($LASTEXITCODE -ne 0) { throw 'テストが失敗しました' }
foreach ($t in Get-ChildItem supabase/functions/*/handler.test.ts) {
  node --experimental-strip-types $t.FullName
  if ($LASTEXITCODE -ne 0) { throw "Edge Function のテストが失敗しました：$($t.FullName)" }
}
npm run build
if ($LASTEXITCODE -ne 0) { throw 'ビルドが失敗しました' }

# 画面より先に DB を反映する（新しい画面が log_client_error を呼ぶため）
supabase db push --include-all
if ($LASTEXITCODE -ne 0) { throw 'supabase db push が失敗しました' }

# 使っていない auth-line 関数を本番から消す（なければ飛ばす）
$ErrorActionPreference = 'Continue'
supabase functions delete auth-line
if ($LASTEXITCODE -ne 0) { Write-Host 'auth-line は本番になかったので、削除を飛ばしました' }
$ErrorActionPreference = 'Stop'

git add -A
git commit -m "β配布の準備（2）：画面のエラーの記録、ライブラリの分割、旧ファイルの整理、README、β版の設定の手順"
if ($LASTEXITCODE -ne 0) { throw 'コミットに失敗しました' }
git push origin main
if ($LASTEXITCODE -ne 0) { throw 'プッシュに失敗しました' }
Write-Host '完了しました。Cloudflare の公開を待ってから、管理画面の対応アラートの上に「画面のエラー」の行が出ることを確かめてください。'
