import React, { useMemo, useState, useEffect, useCallback, useRef } from "react";
import ReactFlow, {
  Background, Controls, MiniMap, Panel,
  useNodesState, useEdgesState,
} from "reactflow";
import "reactflow/dist/style.css";
import Graph from "graphology";
import { parse as parseGEXFLib } from "graphology-gexf/browser";
import {
  forceSimulation, forceManyBody, forceLink, forceCenter, forceCollide,
} from "d3-force";

// ── colour maps ────────────────────────────────────────────────────────────────
const TYPE_COLORS = {
  country: "#34d399", organization: "#60a5fa",
  person: "#f472b6",  law: "#a78bfa", concept: "#fb923c",
};
const TYPE_BG = {
  country: "#f0fdf4", organization: "#eff6ff",
  person: "#fdf2f8",  law: "#f5f3ff", concept: "#fff7ed",
};
const REL_COLORS = {
  threatens: "#ef4444", sanctions: "#f97316", opposes: "#eab308",
  controls: "#8b5cf6",  trades_with: "#22c55e", operates_in: "#06b6d4",
  regulates: "#3b82f6", supports: "#84cc16",
};
const POSITIVE_REL = new Set(["trades_with", "operates_in", "supports"]);
const NEGATIVE_REL = new Set(["threatens", "sanctions", "opposes", "regulates", "controls"]);

// ── helpers ────────────────────────────────────────────────────────────────────
function parseCSV(text) {
  const [header, ...rows] = text.trim().split("\n");
  const keys = header.split(",").map(s => s.trim());
  return rows.map(row => {
    const parts = row.split(",");
    return Object.fromEntries(keys.map((k, i) => [k, (parts[i] ?? "").trim()]));
  });
}

// ── force layout ───────────────────────────────────────────────────────────────
function runForceLayout(dataNodes, dataEdges, physics, existingPos) {
  if (!dataNodes.length) return {};
  const simNodes = dataNodes.map(n => ({
    id: n.id,
    x: existingPos[n.id]?.x ?? (Math.random() - 0.5) * 1200,
    y: existingPos[n.id]?.y ?? (Math.random() - 0.5) * 800,
  }));
  const idxMap = Object.fromEntries(simNodes.map((n, i) => [n.id, i]));
  const simEdges = dataEdges
    .filter(e => idxMap[e.source] !== undefined && idxMap[e.target] !== undefined)
    .map(e => ({ source: idxMap[e.source], target: idxMap[e.target] }));

  const sim = forceSimulation(simNodes)
    .force("charge", forceManyBody().strength(physics.charge))
    .force("link",   forceLink(simEdges).distance(physics.linkDistance).strength(0.5))
    .force("center", forceCenter(0, 0).strength(physics.gravity))
    .stop();
  if (physics.collision) sim.force("collision", forceCollide(40));

  // warm-start iterations
  const maxIter = Math.min(
    Math.ceil(Math.log(sim.alphaMin()) / Math.log(1 - sim.alphaDecay())),
    300,
  );
  for (let i = 0; i < maxIter; i++) {
    sim.tick();
    if (physics.wiggle) {
      simNodes.forEach(n => {
        n.vx = (n.vx || 0) + (Math.random() - 0.5) * 1.5;
        n.vy = (n.vy || 0) + (Math.random() - 0.5) * 1.5;
      });
    }
  }
  const positions = {};
  simNodes.forEach(n => { positions[n.id] = { x: n.x, y: n.y }; });
  return positions;
}

// ── DAG algorithms (verbatim from original) ───────────────────────────────────
function buildAdjacency(edges) {
  const out = new Map(), inn = new Map();
  for (const e of edges) {
    if (!out.has(e.source)) out.set(e.source, []);
    if (!inn.has(e.target)) inn.set(e.target, []);
    out.get(e.source).push(e.target);
    inn.get(e.target).push(e.source);
  }
  return { out, inn };
}

