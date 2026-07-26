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

**Besonders belastbar:** Die sicherheitskritischen Prüfungen der Auth-Funktionen sind
**mutationsgeprüft** – jede Prüfung wurde einzeln entfernt und der zugehörige Test
schlug fehl (u. a. Adminpflicht der Einladung, `azp`/`aud`-Bindung, Laufzeitdeckel,
Rollen-Allowlist, kompensierendes Löschen, Deaktivierungs-Sperre).

**Nicht ausgeführt:** Ein vollständiger Anmelde-Rundlauf gegen eine **echte**
Keycloak-Instanz, echter E-Mail-Versand, RLS-Policies gegen eine echte Postgres-Instanz,
Last- und Penetrationstest. Grund: Die Netzwerkrichtlinie der Entwicklungsumgebung
blockiert Docker-Registries (`403` von quay.io), Keycloak und Postgres ließen sich hier
nicht starten. Realm-JSON, Compose-Datei und SQL sind statisch geprüft.

## 4. Bewertung

**Die Architektur ist produktionsreif; die Inbetriebnahme ist der verbleibende Schritt.**

Alle drei ursprünglichen P0-Blocker sind konstruktiv beseitigt. Der Zugriffsschutz liegt
nicht mehr in der Oberfläche, sondern in der Datenbank und in serverseitig geprüften
Tokens. Was fehlt, ist keine Entwicklungsarbeit mehr, sondern **Betrieb und Abnahme**:

1. Keycloak-Stack in Ihrer Umgebung starten und den Realm importieren.
2. `0005_production_rls.sql` einspielen und die Kontrollabfrage ausführen
   (`0 Zeilen` für `anon`-Policies).
3. Umgebungsvariablen in Netlify setzen; damit schaltet die Oberfläche in den
   Keycloak-Modus.
4. Produktions-SMTP samt SPF/DKIM/DMARC einrichten und einen echten
   Einladungs-Rundlauf abnehmen.
5. Keycloak produktiv härten (`start --optimized` hinter TLS, Secrets aus einem Store).

Details: [`keycloak-setup.md`](keycloak-setup.md).

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
