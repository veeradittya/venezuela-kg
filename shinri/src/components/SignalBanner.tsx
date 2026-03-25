'use client';

import type { Signal } from '@/lib/types';
import { formatDelta } from '@/lib/theme';

interface SignalBannerProps {
  signals: Signal[];
  onSignalClick: (signal: Signal) => void;
}

export default function SignalBanner({ signals, onSignalClick }: SignalBannerProps) {
  if (signals.length === 0) {
    return (
      <div className="h-8 bg-panel border-b border-border flex items-center px-4">
        <span className="text-[10px] text-text-muted uppercase tracking-wider">Signals</span>
        <span className="text-[10px] text-text-muted/50 ml-3">Scanning prediction markets...</span>
      </div>
    );
  }

  // Duplicate for seamless scroll
  const items = [...signals, ...signals];

  return (
    <div className="h-8 bg-[#0a0a0a] border-b border-border/50 flex items-center overflow-hidden relative">
      {/* Fixed label */}
      <div className="absolute left-0 top-0 bottom-0 w-24 bg-gradient-to-r from-[#0a0a0a] via-[#0a0a0a] to-transparent z-10 flex items-center pl-3">
        <span className="text-[9px] text-negative/80 uppercase tracking-widest font-semibold">Signals</span>
      </div>

      {/* Scrolling ticker */}
      <div className="signal-scroll flex items-center gap-6 pl-24 whitespace-nowrap">
        {items.map((signal, i) => {
          const holdingsCount = signal.affectedHoldings.length;
          const hasImpact = holdingsCount > 0;

          // Severity: red (high threat), amber (medium), grey (low/unscored)
          const severity = signal.score > 0.5
            ? 'text-negative'
            : signal.score > 0.3
              ? 'text-warning'
              : 'text-text-muted/60';

          const dotColor = signal.score > 0.5
            ? 'bg-negative'
            : signal.score > 0.3
              ? 'bg-[#cc8833]'
              : 'bg-text-muted/40';

          // Rough impact estimate
          const avgWeight = signal.affectedHoldings.reduce((s, h) => s + h.edgeWeight, 0) / Math.max(holdingsCount, 1);
          const estImpact = holdingsCount * avgWeight * signal.probability * 50000000;

          // Smart truncation: keep first 55 chars but don't cut mid-word
          let displayTitle = signal.title;
          if (displayTitle.length > 55) {
            displayTitle = displayTitle.slice(0, 55).replace(/\s+\S*$/, '') + '...';
          }

          return (
            <button
              key={`${signal.id}-${i}`}
              onClick={() => onSignalClick(signal)}
              className="flex items-center gap-2 text-[11px] hover:text-accent transition-colors group shrink-0"
            >
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotColor} ${signal.score > 0.4 ? 'animate-pulse' : ''}`} />
              <span className={`${severity} group-hover:text-accent`}>{displayTitle}</span>
              {hasImpact && (
                <>
                  <span className="text-text-muted/50 text-[10px]">{holdingsCount} holdings</span>
                  {estImpact > 10000000 && (
                    <span className="text-negative/70 text-[10px] font-mono">est. {formatDelta(-estImpact)}</span>
                  )}
                </>
              )}
              <span className="text-border">|</span>
            </button>
          );
        })}
      </div>

      {/* Right fade */}
      <div className="absolute right-0 top-0 bottom-0 w-16 bg-gradient-to-l from-[#0a0a0a] to-transparent z-10" />
    </div>
  );
}
