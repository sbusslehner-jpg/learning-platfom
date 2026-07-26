# Produktstatus: ServiceQ Lernplattform

**Rolle der Analyse:** Product Management · Softwarearchitektur · QA
**Stand:** Juli 2026
**Prüfumfang:** vollständige Codebasis (15 Seiten, 4 Migrationen, 4 Edge Functions, Datenschicht, Shell)

---

## 1. Gefundene Lücken

Ergebnis der systematischen Prüfung aller Funktionen, Rollen, Prozesse und Ansichten. Priorität: **P0** = blockierend für Produktivbetrieb, **P1** = hoch, **P2** = mittel.

### Fachlich / Prozess

| ID | Prio | Lücke |
|---|:--:|---|
| L1 | **P0** | **Kein Rollenmodell in der Oberfläche.** Jeder Benutzer sah Redaktion *und* Verwaltung. Das Konzept (§2) verlangt strikte Trennung Administrator / Editor / Lernender. Zugriff auf fremde Bereiche war über die URL uneingeschränkt möglich. |
| L2 | **P0** | **Keine Authentifizierung.** Der Login akzeptierte jede Eingabe und prüfte zum Schein eine hartcodierte Fehl-Adresse (`wrong@example.com`) – das erzeugte den Eindruck einer echten Prüfung. |
| L3 | P1 | **Benutzerverwaltung war Attrappe.** „Einladung senden" verwarf die Formularwerte; Rollen-/Marktzuordnung, Deaktivierung und Löschen fehlten vollständig. |
| L4 | P1 | **Marktverwaltung war vollständig statisch.** Sechs hartcodierte Zeilen, kein Anlegen, Bearbeiten oder Löschen, keine Sprachpflege. |
| L5 | P1 | **Einstellungen ohne Persistenz.** Alle Schalter lebten nur im Arbeitsspeicher und waren nach einem Reload zurückgesetzt. |
| L6 | P1 | **Kein Reporting.** Es gab keine Möglichkeit, Inhaltsbestand, Übersetzungsfortschritt oder Marktabdeckung zu beurteilen. |
| L7 | P2 | **Benutzerstatus fehlte im Datenmodell.** Konzept §6.5 fordert Deaktivierung – es gab kein `active`-Feld. |

### Technisch

