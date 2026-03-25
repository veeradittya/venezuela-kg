import type { KGEdge } from './types';

export interface CausalChainResult {
  /** Intermediate nodes connecting affected endpoints (nodeId → derived intensity) */
  chainNodes: Map<number, number>;
  /** Edge IDs on causal paths between affected nodes */
  chainEdges: Set<number>;
}

/**
 * Multi-source BFS to discover intermediate "chain" nodes that connect
 * directly-affected nodes through the knowledge graph.
 *
 * Algorithm:
 * 1. Build adjacency from edges
 * 2. BFS from every affected node simultaneously (max depth 3)
 * 3. Any node reachable from 2+ different affected sources = chain node
 * 4. Edges on shortest paths between affected endpoints = chain edges
 * 5. Chain nodes get derived intensity: 0.5 * max(connected affected scores)
 *
 * Performance: O(V + E), sub-millisecond for 200-300 nodes.
 */
export function discoverCausalChain(
  affectedNodes: Map<number, number>,
  edges: KGEdge[],
  maxDepth: number = 3,
  nodeTypes?: Map<number, string>,
): CausalChainResult {
  const chainNodes = new Map<number, number>();
  const chainEdges = new Set<number>();

  if (affectedNodes.size < 2) return { chainNodes, chainEdges };

  // Only traverse causal/adversarial/temporal edges — these represent actual impact pathways
  // Skip correlative, hierarchical, collaborative — these are generic structural associations
  const CAUSAL_EDGE_TYPES = new Set(['causal', 'adversarial', 'temporal']);

  // Build adjacency: nodeId → [{ neighbor, edgeId }]
  const adj = new Map<number, { neighbor: number; edgeId: number }[]>();
  for (const e of edges) {
    if (!CAUSAL_EDGE_TYPES.has(e.causal_type || '')) continue;
    if (!adj.has(e.source_id)) adj.set(e.source_id, []);
    if (!adj.has(e.target_id)) adj.set(e.target_id, []);
    adj.get(e.source_id)!.push({ neighbor: e.target_id, edgeId: e.id });
    adj.get(e.target_id)!.push({ neighbor: e.source_id, edgeId: e.id });
  }

  // Multi-source BFS: track which affected source(s) can reach each node
  // reachability: nodeId → Map<sourceAffectedId, { depth, parentEdgeId }>
  const reachability = new Map<number, Map<number, { depth: number; parentEdge: number | null }>>();

  // Initialize: each affected node is reachable from itself at depth 0
  const queue: { nodeId: number; sourceId: number; depth: number; parentEdge: number | null }[] = [];
  for (const [nodeId] of affectedNodes) {
    const srcMap = new Map<number, { depth: number; parentEdge: number | null }>();
    srcMap.set(nodeId, { depth: 0, parentEdge: null });
    reachability.set(nodeId, srcMap);
    queue.push({ nodeId, sourceId: nodeId, depth: 0, parentEdge: null });
  }

  // BFS
  let qi = 0;
  while (qi < queue.length) {
    const { nodeId, sourceId, depth, parentEdge: _pe } = queue[qi++];
    if (depth >= maxDepth) continue;

    const neighbors = adj.get(nodeId);
    if (!neighbors) continue;

    for (const { neighbor, edgeId } of neighbors) {
      let nodeReach = reachability.get(neighbor);
      if (!nodeReach) {
        nodeReach = new Map();
        reachability.set(neighbor, nodeReach);
      }

      // Only visit if this source hasn't reached this node yet, or found a shorter path
      const existing = nodeReach.get(sourceId);
      if (!existing || existing.depth > depth + 1) {
        nodeReach.set(sourceId, { depth: depth + 1, parentEdge: edgeId });
        queue.push({ nodeId: neighbor, sourceId, depth: depth + 1, parentEdge: edgeId });
      }
    }
  }

  // Chain-eligible types: factors, concepts, events, policies, locations, market events — NOT companies or people
  const CHAIN_TYPES = new Set(['concept', 'event', 'market_event', 'policy', 'location', 'organization', 'sector', 'market', 'military']);

  // Find chain nodes: reachable from 2+ different affected sources, and of a factor-like type
  for (const [nodeId, srcMap] of reachability) {
    if (affectedNodes.has(nodeId)) continue; // skip directly affected
    // If we have type info, only allow factor-like types as chain connectors
    if (nodeTypes && !CHAIN_TYPES.has(nodeTypes.get(nodeId) || '')) continue;
    // Require connection to at least 40% of affected nodes (min 2) to qualify as chain
    const minSources = Math.max(2, Math.ceil(affectedNodes.size * 0.4));
    if (srcMap.size >= minSources) {
      // Derive intensity from the max score of connected affected sources
      let maxScore = 0;
      for (const [srcId] of srcMap) {
        const score = Math.abs(affectedNodes.get(srcId) || 0);
        if (score > maxScore) maxScore = score;
      }
      chainNodes.set(nodeId, maxScore * 0.5);

      // Collect edges on paths from this chain node back to affected sources
      for (const [, { parentEdge }] of srcMap) {
        if (parentEdge !== null) chainEdges.add(parentEdge);
      }
    }
  }

  // Also collect edges directly between affected nodes
  for (const e of edges) {
    if (affectedNodes.has(e.source_id) && affectedNodes.has(e.target_id)) {
      chainEdges.add(e.id);
    }
    // And edges between affected and chain nodes
    if (
      (affectedNodes.has(e.source_id) && chainNodes.has(e.target_id)) ||
      (chainNodes.has(e.source_id) && affectedNodes.has(e.target_id)) ||
      (chainNodes.has(e.source_id) && chainNodes.has(e.target_id))
    ) {
      chainEdges.add(e.id);
    }
  }

  return { chainNodes, chainEdges };
}
