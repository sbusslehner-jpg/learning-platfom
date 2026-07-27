# Medien: Videos, Bilder, Dokumente (R-03)

**Stand:** 27. Juli 2026

Vor dieser Änderung war Video ein simulierter Fortschrittsbalken, ein Bild ein
graues Rechteck mit der Aufschrift „Screenshot" und ein Dokument bestenfalls
ein externer Link. Es gab keine Datei, keine Prüfung und keinen Zugriffsschutz.

## Wie es funktioniert

```
Redaktion                Serverfunktion              Ablage (privat)
    │                          │                          │
    │  1. anmelden ───────────►│                          │
    │     Typ, Größe, Name     │  prüft gegen die         │
    │                          │  Positivliste            │
    │                          │  legt asset (pending) an │
    │◄──── signierter Verweis ─┤                          │
    │                                                     │
    │  2. Datei ─────────────────────────────────────────►│
    │     direkt, mit Fortschrittsanzeige                  │
    │                                                     │
    │  3. freigeben ──────────►│                          │
    │                          │  liest Größe ───────────►│
    │                          │  liest erste Bytes ─────►│
    │                          │  prüft Signatur          │
    │◄──── ready oder ─────────┤  bei Fehlschlag: löschen │
    │      abgelehnt           │                          │
```

**Warum der Upload nicht durch die Serverfunktion läuft.** Netlify begrenzt
Anfragegröße und Laufzeit. Ein 40-MB-Video passt dort nicht durch. Der Browser
lädt deshalb direkt in die Ablage, autorisiert durch einen signierten Verweis,
den die Funktion nach der Rechteprüfung ausstellt.

**Warum trotzdem serverseitig geprüft wird.** Wer direkt in die Ablage
schreibt, kann bei der Anmeldung alles behaupten. Schritt 3 prüft deshalb, was
tatsächlich angekommen ist: die Größe aus der Ablage und den Typ aus den ersten
Bytes. Bis dahin steht der Eintrag auf `pending` und ist über keinen Weg
abrufbar.

**Warum es keine dauerhafte Adresse gibt.** Der Bucket ist privat und hat für
`authenticated` keine einzige Policy. Jeder Abruf holt über `/api/media/url`
eine für 20 Minuten gültige signierte Adresse – und die stellt der Server erst
aus, nachdem die **Datenbank** bestätigt hat, dass diese Person dieses Training
sehen darf. Die Rechteregel steht damit an genau einer Stelle: in der RLS.

## Was erlaubt ist

| Element | Typen | Grenze | Warum diese Auswahl |
|---|---|---|---|
| Video | MP4, WebM | 50 MB | QuickTime und AVI sind im Browser nicht verlässlich abspielbar |
| Bild | PNG, JPEG, WebP | 10 MB | – |
| Dokument | **nur PDF** | 25 MB | Office-Dateien können Makros enthalten; ohne Virenprüfung nicht vertretbar |

Maßgeblich ist `netlify/functions/_lib/media-policy.mjs`. Die Oberfläche
schreibt diese Liste **nicht ab**, sondern holt sie über `GET /api/media/policy`
– zwei Listen liefen irgendwann auseinander, und der Fehler fiele erst nach dem
Hochladen auf.

Anheben über Umgebungsvariablen: `MEDIA_MAX_VIDEO_MB`, `MEDIA_MAX_IMAGE_MB`,
`MEDIA_MAX_DOCUMENT_MB`.

## Die 50-MB-Grenze

Der Bucket ist auf 50 MB gesetzt – die Vorgabe des kostenlosen
Supabase-Tarifs. **Für echte Schulungsvideos ist das zu wenig.** Zehn Minuten
in brauchbarer Qualität liegen bei 100–300 MB.

Zwei Wege:

1. **Bezahlter Supabase-Tarif.** Dann die Grenze anheben:
   ```sql
   update storage.buckets set file_size_limit = 524288000 where id = 'training-media';
   ```
   und `MEDIA_MAX_VIDEO_MB=500` setzen. Beides ist nötig – die Datenbank
   begrenzt den Upload, die Umgebungsvariable die Anmeldung.

2. **Externer Videodienst** (Mux, Cloudflare Stream). Bringt zusätzlich
   adaptive Bitrate und spart Datenvolumen bei schlechter Verbindung, kostet
   aber einen weiteren Auftragsverarbeitungsvertrag.

Solange nichts davon entschieden ist, sind Videos auf kurze Sequenzen begrenzt.

## Offen: Virenprüfung

**Nicht umgesetzt.** Die Signaturprüfung stellt fest, dass eine Datei das
*ist*, was sie zu sein vorgibt – nicht, dass ihr Inhalt harmlos ist. Ein PDF
mit gültiger `%PDF-`-Signatur kann trotzdem einen Exploit enthalten.

Das Risiko ist begrenzt, aber nicht null:

- Hochladen darf ausschließlich die Redaktion, also ein kleiner, bekannter
  Personenkreis. Das ist kein offener Upload aus dem Netz.
- Nur PDF, kein Office, keine Archive, keine ausführbaren Dateien.
- Ausgeliefert wird über signierte Adressen mit `Content-Type` aus der
  Datenbank, nicht aus der Datei.

Was fehlt, ist der Fall „Redaktionskonto übernommen" oder „Redakteurin lädt
unwissentlich eine verseuchte Datei hoch". Für eine Prüfung wäre ein externer
Dienst nötig – ein ClamAV-Container neben Keycloak oder ein Prüfdienst –, und
damit eine Entscheidung über Kosten und Auftragsverarbeitung. **Diese
Entscheidung steht aus; der Punkt bleibt offen.**

Ein Ansatzpunkt ist vorbereitet: `finalize` ist die einzige Stelle, an der eine
Datei von `pending` auf `ready` wechselt. Eine Virenprüfung gehört genau
dorthin, unmittelbar vor die Freigabe.

## Aufräumen

Ein abgebrochener Upload hinterlässt eine `pending`-Zeile. Sie ist für niemanden
abrufbar und wird beim nächsten Versuch für dasselbe Element ersetzt. Zum
Auffinden älterer Reste:

```sql
select * from media_stale_uploads();          -- älter als 2 Stunden
select * from media_stale_uploads('7 days');
```

Ein automatischer Aufräumlauf ist noch nicht eingerichtet. Bei der bisherigen
Menge ist das vertretbar; bei regelmäßiger Redaktionsarbeit gehört ein
täglicher Lauf dazu.

## Prüfen

```bash
npm run test:functions      # 29 Prüfungen der Medienregeln
npm run test:keycloak       # CSP erlaubt media-src und img-src der Ablage
DATABASE_URL=… npm run db:verify
```

Die Medienregeln werden gegen das geprüft, was ein Angreifer versuchen würde:
ein umbenanntes Programm mit `.png`, ein PHP-Skript mit PDF-Endung, eine
Signatur an der falschen Stelle, Pfadwechsel im Dateinamen.
