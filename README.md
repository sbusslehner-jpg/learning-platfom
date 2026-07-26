# ServiceQ Lernplattform

Internationale Lernplattform für **ServiceQ**: Schulungsinhalte werden einmal in einer Master-Sprache erstellt, automatisch (Mistral API) in die Landessprachen von bis zu 30 Märkten übersetzt und den Nutzern der jeweiligen Märkte bereitgestellt.

Die Anwendung setzt das Figma-Make-Design „Lernplattform Designbriefing umsetzen" um: Lernbereich, Redaktion und Verwaltung arbeiten auf einer Supabase-Datenbank, die Anmeldung läuft über Keycloak, Rollen und Sichtbarkeit werden serverseitig durchgesetzt. Stand der Produktionsreife: [docs/produktionsreife.md](docs/produktionsreife.md).

## Screens

- **Lernen:** Login · Dashboard „Start" · Katalog · Trainingsübersicht · Lernansicht (Kapitel, Video, Schrittanleitung) · Abschluss-Screen
- **Redaktion:** Inhaltsbaum · Trainingseditor · Übersetzungs-Übersicht · Side-by-side-Prüfansicht
- **Verwaltung:** Benutzer · Märkte & Sprachen · Einstellungen (Mistral-API)

## Entwicklung

```bash
npm install
npm run dev      # Dev-Server (Vite)
npm run build    # Produktions-Build
npm run preview  # Build lokal testen
```

## Stack

