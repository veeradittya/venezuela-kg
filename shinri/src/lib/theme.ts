export const COLORS = {
  bg: '#000000',
  panel: '#0a0a0a',
  border: '#1a1a1a',
  text: '#d4d4d4',
  textMuted: '#737373',
  accent: '#ffffff',
  accentGlow: 'rgba(255, 255, 255, 0.15)',
};

export const NODE_COLORS: Record<string, string> = {
  // Hierarchy: org (depth 0) > company (depth 1) > factors (depth 2)
  organization: '#9090b0',     // Organizations — muted lavender-gray (PanAgora overridden to white in GraphCanvas)
  company: '#d4d4d4',          // Holdings — bright gray
  sector: '#c8a882',           // Sectors — warm amber
  person: '#8ab4f8',           // People — soft blue
  concept: '#7a9a7a',          // Factors/concepts — muted green
  policy: '#b87db8',           // Policy — muted purple
  market_event: '#d47070',     // Market events — muted red
  event: '#d47070',            // Events — same red
  location: '#c8a882',         // Locations — amber
  market: '#d47070',           // Markets — red
  military: '#a0a0a0',
  team: '#b8b8b8',
  fund: '#d8d8d8',
};

export const CAUSAL_COLORS: Record<string, string> = {
  causal: '#808080',
  correlative: '#606060',
  hierarchical: '#909090',
  temporal: '#707070',
  adversarial: '#a0a0a0',
  collaborative: '#505050',
};

// Muted, Bloomberg-grade impact colors for heat map visualization
export const IMPACT_COLORS = {
  negative: { low: '#b87a6b', mid: '#c45a3c', high: '#d4463b' },  // dusty coral → burnt sienna → muted crimson
  positive: { low: '#6b9e8a', mid: '#4a9b7f', high: '#3aae8a' },  // sage → teal → deep mint
  mixed: '#c9a557',        // muted amber
  chain: '#555577',        // dim lavender for intermediate/connector nodes
  dimmed: '#151515',       // non-affected background
  edgeNegative: '#9e5a4a', // muted coral edge
  edgePositive: '#4a8e7a', // muted teal edge
  edgeMixed: '#a89050',    // muted amber edge
  edgeChain: '#444466',    // chain edge color
};

/** Interpolate impact color from muted palette based on score (-1 to 1) */
export function impactColor(score: number): string {
  const abs = Math.min(1, Math.abs(score));
  const spectrum = score < 0 ? IMPACT_COLORS.negative : IMPACT_COLORS.positive;

  // Interpolate low → mid → high
  if (abs < 0.3) {
    return spectrum.low;
  } else if (abs < 0.6) {
    return spectrum.mid;
  } else {
    return spectrum.high;
  }
}

/** Interpolate impact edge color */
export function impactEdgeColor(avgScore: number): string {
  if (avgScore < -0.05) return IMPACT_COLORS.edgeNegative;
  if (avgScore > 0.05) return IMPACT_COLORS.edgePositive;
  return IMPACT_COLORS.edgeMixed;
}

/** Dim a hex color by a factor (0-1, where 0 = black, 1 = unchanged) */
export function dimColor(hex: string, factor: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const dr = Math.round(r * factor);
  const dg = Math.round(g * factor);
  const db = Math.round(b * factor);
  return '#' + [dr, dg, db].map(c => Math.min(255, c).toString(16).padStart(2, '0')).join('');
}

export function depthOpacity(depth: number, maxDepth: number): number {
  const normalized = Math.abs(depth) / Math.max(maxDepth, 1);
  return Math.max(0.35, 1 - normalized * 0.65);
}

export function applyOpacity(hex: string, opacity: number): string {
  const alpha = Math.round(opacity * 255).toString(16).padStart(2, '0');
  return hex + alpha;
}

export function formatValue(valueM: number): string {
  if (valueM >= 1000) return `$${(valueM / 1000).toFixed(1)}B`;
  if (valueM >= 1) return `$${valueM.toFixed(0)}M`;
  return `$${(valueM * 1000).toFixed(0)}K`;
}

export function formatDelta(delta: number): string {
  const abs = Math.abs(delta);
  const sign = delta >= 0 ? '+' : '-';
  if (abs >= 1000000000) return `${sign}$${(abs / 1000000000).toFixed(1)}B`;
  if (abs >= 1000000) return `${sign}$${(abs / 1000000).toFixed(0)}M`;
  if (abs >= 1000) return `${sign}$${(abs / 1000).toFixed(0)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}
