#!/usr/bin/env bash
# ============================================================
# Trägt die echten Adressen in die Realm-Definition ein.
#
# Nutzung:
#   ./auth/configure.sh https://lernen.example.com https://auth.example.com
#                       └─ Adresse der Lernplattform  └─ Adresse von Keycloak
#
# Optional als dritter Parameter ein Ausgabepfad. Dann bleibt die Quelldatei
# unangetastet und das Ergebnis wird dorthin geschrieben (nutzt hetzner-setup.sh).
#
# Optional per Umgebungsvariable: wenn SMTP_HOST gesetzt ist, wird zusätzlich der
# SMTP-Block ersetzt (sonst bleibt der Entwicklungs-Standard mailpit stehen):
#   SMTP_HOST SMTP_PORT SMTP_FROM SMTP_FROM_DISPLAY SMTP_REPLY_TO
#   SMTP_USER SMTP_PASSWORD SMTP_STARTTLS SMTP_SSL
#
# Ersetzt die Platzhalter für Redirect-URIs, Web-Origins und Post-Logout-URIs.
# Mehrfaches Ausführen ist unschädlich.
# ============================================================
set -euo pipefail

PLATFORM_URL="${1:-}"
KEYCLOAK_URL="${2:-}"
OUT_FILE="${3:-}"
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

if [[ -n "$OUT_FILE" ]]; then
  TARGET="$OUT_FILE"
  mkdir -p "$(dirname "$TARGET")"
else
  TARGET="$REALM_FILE"
  cp "$REALM_FILE" "$REALM_FILE.bak"
fi

# Host ohne Schema für die Web-Origins
PLATFORM_HOST="${PLATFORM_URL#*://}"

python3 - "$REALM_FILE" "$TARGET" "$PLATFORM_URL" "$PLATFORM_HOST" <<'PY'
import json, os, sys
src, dest, url, host = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
data = json.load(open(src))

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

# SMTP nur anfassen, wenn ein echter Host vorgegeben wurde
smtp_host = os.environ.get("SMTP_HOST", "").strip()
if smtp_host:
    smtp = dict(data.get("smtpServer", {}))
    sender = os.environ.get("SMTP_FROM", "").strip() or smtp.get("from", "")
    smtp["host"] = smtp_host
    smtp["port"] = os.environ.get("SMTP_PORT", "").strip() or "587"
    smtp["from"] = sender
    smtp["envelopeFrom"] = sender
    smtp["fromDisplayName"] = (
        os.environ.get("SMTP_FROM_DISPLAY", "").strip() or smtp.get("fromDisplayName", "")
    )
    # Ohne eigene Antwortadresse auf den Absender zurückfallen – sonst bliebe
    # die Beispieldomain aus der Vorlage stehen und Antworten laufen ins Leere.
    smtp["replyTo"] = os.environ.get("SMTP_REPLY_TO", "").strip() or sender
    smtp["starttls"] = os.environ.get("SMTP_STARTTLS", "true").strip().lower()
    smtp["ssl"] = os.environ.get("SMTP_SSL", "false").strip().lower()

    user = os.environ.get("SMTP_USER", "").strip()
    password = os.environ.get("SMTP_PASSWORD", "")
    if user:
        smtp["auth"] = "true"
        smtp["user"] = user
        smtp["password"] = password
    else:
        smtp["auth"] = "false"
        smtp.pop("user", None)
        smtp.pop("password", None)
    data["smtpServer"] = smtp

with open(dest, "w") as fh:
    json.dump(data, fh, indent=2, ensure_ascii=False)
    fh.write("\n")

for client in data.get("clients", []):
    if client.get("clientId") == "learning-platform":
        print("Redirect-URIs:")
        for u in client.get("redirectUris", []):
            print("  -", u)
        print("Web-Origins:")
        for u in client.get("webOrigins", []):
            print("  -", u)
if smtp_host:
    s = data["smtpServer"]
    print(f"SMTP: {s['host']}:{s['port']}, Absender {s['from']}, "
          f"Auth {'ja' if s.get('auth') == 'true' else 'nein'}, StartTLS {s['starttls']}")
PY

echo
if grep -q "REPLACE-WITH-NETLIFY-SITE" "$TARGET"; then
  echo "Achtung: Es sind noch Platzhalter übrig – bitte prüfen." >&2
  exit 1
fi

if [[ -n "$OUT_FILE" ]]; then
  # Die Datei kann ein SMTP-Passwort enthalten – nur für den Eigentümer lesbar.
  chmod 600 "$TARGET"
  echo "Realm geschrieben nach: $TARGET (Quelldatei unverändert)"
else
  echo "Realm angepasst. Sicherungskopie: $(basename "$REALM_FILE").bak"
fi

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
