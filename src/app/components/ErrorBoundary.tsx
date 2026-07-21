import { Component, type ReactNode } from "react";
import { AlertCircle, RefreshCw } from "lucide-react";

// ─── Fehlerzustand nach Briefing §9: verständlich, mit Retry ─────────────────

export class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="min-h-screen bg-[#F6F8FA] flex items-center justify-center p-6">
        <div className="max-w-[440px] w-full bg-white rounded-xl border border-[#C3C9D1] p-8 text-center shadow-sm">
          <div className="w-12 h-12 rounded-full bg-[#FDEEEC] flex items-center justify-center mx-auto mb-4">
            <AlertCircle size={24} style={{ color: "#B42318" }} />
          </div>
          <h1 className="text-[20px] font-semibold text-[#232830] mb-2">Etwas ist schiefgelaufen</h1>
          <p className="text-[14px] text-[#5A6472] mb-6">
            Die Seite konnte nicht geladen werden. Bitte laden Sie die Anwendung neu —
            Ihr Lernfortschritt bleibt erhalten.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg font-semibold text-[15px] transition-all"
            style={{ backgroundColor: "#00C8C1", color: "#232830" }}
            onMouseEnter={e => (e.currentTarget.style.backgroundColor = "#00B3AC")}
            onMouseLeave={e => (e.currentTarget.style.backgroundColor = "#00C8C1")}
          >
            <RefreshCw size={16} /> Neu laden
          </button>
        </div>
      </div>
    );
  }
}
