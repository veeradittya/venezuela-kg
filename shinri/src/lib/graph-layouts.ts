import type { KGNode, KGEdge, CausalPosition } from './types';

export type LayoutMode = 'concentric' | 'causal' | 'force';

/**
 * Master layout dispatcher
 */
export function computeLayout(
  mode: LayoutMode,
  nodes: KGNode[],
  edges: KGEdge[],
  centralNodeId: number | null,
  nodeSizes?: Map<number, number>,
): Map<number, CausalPosition> {
  switch (mode) {
    case 'concentric':
      return concentricLayout(nodes, edges, centralNodeId, nodeSizes);
    case 'force':
      return forceDirectedLayout(nodes, edges, centralNodeId, nodeSizes);
    case 'causal':
    default:
      // Import and call original
      return causalFallback(nodes, edges, centralNodeId, nodeSizes);
  }
}

// ─── Concentric Ring Layout ────────────────────────────────────────
// Ring 0: Central node (PanAgora)
// Ring 1: Top holdings (companies with portfolio_pct > 0), sorted by value
// Ring 2: Sectors
// Ring 3: Factors / concepts / organizations
// Ring 4: People
// Ring 5: Other companies (non-holding companies)

function concentricLayout(
  nodes: KGNode[],
  edges: KGEdge[],
  centralNodeId: number | null,
  nodeSizes?: Map<number, number>,
): Map<number, CausalPosition> {
  const positions = new Map<number, CausalPosition>();
  if (nodes.length === 0) return positions;

  // Find central node
  let centerId = centralNodeId;
  if (!centerId) {
    for (const n of nodes) {
      if (n.type === 'organization' && n.label.toLowerCase().includes('panagora')) {
        centerId = n.id;
        break;
      }
    }
  }

  // Classify nodes into rings
  const ring0: KGNode[] = []; // central
  const ring1: KGNode[] = []; // top holdings (companies with portfolio weight)
  const ring2: KGNode[] = []; // sectors
  const ring3: KGNode[] = []; // factors, concepts, organizations
  const ring4: KGNode[] = []; // people
  const ring5: KGNode[] = []; // other companies (non-portfolio)

  for (const n of nodes) {
    if (n.id === centerId) {
      ring0.push(n);
    } else if (n.type === 'company') {
      const pct = (n.metadata as Record<string, unknown>)?.portfolio_pct;
      if (typeof pct === 'number' && pct > 0) {
        ring1.push(n);
      } else {
        ring5.push(n);
      }
    } else if (n.type === 'sector') {
      ring2.push(n);
    } else if (n.type === 'person') {
      ring4.push(n);
    } else {
      // concept, organization (non-central), event, etc.
      ring3.push(n);
    }
  }

  // Sort ring1 by portfolio value (highest first, placed at top of ring)
  ring1.sort((a, b) => {
    const aVal = ((a.metadata as Record<string, unknown>)?.value_millions as number) || 0;
    const bVal = ((b.metadata as Record<string, unknown>)?.value_millions as number) || 0;
    return bVal - aVal;
  });

  // Sort ring3 by mention count (most connected at top)
  ring3.sort((a, b) => (b.mention_count || 0) - (a.mention_count || 0));

  // Build adjacency for sector grouping
  const adj = new Map<number, Set<number>>();
  for (const e of edges) {
    if (!adj.has(e.source_id)) adj.set(e.source_id, new Set());
    if (!adj.has(e.target_id)) adj.set(e.target_id, new Set());
    adj.get(e.source_id)!.add(e.target_id);
    adj.get(e.target_id)!.add(e.source_id);
  }

  // Sort ring2 (sectors) by how many ring1 companies they connect to
  ring2.sort((a, b) => {
    const aConns = ring1.filter(c => adj.get(a.id)?.has(c.id) || adj.get(c.id)?.has(a.id)).length;
    const bConns = ring1.filter(c => adj.get(b.id)?.has(c.id) || adj.get(c.id)?.has(b.id)).length;
    return bConns - aConns;
  });

  // Layout parameters — viewport is normalized to 4000x2400
  const W = 4000, H = 2400;
  const cx = W / 2, cy = H / 2;
  const minDim = Math.min(W, H);

  // Ring radii as fraction of minDim/2
  const radii = [
    0,                        // Ring 0: center
    minDim * 0.18,            // Ring 1: holdings (close)
    minDim * 0.30,            // Ring 2: sectors
    minDim * 0.42,            // Ring 3: factors/concepts
    minDim * 0.38,            // Ring 4: people (between sectors and factors)
    minDim * 0.48,            // Ring 5: other companies (outermost)
  ];

  // Place ring 0: center
  for (const n of ring0) {
    positions.set(n.id, { x: cx, y: cy, depth: 0, role: 'central' });
  }

  // Place ring 1: holdings in inner ring
  placeRing(ring1, cx, cy, radii[1], positions, 1, 'downstream', -Math.PI / 2);

  // Place ring 2: sectors — position near their connected holdings
  placeRingSectorAware(ring2, ring1, cx, cy, radii[2], positions, adj);

  // Place ring 3: factors/concepts — spread evenly
  placeRing(ring3, cx, cy, radii[3], positions, 3, 'lateral', -Math.PI / 2);

  // Place ring 4: people — position near their connected companies
  placeRingNearNeighbors(ring4, ring1, cx, cy, radii[4], positions, adj, 4);

  // Place ring 5: other companies — outermost
  placeRing(ring5, cx, cy, radii[5], positions, 2, 'downstream', -Math.PI / 2);

  // Overlap resolution
  resolveOverlaps(positions, nodeSizes || new Map(), 30);

  return positions;
}

