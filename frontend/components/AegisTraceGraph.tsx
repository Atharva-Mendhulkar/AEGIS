"use client";
import { useEffect, useState } from "react";
import {
  Layers,
  Filter,
  LineChart,
  Star,
  Ban,
  ShieldAlert,
  RefreshCw,
} from "lucide-react";
import type {
  AegisTrace,
  AegisTraceCandidate,
  Disruption,
  GraphInput,
} from "../lib/api";
import { fetchAegisTrace, loadGraph } from "../lib/api";

interface Props {
  graph: GraphInput;
  source: string | null;
  destination: string | null;
  disruptions: Disruption[];
}

const ACCENT = "#2563eb";
const DANGER = "#dc2626";
const SLATE = "#0f172a";
const MUTED = "#94a3b8";

export function AegisTraceGraph({ graph, source, destination, disruptions }: Props) {
  const [trace, setTrace] = useState<AegisTrace | null>(null);
  const [selected, setSelected] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!source || !destination) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    loadGraph(graph)
      .then(() =>
        fetchAegisTrace({
          origin_id: source,
          destination_id: destination,
          goods_type: "general",
          weight_kg: 1000,
          disruptions,
        })
      )
      .then((t) => {
        if (cancelled) return;
        setTrace(t);
        const firstFrontier = t.candidates.findIndex((c) => c.on_frontier);
        setSelected(firstFrontier >= 0 ? firstFrontier : 0);
      })
      .catch((e) => {
        if (!cancelled) setError(e?.message || "AEGIS trace failed — is the backend running?");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [graph, source, destination, disruptions]);

  const depotName = (id: string) => graph.depots.find((d) => d.id === id)?.name || id;

  if (!source || !destination) {
    return (
      <div className="empty-state">
        <Layers size={36} style={{ color: MUTED }} />
        <p style={{ marginTop: 8, fontSize: "0.85rem", color: "var(--text-secondary)" }}>
          Pick a source &amp; destination to watch the AEGIS pipeline run.
        </p>
      </div>
    );
  }

  const candidate: AegisTraceCandidate | undefined = trace?.candidates[selected];

  return (
    <div>
      {/* Pipeline stage bar */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
        {[
          { icon: <Filter size={11} />, label: "1 · Compliance filter", color: "#b45309" },
          { icon: <Layers size={11} />, label: "2 · Risk-weighted UCS sweep", color: ACCENT },
          { icon: <LineChart size={11} />, label: "3 · Pareto frontier", color: "#16a34a" },
        ].map((s) => (
          <span
            key={s.label}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              fontSize: "0.65rem",
              fontWeight: 700,
              padding: "3px 9px",
              borderRadius: 9999,
              background: `${s.color}12`,
              color: s.color,
              border: `1px solid ${s.color}33`,
            }}
          >
            {s.icon} {s.label}
          </span>
        ))}
      </div>

      {loading && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.8rem", color: "var(--text-secondary)", padding: "16px 0" }}>
          <RefreshCw size={14} className="spin" style={{ color: ACCENT }} />
          Sweeping risk weights over the corridor…
        </div>
      )}

      {error && (
        <div style={{ fontSize: "0.78rem", color: DANGER, fontWeight: 600, padding: "10px 0" }}>
          {error}
        </div>
      )}

      {trace && (
        <>
          <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "#64748b", marginBottom: 8, display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
            <Layers size={12} style={{ color: ACCENT }} />
            RISK-WEIGHT SWEEP — one candidate plan per weight
            <span style={{ fontWeight: 500, color: MUTED }}>(edge cost × (1 + w · risk))</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 8 }}>
            {trace.candidates.map((c, i) => (
              <CandidateCard
                key={c.risk_weight}
                candidate={c}
                active={selected === i}
                onSelect={() => setSelected(i)}
                depotName={depotName}
              />
            ))}
          </div>

          {candidate && (candidate.blocked_edges.length > 0 || candidate.non_compliant_edges.length > 0) && (
            <div
              style={{
                marginTop: 10,
                padding: "7px 10px",
                borderRadius: 8,
                background: "rgba(220,38,38,0.05)",
                border: "1px solid rgba(220,38,38,0.18)",
                fontSize: "0.68rem",
                color: "#b91c1c",
                display: "flex",
                flexWrap: "wrap",
                gap: 10,
              }}
            >
              {candidate.non_compliant_edges.length > 0 && (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontWeight: 700 }}>
                  <ShieldAlert size={11} /> {candidate.non_compliant_edges.length} edge(s) non-compliant for goods
                </span>
              )}
              {candidate.blocked_edges.length > 0 && (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontWeight: 700 }}>
                  <Ban size={11} /> {candidate.blocked_edges.length} edge(s) blocked by disruptions
                </span>
              )}
            </div>
          )}

          {candidate && candidate.edges.length > 0 && (
            <AegisEdgeTable candidate={candidate} depotName={depotName} />
          )}

          {trace.candidates.length > 1 && (
            <AegisParetoScatter candidates={trace.candidates} selected={selected} onSelect={setSelected} />
          )}
        </>
      )}
    </div>
  );
}

