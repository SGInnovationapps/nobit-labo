# ホームの復元：10/11 のホーム（教科を記録する・タスクを見るのボタン、今日の記録の2件表示、この7日間のグラフ）を戻す。
# バッチ5〜10 のコミットで前の版に戻っていたため。ZIP をリポジトリのルートに展開したあと、リポジトリのルートで実行する。
# テスト → ビルド → コミット → プッシュ（DB と Edge Function の変更はない）
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)

# 前提：β配布の準備（2）のコミット（e415177）の上で作業している
git merge-base --is-ancestor e415177 HEAD
if ($LASTEXITCODE -ne 0) { throw '前提のコミット e415177 がありません。git pull してから、もう一度 ZIP を展開してください' }

npx tsc -p tsconfig.app.json --noEmit
if ($LASTEXITCODE -ne 0) { throw '型の検査が失敗しました' }
npx oxlint src test supabase/functions
if ($LASTEXITCODE -ne 0) { throw 'lint が失敗しました' }
node --experimental-strip-types --test test/*.test.ts
if ($LASTEXITCODE -ne 0) { throw 'テストが失敗しました' }
npm run build
if ($LASTEXITCODE -ne 0) { throw 'ビルドが失敗しました' }

git add -A
git commit -m "ホームの復元：10/11 のホーム（ボタン2つ・今日の記録2件・この7日間）を、バッチ5〜10 で戻っていたところから当て直す"
if ($LASTEXITCODE -ne 0) { throw 'コミットに失敗しました' }
git push origin main
if ($LASTEXITCODE -ne 0) { throw 'プッシュに失敗しました' }
Write-Host '完了しました。Cloudflare の公開を待ってから、LINE でミニアプリを開き直してください。'