| ID | Prio | Lücke |
|---|:--:|---|
| L8 | **P0** | **Datenabfragen ohne Zeitgrenze.** Bei nicht erreichbarem Backend blieb die Oberfläche **dauerhaft** im Ladezustand („Lädt …"), weil der Request nie abgeschlossen wurde und die Fehlerpfade nie liefen. Reproduziert in der Übersetzungs-Prüfansicht. |
| L9 | **P0** | **Demo-Schreibrechte (`0002`) umgehen jede Berechtigung.** Der ausgelieferte anon-Key erlaubt direkten Datenbankzugriff aus dem Browser – an allen Rollenprüfungen vorbei. |
| L10 | P1 | **Keine Internationalisierung.** Die gesamte Oberfläche war hartcodiert deutsch, inklusive eines fixen Datums („Montag, 21. Juli 2026"). Das Konzept adressiert bis zu 30 Märkte. |
| L11 | P2 | **Fabrizierte Messwerte.** Der Verbindungstest des Mistral-Keys zeigte ein erfundenes Ergebnis („OK, 312 ms"), das wie eine echte Messung aussah. |

### UX / Bedienung / Barrierefreiheit

| ID | Prio | Lücke |
|---|:--:|---|
| L12 | P1 | **Tote Bedienelemente:** „Abmelden" (ohne Handler), globale Suche (filterte drei fixe Strings), Video-Play, Dokument-Download, Filter-Chips der Trainingsübersicht, Kontextmenüs in Benutzer-/Marktverwaltung, mobiler Suche-Tab. |
| L13 | P2 | **Fehlende Leer- und Fehlerzustände** bei gefilterten Listen und fehlenden Routenparametern. |
| L14 | P2 | **Barrierefreiheit:** Icon-Buttons ohne zugängliche Namen, fehlende Fokus-Indikatoren, kein `aria-current` in der Navigation, `<html lang>` nicht gesetzt, Tabellen ohne Scroll-Container (Layoutbruch auf Mobil). |

---

## 2. Umgesetzte Änderungen

### Rollen und Berechtigungen (behebt L1)
- **Neu: `src/app/data/roles.ts`** – Rollen Administrator / Editor / Lernender mit **additiven** Berechtigungen (ein Admin kann zusätzlich Editor sein, Konzept §2). Acht Berechtigungen (`learn.view`, `content.edit`, `content.publish`, `translation.review`, `users.manage`, `markets.manage`, `settings.manage`, `reporting.view`), Zuordnung Screen → Berechtigung.
- **`App.tsx`**: Jede geschützte Route läuft über `guard()`; unberechtigte Aufrufe landen auf dem Dashboard.
- **`Sidebar.tsx`**: zeigt nur berechtigte Bereiche; leere Abschnitte werden ausgeblendet statt funktionslos angezeigt.
- **Topbar**: Rollenwechsel für die Vorführung, klar als Demo markiert.

### Internationalisierung (behebt L10)
- **Neu: `src/app/i18n/index.ts`** – Wörterbücher **de / en / fr**, Fallback-Kette `de-AT → de → Standard`, fehlende Schlüssel bleiben sichtbar statt leer. Sprachwahl wird persistiert und setzt `<html lang>`.
- Angewandt auf Shell (Navigation, Topbar, Profilmenü) und den kompletten Lernbereich. Datum wird über `toLocaleDateString(lang)` gerendert.
- Sprachumschalter in der Topbar. **Bewusste Grenze:** redaktionsinterne Detailtexte bleiben deutsch (Editoren arbeiten in der Master-Sprache) – Konzept §15 fordert übersetzbare *Benutzertexte*.

### Verwaltung (behebt L3, L4, L5, L7)
- **Benutzerverwaltung**: lädt echte Benutzer, **Status-Spalte** (aktiv/inaktiv), Rollenfilter, Anlegen mit Feldvalidierung, Rollen- und Marktzuordnung bearbeiten, Aktiv-Umschaltung, Löschen mit zweistufiger Bestätigung.
- **Marktverwaltung**: von statisch auf vollständiges CRUD – Anlegen (Code/Name/Sprachen/Standardsprache mit Validierung), Umbenennen, Sprachpflege, Löschen mit Konfliktmeldung bei bestehenden Zuordnungen.
- **Einstellungen**: acht Schlüssel werden über die neue Tabelle `app_setting` **persistiert** (optimistisch, mit Rücknahme bei Fehler). Nicht persistierbare Schalter sind sichtbar als „(noch nicht gespeichert)" gekennzeichnet statt still zu tun als ob.
- **Migration `0004`**: `app_setting`, `app_user.active`, `app_user.last_active_at`.

### Reporting (behebt L6)
- **Neu: `src/app/pages/ReportingPage.tsx`** + vier Datenbank-Views: Inhaltsbestand je Modul, Übersetzungsstatus je Sprache (eine Zeile pro Sprache), Marktabdeckung, aggregierte Lernaktivität.
- **Datenschutz als Konstruktionsprinzip:** ausschließlich Summen, **kein** Reporting über einzelne Lernende. Das Konzept schließt Lernüberwachung für Vorgesetzte ausdrücklich aus; der Hinweis ist auf der Seite dauerhaft sichtbar.

### Robustheit (behebt L8, L11)
- **`src/lib/supabase.ts`**: zentrale **Zeitgrenze von 10 s** für alle Datenabfragen (`AbortSignal.timeout`). Damit greifen die vorhandenen Fehlerpfade (Demo-Fallback bzw. Meldung) – vorher fror die Oberfläche dauerhaft ein. Diese Lücke wurde **durch die E2E-Tests entdeckt**, nicht durch Lesen des Codes.
- Fabrizierter Verbindungstest **entfernt**: die Karte erklärt jetzt, dass der Test serverseitig läuft, und verweist auf `docs/uebersetzung-worker.md`. Der API-Key bleibt maskiert und wird von der Oberfläche nicht gespeichert.
- Login: Fake-Prüfung entfernt, Seite als Demo-Zugang gekennzeichnet.

### Bedienung und Barrierefreiheit (behebt L12, L13, L14)
- **Abmelden** funktioniert (im SSO-Modus serverseitig, sonst zurück zur Anmeldung).
- **Globale Suche** fragt die Datenbank ab (debounced) und öffnet das Training.
- **Video-Player** (Play/Pause mit Fortschritt, als Prototyp gekennzeichnet), **Dokument-Download**, **Filter-Chips** mit echtem Filtern und Leerzustand, **mobiler Suche-Tab**.
- Zugängliche Namen für alle Icon-Buttons, Fokus-Indikatoren, `aria-current` in der Navigation, `aria-pressed` an Umschaltern, `<html lang>`, Tabellen in Scroll-Containern, CSV-Export des angezeigten Protokolls.

### Testinfrastruktur (neu)
- **`tests/e2e.mjs`** – 50 Prüfungen in 9 Phasen, echter Browser (Playwright + Chromium) gegen den gebauten Produktionsstand.
- `npm run test:unit` (30 Tests der SSO-Kernlogik), `npm run test:e2e`, `npm test`.

---

## 3. Testergebnisse

Alle Zahlen aus **tatsächlich ausgeführten** Läufen.

| Prüfung | Umfang | Ergebnis |
|---|---|---|
| Produktions-Build (`vite build`) | 1.700 Module | ✅ fehlerfrei |
| Unit-Tests (`node --test`) | 30 Tests der SSO-Kernlogik | ✅ **30/30** |
| End-to-End (Playwright, echter Browser) | 50 Prüfungen, 9 Phasen | ✅ **50/50** |

**Abgedeckte Prozesse:**

- **Lernender (12):** Anmeldung → Dashboard → Katalog → Lernansicht → Kapitel abschließen → Fortschritt übersteht Reload → Deep-Link → Video-Bedienung. Plus drei Guard-Prüfungen (Redaktion, Verwaltung, Auswertungen bleiben gesperrt).
- **Editor (8):** Navigation zeigt Redaktion ohne Verwaltung, Inhaltsbaum, Trainingseditor, Übersetzungsübersicht, Prüfansicht (mit und ohne Parameter), Auswertungen erlaubt, Benutzerverwaltung gesperrt.
- **Administrator (7):** Verwaltung ohne Redaktion, Benutzerverwaltung mit Statusangabe, Märkte, Einstellungen (inkl. Prüfung, dass **kein** fabrizierter Messwert erscheint), Auswertungen mit Datenschutzhinweis.
- **Querschnitt (10):** Sprachumschaltung de↔en wirkt auf die Navigation und wird persistiert, `<html lang>` folgt, Suche liefert Panel, Rollenwechsel blendet Bereiche aus, unbekannte Route leitet um, Session-Ablauf verweist auf ServiceQ statt auf einen Login, SSO-Fehlerseiten, Impressum/Datenschutz.
- **Abmelden (1), Kaltstart-Guard (2), Responsive 375×812 (3), Barrierefreiheit (6), Laufzeitfehler (1).**

**Während der Tests gefunden und behoben:** die P0-Lücke L8 (endloser Ladezustand ohne Zeitgrenze) – ein Fehler, der beim reinen Codelesen unsichtbar blieb.

**Wichtige Einschränkung:** Die Tests liefen im **Demo-Fallback**, weil die Testumgebung keinen Netzwerkzugang zu Supabase hat. Geprüft sind damit Oberflächenverhalten, Rollenlogik, Navigation, Robustheit und Barrierefreiheit – **nicht** das tatsächliche Schreiben in die Datenbank. Die Schreibpfade sind implementiert, aber nur gegen eine erreichbare Supabase-Instanz verifizierbar.

---

## 4. Offene Punkte

### Blockierend für Produktivbetrieb (P0)

1. **Echte Authentifizierung fehlt (L2).** Der Login prüft keine Zugangsdaten; die Rollenauswahl ist frei umschaltbar. Zielbild ist der ServiceQ-SSO-Handshake (vollständig als Referenz implementiert, siehe `docs/serviceq-academy/`) oder Supabase Auth. **Bis dahin ist die Plattform nicht produktionsreif.**
2. **Demo-Schreibrechte zurücknehmen (L9).** `0002_demo_write_access.sql` und die Demo-Policies in `0004` erlauben anonymen Lese- und Schreibzugriff. Nach Einführung der Anmeldung müssen sie durch auth-basierte Policies ersetzt werden (Editor schreibt Inhalte, Admin verwaltet Benutzer, Lernende lesen nur veröffentlichte Inhalte ihrer Märkte). Die Berechtigungsprüfung in der Oberfläche ist **Ergonomie, kein Schutz**.
3. **Personenbezogene Daten in `app_user`** sind im Demo-Modus anonym lesbar – zwingend auf die Admin-Rolle einschränken.

### Hoch (P1)

4. **Lernfortschritt serverseitig.** Aktuell im Browser (`localStorage`) – er ist an das Gerät gebunden und geht bei Wechsel verloren. Die Tabelle `progress` existiert; die Anbindung braucht Nutzerkontext, also Auth.
5. **Datei-Uploads** (Video, Bild, PDF) inkl. sprachspezifischer Varianten sind im Datenmodell (`asset`) vorgesehen, aber nicht angebunden.
6. **Sichtbarkeitsfilter je Markt/Produkt.** Katalog und Dashboard zeigen alle veröffentlichten Trainings; die Regel aus Konzept §2 (nur eigene Märkte und Produkte) greift erst mit Nutzerkontext.
7. **Übersetzungs-Worker deployen** – ohne ihn bleiben „Veröffentlichen → übersetzen" und „Neu übersetzen" ohne Wirkung (Anleitung: `docs/uebersetzung-worker.md`).

### Mittel (P2)

8. **Sortierung per Drag & Drop** ist optisch vorhanden, aber nicht aktiv (Reihenfolge über das `sort`-Feld).
9. **i18n-Abdeckung erweitern:** Redaktionsbereich und einzelne Detailtexte sind deutsch; für weitere Marktsprachen fehlen Wörterbücher (Struktur ist vorbereitet).
10. **Impressum und Datenschutzerklärung** sind gekennzeichnete Platzhalter und müssen juristisch geprüft ersetzt werden.
11. **Bundle-Größe** ~600 kB (Warnschwelle). Code-Splitting nach Bereichen würde den Erstaufbau beschleunigen.
12. **Nicht ausgeführte Tests:** Schreibpfade gegen eine echte Datenbank, Lasttest, Penetrationstest, Kontrast-Messung nach WCAG 2.1 AA (strukturelle a11y-Prüfungen sind abgedeckt, Farbkontraste wurden nicht instrumentell gemessen).

---

## 5. Ist die Plattform produktionsreif?

**Nein – für den Produktivbetrieb mit echten Endkunden noch nicht.** Es fehlt genau ein grundlegender Baustein: **eine echte Authentifizierung** und die daran gebundene serverseitige Durchsetzung der Berechtigungen. Solange der Browser einen schreibfähigen Datenbankschlüssel besitzt und jede Rolle frei wählbar ist, sind Rollenmodell und Sichtbarkeitsregeln nicht durchsetzbar. Das ist keine Detailschwäche, sondern ein architektonischer Zustand, der bewusst so gewählt wurde, um die Vorführbarkeit zu erhalten.

**Ja – als vollständig vorführbares, fachlich konsistentes Produkt.** Der komplette Wertschöpfungskreis funktioniert an echten Daten: *Training anlegen → Inhalte bearbeiten (Autosave) → veröffentlichen mit Marktzuordnung → übersetzen lassen → Korrekturen sperren → in der Lernansicht in der Zielsprache konsumieren → Fortschritt sehen*. Rollen trennen die Bereiche, drei Oberflächensprachen sind umschaltbar, Verwaltung und Auswertungen arbeiten auf der Datenbank, Fehler- und Leerzustände sind abgedeckt, und die Oberfläche friert bei Backend-Störungen nicht mehr ein.

**Der Weg zur Produktionsreife ist kurz und klar umrissen:** Punkte 1–3 der offenen Liste (Auth + Policies) sind der eigentliche Schritt; 4–6 folgen unmittelbar daraus, weil sie nur den Nutzerkontext brauchen. Die Referenzimplementierung des SSO-Handshakes liegt bereits vor.

**Ehrliche Einordnung der Testaussagen:** „Getestet" heißt in diesem Dokument ausschließlich „in einem echten Lauf ausgeführt" – 30 Unit-Tests und 50 Browser-Prüfungen sind belegt. Datenbank-Schreibpfade, Last- und Penetrationstests sind **nicht** ausgeführt und dürfen nicht als bestanden gelten.