function kHopSubgraph({ nodes, edges, centerId, hops, direction }) {
  if (!centerId) return { nodes, edges };
  const nodeSet = new Set([centerId]);
  const { out, inn } = buildAdjacency(edges);
  let frontier = new Set([centerId]);
  for (let i = 0; i < hops; i++) {
    const next = new Set();
    for (const n of frontier) {
      if (direction !== "in")  for (const t of out.get(n) || []) { if (!nodeSet.has(t)) { nodeSet.add(t); next.add(t); } }
      if (direction !== "out") for (const s of inn.get(n) || []) { if (!nodeSet.has(s)) { nodeSet.add(s); next.add(s); } }
    }
    frontier = next;
    if (!frontier.size) break;
  }
  return {
    nodes: nodes.filter(n => nodeSet.has(n.id)),
    edges: edges.filter(e => nodeSet.has(e.source) && nodeSet.has(e.target)),
  };
}

function topoSort(nodeIds, edges) {
  const indeg = new Map(nodeIds.map(id => [id, 0]));
  const out   = new Map(nodeIds.map(id => [id, []]));
  for (const e of edges) {
    if (!indeg.has(e.source) || !indeg.has(e.target)) continue;
    out.get(e.source).push(e.target);
    indeg.set(e.target, (indeg.get(e.target) || 0) + 1);
  }
  const q = [...indeg.entries()].filter(([, d]) => d === 0).map(([id]) => id).sort();
  const order = [];
  while (q.length) {
    const id = q.shift(); order.push(id);
    for (const t of out.get(id) || []) {
      indeg.set(t, indeg.get(t) - 1);
      if (indeg.get(t) === 0) { q.push(t); q.sort(); }
    }
  }
  if (order.length !== nodeIds.length)
    return order.concat(nodeIds.filter(id => !order.includes(id)).sort());
  return order;
}

function computeLayers(nodeIds, edges) {
  const order = topoSort(nodeIds, edges);
  const layer = new Map(nodeIds.map(id => [id, 0]));
  const out   = new Map(nodeIds.map(id => [id, []]));
  for (const e of edges) { if (out.has(e.source) && layer.has(e.target)) out.get(e.source).push(e.target); }
  for (const id of order) {
    const l = layer.get(id) || 0;
    for (const t of out.get(id) || []) { if (l + 1 > (layer.get(t) || 0)) layer.set(t, l + 1); }
  }
  return layer;
}

function layoutDAG(rfNodes, rfEdges, direction) {
  const ids    = rfNodes.map(n => n.id);
  const layer  = computeLayers(ids, rfEdges);
  const buckets = new Map();
  for (const id of ids) {
    const l = layer.get(id) || 0;
    if (!buckets.has(l)) buckets.set(l, []);
    buckets.get(l).push(id);
  }
  for (const [l, arr] of buckets.entries()) { arr.sort(); buckets.set(l, arr); }
  const isH = direction === "LR";
  const pos  = new Map();
  for (const l of [...buckets.keys()].sort((a, b) => a - b)) {
    buckets.get(l).forEach((id, i) => {
      pos.set(id, {
        x: isH ? 40 + l * 320 : 40 + i * 280,
        y: isH ? 40 + i * 120 : 40 + l * 120,
      });
    });
  }
  return {
    nodes: rfNodes.map(n => ({
      ...n,
      targetPosition: isH ? "left"  : "top",
      sourcePosition: isH ? "right" : "bottom",
      position: pos.get(n.id) || { x: 0, y: 0 },
    })),
    edges: rfEdges,
  };
}