- [Vite](https://vite.dev) + React 18 + TypeScript · [React Router](https://reactrouter.com)
- [Tailwind CSS 4](https://tailwindcss.com)
- [shadcn/ui](https://ui.shadcn.com)-Komponentenbasis (`src/app/components/ui`)
- [Lucide](https://lucide.dev) Icons · [sonner](https://sonner.emilkowal.ski) Toasts
- [Supabase](https://supabase.com) (PostgreSQL, EU-Region) als Backend — Einrichtung: [docs/supabase-setup.md](docs/supabase-setup.md). Ohne konfigurierte Umgebungsvariablen läuft die App mit Demo-Daten.

## Struktur

```
docs/                       Konzept & UX/UI-Designbriefing
auth/                       Keycloak-Stack: compose, Realm-Import, E-Mail-Theme
netlify/functions/          Token-Austausch und Benutzer-Einladung
src/app/App.tsx             Shell: Auth-Gate, Routen, Layout
src/app/components/ui/      shadcn/ui-Komponentenbibliothek
src/styles/                 Design-Tokens (GroupIT: Türkis #00C8C1, Anthrazit #3A424E)
src/imports/                Assets aus Figma (GroupIT-Logo u. a.)
src/guidelines/             Design-Guidelines aus Figma Make
```

## Authentifizierung (Keycloak)

Produktivbetrieb läuft über **Keycloak** (Authorization Code + PKCE). Der Stack liegt
unter [`auth/`](auth/) und startet mit einem Befehl:

```bash
cd auth && cp .env.example .env && docker compose up -d
```

Der Realm `serviceq` wird automatisch importiert – mit Rollen, Clients, SMTP und einem
**Administrator-Konto**. Zugangsdaten, Einladungs-Ablauf und Produktionshärtung:
[docs/keycloak-setup.md](docs/keycloak-setup.md) · Architekturvertrag: [auth/README.md](auth/README.md)

Administratoren laden neue Benutzer direkt in der Oberfläche ein
(**Verwaltung → Benutzer → Benutzer einladen**): Das Konto wird in Keycloak angelegt,
der Benutzer erhält eine im GroupIT-Design gestaltete E-Mail und setzt sein Passwort
selbst über einen zeitlich begrenzten Link. Es wird nie ein Passwort versendet.

Ohne gesetzte `VITE_KEYCLOAK_*`-Variablen läuft die Anwendung weiter im Demo-Modus.
Die `VITE_*`-Werte werden **beim Build** eingesetzt: Solange sie in Netlify fehlen,
zeigt auch die Produktionsseite die Demo-Anmeldung – siehe
**[docs/inbetriebnahme.md](docs/inbetriebnahme.md)** für den Weg von der Demo zur
echten Anmeldung in acht Schritten. Auf einem eigenen Server erledigt das ein Skript:

```bash
./auth/hetzner-setup.sh auth.deine-domain.de mail@deine-domain.de \
                        https://deine-site.netlify.app admin@deine-domain.de
```

Docker, Firewall, Passwörter, HTTPS-Zertifikat, Realm-Import, tägliche Sicherung
und ein Selbsttest in einem Lauf – Details in
[docs/hetzner-keycloak.md](docs/hetzner-keycloak.md).

## Go-Live-Checkliste

- **Eigene Domain:** Netlify → Domain management → Add a domain → DNS-Eintrag (CNAME auf die Netlify-Subdomain) setzen; HTTPS-Zertifikat stellt Netlify automatisch aus.
- **Übersetzungs-Worker deployen:** siehe [docs/uebersetzung-worker.md](docs/uebersetzung-worker.md) (Mistral-Key als Supabase-Secret).
- **Impressum & Datenschutz:** Die Platzhalter unter `/impressum` und `/datenschutz` durch juristisch geprüfte Texte ersetzen.
- **Berechtigungen produktiv schalten:** `supabase/migrations/0005_production_rls.sql` einspielen (nimmt die Demo-Schreibrechte zurück) und die Kontrollabfrage ausführen – siehe [docs/keycloak-setup.md](docs/keycloak-setup.md), Abschnitt 6.
- **Produktions-SMTP** für Keycloak samt SPF/DKIM/DMARC einrichten, sonst landen Einladungen im Spam.
- **Noch offen:** serverseitiger Lernfortschritt, Datei-Uploads, Monitoring – Details in [docs/produktionsreife.md](docs/produktionsreife.md).

## Tests

```bash
npm run test:unit       # 30 Unit-Tests der SSO-Kernlogik
npm run test:functions  # 34 Tests der Auth-Funktionen (Mock-Keycloak)
npm run test:e2e        # 50 End-to-End-Prüfungen im Browser (Demo-Modus)
npm run test:keycloak   # 10 Prüfungen des OIDC-Absprungs (Keycloak-Modus)
npm test                # alle vier
```

Der E2E-Lauf baut die Anwendung, startet `vite preview` und fährt die Prozesse für
Administrator, Editor und Lernenden durch (Rollen-Guards, Sprachumschaltung,
Lernfortschritt, Fehlerseiten, Responsive, Barrierefreiheit). Einzelne Phasen:
`node tests/e2e.mjs A B`.

## Dokumentation

- **[Inbetriebnahme](docs/inbetriebnahme.md) – Schritt-für-Schritt von der Demo zur echten Anmeldung**
- [Keycloak auf Hetzner](docs/hetzner-keycloak.md) – eigener Server per Setup-Skript, Zugriff über VS Code Remote-SSH
- **[Produktionsreife](docs/produktionsreife.md) – Stand nach der Keycloak-Anbindung, Testergebnisse, verbleibende Schritte**
- [Produktstatus](docs/produktstatus.md) – gefundene Lücken und umgesetzte Änderungen der Finalisierung
- [Keycloak einrichten](docs/keycloak-setup.md) – Stack, Admin-Konto, Einladungen, E-Mails
- [Konzept](docs/konzept.md) – Zielbild, Rollen, Datenmodell, Roadmap
- [UX/UI-Designbriefing](docs/ux-ui-design-briefing.md) – Farbsystem, Typografie, Komponenten, Screens

Design-Quelle: [Figma Make – Lernplattform Designbriefing umsetzen](https://www.figma.com/make/IPm9dgZGZgcZO4RLTqdUSQ/Lernplattform-Designbriefing-umsetzen)
