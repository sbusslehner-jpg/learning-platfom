# Verbessertes Zielkonzept & Implementierungsplan

**Bezug:** `01-architektur-challenge.md`. Dieses Dokument passt das Konzept an die reale GITacademy-Architektur (Vite-SPA + Supabase) an und beschreibt die als Referenz umgesetzten Artefakte.

> **[Annahme A1]** GITacademy = diese Codebasis. **[Annahme A2]** ServiceQ besitzt ein eigenes Backend, das ein asymmetrisches Client-Assertion-JWT signieren kann (für `private_key_jwt`). **[Annahme A3]** Ein Supabase-Projekt in EU-Region steht bereit; Edge Functions und `pgcrypto` sind aktivierbar.

---

## 1. Zielarchitektur (stack-adaptiert)

Da kein klassischer Applikationsserver existiert, wird der **serverseitige Vertrauensanker als Supabase Edge Functions (Deno) + Postgres** realisiert. Die Session ist eine Zeile in `academy_session`; der Browser hält **nur** ein opaques, serverseitig auflösbares Cookie — nie Nutzdaten, nie einen DB-Schlüssel.

```
Benutzer (Browser)
   │  1. Klick "GITacademy öffnen" (in ServiceQ)
   ▼
ServiceQ Backend ──2. private_key_jwt──► [Edge] academy-launch-ticket
   │                                          │ 3. validieren, Rollen/Ziel/Tenant mappen,
   │                                          │    Benutzer JIT-provisionieren,
   │                                          │    Ticket (gehasht) speichern
   │  ◄── launchUrl + expiresAt ──────────────┘
   ▼
Browser ─4. Form-POST code──► [Edge] academy-consume
                                   │ 5. consume_launch_ticket() ATOMAR (compare-and-swap)
                                   │ 6. academy_session anlegen, Session-ID rotieren
                                   │ 7. Set-Cookie __Host-ga_session (HttpOnly)
                                   │ 8. 303 See Other → internes Ziel (ohne Code)
                                   ▼
Browser ──Cookie──► [Edge] academy-session (status / extend / logout)
                    Fachdaten-Endpunkte prüfen Session serverseitig (kein anon-Key!)
```

**Abgrenzung zum Original:** Statt „Server-Session-Framework" tritt „Postgres-Session-Tabelle + Edge Function". Statt Framework-CSRF-Token tritt das Double-Submit-Muster mit einem zweiten, nicht-HttpOnly `__Host-ga_csrf`-Cookie, das die SPA im `X-CSRF-Token`-Header spiegelt. Alles andere folgt dem Konzept.

---

## 2. Sicherheitsobjekte (konkret)

| Objekt | Realisierung | Speicherort |
|---|---|---|
| Systemauth ServiceQ→GA | `private_key_jwt` (Client Assertion), Fallback Client-Secret pro Umgebung | ServiceQ-Backend + GA `sso_client` (nur Public Key / Secret-Hash) |
| Launch-Ticket | 256-bit Zufalls-Code, **nur SHA-256-Hash** in `launch_ticket`, TTL 120 s, single-use, an subject+tenant+target gebunden | Postgres |
| Academy-Session | Opaques 256-bit Handle, **nur Hash** in `academy_session`; Idle 30 min / Absolut 12 h | Postgres; Cookie nur Handle |
| CSRF-Token | Double-Submit; `__Host-ga_csrf` (nicht HttpOnly) ↔ `X-CSRF-Token`-Header | Cookie + Header |

---

## 3. Umgesetzte Artefakte (Referenzimplementierung)

| Artefakt | Datei | Ausführbar hier? |
|---|---|---|
| Schema + atomare Einlösung | `supabase/migrations/0003_serviceq_sso.sql` | Nein (kein Postgres in dieser Umgebung) |
| Geteilte Kernlogik (framework-neutral, Web-Crypto) | `supabase/functions/_shared/sso.ts` | Import getestet über Node |
| **Unit-Tests der Kernlogik** | `supabase/functions/_shared/sso.test.ts` | **Ja — real mit `node --test` ausgeführt** |
| Edge: Ticket erstellen | `supabase/functions/academy-launch-ticket/index.ts` | Nein (Deno-Runtime fehlt) |
| Edge: Ticket einlösen | `supabase/functions/academy-consume/index.ts` | Nein (Deno-Runtime fehlt) |
| Edge: Session status/extend/logout | `supabase/functions/academy-session/index.ts` | Nein (Deno-Runtime fehlt) |
| Frontend: Timeout-Modal + Expired-Page | `src/app/components/SessionTimeout.tsx`, `src/app/pages/SessionExpiredPage.tsx` | Build geprüft (`vite build`) |

> **Ehrliche Kennzeichnung:** „Ausführbar hier?" = ob das Artefakt in **dieser** Entwicklungsumgebung tatsächlich lief. Ein „Nein" heißt **nicht** „ungetestet by design", sondern „hier nicht ausgeführt, weil Deno/Postgres fehlen". Die dafür nötigen Integrations-, DB- und E2E-Tests sind in `01`/diesem Dokument als **offen** ausgewiesen und dürfen nicht als bestanden gelten.

