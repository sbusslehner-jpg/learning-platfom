# UX/UI-Design-Briefing: Internationale Lernplattform für ServiceQ

**Status:** Entwurf · **Version:** 1.0 · **Stand:** Juli 2026
**Grundlage:** Konzept „Internationale Lernplattform für ServiceQ" v1.0 sowie das GroupIT-Logo (Farbwerte pixelgenau vermessen: Türkis `#00C8C1`, Anthrazit `#3A424E`). Alle angegebenen Kontrastwerte sind rechnerisch nach WCAG 2.1 geprüft.

---

## 1. Designvision und Gestaltungsprinzipien

**Vision: „Die ruhige Werkbank fürs Lernen."**
Die Plattform fühlt sich an wie ein präzises Werkzeug aus der After-Sales-Welt: ein dunkler Anthrazit-Rahmen gibt Halt und Markenidentität, eine helle, großzügige Inhaltsfläche macht das Lernen angenehm, und Türkis ist das einzige Signal – es zeigt ausschließlich, **wo man handeln kann und wie weit man ist**. Nichts blinkt, nichts konkurriert; der Schulungsinhalt ist immer das hellste, ruhigste Element auf dem Bildschirm.

**Signatur-Element:** Die strikte Bedeutungsregel des Türkis. *„Wenn etwas türkis ist, kann ich es anklicken – oder es zeigt meinen Fortschritt."* Diese eine Regel macht die Oberfläche in allen 30 Märkten ohne Erklärung erlernbar und wird konsequent durchgehalten: Primäraktionen, aktive Navigation, Fortschrittsringe und -balken, Links. Türkis wird nie dekorativ eingesetzt.

**Gestaltungsprinzipien**

1. **Ein Bildschirm, eine Aufgabe.** Jeder Screen hat genau eine Primäraktion (türkiser Button). Alles andere ist sekundär oder tertiär gestaltet.
2. **Inhalt liest sich wie ein Dokument, nicht wie eine App.** Schulungstexte stehen in einer begrenzten Lesespalte mit großzügiger Zeilenhöhe – das Interface tritt beim Lernen zurück.
3. **Status ist immer Text + Symbol + Farbe.** Kein Zustand (Entwurf, veraltet, Fehler …) wird jemals nur über Farbe kommuniziert – Grundvoraussetzung für Barrierefreiheit und 30 Sprachräume.
4. **Nichts geht verloren.** Automatisches Speichern im Editor, Rückgängig-Toasts statt Bestätigungsdialogen bei kleinen Aktionen, harte Bestätigungen nur bei folgenreichen (Veröffentlichen, Löschen, Sperre aufheben).
5. **Gleiches verhält sich gleich.** Eine Tabelle, ein Badge-Set, ein Panel-Muster, ein Editor-Muster – überall identisch. Wer die Benutzerverwaltung bedienen kann, kann auch die Marktverwaltung bedienen.
6. **30 Märkte sind Zeilen, niemals Spalten.** Skalierende Mengen (Sprachen, Märkte, Benutzer) werden immer als filterbare, sortierbare Listen dargestellt – nie als Matrix mit 30 Spalten.
7. **Barrierearm ab dem ersten Wireframe.** WCAG 2.1 AA ist Abnahmekriterium, nicht Nachbesserung: geprüfte Kontraste (Abschnitt 7), sichtbarer Tastaturfokus, Touchziele ≥ 44 px, `prefers-reduced-motion` wird respektiert.

---

## 2. Zielgruppen und wichtigste Nutzungsszenarien

**Anwender – Service- und Werkstattpersonal beim Händler.**
Nutzt die Plattform zwischen Terminen, an der Serviceannahme oder in der Werkstatt – oft am Tablet oder Smartphone, häufig unterbrochen, ohne Einarbeitung in das Tool selbst. Erwartet: sofort weitermachen können, nichts suchen müssen, nichts falsch machen können.
*Top-Szenarien:* (1) „Wo war ich?" – letztes Training mit einem Klick fortsetzen. (2) „Was gibt es zum Modul CCD?" – über Katalog oder Suche in ≤ 3 Klicks zum Training. (3) „Wie ging Schritt 4 nochmal?" – Schrittanleitung während der Arbeit am Tablet nachschlagen.

**Editor – zentrale Redaktion bei GroupIT.**
Arbeitet am Desktop mit großem Monitor, betreut viele Trainings und bis zu 30 Sprachstände parallel. Erwartet: schnelles Strukturieren, verlustfreies Arbeiten, jederzeit Überblick „wo brennt es in welcher Sprache", angstfreies Veröffentlichen mit klar angezeigten Konsequenzen.
*Top-Szenarien:* (1) Neues Training aus vorhandenem Handbuchmaterial aufbauen. (2) Nach einer Textänderung alle veralteten Übersetzungen gezielt abarbeiten. (3) Training für zusätzliche Märkte freigeben und den Übersetzungslauf überwachen.

**Administrator – IT/Projektleitung.**
Selten im System, aufgabengetrieben, will in Minuten fertig sein. Erwartet: klare Formulare, sichere Standardwerte, sofortiges Feedback (z. B. API-Test).
*Top-Szenarien:* (1) Benutzer anlegen und Märkten/Produkten zuordnen. (2) Neuen Markt mit Sprachen einrichten. (3) Mistral-API-Key hinterlegen, testen, rotieren.