/**
 * Place nodes evenly around a ring
 */
function placeRing(
  nodes: KGNode[],
  cx: number, cy: number,
  radius: number,
  positions: Map<number, CausalPosition>,
  depth: number,
  role: CausalPosition['role'],
  startAngle: number = -Math.PI / 2,
) {
  if (nodes.length === 0) return;
  const angleStep = (2 * Math.PI) / nodes.length;
  for (let i = 0; i < nodes.length; i++) {
    const angle = startAngle + i * angleStep;
    positions.set(nodes[i].id, {
      x: cx + radius * Math.cos(angle),
      y: cy + radius * Math.sin(angle),
      depth,
      role,
    });
  }
}

/**
 * Place sectors near the angular centroid of their connected holdings
 */
function placeRingSectorAware(
  sectors: KGNode[],
  holdings: KGNode[],
  cx: number, cy: number,
  radius: number,
  positions: Map<number, CausalPosition>,
  adj: Map<number, Set<number>>,
) {
  if (sectors.length === 0) return;

  // For each sector, find average angle of connected holdings
  const sectorAngles: { node: KGNode; angle: number }[] = [];

  for (const sec of sectors) {
    const connectedHoldings = holdings.filter(
      h => adj.get(sec.id)?.has(h.id) || adj.get(h.id)?.has(sec.id)
    );

    if (connectedHoldings.length > 0) {
      let sumSin = 0, sumCos = 0;
      for (const h of connectedHoldings) {
        const pos = positions.get(h.id);
        if (pos) {
          const angle = Math.atan2(pos.y - cy, pos.x - cx);
          sumSin += Math.sin(angle);
          sumCos += Math.cos(angle);
        }
      }
      sectorAngles.push({ node: sec, angle: Math.atan2(sumSin, sumCos) });
    } else {
      // No connections — will be placed in gap
      sectorAngles.push({ node: sec, angle: Infinity });
    }
  }

  // Sort by angle, place unconnected sectors in gaps
  const connected = sectorAngles.filter(s => s.angle !== Infinity);
  const unconnected = sectorAngles.filter(s => s.angle === Infinity);

  connected.sort((a, b) => a.angle - b.angle);

  // Place connected sectors
  for (const { node, angle } of connected) {
    positions.set(node.id, {
      x: cx + radius * Math.cos(angle),
      y: cy + radius * Math.sin(angle),
      depth: 2,
      role: 'downstream',
    });
  }

  // Place unconnected sectors evenly in remaining space
  if (unconnected.length > 0) {
    const step = (2 * Math.PI) / (unconnected.length + connected.length);
    let angle = 0;
    for (const { node } of unconnected) {
      // Find a gap
      while (connected.some(c => Math.abs(c.angle - angle) < step * 0.5)) {
        angle += step * 0.3;
      }
      positions.set(node.id, {
        x: cx + radius * Math.cos(angle),
        y: cy + radius * Math.sin(angle),
        depth: 2,
        role: 'downstream',
      });
      angle += step;
    }
  }
}

