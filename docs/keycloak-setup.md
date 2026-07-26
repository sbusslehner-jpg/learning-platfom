# Keycloak einrichten (Authentifizierung, Einladungen, E-Mails)

Diese Anleitung bringt die Plattform von der Demo-Anmeldung auf eine echte
Authentifizierung mit Keycloak – inklusive Administrator-Konto, gestalteten
Einladungs-E-Mails und produktiven Datenbank-Berechtigungen.

> **Nicht in dieser Entwicklungsumgebung ausgeführt.** Die Netzwerkrichtlinie der
> Sandbox erlaubt nur npm-/PyPI-Registries; Docker-Images (quay.io, Docker-Hub-CDN)
> antworten mit `403`. Der Stack ist daher vollständig geschrieben und statisch
> geprüft (Realm-JSON und Compose-Datei validiert), aber **nicht live gestartet**.
> Die Schritte unten sind der Pfad, um ihn in Ihrer Umgebung in Betrieb zu nehmen.

---

## 1. Stack starten

```bash
cd auth
cp .env.example .env          # Passwörter und Secrets anpassen!
docker compose up -d
```

Das startet drei Dienste:

| Dienst | Adresse | Zweck |
|---|---|---|
| Keycloak | http://localhost:8080 | Authentifizierung, Benutzerverwaltung |
| Mailpit | http://localhost:8025 | Postfach der Entwicklung – hier landen alle E-Mails |
| PostgreSQL | intern | Keycloak-Datenbank |

Der Realm `serviceq` wird beim ersten Start automatisch importiert (Rollen,
Clients, SMTP-Konfiguration, Theme-Bindung, Administrator-Konto).

## 2. Ihr Administrator-Konto

Zwei getrennte Konten – nicht verwechseln:

**a) Realm-Administrator der Lernplattform** (das Konto, mit dem Sie sich in der
Lernplattform anmelden):

| | |
|---|---|
| Anmeldung | `admin@groupit.example` |
| Startpasswort | `Start-Passwort-2026!` |
| Rollen | `admin`, `editor`, `user` (alle drei) |
| Märkte | DE, AT, CH, FR, PL, IT, ES, NL, CZ, SE |

Das Passwort ist als **temporär** hinterlegt: Keycloak verlangt bei der ersten
Anmeldung eine Änderung.

> ⚠️ **Nur für die Entwicklung.** Diese Zugangsdaten stehen im Repository und
> sind damit öffentlich bekannt. Im Produktivbetrieb werden sie **nicht**
> verwendet: Dort erzeugen `hetzner-setup.sh` bzw. `configure.sh` ein Konto mit
> Ihrer echten E-Mail-Adresse und einem zufälligen Startpasswort – siehe
> [`inbetriebnahme.md`](inbetriebnahme.md), Schritt 2a.

**b) Keycloak-Instanz-Administrator** (nur für die Keycloak-Konsole selbst):
`kcadmin` / das Passwort aus `KC_ADMIN_PASSWORD` in Ihrer `.env`.

## 3. Client-Secret des Backends holen

Keycloak-Konsole → Realm `serviceq` → Clients → `platform-backend` → Credentials →
Client secret kopieren. Dieser Wert gehört in die Netlify-Umgebungsvariable
`KEYCLOAK_BACKEND_CLIENT_SECRET` (**niemals** mit `VITE_`-Präfix, sonst landet er
im Browser).

## 4. Redirect-URIs anpassen

Im Realm-Import stehen Platzhalter. Am einfachsten mit dem mitgelieferten Skript –
**vor** dem ersten Start:

```bash
./auth/configure.sh https://ihre-site.netlify.app https://auth.ihre-domain.de
```

Es ersetzt `REPLACE-WITH-NETLIFY-SITE.netlify.app` in Redirect-URIs, Web-Origins und
Post-Logout-URIs, legt eine Sicherungskopie an und gibt anschließend die passenden
Netlify-Variablen aus. Alternativ nachträglich in der Konsole unter Clients →
`learning-platform` → Valid redirect URIs / Web origins / Valid post logout redirect URIs.

## 5. Umgebungsvariablen setzen

**Netlify → Site configuration → Environment variables:**

```
# Öffentlich (landen im Browser-Bundle – keine Geheimnisse!)
VITE_KEYCLOAK_URL=https://auth.ihre-domain.de
VITE_KEYCLOAK_REALM=serviceq
VITE_KEYCLOAK_CLIENT_ID=learning-platform

# Serverseitig (nur in Functions verfügbar)
KEYCLOAK_URL=https://auth.ihre-domain.de
KEYCLOAK_REALM=serviceq
KEYCLOAK_BACKEND_CLIENT_ID=platform-backend
KEYCLOAK_BACKEND_CLIENT_SECRET=<aus Schritt 3>
SUPABASE_URL=https://<ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
SUPABASE_JWT_SECRET=<Supabase → Settings → API → JWT Secret>
PLATFORM_URL=https://ihre-site.netlify.app
```

Sobald `VITE_KEYCLOAK_URL` gesetzt ist, schaltet die Oberfläche in den
**Keycloak-Modus**: echte Anmeldung, Rollen ausschließlich aus dem Token, kein
Rollenwechsel mehr in der Oberfläche.

