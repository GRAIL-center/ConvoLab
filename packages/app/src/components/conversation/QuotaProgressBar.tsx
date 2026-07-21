import type { QuotaState } from '../../hooks/useConversationSocket';

interface QuotaProgressBarProps {
  quota: QuotaState;
}

export function QuotaProgressBar({ quota }: QuotaProgressBarProps) {
  const pct = quota.total > 0
    ? Math.max(0, Math.min(100, Math.round((quota.remaining / quota.total) * 100)))
    : 0;

  const barColor = quota.exhausted
    ? 'bg-red-400 dark:bg-red-500'
    : pct < 20
      ? 'bg-amber-400 dark:bg-amber-500'
      : 'bg-[rgba(100,180,175,0.8)] dark:bg-[rgba(134,199,194,0.7)]';

  const textColor = quota.exhausted
    ? 'text-red-600 dark:text-red-400'
    : pct < 20
      ? 'text-amber-600 dark:text-amber-400'
      : 'text-[#6B6B6B] dark:text-[#A0A0A0]';

  return (
    <div className="px-2 pb-2">
      <div className="flex justify-between items-center mb-1">
        <span className={`text-[11px] ${textColor}`}>
          {quota.exhausted ? 'Quota exhausted' : `${quota.remaining.toLocaleString()} tokens remaining`}
        </span>
        <span className={`text-[11px] font-medium ${textColor}`}>
          {pct}%
        </span>
      </div>
      <div className="h-1 rounded-full bg-[rgba(200,220,215,0.4)] dark:bg-[rgba(255,255,255,0.07)]">
        <div
          className={`h-1 rounded-full transition-all duration-500 ${barColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
