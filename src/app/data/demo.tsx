import {
  Home, BookOpen, FileText, Languages, Users, Settings,
  Search, User, Play, CheckCircle2,
  PencilLine, AlertCircle, History, Sparkles, Lock, CircleDashed,
  BookMarked, Map, Eye,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

export type Screen =
  | "login" | "dashboard" | "catalog" | "training-overview"
  | "learning" | "editor-tree" | "editor-content"
  | "translations-overview" | "translations-review"
  | "admin-users" | "admin-markets" | "admin-settings";

export type Status = "draft" | "published" | "outdated" | "missing" | "auto" | "corrected" | "error";

/** Navigations-Handler mit optionalem Pfad-Parameter (z. B. Trainings-ID). */
export type NavHandler = (s: Screen, param?: string) => void;

// ─── Status config ─────────────────────────────────────────────────────────────

export const STATUS: Record<Status, { label: string; icon: React.ReactNode; bg: string; color: string }> = {
  draft:     { label: "Entwurf",       icon: <PencilLine  size={12} />, bg: "#EEF1F4", color: "#5A6472" },
  published: { label: "Veröffentlicht",icon: <CheckCircle2 size={12} />, bg: "#EAF8F0", color: "#15803D" },
  outdated:  { label: "Veraltet",      icon: <History      size={12} />, bg: "#FDF3E4", color: "#B45309" },
  missing:   { label: "Fehlend",       icon: <CircleDashed size={12} />, bg: "#EEF1F4", color: "#5A6472" },
  auto:      { label: "Automatisch",   icon: <Sparkles     size={12} />, bg: "#EBF1FE", color: "#1D5BD6" },
  corrected: { label: "Gesperrt",      icon: <Lock         size={12} />, bg: "#EAF8F0", color: "#15803D" },
  error:     { label: "Fehler",        icon: <AlertCircle  size={12} />, bg: "#FDEEEC", color: "#B42318" },
};

// ─── Demo datasets ────────────────────────────────────────────────────────────

export const NAV_ITEMS = [
  { section: "Lernen",      items: [{ id: "dashboard",    label: "Start",              icon: Home },
                                     { id: "catalog",      label: "Katalog",            icon: BookOpen }] },
  { section: "Redaktion",   items: [{ id: "editor-tree",  label: "Inhalte",            icon: FileText },
                                     { id: "translations-overview", label: "Übersetzungen", icon: Languages }] },
  { section: "Verwaltung",  items: [{ id: "admin-users",  label: "Benutzer",           icon: Users },
                                     { id: "admin-markets",label: "Märkte & Sprachen",  icon: Map },
                                     { id: "admin-settings",label: "Einstellungen",     icon: Settings }] },
];

export const CHAPTERS = [
  { id: 1, title: "Überblick & Konfigurationsebenen", done: true, active: false },
  { id: 2, title: "Rollenzuweisung im System", done: true, active: false },
  { id: 3, title: "DealerData-Synchronisation", done: false, active: true },
  { id: 4, title: "Konfiguration Serviceannahme", done: false, active: false },
  { id: 5, title: "Fehlerbehandlung & Logs", done: false, active: false },
];

export const CONTENT_TREE = [
  {
    product: "ServiceQ", modules: [
      { name: "Digital Service Reception (DSR)", trainings: [
        { title: "Konfiguration im Einzelhandel", status: "published" as Status, chapters: 5 },
        { title: "Rollenzuweisung und Berechtigungen", status: "published" as Status, chapters: 4 },
        { title: "DealerData-Synchronisation", status: "draft" as Status, chapters: 3 },
        { title: "Fehlerbehandlung & Logs", status: "draft" as Status, chapters: 4 },
      ]},
      { name: "Remote Prognose & Diagnose (RPD)", trainings: [
        { title: "RPD – Systemüberblick", status: "published" as Status, chapters: 3 },
        { title: "RPD – Grundkonfiguration", status: "draft" as Status, chapters: 5 },
      ]},
    ]
  }
];

export const ELEMENTS = [
  { type: "video",   icon: Play,        label: "Einführung DSR",              meta: "6:42 Min." },
  { type: "text",    icon: FileText,    label: "Systemeinstellungen (CDM)",   meta: "420 Zeichen" },
  { type: "steps",  icon: BookMarked,  label: "Grundkonfiguration",           meta: "4 Schritte" },
  { type: "image",  icon: Eye,         label: "Screenshot DSR-Hauptmenü",     meta: "Bild" },
];

export const LANG_DATA = [
  { lang: "Französisch", code: "FR", total: 45, current: 42, outdated: 2, errors: 1 },
  { lang: "Spanisch",    code: "ES", total: 45, current: 45, outdated: 0, errors: 0 },
  { lang: "Polnisch",    code: "PL", total: 45, current: 38, outdated: 5, errors: 2 },
  { lang: "Italienisch", code: "IT", total: 45, current: 44, outdated: 1, errors: 0 },
  { lang: "Niederländisch", code: "NL", total: 45, current: 40, outdated: 3, errors: 2 },
  { lang: "Tschechisch", code: "CZ", total: 45, current: 45, outdated: 0, errors: 0 },
  { lang: "Ungarisch",   code: "HU", total: 45, current: 32, outdated: 8, errors: 5 },
  { lang: "Portugiesisch", code: "PT", total: 45, current: 41, outdated: 4, errors: 0 },
];

export const REVIEW_FIELDS = [
  { id: 1, label: "Kap. 1 Titel",    master: "Überblick & Konfigurationsebenen", translation: "Aperçu et niveaux de configuration", status: "outdated" as Status, diff: "Konfigurationsebenen" },
  { id: 2, label: "Text 1.2",        master: "Bevor Sie beginnen, stellen Sie sicher, dass die DealerData-API-Zugangsdaten vorliegen.", translation: "Avant de commencer, assurez-vous que les informations d'identification de l'API DealerData sont disponibles.", status: "auto" as Status },
  { id: 3, label: "Schritt 3.1",    master: "Öffnen Sie das DSR-Verwaltungsmenü und navigieren Sie zu Einstellungen.", translation: "", status: "error" as Status },
  { id: 4, label: "Kap. 2 Titel",   master: "Rollenzuweisung im System", translation: "Attribution des rôles dans le système", status: "corrected" as Status },
  { id: 5, label: "Text 2.1",       master: "Die Rollenzuweisung erfolgt über das zentrale Benutzermenü.", translation: "L'attribution des rôles se fait via le menu utilisateur central.", status: "auto" as Status },
];

export const USERS = [
  { name: "Maria Schmidt",  email: "m.schmidt@haendler-de.de",  role: "Anwender",  markets: ["DE", "AT"], lastActive: "Heute" },
  { name: "Jean Dupont",    email: "j.dupont@concessionnaire.fr", role: "Anwender", markets: ["FR", "BE"], lastActive: "Gestern" },
  { name: "Anna Kowalski",  email: "a.kowalski@dealer.pl",      role: "Anwender",  markets: ["PL"],       lastActive: "18.07.2026" },
  { name: "Max Keller",     email: "m.keller@groupit.de",       role: "Editor",    markets: ["DE", "AT", "CH", "FR"], lastActive: "Heute" },
  { name: "IT Administration", email: "it@groupit.de",          role: "Admin",     markets: ["Alle"],     lastActive: "Heute" },
];

export const BOTTOM_NAV = [
  { id: "dashboard",  label: "Start",   icon: Home },
  { id: "catalog",    label: "Katalog", icon: BookOpen },
  { id: "search",     label: "Suche",   icon: Search },
  { id: "profile",    label: "Profil",  icon: User },
];
