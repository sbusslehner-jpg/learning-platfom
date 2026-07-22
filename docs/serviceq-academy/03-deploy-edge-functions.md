# Prototyp deployen: SSO-Handshake auf Supabase Edge Functions (Option A)

Schnellster Weg zu einem lauffähigen SSO-Prototyp – **ohne eigenen Server**. Die drei Edge Functions
bilden den kompletten Broker-Flow ab; getestet wird der Backend-Handshake per curl-Smoke-Test.

> **Ehrlich vorab:** Die Functions und das SQL wurden in der Entwicklungsumgebung **nicht** ausgeführt
> (kein Deno/Postgres). Diese Anleitung ist der Pfad, um sie in **deiner** Supabase-Umgebung real zu
> starten. Erst der Smoke-Test unten liefert echte Testergebnisse.

## 0. Voraussetzungen

- Supabase-Projekt (EU/Frankfurt) — dasselbe wie für die Lernplattform.
- Supabase CLI: `npm install -g supabase`, dann `supabase login` und `supabase link --project-ref <ref>`.

## 1. Datenbank vorbereiten

Im **SQL Editor** in dieser Reihenfolge ausführen:

1. `supabase/migrations/0001_init.sql` (falls noch nicht geschehen)
2. `supabase/seed.sql` (Demo-Inhalte, liefert Märkte/Sprachen für Tenants)
3. `supabase/migrations/0003_serviceq_sso.sql` (SSO-Store + atomare Einlösung)
4. `supabase/serviceq-sso-config.sql` (registriert den Demo-Client `serviceq-demo`)

## 2. Functions deployen — WICHTIG: `--no-verify-jwt`

Die Endpunkte werden von einem **Browser** (Consume) bzw. von ServiceQ mit **eigener**
Systemauthentifizierung (Launch-Ticket) aufgerufen — **nicht** mit einem Supabase-JWT. Daher muss
der Supabase-Gateway-JWT-Check deaktiviert werden; die Authentifizierung passiert **in** der Funktion.

```bash
supabase functions deploy academy-launch-ticket --no-verify-jwt
supabase functions deploy academy-consume        --no-verify-jwt
supabase functions deploy academy-session         --no-verify-jwt
```

`SUPABASE_URL` und `SUPABASE_SERVICE_ROLE_KEY` stehen Edge Functions automatisch zur Verfügung.
Optionale Umgebungswerte:

```bash
supabase secrets set ACADEMY_SPA_URL=https://<deine-netlify-site>   # Redirect-Ziel nach Consume
supabase secrets set ACADEMY_PUBLIC_URL=https://<ref>.functions.supabase.co  # in der launchUrl
```

## 3. Smoke-Test (echter End-to-End-Lauf)

```bash
FUNCTIONS_BASE="https://<ref>.functions.supabase.co" \
SECRET="serviceq-demo-secret-bitte-aendern" \
bash supabase/functions/smoke-test.sh
```

Der Test durchläuft: **Ticket erstellen → einlösen (303 + Cookie) → Replay abgewiesen →
Status → verlängern → Logout → Status 401**. Bei Erfolg meldet er `bestanden`.

> Das ist der Moment, in dem aus „geschrieben" echtes „getestet" wird — die 23 Unit-Tests decken
> die Logik ab, dieser Lauf deckt DB-Atomarität, Cookie und Redirect ab.

## 4. Ein-Domain-Integration (SPA akzeptiert die echte SSO-Session)

Der Backend-Handshake (Abschnitt 3) läuft eigenständig. Damit auch die **SPA** die Session nutzt,
sind zwei Dinge nötig — beide bereits im Repo vorbereitet und **standardmäßig aus**, damit der
Demo-Betrieb unberührt bleibt:

