'use client';

import { useEffect, useRef } from 'react';
import Graph from 'graphology';
import { SigmaContainer, useLoadGraph, useRegisterEvents, useSigma } from '@react-sigma/core';
import '@react-sigma/core/lib/style.css';
import type { KGNode, KGEdge } from '@/lib/types';
import { NODE_COLORS, depthOpacity, applyOpacity } from '@/lib/theme';
import { computeLayout, type LayoutMode } from '@/lib/graph-layouts';
import { discoverCausalChain } from '@/lib/causal-chain';
// Edge programs removed — monochrome line edges only

interface GraphCanvasProps {
  nodes: KGNode[];
  edges: KGEdge[];
  onSelectNode: (nodeId: number | null) => void;
  selectedNodeId: number | null;
  layoutMode?: LayoutMode;
  impactHighlight: Map<number, number> | null;
  selectedTicker: string | null;
  bfsDepth?: number;
}

function getNeighborsAtDepth(graph: Graph, nodeKey: string, depth: number): Set<string> {
  const visited = new Set([nodeKey]);
  let frontier = [nodeKey];
  for (let d = 0; d < depth; d++) {
    const nextFrontier: string[] = [];
    for (const key of frontier) {
      for (const neighbor of graph.neighbors(key)) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          nextFrontier.push(neighbor);
        }
      }
    }
    frontier = nextFrontier;
  }
  return visited;
}

