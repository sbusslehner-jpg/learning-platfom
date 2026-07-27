# Benachrichtigungen (R-09)

**Stand:** 27. Juli 2026

Vorher konnte die Plattform nur versenden, was Keycloak von sich aus
verschickt: Einladungen und Passwort-Links. Für eigene Ereignisse gab es keinen
Weg – die Einstellungsseite wies das ausdrücklich als fehlend aus.

## Der Weg einer Nachricht

```
Veröffentlichung          Warteschlange              Worker
       │                        │                       │
       │ publish_training       │                       │
       ├──► notify_training_published()                 │
       │      ermittelt Empfänger nach derselben        │
       │      Regel wie die Sichtbarkeit                │
       │           └──────────► notification (pending)  │
       │                        │                       │
   (fertig, unabhängig          │  POST /api/notify ───►│
    vom Mailserver)             │◄── notify_claim() ────┤
                                │      for update skip locked
                                │                       │ SMTP
                                │◄── notify_settle() ───┤
```

**Warum eine Warteschlange und kein Direktversand.** Ein Veröffentlichungs­vorgang
darf nicht scheitern, weil ein Mailserver gerade nicht antwortet – das Ereignis
ist geschehen, die Nachricht darüber ist nachrangig. Außerdem können hunderte
Empfänger zusammenkommen; sie innerhalb der Transaktion zu bedienen hieße, die
Datenbank für die Dauer hunderter SMTP-Verbindungen zu blockieren.

**Warum die Empfänger in der Datenbank ermittelt werden.** Die Regel ist
dieselbe wie für die Sichtbarkeit: Markt ODER Gruppe ODER Person. Eine zweite
Fassung im Worker würde irgendwann abweichen, und dann bekämen Leute Post über
Trainings, die sie nicht öffnen können. Redaktion und Verwaltung bekommen
bewusst nichts – sie sehen ohnehin alles.

**Warum jede Nachricht einzeln quittiert wird.** Ein Sammelvermerk am Ende
würde bei einem Abbruch mittendrin auch die bereits zugestellten als offen
führen. Beim nächsten Lauf gingen sie erneut raus. Doppelte Post ist schlimmer
als späte.

**Kein Doppelversand.** `dedupe_key` ist je Anlass und Person eindeutig. Wird
dasselbe Training zweimal veröffentlicht, entsteht keine zweite Rundmail.

## Einrichten

Der Worker braucht **eigene** SMTP-Angaben in den Netlify-Variablen:

| Variable | Beispiel | |
|---|---|---|
| `SMTP_HOST` | `smtp.example.com` | Pflicht |
| `SMTP_FROM` | `Lernplattform <noreply@example.com>` | Pflicht |
| `SMTP_PORT` | `587` | Vorgabe 587 |
| `SMTP_USER` | `noreply@example.com` | falls Anmeldung nötig |
| `SMTP_PASSWORD` | … | |
| `NOTIFY_SECRET` | zufällig, ≥ 32 Zeichen | für die Zeitsteuerung |

Es sind dieselben Werte wie unter **Verwaltung → Einstellungen → E-Mail
(SMTP)**. Sie ein zweites Mal einzutragen ist unschön, aber unvermeidbar:
Keycloak gibt ein gespeichertes Passwort nicht wieder heraus, es maskiert es.
Der Worker kann es dort also nicht abholen.

Ohne `SMTP_HOST`/`SMTP_FROM` läuft nichts ins Leere – die Nachrichten sammeln
sich in der Warteschlange, und die Einstellungsseite sagt genau das.

Port 465 ist implizit verschlüsselt, 587 beginnt unverschlüsselt und wechselt
über STARTTLS. Der Worker entscheidet das anhand der Portnummer; ein falsch
gesetzter Port führt zu einer Zeitüberschreitung, die wie ein Netzproblem
aussieht.

## Unbeaufsichtigter Betrieb

Ohne Zeitsteuerung hängt der Versand an der Schaltfläche „Jetzt versenden".
Für den Dauerbetrieb reicht ein Eintrag auf dem Keycloak-Server, auf dem
ohnehin schon ein Cron für die Sicherung läuft:

```cron
# /etc/cron.d/lernplattform-notify
*/10 * * * * root curl -sS -m 30 -X POST \
  -H "X-Notify-Secret: <NOTIFY_SECRET>" \
  https://gitacademy.netlify.app/api/notify > /dev/null 2>&1
```

Der Vergleich des Geheimnisses läuft in konstanter Zeit – ein gewöhnlicher
Vergleich bricht beim ersten abweichenden Zeichen ab und verrät über viele
Versuche, wie viele Zeichen stimmen.

Ist `NOTIFY_SECRET` nicht gesetzt, ist dieser Weg zu. Ein Standardwert wäre ein
offener Endpunkt bei jedem, der ihn nicht überschreibt.

## Wiederholung und Aufgeben

Ein fehlgeschlagener Versand wird wiederholt, mit wachsendem Abstand: 2, 8, 18,
32 Minuten. Ein Mailserver, der gerade nicht kann, wird von schnellem
Nachfassen nicht schneller.

Nach fünf Versuchen gilt eine Nachricht als **aufgegeben** (`dead`). Endlos zu
wiederholen hieße, einen dauerhaften Fehler – falsche Adresse, gesperrtes Konto
– für immer zu verschleiern. Aufgegebene Nachrichten stehen in der Verwaltung
als eigene Zahl; sie verschwinden nicht von selbst und wollen angesehen werden.

## Was fehlt

- **Zusammenfassungen** (tägliche/wöchentliche Digests). Die Tabelle kann es
  über `send_after`, ein Auslöser dafür existiert nicht.
- **Abmeldung durch Empfänger.** Derzeit bekommt jede zugewiesene Person die
  Veröffentlichungsmeldung. Für Pflichtschulungen ist das richtig, für
  freiwillige Angebote fragwürdig – **das gehört mit dem Betriebsrat geklärt**,
  zusammen mit der Betriebsvereinbarung aus dem Datenschutz-Dossier.
- **Meldung gescheiterter Übersetzungsläufe.** Der Auslöser fehlt; die
  Warteschlange könnte es tragen.

## Prüfen

```bash
DATABASE_URL=… npm run db:verify     # Abschnitt M
```

```sql
select * from notify_stats();
select kind, recipient, status, attempts, last_error
  from notification order by created_at desc limit 20;

-- muss leer sein:
select dedupe_key, count(*) from notification
 where dedupe_key is not null group by 1 having count(*) > 1;
```