---

## 4. Atomare Einlösung (Kern gegen Replay & Parallel-Consume)

Die Einlösung ist eine **einzige** `UPDATE ... WHERE status='unused' AND expires_at > now() RETURNING`-Anweisung, gekapselt in der Funktion `consume_launch_ticket(code_hash)`. Postgres garantiert, dass bei zwei parallelen Requests nur **einer** die Zeile von `unused`→`used` dreht und einen Datensatz zurückbekommt; der andere erhält null → wird abgewiesen. Kein `SELECT`-dann-`UPDATE`-Fenster, keine Doppelsession.

---

## 5. Session-Verhalten (präzisiert, vgl. B8/B9)

- **Idle-Timeout 30 min:** verlängert nur durch **anerkannte** Aktivität (Navigation, Fortschritt speichern, Quiz, bewusste Interaktion). Reines Video/Hintergrund-Poll zählt **nicht** (B8).
- **Absolut 12 h:** ab Session-Erstellung, durch nichts verlängerbar. „24 h" ist reine Admin-Konfig-Obergrenze, **keine** zweite Laufzeit (B9).
- **Warnung 5 min vorher:** `SessionTimeout`-Modal, sekundengenauer Countdown, a11y (Fokusfalle, Screenreader-Ankündigung), i18n.
- **Rotation:** Bei Consume wird eine neue Session-ID erzeugt; eine evtl. vorhandene anonyme Session wird nicht weiterverwendet (Fixation-Schutz).
- **Ablauf/Logout:** serverseitige Invalidierung, Cookie-Löschung, Weiterleitung auf Expired-Page mit „Zurück zu ServiceQ" (Rückleitung nur aus `sso_client.return_url`, nie Loginseite, nie Request-Wert — B7).

---

## 6. Benutzer- & Rollen-Mapping

- **Schlüssel:** `external_user_key = issuer:tenant:subject` (B3), `unique(issuer,tenant,subject)`. E-Mail nicht unique.
- **JIT-Provisioning:** Suche über externen Schlüssel → anlegen/aktualisieren → Markt/Org/Rollen zuordnen → Zielzugriff prüfen → Session.
- **Rollen-Allowlist:** `sso_role_map` + Config; unbekannte Rolle → Minimalrolle `learner` **oder** Ablehnung (konfigurierbar, Default: Ablehnung für Editor/Admin-nahe Rollen, `learner` sonst).
- **Zielautorisierung:** `target.type/id` gegen `allowed_target_types` + interne Auflösung; nur veröffentlichte, für Markt/Mandant freigegebene Ziele.

---

## 7. Implementierungsplan (Pakete, an Konzept §22 angelehnt)

1. **Basis (P0/P1):** Schema `0003`, atomare Einlösung, Edge Functions, opaques Cookie, Redirect. → *als Referenz umgesetzt.*
2. **Absicherung Bestand (P0):** `0002` zurücknehmen, Fachdatenzugriff hinter Session-geprüfte Endpunkte legen. → *dokumentiert, nicht ausgeführt (Bestand nicht destabilisiert).* 
3. **Benutzer/Rollen (P1):** JIT, Allowlist-Mapping, Zielautorisierung. → *Kernlogik umgesetzt + getestet.*
4. **Session-UX (P1/P2):** Timeout-Modal, Extend, Expired, Multi-Tab. → *Frontend-Komponenten umgesetzt, build-geprüft.*
5. **Betrieb/Security (P1):** Audit, Rate-Limit, Monitoring, Credential-Rotation, Pen-Test. → *Audit/Rate-Limit im Schema skizziert; Pen-Test offen.*
6. **Integration/Rollout:** ServiceQ-Test-Client, E2E, Last-/Fehlertests, Pilotmarkt. → *offen, benötigt lauffähige Supabase-Umgebung.*

---

## 8. Offene Risiken & Entscheidungen (verbindlich vor Go-Live)

- **[P0]** `0002_demo_write_access.sql` zurücknehmen; ohne das ist der gesamte Handshake wirkungslos (B2).
- **[P0/Entscheidung]** OIDC vs. bespoke Handshake final entscheiden (B14). Empfehlung: OIDC, falls IdP/OP verfügbar.
- **[P1]** Systemauth-Verfahren fixieren (`private_key_jwt` empfohlen, B4).
- **[P1]** Stabilen `subject` aus ServiceQ verbindlich zusagen (B3).
- **[P1]** Rückleitungsziel je Tenant konfigurieren (B7).
- **[P2]** Video-als-Aktivität final auf „nein/eingeschränkt" (B8).
- **[P2]** DSGVO: E-Mail/Name wirklich nötig? AVV Mistral, Aufbewahrungsfristen (B10).
- **Nicht ausgeführt hier:** DB-Atomarität unter Last, Cookie-/Redirect-Verhalten, End-to-End, Pen-Test, Lasttest. Diese sind **erst in einer lauffähigen Supabase-Umgebung** verifizierbar und gelten bis dahin als **nicht bestanden**.
