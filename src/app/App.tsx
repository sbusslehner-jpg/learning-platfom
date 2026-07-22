import { useState } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Toaster } from "sonner";
import { MobileBottomNav } from "./components/MobileBottomNav";
import { SessionTimeout } from "./components/SessionTimeout";
import { Sidebar } from "./components/Sidebar";
import { Topbar } from "./components/Topbar";
import { SSO_MODE, useAcademyAuth } from "./data/academyAuth";
import type { NavHandler, Screen } from "./data/demo";
import { AdminMarkets } from "./pages/AdminMarketsPage";
import { AdminSettings } from "./pages/AdminSettingsPage";
import { AdminUsers } from "./pages/AdminUsersPage";
import { Catalog } from "./pages/CatalogPage";
import { Dashboard } from "./pages/DashboardPage";
import { EditorContent } from "./pages/EditorContentPage";
import { EditorTree } from "./pages/EditorTreePage";
import { LearningView } from "./pages/LearningPage";
import { Datenschutz, Impressum } from "./pages/LegalPage";
import { LoginScreen } from "./pages/LoginPage";
import { SessionExpiredPage, SsoErrorPage } from "./pages/SsoPages";
import { TrainingOverview } from "./pages/TrainingOverviewPage";
import { TranslationsOverview } from "./pages/TranslationsOverviewPage";
import { TranslationReview } from "./pages/TranslationsReviewPage";

// ─── Routing ──────────────────────────────────────────────────────────────────

export const SCREEN_PATHS: Record<Screen, string> = {
  "login":                 "/login",
  "dashboard":             "/",
  "catalog":               "/katalog",
  "training-overview":     "/katalog/dsr",
  "learning":              "/lernen",
  "editor-tree":           "/redaktion/inhalte",
  "editor-content":        "/redaktion/editor",
  "translations-overview": "/uebersetzungen",
  "translations-review":   "/uebersetzungen/pruefen",
  "admin-users":           "/verwaltung/benutzer",
  "admin-markets":         "/verwaltung/maerkte",
  "admin-settings":        "/verwaltung/einstellungen",
};

// Aktiven Screen aus dem Pfad ableiten (längster passender Präfix gewinnt,
// damit parametrisierte Routen die Navigation korrekt hervorheben).
function screenFromPath(pathname: string): Screen {
  let best: Screen = "dashboard";
  let bestLen = -1;
  for (const [scr, path] of Object.entries(SCREEN_PATHS) as [Screen, string][]) {
    if (path === "/") continue;
    if ((pathname === path || pathname.startsWith(path + "/")) && path.length > bestLen) {
      best = scr;
      bestLen = path.length;
    }
  }
  return best;
}

// ─── App Shell + Main ─────────────────────────────────────────────────────────

function SsoLoading() {
  return (
    <div className="min-h-screen bg-[#F6F8FA] flex items-center justify-center">
      <span className="inline-block w-8 h-8 border-2 border-[#C3C9D1] border-t-[#00C8C1] rounded-full animate-spin" role="status" aria-label="Sitzung wird geprüft" />
    </div>
  );
}