function GraphLoader({
  nodes,
  edges,
  onSelectNode,
  impactHighlight,
  selectedTicker,
  layoutMode = 'concentric',
  bfsDepth = 1,
}: GraphCanvasProps) {
  const loadGraph = useLoadGraph();
  const registerEvents = useRegisterEvents();
  const sigma = useSigma();
  const hoveredNodeRef = useRef<string | null>(null);
  const draggedNodeRef = useRef<string | null>(null);
  const isDraggingRef = useRef(false);
  const originalPositionsRef = useRef<Map<string, { x: number; y: number }>>(new Map());
  const springAnimRef = useRef<number | null>(null);

  // Build and load graph
  useEffect(() => {
    const graph = new Graph();
    const isImpactMode = impactHighlight && impactHighlight.size > 0;

    // Discover causal chain: intermediate nodes + chain edges
    const chain = isImpactMode
      ? discoverCausalChain(impactHighlight, edges, bfsDepth, new Map(nodes.map(n => [n.id, n.type])))
      : { chainNodes: new Map<number, number>(), chainEdges: new Set<number>() };

    // Find central node: PanAgora Asset Management (organization at depth 0), fallback to highest value company
    let centralNodeId: number | null = null;
    for (const node of nodes) {
      if (node.type === 'organization' && node.label.toLowerCase().includes('panagora')) {
        centralNodeId = node.id;
        break;
      }
    }
    if (!centralNodeId) {
      let maxVal = 0;
      for (const node of nodes) {
        if (node.type === 'company') {
          const val = (node.metadata as Record<string, unknown>)?.value_millions;
          if (typeof val === 'number' && val > maxVal) {
            maxVal = val;
            centralNodeId = node.id;
          }
        }
      }
    }

    // Pre-compute sizes — company nodes are uniform size, others scale by mention_count
    const COMPANY_SIZE = 10;
    const nodeSizeMap = new Map<number, number>();
    for (const node of nodes) {
      let sz: number;
      if (node.type === 'company') {
        sz = COMPANY_SIZE; // Uniform size — brightness differentiates value
      } else if (node.id === centralNodeId && node.type === 'organization') {
        sz = 20; // PanAgora only — largest node
      } else {
        const mentionSize = Math.log2((node.mention_count || 1) + 1) * 2.5;
        sz = Math.max(4, Math.min(15, mentionSize));
      }
      nodeSizeMap.set(node.id, sz);
    }

    // Compute layout
    const allTypes = new Set(nodes.map(n => n.type));
    const causalPositions = computeLayout(layoutMode, nodes, edges, centralNodeId, nodeSizeMap);

    let maxDepth = 1;
    for (const pos of causalPositions.values()) {
      const absD = Math.abs(pos.depth);
      if (absD > maxDepth) maxDepth = absD;
    }

    const nodeIdSet = new Set<number>();

    // Find selected ticker's node for highlighting
    let selectedNodeKey: string | null = null;
    if (selectedTicker) {
      for (const n of nodes) {
        if ((n.metadata as Record<string, unknown>)?.ticker === selectedTicker) {
          selectedNodeKey = String(n.id);
          break;
        }
      }
    }

    // Build selected ticker's neighbor set
    let selectedNeighborIds: Set<number> | null = null;
    if (selectedNodeKey) {
      selectedNeighborIds = new Set<number>();
      const sid = parseInt(selectedNodeKey);
      selectedNeighborIds.add(sid);
      for (const e of edges) {
        if (e.source_id === sid) selectedNeighborIds.add(e.target_id);
        if (e.target_id === sid) selectedNeighborIds.add(e.source_id);
      }
    }

    for (const node of nodes) {
      nodeIdSet.add(node.id);
      const position = causalPositions.get(node.id) ?? { x: 0, y: 0, depth: 0, role: 'lateral' as const };

      let size = nodeSizeMap.get(node.id) || 8;
      let color: string;

      if (isImpactMode) {
        const impactScore = impactHighlight!.get(node.id);
        const isChainNode = chain.chainNodes.has(node.id);

        if (impactScore !== undefined) {
          // Directly affected: brightness scales with impact score — all translucent
          const absScore = Math.min(1, Math.abs(impactScore));
          // Opacity: 0.55 (low impact) to 0.95 (high impact)
          const opacity = Math.round((0.55 + absScore * 0.4) * 255);
          color = '#8b1a1a' + opacity.toString(16).padStart(2, '0');
        } else if (node.id === centralNodeId) {
          // PanAgora: bright, slightly translucent
          color = '#8b1a1a' + 'dd';
        } else if (isChainNode) {
          // Chain connector: dimmer than any directly affected node
          color = '#8b1a1a' + '66';
        } else {
          // EVERYTHING ELSE: visible gray — shrunk
          color = '#1e1e1e';
          size = Math.max(2, size * 0.5);
        }
      } else if (selectedNeighborIds) {
        if (selectedNeighborIds.has(node.id)) {
          if (String(node.id) === selectedNodeKey) {
            color = '#ffffff';
            size = size * 1.4;
          } else {
            const baseColor = NODE_COLORS[node.type] || '#606060';
            color = baseColor;
          }
        } else {
          color = '#1a1a1a';
          size = size * 0.7;
        }
      } else if (node.id === centralNodeId) {
        // PanAgora — always white
        color = '#ffffff';
      } else if (node.type === 'company') {
        const val = (node.metadata as Record<string, unknown>)?.value_millions;
        if (typeof val === 'number') {
          const logVal = Math.log(Math.max(val, 1));
          const logMax = Math.log(2200); // ~NVIDIA in millions
          const logMin = Math.log(200);
          const brightness = Math.max(0, Math.min(1, (logVal - logMin) / (logMax - logMin)));
          const bright = Math.round(42 + brightness * 213);
          color = '#' + bright.toString(16).padStart(2, '0').repeat(3);
        } else {
          color = NODE_COLORS.company;
        }
      } else {
        const baseColor = NODE_COLORS[node.type] || '#606060';
        const opacity = depthOpacity(position.depth, maxDepth);
        color = applyOpacity(baseColor, opacity);
      }

      const isAffected = isImpactMode && (impactHighlight!.has(node.id) || node.id === centralNodeId || chain.chainNodes.has(node.id));
      graph.addNode(String(node.id), {
        label: node.label,
        size,
        color,
        x: position.x,
        y: position.y,
        type: 'circle',
        originalColor: color,
        originalSize: size,
        isImpacted: isAffected,
        forceLabel: isAffected,
      });
    }

    for (const edge of edges) {
      if (!nodeIdSet.has(edge.source_id) || !nodeIdSet.has(edge.target_id)) continue;
      const sourceKey = String(edge.source_id);
      const targetKey = String(edge.target_id);
      if (graph.hasNode(sourceKey) && graph.hasNode(targetKey)) {
        const edgeKey = `${edge.id}`;
        if (!graph.hasEdge(edgeKey)) {
          let edgeColor = '#2a2a2a';
          let edgeSize = Math.max(0.5, Math.log2((edge.weight || 1) + 1));
          if (isImpactMode) {
            const srcInHeat = impactHighlight!.has(edge.source_id) || edge.source_id === centralNodeId || chain.chainNodes.has(edge.source_id);
            const tgtInHeat = impactHighlight!.has(edge.target_id) || edge.target_id === centralNodeId || chain.chainNodes.has(edge.target_id);
            // Red if both endpoints are in the heat set (affected + chain + PanAgora)
            const isHeatEdge = (srcInHeat && tgtInHeat) || chain.chainEdges.has(edge.id);

            if (isHeatEdge) {
              // Heat pathway: deep oxblood, slightly thinner
              edgeColor = '#8b1a1a80'; // translucent oxblood (50% opacity)
              edgeSize = edgeSize * 0.7;
            } else {
              // All others: visible gray, not overbearing
              edgeColor = '#1a1a1a';
              edgeSize = Math.max(0.3, edgeSize * 0.5);
            }
          } else if (selectedNeighborIds) {
            const srcSel = selectedNeighborIds.has(edge.source_id);
            const tgtSel = selectedNeighborIds.has(edge.target_id);
            edgeColor = (srcSel && tgtSel) ? '#404040' : '#0a0a0a';
          }

          graph.addEdge(sourceKey, targetKey, {
            key: edgeKey,
            size: edgeSize,
            color: edgeColor,
            label: edge.relationship,
            originalColor: edgeColor,
          });
        }
      }
    }

    loadGraph(graph);

    const origPos = new Map<string, { x: number; y: number }>();
    graph.forEachNode((nodeKey, attrs) => {
      origPos.set(nodeKey, { x: attrs.x as number, y: attrs.y as number });
    });
    originalPositionsRef.current = origPos;

    // Auto-fit camera: use sigma's built-in method
    setTimeout(() => {
      try {
        const cam = sigma.getCamera();
        // Reset to see full graph — ratio 1 means default view showing normalized coordinates
        cam.animate({ x: 0.5, y: 0.5, ratio: 1 }, { duration: 500 });
      } catch {
        // Sigma may not be ready
      }
    }, 200);
  }, [nodes, edges, loadGraph, impactHighlight, selectedTicker, sigma, layoutMode, bfsDepth]);

  // Impact pulse — smooth breathing on affected nodes and edges
  useEffect(() => {
    if (!impactHighlight || impactHighlight.size === 0) return;

    let animId: number;
    const startTime = performance.now();

    const pulse = () => {
      const graph = sigma.getGraph();
      const elapsed = performance.now() - startTime;
      // Smooth 3s sine wave
      const t = (Math.sin((elapsed / 3000) * Math.PI * 2 - Math.PI / 2) + 1) / 2;

      // Smooth RGB pulse: #6b1212 (dim) ↔ #8b1a1a (full) — preserve each node's alpha
      const r = Math.round(107 + t * 32); // 107-139
      const g = Math.round(18 + t * 8);   // 18-26
      const b = Math.round(18 + t * 8);   // 18-26
      const rgbHex = [r, g, b].map(c => c.toString(16).padStart(2, '0')).join('');

      graph.forEachNode((nodeKey, attrs) => {
        if (attrs.isImpacted) {
          // Keep the original alpha suffix (last 2 chars of originalColor)
          const orig = (attrs.originalColor as string) || '';
          const alpha = orig.length === 9 ? orig.slice(7) : 'ff';
          graph.setNodeAttribute(nodeKey, 'color', '#' + rgbHex + alpha);
        }
      });

      sigma.refresh();
      animId = requestAnimationFrame(pulse);
    };

    animId = requestAnimationFrame(pulse);

    return () => {
      cancelAnimationFrame(animId);
      const graph = sigma.getGraph();
      graph.forEachNode((nodeKey, attrs) => {
        if (attrs.isImpacted) {
          graph.setNodeAttribute(nodeKey, 'color', attrs.originalColor as string);
        }
      });
      sigma.refresh();
    };
  }, [impactHighlight, sigma]);

  // Event handlers
  useEffect(() => {
    registerEvents({
      clickNode: (event) => {
        if (!isDraggingRef.current) {
          onSelectNode(parseInt(event.node, 10));
        }
        isDraggingRef.current = false;
      },
      clickStage: () => {
        if (!isDraggingRef.current) onSelectNode(null);
        isDraggingRef.current = false;
      },
      downNode: (event) => {
        draggedNodeRef.current = event.node;
        isDraggingRef.current = false;
        sigma.getCamera().disable();
      },
      enterNode: (event) => {
        if (draggedNodeRef.current) return;
        hoveredNodeRef.current = event.node;
        const graph = sigma.getGraph();
        const neighbors = getNeighborsAtDepth(graph, event.node, 2);

        graph.forEachNode((nodeKey, attrs) => {
          if (neighbors.has(nodeKey)) {
            graph.setNodeAttribute(nodeKey, 'color', attrs.originalColor as string);
            graph.setNodeAttribute(nodeKey, 'zIndex', 1);
            graph.setNodeAttribute(nodeKey, 'forceLabel', true);
          } else {
            graph.setNodeAttribute(nodeKey, 'color', '#1a1a1a');
            graph.setNodeAttribute(nodeKey, 'zIndex', 0);
            graph.setNodeAttribute(nodeKey, 'forceLabel', false);
          }
        });

        graph.forEachEdge((_edgeKey, attrs, source, target) => {
          if (neighbors.has(source) && neighbors.has(target)) {
            graph.setEdgeAttribute(_edgeKey, 'color', '#404040');
          } else {
            graph.setEdgeAttribute(_edgeKey, 'color', '#0a0a0a');
          }
        });
        sigma.refresh();
      },
      leaveNode: () => {
        if (draggedNodeRef.current) return;
        hoveredNodeRef.current = null;
        const graph = sigma.getGraph();
        graph.forEachNode((nodeKey, attrs) => {
          graph.setNodeAttribute(nodeKey, 'color', attrs.originalColor as string);
          graph.setNodeAttribute(nodeKey, 'zIndex', 0);
          graph.setNodeAttribute(nodeKey, 'forceLabel', false);
        });
        graph.forEachEdge((edgeKey, attrs) => {
          graph.setEdgeAttribute(edgeKey, 'color', attrs.originalColor as string || '#1a1a1a');
        });
        sigma.refresh();
      },
    });
  }, [registerEvents, sigma, onSelectNode]);

  // Drag handlers
  useEffect(() => {
    const container = sigma.getContainer();
    if (!container) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!draggedNodeRef.current) return;
      isDraggingRef.current = true;
      const graph = sigma.getGraph();
      const pos = sigma.viewportToGraph({ x: e.offsetX, y: e.offsetY });
      graph.setNodeAttribute(draggedNodeRef.current, 'x', pos.x);
      graph.setNodeAttribute(draggedNodeRef.current, 'y', pos.y);
      e.preventDefault();
    };

    const handleMouseUp = () => {
      if (draggedNodeRef.current) {
        const releasedNode = draggedNodeRef.current;
        draggedNodeRef.current = null;
        sigma.getCamera().enable();

        const origPos = originalPositionsRef.current.get(releasedNode);
        if (origPos) {
          if (springAnimRef.current !== null) cancelAnimationFrame(springAnimRef.current);
          const animate = () => {
            const graph = sigma.getGraph();
            if (!graph.hasNode(releasedNode)) return;
            const curX = graph.getNodeAttribute(releasedNode, 'x') as number;
            const curY = graph.getNodeAttribute(releasedNode, 'y') as number;
            const dx = origPos.x - curX;
            const dy = origPos.y - curY;
            if (Math.sqrt(dx * dx + dy * dy) < 1) {
              graph.setNodeAttribute(releasedNode, 'x', origPos.x);
              graph.setNodeAttribute(releasedNode, 'y', origPos.y);
              springAnimRef.current = null;
              return;
            }
            graph.setNodeAttribute(releasedNode, 'x', curX + dx * 0.05);
            graph.setNodeAttribute(releasedNode, 'y', curY + dy * 0.05);
            sigma.refresh();
            springAnimRef.current = requestAnimationFrame(animate);
          };
          springAnimRef.current = requestAnimationFrame(animate);
        }
      }
    };

    container.addEventListener('mousemove', handleMouseMove);
    container.addEventListener('mouseup', handleMouseUp);
    container.addEventListener('mouseleave', handleMouseUp);

    return () => {
      container.removeEventListener('mousemove', handleMouseMove);
      container.removeEventListener('mouseup', handleMouseUp);
      container.removeEventListener('mouseleave', handleMouseUp);
      if (springAnimRef.current !== null) cancelAnimationFrame(springAnimRef.current);
    };
  }, [sigma]);

  // Zoom to selected node
  useEffect(() => {
    const graph = sigma.getGraph();
    // If in impact mode, zoom to fit all impacted nodes
    if (impactHighlight && impactHighlight.size > 0) {
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      let count = 0;
      graph.forEachNode((nodeKey, attrs) => {
        // Include both directly affected AND chain nodes in bounding box
        if (attrs.isImpacted) {
          const x = attrs.x as number;
          const y = attrs.y as number;
          minX = Math.min(minX, x);
          maxX = Math.max(maxX, x);
          minY = Math.min(minY, y);
          maxY = Math.max(maxY, y);
          count++;
        }
      });
      if (count > 0) {
        const cx = (minX + maxX) / 2;
        const cy = (minY + maxY) / 2;
        sigma.getCamera().animate({ x: cx, y: cy, ratio: 0.6 }, { duration: 600 });
      }
    }
  }, [impactHighlight, sigma]);

  return null;
}

