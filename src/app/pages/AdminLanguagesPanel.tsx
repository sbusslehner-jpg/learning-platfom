import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Check, Globe, Pencil, Plus, ToggleLeft, ToggleRight, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  createLanguage, deleteLanguage, fetchAllLanguages, fetchLanguageUsage,
  isValidLanguageCode, renameLanguage, setLanguageActive,
  type LanguageRow, type LanguageUsage,
} from "../data/api";

// ─── Verwaltung: Sprachstamm (R-08) ──────────────────────────────────────────
//
// Bisher ließen sich Märkten nur vorhandene Sprachen zuordnen; den Stamm selbst
// konnte niemand pflegen. Eine neue Sprache hieß SQL-Konsole.
//
// Die wichtigere Hälfte ist das Abschalten. Löschen geht fast nie – sobald eine
// Sprache einmal übersetzt wurde, hängen Übersetzungen, Marktzuordnungen,
// Sprachvarianten von Dateien und Oberflächensprachen daran, und die
// Fremdschlüssel verhindern das Löschen zu Recht. Eine deaktivierte Sprache
// wird nicht mehr angeboten und nicht mehr übersetzt, alles Vorhandene bleibt.
//
// Vor jeder Entscheidung zeigt die Oberfläche, was daran hängt. „Sprache
// löschen?" ohne Zahlen ist keine Frage, die jemand beantworten kann.

const FOCUS =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#00C8C1]";
const INPUT =
  "w-full h-10 px-3 rounded-lg border border-[#8A93A0] text-[14px] text-[#232830] " +
  "placeholder:text-[#8A93A0] outline-none focus:border-[#009D97] focus:ring-2 " +
  `focus:ring-[#009D97]/20 transition-all ${FOCUS}`;

function usageText(u: LanguageUsage): string {
  const teile: string[] = [];
  if (u.maerkte) teile.push(`${u.maerkte} Markt/Märkte${u.alsStandard ? ` (davon ${u.alsStandard}× als Standard)` : ""}`);
  if (u.trainings) teile.push(`${u.trainings} Training(s) als Mastersprache`);
  if (u.uebersetzungen) teile.push(`${u.uebersetzungen} Übersetzung(en)`);
  if (u.dateien) teile.push(`${u.dateien} Datei(en)`);
  if (u.benutzer) teile.push(`${u.benutzer} Benutzer als Oberflächensprache`);
  return teile.length ? teile.join(", ") : "nirgends verwendet";
}