function CandidateCard({
  candidate,
  active,
  onSelect,
  depotName,
}: {
  candidate: AegisTraceCandidate;
  active: boolean;
  onSelect: () => void;
  depotName: (id: string) => string;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      style={{
        textAlign: "left",
        padding: "9px 10px",
        borderRadius: 10,
        border: `1px solid ${active ? ACCENT : "var(--border)"}`,
        background: active ? "rgba(37,99,235,0.06)" : "transparent",
        cursor: "pointer",
        opacity: candidate.path_nodes ? 1 : 0.55,
        transition: "all 0.15s ease",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: "0.68rem", fontWeight: 800, color: SLATE, fontFamily: "var(--font-mono)" }}>
          w = {candidate.risk_weight}
        </span>
        {candidate.on_frontier ? (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 2, fontSize: "0.58rem", fontWeight: 700, color: "#16a34a" }}>
            <Star size={9} fill="#16a34a" /> FRONTIER
          </span>
        ) : (
          <span style={{ fontSize: "0.58rem", fontWeight: 600, color: MUTED }}>dominated</span>
        )}
      </div>
      <div style={{ fontSize: "0.66rem", color: "var(--text-secondary)", marginTop: 4, lineHeight: 1.5 }}>
        {candidate.path_nodes ? candidate.path_nodes.map(depotName).join(" → ") : "No feasible route"}
      </div>
      <div style={{ marginTop: 5, display: "flex", gap: 8, fontSize: "0.7rem", fontWeight: 700, fontFamily: "var(--font-mono)" }}>
        <span style={{ color: SLATE }}>₹{candidate.total_cost.toLocaleString("en-IN")}</span>
        <span style={{ color: candidate.expected_regret > 0 ? DANGER : "#16a34a" }}>
          regret {candidate.expected_regret.toFixed(2)}
        </span>
      </div>
    </button>
  );
}

