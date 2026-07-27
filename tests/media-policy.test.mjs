// Prüft die Medienregeln (R-03).
//
// Der Schwerpunkt liegt auf dem, was ein Angreifer versuchen würde: einen
// falschen Typ anmelden, eine harmlose Endung an eine gefährliche Datei
// hängen, oder eine Datei ablegen, deren Inhalt nicht zur Anmeldung passt.
//
// Die Signaturprüfung ist dabei die einzige Aussage über den TATSÄCHLICHEN
// Inhalt. Alles andere kann der Browser behaupten.

import assert from "node:assert/strict";
import test, { describe } from "node:test";
import {
  checkDeclared,
  matchesSignature,
  mediaPolicy,
  safeOriginalName,
  storageKey,
  supportsMedia,
} from "../netlify/functions/_lib/media-policy.mjs";

const MB = 1024 * 1024;

/** Baut einen Kopf mit gesetzter Signatur an der richtigen Stelle. */
function head(bytes, offset = 0, length = 16) {
  const buffer = new Uint8Array(length);
  bytes.forEach((b, i) => { buffer[offset + i] = b; });
  return buffer;
}

describe("Welche Elementtypen tragen Dateien", () => {
  test("Video, Bild und Dokument – sonst nichts", () => {
    assert.equal(supportsMedia("video"), true);
    assert.equal(supportsMedia("image"), true);
    assert.equal(supportsMedia("document"), true);
    for (const type of ["text", "steps", "link", "", "__proto__", "constructor"]) {
      assert.equal(supportsMedia(type), false, `${type} sollte keine Dateien tragen`);
    }
  });
});

describe("Prüfung der angemeldeten Angaben", () => {
  test("eine zulässige Anmeldung geht durch", () => {
    const r = checkDeclared("video", { mime: "video/mp4", size: 5 * MB, filename: "schulung.mp4" });
    assert.equal(r.ok, true);
  });

  test("ein nicht zugelassener Typ wird abgewiesen", () => {
    // QuickTime ist im Browser nicht verlässlich abspielbar.
    const r = checkDeclared("video", { mime: "video/quicktime", size: 5 * MB, filename: "film.mov" });
    assert.equal(r.ok, false);
    assert.match(r.message, /nicht zulässig/);
  });

  test("Office-Dateien sind als Dokument nicht erlaubt", () => {
    // Ohne Virenprüfung wäre das Weiterreichen makrofähiger Dateien an
    // Lernende nicht zu verantworten.
    const r = checkDeclared("document", {
      mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      size: 1 * MB, filename: "anleitung.docx",
    });
    assert.equal(r.ok, false);
  });

  test("eine harmlose Endung an fremdem Typ hilft nicht", () => {
    const r = checkDeclared("image", { mime: "application/x-msdownload", size: 1024, filename: "bild.png" });
    assert.equal(r.ok, false);
  });

  test("ein passender Typ mit fremder Endung hilft ebenso wenig", () => {
    const r = checkDeclared("image", { mime: "image/png", size: 1024, filename: "bild.exe" });
    assert.equal(r.ok, false);
    assert.match(r.message, /Dateiendung/);
  });

  test("zu große Dateien werden mit Zahlen abgewiesen", () => {
    const limit = mediaPolicy().image.maxBytes;
    const r = checkDeclared("image", { mime: "image/png", size: limit + 1, filename: "gross.png" });
    assert.equal(r.ok, false);
    assert.match(r.message, /höchstens/);
  });

  test("die Grenze selbst ist noch zulässig", () => {
    const limit = mediaPolicy().image.maxBytes;
    assert.equal(checkDeclared("image", { mime: "image/png", size: limit, filename: "genau.png" }).ok, true);
  });

  test("fehlende oder unsinnige Größen werden abgewiesen", () => {
    for (const size of [0, -1, NaN, undefined, null, "viele"]) {
      assert.equal(
        checkDeclared("image", { mime: "image/png", size, filename: "x.png" }).ok, false,
        `Größe ${String(size)} haette abgewiesen werden muessen`);
    }
  });

  test("ein Elementtyp ohne Dateien nimmt keine an", () => {
    assert.equal(checkDeclared("text", { mime: "image/png", size: 100, filename: "x.png" }).ok, false);
  });

  test("Endungen werden ohne Rücksicht auf Groß- und Kleinschreibung geprüft", () => {
    assert.equal(checkDeclared("image", { mime: "image/png", size: 100, filename: "FOTO.PNG" }).ok, true);
  });
});

