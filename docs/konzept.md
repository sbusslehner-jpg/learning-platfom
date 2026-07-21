# Konzept: Internationale Lernplattform für ServiceQ

**Status:** Entwurf · **Version:** 1.0 · **Stand:** Juli 2026

---

## 1. Zielbild

Eine schlanke, responsive Web-Lernplattform, die Schulungsinhalte für **ServiceQ** zentral bereitstellt und perspektivisch weitere Produkte aufnimmt. Inhalte werden **einmal in einer Master-Sprache** erstellt, automatisch über die **Mistral API** in die Landessprachen von bis zu **30 Märkten** übersetzt und den Nutzern der jeweiligen Märkte freigegeben.

Die Plattform ist bewusst **kein vollständiges LMS**: keine Prüfungen, Zertifikate, SCORM-Schnittstellen, Gamification oder Foren. Der Kern beschränkt sich auf vier Dinge: **Inhalte erstellen → übersetzen → veröffentlichen → konsumieren** (mit einfachem Lernfortschritt).

**Leitprinzipien**

- *Ein Inhalt, viele Sprachen:* Pflege erfolgt nur in der Master-Sprache; Übersetzung ist ein automatisierter Prozess mit menschlicher Korrekturmöglichkeit.
- *Skalierung durch Konfiguration:* Neue Märkte, Sprachen und Produkte sind Datensätze, keine Softwareänderungen.
- *Einfachheit vor Funktionsvielfalt:* Jede Funktion muss dem Kernablauf dienen.

---

## 2. Rollen und Berechtigungen

| Funktion | Administrator | Editor | User |
|---|:---:|:---:|:---:|
| Benutzer anlegen, Rollen zuweisen | ✅ | – | – |
| Benutzer Märkten/Produkten zuordnen | ✅ | – | – |
| Märkte und Sprachen verwalten | ✅ | – | – |
| Mistral-API-Key hinterlegen, testen, rotieren | ✅ | – | – |
| Produkte, Module, Trainings erstellen/bearbeiten | – | ✅ | – |
| Texte, Videos, Bilder, Dokumente, Links einfügen | – | ✅ | – |
| Entwurf speichern / veröffentlichen | – | ✅ | – |
| Trainings Märkten zuordnen | – | ✅ | – |
| Übersetzungen prüfen und korrigieren | – | ✅ | – |
| Freigegebene Trainings ansehen, filtern | ✅ | ✅ | ✅ |
| Eigenen Lernfortschritt sehen | ✅ | ✅ | ✅ |

**Sichtbarkeitsregel für User:** Ein User sieht ausschließlich **veröffentlichte** Trainings, die (a) einem seiner Märkte und (b) einem seiner Produkte zugeordnet sind – in der Sprache seines Marktes, mit Fallback auf die Master-Sprache.

Ein Admin kann zusätzlich die Editor-Rolle erhalten (Mehrfachrollen zulässig). Eine Rolle „Markt-Editor" (Übersetzungsprüfung nur für den eigenen Markt) ist bewusst **nicht** im MVP, aber im Rechtemodell vorbereitet (Rolle + Marktzuordnung existieren bereits).

---

## 3. Nutzerabläufe

**A) Admin richtet die Plattform ein**

1. Märkte anlegen (z. B. Deutschland, Frankreich, Polen …) und jedem Markt eine oder mehrere Sprachen zuordnen.
2. Mistral-API-Key hinterlegen → Button **„Verbindung testen"** (Mini-Testübersetzung serverseitig).
3. Benutzer anlegen, Rolle zuweisen, Märkten und Produkten zuordnen.

**B) Editor erstellt und veröffentlicht ein Training**

1. Struktur anlegen: Produkt → Modul → Training → Kapitel.
2. Inhaltselemente je Kapitel einfügen (Text, Schrittanleitung, Video, Bild, Dokument, Link).
3. Als **Entwurf** speichern (jederzeit, unsichtbar für User).
4. Zielmärkte zuordnen.
5. **Veröffentlichen** → System startet automatisch die Übersetzung in alle Sprachen der zugeordneten Märkte.

