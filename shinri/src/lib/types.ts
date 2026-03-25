export interface KGNode {
  id: number;
  label: string;
  type: 'person' | 'organization' | 'event' | 'location' | 'concept' | 'policy' | 'military' | 'market' | 'team' | 'company' | 'fund' | 'sector' | 'market_event';
  description: string | null;
  metadata: Record<string, unknown>;
  mention_count: number;
  event_ids: string[];
  causal_depth: number | null;
  causal_role: 'central' | 'upstream' | 'downstream' | 'lateral' | null;
  last_seen_at: string | null;
}

export interface CausalPosition {
  x: number;
  y: number;
  depth: number;
  role: 'central' | 'upstream' | 'downstream' | 'lateral';
}

export interface KGEdge {
  id: number;
  source_id: number;
  target_id: number;
  relationship: string;
  causal_type: 'causal' | 'correlative' | 'hierarchical' | 'temporal' | 'adversarial' | 'collaborative' | null;
  weight: number;
  evidence: string | null;
  article_ids: number[];
  event_ids: string[];
  metadata: Record<string, unknown>;
}

export interface GraphData {
  nodes: KGNode[];
  edges: KGEdge[];
}

export interface Signal {
  id: string;
  title: string;
  probability: number;
  volume24hr: number;
  volumeTotal: number;
  source: string;
  affectedHoldings: { ticker: string; label: string; nodeId: number; edgeWeight: number }[];
  score: number;
  category: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'status';
  content: string;
  timestamp: number;
  impactData?: ImpactData;
}

export interface ImpactData {
  affectedNodes: { id: number; score: number; label?: string }[];
  portfolioImpact: {
    totalDelta: number;
    totalDeltaPercent: number;
    holdings: { ticker: string; label: string; delta: number; deltaPercent: number; currentValue: number }[];
  };
}

export interface Holding {
  nodeId: number;
  rank: number;
  ticker: string;
  label: string;
  value: number;
  percent: number;
  sector: string;
  industry: string;
  keyRisks: string[];
  keyCatalysts: string[];
  marketCap: number;
  connectedEvents: number;
}
