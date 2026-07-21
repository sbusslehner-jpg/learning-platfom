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

- [Vite](https://vite.dev) + React 18 + TypeScript
- [Tailwind CSS 4](https://tailwindcss.com)
- [shadcn/ui](https://ui.shadcn.com)-Komponentenbasis (`src/app/components/ui`)
- [Lucide](https://lucide.dev) Icons · [sonner](https://sonner.emilkowal.ski) Toasts

## Struktur

```
docs/                       Konzept & UX/UI-Designbriefing
src/app/App.tsx             Prototyp: alle Screens & Navigation
src/app/components/ui/      shadcn/ui-Komponentenbibliothek
src/styles/                 Design-Tokens (GroupIT: Türkis #00C8C1, Anthrazit #3A424E)
src/imports/                Assets aus Figma (GroupIT-Logo u. a.)
src/guidelines/             Design-Guidelines aus Figma Make
```

## Dokumentation

- [Konzept](docs/konzept.md) – Zielbild, Rollen, Datenmodell, Roadmap
- [UX/UI-Designbriefing](docs/ux-ui-design-briefing.md) – Farbsystem, Typografie, Komponenten, Screens

Design-Quelle: [Figma Make – Lernplattform Designbriefing umsetzen](https://www.figma.com/make/IPm9dgZGZgcZO4RLTqdUSQ/Lernplattform-Designbriefing-umsetzen)
