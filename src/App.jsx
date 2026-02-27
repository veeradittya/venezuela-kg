import { useEffect, useRef, useState } from 'react'
import Graph from 'graphology'
import { parse as parseGexf } from 'graphology-gexf/browser'
import Sigma from 'sigma'
import forceAtlas2 from 'graphology-layout-forceatlas2'

// ── colour maps ────────────────────────────────────────────────────────────────
const REL_COLORS = {
  threatens:   '#ef4444',
  sanctions:   '#f97316',
  opposes:     '#eab308',
  controls:    '#8b5cf6',
  trades_with: '#22c55e',
  operates_in: '#06b6d4',
  regulates:   '#3b82f6',
  supports:    '#84cc16',
}
const REL_COLOR_DEFAULT = '#94a3b8'

const TYPE_COLORS = {
  country:      '#34d399',
  organization: '#60a5fa',
  person:       '#f472b6',
  law:          '#a78bfa',
  concept:      '#fb923c',
}

// ── helpers ───────────────────────────────────────────────────────────────────
function parseCSV(text) {
  const [header, ...rows] = text.trim().split('\n')
  const keys = header.split(',').map(s => s.trim())
  return rows.map(row => {
    const parts = row.split(',')
    return Object.fromEntries(keys.map((k, i) => [k, (parts[i] ?? '').trim()]))
  })
}

function relColor(type) {
  return REL_COLORS[type] ?? REL_COLOR_DEFAULT
}