/**
 * Place nodes near the angular centroid of their neighbors
 */
function placeRingNearNeighbors(
  nodes: KGNode[],
  referenceNodes: KGNode[],
  cx: number, cy: number,
  radius: number,
  positions: Map<number, CausalPosition>,
  adj: Map<number, Set<number>>,
  depth: number,
) {
  if (nodes.length === 0) return;

  const nodeAngles: { node: KGNode; angle: number; hasConnection: boolean }[] = [];

  for (const n of nodes) {
    const connected = referenceNodes.filter(
      r => adj.get(n.id)?.has(r.id) || adj.get(r.id)?.has(n.id)
    );

    if (connected.length > 0) {
      let sumSin = 0, sumCos = 0;
      for (const c of connected) {
        const pos = positions.get(c.id);
        if (pos) {
          const angle = Math.atan2(pos.y - cy, pos.x - cx);
          sumSin += Math.sin(angle);
          sumCos += Math.cos(angle);
        }
      }
      nodeAngles.push({ node: n, angle: Math.atan2(sumSin, sumCos), hasConnection: true });
    } else {
      nodeAngles.push({ node: n, angle: 0, hasConnection: false });
    }
  }

  // Sort connected by angle
  const connected = nodeAngles.filter(n => n.hasConnection);
  const unconnected = nodeAngles.filter(n => !n.hasConnection);
  connected.sort((a, b) => a.angle - b.angle);

  // Place connected
  // Add slight jitter to prevent exact overlaps
  for (let i = 0; i < connected.length; i++) {
    const { node, angle } = connected[i];
    const jitter = (Math.random() - 0.5) * 0.15;
    positions.set(node.id, {
      x: cx + radius * Math.cos(angle + jitter),
      y: cy + radius * Math.sin(angle + jitter),
      depth,
      role: 'lateral',
    });
  }

  // Place unconnected evenly
  if (unconnected.length > 0) {
    const step = (2 * Math.PI) / unconnected.length;
    for (let i = 0; i < unconnected.length; i++) {
      const angle = -Math.PI / 2 + i * step;
      positions.set(unconnected[i].node.id, {
        x: cx + radius * Math.cos(angle),
        y: cy + radius * Math.sin(angle),
        depth,
        role: 'lateral',
      });
    }
  }
}

// ─── Force-Directed Layout ─────────────────────────────────────────

