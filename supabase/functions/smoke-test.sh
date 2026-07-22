#!/usr/bin/env bash
# ============================================================
# End-to-End Smoke-Test des ServiceQ→GITacademy SSO-Handshakes
# gegen die DEPLOYTEN Supabase Edge Functions.
#
# Voraussetzung: 0001/0002/0003 + serviceq-sso-config.sql eingespielt,
# Functions deployt mit --no-verify-jwt (siehe docs/serviceq-academy/03-…).
#
# Nutzung:
#   FUNCTIONS_BASE="https://<ref>.functions.supabase.co" \
#   SECRET="serviceq-demo-secret-bitte-aendern" \
#   bash supabase/functions/smoke-test.sh
#
# ⚠️  Dieses Skript wurde in der Entwicklungsumgebung NICHT ausgeführt
#     (keine deployten Functions vorhanden). Es ist für den Lauf gegen
#     eine echte Supabase-Umgebung gedacht.
# ============================================================
set -euo pipefail

BASE="${FUNCTIONS_BASE:?FUNCTIONS_BASE fehlt}"
SECRET="${SECRET:?SECRET fehlt}"
JAR="$(mktemp)"
pass=0; fail=0
ok(){ echo "  ✅ $1"; pass=$((pass+1)); }
no(){ echo "  ❌ $1"; fail=$((fail+1)); }

echo "1) Launch-Ticket erstellen"
REQ='{"issuer":"serviceq","subject":"u-smoke-001","tenant":"PHS_AT","market":"AT","locale":"de-AT","roles":["service_advisor"],"target":{"type":"training","id":"dsr-konfiguration-einzelhandel"}}'
RESP="$(curl -s -X POST "$BASE/academy-launch-ticket" \
  -H "Authorization: Bearer $SECRET" -H "X-Client-Id: serviceq-demo" \
  -H "Idempotency-Key: $(date +%s)-$RANDOM" -H "Content-Type: application/json" -d "$REQ")"
CODE="$(printf '%s' "$RESP" | sed -n 's/.*consume?code=\([^"]*\)".*/\1/p')"
[ -n "$CODE" ] && ok "Ticket erhalten (Code ${#CODE} Zeichen)" || { no "kein Code: $RESP"; exit 1; }

echo "2) Ticket einlösen (Consume) → Session-Cookie erwartet"
HDRS="$(curl -s -i -c "$JAR" "$BASE/academy-consume?code=$CODE")"
echo "$HDRS" | grep -qiE "^HTTP/.* 303" && ok "303 See Other" || no "kein 303"
echo "$HDRS" | grep -qi "set-cookie: __Host-ga_session" && ok "Session-Cookie gesetzt" || no "kein Session-Cookie"

echo "3) Replay: dasselbe Ticket erneut einlösen → KEINE zweite Session"
R2="$(curl -s -i "$BASE/academy-consume?code=$CODE")"
echo "$R2" | grep -qi "set-cookie: __Host-ga_session" && no "Replay erzeugte Session!" || ok "Replay abgewiesen (keine Session)"

echo "4) Sessionstatus mit Cookie"
ST="$(curl -s -b "$JAR" "$BASE/academy-session/status")"
printf '%s' "$ST" | grep -q '"authenticated":true' && ok "authenticated:true" || no "Status: $ST"

echo "5) Session verlängern (CSRF Double-Submit)"
CSRF="$(awk '/__Host-ga_csrf/{print $7}' "$JAR" | tail -1)"
EX="$(curl -s -b "$JAR" -X POST "$BASE/academy-session/extend" -H "X-CSRF-Token: $CSRF")"
printf '%s' "$EX" | grep -q '"status":"extended"' && ok "verlängert" || no "Extend: $EX"

echo "6) Logout → Session serverseitig invalidiert"
curl -s -b "$JAR" -X POST "$BASE/academy-session/logout" -H "X-CSRF-Token: $CSRF" >/dev/null
ST2="$(curl -s -o /dev/null -w '%{http_code}' -b "$JAR" "$BASE/academy-session/status")"
[ "$ST2" = "401" ] && ok "Status nach Logout: 401" || no "erwartet 401, war $ST2"

echo ""
echo "Ergebnis: $pass bestanden, $fail fehlgeschlagen"
rm -f "$JAR"
[ "$fail" -eq 0 ]