**C) Editor prüft Übersetzungen**

1. Übersetzungsübersicht je Training: Matrix *Sprache × Status* (automatisch / korrigiert / veraltet / Fehler / fehlend).
2. Einzelne Texte in Seitenansicht (Master links, Übersetzung rechts) korrigieren.
3. Korrigierte Texte werden **gesperrt** und bei künftigen Übersetzungsläufen nicht überschrieben.

**D) User lernt**

1. Login → Trainingsübersicht, gefiltert auf eigene Märkte/Produkte, in eigener Sprache.
2. Filter nach Produkt oder Modul; „Zuletzt angesehen" prominent.
3. Training öffnen, Kapitel durcharbeiten; Videos, Bilder, Dokumente direkt ansehen/öffnen.
4. Fortschritt wird automatisch je Kapitel erfasst (angesehen = abgeschlossen).

---

## 4. Inhaltsstruktur

Fünf Ebenen, streng hierarchisch:

**Produkt → Modul → Training → Kapitel → Inhaltselement**

Beispiel auf Basis der bestehenden ServiceQ-Dokumentation:

```
Produkt: ServiceQ
├── Modul 1: Digital Service Reception (DSR)
│   ├── Training: DSR – Konfiguration im Einzelhandel
│   │   ├── Kapitel 1: Überblick & Konfigurationsebenen
│   │   │   ├── Video: Einführung DSR
│   │   │   ├── Text: Systemeinstellungen (CDM) im Überblick
│   │   │   └── Schrittanleitung: DealerData-Einstellungen
│   │   └── Kapitel 2: Rollen & Rechte (Dealer_Admin)
│   └── Training: DSRconfig (Modul 1A)
├── Modul 2: Repair Documentation (RPD)
│   ├── Training: RPD im Werkstattalltag
│   └── Training: Checklisten konfigurieren (RPC / Modul 2A)
├── Modul 3: Customer Communication Dashboard (CCD)
│   └── Training: CCC – Konfiguration (Modul 3A)
└── Modul: Online Check-In
    └── Training: Vorbereitung & Aktivierung
```

**Inhaltselement-Typen (MVP):**

| Typ | Inhalt | Übersetzbar |
|---|---|---|
| Text | Rich Text (Überschriften, Absätze, Hervorhebungen) | ✅ automatisch |
| Schrittanleitung | Nummerierte Schritte, optional Bild je Schritt | ✅ Schritttexte |
| Video | Videodatei oder Einbettung, Titel + Beschreibung | ✅ nur Titel/Beschreibung |
| Bild | Bilddatei mit Bildunterschrift | ✅ nur Bildunterschrift |
| Dokument | PDF/Datei-Download mit Bezeichnung | ✅ nur Bezeichnung |
| Link | Externe URL mit Bezeichnung | ✅ nur Bezeichnung |

Mediendateien (Videos, Bilder, PDFs) werden **nicht** automatisch übersetzt. Pro Element kann optional eine **sprachspezifische Dateivariante** hinterlegt werden (z. B. französisches PDF); fehlt sie, wird die Master-Datei angezeigt. Auch Titel und Beschreibungen von Produkt, Modul, Training und Kapitel sind übersetzbare Felder.

---

## 5. Übersetzungsprozess

**Grundmodell:** Jedes Training hat eine Master-Sprache. Zielsprachen ergeben sich automatisch aus den Sprachen aller zugeordneten Märkte. Übersetzt wird **feldweise** – jedes übersetzbare Feld ist eine eigene Einheit mit eigenem Status.

**Ablauf eines Übersetzungslaufs**

