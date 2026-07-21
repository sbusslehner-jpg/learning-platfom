import { STATUS, type Status } from "../data/demo";

export function StatusBadge({ status, compact = false }: { status: Status; compact?: boolean }) {
  const s = STATUS[status];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-medium whitespace-nowrap ${compact ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-[12px]"}`}
      style={{ backgroundColor: s.bg, color: s.color }}
    >
      <span style={{ color: s.color, display: "flex" }}>{s.icon}</span>
      {s.label}
    </span>
  );
}
