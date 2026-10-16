# ラボドリの統合（DB・生徒の画面・問題1,610問）を、まとめて本番に入れる。
# nobit-drill.zip をリポジトリのルートに展開したあと、リポジトリのルートで実行する。
#   powershell -ExecutionPolicy Bypass -File scripts\push-drill.ps1
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)

# 展開がうまくいったかの確かめ（1つでも欠けていたら、ここで止める）
$need = @(
  'supabase\migrations\20261016120000_drill_questions.sql',
  'supabase\migrations\20261016130000_drill_play.sql',
  'supabase\migrations\20261016160000_questions.sql',
  'supabase\tests\database\31_drill.test.sql',
  'supabase\tests\database\01_rls_enabled.test.sql',
  'src\home\Drill.tsx', 'src\home\DrillEntry.tsx', 'src\home\DrillPlay.tsx', 'src\home\DrillResult.tsx',
  'src\home\drillApi.ts', 'src\home\drillModel.ts',
  'test\drill.test.ts', 'test\questions.test.ts', 'scripts\questions-to-sql.mjs'
)
$missing = $need | Where-Object { -not (Test-Path $_) }
if ($missing) {
  throw "展開できていないファイルがあります。ZIP をリポジトリのルートに展開し直してください：`n  $($missing -join "`n  ")"
}

# 前提：β配布の準備の最後のコミットの上で作業している
git merge-base --is-ancestor 49c049f HEAD
if ($LASTEXITCODE -ne 0) { throw '前提のコミット 49c049f がありません。git pull してから、もう一度実行してください' }

npx tsc -p tsconfig.app.json --noEmit
if ($LASTEXITCODE -ne 0) { throw '型の検査が失敗しました' }
npx oxlint src test supabase/functions
if ($LASTEXITCODE -ne 0) { throw 'lint が失敗しました' }
node --experimental-strip-types --test test/*.test.ts
if ($LASTEXITCODE -ne 0) { throw 'テストが失敗しました' }
npm run build
if ($LASTEXITCODE -ne 0) { throw 'ビルドが失敗しました' }

# 画面より先に DB を入れる（新しい画面がドリルの関数を呼ぶため）
supabase db push --include-all
if ($LASTEXITCODE -ne 0) { throw 'supabase db push が失敗しました' }

git add -A
git commit -m "ラボドリの統合：問題バンク・出題と採点・生徒のドリル画面・問題1,610問"
if ($LASTEXITCODE -ne 0) { throw 'コミットに失敗しました' }
git push origin main
if ($LASTEXITCODE -ne 0) { throw 'プッシュに失敗しました' }

Write-Host ''
Write-Host '完了しました。Supabase の SQL Editor で、問題が入ったことを確かめてください。'
Write-Host '  select subject, grade, count(distinct category) as 単元, count(*) as 問題'
Write-Host '    from public.questions where active group by subject, grade order by subject, grade;'
Write-Host '  → 英語 320問 × 3学年、理科 115/123/115、社会 101/106/90（合計 1,610問）'
Write-Host ''
Write-Host 'Cloudflare の公開を待って、ホームの「ドリル（四択）」から10問を解き終え、'
Write-Host '今日の記録に教科が入ることを確かめてください。'
Write-Host ''
Write-Host '問題を直したときは、questions.json を直して次を実行し、もう一度 push します。'
Write-Host '  node scripts/questions-to-sql.mjs <questions.json のパス>'
