"use client";
import { useEffect, useRef, useState, useMemo } from "react";

interface Props {
  depth: number;
}

interface TreeNode {
  id: string;
  value: number;
  children: TreeNode[];
  isMaximizing: boolean;
  alpha?: number;
  beta?: number;
  pruned?: boolean;
  chosen?: boolean;
}

function buildGameTree(depth: number, maxBranch: number = 2): TreeNode {
  let counter = 0;
  function build(d: number, isMax: boolean): TreeNode {
    const id = `n${counter++}`;
    if (d === 0) {
      return {
        id,
        value: Math.round(Math.random() * 20 - 5),
        children: [],
        isMaximizing: isMax,
      };
    }
    const kids = Array.from({ length: maxBranch }, () => build(d - 1, !isMax));
    return { id, value: 0, children: kids, isMaximizing: isMax };
  }
  return build(depth, true);
}

function alphaBetaAnnotate(
  node: TreeNode,
  alpha: number = -Infinity,
  beta: number = Infinity
): number {
  if (node.children.length === 0) {
    node.alpha = alpha;
    node.beta = beta;
    return node.value;
  }

  if (node.isMaximizing) {
    let val = -Infinity;
    for (const child of node.children) {
      const childVal = alphaBetaAnnotate(child, alpha, beta);
      if (childVal > val) {
        val = childVal;
        // Mark chosen child
        node.children.forEach((c) => (c.chosen = false));
        child.chosen = true;
      }
      alpha = Math.max(alpha, val);
      node.alpha = alpha;
      node.beta = beta;
      if (alpha >= beta) {
        // Mark remaining children as pruned
        const idx = node.children.indexOf(child);
        for (let i = idx + 1; i < node.children.length; i++) {
          node.children[i].pruned = true;
          markSubtreePruned(node.children[i]);
        }
        break;
      }
    }
    node.value = val;
    return val;
  } else {
    let val = Infinity;
    for (const child of node.children) {
      const childVal = alphaBetaAnnotate(child, alpha, beta);
      if (childVal < val) {
        val = childVal;
        node.children.forEach((c) => (c.chosen = false));
        child.chosen = true;
      }
      beta = Math.min(beta, val);
      node.alpha = alpha;
      node.beta = beta;
      if (alpha >= beta) {
        const idx = node.children.indexOf(child);
        for (let i = idx + 1; i < node.children.length; i++) {
          node.children[i].pruned = true;
          markSubtreePruned(node.children[i]);
        }
        break;
      }
    }
    node.value = val;
    return val;
  }
}

function markSubtreePruned(node: TreeNode) {
  node.pruned = true;
  for (const c of node.children) markSubtreePruned(c);
}

function countNodes(node: TreeNode): number {
  return 1 + node.children.reduce((s, c) => s + countNodes(c), 0);
}

function countPruned(node: TreeNode): number {
  return (node.pruned ? 1 : 0) + node.children.reduce((s, c) => s + countPruned(c), 0);
}

