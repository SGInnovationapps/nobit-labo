#!/usr/bin/env bash
# マイグレーションを素の PostgreSQL に当て、受入テストのうち DB で確かめられる項目を流す。
# 使い方: PGHOST=localhost PGUSER=postgres PGPASSWORD=postgres bash scripts/test-db.sh
set -euo pipefail
cd "$(dirname "$0")/.."
DB="nobit_test_$$"
PSQL=(psql -v ON_ERROR_STOP=1 -q -X)
"${PSQL[@]}" -d postgres -c "create database $DB"
trap '"${PSQL[@]}" -d postgres -c "drop database if exists $DB" >/dev/null' EXIT
"${PSQL[@]}" -d "$DB" -f supabase/tests/local_stubs.sql
for f in supabase/migrations/*.sql; do
  echo "apply $(basename "$f")"
  "${PSQL[@]}" -d "$DB" -f "$f"
done
for t in supabase/tests/*_test.sql; do
  echo "test $(basename "$t")"
  "${PSQL[@]}" -d "$DB" -o /dev/null -f "$t" 2>&1 | sed -e "s/^psql:[^ ]* NOTICE:  //"
done
echo "DB tests passed"