## 6. Datenbank-Berechtigungen produktiv schalten (wichtig)

Im Supabase **SQL Editor** ausführen:

```
supabase/migrations/0005_production_rls.sql
```

Das nimmt die Demo-Schreibrechte aus `0002`/`0004` zurück und setzt Berechtigungen,
die an das Token gebunden sind:

- `anon` erhält **keinen** Zugriff mehr auf Fachdaten.
- Redaktion (`editor`) schreibt Inhalte und Übersetzungen.
- Verwaltung (`admin`) verwaltet Benutzer, Märkte, Sprachen und Einstellungen.
- Lernende sehen nur **veröffentlichte** Trainings ihrer **eigenen Märkte**.
- Lernfortschritt ist strikt personenbezogen – auch Administratoren sehen keine
  fremden Fortschritte; Auswertungen laufen ausschließlich über die aggregierten Views.

**Kontrolle danach:**

```sql
select tablename, policyname, roles
  from pg_policies
 where schemaname = 'public' and 'anon' = any (roles);
-- erwartete Ausgabe: 0 Zeilen
```

## 7. Produktions-SMTP statt Mailpit

Mailpit fängt E-Mails nur ab. Für den Echtbetrieb in der Keycloak-Konsole unter
Realm settings → Email eintragen: Host, Port, `Enable StartTLS` bzw. `Enable SSL`,
Authentication mit Benutzer/Passwort, Absender `noreply@ihre-domain.de` und
Anzeigename „GroupIT Lernplattform". Danach über „Test connection" prüfen.

**SPF, DKIM und DMARC** für die Absenderdomain einrichten, sonst landen die
Einladungen im Spam.

## 8. Produktionshärtung von Keycloak

Die mitgelieferte `docker-compose.yml` ist für Entwicklung und Abnahme gedacht
(`start-dev`). Für den Echtbetrieb liegt **`auth/docker-compose.prod.yml`** bereit;
auf einem eigenen Server richtet [`hetzner-setup.sh`](hetzner-keycloak.md) alles
Weitere ein. Was dort bereits gesetzt ist bzw. noch zu tun bleibt:

- ✅ `start` statt `start-dev`, hinter Caddy als TLS-Terminator.
- ✅ `KC_HOSTNAME` auf die echte Domain, `KC_HOSTNAME_STRICT=true`.
- ✅ `KC_PROXY_HEADERS=xforwarded`. **`KC_HTTP_ENABLED` bleibt `true`** – TLS endet
  bei Caddy, die letzte Strecke im Docker-Netz ist HTTP. Auf `false` gesetzt,
  nimmt Keycloak keine Verbindung von Caddy mehr an.
- ✅ Keycloak und PostgreSQL ohne `ports:` – von außen nicht erreichbar.
- ✅ Tägliche Datensicherung mit Rotation (`auth/backup.sh`).
- ⬜ `start --optimized` mit eigenem Image (`kc.sh build`) – spart Startzeit.
- ⬜ Passwörter und Secrets aus einem Secret Store, nicht aus `auth/.env`.
- ⬜ Mindestens ein Sicherungsstand außerhalb des Servers.
- Brute-Force-Schutz ist im Realm aktiv (10 Fehlversuche, ansteigende Wartezeit);
  Schwellwerte mit Ihrer Security abstimmen.
- Passwortrichtlinie ist auf 12 Zeichen mit Groß-/Kleinbuchstaben und Ziffer,
  Historie 3, Ablauf 365 Tage gesetzt – ebenfalls abstimmen.

---

## Benutzer einladen (der Ablauf für Ihre Administratoren)

1. In der Lernplattform: **Verwaltung → Benutzer → „Benutzer einladen"**.
2. Name, E-Mail, Rollen und Märkte ausfüllen, absenden.
3. Die Plattform legt das Konto in Keycloak an (deaktivierte E-Mail-Bestätigung),
   weist die Rollen zu und lässt Keycloak die **gestaltete Einladungs-E-Mail**
   versenden (Theme `groupit`, in der Sprache des Benutzers).
4. Der eingeladene Benutzer klickt im E-Mail den Button, setzt sein Passwort und
   landet direkt angemeldet in der Plattform.
5. In der Entwicklung ist die E-Mail unter http://localhost:8025 einsehbar.

**Es wird nie ein Passwort per E-Mail versendet** – der Benutzer setzt es selbst
über einen zeitlich begrenzten Link (Standard: 3 Tage). Läuft der Link ab, kann
die Einladung über „Einladung erneut senden" neu ausgelöst werden.

## E-Mail-Gestaltung anpassen

Die Vorlagen liegen unter `auth/themes/groupit/email/`:

| Datei | Zweck |
|---|---|
| `html/executeActions.ftl` | Einladung (Zugang einrichten) |
| `html/password-reset.ftl` | Passwort zurücksetzen |
| `html/email-verification.ftl` | E-Mail-Adresse bestätigen |
| `messages/messages_{de,en,fr}.properties` | Betreffzeilen und Texte |

Nach Änderungen den Keycloak-Container neu starten (`docker compose restart keycloak`);
im Entwicklungsmodus ist das Theme-Caching deaktiviert.