// ── component ─────────────────────────────────────────────────────────────────
export default function App() {
  const containerRef = useRef(null)
  const sigmaRef     = useRef(null)
  const graphRef     = useRef(null)

  // filterRef is read inside sigma reducers (hot path) — avoids stale closures
  const filterRef = useRef({
    mode: 'cooccurrence',
    minFreq: 50,
    activeRelTypes: new Set(),
    hovered: null,
    hoveredNeighbors: new Set(),
    selected: null,
  })

  const [ready,          setReady]          = useState(false)
  const [mode,           setMode]           = useState('cooccurrence')
  const [minFreq,        setMinFreq]        = useState(50)
  const [relTypes,       setRelTypes]       = useState([])
  const [activeRelTypes, setActiveRelTypes] = useState(new Set())
  const [selected,       setSelected]       = useState(null)   // { id, attrs }
  const [search,         setSearch]         = useState('')
  const [visEdges,       setVisEdges]       = useState(0)

  // ── build graph & init sigma (runs once) ─────────────────────────────────
  useEffect(() => {
    Promise.all([
      fetch('/knowledge_network.gexf').then(r => r.text()),
      fetch('/edge_list_cooccurrence.csv').then(r => r.text()),
      fetch('/edge_list_relationships.csv').then(r => r.text()),
    ]).then(([gexfText, coocText, relText]) => {
      const coocRows = parseCSV(coocText)
      const relRows  = parseCSV(relText)
      const types    = [...new Set(relRows.map(r => r.relation_type).filter(Boolean))]

      setRelTypes(types)
      setActiveRelTypes(new Set(types))
      filterRef.current.activeRelTypes = new Set(types)

      // ── build multigraph (holds both edge sets simultaneously) ──────────
      const base  = parseGexf(Graph, gexfText)
      const graph = new Graph({ type: 'undirected', multi: true })

      const labelToId = {}
      base.forEachNode((id, attrs) => {
        graph.addNode(id, {
          label:          attrs.label,
          x:              Math.random() * 100,
          y:              Math.random() * 100,
          size:           Math.max(5, Math.min(22, Math.sqrt(Number(attrs.mentions) || 1) * 0.4)),
          color:          attrs.color || TYPE_COLORS[attrs.entity_type] || '#94a3b8',
          entity_type:    attrs.entity_type || 'unknown',
          mentions:       Number(attrs.mentions) || 0,
          company_detail: attrs.company_detail || '',
        })
        labelToId[attrs.label] = id
      })

      coocRows.forEach(e => {
        const [src, tgt] = [labelToId[e.entity_1], labelToId[e.entity_2]]
        if (!src || !tgt || src === tgt) return
        try {
          graph.addEdge(src, tgt, {
            edgeType: 'cooccurrence', frequency: parseInt(e.frequency) || 0,
            label: '', color: '#94a3b8', size: 1,
          })
        } catch (_) {}
      })

      relRows.forEach(e => {
        const [src, tgt] = [labelToId[e.entity_1], labelToId[e.entity_2]]
        if (!src || !tgt || src === tgt) return
        try {
          graph.addEdge(src, tgt, {
            edgeType: e.relation_type, frequency: parseInt(e.frequency) || 0,
            label: e.relation_type, color: relColor(e.relation_type), size: 1.5,
          })
        } catch (_) {}
      })

      // ForceAtlas2 layout (synchronous, fast for 151 nodes)
      forceAtlas2.assign(graph, {
        iterations: 200,
        settings: { gravity: 1, scalingRatio: 2, slowDown: 1 },
      })

      graphRef.current = graph

      // ── sigma renderer ──────────────────────────────────────────────────
      const renderer = new Sigma(graph, containerRef.current, {
        renderEdgeLabels: true,
        labelSize: 11,
        labelWeight: 'bold',
        labelColor: { color: '#1e293b' },
        labelRenderedSizeThreshold: 6,
        minEdgeThickness: 0.5,

        nodeReducer: (node, data) => {
          const { hovered, hoveredNeighbors, selected: sel } = filterRef.current
          const res = { ...data }
          if (hovered && node !== hovered && !hoveredNeighbors.has(node)) {
            res.color = '#d1d5db'
            res.label = ''
            res.size  = data.size * 0.6
          }
          if (sel === node) {
            res.highlighted = true
            res.size = data.size * 1.4
          }
          return res
        },

        edgeReducer: (edge, data) => {
          const { mode: m, minFreq: mf, activeRelTypes: art, hovered } = filterRef.current
          const res = { ...data }
          const { edgeType, frequency } = data
          const isCo = edgeType === 'cooccurrence'

          if (m === 'cooccurrence' && !isCo)  { res.hidden = true; return res }
          if (m === 'relationships' && isCo)   { res.hidden = true; return res }
          if (frequency < mf)                  { res.hidden = true; return res }
          if (!isCo && !art.has(edgeType))     { res.hidden = true; return res }

          res.size  = Math.max(0.5, Math.min(5, Math.log(frequency + 1)))
          res.label = isCo ? '' : data.label

          if (hovered) {
            const [s, t] = graph.extremities(edge)
            if (s !== hovered && t !== hovered) res.hidden = true
          }
          return res
        },
      })

      renderer.on('enterNode', ({ node }) => {
        filterRef.current.hovered = node
        filterRef.current.hoveredNeighbors = new Set(graph.neighbors(node))
        renderer.refresh({ skipIndexation: true })
      })
      renderer.on('leaveNode', () => {
        filterRef.current.hovered = null
        filterRef.current.hoveredNeighbors = new Set()
        renderer.refresh({ skipIndexation: true })
      })
      renderer.on('clickNode', ({ node }) => {
        filterRef.current.selected = node
        setSelected({ id: node, attrs: graph.getNodeAttributes(node) })
        renderer.refresh({ skipIndexation: true })
      })
      renderer.on('clickStage', () => {
        filterRef.current.selected = null
        setSelected(null)
        renderer.refresh({ skipIndexation: true })
      })

      sigmaRef.current = renderer
      countEdges(graph, filterRef.current)
      setReady(true)
    })

    return () => { sigmaRef.current?.kill() }
  }, [])

  // ── sync React state → filterRef + refresh ───────────────────────────────
  useEffect(() => {
    filterRef.current = { ...filterRef.current, mode, minFreq, activeRelTypes }
    sigmaRef.current?.refresh({ skipIndexation: true })
    if (graphRef.current) countEdges(graphRef.current, filterRef.current)
  }, [mode, minFreq, activeRelTypes])

  function countEdges(g, f) {
    let n = 0
    g.forEachEdge((_, { edgeType, frequency }) => {
      const isCo = edgeType === 'cooccurrence'
      if (f.mode === 'cooccurrence' && !isCo) return
      if (f.mode === 'relationships' && isCo)  return
      if (frequency < f.minFreq)               return
      if (!isCo && !f.activeRelTypes.has(edgeType)) return
      n++
    })
    setVisEdges(n)
  }

  // ── search ────────────────────────────────────────────────────────────────
  function handleSearch(q) {
    setSearch(q)
    if (!q || !graphRef.current || !sigmaRef.current) return
    let found = null
    graphRef.current.someNode((node, attrs) => {
      if (attrs.label?.toLowerCase().includes(q.toLowerCase())) { found = node; return true }
    })
    if (!found) return
    filterRef.current.selected = found
    setSelected({ id: found, attrs: graphRef.current.getNodeAttributes(found) })
    const pos = sigmaRef.current.getNodeDisplayData(found)
    if (pos) sigmaRef.current.getCamera().animate({ x: pos.x, y: pos.y, ratio: 0.25 }, { duration: 500 })
    sigmaRef.current.refresh({ skipIndexation: true })
  }

  function switchMode(m) {
    setMode(m)
    setMinFreq(m === 'cooccurrence' ? 50 : 5)
  }

  function toggleRelType(t) {
    setActiveRelTypes(prev => { const s = new Set(prev); s.has(t) ? s.delete(t) : s.add(t); return s })
  }

  function resetView() {
    sigmaRef.current?.getCamera().animatedReset()
  }

  function closeDetail() {
    filterRef.current.selected = null
    setSelected(null)
    sigmaRef.current?.refresh({ skipIndexation: true })
  }

  // ── render ────────────────────────────────────────────────────────────────
  return (
    <div style={S.root}>

      {/* ── left controls ──────────────────────────────────────────────── */}
      <aside style={S.panel}>
        <div style={{ fontWeight: 700, fontSize: 15, color: '#0f172a', marginBottom: 18 }}>
          Shinri · Knowledge Graph
        </div>

        <Label>Search</Label>
        <input
          style={S.input}
          placeholder="Entity name…"
          value={search}
          onChange={e => handleSearch(e.target.value)}
        />

        <Label top={14}>Edge type</Label>
        <div style={{ display: 'flex', gap: 6 }}>
          {['cooccurrence', 'relationships'].map(m => (
            <button key={m} onClick={() => switchMode(m)}
              style={{ ...S.btn, ...(mode === m ? S.btnOn : {}) }}>
              {m === 'cooccurrence' ? 'Co-occurrence' : 'Relationships'}
            </button>
          ))}
        </div>

        <Label top={14}>Min frequency — {minFreq}</Label>
        <input type="range" style={{ width: '100%' }}
          min={1} max={mode === 'cooccurrence' ? 1000 : 100}
          value={minFreq}
          onChange={e => setMinFreq(Number(e.target.value))}
        />

        {mode === 'relationships' && <>
          <Label top={14}>Relation types</Label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {relTypes.map(t => (
              <button key={t} onClick={() => toggleRelType(t)}
                style={{
                  ...S.tag,
                  background: activeRelTypes.has(t) ? relColor(t) : '#f1f5f9',
                  color: activeRelTypes.has(t) ? '#fff' : '#64748b',
                }}>
                {t}
              </button>
            ))}
          </div>
        </>}

        {mode === 'cooccurrence' && <>
          <Label top={14}>Entity types</Label>
          {Object.entries(TYPE_COLORS).map(([type, color]) => (
            <div key={type} style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 5 }}>
              <div style={{ width: 9, height: 9, borderRadius: '50%', background: color, flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: '#475569', textTransform: 'capitalize' }}>{type}</span>
            </div>
          ))}
        </>}

        <div style={{ marginTop: 'auto', paddingTop: 12 }}>
          <button onClick={resetView} style={S.resetBtn}>Reset view</button>
          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 8 }}>
            {graphRef.current?.order ?? 0} nodes · {visEdges} edges
          </div>
        </div>
      </aside>

      {/* ── graph canvas ───────────────────────────────────────────────── */}
      <div style={{ flex: 1, position: 'relative' }}>
        {!ready && (
          <div style={S.loader}>Building graph…</div>
        )}
        <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
      </div>

      {/* ── node detail ────────────────────────────────────────────────── */}
      {selected && (
        <aside style={{ ...S.panel, borderLeft: '1px solid #e2e8f0', borderRight: 'none' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', lineHeight: 1.4, paddingRight: 8 }}>
              {selected.attrs.label}
            </h3>
            <button onClick={closeDetail} style={S.closeBtn}>×</button>
          </div>
          <hr style={{ margin: '10px 0', border: 'none', borderTop: '1px solid #e2e8f0' }} />

          <Row label="Type">
            <span style={{
              padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 600,
              background: (selected.attrs.color || '#94a3b8') + '22',
              color: selected.attrs.color || '#94a3b8',
            }}>
              {selected.attrs.entity_type}
            </span>
          </Row>
          <Row label="Mentions">
            <strong style={{ fontSize: 13 }}>{selected.attrs.mentions?.toLocaleString()}</strong>
          </Row>

          {selected.attrs.company_detail && (
            <div style={{ marginTop: 10 }}>
              <Label>Associated tickers</Label>
              <div style={{ fontSize: 11, color: '#475569', lineHeight: 1.9, marginTop: 4 }}>
                {selected.attrs.company_detail.split(',').slice(0, 24).map(s => s.trim()).join(' · ')}
                {selected.attrs.company_detail.split(',').length > 24 &&
                  <span style={{ color: '#94a3b8' }}> +more</span>}
              </div>
            </div>
          )}
        </aside>
      )}
    </div>
  )
}

