# Produktionsreife: Stand nach der Keycloak-Anbindung

**Bezug:** ergänzt [`produktstatus.md`](produktstatus.md), das die Plattform zuvor als
*nicht produktionsreif* bewertet hat. Ausschlaggebend waren dort drei P0-Punkte:
fehlende Authentifizierung, Demo-Schreibrechte in der Datenbank und personenbezogene
Daten im anonymen Zugriff. Dieses Dokument beschreibt, was sich geändert hat.

---

## 0. Stand der Inbetriebnahme (27.07.2026)

**Die Plattform läuft produktiv.** Nicht mehr „geschrieben und statisch geprüft",
sondern in Betrieb und gemessen.

| Baustein | Zustand |
|---|---|
| Keycloak | Hetzner CX22, Ubuntu 26.04 LTS, Keycloak 26.0 hinter Caddy, gültiges Let's-Encrypt-Zertifikat |
| Realm `serviceq` | importiert, 13 Client-Scopes, Rollen `admin`/`editor`/`user`, Brute-Force-Schutz und Passwortrichtlinie aktiv |
| Anmeldung | Authorization Code + PKCE, **PKCE erzwungen**, fremde Redirect-URIs abgewiesen (400) |
| Plattform | Netlify, `VITE_KEYCLOAK_*` im Bundle, Demo-Anmeldung verschwunden |
| Token-Austausch | erzeugt eine `app_user`-Zeile – in der Produktivdatenbank nachgewiesen |
| Datenbank | Migrationen 0001–0006, 35 Policies, **0 Policies für `anon`**, Seed eingespielt (10 Märkte, 6 Trainings) |
| Betrieb | tägliche Sicherung mit Rotation (03:17, 14 Stände), automatische Sicherheitsupdates, `ufw` auf 22/80/443 |
| Überwachung | `/health/ready` öffentlich erreichbar, `/metrics` bleibt intern |

**Noch offen:**

- **SMTP.** Der Realm zeigt weiterhin auf `mailpit`. Konten lassen sich anlegen,
  die Einladungsmail wird aber nicht zugestellt – der Aufruf meldet das ehrlich
  (`emailSent: false`), und die Einladung ist später erneut versendbar. Bis dahin
  ist der Benutzeraufnahme-Prozess **nicht abgenommen**.
- **Übergangsdomain.** Keycloak läuft unter einer `sslip.io`-Adresse. Für den
  Umzug auf eine echte Domain sind drei Dinge nachzuziehen: `KC_PUBLIC_HOST` in
  `auth/.env` (Skript erneut ausführen), die Redirect-URIs des Clients in der
  Keycloak-Konsole und die Netlify-Variablen. Benutzerkonten bleiben erhalten.
- **Zugangsdaten drehen.** Datenbank-Passwort und Backend-Secret wurden im Zuge
  der Inbetriebnahme über einen Chatverlauf ausgetauscht und sollten ersetzt
  werden.
- Die P1-Punkte aus Abschnitt 5 (Lernfortschritt, Uploads, Übersetzungs-Worker,
  Impressum) sind unverändert offen.

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

**Am 27.07.2026 auf der Produktivinstanz nachgeholt:**

| Prüfung | Ergebnis |
|---|---|
| Realm-Import gegen echtes Keycloak 26.0 | ✅ nach fünf Korrekturen (siehe unten) |
| Anmelde-Rundlauf im Browser gegen die Live-Seite | ✅ Weiterleitung auf Keycloak, Anmeldeformular im GroupIT-Theme |
| PKCE erzwungen | ✅ ohne `code_challenge` → `invalid_request` |
| Fremde Redirect-URI | ✅ 400, abgewiesen |
| Backend-Client (`client_credentials`) | ✅ Token erhalten |
| RLS gegen echtes Postgres | ✅ `anon` erhält `permission denied`, 0 Policies für `anon` |
| Token-Austausch → `app_user` | ✅ Profilzeile in der Produktivdatenbank nachgewiesen |
| Sicherung im Dauerbetrieb | ✅ Cron-Lauf um 03:17 hat selbstständig gesichert |

