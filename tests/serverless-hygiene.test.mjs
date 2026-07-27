// Prüft Eigenschaften der Serverfunktionen, die sich nur am Quelltext zeigen.
//
// Anlass ist ein Fehler, der jeden lokalen Test bestand und in Produktion
// trotzdem nichts tat: Audit-Ereignisse wurden mit `void audit(...)`
// abgeschickt, also ohne auf den Abschluss zu warten. Im Testprozess läuft der
// Aufruf danach zu Ende und alles sieht gut aus. Netlify friert die Funktion
// jedoch ein, sobald die Antwort das Haus verlassen hat – der noch offene
// Schreibvorgang wird verworfen.
//
// Ergebnis: `rate_limit` füllte sich (dort wird gewartet), `audit_event` blieb
// leer. Der Audit-Trail aus R-10 war in Produktion wirkungslos, ohne dass
// irgendetwas sichtbar kaputtging.
//
// Solche Fehler lassen sich nicht im laufenden Prozess nachstellen. Was bleibt,
// ist die Prüfung am Quelltext.

import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import test, { describe } from "node:test";

const DIR = path.join(import.meta.dirname, "..", "netlify", "functions");

function sources() {
  return readdirSync(DIR)
    .filter((f) => f.endsWith(".mjs"))
    .map((f) => ({ name: f, text: readFileSync(path.join(DIR, f), "utf8") }));
}

describe("Serverfunktionen: nichts nach der Antwort", () => {
  test("kein `void` auf einem Aufruf mit Nebenwirkung", () => {
    // `void` vor einem Promise heißt: „Ergebnis interessiert nicht." In einer
    // Serverfunktion heißt es zusätzlich: „läuft vielleicht nie zu Ende."
    for (const { name, text } of sources()) {
      for (const call of ["audit(", "recordPendingSync(", "allow("]) {
        assert.ok(
          !text.includes(`void ${call}`),
          `${name}: \`void ${call}\` – der Aufruf muss abgewartet werden, ` +
          `sonst verwirft die Laufzeit ihn nach dem Senden der Antwort.`,
        );
      }
    }
  });

  test("jede Funktion wartet ihre Audit-Aufrufe ab", () => {
    for (const { name, text } of sources()) {
      if (!text.includes("audit(")) continue;
      // Jedes Vorkommen von `audit(` muss ein `await audit(` sein – abgesehen
      // von Import, Definition und Erwähnungen im Kommentar.
      const calls = [...text.matchAll(/(\w+\s+)?audit\(/g)];
      for (const m of calls) {
        const vorher = text.slice(Math.max(0, m.index - 12), m.index + 6);
        const istImport = /import|function|\*|\/\//.test(vorher);
        if (istImport) continue;
        assert.ok(
          vorher.includes("await"),
          `${name}: Audit-Aufruf ohne await bei "${vorher.trim()}"`,
        );
      }
    }
  });
});

describe("Serverfunktionen: keine Geheimnisse im Quelltext", () => {
  test("keine fest eingetragenen Schlüssel", () => {
    // Ein versehentlich eingecheckter Schlüssel ist auch nach dem Entfernen
    // noch in der Historie – deshalb lieber hier abfangen.
    const verdaechtig = [
      /eyJhbGciOi[A-Za-z0-9_-]{20,}/,      // JWT
      /sb[ps]_[A-Za-z0-9]{20,}/,           // Supabase-Token
      /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
    ];
    for (const { name, text } of sources()) {
      for (const muster of verdaechtig) {
        assert.ok(!muster.test(text), `${name}: sieht nach einem Geheimnis im Quelltext aus`);
      }
    }
  });

  test("Fehlerausgaben geben keine Tokens preis", () => {
    for (const { name, text } of sources()) {
      assert.ok(
        !/console\.(log|warn|error)\([^)]*\btoken\b[^)]*\)/i.test(text) ||
        /token\?\.\w+|token"|token:/.test(text) === false,
        `${name}: eine Protokollausgabe koennte ein Token enthalten`,
      );
    }
  });
});

describe("Serverfunktionen: Antworten sind nicht zwischenspeicherbar", () => {
  test("jede Funktion nutzt die gemeinsame json-Hilfe", () => {
    // Die setzt `Cache-Control: no-store`. Eine handgebaute Antwort daneben
    // würde diese Zusage still unterlaufen.
    for (const { name, text } of sources()) {
      if (name.startsWith("_") || !text.includes("export const handler")) continue;
      assert.ok(
        text.includes('from "./_lib/http.mjs"'),
        `${name}: baut Antworten ohne die gemeinsame Hilfe`,
      );
    }
  });
});
