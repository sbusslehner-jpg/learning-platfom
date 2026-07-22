# Redaktion (Editor & Übersetzungen)

Die Redaktionsoberfläche schreibt jetzt **echt** in Supabase — Trainings anlegen und bearbeiten, veröffentlichen, Übersetzungen korrigieren. Damit das ohne Login funktioniert, öffnet die Migration `0002_demo_write_access.sql` die redaktionellen Tabellen bewusst für den anonymen Client (**Demo-Modus**).

## Aktivierung

1. Im Supabase **SQL Editor** die Migration `supabase/migrations/0002_demo_write_access.sql` ausführen (nach `0001_init.sql` und `seed.sql`).
2. Optional den Übersetzungs-Worker deployen (siehe [uebersetzung-worker.md](uebersetzung-worker.md)), damit „Veröffentlichen" und „Neu übersetzen" echte Mistral-Läufe starten.

## Was jetzt funktioniert

**Editor – Inhalte** (`/redaktion/inhalte`)
- Der Inhaltsbaum lädt Produkt → Modul → Training aus der Datenbank (inkl. Entwürfen, mit echten Status-Badges).
- „+ Training" legt ein neues Training (Entwurf) im gewählten Modul an und öffnet es direkt.

**Editor – Trainingseditor** (`/redaktion/editor/<id>`)
- Lädt Kapitel und Elemente des Trainings.
- Titel, Kapitel und alle Elementinhalte (Text, Schritte, Video, Bild, Dokument, Link) werden bearbeitet und **automatisch gespeichert** (sichtbarer Zeitstempel).
- „+ Kapitel", „+ Element" und Löschen schreiben direkt in die DB.
- **Veröffentlichen** setzt den Status auf *published*, ordnet die gewählten Märkte zu und stößt den Übersetzungslauf an.

**Übersetzungen – Übersicht** (`/uebersetzungen`)
- Zeigt je veröffentlichtem Training die Sprachgesundheit (aktuell / veraltet / Fehler / fehlend) als Zeilen je Sprache — aus echten Daten aggregiert.

**Übersetzungen – Prüfansicht** (`/uebersetzungen/pruefen/<id>/<sprache>`)
- Master ↔ Übersetzung nebeneinander.
- „Korrigieren & sperren" speichert die Korrektur (Status *gesperrt*) — die Automatik überschreibt sie nie mehr.
- „Neu übersetzen" startet den Mistral-Worker für die Sprache.

## Noch nicht verdrahtet (bewusst, Demo-Grenzen)

- **Drag-&-Drop-Sortierung** von Kapiteln/Elementen ist optisch vorhanden, aber nicht aktiv (Reihenfolge über `sort`-Feld in der DB).
- **Vorschau**-Button im Editor.
- **Datei-Uploads** (Video/Bild/PDF) — Storage-Buckets sind im Konzept vorgesehen, aber noch nicht angebunden.

## ⚠️ Absicherung vor Go-Live (wichtig)

`0002_demo_write_access.sql` erlaubt **jedem** mit dem anon-Key Lese- und Schreibzugriff auf die Inhalte. Das ist ausschließlich für die Demo vertretbar. Vor einem echten Betrieb:

1. Supabase Auth aktivieren, `app_user.auth_id` mit `auth.users` verknüpfen.
2. Migration `0002` zurücknehmen und durch auth-basierte Policies ersetzen:
   - Schreibzugriff nur für Nutzer mit Editor-Rolle.
   - Anonyme/User-Rolle liest nur **veröffentlichte** Inhalte der eigenen Märkte (wie in `0001` angelegt).
3. Den `ADMIN_TOKEN`-Schutz des Workers aktivieren und Übersetzungsläufe serverseitig beim Veröffentlichen auslösen statt aus dem Browser.
