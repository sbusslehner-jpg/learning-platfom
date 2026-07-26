#!/usr/bin/env bash
# ============================================================
# Sichert die Keycloak-Datenbank (alle Benutzerkonten, Rollen, Sessions).
#
# Wird von hetzner-setup.sh als tägliche Aufgabe eingerichtet
# (/etc/cron.d/keycloak-backup). Manuell jederzeit ausführbar:
#
#   ./auth/backup.sh
#
# Stellschrauben über Umgebungsvariablen:
#   BACKUP_DIR   Zielverzeichnis      (Standard: /var/backups/keycloak)
#   BACKUP_KEEP  Anzahl Sicherungen   (Standard: 14)
#   DB_CONTAINER Containername        (Standard: sq-keycloak-db)
#
# Zurückspielen (Stack läuft, Keycloak vorher stoppen!):
#   docker compose -f auth/docker-compose.prod.yml stop keycloak
#   gunzip -c /var/backups/keycloak/keycloak-2026-01-31-031702.sql.gz \
#     | docker exec -i sq-keycloak-db psql -U keycloak -d keycloak
#   docker compose -f auth/docker-compose.prod.yml start keycloak
# ============================================================
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/var/backups/keycloak}"
BACKUP_KEEP="${BACKUP_KEEP:-14}"
DB_CONTAINER="${DB_CONTAINER:-sq-keycloak-db}"

die() { printf 'keycloak-backup: %s\n' "$*" >&2; exit 1; }

command -v docker >/dev/null || die "docker nicht gefunden."
docker inspect -f '{{.State.Running}}' "$DB_CONTAINER" 2>/dev/null | grep -q true \
  || die "Container $DB_CONTAINER läuft nicht – keine Sicherung möglich."

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

stamp="$(date +%F-%H%M%S)"
target="$BACKUP_DIR/keycloak-$stamp.sql.gz"
tmp="$target.part"
# Erst unter .part schreiben: ein Abbruch (Platte voll, Container weg)
# hinterlässt sonst eine Datei, die wie eine gültige Sicherung aussieht.
trap 'rm -f "$tmp"' EXIT

umask 077
docker exec "$DB_CONTAINER" pg_dump -U keycloak -d keycloak --clean --if-exists \
  | gzip -9 > "$tmp"

[[ -s "$tmp" ]] || die "Sicherung ist leer – pg_dump hat nichts geliefert."
gzip -t "$tmp" || die "Sicherung ist beschädigt (gzip-Prüfung fehlgeschlagen)."

mv "$tmp" "$target"
trap - EXIT

# Rotation: die ältesten Sicherungen über BACKUP_KEEP hinaus entfernen.
# `ls -t` sortiert nach Änderungszeit, `tail -n +N` überspringt die neuesten.
# Bewusst als Schleife statt `mapfile`: das gibt es erst ab Bash 4.
while IFS= read -r obsolete; do
  [[ -n "$obsolete" ]] && rm -f "$obsolete"
done < <(ls -1t "$BACKUP_DIR"/keycloak-*.sql.gz 2>/dev/null | tail -n +"$((BACKUP_KEEP + 1))")

printf 'keycloak-backup: %s (%s), %d Sicherungen vorhanden\n' \
  "$target" "$(du -h "$target" | cut -f1)" \
  "$(ls -1 "$BACKUP_DIR"/keycloak-*.sql.gz 2>/dev/null | wc -l)"
