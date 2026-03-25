import type { KGNode, KGEdge, CausalPosition } from './types';

const LAYER_SPACING = 800;

/** Causal edge types that define directional flow */
const DIRECTIONAL_TYPES = new Set(['causal', 'temporal', 'hierarchical']);

export function computeCausalLayout(
  nodes: KGNode[],
  edges: KGEdge[],
  centralNodeId: number | null,
  nodeSizes?: Map<number, number>,
  dispersion: number = 1.0,
  repulsion: number = 1.0,
): Map<number, CausalPosition> {
  const positions = new Map<number, CausalPosition>();
  if (nodes.length === 0) return positions;

  const nodeMap = new Map<number, KGNode>();
  for (const n of nodes) nodeMap.set(n.id, n);

  // 1. Find central node
  let centerId = centralNodeId;
  if (centerId === null || !nodeMap.has(centerId)) {
    let best: KGNode | null = null;
    for (const n of nodes) {
      if (n.type === 'event') {
        if (!best || n.mention_count > best.mention_count) best = n;
      }
    }
    if (!best) {
      for (const n of nodes) {
        if (!best || n.mention_count > best.mention_count) best = n;
      }
    }
    centerId = best ? best.id : nodes[0].id;
  }

  // 2. Build adjacency lists
  const forward = new Map<number, { nodeId: number; edge: KGEdge }[]>();
  const backward = new Map<number, { nodeId: number; edge: KGEdge }[]>();
  const allNeighbors = new Map<number, Set<number>>();

  for (const e of edges) {
    if (!nodeMap.has(e.source_id) || !nodeMap.has(e.target_id)) continue;

    // Track all neighbors for force simulation
    if (!allNeighbors.has(e.source_id)) allNeighbors.set(e.source_id, new Set());
    if (!allNeighbors.has(e.target_id)) allNeighbors.set(e.target_id, new Set());
    allNeighbors.get(e.source_id)!.add(e.target_id);
    allNeighbors.get(e.target_id)!.add(e.source_id);

    const ct = e.causal_type;
    if (ct && DIRECTIONAL_TYPES.has(ct)) {
      if (!forward.has(e.source_id)) forward.set(e.source_id, []);
      forward.get(e.source_id)!.push({ nodeId: e.target_id, edge: e });
      if (!backward.has(e.target_id)) backward.set(e.target_id, []);
      backward.get(e.target_id)!.push({ nodeId: e.source_id, edge: e });
    }
  }

  // 3. Assign depths — prefer DB causal_depth, fall back to BFS
  const depthMap = new Map<number, number>();
  const roleMap = new Map<number, CausalPosition['role']>();

  // First pass: use DB causal_depth where available
  let hasDbDepths = false;
  for (const n of nodes) {
    if (n.causal_depth !== null && n.causal_depth !== undefined) {
      depthMap.set(n.id, n.causal_depth);
      roleMap.set(n.id, n.causal_depth === 0 ? 'central' : n.causal_depth < 0 ? 'upstream' : 'downstream');
      hasDbDepths = true;
    }
  }

  // If most nodes have DB depths, use those; otherwise fall back to BFS
  if (hasDbDepths && depthMap.size > nodes.length * 0.5) {
    // Fill in any nodes missing causal_depth via neighbor proximity
    for (const n of nodes) {
      if (!depthMap.has(n.id)) {
        // Find nearest neighbor with a depth
        let bestDepth = 1;
        for (const nb of allNeighbors.get(n.id) ?? []) {
          if (depthMap.has(nb)) { bestDepth = depthMap.get(nb)! + 1; break; }
        }
        depthMap.set(n.id, bestDepth);
        roleMap.set(n.id, bestDepth < 0 ? 'upstream' : 'downstream');
      }
    }
  } else {
    // BFS fallback
  depthMap.set(centerId, 0);
  roleMap.set(centerId, 'central');
  const visited = new Set<number>([centerId]);

  // Upstream BFS (backward)
  const upQueue: { nodeId: number; depth: number }[] = [];
  for (const { nodeId } of backward.get(centerId) ?? []) {
    if (!visited.has(nodeId) && nodeMap.has(nodeId)) {
      upQueue.push({ nodeId, depth: -1 });
      visited.add(nodeId);
      depthMap.set(nodeId, -1);
      roleMap.set(nodeId, 'upstream');
    }
  }
  while (upQueue.length > 0) {
    const { nodeId, depth } = upQueue.shift()!;
    for (const { nodeId: nextId } of backward.get(nodeId) ?? []) {
      if (!visited.has(nextId) && nodeMap.has(nextId)) {
        visited.add(nextId);
        depthMap.set(nextId, depth - 1);
        roleMap.set(nextId, 'upstream');
        upQueue.push({ nodeId: nextId, depth: depth - 1 });
      }
    }
  }

  // Downstream BFS (forward)
  const downQueue: { nodeId: number; depth: number }[] = [];
  for (const { nodeId } of forward.get(centerId) ?? []) {
    if (!visited.has(nodeId) && nodeMap.has(nodeId)) {
      downQueue.push({ nodeId, depth: 1 });
      visited.add(nodeId);
      depthMap.set(nodeId, 1);
      roleMap.set(nodeId, 'downstream');
    }
  }
  while (downQueue.length > 0) {
    const { nodeId, depth } = downQueue.shift()!;
    for (const { nodeId: nextId } of forward.get(nodeId) ?? []) {
      if (!visited.has(nextId) && nodeMap.has(nextId)) {
        visited.add(nextId);
        depthMap.set(nextId, depth + 1);
        roleMap.set(nextId, 'downstream');
        downQueue.push({ nodeId: nextId, depth: depth + 1 });
      }
    }
  }

  // Bidirectional BFS for remaining connected nodes
  const bidirQueue: number[] = [...visited];
  let bi = 0;
  while (bi < bidirQueue.length) {
    const nodeId = bidirQueue[bi++];
    const nodeDepth = depthMap.get(nodeId)!;
    for (const neighborId of allNeighbors.get(nodeId) ?? []) {
      if (!visited.has(neighborId) && nodeMap.has(neighborId)) {
        visited.add(neighborId);
        // Place on the side with fewer nodes, slightly further out
        const upCount = [...depthMap.values()].filter(d => d < 0).length;
        const downCount = [...depthMap.values()].filter(d => d > 0).length;
        const newDepth = upCount <= downCount ? nodeDepth - 1 : nodeDepth + 1;
        depthMap.set(neighborId, newDepth);
        roleMap.set(neighborId, newDepth < 0 ? 'upstream' : newDepth > 0 ? 'downstream' : 'lateral');
        bidirQueue.push(neighborId);
      }
    }
  }

  // Unreachable nodes
  const maxAbsDepth = Math.max(1, ...[...depthMap.values()].map(Math.abs));
  for (const n of nodes) {
    if (!visited.has(n.id)) {
      depthMap.set(n.id, -(maxAbsDepth + 1));
      roleMap.set(n.id, 'upstream');
    }
  }
  } // end BFS fallback else block

  // 4. Force-directed layout with x-axis pinning
  // Group nodes by depth for smart initial positioning
  const depthGroups = new Map<number, KGNode[]>();
  for (const n of nodes) {
    const d = depthMap.get(n.id) ?? 0;
    if (!depthGroups.has(d)) depthGroups.set(d, []);
    depthGroups.get(d)!.push(n);
  }

  // Initialize positions with per-depth x-offsets
  // PanAgora (0) close to Assets (1), then wider gap to Factors (2)
  const depthX = (d: number): number => {
    if (d <= 0) return 0;
    if (d === 1) return LAYER_SPACING * 0.4 * dispersion;  // Short link to assets
    return LAYER_SPACING * 1.0 * dispersion;               // Shorter gap to factors
  };
  const pos = new Map<number, { x: number; y: number }>();
  for (const [depth, group] of depthGroups) {
    const baseX = depthX(depth);
    const count = group.length;

    if (depth === 1 && count >= 5) {
      // ASSET ARC: equidistant vertical spread with slight horizontal curve
      group.sort((a, b) => {
        const aVal = ((a.metadata as Record<string, unknown>)?.value_millions as number) || 0;
        const bVal = ((b.metadata as Record<string, unknown>)?.value_millions as number) || 0;
        return bVal - aVal;
      });

      const ySpacing = 60 * dispersion;
      const totalHeight = (count - 1) * ySpacing;
      const arcBulge = LAYER_SPACING * 0.3;

      for (let i = 0; i < group.length; i++) {
        const y = -totalHeight / 2 + i * ySpacing;
        const t = (i / (count - 1 || 1)) * 2 - 1;
        const x = baseX + arcBulge * (1 - t * t);
        pos.set(group[i].id, { x, y });
      }
    } else {
      // DEFAULT: spread vertically with hash-based seeding
      for (let i = 0; i < group.length; i++) {
        const n = group[i];
        let hash = 0;
        for (let j = 0; j < n.label.length; j++) hash = (hash * 31 + n.label.charCodeAt(j)) | 0;
        const seedY = ((hash % 1000) / 1000 - 0.5) * Math.max(count, 10) * 60;
        pos.set(n.id, { x: baseX, y: seedY });
      }
    }
  }

  // COLLAPSE: Merge depth-3+ into depth-2 column, then spread ALL factors vertically
  const depth2X = depthX(2);
  const subFactorOffset = LAYER_SPACING * 0.15 * dispersion;

  // Collect all factor nodes (depth 2 and 3+) into one group
  const factorNodes: { node: KGNode; isSubFactor: boolean }[] = [];
  for (const n of nodes) {
    const d = depthMap.get(n.id) ?? 0;
    const originalDepth = n.causal_depth ?? d;
    if (d >= 2 || originalDepth >= 2) {
      factorNodes.push({ node: n, isSubFactor: originalDepth >= 3 });
      if (originalDepth >= 3) {
        depthMap.set(n.id, 2); // Collapse into depth-2
      }
    }
  }

  // Spread factors as a tree — parent factors on the left, sub-factors branching right
  // Use wide horizontal dispersion to fill the available space
  if (factorNodes.length > 0) {
    // Separate parent factors from sub-factors
    const parents = factorNodes.filter(f => !f.isSubFactor);
    const subs = factorNodes.filter(f => f.isSubFactor);

    // Sort parents by mention_count (most connected at center)
    parents.sort((a, b) => (b.node.mention_count || 1) - (a.node.mention_count || 1));

    // Place parent factors in a vertical arc
    const pSpacing = 35 * dispersion;
    const pTotalHeight = (parents.length - 1) * pSpacing;
    const parentArcBulge = LAYER_SPACING * 0.2;

    for (let i = 0; i < parents.length; i++) {
      const { node: n } = parents[i];
      const y = -pTotalHeight / 2 + i * pSpacing;
      const t = parents.length > 1 ? (i / (parents.length - 1)) * 2 - 1 : 0;
      const arcX = parentArcBulge * (1 - t * t);
      pos.set(n.id, { x: depth2X + arcX, y });
    }

    // Place sub-factors to the RIGHT of their parents, branched out like a tree
    // Group subs by which parent they connect to via edges
    const parentIdSet = new Set(parents.map(p => p.node.id));
    const subsByParent = new Map<number, typeof subs>();
    for (const sub of subs) {
      // Find which parent this sub connects to
      let parentId: number | null = null;
      for (const e of edges) {
        if (e.source_id === sub.node.id && parentIdSet.has(e.target_id)) { parentId = e.target_id; break; }
        if (e.target_id === sub.node.id && parentIdSet.has(e.source_id)) { parentId = e.source_id; break; }
      }
      if (parentId) {
        if (!subsByParent.has(parentId)) subsByParent.set(parentId, []);
        subsByParent.get(parentId)!.push(sub);
      } else {
        // Orphan sub-factor — place near center
        const p = pos.get(sub.node.id);
        if (p) {
          p.x = depth2X + subFactorOffset * 2;
        } else {
          pos.set(sub.node.id, { x: depth2X + subFactorOffset * 2, y: 0 });
        }
      }
    }

    // Position each sub-factor group branching right from its parent
    const branchSpread = LAYER_SPACING * 0.5 * dispersion; // Horizontal branch distance
    const branchYSpread = 20 * dispersion; // Vertical spacing between siblings

    for (const [parentId, children] of subsByParent) {
      const parentPos = pos.get(parentId);
      if (!parentPos) continue;

      for (let j = 0; j < children.length; j++) {
        const { node: n } = children[j];
        // Fan right: each child at increasing x, spread vertically around parent y
        const yOffset = (j - (children.length - 1) / 2) * branchYSpread;
        const xOffset = subFactorOffset + (j % 2 === 0 ? 0 : subFactorOffset * 0.5); // Stagger
        pos.set(n.id, { x: parentPos.x + branchSpread + xOffset, y: parentPos.y + yOffset });
      }
    }
  }

  // Target x positions — STRICTLY pinned to depth column
  const targetX = new Map<number, number>();
  // Target y positions — for arc nodes only, to preserve equidistant spacing
  const targetY = new Map<number, number>();
  for (const n of nodes) {
    const depth = depthMap.get(n.id) ?? 0;
    targetX.set(n.id, depthX(depth));
    // Pin BOTH x and y for arc nodes (depth 1) to preserve exact arc positions
    if (depth === 1) {
      const p = pos.get(n.id);
      if (p) {
        targetY.set(n.id, p.y);
        targetX.set(n.id, p.x); // Override depth-column x with actual arc x
      }
    }
  }

  // Run force simulation (100 iterations)
  const ITERATIONS = 150;
  const REPULSION = 12000 * repulsion;
  const ATTRACTION = 0.003;
  const X_PULL = 0.4; // Strong x-pinning — strict depth columns
  const DAMPING = 0.85;

  for (let iter = 0; iter < ITERATIONS; iter++) {
    const forces = new Map<number, { fx: number; fy: number }>();
    for (const n of nodes) forces.set(n.id, { fx: 0, fy: 0 });

    // Repulsion between all nodes (Barnes-Hut-like: skip distant pairs)
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = pos.get(nodes[i].id)!;
        const b = pos.get(nodes[j].id)!;
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const dist2 = dx * dx + dy * dy + 1;
        if (dist2 > 4000000) continue; // Skip very distant pairs
        const force = REPULSION / dist2;
        const dist = Math.sqrt(dist2);
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        forces.get(nodes[i].id)!.fx += fx;
        forces.get(nodes[i].id)!.fy += fy;
        forces.get(nodes[j].id)!.fx -= fx;
        forces.get(nodes[j].id)!.fy -= fy;
      }
    }

    // Attraction along edges
    for (const e of edges) {
      const a = pos.get(e.source_id);
      const b = pos.get(e.target_id);
      if (!a || !b) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.sqrt(dx * dx + dy * dy) + 1;
      const force = dist * ATTRACTION;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      forces.get(e.source_id)!.fx += fx;
      forces.get(e.source_id)!.fy += fy;
      forces.get(e.target_id)!.fx -= fx;
      forces.get(e.target_id)!.fy -= fy;
    }

    // X-axis gravity: pull nodes toward their depth column
    // Y-axis gravity for arc nodes: preserve arc spacing
    for (const n of nodes) {
      const p = pos.get(n.id)!;
      const tx = targetX.get(n.id)!;
      forces.get(n.id)!.fx += (tx - p.x) * X_PULL;
      const ty = targetY.get(n.id);
      if (ty !== undefined) {
        forces.get(n.id)!.fy += (ty - p.y) * 0.8; // Very strong y-pinning — preserve equidistant arc
      }
    }

    // Apply forces — but skip arc nodes entirely (they're locked in position)
    const decay = 1 - iter / ITERATIONS;
    for (const n of nodes) {
      if (targetY.has(n.id)) continue; // Arc nodes are fully pinned
      const p = pos.get(n.id)!;
      const f = forces.get(n.id)!;
      p.x += f.fx * DAMPING * decay;
      p.y += f.fy * DAMPING * decay;
    }
  }

  // Snap x back to depth columns (clean horizontal alignment)
  for (const n of nodes) {
    const p = pos.get(n.id)!;
    const tx = targetX.get(n.id)!;
    // Blend: 25% snapped, 75% force-directed for wider organic spread
    p.x = tx * 0.25 + p.x * 0.75;
  }

  // 5. Size-aware collision detection & overlap resolution
  // Use actual node sizes (from nodeSizes map) plus padding to determine minimum distance
  const OVERLAP_PADDING = 12;
  const OVERLAP_ITERATIONS = 40;
  const FALLBACK_SIZE = 10;

  const getNodeSize = (id: number): number => {
    return nodeSizes?.get(id) ?? FALLBACK_SIZE;
  };

  for (let iter = 0; iter < OVERLAP_ITERATIONS; iter++) {
    let hadOverlap = false;
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = pos.get(nodes[i].id)!;
        const b = pos.get(nodes[j].id)!;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const minDist = getNodeSize(nodes[i].id) + getNodeSize(nodes[j].id) + OVERLAP_PADDING;
        if (dist < minDist && dist > 0) {
          hadOverlap = true;
          // Stronger push: move 60% of the overlap per iteration instead of 50%
          const overlap = (minDist - dist) * 0.6;
          const nx = dx / dist;
          const ny = dy / dist;
          a.x -= nx * overlap * 0.5;
          a.y -= ny * overlap * 0.5;
          b.x += nx * overlap * 0.5;
          b.y += ny * overlap * 0.5;
        } else if (dist === 0) {
          // Nodes at exact same position: nudge apart
          hadOverlap = true;
          const nudge = (getNodeSize(nodes[i].id) + getNodeSize(nodes[j].id)) / 2 + OVERLAP_PADDING;
          a.x -= nudge;
          b.x += nudge;
        }
      }
    }
    if (!hadOverlap) break; // Converged early
  }

  // 6. Normalize to fill screen space
  // Find bounding box of all positions
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const n of nodes) {
    const p = pos.get(n.id)!;
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }

  // Scale to fill viewport — independent X/Y
  const rangeX = maxX - minX || 1;
  const rangeY = maxY - minY || 1;
  const targetWidth = 4000;
  const targetHeight = 2400;
  const scaleX = targetWidth / rangeX;
  const scaleY = targetHeight / rangeY;
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;

  for (const n of nodes) {
    const p = pos.get(n.id)!;
    p.x = (p.x - cx) * scaleX;
    p.y = (p.y - cy) * scaleY;
  }

  // Build final positions
  for (const n of nodes) {
    const depth = depthMap.get(n.id) ?? 0;
    const role = roleMap.get(n.id) ?? 'lateral';
    const p = pos.get(n.id)!;
    positions.set(n.id, {
      x: p.x,
      y: p.y,
      depth,
      role,
    });
  }

  return positions;
}
