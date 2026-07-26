# Produktionsreife: Stand nach der Keycloak-Anbindung

**Bezug:** ergänzt [`produktstatus.md`](produktstatus.md), das die Plattform zuvor als
*nicht produktionsreif* bewertet hat. Ausschlaggebend waren dort drei P0-Punkte:
fehlende Authentifizierung, Demo-Schreibrechte in der Datenbank und personenbezogene
Daten im anonymen Zugriff. Dieses Dokument beschreibt, was sich geändert hat.

---

## 1. Die drei P0-Blocker

| Blocker | Stand |
|---|---|
| **Keine Authentifizierung** | **Behoben.** Anmeldung über Keycloak (Authorization Code + PKCE). Die Anwendung enthält kein Passwortfeld mehr; Zugangsdaten werden ausschließlich auf der Keycloak-Anmeldeseite eingegeben. Rollen stammen aus dem Token und sind in der Oberfläche nicht umschaltbar. |
| **Demo-Schreibrechte (`0002`/`0004`)** | **Behoben durch `0005_production_rls.sql`.** `anon` verliert jeden Zugriff auf Fachdaten; Rechte werden aus den Token-Claims abgeleitet. |
| **Personenbezogene Daten anonym lesbar** | **Behoben.** `app_user` ist nur für die eigene Person und für Administratoren lesbar; Lernfortschritt ist strikt personenbezogen – auch Administratoren sehen keine fremden Fortschritte. |

## 2. Was jetzt gilt

**Authentifizierung und Berechtigung**
- Keycloak-Realm `serviceq` mit Rollen `admin`, `editor`, `user` (additiv kombinierbar).
- Tokens liegen in `sessionStorage`, nie in `localStorage`; der Austausch gegen ein
  kurzlebiges Supabase-Token (15 Min., gedeckelt durch die Keycloak-Laufzeit) erfolgt
  serverseitig nach kryptografischer Prüfung gegen JWKS.
- RLS setzt die Rechte verbindlich durch: Editoren schreiben Inhalte, Administratoren
  verwalten Benutzer/Märkte/Einstellungen, Lernende sehen nur **veröffentlichte**
  Trainings **ihrer eigenen Märkte**.
- In der Plattform deaktivierte Konten erhalten kein Zugriffstoken mehr
  (`403 ACCOUNT_DISABLED`) – die Aktiv/Inaktiv-Umschaltung wirkt tatsächlich.

**Benutzeraufnahme**
- Administratoren laden Benutzer in der Oberfläche ein. Das Konto entsteht in Keycloak,
  Rollen und Märkte werden zugewiesen, Keycloak versendet die gestaltete Einladung.
- Der Benutzer setzt sein Passwort selbst über einen 3 Tage gültigen Link.
  **Es wird nie ein Passwort per E-Mail versendet.**
- Fehlgeschlagene Zustellungen sind erkennbar und die Einladung erneut versendbar;
  scheitert die Rollenzuweisung, wird das halb angelegte Konto wieder entfernt.

## 3. Testergebnisse (tatsächlich ausgeführt)

| Suite | Umfang | Ergebnis |
|---|---|---|
| `npm run test:unit` | SSO-Kernlogik | ✅ **30/30** |
| `npm run test:functions` | Token-Austausch, Einladung, Mock-Keycloak | ✅ **34/34** |
| `npm run test:e2e` | 3 Rollen, Guards, i18n, Responsive, a11y (Demo-Modus) | ✅ **50/50** |
| `npm run test:keycloak` | OIDC-Absprung im echten Browser (Stub-Keycloak) | ✅ **10/10** |
| `npm run build` | Produktionsbuild | ✅ fehlerfrei |
| Setup-Skript gegen simuliertes Docker | Erstlauf, Wiederholungslauf, falsches Secret, `.env`-Roundtrip mit `$` und Leerzeichen | ✅ durchlaufen |
| `auth/backup.sh` | Sicherung, gzip-Prüfung, Rotation auf N Stände, Fehlerfall | ✅ durchlaufen |
| `auth/configure.sh` | Produktionsdatei, Abbruch bei offenem Platzhalter, Schutz der Quelldatei | ✅ durchlaufen |

**Besonders belastbar:** Die sicherheitskritischen Prüfungen der Auth-Funktionen sind
**mutationsgeprüft** – jede Prüfung wurde einzeln entfernt und der zugehörige Test
schlug fehl (u. a. Adminpflicht der Einladung, `azp`/`aud`-Bindung, Laufzeitdeckel,
Rollen-Allowlist, kompensierendes Löschen, Deaktivierungs-Sperre).

**Nicht ausgeführt:** Ein vollständiger Anmelde-Rundlauf gegen eine **echte**
Keycloak-Instanz, echter E-Mail-Versand, RLS-Policies gegen eine echte Postgres-Instanz,
Last- und Penetrationstest. Grund: Die Entwicklungsumgebung bekommt keine
Docker-Images, Keycloak und Postgres ließen sich hier nicht starten. Realm-JSON,
Compose-Datei und SQL sind statisch geprüft.

