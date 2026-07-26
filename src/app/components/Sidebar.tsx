import { X, LogOut } from "lucide-react";
import logo from "../../imports/GroupIT_Logo.png";
import { NAV_ITEMS, type Screen } from "../data/demo";
import { useRoles } from "../data/roles";
import { useT } from "../i18n";

// ─── Sidebar ──────────────────────────────────────────────────────────────────
// Zeigt nur Bereiche, für die die aktive Rolle berechtigt ist (Konzept §2).
// Leere Abschnitte werden ausgeblendet, damit keine funktionslosen
// Überschriften stehen bleiben.

export function Sidebar({ current, onNavigate, collapsed, mobile, onClose, onLogout }: {
  current: Screen; onNavigate: (s: Screen) => void; collapsed: boolean;
  mobile?: boolean; onClose?: () => void; onLogout?: () => void;
}) {
  const { canScreen } = useRoles();
  const { t } = useT();
  const isActive = (id: string) => current === id || (id === "editor-tree" && current === "editor-content");

  const sections = NAV_ITEMS
    .map(s => ({ ...s, items: s.items.filter(i => canScreen(i.id as Screen)) }))
    .filter(s => s.items.length > 0);

  return (
    <aside
      className={`flex flex-col bg-[#2E3540] transition-all duration-200 shrink-0 ${mobile ? "fixed inset-y-0 left-0 z-40 w-72 shadow-2xl" : collapsed ? "w-[72px]" : "w-64"}`}
      style={{ fontFamily: "Inter, system-ui, sans-serif" }}
      aria-label={t("nav.learn")}
    >
      {/* Mobile logo */}
      {mobile && (
        <div className="h-16 flex items-center justify-between px-4 border-b border-[#3A424E]">
          <img src={logo} alt="GroupIT" className="h-7 object-contain brightness-0 invert" />
          <button onClick={onClose} aria-label={t("common.close")}
            className="p-2 text-white/60 hover:text-white transition-colors rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#00C8C1]">
            <X size={18} />
          </button>
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 py-4 overflow-y-auto">
        {sections.map(({ section, sectionKey, items }) => (
          <div key={section} className="mb-6">
            {!collapsed && (
              <div className="px-4 mb-1 text-[10px] font-semibold tracking-widest text-white/30 uppercase">
                {t(sectionKey ?? section)}
              </div>
            )}
            {items.map(({ id, label, labelKey, icon: Icon }) => {
              const active = isActive(id);
              const text = t(labelKey ?? label);
              return (
                <button
                  key={id}
                  onClick={() => { onNavigate(id as Screen); onClose?.(); }}
                  title={collapsed ? text : undefined}
                  aria-current={active ? "page" : undefined}
                  className={`w-full flex items-center transition-all duration-100 relative
                    focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#00C8C1]
                    ${collapsed ? "justify-center px-0 py-3" : "gap-3 px-4 py-2.5"}
                    ${active ? "bg-[#232830]" : "hover:bg-[#3A424E]"}`}
                >
                  {active && <span className="absolute left-0 inset-y-0 w-[3px] bg-[#00C8C1] rounded-r-full" />}
                  <Icon size={20} style={{ color: active ? "#00C8C1" : "rgba(255,255,255,0.6)" }} className="shrink-0" />
                  {!collapsed && <span className={`text-[14px] font-medium ${active ? "text-[#00C8C1]" : "text-white/70"}`}>{text}</span>}
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Footer */}
      {!collapsed && (
        <div className="p-4 border-t border-[#3A424E]">
          <button onClick={onLogout}
            className="flex items-center gap-2 text-[13px] text-white/40 hover:text-white/70 transition-colors w-full rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#00C8C1]">
            <LogOut size={15} /><span>{t("common.logout")}</span>
          </button>
        </div>
      )}
    </aside>
  );
}
