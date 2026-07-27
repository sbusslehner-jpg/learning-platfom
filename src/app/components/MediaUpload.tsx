import { useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import {
  deleteMedia, fetchMediaPolicy, uploadMedia,
  type MediaPolicy, type MediaRule,
} from "../data/mediaApi";
import type { EditorAsset } from "../data/api";

// ─── Dateiauswahl in der Redaktion (R-03) ────────────────────────────────────
//
// Was hier NICHT passiert: eine eigene Liste erlaubter Dateitypen. Die kommt
// vom Server. Zwei Listen liefen irgendwann auseinander, und dann böte die
// Oberfläche etwas an, das der Server ablehnt – auffallen würde das erst nach
// dem Hochladen eines großen Videos.
//
// Der Fortschrittsbalken misst ausschließlich die Übertragung. Danach folgt
// die serverseitige Prüfung, deren Dauer sich nicht vorhersagen lässt; dafür
// steht ein eigener Zustand statt eines Balkens, der bei 99 % hängt.

const FOCUS =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#00C8C1]";

function humanSize(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return "";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function MediaUpload({ elementId, elementType, asset, onChanged, disabled }: {
  elementId: string;
  elementType: string;
  asset: EditorAsset | null;
  onChanged: (asset: EditorAsset | null) => void;
  disabled?: boolean;
}) {
  const [policy, setPolicy] = useState<MediaPolicy | null>(null);
  const [phase, setPhase] = useState<"idle" | "uploading" | "checking">("idle");
  const [percent, setPercent] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { void fetchMediaPolicy().then(setPolicy); }, []);

  const rule: MediaRule | undefined = policy?.[elementType];
  if (!rule) {
    // Entweder trägt dieser Elementtyp keine Dateien, oder die Regeln sind noch
    // nicht geladen. Beides ist kein Fehler und braucht keine Meldung.
    return null;
  }

  const pick = () => inputRef.current?.click();

  const onFile = async (file: File | undefined) => {
    if (!file) return;

    // Höflichkeitsprüfung vor dem Hochladen. Maßgeblich bleibt der Server –
    // er prüft nach der Ablage, was tatsächlich angekommen ist.
    if (file.size > rule.maxBytes) {
      toast.error(`${rule.label}: höchstens ${rule.maxMb} MB, diese Datei hat ${humanSize(file.size)}.`);
      return;
    }

    setPhase("uploading");
    setPercent(0);
    const result = await uploadMedia(elementId, file, (f) => setPercent(Math.round(f * 100)));
    setPhase(result.ok ? "idle" : "idle");

    if (!result.ok) {
      toast.error(result.message ?? "Der Upload ist fehlgeschlagen.");
      setPercent(0);
      return;
    }
    toast.success(`${rule.label} hinterlegt.`);
    onChanged({
      id: result.assetId!,
      status: "ready",
      mime: file.type,
      originalName: file.name,
      sizeBytes: file.size,
    });
    setPercent(0);
    if (inputRef.current) inputRef.current.value = "";
  };

  const remove = async () => {
    if (!asset) return;
    const confirmed = window.confirm(
      `${rule.label} „${asset.originalName ?? "Datei"}" entfernen?\n\n` +
      `Die Datei wird endgültig gelöscht. Lernende sehen an dieser Stelle danach ` +
      `einen Hinweis, dass noch nichts hinterlegt ist.`);
    if (!confirmed) return;
    const ok = await deleteMedia(asset.id);
    if (!ok) { toast.error("Die Datei konnte nicht entfernt werden."); return; }
    toast.success("Datei entfernt.");
    onChanged(null);
  };

  const busy = phase !== "idle" || disabled;

  return (
    <div className="rounded-lg border border-[#E1E5EA] bg-[#FAFBFC] px-3 py-2.5">
      <input
        ref={inputRef}
        type="file"
        className="sr-only"
        accept={[...rule.mimeTypes, ...rule.extensions].join(",")}
        onChange={e => void onFile(e.target.files?.[0])}
        disabled={busy}
      />

      {phase === "uploading" && (
        <div>
          <div className="flex items-center justify-between text-[11px] text-[#5A6472] mb-1.5">
            <span>Wird übertragen …</span>
            <span>{percent} %</span>
          </div>
          <div className="h-1.5 bg-[#E1E5EA] rounded-full overflow-hidden" role="progressbar"
            aria-label="Upload-Fortschritt" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
            <div className="h-full bg-[#00C8C1] transition-[width] duration-150" style={{ width: `${percent}%` }} />
          </div>
          {percent >= 100 && (
            <p className="text-[11px] text-[#5A6472] mt-1.5">
              Übertragung fertig – die Datei wird geprüft.
            </p>
          )}
        </div>
      )}

      {phase === "idle" && asset && asset.status === "ready" && (
        <div className="flex items-center gap-2.5">
          <CheckCircle2 size={15} className="text-[#007D78] shrink-0" aria-hidden />
          <span className="flex-1 min-w-0">
            <span className="block text-[12px] text-[#232830] truncate">
              {asset.originalName ?? "Datei"}
            </span>
            <span className="block text-[11px] text-[#8A93A0]">
              {asset.mime}{asset.sizeBytes ? ` · ${humanSize(asset.sizeBytes)}` : ""}
            </span>
          </span>
          <button type="button" onClick={pick} disabled={busy}
            className={`h-7 px-2.5 rounded-md border border-[#C3C9D1] text-[11px] font-medium text-[#3A424E] hover:bg-white disabled:opacity-50 ${FOCUS}`}>
            Ersetzen
          </button>
          <button type="button" onClick={() => void remove()} disabled={busy}
            aria-label={`${rule.label} entfernen`}
            className={`p-1.5 rounded-md text-[#B42318] hover:bg-[#FDEEEC] disabled:opacity-50 ${FOCUS}`}>
            <Trash2 size={14} />
          </button>
        </div>
      )}

      {phase === "idle" && asset && asset.status !== "ready" && (
        <div className="flex items-center gap-2.5">
          <AlertTriangle size={15} className="text-[#B45309] shrink-0" aria-hidden />
          <span className="flex-1 text-[11px] text-[#B45309]">
            {asset.status === "rejected"
              ? "Die zuletzt hochgeladene Datei hat die Prüfung nicht bestanden und wurde gelöscht."
              : "Ein Upload wurde begonnen, aber nicht abgeschlossen."}
          </span>
          <button type="button" onClick={pick} disabled={busy}
            className={`h-7 px-2.5 rounded-md bg-[#00C8C1] text-[#232830] text-[11px] font-semibold hover:bg-[#00B3AD] disabled:opacity-50 ${FOCUS}`}>
            Erneut versuchen
          </button>
        </div>
      )}

      {phase === "idle" && !asset && (
        <button type="button" onClick={pick} disabled={busy}
          className={`w-full flex items-center justify-center gap-2 h-9 rounded-md border border-dashed border-[#C3C9D1] text-[12px] font-medium text-[#3A424E] hover:border-[#00C8C1] hover:bg-white transition-colors disabled:opacity-50 ${FOCUS}`}>
          <Upload size={14} aria-hidden />
          {rule.label} auswählen
          <span className="text-[11px] text-[#8A93A0]">
            ({rule.extensions.join(", ")}, max. {rule.maxMb} MB)
          </span>
        </button>
      )}
    </div>
  );
}
