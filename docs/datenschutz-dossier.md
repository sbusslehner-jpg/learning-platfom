# Datenschutz-Dossier – ServiceQ Lernplattform

**Stand:** 27. Juli 2026 · **Status:** Entwurf zur Vorlage beim Datenschutzbeauftragten

Dieses Dossier ist die Arbeitsgrundlage für die Freigabe nach R-04. Es enthält
das Verzeichnis der Verarbeitungstätigkeiten, die technischen und
organisatorischen Maßnahmen, die Prozesse für Betroffenenrechte und eine
Checkliste der abzuschließenden Auftragsverarbeitungsverträge.

Alle technischen Angaben sind aus der laufenden Konfiguration abgeleitet, nicht
aus einer Vorlage übernommen. Die Belegstelle steht jeweils dabei. Was das
Dossier **nicht** leisten kann, ist die rechtliche Bewertung – insbesondere die
Rechtsgrundlage für die Auswertung von Lernfortschritt im
Beschäftigungsverhältnis.

---

## 1. Verzeichnis der Verarbeitungstätigkeiten (Art. 30 DSGVO)

### 1.1 Verantwortlicher

Einzutragen in `src/app/legal/entity.ts`; die Rechtsseiten der Anwendung lesen
ausschließlich von dort. Solange Felder leer sind, weist die Anwendung sie im
Impressum sichtbar als fehlend aus.

### 1.2 Verarbeitungstätigkeit „Betrieb der Lernplattform"

| Punkt | Angabe |
|---|---|
| **Zweck** | Bereitstellung und Nachweis verpflichtender sowie freiwilliger Schulungen für Beschäftigte und Partnerbetriebe |
| **Betroffene** | Beschäftigte der Märkte, Beschäftigte von Partnerbetrieben, redaktionelle und administrierende Personen |
| **Datenkategorien** | Stammdaten (Name, dienstliche E-Mail-Adresse), Zuordnungsdaten (Rollen, Märkte, Gruppen, Mandant), Nutzungsdaten (abgeschlossene Kapitel mit Zeitstempel), Anmeldedaten (Zeitpunkt, Ergebnis, Passwort-Hashwert), technische Zugriffsdaten (IP-Adresse, Zeitpunkt, Adresse, Browserkennung) |
| **Besondere Kategorien** | keine (Art. 9 DSGVO nicht einschlägig) |
| **Rechtsgrundlagen** | Art. 6 Abs. 1 lit. b i. V. m. § 11 DSG (Vertrag/Beschäftigung); Art. 6 Abs. 1 lit. f (Sicherheit des Betriebs); Art. 6 Abs. 1 lit. c nur, soweit eine konkrete Nachweispflicht benannt ist |
| **Empfänger** | siehe Abschnitt 1.3 |
| **Drittlandübermittlung** | Netlify Inc. (USA) – Rechtsgrundlage noch zu benennen |
| **Löschfristen** | siehe Abschnitt 1.4 |
| **Maßnahmen** | siehe Abschnitt 2 |

### 1.3 Empfänger

| Empfänger | Zweck | Verarbeitungsort | Sitz | Übermittelte Daten | Drittland | Beleg |
|---|---|---|---|---|---|---|
| Supabase | Datenbank der Plattform | Irland (AWS `eu-west-1`) | USA | Konto-, Zuordnungs-, Fortschritts- und Inhaltsdaten | nein | Verbindungskennung `aws-0-eu-west-1.pooler.supabase.com` |
| Netlify | Auslieferung der Oberfläche, Serverfunktionen | weltweites Verteilnetz | USA | Zugriffsdaten; in den Funktionen zusätzlich Name und E-Mail-Adresse | **ja** | `netlify.toml`, `netlify/functions/` |
| Hetzner Online GmbH | Server des Identitätsdienstes | **Helsinki, Finnland (HEL1)** | Gunzenhausen, DE | Benutzerkonten, Passwort-Hashwerte, Anmeldeereignisse | nein | RIPE-Zuordnung `65.109.224.0/20` = `CLOUD-HEL1`, Land FI |
| Mistral AI | maschinelle Übersetzung | Frankreich | Frankreich | ausschließlich redaktionelle Texte | nein | `supabase/functions/translate-training/index.ts` |
| *(offen)* E-Mail-Dienstleister | Einladungen, Passwort-Links | noch nicht festgelegt | — | Name, E-Mail-Adresse | zu prüfen | SMTP noch nicht hinterlegt |

> **Zu korrigierender Irrtum:** Frühere Fassungen nannten „Supabase, Region
> EU-Frankfurt" und den Hetzner-Server in Deutschland. Beides trifft nicht zu.
> Das Supabase-Projekt läuft in **Irland**, der Keycloak-Server in
> **Finnland**. Beides bleibt innerhalb der EU, die Angabe muss aber stimmen.