function AegisEdgeTable({
  candidate,
  depotName,
}: {
  candidate: AegisTraceCandidate;
  depotName: (id: string) => string;
}) {
  const maxWeighted = Math.max(...candidate.edges.map((e) => e.weighted_cost), 1);
  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "#64748b", marginBottom: 6, display: "flex", alignItems: "center", gap: 5 }}>
        <Layers size={12} style={{ color: "#b45309" }} />
        EDGE RISK WEIGHTING — candidate at w = {candidate.risk_weight}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        {candidate.edges.map((e) => (
          <div
            key={e.route_id}
            style={{ padding: "7px 10px", borderRadius: 8, border: "1px solid var(--border)", fontSize: "0.72rem" }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 6 }}>
              <span style={{ fontWeight: 700, color: SLATE }}>
                {depotName(e.origin)} → {depotName(e.destination)}
              </span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.68rem" }}>
                <span style={{ color: MUTED }}>₹{e.base_cost}</span>
                {" × (1 + "}
                {candidate.risk_weight} ·{" "}
                <span style={{ color: e.risk > 0.3 ? DANGER : "#f59e0b" }}>{(e.risk * 100).toFixed(0)}%</span>
                {") = "}
                <span style={{ fontWeight: 800, color: SLATE }}>₹{e.weighted_cost}</span>
              </span>
            </div>
            <div style={{ marginTop: 5, height: 4, borderRadius: 2, background: "#e2e8f0", overflow: "hidden" }}>
              <div
                style={{
                  width: `${(e.weighted_cost / maxWeighted) * 100}%`,
                  height: "100%",
                  background: e.risk > 0.3 ? DANGER : e.risk > 0.1 ? "#f59e0b" : ACCENT,
                  borderRadius: 2,
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AegisParetoScatter({
  candidates,
  selected,
  onSelect,
}: {
  candidates: AegisTraceCandidate[];
  selected: number;
  onSelect: (i: number) => void;
}) {
  const [hoveredClusterId, setHoveredClusterId] = useState<string | null>(null);

  const W = 460;
  const H = 220;
  const PAD_LEFT = 48;
  const PAD_RIGHT = 36;
  const PAD_TOP = 26;
  const PAD_BOTTOM = 40;
  const INNER_PAD_X = 24;
  const INNER_PAD_Y = 18;

  const feasibleWithIndex = candidates
    .map((c, i) => ({ candidate: c, index: i }))
    .filter((item) => item.candidate.path_nodes);

  if (feasibleWithIndex.length === 0) return null;

  // 1. Group coincident candidates that share identical or virtually identical cost & regret
  const rawClusters: {
    total_cost: number;
    expected_regret: number;
    on_frontier: boolean;
    items: { candidate: AegisTraceCandidate; index: number }[];
  }[] = [];

  for (const item of feasibleWithIndex) {
    const existing = rawClusters.find(
      (cl) =>
        Math.abs(cl.total_cost - item.candidate.total_cost) < 0.5 &&
        Math.abs(cl.expected_regret - item.candidate.expected_regret) < 0.005
    );
    if (existing) {
      existing.items.push(item);
      if (item.candidate.on_frontier) {
        existing.on_frontier = true;
      }
    } else {
      rawClusters.push({
        total_cost: item.candidate.total_cost,
        expected_regret: item.candidate.expected_regret,
        on_frontier: Boolean(item.candidate.on_frontier),
        items: [item],
      });
    }
  }

  // 2. Compute dynamic domain scales with margins to keep points safely inside
  const costs = rawClusters.map((c) => c.total_cost);
  const regrets = rawClusters.map((c) => c.expected_regret);

  const minCost = Math.min(...costs);
  const maxCost = Math.max(...costs);
  const minRegret = Math.min(...regrets);
  const maxRegret = Math.max(...regrets);

  const costSpan = maxCost - minCost;
  const regretSpan = maxRegret - minRegret;

  const minX = costSpan === 0 ? Math.max(0, minCost * 0.9) : Math.max(0, minCost - costSpan * 0.14);
  const maxX = costSpan === 0 ? (minCost > 0 ? minCost * 1.1 : 100) : maxCost + costSpan * 0.14;

  const minY = 0;
  const maxY = regretSpan === 0 ? (maxRegret > 0 ? maxRegret * 1.4 : 1.0) : maxRegret + regretSpan * 0.22;

  const plotWidth = W - PAD_LEFT - PAD_RIGHT;
  const plotHeight = H - PAD_TOP - PAD_BOTTOM;

  const getX = (v: number) => {
    const range = maxX - minX || 1;
    return PAD_LEFT + INNER_PAD_X + ((v - minX) / range) * (plotWidth - 2 * INNER_PAD_X);
  };

  const getY = (v: number) => {
    const range = maxY - minY || 1;
    return (H - PAD_BOTTOM - INNER_PAD_Y) - ((v - minY) / range) * (plotHeight - 2 * INNER_PAD_Y);
  };

  // 3. Format cluster labels cleanly without overlapping text
  const formatClusterLabel = (cl: typeof rawClusters[0]) => {
    const weights = cl.items.map((it) => it.candidate.risk_weight).sort((a, b) => a - b);
    if (weights.length === feasibleWithIndex.length && feasibleWithIndex.length > 1) {
      return `all w (0→${weights[weights.length - 1]})`;
    }
    if (weights.length > 2) {
      return `w ∈ {${weights.join(", ")}}`;
    }
    if (weights.length === 2) {
      return `w=${weights[0]}, ${weights[1]}`;
    }
    return `w=${weights[0]}`;
  };

  // 4. Initial cluster coordinates
  const clusters = rawClusters.map((cl, i) => {
    const cx = getX(cl.total_cost);
    const cy = getY(cl.expected_regret);
    const label = formatClusterLabel(cl);
    return {
      ...cl,
      id: `cluster-${i}`,
      x: cx,
      y: cy,
      labelText: label,
      labelWidth: Math.max(34, label.length * 6 + 10),
    };
  });

  // 5. Anti-collision: nudge distinct clusters slightly if their nodes touch
  for (let i = 0; i < clusters.length; i++) {
    for (let j = i + 1; j < clusters.length; j++) {
      const dx = clusters[j].x - clusters[i].x;
      const dy = clusters[j].y - clusters[i].y;
      const dist = Math.hypot(dx, dy);
      if (dist < 26 && dist > 0) {
        const overlap = (26 - dist) / 2;
        const ux = dx / dist;
        const uy = dy / dist;
        clusters[i].x -= ux * overlap;
        clusters[i].y -= uy * overlap;
        clusters[j].x += ux * overlap;
        clusters[j].y += uy * overlap;
      }
    }
  }

  // 6. Label anti-collision placement (alternating above/below and boundary clamping)
  const sortedByX = [...clusters].sort((a, b) => a.x - b.x);
  const labelPlacements = new Map<string, { labelX: number; labelY: number; isBelow: boolean }>();

  let lastLabelX = -999;
  let lastWasBelow = false;

  for (const cl of sortedByX) {
    let isBelow = false;
    if (cl.y < PAD_TOP + 32) {
      isBelow = true;
    } else if (cl.y > H - PAD_BOTTOM - 24) {
      isBelow = false;
    } else if (Math.abs(cl.x - lastLabelX) < (cl.labelWidth + 14)) {
      isBelow = !lastWasBelow;
    }

    const labelX = Math.max(PAD_LEFT + 22, Math.min(W - PAD_RIGHT - 22, cl.x));
    const labelY = isBelow ? cl.y + 19 : cl.y - 14;

    lastLabelX = labelX;
    lastWasBelow = isBelow;

    labelPlacements.set(cl.id, { labelX, labelY, isBelow });
  }

  // Deduplicated frontier points for polyline
  const distinctFrontier = clusters
    .filter((c) => c.on_frontier)
    .sort((a, b) => a.total_cost - b.total_cost);

  // Active cluster containing the selected candidate
  const activeCluster = clusters.find((cl) => cl.items.some((it) => it.index === selected));
  const hoveredCluster = clusters.find((cl) => cl.id === hoveredClusterId);

  const handleClickCluster = (cl: typeof clusters[0]) => {
    if (cl.items.length === 1) {
      onSelect(cl.items[0].index);
      return;
    }
    const currentIdx = cl.items.findIndex((it) => it.index === selected);
    if (currentIdx === -1) {
      onSelect(cl.items[0].index);
    } else {
      const nextIdx = (currentIdx + 1) % cl.items.length;
      onSelect(cl.items[nextIdx].index);
    }
  };

  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "#64748b", marginBottom: 6, display: "flex", alignItems: "center", gap: 5 }}>
        <LineChart size={12} style={{ color: "#16a34a" }} />
        PARETO FRONTIER — cost vs expected regret
        <span style={{ fontWeight: 500, color: MUTED }}>
          {clusters.length < feasibleWithIndex.length
            ? "(points clustered — click to cycle or pick weight below)"
            : "(click a point to inspect)"}
        </span>
      </div>
      <svg
        width="100%"
        viewBox={`0 0 ${W} ${H}`}
        style={{
          background: "rgba(15,23,42,0.02)",
          borderRadius: 10,
          border: "1px solid var(--border)",
          overflow: "visible",
        }}
      >
        {/* Grid lines */}
        <line x1={PAD_LEFT} y1={H - PAD_BOTTOM} x2={W - PAD_RIGHT} y2={H - PAD_BOTTOM} stroke={MUTED} strokeWidth={1} />
        <line x1={PAD_LEFT} y1={PAD_TOP} x2={PAD_LEFT} y2={H - PAD_BOTTOM} stroke={MUTED} strokeWidth={1} />
        <line
          x1={PAD_LEFT}
          y1={(PAD_TOP + H - PAD_BOTTOM) / 2}
          x2={W - PAD_RIGHT}
          y2={(PAD_TOP + H - PAD_BOTTOM) / 2}
          stroke="rgba(148,163,184,0.15)"
          strokeDasharray="2 3"
        />
        <line
          x1={(PAD_LEFT + W - PAD_RIGHT) / 2}
          y1={PAD_TOP}
          x2={(PAD_LEFT + W - PAD_RIGHT) / 2}
          y2={H - PAD_BOTTOM}
          stroke="rgba(148,163,184,0.15)"
          strokeDasharray="2 3"
        />

        {/* Axis Labels */}
        <text x={W - PAD_RIGHT} y={H - 12} textAnchor="end" fontSize={9} fontWeight={600} fill={MUTED}>
          total cost ₹→
        </text>
        <text x={PAD_LEFT + 4} y={16} fontSize={9} fontWeight={600} fill={MUTED}>
          expected regret ↑
        </text>

        {/* Axis Min/Max tick labels */}
        <text x={PAD_LEFT} y={H - PAD_BOTTOM + 14} fontSize={8} fill={MUTED}>
          ₹{Math.round(minCost).toLocaleString("en-IN")}
        </text>
        {costSpan > 0 && (
          <text x={W - PAD_RIGHT} y={H - PAD_BOTTOM + 14} textAnchor="end" fontSize={8} fill={MUTED}>
            ₹{Math.round(maxCost).toLocaleString("en-IN")}
          </text>
        )}
        <text x={PAD_LEFT - 4} y={H - PAD_BOTTOM - 2} textAnchor="end" fontSize={8} fill={MUTED}>
          0
        </text>
        {maxRegret > 0 && (
          <text x={PAD_LEFT - 4} y={PAD_TOP + 8} textAnchor="end" fontSize={8} fill={MUTED}>
            {maxRegret.toFixed(2)}
          </text>
        )}

        {/* Deduplicated Pareto Frontier connecting line */}
        {distinctFrontier.length > 1 && (
          <polyline
            points={distinctFrontier.map((c) => `${c.x},${c.y}`).join(" ")}
            fill="none"
            stroke="#16a34a"
            strokeWidth={1.8}
            strokeDasharray="4 3"
          />
        )}

        {/* Clustered & De-overlapped Nodes */}
        {clusters.map((cl) => {
          const isSelected = cl.items.some((it) => it.index === selected);
          const isHovered = cl.id === hoveredClusterId;
          const hasMultiple = cl.items.length > 1;
          const placement = labelPlacements.get(cl.id) || { labelX: cl.x, labelY: cl.y - 14, isBelow: false };

          return (
            <g
              key={cl.id}
              onClick={() => handleClickCluster(cl)}
              onMouseEnter={() => setHoveredClusterId(cl.id)}
              onMouseLeave={() => setHoveredClusterId(null)}
              style={{ cursor: "pointer" }}
            >
              {/* Outer halo / multi-point indicator ring */}
              {hasMultiple && (
                <circle
                  cx={cl.x}
                  cy={cl.y}
                  r={isSelected ? 13 : isHovered ? 12 : 10}
                  fill={
                    cl.on_frontier
                      ? isSelected
                        ? "rgba(37,99,235,0.12)"
                        : "rgba(22,163,74,0.08)"
                      : "rgba(148,163,184,0.08)"
                  }
                  stroke={cl.on_frontier ? (isSelected ? ACCENT : "#16a34a") : MUTED}
                  strokeWidth={1.5}
                  strokeDasharray={isSelected ? "none" : "3 2"}
                />
              )}

              {/* Selection pulse ring if active */}
              {isSelected && (
                <circle
                  cx={cl.x}
                  cy={cl.y}
                  r={hasMultiple ? 16 : 12}
                  fill="none"
                  stroke={ACCENT}
                  strokeWidth={1.5}
                  opacity={0.45}
                />
              )}

              {/* Main Node Circle */}
              <circle
                cx={cl.x}
                cy={cl.y}
                r={isSelected ? 8 : isHovered ? 7.5 : 6}
                fill={
                  cl.on_frontier
                    ? isSelected
                      ? ACCENT
                      : "#16a34a"
                    : "rgba(148,163,184,0.65)"
                }
                stroke={isSelected ? "#ffffff" : isHovered ? SLATE : "#ffffff"}
                strokeWidth={1.8}
              />

              {/* Count badge for multiple weights in this cluster */}
              {hasMultiple && (
                <g transform={`translate(${cl.x + 6}, ${cl.y - 8})`}>
                  <rect
                    x={-5}
                    y={-5}
                    width={10}
                    height={10}
                    rx={5}
                    fill={isSelected ? ACCENT : "#0f172a"}
                    stroke="#ffffff"
                    strokeWidth={1}
                  />
                  <text
                    x={0}
                    y={2.5}
                    textAnchor="middle"
                    fontSize={7}
                    fontWeight={800}
                    fill="#ffffff"
                  >
                    {cl.items.length}
                  </text>
                </g>
              )}

              {/* Anti-Collision Label Pill */}
              <g transform={`translate(${placement.labelX}, ${placement.labelY})`}>
                <rect
                  x={-cl.labelWidth / 2}
                  y={-7}
                  width={cl.labelWidth}
                  height={14}
                  rx={4}
                  fill={isSelected ? "rgba(37,99,235,0.08)" : "rgba(255,255,255,0.92)"}
                  stroke={isSelected ? ACCENT : "rgba(203,213,225,0.9)"}
                  strokeWidth={isSelected ? 1.2 : 0.8}
                />
                <text
                  x={0}
                  y={3}
                  textAnchor="middle"
                  fontSize={8}
                  fontWeight={isSelected ? 800 : 700}
                  fill={isSelected ? ACCENT : cl.on_frontier ? SLATE : MUTED}
                >
                  {cl.labelText}
                </text>
              </g>
            </g>
          );
        })}

        {/* Hover detail tooltip */}
        {hoveredCluster && (
          <g
            transform={`translate(${Math.max(80, Math.min(W - 80, hoveredCluster.x))}, ${
              hoveredCluster.y < 70 ? hoveredCluster.y + 28 : hoveredCluster.y - 32
            })`}
          >
            <rect
              x={-78}
              y={-14}
              width={156}
              height={28}
              rx={6}
              fill="#0f172a"
              opacity={0.95}
            />
            <text x={0} y={-2} textAnchor="middle" fontSize={8} fontWeight={700} fill="#ffffff">
              ₹{hoveredCluster.total_cost.toLocaleString("en-IN")} · Regret: {hoveredCluster.expected_regret.toFixed(3)}
            </text>
            <text x={0} y={9} textAnchor="middle" fontSize={7} fill="#94a3b8">
              {hoveredCluster.items.length > 1
                ? `${hoveredCluster.items.length} weights share this plan (click to cycle)`
                : `w = ${hoveredCluster.items[0].candidate.risk_weight} · ${
                    hoveredCluster.on_frontier ? "Pareto Optimal" : "Dominated"
                  }`}
            </text>
          </g>
        )}
      </svg>

      {/* Active point risk-weight pills selector */}
      {activeCluster && (
        <div
          style={{
            marginTop: 8,
            padding: "6px 10px",
            borderRadius: 8,
            background: "rgba(15,23,42,0.03)",
            border: "1px solid var(--border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 6,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.68rem" }}>
            <span style={{ fontWeight: 700, color: SLATE }}>
              Active Point: ₹{activeCluster.total_cost.toLocaleString("en-IN")}
            </span>
            <span
              style={{
                color: activeCluster.expected_regret > 0 ? DANGER : "#16a34a",
                fontWeight: 600,
              }}
            >
              regret {activeCluster.expected_regret.toFixed(3)}
            </span>
            {activeCluster.on_frontier ? (
              <span style={{ color: "#16a34a", fontWeight: 700, fontSize: "0.62rem" }}>★ FRONTIER</span>
            ) : (
              <span style={{ color: MUTED, fontSize: "0.62rem" }}>DOMINATED</span>
            )}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
            <span style={{ fontSize: "0.65rem", color: MUTED, marginRight: 2 }}>
              {activeCluster.items.length > 1 ? "Select risk weight:" : "Risk weight:"}
            </span>
            {activeCluster.items.map(({ candidate, index }) => (
              <button
                key={candidate.risk_weight}
                type="button"
                onClick={() => onSelect(index)}
                style={{
                  fontSize: "0.65rem",
                  fontFamily: "var(--font-mono)",
                  fontWeight: selected === index ? 800 : 500,
                  padding: "2px 7px",
                  borderRadius: 9999,
                  border: `1px solid ${selected === index ? ACCENT : "var(--border)"}`,
                  background: selected === index ? ACCENT : "var(--card-bg, #fff)",
                  color: selected === index ? "#ffffff" : SLATE,
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                }}
              >
                w={candidate.risk_weight}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}




