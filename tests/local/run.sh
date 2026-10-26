#!/usr/bin/env bash
# =============================================================================
# tests/local/run.sh
#
# 【何をするか】
#   手元の PostgreSQL に検証用のデータベースを作り直し、
#     1. Supabase の代役（supabase_stub.sql）
#     2. supabase/migrations/ の 001〜 を番号順に全部
#     3. RLS のテスト（tests/rls_test.sql）
#     4. LINEログインの登録処理のテスト（tests/auth_rpc_test.sql）
#     5. 入会申込のテスト（tests/apply_test.sql）
#     6. 予定・お知らせの既読のテスト（tests/schedule_test.sql）
#     7. 登録情報・規約の再同意のテスト（tests/profile_test.sql）
#     8. 職員のホームの「やること」のテスト（tests/staff_todo_test.sql）
#     9. 入会承認・紙の申込書からの登録のテスト（tests/admission_test.sql）
#    10. 会員名簿・会員規約の改定・クラスの設定のテスト（tests/roster_test.sql）
#    11. Edge Function line-auth の異常系テスト（tests/test-auth.js。Deno があるときだけ）
#   を流す。どこかで失敗したらそこで止まり、終了コードが 0 以外になる。
#
# 【使い方】（リポジトリのいちばん上のフォルダで）
#   bash tests/local/run.sh
#
# 【前提】
#   PostgreSQL 15 以上がインストールされ、psql で接続できること。
#   auth_rpc_test.sql は拡張機能 dblink を使う（PostgreSQL に同梱。contrib）。
#   test-auth.js は Deno で動く。Deno がなければ、その旨を出して飛ばす（全体は失敗にしない）。
#   deno が PATH にないときは、環境変数 DENO にその場所を入れる。
#   test-auth.js は外にはつながない（LINE と Supabase はモック）。権限なしで動かす。
#   接続先は環境変数 PGHOST / PGPORT / PGUSER で変えられる。
#   検証用DBの名前は clubena_test（毎回消して作り直す）。
# =============================================================================
set -euo pipefail

DB="${TEST_DB:-clubena_test}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PSQL=(psql -v ON_ERROR_STOP=1 -X -q)

echo "▶ 検証用データベース $DB を作り直します"
"${PSQL[@]}" -d postgres -c "drop database if exists $DB;"
"${PSQL[@]}" -d postgres -c "create database $DB;"

echo "▶ Supabase の代役を入れます"
"${PSQL[@]}" -d "$DB" -f "$ROOT/tests/local/supabase_stub.sql"

for f in "$ROOT"/supabase/migrations/[0-9][0-9][0-9]_*.sql; do
  echo "▶ $(basename "$f")"
  "${PSQL[@]}" -d "$DB" -f "$f"
done

if [ "${1:-}" != "--no-test" ]; then
  echo "▶ RLS テスト"
  "${PSQL[@]}" -d "$DB" -f "$ROOT/tests/rls_test.sql"
  echo "▶ LINEログインの登録処理のテスト"
  "${PSQL[@]}" -d "$DB" -f "$ROOT/tests/auth_rpc_test.sql"
  echo "▶ 入会申込のテスト"
  "${PSQL[@]}" -d "$DB" -f "$ROOT/tests/apply_test.sql"
  echo "▶ 予定・お知らせの既読のテスト"
  "${PSQL[@]}" -d "$DB" -f "$ROOT/tests/schedule_test.sql"
  echo "▶ 登録情報・規約の再同意のテスト"
  "${PSQL[@]}" -d "$DB" -f "$ROOT/tests/profile_test.sql"
  echo "▶ 職員のホームの「やること」のテスト"
  "${PSQL[@]}" -d "$DB" -f "$ROOT/tests/staff_todo_test.sql"
  echo "▶ 入会承認・紙の申込書からの登録のテスト"
  "${PSQL[@]}" -d "$DB" -f "$ROOT/tests/admission_test.sql"
  echo "▶ 会員名簿・会員規約の改定・クラスの設定のテスト"
  "${PSQL[@]}" -d "$DB" -f "$ROOT/tests/roster_test.sql"

  DENO_BIN="${DENO:-deno}"
  if command -v "$DENO_BIN" >/dev/null 2>&1; then
    echo "▶ Edge Function line-auth の異常系テスト"
    "$DENO_BIN" test --no-prompt "$ROOT/tests/test-auth.js"
  else
    echo "▷ Deno が見つからないので test-auth.js を飛ばします（https://deno.com から入れられます）"
  fi
fi

echo "✔ すべて通りました"
