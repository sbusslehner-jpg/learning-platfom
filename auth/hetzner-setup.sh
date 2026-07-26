#!/usr/bin/env bash
# ============================================================
# Richtet den Keycloak-Stack auf einem frischen Ubuntu-/Debian-Server ein
# (Hetzner Cloud, aber genauso auf jedem anderen Root-Server).
#
# Ausführen AUF DEM SERVER, als root:
#
#   ./auth/hetzner-setup.sh auth.deine-domain.de mail@deine-domain.de \
#                           https://deine-site.netlify.app [admin@deine-domain.de]
#
# Der vierte Parameter ist die Anmeldung des Plattform-Administrators.
# Ohne Angabe wird die E-Mail aus Parameter 2 verwendet. Das Startpasswort
# wird zufällig erzeugt und am Ende einmalig angezeigt.
#
# Voraussetzung: Ein A-Record für die Keycloak-Domain zeigt bereits auf die
# IP-Adresse dieses Servers. Ohne das kann Let's Encrypt kein Zertifikat
# ausstellen (Caddy versucht es danach automatisch weiter).
#
# Das Skript ist mehrfach ausführbar. Bereits erzeugte Passwörter in
# auth/.env bleiben erhalten; ohne Parameter nutzt es die Werte von zuvor.
#
# Schalter:
#   SKIP_HARDENING=1   überspringt Backup-Aufgabe und automatische Updates
# ============================================================
set -euo pipefail

AUTH_DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="$AUTH_DIR/.env"
COMPOSE_FILE="$AUTH_DIR/docker-compose.prod.yml"

# Bricht das Schreiben der .env ab, bleibt keine halbe Datei zurück
trap 'rm -f "$ENV_FILE.tmp"' EXIT

