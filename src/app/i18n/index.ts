import { useCallback, useEffect, useState } from "react";

// ============================================================
// Internationalisierung der Oberfläche (Konzept §15)
//
// Getrennt von der Inhaltsübersetzung: Oberflächentexte kommen aus diesen
// Wörterbüchern, Trainingsinhalte aus der Datenbank (Mistral-Pipeline).
//
// Fallback-Kette:  de-AT → de → Standardsprache (de)
// Fehlt ein Schlüssel in der Zielsprache, greift Deutsch; fehlt er auch dort,
// wird der Schlüssel selbst angezeigt (macht Lücken sichtbar statt leer).
// ============================================================

export const UI_LANGUAGES = [
  { code: "de", label: "Deutsch" },
  { code: "en", label: "English" },
  { code: "fr", label: "Français" },
] as const;

export type UiLanguage = (typeof UI_LANGUAGES)[number]["code"];
const FALLBACK: UiLanguage = "de";

type Dict = Record<string, string>;

const de: Dict = {
  // Navigation
  "nav.learn": "Lernen",
  "nav.editorial": "Redaktion",
  "nav.admin": "Verwaltung",
  "nav.start": "Start",
  "nav.catalog": "Katalog",
  "nav.content": "Inhalte",
  "nav.translations": "Übersetzungen",
  "nav.reporting": "Auswertungen",
  "nav.users": "Benutzer",
  "nav.markets": "Märkte & Sprachen",
  "nav.settings": "Einstellungen",
  "nav.search": "Suche",
  "nav.profile": "Profil",
  // Allgemein
  "common.logout": "Abmelden",
  "common.cancel": "Abbrechen",
  "common.save": "Speichern",
  "common.saving": "Wird gespeichert …",
  "common.saved": "Gespeichert",
  "common.delete": "Löschen",
  "common.create": "Anlegen",
  "common.edit": "Bearbeiten",
  "common.search": "Suchen …",
  "common.loading": "Lädt …",
  "common.retry": "Erneut versuchen",
  "common.close": "Schließen",
  "common.language": "Sprache",
  "common.role": "Rolle",
  "common.all": "Alle",
  "common.help": "Hilfe",
  "common.notifications": "Benachrichtigungen",
  "common.demoMode": "Demo-Modus",
  "common.noResults": "Keine Ergebnisse",
  "common.dbRequired": "Nur mit verbundener Datenbank möglich",
  "common.loadError": "Daten konnten nicht geladen werden.",
  "common.saveError": "Speichern fehlgeschlagen.",
  // Lernbereich
  "learn.greeting": "Willkommen zurück",
  "learn.continue": "Weiterlernen",
  "learn.newForYou": "Neu für dich",
  "learn.myTrainings": "Meine Trainings",
  "learn.showAll": "Alle anzeigen",
  "learn.lastOpened": "Zuletzt geöffnet",
  "learn.catalogTitle": "Trainings-Katalog",
  "learn.catalogSubtitle": "Alle verfügbaren Trainings für ServiceQ in Ihrem Markt",
  "learn.trainings": "Trainings",
  "learn.completed": "abgeschlossen",
  "learn.chapters": "Kapitel",
  "learn.chapter": "Kapitel",
  "learn.start": "Starten",
  "learn.repeat": "Wiederholen",
  "learn.finishChapter": "Kapitel abschließen & weiter",
  "learn.nextChapter": "Nächstes Kapitel",
  "learn.prevChapter": "Vorheriges Kapitel",
  "learn.trainingDone": "Training abgeschlossen",
  "learn.original": "Original",
  "learn.status.open": "offen",
  "learn.status.started": "begonnen",
  "learn.status.done": "abgeschlossen",
  "learn.new": "Neu",
  "learn.noTrainings": "Keine Trainings verfügbar",
  "learn.noTrainingsBody": "Für Ihren Markt sind derzeit keine Trainings freigegeben. Wenden Sie sich an Ihren Ansprechpartner.",
  // Reporting
  "report.title": "Auswertungen",
  "report.subtitle": "Aggregierte Plattformkennzahlen – keine personenbezogene Lernüberwachung",
  "report.contentHealth": "Inhaltsbestand",
  "report.translationHealth": "Übersetzungsstatus",
  "report.marketCoverage": "Marktabdeckung",
  "report.activity": "Lernaktivität",
  "report.trainingsPublished": "Veröffentlichte Trainings",
  "report.trainingsDraft": "Entwürfe",
  "report.languages": "Sprachen",
  "report.markets": "Märkte",
  "report.activeLearners": "Aktive Lernende",
  "report.chaptersCompleted": "Abgeschlossene Kapitel",
  "report.last7d": "letzte 7 Tage",
  "report.last30d": "letzte 30 Tage",
  "report.privacyNote": "Diese Auswertung zeigt ausschließlich Summen. Ein Reporting über einzelne Lernende ist bewusst nicht vorgesehen.",
  // Session
  "session.expiring": "Ihre Sitzung läuft bald ab",
  "session.extend": "Sitzung verlängern",
  "session.expired": "Ihre Sitzung ist abgelaufen",
  "session.backToServiceQ": "Zurück zu ServiceQ",
};

