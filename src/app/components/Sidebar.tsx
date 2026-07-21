import { X, LogOut } from "lucide-react";
import logo from "../../imports/GroupIT_Logo.png";
import { NAV_ITEMS, type Screen } from "../data/demo";

// ─── Sidebar ──────────────────────────────────────────────────────────────────

export function Sidebar({ current, onNavigate, collapsed, mobile, onClose }: {
  current: Screen; onNavigate: (s: Screen) => void; collapsed: boolean; mobile?: boolean; onClose?: () => void;
}) {
  const isActive = (id: string) => current === id || (id === "editor-tree" && current === "editor-content");
  return (
    <aside
      className={`flex flex-col bg-[#2E3540] transition-all duration-200 shrink-0 ${mobile ? "fixed inset-y-0 left-0 z-40 w-72 shadow-2xl" : collapsed ? "w-[72px]" : "w-64"}`}
      style={{ fontFamily: "Inter, system-ui, sans-serif" }}
    >
      {/* Mobile logo */}
      {mobile && (
        <div className="h-16 flex items-center justify-between px-4 border-b border-[#3A424E]">
          <img src={logo} alt="GroupIT" className="h-7 object-contain brightness-0 invert" />
          <button onClick={onClose} className="p-2 text-white/60 hover:text-white transition-colors"><X size={18} /></button>
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 py-4 overflow-y-auto">
        {NAV_ITEMS.map(({ section, items }) => (
          <div key={section} className="mb-6">
            {!collapsed && (
              <div className="px-4 mb-1 text-[10px] font-semibold tracking-widest text-white/30 uppercase">{section}</div>
            )}
            {items.map(({ id, label, icon: Icon }) => {
              const active = isActive(id);
              return (
                <button
                  key={id}
                  onClick={() => { onNavigate(id as Screen); onClose?.(); }}
                  title={collapsed ? label : undefined}
                  className={`w-full flex items-center transition-all duration-100 relative
                    ${collapsed ? "justify-center px-0 py-3" : "gap-3 px-4 py-2.5"}
                    ${active ? "bg-[#232830]" : "hover:bg-[#3A424E]"}`}
                >
                  {active && <span className="absolute left-0 inset-y-0 w-[3px] bg-[#00C8C1] rounded-r-full" />}
                  <Icon size={20} style={{ color: active ? "#00C8C1" : "rgba(255,255,255,0.6)" }} className="shrink-0" />
                  {!collapsed && <span className={`text-[14px] font-medium ${active ? "text-[#00C8C1]" : "text-white/70"}`}>{label}</span>}
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Footer */}
      {!collapsed && (
        <div className="p-4 border-t border-[#3A424E]">
          <button className="flex items-center gap-2 text-[13px] text-white/40 hover:text-white/70 transition-colors w-full">
            <LogOut size={15} /><span>Abmelden</span>
          </button>
        </div>
      )}
    </aside>
  );
}