Damit dieser Rest nicht ungeprüft in den Betrieb geht, prüft `hetzner-setup.sh`
sich nach dem Start **selbst**: Läuft Caddy? Antwortet der Realm? Kann sich der
Backend-Client mit dem Secret anmelden, das gleich nach Netlify geht? Stimmen DNS
und Zertifikat? Damit fällt genau das auf dem Server auf, was hier nicht
nachstellbar war – und zwar beim Setup statt bei der ersten Einladung.

## 4. Bewertung

**Die Architektur ist produktionsreif; die Inbetriebnahme ist der verbleibende Schritt.**

Alle drei ursprünglichen P0-Blocker sind konstruktiv beseitigt. Der Zugriffsschutz liegt
nicht mehr in der Oberfläche, sondern in der Datenbank und in serverseitig geprüften
Tokens. Was fehlt, ist keine Entwicklungsarbeit mehr, sondern **Betrieb und Abnahme**:

1. Keycloak-Stack in Ihrer Umgebung starten und den Realm importieren.
   Auf einem eigenen Server erledigt das `auth/hetzner-setup.sh` in einem Lauf –
   inklusive HTTPS, Zufallspasswörtern, täglicher Sicherung und Selbsttest.
2. `0005_production_rls.sql` einspielen und die Kontrollabfrage ausführen
   (`0 Zeilen` für `anon`-Policies).
3. Umgebungsvariablen in Netlify setzen; damit schaltet die Oberfläche in den
   Keycloak-Modus.
4. Produktions-SMTP samt SPF/DKIM/DMARC einrichten und einen echten
   Einladungs-Rundlauf abnehmen.
5. Restliche Härtung: `start --optimized`, Secrets aus einem Store, ein
   Sicherungsstand außerhalb des Servers, SSH auf Schlüssel beschränken.

Details: [`keycloak-setup.md`](keycloak-setup.md).

**Beim Vorbereiten der Inbetriebnahme behoben:**

| Fund | Wirkung, wenn er stehen geblieben wäre |
|---|---|
| Startpasswort des Administrators stand im Repository | Zwischen Realm-Import und Ihrer ersten Anmeldung hätte sich jeder Leser des Repositorys als Administrator anmelden können. Jetzt: Zufallspasswort, einmalig angezeigt. |
| Client-Secret als `${PLATFORM_BACKEND_SECRET}` im Realm | Keycloak ersetzt den Platzhalter beim Import nicht zuverlässig und übernimmt ihn wörtlich. Einladungen wären mit „Service-Account konnte sich nicht anmelden" gescheitert – ohne erkennbaren Zusammenhang. Jetzt: echtes Secret in der erzeugten Datei, im Selbsttest geprüft. |
| `localhost`-Redirect-URIs im Produktions-Realm | Unnötig erlaubte Rücksprungziele eines öffentlichen Clients. Jetzt: fallen bei der Erzeugung heraus. |
| Empfehlung, `/admin*` per IP zu sperren | Hätte die Admin-REST-API mitgesperrt und **jede Einladung** aus Netlify unterbunden. Jetzt: nur `/admin/master/console*`. |
| Empfehlung `--http-enabled=false` hinter dem Proxy | Keycloak hätte keine Verbindung von Caddy mehr angenommen. Jetzt korrigiert. |
| Überwachung auf `/health/ready` | Lag auf dem internen Port 9000 und lieferte über die öffentliche Adresse 404 – die Prüfung hätte nie funktioniert. Jetzt über Caddy erreichbar, `/metrics` bleibt intern. |
| Backup-Cron aus der Anleitung | `crontab -` hätte bestehende Aufgaben ersetzt, und es gab keine Rotation. Jetzt: eigene Datei unter `/etc/cron.d`, 14 Stände, geprüfte Sicherung. |

## 5. Offene Punkte (keine Blocker mehr)

| Punkt | Priorität |
|---|---|
| Lernfortschritt serverseitig statt im Browser (`progress`-Tabelle existiert, braucht nur den Nutzerkontext) | P1 |
| Datei-Uploads für Video/Bild/PDF inkl. sprachspezifischer Varianten | P1 |
| Übersetzungs-Worker deployen (sonst bleiben „Veröffentlichen → übersetzen" und „Neu übersetzen" wirkungslos) | P1 |
| Impressum und Datenschutzerklärung juristisch prüfen und ersetzen | P1 |
| Drag-&-Drop-Sortierung aktivieren; i18n auf den Redaktionsbereich ausweiten | P2 |
| Bundle-Größe (~600 kB) durch Code-Splitting senken | P2 |
| Last- und Penetrationstest, WCAG-Kontrastmessung mit Messwerkzeug | P2 |

## 6. Ehrliche Einordnung

„Getestet" heißt in diesem Dokument ausschließlich „in einem echten Lauf ausgeführt":
124 automatisierte Prüfungen sind belegt. Alles, was eine laufende Keycloak-, Postgres-
oder SMTP-Instanz erfordert, ist **geschrieben und statisch geprüft, aber nicht
verifiziert** – und bleibt bis zur Abnahme in Ihrer Umgebung als offen gekennzeichnet.
