"use client";
import { useState, useCallback, useEffect } from "react";
import dynamic from "next/dynamic";
import { SourceDestPicker } from "../components/SourceDestPicker";
import { AnalysisPanel } from "../components/AnalysisPanel";
import { ParetoChart } from "../components/ParetoChart";
import { EventConsole } from "../components/EventConsole";
import { INDIA_NETWORK, type FuelType } from "../lib/constants";
import type { Plan, PlanPoint, GraphInput, TruckClass } from "../lib/api";
import { loadGraph, loadShipments, createPlan, fetchTruckClasses } from "../lib/api";
import { buildDynamicNetwork, type CustomLocation } from "../lib/dynamicGraph";
import {
  TrendingUp,
  Activity,
  ChevronLeft,
  ChevronRight,
  Shield,
  Sparkles,
  Play,
  RotateCcw,
  Navigation,
} from "lucide-react";

// Dynamic import for MapView (Leaflet needs window object)
const MapView = dynamic(
  () => import("../components/MapView").then((m) => ({ default: m.MapView })),
  {
    ssr: false,
    loading: () => (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "#f8fafc",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--text-muted)",
          fontSize: "0.9rem",
          fontWeight: 600,
        }}
      >
        <span className="spinner" style={{ marginRight: 10 }} />
        Initializing OpenStreetMap Logistics Network…
      </div>
    ),
  }
);

