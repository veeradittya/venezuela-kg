import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import type { KGNode, KGEdge } from '@/lib/types';

const AI_API_KEY = process.env.ANTHROPIC_API_KEY ?? '';
const AI_GATEWAY_KEY = process.env.DARTMOUTH_API_KEY ?? '';
const AI_GATEWAY_BASE = 'https://chat.dartmouth.edu/api';
const AI_GATEWAY_MODEL = 'anthropic.claude-sonnet-4-5-20250929';

function buildSystemPrompt(
  holdings: KGNode[],
  edges: KGEdge[],
  allNodes: KGNode[],
  signals: { title: string; probability: number; volume24hr: number }[],
): string {
  const today = new Date().toISOString().slice(0, 10);

  // Build portfolio table
  const portfolioRows = holdings.map(h => {
    const m = h.metadata as Record<string, unknown>;
    return `| ${m.panagora_rank || '-'} | ${m.ticker} | ${h.label} | $${(m.value_millions as number || 0).toFixed(0)}M | ${(m.portfolio_pct as number || 0).toFixed(2)}% | ${m.sector || 'N/A'} | ${(m.key_risks as string[] || []).slice(0, 2).join('; ') || 'N/A'} |`;
  }).join('\n');

  // Build KG adjacency (compressed) — prioritize high-weight and geopolitical edges
  const nodeMap = new Map(allNodes.map(n => [n.id, n]));
  // Sort edges: highest weight first, then by causal type (causal > correlative > hierarchical)
  const sortedEdges = [...edges].sort((a, b) => {
    if (b.weight !== a.weight) return b.weight - a.weight;
    const typeOrder: Record<string, number> = { causal: 0, adversarial: 1, correlative: 2, temporal: 3, collaborative: 4, hierarchical: 5 };
    return (typeOrder[a.causal_type || 'hierarchical'] || 5) - (typeOrder[b.causal_type || 'hierarchical'] || 5);
  });
  const kgLines = sortedEdges.slice(0, 400).map(e => {
    const src = nodeMap.get(e.source_id);
    const tgt = nodeMap.get(e.target_id);
    if (!src || !tgt) return null;
    const srcLabel = (src.metadata as Record<string, unknown>)?.ticker as string || src.label;
    const tgtLabel = (tgt.metadata as Record<string, unknown>)?.ticker as string || tgt.label;
    const meta = e.metadata as Record<string, unknown>;
    const mechanism = meta?.mechanism ? ` [${meta.mechanism}]` : '';
    return `${srcLabel} --[${e.relationship}]--> ${tgtLabel} (w:${e.weight}, ${e.causal_type || 'unknown'})${mechanism}`;
  }).filter(Boolean).join('\n');

  // Build signals list
  const signalLines = signals.slice(0, 10).map((s, i) =>
    `${i + 1}. "${s.title}" — ${(s.probability * 100).toFixed(0)}% YES, $${(s.volume24hr / 1000).toFixed(0)}K vol/24h`
  ).join('\n');

  return `You are Shinri, a portfolio risk intelligence engine for PanAgora Asset Management.
TODAY: ${today}

PORTFOLIO (Top 20 Holdings, ~$10.2B total, $28.2B fund):
| # | Ticker | Company | Value | % Port | Sector | Key Risks |
|---|--------|---------|-------|--------|--------|-----------|
${portfolioRows}

KNOWLEDGE GRAPH (${allNodes.length} nodes, ${edges.length} edges):
${kgLines}

ACTIVE PREDICTION MARKET SIGNALS:
${signalLines}

YOUR TASK:
Analyze geopolitical scenarios for portfolio impact. Trace causal chains through KG edges. Assign impact scores.

SCORING SCALE:
1.0 = catastrophic/transformative | 0.5 = significant (10-30% revenue) | 0.2 = moderate (indirect) | 0.05 = minor (sentiment)
delta = holdingValue * impactScore * direction

CRITICAL OUTPUT FORMAT:
Your PROSE response must be UNDER 50 WORDS TOTAL. Use terse sell-side research language:
- One-line thesis (e.g. "Net +32bps. MA/JPM primary beneficiaries via LatAm payment/banking rails.")
- Bullet the top 3-5 affected tickers with direction and one-phrase rationale
- One-line risk caveat
NO headers, NO markdown formatting, NO explanations of methodology, NO numbered lists. Think Bloomberg terminal flash, not research report.

Then on its own line at the END, include the structured data block:
<!-- IMPACT_DATA: {"affectedNodes":[{"id":<nodeId>,"score":<-1.0 to 1.0>,"label":"<name>"}],"portfolioImpact":{"totalDelta":<dollars>,"totalDeltaPercent":<decimal>,"holdings":[{"ticker":"<TICK>","label":"<name>","delta":<dollars>,"deltaPercent":<decimal>,"currentValue":<dollars>}]}} -->

The IMPACT_DATA must be valid JSON. Node IDs must match the KG node IDs provided. Delta values in dollars (negative for losses).

RULES:
- UNDER 50 WORDS of prose. Every word must earn its place. No filler.
- Use KG edges to trace chains — don't assume connections.
- Cross-reference prediction market signals when relevant.
- State confidence (low/med/high) in ONE word.
- The IMPACT_DATA block does NOT count toward the 50-word limit.`;
}

