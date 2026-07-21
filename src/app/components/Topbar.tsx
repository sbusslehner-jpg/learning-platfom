import { useState } from "react";
import { Search, HelpCircle, BookOpen, Menu, Bell } from "lucide-react";
import logo from "../../imports/GroupIT_Logo.png";

// ─── Topbar ───────────────────────────────────────────────────────────────────

export function Topbar({ onMenuToggle, collapsed }: { onMenuToggle: () => void; collapsed: boolean }) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");

  return (
    <header className="h-16 bg-white border-b border-[#E1E5EA] flex items-center px-4 gap-4 z-20 shrink-0">
      <button onClick={onMenuToggle}
        className="p-2 rounded-lg text-[#5A6472] hover:bg-[#EEF1F4] transition-colors lg:hidden"
        aria-label="Menü umschalten">
        <Menu size={20} />
      </button>
      <div className="hidden lg:block">
        <img src={logo} alt="GroupIT" className="h-8 object-contain" />
      </div>

      {/* Search */}
      <div className="flex-1 max-w-md mx-auto lg:mx-0 lg:ml-8">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8A93A0]" />
          <input
            type="search" placeholder="Trainings, Module, Kapitel suchen …" value={query}
            onChange={e => setQuery(e.target.value)} onFocus={() => setSearchOpen(true)} onBlur={() => setTimeout(() => setSearchOpen(false), 150)}
            className="w-full h-9 pl-9 pr-4 bg-[#F6F8FA] border border-[#C3C9D1] rounded-lg text-[14px] text-[#232830] placeholder:text-[#8A93A0] outline-none focus:border-[#009D97] focus:ring-2 focus:ring-[#009D97]/20 transition-all"
          />
          {searchOpen && query.length >= 2 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-[#C3C9D1] rounded-lg shadow-lg z-50 overflow-hidden">
              <div className="px-3 pt-3 pb-1 text-[11px] font-semibold text-[#8A93A0] tracking-wider uppercase">Trainings</div>
              {["DSR – Konfiguration Einzelhandel", "DSR – Rollenzuweisung", "CCD – Grundkonfiguration"].filter(t => t.toLowerCase().includes(query.toLowerCase())).map(t => (
                <button key={t} className="w-full text-left px-4 py-2.5 text-[14px] text-[#232830] hover:bg-[#E6FAF9] flex items-center gap-2 transition-colors">
                  <BookOpen size={14} className="text-[#00C8C1]" />{t}
                </button>
              ))}
              {query.length >= 2 && <div className="px-4 py-2 text-[12px] text-[#007D78] border-t border-[#EEF1F4] hover:bg-[#E6FAF9] cursor-pointer">Alle Ergebnisse für „{query}" anzeigen →</div>}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1 ml-auto">
        <button className="p-2 rounded-lg text-[#5A6472] hover:bg-[#EEF1F4] transition-colors" aria-label="Hilfe"><HelpCircle size={20} /></button>
        <button className="p-2 rounded-lg text-[#5A6472] hover:bg-[#EEF1F4] transition-colors relative" aria-label="Benachrichtigungen">
          <Bell size={20} />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-[#00C8C1] rounded-full" />
        </button>
        <button className="ml-1 flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-[#EEF1F4] transition-colors">
          <div className="w-7 h-7 rounded-full bg-[#2E3540] flex items-center justify-center text-white text-[11px] font-bold">MK</div>
          <span className="hidden lg:block text-[14px] font-medium text-[#3A424E]">Max Keller</span>
        </button>
      </div>
    </header>
  );
}
