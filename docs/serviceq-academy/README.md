# ServiceQ → GITacademy: SSO-Anbindung

Architektur-Challenge, verbessertes Zielkonzept und Referenzimplementierung für die
Anbindung von ServiceQ an die GITacademy per Token-Handshake.

## Inhalt

| Datei | Zweck |
|---|---|
| [`Anbindung-ServiceQ-an-die-GITacademy.pdf`](Anbindung-ServiceQ-an-die-GITacademy.pdf) | Zusammenfassende technische Dokumentation (PDF) |
| [`01-architektur-challenge.md`](01-architektur-challenge.md) | 15 Befunde mit Priorität · Problem · Auswirkung · Verbesserung |
| [`02-zielkonzept-und-plan.md`](02-zielkonzept-und-plan.md) | Stack-adaptiertes Zielkonzept + Implementierungsplan + offene Risiken |
| [`03-deploy-edge-functions.md`](03-deploy-edge-functions.md) | **Option A:** Prototyp ohne eigenen Server auf Supabase Edge Functions deployen + Smoke-Test |

## Referenzimplementierung im Repository

| Artefakt | Datei | In dieser Umgebung ausgeführt? |
|---|---|---|
| Schema + atomare Einlösung + RLS | `supabase/migrations/0003_serviceq_sso.sql` | Nein (kein Postgres) |
| Kernlogik (framework-neutral, Web-Crypto) | `supabase/functions/_shared/sso.ts` | Ja (über Node getestet) |
| Unit-Tests | `supabase/functions/_shared/sso.test.ts` | **Ja — 23/23 bestanden** |
| Edge: Ticket erstellen | `supabase/functions/academy-launch-ticket/index.ts` | Nein (kein Deno) |
| Edge: Ticket einlösen | `supabase/functions/academy-consume/index.ts` | Nein (kein Deno) |
| Edge: Session status/extend/logout | `supabase/functions/academy-session/index.ts` | Nein (kein Deno) |
| Frontend: Timeout-Modal | `src/app/components/SessionTimeout.tsx` | Build geprüft |
| Frontend: SSO-Fehler-/Expired-Seiten | `src/app/pages/SsoPages.tsx` | Build geprüft |

## Tests reproduzieren

```bash
# Kernlogik (real ausführbar mit Node 22):
node --experimental-strip-types --test supabase/functions/_shared/sso.test.ts

# Frontend-Build:
npm run build
```

## Ehrliche Kennzeichnung

„Umgesetzt" = Code liegt im Repository. „Getestet" = in dieser Entwicklungsumgebung tatsächlich
ausgeführt. DB-Atomarität unter Last, Cookie-/Redirect-Verhalten, End-to-End sowie Last-/Penetrationstests
wurden **nicht** ausgeführt (keine Deno-/Postgres-Laufzeit) und gelten als **offen**. Vor Produktivbetrieb
ist zwingend `0002_demo_write_access.sql` zurückzunehmen (siehe Befund B2).
