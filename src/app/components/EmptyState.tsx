import { Plus } from "lucide-react";

// ─── Empty State ──────────────────────────────────────────────────────────────

export function EmptyState({ icon: Icon, title, body, action, onAction }: {
  icon: React.ElementType; title: string; body: string; action?: string; onAction?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
      <div className="w-16 h-16 rounded-2xl bg-[#EEF1F4] flex items-center justify-center mb-4">
        <Icon size={28} style={{ color: "#C3C9D1" }} strokeWidth={1.5} />
      </div>
      <h3 className="text-[16px] font-semibold text-[#3A424E] mb-2">{title}</h3>
      <p className="text-[14px] text-[#5A6472] max-w-xs mb-6">{body}</p>
      {action && onAction && (
        <button onClick={onAction}
          className="flex items-center gap-2 px-5 py-2.5 rounded-lg font-semibold text-[14px] transition-all"
          style={{ backgroundColor: "#00C8C1", color: "#232830" }}>
          <Plus size={16} />{action}
        </button>
      )}
    </div>
  );
}