---

## 3. Informationsarchitektur und Navigation

**Globaler Rahmen (App-Shell)**

- **Topbar (hell, weiß, 64 px):** GroupIT-Logo links (Originalfarben auf Weiß), globale Suche mittig/rechts, Hilfe und Profilmenü (mit UI-Sprachwahl) rechts. Die helle Topbar stellt sicher, dass das Logo in seinen Originalfarben stehen kann.
- **Sidebar (dunkel, Anthrazit-800, 264 px / eingeklappt 72 px):** trägt die Markenfarbe und die rollenbasierte Hauptnavigation. Aktiver Eintrag: Türkis-Balken links (3 px), Icon und Label in Türkis-500 (Kontrast 5,9:1 auf Anthrazit-800), Rest in Weiß/Grau.
- **Inhaltsfläche (Canvas Anthrazit-50 `#F6F8FA`):** weiße Karten und Flächen darauf.

**Navigationsstruktur nach Rolle** (Rollen sind additiv – ein Editor mit Admin-Rechten sieht beide Bereiche):

| Bereich | Einträge | Sichtbar für |
|---|---|---|
| Lernen | Start (Dashboard) · Katalog | alle Rollen |
| Redaktion | Inhalte · Übersetzungen | Editor |
| Verwaltung | Benutzer · Märkte & Sprachen · Einstellungen | Administrator |

**Orientierung in der Tiefe:** Breadcrumb unterhalb der Topbar auf allen Inhaltsseiten (`ServiceQ / Digital Service Reception / DSR-Konfiguration Einzelhandel`), URLs bilden die Hierarchie ab (tief verlinkbar, z. B. für Ankündigungen per E-Mail).

**Navigationsregeln:** Vom Dashboard zu jedem freigegebenen Training in maximal 3 Klicks; „Weiterlernen" in genau 1 Klick. Die Sidebar zeigt nie mehr als zwei Ebenen; alles Tiefere lebt in der Inhaltsfläche (Breadcrumb + Listen).

**Mobil (Anwender-Fokus):** Bottom-Navigation mit vier Zielen – Start, Katalog, Suche, Profil. Redaktion und Verwaltung sind mobil über das Profilmenü erreichbar, aber für Desktop optimiert (siehe Abschnitt 6).

---

## 4. Zentrale User-Flows (mit Verhalten)

**F1 – Anmelden.** Zentrierte Karte auf Anthrazit-Verlauf mit dezentem Türkis-Akzent. Zwei Felder (E-Mail, Passwort mit Sichtbarkeits-Toggle), Enter löst „Anmelden" aus. Fehler erscheinen als Inline-Meldung über dem Formular („E-Mail oder Passwort ist nicht korrekt.") – Felder werden rot umrandet, der Fokus springt zurück ins erste Feld. „Passwort vergessen"-Link vorhanden. Nach Login: direkt zum Dashboard.

**F2 – Weiterlernen (1 Klick).** Das Dashboard öffnet mit einer großen „Weiterlernen"-Karte: Trainingstitel, Fortschrittsring, Kapitelname, Button „Weiterlernen". Klick führt exakt an die letzte Position – gleiches Kapitel, bei Videos an die gemerkte Abspielposition.

**F3 – Training finden (≤ 3 Klicks).** Katalog → Produktkarte (z. B. ServiceQ) → Modulliste mit Trainingskarten → Training. Alternativ globale Suche: ab 2 Zeichen Sofortergebnisse in einem Overlay, gruppiert nach Produkt/Modul/Training, per Pfeiltasten navigierbar, Enter öffnet. Gesucht wird in Titeln und Beschreibungen in der Sprache des Nutzers; Filter-Chips (Produkt, Modul, Status „neu"/„begonnen") bleiben je Sitzung erhalten.

**F4 – Training absolvieren.** Lernansicht mit Kapitelliste links (Häkchen für abgeschlossene Kapitel) und Lesespalte rechts. Am Kapitelende steht der Primärbutton **„Kapitel abschließen & weiter"** – er markiert das Kapitel als abgeschlossen und lädt das nächste (entspricht dem Fortschrittsmodell des Konzepts: angesehen = abgeschlossen). Nach dem letzten Kapitel: Abschluss-Screen mit Fortschrittsring auf 100 %, Buttons „Zurück zur Übersicht" und „Nächstes Training im Modul". Fehlt eine Übersetzung eines Elements, erscheint der Master-Text mit dezenter Kennzeichnung „🌐 Original".

**F5 – Training erstellen und veröffentlichen (Editor).** „Inhalte" → Baumansicht → „+ Training" im gewünschten Modul → Titel eingeben → der Editor öffnet sofort (Details in Abschnitt 10). Autosave alle paar Sekunden mit sichtbarem Status („Gespeichert 14:32"). Veröffentlichen öffnet ein Seitenpanel mit: Marktauswahl, Validierungsliste (fehlende Pflichtfelder werden verlinkt), Konsequenzanzeige („Wird in **12 Sprachen** übersetzt – ca. 240 Textfelder") und dem Button „Jetzt veröffentlichen". Danach zeigt ein Fortschrittsbereich die laufenden Übersetzungsjobs je Sprache; die Bezeichnung bleibt konsistent: Button „Veröffentlichen" → Toast „Veröffentlicht".