### 1.4 Löschfristen

| Gegenstand | Frist | Was sie durchsetzt |
|---|---|---|
| Konto- und Lernfortschrittsdaten | Ende des Verhältnisses + *(festzulegen)* | organisatorisch, über die Benutzerverwaltung |
| Anmelde- und Administrationsereignisse im Identitätsdienst | 30 Tage | `eventsExpiration` im Realm |
| Zugriffsprotokolle des Webservers | 5 Dateien à 10 MB, rollierend | `log`-Direktive in `auth/Caddyfile` |
| Datensicherungen der Benutzerdatenbank | 14 Tage | Rotation in `auth/backup.sh` |
| Zähler des Missbrauchsschutzes | 1 Tag | `rate_limit_cleanup()` |
| Audit-Trail administrativer Änderungen | *(festzulegen)* | `audit_event`, nur anfügbar |

**Offener Punkt:** Für den Audit-Trail ist noch keine Frist gesetzt. Ein
Protokoll ohne Löschfrist widerspricht Art. 5 Abs. 1 lit. e DSGVO. Empfehlung:
zwölf Monate, danach automatisch löschen.

---

## 2. Technische und organisatorische Maßnahmen (Art. 32 DSGVO)

Die folgenden Maßnahmen sind **aktiv**, nicht geplant.

### 2.1 Vertraulichkeit

| Maßnahme | Umsetzung |
|---|---|
| Zugangskontrolle | Anmeldung ausschließlich über den Identitätsdienst mit Authorization Code Flow und PKCE; kein anonymer Zugang; Demo-Zugang im Produktions-Build technisch ausgeschlossen (der Build bricht bei `VITE_DEMO_MODE=true` ab) |
| Zugriffskontrolle | Row-Level-Security in der Datenbank. Die Trennung wird **in der Datenbank** durchgesetzt, nicht in der Oberfläche – eine umgangene Oberfläche ändert nichts an den Rechten |
| Rollentrennung | Lernende, Redaktion und Verwaltung sind getrennt; die Verwaltung ist nicht automatisch Redaktion und sieht keine personenbezogenen Lernstände |
| Passwörter | Mindestens zwölf Zeichen; Speicherung ausschließlich als Hashwert im Identitätsdienst; die Anwendung kennt und versendet keine Passwörter |
| Übertragung | Ausschließlich TLS, HSTS gesetzt, unverschlüsselte Aufrufe werden umgeleitet |
| Inhaltssicherheit | Content-Security-Policy nennt konkrete Hosts statt Platzhalter; redaktionelles HTML wird gegen eine Positivliste gefiltert |

### 2.2 Integrität

| Maßnahme | Umsetzung |
|---|---|
| Nachvollziehbarkeit | `audit_event` erfasst administrative und redaktionelle Änderungen mit Person, Aktion, Ziel, Zeitpunkt und Ergebnis. Die Tabelle ist **nur anfügbar**: Auch die Verwaltung kann Einträge weder ändern noch löschen |
| Eingabekontrolle | Die Kennzeichnung der handelnden Person bleibt als Klartext erhalten, auch wenn das Konto später gelöscht wird |
| Missbrauchsschutz | Sperre nach zehn Fehlversuchen; Begrenzung der Anfragen je Herkunft und Konto für Token-Austausch, Einladungen und SMTP-Test |

### 2.3 Verfügbarkeit

| Maßnahme | Umsetzung |
|---|---|
| Datensicherung | Tägliche Sicherung der Benutzerdatenbank mit Prüfung der Lesbarkeit, Aufbewahrung 14 Tage |
| Wiederherstellbarkeit | **Offen** – ein tatsächlicher Restore-Test steht aus (R-06) |
| Belastbarkeit | Betriebsüberwachung und Alarmierung **offen** (R-06) |

### 2.4 Verfahren zur Überprüfung

| Maßnahme | Umsetzung |
|---|---|
| Regelmäßige Prüfung | `npm run db:verify` prüft die Zugriffstrennung mit 73 Kontrollen gegen die echte Datenbank – unter anderem, dass niemand fremden Lernfortschritt liest und niemand das Protokoll verändern kann |
| Automatisierte Tests | 153 Prüfungen über SSO-Kernlogik, Serverfunktionen, Browserabläufe und Keycloak-Modus |

---

## 3. Prozesse für Betroffenenrechte

### 3.1 Auskunft (Art. 15)

Zu einer Person sind zusammenzustellen:

1. Stammdaten und Zuordnungen – Tabelle `app_user` mit `user_role_assignment`,
   `user_market`, `group_member`
2. Lernfortschritt – Tabelle `progress`, verknüpft über `chapter`
3. Administrative Vorgänge – Tabelle `audit_event`, gefiltert auf `actor_id`
   sowie auf `target_id` der Person
