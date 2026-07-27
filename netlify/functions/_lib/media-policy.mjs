// ============================================================
// Was hochgeladen werden darf – die maßgebliche Fassung.
//
// Diese Datei ist die EINZIGE Wahrheit über erlaubte Dateitypen und Größen.
// Die Oberfläche schreibt sie nicht ab, sondern fragt sie über
// `GET /api/media/policy` ab. Zwei Listen, die auseinanderlaufen, wären
// schlimmer als eine strenge: Die Oberfläche würde etwas anbieten, das der
// Server ablehnt – und der Fehler fiele erst nach dem Hochladen auf.
//
// Geprüft wird zweimal, und das zweite Mal zählt:
//
//   1. Bei der Anmeldung gegen die ANGEGEBENEN Werte. Das erspart einen
//      aussichtslosen Upload.
//   2. Nach der Ablage gegen die TATSÄCHLICHEN Werte – Größe aus der Ablage,
//      Typ aus den ersten Bytes. Wer direkt in die Ablage schreibt, kann bei
//      der Anmeldung alles behaupten; deshalb entscheidet erst dieser Schritt.
//
// Die Signaturprüfung ist kein Virenschutz. Sie stellt fest, dass eine Datei
// das ist, was sie zu sein vorgibt – nicht, dass ihr Inhalt harmlos ist. Eine
// Virenprüfung fehlt bewusst und ist in docs/medien.md als offener Punkt
// vermerkt.
// ============================================================

const MB = 1024 * 1024;

/** Obergrenze aus der Umgebung, sonst der Vorgabewert. */
function limitMb(name, fallback) {
  const raw = Number.parseInt(String(process.env[name] ?? ""), 10);
  return Number.isFinite(raw) && raw > 0 ? raw : fallback;
}

/**
 * Signaturen („magic bytes"). Jeder Eintrag ist ein Test über die ersten Bytes.
 * Mehrere Einträge je Typ sind zulässig – MP4 etwa kennt viele Marken.
 */
const SIGNATURES = {
  "video/mp4": [
    // ISO-BMFF: 4 Byte Boxlänge, dann "ftyp". Die Marke dahinter variiert
    // (isom, mp42, avc1, …) und wird deshalb nicht geprüft.
    { offset: 4, bytes: [0x66, 0x74, 0x79, 0x70] },
  ],
  "video/webm": [
    { offset: 0, bytes: [0x1a, 0x45, 0xdf, 0xa3] }, // EBML, auch Matroska
  ],
  "image/png": [
    { offset: 0, bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  ],
  "image/jpeg": [
    { offset: 0, bytes: [0xff, 0xd8, 0xff] },
  ],
  "image/webp": [
    { offset: 0, bytes: [0x52, 0x49, 0x46, 0x46] },            // "RIFF"
    { offset: 8, bytes: [0x57, 0x45, 0x42, 0x50] },            // "WEBP"
  ],
  "application/pdf": [
    { offset: 0, bytes: [0x25, 0x50, 0x44, 0x46, 0x2d] },      // "%PDF-"
  ],
};

/** Erlaubte Typen je Elementart, mit Obergrenze und Dateiendung. */
export function mediaPolicy() {
  return {
    video: {
      label: "Video",
      // Kein QuickTime, kein AVI: Sie sind im Browser nicht verlässlich
      // abspielbar. Wer sie anbietet, verspricht etwas, das nicht überall hält.
      mimeTypes: ["video/mp4", "video/webm"],
      extensions: [".mp4", ".webm"],
      maxBytes: limitMb("MEDIA_MAX_VIDEO_MB", 50) * MB,
    },
    image: {
      label: "Bild",
      mimeTypes: ["image/png", "image/jpeg", "image/webp"],
      extensions: [".png", ".jpg", ".jpeg", ".webp"],
      maxBytes: limitMb("MEDIA_MAX_IMAGE_MB", 10) * MB,
    },
    document: {
      label: "Dokument",
      // Ausschließlich PDF. Office-Dateien können Makros enthalten; ohne
      // Virenprüfung wäre das Weiterreichen an Lernende nicht zu verantworten.
      mimeTypes: ["application/pdf"],
      extensions: [".pdf"],
      maxBytes: limitMb("MEDIA_MAX_DOCUMENT_MB", 25) * MB,
    },
  };
}

/** Trägt ein Elementtyp überhaupt Dateien? */
export function supportsMedia(elementType) {
  return Object.hasOwn(mediaPolicy(), String(elementType));
}

/**
 * Prüft die ANGEMELDETEN Angaben.
 * @returns {{ok: true, rule: object} | {ok: false, message: string}}
 */
export function checkDeclared(elementType, { mime, size, filename }) {
  const rule = mediaPolicy()[String(elementType)];
  if (!rule) {
    return { ok: false, message: `Für „${elementType}" sind keine Dateien vorgesehen.` };
  }
  if (!rule.mimeTypes.includes(String(mime))) {
    return {
      ok: false,
      message: `${rule.label}: nur ${rule.extensions.join(", ")} – „${mime}" ist nicht zulässig.`,
    };
  }
  const bytes = Number(size);
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return { ok: false, message: "Die Dateigröße fehlt oder ist unbrauchbar." };
  }
  if (bytes > rule.maxBytes) {
    return {
      ok: false,
      message: `${rule.label}: höchstens ${Math.round(rule.maxBytes / MB)} MB, ` +
               `angemeldet sind ${(bytes / MB).toFixed(1)} MB.`,
    };
  }
  const name = String(filename ?? "");
  const dot = name.lastIndexOf(".");
  const ext = dot >= 0 ? name.slice(dot).toLowerCase() : "";
  if (!rule.extensions.includes(ext)) {
    return { ok: false, message: `Dateiendung „${ext || "(keine)"}" passt nicht zu ${rule.label}.` };
  }
  return { ok: true, rule };
}

