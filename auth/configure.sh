#!/usr/bin/env bash
# ============================================================
# Trägt die echten Adressen in die Realm-Definition ein.
#
# Nutzung:
#   ./auth/configure.sh https://lernen.example.com https://auth.example.com
#                       └─ Adresse der Lernplattform  └─ Adresse von Keycloak
#
# Ersetzt die Platzhalter für Redirect-URIs, Web-Origins und Post-Logout-URIs.
# Legt vorher eine Sicherungskopie an. Mehrfaches Ausführen ist unschädlich.
# ============================================================
set -euo pipefail

PLATFORM_URL="${1:-}"
KEYCLOAK_URL="${2:-}"
REALM_FILE="$(dirname "$0")/realm/serviceq-realm.json"

if [[ -z "$PLATFORM_URL" ]]; then
  echo "Fehler: Adresse der Lernplattform fehlt." >&2
  echo "Beispiel: ./auth/configure.sh https://lernen.example.com https://auth.example.com" >&2
  exit 1
fi

# Abschließenden Schrägstrich entfernen, damit keine doppelten entstehen
PLATFORM_URL="${PLATFORM_URL%/}"
KEYCLOAK_URL="${KEYCLOAK_URL%/}"

if [[ ! "$PLATFORM_URL" =~ ^https?:// ]]; then
  echo "Fehler: Die Adresse muss mit http:// oder https:// beginnen." >&2
  exit 1
fi
if [[ "$PLATFORM_URL" =~ ^http:// && ! "$PLATFORM_URL" =~ localhost ]]; then
  echo "Warnung: Ohne HTTPS lehnt Keycloak die Anmeldung im Produktivbetrieb ab." >&2
fi

# Host ohne Schema für die Web-Origins
PLATFORM_HOST="${PLATFORM_URL#*://}"

cp "$REALM_FILE" "$REALM_FILE.bak"

python3 - "$REALM_FILE" "$PLATFORM_URL" "$PLATFORM_HOST" <<'PY'
import json, sys
path, url, host = sys.argv[1], sys.argv[2], sys.argv[3]
data = json.load(open(path))

PLACEHOLDER = "REPLACE-WITH-NETLIFY-SITE.netlify.app"

def swap(value):
    """Platzhalter ersetzen; bereits gesetzte echte Adressen bleiben erhalten."""
    if isinstance(value, str):
        if PLACEHOLDER in value:
            return value.replace("https://" + PLACEHOLDER, url).replace(PLACEHOLDER, host)
        return value
    if isinstance(value, list):
        return [swap(v) for v in value]
    if isinstance(value, dict):
        return {k: swap(v) for k, v in value.items()}
    return value

for client in data.get("clients", []):
    if client.get("clientId") == "learning-platform":
        for key in ("redirectUris", "webOrigins", "postLogoutRedirectUris", "attributes"):
            if key in client:
                client[key] = swap(client[key])
        # Doppelte Einträge entfernen, Reihenfolge beibehalten
        for key in ("redirectUris", "webOrigins", "postLogoutRedirectUris"):
            if key in client:
                client[key] = list(dict.fromkeys(client[key]))

json.dump(data, open(path, "w"), indent=2, ensure_ascii=False)
open(path, "a").write("\n")

for client in data.get("clients", []):
    if client.get("clientId") == "learning-platform":
        print("Redirect-URIs:")
        for u in client.get("redirectUris", []):
            print("  -", u)
        print("Web-Origins:")
        for u in client.get("webOrigins", []):
            print("  -", u)
PY

echo
if grep -q "REPLACE-WITH-NETLIFY-SITE" "$REALM_FILE"; then
  echo "Achtung: Es sind noch Platzhalter übrig – bitte prüfen." >&2
  exit 1
fi
echo "Realm angepasst. Sicherungskopie: $(basename "$REALM_FILE").bak"

if [[ -n "$KEYCLOAK_URL" ]]; then
  echo
  echo "Für Netlify (Site configuration → Environment variables):"
  echo "  VITE_KEYCLOAK_URL=$KEYCLOAK_URL"
  echo "  VITE_KEYCLOAK_REALM=serviceq"
  echo "  VITE_KEYCLOAK_CLIENT_ID=learning-platform"
  echo "  KEYCLOAK_URL=$KEYCLOAK_URL"
  echo "  KEYCLOAK_REALM=serviceq"
  echo "  KEYCLOAK_BACKEND_CLIENT_ID=platform-backend"
  echo "  PLATFORM_URL=$PLATFORM_URL"
  echo "  (dazu KEYCLOAK_BACKEND_CLIENT_SECRET, SUPABASE_URL,"
  echo "   SUPABASE_SERVICE_ROLE_KEY und SUPABASE_JWT_SECRET)"
fi
