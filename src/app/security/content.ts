const ALLOWED_TAGS = new Set([
  "p", "br", "strong", "b", "em", "i", "u", "ul", "ol", "li",
  "h2", "h3", "h4", "blockquote", "code", "pre", "a",
]);

/**
 * Erlaubt ausschließlich normale Web-Links. Insbesondere `javascript:`,
 * `data:` und andere aktive Protokolle dürfen nie aus Redaktionsdaten in
 * `href` oder `window.open` gelangen.
 */
export function safeContentUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  try {
    const parsed = new URL(value.trim(), window.location.origin);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    return parsed.href;
  } catch {
    return null;
  }
}

/**
 * Kleine, bewusst restriktive HTML-Allowlist für redaktionelle Textfelder.
 * Alle Eventhandler, Styles, eingebetteten Medien und aktiven URL-Schemata
 * werden entfernt, bevor React den Inhalt in das DOM einsetzt.
 */
export function sanitizeContentHtml(value: unknown): string {
  if (typeof value !== "string" || value === "") return "";
  const documentNode = new DOMParser().parseFromString(value, "text/html");
  const elements = Array.from(documentNode.body.querySelectorAll("*"));

  for (const element of elements) {
    const tag = element.tagName.toLowerCase();
    if (!ALLOWED_TAGS.has(tag)) {
      element.replaceWith(...Array.from(element.childNodes));
      continue;
    }

    for (const attribute of Array.from(element.attributes)) {
      const keep = tag === "a" && (attribute.name === "href" || attribute.name === "title");
      if (!keep) element.removeAttribute(attribute.name);
    }

    if (tag === "a") {
      const safe = safeContentUrl(element.getAttribute("href"));
      if (safe) {
        element.setAttribute("href", safe);
        element.setAttribute("target", "_blank");
        element.setAttribute("rel", "noopener noreferrer");
      } else {
        element.removeAttribute("href");
      }
    }
  }

  return documentNode.body.innerHTML;
}