**F6 – Übersetzungen prüfen und korrigieren (Editor).** „Übersetzungen" → Trainingsliste, sortiert nach Handlungsbedarf → Klick auf Sprachzeile mit Problemen (z. B. „Französisch · 3 veraltet, 1 Fehler") → Side-by-side-Prüfansicht (Abschnitt 10). Speichern einer Korrektur setzt das Feld auf „korrigiert" und sperrt es (Schloss-Symbol); Pfeil-runter springt zum nächsten offenen Feld, `Strg/Cmd + Enter` speichert.

**F7 – Verwaltung (Admin).** Benutzer anlegen im Seitenpanel: Name, E-Mail, Rolle(n), Märkte und Produkte als durchsuchbare Mehrfachauswahl mit Chips → „Einladung senden". Markt anlegen: Name, Code, Sprachen als Mehrfachauswahl, eine Standardsprache per Radio. Einstellungen → Mistral-API: maskiertes Key-Feld (`sk-••••a4f2`), Buttons „Ändern" und „Verbindung testen"; das Testergebnis erscheint inline mit Zeitstempel („✓ Verbindung erfolgreich · getestet 21.07.2026, 09:14") bzw. als verständliche Fehlermeldung mit Ursache.

---

## 5. Seiten- und Screenstruktur