function forceDirectedLayout(
  nodes: KGNode[],
  edges: KGEdge[],
  centralNodeId: number | null,
  nodeSizes?: Map<number, number>,
): Map<number, CausalPosition> {
  const positions = new Map<number, CausalPosition>();
  if (nodes.length === 0) return positions;

  const W = 4000, H = 2400;
  const cx = W / 2, cy = H / 2;

  // Build adjacency
  const nodeSet = new Set(nodes.map(n => n.id));
  const validEdges = edges.filter(e => nodeSet.has(e.source_id) && nodeSet.has(e.target_id));

  // Initialize positions randomly in a circle
  const posMap = new Map<number, { x: number; y: number; vx: number; vy: number }>();
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    if (n.id === centralNodeId) {
      posMap.set(n.id, { x: cx, y: cy, vx: 0, vy: 0 });
    } else {
      const angle = (i / nodes.length) * 2 * Math.PI;
      const r = 100 + Math.random() * 300;
      posMap.set(n.id, {
        x: cx + r * Math.cos(angle),
        y: cy + r * Math.sin(angle),
        vx: 0, vy: 0,
      });
    }
  }

  // Simulation
  const iterations = 250;
  const repulsionStrength = 15000;
  const attractionStrength = 0.002;
  const damping = 0.88;
  const centerGravity = 0.005;

  for (let iter = 0; iter < iterations; iter++) {
    const temp = 1 - iter / iterations;

    // Repulsion (all pairs — use grid for large graphs)
    const nodeArr = Array.from(posMap.entries());
    for (let i = 0; i < nodeArr.length; i++) {
      const [id1, p1] = nodeArr[i];
      for (let j = i + 1; j < nodeArr.length; j++) {
        const [id2, p2] = nodeArr[j];
        const dx = p1.x - p2.x;
        const dy = p1.y - p2.y;
        const dist2 = dx * dx + dy * dy;
        if (dist2 > 2000000) continue; // Skip distant pairs
        const dist = Math.sqrt(dist2) || 1;
        const force = (repulsionStrength * temp) / dist2;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        p1.vx += fx;
        p1.vy += fy;
        p2.vx -= fx;
        p2.vy -= fy;
      }
    }

    // Attraction (edges)
    for (const e of validEdges) {
      const p1 = posMap.get(e.source_id);
      const p2 = posMap.get(e.target_id);
      if (!p1 || !p2) continue;
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const force = attractionStrength * dist * temp;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      p1.vx += fx;
      p1.vy += fy;
      p2.vx -= fx;
      p2.vy -= fy;
    }

    // Center gravity
    for (const [, p] of posMap) {
      p.vx += (cx - p.x) * centerGravity;
      p.vy += (cy - p.y) * centerGravity;
    }

    // Pin central node
    if (centralNodeId && posMap.has(centralNodeId)) {
      const cp = posMap.get(centralNodeId)!;
      cp.vx = 0;
      cp.vy = 0;
      cp.x = cx;
      cp.y = cy;
    }

    // Apply velocities
    for (const [, p] of posMap) {
      p.x += p.vx * damping;
      p.y += p.vy * damping;
      p.vx *= damping;
      p.vy *= damping;
    }
  }

  // Normalize to viewport
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [, p] of posMap) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  const rangeX = maxX - minX || 1;
  const rangeY = maxY - minY || 1;
  const padding = 200;

  for (const n of nodes) {
    const p = posMap.get(n.id);
    if (p) {
      positions.set(n.id, {
        x: padding + ((p.x - minX) / rangeX) * (W - 2 * padding),
        y: padding + ((p.y - minY) / rangeY) * (H - 2 * padding),
        depth: n.id === centralNodeId ? 0 : 1,
        role: n.id === centralNodeId ? 'central' : 'lateral',
      });
    }
  }

  resolveOverlaps(positions, nodeSizes || new Map(), 20);

  return positions;
}

// ─── Causal / Hierarchical Layout ──────────────────────────────────
// Left-to-right flow: Causes → Transmission → Assets → Portfolio
// Layer 0 (right):  PanAgora (portfolio node)
// Layer 1:          Top holdings (companies with portfolio weight)
// Layer 2:          Sectors
// Layer 3:          Factors, concepts, orgs, events
// Layer 4 (left):   People, geopolitical actors, root causes

