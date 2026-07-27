# Finales Go-live-Review – Lernplattform

**Stand:** 27. Juli 2026  
**Prüfrollen:** Software-Architektur, QA, Security  
**Bewertung:** **NO-GO**

## Management Summary

Die Anwendung ist deutlich robuster als zu Beginn des Reviews: Der ungeschützte
Demo-Zugang ist in normalen Builds geschlossen, serverseitige Rollenprüfungen
wurden ergänzt, Auth-Provisionierung arbeitet fail-closed, gespeicherte
Redaktionsinhalte werden gegen XSS gehärtet, Lernfortschritt und Veröffentlichung
haben serverseitige Workflows, Benutzeränderungen werden im autoritativen
Keycloak-System vorgenommen und bekannte Dependency-Schwachstellen sind behoben.

Der vollständige lokale Testlauf ist grün:

- 30/30 Unit-Tests der SSO-Kernlogik
- 51/51 Tests der Netlify-Serverfunktionen
- 52/52 Browser-E2E-Prüfungen für User, Editor und Admin, einschließlich Desktop,
  Tablet, Smartphone, Guards, Lernfortschritt und Accessibility-Smoke-Checks
- 10/10 Keycloak-Modus-Prüfungen
- Produktions-Build erfolgreich
- `npm audit --omit=dev`: 0 bekannte Schwachstellen

Trotzdem ist ein Go-live derzeit nicht vertretbar. Es bestehen keine bekannten
offenen kritischen Code-Schwachstellen, aber mehrere **hohe funktionale,
betriebliche und rechtliche Risiken**: keine reale Medien-/Dateipipeline, keine
Benutzer- oder Gruppenzuweisung von Trainings, unvollständige UI-Übersetzung,
juristische Platzhaltertexte, fehlende produktionsweite Backups/Überwachung und
vor allem keine Abnahme der neuen Migrationen gegen eine echte Supabase-/Postgres-
Instanz.

## Prüfgrundlage und Grenzen

Geprüft wurden der React/Vite-Client, Netlify Functions, Supabase-Migrationen und
Edge Functions, Keycloak-Realm und Deployment-Skripte, Netlify-Konfiguration,
automatisierte Tests sowie die wichtigsten UI-Abläufe aus den drei Rollen.

Direkt ausführbar waren Build, Node-/Browser-Tests, Shell-/JSON-Syntax,
Dependency-Auflösung und npm-Sicherheitsaudit. Nicht verfügbar waren eine
erreichbare Supabase-/Postgres-Testinstanz, Deno/Supabase CLI, produktive
Keycloak-/Netlify-Systeme sowie ein Mistral-Key. Deshalb sind RLS, neue RPCs,
Migrationsreihenfolge, echter Mistral-Durchlauf, SMTP-Zustellung und
Backup-Restore noch als Live-Abnahmetests offen. Der integrierte In-App-Browser
war in dieser Sitzung nicht verfügbar; die UI-Prüfung erfolgte stattdessen mit
der im Projekt enthaltenen Playwright-Suite gegen einen lokalen Build.

## Übersicht der geprüften Funktionen

| Bereich | Verifiziert | Ergebnis |
|---|---|---|
| Login/Token | Keycloak Authorization Code + PKCE, Tokenprüfung, Exchange, Logout, kein Demo-Fallback im Produktions-Build | Code/Test grün; Live-IdP-Abnahme offen |
| Session | Keycloak-Limits, 30 Minuten Client-Inaktivität, Warnung, Verlängerung/Logout | Lokal grün |
| Rollen/Berechtigungen | UI-Guards, Keycloak-Admin-APIs, Supabase-RLS und RPC-Rollenchecks | Code/Test grün; RLS-Live-Test offen |
| Benutzerverwaltung | Einladung, erneutes Senden, Aktivieren/Sperren, Rollen, Märkte, Löschen | Serverfunktion getestet; Live-Keycloak/Supabase-Konsistenz offen |
| Märkte/Sprachen | Markt CRUD und Sprachzuordnung | Teilweise; Sprachstamm-CRUD fehlt |
| Trainings | Anlegen, Bearbeiten, Kapitel/Elemente, atomar Veröffentlichen, Archivieren | Code vorhanden; DB-Live-Test offen |
| Übersetzungen | Mistral-Worker, Glossar, Status, manuelle Korrektur, Markierung veralteter Texte | Autorisierung gehärtet; Live-Mistral-Test offen |
| Lernansicht | Texte, Schritte, Links, Abschluss, Fortsetzen, DB-Fortschritt | Text/Schritte/Fortschritt implementiert; echte Medien fehlen |
| Zuweisungen | Märkte | Benutzer-, Produkt- und Gruppenzuweisung unvollständig |
| Reporting | Inhalt, Übersetzung, Markt, aggregierte Lernaktivität | RPCs korrigiert; DB-Live-Test offen |
| Responsive/A11y | 375×812, 768×1024, Desktop; H1, Namen, Fokus, Tabellen | E2E-Smoke-Tests grün |
| Fehler/Validierung | Formulare, Guards, leere Zustände, Serverstatuscodes | Wesentliche Pfade grün |
| Datenschutz/Security | RLS, XSS-Schutz, URL-Allowlist, Secret-Behandlung, Header, PII-arme Logs | Code deutlich gehärtet; Recht/Betrieb offen |
| Performance | Produktions-Build, Bundle ca. 464 kB JS / 129 kB gzip | Akzeptabler Startwert; Lasttest fehlt |
| Deployment/Betrieb | Netlify, Keycloak-Compose, Health/Backup-Skripte | Keycloak vorbereitet; Gesamtsystem nicht abgenommen |
| Mock/TODO/Platzhalter | Produktions-Fallback geschlossen, falsche Admin-Kennzahlen entfernt | Demo-Code explizit schaltbar; echte Inhalts-/Rechtstexte fehlen |

