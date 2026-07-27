import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Mail, RefreshCw, Send } from "lucide-react";
import { toast } from "sonner";
import { fetchNotifyStatus, runNotifyWorker, type NotifyStatus } from "../data/notifyApi";

// ─── Verwaltung: Benachrichtigungen (R-09) ───────────────────────────────────
//
// Die Seite zeigt genau drei Zahlen, weil mehr niemand braucht: Was wartet, was
// ist raus, was ist endgültig gescheitert. Die dritte ist die wichtige – eine
// aufgegebene Nachricht ist ein Vorgang, den jemand ansehen muss, und sie
// verschwindet nicht von selbst.
//
// Ein Hinweis auf fehlenden Postausgang steht bewusst getrennt: Eine stehende
// Warteschlange sähe sonst nach einem Fehler aus, obwohl schlicht kein
// Mailserver eingetragen ist.

const FOCUS =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#00C8C1]";

function Kennzahl({ label, wert, ton }: { label: string; wert: number; ton?: "warn" | "gut" }) {
  const farbe = ton === "warn" && wert > 0 ? "text-[#B42318]"
    : ton === "gut" ? "text-[#007D78]" : "text-[#232830]";
  return (
    <div className="flex-1 min-w-[110px] rounded-lg border border-[#E1E5EA] px-4 py-3">
      <div className={`text-[22px] font-semibold ${farbe}`}>{wert}</div>
      <div className="text-[12px] text-[#5A6472] mt-0.5">{label}</div>
    </div>
  );
}

export function NotificationQueuePanel() {
  const [status, setStatus] = useState<NotifyStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setStatus(await fetchNotifyStatus());
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const run = async () => {
    setRunning(true);
    const result = await runNotifyWorker();
    setRunning(false);
    if (!result.ok) toast.error(result.message);
    else if (result.failed) toast.warning(result.message, { duration: 8000 });
    else toast.success(result.message);
    await load();
  };

  return (
    <div className="bg-white rounded-xl border border-[#C3C9D1] overflow-hidden shadow-sm">
      <div className="px-6 py-4 border-b border-[#EEF1F4]">
        <h2 className="text-[15px] font-semibold text-[#232830]">E-Mail-Benachrichtigungen</h2>
        <p className="text-[13px] text-[#5A6472] mt-0.5">
          Veröffentlichte Trainings werden den zugewiesenen Personen gemeldet.
          Der Versand läuft über eine Warteschlange, damit ein nicht erreichbarer
          Mailserver keine Veröffentlichung aufhält.
        </p>
      </div>

      {loading && <p className="px-6 py-6 text-[13px] text-[#5A6472]">Wird geladen …</p>}

      {!loading && !status && (
        <div className="flex items-start gap-2.5 px-6 py-4 bg-[#FDF3E4]">
          <AlertTriangle size={16} className="text-[#B45309] shrink-0 mt-0.5" aria-hidden />
          <p className="text-[13px] text-[#B45309]">
            Die Kennzahlen sind nicht abrufbar. Das ist nicht dasselbe wie „nichts
            in der Warteschlange" – bitte die Verbindung prüfen.
          </p>
        </div>
      )}

      {!loading && status && (
        <>
          {!status.smtpConfigured && (
            <div className="flex items-start gap-2.5 px-6 py-4 bg-[#FDF3E4] border-b border-[#F5E3C6]">
              <AlertTriangle size={16} className="text-[#B45309] shrink-0 mt-0.5" aria-hidden />
              <p className="text-[13px] text-[#B45309] leading-snug">
                <strong className="block">Kein Postausgang eingerichtet</strong>
                Es fehlen die Variablen <code>SMTP_HOST</code> und <code>SMTP_FROM</code>.
                Nachrichten sammeln sich in der Warteschlange und gehen nicht
                verloren – versendet werden sie erst, wenn der Postausgang
                eingetragen ist. Das sind dieselben Werte wie unter „E-Mail (SMTP)";
                Keycloak gibt ein gespeichertes Passwort nicht wieder heraus,
                deshalb braucht der Worker eine eigene Angabe.
              </p>
            </div>
          )}

          <div className="px-6 py-5">
            <div className="flex flex-wrap gap-3 mb-4">
              <Kennzahl label="wartet" wert={status.pending} />
              <Kennzahl label="versendet" wert={status.sent} ton="gut" />
              <Kennzahl label="aufgegeben" wert={status.dead} ton="warn" />
            </div>

            {status.dead > 0 && (
              <p className="text-[12px] text-[#B42318] mb-3">
                {status.dead} Nachricht(en) wurden nach mehreren Versuchen aufgegeben.
                Sie werden nicht mehr automatisch wiederholt – üblicherweise steckt
                eine ungültige Adresse dahinter.
              </p>
            )}

            {status.oldestPending && status.pending > 0 && (
              <p className="text-[12px] text-[#5A6472] mb-3">
                Älteste wartende Nachricht: {new Date(status.oldestPending).toLocaleString("de-AT")}
              </p>
            )}

            <div className="flex items-center gap-2">
              <button type="button" onClick={() => void run()} disabled={running || !status.smtpConfigured}
                title={!status.smtpConfigured ? "Ohne Postausgang gibt es nichts zu versenden." : undefined}
                className={`inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-[#00C8C1] text-[#232830] text-[13px] font-semibold hover:bg-[#00B3AD] disabled:opacity-50 transition-colors ${FOCUS}`}>
                <Send size={14} className={running ? "animate-pulse" : ""} aria-hidden />
                {running ? "Wird versendet …" : "Jetzt versenden"}
              </button>
              <button type="button" onClick={() => void load()} disabled={loading}
                className={`inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-[#8A93A0] text-[#3A424E] text-[13px] font-semibold hover:bg-[#F6F8FA] disabled:opacity-50 ${FOCUS}`}>
                <RefreshCw size={14} aria-hidden /> Aktualisieren
              </button>
            </div>

            <div className="mt-5 pt-4 border-t border-[#EEF1F4] flex items-start gap-2.5">
              {status.pending === 0 && status.dead === 0
                ? <CheckCircle2 size={15} className="text-[#007D78] shrink-0 mt-0.5" aria-hidden />
                : <Mail size={15} className="text-[#5A6472] shrink-0 mt-0.5" aria-hidden />}
              <p className="text-[12px] text-[#5A6472] leading-snug">
                Für den unbeaufsichtigten Betrieb ruft eine Zeitsteuerung{" "}
                <code>POST /api/notify</code> mit dem Kopf <code>X-Notify-Secret</code> auf.
                Ohne sie bleibt der Versand von dieser Schaltfläche abhängig –
                siehe <code>docs/benachrichtigungen.md</code>.
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
