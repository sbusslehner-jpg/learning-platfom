# Keycloak auf Hetzner aufsetzen – mit VS Code

Antwort auf die Frage vorweg: **VS Code selbst richtet nichts ein** – es ist ein
Editor, kein Deployment-Werkzeug. Aber mit der Erweiterung **Remote – SSH** arbeitest
du in VS Code direkt auf dem Hetzner-Server, als wäre er dein lokaler Rechner. Und
dann übernimmt ein Skript den Rest:

```bash
./auth/hetzner-setup.sh auth.deine-domain.de mail@deine-domain.de \
                        https://deine-site.netlify.app admin@deine-domain.de
```

Das Skript installiert Docker, richtet die Firewall ein, erzeugt alle Passwörter,
startet Keycloak samt Datenbank, holt automatisch ein HTTPS-Zertifikat, richtet
die tägliche Datensicherung ein und **prüft am Ende selbst nach**, ob Realm und
Backend-Client wirklich funktionieren. Danach gibt es die fertige Liste der
Netlify-Variablen und deine Zugangsdaten aus.

> **Nicht auf einem echten Server durchlaufen.** Der Ablauf ist geschrieben und
> geprüft: Syntax, die Realm-Erzeugung mit echten Werten, die Sicherung samt
> Rotation und ein kompletter Durchlauf des Skripts gegen simuliertes Docker
> (erster Lauf, Wiederholungslauf, absichtlich falsches Secret). Was hier nicht
> ging: **echte Container starten** – die Entwicklungsumgebung bekommt keine
> Docker-Images. Der eingebaute Selbsttest ist genau dafür da: Er meldet nach dem
> Start, ob Realm, Zertifikat und Backend-Client stimmen, statt dich das bei der
> ersten Einladung herausfinden zu lassen.

---

## Warum Hetzner hier die bessere Wahl ist

Gegenüber Railway aus [`inbetriebnahme.md`](inbetriebnahme.md) hat ein eigener Server
zwei handfeste Vorteile:

- **Das E-Mail-Theme funktioniert sofort.** Auf Railway braucht es dafür ein eigenes
  Docker-Image; hier wird der Ordner `auth/themes/groupit` einfach in den Container
  gemountet. Änderungen an den Vorlagen brauchen nur einen Neustart.
- **Deutscher Standort, DSGVO-freundlich**, ab etwa 4 €/Monat.

Dafür trägst du Betrieb, Updates und Backups selbst.

---

## Schritt 1 — Server anlegen (5 Minuten)

Hetzner Cloud Console → **Neuer Server**:

| Einstellung | Wert |
|---|---|
| Standort | Nürnberg oder Falkenstein |
| Image | **Ubuntu 24.04** |
| Typ | **CX22** (2 vCPU, 4 GB RAM) – reicht für Keycloak samt Datenbank |
| SSH-Key | **deinen öffentlichen Schlüssel hinterlegen** (nicht Passwort) |

Hast du noch keinen SSH-Key, lokal im Terminal:

```bash
ssh-keygen -t ed25519 -C "hetzner"
cat ~/.ssh/id_ed25519.pub          # diesen Text in Hetzner einfügen
```

Nach dem Anlegen notierst du die **IPv4-Adresse** des Servers.

## Schritt 2 — DNS eintragen (vor allem anderen!)

Beim Anbieter deiner Domain einen **A-Record** anlegen:

```
auth.deine-domain.de.   A   <IPv4 des Servers>
```

Das muss **vorher** geschehen: Let's Encrypt prüft über diesen Eintrag, ob dir die
Domain gehört. Bis die Änderung greift, vergehen je nach Anbieter Minuten bis Stunden.

Prüfen:

```bash
dig +short auth.deine-domain.de     # muss die Server-IP zeigen
```

## Schritt 3 — VS Code mit dem Server verbinden

1. In VS Code: **Erweiterungen** → `Remote - SSH` (von Microsoft) installieren.
2. `F1` → **Remote-SSH: Connect to Host…** → **Add New SSH Host…**
3. Eingeben: `ssh root@<IPv4 des Servers>` → Konfigurationsdatei bestätigen.
4. Erneut `F1` → **Connect to Host…** → den Server auswählen.

