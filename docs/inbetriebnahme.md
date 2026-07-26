# Inbetriebnahme: von der Demo zum Produktivbetrieb

Diese Anleitung schaltet die Live-Seite vom Demo-Modus auf echte Anmeldung um.
Rechne mit **1–2 Stunden**, davon der Großteil für das Bereitstellen von Keycloak.

**Warum zeigt Prod aktuell die Demo?** Die drei `VITE_KEYCLOAK_*`-Variablen sind
Build-Zeit-Konstanten: Vite backt sie beim Bauen ins Bundle. Sind sie nicht gesetzt,
schaltet die Anwendung bewusst in den Demo-Modus, damit die Vorführung nicht bricht.

---

## Reihenfolge (wichtig)

```
1. Keycloak öffentlich bereitstellen        ← der eigentliche Aufwand
2. Realm anpassen und importieren
3. Client-Secret holen
4. SMTP für echte E-Mails einrichten
5. Netlify-Variablen setzen
6. Neu deployen                             ← ab hier läuft die echte Anmeldung
7. Datenbank-Berechtigungen scharf schalten ← NICHT vorher!
8. Abnahme: eine Einladung durchspielen
```

> **Schritt 7 nicht vorziehen.** Die Migration entzieht dem anonymen Zugriff alle
> Rechte. Vor Schritt 6 eingespielt, zeigt die Demo-Seite nur noch leere Listen.

---

## Schritt 1 — Keycloak öffentlich bereitstellen

Keycloak ist ein Java-Server. Er kann **nicht** auf Netlify oder in Supabase Edge
Functions laufen – er braucht einen eigenen Host mit HTTPS.

> **Eigener Server bei Hetzner?** Dann Schritt 1 und 2 überspringen und stattdessen
> [`hetzner-keycloak.md`](hetzner-keycloak.md) folgen: ein Skript richtet Docker,
> Firewall, Passwörter, HTTPS-Zertifikat und den kompletten Stack ein. Das
> E-Mail-Theme läuft dort ohne eigenes Docker-Image.

### Empfehlung für den schnellen Start: Railway

Am wenigsten Aufwand, weil HTTPS-Domain und PostgreSQL automatisch kommen.

1. https://railway.app → **New Project** → **Deploy PostgreSQL** (Vorlage wählen).
2. Im selben Projekt: **New** → **Docker Image** → `quay.io/keycloak/keycloak:26.0`.
3. Beim Keycloak-Dienst unter **Variables** eintragen:
   ```
   KC_BOOTSTRAP_ADMIN_USERNAME = kcadmin
   KC_BOOTSTRAP_ADMIN_PASSWORD = <langes Passwort>
   KC_DB                       = postgres
   KC_DB_URL                   = jdbc:postgresql://${{Postgres.PGHOST}}:${{Postgres.PGPORT}}/${{Postgres.PGDATABASE}}
   KC_DB_USERNAME              = ${{Postgres.PGUSER}}
   KC_DB_PASSWORD              = ${{Postgres.PGPASSWORD}}
   KC_HOSTNAME_STRICT          = false
   KC_HTTP_ENABLED             = true
   KC_PROXY_HEADERS            = xforwarded
   ```
4. Unter **Settings → Deploy → Custom Start Command**: `start --optimized`
   (für den ersten Start `start` ohne `--optimized`, damit Keycloak baut).
5. **Settings → Networking → Generate Domain** → notiere die Adresse, z. B.
   `https://keycloak-production-a1b2.up.railway.app`. Das ist deine `KEYCLOAK_URL`.

### Alternativen

| Weg | Aufwand | Anmerkung |
|---|---|---|
| **Render.com** | gering | wie Railway; Web Service aus Docker-Image + Postgres |
| **Hetzner Cloud** (DE) | gering, per Skript | ~4 €/Monat, volle Kontrolle, deutscher Standort. Fertige Anleitung samt Setup-Skript: [`hetzner-keycloak.md`](hetzner-keycloak.md) |
| **Azure Container Apps** | mittel | passt, wenn ihr ohnehin Microsoft-Umgebung fahrt (Entra ID) |
| **Cloud-IAM / Phase Two** | gering | gehostetes Keycloak als Dienst, kein eigener Betrieb |

Für den Produktivbetrieb mit Personenbezug: **EU-Region wählen** (DSGVO).

---

## Schritt 2 — Realm anpassen und importieren

### 2a. Adressen eintragen

Deine Netlify-Adresse findest du im Netlify-Dashboard oben auf der Site-Übersicht
(z. B. `https://verspielt-name-1234.netlify.app`) oder unter Domain management.

Im Projektverzeichnis:

