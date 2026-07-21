import { useState } from "react";
import { MoreVertical, Plus, Search, Send, X } from "lucide-react";
import { toast } from "sonner";
import { Breadcrumb } from "../components/Breadcrumb";
import { USERS } from "../data/demo";

// ─── Admin: Users ─────────────────────────────────────────────────────────────

export function AdminUsers() {
  const [showPanel, setShowPanel] = useState(false);
  const [search, setSearch] = useState("");

  const filtered = USERS.filter(u => u.name.toLowerCase().includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="flex-1 overflow-y-auto p-6 lg:p-8">
      <Breadcrumb items={["Verwaltung", "Benutzer"]} />
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-[26px] font-semibold text-[#232830]">Benutzer</h1>
          <p className="text-[14px] text-[#5A6472] mt-1">{USERS.length} Konten</p>
        </div>
        <button onClick={() => setShowPanel(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg font-semibold text-[14px] transition-all"
          style={{ backgroundColor: "#00C8C1", color: "#232830" }}>
          <Plus size={16} /> Benutzer anlegen
        </button>
      </div>

      {/* Search */}
      <div className="relative mb-4 max-w-sm">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8A93A0]" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Name oder E-Mail …"
          className="w-full h-9 pl-9 pr-3 bg-white border border-[#C3C9D1] rounded-lg text-[14px] text-[#232830] placeholder:text-[#8A93A0] outline-none focus:border-[#009D97] focus:ring-2 focus:ring-[#009D97]/20 transition-all" />
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border border-[#C3C9D1] overflow-hidden">
        <table className="w-full text-[14px]">
          <thead>
            <tr className="border-b border-[#E1E5EA] bg-[#F6F8FA]">
              {["Name", "E-Mail", "Rolle", "Märkte", "Zuletzt aktiv", ""].map(h => (
                <th key={h} className="text-left px-4 py-3 text-[12px] font-semibold text-[#5A6472] uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#EEF1F4]">
            {filtered.map(u => (
              <tr key={u.email} className="hover:bg-[#F6F8FA] transition-colors">
                <td className="px-4 py-3 font-medium text-[#232830]">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-full bg-[#2E3540] flex items-center justify-center text-white text-[11px] font-bold shrink-0">
                      {u.name.split(" ").map(n => n[0]).join("").slice(0, 2)}
                    </div>
                    {u.name}
                  </div>
                </td>
                <td className="px-4 py-3 text-[#5A6472]">{u.email}</td>
                <td className="px-4 py-3">
                  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${u.role === "Admin" ? "bg-[#FDEEEC] text-[#B42318]" : u.role === "Editor" ? "bg-[#EBF1FE] text-[#1D5BD6]" : "bg-[#EEF1F4] text-[#5A6472]"}`}>
                    {u.role}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {u.markets.slice(0, 3).map(m => (
                      <span key={m} className="text-[11px] font-semibold px-1.5 py-0.5 rounded bg-[#EEF1F4] text-[#5A6472]">{m}</span>
                    ))}
                    {u.markets.length > 3 && <span className="text-[11px] text-[#8A93A0]">+{u.markets.length - 3}</span>}
                  </div>
                </td>
                <td className="px-4 py-3 text-[#5A6472]">{u.lastActive}</td>
                <td className="px-4 py-3">
                  <button className="p-1.5 rounded text-[#8A93A0] hover:text-[#5A6472] hover:bg-[#EEF1F4] transition-colors"><MoreVertical size={15} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Create panel */}
      {showPanel && (
        <div className="fixed inset-0 z-40 flex">
          <div className="flex-1 bg-black/30" onClick={() => setShowPanel(false)} />
          <div className="w-[480px] bg-white shadow-2xl flex flex-col h-full">
            <div className="px-6 py-4 border-b border-[#E1E5EA] flex items-center justify-between">
              <h2 className="text-[17px] font-semibold text-[#232830]">Neuen Benutzer anlegen</h2>
              <button onClick={() => setShowPanel(false)} className="p-1.5 rounded-lg text-[#5A6472] hover:bg-[#EEF1F4]"><X size={18} /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {[{ label: "Vollständiger Name", ph: "Maria Schmidt" }, { label: "E-Mail-Adresse", ph: "m.schmidt@haendler.de" }].map(f => (
                <div key={f.label}>
                  <label className="block text-[13px] font-medium text-[#3A424E] mb-1.5">{f.label}</label>
                  <input placeholder={f.ph} className="w-full h-10 px-3 rounded-lg border border-[#8A93A0] text-[14px] text-[#232830] placeholder:text-[#8A93A0] outline-none focus:border-[#009D97] focus:ring-2 focus:ring-[#009D97]/20 transition-all" />
                </div>
              ))}
              <div>
                <label className="block text-[13px] font-medium text-[#3A424E] mb-1.5">Rolle</label>
                <select className="w-full h-10 px-3 rounded-lg border border-[#8A93A0] text-[14px] text-[#232830] bg-white outline-none focus:border-[#009D97] focus:ring-2 focus:ring-[#009D97]/20 transition-all">
                  <option>Anwender</option><option>Editor</option><option>Admin</option>
                </select>
              </div>
              <div>
                <label className="block text-[13px] font-medium text-[#3A424E] mb-2">Märkte</label>
                <div className="flex flex-wrap gap-2 p-3 rounded-lg border border-[#8A93A0] min-h-[44px]">
                  {["DE", "AT", "CH"].map(m => (
                    <span key={m} className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[12px] font-semibold bg-[#E6FAF9] text-[#007D78] border border-[#00C8C1]">
                      {m}<button className="ml-0.5 text-[#00C8C1] hover:text-[#B42318]"><X size={10} /></button>
                    </span>
                  ))}
                </div>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-[#E1E5EA]">
              <button onClick={() => { setShowPanel(false); toast.success("Einladung gesendet"); }}
                className="w-full h-11 rounded-lg font-semibold text-[15px] flex items-center justify-center gap-2 transition-all"
                style={{ backgroundColor: "#00C8C1", color: "#232830" }}>
                <Send size={16} /> Einladung senden
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