## Behobene Befunde

| ID | Funktion | Priorität | Fehler und Behebung | Dateien/Code-Stellen |
|---|---|---:|---|---|
| F-01 | Login/Daten | **Kritisch** | Fehlende SSO-Konfiguration öffnete faktisch einen ungeprüften Demo-Zugang und Seiten fielen still auf Mock-Daten zurück. Demo ist jetzt nur mit `VITE_DEMO_MODE=true` aktiv; normale Builds scheitern geschlossen und zeigen keine erfundenen Datensätze. | `.env.example:7-11`, `src/app/data/runtime.ts:1-6`, `src/app/pages/LoginPage.tsx:89-106`, `src/app/data/api.ts:16-39`, alle aufrufenden Seiten |
| F-02 | Token-Provisionierung | **Hoch** | Bei fehlgeschlagener `app_user`-Provisionierung wurde trotzdem ein rollenbehaftetes Supabase-JWT ausgegeben. Der Exchange liefert jetzt 503 ohne Zugriffstoken; der Client wird erst nach erfolgreichem Exchange angemeldet. | `netlify/functions/auth-exchange.mjs:42-64`, `src/app/data/keycloakAuth.ts:308-350`, `tests/auth-functions.test.mjs:403-421` |
| F-03 | Übersetzungs-API | **Hoch** | Die Edge Function verwendete `service_role`, ohne zuvor die Rolle des Aufrufers verbindlich zu prüfen. Jetzt: Bearer-Pflicht, Editor-RPC, Input-/Sprach-Allowlist, Marktbindung, Modell-Allowlist und CORS/Methodenprüfung. | `supabase/functions/translate-training/index.ts:125-225` |
| F-04 | Gespeicherte Inhalte | **Hoch** | Redaktionelles HTML wurde direkt per `dangerouslySetInnerHTML` gerendert; Dokument-/Link-URLs akzeptierten aktive Protokolle. Eine restriktive HTML- und URL-Allowlist entfernt Skripte, Events, Styles und gefährliche Schemata. | `src/app/security/content.ts:1-57`, `src/app/pages/LearningPage.tsx:157-249` |
| F-05 | Benutzerrollen/-märkte | **Hoch** | Admin-Änderungen wurden nur in Supabase gespiegelt, Claims stammten aber aus Keycloak; Änderungen waren damit nicht autoritativ. Neue admin-geschützte Serverfunktion pflegt Keycloak-Rollen, Attribute, Status und Logout. | `netlify/functions/admin-user.mjs:1-137`, `src/app/data/adminUserApi.ts:1-20`, `src/app/data/api.ts:633-670`, `tests/auth-functions.test.mjs:913-960` |
| F-06 | Veröffentlichung | **Hoch** | Marktzuordnung und Statuswechsel waren mehrere Browseroperationen ohne serverseitige Vollständigkeitsprüfung. `publish_training` prüft Titel, Märkte, Kapitel und Elemente und schreibt atomar. | `supabase/migrations/0008_go_live_workflows.sql:4-44`, `src/app/data/api.ts:362-383`, `src/app/pages/EditorContentPage.tsx:272-323` |
| F-07 | Lernfortschritt | **Hoch** | Fortschritt war im Wesentlichen lokaler Demo-State. Produktiv wird er jetzt pro `auth.uid()` geladen und über eine geschützte RPC geschrieben; Katalog/Dashboard berechnen reale Quoten. | `supabase/migrations/0008_go_live_workflows.sql:46-78`, `src/app/data/api.ts:50-91,148-179,392-408`, `src/app/pages/LearningPage.tsx:323-467` |
| F-08 | Reporting | **Hoch** | `security_invoker`-Views sahen wegen der Progress-RLS nur den eigenen Datensatz und lieferten falsche Aggregate. Rollenbeschränkte `security definer`-RPCs aggregieren ohne personenbezogene Ausgabe. | `supabase/migrations/0008_go_live_workflows.sql:80-142`, `src/app/data/api.ts:790-807` |
| F-09 | Abhängigkeiten | **Hoch** | React Router hatte bekannte High-Severity-Advisories. React, React DOM, React Router und Vite wurden aktualisiert; Audit meldet 0. | `package.json:33-67`, `package-lock.json` |
| F-10 | Session | **Mittel** | Automatische Token-Erneuerung konnte die Sitzung trotz Benutzerinaktivität erhalten. Im Keycloak-Modus greift nun ein lokales 30-Minuten-Inaktivitätslimit mit 5-Minuten-Warnung. | `src/app/components/SessionTimeout.tsx:15-18,96-135` |
| F-11 | Deployment-Security | **Mittel** | Wesentliche Browser-Sicherheitsheader fehlten. CSP, HSTS, Frame-/MIME-/Referrer- und Permissions-Policy wurden ergänzt. | `netlify.toml:11-21` |
| F-12 | Trainingsstatus | **Mittel** | Archivierung war nicht vorhanden. Status und Redaktionsaktion wurden ergänzt. | `supabase/migrations/0007_training_archive.sql:1-4`, `src/app/data/api.ts:385-390`, `src/app/pages/EditorContentPage.tsx:325-340` |
| F-13 | Testzugänge/Secrets | **Hoch** | Realm und lokale Compose-Konfiguration enthielten feste Beispiel-Zugangsdaten bzw. schwache Defaults. Das Realm-Template enthält keinen Benutzer mehr; Konfiguration verlangt Laufzeitwerte und erzeugt produktiv Zufallswerte. | `auth/realm/serviceq-realm.json`, `auth/configure.sh:55-72,152-196`, `auth/docker-compose.yml:60-69`, `auth/hetzner-setup.sh:169-201` |
| F-14 | Admin-Einstellungen | **Mittel** | Erfundenes Audit-Log, Nutzungszahlen, Plattformwerte und wirkungslose Sicherheits-/Benachrichtigungsschalter suggerierten nicht vorhandene Funktionen. Sie wurden entfernt und durch explizite Nicht-verfügbar-Hinweise ersetzt. | `src/app/pages/AdminSettingsPage.tsx:438-714` |
| F-15 | Responsive Testabdeckung | **Niedrig** | Es gab nur einen Smartphone-Viewport. Tablet-Dashboard und Tablet-Verwaltung wurden ergänzt. | `tests/e2e.mjs`, Abschnitt G |