// ── small UI helpers ──────────────────────────────────────────────────────────
function Label({ children, top = 0 }) {
  return (
    <div style={{
      fontSize: 10, fontWeight: 700, color: '#94a3b8',
      textTransform: 'uppercase', letterSpacing: '0.08em',
      marginTop: top, marginBottom: 6,
    }}>
      {children}
    </div>
  )
}

function Row({ label, children }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, fontSize: 13 }}>
      <span style={{ color: '#64748b' }}>{label}</span>
      {children}
    </div>
  )
}

// ── styles ────────────────────────────────────────────────────────────────────
const S = {
  root:     { display: 'flex', height: '100vh', fontFamily: 'system-ui,-apple-system,sans-serif', background: '#f8fafc' },
  panel:    { width: 256, padding: '16px 14px', overflowY: 'auto', background: '#fff', borderRight: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', flexShrink: 0 },
  input:    { width: '100%', padding: '6px 10px', border: '1px solid #e2e8f0', borderRadius: 7, fontSize: 13, outline: 'none', marginBottom: 2 },
  btn:      { flex: 1, padding: '6px 4px', border: '1px solid #e2e8f0', borderRadius: 7, cursor: 'pointer', fontSize: 12, fontWeight: 500, background: '#f8fafc', color: '#64748b' },
  btnOn:    { background: '#6366f1', color: '#fff', borderColor: '#6366f1' },
  tag:      { padding: '3px 9px', border: 'none', borderRadius: 99, cursor: 'pointer', fontSize: 11, fontWeight: 600, transition: 'background .15s' },
  resetBtn: { width: '100%', padding: '6px', border: '1px solid #e2e8f0', borderRadius: 7, cursor: 'pointer', fontSize: 12, color: '#64748b', background: '#f8fafc' },
  closeBtn: { border: 'none', background: 'none', cursor: 'pointer', fontSize: 22, color: '#94a3b8', lineHeight: 1, flexShrink: 0 },
  loader:   { position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc', zIndex: 10, fontSize: 15, color: '#6366f1' },
}
