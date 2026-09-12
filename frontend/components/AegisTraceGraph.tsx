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
  const W = 460;
  const H = 200;
  const PAD = 40;
  const feasible = candidates.filter((c) => c.path_nodes);
  if (feasible.length === 0) return null;
  const costs = feasible.map((c) => c.total_cost);
  const regrets = feasible.map((c) => c.expected_regret);
  const minX = Math.min(...costs) * 0.92;
  const maxX = (Math.max(...costs) || 1) * 1.06;
  const minY = Math.min(...regrets) * 0.9;
  const maxY = (Math.max(...regrets) || 1) * 1.15;
  const x = (v: number) => PAD + ((v - minX) / (maxX - minX || 1)) * (W - PAD - 16);
  const y = (v: number) => H - PAD - ((v - minY) / (maxY - minY || 1)) * (H - PAD - 24);

  const frontierPts = feasible
    .filter((c) => c.on_frontier)
    .sort((a, b) => a.total_cost - b.total_cost);

  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "#64748b", marginBottom: 6, display: "flex", alignItems: "center", gap: 5 }}>
        <LineChart size={12} style={{ color: "#16a34a" }} />
        PARETO FRONTIER — cost vs expected regret
        <span style={{ fontWeight: 500, color: MUTED }}>(click a point)</span>
      </div>
      <svg
        width="100%"
        viewBox={`0 0 ${W} ${H}`}
        style={{ background: "rgba(15,23,42,0.02)", borderRadius: 10, border: "1px solid var(--border)" }}
      >
        <line x1={PAD} y1={H - PAD} x2={W - 12} y2={H - PAD} stroke={MUTED} strokeWidth={1} />
        <line x1={PAD} y1={20} x2={PAD} y2={H - PAD} stroke={MUTED} strokeWidth={1} />
        <text x={W - 12} y={H - 12} textAnchor="end" fontSize={9} fill={MUTED}>
          total cost ₹→
        </text>
        <text x={PAD + 4} y={16} fontSize={9} fill={MUTED}>
          expected regret ↑
        </text>
        {frontierPts.length > 1 && (
          <polyline
            points={frontierPts.map((c) => `${x(c.total_cost)},${y(c.expected_regret)}`).join(" ")}
            fill="none"
            stroke="#16a34a"
            strokeWidth={1.5}
            strokeDasharray="4 3"
          />
        )}
        {candidates.map((c, i) =>
          c.path_nodes ? (
            <g key={c.risk_weight} onClick={() => onSelect(i)} style={{ cursor: "pointer" }}>
              <circle
                cx={x(c.total_cost)}
                cy={y(c.expected_regret)}
                r={selected === i ? 8 : 6}
                fill={c.on_frontier ? (selected === i ? ACCENT : "rgba(37,99,235,0.75)") : "rgba(148,163,184,0.45)"}
                stroke={selected === i ? SLATE : "none"}
                strokeWidth={1.5}
              />
              <text
                x={x(c.total_cost)}
                y={y(c.expected_regret) - 11}
                textAnchor="middle"
                fontSize={9}
                fontWeight={700}
                fill={c.on_frontier ? SLATE : MUTED}
              >
                w={c.risk_weight}
              </text>
            </g>
          ) : null
        )}
      </svg>
    </div>
  );
}




