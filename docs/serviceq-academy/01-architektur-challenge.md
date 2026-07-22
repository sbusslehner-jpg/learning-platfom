# Architektur-Challenge: ServiceQ → GITacademy Token-Handshake

**Rolle:** Enterprise- & Security-Architektur-Review
**Prüfgegenstand:** `GITacademy_ServiceQ_Token_Handshake_Implementation.md` (Umsetzungskonzept)
**Zielsystem-Codebasis:** GITacademy = Vite + React 18 SPA (Netlify), Backend ausschließlich Supabase (PostgreSQL + RLS + Deno Edge Functions). Kein eigener Applikationsserver.

---

## 0. Zusammenfassung (Management Summary)

Das geprüfte Konzept ist **fachlich fundiert und security-bewusst** — es benennt die richtigen Bausteine (opaques One-Time-Ticket, atomare Einlösung, serverseitige Session, Rollen-Allowlist, ID-basierte Zielauflösung). Es hat aber eine **grundlegende Architektur-Annahme, die auf der aktuellen GITacademy nicht zutrifft:** Es setzt einen zustandsbehafteten Applikationsserver voraus, der serverseitige Sessions verwaltet, HttpOnly-Session-Cookies rotiert und CSRF-Tokens ausstellt.

Die GITacademy besitzt heute **keinen solchen Server**. Sie ist eine statische Single-Page-App, deren einziges Backend Supabase ist; die Anmeldung ist aktuell eine Attrappe (`loggedIn`-Boolean in `src/app/App.tsx`), und der ausgelieferte anon-Key erlaubt über die Demo-Policy `0002_demo_write_access.sql` sogar direkten Schreibzugriff aus dem Browser.

> **[Annahme A1]** „GITacademy" bezeichnet in diesem Review die vorliegende Codebasis `sbusslehner-jpg/learning-platfom`. Falls in Ihrer Organisation eine andere, serverbasierte GITacademy gemeint ist (z. B. Next.js/Laravel/Moodle), verschieben sich die Machbarkeitsbefunde B1/B2 entsprechend — die Security-Befunde bleiben gültig.

**Kernaussage:** Das Zielbild ist erreichbar, aber **nicht ohne einen serverseitigen Vertrauensanker**. Der billigste tragfähige Weg in dieser Codebasis ist, die SSO-Endpunkte als **Supabase Edge Functions** mit einem **Postgres-basierten Ticket- und Session-Store** und einem **opaquen HttpOnly-`__Host-`-Cookie** zu implementieren — bewusst **neben** Supabase Auth, dessen Client-Token-Modell mehreren Konzeptanforderungen widerspricht.

---

## 1. Befunde (Priorität · Problem · Auswirkung · Verbesserung)

Priorität: **P0** = blockierend, **P1** = hoch, **P2** = mittel, **P3** = niedrig.

### B1 · P0 · Kein Server, keine serverseitige Session

- **Problem:** Das Konzept fordert serverseitig verwaltete Sessions, Session-ID-Rotation, HttpOnly-Cookie, CSRF-Token und Extend/Logout-Endpunkte (§7). Die GITacademy ist eine statische SPA ohne Applikationsserver; das einzige serverseitige Ausführungsmodell ist die Supabase Edge Function (Deno). Supabase Auth wiederum legt Access-/Refresh-Token per Default im `localStorage` ab — genau das, was §7.1 verbietet.
- **Auswirkung:** Das Konzept ist auf der aktuellen Architektur **nicht 1:1 umsetzbar**. Ohne serverseitigen Vertrauensanker gibt es keine fälschungssichere Session, kein echtes Idle/Absolut-Timeout und keinen wirksamen Direktzugriffsschutz.
- **Verbesserung:** SSO-Endpunkte als Edge Functions realisieren; Session als Zeile in einer `academy_session`-Tabelle mit **opaquem, serverseitig gespeicherten** Session-Handle; Auslieferung als `__Host-`-Cookie (`HttpOnly; Secure; SameSite=Lax; Path=/`). Supabase Auth für diesen Flow **nicht** verwenden. → umgesetzt als Referenz in `0003_serviceq_sso.sql` + `supabase/functions/academy-*`.