export function MiniGameTree({ depth: initialDepth }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [depth, setDepth] = useState(initialDepth);
  const [seed, setSeed] = useState(0);

  const tree = useMemo(() => {
    const t = buildGameTree(depth, 2);
    alphaBetaAnnotate(t);
    return t;
  }, [depth, seed]);

  const totalNodes = countNodes(tree);
  const prunedNodes = countPruned(tree);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rawCtx = canvas.getContext("2d");
    if (!rawCtx) return;
    const ctx: CanvasRenderingContext2D = rawCtx;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    const W = rect.width;
    const H = rect.height;

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, W, H);

    // Layout tree
    interface LayoutNode {
      node: TreeNode;
      x: number;
      y: number;
      children: LayoutNode[];
    }

    const padTop = 40;
    const padBottom = 30;
    const levelH = (H - padTop - padBottom) / Math.max(depth, 1);
    let leafCounter = 0;

    function countLeaves(n: TreeNode): number {
      if (n.children.length === 0) return 1;
      return n.children.reduce((s, c) => s + countLeaves(c), 0);
    }

    const totalLeaves = countLeaves(tree);
    const leafSpacing = (W - 60) / Math.max(totalLeaves - 1, 1);

    function layout(n: TreeNode, d: number): LayoutNode {
      const y = padTop + d * levelH;
      if (n.children.length === 0) {
        const x = 30 + leafCounter * leafSpacing;
        leafCounter++;
        return { node: n, x, y, children: [] };
      }
      const kids = n.children.map((c) => layout(c, d + 1));
      const x = kids.reduce((s, k) => s + k.x, 0) / kids.length;
      return { node: n, x, y, children: kids };
    }

    const root = layout(tree, 0);

    // Draw edges
    function drawEdges(ln: LayoutNode) {
      for (const child of ln.children) {
        const pruned = child.node.pruned;
        const chosen = child.node.chosen;

        ctx.beginPath();
        ctx.moveTo(ln.x, ln.y);
        ctx.lineTo(child.x, child.y);
        ctx.strokeStyle = pruned
          ? "rgba(220, 38, 38, 0.25)"
          : chosen
          ? "#2563eb"
          : "rgba(148, 163, 184, 0.4)";
        ctx.lineWidth = chosen ? 2.5 : 1;
        if (pruned) ctx.setLineDash([4, 4]);
        else ctx.setLineDash([]);
        ctx.stroke();
        ctx.setLineDash([]);

        // Pruning X mark
        if (pruned) {
          const mx = (ln.x + child.x) / 2;
          const my = (ln.y + child.y) / 2;
          ctx.strokeStyle = "#dc2626";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(mx - 5, my - 5);
          ctx.lineTo(mx + 5, my + 5);
          ctx.moveTo(mx + 5, my - 5);
          ctx.lineTo(mx - 5, my + 5);
          ctx.stroke();
        }

        drawEdges(child);
      }
    }

    drawEdges(root);

    // Draw nodes
    function drawNodes(ln: LayoutNode) {
      const n = ln.node;
      const r = 14;
      const pruned = n.pruned;

      // Glow for chosen
      if (n.chosen && !pruned) {
        ctx.beginPath();
        ctx.arc(ln.x, ln.y, r + 4, 0, Math.PI * 2);
        ctx.fillStyle = n.isMaximizing ? "rgba(37,99,235,0.15)" : "rgba(220,38,38,0.15)";
        ctx.fill();
      }

      ctx.beginPath();
      ctx.arc(ln.x, ln.y, r, 0, Math.PI * 2);
      ctx.fillStyle = pruned
        ? "#f1f5f9"
        : n.isMaximizing
        ? "rgba(37, 99, 235, 0.12)"
        : "rgba(220, 38, 38, 0.12)";
      ctx.fill();
      ctx.strokeStyle = pruned
        ? "#cbd5e1"
        : n.isMaximizing
        ? "#2563eb"
        : "#dc2626";
      ctx.lineWidth = pruned ? 1 : 1.5;
      ctx.stroke();

      // Value
      ctx.fillStyle = pruned ? "#94a3b8" : "#0f172a";
      ctx.font = `bold 11px Inter, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(n.value), ln.x, ln.y);

      // Role label
      if (ln.children.length > 0) {
        ctx.fillStyle = pruned ? "#94a3b8" : n.isMaximizing ? "#2563eb" : "#dc2626";
        ctx.font = "8px Inter, sans-serif";
        ctx.fillText(n.isMaximizing ? "MAX (PLAN)" : "MIN (ADV)", ln.x, ln.y - r - 6);
      }

      for (const child of ln.children) drawNodes(child);
    }

    drawNodes(root);

    // Info
    ctx.fillStyle = "#64748b";
    ctx.font = "11px Inter, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "bottom";
    ctx.fillText(`Optimal value: ${tree.value}`, 12, H - 8);
    ctx.textAlign = "right";
    ctx.fillText(`Pruned: ${prunedNodes}/${totalNodes} nodes`, W - 12, H - 8);
  }, [tree, depth, totalNodes, prunedNodes]);

  return (
    <div>
      <canvas
        ref={canvasRef}
        style={{
          width: "100%",
          height: 320,
          borderRadius: "var(--radius)",
          border: "1px solid var(--border)",
        }}
      />
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10 }}>
        <label style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Depth:</label>
        <input
          type="range"
          className="form-range"
          style={{ width: 80 }}
          min={2}
          max={5}
          value={depth}
          onChange={(e) => setDepth(parseInt(e.target.value))}
        />
        <span style={{ fontSize: "0.78rem", color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>{depth}</span>
        <button className="btn btn-secondary btn-sm" onClick={() => setSeed((s) => s + 1)}>
          Regenerate
        </button>
        <div style={{ marginLeft: "auto", fontSize: "0.72rem", color: "var(--text-dim)", display: "flex", gap: 12 }}>
          <span><span style={{ color: "#10b981" }}>●</span> MAX (Planner)</span>
          <span><span style={{ color: "#ef4444" }}>●</span> MIN (Adversary)</span>
          <span><span style={{ color: "#ef4444", textDecoration: "line-through" }}>──</span> Pruned</span>
        </div>
      </div>
    </div>
  );
}