1. **Trigger:** Veröffentlichung eines Trainings, nachträgliche Marktzuordnung oder manuell („Übersetzungen aktualisieren").
2. **Delta-Erkennung:** Für jedes Quellfeld wird ein Hash gespeichert. Nur Felder, deren Hash sich seit der letzten Übersetzung geändert hat (oder die noch nie übersetzt wurden), werden neu übersetzt.
3. **Schutzregel:** Felder mit Status *korrigiert* werden **nie überschrieben**. Ändert sich der Quelltext eines korrigierten Feldes, wechselt es auf *veraltet* und erscheint in der Prüfliste des Editors.
4. **Ausführung:** Ein serverseitiger Worker arbeitet die Felder als Warteschlange ab (Batching, Rate-Limit-Handling, automatischer Retry bei temporären Fehlern).
5. **Fehlerbehandlung:** Jeder Lauf erzeugt ein Protokoll (Zeitpunkt, Training, Feld, Sprache, Fehlermeldung). Fehlgeschlagene Felder erhalten Status *Fehler* und sind in der Übersicht sichtbar; Retry per Klick.
6. **Fallback zur Laufzeit:** Fehlt eine Übersetzung oder ist sie fehlerhaft, sieht der User den Master-Text (dezent gekennzeichnet, z. B. „🌐 Original").

**Statusmodell je Feld und Sprache**

| Status | Bedeutung |
|---|---|
| fehlend | noch nie übersetzt |
| automatisch | maschinell übersetzt, aktuell |
| korrigiert | manuell geprüft/geändert – schreibgeschützt für die Automatik |
| veraltet | Quelltext hat sich nach Übersetzung/Korrektur geändert |
| Fehler | letzter Übersetzungsversuch fehlgeschlagen |

Auf Trainingsebene wird der Status je Sprache aggregiert angezeigt (z. B. „FR: 42/45 aktuell, 2 veraltet, 1 Fehler").

**Qualität:** Der Übersetzungs-Prompt enthält ein zentrales **Glossar** (nicht zu übersetzende Fachbegriffe wie *ServiceQ, DSR, RPD, CCD, Dealer_Admin, Online Check-In*) sowie Kontext („Schulungstext für Werkstatt-/Servicepersonal, Sie-Form, sachlich").

**API-Key-Sicherheit**

- Speicherung ausschließlich serverseitig, **verschlüsselt** (AES-256-GCM mit Anwendungsschlüssel bzw. Secrets Manager der Hosting-Umgebung).
- In der Admin-Oberfläche nur maskiert sichtbar (`sk-…a4f2`), Klartext nie an das Frontend ausgeliefert.
- Kein Logging des Keys; HTTP-Bibliothek so konfiguriert, dass Auth-Header nie in Fehler-Logs erscheinen.
- **„Verbindung testen"**: serverseitiger Mini-Aufruf, Ergebnis (OK / Fehlermeldung) an den Admin.
- Key-Wechsel (Rotation) jederzeit ohne Neustart möglich.

---

## 6. MVP-Funktionsumfang

**Enthalten**

- Login (E-Mail/Passwort), Rollen Admin / Editor / User
- Benutzer-, Markt- und Sprachverwaltung inkl. Zuordnungen
- Inhaltsverwaltung: Produkt, Modul, Training, Kapitel, Inhaltselemente (6 Typen)
- Datei-Upload für Videos, Bilder, Dokumente; sprachspezifische Dateivarianten
- Entwurf / Veröffentlichung je Training, Marktzuordnung
- Automatische Übersetzung (Mistral) mit Delta-Erkennung, Korrektur, Sperre, Status, Fehlerprotokoll, Fallback
- API-Key-Verwaltung mit Verbindungstest
- User-Frontend: Trainingsübersicht, Filter (Produkt/Modul), „Zuletzt angesehen", Kapitel-Fortschritt
- Responsive Web-Oberfläche (Desktop, Tablet, Smartphone)

**Bewusst nicht enthalten** (Abgrenzung zum LMS)

Quizze/Prüfungen, Zertifikate, Pflichttrainings mit Fristen, SCORM/xAPI, Gamification, Kommentare/Foren, Benachrichtigungen, detailliertes Lern-Reporting für Vorgesetzte, native Apps, Offline-Modus, Versionierung veröffentlichter Trainings (letzter Stand gewinnt).

---

## 7. Technischer Architekturvorschlag

Schlanker **Monolith** – ein Deployment, eine Datenbank, ein asynchroner Worker. Keine Microservices.

```
Browser (Admin / Editor / User – responsive Web-App)
        │ HTTPS
        ▼
┌─────────────────────────────────────────────┐
│  Webanwendung (Monolith)                    │
│  UI · API · Auth · Rechte · Upload          │
└──────┬───────────────┬──────────────┬───────┘
       ▼               ▼              ▼
  PostgreSQL     Objektspeicher   Übersetzungs-Worker
  (Struktur,     (S3-kompatibel:  (Job-Queue, Batching,
  Übersetzungen, Videos, Bilder,   Retry)
  Nutzer,        Dokumente)            │ nur serverseitig
  Fortschritt)      │ CDN              ▼
                                  Mistral API
                                  (Key verschlüsselt)
```

| Baustein | Empfehlung | Begründung |
|---|---|---|
| Anwendung | Next.js (Full-Stack) *oder* Laravel/Django – je nach Team-Kompetenz | Ein Framework für UI + API, schnelle Umsetzung |
| Datenbank | PostgreSQL | Relational passt exakt zum Datenmodell, JSON-Felder für Element-Payloads |
| Dateien | S3-kompatibler Objektspeicher + CDN | 30 Märkte → Auslieferung nah am Nutzer |
| Video | MP4 progressiv über CDN; optional externer Video-Host (z. B. Bunny Stream) | Kein eigener Streaming-Stack im MVP |
| Übersetzung | Interner Worker mit DB-basierter Job-Queue | Reicht für das Volumen, keine extra Infrastruktur |
| Auth | E-Mail/Passwort + Session; SSO-fähig gehalten (OIDC-Erweiterungspunkt) | MVP einfach, Konzernanbindung später möglich |
| Hosting | EU-Region (DSGVO), TLS überall | Nutzerdaten + Lernfortschritt sind personenbezogen |
| UI-Sprachen | Standard-i18n-Dateien für die Oberfläche, Inhalte aus der DB | Trennung von Oberflächen- und Inhaltsübersetzung |

---

## 8. Vereinfachtes Datenmodell

```
user            (id, name, email, password_hash, role[admin|editor|user], ui_language)
user_market     (user_id, market_id)
user_product    (user_id, product_id)
market          (id, name, code)                      z. B. „FR", „PL"
language        (code, name)                          z. B. „fr", „pl"
market_language (market_id, language_code, is_default)
product         (id, slug, sort)
module          (id, product_id, slug, sort)
training        (id, module_id, status[draft|published], master_language, published_at)
training_market (training_id, market_id)
chapter         (id, training_id, sort)
content_element (id, chapter_id, type[text|steps|video|image|document|link], sort, payload_json)
asset           (id, element_id, language_code NULL, file_key, mime)
                 └─ language_code NULL = Master-Datei; gesetzt = Sprachvariante
translation     (id, ref_type, ref_id, field, language_code,
                 text, status[missing|auto|edited|outdated|error],
                 source_hash, updated_at, updated_by)
                 └─ polymorph: übersetzt Felder von product, module, training,
                    chapter und content_element über eine Tabelle
translation_job (id, training_id, language_code, started_at, finished_at,
                 status, error_log)
progress        (user_id, chapter_id, viewed_at, completed)
setting         (key, value_encrypted)                u. a. mistral_api_key
```

Kernidee: **Alle Übersetzungen liegen in einer einzigen polymorphen Tabelle** mit Feldreferenz, Status und Quell-Hash. Damit sind Delta-Erkennung, Sperrschutz und Statusanzeige mit einfachen Abfragen umsetzbar.

---

## 9. Grobe Umsetzungsroadmap

Richtwerte für ein kleines Team (2 Entwickler, anteilig 1 Product Owner / UX):

| Phase | Dauer | Inhalte | Ergebnis |
|---|---|---|---|
| 0 – Fundament | Wo. 1–2 | Projektsetup, Datenmodell, Auth, Rollen/Rechte | lauffähiges Grundgerüst |
| 1 – Verwaltung & Inhalte | Wo. 3–6 | Benutzer-/Markt-/Sprachverwaltung, Content-Editor (Produkt→Element), Upload, Entwurf/Veröffentlichung | Editoren können Trainings vollständig anlegen |
| 2 – Übersetzung | Wo. 7–9 | Mistral-Anbindung, Worker/Queue, Hash-Delta, Statusmodell, Korrektur + Sperre, Fehlerprotokoll, Key-Verwaltung + Test | Übersetzungs-Pipeline komplett |
| 3 – User-Erlebnis | Wo. 10–12 | Trainingsübersicht, Filter, Kapitelansicht, Player/Viewer, Fortschritt, responsive Feinschliff | Endnutzer können lernen |
| 4 – Pilot | Wo. 13–14 | Pilot mit Master-Sprache + 2–3 Märkten, echte ServiceQ-Inhalte (z. B. DSR- und RPD-Trainings), Feedback, Härtung | produktionsreifes MVP |
| Rollout | ab Wo. 15 | Weitere Märkte/Sprachen rein konfigurativ, sukzessive Inhaltsmigration | 30 Märkte |

Gesamtdauer bis zum Pilotende: **ca. 3,5 Monate**. Die bestehenden ServiceQ-Handbücher (DSR, RPD/RPC, CCD/CCC, Online Check-In) dienen als erste Inhaltsquelle für den Pilot.

---

## 10. Risiken und offene Fragen

**Risiken und Gegenmaßnahmen**

| Risiko | Gegenmaßnahme |
|---|---|
| Übersetzungsqualität bei Fachtermini (Werkstatt-/Servicekontext) | Glossar im Prompt, Pilot mit Muttersprachler-Stichproben je Sprache, Korrektur-Workflow |
| Mistral-Rate-Limits/-Kosten bei Erstübersetzung großer Bestände | Queue mit Batching, nur Delta-Übersetzung, Kosten-Schätzung vor Massenlauf |
| Video-Volumen und Ladezeiten in entfernten Märkten | CDN von Beginn an; bei Bedarf externer Video-Host statt Eigenbau |
| Kompromittierung des API-Keys | Verschlüsselung, Maskierung, kein Logging, einfache Rotation |
| Scope Creep Richtung Voll-LMS | „Bewusst nicht enthalten"-Liste als verbindliche Abgrenzung, Änderungen nur über Backlog |
| Master-Text ändert sich nach vielen manuellen Korrekturen | Status *veraltet* + Prüfliste macht Nacharbeit sichtbar statt sie stillschweigend zu verlieren |

**Offene Fragen (vor Phase 0 zu klären)**

1. **Master-Sprache:** Deutsch oder Englisch? (Beeinflusst Glossar, Prompt und Redaktionsprozess.)
2. **Authentifizierung:** Reicht E-Mail/Passwort, oder ist Anbindung an ein bestehendes Identitätssystem (SSO/Entra ID) gefordert?
3. **Übersetzungsprüfung je Markt:** Wer prüft real? Falls Marktorganisationen prüfen sollen → Rolle „Markt-Editor" früher einplanen.
4. **Sprachumfang:** Welche der 30 Märkte haben mehrere Sprachen (z. B. CH, BE)? Sind RTL-Sprachen dabei (Layout-Aufwand)?
5. **Video-Strategie:** Eigene Dateien oder bestehender Video-Host im Konzern? Werden Untertitel benötigt (wären übersetzbar, aber Zusatzaufwand)?
6. **Hosting-Vorgaben:** Interne Infrastruktur oder Cloud? Konzern-Compliance-Anforderungen (DSGVO, Auftragsverarbeitung Mistral)?
7. **Nutzerzahlen:** Erwartete User je Markt (Dimensionierung, Lizenz-/Kostenmodell)?
8. **Benutzeranlage:** Manuell durch Admin oder Selbstregistrierung mit Freigabe?
