#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:4000}"

ADMIN_TOKEN="${ADMIN_TOKEN:-}"
ES_TOKEN="${ES_TOKEN:-}"
AS_TOKEN="${AS_TOKEN:-}"

fail=0

check_code() {
  local label="$1"
  local expected="$2"
  local actual="$3"
  if [[ "$actual" == "$expected" ]]; then
    echo "[PASS] $label -> $actual"
  else
    echo "[FAIL] $label -> expected $expected, got $actual"
    fail=1
  fi
}

echo "Running auth smoke checks against: $BASE_URL"

code=$(curl -s -o /tmp/es_dispatch_smoke_1.json -w "%{http_code}" "$BASE_URL/users/me")
check_code "No token on /users/me" "401" "$code"

if [[ -n "$ADMIN_TOKEN" ]]; then
  code=$(curl -s -o /tmp/es_dispatch_smoke_2.json -w "%{http_code}" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    "$BASE_URL/users?page=1&limit=1")
  check_code "ADMIN on /users" "200" "$code"

  code=$(curl -s -o /tmp/es_dispatch_smoke_3.json -w "%{http_code}" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    "$BASE_URL/audit-log?page=1&limit=1")
  check_code "ADMIN on /audit-log" "200" "$code"
else
  echo "[SKIP] ADMIN checks (set ADMIN_TOKEN)"
fi

if [[ -n "$ES_TOKEN" ]]; then
  code=$(curl -s -o /tmp/es_dispatch_smoke_4.json -w "%{http_code}" \
    -H "Authorization: Bearer $ES_TOKEN" \
    "$BASE_URL/users?page=1&limit=1")
  check_code "ES denied on /users" "403" "$code"

  code=$(curl -s -o /tmp/es_dispatch_smoke_5.json -w "%{http_code}" \
    -H "Authorization: Bearer $ES_TOKEN" \
    "$BASE_URL/offers/my?page=1&limit=1")
  check_code "ES on /offers/my" "200" "$code"
else
  echo "[SKIP] ES checks (set ES_TOKEN)"
fi

if [[ -n "$AS_TOKEN" ]]; then
  code=$(curl -s -o /tmp/es_dispatch_smoke_6.json -w "%{http_code}" \
    -H "Authorization: Bearer $AS_TOKEN" \
    "$BASE_URL/enrollments/my/requests?page=1&limit=1")
  check_code "AS on /enrollments/my/requests" "200" "$code"

  code=$(curl -s -o /tmp/es_dispatch_smoke_7.json -w "%{http_code}" \
    -H "Authorization: Bearer $AS_TOKEN" \
    "$BASE_URL/offers/my?page=1&limit=1")
  check_code "AS denied on /offers/my" "403" "$code"
else
  echo "[SKIP] AS checks (set AS_TOKEN)"
fi

if [[ "$fail" -eq 1 ]]; then
  echo "Smoke checks failed."
  exit 1
fi

echo "Smoke checks complete."