export default function App() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const ssoState = useAcademyAuth();

  const screen: Screen = screenFromPath(location.pathname);
  const onNavigate: NavHandler = (s, param) =>
    navigate(param ? `${SCREEN_PATHS[s]}/${param}` : SCREEN_PATHS[s]);

  // Im SSO-Modus entscheidet die echte Session; im Demo-Modus der Login-Boolean.
  const authed = SSO_MODE ? ssoState === "authenticated" : loggedIn;

  if (!authed) return (
    <>
      <Routes>
        {/* Demo-Anmeldung nur im Demo-Modus; im SSO-Modus gibt es keine Loginseite. */}
        {!SSO_MODE && (
          <Route path={SCREEN_PATHS["login"]} element={<LoginScreen onLogin={() => { setLoggedIn(true); navigate("/"); }} />} />
        )}
        <Route path="/impressum" element={<Impressum />} />
        <Route path="/datenschutz" element={<Datenschutz />} />
        <Route path="/sso/expired" element={<SessionExpiredPage />} />
        <Route path="/sso/error" element={<SsoErrorPage />} />
        <Route path="*" element={
          SSO_MODE
            ? (ssoState === "loading" ? <SsoLoading /> : <Navigate to="/sso/expired" replace />)
            : <Navigate to={SCREEN_PATHS["login"]} replace />
        } />
      </Routes>
      <Toaster position="bottom-right" />
    </>
  );

  return (
    <div className="flex flex-col h-screen overflow-hidden" style={{ fontFamily: "Inter, 'Noto Sans', system-ui, sans-serif", backgroundColor: "#F6F8FA" }}>
      <Toaster position="bottom-right" richColors />
      <Topbar onMenuToggle={() => setMobileOpen(!mobileOpen)} collapsed={collapsed} />

      <div className="flex flex-1 overflow-hidden">
        {/* Desktop sidebar */}
        <div className="hidden lg:flex">
          <Sidebar current={screen} onNavigate={onNavigate} collapsed={collapsed} />
        </div>

        {/* Mobile sidebar overlay */}
        {mobileOpen && (
          <>
            <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={() => setMobileOpen(false)} />
            <Sidebar current={screen} onNavigate={onNavigate} collapsed={false} mobile onClose={() => setMobileOpen(false)} />
          </>
        )}

        {/* Collapse toggle (desktop) */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="hidden lg:flex absolute left-0 bottom-8 z-10 items-center justify-center w-5 h-8 bg-white border border-[#C3C9D1] rounded-r-md text-[#8A93A0] hover:text-[#5A6472] transition-colors"
          style={{ left: collapsed ? 72 : 256, transition: "left 0.2s" }}
          aria-label="Sidebar ein-/ausklappen"
        >
          {collapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
        </button>

        {/* Content */}
        <main className="flex-1 flex overflow-hidden pb-16 lg:pb-0">
          <Routes>
            <Route path={SCREEN_PATHS["dashboard"]} element={<Dashboard onNavigate={onNavigate} />} />
            <Route path={SCREEN_PATHS["catalog"]} element={<Catalog onNavigate={onNavigate} />} />
            <Route path={SCREEN_PATHS["training-overview"]} element={<TrainingOverview onNavigate={onNavigate} />} />
            <Route path={SCREEN_PATHS["learning"]} element={<LearningView onNavigate={onNavigate} />} />
            <Route path={SCREEN_PATHS["editor-tree"]} element={<EditorTree onNavigate={onNavigate} />} />
            <Route path={SCREEN_PATHS["editor-content"]} element={<EditorContent onNavigate={onNavigate} />} />
            <Route path={SCREEN_PATHS["editor-content"] + "/:trainingId"} element={<EditorContent onNavigate={onNavigate} />} />
            <Route path={SCREEN_PATHS["translations-overview"]} element={<TranslationsOverview onNavigate={onNavigate} />} />
            <Route path={SCREEN_PATHS["translations-review"]} element={<TranslationReview onNavigate={onNavigate} />} />
            <Route path={SCREEN_PATHS["translations-review"] + "/:trainingId/:lang"} element={<TranslationReview onNavigate={onNavigate} />} />
            <Route path={SCREEN_PATHS["admin-users"]} element={<AdminUsers />} />
            <Route path={SCREEN_PATHS["admin-markets"]} element={<AdminMarkets />} />
            <Route path={SCREEN_PATHS["admin-settings"]} element={<AdminSettings />} />
            <Route path="/impressum" element={<Impressum />} />
            <Route path="/datenschutz" element={<Datenschutz />} />
            <Route path="/sso/expired" element={<SessionExpiredPage />} />
            <Route path="/sso/error" element={<SsoErrorPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>

      <MobileBottomNav current={screen} onNavigate={onNavigate} />
      <SessionTimeout />
    </div>
  );
}
