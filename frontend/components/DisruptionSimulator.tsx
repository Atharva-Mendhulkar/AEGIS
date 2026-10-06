"use client";
import { useState } from "react";
import { Zap, AlertTriangle } from "lucide-react";
import type { GraphInput, Disruption } from "../lib/api";

interface Props {
  graph: GraphInput;
  disruptions: Disruption[];
  activeRouteIds?: string[];
  onInject: (d: Disruption) => void;
  onClear: () => void;
}

export function DisruptionSimulator({
  graph,
  disruptions,
  activeRouteIds = [],
  onInject,
  onClear,
}: Props) {
  const initialEdge =
    activeRouteIds.length > 0 && graph.routes.some((r) => r.id === activeRouteIds[0])
      ? activeRouteIds[0]
      : graph.routes[0]?.id || "";
  const [edgeId, setEdgeId] = useState(initialEdge);
  const [severity, setSeverity] = useState(0.8);
  const [type, setType] = useState("road_closure");

  const handleInject = () => {
    onInject({
      type,
      edge_id: edgeId,
      severity,
      source: "simulator",
    });
  };

  const handleQuickDisrupt = (routeId: string, disType: string, sev: number) => {
    onInject({
      type: disType,
      edge_id: routeId,
      severity: sev,
      source: "quick_action",
    });
  };

  const route = graph.routes.find((r) => r.id === edgeId);
  const originName = route ? graph.depots.find((d) => d.id === route.origin_id)?.name : "";
  const destName = route ? graph.depots.find((d) => d.id === route.destination_id)?.name : "";

  const activeRoutes = graph.routes.filter((r) => activeRouteIds.includes(r.id));
  const otherRoutes = graph.routes.filter((r) => !activeRouteIds.includes(r.id));

  return (
    <div className="stack" style={{ gap: 14 }}>
      {/* Quick 1-click presets for active route hops */}
      {activeRoutes.length > 0 && (
        <div
          style={{
            background: "rgba(239, 68, 68, 0.05)",
            border: "1px solid rgba(239, 68, 68, 0.2)",
            borderRadius: "var(--radius-sm)",
            padding: "10px 12px",
          }}
        >
          <div
            style={{
              fontSize: "0.72rem",
              fontWeight: 700,
              color: "var(--danger)",
              marginBottom: 6,
              display: "flex",
              alignItems: "center",
              gap: 5,
            }}
          >
            <Zap size={12} />
            QUICK SCENARIOS ON ACTIVE ROUTE
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {activeRoutes.slice(0, 3).map((r, idx) => {
              const o = graph.depots.find((d) => d.id === r.origin_id)?.name || r.origin_id;
              const d = graph.depots.find((dep) => dep.id === r.destination_id)?.name || r.destination_id;
              const isBlocked = disruptions.some((dis) => dis.edge_id === r.id);
              return (
                <button
                  key={r.id}
                  className="btn btn-secondary btn-sm"
                  disabled={isBlocked}
                  onClick={() => handleQuickDisrupt(r.id, "road_closure", 1.0)}
                  style={{
                    fontSize: "0.68rem",
                    padding: "3px 8px",
                    background: isBlocked ? "rgba(239, 68, 68, 0.1)" : "#fff",
                    borderColor: isBlocked ? "var(--danger)" : undefined,
                  }}
                  title={`Block ${o} → ${d}`}
                >
                  {isBlocked ? "Blocked:" : "Block Leg:"} {o} → {d}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="form-group">
        <label className="form-label">Target Route Segment</label>
        <select
          className="form-select"
          value={edgeId}
          onChange={(e) => setEdgeId(e.target.value)}
        >
          {activeRoutes.length > 0 && (
            <optgroup label="Corridors on Active Route">
              {activeRoutes.map((r) => {
                const o = graph.depots.find((d) => d.id === r.origin_id)?.name || r.origin_id;
                const d = graph.depots.find((dep) => dep.id === r.destination_id)?.name || r.destination_id;
                return (
                  <option key={r.id} value={r.id}>
                    [Active] {r.id}: {o} → {d} (risk: {(r.risk_prior * 100).toFixed(0)}%)
                  </option>
                );
              })}
            </optgroup>
          )}
          <optgroup label="Other Network Routes">
            {otherRoutes.map((r) => {
              const o = graph.depots.find((d) => d.id === r.origin_id)?.name || r.origin_id;
              const d = graph.depots.find((dep) => dep.id === r.destination_id)?.name || r.destination_id;
              return (
                <option key={r.id} value={r.id}>
                  {r.id}: {o} → {d} (risk: {(r.risk_prior * 100).toFixed(0)}%)
                </option>
              );
            })}
          </optgroup>
        </select>
      </div>

      <div className="form-group">
        <label className="form-label">Disruption Type</label>
        <select
          className="form-select"
          value={type}
          onChange={(e) => setType(e.target.value)}
        >
          <option value="weather">Weather</option>
          <option value="strike">Strike</option>
          <option value="road_closure">Road Closure</option>
          <option value="accident">Accident</option>
          <option value="flood">Flood</option>
        </select>
      </div>

      <div className="form-group">
        <label className="form-label">
          Severity: {(severity * 100).toFixed(0)}%
        </label>
        <input
          type="range"
          className="form-range"
          min={0.1}
          max={1.0}
          step={0.1}
          value={severity}
          onChange={(e) => setSeverity(parseFloat(e.target.value))}
        />
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.68rem", color: "var(--text-dim)", marginTop: 4 }}>
          <span>Minor</span>
          <span>Complete block</span>
        </div>
      </div>

      {route && (
        <div
          style={{
            fontSize: "0.78rem",
            color: "var(--text-secondary)",
            padding: "8px 12px",
            background: "var(--danger-dim)",
            borderRadius: "var(--radius-sm)",
            border: "1px solid rgba(220, 38, 38, 0.2)",
          }}
        >
          <AlertTriangle size={12} style={{ color: "var(--danger)", marginRight: 4 }} />
          Will inject <strong>{type}</strong> on{" "}
          <strong>{originName} → {destName}</strong> at{" "}
          <strong>{(severity * 100).toFixed(0)}%</strong> severity
        </div>
      )}

      <div className="btn-group">
        <button className="btn btn-danger btn-sm" onClick={handleInject} style={{ flex: 1 }}>
          <Zap size={14} /> Inject Disruption
        </button>
        {disruptions.length > 0 && (
          <button className="btn btn-secondary btn-sm" onClick={onClear}>
            Clear All ({disruptions.length})
          </button>
        )}
      </div>

      {/* Active disruptions list */}
      {disruptions.length > 0 && (
        <div style={{ fontSize: "0.78rem" }}>
          <div style={{ fontWeight: 600, color: "var(--text-muted)", marginBottom: 6, fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.04em" }}>
            Active Disruptions
          </div>
          {disruptions.map((d, i) => {
            const r = graph.routes.find((route) => route.id === d.edge_id);
            const oN = r ? graph.depots.find((dep) => dep.id === r.origin_id)?.name : d.edge_id;
            const dN = r ? graph.depots.find((dep) => dep.id === r.destination_id)?.name : "";
            return (
              <div
                key={i}
                className="animate-fade-in"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "6px 0",
                  borderBottom: "1px solid var(--border)",
                }}
              >
                <span style={{ fontSize: "10px", fontWeight: 700, padding: "2px 6px", borderRadius: 4, background: "var(--danger-dim)", color: "var(--danger)", textTransform: "uppercase" }}>
                  {d.type.replace("_", " ")}
                </span>
                <span style={{ color: "var(--text)" }}>
                  {oN} → {dN}
                </span>
                <span
                  style={{
                    marginLeft: "auto",
                    color: d.severity >= 0.7 ? "var(--danger)" : "var(--warning)",
                    fontWeight: 600,
                    fontFamily: "var(--font-mono)",
                  }}
                >
                  {(d.severity * 100).toFixed(0)}%
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
