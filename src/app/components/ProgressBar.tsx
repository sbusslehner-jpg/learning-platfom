export function ProgressBar({ percent, className = "" }: { percent: number; className?: string }) {
  return (
    <div className={`h-1.5 bg-[#C3C9D1] rounded-full overflow-hidden ${className}`}>
      <div className="h-full bg-[#00C8C1] rounded-full transition-all duration-500" style={{ width: `${percent}%` }} />
    </div>
  );
}