function causalFallback(
  nodes: KGNode[],
  edges: KGEdge[],
  centralNodeId: number | null,
  nodeSizes?: Map<number, number>,
): Map<number, CausalPosition> {
  const positions = new Map<number, CausalPosition>();
  if (nodes.length === 0) return positions;

  const W = 4000, H = 2400;
  const padding = 150;

  // Find central node
  let centerId = centralNodeId;
  if (!centerId) {
    for (const n of nodes) {
      if (n.type === 'organization' && n.label.toLowerCase().includes('panagora')) {
        centerId = n.id;
        break;
      }
    }
  }

  // Classify nodes into layers (left-to-right: causes → portfolio)
  const layer0: KGNode[] = []; // Portfolio (rightmost)
  const layer1: KGNode[] = []; // Top holdings
  const layer2: KGNode[] = []; // Sectors
  const layer3: KGNode[] = []; // Factors, concepts, orgs, events, market_events
  const layer4: KGNode[] = []; // People, locations, root causes
  const layer5: KGNode[] = []; // Non-portfolio companies

  for (const n of nodes) {
    if (n.id === centerId) {
      layer0.push(n);
    } else if (n.type === 'company') {
      const pct = (n.metadata as Record<string, unknown>)?.portfolio_pct;
      if (typeof pct === 'number' && pct > 0) {
        layer1.push(n);
      } else {
        layer5.push(n);
      }
    } else if (n.type === 'sector') {
      layer2.push(n);
    } else if (n.type === 'person' || n.type === 'location' || n.type === 'military' || n.type === 'policy') {
      layer4.push(n);
    } else {
      // concept, organization, event, market_event, market
      layer3.push(n);
    }
  }

  // Sort holdings by value
  layer1.sort((a, b) => {
    const aVal = ((a.metadata as Record<string, unknown>)?.value_millions as number) || 0;
    const bVal = ((b.metadata as Record<string, unknown>)?.value_millions as number) || 0;
    return bVal - aVal;
  });

  // Sort factors by mention count
  layer3.sort((a, b) => (b.mention_count || 0) - (a.mention_count || 0));

  // Define X positions for each layer (left to right)
  const layers = [layer4, layer3, layer5, layer2, layer1, layer0];
  const numLayers = layers.length;
  const layerXPositions: number[] = [];
  for (let i = 0; i < numLayers; i++) {
    layerXPositions.push(padding + (i / (numLayers - 1)) * (W - 2 * padding));
  }

  // Build adjacency for vertical ordering
  const adj = new Map<number, Set<number>>();
  for (const e of edges) {
    if (!adj.has(e.source_id)) adj.set(e.source_id, new Set());
    if (!adj.has(e.target_id)) adj.set(e.target_id, new Set());
    adj.get(e.source_id)!.add(e.target_id);
    adj.get(e.target_id)!.add(e.source_id);
  }

  // Place nodes in each layer with barycenter ordering
  for (let li = 0; li < layers.length; li++) {
    const layerNodes = layers[li];
    if (layerNodes.length === 0) continue;
    const x = layerXPositions[li];

    // Try barycenter ordering: sort nodes by avg Y position of already-placed neighbors
    const ordered = orderByBarycenter(layerNodes, positions, adj);

    // Distribute vertically with even spacing
    const totalHeight = H - 2 * padding;
    const spacing = Math.min(totalHeight / (ordered.length + 1), 40);
    const startY = (H - spacing * (ordered.length - 1)) / 2;

    for (let i = 0; i < ordered.length; i++) {
      const n = ordered[i];
      positions.set(n.id, {
        x,
        y: startY + i * spacing,
        depth: li,
        role: li === layers.length - 1 ? 'central' : li >= layers.length - 2 ? 'downstream' : 'upstream',
      });
    }
  }

  resolveOverlaps(positions, nodeSizes || new Map(), 20);

  return positions;
}

/**
 * Order nodes using barycenter heuristic — place each node near the average Y of its
 * already-placed neighbors to minimize edge crossings.
 */
function orderByBarycenter(
  nodes: KGNode[],
  positions: Map<number, CausalPosition>,
  adj: Map<number, Set<number>>,
): KGNode[] {
  const scored: { node: KGNode; score: number }[] = [];

  for (const n of nodes) {
    const neighbors = adj.get(n.id);
    if (neighbors && neighbors.size > 0) {
      let sumY = 0, count = 0;
      for (const nid of neighbors) {
        const pos = positions.get(nid);
        if (pos) {
          sumY += pos.y;
          count++;
        }
      }
      scored.push({ node: n, score: count > 0 ? sumY / count : Infinity });
    } else {
      scored.push({ node: n, score: Infinity });
    }
  }

  // Sort: nodes with neighbor-based scores first, then unconnected
  const connected = scored.filter(s => s.score !== Infinity).sort((a, b) => a.score - b.score);
  const unconnected = scored.filter(s => s.score === Infinity);

  return [...connected.map(s => s.node), ...unconnected.map(s => s.node)];
}

// ─── Shared Utilities ──────────────────────────────────────────────

function resolveOverlaps(
  positions: Map<number, CausalPosition>,
  nodeSizes: Map<number, number>,
  iterations: number,
) {
  const entries = Array.from(positions.entries());
  const padding = 15;

  for (let iter = 0; iter < iterations; iter++) {
    let moved = false;
    for (let i = 0; i < entries.length; i++) {
      for (let j = i + 1; j < entries.length; j++) {
        const [, p1] = entries[i];
        const [, p2] = entries[j];
        const s1 = (nodeSizes.get(entries[i][0]) || 8) + padding;
        const s2 = (nodeSizes.get(entries[j][0]) || 8) + padding;
        const minDist = s1 + s2;

        const dx = p1.x - p2.x;
        const dy = p1.y - p2.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 0.1;

        if (dist < minDist) {
          const overlap = (minDist - dist) / 2;
          const pushX = (dx / dist) * overlap * 0.6;
          const pushY = (dy / dist) * overlap * 0.6;
          p1.x += pushX;
          p1.y += pushY;
          p2.x -= pushX;
          p2.y -= pushY;
          moved = true;
        }
      }
    }
    if (!moved) break;
  }
}
