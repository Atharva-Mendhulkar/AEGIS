"use client";
import { useState, useCallback, useEffect } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { AegisTraceGraph } from "../../components/AegisTraceGraph";
import { DisruptionSimulator } from "../../components/DisruptionSimulator";
import { MiniGameTree } from "../../components/MiniGameTree";
import { LiveMetricsPanel } from "../../components/LiveMetricsPanel";
import { INDIA_NETWORK } from "../../lib/constants";
import type { Disruption, GraphInput, Plan, AegisSession } from "../../lib/api";
import {
  getActiveSession,
  loadGraph,
  loadShipments,
  createPlan,
  clearDisruptions,
} from "../../lib/api";
import {
  Brain,
  Flame,
  Zap,
  Swords,
  Activity,
  MapPin,
  RotateCcw,
  TrendingUp,
  ArrowRight,
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
  Layers,
  Compass,
  ArrowLeft,
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
          height: 440,
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
  const [graph, setGraph] = useState<GraphInput>(INDIA_NETWORK);
  const [source, setSource] = useState<string | null>("delhi");
  const [destination, setDestination] = useState<string | null>("chennai");
  const [truckClass, setTruckClass] = useState<string>("hcv");
  const [fuelType, setFuelType] = useState<string>("diesel");
  const [goodsType, setGoodsType] = useState<string>("general");
  const [weightKg, setWeightKg] = useState<number>(1000);

  const [baselinePlan, setBaselinePlan] = useState<Plan | null>(null);
  const [replannedPlan, setReplannedPlan] = useState<Plan | null>(null);
  const [disruptions, setDisruptions] = useState<Disruption[]>([]);
  const [fromPlannerSession, setFromPlannerSession] = useState<boolean>(false);
  const [mapMode, setMapMode] = useState<"diff" | "baseline" | "replanned" | "heatmap">("diff");
  const [replanning, setReplanning] = useState<boolean>(false);
  const [replanError, setReplanError] = useState<string | null>(null);

  // 1. On mount: check for active session saved from Route Planner
  useEffect(() => {
    const session = getActiveSession();
    if (session && session.sourceId && session.destId) {
      setGraph(session.graph || INDIA_NETWORK);
      setSource(session.sourceId);
      setDestination(session.destId);
      setTruckClass(session.truckClass || "hcv");
      setFuelType(session.fuelType || "diesel");
      setGoodsType(session.goodsType || "general");
      setWeightKg(session.activePlan?.cargo_weight_kg || 1000);
      setBaselinePlan(session.activePlan || session.plans?.[0] || null);
      setFromPlannerSession(true);
    } else {
      // Default: generate baseline plan for default corridor (Delhi -> Chennai)
      fetchBaselineRoute(INDIA_NETWORK, "delhi", "chennai", "hcv", "diesel");
    }
  }, []);

  // Helper to fetch baseline plan if none loaded
  const fetchBaselineRoute = async (
    g: GraphInput,
    src: string,
    dst: string,
    tc: string,
    ft: string
  ) => {
    try {
      await loadGraph(g);
      const shipId = `viz-base-${Date.now()}`;
      await loadShipments([
        {
          id: shipId,
          origin_id: src,
          destination_id: dst,
          goods_type: "general",
          weight_kg: 1000,
        },
      ]);
      const res = await createPlan(shipId, tc, undefined, undefined, ft);
      if (res && res.length > 0) {
        const best = res.find((p) => p.is_best) || res[0];
        setBaselinePlan(best);
      }
    } catch (err) {
      console.warn("Could not load initial baseline plan:", err);
    }
  };

  // Replan automatically when disruptions change
  const computeReplan = useCallback(
    async (activeDisruptions: Disruption[]) => {
      if (!source || !destination) return;
      if (activeDisruptions.length === 0) {
        setReplannedPlan(null);
        setReplanError(null);
        return;
      }

      setReplanning(true);
      setReplanError(null);
      try {
        await loadGraph(graph);
        const shipId = `viz-disrupt-${Date.now()}`;
        await loadShipments([
          {
            id: shipId,
            origin_id: source,
            destination_id: destination,
            goods_type: goodsType,
            weight_kg: weightKg,
          },
        ]);
        const res = await createPlan(
          shipId,
          truckClass,
          undefined,
          undefined,
          fuelType,
          activeDisruptions
        );
        if (res && res.length > 0) {
          const best = res.find((p) => p.is_best) || res[0];
          setReplannedPlan(best);
        } else {
          setReplannedPlan(null);
          setReplanError("All compliant corridors severed by active disruptions.");
        }
      } catch (err: any) {
        setReplannedPlan(null);
        setReplanError(err?.message || "Detour route calculation failed.");
      } finally {
        setReplanning(false);
      }
    },
    [graph, source, destination, goodsType, weightKg, truckClass, fuelType]
  );

  const handleInjectDisruption = useCallback(
    (d: Disruption) => {
      setDisruptions((prev) => {
        const updated = [...prev, d];
        computeReplan(updated);
        return updated;
      });
    },
    [computeReplan]
  );

  const handleClearDisruptions = useCallback(() => {
    setDisruptions([]);
    setReplannedPlan(null);
    setReplanError(null);
    clearDisruptions().catch(() => {});
  }, []);

  const handleCorridorChange = (newSrc: string, newDst: string) => {
    setSource(newSrc);
    setDestination(newDst);
    setDisruptions([]);
    setReplannedPlan(null);
    setReplanError(null);
    fetchBaselineRoute(graph, newSrc, newDst, truckClass, fuelType);
  };

  const handleResetToDefaults = () => {
    setGraph(INDIA_NETWORK);
    setSource("delhi");
    setDestination("chennai");
    setTruckClass("hcv");
    setFuelType("diesel");
    setGoodsType("general");
    setFromPlannerSession(false);
    setDisruptions([]);
    setReplannedPlan(null);
    setReplanError(null);
    fetchBaselineRoute(INDIA_NETWORK, "delhi", "chennai", "hcv", "diesel");
  };

  const getDepotName = (id: string) => graph.depots.find((d) => d.id === id)?.name || id;

  // Active route IDs from baseline plan
  const baselineRouteIds = baselinePlan?.route_ids || [];
  const replannedRouteIds = replannedPlan?.route_ids || [];

  // Disruption impact metrics calculation
  const costDiff =
    replannedPlan && baselinePlan
      ? replannedPlan.total_operating_cost_inr - baselinePlan.total_operating_cost_inr
      : 0;
  const costPct =
    replannedPlan && baselinePlan && baselinePlan.total_operating_cost_inr > 0
      ? (costDiff / baselinePlan.total_operating_cost_inr) * 100
      : 0;

  const distDiff =
    replannedPlan && baselinePlan ? replannedPlan.distance_km - baselinePlan.distance_km : 0;

  // Compute baseline and replanned transit hours
  const routeMap = Object.fromEntries(graph.routes.map((r) => [r.id, r]));
  const baseHours = baselineRouteIds.reduce((sum, rid) => sum + (routeMap[rid]?.time_hours || 0), 0);
  const replanHours = replannedRouteIds.reduce((sum, rid) => sum + (routeMap[rid]?.time_hours || 0), 0);
  const timeDiff = replannedPlan ? replanHours - baseHours : 0;

  // Disrupted hops on baseline route
  const disruptedOnBaseline = baselineRouteIds.filter((rid) =>
    disruptions.some((d) => d.edge_id === rid)
  );

  const isDetoured =
    replannedPlan &&
    (baselineRouteIds.length !== replannedRouteIds.length ||
      baselineRouteIds.some((id, idx) => replannedRouteIds[idx] !== id));

  return (
    <main className="page-container">
      {/* Hero Header */}
      <header className="page-header">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div>
            <div className="eyebrow">
              <Brain size={12} />
              AEGIS Resilience &amp; Disruption Analyser
            </div>
            <h1>Corridor Visualizer &amp; Route Analysis</h1>
            <p>
              Inspect the exact route selected in the Route Planner, inject real-world
              disruptions (roadblocks, strikes, weather), and trace how AEGIS reroutes onto resilient corridors.
            </p>
          </div>

          <Link
            href="/"
            className="btn btn-secondary btn-sm"
            style={{ textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 6 }}
          >
            <ArrowLeft size={14} /> Back to Route Planner
          </Link>
        </div>
      </header>

      {/* Route Context Banner (Synchronized with Route Planner) */}
      <div
        className="card"
        style={{
          marginBottom: 20,
          background: fromPlannerSession ? "rgba(37, 99, 235, 0.04)" : "#ffffff",
          borderColor: fromPlannerSession ? "rgba(37, 99, 235, 0.25)" : "var(--border)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 8,
                background: "var(--accent-dim)",
                color: "var(--accent)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Compass size={20} />
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontWeight: 800, fontSize: "1rem", color: "#0f172a" }}>
                  {getDepotName(source || "")} → {getDepotName(destination || "")}
                </span>
                {fromPlannerSession ? (
                  <span className="badge badge-accent">● Active Route from Planner</span>
                ) : (
                  <span className="badge">Default Corridor</span>
                )}
              </div>
              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: 2 }}>
                Truck Class: <strong style={{ color: "#0f172a" }}>{truckClass.toUpperCase()}</strong> · Fuel:{" "}
                <strong style={{ color: "#0f172a" }}>{fuelType}</strong> · Goods:{" "}
                <strong style={{ color: "#0f172a" }}>{goodsType}</strong> · Weight:{" "}
                <strong style={{ color: "#0f172a" }}>{weightKg.toLocaleString()} kg</strong>
              </div>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {fromPlannerSession && (
              <button
                className="btn btn-secondary btn-sm"
                onClick={handleResetToDefaults}
                style={{ fontSize: "0.75rem" }}
              >
                <RotateCcw size={12} /> Reset to Backbone Default
              </button>
            )}

            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <select
                className="form-select"
                style={{ fontSize: "0.75rem", padding: "4px 8px", width: "auto" }}
                value={source || ""}
                onChange={(e) => handleCorridorChange(e.target.value, destination || "")}
              >
                {graph.depots.map((d) => (
                  <option key={d.id} value={d.id} disabled={d.id === destination}>
                    From: {d.name}
                  </option>
                ))}
              </select>
              <select
                className="form-select"
                style={{ fontSize: "0.75rem", padding: "4px 8px", width: "auto" }}
                value={destination || ""}
                onChange={(e) => handleCorridorChange(source || "", e.target.value)}
              >
                {graph.depots.map((d) => (
                  <option key={d.id} value={d.id} disabled={d.id === source}>
                    To: {d.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* ── Disruption Analyser: Route Change Intelligence ─────────── */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header" style={{ marginBottom: 12 }}>
          <h2>
            <ShieldAlert size={16} style={{ color: disruptions.length > 0 ? "var(--danger)" : "var(--accent)" }} />
            Disruption Analyser &amp; Corridor Detour Engine
          </h2>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {replanning && (
              <span style={{ fontSize: "0.75rem", color: "var(--accent)", display: "flex", alignItems: "center", gap: 4 }}>
                <span className="spinner" style={{ width: 12, height: 12 }} /> Computing Detour...
              </span>
            )}
            <span
              className={`badge ${
                disruptions.length === 0
                  ? "badge-success"
                  : isDetoured
                  ? "badge-accent"
                  : "badge-danger"
              }`}
            >
              {disruptions.length === 0
                ? "Route Optimal & Undisrupted"
                : isDetoured
                ? "Detour Route Activated"
                : "Disruption Detected"}
            </span>
          </div>
        </div>

        {/* Status Callout Banner */}
        {disruptions.length > 0 && (
          <div
            style={{
              padding: "10px 14px",
              borderRadius: "var(--radius-sm)",
              marginBottom: 16,
              background: isDetoured ? "rgba(16, 185, 129, 0.08)" : "rgba(239, 68, 68, 0.08)",
              border: `1px solid ${isDetoured ? "rgba(16, 185, 129, 0.25)" : "rgba(239, 68, 68, 0.25)"}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: 8,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {isDetoured ? (
                <CheckCircle2 size={16} style={{ color: "#10b981", flexShrink: 0 }} />
              ) : (
                <AlertTriangle size={16} style={{ color: "var(--danger)", flexShrink: 0 }} />
              )}
              <div style={{ fontSize: "0.825rem", color: "#0f172a" }}>
                {isDetoured ? (
                  <>
                    <strong>Resilient Detour Route Found:</strong> AEGIS rerouted around{" "}
                    <strong>{disruptedOnBaseline.length}</strong> severed segment(s) on the planned corridor.
                  </>
                ) : (
                  <>
                    <strong>Disruption Warning:</strong> Active disruptions detected on the network. Baseline route remains optimal.
                  </>
                )}
              </div>
            </div>

            {isDetoured && (
              <div style={{ display: "flex", gap: 10, fontSize: "0.78rem", fontWeight: 700 }}>
                <span style={{ color: costDiff > 0 ? "var(--warning)" : "var(--accent)" }}>
                  Cost Delta: {costDiff >= 0 ? "+" : ""}₹{Math.round(costDiff).toLocaleString()} ({costPct >= 0 ? "+" : ""}{costPct.toFixed(1)}%)
                </span>
                <span style={{ color: "var(--text-muted)" }}>·</span>
                <span style={{ color: timeDiff > 0 ? "var(--warning)" : "var(--accent)" }}>
                  Transit: {timeDiff >= 0 ? "+" : ""}{timeDiff.toFixed(1)}h
                </span>
                <span style={{ color: "var(--text-muted)" }}>·</span>
                <span style={{ color: distDiff > 0 ? "var(--warning)" : "var(--accent)" }}>
                  Detour: {distDiff >= 0 ? "+" : ""}{distDiff.toFixed(0)} km
                </span>
              </div>
            )}
          </div>
        )}

        {replanError && (
          <div
            style={{
              padding: "10px 14px",
              borderRadius: "var(--radius-sm)",
              marginBottom: 16,
              background: "var(--danger-dim)",
              border: "1px solid rgba(220, 38, 38, 0.3)",
              color: "var(--danger)",
              fontSize: "0.825rem",
              fontWeight: 600,
            }}
          >
            {replanError}
          </div>
        )}

        {/* ── Key Metrics Comparison Grid ──────────────────────────── */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: 12,
            marginBottom: 16,
          }}
        >
          {/* Operating Cost */}
          <div
            style={{
              padding: "10px 12px",
              borderRadius: 8,
              border: "1px solid var(--border)",
              background: "#ffffff",
            }}
          >
            <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", fontWeight: 700, textTransform: "uppercase" }}>
              Operating Cost (₹)
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 4 }}>
              <span style={{ fontSize: "1.15rem", fontWeight: 800, color: "#0f172a" }}>
                ₹{Math.round(replannedPlan?.total_operating_cost_inr || baselinePlan?.total_operating_cost_inr || 0).toLocaleString()}
              </span>
              {replannedPlan && (
                <span
                  style={{
                    fontSize: "0.72rem",
                    fontWeight: 700,
                    color: costDiff > 0 ? "#ea580c" : "#10b981",
                  }}
                >
                  {costDiff >= 0 ? "+" : ""}₹{Math.round(costDiff).toLocaleString()}
                </span>
              )}
            </div>
            <div style={{ fontSize: "0.68rem", color: "var(--text-muted)", marginTop: 2 }}>
              Baseline: ₹{Math.round(baselinePlan?.total_operating_cost_inr || 0).toLocaleString()}
            </div>
          </div>

          {/* Transit Time */}
          <div
            style={{
              padding: "10px 12px",
              borderRadius: 8,
              border: "1px solid var(--border)",
              background: "#ffffff",
            }}
          >
            <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", fontWeight: 700, textTransform: "uppercase" }}>
              Transit Time (Hours)
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 4 }}>
              <span style={{ fontSize: "1.15rem", fontWeight: 800, color: "#0f172a" }}>
                {(replannedPlan ? replanHours : baseHours).toFixed(1)} hrs
              </span>
              {replannedPlan && (
                <span
                  style={{
                    fontSize: "0.72rem",
                    fontWeight: 700,
                    color: timeDiff > 0 ? "#ea580c" : "#10b981",
                  }}
                >
                  {timeDiff >= 0 ? "+" : ""}{timeDiff.toFixed(1)} hrs
                </span>
              )}
            </div>
            <div style={{ fontSize: "0.68rem", color: "var(--text-muted)", marginTop: 2 }}>
              Baseline: {baseHours.toFixed(1)} hrs
            </div>
          </div>

          {/* Corridor Distance */}
          <div
            style={{
              padding: "10px 12px",
              borderRadius: 8,
              border: "1px solid var(--border)",
              background: "#ffffff",
            }}
          >
            <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", fontWeight: 700, textTransform: "uppercase" }}>
              Total Distance (km)
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 4 }}>
              <span style={{ fontSize: "1.15rem", fontWeight: 800, color: "#0f172a" }}>
                {Math.round(replannedPlan?.distance_km || baselinePlan?.distance_km || 0)} km
              </span>
              {replannedPlan && (
                <span
                  style={{
                    fontSize: "0.72rem",
                    fontWeight: 700,
                    color: distDiff > 0 ? "#ea580c" : "#10b981",
                  }}
                >
                  {distDiff >= 0 ? "+" : ""}{Math.round(distDiff)} km
                </span>
              )}
            </div>
            <div style={{ fontSize: "0.68rem", color: "var(--text-muted)", marginTop: 2 }}>
              Baseline: {Math.round(baselinePlan?.distance_km || 0)} km
            </div>
          </div>

          {/* Risk Score */}
          <div
            style={{
              padding: "10px 12px",
              borderRadius: 8,
              border: "1px solid var(--border)",
              background: "#ffffff",
            }}
          >
            <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", fontWeight: 700, textTransform: "uppercase" }}>
              Corridor Risk Exposure
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 4 }}>
              <span
                style={{
                  fontSize: "1.15rem",
                  fontWeight: 800,
                  color:
                    (replannedPlan?.risk_score || baselinePlan?.risk_score || 0) > 0.5
                      ? "#dc2626"
                      : "#10b981",
                }}
              >
                {(((replannedPlan?.risk_score ?? baselinePlan?.risk_score) || 0) * 100).toFixed(0)}%
              </span>
              <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>
                regret: {(replannedPlan?.expected_regret ?? baselinePlan?.expected_regret ?? 0).toFixed(2)}
              </span>
            </div>
            <div style={{ fontSize: "0.68rem", color: "var(--text-muted)", marginTop: 2 }}>
              Baseline Risk: {((baselinePlan?.risk_score || 0) * 100).toFixed(0)}%
            </div>
          </div>
        </div>

        {/* ── Hop-by-Hop Corridor Diff (Before vs After) ────────────── */}
        <div style={{ borderTop: "1px solid var(--border)", paddingTop: 14 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.04em" }}>
              Hop-by-Hop Corridor Trace Comparison
            </div>
            <span style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>
              {isDetoured ? "Showing baseline vs detour divergence" : "Baseline route intact"}
            </span>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12 }}>
            {/* Baseline Route Hops */}
            <div
              style={{
                background: "rgba(37, 99, 235, 0.03)",
                border: "1px solid rgba(37, 99, 235, 0.15)",
                borderRadius: 8,
                padding: "10px 12px",
              }}
            >
              <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--accent)", marginBottom: 8, display: "flex", alignItems: "center", gap: 5 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--accent)" }} />
                BASELINE ROUTE FROM PLANNER ({baselineRouteIds.length} hops)
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {baselineRouteIds.map((rid, i) => {
                  const r = routeMap[rid];
                  const o = r ? getDepotName(r.origin_id) : rid;
                  const d = r ? getDepotName(r.destination_id) : "";
                  const dis = disruptions.find((dObj) => dObj.edge_id === rid);
                  return (
                    <div
                      key={rid}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "5px 8px",
                        borderRadius: 6,
                        background: dis ? "rgba(239, 68, 68, 0.1)" : "#ffffff",
                        border: `1px solid ${dis ? "rgba(239, 68, 68, 0.3)" : "var(--border)"}`,
                        fontSize: "0.75rem",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ color: "var(--text-muted)", fontSize: "0.68rem", fontWeight: 700 }}>
                          #{i + 1}
                        </span>
                        <span style={{ fontWeight: 600, color: dis ? "var(--danger)" : "#0f172a" }}>
                          {o} → {d}
                        </span>
                      </div>
                      <div>
                        {dis ? (
                          <span className="badge badge-danger" style={{ fontSize: "0.62rem", padding: "1px 6px" }}>
                            Disrupted ({Math.round(dis.severity * 100)}%)
                          </span>
                        ) : (
                          <span style={{ fontSize: "0.68rem", color: "var(--text-muted)" }}>
                            ₹{r?.cost} · {r?.time_hours}h
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Replanned / Detour Route Hops */}
            <div
              style={{
                background: replannedPlan ? "rgba(16, 185, 129, 0.03)" : "rgba(15, 23, 42, 0.02)",
                border: `1px solid ${replannedPlan ? "rgba(16, 185, 129, 0.2)" : "var(--border)"}`,
                borderRadius: 8,
                padding: "10px 12px",
              }}
            >
              <div
                style={{
                  fontSize: "0.72rem",
                  fontWeight: 700,
                  color: replannedPlan ? "#10b981" : "var(--text-muted)",
                  marginBottom: 8,
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: replannedPlan ? "#10b981" : "var(--text-muted)",
                  }}
                />
                REPLANNED RESILIENT DETOUR ({replannedRouteIds.length} hops)
              </div>
              {replannedPlan ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {replannedRouteIds.map((rid, i) => {
                    const r = routeMap[rid];
                    const o = r ? getDepotName(r.origin_id) : rid;
                    const d = r ? getDepotName(r.destination_id) : "";
                    const isNewDetour = !baselineRouteIds.includes(rid);
                    return (
                      <div
                        key={rid}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          padding: "5px 8px",
                          borderRadius: 6,
                          background: isNewDetour ? "rgba(16, 185, 129, 0.12)" : "#ffffff",
                          border: `1px solid ${isNewDetour ? "rgba(16, 185, 129, 0.35)" : "var(--border)"}`,
                          fontSize: "0.75rem",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{ color: "var(--text-muted)", fontSize: "0.68rem", fontWeight: 700 }}>
                            #{i + 1}
                          </span>
                          <span style={{ fontWeight: 600, color: isNewDetour ? "#065f46" : "#0f172a" }}>
                            {o} → {d}
                          </span>
                        </div>
                        <div>
                          {isNewDetour ? (
                            <span
                              className="badge"
                              style={{
                                background: "#10b981",
                                color: "#ffffff",
                                fontSize: "0.62rem",
                                padding: "1px 6px",
                              }}
                            >
                              ↪ Detour Hop
                            </span>
                          ) : (
                            <span style={{ fontSize: "0.68rem", color: "var(--text-muted)" }}>
                              ● Retained Leg
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div style={{ padding: "20px 0", textAlign: "center", color: "var(--text-muted)", fontSize: "0.78rem" }}>
                  Inject a disruption below to watch the detour route appear in real time.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Visual Map & Disruption Simulator Grid ──────────────────── */}
      <div className="grid-2" style={{ marginBottom: 20 }}>
        {/* Map View Card with Layer Toggles */}
        <div className="card">
          <div className="card-header">
            <h2>
              <MapPin size={16} style={{ color: "var(--accent)" }} />
              Live Corridor Routing Map
            </h2>
            {/* Layer Controls */}
            <div style={{ display: "flex", gap: 4 }}>
              {[
                { id: "diff", label: "Diff Overlay" },
                { id: "baseline", label: "Baseline" },
                { id: "replanned", label: "Detour" },
                { id: "heatmap", label: "Heatmap" },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setMapMode(tab.id as any)}
                  style={{
                    padding: "3px 8px",
                    fontSize: "0.68rem",
                    fontWeight: 700,
                    borderRadius: 4,
                    border: "1px solid",
                    cursor: "pointer",
                    background: mapMode === tab.id ? "var(--accent)" : "#ffffff",
                    color: mapMode === tab.id ? "#ffffff" : "var(--text-secondary)",
                    borderColor: mapMode === tab.id ? "var(--accent)" : "var(--border)",
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginBottom: 12 }}>
            {mapMode === "diff"
              ? "Comparing Baseline Route (Cobalt Blue) vs Resilient Detour (Emerald Green), with disrupted segments highlighted in Red."
              : mapMode === "baseline"
              ? "Displaying the baseline route selected in the Route Planner."
              : mapMode === "replanned"
              ? "Displaying the AEGIS resilient detour around disruptions."
              : "Heatmap overlay: corridor edges colored by Bayesian union risk score."}
          </p>

          <MapView
            graph={graph}
            baselinePlan={mapMode === "replanned" ? null : baselinePlan}
            replannedPlan={mapMode === "baseline" ? null : replannedPlan}
            source={source}
            destination={destination}
            riskHeatmap={mapMode === "heatmap"}
            disruptions={disruptions}
            height={440}
          />
        </div>

        {/* Interactive Disruption Simulator Card */}
        <div className="card">
          <div className="card-header">
            <h2>
              <Zap size={16} style={{ color: "var(--danger)" }} />
              Disruption Injection Simulator
            </h2>
            <span className="badge">
              {disruptions.length > 0 ? `${disruptions.length} Active Disruption(s)` : "Network Normal"}
            </span>
          </div>
          <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginBottom: 12 }}>
            Simulate realistic corridor hazards (road closures, strikes, monsoon flooding, accidents).
            Use the 1-click active route buttons to instantly test AEGIS&apos;s rerouting capability.
          </p>

          <DisruptionSimulator
            graph={graph}
            disruptions={disruptions}
            activeRouteIds={baselineRouteIds}
            onInject={handleInjectDisruption}
            onClear={handleClearDisruptions}
          />
        </div>
      </div>

      {/* ── AEGIS Planning Pipeline Trace (UCS Sweep + Pareto) ──────── */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header">
          <h2>
            <Brain size={16} style={{ color: "var(--accent)" }} />
            AEGIS Planning Pipeline Trace
          </h2>
          <span className="badge badge-accent">Pareto Frontier Generator</span>
        </div>
        <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginBottom: 12 }}>
          Stage-by-stage execution trace: UCS sweeps risk weights (w ∈ 0, 0.5, 1, 2, 5).
          Each sweep re-weights corridor edges to{" "}
          <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600 }}>cost × (1 + w · risk)</span>,
          generating candidate plans that establish the Pareto frontier.
        </p>
        <AegisTraceGraph
          graph={graph}
          source={source}
          destination={destination}
          disruptions={disruptions}
        />
      </div>

      {/* ── Minimax Game Tree + Live Metrics ────────────────────────── */}
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
              <Activity size={16} style={{ color: "var(--accent)" }} />
              Live Telemetry
            </h2>
          </div>
          <LiveMetricsPanel />
        </div>
      </div>
    </main>
  );
}