| # | Screen | Zweck | Kernelemente | Verhaltens-Schwerpunkt |
|---|---|---|---|---|
| 1 | Login | Zugang | Karte, 2 Felder, Fehlerzeile | Enter-Submit, Inline-Fehler, Fokusführung |
| 2 | Dashboard „Start" | Einstieg & Fortschritt | „Weiterlernen"-Karte, „Neu für dich", „Meine Trainings" mit Ringen | 1-Klick-Fortsetzen, neue Trainings der eigenen Märkte |
| 3 | Katalog | Produkt-/Modulauswahl | Produktkarten → Modulliste | vorbereitet für weitere Produkte neben ServiceQ |
| 4 | Trainingsübersicht | Trainings eines Moduls | Trainingskarten (Titel, Dauer-Schätzung, Fortschritt, Badge „Neu") | Filter-Chips, Sortierung „empfohlen/neu" |
| 5 | Lernansicht | Konsum aller Inhaltstypen | Kapitelliste, Lesespalte, Elemente (Text, Schritte, Video, Bild, Dokument, Link) | Kapitelabschluss, Positionsgedächtnis, Fallback-Kennzeichnung |
| 6 | Suchergebnisse | Finden | Overlay + Vollseite, Gruppierung, Filter | Tastaturbedienung, leere Treffer mit Vorschlägen |
| 7 | Editor: Inhaltsbaum | Struktur verwalten | Baum Produkt→Modul→Training mit Status-Badges | Anlegen/Umbenennen inline, Kontextmenüs |
| 8 | Editor: Trainingseditor | Inhalte erstellen | Zweispaltiges Layout, Elementkarten, „+ Element" | Autosave, Drag & Drop, Undo-Toast (Abschnitt 10) |
| 9 | Publish-Panel | Veröffentlichen | Märkte, Validierung, Konsequenz, Jobfortschritt | Schutz vor versehentlichem Livegang |
| 10 | Übersetzungen: Übersicht | Handlungsbedarf sehen | Trainingsliste mit Sprachampeln „42/45 aktuell" | Sortierung nach Dringlichkeit, Filter |
| 11 | Übersetzungen: Prüfansicht | Korrigieren | Side-by-side Master/Ziel, Feldliste, Sperren | Statuswechsel, Bulk-Aktionen (Abschnitt 10) |
| 12 | Admin: Benutzer | Konten & Rechte | Tabelle, Suche, Seitenpanel | Chips für Märkte/Produkte, Rollenwechsel mit Bestätigung |
| 13 | Admin: Märkte & Sprachen | Struktur der Organisation | Marktliste mit Sprach-Chips | Standardsprache, Löschen nur ohne Abhängigkeiten |
| 14 | Admin: Einstellungen | Mistral-API | maskierter Key, Test, Glossar-Hinweis | niemals Klartext-Key, Testresultat mit Zeitstempel |

---

## 6. Layout- und Responsive-Konzept

**Raster & Maße.** 12-Spalten-Raster (Desktop), 8 (Tablet), 4 (Smartphone); Gutter 24/16 px. Maximale Inhaltsbreite 1200 px in einem 1440-px-Container. **Lesespalte für Schulungstexte: max. 720 px** (~ 70–75 Zeichen/Zeile). Topbar 64 px (mobil 56 px), Sidebar 264 px, eingeklappt 72 px (nur Icons mit Tooltips).

**Abstände.** 4-px-Basis, verwendete Stufen: 4 · 8 · 12 · 16 · 24 · 32 · 48 · 64. Kartenradius 8 px, Buttons 6 px, Chips/Badges voll gerundet. Zwei Schattenstufen: Karte (dezent) und Overlay/Panel (deutlich).

**Breakpoints & Verhalten.**

| Bereich | ≥ 1200 px Desktop | 744–1199 px Tablet | ≤ 743 px Smartphone |
|---|---|---|---|
| Navigation | Sidebar offen | Sidebar eingeklappt (Icons) | Bottom-Nav (Start · Katalog · Suche · Profil) |
| Lernansicht | Kapitelliste links fixiert | Kapitelliste einklappbar | Kapitel als Bottom-Sheet über Button „Kapitel" |
| Video | in Lesespalte, max. 720 px | volle Inhaltsbreite | randlos (full-bleed), Steuerung groß |
| „Weiter"-Aktion | am Kapitelende | am Kapitelende | zusätzlich sticky am unteren Rand |
| Editor & Übersetzungen | voll funktionsfähig | voll funktionsfähig (ab 1024 px empfohlen) | Lesemodus mit Hinweis „Bearbeitung am Desktop" |
| Admin | Tabellenlayout | Tabellenlayout, horizontales Scrollen der Tabelle | Karten-Listenansicht |

**Weitere Regeln.** Touchziele ≥ 44 × 44 px; Safe-Areas (iOS) werden respektiert; Modals werden mobil zu Bottom-Sheets; Tabellen scrollen horizontal mit fixierter erster Spalte; keine Hover-abhängigen Funktionen ohne Touch-Äquivalent (Aktionen erscheinen mobil dauerhaft als ⋮-Menü).

---

## 7. Farbsystem (aus dem GroupIT-Logo abgeleitet)

**Gemessene Ursprungswerte:** Türkis `#00C8C1` (Logo-Kreis), Anthrazit `#3A424E` (Wortmarke), Sekundärgrau der Wortmarke ≈ `#687080` (geht in der Anthrazit-Skala als Stufe 500 auf). Alle folgenden Kontrastwerte sind berechnet und WCAG-2.1-geprüft.

### Primärfarben – Türkis (Interaktion & Fortschritt)

| Token | Hex | Verwendung | Geprüfter Kontrast |
|---|---|---|---|
| `turquoise-50` | `#E6FAF9` | Auswahl-/Hover-Hintergründe, aktive Chips | – |
| `turquoise-100` | `#C9F4F2` | Hover auf turquoise-50-Flächen | – |
| `turquoise-300` | `#66E0DB` | Dekor auf dunklen Flächen, Diagramme | 7,8:1 auf Anthrazit-800 |
| `turquoise-500` | `#00C8C1` | **Logo-Türkis.** Primärbutton-Füllung, aktive Navigation, Fortschrittsringe/-balken | 5,9:1 auf Anthrazit-800 · Text darauf: siehe Regel unten |
| `turquoise-600` | `#009D97` | Icons, Fokusring, aktive Rahmen auf Weiß; gedrückter Primärbutton | 3,35:1 auf Weiß (≥ 3:1 ✓) |
| `turquoise-700` | `#007D78` | Links und Textakzente auf Weiß; Text auf turquoise-50 | 4,99:1 auf Weiß · 4,62:1 auf turquoise-50 (≥ 4,5:1 ✓) |
| `turquoise-900` | `#00504C` | Tiefe Akzente, Diagramme | – |

### Sekundärfarben – Anthrazit (Struktur & Text)

| Token | Hex | Verwendung | Geprüfter Kontrast |
|---|---|---|---|
| `anthracite-900` | `#232830` | Überschriften; Text auf Türkis-500 | 14,8:1 auf Weiß |
| `anthracite-800` | `#2E3540` | **Sidebar-/Markenfläche** | Weiß darauf: 12,4:1 |
| `anthracite-700` | `#3A424E` | **Logo-Anthrazit.** Fließtext | 10,2:1 auf Weiß · 9,5:1 auf Canvas |
| `anthracite-500` | `#5A6472` | Sekundärtext, Metadaten | 6,0:1 auf Weiß |
| `anthracite-450` | `#6B7480` | Platzhaltertext | 4,74:1 auf Weiß |
| `anthracite-400` | `#8A93A0` | **Rahmen von Eingabefeldern** | 3,11:1 auf Weiß (≥ 3:1 ✓) |
| `anthracite-300` | `#C3C9D1` | dekorative Kartenrahmen, Trennlinien | (dekorativ, keine Anforderung) |
| `anthracite-200` | `#E1E5EA` | Tabellenlinien | – |
| `anthracite-100` | `#EEF1F4` | Hover-Zeilen, deaktivierte Flächen | – |
| `anthracite-50` | `#F6F8FA` | App-Hintergrund (Canvas) | – |
| `white` | `#FFFFFF` | Karten, Oberflächen, Text auf Dunkel | – |

### Semantikfarben (jeweils Text / Fläche / Vollton)

| Bedeutung | Text | Fläche | Geprüfter Kontrast Text auf Fläche | Vollton-Nutzung |
|---|---|---|---|---|
| Erfolg | `#15803D` | `#EAF8F0` | 4,58:1 ✓ | Weiß auf `#15803D`: 5,0:1 ✓ |
| Warnung | `#B45309` | `#FDF3E4` | 4,57:1 ✓ | nur Fläche + Text (kein Vollton-Button) |
| Fehler | `#B42318` | `#FDEEEC` | 5,83:1 ✓ | Weiß auf `#B42318`: 6,6:1 ✓ (Löschen-Button) |
| Info | `#1D5BD6` | `#EBF1FE` | 5,27:1 ✓ | – |
| Neutral | `#5A6472` | `#EEF1F4` | 5,29:1 ✓ | – |

### Verbindliche Status-Zuordnung (immer Icon + Label + Farbe)

| Status | Farbe | Icon (Lucide) |
|---|---|---|
| Entwurf | Neutral | `pencil-line` |
| Veröffentlicht | Erfolg | `check-circle-2` |
| Übersetzung: fehlend | Neutral | `circle-dashed` |
| Übersetzung: automatisch | Info | `sparkles` |
| Übersetzung: korrigiert (gesperrt) | Erfolg | `lock` |
| Übersetzung: veraltet | Warnung | `history` |
| Übersetzung: Fehler | Fehler | `alert-circle` |

### Interaktionszustände

| Zustand | Spezifikation |
|---|---|
| Hover (Primärbutton) | Füllung `#00B3AC` (zwischen 500 und 600), Text bleibt Anthrazit-900 |
| Hover (Flächen/Zeilen) | Anthrazit-100; Links: Türkis-900 + Unterstreichung |
| Fokus (`:focus-visible`) | 2-px-Ring Türkis-600 mit 2 px Abstand; auf Anthrazit-800: Ring Türkis-300 |
| Gedrückt | Türkis-600-Füllung (kurzzeitig) |
| Ausgewählt | Fläche turquoise-50, Text/Icon Türkis-700; Navigation zusätzlich 3-px-Balken Türkis-500 |
| Deaktiviert | Fläche Anthrazit-100, Text Anthrazit-400, kein Schatten, `cursor: not-allowed` |
| Fehlerfeld | 2-px-Rahmen `#B42318` + Meldung mit Icon unter dem Feld |

### Harte Farbregeln

1. **Nie weißer Text auf Türkis-500** – gemessen nur 2,1:1. Auf Türkis-Flächen steht immer Anthrazit-900 (7,1:1 ✓). Das gilt auch für den Play-Button des Videoplayers.
2. Türkis als Textfarbe auf Weiß nur als `turquoise-700`; `turquoise-500` ist auf Weiß nie Textfarbe.
3. Türkis niemals dekorativ (keine türkisen Überschriften, Hintergrundverläufe oder Illustrations-Vollflächen) – sonst verliert die Signaturregel ihre Bedeutung.
4. Semantikfarben sind für Status reserviert und werden nie als Schmuckfarben verwendet; Erfolg-Grün ist bewusst klar vom Marken-Türkis unterscheidbar.
5. **Logo-Assets:** SVG-Logo mit Schutzraum (Höhe des Türkis-Kreises als Mindestabstand) anfordern; zusätzlich eine **Negativ-Variante (weiße Wortmarke)** für dunkle Flächen beschaffen – bis dahin steht das Logo ausschließlich auf hellen Flächen (Topbar, Login-Karte).

---

## 8. Typografie, Abstände, Icons und Bildsprache

**Schrift: Inter (variabel)**, Fallback `system-ui`, ergänzt um **Noto Sans** als Fallback für erweiterte Zeichensätze der 30 Märkte (Mittel-/Osteuropa, Griechisch, ggf. Kyrillisch). In Tabellen und Statuszahlen: `font-variant-numeric: tabular-nums`.

| Rolle | Größe/Zeilenhöhe | Gewicht | Verwendung |
|---|---|---|---|
| Display | 30/38 | 600 | Seitentitel Dashboard/Katalog |
| H1 | 24/32 | 600 | Trainings-/Bereichstitel |
| H2 | 20/28 | 600 | Kapitelüberschriften |
| H3 | 17/24 | 600 | Element-/Kartentitel |
| Body-Lernen | 17/28 | 400 | Schulungstexte in der Lesespalte |
| Body | 16/24 | 400 | Interface-Standard |
| Small | 14/20 | 400/500 | Tabellen, Metadaten |
| Caption/Eyebrow | 12/16 | 500, +0,04 em | Produkt-Label über Trainingstitel, Badges |

**Sprachfestigkeit:** Alle Komponenten werden mit **+35 % Textlänge** entworfen und geprüft (Deutsch/Finnisch/Polnisch als Langtext-Referenz); keine Versal-Setzung für dynamische Inhalte; Buttons wachsen mit dem Text statt zu kürzen; Datums- und Zahlenformate lokalisiert.

**Icons: Lucide**, 20 px (Fließtext/Tabellen) und 24 px (Navigation), Strichstärke 1,75. In der Navigation immer Icon **mit** Label (eingeklappte Sidebar: Tooltip). Die Status-Icon-Zuordnung aus Abschnitt 7 ist verbindlich und wird nirgends variiert.

**Bildsprache.**
- **Screenshots** aus ServiceQ (DSR, RPD, CCD …) sind der wichtigste Bildtyp: einheitlich in einem neutralen Rahmen (1 px Anthrazit-200, Radius 8 px, dezenter Schatten), nie freigestellt-schräg, Beschriftungspfeile in Anthrazit-700.
- **Video-Thumbnails** 16:9 mit zentriertem Play-Kreis: Fläche Türkis-500, Play-Symbol Anthrazit-900 (Farbregel 1).
- **Leere Zustände**: reduzierte Linien-Illustrationen in Anthrazit-300 mit einem einzelnen Türkis-Akzent, plus konkreter Handlungsaufforderung („Noch keine Trainings in diesem Modul. + Training anlegen").
- Keine generischen Stockfotos; wenn Fotos, dann reale Werkstatt-/Servicekontexte, farblich zurückhaltend.

---

## 9. UI-Komponenten und ihre Zustände

Alle Komponenten besitzen mindestens die Zustände *Standard · Hover · Fokus · Aktiv/Ausgewählt · Deaktiviert*; Eingabekomponenten zusätzlich *Fehler*; Ladeprozesse zeigen *Loading* (Spinner im Button bzw. Skeleton in Flächen).

| Komponente | Varianten | Besondere Zustände / Verhalten |
|---|---|---|
| Button | Primär (Türkis-500 + Anthrazit-900-Text), Sekundär (weiß, Rahmen Anthrazit-400), Tertiär (Textlink Türkis-700), Destruktiv (Vollton Fehler + Weiß) | Loading mit Spinner + beibehaltener Breite; pro Screen genau ein Primärbutton |
| Eingabefeld / Textarea | Standard, mit Präfix-Icon | Rahmen Anthrazit-400 → Fokus Türkis-600; Fehlerzustand mit Meldung; Zähler bei Längenlimits |
| Auswahl (Select) | einfach, durchsuchbar | Tastaturbedienung, Gruppierung |
| Mehrfachauswahl mit Chips | Märkte, Sprachen, Produkte | Suchfeld im Dropdown, gewählte Einträge als entfernbare Chips, „n weitere"-Kürzung ab 6 Chips mit Aufklapp-Popover |
| Badge/Status | alle Status aus Abschnitt 7 | immer Icon + Label; in Tabellen als kompakte Variante |
| Trainingskarte | Standard, „Neu", begonnen | Fortschrittsring 28 px; ganze Karte klickbar, Fokusring um die Karte |
| Fortschritt | Ring (Karten/Abschluss), Balken (Kapitel, Jobs) | Füllung Türkis-500 auf Anthrazit-200; Prozentwert als Text daneben |
| Tabelle/Datenliste | Standard, mit Auswahl | Kopf fixiert, Zeilen-Hover Anthrazit-100, Sortierindikatoren, erste Spalte mobil fixiert |
| Sprachzeile (Übersetzung) | Übersichts-Variante | Sprache, Aggregat „42/45 aktuell", Mini-Badges für veraltet/Fehler, Klick öffnet Prüfansicht |
| Tabs | Inhalt / Einstellungen etc. | Unterstrich Türkis-500, per Pfeiltasten wechselbar |
| Breadcrumb | Standard | letzte Ebene nicht verlinkt; mobil auf „◀ Elternebene" reduziert |
| Seitenpanel (Drawer) | 480 px rechts | für Anlegen/Bearbeiten & Publish; Fokusfalle, Esc schließt (mit Warnung bei ungespeicherten Änderungen) |
| Modal | Bestätigungen | nur für folgenreiche Aktionen; benennt Konsequenz konkret („3 Kapitel werden gelöscht") |
| Toast | Erfolg, Fehler, **Undo** | Undo-Toast 6 s für Element-/Kapitel-Löschung („Element gelöscht · Rückgängig") |
| Banner (Inline-Alert) | Info/Warnung/Fehler | z. B. „Veröffentlicht · 2 nicht veröffentlichte Änderungen" im Editor |
| Videoplayer | Standard | eigene Steuerung im UI-Stil: Play/Pause, Spulen ±10 s, Geschwindigkeit (1×/1,25×/1,5×), Vollbild; vollständig tastaturbedienbar (Leertaste, Pfeile); merkt Abspielposition; Fortschritt in Türkis-500 |
| Schrittanleitung (Anzeige) | nummerierte Schritte, optional Bild je Schritt | Nummern-Kreis Anthrazit-800/Weiß; abgehakte Optik nur im Lernkontext nicht nötig – Schritte sind Referenzmaterial |
| Upload/Dropzone | Video, Bild, Dokument | Drag & Drop + Dateiauswahl, Fortschrittsbalken, verständliche Fehl-Formate-Meldung; Sprachvarianten-Slot je Sprache |
| Skeleton/Empty/Error-State | je Listen-/Detailfläche | Skeleton statt Spinner bei Inhalten; Error-State mit Retry-Button |

---

## 10. UX-Konzept für Editor und Übersetzungsverwaltung

### 10.1 Trainingseditor – „Dokument mit Bausteinen"

Der Editor folgt dem Muster moderner Block-Editoren, reduziert auf die sechs Elementtypen des Konzepts – keine Lernkurve für Redakteure ohne technischen Hintergrund.

```
┌───────────────────────────────────────────────────────────────────────┐
│ ◀ Inhalte   ServiceQ / DSR / „DSR-Konfiguration Einzelhandel"         │
│ [Entwurf]  Gespeichert 14:32              [Vorschau] [Veröffentlichen]│
├────────────────┬──────────────────────────────────────────────────────┤
│ KAPITEL        │  Kapitel 1: Überblick & Konfigurationsebenen         │
│ ● 1 Überblick  │  ┌────────────────────────────────────────────────┐  │
│ ○ 2 Rollen     │  │ ▶ Video · Einführung DSR              ⠿  ⋮    │  │
│ ○ 3 DealerData │  └────────────────────────────────────────────────┘  │
│ ＋ Kapitel     │  ┌────────────────────────────────────────────────┐  │
│                │  │ ¶ Text · Systemeinstellungen (CDM) …  ⠿  ⋮    │  │
│                │  └────────────────────────────────────────────────┘  │
│                │              [＋ Element hinzufügen]                 │
└────────────────┴──────────────────────────────────────────────────────┘
```

**Verhalten.**
- **Struktur links, Inhalt rechts.** Kapitel werden inline umbenannt und per Drag-Handle (⠿) sortiert; Elemente ebenso innerhalb des Kapitels.
- **„+ Element"** öffnet ein Popover mit den sechs Typen (Icon + Name + Ein-Satz-Beschreibung). Textelemente nutzen einen bewusst schmalen Rich-Text-Umfang: Absatz, Zwischenüberschrift, fett, Liste, Link – mehr nicht.
- **Autosave** mit sichtbarem Zeitstempel; kein „Speichern"-Button für Inhalte. Löschen von Elementen/Kapiteln erzeugt einen Undo-Toast statt eines Modals.
- **Vorschau** zeigt die exakte Anwendersicht (gleiche Komponenten, Lesespalte) in einem neuen Tab-Kontext, umschaltbar je Sprache.
- **Schutz veröffentlichter Trainings:** Änderungen an einem veröffentlichten Training gehen nicht ungefragt live. Der Statusbereich zeigt „Veröffentlicht · 2 nicht veröffentlichte Änderungen" mit der Aktion **„Änderungen veröffentlichen"** – erst diese startet auch den Übersetzungs-Delta-Lauf. (Empfehlung, die das Konzept-Prinzip „Schutz vor versehentlichen Änderungen" umsetzt, ohne echte Versionierung einzuführen.)
- **Publish-Panel** (rechtes Seitenpanel): Marktauswahl mit Chips, automatisch abgeleitete Sprachliste, Validierung (verlinkte Fehlstellen), Konsequenztext mit Feldanzahl, danach Live-Fortschritt der Übersetzungsjobs je Sprache mit Status.

### 10.2 Übersetzungsverwaltung – drei Ebenen statt einer Riesenmatrix

**Ebene 1 – Übersicht:** Liste aller Trainings mit aggregierter „Sprachgesundheit" („FR ⚠ · PL ⚠ · 27 ✓"), sortiert nach Handlungsbedarf. Filter: nur Fehler, nur veraltet, nach Produkt/Modul, nach Sprache.

**Ebene 2 – Training:** Sprachzeilen (eine Zeile je Sprache, nie Spalten) mit Aggregat „42/45 aktuell · 2 veraltet · 1 Fehler", Buttons „Prüfen" und „↻ Ausstehende neu übersetzen" je Zeile; Bulk-Aktion „Alle Fehler erneut übersetzen".

**Ebene 3 – Prüfansicht (Side-by-side):**

```
┌───────────────────────────────────────────────────────────────────────┐
│ ◀ „DSR-Konfiguration Einzelhandel" · Französisch      42/45 aktuell   │
│ Filter: [Alle ▾] [nur veraltet ✓] [nur Fehler ✓]                      │
├───────────────┬───────────────────────┬───────────────────────────────┤
│ FELDER        │ MASTER (Deutsch)      │ FRANZÖSISCH                   │
│ ⏳ Kap.1 Titel│ Überblick & Konfig…   │ [ Aperçu et niveaux de conf…] │
│ ⏳ Text 1.2   │ (schreibgeschützt)    │ Status: ⏳ veraltet           │
│ ⚠ Schritt 3.1 │                       │ [🔒 Korrigieren & sperren]    │
│ ✓ …           │                       │ [↻ Neu übersetzen]            │
└───────────────┴───────────────────────┴───────────────────────────────┘
```

**Verhalten.**
- Feldliste links, standardmäßig gefiltert auf *veraltet* + *Fehler* (der Editor sieht zuerst, was Arbeit macht); Masterspalte schreibgeschützt; bei *veraltet* wird die Änderung im Master hervorgehoben.
- **„Korrigieren & sperren"** speichert die manuelle Fassung, setzt Status *korrigiert* und zeigt das Schloss – gesperrte Felder sind visuell klar unterscheidbar (Schloss-Icon, Erfolg-Badge) und werden von der Automatik nie überschrieben. **„Sperre aufheben"** verlangt eine Bestätigung mit Konsequenztext („Der Text kann beim nächsten Lauf automatisch überschrieben werden.").
- **Fehler-Felder** zeigen die Original-Fehlermeldung des Übersetzungslaufs aufklappbar (aus dem Job-Protokoll) plus Einzel-Retry.
- **Tastatur-Flow:** ↓/↑ nächstes/vorheriges offenes Feld, `Strg/Cmd + Enter` speichert & springt weiter – Korrigieren wird zur flüssigen Fließbandarbeit.
- Aggregat oben aktualisiert live („43/45 aktuell") – sichtbarer Fortschritt motiviert beim Abarbeiten.

---

## 11. Empfehlungen für ein wiederverwendbares Design-System

- **Token-Architektur in drei Schichten:** Primitive (`turquoise-600`, `anthracite-700`, `space-4`) → semantische Tokens (`color-action-primary`, `color-text-secondary`, `color-status-outdated-bg`, `focus-ring`) → Komponenten-Tokens. Komponenten referenzieren ausschließlich semantische Tokens – so bleibt ein späterer Dark Mode oder ein zweites Produkt-Theming möglich, ohne Komponenten anzufassen.
- **Eine Quelle der Wahrheit:** `tokens.json` (Farben, Typo, Abstände, Radien, Schatten) wird nach Figma Variables **und** in die Frontend-Konfiguration (CSS Custom Properties bzw. Tailwind-Theme) synchronisiert. Hex-Werte tauchen weder in Figma-Specs noch im Komponenten-Code direkt auf.
- **Komponentenbasis:** passend zur im Konzept empfohlenen Next.js-Umsetzung eine Headless-/shadcn-ui-Basis, überschrieben mit den GroupIT-Tokens. Figma-Komponentennamen = Code-Komponentennamen (z. B. `Badge/Status/Outdated`).
- **Dokumentation je Komponente:** Anatomie, Zustände, Do/Don't (z. B. „Don't: weißer Text auf Türkis-500"), Textregeln (Label-Wortlaut, Sentence case, Aktionsname bleibt über den ganzen Flow identisch: „Veröffentlichen" → „Veröffentlicht").
- **i18n-Fitness als Definition of Done:** jede Komponente wird mit kürzestem und längstem Referenztext (DE/FI/PL) sowie mit 30-Märkte-Testdaten abgenommen; Layout mit logischen CSS-Eigenschaften (`margin-inline-start` statt `margin-left`), damit RTL-Märkte später ohne Umbau möglich sind.
- **Governance:** Design-System als eigene, versionierte Figma-Bibliothek; Änderungen nur über einen kleinen Review-Prozess (Designer + Frontend), Changelog im File.

---

## 12. Vorgaben für Wireframes und High-Fidelity-Mock-ups

**Figma-Setup.**
- Seitenstruktur: `00 Tokens & Styles` · `01 Komponenten` · `02 Wireframes` · `03 Hi-Fi` · `04 Prototypen` · `05 Handoff`.
- Pro Screen drei Frames: **1440** (Desktop), **834** (Tablet), **390** (Smartphone); 8-px-Raster, Layout-Grids nach Abschnitt 6; **Auto-Layout ist Pflicht** (Textlängen-Robustheit).
- Farb-/Text-Styles und Variables exakt nach Abschnitt 7/8 anlegen, bevor der erste Screen entsteht.

**Reihenfolge und Priorität.**
- **P1:** Login · Dashboard · Trainingsübersicht · Lernansicht (inkl. Video + Schrittanleitung) · Trainingseditor · Publish-Panel · Übersetzungs-Übersicht · Prüfansicht.
- **P2:** Katalog · Suche · Admin-Screens · Empty/Error/Loading-Varianten aller P1-Screens.
- Wireframes in Graustufen, Türkis ausschließlich für Primäraktionen – so wird die Signaturregel schon in Lo-Fi getestet.

**Inhalts-Pflichten (kein Lorem ipsum).**
- Musterinhalt ist ein reales Training: **„DSR – Konfiguration im Einzelhandel"** mit Kapiteln und Elementen aus der bestehenden ServiceQ-Dokumentation.
- Übersetzungs-Screens mit realistischem Datensatz: 1 Training, **12 Sprachen**, gemischte Status (aktuell/veraltet/Fehler/gesperrt) und einmal der Vollausbau **30 Märkte** für den Härtetest der Listen.
- Jeder P1-Screen zusätzlich einmal mit **Langtext-Variante** (DE/FI) zur Layoutprüfung.

**Hi-Fi- und Verhaltens-Pflichten.**
- Jede Komponente in allen Zuständen aus Abschnitt 9; **Fokuszustände werden in den Mock-ups sichtbar dargestellt**, nicht nur beschrieben.
- Verhaltens-Annotationen direkt am Frame: Klickziele, Tastaturkürzel, Autosave-Verhalten, Undo-Toasts, Validierungsmomente.
- Drei klickbare Prototypen: **F2** Weiterlernen (mobil), **F5** Training erstellen → veröffentlichen (Desktop), **F6** Übersetzung korrigieren (Desktop).

**Abnahmekriterien vor Entwicklungsstart.**
1. Kontrast-Check aller Screens mit Plugin (z. B. Stark) – Sollwerte aus Abschnitt 7 erfüllt.
2. Klickzahlen nachgewiesen: Weiterlernen = 1 Klick, Training finden ≤ 3 Klicks.
3. Kein Hex-Wert und keine freie Schriftgröße außerhalb der Tokens/Styles.
4. Alle P1-Screens besitzen Empty-, Loading- und Fehler-Zustand.
5. Langtext-Varianten brechen kein Layout.
6. Handoff über Figma Dev Mode; Komponenten- und Token-Namen stimmen mit der geplanten Codebasis überein.