export default function GraphCanvas(props: GraphCanvasProps) {
  if (props.nodes.length === 0) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-bg">
        <div className="text-center">
          <div className="w-6 h-6 border border-text-muted/30 border-t-text-muted rounded-full animate-spin mx-auto mb-3" />
          <div className="text-text-muted text-xs">Loading knowledge graph...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="absolute inset-0 bg-bg">
      <SigmaContainer
        style={{ width: '100%', height: '100%', background: 'transparent' }}
        settings={{
          allowInvalidContainer: true,
          labelRenderedSizeThreshold: 8,
          labelColor: { color: '#737373' },
          defaultEdgeColor: '#2a2a2a',
          renderEdgeLabels: false,
          defaultNodeType: 'circle',
          labelFont: 'Inter, system-ui, sans-serif',
          labelSize: 11,
          labelWeight: '500',
          stagePadding: 30,
          enableEdgeEvents: false,
          zIndex: true,
        }}
      >
        <GraphLoader {...props} />
      </SigmaContainer>

      {/* Graph legend */}
      <div className="absolute bottom-3 left-3 flex gap-3 text-[10px] text-text-muted">
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-white inline-block" />
          Top Holdings
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full inline-block" style={{ background: NODE_COLORS.sector }} />
          Sectors
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full inline-block" style={{ background: NODE_COLORS.concept }} />
          Factors
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full inline-block" style={{ background: NODE_COLORS.person }} />
          People
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full inline-block" style={{ background: NODE_COLORS.market_event }} />
          Markets
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full inline-block" style={{ background: NODE_COLORS.organization }} />
          Orgs
        </span>
      </div>
    </div>
  );
}
