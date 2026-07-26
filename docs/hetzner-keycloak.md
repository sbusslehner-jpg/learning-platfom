# Keycloak auf Hetzner aufsetzen – mit VS Code

Antwort auf die Frage vorweg: **VS Code selbst richtet nichts ein** – es ist ein
Editor, kein Deployment-Werkzeug. Aber mit der Erweiterung **Remote – SSH** arbeitest
du in VS Code direkt auf dem Hetzner-Server, als wäre er dein lokaler Rechner. Und
dann übernimmt ein Skript den Rest:

```bash
./auth/hetzner-setup.sh auth.deine-domain.de mail@deine-domain.de https://deine-site.netlify.app
```

Das Skript installiert Docker, richtet die Firewall ein, erzeugt alle Passwörter,
startet Keycloak samt Datenbank und holt automatisch ein HTTPS-Zertifikat.
Am Ende gibt es dir die fertige Liste der Netlify-Variablen aus.

> **Nicht ausgeführt.** Dieser Ablauf ist geschrieben und statisch geprüft
> (`bash -n`, `docker compose config` gegen die echte Compose-Datei, Realm-Erzeugung
> real getestet), aber **nicht auf einem echten Server durchlaufen**: Die
> Entwicklungsumgebung hier bekommt keine Docker-Images (Registry antwortet mit
> `403`) und hat keinen Hetzner-Zugang. Rechne damit, dass beim ersten Lauf noch
> etwas nachzujustieren ist – die Fehlertabelle am Ende deckt die üblichen Fälle ab.

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
./auth/hetzner-setup.sh auth.deine-domain.de mail@deine-domain.de https://deine-site.netlify.app
```

Die drei Angaben sind:

| Position | Bedeutung |
|---|---|
| 1 | Domain, unter der **Keycloak** erreichbar sein soll (aus Schritt 2) |
| 2 | E-Mail für Let's Encrypt (Ablaufwarnungen des Zertifikats) |
| 3 | Adresse deiner **Lernplattform** bei Netlify |

Was dabei passiert:

1. Docker wird installiert, falls nicht vorhanden.
2. Die Firewall lässt nur noch **22, 80 und 443** durch.
3. Für Konsole, Datenbank und Backend-Client werden **je 40 Zeichen Zufallspasswort**
   erzeugt und in `auth/.env` abgelegt (nur für `root` lesbar).
4. Der DNS-Eintrag wird geprüft – stimmt er nicht, gibt es eine Warnung statt Abbruch.
5. Aus `auth/realm/serviceq-realm.json` entsteht eine fertige Realm-Datei mit deinen
   echten Adressen.
6. Postgres, Keycloak und Caddy starten. Caddy holt das Zertifikat selbstständig.
7. Das Skript wartet, bis Keycloak bereit meldet (erster Start dauert ein bis zwei
   Minuten, weil Keycloak sich einmalig baut).

Am Ende erscheint ein Block mit allen Zugangsdaten und den Netlify-Variablen –
**diesen kopierst du dir weg**, das Backend-Secret steht sonst nur in `auth/.env`.

Der Aufruf ist wiederholbar: Ein zweiter Lauf behält die erzeugten Passwörter und
kommt sogar ohne Parameter aus.

## Schritt 6 — E-Mail-Versand einrichten

Ohne SMTP verschickt Keycloak keine Einladungen. Zwei Wege:

**Vor dem ersten Start** (bequemer): `auth/.env` in VS Code öffnen, ausfüllen,
Skript erneut ausführen.

```env
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_FROM=noreply@deine-domain.de
SMTP_FROM_DISPLAY=GroupIT Lernplattform
SMTP_USER=<Benutzername des Anbieters>
SMTP_PASSWORD=<Passwort oder API-Key>
SMTP_STARTTLS=true
```

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

Erste Anmeldung in der Plattform: `admin@groupit.example` mit
`Start-Passwort-2026!`. Keycloak verlangt sofort ein neues Passwort.
Danach in der Konsole die E-Mail-Adresse auf deine echte ändern.

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

**Datensicherung** – die Datenbank enthält alle Benutzerkonten:

```bash
docker exec sq-keycloak-db pg_dump -U keycloak keycloak \
  | gzip > /root/keycloak-$(date +%F).sql.gz
```

Als tägliche Aufgabe einrichten:

```bash
echo '0 3 * * * docker exec sq-keycloak-db pg_dump -U keycloak keycloak | gzip > /root/keycloak-$(date +\%F).sql.gz' | crontab -
```

Zusätzlich die **Hetzner-Backups** (Snapshots) im Cloud-Panel aktivieren – 20 % des
Serverpreises, spart im Ernstfall Stunden.

**Automatische Sicherheitsupdates:**

```bash
apt-get install -y unattended-upgrades && dpkg-reconfigure -plow unattended-upgrades
```

## Wenn etwas klemmt

| Symptom | Ursache und Behebung |
|---|---|
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
- **Schnellerer Start:** eigenes Image mit `kc.sh build` bauen und
  `start --optimized` verwenden statt `start`.
- **Admin-Konsole abschotten:** In der `Caddyfile` den Pfad `/admin*` auf bekannte
  IP-Adressen begrenzen oder über ein VPN erreichbar machen.
- **Secrets aus einem Store** statt aus `auth/.env`, sobald ein solcher verfügbar ist.
- **Überwachung:** Keycloak liefert Metriken unter `/metrics` (Port 9000, nur intern).
  Mindestens eine Erreichbarkeitsprüfung auf `https://auth.deine-domain.de/health/ready`
  einrichten.
- **Brute-Force-Schutz und Passwortrichtlinie** sind im Realm voreingestellt
  (10 Fehlversuche, 12 Zeichen) – mit eurer Security abstimmen.