## Verbleibende Risiken und Go-live-Blocker

| ID | Funktion | Priorität | Befund | Konkreter Lösungsvorschlag | Dateien/Code-Stellen |
|---|---|---:|---|---|---|
| R-01 | Datenbank/RLS/Workflows | **Hoch** | Migrationen `0005` bis `0008`, neue Enum-Erweiterung, RLS und RPCs wurden mangels echter DB nur statisch geprüft. Ein SQL-, Grant- oder PostgREST-Fehler würde zentrale Abläufe blockieren oder Rechte verfälschen. | Frische Staging-DB aus `0001` aufbauen, alle Migrationen anwenden; RLS-Matrix mit echten JWTs für anon/User/Editor/Admin testen; anschließend Upgrade einer realistischen Bestandskopie und Rollback-Probe. | `supabase/migrations/0005_production_rls.sql`, `0006_fix_app_user_upsert.sql`, `0007_training_archive.sql`, `0008_go_live_workflows.sql` |
| R-02 | Zuweisungen | **Hoch** | Trainings lassen sich nur Märkten zuordnen. Direkte Benutzerzuweisung, Produktzuweisung im UI und Gruppenmodell fehlen; `user_product` wird nicht produktiv ausgewertet. | Tabellen `user_group`, `group_member`, `training_user`, `training_group` bzw. verbindliche Scope-Regeln entwerfen; RLS, Admin-UI, APIs und E2E-Tests ergänzen. Bis dahin Anforderung und UI nicht als erfüllt ausweisen. | `supabase/migrations/0001_init.sql:54-65,105-109`, `src/app/data/api.ts:362-383` |
| R-03 | Videos/Bilder/Dateien | **Hoch** | Video ist ein simulierter Timer, Bilder sind Platzhalter, es existiert kein Upload-, Storage-, MIME-/Größenprüfungs-, Virenscan- oder signierter Downloadpfad. | Privaten Object Storage einführen; Upload nur Editor, Dateityp/Größe serverseitig prüfen, Malware-Scan, signierte zeitlich begrenzte URLs, Lösch-/Retention-Prozess und echten HTML5-/Streaming-Player ergänzen. | `src/app/pages/LearningPage.tsx:75-149,197-233`, `src/app/pages/EditorContentPage.tsx:70-110`, Tabelle `asset` in `supabase/migrations/0001_init.sql` |
| R-04 | Recht/Datenschutz | **Hoch** | Impressum und Datenschutzerklärung enthalten explizite Platzhalter. Verantwortlicher, Kontakt, Rechtsgrundlage, Aufbewahrung/Löschung, Betroffenenrechte, AV-Verträge und konkrete Datenflüsse sind nicht freigegeben. | Juristisch geprüfte Texte einsetzen; Verzeichnis der Verarbeitungstätigkeiten, TOMs, AVV/DPA mit Supabase, Netlify und Mistral, Lösch- und Auskunftsprozess sowie Retention verbindlich abnehmen. | `src/app/pages/LegalPage.tsx:4-67` |
| R-05 | Oberflächen-Mehrsprachigkeit | **Hoch** | Die Navigation ist übersetzt, große Teile der Admin-, Editor-, Reporting-, Fehler- und Lernoberfläche sind jedoch hart deutsch. Gleichzeitig können mehrere UI-Sprachen aktiviert werden. | Alle sichtbaren Texte und A11y-Namen in Katalogschlüssel überführen; DE/EN/FR vollständig übersetzen; Missing-Key-Test und E2E je Sprache ergänzen; bis dahin produktiv nur Deutsch anbieten. | zahlreiche Literale, z. B. `src/app/pages/EditorContentPage.tsx:347-585`, `AdminSettingsPage.tsx:385-714`, `ReportingPage.tsx:200-320`; `src/app/i18n/index.ts` |
| R-06 | Betrieb/Backups/Monitoring | **Hoch** | Keycloak-Backup und Healthcheck sind vorbereitet, für Supabase-Datenbank/Storage, Netlify Functions, Mistral-Jobs und Frontendfehler fehlen nachweisbare Restore-Tests, SLOs, Alerting und Runbooks. | PITR/Backups für DB und Storage aktivieren, Restore in isolierter Umgebung testen; synthetische Login-/Lern-/Publish-Prüfung, Function-/Mistral-Fehlerraten, Latenz- und Kapazitätsalarme einrichten; On-call-/Incident-Runbook abnehmen. | `auth/backup.sh`, `auth/docker-compose.prod.yml`; keine entsprechende Gesamtsystemkonfiguration im Repository |
| R-07 | Live-Integrationsabnahme | **Hoch** | Kein End-to-End-Test lief gegen echte Keycloak-, Supabase-, SMTP- und Mistral-Systeme. Die lokalen Browsertests verwenden bewusst den expliziten Demo-Modus. | Staging mit produktionsgleicher Topologie aufbauen und die Rollen-/Workflow-Matrix mit realen Tokens, Einladungsmail, Übersetzung, Publikation, Fortschritt und Reporting ausführen. | `tests/e2e.mjs:65-79`, `tests/keycloak-mode.mjs`, `docs/uebersetzung-worker.md` |
| R-08 | Sprachverwaltung | **Mittel** | Märkte können bestehende Sprachen zuordnen, der Sprachstamm selbst kann in der UI nicht angelegt, umbenannt, deaktiviert oder auf Verwendung geprüft werden. | Admin-CRUD mit ISO-Code-Validierung, Referenzprüfung, deaktivierbarem Status und Tests ergänzen. | `src/app/pages/AdminMarketsPage.tsx`, `src/app/data/api.ts:695-731` |
| R-09 | Benachrichtigungen | **Mittel** | SMTP unterstützt Keycloak-Kontomails, aber Veröffentlichungs-, Übersetzungsfehler- und Digest-Mails haben keinen Worker. Die UI weist jetzt korrekt darauf hin. | Ereignis-/Outbox-Tabelle, idempotenten Mailworker, Retry/Dead-letter, Vorlagen, Abmelde-/Empfängerregeln und Monitoring implementieren. | `src/app/pages/AdminSettingsPage.tsx:663-677`, App-Settings in `supabase/migrations/0004_admin_and_reporting.sql:21-30` |
| R-10 | Auditierbarkeit | **Mittel** | Es existiert kein zentrales manipulationsgeschütztes Audit-Log für Admin- und Redaktionsänderungen. Konsolenlogs sind kein Audit-Trail. | Append-only Audit-Event mit Actor, Aktion, Ziel, Zeit, Korrelation und Ergebnis serverseitig schreiben; PII minimieren, Zugriff/Retention definieren und Export anbinden. | `src/app/pages/AdminSettingsPage.tsx:690-694`; Netlify Functions loggen derzeit nur operative Fehler |
| R-11 | Konsistenz Benutzerverwaltung | **Mittel** | Bestehende Benutzer werden zuerst in Keycloak und danach im Browser in Supabase geändert. Schlägt der zweite Schritt fehl, können Claims und Spiegelung auseinanderlaufen; Löschen ist nicht rückrollbar. | Keycloak-Änderung und Supabase-Spiegelung vollständig in die Admin-Serverfunktion verschieben; Ergebnis als Saga mit Retry/Abgleichsjob und sichtbarem Partial-Failure-Status führen. | `netlify/functions/admin-user.mjs:97-132`, `src/app/data/api.ts:633-670` |
| R-12 | Übersetzungs-Performance | **Mittel** | Der Worker übersetzt Felder und bis zu 30 Sprachen seriell. Große Trainings können Runtime-Limits erreichen; Last-/Kostenlimits sind nicht gemessen. | Jobs in begrenzte Batches/Queue zerlegen, Parallelität und Retries kontrollieren, Laufzeit-/Token-/Kostenlimit setzen und Lasttest mit maximalem Training durchführen. | `supabase/functions/translate-training/index.ts:240 ff.` |
| R-13 | API-Missbrauchsschutz | **Mittel** | Token- und Rollenprüfungen sind vorhanden, aber es gibt keine anwendungsspezifischen Rate-Limits für Exchange, Einladung, SMTP-Test oder Mistral-Start. | Netlify/Edge Rate-Limits nach IP und Subject, Quoten für teure Aktionen, 429-Antworten und Alarmierung ergänzen. | `netlify/functions/auth-exchange.mjs`, `admin-invite.mjs`, `admin-smtp.mjs`, `supabase/functions/translate-training/index.ts` |
| R-14 | CSP/Frontend-Härtung | **Niedrig** | CSP erlaubt wegen aktueller Implementierung `style-src 'unsafe-inline'` sowie sehr breite HTTPS-/WSS-Verbindungen und Frames. | Inline-Styles schrittweise entfernen oder Nonces/Hashes einsetzen; `connect-src`, `img-src`, `frame-src` auf konkrete produktive Domains begrenzen. | `netlify.toml:15` |
| R-15 | Demo-Artefakte | **Niedrig** | Demo-Daten bleiben für lokale Vorführung und Tests im Quellbaum. Sie sind fail-closed, können aber bei falscher expliziter Buildvariable aktiviert werden. | Produktions-Pipeline mit Policy versehen, die `VITE_DEMO_MODE=true` ablehnt; optional Demo-Daten in getrennten Entry-Point/Test-Fixture verschieben. | `src/app/data/demo.tsx`, Fallbacks in Seiten, `.env.example:7-11`, `tests/e2e.mjs:74` |

