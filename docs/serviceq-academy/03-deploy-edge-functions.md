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

## 4. Ehrliche Einschränkungen des Prototyps

- **Systemauth = client_secret** (Demo). Produktiv `private_key_jwt` — der JWT-Pfad im
  Launch-Ticket-Handler ist bewusst *fail-closed* und muss vor Produktivbetrieb ergänzt werden (B4).
- **Cross-Domain-Cookie:** Das `__Host-ga_session`-Cookie wird auf der **Functions-Domain**
  (`*.functions.supabase.co`) gesetzt. Die SPA läuft auf einer **anderen** Domain (Netlify) und
  bekommt dieses Cookie deshalb **nicht** automatisch. Für den curl-Smoke-Test ist das egal (alle
  Aufrufe gehen an die Functions-Domain). Für die **echte SPA-Integration** müssen SPA und Functions
  unter **einer** Domain liegen (z. B. `academy.example.com/*` → SPA, `academy.example.com/sso/*` →
  Functions per Reverse-Proxy/Custom-Domain). Das ist der nächste Integrationsschritt.
- **SPA-Anmeldung:** Die SPA nutzt aktuell noch die Demo-Anmeldung (`loggedIn`-Boolean). Damit die
  SPA die SSO-Session **wirklich** akzeptiert, muss sie beim Start `academy-session/status` prüfen
  statt des Booleans — ein bewusst separater Schritt, um den laufenden Demo-Betrieb nicht zu brechen.
- **P0-Blocker bleibt:** `0002_demo_write_access.sql` muss vor echtem Betrieb zurückgenommen werden,
  sonst umgeht der anon-Key jede Session (B2).

## 5. Was damit bewiesen ist

Nach einem grünen Smoke-Test ist der **Kern des Zielbilds** lauffähig demonstriert: kein Login in der
Academy, backend-vermittelter One-Time-Handshake, atomare Einlösung, serverseitige Session mit
Idle/Absolut-Timeout, Verlängerung und Logout. Die verbleibende Arbeit ist **Integration** (eine Domain,
SPA liest die Session) und **Härtung** (`private_key_jwt`, `0002` zurücknehmen, Rate-Limit/Pen-Test).
