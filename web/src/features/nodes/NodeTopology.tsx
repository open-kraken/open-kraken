/**
 * NodeTopology — canvas-based network topology visualization.
 * Renders nodes as circles with status indicators, region clustering,
 * connection lines, and labels. Supports click-to-select and hover tooltips.
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import type { Node } from '@/types/node';
import styles from './nodes-feature.module.css';

export type NodeTopologyProps = {
  nodes: Node[];
  selectedNodeId: string | null;
  onSelect?: (nodeId: string | null) => void;
  onAssignClick?: (nodeId: string) => void;
};

/* ── Layout constants ──────────────────────────────── */

const NODE_R_K8S = 18;
const NODE_R_BARE = 22;
const HIT_PADDING = 8;
const REGION_PAD = 40;

/* ── Color map ─────────────────────────────────────── */

const STATUS_COLORS = {
  online:   { fill: '#3ecfae', glow: 'rgba(62,207,174,0.25)',  ring: 'rgba(62,207,174,0.5)' },
  degraded: { fill: '#fbbf24', glow: 'rgba(251,191,36,0.20)',  ring: 'rgba(251,191,36,0.5)' },
  offline:  { fill: '#fb7185', glow: 'rgba(251,113,133,0.18)', ring: 'rgba(251,113,133,0.4)' },
} as const;

const REGION_COLORS: Record<string, string> = {
  'us-east':  'rgba(62,207,174,0.06)',
  'us-west':  'rgba(99,102,241,0.06)',
  'eu-west':  'rgba(251,191,36,0.05)',
  'ap-south': 'rgba(251,113,133,0.05)',
};

const REGION_BORDER: Record<string, string> = {
  'us-east':  'rgba(62,207,174,0.15)',
  'us-west':  'rgba(99,102,241,0.15)',
  'eu-west':  'rgba(251,191,36,0.12)',
  'ap-south': 'rgba(251,113,133,0.12)',
};

/* ── Layout helper ─────────────────────────────────── */

interface LayoutNode {
  node: Node;
  x: number;
  y: number;
  r: number;
  region: string;
}

function layoutNodes(nodes: Node[], w: number, h: number): LayoutNode[] {
  if (nodes.length === 0) return [];

  const cx = w / 2, cy = h / 2;

  // Single node: center it prominently.
  if (nodes.length === 1) {
    const n = nodes[0];
    const r = n.nodeType === 'bare_metal' ? NODE_R_BARE + 8 : NODE_R_K8S + 6;
    return [{ node: n, x: cx, y: cy, r, region: n.labels.region ?? 'local' }];
  }

  // Group by region.
  const regions = new Map<string, Node[]>();
  for (const n of nodes) {
    const region = n.labels.region ?? 'default';
    if (!regions.has(region)) regions.set(region, []);
    regions.get(region)!.push(n);
  }

  const regionKeys = [...regions.keys()];
  const result: LayoutNode[] = [];
  const regionRadius = Math.min(w, h) * (regionKeys.length <= 2 ? 0.22 : 0.28);

  regionKeys.forEach((region, ri) => {
    const regionAngle = (ri / regionKeys.length) * Math.PI * 2 - Math.PI / 2;
    const regionCx = cx + Math.cos(regionAngle) * regionRadius;
    const regionCy = cy + Math.sin(regionAngle) * regionRadius;

    const regionNodes = regions.get(region)!;

    regionNodes.forEach((n, ni) => {
      const r = n.nodeType === 'bare_metal' ? NODE_R_BARE : NODE_R_K8S;
      let nx: number, ny: number;

      if (regionNodes.length === 1) {
        nx = regionCx;
        ny = regionCy;
      } else {
        const innerAngle = (ni / regionNodes.length) * Math.PI * 2 - Math.PI / 2;
        const innerR = 35 + regionNodes.length * 8;
        nx = regionCx + Math.cos(innerAngle) * innerR;
        ny = regionCy + Math.sin(innerAngle) * innerR;
      }

      result.push({ node: n, x: nx, y: ny, r, region });
    });
  });

  return result;
}

/* ── Component ─────────────────────────────────────── */

