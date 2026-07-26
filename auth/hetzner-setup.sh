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

info()  { printf '\n\033[1;36m▸ %s\033[0m\n' "$*"; }
warn()  { printf '\033[1;33m! %s\033[0m\n' "$*" >&2; }
die()   { printf '\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

# ---------- 0. Vorbedingungen ----------
[[ $EUID -eq 0 ]] || die "Bitte als root ausführen (oder mit sudo)."
command -v python3 >/dev/null || die "python3 wird gebraucht: apt-get install -y python3"

# Bereits gesetzte Werte übernehmen, damit ein zweiter Lauf ohne Parameter geht
if [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  set -a; source "$ENV_FILE"; set +a
fi

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
newsecret() { head -c 60 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 40; }

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
cat > "$ENV_FILE" <<EOF
# Erzeugt von hetzner-setup.sh – enthält Geheimnisse, nicht ins Repository!
KC_PUBLIC_HOST=$KC_PUBLIC_HOST
ACME_EMAIL=$ACME_EMAIL
PLATFORM_URL=$PLATFORM_URL

KC_ADMIN=$KC_ADMIN
KC_ADMIN_PASSWORD=$KC_ADMIN_PASSWORD
KC_DB_PASSWORD=$KC_DB_PASSWORD
PLATFORM_BACKEND_SECRET=$PLATFORM_BACKEND_SECRET

# Echter SMTP-Versand. Ausfüllen und Skript erneut ausführen – wirkt aber nur,
# solange der Realm noch nicht importiert wurde. Danach in der Keycloak-Konsole
# unter Realm settings → Email pflegen.
SMTP_HOST=${SMTP_HOST:-}
SMTP_PORT=${SMTP_PORT:-587}
SMTP_FROM=${SMTP_FROM:-noreply@$KC_PUBLIC_HOST}
SMTP_FROM_DISPLAY=${SMTP_FROM_DISPLAY:-GroupIT Lernplattform}
SMTP_USER=${SMTP_USER:-}
SMTP_PASSWORD=${SMTP_PASSWORD:-}
SMTP_STARTTLS=${SMTP_STARTTLS:-true}
SMTP_SSL=${SMTP_SSL:-false}
EOF
chmod 600 "$ENV_FILE"

# ---------- 4. DNS prüfen ----------
info "DNS wird geprüft"
SERVER_IP="$(curl -fsS --max-time 5 https://api.ipify.org 2>/dev/null || hostname -I | awk '{print $1}')"
DNS_IP="$(getent ahostsv4 "$KC_PUBLIC_HOST" 2>/dev/null | awk 'NR==1{print $1}')"
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
# shellcheck disable=SC1090
set -a; source "$ENV_FILE"; set +a
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