info()  { printf '\n\033[1;36m▸ %s\033[0m\n' "$*"; }
warn()  { printf '\033[1;33m! %s\033[0m\n' "$*" >&2; }
die()   { printf '\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

# .env einlesen, ohne den Inhalt als Shell-Code auszuführen. `source` würde an
# Werten mit Leerzeichen (SMTP_FROM_DISPLAY=GroupIT Lernplattform) oder mit `$`
# im Passwort scheitern bzw. sie stillschweigend verändern.
load_env() {
  local file="$1" line key value
  [[ -f "$file" ]] || return 0
  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line#"${line%%[![:space:]]*}"}"            # führende Leerzeichen weg
    [[ -z "$line" || "$line" == \#* || "$line" != *=* ]] && continue
    key="${line%%=*}"
    value="${line#*=}"
    key="${key#export }"
    key="${key%"${key##*[![:space:]]}"}"               # Leerzeichen vor dem =
    [[ "$key" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || continue
    value="${value#"${value%%[![:space:]]*}"}"
    value="${value%"${value##*[![:space:]]}"}"
    # Umschließende Anführungszeichen entfernen, Inhalt unverändert lassen
    if [[ ${#value} -ge 2 && "${value:0:1}" == "'" && "${value: -1}" == "'" ]]; then
      value="${value:1:${#value}-2}"
    elif [[ ${#value} -ge 2 && "${value:0:1}" == '"' && "${value: -1}" == '"' ]]; then
      value="${value:1:${#value}-2}"
    fi
    printf -v "$key" '%s' "$value"
    export "$key"
  done < "$file"
}

# Zeile für die .env erzeugen. Einfache Anführungszeichen, damit weder die Shell
# noch Docker Compose etwas im Wert ersetzt – so bleiben Leerzeichen und `$` heil.
# Ein Hochkomma im Wert lässt sich im .env-Format von Docker Compose nicht
# darstellen (es kennt keine Maskierung innerhalb einfacher Anführungszeichen).
# Deshalb hier abbrechen statt den Wert stillschweigend zu verfälschen.
env_line() {
  if [[ "$2" == *"'"* ]]; then
    die "Der Wert von $1 enthält ein Hochkomma ( ' ). Docker Compose kann das in
  einer .env-Datei nicht abbilden. Bitte einen Wert ohne Hochkomma wählen – oder
  diese Einstellung in der Keycloak-Konsole unter Realm settings → Email pflegen."
  fi
  printf "%s='%s'\n" "$1" "$2"
}

# ---------- 0. Vorbedingungen ----------
[[ $EUID -eq 0 ]] || die "Bitte als root ausführen (oder mit sudo)."
command -v python3 >/dev/null || die "python3 wird gebraucht: apt-get install -y python3"

# Bereits gesetzte Werte übernehmen, damit ein zweiter Lauf ohne Parameter geht
load_env "$ENV_FILE"

KC_PUBLIC_HOST="${1:-${KC_PUBLIC_HOST:-}}"
ACME_EMAIL="${2:-${ACME_EMAIL:-}}"
PLATFORM_URL="${3:-${PLATFORM_URL:-}}"
PLATFORM_ADMIN_EMAIL="${4:-${PLATFORM_ADMIN_EMAIL:-$ACME_EMAIL}}"

if [[ -z "$KC_PUBLIC_HOST" || -z "$ACME_EMAIL" || -z "$PLATFORM_URL" ]]; then
  die "Aufruf: $0 <keycloak-domain> <e-mail-fuer-zertifikat> <adresse-der-lernplattform> [admin-e-mail]
Beispiel: $0 auth.deine-domain.de mail@deine-domain.de https://deine-site.netlify.app"
fi

# Schema abstreifen, falls jemand https:// vor die Domain schreibt
KC_PUBLIC_HOST="${KC_PUBLIC_HOST#http://}"
KC_PUBLIC_HOST="${KC_PUBLIC_HOST#https://}"
KC_PUBLIC_HOST="${KC_PUBLIC_HOST%/}"
PLATFORM_URL="${PLATFORM_URL%/}"

[[ "$KC_PUBLIC_HOST" == *.* ]] || die "Keine gültige Domain: $KC_PUBLIC_HOST"
[[ "$PLATFORM_URL" =~ ^https?:// ]] || die "Die Plattform-Adresse muss mit https:// beginnen."

# Der Administrator meldet sich damit an und bekommt darüber auch die
# Zurücksetzungs-Mails. Eine Fantasieadresse hier wäre später nur mühsam
# zu korrigieren, deshalb gleich prüfen.
PLATFORM_ADMIN_EMAIL="$(printf '%s' "$PLATFORM_ADMIN_EMAIL" | tr '[:upper:]' '[:lower:]')"
[[ "$PLATFORM_ADMIN_EMAIL" =~ ^[^[:space:]@]+@[^[:space:]@]+\.[A-Za-z]{2,}$ ]] \
  || die "Keine gültige Administrator-E-Mail: $PLATFORM_ADMIN_EMAIL"

# ---------- 1. Docker ----------
if command -v docker >/dev/null && docker compose version >/dev/null 2>&1; then
  info "Docker ist vorhanden ($(docker --version))"
else
  info "Docker wird installiert"
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq
  apt-get install -y -qq ca-certificates curl
  curl -fsSL https://get.docker.com | sh
  systemctl enable --now docker
fi

# ---------- 2. Firewall ----------
if command -v ufw >/dev/null; then
  info "Firewall wird eingerichtet (SSH, HTTP, HTTPS)"
  ufw allow OpenSSH  >/dev/null 2>&1 || ufw allow 22/tcp >/dev/null
  ufw allow 80/tcp   >/dev/null
  ufw allow 443/tcp  >/dev/null
  ufw --force enable >/dev/null
  echo "  offen: 22 (SSH), 80 (HTTP), 443 (HTTPS) – sonst nichts"
else
  warn "ufw nicht gefunden. Bitte in der Hetzner-Cloud-Firewall nur 22, 80 und 443 öffnen."
fi

# ---------- 3. Zugangsdaten ----------
# Ohne Pipe: `... | head -c 40` bricht den Lauf sonst gelegentlich ab, weil der
# vordere Prozess SIGPIPE bekommt und `pipefail` das als Fehler wertet.
newsecret() {
  if command -v openssl >/dev/null; then
    openssl rand -hex 24
  else
    python3 -c 'import secrets; print(secrets.token_hex(24))'
  fi
}

# Startpasswort des Plattform-Administrators. Anders als die Secrets oben muss
# es die Passwortrichtlinie des Realms erfüllen (12 Zeichen, Groß, Klein,
# Ziffer) – ein reiner Hex-String hätte keine Großbuchstaben. Verwechselbare
# Zeichen (0/O, 1/l/I) fehlen, weil das Passwort abgetippt wird.
newpassword() {
  python3 - <<'PY'
import secrets
lower  = "abcdefghijkmnopqrstuvwxyz"
upper  = "ABCDEFGHJKLMNPQRSTUVWXYZ"
digits = "23456789"
alphabet = lower + upper + digits
while True:
    pw = "".join(secrets.choice(alphabet) for _ in range(20))
    if any(c in lower for c in pw) and any(c in upper for c in pw) and any(c in digits for c in pw):
        print(pw)
        break
PY
}

KC_ADMIN="${KC_ADMIN:-kcadmin}"
KC_ADMIN_PASSWORD="${KC_ADMIN_PASSWORD:-}"
KC_DB_PASSWORD="${KC_DB_PASSWORD:-}"
PLATFORM_BACKEND_SECRET="${PLATFORM_BACKEND_SECRET:-}"
PLATFORM_ADMIN_PASSWORD="${PLATFORM_ADMIN_PASSWORD:-}"

# Platzhalter aus .env.example gelten als „nicht gesetzt"
for var in KC_ADMIN_PASSWORD KC_DB_PASSWORD PLATFORM_BACKEND_SECRET; do
  if [[ "${!var}" == bitte-* || -z "${!var}" ]]; then
    printf -v "$var" '%s' "$(newsecret)"
  fi
done
if [[ "$PLATFORM_ADMIN_PASSWORD" == bitte-* || -z "$PLATFORM_ADMIN_PASSWORD" ]]; then
  PLATFORM_ADMIN_PASSWORD="$(newpassword)"
fi

info "Zugangsdaten werden nach auth/.env geschrieben"
umask 077
{
  echo "# Erzeugt von hetzner-setup.sh – enthält Geheimnisse, nicht ins Repository!"
  echo "# Werte stehen in einfachen Anführungszeichen; so bleiben Leerzeichen und"
  echo "# Sonderzeichen wie \$ erhalten. Beim Bearbeiten bitte beibehalten."
  env_line KC_PUBLIC_HOST "$KC_PUBLIC_HOST"
  env_line ACME_EMAIL     "$ACME_EMAIL"
  env_line PLATFORM_URL   "$PLATFORM_URL"
  echo
  env_line KC_ADMIN                "$KC_ADMIN"
  env_line KC_ADMIN_PASSWORD       "$KC_ADMIN_PASSWORD"
  env_line KC_DB_PASSWORD          "$KC_DB_PASSWORD"
  env_line PLATFORM_BACKEND_SECRET "$PLATFORM_BACKEND_SECRET"
  echo
  echo "# Administrator der Lernplattform. Das Startpasswort wirkt nur beim"
  echo "# allerersten Import des Realms und muss bei der ersten Anmeldung"
  echo "# geändert werden. Danach ist der Wert hier nur noch Historie."
  env_line PLATFORM_ADMIN_EMAIL    "$PLATFORM_ADMIN_EMAIL"
  env_line PLATFORM_ADMIN_PASSWORD "$PLATFORM_ADMIN_PASSWORD"
  echo
  echo "# Echter SMTP-Versand. Ausfüllen und Skript erneut ausführen – wirkt aber nur,"
  echo "# solange der Realm noch nicht importiert wurde. Danach in der Keycloak-Konsole"
  echo "# unter Realm settings → Email pflegen."
  env_line SMTP_HOST         "${SMTP_HOST:-}"
  env_line SMTP_PORT         "${SMTP_PORT:-587}"
  env_line SMTP_FROM         "${SMTP_FROM:-noreply@$KC_PUBLIC_HOST}"
  env_line SMTP_FROM_DISPLAY "${SMTP_FROM_DISPLAY:-GroupIT Lernplattform}"
  env_line SMTP_USER         "${SMTP_USER:-}"
  env_line SMTP_PASSWORD     "${SMTP_PASSWORD:-}"
  env_line SMTP_STARTTLS     "${SMTP_STARTTLS:-true}"
  env_line SMTP_SSL          "${SMTP_SSL:-false}"
} > "$ENV_FILE.tmp"          # erst vollständig schreiben, dann ersetzen –
mv "$ENV_FILE.tmp" "$ENV_FILE"   # ein Abbruch lässt so keine halbe Datei zurück
chmod 600 "$ENV_FILE"

# ---------- 4. DNS prüfen ----------
info "DNS wird geprüft"
# Beide Abfragen dürfen fehlschlagen, ohne den Lauf zu beenden – ein fehlender
# DNS-Eintrag ist eine Warnung, kein Abbruchgrund. `|| true` ist wegen `pipefail`
# nötig: getent liefert bei unbekanntem Namen einen Fehlercode.
SERVER_IP="$(curl -fsS --max-time 5 https://api.ipify.org 2>/dev/null || hostname -I | awk '{print $1}' || true)"
DNS_IP="$(getent ahostsv4 "$KC_PUBLIC_HOST" 2>/dev/null | awk 'NR==1{print $1}' || true)"
if [[ -z "$DNS_IP" ]]; then
  warn "$KC_PUBLIC_HOST löst noch auf keine IP auf. A-Record anlegen, dann klappt das Zertifikat."
elif [[ "$DNS_IP" != "$SERVER_IP" ]]; then
  warn "$KC_PUBLIC_HOST zeigt auf $DNS_IP, dieser Server ist $SERVER_IP."
  warn "Caddy versucht die Zertifikatsausstellung automatisch weiter, sobald der Eintrag stimmt."
else
  echo "  $KC_PUBLIC_HOST → $SERVER_IP ✓"
fi

# ---------- 5. Realm vorbereiten ----------
info "Realm-Definition wird erzeugt (Adressen, Secret, Administrator, SMTP)"
load_env "$ENV_FILE"
# configure.sh trägt diese Werte fest in die erzeugte Datei ein. Sie stehen
# bewusst NICHT als ${...}-Platzhalter darin: Keycloak ersetzt die beim Import
# nicht zuverlässig und würde den Platzhalter wörtlich als Secret übernehmen.
export PLATFORM_BACKEND_SECRET PLATFORM_ADMIN_EMAIL PLATFORM_ADMIN_PASSWORD
"$AUTH_DIR/configure.sh" "$PLATFORM_URL" "https://$KC_PUBLIC_HOST" \
  "$AUTH_DIR/realm-generated/serviceq-realm.json"

if [[ -z "${SMTP_HOST:-}" ]]; then
  warn "Kein SMTP_HOST gesetzt – Keycloak kann noch keine Einladungen verschicken."
  warn "Später in auth/.env eintragen oder in der Konsole unter Realm settings → Email."
fi

# ---------- 6. Starten ----------
# Der Realm wird nur in eine leere Datenbank importiert. Ob dieser Lauf der
# erste ist, entscheidet sich also am Datenbank-Volume – und davon hängt ab,
# ob die eben erzeugten Zugangsdaten überhaupt wirksam werden.
if docker volume ls --format '{{.Name}}' 2>/dev/null | grep -q '_keycloak-db$'; then
  FIRST_IMPORT=0
else
  FIRST_IMPORT=1
fi

info "Stack wird gestartet"
cd "$AUTH_DIR"
docker compose -f "$COMPOSE_FILE" pull --quiet 2>/dev/null || true
docker compose -f "$COMPOSE_FILE" up -d

# ---------- 7. Auf Betriebsbereitschaft warten ----------
info "Warte auf Keycloak (der erste Start baut den Server, das dauert)"
for i in $(seq 1 60); do
  status="$(docker inspect --format '{{.State.Health.Status}}' sq-keycloak 2>/dev/null || echo unknown)"
  if [[ "$status" == "healthy" ]]; then
    echo "  bereit nach ca. $((i * 5)) Sekunden"
    break
  fi
  if [[ "$status" == "unknown" ]]; then
    die "Container sq-keycloak läuft nicht. Log ansehen: docker compose -f $COMPOSE_FILE logs keycloak"
  fi
  printf '.'
  sleep 5
done
echo
if [[ "$(docker inspect --format '{{.State.Health.Status}}' sq-keycloak 2>/dev/null)" != "healthy" ]]; then
  warn "Keycloak meldet keine Bereitschaft."
  restarts="$(docker inspect --format '{{.RestartCount}}' sq-keycloak 2>/dev/null || echo '?')"
  if [[ "$restarts" != "0" && "$restarts" != "?" ]]; then
    warn "Der Container ist bereits $restarts mal neu gestartet – er kommt nicht hoch."
  fi
  # Die eigentliche Ursache steht im Container-Log, nicht in der Statusmeldung.
  # Sie hier gleich mitzuliefern spart die Suche.
  echo >&2
  echo "  ── letzte Fehlermeldungen aus dem Container ──" >&2
  docker logs --tail 200 sq-keycloak 2>&1 \
    | grep -iE "ERROR|Caused by|Exception" | tail -6 | sed 's/^/  /' >&2
  echo >&2
  case "$(docker logs --tail 200 sq-keycloak 2>&1)" in
    *AccessDenied*|*Permission\ denied*)
      warn "Das sieht nach fehlenden Leserechten auf einer eingebundenen Datei aus."
      warn "  Prüfen:  ls -l $AUTH_DIR/realm-generated/serviceq-realm.json"
      warn "  Der Container liest als uid=1000, gid=0 – die Datei braucht 640 mit Gruppe root."
      ;;
    *"Failed to run import"*)
      warn "Der Realm-Import ist gescheitert. Vollständige Meldung mit:"
      warn "  docker compose -f $COMPOSE_FILE run --rm -T --no-deps keycloak start --import-realm --verbose"
      ;;
  esac
  warn "Vollständiges Log:  docker compose -f $COMPOSE_FILE logs -f keycloak"
  exit 1
fi

# ---------- 8. Selbsttest ----------
# Prüft, was sonst erst bei der ersten echten Einladung auffiele: existiert der
# Realm, und passt das Secret in Keycloak zu dem Wert, den wir gleich für
# Netlify ausgeben? Die Anfragen laufen über `--resolve` direkt auf diesen
# Server, damit der Test nicht an noch nicht verbreitetem DNS scheitert;
# `-k` lässt ein noch fehlendes Zertifikat durchgehen. Beides wird
# anschließend getrennt geprüft.
SELFTEST_FAILED=0
info "Selbsttest"

# Ein Syntaxfehler in der Caddyfile lässt den Container sofort wieder
# aussteigen. Ohne diese Prüfung fiele das erst auf, wenn niemand die
# Anmeldeseite erreicht.
caddy_status="$(docker inspect -f '{{.State.Status}}' sq-caddy 2>/dev/null || echo unbekannt)"
if [[ "$caddy_status" == "running" ]]; then
  echo "  Caddy läuft ✓"
else
  SELFTEST_FAILED=1
  warn "Caddy läuft nicht (Status: $caddy_status) – meist ein Fehler in auth/Caddyfile."
  warn "  Prüfen: docker compose -f $COMPOSE_FILE logs caddy"
fi

if ! command -v curl >/dev/null; then
  warn "curl nicht vorhanden – Selbsttest übersprungen."
else
  BASE="https://$KC_PUBLIC_HOST"
  CURL=(curl -sS --max-time 15 -k --resolve "$KC_PUBLIC_HOST:443:127.0.0.1")

  code="$("${CURL[@]}" -o /dev/null -w '%{http_code}' \
    "$BASE/realms/serviceq/.well-known/openid-configuration" 2>/dev/null || echo 000)"
  if [[ "$code" == "200" ]]; then
    echo "  Realm serviceq erreichbar ✓"
  else
    SELFTEST_FAILED=1
    warn "Realm serviceq antwortet nicht (HTTP $code)."
    warn "  Wurde er importiert? docker compose -f $COMPOSE_FILE logs keycloak | grep -i import"
  fi

  # client_credentials mit genau dem Secret, das gleich nach Netlify geht.
  token_response="$("${CURL[@]}" -X POST \
    "$BASE/realms/serviceq/protocol/openid-connect/token" \
    -d grant_type=client_credentials \
    -d client_id=platform-backend \
    --data-urlencode "client_secret=$PLATFORM_BACKEND_SECRET" 2>/dev/null || true)"
  if printf '%s' "$token_response" | grep -q '"access_token"'; then
    echo "  Backend-Client platform-backend meldet sich an ✓"
  else
    SELFTEST_FAILED=1
    warn "Backend-Client kann sich NICHT anmelden – Einladungen würden scheitern."
    if [[ "$FIRST_IMPORT" == "0" ]]; then
      warn "  Der Realm bestand schon vor diesem Lauf. Ein später geändertes Secret"
      warn "  wirkt nicht mehr über den Import: in der Keycloak-Konsole unter"
      warn "  Clients → platform-backend → Credentials das Secret dort auslesen"
      warn "  und in auth/.env sowie in Netlify eintragen."
    else
      warn "  Log ansehen: docker compose -f $COMPOSE_FILE logs keycloak"
    fi
  fi

  # Jetzt ohne --resolve und ohne -k: das prüft DNS und Zertifikat mit.
  if curl -sS --max-time 15 -o /dev/null "$BASE/realms/serviceq" 2>/dev/null; then
    echo "  HTTPS-Zertifikat und DNS in Ordnung ✓"
  else
    warn "Von außen noch nicht sauber erreichbar (DNS oder Zertifikat fehlt noch)."
    warn "  Caddy versucht es weiter. Prüfen: dig +short $KC_PUBLIC_HOST"
  fi
fi

# ---------- 9. Dauerbetrieb: Sicherung und Updates ----------
if [[ "${SKIP_HARDENING:-}" == "1" ]]; then
  info "Backup-Aufgabe und automatische Updates übersprungen (SKIP_HARDENING=1)"
else
  info "Tägliche Sicherung und automatische Sicherheitsupdates"

  chmod +x "$AUTH_DIR/backup.sh"
  # Eigene Datei unter /etc/cron.d statt `crontab -`: das ersetzt keine
  # bestehenden Aufgaben und ist bei jedem Lauf identisch reproduzierbar.
  cat > /etc/cron.d/keycloak-backup <<CRON
# Tägliche Sicherung der Keycloak-Datenbank (erzeugt von hetzner-setup.sh)
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
17 3 * * * root $AUTH_DIR/backup.sh >> /var/log/keycloak-backup.log 2>&1
CRON
  chmod 644 /etc/cron.d/keycloak-backup
  echo "  /etc/cron.d/keycloak-backup – täglich 03:17, 14 Sicherungen in /var/backups/keycloak"

  # Eine erste Sicherung sofort: eine Aufgabe, die erst in Wochen zum ersten
  # Mal läuft, ist genau dann kaputt, wenn man sie braucht.
  if "$AUTH_DIR/backup.sh" >/tmp/keycloak-backup-first.log 2>&1; then
    echo "  Erste Sicherung erfolgreich angelegt ✓"
  else
    warn "Erste Sicherung fehlgeschlagen – /tmp/keycloak-backup-first.log ansehen."
  fi

  if command -v apt-get >/dev/null; then
    DEBIAN_FRONTEND=noninteractive apt-get install -y -qq unattended-upgrades >/dev/null 2>&1 || \
      warn "unattended-upgrades ließ sich nicht installieren."
    cat > /etc/apt/apt.conf.d/20auto-upgrades <<'APT'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT
    echo "  Automatische Sicherheitsupdates aktiviert"
  fi
fi

# ---------- 10. Zusammenfassung ----------
if [[ "$FIRST_IMPORT" == "1" ]]; then
  ADMIN_HINT="(muss bei der ersten Anmeldung geändert werden)"
else
  ADMIN_HINT="(nur gültig, falls seit dem ersten Import nicht geändert)"
fi

cat <<EOF

════════════════════════════════════════════════════════════
 Keycloak läuft: https://$KC_PUBLIC_HOST
════════════════════════════════════════════════════════════

Keycloak-Konsole (Instanz-Administrator)
  Benutzer:  $KC_ADMIN
  Passwort:  $KC_ADMIN_PASSWORD

Anmeldung in der Lernplattform (Realm-Administrator)
  Benutzer:  $PLATFORM_ADMIN_EMAIL
  Passwort:  $PLATFORM_ADMIN_PASSWORD
             $ADMIN_HINT

Diese Werte jetzt in Netlify eintragen
  (Site configuration → Environment variables):

  VITE_KEYCLOAK_URL              = https://$KC_PUBLIC_HOST
  VITE_KEYCLOAK_REALM            = serviceq
  VITE_KEYCLOAK_CLIENT_ID        = learning-platform
  KEYCLOAK_URL                   = https://$KC_PUBLIC_HOST
  KEYCLOAK_REALM                 = serviceq
  KEYCLOAK_BACKEND_CLIENT_ID     = platform-backend
  KEYCLOAK_BACKEND_CLIENT_SECRET = $PLATFORM_BACKEND_SECRET
  PLATFORM_URL                   = $PLATFORM_URL

  (dazu SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY und SUPABASE_JWT_SECRET
   aus Supabase → Settings → API)

Danach in Netlify neu deployen – erst dann verschwindet die Demo-Anmeldung.
Weiter mit Schritt 7 in docs/inbetriebnahme.md.

Nützliche Befehle
  docker compose -f $COMPOSE_FILE logs -f keycloak
  docker compose -f $COMPOSE_FILE restart keycloak
  docker compose -f $COMPOSE_FILE down          # stoppen (Daten bleiben)
  $AUTH_DIR/backup.sh                           # Sicherung von Hand

Alle Passwörter stehen in $ENV_FILE (nur für root lesbar).
EOF

if [[ "$SELFTEST_FAILED" == "1" ]]; then
  echo
  warn "Der Selbsttest ist nicht sauber durchgelaufen (siehe oben)."
  warn "Die Anmeldung an der Plattform oder das Einladen von Benutzern"
  warn "würde in diesem Zustand scheitern. Bitte zuerst klären."
  exit 1
fi