const en: Dict = {
  "nav.learn": "Learning",
  "nav.editorial": "Editorial",
  "nav.admin": "Administration",
  "nav.start": "Home",
  "nav.catalog": "Catalogue",
  "nav.content": "Content",
  "nav.translations": "Translations",
  "nav.reporting": "Reports",
  "nav.users": "Users",
  "nav.markets": "Markets & languages",
  "nav.settings": "Settings",
  "nav.search": "Search",
  "nav.profile": "Profile",
  "common.logout": "Log out",
  "common.cancel": "Cancel",
  "common.save": "Save",
  "common.saving": "Saving …",
  "common.saved": "Saved",
  "common.delete": "Delete",
  "common.create": "Create",
  "common.edit": "Edit",
  "common.search": "Search …",
  "common.loading": "Loading …",
  "common.retry": "Try again",
  "common.close": "Close",
  "common.language": "Language",
  "common.role": "Role",
  "common.all": "All",
  "common.help": "Help",
  "common.notifications": "Notifications",
  "common.demoMode": "Demo mode",
  "common.noResults": "No results",
  "common.dbRequired": "Requires a connected database",
  "common.loadError": "Data could not be loaded.",
  "common.saveError": "Saving failed.",
  "learn.greeting": "Welcome back",
  "learn.continue": "Continue learning",
  "learn.newForYou": "New for you",
  "learn.myTrainings": "My trainings",
  "learn.showAll": "Show all",
  "learn.lastOpened": "Last opened",
  "learn.catalogTitle": "Training catalogue",
  "learn.catalogSubtitle": "All ServiceQ trainings available in your market",
  "learn.trainings": "trainings",
  "learn.completed": "completed",
  "learn.chapters": "Chapters",
  "learn.chapter": "Chapter",
  "learn.start": "Start",
  "learn.repeat": "Repeat",
  "learn.finishChapter": "Complete chapter & continue",
  "learn.nextChapter": "Next chapter",
  "learn.prevChapter": "Previous chapter",
  "learn.trainingDone": "Training completed",
  "learn.original": "Original",
  "learn.status.open": "open",
  "learn.status.started": "in progress",
  "learn.status.done": "completed",
  "learn.new": "New",
  "learn.noTrainings": "No trainings available",
  "learn.noTrainingsBody": "No trainings are currently released for your market. Please contact your representative.",
  "report.title": "Reports",
  "report.subtitle": "Aggregated platform metrics – no individual learner tracking",
  "report.contentHealth": "Content inventory",
  "report.translationHealth": "Translation status",
  "report.marketCoverage": "Market coverage",
  "report.activity": "Learning activity",
  "report.trainingsPublished": "Published trainings",
  "report.trainingsDraft": "Drafts",
  "report.languages": "Languages",
  "report.markets": "Markets",
  "report.activeLearners": "Active learners",
  "report.chaptersCompleted": "Chapters completed",
  "report.last7d": "last 7 days",
  "report.last30d": "last 30 days",
  "report.privacyNote": "This report shows totals only. Reporting on individual learners is intentionally not provided.",
  "session.expiring": "Your session is about to expire",
  "session.extend": "Extend session",
  "session.expired": "Your session has expired",
  "session.backToServiceQ": "Back to ServiceQ",
};