export async function POST(request: Request) {
  try {
    const { message, history } = await request.json();

    if (!AI_API_KEY && !AI_GATEWAY_KEY) {
      return NextResponse.json({ error: 'No API key configured' }, { status: 500 });
    }

    // Fetch portfolio context directly from Supabase (avoid Vercel auth redirect on self-fetch)
    const { data: companyNodes, error: compErr } = await supabase
      .from('kg_nodes')
      .select('*')
      .eq('type', 'company')
      .not('metadata->value_millions', 'is', null)
      .limit(1000);

    if (compErr) console.error('Chat: company fetch error', compErr);

    const holdings = (companyNodes || [])
      .filter((n: KGNode) => {
        const pct = (n.metadata as Record<string, unknown>)?.portfolio_pct;
        return typeof pct === 'number' && pct > 0;
      })
      .sort((a: KGNode, b: KGNode) => {
        const aPct = ((a.metadata as Record<string, unknown>)?.portfolio_pct as number) || 0;
        const bPct = ((b.metadata as Record<string, unknown>)?.portfolio_pct as number) || 0;
        return bPct - aPct;
      })
      .slice(0, 20);

    // Inject rank
    holdings.forEach((n: KGNode, i: number) => {
      (n.metadata as Record<string, unknown>).panagora_rank = i + 1;
    });
    console.log('Chat: loaded', holdings.length, 'holdings, tickers:', holdings.map((h: KGNode) => (h.metadata as Record<string, unknown>)?.ticker).join(','));

    // Get edges for holdings
    const holdingIds = holdings.map(h => h.id);
    let allEdges: KGEdge[] = [];
    for (let i = 0; i < holdingIds.length; i += 50) {
      const batch = holdingIds.slice(i, i + 50);
      const [s, t] = await Promise.all([
        supabase.from('kg_edges').select('*').in('source_id', batch),
        supabase.from('kg_edges').select('*').in('target_id', batch),
      ]);
      if (s.data) allEdges.push(...(s.data as KGEdge[]));
      if (t.data) allEdges.push(...(t.data as KGEdge[]));
    }
    // Deduplicate
    const edgeSeen = new Set<number>();
    allEdges = allEdges.filter(e => { if (edgeSeen.has(e.id)) return false; edgeSeen.add(e.id); return true; });

    // Get neighbor nodes
    const neighborIds = new Set<number>();
    for (const e of allEdges) {
      if (!holdingIds.includes(e.source_id)) neighborIds.add(e.source_id);
      if (!holdingIds.includes(e.target_id)) neighborIds.add(e.target_id);
    }
    let allNodes: KGNode[] = [...holdings];
    if (neighborIds.size > 0) {
      const nIds = Array.from(neighborIds);
      for (let i = 0; i < nIds.length; i += 200) {
        const { data } = await supabase.from('kg_nodes').select('*').in('id', nIds.slice(i, i + 200));
        if (data) allNodes.push(...(data as KGNode[]));
      }
    }

    const portfolioData = { holdings, nodes: allNodes, edges: allEdges };
    const signalsData = { signals: [] }; // Skip signals for chat context to avoid self-fetch

    const systemPrompt = buildSystemPrompt(
      portfolioData.holdings || [],
      portfolioData.edges || [],
      portfolioData.nodes || [],
      signalsData.signals || [],
    );

    // Build messages array
    const messages = [];
    if (history && Array.isArray(history)) {
      for (const msg of history.slice(-6)) {
        if (msg.role === 'user' || msg.role === 'assistant') {
          messages.push({ role: msg.role, content: msg.content });
        }
      }
    }
    messages.push({ role: 'user', content: message });

    // Try Dartmouth gateway first, then Anthropic direct
    const hasGateway = !!AI_GATEWAY_KEY;
    let response: Response;

    if (hasGateway) {
      response = await fetch(`${AI_GATEWAY_BASE}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${AI_GATEWAY_KEY}`,
        },
        body: JSON.stringify({
          model: AI_GATEWAY_MODEL,
          max_tokens: 4000,
          messages: [
            { role: 'system', content: systemPrompt },
            ...messages,
          ],
          stream: true,
      }),
      });

      // If gateway fails, fall back to Anthropic direct
      if (!response.ok && AI_API_KEY) {
        console.warn('Dartmouth gateway failed, falling back to Anthropic direct');
        response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': AI_API_KEY,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 4000,
            system: systemPrompt,
            messages,
            stream: true,
          }),
        });
      }
    } else {
      // No gateway, use Anthropic direct
      response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': AI_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 4000,
          system: systemPrompt,
          messages,
          stream: true,
        }),
      });
    }

    if (!response.ok) {
      const errText = await response.text();
      console.error('AI API error:', errText);
      return NextResponse.json({ error: 'AI analysis failed' }, { status: 500 });
    }

    // Stream the response — handle both OpenAI (Dartmouth) and Anthropic formats
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const reader = response.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const data = line.slice(6).trim();
                if (data === '[DONE]') {
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`));
                  continue;
                }

                try {
                  const parsed = JSON.parse(data);

                  // Anthropic format
                  if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'text', content: parsed.delta.text })}\n\n`));
                  } else if (parsed.type === 'message_stop') {
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`));
                  }

                  // OpenAI format (Dartmouth gateway)
                  if (parsed.choices?.[0]?.delta?.content) {
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'text', content: parsed.choices[0].delta.content })}\n\n`));
                  } else if (parsed.choices?.[0]?.finish_reason === 'stop') {
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`));
                  }
                } catch {
                  // Skip unparseable chunks
                }
              }
            }
          }

          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`));
          controller.close();
        } catch (err) {
          console.error('Stream error:', err);
          controller.error(err);
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (error) {
    console.error('Chat API error:', error);
    return NextResponse.json({ error: 'Failed to process chat request' }, { status: 500 });
  }
}
