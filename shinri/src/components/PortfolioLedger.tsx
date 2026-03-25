'use client';

import { useState } from 'react';
import type { KGNode, ImpactData } from '@/lib/types';
import { formatValue, formatDelta } from '@/lib/theme';

interface PortfolioLedgerProps {
  holdings: KGNode[];
  selectedTicker: string | null;
  onSelectTicker: (ticker: string | null) => void;
  portfolioImpact: ImpactData['portfolioImpact'] | null;
}

export default function PortfolioLedger({
  holdings,
  selectedTicker,
  onSelectTicker,
  portfolioImpact,
}: PortfolioLedgerProps) {
  const [expandedTicker, setExpandedTicker] = useState<string | null>(null);

  const totalValue = holdings.reduce((sum, h) => {
    const val = (h.metadata as Record<string, unknown>)?.value_millions;
    return sum + (typeof val === 'number' ? val : 0);
  }, 0);

  return (
    <div className="h-full flex flex-col bg-panel">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <div>
          <h2 className="text-xs font-medium text-text-muted uppercase tracking-wider">Portfolio Holdings</h2>
          <div className="text-lg text-accent mt-0.5">{formatValue(totalValue)}</div>
        </div>
        <div className="text-right">
          <div className="text-[10px] text-text-muted uppercase">Top 20</div>
          <div className="text-xs text-text-muted">{holdings.length} assets</div>
        </div>
      </div>

      {/* Impact summary */}
      {portfolioImpact && (
        <div className={`px-4 py-2 border-b border-border ${portfolioImpact.totalDelta < 0 ? 'bg-negative/5' : 'bg-positive/5'}`}>
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-text-muted uppercase">Estimated Impact</span>
            <span className={`text-sm font-medium ${portfolioImpact.totalDelta < 0 ? 'text-negative' : 'text-positive'}`}>
              {formatDelta(portfolioImpact.totalDelta)} ({portfolioImpact.totalDeltaPercent > 0 ? '+' : ''}{(portfolioImpact.totalDeltaPercent * 100).toFixed(2)}%)
            </span>
          </div>
        </div>
      )}

      {/* Table header */}
      <div className="grid grid-cols-[1.5rem_3.5rem_1fr_4.5rem_3.5rem] gap-0 px-4 py-1.5 border-b border-border text-[10px] text-text-muted uppercase tracking-wider">
        <span>#</span>
        <span>Ticker</span>
        <span>Company</span>
        <span className="text-right">Value</span>
        <span className="text-right">%</span>
      </div>

      {/* Rows */}
      <div className="flex-1 overflow-y-auto">
        {holdings.map((h) => {
          const meta = h.metadata as Record<string, unknown>;
          const ticker = (meta.ticker as string) || '';
          const rank = (meta.panagora_rank as number) || 0;
          const valueK = (meta.value_millions as number) || 0;
          const pct = (meta.portfolio_pct as number) || 0;
          const sector = (meta.sector as string) || '';
          const keyRisks = (meta.key_risks as string[]) || [];
          const keyCatalysts = (meta.key_catalysts as string[]) || [];
          const isSelected = selectedTicker === ticker;
          const isExpanded = expandedTicker === ticker;

          // Find impact delta for this holding
          const holdingImpact = portfolioImpact?.holdings.find(hi => hi.ticker === ticker);

          return (
            <div key={h.id}>
              <div
                className={`grid grid-cols-[1.5rem_3.5rem_1fr_4.5rem_3.5rem] gap-0 px-4 py-2 cursor-pointer transition-colors border-b border-border/50 ${
                  isSelected ? 'bg-[#111111]' : 'hover:bg-[#0a0a0a]'
                } ${holdingImpact ? (holdingImpact.delta < 0 ? 'bg-negative/[0.03]' : 'bg-positive/[0.03]') : ''}`}
                onClick={() => {
                  onSelectTicker(isSelected ? null : ticker);
                  setExpandedTicker(isExpanded ? null : ticker);
                }}
              >
                <span className="text-[11px] text-text-muted">{rank}</span>
                <span className="font-mono text-[11px] text-accent font-medium">{ticker}</span>
                <span className="text-[11px] text-text truncate pr-2">{h.label}</span>
                <span className="text-[11px] text-text text-right">{formatValue(valueK)}</span>
                <span className="text-[11px] text-text-muted text-right">
                  {holdingImpact ? (
                    <span className={`font-medium ${holdingImpact.delta < 0 ? 'text-negative' : 'text-positive'}`}>
                      {formatDelta(holdingImpact.delta)}
                    </span>
                  ) : (
                    `${pct.toFixed(1)}%`
                  )}
                </span>
              </div>

              {/* Expanded detail */}
              {isExpanded && (
                <div className="px-4 py-3 bg-[#060606] border-b border-border">
                  <div className="grid grid-cols-2 gap-4 text-[10px]">
                    {keyRisks.length > 0 && (
                      <div>
                        <div className="text-text-muted uppercase mb-1 tracking-wider">Key Risks</div>
                        {keyRisks.slice(0, 3).map((r, i) => (
                          <div key={i} className="text-text/70 mb-0.5 flex items-start gap-1">
                            <span className="text-negative mt-0.5">{'>'}</span>
                            <span>{r}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {keyCatalysts.length > 0 && (
                      <div>
                        <div className="text-text-muted uppercase mb-1 tracking-wider">Key Catalysts</div>
                        {keyCatalysts.slice(0, 3).map((c, i) => (
                          <div key={i} className="text-text/70 mb-0.5 flex items-start gap-1">
                            <span className="text-positive mt-0.5">{'>'}</span>
                            <span>{c}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="mt-2 text-[10px] text-text-muted">
                    Sector: {sector} | Market Cap: ${((meta.market_cap_b as number) || 0).toFixed(0)}B
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
