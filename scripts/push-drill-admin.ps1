# ドリルの運営側：配信タスクとしてのドリル（画面11）、運営だけが見る成績（画面10）。
# あわせて、前回入りそこねたメインコピーの変更も入る。
# nobit-drill-admin.zip をリポジトリのルートに展開したあと、リポジトリのルートで実行する。
#   powershell -ExecutionPolicy Bypass -File scripts\push-drill-admin.ps1
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)

# 前提：ラボドリの統合が入っている
if (-not (Test-Path 'supabase\migrations\20261016160000_questions.sql')) {
  throw 'ラボドリの統合がまだ入っていません。先に nobit-drill.zip を入れてください'
}
if (-not (Test-Path 'src\admin\StudentDrill.tsx')) {
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

# 画面より先に DB を反映する（新しい画面がドリルの列と関数を使うため）
supabase db push --include-all
if ($LASTEXITCODE -ne 0) { throw 'supabase db push が失敗しました' }

git add -A
git commit -m "ドリルの配信タスクと、運営だけが見るドリルの成績。メインコピーの変更"
if ($LASTEXITCODE -ne 0) { throw 'コミットに失敗しました' }
git push origin main
if ($LASTEXITCODE -ne 0) { throw 'プッシュに失敗しました' }

Write-Host ''
Write-Host '完了しました。Cloudflare の公開を待って、次を確かめてください。'
Write-Host '  1. 管理画面11：教科に理科を選ぶと「ドリル（四択）のタスクにする」が出る。'
Write-Host '     単元を選んで配信すると、生徒のホームに「ドリル 10問」のボタンが出る。'
Write-Host '  2. そのボタンから解き終えると、タスクが完了になる（正解数は問わない）。'
Write-Host '  3. 管理画面10（運営のみ）：生徒の詳細に「ドリル」の欄が出て、'
Write-Host '     教科を押すと単元ごとの正解率とまちがえた問題が見える。'
Write-Host ''
Write-Host '公式LINE のステータスメッセージも「きょうのがんばりが、明日のキミを育てる」に変えてください（19文字）。'
