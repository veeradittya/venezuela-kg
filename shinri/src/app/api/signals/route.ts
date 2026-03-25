import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import type { KGNode, KGEdge, Signal } from '@/lib/types';

export async function GET() {
  try {
    // 1. Fetch active high-volume events from prediction markets
    const { data: events, error: evtErr } = await supabase
      .from('events')
      .select('id, title, volume_24hr, volume, active, category, source')
      .eq('active', true)
      .order('volume_24hr', { ascending: false })
      .limit(100);

    if (evtErr) throw evtErr;
    if (!events || events.length === 0) {
      return NextResponse.json({ signals: [] });
    }

    // Filter out sports, gaming, entertainment events
    const SPORTS_KEYWORDS = ['vs.', 'nba', 'nfl', 'nhl', 'mlb', 'ufc', 'basketball', 'football', 'soccer', 'tennis',
      'cricket', 'boxing', 'wrestling', 'lakers', 'warriors', 'celtics', 'mavericks', 'pistons', 'raptors', 'clippers',
      'spurs', 'suns', 'kings', 'bucks', 'nets', 'knicks', 'hawks', 'bulls', 'heat', 'magic', 'pacers',
      'cavaliers', 'rockets', 'grizzlies', 'pelicans', 'timberwolves', 'nuggets', 'blazers', 'thunder',
      'real madrid', 'barcelona', 'chelsea', 'manchester', 'liverpool', 'arsenal', 'tottenham', 'psg',
      'paris saint-germain', 'juventus', 'bayern', 'dortmund', 'inter milan', 'ac milan', 'napoli',
      'brentford', 'wolverhampton', 'celta de vigo', 'fc ', ' fc', 'cf ',
      'college basketball', 'march madness', 'super bowl', 'world series', 'stanley cup',
      'championship winner', 'winner?', 'lol:', 'esports', 'bo5', 'bo3', 'league of legends',
      'valspar', 'masters', 'open winner', 'pga', 'lpga', 'wta', 'atp',
      'mrbeast', 'tweets', 'youtube', 'twitch', 'tiktok', 'streaming', 'eurovision', 'gaming',
      'bitcoin above', 'bitcoin below', 'ethereum above', 'ethereum below', 'btc above', 'btc below',
      'solana above', 'doge above', 'crypto'];

    const filteredEvents = events.filter((evt: { title: string; category: string }) => {
      const titleLower = evt.title.toLowerCase();
      const catLower = (evt.category || '').toLowerCase();
      if (catLower === 'sports' || catLower === 'entertainment' || catLower === 'gaming' || catLower === 'pop culture') return false;
      return !SPORTS_KEYWORDS.some(kw => titleLower.includes(kw));
    });

    // 2. Fetch top 20 holdings by value
    const { data: holdings } = await supabase
      .from('kg_nodes')
      .select('id, label, metadata, event_ids')
      .eq('type', 'company')
      .not('metadata->value_millions', 'is', null)
      .limit(1000);

    const top20 = (holdings || [])
      .filter((n) => {
        const pct = (n.metadata as Record<string, unknown>)?.portfolio_pct;
        return typeof pct === 'number' && pct > 0;
      })
      .sort((a, b) => {
        const aPct = ((a.metadata as Record<string, unknown>)?.portfolio_pct as number) || 0;
        const bPct = ((b.metadata as Record<string, unknown>)?.portfolio_pct as number) || 0;
        return bPct - aPct;
      })
      .slice(0, 20) as unknown as KGNode[];

    const holdingIds = top20.map(n => n.id);

    // 3. Fetch edges connected to holdings for cross-referencing
    let allEdges: KGEdge[] = [];
    if (holdingIds.length > 0) {
      const { data: edges } = await supabase
        .from('kg_edges')
        .select('*')
        .or(`source_id.in.(${holdingIds.join(',')}),target_id.in.(${holdingIds.join(',')})`)
        .limit(2000);
      allEdges = (edges || []) as KGEdge[];
    }

    // 4. For each event, find affected holdings
    const maxVol = Math.max(...filteredEvents.map((e: { volume_24hr: number }) => e.volume_24hr || 1));

    const signals: Signal[] = [];

    for (const evt of filteredEvents) {
      const affected: Signal['affectedHoldings'] = [];
      const eventIdStr = String(evt.id);

      // Check direct event_ids match on holdings
      for (const h of top20) {
        if (h.event_ids?.includes(eventIdStr)) {
          const meta = h.metadata as Record<string, unknown>;
          affected.push({
            ticker: (meta.ticker as string) || h.label,
            label: h.label,
            nodeId: h.id,
            edgeWeight: 5,
          });
        }
      }

      // Check edges: find nodes that reference this event, then trace to holdings
      for (const edge of allEdges) {
        const isSource = holdingIds.includes(edge.source_id);
        const isTarget = holdingIds.includes(edge.target_id);
        if ((isSource || isTarget) && edge.event_ids?.includes(eventIdStr)) {
          const holdingId = isSource ? edge.source_id : edge.target_id;
          const holding = top20.find(h => h.id === holdingId);
          if (holding && !affected.find(a => a.nodeId === holdingId)) {
            const meta = holding.metadata as Record<string, unknown>;
            affected.push({
              ticker: (meta.ticker as string) || holding.label,
              label: holding.label,
              nodeId: holding.id,
              edgeWeight: edge.weight || 1,
            });
          }
        }
      }

      // Also check by keyword matching (fallback for events not directly linked)
      if (affected.length === 0) {
        const titleLower = evt.title.toLowerCase();
        const geoKeywords = ['iran', 'china', 'taiwan', 'venezuela', 'maduro', 'tariff', 'oil', 'crude',
          'fed', 'rate', 'war', 'sanctions', 'trade', 'election', 'president', 'invasion', 'strike',
          'ceasefire', 'nuclear', 'opec', 'nato', 'russia', 'ukraine', 'gaza', 'israel', 'lebanon',
          'inflation', 'recession', 'debt ceiling', 'default', 'stimulus', 'regulation'];
        const isGeo = geoKeywords.some(k => titleLower.includes(k));
        if (isGeo) {
          // Geopolitical event — map to top holdings based on keyword relevance
          const oilKeywords = ['oil', 'crude', 'opec', 'iran', 'venezuela', 'sanctions'];
          const finKeywords = ['fed', 'rate', 'inflation', 'recession', 'debt', 'stimulus'];
          const isOil = oilKeywords.some(k => titleLower.includes(k));
          const isFin = finKeywords.some(k => titleLower.includes(k));

          for (const h of top20) {
            const meta = h.metadata as Record<string, unknown>;
            const sector = ((meta.sector as string) || '').toLowerCase();
            const ticker = (meta.ticker as string) || '';
            let weight = 1;

            // Oil events affect energy, financials, LatAm-exposed companies
            if (isOil && ['PM', 'MA', 'JPM', 'BAC', 'PLTR', 'WMT', 'BKNG'].includes(ticker)) weight = 3;
            // Financial events affect banks, insurers
            else if (isFin && ['JPM', 'BAC', 'SYF', 'MA', 'HIG'].includes(ticker)) weight = 3;
            // General geopolitical → top 5 by weight
            else if (affected.length < 5) weight = 2;
            else continue;

            affected.push({
              ticker,
              label: h.label,
              nodeId: h.id,
              edgeWeight: weight,
            });
          }
        }
      }

      // Keep events that have affected holdings OR are high-volume geopolitical
      if (affected.length === 0 && evt.volume_24hr < 2000000) continue;

      // Compute score
      const volumeNorm = (evt.volume_24hr || 0) / maxVol;
      const holdingsFraction = affected.length / 20;
      const avgEdgeWeight = affected.length > 0
        ? affected.reduce((sum, a) => sum + a.edgeWeight, 0) / affected.length / 10
        : 0;

      const score = volumeNorm * 0.4 + holdingsFraction * 0.3 + avgEdgeWeight * 0.3;

      // Get probability from markets
      let probability = 0.5;
      const { data: markets } = await supabase
        .from('markets')
        .select('outcome_prices')
        .eq('event_id', evt.id)
        .limit(1);

      if (markets && markets[0]?.outcome_prices) {
        const prices = markets[0].outcome_prices;
        if (Array.isArray(prices) && prices.length > 0) {
          probability = parseFloat(prices[0]) || 0.5;
        }
      }

      signals.push({
        id: String(evt.id),
        title: evt.title,
        probability,
        volume24hr: evt.volume_24hr || 0,
        volumeTotal: evt.volume || 0,
        source: evt.source || 'polymarket',
        affectedHoldings: affected,
        score,
        category: evt.category || 'geopolitics',
      });
    }

    // Sort by score descending, take top 10
    signals.sort((a, b) => b.score - a.score);

    return NextResponse.json({ signals: signals.slice(0, 15) });
  } catch (error) {
    console.error('Signals API error:', error);
    return NextResponse.json({ signals: [] }, { status: 500 });
  }
}