Es öffnet sich ein zweites VS-Code-Fenster. Unten links steht jetzt
`SSH: <IP>` – **alles in diesem Fenster passiert auf dem Server**: der Datei-Explorer,
das Terminal (`Strg+ö` bzw. `Ctrl+``), das Bearbeiten von Dateien.

## Schritt 4 — Projekt auf den Server holen

Im **Terminal des Remote-Fensters**:

```bash
apt-get update && apt-get install -y git
git clone https://github.com/sbusslehner-jpg/learning-platfom.git /opt/lernplattform
cd /opt/lernplattform
```

Bei einem privaten Repository fragt Git nach Zugangsdaten – dann besser
**Personal Access Token** statt Passwort verwenden.

**Alternative ohne Git:** In VS Code links im Explorer den Ordner `auth` aus deinem
lokalen Fenster per Drag & Drop in das Remote-Fenster ziehen. Es wird nur dieser
Ordner gebraucht.

Danach in VS Code: **Datei → Ordner öffnen** → `/opt/lernplattform`. Ab jetzt
bearbeitest du die Dateien auf dem Server direkt in der gewohnten Oberfläche.

## Schritt 5 — Das Setup-Skript ausführen

```bash
cd /opt/lernplattform
chmod +x auth/*.sh
./auth/hetzner-setup.sh auth.deine-domain.de mail@deine-domain.de \
                        https://deine-site.netlify.app admin@deine-domain.de
```

Die Angaben sind:

| Position | Bedeutung |
|---|---|
| 1 | Domain, unter der **Keycloak** erreichbar sein soll (aus Schritt 2) |
| 2 | E-Mail für Let's Encrypt (Ablaufwarnungen des Zertifikats) |
| 3 | Adresse deiner **Lernplattform** bei Netlify |
| 4 | *optional:* Anmeldung des Plattform-Administrators. Ohne Angabe wird die E-Mail aus Position 2 genommen. |

Was dabei passiert:

1. Docker wird installiert, falls nicht vorhanden.
2. Die Firewall lässt nur noch **22, 80 und 443** durch.
3. Für Konsole, Datenbank, Backend-Client und den Plattform-Administrator werden
   **Zufallspasswörter** erzeugt und in `auth/.env` abgelegt (nur für `root` lesbar).
4. Der DNS-Eintrag wird geprüft – stimmt er nicht, gibt es eine Warnung statt Abbruch.
5. Aus `auth/realm/serviceq-realm.json` entsteht eine fertige Realm-Datei: deine
   echten Adressen, das echte Client-Secret, dein Administrator-Konto, dein SMTP.
   Die localhost-Adressen aus der Entwicklung fallen dabei heraus.
6. Postgres, Keycloak und Caddy starten. Caddy holt das Zertifikat selbstständig.
7. Das Skript wartet, bis Keycloak bereit meldet (erster Start dauert ein bis zwei
   Minuten, weil Keycloak sich einmalig baut).
8. **Selbsttest:** Läuft Caddy? Antwortet der Realm `serviceq`? Kann sich der
   Backend-Client mit genau dem Secret anmelden, das gleich nach Netlify geht?
   Stimmen DNS und Zertifikat? Schlägt eine der ersten drei Prüfungen fehl, endet
   das Skript mit Fehlercode – dann würde die Anmeldung ohnehin nicht laufen.
9. Tägliche Datensicherung (03:17 Uhr, 14 Stände) und automatische
   Sicherheitsupdates werden eingerichtet; eine erste Sicherung entsteht sofort.

Am Ende erscheint ein Block mit allen Zugangsdaten und den Netlify-Variablen –
**diesen kopierst du dir weg**. Das Startpasswort des Administrators und das
Backend-Secret stehen sonst nur in `auth/.env`.

Der Aufruf ist wiederholbar: Ein zweiter Lauf behält die erzeugten Passwörter und
kommt sogar ohne Parameter aus.

> **Der Realm wird nur in eine leere Datenbank importiert.** Das Administrator-Konto
> und das Backend-Secret entstehen also beim **ersten** Lauf. Änderst du sie später
> in `auth/.env`, bleibt Keycloak bei den alten Werten – das Skript sagt dir das
> im Selbsttest und in der Zusammenfassung.

## Schritt 6 — E-Mail-Versand einrichten

Ohne SMTP verschickt Keycloak keine Einladungen. Zwei Wege:

**Vor dem ersten Start** (bequemer): `auth/.env` in VS Code öffnen, ausfüllen,
Skript erneut ausführen.

```env
SMTP_HOST='smtp-relay.brevo.com'
SMTP_PORT='587'
SMTP_FROM='noreply@deine-domain.de'
SMTP_FROM_DISPLAY='GroupIT Lernplattform'
SMTP_USER='<Benutzername des Anbieters>'
SMTP_PASSWORD='<Passwort oder API-Key>'
SMTP_STARTTLS='true'
```

Die **einfachen Anführungszeichen beibehalten** – nur so bleiben Leerzeichen und
Zeichen wie `$` im Passwort unverändert. Ein **Hochkomma** (`'`) lässt sich im
`.env`-Format nicht darstellen; enthält dein Passwort eines, bricht das Skript mit
einem Hinweis ab. Dann die E-Mail-Einstellungen stattdessen in der Keycloak-Konsole
unter **Realm settings → Email** pflegen.

> Der Realm wird **nur beim allerersten Start** importiert. Danach wirken Änderungen
> an diesen Werten nicht mehr – dann in der Keycloak-Konsole unter
> **Realm settings → Email** pflegen (Ergebnis ist identisch).

**Wichtig gegen Spam:** Für die Absenderdomain **SPF, DKIM und DMARC** setzen.
Ohne diese Einträge landen die Einladungen häufig im Spam-Ordner.

## Schritt 7 — Weiter in der Hauptanleitung

Ab hier gilt [`inbetriebnahme.md`](inbetriebnahme.md) unverändert weiter:

- **Schritt 5–6:** Netlify-Variablen setzen und neu deployen. Erst danach
  verschwindet die Demo-Anmeldung.
- **Schritt 7:** `supabase/migrations/0005_production_rls.sql` einspielen –
  **nicht vorher**, sonst zeigt die Demo-Seite nur noch leere Listen.
- **Schritt 8:** Eine Einladung durchspielen.

Erste Anmeldung in der Plattform: mit **der E-Mail-Adresse und dem Startpasswort
aus der Zusammenfassung** des Setup-Skripts. Keycloak verlangt sofort ein neues
Passwort. Ein festes Standardpasswort gibt es bewusst nicht – es stünde sonst im
Repository und wäre ab dem Import öffentlich bekannt.

---

## Betrieb

Alle Befehle im Verzeichnis `/opt/lernplattform`:

```bash
C="docker compose -f auth/docker-compose.prod.yml"

$C ps                      # Was läuft?
$C logs -f keycloak        # Log mitlesen
$C restart keycloak        # nach Theme-Änderungen
$C pull && $C up -d        # Keycloak aktualisieren
$C down                    # stoppen (Daten bleiben erhalten)
```

**Datensicherung** – die Datenbank enthält alle Benutzerkonten. Das Setup-Skript
richtet sie bereits ein, hier nur zur Kontrolle:

```bash
cat /etc/cron.d/keycloak-backup     # täglich 03:17
ls -lh /var/backups/keycloak/       # die letzten 14 Stände
./auth/backup.sh                    # jederzeit von Hand
tail /var/log/keycloak-backup.log   # lief die letzte Sicherung durch?
```

Eine Sicherung zurückspielen (Keycloak vorher stoppen, sonst schreibt er dazwischen):

```bash
C="docker compose -f auth/docker-compose.prod.yml"
$C stop keycloak
gunzip -c /var/backups/keycloak/keycloak-2026-01-31-031702.sql.gz \
  | docker exec -i sq-keycloak-db psql -U keycloak -d keycloak
$C start keycloak
```

> Eine Sicherung, die noch nie zurückgespielt wurde, ist eine Vermutung.
> Spiel den Ablauf einmal auf einem Testserver durch, bevor du ihn brauchst.

Zusätzlich die **Hetzner-Backups** (Snapshots) im Cloud-Panel aktivieren – 20 % des
Serverpreises, spart im Ernstfall Stunden. Und: Die Sicherungen liegen auf
demselben Server wie die Datenbank. Für den Ernstfall gehört mindestens ein Stand
woanders hin (`scp`, S3-kompatibler Speicher, Hetzner Storage Box).

**Automatische Sicherheitsupdates** aktiviert das Setup-Skript ebenfalls.
Kontrolle: `cat /etc/apt/apt.conf.d/20auto-upgrades` – beide Werte müssen `"1"` sein.

## Wenn etwas klemmt

| Symptom | Ursache und Behebung |
|---|---|
| Selbsttest: **„Backend-Client kann sich NICHT anmelden"** | Das Secret in Keycloak stimmt nicht mit `auth/.env` überein. Passiert, wenn der Realm aus einem früheren Lauf stammt: Konsole → Clients → `platform-backend` → **Credentials** → Secret auslesen und in `auth/.env` **und** in Netlify eintragen. Alternativ dort **Regenerate** klicken und den neuen Wert übernehmen. |
| Selbsttest: **„Realm serviceq antwortet nicht"** | Der Import ist nicht gelaufen. `docker compose -f auth/docker-compose.prod.yml logs keycloak \| grep -i import` ansehen. Nur bei leerer Datenbank importiert Keycloak. |
| Selbsttest: **„Caddy läuft nicht"** | Fast immer ein Tippfehler in `auth/Caddyfile`. `docker compose -f auth/docker-compose.prod.yml logs caddy` zeigt die Zeile. Prüfen ohne Neustart: `docker compose -f auth/docker-compose.prod.yml exec caddy caddy validate --config /etc/caddy/Caddyfile` |
| Browser meldet Zertifikatsfehler | DNS zeigt noch nicht auf den Server. `dig +short auth.deine-domain.de` prüfen, danach `docker compose -f auth/docker-compose.prod.yml restart caddy` |
| „connection refused" auf Port 443 | Hetzner-**Cloud-Firewall** im Panel blockiert zusätzlich zur `ufw` – dort 80 und 443 freigeben |
| Keycloak startet, Konsole zeigt Fehler zum Hostname | `KC_PUBLIC_HOST` in `auth/.env` stimmt nicht mit der aufgerufenen Domain überein |
| Realm `serviceq` fehlt nach dem Start | Der Import läuft nur bei leerer Datenbank. `$C down -v` löscht **alle** Daten und erzwingt einen Neuimport – nur im Aufbau machen |
| E-Mails kommen nicht an | In der Konsole unter Realm settings → Email auf **Test connection** klicken; Spam-Ordner prüfen; SPF/DKIM/DMARC setzen |
| E-Mail sieht nicht nach GroupIT aus | Realm settings → Themes → Email theme auf `groupit` stellen |
| Container startet immer wieder neu | `$C logs keycloak` ansehen – meist eine falsche Datenbankvariable in `auth/.env` |
| VS Code verbindet sich nicht per SSH | Im Terminal `ssh root@<IP>` testen. Geht das auch nicht, stimmt der SSH-Key nicht |

## Härtung für den Dauerbetrieb

Der Stack ist bewusst schlank gehalten. Vor einem Rollout mit echten Personendaten:

- **SSH absichern:** `PermitRootLogin prohibit-password` und
  `PasswordAuthentication no` in `/etc/ssh/sshd_config`, danach
  `systemctl restart ssh`. Besser noch: eigener Benutzer mit `sudo`.
  **Vorher in einer zweiten Sitzung prüfen, dass der Schlüssel funktioniert** –
  sonst sperrst du dich aus.
- **Schnellerer Start:** eigenes Image mit `kc.sh build` bauen und
  `start --optimized` verwenden statt `start`.
- **Admin-Konsole abschotten:** In der `Caddyfile` ist dafür ein Block
  vorbereitet. Er begrenzt **nur** `/admin/master/console*`.
  **Nicht `/admin*` sperren:** darunter liegt auch die Admin-REST-API
  (`/admin/realms/...`), über die die Netlify-Funktion Benutzer anlegt. Deren
  Quell-IP wechselt – eine Sperre auf `/admin*` ließe **jede Einladung
  scheitern**. Die API ist ohnehin durch das Service-Account-Token geschützt.
- **Secrets aus einem Store** statt aus `auth/.env`, sobald ein solcher verfügbar ist.
- **Überwachung:** `https://auth.deine-domain.de/health/ready` ist über Caddy
  erreichbar und eignet sich als Erreichbarkeitsprüfung (Uptime Kuma, Better
  Stack, Hetzner-Monitoring). Die Metriken unter `/metrics` bleiben bewusst auf
  dem internen Port 9000 – sie verraten mehr, als nach außen gehört.
- **Brute-Force-Schutz und Passwortrichtlinie** sind im Realm voreingestellt
  (10 Fehlversuche, 12 Zeichen) – mit eurer Security abstimmen.
- **Log-Rotation** für `/var/log/keycloak-backup.log` und die Caddy-Zugriffslogs
  (Caddy rotiert selbst: 10 MiB, 5 Stände).
