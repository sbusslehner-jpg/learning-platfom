# Auth-Architektur: Keycloak + Lernplattform

Verbindlicher Vertrag für alle Bausteine der Authentifizierung. Namen, IDs und
Endpunkte hier sind maßgeblich – Frontend, Backend-Funktionen, Realm-Import und
E-Mail-Theme referenzieren sie.

## Bausteine

| Baustein | Wert |
|---|---|
| Realm | `serviceq` |
| Öffentlicher SPA-Client | `learning-platform` (Authorization Code + **PKCE**, kein Secret) |
| Vertraulicher Backend-Client | `platform-backend` (Service-Account, `manage-users`, `view-users`) |
| Realm-Rollen | `admin`, `editor`, `user` |
| Theme (Login + E-Mail) | `groupit` |
| Benutzerattribute | `markets` (Komma-Liste, z. B. `DE,AT`), `tenant` (z. B. `PHS_AT`) |

## Ablauf: Anmeldung

```
Browser ──1. /authorize (PKCE)──► Keycloak ──2. Login──► Browser
Browser ──3. Code + Verifier─────► Keycloak ──4. Access Token (RS256)
Browser ──5. POST /api/auth/exchange (Keycloak-Token)
                     │ Function prüft Signatur gegen JWKS,
                     │ liest Rollen + Attribute
                     ▼
             Supabase-JWT (HS256, role=authenticated,
             academy_roles, markets, tenant)
Browser ──6. supabase-js mit diesem Token ──► Postgres (RLS greift)
```

**Warum der Austausch?** Supabase-RLS verifiziert JWTs mit dem Projekt-Secret.
Keycloak signiert asymmetrisch mit eigenem Schlüssel. Die Funktion prüft das
Keycloak-Token kryptografisch und stellt daraus ein kurzlebiges, Supabase-konformes
Token aus. Damit bleibt die bestehende Datenschicht unverändert und RLS kann über
`auth.jwt()` auf Rollen und Märkte prüfen.

## Ablauf: Benutzer einladen

```
Admin (UI) ──POST /api/admin/invite──► Function
                                         │ 1. Aufrufer-Token prüfen (Rolle admin)
                                         │ 2. Keycloak: Benutzer anlegen
                                         │    (enabled, emailVerified=false, Attribute)
                                         │ 3. Realm-Rollen zuweisen
                                         │ 4. execute-actions-email
                                         │    ["UPDATE_PASSWORD","VERIFY_EMAIL"]
                                         │ 5. app_user in Supabase anlegen
                                         ▼
                              Keycloak versendet die gestaltete E-Mail
                              (Theme `groupit`, Sprache des Benutzers)
                                         │
User klickt Link ──► Passwort setzen ──► zurück zur Plattform, angemeldet
```

Der eingeladene Benutzer erhält **kein** Initialpasswort – er setzt es selbst über
den Link. Damit wandert nie ein Passwort per E-Mail.

## Endpunkte (Netlify Functions, gleiche Domain wie die SPA)

| Endpunkt | Zweck | Auth |
|---|---|---|
| `POST /api/auth/exchange` | Keycloak-Token → Supabase-Token | Bearer (Keycloak) |
| `POST /api/admin/invite` | Benutzer anlegen + Einladung senden | Bearer (Keycloak, Rolle `admin`) |
| `POST /api/admin/invite/resend` | Einladung erneut senden | Bearer (Keycloak, Rolle `admin`) |

Netlify Functions laufen unter derselben Domain wie die Oberfläche – kein CORS,
kein zusätzlicher Dienst, und die Keycloak-Client-Credentials bleiben serverseitig.

## Umgebungsvariablen

**Frontend (Netlify, `VITE_`-Präfix ist öffentlich sichtbar – keine Geheimnisse):**
```
VITE_KEYCLOAK_URL=https://auth.example.com
VITE_KEYCLOAK_REALM=serviceq
VITE_KEYCLOAK_CLIENT_ID=learning-platform
```

**Backend (Netlify, serverseitig – niemals mit `VITE_`-Präfix):**
```
KEYCLOAK_URL=https://auth.example.com
KEYCLOAK_REALM=serviceq
KEYCLOAK_BACKEND_CLIENT_ID=platform-backend
KEYCLOAK_BACKEND_CLIENT_SECRET=<Secret aus Keycloak>
SUPABASE_URL=https://<ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
SUPABASE_JWT_SECRET=<JWT-Secret aus Supabase: Settings → API>
PLATFORM_URL=https://<netlify-site>
```

## Betriebsmodi

Die Oberfläche unterstützt zwei Modi, damit die Vorführung nicht bricht:

- **Keycloak-Modus:** `VITE_KEYCLOAK_URL` gesetzt → echte Anmeldung, Rollen aus dem
  Token, kein Rollenwechsel in der Oberfläche.
- **Demo-Modus:** Variable nicht gesetzt → bisheriges Verhalten (Demo-Anmeldung,
  umschaltbare Rollen). Für Produktivbetrieb **nicht** zulässig.

## Nächste Schritte

Einrichtung: [`docs/keycloak-setup.md`](../docs/keycloak-setup.md)
