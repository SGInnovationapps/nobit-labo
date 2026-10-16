# ドリルの問題文の下線（<u> … </u>）を、タグのままではなく線として出す。
# nobit-drill-underline.zip をリポジトリのルートに展開したあと、リポジトリのルートで実行する。
#   powershell -ExecutionPolicy Bypass -File scripts\push-drill-underline.ps1
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)

if (-not (Test-Path 'src\home\Marked.tsx')) {
  throw '展開できていません。ZIP をリポジトリのルートに展開し直してください'
}

npx tsc -p tsconfig.app.json --noEmit
if ($LASTEXITCODE -ne 0) { throw '型の検査が失敗しました' }
npx oxlint src test supabase/functions
if ($LASTEXITCODE -ne 0) { throw 'lint が失敗しました' }
node --experimental-strip-types --test test/*.test.ts
if ($LASTEXITCODE -ne 0) { throw 'テストが失敗しました' }
npm run build
if ($LASTEXITCODE -ne 0) { throw 'ビルドが失敗しました' }

# 画面だけの変更なので、DB の反映は要らない
git add -A
git commit -m "ドリル：問題文の下線部を、タグではなく線として出す"
if ($LASTEXITCODE -ne 0) { throw 'コミットに失敗しました' }
git push origin main
if ($LASTEXITCODE -ne 0) { throw 'プッシュに失敗しました' }

Write-Host ''
Write-Host '完了しました。Cloudflare の公開を待って、英語のドリルで下線が引かれることを確かめてください。'
Write-Host '（1,610問のうち499問に下線があります。すべて英語の「下線部の意味はどれか」です）'
