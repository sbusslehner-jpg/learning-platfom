#!/usr/bin/env bash
# ============================================================
# Richtet den Keycloak-Stack auf einem frischen Ubuntu-/Debian-Server ein
# (Hetzner Cloud, aber genauso auf jedem anderen Root-Server).
#
# Ausführen AUF DEM SERVER, als root:
#
#   ./auth/hetzner-setup.sh auth.deine-domain.de mail@deine-domain.de \
#                           https://deine-site.netlify.app
#
# Voraussetzung: Ein A-Record für die Keycloak-Domain zeigt bereits auf die
# IP-Adresse dieses Servers. Ohne das kann Let's Encrypt kein Zertifikat
# ausstellen (Caddy versucht es danach automatisch weiter).
#
# Das Skript ist mehrfach ausführbar. Bereits erzeugte Passwörter in
# auth/.env bleiben erhalten; ohne Parameter nutzt es die Werte von zuvor.
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

if [[ -z "$KC_PUBLIC_HOST" || -z "$ACME_EMAIL" || -z "$PLATFORM_URL" ]]; then
  die "Aufruf: $0 <keycloak-domain> <e-mail-fuer-zertifikat> <adresse-der-lernplattform>
Beispiel: $0 auth.deine-domain.de mail@deine-domain.de https://deine-site.netlify.app"
fi

# Schema abstreifen, falls jemand https:// vor die Domain schreibt
KC_PUBLIC_HOST="${KC_PUBLIC_HOST#http://}"
KC_PUBLIC_HOST="${KC_PUBLIC_HOST#https://}"
KC_PUBLIC_HOST="${KC_PUBLIC_HOST%/}"
PLATFORM_URL="${PLATFORM_URL%/}"

[[ "$KC_PUBLIC_HOST" == *.* ]] || die "Keine gültige Domain: $KC_PUBLIC_HOST"
[[ "$PLATFORM_URL" =~ ^https?:// ]] || die "Die Plattform-Adresse muss mit https:// beginnen."

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

KC_ADMIN="${KC_ADMIN:-kcadmin}"
KC_ADMIN_PASSWORD="${KC_ADMIN_PASSWORD:-}"
KC_DB_PASSWORD="${KC_DB_PASSWORD:-}"
PLATFORM_BACKEND_SECRET="${PLATFORM_BACKEND_SECRET:-}"

# Platzhalter aus .env.example gelten als „nicht gesetzt"
for var in KC_ADMIN_PASSWORD KC_DB_PASSWORD PLATFORM_BACKEND_SECRET; do
  if [[ "${!var}" == bitte-* || -z "${!var}" ]]; then
    printf -v "$var" '%s' "$(newsecret)"
    GENERATED=1
  fi
done

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
info "Realm-Definition wird erzeugt (Adressen + SMTP)"
load_env "$ENV_FILE"
"$AUTH_DIR/configure.sh" "$PLATFORM_URL" "https://$KC_PUBLIC_HOST" \
  "$AUTH_DIR/realm-generated/serviceq-realm.json"

if [[ -z "${SMTP_HOST:-}" ]]; then
  warn "Kein SMTP_HOST gesetzt – Keycloak kann noch keine Einladungen verschicken."
  warn "Später in auth/.env eintragen oder in der Konsole unter Realm settings → Email."
fi

# ---------- 6. Starten ----------
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
  warn "Keycloak meldet noch keine Bereitschaft. Log prüfen:"
  warn "  docker compose -f $COMPOSE_FILE logs -f keycloak"
  exit 1
fi

# ---------- 8. Zusammenfassung ----------
cat <<EOF

════════════════════════════════════════════════════════════
 Keycloak läuft: https://$KC_PUBLIC_HOST
════════════════════════════════════════════════════════════

Keycloak-Konsole (Instanz-Administrator)
  Benutzer:  $KC_ADMIN
  Passwort:  $KC_ADMIN_PASSWORD

Anmeldung in der Lernplattform (Realm-Administrator)
  Benutzer:  admin@groupit.example
  Passwort:  Start-Passwort-2026!   (muss sofort geändert werden)

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

Alle Passwörter stehen in $ENV_FILE (nur für root lesbar).
EOF
