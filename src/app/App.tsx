import { useEffect, useState } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Toaster } from "sonner";
import { MobileBottomNav } from "./components/MobileBottomNav";
import { SessionTimeout } from "./components/SessionTimeout";
import { Sidebar } from "./components/Sidebar";
import { Topbar } from "./components/Topbar";
import { SSO_MODE, useAcademyAuth } from "./data/academyAuth";
import {
  KEYCLOAK_MODE,
  completeLogin,
  login as keycloakLogin,
  logout as keycloakLogout,
  signedOutDeliberately,
  useKeycloakAuth,
} from "./data/keycloakAuth";
import type { NavHandler, Screen } from "./data/demo";
import { useRoles } from "./data/roles";
import { ReportingPage } from "./pages/ReportingPage";
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
  "reporting":             "/auswertungen",
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

/**
 * Öffentlich erreichbare Pfade: hier wird im Keycloak-Modus NIE automatisch
 * zur Anmeldung weitergeleitet (Rechtsseiten, Fehlerseiten, Rückleitung).
 */
const PUBLIC_PATHS = ["/impressum", "/datenschutz", "/sso/expired", "/sso/error", "/auth/callback"] as const;

const isPublicPath = (pathname: string) =>
  PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));

// ─── App Shell + Main ─────────────────────────────────────────────────────────

function SsoLoading({ label = "Sitzung wird geprüft" }: { label?: string }) {
  return (
    <div className="min-h-screen bg-[#F6F8FA] flex items-center justify-center">
      <span className="inline-block w-8 h-8 border-2 border-[#C3C9D1] border-t-[#00C8C1] rounded-full animate-spin" role="status" aria-label={label} />
    </div>
  );
}

/**
 * Rückleitung von Keycloak (`/auth/callback`).
 * Löst den Autorisierungscode ein und geht dann auf den Start; bei Fehlern auf
 * die bestehende SSO-Fehlerseite – nie zurück in eine Anmeldeschleife.
 */
function AuthCallback() {
  const navigate = useNavigate();

  useEffect(() => {
    let alive = true;
    completeLogin()
      .then(() => { if (alive) navigate("/", { replace: true }); })
      .catch(() => { if (alive) navigate("/sso/error?reason=error", { replace: true }); });
    return () => { alive = false; };
  }, [navigate]);

  return <SsoLoading label="Anmeldung wird abgeschlossen" />;
}

