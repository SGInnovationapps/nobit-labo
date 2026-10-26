# バッチ12：デイリークエストのコイン、運営のコイン調整と操作履歴。
# nobit-batch12.zip をリポジトリのルートに展開したあと、リポジトリのルートで実行する。
#   powershell -ExecutionPolicy Bypass -File scripts\push-batch12.ps1
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)

# 前提：ドリルの運営側まで入っている
if (-not (Test-Path 'src\admin\StudentDrill.tsx')) {
  throw 'ドリルの運営側がまだ入っていません。先に nobit-drill-admin.zip を入れてください'
}
if (-not (Test-Path 'src\admin\CoinAdjust.tsx')) {
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

# 画面より先に DB を反映する（新しい画面がクエストと調整の関数を使うため）
supabase db push --include-all
if ($LASTEXITCODE -ne 0) { throw 'supabase db push が失敗しました' }

git add -A
git commit -m "バッチ12：デイリークエストのコイン（1つ3・全部達成で+5）、運営のコイン調整と操作履歴"
if ($LASTEXITCODE -ne 0) { throw 'コミットに失敗しました' }
git push origin main
if ($LASTEXITCODE -ne 0) { throw 'プッシュに失敗しました' }

Write-Host ''
Write-Host '完了しました。Cloudflare の公開を待って、次を確かめてください。'
Write-Host '  1. ホームのデイリークエストに「3コイン」と「全部達成のボーナス 5コイン」が出る。'
Write-Host '     記録すると「クエスト達成…＋3コイン」が出て、コインが増える。'
Write-Host '  2. ふりかえり（06）に「デイリークエスト」の欄が出て、達成した日が並ぶ。'
Write-Host '  3. 管理画面10（運営のみ）：コインの欄に「コインを調整する」が出る。'
Write-Host '     理由を書いて調整すると、下の操作履歴に残る。'
Write-Host ''
Write-Host 'なお、既存の生徒には、これまでの日のクエストのコインはさかのぼって付きません。'
Write-Host '今日からの記録で付きます。'