```bash
./auth/configure.sh https://DEINE-NETLIFY-ADRESSE https://DEINE-KEYCLOAK-ADRESSE
```

Das ersetzt die Platzhalter in `auth/realm/serviceq-realm.json` (Redirect-URIs,
Web-Origins, Post-Logout-URIs), legt eine Sicherungskopie an und gibt dir die
fertige Liste der Netlify-Variablen aus. Änderungen committen und pushen.

### 2b. Realm importieren

Keycloak-Konsole öffnen (`https://DEINE-KEYCLOAK-ADRESSE`), als `kcadmin` anmelden:

1. Links oben im Realm-Auswahlfeld → **Create realm**
2. **Browse** → `auth/realm/serviceq-realm.json` hochladen → **Create**

Der Realm bringt Rollen, beide Clients, das Administrator-Konto und die
Passwortrichtlinie mit.

### 2c. Theme hochladen (gestaltete E-Mails)

Bei Railway/Render liegt kein Dateisystem-Zugriff an. Zwei Wege:

**Weg A – eigenes Image (empfohlen, dauerhaft):** Lege im Projektstamm an:
```dockerfile
FROM quay.io/keycloak/keycloak:26.0
COPY auth/themes/groupit /opt/keycloak/themes/groupit
```
und lass Railway/Render dieses Dockerfile statt des fertigen Images bauen.

**Weg B – ohne Theme starten:** Keycloak versendet dann seine Standard-E-Mails.
Funktioniert, sieht aber nicht nach GroupIT aus. Für die Abnahme später auf Weg A
wechseln.

Danach in der Konsole prüfen: **Realm settings → Themes** → Login-Theme und
E-Mail-Theme stehen auf `groupit`.

---

## Schritt 3 — Client-Secret holen

Keycloak-Konsole → Realm `serviceq` → **Clients** → `platform-backend` →
Reiter **Credentials** → **Client Secret** kopieren.

Dieser Wert wird gleich als `KEYCLOAK_BACKEND_CLIENT_SECRET` gebraucht.
**Niemals** mit `VITE_`-Präfix setzen – sonst landet er im Browser-Bundle.

---

## Schritt 4 — SMTP einrichten

Ohne SMTP verschickt Keycloak keine Einladungen.

Keycloak-Konsole → **Realm settings** → Reiter **Email**:

| Feld | Wert |
|---|---|
| From | `noreply@deine-domain.de` |
| From display name | `GroupIT Lernplattform` |
| Reply to | eine echte Postfachadresse oder leer |
| Host / Port | Daten deines SMTP-Anbieters |
| Encryption | **Enable StartTLS** (Port 587) oder **Enable SSL** (465) |
| Authentication | ein, mit Benutzername und Passwort |

Dann **Test connection** klicken – Keycloak schickt eine Testmail an die Adresse
deines Kontos.

**Anbieter:** euer Konzern-SMTP ist erste Wahl. Sonst Brevo, Mailgun oder Postmark
(alle mit kostenlosem Kontingent für den Start).

**Wichtig gegen Spam:** Für die Absenderdomain **SPF, DKIM und DMARC** einrichten.
Ohne diese Einträge landen Einladungen häufig im Spam-Ordner.

---

## Schritt 5 — Netlify-Variablen setzen

Netlify → deine Site → **Site configuration** → **Environment variables** →
für jeden Eintrag **Add a variable**:

**Öffentlich** (landen im Browser-Bundle – hier gehören keine Geheimnisse hin):
```
VITE_KEYCLOAK_URL        = https://DEINE-KEYCLOAK-ADRESSE
VITE_KEYCLOAK_REALM      = serviceq
VITE_KEYCLOAK_CLIENT_ID  = learning-platform
```

**Serverseitig** (nur in den Netlify-Funktionen verfügbar):
```
KEYCLOAK_URL                  = https://DEINE-KEYCLOAK-ADRESSE
KEYCLOAK_REALM                = serviceq
KEYCLOAK_BACKEND_CLIENT_ID    = platform-backend
KEYCLOAK_BACKEND_CLIENT_SECRET= <aus Schritt 3>
PLATFORM_URL                  = https://DEINE-NETLIFY-ADRESSE
SUPABASE_URL                  = https://tkhprexqgjlhtmujcylt.supabase.co
SUPABASE_SERVICE_ROLE_KEY     = <Supabase → Settings → API → service_role>
SUPABASE_JWT_SECRET           = <Supabase → Settings → API → JWT Secret>
```

Die beiden Supabase-Werte findest du unter **Settings → API**. Der
`service_role`-Key darf **niemals** ins Frontend – er umgeht alle Berechtigungen.

