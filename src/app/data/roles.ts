import { useCallback, useEffect, useState } from "react";
import type { Screen } from "./demo";

// ============================================================
// Rollen- und Berechtigungsmodell (Konzept §2)
//
// Rollen sind additiv: ein Administrator kann zusätzlich Editor sein.
// Berechtigungen werden aus den Rollen abgeleitet – die Oberfläche prüft
// immer Berechtigungen, nie Rollen direkt.
//
// ⚠️  Sicherheitshinweis: Diese Prüfung ist Oberflächen-Ergonomie, KEIN
//     Schutz. Verbindlich durchgesetzt werden Rechte serverseitig (RLS /
//     autorisierte Endpunkte). Solange keine echte Anmeldung aktiv ist,
//     lässt sich die Rolle im Demo-Modus frei wechseln.
// ============================================================

export type Role = "admin" | "editor" | "user";

export const ROLE_LABELS: Record<Role, string> = {
  admin: "Administrator",
  editor: "Editor",
  user: "Lernender",
};

export type Permission =
  | "learn.view"          // Trainings ansehen, Fortschritt
  | "content.edit"        // Produkte/Module/Trainings/Elemente bearbeiten
  | "content.publish"     // veröffentlichen, Märkte zuordnen
  | "translation.review"  // Übersetzungen prüfen und korrigieren
  | "users.manage"        // Benutzer, Rollen, Zuordnungen
  | "markets.manage"      // Märkte und Sprachen
  | "settings.manage"     // Plattformeinstellungen, API-Key
  | "reporting.view";     // aggregierte Kennzahlen

const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  user: ["learn.view"],
  editor: ["learn.view", "content.edit", "content.publish", "translation.review", "reporting.view"],
  admin: ["learn.view", "users.manage", "markets.manage", "settings.manage", "reporting.view"],
};

/** Vereinigung der Berechtigungen aller zugewiesenen Rollen (additiv). */
export function permissionsFor(roles: Role[]): Set<Permission> {
  const out = new Set<Permission>();
  for (const r of roles) for (const p of ROLE_PERMISSIONS[r] ?? []) out.add(p);
  return out;
}

export function hasPermission(roles: Role[], permission: Permission): boolean {
  return permissionsFor(roles).has(permission);
}

// ─── Zuordnung Screen → benötigte Berechtigung ───────────────────────────────

export const SCREEN_PERMISSION: Partial<Record<Screen, Permission>> = {
  "dashboard":             "learn.view",
  "catalog":               "learn.view",
  "training-overview":     "learn.view",
  "learning":              "learn.view",
  "editor-tree":           "content.edit",
  "editor-content":        "content.edit",
  "translations-overview": "translation.review",
  "translations-review":   "translation.review",
  "admin-users":           "users.manage",
  "admin-markets":         "markets.manage",
  "admin-settings":        "settings.manage",
  "reporting":             "reporting.view",
};

export function canAccessScreen(roles: Role[], screen: Screen): boolean {
  const needed = SCREEN_PERMISSION[screen];
  if (!needed) return true; // Login/Rechtsseiten u. Ä.
  return hasPermission(roles, needed);
}

// ─── Aktive Rollen (Demo: umschaltbar und persistiert) ───────────────────────

const STORAGE_KEY = "sq-demo-roles";
const DEFAULT_ROLES: Role[] = ["admin", "editor", "user"]; // Demo: alles sichtbar

function readRoles(): Role[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_ROLES;
    const parsed = JSON.parse(raw);
    const valid = Array.isArray(parsed)
      ? parsed.filter((r): r is Role => r === "admin" || r === "editor" || r === "user")
      : [];
    return valid.length ? valid : DEFAULT_ROLES;
  } catch {
    return DEFAULT_ROLES;
  }
}

// Änderungen an der Rolle sollen alle Komponenten sofort erreichen.
const listeners = new Set<(r: Role[]) => void>();
let current: Role[] = typeof localStorage === "undefined" ? DEFAULT_ROLES : readRoles();

export function setRoles(roles: Role[]) {
  current = roles.length ? roles : ["user"];
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(current)); } catch { /* ignorieren */ }
  for (const l of listeners) l(current);
}

/** Aktive Rollen + Berechtigungsprüfer. */
export function useRoles() {
  const [roles, setLocal] = useState<Role[]>(current);

  useEffect(() => {
    const l = (r: Role[]) => setLocal(r);
    listeners.add(l);
    return () => { listeners.delete(l); };
  }, []);

  const can = useCallback((p: Permission) => hasPermission(roles, p), [roles]);
  const canScreen = useCallback((s: Screen) => canAccessScreen(roles, s), [roles]);

  return { roles, can, canScreen, setRoles };
}
