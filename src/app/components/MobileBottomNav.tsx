import { useState } from "react";
import { FileText, Languages, Users, Settings, LogOut } from "lucide-react";
import { BOTTOM_NAV, type Screen } from "../data/demo";

// ─── Mobile Bottom Nav ────────────────────────────────────────────────────────

export function MobileBottomNav({ current, onNavigate }: { current: Screen; onNavigate: (s: Screen) => void }) {
  const [profileOpen, setProfileOpen] = useState(false);
  const isActive = (id: string) => current === id || (id === "dashboard" && current === "dashboard");

  return (
    <>
      {profileOpen && (
        <div className="fixed inset-0 z-40" onClick={() => setProfileOpen(false)}>
          <div className="absolute bottom-16 left-0 right-0 mx-4 bg-white rounded-xl border border-[#C3C9D1] shadow-2xl overflow-hidden">
            <div className="px-4 py-3 border-b border-[#EEF1F4]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-[#2E3540] flex items-center justify-center text-white text-[13px] font-bold">MK</div>
                <div>
                  <div className="text-[14px] font-semibold text-[#232830]">Max Keller</div>
                  <div className="text-[12px] text-[#5A6472]">Editor · Admin</div>
                </div>
              </div>
            </div>
            <div className="py-1">
              {[
                { label: "Inhalte", icon: FileText, screen: "editor-tree" as Screen },
                { label: "Übersetzungen", icon: Languages, screen: "translations-overview" as Screen },
                { label: "Benutzer", icon: Users, screen: "admin-users" as Screen },
                { label: "Einstellungen", icon: Settings, screen: "admin-settings" as Screen },
              ].map(item => {
                const Icon = item.icon;
                return (
                  <button key={item.label}
                    onClick={() => { onNavigate(item.screen); setProfileOpen(false); }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-[14px] text-[#3A424E] hover:bg-[#E6FAF9] hover:text-[#007D78] transition-colors">
                    <Icon size={17} />{item.label}
                  </button>
                );
              })}
              <div className="border-t border-[#EEF1F4] mt-1 pt-1">
                <button className="w-full flex items-center gap-3 px-4 py-3 text-[14px] text-[#B42318] hover:bg-[#FDEEEC] transition-colors">
                  <LogOut size={17} />Abmelden
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-[#E1E5EA] flex"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        {BOTTOM_NAV.map(({ id, label, icon: Icon }) => {
          const active = isActive(id) || (id === "profile" && profileOpen);
          return (
            <button key={id}
              onClick={() => id === "profile" ? setProfileOpen(!profileOpen) : id === "search" ? undefined : onNavigate(id as Screen)}
              className="flex-1 flex flex-col items-center gap-0.5 py-2.5 transition-colors"
              aria-label={label}
            >
              <Icon size={22} style={{ color: active ? "#00C8C1" : "#8A93A0" }} />
              <span className={`text-[10px] font-medium ${active ? "text-[#007D78]" : "text-[#8A93A0]"}`}>{label}</span>
            </button>
          );
        })}
      </nav>
    </>
  );
}