// ── ReactFlow converters ───────────────────────────────────────────────────────
function makeRfNodes(nodes, nStyle) {
  return nodes.map(n => {
    const tc = TYPE_COLORS[n.entity_type] || "#94a3b8";
    const bg = TYPE_BG[n.entity_type]    || "#fff";
    const sm = nStyle.sizeByStrength
      ? Math.max(0.65, Math.min(1.9, Math.sqrt((n.mentions || 1) / 200) * nStyle.size))
      : nStyle.size;
    const w  = Math.round(200 * Math.max(0.6, Math.min(2, sm)));
    return {
      id: n.id,
      data: {
        label: (
          <div style={{ fontFamily: "ui-sans-serif,system-ui,-apple-system", fontSize: 11, lineHeight: 1.35 }}>
            {nStyle.showLabels && (
              <>
                <div style={{ fontWeight: 600, maxWidth: w - 22, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {n.label}
                </div>
                <div style={{ opacity: 0.5, fontSize: 9, marginTop: 1 }}>
                  {(n.mentions || 0).toLocaleString()} mentions
                </div>
              </>
            )}
            <div style={{ marginTop: nStyle.showLabels ? 4 : 0 }}>
              <span style={{ border: `1px solid ${tc}`, color: tc, borderRadius: 99, padding: "1px 5px", fontSize: 9 }}>
                {n.entity_type}
              </span>
            </div>
          </div>
        ),
        meta: n,
      },
      style: {
        borderRadius: 14,
        padding: nStyle.showLabels ? 10 : 6,
        border: `1.5px solid ${tc}`,
        boxShadow: "0 6px 20px rgba(0,0,0,0.07)",
        background: bg,
        width: w,
      },
      position: { x: 0, y: 0 },
    };
  });
}

function makeRfEdges(edges, maxFreq, lStyle) {
  return edges.map((e, idx) => {
    const normW = maxFreq > 1 ? Math.log(e.frequency + 1) / Math.log(maxFreq + 1) : 0.5;
    const isCo  = e.edgeType === "cooccurrence";
    const color = isCo ? "#94a3b8" : (REL_COLORS[e.edgeType] || "#94a3b8");
    return {
      id: `e-${e.source}-${e.target}-${idx}`,
      source: e.source,
      target: e.target,
      label: isCo ? String(e.frequency) : `${e.edgeType} · ${e.frequency}`,
      labelStyle: { fontSize: 9, fontFamily: "ui-sans-serif,system-ui" },
      style: {
        strokeWidth: lStyle.width * (1 + 2.5 * normW),
        stroke: color,
        opacity: lStyle.alpha,
      },
      data: { ...e, weight: normW },
    };
  });
}

// ── UI atoms ───────────────────────────────────────────────────────────────────
function Card({ title, children }) {
  return (
    <div className="rounded-2xl border border-black/10 bg-white p-4 shadow-[0_10px_30px_rgba(0,0,0,0.06)]">
      <div className="mb-3 text-sm font-semibold">{title}</div>
      <div className="text-sm text-black/80">{children}</div>
    </div>
  );
}
function Slider({ label, value, min, max, step, onChange, fmt }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs text-black/60">
        <span>{label}</span>
        <span className="tabular-nums font-medium text-black/80">{fmt ? fmt(value) : value}</span>
      </div>
      <input className="w-full accent-blue-500" type="range"
        min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))} />
    </div>
  );
}
function Toggle({ label, checked, onChange }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 text-xs text-black/70">
      <span>{label}</span>
      <input type="checkbox" checked={checked}
        onChange={e => onChange(e.target.checked)} />
    </label>
  );
}
function Select({ label, value, onChange, options }) {
  return (
    <label className="block text-xs text-black/70">
      {label && <div className="mb-1 font-medium">{label}</div>}
      <select className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm"
        value={value} onChange={e => onChange(e.target.value)}>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}

// ── main component ─────────────────────────────────────────────────────────────
export default function App() {
  const [allNodes,      setAllNodes]      = useState([]);
  const [allCoocEdges,  setAllCoocEdges]  = useState([]);
  const [allRelEdges,   setAllRelEdges]   = useState([]);
  const [relTypes,      setRelTypes]      = useState([]);
  const [loading,       setLoading]       = useState(true);

  // ── explore
  const [centerId,     setCenterId]     = useState(null);
  const [edgeSet,      setEdgeSet]      = useState("cooccurrence");
  const [hops,         setHops]         = useState(1);
  const [hopDir,       setHopDir]       = useState("both");
  const [layoutMode,   setLayoutMode]   = useState("LR"); // LR | TB | force

  // ── Netwulf: physics
  const [physics, setPhysics] = useState({
    charge: -30, gravity: 0.1, linkDistance: 80,
    linkDistVar: 0.31, collision: true, wiggle: false, freeze: false,
  });

  // ── Netwulf: nodes
  const [nStyle, setNStyle] = useState({ size: 1.0, showLabels: true, sizeByStrength: true });

  // ── Netwulf: links
  const [lStyle, setLStyle] = useState({ width: 1.0, alpha: 0.65 });

  // ── thresholding / search
  const [minFreq,        setMinFreq]        = useState(300);
  const [activeRelTypes, setActiveRelTypes] = useState(new Set());
  const [showPositive,   setShowPositive]   = useState(true);
  const [showNegative,   setShowNegative]   = useState(true);
  const [query,          setQuery]          = useState("");

  // ── selection
  const [selectedNode, setSelectedNode] = useState(null);
  const [selectedEdge, setSelectedEdge] = useState(null);

  // Stable position cache for force layout
  const forcePosRef = useRef({});

  // ── load data ─────────────────────────────────────────────────────────────
  useEffect(() => {
    Promise.all([
      fetch("/knowledge_network.gexf").then(r => r.text()),
      fetch("/edge_list_cooccurrence.csv").then(r => r.text()),
      fetch("/edge_list_relationships.csv").then(r => r.text()),
    ]).then(([gexfText, coocText, relText]) => {
      const base = parseGEXFLib(Graph, gexfText);
      const nodes = [], labelToId = {};
      base.forEachNode((id, attrs) => {
        nodes.push({
          id, label: attrs.label,
          entity_type: attrs.entity_type || "concept",
          mentions: Number(attrs.mentions) || 0,
          company_detail: attrs.company_detail || "",
        });
        labelToId[attrs.label] = id;
      });
      nodes.sort((a, b) => b.mentions - a.mentions);

      const toEdge = (e, type) => {
        const src = labelToId[e.entity_1], tgt = labelToId[e.entity_2];
        if (!src || !tgt || src === tgt) return null;
        return { source: src, target: tgt, edgeType: type, frequency: parseInt(e.frequency) || 0, sourceLabel: e.entity_1, targetLabel: e.entity_2 };
      };

      const coocEdges = parseCSV(coocText).map(e => toEdge(e, "cooccurrence")).filter(Boolean);
      const relRows   = parseCSV(relText);
      const relEdges  = relRows.map(e => toEdge(e, e.relation_type)).filter(Boolean);
      const types     = [...new Set(relRows.map(r => r.relation_type).filter(Boolean))];

      setAllNodes(nodes);
      setAllCoocEdges(coocEdges);
      setAllRelEdges(relEdges);
      setRelTypes(types);
      setActiveRelTypes(new Set(types));
      setCenterId(nodes[0]?.id ?? null);
      setLoading(false);
    });
  }, []);

  // ── filtered subgraph ─────────────────────────────────────────────────────
  const activeEdges = edgeSet === "cooccurrence" ? allCoocEdges : allRelEdges;
  const maxFreq = useMemo(() => Math.max(...activeEdges.map(e => e.frequency), 1), [activeEdges]);

  const filtered = useMemo(() => {
    if (!centerId || !allNodes.length) return { nodes: [], edges: [] };

    const edges0 = activeEdges.filter(e => {
      if (e.frequency < minFreq) return false;
      if (edgeSet === "relationships") {
        if (!activeRelTypes.has(e.edgeType)) return false;
        if (POSITIVE_REL.has(e.edgeType) && !showPositive) return false;
        if (NEGATIVE_REL.has(e.edgeType) && !showNegative) return false;
      }
      return true;
    });

    const { nodes: n2, edges: e2 } = kHopSubgraph({ nodes: allNodes, edges: edges0, centerId, hops, direction: hopDir });

    const q = query.trim().toLowerCase();
    if (!q) return { nodes: n2, edges: e2 };
    const keep = new Set(n2.filter(n => n.label?.toLowerCase().includes(q)).map(n => n.id));
    const e3   = e2.filter(e => keep.has(e.source) || keep.has(e.target));
    const k2   = new Set(e3.flatMap(e => [e.source, e.target]));
    return { nodes: n2.filter(n => k2.has(n.id)), edges: e3 };
  }, [centerId, activeEdges, minFreq, edgeSet, activeRelTypes, showPositive, showNegative, allNodes, hops, hopDir, query]);

  // ── layout ───────────────────────────────────────────────────────────────
  const rfBase = useMemo(() => {
    const rfNodes = makeRfNodes(filtered.nodes, nStyle);
    const rfEdges = makeRfEdges(filtered.edges, maxFreq, lStyle);

    if (layoutMode !== "force") return layoutDAG(rfNodes, rfEdges, layoutMode);

    if (!physics.freeze) {
      const positions = runForceLayout(filtered.nodes, filtered.edges, physics, forcePosRef.current);
      Object.assign(forcePosRef.current, positions);
    }
    return {
      nodes: rfNodes.map(n => ({
        ...n,
        position: forcePosRef.current[n.id] || { x: Math.random() * 600, y: Math.random() * 400 },
      })),
      edges: rfEdges,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, layoutMode, maxFreq, physics, nStyle, lStyle]);

  const [nodes, setNodes, onNodesChange] = useNodesState(rfBase.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(rfBase.edges);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setNodes(rfBase.nodes); setEdges(rfBase.edges); }, [rfBase.nodes, rfBase.edges]);

  const onNodeClick = useCallback((_, node) => {
    setSelectedEdge(null);
    setSelectedNode(node.data.meta || null);
    setCenterId(node.id);
  }, []);
  const onEdgeClick = useCallback((_, edge) => {
    setSelectedNode(null);
    setSelectedEdge(edge.data || null);
  }, []);

  const stats = useMemo(() => ({
    n:   filtered.nodes.length,
    e:   filtered.edges.length,
    pos: filtered.edges.filter(e => POSITIVE_REL.has(e.edgeType)).length,
    neg: filtered.edges.filter(e => NEGATIVE_REL.has(e.edgeType)).length,
  }), [filtered]);

  const centerOptions = useMemo(() => allNodes.map(n => ({ value: n.id, label: n.label })), [allNodes]);

  const ph = (k, v) => setPhysics(p => ({ ...p, [k]: v }));
  const ns = (k, v) => setNStyle(s  => ({ ...s, [k]: v }));
  const ls = (k, v) => setLStyle(s  => ({ ...s, [k]: v }));

  const freqMax  = edgeSet === "cooccurrence" ? 3000 : 100;
  const freqStep = edgeSet === "cooccurrence" ? 25 : 1;

  if (loading) return (
    <div className="h-screen w-full flex items-center justify-center bg-neutral-50 text-sm text-black/50">
      Loading knowledge graph…
    </div>
  );

  return (
    <div className="h-screen w-full bg-neutral-50">
      <div className="mx-auto flex h-full max-w-[1600px] flex-col">

        {/* ── header ── */}
        <header className="flex items-center justify-between px-4 py-3">
          <div>
            <div className="text-lg font-semibold">Shinri — Knowledge Graph Explorer</div>
            <div className="text-xs text-black/40">
              Click any node to re-focus · co-occurrence &amp; relationship networks
            </div>
          </div>
          <div className="flex items-center gap-2">
            {[
              ["Nodes", stats.n],
              ["Edges", stats.e],
            ].map(([label, val]) => (
              <div key={label} className="rounded-full border border-black/10 bg-white px-3 py-1 text-xs">
                {label} <span className="font-semibold tabular-nums">{val}</span>
              </div>
            ))}
            {edgeSet === "relationships" && (
              <div className="rounded-full border border-black/10 bg-white px-3 py-1 text-xs">
                +<span className="font-semibold">{stats.pos}</span>
                {" / "}−<span className="font-semibold">{stats.neg}</span>
              </div>
            )}
          </div>
        </header>

        <div className="flex min-h-0 flex-1 gap-4 px-4 pb-4">

          {/* ── left panel ── */}
          <div className="w-[300px] shrink-0 space-y-3 overflow-auto pr-1">

            {/* Explore */}
            <Card title="Explore">
              <div className="space-y-3">
                <Select label="Center node" value={centerId || ""} onChange={setCenterId} options={centerOptions} />
                <Select label="Edge set" value={edgeSet}
                  onChange={v => { setEdgeSet(v); setMinFreq(v === "cooccurrence" ? 300 : 5); }}
                  options={[
                    { value: "cooccurrence",  label: "Co-occurrence" },
                    { value: "relationships", label: "Relationships" },
                  ]}
                />
                <Select label="Hop direction" value={hopDir} onChange={setHopDir}
                  options={[
                    { value: "both", label: "Both (in + out)" },
                    { value: "in",   label: "Upstream → center" },
                    { value: "out",  label: "Center → downstream" },
                  ]}
                />
                <Slider label="Max hops" value={hops} min={1} max={4} step={1} onChange={setHops} />
                <Select label="Layout" value={layoutMode} onChange={v => { setLayoutMode(v); if (v !== "force") forcePosRef.current = {}; }}
                  options={[
                    { value: "LR",    label: "DAG Left → Right" },
                    { value: "TB",    label: "DAG Top → Bottom" },
                    { value: "force", label: "⚛ Force (physics)" },
                  ]}
                />
              </div>
            </Card>

            {/* Physics — Netwulf style, only in force mode */}
            {layoutMode === "force" && (
              <Card title="Physics">
                <div className="space-y-3">
                  <Slider label="Charge"               value={physics.charge}       min={-200} max={0}   step={5}    onChange={v => ph("charge", v)} />
                  <Slider label="Gravity"              value={physics.gravity}      min={0}    max={1}   step={0.01} onChange={v => ph("gravity", v)}      fmt={v => v.toFixed(2)} />
                  <Slider label="Link distance"        value={physics.linkDistance} min={10}   max={300} step={5}    onChange={v => ph("linkDistance", v)} />
                  <Slider label="Link dist. variation" value={physics.linkDistVar}  min={0}    max={1}   step={0.01} onChange={v => ph("linkDistVar", v)}  fmt={v => v.toFixed(2)} />
                  <div className="grid grid-cols-1 gap-2 pt-1">
                    <Toggle label="Collision" checked={physics.collision} onChange={v => ph("collision", v)} />
                    <Toggle label="Wiggle"    checked={physics.wiggle}    onChange={v => ph("wiggle", v)} />
                    <Toggle label="Freeze"    checked={physics.freeze}    onChange={v => ph("freeze", v)} />
                  </div>
                </div>
              </Card>
            )}

            {/* Nodes — Netwulf style */}
            <Card title="Nodes">
              <div className="space-y-3">
                <Slider label="Size"         value={nStyle.size} min={0.4} max={2.5} step={0.1} onChange={v => ns("size", v)}            fmt={v => v.toFixed(1)} />
                <div className="pt-1 grid grid-cols-1 gap-2">
                  <Toggle label="Display labels"           checked={nStyle.showLabels}      onChange={v => ns("showLabels", v)} />
                  <Toggle label="Size by strength"         checked={nStyle.sizeByStrength}  onChange={v => ns("sizeByStrength", v)} />
                </div>
                {/* Entity type legend */}
                <div className="pt-1 space-y-1">
                  {Object.entries(TYPE_COLORS).map(([type, color]) => (
                    <div key={type} className="flex items-center gap-2">
                      <div style={{ width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0 }} />
                      <span className="text-xs text-black/60 capitalize">{type}</span>
                    </div>
                  ))}
                </div>
              </div>
            </Card>

            {/* Links — Netwulf style */}
            <Card title="Links">
              <div className="space-y-3">
                <Slider label="Width" value={lStyle.width} min={0.2} max={4}   step={0.1}  onChange={v => ls("width", v)} fmt={v => v.toFixed(1)} />
                <Slider label="Alpha" value={lStyle.alpha} min={0}   max={1}   step={0.05} onChange={v => ls("alpha", v)} fmt={v => v.toFixed(2)} />
              </div>
            </Card>

            {/* Thresholding — Netwulf style */}
            <Card title="Thresholding">
              <div className="space-y-3">
                <Slider label="Min frequency" value={minFreq} min={1} max={freqMax} step={freqStep} onChange={setMinFreq} />
                {edgeSet === "relationships" && (
                  <>
                    <Toggle label="Show positive relations" checked={showPositive} onChange={setShowPositive} />
                    <Toggle label="Show negative relations" checked={showNegative} onChange={setShowNegative} />
                    <div>
                      <div className="mb-1.5 text-xs text-black/40">Relation types</div>
                      <div className="flex flex-wrap gap-1">
                        {relTypes.map(t => (
                          <button key={t}
                            onClick={() => setActiveRelTypes(prev => { const s = new Set(prev); s.has(t) ? s.delete(t) : s.add(t); return s; })}
                            style={{
                              padding: "2px 8px", borderRadius: 99, border: "none", cursor: "pointer", fontSize: 10, fontWeight: 600,
                              background: activeRelTypes.has(t) ? (REL_COLORS[t] || "#6366f1") : "#f1f5f9",
                              color: activeRelTypes.has(t) ? "#fff" : "#94a3b8",
                            }}>
                            {t}
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}
                <div>
                  <div className="mb-1 text-xs text-black/40">Search</div>
                  <input className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm"
                    placeholder="e.g., China, sanctions, climate…"
                    value={query} onChange={e => setQuery(e.target.value)} />
                </div>
              </div>
            </Card>

            {/* Selection */}
            <Card title="Selection">
              {!selectedNode && !selectedEdge && (
                <div className="text-xs text-black/40">Click a node or edge in the graph.</div>
              )}
              {selectedNode && (
                <div className="space-y-2">
                  <div className="text-sm font-semibold leading-snug">{selectedNode.label}</div>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-black/70">
                    <div><span className="text-black/40">Type</span><br />{selectedNode.entity_type}</div>
                    <div><span className="text-black/40">Mentions</span><br /><span className="tabular-nums">{selectedNode.mentions.toLocaleString()}</span></div>
                  </div>
                  {selectedNode.company_detail && (
                    <div className="rounded-xl border border-black/10 bg-neutral-50 p-2.5 text-[10px] text-black/55 leading-relaxed">
                      {selectedNode.company_detail.split(",").slice(0, 20).map(s => s.trim()).join(" · ")}
                      {selectedNode.company_detail.split(",").length > 20 && <span className="text-black/30"> +more</span>}
                    </div>
                  )}
                  <div className="flex gap-2 pt-1">
                    <button className="rounded-xl border border-black/10 bg-white px-3 py-1.5 text-xs shadow-sm hover:bg-neutral-50"
                      onClick={() => setCenterId(selectedNode.id)}>Focus here</button>
                    <button className="rounded-xl border border-black/10 bg-white px-3 py-1.5 text-xs shadow-sm hover:bg-neutral-50"
                      onClick={() => setQuery(selectedNode.label)}>Search</button>
                  </div>
                </div>
              )}
              {selectedEdge && (
                <div className="space-y-2">
                  <div className="text-sm font-semibold leading-snug">{selectedEdge.sourceLabel} → {selectedEdge.targetLabel}</div>
                  <div className="grid grid-cols-2 gap-2 text-xs text-black/70">
                    <div><div className="text-black/40">Type</div>{selectedEdge.edgeType}</div>
                    <div><div className="text-black/40">Frequency</div><span className="tabular-nums">{selectedEdge.frequency.toLocaleString()}</span></div>
                  </div>
                </div>
              )}
            </Card>

            {/* Tips */}
            <Card title="Quick tips">
              <ul className="list-disc space-y-1 pl-4 text-xs text-black/50">
                <li>Click a node to <span className="font-semibold text-black/70">re-center</span>.</li>
                <li>Switch to <span className="font-semibold text-black/70">⚛ Force</span> for live physics.</li>
                <li><span className="font-semibold text-black/70">Freeze</span> locks force positions.</li>
                <li>Raise min frequency to prune weak edges.</li>
              </ul>
            </Card>

          </div>

          {/* ── graph canvas ── */}
          <div className="min-h-0 flex-1 overflow-hidden rounded-2xl border border-black/10 bg-white shadow-[0_10px_30px_rgba(0,0,0,0.06)]">
            <ReactFlow
              nodes={nodes} edges={edges}
              onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
              onNodeClick={onNodeClick} onEdgeClick={onEdgeClick}
              fitView fitViewOptions={{ padding: 0.2 }}
              proOptions={{ hideAttribution: true }}
            >
              <Background />
              <Controls />
              <MiniMap pannable zoomable />
              <Panel position="top-right">
                <div className="rounded-2xl border border-black/10 bg-white/90 px-3 py-2 text-xs shadow-sm backdrop-blur">
                  <div className="font-semibold">Center</div>
                  <div className="text-black/55">{allNodes.find(n => n.id === centerId)?.label ?? "—"}</div>
                </div>
              </Panel>
            </ReactFlow>
          </div>

        </div>
      </div>
    </div>
  );
}