## Rollen- und Security-Matrix

| Aktion | Anon | User | Editor | Admin |
|---|---:|---:|---:|---:|
| Produktions-Login umgehen | Nein | – | – | – |
| Veröffentlichte Trainings eigener Märkte lesen | Nein | Ja | Ja, alle | Ja, alle |
| Lernfortschritt einer anderen Person lesen/schreiben | Nein | Nein | Nein | Nein; nur Aggregate |
| Training/Kapitel/Inhalt schreiben | Nein | Nein | Ja | Nein gemäß aktueller Rollentrennung |
| Übersetzungsworker starten/korrigieren | Nein | Nein | Ja | Nur wenn zusätzlich Editor |
| Benutzer/Rollen/Märkte verwalten | Nein | Nein | Nein | Ja |
| Reporting-Aggregate | Nein | Nein | Ja | Ja |
| App-Einstellungen schreiben | Nein | Nein | Nein | Ja |

Die Matrix entspricht der aktuellen bewussten Trennung: Admin ist nicht
automatisch Editor. Falls das Produkt eine Rollenvererbung „Admin darf alles“
erwartet, muss dies vor der Abnahme ausdrücklich entschieden und in UI, Keycloak,
RLS und Tests konsistent umgesetzt werden.

## Testnachweis

Ausgeführt am 27. Juli 2026:

