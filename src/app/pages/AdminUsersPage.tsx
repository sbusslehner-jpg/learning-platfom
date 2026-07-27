import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle, Check, Map as MapIcon, MailPlus, Plus, Search, Send, Shield,
  ToggleLeft, ToggleRight, Trash2, Users as UsersIcon, X,
} from "lucide-react";
import { toast } from "sonner";
import { Breadcrumb } from "../components/Breadcrumb";
import { EmptyState } from "../components/EmptyState";
import { useT } from "../i18n";
import { ROLE_LABELS, type Role } from "../data/roles";
import { USERS } from "../data/demo";
import {
  createUser, deleteUser, fetchAdminMarkets, fetchUsers,
  setUserActive, setUserMarkets, setUserRoles,
  type AdminMarket, type AdminUser,
} from "../data/api";
import { INVITE_AVAILABLE, inviteUser, resendInvite } from "../data/inviteApi";
import { AdminGroupsPanel } from "./AdminGroupsPanel";
import { DEMO_MODE } from "../data/runtime";

// ─── Admin: Users ─────────────────────────────────────────────────────────────
// Echte Verwaltung über Supabase (app_user, user_role_assignment, user_market).
// Ohne verbundene Datenbank bleibt die eingebaute Demo-Liste sichtbar – dann
// aber ausdrücklich nur lesend, damit keine Aktion ins Leere läuft.

const FOCUS =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#00C8C1]";

const ALL_ROLES: Role[] = ["admin", "editor", "user"];

const ROLE_BADGE: Record<Role, string> = {
  admin: "bg-[#FDEEEC] text-[#B42318]",
  editor: "bg-[#EBF1FE] text-[#1D5BD6]",
  user: "bg-[#EEF1F4] text-[#5A6472]",
};

const roleLabel = (r: string) => ROLE_LABELS[r as Role] ?? r;
const roleBadge = (r: string) => ROLE_BADGE[r as Role] ?? ROLE_BADGE.user;

// Demo-Rollen aus den alten Klartext-Bezeichnungen ableiten.
const ROLE_FROM_LABEL: Record<string, Role> = { Admin: "admin", Editor: "editor", Anwender: "user" };

const DEMO_USERS: AdminUser[] = USERS.map((u, i) => ({
  id: `demo-${i}`,
  name: u.name,
  email: u.email,
  roles: [ROLE_FROM_LABEL[u.role] ?? "user"],
  markets: u.markets,
  marketIds: [],
  active: true,
  lastActive: u.lastActive,
  externalId: null,
}));

const initials = (name: string) =>
  name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();