### B2 · P0 · anon-Key + Demo-RLS hebeln jeden Zugriffsschutz aus

- **Problem:** Die SPA liefert den Supabase-anon-Key aus, und `0002_demo_write_access.sql` gewährt `anon` Voll-Lese/Schreibzugriff auf Inhalte inkl. Entwürfe. Damit kann jeder mit den Browser-DevTools direkt auf die Datenbank zugreifen — **komplett an jeder SSO-Session vorbei**.
- **Auswirkung:** Das verbindliche Zielbild „Direkte Academy-URLs, Bookmarks oder abgelaufene Sessions dürfen keinen Zugriff ermöglichen" ist **unerfüllbar**, solange der Browser einen DB-fähigen Schlüssel hält. Der gesamte Token-Handshake wäre Fassade.
- **Auswirkung (konkret):** Ein Angreifer liest `training`, `content_element`, `translation` etc. ohne jedes Ticket. Schreibzugriff ermöglicht Manipulation von Schulungsinhalten.
- **Verbesserung:** Vor Produktivsetzung `0002` zurücknehmen. Fachdatenzugriff **ausschließlich** über autorisierte Edge Functions, die die SSO-Session prüfen, **oder** RLS-Policies, die an die SSO-Identität gebunden sind. Der Browser darf keinen schreibenden DB-Schlüssel besitzen. (Siehe auch `docs/redaktion.md`, Abschnitt „Absicherung vor Go-Live".)

### B3 · P1 · E-Mail als impliziter Primärschlüssel im Datenmodell

- **Problem:** Das Konzept fordert korrekt `external_user_key = issuer + tenant + subject` (§6.1) und „E-Mail nicht als alleiniger Schlüssel". Die vorhandene Tabelle `app_user` (in `0001_init.sql`) hat jedoch `email text not null unique` und keinen Platz für externe Identitäten. JIT-Provisioning würde bei Namensgleichheit/E-Mail-Kollision brechen oder fremde Konten überschreiben.
- **Auswirkung:** Zwei ServiceQ-Benutzer mit gleicher E-Mail, aber unterschiedlichem `subject` (Konzept-Testfall 19.4 „doppelte E-Mail bei unterschiedlichen Subjects") kollidieren. Account-Takeover-Risiko bei E-Mail-Recycling.
- **Verbesserung:** `app_user` um `issuer`, `tenant`, `subject` und `unique(issuer,tenant,subject)` erweitern; `email` auf `nullable` und **nicht** unique setzen; Suche/Upsert nur über den externen Schlüssel. → umgesetzt in `0003_serviceq_sso.sql`.

### B4 · P1 · Systemauthentifizierung: API-Key ist zu schwach, „Übergangslösung" wird dauerhaft

- **Problem:** §2.1 listet API-Key als niedrigste Option „nur als Übergang". Erfahrungsgemäß wird die Übergangslösung dauerhaft. Ein statischer Bearer-API-Key ist gegen Leak (Proxy-Logs, Fehlermeldungen) schlecht geschützt und nicht rotierbar ohne Downtime.
- **Auswirkung:** Kompromittierter Key erlaubt beliebige Launch-Tickets für beliebige `subject`-Werte → vollständige Identitätsübernahme jedes ServiceQ-Nutzers.
- **Verbesserung:** `private_key_jwt` (OAuth 2.0 Client Credentials, RFC 9700) oder mTLS als Zielbild verbindlich machen. Für die Referenzimplementierung: signiertes Client-Assertion-JWT (asymmetrisch), Schlüssel nur in ServiceQ + Secret Store; parallele Key-Gültigkeit während Rotation. Mindestens: Client-Secret pro Umgebung, nie im Repo, IP-Allowlist als Zusatzschicht.

### B5 · P1 · Idempotency-Semantik ist explizit „offen" — Replay-/Ticketflut-Risiko

- **Problem:** §5.1 lässt das genaue Verhalten des `Idempotency-Key` offen („Das genaue Verhalten ist festzulegen"). Undefinierte Idempotenz führt entweder zu Ticketfluten (jeder Retry ein neues Ticket) oder zu subtilen Race-Conditions.
- **Auswirkung:** Ohne exakt-einmal-Semantik kann ein Netzwerk-Retry mehrere gültige Tickets für denselben Nutzer erzeugen; jedes ist ein eigenständiges Einlöse-Fenster (Angriffsfläche vergrößert).
- **Verbesserung:** Verbindlich: `Idempotency-Key` wird pro `(client, key)` gespeichert; identischer Key innerhalb des TTL liefert **dasselbe** Ticket-Ergebnis zurück (kein neues Ticket). Abweichender Body bei gleichem Key → `409`. → in `0003` als `unique(client_id, idempotency_key)` modelliert.

### B6 · P1 · Direktzugriffs- und Bookmark-Schutz braucht mehr als „Ticket ist Einmal"

- **Problem:** Das Zielbild verlangt, dass Bookmarks/abgelaufene Sessions **keinen** Zugriff geben. Das Konzept sichert die **Einlöse-URL** (Ticket einmalig), adressiert aber nicht, dass **jede** fachliche Route (`/lernen`, `/redaktion/...`) serverseitig gegen eine gültige Session geprüft werden muss. In einer SPA ist client-seitiges Routing **kein** Schutz.
- **Auswirkung:** Ein Bookmark auf `/lernen` rendert in der SPA die Seite; erst der Datenzugriff müsste scheitern — was er wegen B2 aktuell nicht tut.
- **Verbesserung:** Jeder fachliche Datenzugriff läuft über einen Endpunkt, der das Session-Cookie serverseitig prüft (gültig, nicht idle/absolut abgelaufen). Bei ungültig → 401 + Weiterleitung auf die Expired-Page mit „Zurück zu ServiceQ", **nie** auf eine Academy-Loginseite. → Session-Validierung in `academy-session` + `validateSession()`.

### B7 · P1 · Rückleitungs-URL zu ServiceQ ist ein Open-Redirect-Vektor

- **Problem:** §14 `return_url.serviceq: "TBD"`. Wenn die Rückleitung aus einem Request-Wert stammt, ist es ein klassischer Open Redirect (§18 nennt Open Redirect als Testfall, aber die return_url bleibt offen).
- **Auswirkung:** Phishing über manipulierte Rückleitung; Reputationsschaden.
- **Verbesserung:** Rückleitungsziel **ausschließlich** aus serverseitiger Konfiguration pro Tenant, nie aus Request/Query. Genau wie das Konzept es für `target` (ID statt URL) bereits richtig macht — dieselbe Regel auf die Rückleitung anwenden. → `sso_client.return_url` in `0003`.

### B8 · P2 · „Aktivität"-Definition fürs Idle-Timeout ist manipulierbar

- **Problem:** §7.3 erlaubt „sichtbare, aktiv laufende Videowiedergabe" als Aktivität. Ein Auto-Play-Loop kann die Session unbegrenzt (bis Absolut-Timeout) offen halten.
- **Auswirkung:** Faktische Aushebelung des Idle-Timeouts an einem unbeaufsichtigten Terminal (Werkstatt-Tablet!).
- **Verbesserung:** Video zählt **nur** mit periodischer, benutzergebundener Fortschrittsbestätigung (z. B. sichtbarkeits- + Interaktions-Heartbeat) als Aktivität; reine Wiedergabe nicht. Offene Entscheidung 19.9 verbindlich auf „nein/eingeschränkt" festlegen.

### B9 · P2 · Zwei Timeout-Obergrenzen (12 h absolut / 24 h maximal) unklar

- **Problem:** §2.3 nennt „Absolute Session-Laufzeit 12 h" **und** „Maximal zulässige Laufzeit 24 h" ohne trennscharfe Semantik.
- **Auswirkung:** Implementierungs- und Prüfunklarheit; Gefahr, dass die 24 h faktisch die 12 h aushebeln.
- **Verbesserung:** Eine harte Obergrenze definieren (Absolut = 12 h, ab Session-Erstellung, durch nichts verlängerbar). „Maximal 24 h" nur als Konfigurations-Obergrenze für den Admin dokumentieren, nicht als zweite Laufzeit. → in `computeSessionExpiry()` implementiert: nur `idle` + `absolute`.

### B10 · P2 · DSGVO/PII-Fluss übergreifend, EU-Region nötig

- **Problem:** E-Mail und Name überqueren die Systemgrenze (§11). Der Übersetzungs-Worker ruft zudem Mistral auf. Personenbezug (Lernfortschritt) ist gegeben.
- **Auswirkung:** Ohne AVV/Datenminimierung DSGVO-Risiko; Audit-Logs mit Klartext-PII sind selbst ein Risiko.
- **Verbesserung:** Datenminimierung: prüfen, ob E-Mail/Name für die Academy zwingend sind (Konzept fragt das offen — Antwort: für reines Lernen i. d. R. **nein**, Anzeigename optional). Supabase-Projekt in EU-Region (bereits so dokumentiert). Audit nur mit **pseudonymisierter** `subjectReference` (Konzept §12.2 macht das korrekt). Mistral-AVV.

### B11 · P2 · Clock-Skew & Zeitautorität beim 120-s-Ticket

- **Problem:** Ein 120-s-Ticket ist empfindlich gegen Uhrzeitabweichung zwischen ServiceQ und GITacademy.
- **Auswirkung:** Falsch-negative (gültiges Ticket abgelehnt) oder verlängerte Angriffsfenster.
- **Verbesserung:** Ablauf **ausschließlich** serverseitig anhand der GITacademy-DB-Zeit (`now()` in Postgres) bewerten, nicht anhand von Client-Zeitstempeln. → `consume_launch_ticket()` vergleicht gegen `now()` in der DB.

### B12 · P2 · Rollen-/Markt-/Mandanten-Mapping fehlt in der Codebasis

- **Problem:** Das Konzept fordert Allowlist-Mapping (§6.4). Die Codebasis hat `market`, `language`, aber keine Mapping-Tabelle ServiceQ-Rolle → Academy-Rolle und keine Tenant-Allowlist.
- **Auswirkung:** Ohne Allowlist würden ServiceQ-Rollen ungeprüft übernommen (Privilege Escalation über manipulierte Rollen — Testfall 18 „manipulierte Rollen").
- **Verbesserung:** Konfigurationsgetriebene Allowlists (`sso_client.allowed_tenants/roles/target_types`, `sso_role_map`); unbekannte Rolle → definierte Minimalrolle oder Ablehnung. → in `0003` + `mapRole()` mit Tests.

### B13 · P3 · Single-Logout-Lücke (akzeptiert, aber dokumentieren)

- **Problem:** §5.5 — Academy-Logout meldet nicht aus ServiceQ ab.
- **Auswirkung:** Nutzererwartung/Compliance je nach Kontext.
- **Verbesserung:** Bewusst akzeptieren und dokumentieren; für echtes SLO OIDC Back-Channel Logout vorsehen (siehe B14).

### B14 · P1 · OIDC-Alternative ist für dieses Zielbild der Standardweg

- **Problem:** Der bespoke Token-Handshake reimplementiert Teile von OIDC/OAuth (RFC 8693 Token Exchange, RP-Initiated Login). Eigene Security-Logik = eigene Fehlerquellen.
- **Auswirkung:** Höhere Wartungslast, größere Angriffsfläche, schwerer auditierbar als ein etablierter Standard.
- **Verbesserung:** Wenn ServiceQ als OpenID Provider auftreten kann **oder** ein IdP (z. B. Entra ID) vorhanden ist, ist **OIDC Authorization Code Flow** (ServiceQ/IdP als OP, GITacademy als RP) der robustere Weg — inkl. standardisierter Token-Validierung, Key-Rotation (JWKS) und Back-Channel-Logout. Der bespoke Handshake ist nur gerechtfertigt, wenn ServiceQ **weder** OP sein kann **noch** hinter einem IdP steht. **Empfehlung:** Datenmodell schon jetzt OIDC-nah halten (`issuer/subject/audience/roles` entkoppelt von ServiceQ-spezifischen Spalten), damit ein späterer Wechsel günstig ist. Das Konzept sagt das in §23 sinngemäß — hier verbindlich als Architekturentscheidung markieren.

### B15 · P3 · Ratenbegrenzung & Brute-Force auf Consume

- **Problem:** Opaque 256-Bit-Codes sind praktisch nicht erratbar, aber Consume-Endpunkt braucht dennoch Rate-Limiting (§10.3), das in einer reinen SPA nicht existiert.
- **Auswirkung:** Ohne serverseitiges Rate-Limit sind Brute-Force-/DoS-Versuche gegen Consume/Create ungebremst.
- **Verbesserung:** Rate-Limit pro `client_id`, `subject`, Quell-IP in der Edge Function (Zähltabelle/Fenster) + Alerting bei Häufung fehlgeschlagener Einlösungen. → als `sso_audit`-basierte Zählung + Konfig skizziert; produktiv über API-Gateway/WAF.

---

## 2. Bewertungsmatrix (Kurzform)

| ID | Thema | Prio | Kernrisiko |
|---|---|:--:|---|
| B1 | Kein Server / keine Server-Session | P0 | Konzept nicht 1:1 umsetzbar |
| B2 | anon-Key + Demo-RLS | P0 | Direktzugriffsschutz wirkungslos |
| B3 | E-Mail als Schlüssel | P1 | Account-Kollision/-Takeover |
| B4 | Schwache Systemauth (API-Key) | P1 | Identitätsübernahme bei Key-Leak |
| B5 | Idempotenz offen | P1 | Ticketflut / Races |
| B6 | Direktzugriff je Route | P1 | Bookmark-Zugriff |
| B7 | Rückleitung offen | P1 | Open Redirect |
| B8 | Video-als-Aktivität | P2 | Idle-Timeout ausgehebelt |
| B9 | 12 h vs. 24 h | P2 | Timeout-Unklarheit |
| B10 | DSGVO/PII | P2 | Compliance |
| B11 | Clock-Skew | P2 | Falsch-negativ / Fenster |
| B12 | Rollen-Mapping fehlt | P1 | Privilege Escalation |
| B13 | Single-Logout | P3 | Nutzererwartung |
| B14 | OIDC-Alternative | P1 | Wartbarkeit/Standardkonformität |
| B15 | Rate-Limit/Brute-Force | P3 | DoS |

---

## 3. Was am Konzept ausdrücklich gut ist

Damit die Challenge fair bleibt — diese Punkte sind stark und werden übernommen:

- Opaques, gehasht gespeichertes One-Time-Ticket mit kurzer TTL und atomarer Entwertung (§2.2, §5.2, §10.3).
- Trennung der drei Sicherheitsobjekte (Systemauth ≠ Launch-Ticket ≠ Session) (§2).
- ID-basierte Zielauflösung statt frei übertragener URL (§8).
- Rollen-Allowlist statt ungeprüfter Übernahme (§6.4).
- Getrennte Idle-/Absolut-Timeouts, Warn-Modal mit a11y-Anforderungen (§7).
- Pseudonymisierte Audit-Referenz, „was nicht zu loggen ist" (§12).
- Klarer Test- und Missbrauchsszenarien-Katalog (§18, §19).

Die Challenge betrifft also **nicht** die Security-Grundidee, sondern (a) die **Passung auf die reale GITacademy-Architektur** und (b) einige **präzisierungsbedürftige Stellen**.