4. Anmeldeereignisse – Identitätsdienst, Zeitraum der letzten 30 Tage

### 3.2 Löschung (Art. 17)

Die Löschung eines Kontos in der Verwaltung entfernt das Konto im
Identitätsdienst und die Spiegelung in der Plattform. Zu beachten:

- Mitgliedschaften und Zuweisungen werden über Fremdschlüssel mit entfernt.
- Der Lernfortschritt wird mit dem Konto entfernt.
- Im Audit-Trail bleibt die **Klartext-Kennzeichnung** der handelnden Person
  erhalten, während der Bezug auf das Konto entfällt. Das ist beabsichtigt: Ein
  Protokoll, das mit dem gelöschten Konto seine Aussagekraft verliert, wäre
  ausgerechnet im Streitfall wertlos. Rechtlich zu bewerten als überwiegendes
  Interesse an der Nachvollziehbarkeit nach Art. 17 Abs. 3 lit. e DSGVO.
- **Datensicherungen** enthalten die Daten noch bis zu 14 Tage. Eine sofortige
  Löschung aus Sicherungen findet nicht statt.

### 3.3 Widerspruch (Art. 21)

Betrifft die auf berechtigtem Interesse gestützten Verarbeitungen
(IT-Sicherheit, maschinelle Übersetzung). Da die Übersetzung keine
personenbezogenen Daten verarbeitet, läuft ein Widerspruch dort ins Leere; für
die Sicherheitsprotokollierung ist eine Abwägung im Einzelfall zu treffen.

---

## 4. Auftragsverarbeitung – Checkliste

| Dienstleister | Vertrag erforderlich | Abgeschlossen | Bezugsquelle |
|---|---|---|---|
| Supabase Inc. | Art. 28 DSGVO | ☐ | `supabase.com/legal/dpa` |
| Netlify Inc. | Art. 28 + Kapitel V | ☐ | `netlify.com/legal/data-processing-addendum` |
| Hetzner Online GmbH | Art. 28 DSGVO | ☐ | Hetzner-Konsole, Vertragsdokumente |
| Mistral AI | Art. 28 DSGVO | ☐ | `mistral.ai` – Vertrieb |
| E-Mail-Dienstleister | Art. 28 DSGVO | ☐ | noch nicht ausgewählt |

Für **Netlify** genügt der Auftragsverarbeitungsvertrag allein nicht. Zusätzlich
ist die Grundlage der Drittlandübermittlung zu benennen – Standardvertragsklauseln
oder Zertifizierung nach dem EU-US Data Privacy Framework – und in
`src/app/legal/entity.ts` unter `netlifyGrundlage` einzutragen.

---

## 5. Mitbestimmung

Die Plattform erfasst, welche Kapitel eine benannte Person wann abgeschlossen
hat. Das ist geeignet, Verhalten und Leistung zu erfassen. Auch wenn die
Auswertung ausschließlich aggregiert erfolgt und technisch niemand fremde
Einzelfortschritte lesen kann, ist die **Zulässigkeit im
Beschäftigungsverhältnis mit dem Betriebsrat abzustimmen**; im Regelfall ist
eine Betriebsvereinbarung abzuschließen.

Zu regeln sind mindestens: Zweckbindung, Ausschluss einer Leistungskontrolle,
Aufbewahrungsdauer, Kreis der Zugriffsberechtigten und das Verfahren bei
Verstößen.

---

## 6. Offene Punkte vor der Freigabe

| # | Punkt | Zuständig |
|---|---|---|
| 1 | Unternehmensangaben in `src/app/legal/entity.ts` vollständig eintragen | Unternehmen |
| 2 | Löschfrist für Konto- und Fortschrittsdaten nach Austritt festlegen | Datenschutz |
| 3 | Aufbewahrungsfrist für den Audit-Trail festlegen und technisch umsetzen | Datenschutz + Technik |
| 4 | Rechtsgrundlage der Übermittlung an Netlify benennen | Datenschutz |
| 5 | Auftragsverarbeitungsverträge abschließen und ablegen | Einkauf/Recht |
| 6 | Betriebsvereinbarung abstimmen | Personal + Betriebsrat |
| 7 | E-Mail-Dienstleister auswählen und vertraglich binden | Technik + Recht |
| 8 | Restore-Test nachweisen (R-06) | Technik |
| 9 | Nach Freigabe `VITE_LEGAL_REVIEWED=true` setzen | Technik |

Punkt 9 blendet den Entwurfshinweis auf den Rechtsseiten aus. Fehlen dann noch
Pflichtangaben, weist die Seite das weiterhin sichtbar aus – die Freigabe
überschreibt keine Lücke.
