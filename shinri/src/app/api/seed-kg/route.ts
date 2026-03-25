import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// POST /api/seed-kg — accepts { nodes: [...], edges: [...] }
export async function POST(request: NextRequest) {
  try {
    const data = await request.json();
    const { nodes, edges } = data;

    if (!nodes || !edges) {
      return NextResponse.json({ error: 'Missing nodes or edges' }, { status: 400 });
    }

    const labelToId = new Map<string, number>();
    let nodesCreated = 0;
    let nodesUpdated = 0;

    // Step 1: Upsert nodes
    for (const node of nodes) {
      const row = {
        label: node.label,
        type: node.type,
        description: node.description || '',
        metadata: node.metadata || {},
        mention_count: node.mention_count || 1,
        event_ids: node.event_ids || ['panagora_enhanced'],
        causal_depth: node.causal_depth ?? null,
        causal_role: node.causal_role ?? null,
        updated_at: new Date().toISOString(),
      };

      // Check if node exists
      const { data: existing } = await supabase
        .from('kg_nodes')
        .select('id, mention_count, event_ids')
        .eq('label', node.label)
        .maybeSingle();

      if (existing) {
        const mergedEvents = [...new Set([...(existing.event_ids || []), ...(row.event_ids || [])])];
        await supabase.from('kg_nodes').update({
          ...row,
          mention_count: Math.max(existing.mention_count || 0, row.mention_count || 1),
          event_ids: mergedEvents,
        }).eq('id', existing.id);
        labelToId.set(node.label, existing.id);
        nodesUpdated++;
      } else {
        const { data: inserted, error } = await supabase
          .from('kg_nodes')
          .insert(row)
          .select('id')
          .single();
        if (error) {
          console.error(`Failed to insert node "${node.label}":`, error.message);
          continue;
        }
        labelToId.set(node.label, inserted.id);
        nodesCreated++;
      }
    }

    // Step 2: Resolve missing labels from DB
    const missingLabels = new Set<string>();
    for (const edge of edges) {
      if (!labelToId.has(edge.source_label)) missingLabels.add(edge.source_label);
      if (!labelToId.has(edge.target_label)) missingLabels.add(edge.target_label);
    }

    if (missingLabels.size > 0) {
      for (const label of missingLabels) {
        const { data: node } = await supabase
          .from('kg_nodes')
          .select('id')
          .eq('label', label)
          .maybeSingle();
        if (node) labelToId.set(label, node.id);
      }
    }

    // Step 3: Insert edges
    let edgesCreated = 0;
    let edgesSkipped = 0;

    for (const edge of edges) {
      const sourceId = labelToId.get(edge.source_label);
      const targetId = labelToId.get(edge.target_label);

      if (!sourceId || !targetId) {
        edgesSkipped++;
        continue;
      }

      const edgeRow = {
        source_id: sourceId,
        target_id: targetId,
        relationship: edge.relationship,
        causal_type: edge.causal_type || 'correlative',
        weight: edge.weight || 1,
        event_ids: edge.event_ids || ['panagora_enhanced'],
        metadata: edge.metadata || {},
      };

      const { error } = await supabase.from('kg_edges').upsert(edgeRow, {
        onConflict: 'source_id,target_id,relationship',
        ignoreDuplicates: false,
      });

      if (error) {
        const { error: e2 } = await supabase.from('kg_edges').insert(edgeRow);
        if (e2) {
          edgesSkipped++;
        } else {
          edgesCreated++;
        }
      } else {
        edgesCreated++;
      }
    }

    return NextResponse.json({
      success: true,
      nodes: { created: nodesCreated, updated: nodesUpdated },
      edges: { created: edgesCreated, skipped: edgesSkipped },
    });
  } catch (error) {
    console.error('Seed KG error:', error);
    return NextResponse.json({ error: 'Failed to seed KG' }, { status: 500 });
  }
}