```text
npm test
  Unit SSO:          30 bestanden, 0 fehlgeschlagen
  Netlify Functions: 51 bestanden, 0 fehlgeschlagen
  Browser E2E:       52 bestanden, 0 fehlgeschlagen
  Keycloak-Modus:    10 bestanden, 0 fehlgeschlagen

npm run build
  erfolgreich; JS 464.32 kB / 129.16 kB gzip

npm audit --omit=dev
  found 0 vulnerabilities

npm ls --depth=0
node --check …
bash -n …
jq -e auth/realm/serviceq-realm.json
git diff --check
  alle erfolgreich
```

Die Browser-Suite prüft User-, Editor- und Admin-Navigation/Guards, Login/Logout,
Katalog, Lernansicht, Kapitelabschluss und Fortsetzung, Editor-/Übersetzungs-
Leerezustände, Verwaltung, Reporting, i18n-Basisfunktion, Fehlerseiten,
375×812, 768×1024, Tastatur-/ARIA-Smoke-Checks und unerwartete Laufzeitfehler.

## Finale Go-live-Checkliste

### Zwingend vor Freigabe

- [ ] Frische Staging-DB aufsetzen und Migrationen `0001` bis `0008` fehlerfrei anwenden.
- [ ] Upgrade einer anonymisierten Bestandskopie und Rollback-/Restore-Probe durchführen.
- [ ] RLS-/RPC-Matrix für anon, User, Editor und Admin mit echten JWTs vollständig testen.
- [ ] Benutzer-/Gruppen-/Produktzuweisung fachlich entscheiden und implementieren.
- [ ] Echte Video-, Bild- und Dateipipeline einschließlich Security-Checks bereitstellen.
- [ ] Juristisch freigegebenes Impressum und Datenschutzerklärung deployen.
- [ ] AVV/DPA, Retention, Löschung, Auskunft und TOMs abnehmen.
- [ ] Oberflächenübersetzungen vollständig liefern oder produktiv auf Deutsch begrenzen.
- [ ] Staging-E2E mit realem Keycloak, Supabase, SMTP und Mistral bestehen.
- [ ] Supabase-/Storage-Backup und tatsächlichen Restore nachweisen.
- [ ] Monitoring, SLOs, Alerts, Incident- und Rollback-Runbooks aktivieren.
- [ ] Produktions-CI muss `VITE_DEMO_MODE=true` technisch ablehnen.