/**
 * Prüft die ersten Bytes gegen die Signatur des angegebenen Typs.
 * @param {Uint8Array|Buffer} head erste Bytes der abgelegten Datei
 * @param {string} mime
 */
export function matchesSignature(head, mime) {
  const tests = SIGNATURES[String(mime)];
  if (!tests) return false;
  const bytes = head instanceof Uint8Array ? head : new Uint8Array(head ?? []);
  return tests.every(({ offset, bytes: expected }) =>
    expected.every((value, i) => bytes[offset + i] === value));
}

/** Wie viele Bytes die Signaturprüfung mindestens braucht. */
export const SIGNATURE_HEAD_BYTES = 16;

/**
 * Baut den Ablagepfad.
 *
 * Der Name der hochgeladenen Datei landet NICHT im Pfad: Er kann Pfadangaben,
 * Steuerzeichen oder fremde Schriftsysteme enthalten und wäre eine unnötige
 * Angriffsfläche. Der ursprüngliche Name wird in `asset.original_name`
 * gespeichert und nur angezeigt.
 */
export function storageKey(elementId, assetId, mime) {
  const ext = {
    "video/mp4": "mp4", "video/webm": "webm",
    "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp",
    "application/pdf": "pdf",
  }[String(mime)] ?? "bin";
  return `elements/${elementId}/${assetId}.${ext}`;
}

/**
 * Anzeigename, entschärft: keine Steuerzeichen, keine Pfadtrenner, begrenzt.
 *
 * Bewusst über Codepoints statt über eine Zeichenklasse im regulären Ausdruck.
 * Ein Steuerzeichen, das wörtlich im Quelltext steht, ist beim Lesen
 * unsichtbar, übersteht Kopiervorgänge unzuverlässig und lässt Werkzeuge die
 * Datei für binär halten – genau das ist hier schon einmal passiert.
 */
export function safeOriginalName(raw) {
  const printable = [...String(raw ?? "")]
    .filter((ch) => {
      const code = ch.codePointAt(0);
      return code > 0x1f && code !== 0x7f;   // keine C0-Steuerzeichen, kein DEL
    })
    .join("");
  return printable.replace(/[/\\]/g, "_").trim().slice(0, 200);
}
