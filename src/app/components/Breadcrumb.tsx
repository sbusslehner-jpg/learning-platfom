import { ChevronRight } from "lucide-react";

export function Breadcrumb({ items }: { items: string[] }) {
  return (
    <nav className="flex items-center gap-1 text-[13px] text-[#5A6472] mb-6 flex-wrap">
      {items.map((item, i) => (
        <span key={i} className="flex items-center gap-1">
          {i < items.length - 1 ? (
            <><span className="hover:text-[#007D78] cursor-pointer transition-colors">{item}</span><ChevronRight size={13} className="text-[#8A93A0]" /></>
          ) : (
            <span className="text-[#3A424E] font-medium">{item}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
