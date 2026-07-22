import { AlertTriangle, ArrowLeft, RefreshCw } from "lucide-react";

// ─── SSO-Fehler- und Ablaufseiten (§7.6, §9.2) ───────────────────────────────
// Rückleitung immer zu ServiceQ, NIEMALS zu einer Academy-Loginseite.
// Das Rückleitungsziel kommt aus einer Build-Konfiguration, nie aus der URL (B7).

const SERVICEQ_RETURN_URL =
  (import.meta.env.VITE_SERVICEQ_RETURN_URL as string | undefined) ?? "https://serviceq.example.com";

function SsoLayout({ tone, title, children, actions }: {
  tone: "warn" | "error"; title: string; children: React.ReactNode; actions: React.ReactNode;
}) {
  const bg = tone === "warn" ? "#FDF3E4" : "#FDEEEC";
  const fg = tone === "warn" ? "#B45309" : "#B42318";
  return (
    <div className="min-h-screen bg-[#F6F8FA] flex items-center justify-center p-6">
      <div className="max-w-[460px] w-full bg-white rounded-xl border border-[#C3C9D1] p-8 text-center shadow-sm">
        <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4" style={{ backgroundColor: bg }}>
          <AlertTriangle size={24} style={{ color: fg }} />
        </div>
        <h1 className="text-[20px] font-semibold text-[#232830] mb-2">{title}</h1>
        <div className="text-[14px] text-[#5A6472] mb-6 leading-relaxed">{children}</div>
        <div className="flex flex-col gap-2">{actions}</div>
      </div>
    </div>
  );
}

function BackToServiceQ() {
  return (
    <a href={SERVICEQ_RETURN_URL}
      className="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-lg font-semibold text-[15px] transition-all"
      style={{ backgroundColor: "#00C8C1", color: "#232830" }}>
      <ArrowLeft size={16} /> Zurück zu ServiceQ
    </a>
  );
}

/** Session abgelaufen (§7.6). */
export function SessionExpiredPage() {
  return (
    <SsoLayout tone="warn" title="Ihre Sitzung ist abgelaufen" actions={<BackToServiceQ />}>
      Ihre GITacademy-Sitzung wurde aus Sicherheitsgründen beendet. Öffnen Sie die GITacademy erneut über ServiceQ.
    </SsoLayout>
  );
}

/** Launch-Problem: ungültiges/abgelaufenes Ticket oder fehlende Berechtigung (§9.2). */
export function SsoErrorPage() {
  const params = new URLSearchParams(window.location.search);
  const reason = params.get("reason");
  const ref = params.get("ref");

  if (reason === "denied") {
    return (
      <SsoLayout tone="error" title="Kein Zugriff auf die GITacademy" actions={<BackToServiceQ />}>
        Für Ihr Benutzerkonto ist derzeit kein Zugriff auf diese Schulung freigegeben.
        Wenden Sie sich bei Fragen an Ihren zuständigen Ansprechpartner.
      </SsoLayout>
    );
  }
  if (reason === "error") {
    return (
      <SsoLayout tone="error" title="GITacademy derzeit nicht erreichbar" actions={<BackToServiceQ />}>
        Die Schulungsplattform konnte nicht geöffnet werden. Bitte versuchen Sie es erneut.
        {ref && <><br /><span className="text-[12px] text-[#8A93A0]">Referenz: {ref}</span></>}
      </SsoLayout>
    );
  }
  // Default: ungültiges/abgelaufenes Ticket
  return (
    <SsoLayout tone="error" title="Der Zugang konnte nicht geöffnet werden"
      actions={<><BackToServiceQ />
        <a href={SERVICEQ_RETURN_URL} className="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-lg border border-[#C3C9D1] text-[14px] font-medium text-[#3A424E] hover:bg-[#EEF1F4] transition-colors">
          <RefreshCw size={15} /> GITacademy erneut öffnen
        </a></>}>
      Der Zugangslink ist ungültig oder abgelaufen. Bitte öffnen Sie die GITacademy erneut über ServiceQ.
    </SsoLayout>
  );
}
