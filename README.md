# ServiceQ Lernplattform

Internationale Lernplattform für **ServiceQ**: Schulungsinhalte werden einmal in einer Master-Sprache erstellt, automatisch (Mistral API) in die Landessprachen von bis zu 30 Märkten übersetzt und den Nutzern der jeweiligen Märkte bereitgestellt.

Dieses Repository enthält aktuell den **klickbaren UI-Prototyp** aus dem Figma-Make-Design „Lernplattform Designbriefing umsetzen" – alle 12 Screens aus dem Designbriefing als React-Anwendung.

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
src/app/App.tsx             Prototyp: alle Screens & Navigation
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

## Go-Live-Checkliste

- **Eigene Domain:** Netlify → Domain management → Add a domain → DNS-Eintrag (CNAME auf die Netlify-Subdomain) setzen; HTTPS-Zertifikat stellt Netlify automatisch aus.
- **Übersetzungs-Worker deployen:** siehe [docs/uebersetzung-worker.md](docs/uebersetzung-worker.md) (Mistral-Key als Supabase-Secret).
- **Impressum & Datenschutz:** Die Platzhalter unter `/impressum` und `/datenschutz` durch juristisch geprüfte Texte ersetzen.
- **Noch offen für den Produktivbetrieb:** echte Anmeldung (Supabase Auth) mit Markt-/Rollen-Sichtbarkeit, Redaktions-Schreibpfad, serverseitiger Lernfortschritt, Monitoring.

## Tests

```bash
npm run test:unit   # 30 Unit-Tests der SSO-Kernlogik (Node)
npm run test:e2e    # 50 End-to-End-Prüfungen im echten Browser (Playwright)
npm test            # beide
```

Der E2E-Lauf baut die Anwendung, startet `vite preview` und fährt die Prozesse für
Administrator, Editor und Lernenden durch (Rollen-Guards, Sprachumschaltung,
Lernfortschritt, Fehlerseiten, Responsive, Barrierefreiheit). Einzelne Phasen:
`node tests/e2e.mjs A B`.

## Dokumentation

- **[Produktstatus](docs/produktstatus.md) – gefundene Lücken, umgesetzte Änderungen, Testergebnisse, offene Punkte, Produktionsreife**
- [Konzept](docs/konzept.md) – Zielbild, Rollen, Datenmodell, Roadmap
- [UX/UI-Designbriefing](docs/ux-ui-design-briefing.md) – Farbsystem, Typografie, Komponenten, Screens

Design-Quelle: [Figma Make – Lernplattform Designbriefing umsetzen](https://www.figma.com/make/IPm9dgZGZgcZO4RLTqdUSQ/Lernplattform-Designbriefing-umsetzen)