### Empfohlen vor oder unmittelbar nach kontrolliertem Pilot

- [ ] Zentralen Audit-Trail implementieren.
- [ ] Benutzer-Synchronisation als serverseitige Saga mit Retry ausführen.
- [ ] Mistral-Worker batchen, limitieren und unter Maximallast testen.
- [ ] API-Rate-Limits und Quoten aktivieren.
- [ ] Sprachstammverwaltung vervollständigen.
- [ ] Plattform-Benachrichtigungsworker implementieren oder Funktionsumfang formell reduzieren.
- [ ] CSP-Domains verengen und `unsafe-inline` abbauen.
- [ ] Browsermatrix um Safari/iOS und echte Android-Geräte ergänzen.
- [ ] Accessibility-Abnahme nach WCAG 2.2 AA mit automatischem Scanner und manueller Prüfung.
- [ ] Lasttest für Katalog, Reporting, Publikation und gleichzeitige Lernzugriffe durchführen.

## Freigabeentscheidung

**NO-GO.**

Eine Neubewertung auf **Go mit Auflagen** ist möglich, sobald alle hohen Risiken
R-01 bis R-07 geschlossen und durch produktionsnahe Abnahmetests nachgewiesen
sind. **Go** ist erst zulässig, wenn darüber hinaus keine kritischen oder hohen
Risiken mehr offen sind und Backup/Restore, Monitoring sowie rechtliche Freigabe
dokumentiert vorliegen.
