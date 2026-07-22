# Supabase einrichten

Das Backend der Lernplattform läuft auf [Supabase](https://supabase.com) (PostgreSQL + Auth + Storage). Ohne konfiguriertes Supabase läuft die App weiter mit eingebauten Demo-Daten — nichts geht kaputt.

## 1. Projekt anlegen

1. https://supabase.com → **New project**
2. Region: **EU (Frankfurt / eu-central-1)** — wichtig für DSGVO (Konzept §7)
3. Ein starkes Datenbank-Passwort wählen und sicher ablegen

## 2. Schema und Seed-Daten einspielen

Im Supabase-Dashboard unter **SQL Editor**:

1. Inhalt von [`supabase/migrations/0001_init.sql`](../supabase/migrations/0001_init.sql) einfügen → **Run**
2. Inhalt von [`supabase/seed.sql`](../supabase/seed.sql) einfügen → **Run**
3. Für die Redaktion (Editor/Übersetzungen mit Schreibzugriff): [`supabase/migrations/0002_demo_write_access.sql`](../supabase/migrations/0002_demo_write_access.sql) einfügen → **Run**. ⚠️ Nur für die Demo — Details und Absicherung: [redaktion.md](redaktion.md).

Danach existiert die komplette Struktur aus dem Konzept (§8): Märkte, Sprachen, Produkt → Modul → Training → Kapitel → Element, polymorphe Übersetzungstabelle, Fortschritt, Jobs — inklusive ServiceQ-Demo-Inhalten (DSR-Training mit Kapiteln, gemischte Übersetzungsstatus für FR/PL/IT).

## 3. Schlüssel in die App bringen

Im Supabase-Dashboard unter **Settings → API** findest du `Project URL` und `anon public`-Key.

**Lokal:** `.env`-Datei im Projektstamm anlegen (Vorlage: `.env.example`):

```
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-public-key>
```

**Netlify:** Site configuration → **Environment variables** → beide Variablen anlegen → neu deployen.

## 4. Sicherheitsmodell (Phase 1)

- **Row Level Security ist auf allen Tabellen aktiv.**
- Anonyme Nutzer können ausschließlich **veröffentlichte** Inhalte lesen (Trainings, Kapitel, Elemente, Übersetzungen) sowie Stammdaten (Märkte, Sprachen).
- Benutzer, Fortschritt, Jobs und Einstellungen sind komplett gesperrt — Schreibzugriffe laufen später ausschließlich serverseitig über den `service_role`-Key (Übersetzungs-Worker, Redaktions-API).
- Der `service_role`-Key gehört **niemals** ins Frontend, in `.env`-Dateien im Repo oder in Netlify-Frontend-Variablen.

## 5. Nächste Ausbaustufen

| Stufe | Inhalt |
|---|---|
| Auth | Supabase Auth (E-Mail/Passwort), `app_user.auth_id` verknüpfen, RLS-Policies auf Markt-/Produkt-/Rollenprüfung verfeinern |
| Redaktion | Schreib-API für Editor-Flows (Entwurf, Veröffentlichen, Struktur-CRUD) |
| Übersetzung | Worker (Edge Function / Cron) mit Mistral-Anbindung, Hash-Delta, Statusmodell |
| Storage | Buckets für Videos/Bilder/Dokumente, sprachspezifische Dateivarianten (`asset.language_code`) |