export default function RoutePlannerPage() {
  // Dynamic network state
  const [dynamicGraph, setDynamicGraph] = useState<GraphInput>(INDIA_NETWORK);

  // Source & Destination custom or hub locations
  const [sourceLoc, setSourceLoc] = useState<CustomLocation | null>({
    id: "delhi",
    name: "Delhi",
    latitude: 28.6139,
    longitude: 77.2090,
    isCustom: false,
  });

  const [destLoc, setDestLoc] = useState<CustomLocation | null>({
    id: "chennai",
    name: "Chennai",
    latitude: 13.0827,
    longitude: 80.2707,
    isCustom: false,
  });

  const [activeSourceId, setActiveSourceId] = useState<string>("delhi");
  const [activeDestId, setActiveDestId] = useState<string>("chennai");

  const [goodsType, setGoodsType] = useState("general");
  const [truckClass, setTruckClass] = useState("hcv");
  const [fuelType, setFuelType] = useState<FuelType>("diesel");
  const [maxPayloadKg, setMaxPayloadKg] = useState<number | undefined>(undefined);
  const [gvwKg, setGvwKg] = useState<number | undefined>(undefined);
  const [truckClasses, setTruckClasses] = useState<TruckClass[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [selectedPlan, setSelectedPlan] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showConsole, setShowConsole] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Fetch Indian truck classes from backend on mount
  useEffect(() => {
    fetchTruckClasses()
      .then(setTruckClasses)
      .catch(() => { /* use static fallback already in SourceDestPicker */ });
  }, []);

  // Map depot click handler
  const handleSelectDepot = useCallback(
    (depotId: string) => {
      const depot = dynamicGraph.depots.find((d) => d.id === depotId);
      if (!depot) return;

      if (!sourceLoc) {
        setSourceLoc({ ...depot, isCustom: false });
        setActiveSourceId(depot.id);
      } else if (!destLoc && depot.id !== activeSourceId) {
        setDestLoc({ ...depot, isCustom: false });
        setActiveDestId(depot.id);
      } else {
        setSourceLoc({ ...depot, isCustom: false });
        setActiveSourceId(depot.id);
        setDestLoc(null);
        setPlans([]);
      }
    },
    [sourceLoc, destLoc, activeSourceId, dynamicGraph]
  );

  // Swap Source and Destination
  const handleSwap = () => {
    const tempSrc = sourceLoc;
    setSourceLoc(destLoc);
    setDestLoc(tempSrc);
    setActiveSourceId(activeDestId);
    setActiveDestId(activeSourceId);
    setPlans([]);
    setError(null);
  };

  // Preset Selection
  const handlePresetSelect = (src: CustomLocation, dst: CustomLocation) => {
    setSourceLoc(src);
    setDestLoc(dst);
    setPlans([]);
    setError(null);
  };

  // Execute Planning with Dynamic Graph Injection
  const handleRun = async () => {
    if (!sourceLoc || !destLoc) return;
    setLoading(true);
    setError(null);
    setPlans([]);
    setSelectedPlan(0);

    try {
      // 1. Build dynamically expanded graph (attaching feeder corridors if custom addresses)
      const dynamicResult = buildDynamicNetwork(sourceLoc, destLoc, INDIA_NETWORK);
      setDynamicGraph(dynamicResult.graph);
      setActiveSourceId(dynamicResult.sourceId);
      setActiveDestId(dynamicResult.destinationId);

      // 2. Upload dynamic graph to AEGIS FastAPI backend
      await loadGraph(dynamicResult.graph);

      // 3. Register shipment with source and destination
      const shipmentId = `shipment-${Date.now()}`;
      await loadShipments([
        {
          id: shipmentId,
          origin_id: dynamicResult.sourceId,
          destination_id: dynamicResult.destinationId,
          goods_type: goodsType,
          weight_kg: 1000,
        },
      ]);

      // 4. Generate plans via AEGIS (truck-aware, fuel-aware, Pareto frontier)
      const result = await createPlan(shipmentId, truckClass, maxPayloadKg, gvwKg, fuelType);
      if (!result || result.length === 0) {
        throw new Error("No feasible compliant route found for this corridor configuration.");
      }
      setPlans(result);
    } catch (err: any) {
      console.error("AEGIS Planning Error:", err);
      setError(err.message || "Route planning failed. Please ensure the backend is reachable.");
    } finally {
      setLoading(false);
    }
  };

  // Keyboard shortcut: Cmd+Enter or Ctrl+Enter to Run
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        handleRun();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [sourceLoc, destLoc, goodsType, truckClass, maxPayloadKg, gvwKg, fuelType]);

  const handleClear = () => {
    setSourceLoc(null);
    setDestLoc(null);
    setActiveSourceId("");
    setActiveDestId("");
    setDynamicGraph(INDIA_NETWORK);
    setPlans([]);
    setSelectedPlan(0);
    setError(null);
  };

  const chartData: PlanPoint[] = plans.map((p, i) => ({
    total_cost: p.total_cost,
    expected_regret: p.expected_regret,
    label: `Plan ${i + 1}`,
  }));

  const canRun = Boolean(
    sourceLoc &&
      destLoc &&
      (sourceLoc.name !== destLoc.name || sourceLoc.latitude !== destLoc.latitude) &&
      !loading
  );

  return (
    <div className="fullscreen-map-wrapper">
      {/* Full-Screen OpenStreetMap */}
      <MapView
        graph={dynamicGraph}
        plans={plans.length > 0 ? [plans[selectedPlan] || plans[0]] : []}
        source={activeSourceId}
        destination={activeDestId}
        onSelectDepot={handleSelectDepot}
        searchedLocation={
          sourceLoc?.isCustom
            ? { name: sourceLoc.name, latitude: sourceLoc.latitude, longitude: sourceLoc.longitude }
            : destLoc?.isCustom
            ? { name: destLoc.name, latitude: destLoc.latitude, longitude: destLoc.longitude }
            : null
        }
        height="100%"
      />

      {/* Floating Sidebar Toggle Button (visible when sidebar is collapsed) */}
      {!sidebarOpen && (
        <button
          className="sidebar-toggle-btn animate-fade-in"
          onClick={() => setSidebarOpen(true)}
          title="Open Control Panel"
        >
          <ChevronRight size={18} />
        </button>
      )}

      {/* Floating Glassmorphic Control Drawer */}
      <aside className={`floating-sidebar glass-panel ${!sidebarOpen ? "collapsed" : ""}`}>
        {/* Drawer Header */}
        <div
          style={{
            padding: "14px 18px",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "rgba(255, 255, 255, 0.75)",
            flexShrink: 0,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: "var(--accent-dim)",
                color: "var(--accent)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Shield size={18} />
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: "0.95rem", color: "#0f172a" }}>
                AEGIS Planner
              </div>
              <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", fontWeight: 500 }}>
                Resilience-Aware Logistics
              </div>
            </div>
          </div>

          <button
            onClick={() => setSidebarOpen(false)}
            style={{
              background: "transparent",
              border: "none",
              color: "var(--text-muted)",
              cursor: "pointer",
              padding: 4,
              borderRadius: 6,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
            title="Collapse Sidebar"
          >
            <ChevronLeft size={20} />
          </button>
        </div>

        {/* Scrollable Form & Visual Intelligence Body */}
        <div className="sidebar-scroll-body">
          {/* General Route Configuration (Any Address + Custom Nodes) */}
          <SourceDestPicker
            depots={INDIA_NETWORK.depots}
            sourceLoc={sourceLoc}
            destLoc={destLoc}
            goodsType={goodsType}
            truckClass={truckClass}
            maxPayloadKg={maxPayloadKg}
            gvwKg={gvwKg}
            truckClasses={truckClasses}
            fuelType={fuelType}
            onSourceSelect={(loc) => {
              setSourceLoc(loc);
              if (loc.id) setActiveSourceId(loc.id);
            }}
            onDestSelect={(loc) => {
              setDestLoc(loc);
              if (loc.id) setActiveDestId(loc.id);
            }}
            onSwap={handleSwap}
            onGoodsChange={setGoodsType}
            onTruckClassChange={setTruckClass}
            onMaxPayloadChange={setMaxPayloadKg}
            onGvwChange={setGvwKg}
            onFuelTypeChange={setFuelType}
            onPresetSelect={handlePresetSelect}
          />

          {/* Error Banner */}
          {error && (
            <div
              className="card animate-fade-in"
              style={{
                background: "var(--danger-dim)",
                borderColor: "rgba(220, 38, 38, 0.3)",
                padding: "12px 16px",
              }}
            >
              <p style={{ color: "var(--danger)", fontSize: "0.825rem", margin: 0, fontWeight: 600 }}>
                ⚠ {error}
              </p>
            </div>
          )}

          {/* Analysis Results & Dynamic Graphs */}
          {plans.length > 0 && (
            <div className="animate-fade-in" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "4px 2px",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    fontWeight: 700,
                    fontSize: "0.85rem",
                    color: "#0f172a",
                  }}
                >
                  <Sparkles size={14} style={{ color: "var(--accent)" }} />
                  Pareto-Optimal Routing Results
                </div>
                <span className="badge badge-accent">{plans.length} Candidates</span>
              </div>

              {/* Dynamic Analysis Panel (Radar, Hop Bar Chart, Transit Profile, Hop Table) */}
              <AnalysisPanel
                plans={plans}
                graph={dynamicGraph}
                selectedPlanIndex={selectedPlan}
                onSelectPlan={setSelectedPlan}
              />

              {/* Pareto Frontier Scatter Chart */}
              <div className="card">
                <div className="card-header">
                  <h2>
                    <TrendingUp size={15} style={{ color: "var(--accent)" }} />
                    Pareto Frontier (Cost vs Regret)
                  </h2>
                </div>
                <ParetoChart
                  plans={chartData}
                  selectedIndex={selectedPlan}
                  onSelect={(i) => setSelectedPlan(i)}
                />
              </div>
            </div>
          )}

          {/* Live Telemetry Console Toggle */}
          <div style={{ marginTop: "auto", paddingTop: 8 }}>
            <button
              className="btn btn-secondary btn-sm btn-full"
              onClick={() => setShowConsole(!showConsole)}
            >
              <Activity size={14} />
              {showConsole ? "Hide" : "Show"} Live Event Telemetry
            </button>

            {showConsole && (
              <div className="card animate-fade-in" style={{ marginTop: 10 }}>
                <div className="card-header" style={{ marginBottom: 8, paddingBottom: 6 }}>
                  <h2>
                    <Activity size={14} style={{ color: "var(--accent)" }} />
                    Live Simulation Feed
                  </h2>
                </div>
                <EventConsole />
              </div>
            )}
          </div>
        </div>

        {/* ── Prominent Sticky Action Deck ─────────────────────────────── */}
        <div className="sticky-action-deck">
          <button
            className="action-deck-btn-primary"
            onClick={handleRun}
            disabled={!canRun}
          >
            {loading ? (
              <>
                <span className="spinner" /> Optimizing Corridor Route...
              </>
            ) : (
              <>
                <Play size={16} fill="currentColor" /> Run AEGIS Optimization
              </>
            )}
          </button>

          <div className="action-deck-sub-bar">
            <div style={{ display: "flex", alignItems: "center", gap: 5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              <Navigation size={12} style={{ color: "#2563eb", flexShrink: 0 }} />
              <span style={{ fontWeight: 600, color: "#0f172a" }}>
                {sourceLoc?.name || "Select Origin"}
              </span>
              <span style={{ color: "#94a3b8" }}>→</span>
              <span style={{ fontWeight: 600, color: "#0f172a" }}>
                {destLoc?.name || "Select Destination"}
              </span>
            </div>

            <button
              className="btn btn-secondary"
              onClick={handleClear}
              style={{ padding: "4px 10px", fontSize: "0.725rem", borderRadius: 4 }}
              title="Reset configuration"
            >
              <RotateCcw size={12} /> Clear
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}
