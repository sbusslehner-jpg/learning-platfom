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
#
# NUR mit Ausgabepfad (also für die erzeugte Produktionsdatei) wirken zusätzlich:
#   PLATFORM_BACKEND_SECRET   echtes Secret des Clients `platform-backend`
#   PLATFORM_ADMIN_EMAIL      Anmeldung des mitgelieferten Administrators
#   PLATFORM_ADMIN_PASSWORD   dessen Startpasswort (muss sofort geändert werden)
#   KEEP_LOCALHOST_REDIRECTS=1  localhost-Redirects stehen lassen (Standard: entfernen)
# Diese Werte werden bewusst NIE in die Quelldatei geschrieben – die liegt im
# Repository. Die erzeugte Datei enthält Geheimnisse und bekommt Rechte 600.
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
  GENERATED=1
  mkdir -p "$(dirname "$TARGET")"
  # Die Datei entsteht mit 600, bevor irgendetwas hineingeschrieben wird –
  # sonst stünde ein Secret kurzzeitig für alle lesbar im Dateisystem.
  umask 077
else
  TARGET="$REALM_FILE"
  GENERATED=0
  cp "$REALM_FILE" "$REALM_FILE.bak"
  for var in PLATFORM_BACKEND_SECRET PLATFORM_ADMIN_EMAIL PLATFORM_ADMIN_PASSWORD; do
    if [[ -n "${!var:-}" ]]; then
      echo "Hinweis: $var wird ignoriert – Geheimnisse werden nie in die Quelldatei" >&2
      echo "         geschrieben. Dafür einen Ausgabepfad als 3. Parameter angeben." >&2
      break
    fi
  done
fi

# Host ohne Schema für die Web-Origins
PLATFORM_HOST="${PLATFORM_URL#*://}"

python3 - "$REALM_FILE" "$TARGET" "$PLATFORM_URL" "$PLATFORM_HOST" "$GENERATED" <<'PY'
import json, os, re, sys
src, dest, url, host = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
generated = sys.argv[5] == "1"
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

# ── Nur für die erzeugte Produktionsdatei ───────────────────────────────────
notes = []
if generated:
    # 1. Entwicklungs-Redirects entfernen. Ein öffentlicher Client mit
    #    localhost-Redirect ist im Produktivrealm überflüssig; jede
    #    zusätzlich erlaubte Zieladresse vergrößert nur die Angriffsfläche.
    if os.environ.get("KEEP_LOCALHOST_REDIRECTS", "").strip() != "1":
        def is_local(value):
            return "localhost" in value or "127.0.0.1" in value or "[::1]" in value

        for client in data.get("clients", []):
            if client.get("clientId") != "learning-platform":
                continue
            removed = 0
            for key in ("redirectUris", "webOrigins", "postLogoutRedirectUris"):
                kept = [u for u in client.get(key, []) if not is_local(u)]
                removed += len(client.get(key, [])) - len(kept)
                if not kept:
                    # Ohne Redirect-URI wäre der Client unbrauchbar – dann
                    # lieber alles stehen lassen und laut werden.
                    raise SystemExit(
                        f"Fehler: nach dem Entfernen der localhost-Eintraege bliebe "
                        f"'{key}' leer. Stimmt die Plattform-Adresse ({url})?"
                    )
                client[key] = kept
            attrs = client.get("attributes", {})
            raw = attrs.get("post.logout.redirect.uris", "")
            if raw:
                # Keycloak trennt diese Liste mit `##`
                attrs["post.logout.redirect.uris"] = "##".join(
                    p for p in raw.split("##") if p and not is_local(p)
                )
            if removed:
                notes.append(f"{removed} localhost-Eintraege entfernt (Produktionsrealm)")

    # 2. Client-Secret des Backends fest eintragen.
    #    Bewusst NICHT auf Keycloaks Platzhalter-Ersetzung im Import
    #    verlassen: sie greift nur bei bestimmten Schreibweisen, und ein
    #    nicht ersetzter Platzhalter wird stillschweigend als Secret
    #    uebernommen. Der Fehler faellt dann erst bei der ersten Einladung
    #    auf ("Service-Account konnte sich nicht anmelden").
    secret = os.environ.get("PLATFORM_BACKEND_SECRET", "").strip()
    if secret:
        for client in data.get("clients", []):
            if client.get("clientId") == "platform-backend":
                client["secret"] = secret
                notes.append("Backend-Secret eingetragen")

    # 3. Administrator-Konto: echte Adresse und zufaelliges Startpasswort.
    #    Die Quelldatei liegt im Repository – ein dort stehendes Passwort
    #    waere ab dem Import oeffentlich bekannt.
    admin_email = os.environ.get("PLATFORM_ADMIN_EMAIL", "").strip().lower()
    admin_password = os.environ.get("PLATFORM_ADMIN_PASSWORD", "")
    for user in data.get("users", []):
        if "admin" not in (user.get("realmRoles") or []):
            continue
        if admin_email:
            user["username"] = admin_email
            user["email"] = admin_email
            notes.append(f"Administrator: {admin_email}")
        if admin_password:
            user["credentials"] = [
                {"type": "password", "value": admin_password, "temporary": True}
            ]
            notes.append("Startpasswort eingetragen")

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

# Kein `${...}` darf in der Produktionsdatei überleben. Keycloak importiert
# solche Werte sonst wörtlich – aus einem Secret wird dann die Zeichenkette
# "${PLATFORM_BACKEND_SECRET}", und die stimmt mit nichts überein.
if generated:
    leftovers = sorted(set(re.findall(r"\$\{([A-Za-z_][A-Za-z0-9_]*)\}", json.dumps(data))))
    if leftovers:
        raise SystemExit(
            "Fehler: unaufgeloeste Platzhalter in der erzeugten Realm-Datei: "
            + ", ".join(leftovers)
            + "\n       Die passende Umgebungsvariable setzen und erneut ausfuehren."
        )

with open(dest, "w") as fh:
    json.dump(data, fh, indent=2, ensure_ascii=False)
    fh.write("\n")

for note in notes:
    print("  •", note)

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
  # Die Datei enthält Secret und SMTP-Passwort, darf also nicht für alle lesbar
  # sein. `600` ist aber zu streng: Der Keycloak-Container läuft als
  # uid=1000, gid=0 und bekäme beim Import eine AccessDeniedException –
  # der Container startet dann in einer Endlosschleife neu.
  # `640` mit Eigentümer root gibt der Gruppe root (gid 0) Leserecht, und
  # genau die hat der Container. Für alle anderen bleibt die Datei zu.
  chmod 640 "$TARGET"
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