Die bereits vorhandenen `VITE_SUPABASE_URL` und `VITE_SUPABASE_ANON_KEY` bleiben
unverändert stehen.

---

## Schritt 6 — Neu deployen

Netlify → **Deploys** → **Trigger deploy** → **Deploy site**.

Ohne neuen Build passiert nichts: Die `VITE_`-Werte werden beim Bauen eingebacken.

**Kontrolle:** Die Seite öffnen. Statt des Demo-Formulars musst du auf der
Keycloak-Anmeldeseite landen. Erscheint noch das Formular mit dem gelben
Demo-Hinweis, hat der Build die Variablen nicht gesehen → Schreibweise prüfen
(`VITE_KEYCLOAK_URL`, exakt so) und erneut deployen.

**Erste Anmeldung:** `admin@groupit.example` mit `Start-Passwort-2026!`.
Keycloak verlangt sofort ein neues Passwort. Ändere anschließend die
E-Mail-Adresse auf deine echte (Konsole → Users → admin → Email), damit du
Zurücksetzungs-Mails erhältst.

---

## Schritt 7 — Datenbank-Berechtigungen scharf schalten

**Erst jetzt**, wenn die Anmeldung nachweislich funktioniert.

Supabase → **SQL Editor** → Inhalt von
`supabase/migrations/0005_production_rls.sql` einfügen → **Run**.

Danach die Kontrollabfrage ausführen:

```sql
select tablename, policyname, roles
  from pg_policies
 where schemaname = 'public' and 'anon' = any (roles);
```

**Erwartet: 0 Zeilen.** Kommt etwas zurück, hat noch eine Demo-Policy überlebt.

Ab hier gilt: anonymer Zugriff auf Fachdaten ist gesperrt, Rechte kommen aus dem
Token. Lernende sehen nur veröffentlichte Trainings ihrer Märkte.

---

## Schritt 8 — Abnahme: eine Einladung durchspielen

1. In der Plattform anmelden → **Verwaltung → Benutzer → Benutzer einladen**.
2. Deine eigene zweite E-Mail-Adresse eintragen, Rolle **Lernender**, einen Markt
   wählen → **Einladung senden**.
3. Die E-Mail muss binnen einer Minute ankommen – im GroupIT-Design, mit dem
   Button „Zugang einrichten".
4. Button klicken → Passwort setzen → du landest angemeldet in der Plattform.
5. Prüfen: Als Lernender sind **Redaktion und Verwaltung nicht sichtbar**. Der
   direkte Aufruf von `/verwaltung/benutzer` führt zurück auf die Startseite.

Läuft das durch, ist die Umstellung abgeschlossen.

---

## Wenn etwas klemmt

| Symptom | Ursache und Behebung |
|---|---|
| Seite zeigt weiter das Demo-Formular | `VITE_`-Variablen fehlen oder Deploy war vor dem Setzen → Schreibweise prüfen, neu deployen |
| „Invalid redirect uri" bei der Anmeldung | Redirect-URI im Client stimmt nicht → Konsole → Clients → `learning-platform` → Valid redirect URIs prüfen (mit `/*` am Ende) |
| Anmeldung klappt, danach leere Listen | Schritt 7 wurde vor Schritt 6 ausgeführt, oder `SUPABASE_JWT_SECRET` ist falsch → Wert prüfen, neu deployen |
| Einladung kommt nicht an | SMTP-Test in Keycloak wiederholen; Spam-Ordner prüfen; SPF/DKIM/DMARC setzen |
| „403 – keine Berechtigung" beim Einladen | Dein Konto hat die Rolle `admin` nicht → Konsole → Users → dein Konto → Role mapping |
| E-Mail kommt, sieht aber nicht nach GroupIT aus | Theme nicht im Image → Weg A aus Schritt 2c |
| Nach „Abmelden" sofort wieder angemeldet | Post-Logout-URI fehlt → `configure.sh` erneut laufen lassen und Realm aktualisieren |

## Danach empfohlen

- **Eigene Domain** für die Plattform (Netlify → Domain management) und für
  Keycloak (`auth.deine-domain.de`), danach `configure.sh` erneut ausführen.
- **Keycloak härten:** `KC_HOSTNAME` auf die echte Domain, `KC_HOSTNAME_STRICT=true`,
  `start --optimized`, Secrets aus einem Secret Store, Backups der Datenbank.
- **Übersetzungs-Worker deployen** (`docs/uebersetzung-worker.md`), sonst bleiben
  „Veröffentlichen → übersetzen" und „Neu übersetzen" ohne Wirkung.
- **Impressum und Datenschutzerklärung** durch geprüfte Texte ersetzen.
