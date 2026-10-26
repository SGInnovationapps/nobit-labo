# バッチ13：週の学習目標（ごほうびのガチャ）とウィークリークエスト「同じ教科を週3日」。
# nobit-batch13.zip をリポジトリのルートに展開したあと、リポジトリのルートで実行する。
#   powershell -ExecutionPolicy Bypass -File scripts\push-batch13.ps1
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)

# 前提：バッチ12 まで入っている
if (-not (Test-Path 'supabase\migrations\20261026100000_admin_actions.sql')) {
  throw 'バッチ12 がまだ入っていません。先に nobit-batch12.zip を入れてください'
}
if (-not (Test-Path 'src\home\WeekGoalPanel.tsx')) {
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

# 画面より先に DB を反映する（新しい画面が my_week などを使うため）
# Supabase が一時的に 502 などを返したときは、30秒あけて2回までやり直す
$ok = $false
for ($i = 1; $i -le 3; $i++) {
  supabase db push --include-all
  if ($LASTEXITCODE -eq 0) { $ok = $true; break }
  if ($i -lt 3) { Write-Host "db push が失敗しました。30秒後にやり直します（$i/2）"; Start-Sleep -Seconds 30 }
}
if (-not $ok) { throw 'supabase db push が失敗しました。少し時間をおいて、このスクリプトをもう一度実行してください' }

git add -A
git commit -m "バッチ13：週の学習目標（3〜7日、達成でごほうびのガチャ1回）とウィークリークエスト（同じ教科を週3日・10コイン）"
if ($LASTEXITCODE -ne 0) { throw 'コミットに失敗しました' }
git push origin main
if ($LASTEXITCODE -ne 0) { throw 'プッシュに失敗しました' }

Write-Host ''
Write-Host '完了しました。Cloudflare の公開を待って、次を確かめてください。'
Write-Host '  1. ホームのデイリークエストの下に「今週の目標 0 / 5日」と「同じ教科を週3日 10コイン」が出る。'
Write-Host '     デイリークエストの行で「達成／未達成」が右端にそろう（次の行に落ちない）。'
Write-Host '  2. 「目標の日数を変える」で3〜7日を選べる。今週まだ記録がなければ今週から、あれば来週から変わる。'
Write-Host '  3. 目標の日数に届くと「週の目標を達成 ごほうびのガチャ1回」が出て、'
Write-Host '     「ごほうびのガチャを引く」からコレクションのガチャが開く（コインは減らない）。'
Write-Host '  4. ふりかえり（06）に「週の目標」の欄が出る。'
Write-Host ''
Write-Host 'なお、今週の目標は今日の記録から数え始めます。今週すでに記録した日も、次の記録のときに数に入ります。'