/** Zeitstempel aus der Datenbank freundlich anzeigen, Demo-Texte unverändert. */
function formatLastActive(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

type FormState = { name: string; email: string; roles: Role[]; marketIds: string[] };
const EMPTY_FORM: FormState = { name: "", email: "", roles: ["user"], marketIds: [] };

export function AdminUsers() {
  const { t, lang } = useT();

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [demo, setDemo] = useState(false);
  const [markets, setMarkets] = useState<AdminMarket[]>([]);
  // Benutzer und Gruppen gehoeren fachlich zusammen: Eine Gruppe ist eine
  // Menge von Benutzern. Ein eigener Menuepunkt haette beides getrennt, was
  // beim Pflegen staendiges Hin- und Herspringen bedeutet.
  const [tab, setTab] = useState<"users" | "groups">("users");

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | Role>("all");

  // Anlegen-Panel
  const [showPanel, setShowPanel] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<Partial<Record<"name" | "email" | "roles", string>>>({});
  const [submitting, setSubmitting] = useState(false);

  // Zeilen-Editoren
  const [editRolesId, setEditRolesId] = useState<string | null>(null);
  const [roleDraft, setRoleDraft] = useState<Role[]>([]);
  const [editMarketsId, setEditMarketsId] = useState<string | null>(null);
  const [marketDraft, setMarketDraft] = useState<string[]>([]);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async (silent?: boolean) => {
    if (!silent) setLoading(true);
    const rows = await fetchUsers();
    if (rows) {
      setUsers(rows);
      setDemo(false);
    } else {
      setUsers(DEMO_MODE ? DEMO_USERS : []);
      setDemo(DEMO_MODE);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
    void fetchAdminMarkets().then(m => setMarkets(m ?? []));
  }, [load]);

  const closeEditors = () => {
    setEditRolesId(null);
    setEditMarketsId(null);
    setConfirmId(null);
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter(u => {
      const matchesQuery =
        !q ||
        u.name.toLowerCase().includes(q) ||
        (u.email ?? "").toLowerCase().includes(q);
      const matchesRole = roleFilter === "all" || u.roles.includes(roleFilter);
      return matchesQuery && matchesRole;
    });
  }, [users, search, roleFilter]);

  const activeCount = users.filter(u => u.active).length;

  // ─── Mutationen ────────────────────────────────────────────────────────────

  const toggleActive = async (u: AdminUser) => {
    setBusyId(u.id);
    const ok = await setUserActive(u.id, !u.active, u.externalId);
    setBusyId(null);
    if (!ok) { toast.error(t("common.dbRequired")); return; }
    toast.success(u.active ? "Benutzer deaktiviert" : "Benutzer aktiviert");
    await load(true);
  };

  const saveRoles = async (userId: string) => {
    if (!roleDraft.length) { toast.error("Mindestens eine Rolle auswählen"); return; }
    setBusyId(userId);
    const user = users.find(u => u.id === userId);
    const ok = await setUserRoles(userId, roleDraft, user?.externalId);
    setBusyId(null);
    if (!ok) { toast.error(t("common.dbRequired")); return; }
    toast.success("Rollen gespeichert");
    setEditRolesId(null);
    await load(true);
  };

  const saveMarkets = async (userId: string) => {
    setBusyId(userId);
    const user = users.find(u => u.id === userId);
    const marketCodes = markets.filter(m => marketDraft.includes(m.id)).map(m => m.code);
    const ok = await setUserMarkets(userId, marketDraft, marketCodes, user?.externalId);
    setBusyId(null);
    if (!ok) { toast.error(t("common.dbRequired")); return; }
    toast.success("Märkte gespeichert");
    setEditMarketsId(null);
    await load(true);
  };

  const removeUser = async (userId: string) => {
    setBusyId(userId);
    const user = users.find(u => u.id === userId);
    const ok = await deleteUser(userId, user?.externalId);
    setBusyId(null);
    setConfirmId(null);
    if (!ok) { toast.error(t("common.dbRequired")); return; }
    toast.success("Benutzer gelöscht");
    await load(true);
  };

  const submitForm = async () => {
    const next: typeof errors = {};
    if (!form.name.trim()) next.name = "Name ist erforderlich";
    if (!form.email.trim()) next.email = "E-Mail-Adresse ist erforderlich";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(form.email.trim()))
      next.email = "Bitte eine gültige E-Mail-Adresse eingeben";
    if (!form.roles.length) next.roles = "Mindestens eine Rolle auswählen";
    setErrors(next);
    if (Object.keys(next).length) return;

    setSubmitting(true);

    // Mit Keycloak-Anbindung: Konto serverseitig anlegen und Einladung versenden.
    // Der Benutzer setzt sein Passwort selbst über den Link – es wird nie eines
    // per E-Mail verschickt. Ohne Anbindung bleibt das direkte Anlegen (Demo).
    const res = INVITE_AVAILABLE
      ? await (async () => {
          const full = form.name.trim();
          const cut = full.lastIndexOf(" ");
          const r = await inviteUser({
            firstName: cut > 0 ? full.slice(0, cut) : full,
            lastName: cut > 0 ? full.slice(cut + 1) : "",
            email: form.email.trim(),
            roles: form.roles,
            markets: form.marketIds.map(marketCode),
            locale: lang,
          });
          if (!r.ok && r.fieldErrors?.length) {
            setErrors({ email: r.fieldErrors.join(" · ") });
          }
          return r;
        })()
      : await createUser({
          name: form.name.trim(),
          email: form.email.trim(),
          roles: form.roles,
          marketIds: form.marketIds,
          uiLanguage: lang,
        });

    setSubmitting(false);
    if (!res.ok) { toast.error(res.message ?? t("common.saveError")); return; }
    toast.success(INVITE_AVAILABLE ? (res as { message: string }).message : "Benutzer angelegt");
    setShowPanel(false);
    setForm(EMPTY_FORM);
    setErrors({});
    await load(true);
  };

  /** Einladung erneut versenden (z. B. wenn der Link abgelaufen ist). */
  const handleResend = async (email: string | null) => {
    if (!email) { toast.error("Für diesen Benutzer ist keine E-Mail-Adresse hinterlegt."); return; }
    setBusyId(email);
    const r = await resendInvite(email);
    setBusyId(null);
    r.ok ? toast.success(r.message) : toast.error(r.message);
  };

  const marketCode = (id: string) => markets.find(m => m.id === id)?.code ?? id;

  return (
    <div className="flex-1 overflow-y-auto p-6 lg:p-8">
      <Breadcrumb items={[t("nav.admin"), t("nav.users")]} />

      <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
        <div>
          <h1 className="text-[26px] font-semibold text-[#232830]">{t("nav.users")}</h1>
          <p className="text-[14px] text-[#5A6472] mt-1">
            {loading ? t("common.loading") : `${users.length} Benutzer · ${activeCount} aktiv`}
          </p>
        </div>
        {tab === "users" && (
          <button
            onClick={() => { setForm(EMPTY_FORM); setErrors({}); setShowPanel(true); }}
            disabled={demo}
            title={demo ? t("common.dbRequired") : undefined}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg font-semibold text-[14px] transition-all ${FOCUS} ${demo ? "opacity-50 cursor-not-allowed" : ""}`}
            style={{ backgroundColor: "#00C8C1", color: "#232830" }}>
            {INVITE_AVAILABLE ? <><MailPlus size={16} /> Benutzer einladen</> : <><Plus size={16} /> Benutzer anlegen</>}
          </button>
        )}
      </div>

      {/* Reiter: Benutzer und Gruppen */}
      <div className="flex items-center gap-1 border-b border-[#E1E5EA] mb-5" role="tablist">
        {([["users", "Benutzer"], ["groups", "Gruppen"]] as const).map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
            className={`px-3 py-2.5 text-[13px] font-medium border-b-2 -mb-px transition-all ${FOCUS} ${
              tab === id ? "border-[#00C8C1] text-[#007D78]" : "border-transparent text-[#5A6472] hover:text-[#3A424E]"
            }`}>
            {label}
          </button>
        ))}
      </div>

      {tab === "groups" && <AdminGroupsPanel users={users} readOnly={demo} />}
      {tab === "users" && (<>

      {demo && !loading && (
        <div className="mb-4 rounded-lg bg-[#FDF3E4] text-[#B45309] text-[12px] px-4 py-2 border border-[#F5E3C6]">
          Demo-Ansicht – mit verbundener Datenbank wird hier echt verwaltet.
        </div>
      )}

      {/* Suche + Rollenfilter */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative w-full max-w-sm">
          <label htmlFor="user-search" className="sr-only">{t("common.search")}</label>
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8A93A0] pointer-events-none" />
          <input id="user-search" type="search" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Name oder E-Mail …"
            className={`w-full h-9 pl-9 pr-3 bg-white border border-[#C3C9D1] rounded-lg text-[14px] text-[#232830] placeholder:text-[#8A93A0] outline-none focus:border-[#009D97] focus:ring-2 focus:ring-[#009D97]/20 transition-all ${FOCUS}`} />
        </div>
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={t("common.role")}>
          {([["all", t("common.all")], ...ALL_ROLES.map(r => [r, ROLE_LABELS[r]] as const)] as [string, string][])
            .map(([value, label]) => {
              const active = roleFilter === value;
              return (
                <button key={value} onClick={() => setRoleFilter(value as "all" | Role)} aria-pressed={active}
                  className={`px-3 py-1.5 rounded-lg border text-[13px] font-medium transition-colors ${FOCUS} ${
                    active
                      ? "border-[#00C8C1] bg-[#E6FAF9] text-[#007D78]"
                      : "border-[#C3C9D1] bg-white text-[#3A424E] hover:bg-[#EEF1F4]"
                  }`}>
                  {label}
                </button>
              );
            })}
        </div>
      </div>

      {/* Tabelle */}
      <div className="bg-white rounded-lg border border-[#C3C9D1] overflow-hidden">
        {loading ? (
          <div className="p-6 space-y-3" aria-busy="true">
            <p className="text-[13px] text-[#5A6472]">{t("common.loading")}</p>
            {[0, 1, 2, 3].map(i => (
              <div key={i} className="h-10 rounded-lg bg-[#EEF1F4] animate-pulse" />
            ))}
          </div>
        ) : users.length === 0 ? (
          <EmptyState
            icon={UsersIcon}
            title="Noch keine Benutzer"
            body="Legen Sie den ersten Benutzer an, um Rollen und Märkte zuzuordnen."
            action="Benutzer anlegen"
            onAction={() => { setForm(EMPTY_FORM); setErrors({}); setShowPanel(true); }}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[14px] min-w-[900px]">
              <thead>
                <tr className="border-b border-[#E1E5EA] bg-[#F6F8FA]">
                  {["Name", "E-Mail", "Rolle", "Märkte", "Status", "Zuletzt aktiv"].map(h => (
                    <th key={h} scope="col" className="text-left px-4 py-3 text-[12px] font-semibold text-[#5A6472] uppercase tracking-wide">{h}</th>
                  ))}
                  <th scope="col" className="text-right px-4 py-3 text-[12px] font-semibold text-[#5A6472] uppercase tracking-wide">Aktionen</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EEF1F4]">
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-[14px] text-[#5A6472]">{t("common.noResults")}</td>
                  </tr>
                )}
                {filtered.map(u => (
                  <Fragment key={u.id}>
                    <tr className="hover:bg-[#F6F8FA] transition-colors">
                      <td className="px-4 py-3 font-medium text-[#232830]">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-[#2E3540] flex items-center justify-center text-white text-[11px] font-bold shrink-0">
                            {initials(u.name)}
                          </div>
                          {u.name}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-[#5A6472]">{u.email ?? "—"}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {u.roles.length === 0 && <span className="text-[12px] text-[#8A93A0]">—</span>}
                          {u.roles.map(r => (
                            <span key={r} className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${roleBadge(r)}`}>
                              {roleLabel(r)}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {u.markets.length === 0 && <span className="text-[12px] text-[#8A93A0]">—</span>}
                          {u.markets.slice(0, 3).map(m => (
                            <span key={m} className="text-[11px] font-semibold px-1.5 py-0.5 rounded bg-[#EEF1F4] text-[#5A6472]">{m}</span>
                          ))}
                          {u.markets.length > 3 && <span className="text-[11px] text-[#8A93A0]">+{u.markets.length - 3}</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
                          style={u.active
                            ? { backgroundColor: "#EAF8F0", color: "#15803D" }
                            : { backgroundColor: "#EEF1F4", color: "#5A6472" }}>
                          {u.active ? "Aktiv" : "Inaktiv"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-[#5A6472] whitespace-nowrap">{formatLastActive(u.lastActive)}</td>
                      <td className="px-4 py-3">
                        {demo ? (
                          <span className="block text-right text-[13px] text-[#8A93A0]" title={t("common.dbRequired")}>
                            <span aria-hidden="true">—</span>
                            <span className="sr-only">{t("common.dbRequired")}</span>
                          </span>
                        ) : confirmId === u.id ? (
                          <div className="flex items-center justify-end gap-1.5">
                            <button onClick={() => removeUser(u.id)} disabled={busyId === u.id}
                              className={`px-2.5 py-1 rounded-lg text-[12px] font-semibold text-white transition-colors ${FOCUS} disabled:opacity-60`}
                              style={{ backgroundColor: "#B42318" }}>
                              Wirklich löschen?
                            </button>
                            <button onClick={() => setConfirmId(null)} aria-label={t("common.cancel")}
                              className={`p-1.5 rounded text-[#5A6472] hover:bg-[#EEF1F4] transition-colors ${FOCUS}`}>
                              <X size={15} />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-end gap-0.5">
                            <button onClick={() => toggleActive(u)} disabled={busyId === u.id}
                              aria-label={u.active ? `${u.name} deaktivieren` : `${u.name} aktivieren`}
                              title={u.active ? "Deaktivieren" : "Aktivieren"}
                              className={`p-1.5 rounded text-[#8A93A0] hover:text-[#007D78] hover:bg-[#E6FAF9] transition-colors ${FOCUS} disabled:opacity-50`}>
                              {u.active ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
                            </button>
                            <button
                              onClick={() => {
                                closeEditors();
                                setRoleDraft(u.roles.filter((r): r is Role => ALL_ROLES.includes(r as Role)));
                                setEditRolesId(u.id);
                              }}
                              aria-label={`Rollen von ${u.name} bearbeiten`} title="Rollen bearbeiten"
                              className={`p-1.5 rounded text-[#8A93A0] hover:text-[#007D78] hover:bg-[#E6FAF9] transition-colors ${FOCUS}`}>
                              <Shield size={15} />
                            </button>
                            <button
                              onClick={() => {
                                closeEditors();
                                setMarketDraft(u.marketIds);
                                setEditMarketsId(u.id);
                              }}
                              aria-label={`Märkte von ${u.name} bearbeiten`} title="Märkte bearbeiten"
                              className={`p-1.5 rounded text-[#8A93A0] hover:text-[#007D78] hover:bg-[#E6FAF9] transition-colors ${FOCUS}`}>
                              <MapIcon size={15} />
                            </button>
                            {INVITE_AVAILABLE && (
                              <button onClick={() => void handleResend(u.email)} disabled={busyId === u.email}
                                aria-label={`Einladung an ${u.name} erneut senden`} title="Einladung erneut senden"
                                className={`p-1.5 rounded text-[#8A93A0] hover:text-[#007D78] hover:bg-[#E6FAF9] transition-colors ${FOCUS} disabled:opacity-50`}>
                                <Send size={15} />
                              </button>
                            )}
                            <button onClick={() => { closeEditors(); setConfirmId(u.id); }}
                              aria-label={`${u.name} löschen`} title={t("common.delete")}
                              className={`p-1.5 rounded text-[#8A93A0] hover:text-[#B42318] hover:bg-[#FDEEEC] transition-colors ${FOCUS}`}>
                              <Trash2 size={15} />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>

                    {editRolesId === u.id && (
                      <tr className="bg-[#F6F8FA]">
                        <td colSpan={7} className="px-4 py-4">
                          <fieldset>
                            <legend className="text-[13px] font-semibold text-[#232830] mb-2">Rollen von {u.name}</legend>
                            <div className="flex flex-wrap gap-4 mb-3">
                              {ALL_ROLES.map(r => (
                                <label key={r} className="flex items-center gap-2 text-[13px] text-[#3A424E]">
                                  <input type="checkbox" checked={roleDraft.includes(r)}
                                    onChange={e => setRoleDraft(prev => e.target.checked ? [...prev, r] : prev.filter(x => x !== r))}
                                    className={`w-4 h-4 accent-[#00C8C1] ${FOCUS}`} />
                                  {ROLE_LABELS[r]}
                                </label>
                              ))}
                            </div>
                            <div className="flex items-center gap-2">
                              <button onClick={() => saveRoles(u.id)} disabled={busyId === u.id}
                                className={`px-3 py-1.5 rounded-lg text-[13px] font-semibold transition-all ${FOCUS} disabled:opacity-60`}
                                style={{ backgroundColor: "#00C8C1", color: "#232830" }}>
                                {busyId === u.id ? t("common.saving") : t("common.save")}
                              </button>
                              <button onClick={() => setEditRolesId(null)}
                                className={`px-3 py-1.5 rounded-lg border border-[#C3C9D1] text-[13px] font-medium text-[#3A424E] hover:bg-[#EEF1F4] transition-colors ${FOCUS}`}>
                                {t("common.cancel")}
                              </button>
                            </div>
                          </fieldset>
                        </td>
                      </tr>
                    )}

                    {editMarketsId === u.id && (
                      <tr className="bg-[#F6F8FA]">
                        <td colSpan={7} className="px-4 py-4">
                          <fieldset>
                            <legend className="text-[13px] font-semibold text-[#232830] mb-2">Märkte von {u.name}</legend>
                            {markets.length === 0 ? (
                              <p className="text-[13px] text-[#5A6472] mb-3">{t("common.dbRequired")}</p>
                            ) : (
                              <div className="flex flex-wrap gap-1.5 mb-3">
                                {markets.map(m => {
                                  const on = marketDraft.includes(m.id);
                                  return (
                                    <button key={m.id} onClick={() => setMarketDraft(prev => on ? prev.filter(x => x !== m.id) : [...prev, m.id])}
                                      aria-pressed={on}
                                      className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[12px] font-semibold border transition-colors ${FOCUS} ${
                                        on
                                          ? "bg-[#E6FAF9] text-[#007D78] border-[#00C8C1]"
                                          : "bg-white text-[#5A6472] border-[#C3C9D1] hover:bg-[#EEF1F4]"
                                      }`}>
                                      {on && <Check size={11} />}{m.code}
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                            <div className="flex items-center gap-2">
                              <button onClick={() => saveMarkets(u.id)} disabled={busyId === u.id}
                                className={`px-3 py-1.5 rounded-lg text-[13px] font-semibold transition-all ${FOCUS} disabled:opacity-60`}
                                style={{ backgroundColor: "#00C8C1", color: "#232830" }}>
                                {busyId === u.id ? t("common.saving") : t("common.save")}
                              </button>
                              <button onClick={() => setEditMarketsId(null)}
                                className={`px-3 py-1.5 rounded-lg border border-[#C3C9D1] text-[13px] font-medium text-[#3A424E] hover:bg-[#EEF1F4] transition-colors ${FOCUS}`}>
                                {t("common.cancel")}
                              </button>
                            </div>
                          </fieldset>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Anlegen-Panel */}
      {showPanel && (
        <div className="fixed inset-0 z-40 flex">
          <div className="flex-1 bg-black/30" onClick={() => setShowPanel(false)} />
          <div role="dialog" aria-modal="true" aria-labelledby="create-user-title"
            className="w-full max-w-[480px] bg-white shadow-2xl flex flex-col h-full">
            <div className="px-6 py-4 border-b border-[#E1E5EA] flex items-center justify-between">
              <h2 id="create-user-title" className="text-[17px] font-semibold text-[#232830]">
                {INVITE_AVAILABLE ? "Benutzer einladen" : "Neuen Benutzer anlegen"}
              </h2>
              <button onClick={() => setShowPanel(false)} aria-label={t("common.close")}
                className={`p-1.5 rounded-lg text-[#5A6472] hover:bg-[#EEF1F4] ${FOCUS}`}>
                <X size={18} />
              </button>
            </div>

            <form className="flex-1 overflow-y-auto p-6 space-y-4"
              onSubmit={e => { e.preventDefault(); void submitForm(); }}>

              {/* Ablauf transparent machen: der Admin verschickt kein Passwort. */}
              {INVITE_AVAILABLE && (
                <div className="flex items-start gap-2 bg-[#EBF1FE] text-[#1D5BD6] rounded-lg px-3 py-2.5 text-[12px] leading-snug">
                  <MailPlus size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
                  <span>
                    Der Benutzer erhält eine E-Mail mit einem Einladungslink und setzt sein
                    Passwort selbst. Es wird <strong>kein Passwort versendet</strong>.
                    Der Link ist 3 Tage gültig und kann danach erneut gesendet werden.
                  </span>
                </div>
              )}

              <div>
                <label htmlFor="new-user-name" className="block text-[13px] font-medium text-[#3A424E] mb-1.5">
                  Vollständiger Name <span aria-hidden="true">*</span>
                </label>
                <input id="new-user-name" value={form.name} required
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  aria-invalid={!!errors.name} aria-describedby={errors.name ? "err-name" : undefined}
                  placeholder="Maria Schmidt"
                  className={`w-full h-10 px-3 rounded-lg border text-[14px] text-[#232830] placeholder:text-[#8A93A0] outline-none focus:ring-2 focus:ring-[#009D97]/20 transition-all ${FOCUS} ${errors.name ? "border-[#B42318]" : "border-[#8A93A0] focus:border-[#009D97]"}`} />
                {errors.name && (
                  <p id="err-name" className="mt-1 flex items-center gap-1 text-[12px] font-medium text-[#B42318]">
                    <AlertCircle size={12} aria-hidden="true" /> Fehler: {errors.name}
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="new-user-email" className="block text-[13px] font-medium text-[#3A424E] mb-1.5">
                  E-Mail-Adresse <span aria-hidden="true">*</span>
                </label>
                <input id="new-user-email" type="email" value={form.email} required
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  aria-invalid={!!errors.email} aria-describedby={errors.email ? "err-email" : undefined}
                  placeholder="m.schmidt@haendler.de"
                  className={`w-full h-10 px-3 rounded-lg border text-[14px] text-[#232830] placeholder:text-[#8A93A0] outline-none focus:ring-2 focus:ring-[#009D97]/20 transition-all ${FOCUS} ${errors.email ? "border-[#B42318]" : "border-[#8A93A0] focus:border-[#009D97]"}`} />
                {errors.email && (
                  <p id="err-email" className="mt-1 flex items-center gap-1 text-[12px] font-medium text-[#B42318]">
                    <AlertCircle size={12} aria-hidden="true" /> Fehler: {errors.email}
                  </p>
                )}
              </div>

              <fieldset>
                <legend className="block text-[13px] font-medium text-[#3A424E] mb-1.5">
                  Rollen <span aria-hidden="true">*</span>
                </legend>
                <div className="flex flex-col gap-2 p-3 rounded-lg border border-[#8A93A0]"
                  aria-describedby={errors.roles ? "err-roles" : undefined}>
                  {ALL_ROLES.map(r => (
                    <label key={r} className="flex items-center gap-2 text-[13px] text-[#3A424E]">
                      <input type="checkbox" checked={form.roles.includes(r)}
                        onChange={e => setForm(f => ({
                          ...f,
                          roles: e.target.checked ? [...f.roles, r] : f.roles.filter(x => x !== r),
                        }))}
                        className={`w-4 h-4 accent-[#00C8C1] ${FOCUS}`} />
                      {ROLE_LABELS[r]}
                    </label>
                  ))}
                </div>
                {errors.roles && (
                  <p id="err-roles" className="mt-1 flex items-center gap-1 text-[12px] font-medium text-[#B42318]">
                    <AlertCircle size={12} aria-hidden="true" /> Fehler: {errors.roles}
                  </p>
                )}
              </fieldset>

              <fieldset>
                <legend className="block text-[13px] font-medium text-[#3A424E] mb-2">Märkte</legend>
                <div className="flex flex-wrap gap-2 p-3 rounded-lg border border-[#8A93A0] min-h-[44px]">
                  {markets.length === 0 && (
                    <span className="text-[12px] text-[#5A6472]">{t("common.dbRequired")}</span>
                  )}
                  {markets.map(m => {
                    const on = form.marketIds.includes(m.id);
                    return (
                      <button key={m.id} type="button" aria-pressed={on}
                        onClick={() => setForm(f => ({
                          ...f,
                          marketIds: on ? f.marketIds.filter(x => x !== m.id) : [...f.marketIds, m.id],
                        }))}
                        className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[12px] font-semibold border transition-colors ${FOCUS} ${
                          on
                            ? "bg-[#E6FAF9] text-[#007D78] border-[#00C8C1]"
                            : "bg-white text-[#5A6472] border-[#C3C9D1] hover:bg-[#EEF1F4]"
                        }`}>
                        {on && <Check size={11} aria-hidden="true" />}{m.code}
                      </button>
                    );
                  })}
                </div>
                {form.marketIds.length > 0 && (
                  <p className="mt-1.5 text-[12px] text-[#5A6472]">
                    Ausgewählt: {form.marketIds.map(marketCode).join(", ")}
                  </p>
                )}
              </fieldset>

              <button type="submit" className="sr-only">{t("common.create")}</button>
            </form>

            <div className="px-6 py-4 border-t border-[#E1E5EA] flex items-center gap-2">
              <button onClick={() => void submitForm()} disabled={submitting}
                className={`flex-1 h-11 rounded-lg font-semibold text-[15px] flex items-center justify-center gap-2 transition-all ${FOCUS} disabled:opacity-60`}
                style={{ backgroundColor: "#00C8C1", color: "#232830" }}>
                {INVITE_AVAILABLE
                  ? <><MailPlus size={16} aria-hidden="true" /> {submitting ? "Einladung wird versendet …" : "Einladung senden"}</>
                  : <><Plus size={16} aria-hidden="true" /> {submitting ? t("common.saving") : t("common.create")}</>}
              </button>
              <button onClick={() => setShowPanel(false)}
                className={`h-11 px-4 rounded-lg border border-[#C3C9D1] font-medium text-[14px] text-[#3A424E] hover:bg-[#EEF1F4] transition-colors ${FOCUS}`}>
                {t("common.cancel")}
              </button>
            </div>
          </div>
        </div>
      )}
      </>)}
    </div>
  );
}