export const NodeTopology = ({ nodes, selectedNodeId, onSelect, onAssignClick }: NodeTopologyProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const layoutRef = useRef<LayoutNode[]>([]);
  const [hovered, setHovered] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; node: Node } | null>(null);
  const animRef = useRef(0);
  const timeRef = useRef(0);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.width / dpr;
    const h = canvas.height / dpr;
    const layout = layoutRef.current;
    const time = timeRef.current;

    ctx.clearRect(0, 0, w * dpr, h * dpr);
    ctx.save();
    ctx.scale(dpr, dpr);

    // ── Background grid (subtle professional look) ──
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.04)';
    ctx.lineWidth = 0.5;
    const gridSpacing = 40;
    for (let gx = gridSpacing; gx < w; gx += gridSpacing) {
      ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, h); ctx.stroke();
    }
    for (let gy = gridSpacing; gy < h; gy += gridSpacing) {
      ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(w, gy); ctx.stroke();
    }

    // ── Single-node decorative rings ──
    if (layout.length === 1) {
      const ln = layout[0];
      const ringAlpha = 0.04 + Math.sin(time * 0.8) * 0.02;
      for (let ri = 1; ri <= 3; ri++) {
        ctx.beginPath();
        ctx.arc(ln.x, ln.y, ln.r + ri * 30 + Math.sin(time * 0.5 + ri) * 3, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(62, 207, 174, ${ringAlpha / ri})`;
        ctx.lineWidth = 0.8;
        ctx.setLineDash([2 + ri, 6 + ri * 2]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      // Decorative orbital particles.
      for (let pi = 0; pi < 4; pi++) {
        const orbitR = ln.r + 55 + pi * 25;
        const angle = time * (0.3 + pi * 0.15) + pi * 1.57;
        const px = ln.x + Math.cos(angle) * orbitR;
        const py = ln.y + Math.sin(angle) * orbitR;
        ctx.beginPath();
        ctx.arc(px, py, 2, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(62, 207, 174, ${0.3 - pi * 0.06})`;
        ctx.fill();
      }
    }

    // ── Region clusters (background zones) ──
    const regionGroups = new Map<string, LayoutNode[]>();
    for (const ln of layout) {
      if (!regionGroups.has(ln.region)) regionGroups.set(ln.region, []);
      regionGroups.get(ln.region)!.push(ln);
    }

    for (const [region, lnodes] of regionGroups) {
      if (lnodes.length === 0) continue;
      // Compute bounding circle for the region
      let rcx = 0, rcy = 0;
      for (const ln of lnodes) { rcx += ln.x; rcy += ln.y; }
      rcx /= lnodes.length; rcy /= lnodes.length;

      let maxDist = 0;
      for (const ln of lnodes) {
        maxDist = Math.max(maxDist, Math.hypot(ln.x - rcx, ln.y - rcy) + ln.r);
      }
      const clusterR = maxDist + REGION_PAD;

      ctx.beginPath();
      ctx.arc(rcx, rcy, clusterR, 0, Math.PI * 2);
      ctx.fillStyle = REGION_COLORS[region] ?? 'rgba(148,163,184,0.04)';
      ctx.fill();
      ctx.strokeStyle = REGION_BORDER[region] ?? 'rgba(148,163,184,0.08)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.stroke();
      ctx.setLineDash([]);

      // Region label
      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(168,181,196,0.4)';
      ctx.fillText(region, rcx, rcy - clusterR + 14);
    }

    // ── Connection lines (same-region nodes + cross-region for assigned agents) ─��
    for (let i = 0; i < layout.length; i++) {
      for (let j = i + 1; j < layout.length; j++) {
        const a = layout[i], b = layout[j];
        const sameRegion = a.region === b.region;
        const bothOnline = a.node.status === 'online' && b.node.status === 'online';

        // Connect same-region nodes, or any node that shares an agent
        const sharedAgent = a.node.assignedAgents.some(
          (ag) => b.node.assignedAgents.includes(ag)
        );

        if (sameRegion || sharedAgent) {
          const dist = Math.hypot(a.x - b.x, a.y - b.y);
          const alpha = sameRegion
            ? (bothOnline ? 0.12 : 0.06)
            : 0.15;

          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          if (!sameRegion) {
            // Curved cross-region link
            const mx = (a.x + b.x) / 2;
            const my = (a.y + b.y) / 2 - dist * 0.15;
            ctx.quadraticCurveTo(mx, my, b.x, b.y);
          } else {
            ctx.lineTo(b.x, b.y);
          }
          ctx.strokeStyle = sharedAgent
            ? `rgba(62,207,174,${alpha})`
            : `rgba(148,163,184,${alpha})`;
          ctx.lineWidth = sharedAgent ? 1.5 : 0.8;
          if (!sameRegion) ctx.setLineDash([3, 5]);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }
    }

    // ── Nodes ���─
    for (const ln of layout) {
      const { node: n, x, y, r } = ln;
      const sc = STATUS_COLORS[n.status] ?? STATUS_COLORS.offline;
      const isSelected = n.id === selectedNodeId;
      const isHovered = n.id === hovered;
      const breath = 1 + Math.sin(time * 2 + x * 0.01) * 0.04;
      const dr = r * breath;

      // Glow
      const glowR = dr * 3;
      const grad = ctx.createRadialGradient(x, y, dr * 0.5, x, y, glowR);
      grad.addColorStop(0, sc.glow);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.beginPath();
      ctx.arc(x, y, glowR, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();

      // Selection ring
      if (isSelected) {
        ctx.beginPath();
        ctx.arc(x, y, dr + 5, 0, Math.PI * 2);
        ctx.strokeStyle = sc.ring;
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      // Hover ring
      if (isHovered && !isSelected) {
        ctx.beginPath();
        ctx.arc(x, y, dr + 4, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(148,163,184,0.3)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      // Node body
      ctx.beginPath();
      ctx.arc(x, y, dr, 0, Math.PI * 2);

      if (n.nodeType === 'bare_metal') {
        // Bare metal: double ring style
        ctx.fillStyle = 'rgba(10,15,24,0.6)';
        ctx.fill();
        ctx.strokeStyle = sc.fill;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(x, y, dr * 0.6, 0, Math.PI * 2);
        ctx.fillStyle = sc.fill;
        ctx.fill();
      } else {
        // K8s pod: solid fill
        ctx.fillStyle = sc.fill;
        ctx.globalAlpha = 0.85;
        ctx.fill();
        ctx.globalAlpha = 1;
        // White center highlight
        ctx.beginPath();
        ctx.arc(x, y, dr * 0.35, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.fill();
      }

      // Status pulse for degraded/offline
      if (n.status === 'degraded') {
        const pulseAlpha = 0.15 + Math.sin(time * 4) * 0.1;
        ctx.beginPath();
        ctx.arc(x, y, dr + 2, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(251,191,36,${pulseAlpha})`;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      // Hostname label
      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = isSelected ? 'rgba(241,245,249,0.8)' : 'rgba(168,181,196,0.55)';
      const shortName = n.hostname.split('.')[0];
      ctx.fillText(shortName, x, y + dr + 16);

      // Type badge
      ctx.font = '8px "JetBrains Mono", monospace';
      ctx.fillStyle = 'rgba(148,163,184,0.35)';
      ctx.fillText(n.nodeType === 'k8s_pod' ? 'k8s' : 'metal', x, y + dr + 27);

      // Agent label (if assigned)
      if (n.assignedAgents.length > 0) {
        ctx.font = '8px "JetBrains Mono", monospace';
        ctx.fillStyle = 'rgba(62,207,174,0.5)';
        ctx.fillText(n.assignedAgents[0], x, y - dr - 8);
      }
    }

    ctx.restore();
  }, [selectedNodeId, hovered]);

  // Animation loop
  useEffect(() => {
    let running = true;
    const tick = () => {
      if (!running) return;
      timeRef.current += 0.016;
      draw();
      animRef.current = requestAnimationFrame(tick);
    };
    animRef.current = requestAnimationFrame(tick);
    return () => { running = false; cancelAnimationFrame(animRef.current); };
  }, [draw]);

  // Resize
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = container.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      layoutRef.current = layoutNodes(nodes, rect.width, rect.height);
    };

    resize();

    const ro = new ResizeObserver(resize);
    ro.observe(container);
    return () => ro.disconnect();
  }, [nodes]);

  // Mouse interaction
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    let hit: LayoutNode | null = null;
    for (const ln of layoutRef.current) {
      const d = Math.hypot(ln.x - mx, ln.y - my);
      if (d < ln.r + HIT_PADDING) { hit = ln; break; }
    }

    setHovered(hit ? hit.node.id : null);
    canvas.style.cursor = hit ? 'pointer' : 'default';

    if (hit) {
      setTooltip({ x: e.clientX, y: e.clientY, node: hit.node });
    } else {
      setTooltip(null);
    }
  }, []);

  const handleClick = useCallback((e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    let hit: LayoutNode | null = null;
    for (const ln of layoutRef.current) {
      const d = Math.hypot(ln.x - mx, ln.y - my);
      if (d < ln.r + HIT_PADDING) { hit = ln; break; }
    }

    if (hit) {
      onSelect?.(hit.node.id === selectedNodeId ? null : hit.node.id);
    } else {
      onSelect?.(null);
    }
  }, [onSelect, selectedNodeId]);

  const handleDblClick = useCallback((e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    for (const ln of layoutRef.current) {
      const d = Math.hypot(ln.x - mx, ln.y - my);
      if (d < ln.r + HIT_PADDING) {
        onAssignClick?.(ln.node.id);
        break;
      }
    }
  }, [onAssignClick]);

  return (
    <div ref={containerRef} className={styles['node-topology']}>
      <canvas
        ref={canvasRef}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => { setHovered(null); setTooltip(null); }}
        onClick={handleClick}
        onDoubleClick={handleDblClick}
      />
      {tooltip && (
        <div
          className={styles['node-topology__tooltip']}
          style={{ left: tooltip.x + 12, top: tooltip.y - 10, position: 'fixed' }}
        >
          <strong>{tooltip.node.hostname}</strong>
          <span data-status={tooltip.node.status}>{tooltip.node.status}</span>
          <span>{tooltip.node.nodeType === 'k8s_pod' ? 'Kubernetes Pod' : 'Bare Metal'}</span>
          {tooltip.node.assignedAgents.length > 0 && (
            <span>Agent: {tooltip.node.assignedAgents.join(', ')}</span>
          )}
        </div>
      )}
    </div>
  );
};
