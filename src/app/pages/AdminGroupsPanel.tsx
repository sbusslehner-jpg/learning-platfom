import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Check, Pencil, Plus, Trash2, Users, X } from "lucide-react";
import { toast } from "sonner";
import {
  createGroup, deleteGroup, fetchGroupMembers, fetchGroups, renameGroup, setGroupMembers,
  type AdminUser, type UserGroup,
} from "../data/api";

// ─── Verwaltung: Gruppen (R-02) ───────────────────────────────────────────────
// Gruppen bündeln Personen, damit Trainings nicht einzeln zugewiesen werden
// müssen („alle Serviceberater in Österreich"). Die Zuweisung eines Trainings
// an eine Gruppe passiert in der Redaktion, nicht hier – hier wird nur
// gepflegt, wer zu wem gehört.

const FOCUS =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#00C8C1]";
const INPUT =
  `w-full h-10 px-3 rounded-lg border border-[#8A93A0] text-[14px] text-[#232830] ` +
  `placeholder:text-[#8A93A0] outline-none focus:border-[#009D97] focus:ring-2 ` +
  `focus:ring-[#009D97]/20 transition-all ${FOCUS}`;

export function AdminGroupsPanel({ users, readOnly }: { users: AdminUser[]; readOnly: boolean }) {
  const [groups, setGroups] = useState<UserGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);

  const [editing, setEditing] = useState<UserGroup | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const [memberOf, setMemberOf] = useState<UserGroup | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const rows = await fetchGroups();
    // `null` heißt: Abfrage fehlgeschlagen. Das ist etwas anderes als „keine
    // Gruppen" und wird deshalb auch anders angezeigt – eine leere Liste würde
    // sonst behaupten, es sei alles in Ordnung.
    if (rows === null) { setUnavailable(true); setGroups([]); }
    else { setUnavailable(false); setGroups(rows); }
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const startCreate = () => { setCreating(true); setEditing(null); setName(""); setDescription(""); };
  const startEdit = (g: UserGroup) => { setEditing(g); setCreating(false); setName(g.name); setDescription(g.description ?? ""); };
  const cancel = () => { setCreating(false); setEditing(null); setName(""); setDescription(""); };

  const save = async () => {
    const trimmed = name.trim();
    if (!trimmed) { toast.error("Der Name darf nicht leer sein."); return; }
    setBusy(true);
    const ok = editing
      ? await renameGroup(editing.id, trimmed, description)
      : (await createGroup(trimmed, description)) !== null;
    setBusy(false);
    if (!ok) { toast.error("Speichern fehlgeschlagen."); return; }
    toast.success(editing ? "Gruppe geändert." : "Gruppe angelegt.");
    cancel();
    void load();
  };

  const remove = async (g: UserGroup) => {
    // Bewusst mit Zahl: „Gruppe löschen?" allein verschweigt die Tragweite.
    const confirmed = window.confirm(
      `Gruppe „${g.name}" löschen?\n\n` +
      `${g.memberCount} Mitgliedschaft(en) und alle Trainingszuweisungen dieser ` +
      `Gruppe werden mit entfernt. Die Benutzerkonten selbst bleiben bestehen.`,
    );
    if (!confirmed) return;
    setBusy(true);
    const ok = await deleteGroup(g.id);
    setBusy(false);
    ok ? toast.success("Gruppe gelöscht.") : toast.error("Löschen fehlgeschlagen.");
    void load();
  };

  const openMembers = async (g: UserGroup) => {
    setMemberOf(g);
    const rows = await fetchGroupMembers(g.id);
    setSelected(new Set((rows ?? []).map(m => m.userId)));
  };

  const saveMembers = async () => {
    if (!memberOf) return;
    setBusy(true);
    const ok = await setGroupMembers(memberOf.id, [...selected]);
    setBusy(false);
    if (!ok) { toast.error("Mitglieder konnten nicht gespeichert werden."); return; }
    toast.success(`${selected.size} Mitglied(er) gespeichert.`);
    setMemberOf(null);
    void load();
  };

  const toggle = (id: string) =>
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  if (loading) {
    return <div className="text-[13px] text-[#5A6472] px-1 py-6">Gruppen werden geladen …</div>;
  }

  return (
    <div>
      {unavailable && (
        <div className="mb-4 flex gap-2.5 rounded-lg bg-[#FDF3E4] border border-[#F5E3C6] px-4 py-3">
          <AlertTriangle size={16} className="text-[#B45309] shrink-0 mt-0.5" aria-hidden="true" />
          <p className="text-[12px] text-[#B45309]">
            Die Gruppen konnten nicht geladen werden. Das ist nicht dasselbe wie
            „keine Gruppen vorhanden" – bitte die Datenbankverbindung prüfen,
            bevor hier etwas angelegt wird.
          </p>
        </div>
      )}

      <div className="flex items-center justify-between gap-3 mb-4">
        <p className="text-[13px] text-[#5A6472]">
          {groups.length} Gruppe(n). Trainings werden in der Redaktion zugewiesen.
        </p>
        <button type="button" onClick={startCreate} disabled={readOnly || busy}
          className={`flex items-center gap-1.5 h-9 px-3 rounded-lg bg-[#00C8C1] text-[#232830] text-[13px] font-semibold hover:bg-[#00B3AD] disabled:opacity-50 transition-colors ${FOCUS}`}>
          <Plus size={15} /> Gruppe anlegen
        </button>
      </div>

      {(creating || editing) && (
        <div className="mb-4 rounded-xl border border-[#C3C9D1] bg-white p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="grp-name" className="block text-[13px] font-medium text-[#3A424E] mb-1.5">Name</label>
              <input id="grp-name" className={INPUT} value={name} onChange={e => setName(e.target.value)}
                placeholder="Serviceberater Österreich" />
            </div>
            <div>
              <label htmlFor="grp-desc" className="block text-[13px] font-medium text-[#3A424E] mb-1.5">Beschreibung</label>
              <input id="grp-desc" className={INPUT} value={description} onChange={e => setDescription(e.target.value)}
                placeholder="optional" />
            </div>
          </div>
          <div className="flex items-center gap-2 mt-3">
            <button type="button" onClick={save} disabled={busy}
              className={`h-9 px-4 rounded-lg bg-[#00C8C1] text-[#232830] text-[13px] font-semibold hover:bg-[#00B3AD] disabled:opacity-50 ${FOCUS}`}>
              {editing ? "Änderung speichern" : "Anlegen"}
            </button>
            <button type="button" onClick={cancel}
              className={`h-9 px-4 rounded-lg border border-[#8A93A0] text-[#3A424E] text-[13px] font-semibold hover:bg-[#F6F8FA] ${FOCUS}`}>
              Abbrechen
            </button>
          </div>
        </div>
      )}

      {groups.length === 0 && !unavailable ? (
        <div className="rounded-xl border border-dashed border-[#C3C9D1] px-6 py-10 text-center">
          <Users size={22} className="mx-auto text-[#8A93A0] mb-2" aria-hidden="true" />
          <p className="text-[14px] text-[#3A424E] font-medium">Noch keine Gruppen</p>
          <p className="text-[13px] text-[#5A6472] mt-1">
            Gruppen bündeln Personen, damit ein Training nicht einzeln zugewiesen werden muss.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-[#C3C9D1] bg-white overflow-hidden divide-y divide-[#EEF1F4]">
          {groups.map(g => (
            <div key={g.id} className="flex items-center gap-4 px-4 py-3">
              <div className="flex-1 min-w-0">
                <div className="text-[14px] font-medium text-[#232830] truncate">{g.name}</div>
                <div className="text-[12px] text-[#5A6472] truncate">
                  {g.memberCount} Mitglied(er){g.description ? ` · ${g.description}` : ""}
                </div>
              </div>
              <button type="button" onClick={() => openMembers(g)} disabled={readOnly}
                className={`h-8 px-3 rounded-lg border border-[#8A93A0] text-[12px] font-medium text-[#3A424E] hover:bg-[#F6F8FA] disabled:opacity-50 ${FOCUS}`}>
                Mitglieder
              </button>
              <button type="button" onClick={() => startEdit(g)} disabled={readOnly}
                aria-label={`${g.name} umbenennen`}
                className={`p-2 rounded-lg text-[#5A6472] hover:bg-[#EEF1F4] disabled:opacity-50 ${FOCUS}`}>
                <Pencil size={15} />
              </button>
              <button type="button" onClick={() => remove(g)} disabled={readOnly}
                aria-label={`${g.name} löschen`}
                className={`p-2 rounded-lg text-[#B42318] hover:bg-[#FDEEEC] disabled:opacity-50 ${FOCUS}`}>
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>
      )}

      {memberOf && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
          role="dialog" aria-modal="true" aria-label={`Mitglieder von ${memberOf.name}`}>
          <div className="bg-white rounded-xl w-full max-w-lg max-h-[80vh] flex flex-col shadow-xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#EEF1F4]">
              <div>
                <h2 className="text-[15px] font-semibold text-[#232830]">Mitglieder</h2>
                <p className="text-[12px] text-[#5A6472]">{memberOf.name}</p>
              </div>
              <button type="button" onClick={() => setMemberOf(null)} aria-label="Schließen"
                className={`p-1.5 rounded-lg text-[#5A6472] hover:bg-[#EEF1F4] ${FOCUS}`}>
                <X size={17} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto divide-y divide-[#EEF1F4]">
              {users.length === 0 && (
                <p className="px-5 py-6 text-[13px] text-[#5A6472]">Keine Benutzer vorhanden.</p>
              )}
              {users.map(u => (
                <label key={u.id} className="flex items-center gap-3 px-5 py-2.5 cursor-pointer hover:bg-[#F6F8FA]">
                  <input type="checkbox" className="accent-[#00C8C1]" checked={selected.has(u.id)}
                    onChange={() => toggle(u.id)} />
                  <span className="flex-1 min-w-0">
                    <span className="block text-[13px] text-[#232830] truncate">{u.name}</span>
                    <span className="block text-[11px] text-[#8A93A0] truncate">{u.email ?? "—"}</span>
                  </span>
                  {selected.has(u.id) && <Check size={14} className="text-[#007D78]" aria-hidden="true" />}
                </label>
              ))}
            </div>
            <div className="flex items-center gap-2 px-5 py-4 border-t border-[#EEF1F4]">
              <button type="button" onClick={saveMembers} disabled={busy}
                className={`h-9 px-4 rounded-lg bg-[#00C8C1] text-[#232830] text-[13px] font-semibold hover:bg-[#00B3AD] disabled:opacity-50 ${FOCUS}`}>
                {selected.size} Mitglied(er) speichern
              </button>
              <button type="button" onClick={() => setMemberOf(null)}
                className={`h-9 px-4 rounded-lg border border-[#8A93A0] text-[#3A424E] text-[13px] font-semibold hover:bg-[#F6F8FA] ${FOCUS}`}>
                Abbrechen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