1. **Ein-Domain-Proxy (Cookie same-site).** Das `__Host-ga_session`-Cookie wird auf der Domain
   gesetzt, die der Browser aufruft. Liegen SPA (Netlify) und Functions (`*.supabase.co`) auf
   verschiedenen Domains, erhält die SPA das Cookie nicht. Lösung: die Consume-/Session-Endpunkte
   unter derselben Netlify-Domain proxyen. In [`netlify.toml`](../../netlify.toml) ist dafür ein
   klar markierter, auskommentierter Block hinterlegt — `<PROJECT_REF>` ersetzen und einkommentieren:

   ```
   /sso/consume       → https://<PROJECT_REF>.functions.supabase.co/academy-consume   (200, force)
   /sso/session/*     → https://<PROJECT_REF>.functions.supabase.co/academy-session/* (200, force)
   ```

   ServiceQ setzt die `launchUrl` dann auf `https://<netlify-site>/sso/consume?code=…`, und
   `ACADEMY_SPA_URL` (Consume-Redirect-Ziel) ist die Netlify-Site. Alles läuft same-domain.

2. **SPA liest die Session statt des Demo-Logins.** Ist die Netlify-Env-Variable
   `VITE_ACADEMY_SESSION_URL=/sso/session` gesetzt, schaltet die SPA in den **SSO-Modus**
   (`src/app/data/academyAuth.ts`): Beim Start prüft sie `/(…)/status`; bei gültiger Session
   startet sie ohne Login, bei fehlender Session leitet sie auf `/sso/expired` (nie auf eine
   Loginseite). Ohne diese Variable bleibt alles beim Demo-Login — kein Bruch des laufenden Betriebs.

## 5. Systemauthentifizierung: client_secret oder private_key_jwt

Beide Verfahren sind implementiert; der Client wählt per `sso_client.auth_method`:

- **`client_secret`** (Demo-Default): schnellster Start; der Bearer ist das Klartext-Secret,
  serverseitig gegen `client_secret_hash` geprüft.
- **`private_key_jwt`** (empfohlen, RFC 9700): ServiceQ signiert ein kurzlebiges Client-Assertion-JWT
  mit seinem privaten Schlüssel; die GITacademy prüft **Signatur** (jose, RS256/ES256) gegen
  `sso_client.public_key_pem`, die **Claims** (`iss`/`sub`=client_id, `aud`=Endpoint, `exp`/`nbf`/`iat`,
  Toleranz) und sperrt **`jti`-Replays** über `sso_used_assertion`. Aktivieren: bei der Client-Registrierung
  `auth_method='private_key_jwt'` setzen und `public_key_pem` hinterlegen; optional `ACADEMY_LAUNCH_AUD`
  als erwartete Audience setzen (bei Proxy-Betrieb).

> Die reine **Claim-Logik** ist unit-getestet (Node); die **Signaturprüfung** (jose) läuft nur in der
> deployten Edge Function und wurde hier nicht ausgeführt.

## 6. Ehrliche Einschränkungen des Prototyps

- **P0-Blocker bleibt:** `0002_demo_write_access.sql` muss vor echtem Betrieb zurückgenommen werden,
  sonst umgeht der anon-Key jede Session (B2).
- **Nicht ausgeführt hier:** Ein-Domain-Proxy, SSO-Modus, JWT-Signaturprüfung und DB-Atomarität wurden
  gebaut und build-/typ-geprüft, aber nicht gegen eine echte Supabase-/Netlify-Umgebung durchlaufen.
  Erst der Smoke-Test plus ein Browser-Durchlauf auf der zusammengeführten Domain verifizieren das
  End-to-End-Verhalten.

## 5. Was damit bewiesen ist

Nach einem grünen Smoke-Test ist der **Kern des Zielbilds** lauffähig demonstriert: kein Login in der
Academy, backend-vermittelter One-Time-Handshake, atomare Einlösung, serverseitige Session mit
Idle/Absolut-Timeout, Verlängerung und Logout. Die verbleibende Arbeit ist **Integration** (eine Domain,
SPA liest die Session) und **Härtung** (`private_key_jwt`, `0002` zurücknehmen, Rate-Limit/Pen-Test).
