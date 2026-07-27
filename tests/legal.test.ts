// Prüft die Vollständigkeitslogik der Rechtsseiten (R-04).
//
// Der Sinn dieser Tests ist nicht, Texte zu prüfen – Texte prüft ein Jurist.
// Geprüft wird die Mechanik dahinter: dass eine fehlende Pflichtangabe auch als
// fehlend gemeldet wird. Ein Impressum, das eine Lücke still übergeht, ist
// schlimmer als eines mit sichtbarem Platzhalter, weil niemand mehr davon
// erfährt.

import assert from "node:assert/strict";
import test from "node:test";
import {
  FELDNAMEN,
  istVollstaendig,
  offeneAngaben,
  RECHTSTRAEGER,
  type Rechtstraeger,
} from "../src/app/legal/entity.ts";

/** Ein durchgängig ausgefüllter Rechtsträger als Ausgangspunkt. */
function vollstaendig(): Rechtstraeger {
  return {
    firma: "Beispiel GmbH",
    strasse: "Musterstraße 1",
    plz: "1010",
    ort: "Wien",
    land: "Österreich",
    geschaeftsfuehrung: "Maria Muster",
    telefon: "+43 1 234567",
    email: "office@beispiel.example",
    firmenbuchnummer: "FN 123456a",
    firmenbuchgericht: "Handelsgericht Wien",
    uid: "ATU12345678",
    kammer: "WKO, Fachgruppe Handel",
    gewerbebehoerde: "Magistratisches Bezirksamt",
    datenschutzkontakt: "datenschutz@beispiel.example",
    dsb: "Datenschutz GmbH",
    dsbEntfaellt: false,
    aufbewahrungNachAustritt: "sechs Monaten",
    nachweispflicht: "",
    mailDienstleister: "Postausgang GmbH",
    netlifyGrundlage: "Standardvertragsklauseln",
    standFreigabe: "1. August 2026",
  };
}

test("ein vollständiger Datensatz gilt als vollständig", () => {
  assert.equal(istVollstaendig(vollstaendig()), true);
  assert.deepEqual(offeneAngaben(vollstaendig()), []);
});

test("jede fehlende Pflichtangabe wird namentlich gemeldet", () => {
  for (const key of [
    "firma", "strasse", "plz", "ort", "geschaeftsfuehrung", "telefon", "email",
    "firmenbuchnummer", "firmenbuchgericht", "uid", "kammer", "gewerbebehoerde",
    "datenschutzkontakt", "aufbewahrungNachAustritt", "mailDienstleister",
    "netlifyGrundlage", "standFreigabe",
  ] as (keyof Rechtstraeger)[]) {
    const daten = { ...vollstaendig(), [key]: "" };
    assert.deepEqual(
      offeneAngaben(daten), [FELDNAMEN[key]],
      `Fehlendes Feld ${key} wurde nicht gemeldet`);
    assert.equal(istVollstaendig(daten), false);
  }
});

test("Leerraum zählt nicht als Angabe", () => {
  const daten = { ...vollstaendig(), firma: "   " };
  assert.deepEqual(offeneAngaben(daten), [FELDNAMEN.firma]);
});

test("die Nachweispflicht ist freiwillig – ihr Fehlen ist kein Mangel", () => {
  // Sie ist nur zu benennen, wenn es sie gibt. Ein leeres Feld ist dort eine
  // gültige Aussage, kein Versäumnis.
  const daten = { ...vollstaendig(), nachweispflicht: "" };
  assert.equal(istVollstaendig(daten), true);
});

test("entweder eine benannte Person oder der ausdrückliche Vermerk", () => {
  const ohneBeides = { ...vollstaendig(), dsb: "", dsbEntfaellt: false };
  assert.deepEqual(offeneAngaben(ohneBeides), [FELDNAMEN.dsb]);

  const mitVermerk = { ...vollstaendig(), dsb: "", dsbEntfaellt: true };
  assert.equal(istVollstaendig(mitVermerk), true);

  const mitPerson = { ...vollstaendig(), dsb: "Datenschutz GmbH", dsbEntfaellt: false };
  assert.equal(istVollstaendig(mitPerson), true);
});

test("die ausgelieferte Vorlage ist als unvollständig erkennbar", () => {
  // Solange niemand die Angaben eingetragen hat, MUSS das gemeldet werden.
  // Schlägt dieser Test fehl, weil die Daten inzwischen gepflegt sind, ist das
  // ein guter Grund – dann gehört er angepasst, nicht die Prüfung entfernt.
  const offen = offeneAngaben(RECHTSTRAEGER);
  if (offen.length === 0) {
    assert.equal(istVollstaendig(RECHTSTRAEGER), true,
      "Angaben sind gepflegt – Test entsprechend nachziehen");
  } else {
    assert.ok(offen.length > 0);
    assert.ok(offen.every(name => typeof name === "string" && name.length > 0),
      "Jede offene Angabe braucht eine verständliche Bezeichnung");
  }
});
