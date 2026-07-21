import { MoreVertical, Plus } from "lucide-react";
import { Breadcrumb } from "../components/Breadcrumb";

// ─── Admin: Markets ───────────────────────────────────────────────────────────

export function AdminMarkets() {
  const markets = [
    { name: "Deutschland", code: "DE", langs: ["DE"], default: "DE", trainings: 12 },
    { name: "Österreich",  code: "AT", langs: ["DE"],  default: "DE", trainings: 12 },
    { name: "Frankreich",  code: "FR", langs: ["FR", "DE"], default: "FR", trainings: 10 },
    { name: "Polen",       code: "PL", langs: ["PL", "DE"], default: "PL", trainings: 8 },
    { name: "Spanien",     code: "ES", langs: ["ES", "DE"], default: "ES", trainings: 9 },
    { name: "Ungarn",      code: "HU", langs: ["HU", "DE"], default: "HU", trainings: 6 },
  ];
  return (
    <div className="flex-1 overflow-y-auto p-6 lg:p-8">
      <Breadcrumb items={["Verwaltung", "Märkte & Sprachen"]} />
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-[26px] font-semibold text-[#232830]">Märkte &amp; Sprachen</h1>
          <p className="text-[14px] text-[#5A6472] mt-1">{markets.length} aktive Märkte</p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2.5 rounded-lg font-semibold text-[14px] transition-all"
          style={{ backgroundColor: "#00C8C1", color: "#232830" }}>
          <Plus size={16} /> Markt anlegen
        </button>
      </div>
      <div className="bg-white rounded-lg border border-[#C3C9D1] overflow-hidden">
        <table className="w-full text-[14px]">
          <thead>
            <tr className="border-b border-[#E1E5EA] bg-[#F6F8FA]">
              {["Markt", "Code", "Sprachen", "Standardsprache", "Trainings", ""].map(h => (
                <th key={h} className="text-left px-4 py-3 text-[12px] font-semibold text-[#5A6472] uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#EEF1F4]">
            {markets.map(m => (
              <tr key={m.code} className="hover:bg-[#F6F8FA] transition-colors">
                <td className="px-4 py-3 font-medium text-[#232830]">{m.name}</td>
                <td className="px-4 py-3"><span className="font-mono text-[12px] font-bold text-[#5A6472] bg-[#EEF1F4] px-1.5 py-0.5 rounded">{m.code}</span></td>
                <td className="px-4 py-3">
                  <div className="flex gap-1">
                    {m.langs.map(l => <span key={l} className="text-[11px] font-semibold px-1.5 py-0.5 rounded bg-[#E6FAF9] text-[#007D78]">{l}</span>)}
                  </div>
                </td>
                <td className="px-4 py-3 text-[#3A424E]">{m.default}</td>
                <td className="px-4 py-3 tabular-nums text-[#5A6472]">{m.trainings}</td>
                <td className="px-4 py-3"><button className="p-1.5 rounded text-[#8A93A0] hover:text-[#5A6472] hover:bg-[#EEF1F4] transition-colors"><MoreVertical size={15} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
