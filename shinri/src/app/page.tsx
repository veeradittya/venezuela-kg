'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import type { KGNode, KGEdge, Signal, ImpactData } from '@/lib/types';
import type { LayoutMode } from '@/lib/graph-layouts';
import PortfolioLedger from '@/components/PortfolioLedger';
import SignalBanner from '@/components/SignalBanner';
import ChatWindow from '@/components/ChatWindow';

// Dynamic import for Sigma.js (no SSR)
const GraphCanvas = dynamic(() => import('@/components/GraphCanvas'), { ssr: false });

type ViewMode = 'top20' | 'complete';

export default function Dashboard() {
  const [nodes, setNodes] = useState<KGNode[]>([]);
  const [edges, setEdges] = useState<KGEdge[]>([]);
  const [holdings, setHoldings] = useState<KGNode[]>([]);
  const [totalHoldings, setTotalHoldings] = useState(0);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedNodeId, setSelectedNodeId] = useState<number | null>(null);
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [impactHighlight, setImpactHighlight] = useState<Map<number, number> | null>(null);
  const [portfolioImpact, setPortfolioImpact] = useState<ImpactData['portfolioImpact'] | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('top20');
  const [viewLoading, setViewLoading] = useState(false);
  const [splitPct, setSplitPct] = useState(50); // % width for left (KG) panel
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [layoutMode, setLayoutMode] = useState<LayoutMode>('concentric');
  const [bfsDepth, setBfsDepth] = useState(1);
  const isDragging = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Theme toggle
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // Resizable divider handlers
  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const pct = ((e.clientX - rect.left) / rect.width) * 100;
      setSplitPct(Math.max(25, Math.min(75, pct)));
    };
    const onMouseUp = () => {
      isDragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, []);

  // Fetch portfolio data
  const fetchPortfolio = useCallback(async (view: ViewMode) => {
    try {
      const res = await fetch(`/api/portfolio?view=${view}`);
      const data = await res.json();
      if (data.holdings) {
        setHoldings(data.holdings);
        setNodes(data.nodes || []);
        setEdges(data.edges || []);
        setTotalHoldings(data.totalHoldings || data.holdings.length);
      }
    } catch (error) {
      console.error('Failed to fetch portfolio:', error);
    }
  }, []);

  // Fetch data on mount
  useEffect(() => {
    async function fetchData() {
      try {
        const [, signalsRes] = await Promise.all([
          fetchPortfolio('top20'),
          fetch('/api/signals'),
        ]);

        const signalsData = await signalsRes.json();
        if (signalsData.signals) {
          setSignals(signalsData.signals);
        }
      } catch (error) {
        console.error('Failed to fetch data:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [fetchPortfolio]);

  // Handle view mode toggle
  const handleViewToggle = useCallback(async (mode: ViewMode) => {
    if (mode === viewMode) return;
    setViewMode(mode);
    setViewLoading(true);
    setSelectedTicker(null);
    setSelectedNodeId(null);
    setImpactHighlight(null);
    setPortfolioImpact(null);
    await fetchPortfolio(mode);
    setViewLoading(false);
  }, [viewMode, fetchPortfolio]);

  const handleSelectNode = useCallback((nodeId: number | null) => {
    setSelectedNodeId(nodeId);
    if (nodeId) {
      const node = nodes.find(n => n.id === nodeId);
      if (node?.type === 'company') {
        const ticker = (node.metadata as Record<string, unknown>)?.ticker as string;
        setSelectedTicker(ticker || null);
      }
    }
  }, [nodes]);

  const handleSelectTicker = useCallback((ticker: string | null) => {
    setSelectedTicker(ticker);
    if (ticker) {
      const node = nodes.find(n => (n.metadata as Record<string, unknown>)?.ticker === ticker);
      if (node) setSelectedNodeId(node.id);
    } else {
      setSelectedNodeId(null);
    }
  }, [nodes]);

  const handleImpactData = useCallback((data: ImpactData) => {
    const highlight = new Map<number, number>();

    // Build lookup maps: ticker → nodeId, label → nodeId
    const tickerToId = new Map<string, number>();
    const labelToId = new Map<string, number>();
    for (const node of nodes) {
      const meta = node.metadata as Record<string, unknown>;
      if (meta?.ticker) {
        tickerToId.set((meta.ticker as string).toUpperCase(), node.id);
      }
      labelToId.set(node.label.toLowerCase(), node.id);
    }

    for (const an of data.affectedNodes) {
      let nodeId: number | undefined;

      // 1. Try as numeric ID directly
      if (typeof an.id === 'number') {
        nodeId = an.id;
      } else {
        const idStr = String(an.id);
        // 2. Try as numeric string
        const asNum = parseInt(idStr, 10);
        if (!isNaN(asNum) && nodes.some(n => n.id === asNum)) {
          nodeId = asNum;
        }
        // 3. Try as ticker (e.g. "MA", "JPM", "PLTR")
        if (!nodeId) {
          nodeId = tickerToId.get(idStr.toUpperCase());
        }
        // 4. Try as label match (e.g. "Regime Change Risk")
        if (!nodeId) {
          nodeId = labelToId.get(idStr.toLowerCase());
        }
        // 5. Try fuzzy label match
        if (!nodeId) {
          const lower = idStr.toLowerCase();
          for (const [label, id] of labelToId) {
            if (label.includes(lower) || lower.includes(label)) {
              nodeId = id;
              break;
            }
          }
        }
      }

      if (nodeId !== undefined) {
        highlight.set(nodeId, an.score);
      } else {
        console.warn('Impact: could not resolve node ID:', an.id, an.label);
      }
    }

    console.log('Impact highlight map:', highlight.size, 'nodes resolved from', data.affectedNodes.length, 'affected');
    setImpactHighlight(highlight);
    setPortfolioImpact(data.portfolioImpact);
  }, [nodes]);

  const handleSignalClick = useCallback(() => {
    setChatOpen(true);
  }, []);

  if (loading) {
    return (
      <div className="h-screen bg-bg flex items-center justify-center">
        <div className="text-center">
          <div className="text-lg font-mono text-accent mb-2">SHINRI</div>
          <div className="text-xs text-text-muted mb-4">Portfolio Risk Intelligence</div>
          <div className="w-6 h-6 border border-text-muted/30 border-t-text-muted rounded-full animate-spin mx-auto" />
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-bg">
      {/* Signal threats banner */}
      <SignalBanner signals={signals} onSignalClick={handleSignalClick} />

      {/* Header */}
      <div className="h-10 bg-panel border-b border-border flex items-center px-4 justify-between">
        <div className="flex items-center gap-3">
          <span className="text-sm font-mono font-medium text-accent tracking-wider">SHINRI</span>
          <span className="w-px h-4 bg-border" />
          <span className="text-[10px] text-text-muted uppercase tracking-widest">PanAgora Asset Management</span>
        </div>
        <div className="flex items-center gap-4 text-[10px] font-mono text-text-muted">
          {/* View toggle */}
          <div className="flex items-center border border-border rounded overflow-hidden">
            <button
              onClick={() => handleViewToggle('top20')}
              className={`px-2 py-0.5 text-[10px] font-mono transition-colors ${
                viewMode === 'top20'
                  ? 'bg-accent/10 text-accent'
                  : 'text-text-muted hover:text-text'
              }`}
            >
              TOP 20
            </button>
            <button
              onClick={() => handleViewToggle('complete')}
              className={`px-2 py-0.5 text-[10px] font-mono transition-colors border-l border-border ${
                viewMode === 'complete'
                  ? 'bg-accent/10 text-accent'
                  : 'text-text-muted hover:text-text'
              }`}
            >
              ALL {totalHoldings}
            </button>
          </div>
          {/* Theme toggle */}
          <button
            onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}
            className="px-2 py-0.5 border border-border rounded text-[10px] font-mono text-text-muted hover:text-text transition-colors"
            title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          >
            {theme === 'dark' ? '☀' : '☾'}
          </button>
          <span>{nodes.length} nodes</span>
          <span>{edges.length} edges</span>
          <span>{holdings.length} holdings</span>
          {viewLoading && (
            <span className="text-accent animate-pulse">loading...</span>
          )}
          {impactHighlight && (
            <>
              <div className="flex items-center gap-1 text-[10px] text-text-muted">
                <span>depth</span>
                {[1, 2, 3].map(d => (
                  <button
                    key={d}
                    onClick={() => setBfsDepth(d)}
                    className={`w-5 h-5 rounded text-[10px] transition-colors ${
                      bfsDepth === d ? 'bg-negative/30 text-negative' : 'bg-border/50 text-text-muted hover:text-text'
                    }`}
                  >
                    {d}
                  </button>
                ))}
              </div>
              <button
                onClick={() => { setImpactHighlight(null); setPortfolioImpact(null); setBfsDepth(1); }}
                className="text-negative hover:text-negative/80 transition-colors"
              >
                [clear]
              </button>
            </>
          )}
        </div>
      </div>

      {/* Main split view */}
      <div ref={containerRef} className="flex-1 flex overflow-hidden">
        {/* Left: Knowledge Graph */}
        <div style={{ width: `${splitPct}%` }} className="relative h-full flex-shrink-0">
          {/* Layout mode toggle — bottom-right of KG panel */}
          <div className="absolute bottom-3 right-3 z-10 flex gap-1 bg-panel/80 backdrop-blur border border-border rounded p-0.5">
            {([['concentric', '◎'], ['force', '⊛'], ['causal', '⇢']] as [LayoutMode, string][]).map(([mode, icon]) => (
              <button
                key={mode}
                onClick={() => setLayoutMode(mode)}
                className={`px-2 py-0.5 text-[10px] font-mono rounded transition-colors ${
                  layoutMode === mode
                    ? 'bg-accent/15 text-accent'
                    : 'text-text-muted hover:text-text'
                }`}
                title={`${mode} layout`}
              >
                {icon} {mode}
              </button>
            ))}
          </div>
          <GraphCanvas
            nodes={nodes}
            edges={edges}
            onSelectNode={handleSelectNode}
            selectedNodeId={selectedNodeId}
            impactHighlight={impactHighlight}
            selectedTicker={selectedTicker}
            layoutMode={layoutMode}
            bfsDepth={bfsDepth}
          />
        </div>

        {/* Draggable divider */}
        <div
          className="w-1 bg-border hover:bg-accent/30 cursor-col-resize flex-shrink-0 relative group transition-colors"
          onMouseDown={() => {
            isDragging.current = true;
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
          }}
        >
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1 h-8 rounded bg-text-muted/30 group-hover:bg-accent/50 transition-colors" />
        </div>

        {/* Right: Portfolio Ledger */}
        <div className="flex-1 overflow-hidden">
          <PortfolioLedger
            holdings={holdings}
            selectedTicker={selectedTicker}
            onSelectTicker={handleSelectTicker}
            portfolioImpact={portfolioImpact}
          />
        </div>
      </div>

      {/* Floating chat */}
      <ChatWindow
        open={chatOpen}
        onToggle={() => setChatOpen(!chatOpen)}
        onImpactData={handleImpactData}
      />
    </div>
  );
}
