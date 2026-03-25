import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import type { KGNode, KGEdge } from '@/lib/types';

async function fetchAllEdges(nodeIds: number[]): Promise<KGEdge[]> {
  if (nodeIds.length === 0) return [];
  const all: KGEdge[] = [];

  const batchSize = 100;
  for (let i = 0; i < nodeIds.length; i += batchSize) {
    const batch = nodeIds.slice(i, i + batchSize);

    const [sourceRes, targetRes] = await Promise.all([
      supabase.from('kg_edges').select('*').in('source_id', batch),
      supabase.from('kg_edges').select('*').in('target_id', batch),
    ]);

    if (sourceRes.data) all.push(...(sourceRes.data as KGEdge[]));
    if (targetRes.data) all.push(...(targetRes.data as KGEdge[]));
  }

  const seen = new Set<number>();
  return all.filter(e => {
    if (seen.has(e.id)) return false;
    seen.add(e.id);
    return true;
  });
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const view = searchParams.get('view') || 'top20'; // 'top20' or 'complete'

    // 1. Fetch all company nodes with portfolio data
    let companyNodes: KGNode[] = [];
    let page = 0;
    const pageSize = 1000;
    while (true) {
      const { data, error } = await supabase
        .from('kg_nodes')
        .select('*')
        .eq('type', 'company')
        .not('metadata->value_millions', 'is', null)
        .range(page * pageSize, (page + 1) * pageSize - 1);
      if (error) throw error;
      if (!data || data.length === 0) break;
      companyNodes.push(...(data as KGNode[]));
      if (data.length < pageSize) break;
      page++;
    }
    const compError = null;

    if (compError) throw compError;

    // Sort: holdings with portfolio_pct first (by pct desc), then rest by value_millions desc
    const allHoldings = (companyNodes as KGNode[])
      .sort((a, b) => {
        const aPct = ((a.metadata as Record<string, unknown>)?.portfolio_pct as number) || 0;
        const bPct = ((b.metadata as Record<string, unknown>)?.portfolio_pct as number) || 0;
        // Primary holdings (with pct) come first
        if (aPct > 0 && bPct === 0) return -1;
        if (bPct > 0 && aPct === 0) return 1;
        if (aPct > 0 && bPct > 0) return bPct - aPct;
        // Rest sorted by value
        const aVal = ((a.metadata as Record<string, unknown>)?.value_millions as number) || 0;
        const bVal = ((b.metadata as Record<string, unknown>)?.value_millions as number) || 0;
        return bVal - aVal;
      });

    // Select holdings based on view
    const holdings = view === 'complete' ? allHoldings : allHoldings.slice(0, 20);

    // Inject computed rank into metadata for display
    holdings.forEach((n, i) => {
      (n.metadata as Record<string, unknown>).panagora_rank = i + 1;
    });

    const holdingIds = holdings.map(n => n.id);

    // 2. Fetch edges — for performance, only fetch KG connections for top 20 regardless of view
    const kgHoldingIds = allHoldings.slice(0, 20).map(n => n.id);
    const edges = await fetchAllEdges(kgHoldingIds);

    // 3. Get connected neighbor node IDs
    const neighborIds = new Set<number>();
    for (const e of edges) {
      if (!holdingIds.includes(e.source_id)) neighborIds.add(e.source_id);
      if (!holdingIds.includes(e.target_id)) neighborIds.add(e.target_id);
    }

    // 4. Fetch neighbor nodes (batch by IDs)
    let neighbors: KGNode[] = [];
    if (neighborIds.size > 0) {
      const nIds = Array.from(neighborIds);
      const batchSize = 200;
      for (let i = 0; i < nIds.length; i += batchSize) {
        const batch = nIds.slice(i, i + batchSize);
        const { data } = await supabase.from('kg_nodes').select('*').in('id', batch);
        if (data) neighbors.push(...(data as KGNode[]));
      }
    }

    // In top-20 view, filter out company-type neighbors (they're not our holdings, just shared-edge noise)
    if (view === 'top20') {
      const holdingIdSet = new Set(holdingIds);
      neighbors = neighbors.filter(n => n.type !== 'company' || holdingIdSet.has(n.id));
    }

    // 4b. 2nd hop: fetch sub-factor edges (depth 2 → depth 3) for richer factor trees
    const factorIds = neighbors.filter(n => n.type !== 'company' && n.type !== 'organization').map(n => n.id);
    if (factorIds.length > 0 && factorIds.length < 500) {
      const hop2Edges = await fetchAllEdges(factorIds);
      edges.push(...hop2Edges);

      // Fetch the new neighbor nodes (sub-factors at depth 3)
      const hop2NeighborIds = new Set<number>();
      const existingIds = new Set([...holdingIds, ...neighbors.map(n => n.id)]);
      for (const e of hop2Edges) {
        if (!existingIds.has(e.source_id)) hop2NeighborIds.add(e.source_id);
        if (!existingIds.has(e.target_id)) hop2NeighborIds.add(e.target_id);
      }

      if (hop2NeighborIds.size > 0) {
        const h2Ids = Array.from(hop2NeighborIds);
        for (let i = 0; i < h2Ids.length; i += 200) {
          const batch = h2Ids.slice(i, i + 200);
          const { data } = await supabase.from('kg_nodes').select('*').in('id', batch);
          if (data) {
            // Filter: only add non-company nodes (sub-factors, people, etc.)
            const filtered = (data as KGNode[]).filter(n => n.type !== 'company');
            neighbors.push(...filtered);
          }
        }
      }
    }

    // 5. Filter edges to only those where both endpoints exist
    // Also exclude company-to-company edges (these should be mediated by factor nodes)
    const allNodeIds = new Set([...holdingIds, ...neighbors.map(n => n.id)]);
    const companyIdSet = new Set(holdings.filter(n => n.type === 'company').map(n => n.id));
    const validEdges = edges.filter(e => {
      if (!allNodeIds.has(e.source_id) || !allNodeIds.has(e.target_id)) return false;
      // Block company↔company edges — relationships should go through factor nodes
      if (companyIdSet.has(e.source_id) && companyIdSet.has(e.target_id)) return false;
      return true;
    });

    // Deduplicate edges
    const edgeMap = new Map<string, KGEdge>();
    for (const e of validEdges) {
      const key = `${e.source_id}-${e.target_id}`;
      const existing = edgeMap.get(key);
      if (!existing || e.weight > existing.weight) {
        edgeMap.set(key, e);
      }
    }

    return NextResponse.json({
      holdings,
      nodes: [...holdings, ...neighbors],
      edges: Array.from(edgeMap.values()),
      totalHoldings: allHoldings.length,
      view,
    });
  } catch (error) {
    console.error('Portfolio API error:', error);
    return NextResponse.json({ error: 'Failed to fetch portfolio data' }, { status: 500 });
  }
}