export function AdminLanguagesPanel({ readOnly }: { readOnly: boolean }) {
  const [rows, setRows] = useState<LanguageRow[]>([]);
  const [usage, setUsage] = useState<Record<string, LanguageUsage>>({});
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);

  const [creating, setCreating] = useState(false);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const list = await fetchAllLanguages();
    // `null` heißt „Abfrage fehlgeschlagen" und ist etwas anderes als „keine
    // Sprachen". Eine leere Liste würde behaupten, alles sei in Ordnung.
    if (list === null) { setUnavailable(true); setRows([]); setLoading(false); return; }
    setUnavailable(false);
    setRows(list);
    setLoading(false);

    // Die Verwendungszahlen kommen nach: Sie brauchen je Sprache eine eigene
    // Abfrage, sollen aber die Liste nicht aufhalten.
    const paare = await Promise.all(
      list.map(async l => [l.code, await fetchLanguageUsage(l.code)] as const));
    const map: Record<string, LanguageUsage> = {};
    for (const [c, u] of paare) if (u) map[c] = u;
    setUsage(map);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const add = async () => {
    setBusy(true);
    const result = await createLanguage(code, name);
    setBusy(false);
    if (!result.ok) { toast.error(result.message ?? "Anlegen fehlgeschlagen."); return; }
    toast.success(`Sprache „${name.trim()}" angelegt.`);
    setCreating(false); setCode(""); setName("");
    void load();
  };

  const saveName = async (c: string) => {
    if (!editName.trim()) { toast.error("Der Name darf nicht leer sein."); return; }
    setBusy(true);
    const ok = await renameLanguage(c, editName);
    setBusy(false);
    if (!ok) { toast.error("Umbenennen fehlgeschlagen."); return; }
    toast.success("Name geändert.");
    setEditing(null);
    void load();
  };

  const toggle = async (l: LanguageRow) => {
    const u = usage[l.code];
    if (l.active && u && (u.uebersetzungen || u.maerkte)) {
      const confirmed = window.confirm(
        `Sprache „${l.name}" deaktivieren?\n\n` +
        `Verwendung: ${usageText(u)}.\n\n` +
        `Die Sprache wird nicht mehr angeboten und nicht mehr übersetzt. ` +
        `Vorhandene Übersetzungen bleiben erhalten und lesbar.`);
      if (!confirmed) return;
    }
    setBusy(true);
    const result = await setLanguageActive(l.code, !l.active);
    setBusy(false);
    if (!result.ok) {
      // Die Datenbank nennt den Grund – zum Beispiel „ist Standardsprache von
      // 3 Märkten". Den sollte die Oberfläche nicht durch ein allgemeines
      // „fehlgeschlagen" ersetzen.
      toast.error(result.message ?? "Umschalten fehlgeschlagen.", { duration: 7000 });
      return;
    }
    toast.success(l.active ? `„${l.name}" deaktiviert.` : `„${l.name}" aktiviert.`);
    void load();
  };

  const remove = async (l: LanguageRow) => {
    const u = usage[l.code];
    const confirmed = window.confirm(
      `Sprache „${l.name}" (${l.code}) endgültig löschen?\n\n` +
      `Verwendung: ${u ? usageText(u) : "unbekannt"}.\n\n` +
      `Löschen gelingt nur, solange nichts daran hängt. Wenn Übersetzungen ` +
      `vorhanden sind, ist Deaktivieren der richtige Weg.`);
    if (!confirmed) return;
    setBusy(true);
    const result = await deleteLanguage(l.code);
    setBusy(false);
    if (!result.ok) { toast.error(result.message ?? "Löschen fehlgeschlagen.", { duration: 7000 }); return; }
    toast.success(`„${l.name}" gelöscht.`);
    void load();
  };

  if (loading) {
    return <div className="text-[13px] text-[#5A6472] px-1 py-6">Sprachen werden geladen …</div>;
  }

  const codeInvalid = code.trim() !== "" && !isValidLanguageCode(code.trim());

  return (
    <div>
      {unavailable && (
        <div className="mb-4 flex gap-2.5 rounded-lg bg-[#FDF3E4] border border-[#F5E3C6] px-4 py-3">
          <AlertTriangle size={16} className="text-[#B45309] shrink-0 mt-0.5" aria-hidden />
          <p className="text-[12px] text-[#B45309]">
            Die Sprachen konnten nicht geladen werden. Das ist nicht dasselbe wie
            „keine Sprachen vorhanden" – bitte die Datenbankverbindung prüfen.
          </p>
        </div>
      )}

      <div className="flex items-center justify-between gap-3 mb-4">
        <p className="text-[13px] text-[#5A6472]">
          {rows.filter(r => r.active).length} aktiv, {rows.filter(r => !r.active).length} deaktiviert.
          Nur aktive Sprachen werden Märkten angeboten und übersetzt.
        </p>
        <button type="button" onClick={() => setCreating(true)} disabled={readOnly || busy}
          className={`flex items-center gap-1.5 h-9 px-3 rounded-lg bg-[#00C8C1] text-[#232830] text-[13px] font-semibold hover:bg-[#00B3AD] disabled:opacity-50 transition-colors ${FOCUS}`}>
          <Plus size={15} /> Sprache anlegen
        </button>
      </div>

      {creating && (
        <div className="mb-4 rounded-xl border border-[#C3C9D1] bg-white p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="lang-code" className="block text-[13px] font-medium text-[#3A424E] mb-1.5">
                Code (ISO 639-1)
              </label>
              <input id="lang-code" className={INPUT} value={code} placeholder="fr"
                onChange={e => setCode(e.target.value)}
                aria-invalid={codeInvalid} aria-describedby="lang-code-hint" />
              <p id="lang-code-hint" className={`text-[11px] mt-1 ${codeInvalid ? "text-[#B42318]" : "text-[#8A93A0]"}`}>
                {codeInvalid
                  ? "Zwei Kleinbuchstaben, optional mit Region: fr, pt-BR"
                  : "Zwei Kleinbuchstaben, optional mit Region – der Code ist später nicht mehr änderbar."}
              </p>
            </div>
            <div>
              <label htmlFor="lang-name" className="block text-[13px] font-medium text-[#3A424E] mb-1.5">Bezeichnung</label>
              <input id="lang-name" className={INPUT} value={name} placeholder="Französisch"
                onChange={e => setName(e.target.value)} />
            </div>
          </div>
          <div className="flex items-center gap-2 mt-3">
            <button type="button" onClick={() => void add()}
              disabled={busy || codeInvalid || !code.trim() || !name.trim()}
              className={`h-9 px-4 rounded-lg bg-[#00C8C1] text-[#232830] text-[13px] font-semibold hover:bg-[#00B3AD] disabled:opacity-50 ${FOCUS}`}>
              Anlegen
            </button>
            <button type="button" onClick={() => { setCreating(false); setCode(""); setName(""); }}
              className={`h-9 px-4 rounded-lg border border-[#8A93A0] text-[#3A424E] text-[13px] font-semibold hover:bg-[#F6F8FA] ${FOCUS}`}>
              Abbrechen
            </button>
          </div>
        </div>
      )}

      {rows.length === 0 && !unavailable ? (
        <div className="rounded-xl border border-dashed border-[#C3C9D1] px-6 py-10 text-center">
          <Globe size={22} className="mx-auto text-[#8A93A0] mb-2" aria-hidden />
          <p className="text-[14px] text-[#3A424E] font-medium">Noch keine Sprachen</p>
        </div>
      ) : (
        <div className="rounded-xl border border-[#C3C9D1] bg-white overflow-hidden divide-y divide-[#EEF1F4]">
          {rows.map(l => {
            const u = usage[l.code];
            return (
              <div key={l.code} className={`flex items-center gap-3 px-4 py-3 ${l.active ? "" : "bg-[#FAFBFC]"}`}>
                <span className="font-mono text-[12px] text-[#5A6472] w-14 shrink-0">{l.code}</span>

                <div className="flex-1 min-w-0">
                  {editing === l.code ? (
                    <div className="flex items-center gap-2">
                      <input className={INPUT} value={editName} onChange={e => setEditName(e.target.value)}
                        aria-label={`Bezeichnung für ${l.code}`} />
                      <button type="button" onClick={() => void saveName(l.code)} disabled={busy}
                        aria-label="Speichern"
                        className={`p-2 rounded-lg text-[#007D78] hover:bg-[#E6FAF9] ${FOCUS}`}>
                        <Check size={15} />
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className={`text-[14px] font-medium truncate ${l.active ? "text-[#232830]" : "text-[#8A93A0]"}`}>
                        {l.name}
                        {!l.active && <span className="ml-2 text-[11px] font-normal">(deaktiviert)</span>}
                      </div>
                      <div className="text-[11px] text-[#8A93A0] truncate">
                        {u ? usageText(u) : "…"}
                      </div>
                    </>
                  )}
                </div>

                <button type="button" onClick={() => void toggle(l)} disabled={readOnly || busy}
                  aria-label={l.active ? `${l.name} deaktivieren` : `${l.name} aktivieren`}
                  className={`p-2 rounded-lg disabled:opacity-50 ${l.active ? "text-[#007D78] hover:bg-[#E6FAF9]" : "text-[#8A93A0] hover:bg-[#EEF1F4]"} ${FOCUS}`}>
                  {l.active ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
                </button>
                <button type="button" disabled={readOnly || busy}
                  onClick={() => { setEditing(l.code); setEditName(l.name); }}
                  aria-label={`${l.name} umbenennen`}
                  className={`p-2 rounded-lg text-[#5A6472] hover:bg-[#EEF1F4] disabled:opacity-50 ${FOCUS}`}>
                  <Pencil size={15} />
                </button>
                <button type="button" onClick={() => void remove(l)}
                  disabled={readOnly || busy || (u ? usageText(u) !== "nirgends verwendet" : false)}
                  aria-label={`${l.name} löschen`}
                  title={u && usageText(u) !== "nirgends verwendet"
                    ? "Wird verwendet – Deaktivieren ist der richtige Weg."
                    : undefined}
                  className={`p-2 rounded-lg text-[#B42318] hover:bg-[#FDEEEC] disabled:opacity-30 ${FOCUS}`}>
                  <Trash2 size={15} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