export default function App() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [signinFailed, setSigninFailed] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const ssoState = useAcademyAuth();
  const keycloak = useKeycloakAuth();
  const { canScreen } = useRoles();

  const screen: Screen = screenFromPath(location.pathname);
  const onNavigate: NavHandler = (s, param) =>
    navigate(param ? `${SCREEN_PATHS[s]}/${param}` : SCREEN_PATHS[s]);

  /** Route nur rendern, wenn die aktive Rolle die Berechtigung hat.
   *  Sonst zurück auf den Start – kein Zugriff auf fremde Bereiche über die URL. */
  const guard = (s: Screen, element: React.ReactNode) =>
    canScreen(s) ? element : <Navigate to="/" replace />;

  /** Abmelden: Keycloak-Logout, im SSO-Modus serverseitig, sonst Demo-Anmeldung. */
  const handleLogout = () => {
    if (KEYCLOAK_MODE) { void keycloakLogout(); return; }
    if (SSO_MODE) { window.location.assign("/sso/expired"); return; }
    setLoggedIn(false);
    navigate(SCREEN_PATHS["login"]);
  };

  // Vorrang: echte Keycloak-Anmeldung → ServiceQ-Handshake → Demo-Anmeldung.
  const authed = KEYCLOAK_MODE
    ? keycloak.state === "authenticated"
    : SSO_MODE
      ? ssoState === "authenticated"
      : loggedIn;

  // Im Keycloak-Modus gibt es keine eigene Anmeldemaske für geschützte Seiten:
  // fehlt die Sitzung, springt die Oberfläche direkt zu Keycloak.
  // Ausnahmen: öffentliche Seiten und – nach bewusster Abmeldung – /login,
  // damit die Abmeldung nicht sofort in eine neue Anmeldung zurückfällt.
  useEffect(() => {
    if (!KEYCLOAK_MODE || signinFailed) return;
    if (keycloak.state !== "unauthenticated") return;
    const path = location.pathname;
    if (isPublicPath(path)) return;
    if (path === SCREEN_PATHS["login"] && signedOutDeliberately()) return;
    keycloakLogin().catch(() => {
      // Keycloak nicht erreichbar/falsch konfiguriert: sichtbarer Ausweg
      // statt endloser Weiterleitung.
      setSigninFailed(true);
      navigate(SCREEN_PATHS["login"], { replace: true });
    });
  }, [keycloak.state, location.pathname, navigate, signinFailed]);

  if (!authed) return (
    <>
      <Routes>
        {/* Anmeldeseite: im Keycloak-Modus nur der Absprung zu Keycloak,
            im Demo-Modus die Demo-Anmeldung. Im reinen SSO-Modus (ServiceQ)
            gibt es weiterhin keine Loginseite. */}
        {(KEYCLOAK_MODE || !SSO_MODE) && (
          <Route path={SCREEN_PATHS["login"]} element={<LoginScreen onLogin={() => { setLoggedIn(true); navigate("/"); }} />} />
        )}
        {KEYCLOAK_MODE && <Route path="/auth/callback" element={<AuthCallback />} />}
        <Route path="/impressum" element={<Impressum />} />
        <Route path="/datenschutz" element={<Datenschutz />} />
        <Route path="/sso/expired" element={<SessionExpiredPage />} />
        <Route path="/sso/error" element={<SsoErrorPage />} />
        <Route path="*" element={
          KEYCLOAK_MODE
            ? (keycloak.state === "error"
                ? <Navigate to="/sso/error?reason=error" replace />
                : signinFailed
                ? <Navigate to={SCREEN_PATHS["login"]} replace />
                : <SsoLoading label={keycloak.state === "loading" ? "Sitzung wird geprüft" : "Weiterleitung zur Anmeldung"} />)
            : SSO_MODE
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
      <Topbar
        onMenuToggle={() => setMobileOpen(!mobileOpen)}
        collapsed={collapsed}
        onOpenTraining={(slug) => onNavigate("learning", slug)}
        onLogout={handleLogout}
      />

      <div className="flex flex-1 overflow-hidden">
        {/* Desktop sidebar */}
        <div className="hidden lg:flex">
          <Sidebar current={screen} onNavigate={onNavigate} collapsed={collapsed} onLogout={handleLogout} />
        </div>

        {/* Mobile sidebar overlay */}
        {mobileOpen && (
          <>
            <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={() => setMobileOpen(false)} />
            <Sidebar current={screen} onNavigate={onNavigate} collapsed={false} mobile onClose={() => setMobileOpen(false)} onLogout={handleLogout} />
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
            <Route path={SCREEN_PATHS["learning"] + "/:slug"} element={<LearningView onNavigate={onNavigate} />} />
            <Route path={SCREEN_PATHS["editor-tree"]} element={guard("editor-tree", <EditorTree onNavigate={onNavigate} />)} />
            <Route path={SCREEN_PATHS["editor-content"]} element={guard("editor-content", <EditorContent onNavigate={onNavigate} />)} />
            <Route path={SCREEN_PATHS["editor-content"] + "/:trainingId"} element={guard("editor-content", <EditorContent onNavigate={onNavigate} />)} />
            <Route path={SCREEN_PATHS["translations-overview"]} element={guard("translations-overview", <TranslationsOverview onNavigate={onNavigate} />)} />
            <Route path={SCREEN_PATHS["translations-review"]} element={guard("translations-review", <TranslationReview onNavigate={onNavigate} />)} />
            <Route path={SCREEN_PATHS["translations-review"] + "/:trainingId/:lang"} element={guard("translations-review", <TranslationReview onNavigate={onNavigate} />)} />
            <Route path={SCREEN_PATHS["reporting"]} element={guard("reporting", <ReportingPage />)} />
            <Route path={SCREEN_PATHS["admin-users"]} element={guard("admin-users", <AdminUsers />)} />
            <Route path={SCREEN_PATHS["admin-markets"]} element={guard("admin-markets", <AdminMarkets />)} />
            <Route path={SCREEN_PATHS["admin-settings"]} element={guard("admin-settings", <AdminSettings />)} />
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
