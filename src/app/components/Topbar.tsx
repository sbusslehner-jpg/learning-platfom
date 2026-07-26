import { useEffect, useRef, useState } from "react";
import { Search, HelpCircle, BookOpen, Menu, Globe, LogOut, ShieldCheck, User } from "lucide-react";
import logo from "../../imports/GroupIT_Logo.png";
import { searchTrainings, type SearchHit } from "../data/api";
import { ROLE_LABELS, useRoles, type Role } from "../data/roles";
import { UI_LANGUAGES, useT } from "../i18n";

// ─── Topbar ───────────────────────────────────────────────────────────────────
// Enthält echte Trainingssuche (Datenbank, debounced), Sprachumschalter,
// Profilmenü mit Abmelden und – solange keine echte Anmeldung aktiv ist –
// einen als Demo gekennzeichneten Rollenwechsel.

export function Topbar({ onMenuToggle, onOpenTraining, onLogout }: {
  onMenuToggle: () => void;
  collapsed?: boolean;
  onOpenTraining?: (slug: string) => void;
  onLogout?: () => void;
}) {
  const { t, lang, setLang } = useT();
  const { roles, setRoles } = useRoles();
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [menu, setMenu] = useState<null | "lang" | "profile">(null);
  const boxRef = useRef<HTMLDivElement>(null);

  // Suche mit Verzögerung, damit nicht jede Taste eine Abfrage auslöst
  useEffect(() => {
    if (query.trim().length < 2) { setHits([]); return; }
    const id = setTimeout(() => {
      searchTrainings(query.trim()).then(r => setHits(r ?? [])).catch(() => setHits([]));
    }, 250);
    return () => clearTimeout(id);
  }, [query]);

  // Menüs bei Klick außerhalb / Escape schließen
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setMenu(null);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { setMenu(null); setSearchOpen(false); } };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
  }, []);

  const toggleRole = (r: Role) => {
    const next = roles.includes(r) ? roles.filter(x => x !== r) : [...roles, r];
    setRoles(next.length ? next : [r]);
  };

  const openHit = (slug: string) => {
    setQuery(""); setHits([]); setSearchOpen(false);
    onOpenTraining?.(slug);
  };

  return (
    <header className="h-16 bg-white border-b border-[#E1E5EA] flex items-center px-4 gap-4 z-20 shrink-0">
      <button onClick={onMenuToggle}
        className="p-2 rounded-lg text-[#5A6472] hover:bg-[#EEF1F4] transition-colors lg:hidden focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#00C8C1]"
        aria-label={t("nav.search")}>
        <Menu size={20} />
      </button>
      <div className="hidden lg:block">
        <img src={logo} alt="GroupIT – After Sales IT" className="h-8 object-contain" />
      </div>

      {/* Suche */}
      <div className="flex-1 max-w-md mx-auto lg:mx-0 lg:ml-8">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8A93A0]" aria-hidden />
          <input
            type="search" value={query} placeholder={t("common.search")}
            aria-label={t("nav.search")}
            onChange={e => { setQuery(e.target.value); setSearchOpen(true); }}
            onFocus={() => setSearchOpen(true)}
            className="w-full h-9 pl-9 pr-4 bg-[#F6F8FA] border border-[#C3C9D1] rounded-lg text-[14px] text-[#232830] placeholder:text-[#8A93A0] outline-none focus:border-[#009D97] focus:ring-2 focus:ring-[#009D97]/20 transition-all"
          />
          {searchOpen && query.trim().length >= 2 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-[#C3C9D1] rounded-lg shadow-lg z-50 overflow-hidden"
              role="listbox" aria-label={t("nav.search")}>
              {hits.length === 0 ? (
                <div className="px-4 py-3 text-[13px] text-[#5A6472]">{t("common.noResults")}</div>
              ) : (
                <>
                  <div className="px-3 pt-3 pb-1 text-[11px] font-semibold text-[#8A93A0] tracking-wider uppercase">
                    {t("learn.trainings")}
                  </div>
                  {hits.map(h => (
                    <button key={h.slug} onClick={() => openHit(h.slug)} role="option" aria-selected={false}
                      className="w-full text-left px-4 py-2.5 text-[14px] text-[#232830] hover:bg-[#E6FAF9] flex items-center gap-2 transition-colors">
                      <BookOpen size={14} className="text-[#00C8C1] shrink-0" aria-hidden />
                      <span className="truncate">{h.title}</span>
                      {h.module && <span className="ml-auto text-[11px] text-[#8A93A0] shrink-0">{h.module}</span>}
                    </button>
                  ))}
                </>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1 ml-auto" ref={boxRef}>
        {/* Sprache */}
        <div className="relative">
          <button onClick={() => setMenu(menu === "lang" ? null : "lang")}
            className="flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-[#5A6472] hover:bg-[#EEF1F4] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#00C8C1]"
            aria-label={t("common.language")} aria-expanded={menu === "lang"} aria-haspopup="menu">
            <Globe size={19} />
            <span className="text-[13px] font-semibold uppercase">{lang}</span>
          </button>
          {menu === "lang" && (
            <div role="menu" className="absolute right-0 top-full mt-1 w-44 bg-white border border-[#C3C9D1] rounded-lg shadow-lg py-1 z-50">
              {UI_LANGUAGES.map(l => (
                <button key={l.code} role="menuitemradio" aria-checked={lang === l.code}
                  onClick={() => { setLang(l.code); setMenu(null); }}
                  className={`w-full text-left px-3 py-2 text-[14px] hover:bg-[#E6FAF9] transition-colors flex items-center justify-between ${lang === l.code ? "text-[#007D78] font-semibold" : "text-[#3A424E]"}`}>
                  {l.label}{lang === l.code && <span aria-hidden>✓</span>}
                </button>
              ))}
            </div>
          )}
        </div>

        <button className="p-2 rounded-lg text-[#5A6472] hover:bg-[#EEF1F4] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#00C8C1]"
          aria-label={t("common.help")}
          onClick={() => window.open("https://github.com/sbusslehner-jpg/learning-platfom/tree/main/docs", "_blank", "noreferrer")}>
          <HelpCircle size={20} />
        </button>

        {/* Profil */}
        <div className="relative">
          <button onClick={() => setMenu(menu === "profile" ? null : "profile")}
            className="ml-1 flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-[#EEF1F4] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#00C8C1]"
            aria-expanded={menu === "profile"} aria-haspopup="menu" aria-label={t("nav.profile")}>
            <div className="w-7 h-7 rounded-full bg-[#2E3540] flex items-center justify-center text-white text-[11px] font-bold" aria-hidden>MK</div>
            <span className="hidden lg:block text-[14px] font-medium text-[#3A424E]">Max Keller</span>
          </button>
          {menu === "profile" && (
            <div role="menu" className="absolute right-0 top-full mt-1 w-64 bg-white border border-[#C3C9D1] rounded-lg shadow-lg py-1 z-50">
              <div className="px-3 py-2 border-b border-[#EEF1F4]">
                <div className="text-[13px] font-semibold text-[#232830]">Max Keller</div>
                <div className="text-[12px] text-[#5A6472]">
                  {roles.map(r => ROLE_LABELS[r]).join(" · ") || "—"}
                </div>
              </div>

              {/* Rollenwechsel: nur solange keine echte Anmeldung aktiv ist */}
              <div className="px-3 py-2 border-b border-[#EEF1F4]">
                <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-[#B45309] mb-1.5">
                  <ShieldCheck size={11} /> {t("common.demoMode")} · {t("common.role")}
                </div>
                {(["admin", "editor", "user"] as Role[]).map(r => (
                  <label key={r} className="flex items-center gap-2 py-1 text-[13px] text-[#3A424E] cursor-pointer">
                    <input type="checkbox" checked={roles.includes(r)} onChange={() => toggleRole(r)}
                      className="accent-[#00C8C1]" />
                    {ROLE_LABELS[r]}
                  </label>
                ))}
              </div>

              <button role="menuitem" onClick={onLogout}
                className="w-full text-left px-3 py-2 text-[14px] text-[#3A424E] hover:bg-[#EEF1F4] transition-colors flex items-center gap-2">
                <LogOut size={15} /> {t("common.logout")}
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