const fr: Dict = {
  "nav.learn": "Apprentissage",
  "nav.editorial": "Rédaction",
  "nav.admin": "Administration",
  "nav.start": "Accueil",
  "nav.catalog": "Catalogue",
  "nav.content": "Contenus",
  "nav.translations": "Traductions",
  "nav.reporting": "Rapports",
  "nav.users": "Utilisateurs",
  "nav.markets": "Marchés et langues",
  "nav.settings": "Paramètres",
  "nav.search": "Recherche",
  "nav.profile": "Profil",
  "common.logout": "Se déconnecter",
  "common.cancel": "Annuler",
  "common.save": "Enregistrer",
  "common.saving": "Enregistrement …",
  "common.saved": "Enregistré",
  "common.delete": "Supprimer",
  "common.create": "Créer",
  "common.edit": "Modifier",
  "common.search": "Rechercher …",
  "common.loading": "Chargement …",
  "common.retry": "Réessayer",
  "common.close": "Fermer",
  "common.language": "Langue",
  "common.role": "Rôle",
  "common.all": "Tous",
  "common.help": "Aide",
  "common.notifications": "Notifications",
  "common.demoMode": "Mode démo",
  "common.noResults": "Aucun résultat",
  "common.dbRequired": "Nécessite une base de données connectée",
  "common.loadError": "Impossible de charger les données.",
  "common.saveError": "Échec de l'enregistrement.",
  "learn.greeting": "Bon retour",
  "learn.continue": "Continuer",
  "learn.newForYou": "Nouveau pour vous",
  "learn.myTrainings": "Mes formations",
  "learn.showAll": "Tout afficher",
  "learn.lastOpened": "Ouvert récemment",
  "learn.catalogTitle": "Catalogue de formations",
  "learn.catalogSubtitle": "Toutes les formations ServiceQ disponibles sur votre marché",
  "learn.trainings": "formations",
  "learn.completed": "terminé",
  "learn.chapters": "Chapitres",
  "learn.chapter": "Chapitre",
  "learn.start": "Commencer",
  "learn.repeat": "Revoir",
  "learn.finishChapter": "Terminer le chapitre et continuer",
  "learn.nextChapter": "Chapitre suivant",
  "learn.prevChapter": "Chapitre précédent",
  "learn.trainingDone": "Formation terminée",
  "learn.original": "Original",
  "learn.status.open": "à faire",
  "learn.status.started": "en cours",
  "learn.status.done": "terminé",
  "learn.new": "Nouveau",
  "learn.noTrainings": "Aucune formation disponible",
  "learn.noTrainingsBody": "Aucune formation n'est actuellement publiée pour votre marché. Contactez votre interlocuteur.",
  "report.title": "Rapports",
  "report.subtitle": "Indicateurs agrégés de la plateforme – aucun suivi individuel",
  "report.contentHealth": "Inventaire des contenus",
  "report.translationHealth": "État des traductions",
  "report.marketCoverage": "Couverture des marchés",
  "report.activity": "Activité d'apprentissage",
  "report.trainingsPublished": "Formations publiées",
  "report.trainingsDraft": "Brouillons",
  "report.languages": "Langues",
  "report.markets": "Marchés",
  "report.activeLearners": "Apprenants actifs",
  "report.chaptersCompleted": "Chapitres terminés",
  "report.last7d": "7 derniers jours",
  "report.last30d": "30 derniers jours",
  "report.privacyNote": "Ce rapport ne présente que des totaux. Le suivi individuel des apprenants n'est volontairement pas proposé.",
  "session.expiring": "Votre session va bientôt expirer",
  "session.extend": "Prolonger la session",
  "session.expired": "Votre session a expiré",
  "session.backToServiceQ": "Retour à ServiceQ",
};

const DICTS: Record<UiLanguage, Dict> = { de, en, fr };

/** Auflösung eines Locale-Strings auf eine unterstützte Sprache (de-AT → de). */
export function resolveUiLanguage(locale: string | undefined | null): UiLanguage {
  if (!locale) return FALLBACK;
  const lower = locale.toLowerCase();
  const exact = UI_LANGUAGES.find((l) => l.code === lower);
  if (exact) return exact.code;
  const base = lower.split("-")[0];
  const baseMatch = UI_LANGUAGES.find((l) => l.code === base);
  return baseMatch ? baseMatch.code : FALLBACK;
}

// ─── Aktive Sprache (persistiert, sofort für alle Komponenten sichtbar) ──────

const STORAGE_KEY = "sq-ui-language";
const listeners = new Set<(l: UiLanguage) => void>();

function initial(): UiLanguage {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return resolveUiLanguage(stored);
    return resolveUiLanguage(navigator.language);
  } catch {
    return FALLBACK;
  }
}

let current: UiLanguage = typeof window === "undefined" ? FALLBACK : initial();

export function setUiLanguage(lang: UiLanguage) {
  current = lang;
  try {
    localStorage.setItem(STORAGE_KEY, lang);
    document.documentElement.lang = lang;
  } catch { /* ignorieren */ }
  for (const l of listeners) l(lang);
}

export function translate(lang: UiLanguage, key: string, vars?: Record<string, string | number>): string {
  const raw = DICTS[lang]?.[key] ?? DICTS[FALLBACK][key] ?? key;
  if (!vars) return raw;
  return Object.entries(vars).reduce((s, [k, v]) => s.replace(`{${k}}`, String(v)), raw);
}

/** Übersetzungs-Hook: `const { t, lang, setLang } = useT()`. */
export function useT() {
  const [lang, setLocal] = useState<UiLanguage>(current);

  useEffect(() => {
    const l = (v: UiLanguage) => setLocal(v);
    listeners.add(l);
    try { document.documentElement.lang = current; } catch { /* ignorieren */ }
    return () => { listeners.delete(l); };
  }, []);

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => translate(lang, key, vars),
    [lang],
  );

  return { t, lang, setLang: setUiLanguage };
}
