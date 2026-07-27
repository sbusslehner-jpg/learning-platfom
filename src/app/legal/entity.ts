// ============================================================
// Angaben zum Verantwortlichen – die EINE Stelle, an der sie stehen.
//
// Impressum und Datenschutzerklärung lesen ausschließlich von hier. Wer diese
// Datei ausfüllt, hat beide Seiten vollständig; niemand muss dafür JSX
// anfassen oder an achtzehn Stellen dieselbe Anschrift pflegen.
//
// Leere Felder verschwinden nicht still: Sie erscheinen im Text als deutlich
// hervorgehobener Platzhalter und werden im Hinweisbalken namentlich
// aufgezählt. Ein Impressum, dem eine Pflichtangabe fehlt, soll das zeigen und
// nicht verbergen – § 5 ECG kennt keine „optionalen" Angaben.
//
// Was hier NICHT hingehört: alles, was die Anwendung selbst weiß. Empfänger,
// Regionen und Speicherfristen stehen in `processing.ts` und sind aus der
// laufenden Konfiguration abgeleitet, nicht aus einer Vorlage.
// ============================================================

/** Ein Feld ist „offen", solange es leer oder nur Leerraum ist. */
const filled = (v: string) => v.trim().length > 0;

export interface Rechtstraeger {
  /** Firmenwortlaut laut Firmenbuch, nicht die Marke. */
  firma: string;
  strasse: string;
  plz: string;
  ort: string;
  land: string;
  /** Vertretungsbefugte Personen, vollständige Namen. */
  geschaeftsfuehrung: string;
  telefon: string;
  /** Allgemeine Kontaktadresse für das Impressum. */
  email: string;
  firmenbuchnummer: string;
  firmenbuchgericht: string;
  uid: string;
  /** Wirtschaftskammer und Fachgruppe. */
  kammer: string;
  /** Zuständige Gewerbebehörde bzw. Bezirkshauptmannschaft. */
  gewerbebehoerde: string;

  /** Anlaufstelle für Betroffenenrechte (Auskunft, Löschung, Widerspruch). */
  datenschutzkontakt: string;
  /**
   * Datenschutzbeauftragte Person. Leer lassen, wenn keine Bestellpflicht nach
   * Art. 37 DSGVO besteht – dann `dsbEntfaellt` setzen. Beides leer zu lassen
   * ist keine Option: Die Erklärung muss eines von beidem sagen.
   */
  dsb: string;
  dsbEntfaellt: boolean;

  /** Frist bis zur Löschung nach Ende des Beschäftigungs-/Partnerverhältnisses. */
  aufbewahrungNachAustritt: string;
  /** Konkrete Nachweispflicht, falls einschlägig. Leer = Absatz entfällt. */
  nachweispflicht: string;
  /** Anbieter des Postausgangs, sobald SMTP hinterlegt ist. */
  mailDienstleister: string;
  /** Rechtsgrundlage der Übermittlung an Netlify (USA). */
  netlifyGrundlage: string;
  /** Datum der juristischen Freigabe, Format wie im Text gewünscht. */
  standFreigabe: string;
}

export const RECHTSTRAEGER: Rechtstraeger = {
  firma: "",
  strasse: "",
  plz: "",
  ort: "",
  land: "Österreich",
  geschaeftsfuehrung: "",
  telefon: "",
  email: "",
  firmenbuchnummer: "",
  firmenbuchgericht: "",
  uid: "",
  kammer: "",
  gewerbebehoerde: "",

  datenschutzkontakt: "",
  dsb: "",
  dsbEntfaellt: false,

  aufbewahrungNachAustritt: "",
  nachweispflicht: "",
  mailDienstleister: "",
  netlifyGrundlage: "",
  standFreigabe: "",
};

/** Klartext-Bezeichnung je Feld – für Platzhalter und für die Fehlliste. */
export const FELDNAMEN: Record<keyof Rechtstraeger, string> = {
  firma: "Firmenwortlaut laut Firmenbuch",
  strasse: "Straße und Hausnummer",
  plz: "Postleitzahl",
  ort: "Ort",
  land: "Land",
  geschaeftsfuehrung: "Vertretungsbefugte, vollständige Namen",
  telefon: "Telefonnummer",
  email: "E-Mail-Adresse",
  firmenbuchnummer: "Firmenbuchnummer (FN …)",
  firmenbuchgericht: "Firmenbuchgericht",
  uid: "UID-Nummer (ATU…)",
  kammer: "Wirtschaftskammer und Fachgruppe",
  gewerbebehoerde: "Zuständige Gewerbebehörde",
  datenschutzkontakt: "Anlaufstelle für Betroffenenrechte",
  dsb: "Datenschutzbeauftragte Person",
  dsbEntfaellt: "Vermerk, dass keine Bestellpflicht besteht",
  aufbewahrungNachAustritt: "Löschfrist nach Austritt",
  nachweispflicht: "Konkrete Nachweispflicht (falls einschlägig)",
  mailDienstleister: "E-Mail-Dienstleister",
  netlifyGrundlage: "Rechtsgrundlage der Übermittlung an Netlify",
  standFreigabe: "Datum der Freigabe",
};

/**
 * Felder, die für eine Veröffentlichung zwingend sind.
 *
 * `nachweispflicht` fehlt hier bewusst: Sie ist nur zu benennen, wenn es sie
 * gibt. Ein leeres Feld ist dort eine gültige Aussage, kein Versäumnis.
 */
const PFLICHT: (keyof Rechtstraeger)[] = [
  "firma", "strasse", "plz", "ort", "land", "geschaeftsfuehrung", "telefon", "email",
  "firmenbuchnummer", "firmenbuchgericht", "uid", "kammer", "gewerbebehoerde",
  "datenschutzkontakt", "aufbewahrungNachAustritt", "mailDienstleister",
  "netlifyGrundlage", "standFreigabe",
];

/** Welche Pflichtangaben fehlen noch? Leeres Ergebnis = veröffentlichungsfähig. */
export function offeneAngaben(daten: Rechtstraeger = RECHTSTRAEGER): string[] {
  const offen = PFLICHT.filter(k => !filled(String(daten[k]))).map(k => FELDNAMEN[k]);
  // Entweder eine benannte Person oder der ausdrückliche Vermerk – nicht keines von beidem.
  if (!filled(daten.dsb) && !daten.dsbEntfaellt) offen.push(FELDNAMEN.dsb);
  return offen;
}

export const istVollstaendig = (daten: Rechtstraeger = RECHTSTRAEGER) =>
  offeneAngaben(daten).length === 0;