describe("Signaturprüfung", () => {
  test("echte Signaturen werden erkannt", () => {
    assert.equal(matchesSignature(head([0x66, 0x74, 0x79, 0x70], 4), "video/mp4"), true);
    assert.equal(matchesSignature(head([0x1a, 0x45, 0xdf, 0xa3]), "video/webm"), true);
    assert.equal(matchesSignature(head([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), "image/png"), true);
    assert.equal(matchesSignature(head([0xff, 0xd8, 0xff]), "image/jpeg"), true);
    assert.equal(matchesSignature(head([0x25, 0x50, 0x44, 0x46, 0x2d]), "application/pdf"), true);
  });

  test("WebP braucht beide Marken", () => {
    const beide = new Uint8Array(16);
    [0x52, 0x49, 0x46, 0x46].forEach((b, i) => { beide[i] = b; });
    [0x57, 0x45, 0x42, 0x50].forEach((b, i) => { beide[8 + i] = b; });
    assert.equal(matchesSignature(beide, "image/webp"), true);

    // Nur "RIFF" – das ist auch eine WAV-Datei.
    const nurRiff = head([0x52, 0x49, 0x46, 0x46]);
    assert.equal(matchesSignature(nurRiff, "image/webp"), false);
  });

  test("ein umbenanntes Programm besteht die Prüfung nicht", () => {
    // "MZ" – eine Windows-Programmdatei, angemeldet als PNG.
    assert.equal(matchesSignature(head([0x4d, 0x5a, 0x90, 0x00]), "image/png"), false);
  });

  test("ein Skript mit PDF-Endung besteht die Prüfung nicht", () => {
    // "<?php"
    assert.equal(matchesSignature(head([0x3c, 0x3f, 0x70, 0x68, 0x70]), "application/pdf"), false);
  });

  test("eine Signatur an falscher Stelle zählt nicht", () => {
    // "ftyp" gehört bei MP4 an Position 4, nicht an den Anfang.
    assert.equal(matchesSignature(head([0x66, 0x74, 0x79, 0x70], 0), "video/mp4"), false);
  });

  test("ein unbekannter Typ besteht nie", () => {
    assert.equal(matchesSignature(head([0xff, 0xff, 0xff, 0xff]), "application/octet-stream"), false);
    assert.equal(matchesSignature(head([0xff]), ""), false);
  });

  test("zu kurze oder fehlende Daten bestehen nicht", () => {
    assert.equal(matchesSignature(new Uint8Array([0x89]), "image/png"), false);
    assert.equal(matchesSignature(new Uint8Array(0), "image/png"), false);
    assert.equal(matchesSignature(null, "image/png"), false);
  });
});

describe("Ablagepfad", () => {
  const element = "11111111-2222-3333-4444-555555555555";
  const asset = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

  test("der Pfad enthält nie den hochgeladenen Dateinamen", () => {
    const key = storageKey(element, asset, "video/mp4");
    assert.equal(key, `elements/${element}/${asset}.mp4`);
    assert.ok(!key.includes(".."), "Pfadwechsel im Schluessel");
  });

  test("jeder erlaubte Typ bekommt seine Endung", () => {
    assert.match(storageKey(element, asset, "image/jpeg"), /\.jpg$/);
    assert.match(storageKey(element, asset, "image/webp"), /\.webp$/);
    assert.match(storageKey(element, asset, "application/pdf"), /\.pdf$/);
  });

  test("ein unbekannter Typ endet neutral", () => {
    assert.match(storageKey(element, asset, "irgendwas/komisch"), /\.bin$/);
  });
});

describe("Anzeigename", () => {
  test("Pfadtrenner werden entschärft", () => {
    // Die Punkte bleiben stehen – sie sind harmlos, sobald der Trenner weg ist.
    // Und der Name landet ohnehin nur in der Anzeige, nie im Ablagepfad.
    assert.equal(safeOriginalName("../../etc/passwd"), ".._.._etc_passwd");
    assert.equal(safeOriginalName("C:\\Users\\x\\film.mp4"), "C:_Users_x_film.mp4");
  });

  test("Steuerzeichen verschwinden", () => {
    const roh = "bild" + String.fromCharCode(0) + String.fromCharCode(10) +
                String.fromCharCode(27) + String.fromCharCode(127) + ".png";
    assert.equal(safeOriginalName(roh), "bild.png");
  });

  test("die Länge ist begrenzt", () => {
    assert.equal(safeOriginalName("a".repeat(500)).length, 200);
  });

  test("Umlaute und Leerzeichen bleiben erhalten", () => {
    assert.equal(safeOriginalName("  Schulung Ölwechsel.pdf  "), "Schulung Ölwechsel.pdf");
  });

  test("nichts wird zu nichts", () => {
    assert.equal(safeOriginalName(null), "");
    assert.equal(safeOriginalName(undefined), "");
  });
});

describe("Grenzen", () => {
  test("jede Regel hat Typen, Endungen und eine Obergrenze", () => {
    for (const [type, rule] of Object.entries(mediaPolicy())) {
      assert.ok(rule.mimeTypes.length > 0, `${type} ohne Typen`);
      assert.ok(rule.extensions.length > 0, `${type} ohne Endungen`);
      assert.ok(rule.maxBytes > 0, `${type} ohne Obergrenze`);
      assert.ok(rule.label.length > 0, `${type} ohne Bezeichnung`);
    }
  });

  test("die Obergrenzen lassen sich über die Umgebung anheben", () => {
    // Für längere Schulungsvideos reicht die Vorgabe von 50 MB nicht; sie muss
    // ohne Codeänderung anhebbar sein.
    const vorher = process.env.MEDIA_MAX_VIDEO_MB;
    process.env.MEDIA_MAX_VIDEO_MB = "500";
    assert.equal(mediaPolicy().video.maxBytes, 500 * MB);
    if (vorher === undefined) delete process.env.MEDIA_MAX_VIDEO_MB;
    else process.env.MEDIA_MAX_VIDEO_MB = vorher;
  });

  test("ein unsinniger Umgebungswert fällt auf die Vorgabe zurück", () => {
    const vorher = process.env.MEDIA_MAX_IMAGE_MB;
    for (const wert of ["0", "-5", "viel", ""]) {
      process.env.MEDIA_MAX_IMAGE_MB = wert;
      assert.equal(mediaPolicy().image.maxBytes, 10 * MB, `Wert "${wert}" hat die Vorgabe verdraengt`);
    }
    if (vorher === undefined) delete process.env.MEDIA_MAX_IMAGE_MB;
    else process.env.MEDIA_MAX_IMAGE_MB = vorher;
  });
});
