// ============================================================
// Die tatsächlichen Datenflüsse der Plattform.
//
// Diese Angaben sind NICHT aus einer Vorlage übernommen, sondern aus der
// laufenden Konfiguration abgeleitet. Wo eine Zahl steht, gibt es eine Stelle
// im Betrieb, die sie erzeugt – die Quelle steht jeweils dabei. Genau das ist
// der Teil, den ein Mustertext nicht leisten kann und den eine
// Datenschutzbehörde im Zweifel wissen will.
//
// Ändert sich der Betrieb, ändert sich diese Datei mit. Wer eine Frist im
// Betrieb anpasst, ohne sie hier nachzuziehen, macht die Erklärung falsch.
// ============================================================

export interface Empfaenger {
  name: string;
  zweck: string;
  /** Wo verarbeitet wird – nicht, wo der Anbieter sitzt. */
  ort: string;
  /** Sitz der Betreibergesellschaft, wenn er vom Verarbeitungsort abweicht. */
  sitz?: string;
  /** Welche Daten den Verantwortungsbereich verlassen. */
  daten: string;
  /** Liegt eine Übermittlung in ein Drittland vor? */
  drittland: boolean;
  /** Woher die Angabe stammt. */
  beleg: string;
}

export const EMPFAENGER: Empfaenger[] = [
  {
    name: "Supabase",
    zweck: "Datenbank der Plattform",
    ort: "Irland (AWS eu-west-1)",
    sitz: "Supabase Inc., USA",
    daten: "Kontodaten, Rollen, Marktzuordnung, Gruppen, Lernfortschritt, Inhalte",
    drittland: false,
    beleg: "Verbindungskennung aws-0-eu-west-1.pooler.supabase.com",
  },
  {
    name: "Netlify",
    zweck: "Auslieferung der Oberfläche und Betrieb der Serverfunktionen",
    ort: "weltweites Verteilnetz",
    sitz: "Netlify Inc., USA",
    daten: "IP-Adresse, Zeitpunkt, aufgerufene Adresse, Browserkennung; in den Serverfunktionen zusätzlich Name und E-Mail-Adresse",
    drittland: true,
    beleg: "netlify.toml, netlify/functions/",
  },
  {
    name: "Hetzner Online GmbH",
    zweck: "Server des Identitätsdienstes (Keycloak)",
    // RIPE weist 65.109.224.0/20 als CLOUD-HEL1, Land FI aus – nicht Deutschland.
    ort: "Helsinki, Finnland (Rechenzentrum HEL1)",
    sitz: "Gunzenhausen, Deutschland",
    daten: "Benutzerkonten, Passwort-Hashwerte, Anmelde- und Administrationsereignisse",
    drittland: false,
    beleg: "RIPE-Zuordnung der Server-IP, auth/docker-compose.prod.yml",
  },
  {
    name: "Mistral AI",
    zweck: "maschinelle Übersetzung der Schulungsinhalte",
    ort: "Frankreich",
    daten: "ausschließlich redaktionelle Texte – keine Kontodaten, kein Lernfortschritt",
    drittland: false,
    beleg: "supabase/functions/translate-training/index.ts",
  },
];

export interface Frist {
  gegenstand: string;
  dauer: string;
  /** Was die Frist technisch durchsetzt. */
  quelle: string;
}

export const FRISTEN: Frist[] = [
  {
    gegenstand: "Anmelde- und Administrationsereignisse im Identitätsdienst",
    dauer: "30 Tage, danach automatische Löschung",
    quelle: "Realm-Einstellung eventsExpiration in auth/realm/serviceq-realm.json",
  },
  {
    gegenstand: "Zugriffsprotokolle des Webservers",
    dauer: "rollierend, die fünf jüngsten Dateien à 10 MB",
    quelle: "log-Direktive in auth/Caddyfile",
  },
  {
    gegenstand: "Datensicherungen der Benutzerdatenbank",
    dauer: "täglich, Aufbewahrung 14 Tage",
    quelle: "Rotation in auth/backup.sh",
  },
  {
    gegenstand: "Zähler des Missbrauchsschutzes",
    dauer: "1 Tag",
    quelle: "rate_limit_cleanup() in supabase/migrations/0010",
  },
  {
    gegenstand: "Protokoll administrativer Änderungen (Audit-Trail)",
    dauer: "unbegrenzt bis zur festgelegten Aufbewahrungsfrist",
    quelle: "audit_event in supabase/migrations/0010 – nur anfügbar",
  },
];

/** Technische und organisatorische Maßnahmen, die tatsächlich aktiv sind. */
export const MASSNAHMEN: { titel: string; text: string }[] = [
  {
    titel: "Verschlüsselte Übertragung",
    text: "Ausschließlich TLS; HSTS ist gesetzt, unverschlüsselte Aufrufe werden umgeleitet.",
  },
  {
    titel: "Zugriffskontrolle in der Datenbank",
    text: "Row-Level-Security setzt die Trennung in der Datenbank selbst durch, nicht erst in der Oberfläche. " +
          "Lernende sehen ausschließlich die ihnen zugewiesenen Trainings und niemals fremden Lernfortschritt.",
  },
  {
    titel: "Trennung der Rollen",
    text: "Verwaltung, Redaktion und Lernende sind getrennt; auch die Verwaltung sieht keine personenbezogenen Lernstände.",
  },
  {
    titel: "Passwörter",
    text: "Mindestens zwölf Zeichen, ausschließlich als Hashwert im Identitätsdienst gespeichert. " +
          "Die Plattform selbst kennt kein Passwort und versendet niemals eines.",
  },
  {
    titel: "Schutz vor unbefugtem Zugriff",
    text: "Sperre nach zehn Fehlversuchen, Begrenzung der Anfragen je Herkunft und Konto, " +
          "Sitzungsende nach 30 Minuten Untätigkeit.",
  },
  {
    titel: "Nachvollziehbarkeit",
    text: "Administrative Änderungen werden in einem nur anfügbaren Protokoll erfasst, " +
          "das auch die Verwaltung nicht ändern oder löschen kann.",
  },
  {
    titel: "Datensicherung",
    text: "Tägliche Sicherung der Benutzerdatenbank mit Prüfung der Lesbarkeit.",
  },
];
