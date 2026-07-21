# Übersetzungs-Worker (Mistral) einrichten

Der Worker ist eine Supabase Edge Function (`supabase/functions/translate-training`). Er setzt den Übersetzungsprozess aus Konzept §5 um: Felder einsammeln → nur Geändertes übersetzen (Hash-Delta) → Status zurückschreiben. Korrigierte Felder (Status *gesperrt*) werden nie überschrieben; ändert sich ihr Quelltext, wechseln sie auf *veraltet*.

## Voraussetzungen

1. **Mistral-API-Key**: Account auf https://console.mistral.ai → API Keys → neuen Key erstellen. (Für den Produktivbetrieb: Auftragsverarbeitungsvertrag mit Mistral abschließen — Konzept §10.)
2. **Supabase CLI** auf deinem Rechner: `npm install -g supabase`

## Deployment (einmalig, ~5 Minuten)

```bash
# Im Projektordner:
supabase login                                   # öffnet den Browser
supabase link --project-ref tkhprexqgjlhtmujcylt

# Mistral-Key als Secret hinterlegen (landet NIE im Repo oder Frontend)
supabase secrets set MISTRAL_API_KEY=<dein-mistral-key>

# Optionaler Zusatzschutz: nur Aufrufe mit diesem Header-Token erlauben
supabase secrets set ADMIN_TOKEN=<beliebiges-langes-geheimnis>

# Funktion deployen
supabase functions deploy translate-training
```

## Übersetzungslauf starten

```bash
curl -X POST "https://tkhprexqgjlhtmujcylt.supabase.co/functions/v1/translate-training" \
  -H "Authorization: Bearer <VITE_SUPABASE_ANON_KEY>" \
  -H "x-admin-token: <ADMIN_TOKEN, falls gesetzt>" \
  -H "Content-Type: application/json" \
  -d '{"training_slug": "dsr-konfiguration-einzelhandel"}'
```

Ohne `languages`-Parameter übersetzt der Worker in **alle Sprachen der zugeordneten Märkte** (außer der Master-Sprache). Gezielt einzelne Sprachen: `{"training_slug": "…", "languages": ["fr", "pl"]}`.

Die Antwort ist eine Zusammenfassung je Sprache:

```json
{
  "training": "DSR – Konfiguration im Einzelhandel",
  "fields": 14,
  "languages": {
    "fr": { "translated": 10, "skipped": 2, "locked": 1, "marked_outdated": 1, "errors": 0 }
  }
}
```

| Zähler | Bedeutung |
|---|---|
| `translated` | neu oder erneut übersetzt (Status → *automatisch*) |
| `skipped` | Quelltext unverändert, Übersetzung aktuell → nicht angefasst |
| `locked` | korrigiertes Feld, Quelltext unverändert → geschützt |
| `marked_outdated` | korrigiertes Feld, Quelltext geändert → auf *veraltet* gesetzt (Prüfliste) |
| `errors` | fehlgeschlagen (Status *Fehler*, Details im Job-Protokoll `translation_job.error_log`) |

## Ergebnis ansehen

In der Lernansicht der App (`/lernen`) über die Sprachauswahl z. B. **Français** wählen: Übersetzte Felder erscheinen in der Zielsprache, fehlende oder fehlerhafte zeigen den Master-Text mit der Kennzeichnung **🌐 Original**.

## Hinweise

- Jeder Lauf protokolliert sich in `translation_job` (Zeitstempel, Status, Fehlerliste je Feld).
- Für die Demo darf jeder mit dem anon-Key den Worker aufrufen. Mit gesetztem `ADMIN_TOKEN` ist der Aufruf zusätzlich abgesichert; im Produktivbetrieb wird der Lauf automatisch beim Veröffentlichen ausgelöst (Redaktions-Ausbaustufe).
- Modell: `mistral-small-latest` — für Schulungstexte ausreichend und günstig; in `index.ts` zentral änderbar.
