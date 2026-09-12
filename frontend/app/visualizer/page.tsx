"use client";
import { useState, useCallback } from "react";
import dynamic from "next/dynamic";
import { AegisTraceGraph } from "../../components/AegisTraceGraph";
import { DisruptionSimulator } from "../../components/DisruptionSimulator";
import { MiniGameTree } from "../../components/MiniGameTree";
import { LiveMetricsPanel } from "../../components/LiveMetricsPanel";
import { INDIA_NETWORK } from "../../lib/constants";
import type { Disruption, GraphInput } from "../../lib/api";
import {
  Brain,
  Flame,
  Zap,
  Swords,
  Activity,
  MapPin,
} from "lucide-react";

// Dynamic import for MapView (Leaflet needs the window object)
const MapView = dynamic(
  () => import("../../components/MapView").then((m) => ({ default: m.MapView })),
  {
    ssr: false,
    loading: () => (
      <div
        style={{
          width: "100%",
          height: 420,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--text-muted)",
          fontSize: "0.85rem",
          fontWeight: 600,
          background: "rgba(15,23,42,0.02)",
          borderRadius: "var(--radius)",
        }}
      >
        <span className="spinner" style={{ marginRight: 10 }} />
        Loading corridor map…
      </div>
    ),
  }
);

export default function VisualizerPage() {
  const graph: GraphInput = INDIA_NETWORK;

  const [source, setSource] = useState<string | null>("delhi");
  const [destination, setDestination] = useState<string | null>("chennai");
  const [disruptions, setDisruptions] = useState<Disruption[]>([]);

  const handleInjectDisruption = useCallback((d: Disruption) => {
    setDisruptions((prev) => [...prev, d]);
  }, []);

  const handleClearDisruptions = useCallback(() => {
    setDisruptions([]);
  }, []);

  return (
    <main className="page-container">
      {/* Hero */}
      <header className="page-header">
        <div className="eyebrow">
          <Brain size={12} />
          AEGIS Algorithm Visualizer
        </div>
        <h1>How AEGIS thinks.</h1>
        <p>
          Watch the resilience planner sweep risk weights, re-weight every corridor
          edge, inject disruptions, and carve the Pareto frontier — all in real time.
        </p>
      </header>

      {/* Source/Dest Selector */}
      <div
        className="card"
        style={{ marginBottom: 20, display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-end" }}
      >
        <div className="form-group" style={{ flex: 1, minWidth: 150, marginBottom: 0 }}>
          <label className="form-label">
            <MapPin size={11} style={{ color: "#2563eb" }} /> Source
          </label>
          <select
            className="form-select"
            value={source || ""}
            onChange={(e) => setSource(e.target.value)}
          >
            {graph.depots.map((d) => (
              <option key={d.id} value={d.id} disabled={d.id === destination}>
                {d.name}
              </option>
            ))}
          </select>
        </div>
        <div className="form-group" style={{ flex: 1, minWidth: 150, marginBottom: 0 }}>
          <label className="form-label">
            <MapPin size={11} style={{ color: "#dc2626" }} /> Destination
          </label>
          <select
            className="form-select"
            value={destination || ""}
            onChange={(e) => setDestination(e.target.value)}
          >
            {graph.depots.map((d) => (
              <option key={d.id} value={d.id} disabled={d.id === source}>
                {d.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Row 1: AEGIS Planning Pipeline (risk sweep + Pareto frontier) */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header">
          <h2>
            <Brain size={16} style={{ color: "#2563eb" }} />
            AEGIS Planning Pipeline
          </h2>
          <span className="badge badge-accent">Resilience Planner</span>
        </div>
        <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginBottom: 12 }}>
          The planner runs risk-weighted uniform-cost search once per risk weight
          (w ∈ 0, 0.5, 1, 2, 5). Each sweep re-weights every corridor edge to{" "}
          <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600 }}>cost × (1 + w · risk)</span>,
          producing a candidate on the cost-vs-regret plane; the non-dominated
          candidates form the <strong>Pareto frontier</strong> AEGIS dispatches from.
          Inject disruptions below to watch the frontier move.
        </p>
        <AegisTraceGraph
          graph={graph}
          source={source}
          destination={destination}
          disruptions={disruptions}
        />
      </div>

      {/* Row 2: Risk Heatmap (live map overlay) + Disruption Simulator */}
      <div className="grid-2" style={{ marginBottom: 20 }}>
        <div className="card">
          <div className="card-header">
            <h2>
              <Flame size={16} style={{ color: "#dc2626" }} />
              Risk Heatmap
            </h2>
            <span className="badge">
              {disruptions.length > 0
                ? `${disruptions.length} active disruption${disruptions.length > 1 ? "s" : ""}`
                : "Baseline risk"}
            </span>
          </div>
          <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginBottom: 12 }}>
            Every corridor is coloured by its effective risk — the Bayesian union of
            the route&apos;s base prior and any injected disruptions. Hover a corridor
            for details; inject disruptions on the right to watch hot corridors flare.
          </p>
          <MapView
            graph={graph}
            source={source}
            destination={destination}
            riskHeatmap
            disruptions={disruptions}
            height={420}
          />
        </div>

        <div className="card">
          <div className="card-header">
            <h2>
              <Zap size={16} style={{ color: "#dc2626" }} />
              Disruption Simulator
            </h2>
          </div>
          <DisruptionSimulator
            graph={graph}
            disruptions={disruptions}
            onInject={handleInjectDisruption}
            onClear={handleClearDisruptions}
          />
        </div>
      </div>

      {/* Row 3: Minimax Game Tree + Live Metrics */}
      <div className="grid-2" style={{ marginBottom: 20 }}>
        <div className="card">
          <div className="card-header">
            <h2>
              <Swords size={16} style={{ color: "#0f172a" }} />
              Adversarial Game Tree
            </h2>
            <span className="badge">Alpha-Beta Pruning</span>
          </div>
          <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginBottom: 12 }}>
            Minimax tree where the <span style={{ color: "#2563eb", fontWeight: 600 }}>planner (MAX)</span> minimizes
            cost while the <span style={{ color: "#dc2626", fontWeight: 600 }}>adversary (MIN)</span> maximizes disruption.
            Pruned branches are crossed out.
          </p>
          <MiniGameTree depth={3} />
        </div>

        <div className="card">
          <div className="card-header">
            <h2>
              <Activity size={16} style={{ color: "#2563eb" }} />
              Live Telemetry
            </h2>
          </div>
          <LiveMetricsPanel />
        </div>
      </div>
    </main>
  );
}