**Weiterhin nicht ausgeführt:** echter E-Mail-Versand (SMTP steht noch aus),
Last- und Penetrationstest.

Dass der Selbsttest in `hetzner-setup.sh` eingebaut wurde, hat sich unmittelbar
ausgezahlt: Er meldete beim ersten Lauf, dass der Backend-Client sich nicht
anmelden kann, und beim zweiten den gescheiterten Realm-Import samt Ursache –
statt beides erst bei der ersten Einladung sichtbar werden zu lassen.

## 4. Bewertung

**Die Plattform ist in Betrieb.** Alle drei ursprünglichen P0-Blocker sind
beseitigt, und der Zugriffsschutz liegt nachweislich dort, wo er hingehört: in
der Datenbank und in serverseitig geprüften Tokens.

Schritte 1 bis 3 der ursprünglichen Liste sind erledigt und gemessen. Offen
bleiben:

1. **Produktions-SMTP** samt SPF/DKIM/DMARC einrichten und einen echten
   Einladungs-Rundlauf abnehmen. **Bis dahin ist die Benutzeraufnahme nicht
   abgenommen** – Konten entstehen, die Einladungsmail wird nicht zugestellt.
2. **Umzug auf eine echte Domain** (derzeit `sslip.io`): `KC_PUBLIC_HOST`,
   Redirect-URIs in der Konsole, Netlify-Variablen. Konten bleiben erhalten.
3. **Zugangsdaten drehen**, die während der Inbetriebnahme ausgetauscht wurden.
4. Restliche Härtung: `start --optimized`, Secrets aus einem Store, ein
   Sicherungsstand außerhalb des Servers, SSH auf Schlüssel beschränken.

Details: [`keycloak-setup.md`](keycloak-setup.md).

**Beim ersten echten Lauf gefunden und behoben** – jeder dieser Punkte hätte den
Import auf jedem Server verhindert. Sie waren nie aufgefallen, weil der Realm
zuvor nie tatsächlich importiert worden war:

| Fund | Wirkung, wenn er stehen geblieben wäre |
|---|---|
| `chmod 600` auf der erzeugten Realm-Datei | Der Container läuft als `uid=1000, gid=0` und konnte nicht lesen – Endlos-Neustart, im Log nur „Failed to run import" ohne Ursache. Jetzt `640`. |
| `unmanagedAttributePolicy` auf Realm-Ebene | Import bricht ab. Ersatzloses Löschen wäre schlimmer gewesen: Keycloak hätte `markets` und `tenant` stillschweigend verworfen und Lernende hätten keine Schulung gesehen. Jetzt als User-Profile-Komponente mit `ADMIN_EDIT`. |
| `defaultRoles` (in Keycloak 25 entfernt) | Import bricht ab. Entbehrlich, da Rollen bei der Einladung ausdrücklich zugewiesen werden. |
| `postLogoutRedirectUris` auf Client-Ebene | Import bricht ab. Die Liste gehört in das Client-Attribut `post.logout.redirect.uris`. |
| Eigener `clientScopes`-Block im Realm | Unterdrückt Keycloaks eingebaute Client-Scopes: 2 statt 13. Ohne `roles` enthielte das Token keine `realm_access.roles` – jeder Benutzer wäre ohne Berechtigung geblieben. Jetzt hängen die Mapper direkt am Client. |
| Partieller Unique-Index auf `app_user` | PostgREST sendet `on conflict` ohne WHERE-Bedingung → `42P10`. Jede Anmeldung blieb ohne Profilzeile; die Oberfläche zeigte Demo-Inhalte. Behoben in `0006`. |
| Anführungszeichen in `seed.sql` | `„…"` statt `„…"` beendete eine JSON-Zeichenkette – der komplette Seed scheiterte. Ohne Märkte hätte jede Einladung „Unbekannte Marktcodes" gemeldet. |

**Zuvor beim Vorbereiten behoben:**

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
