"use client";
import { useState, Fragment } from "react";
import {
  DollarSign,
  AlertTriangle,
  Clock,
  Route,
  CheckCircle,
  XCircle,
  Activity,
  BarChart3,
  TrendingUp,
  Sliders,
  Truck,
  Star,
  Shield,
  Weight,
  Zap,
  Fuel,
  BatteryCharging,
  MapPin,
} from "lucide-react";
import type { Plan, GraphInput } from "../lib/api";
import { riskColor } from "../lib/constants";
import { TradeoffRadarChart } from "./TradeoffRadarChart";
import { HopBreakdownChart } from "./HopBreakdownChart";
import { TransitProfileChart } from "./TransitProfileChart";

const SEVERITY_COLOR: Record<string, string> = {
  Low: "#16a34a",
  Medium: "#f59e0b",
  High: "#ea580c",
  Critical: "#dc2626",
};

/** EV charging-stop plan with depot charger info (EVYATRA / Tata Power / EESL). */
function EvChargingPlan({ plan, graph }: { plan: Plan; graph: GraphInput }) {
  return (
    <div
      style={{
        marginTop: 10,
        padding: "8px 10px",
        borderRadius: 8,
        background: plan.ev_charger_available ? "rgba(22,163,74,0.06)" : "rgba(220,38,38,0.06)",
        border: `1px solid ${plan.ev_charger_available ? "rgba(22,163,74,0.2)" : "rgba(220,38,38,0.25)"}`,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          fontSize: "0.78rem",
          fontWeight: 700,
          color: plan.ev_charger_available ? "#15803d" : "#dc2626",
        }}
      >
        <BatteryCharging size={13} />
        {plan.ev_charging_stops === 0
          ? "Single-charge range — no charging stops needed"
          : `${plan.ev_charging_stops} charging stop${plan.ev_charging_stops > 1 ? "s" : ""} required (${plan.ev_range_km.toFixed(0)} km/charge)`}
      </div>
      {plan.ev_charging_stop_nodes.length > 0 && (
        <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: 4 }}>
          {plan.ev_charging_stop_nodes.map((nodeId) => {
            const depot = graph.depots.find((d) => d.id === nodeId);
            return (
              <span
                key={nodeId}
                style={{
                  fontSize: "0.65rem",
                  padding: "2px 8px",
                  borderRadius: 9999,
                  background: "rgba(22,163,74,0.12)",
                  color: "#15803d",
                  fontWeight: 600,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 3,
                }}
              >
                <MapPin size={9} /> {depot?.name || nodeId}
              </span>
            );
          })}
        </div>
      )}
      {!plan.ev_charger_available && (
        <div
          style={{
            fontSize: "0.7rem",
            color: "#dc2626",
            fontWeight: 600,
            marginTop: 6,
            display: "flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          <AlertTriangle size={11} />
          Corridor has fewer working DC fast chargers than required stops — planner deprioritised this route.
        </div>
      )}
    </div>
  );
}

interface Props {
  plans: Plan[];
  graph: GraphInput;
  selectedPlanIndex: number;
  onSelectPlan: (index: number) => void;
  hoveredRouteId?: string | null;
  onHoverRoute?: (routeId: string | null) => void;
}

export function AnalysisPanel({
  plans,
  graph,
  selectedPlanIndex,
  onSelectPlan,
  hoveredRouteId = null,
  onHoverRoute,
}: Props) {
  const [activeGraphTab, setActiveGraphTab] = useState<"radar" | "hops" | "profile">("radar");

  if (plans.length === 0) {
    return (
      <div className="card">
        <div className="empty-state">
          <Route size={36} style={{ color: "#94a3b8" }} />
          <p style={{ marginTop: 8, fontSize: "0.85rem", color: "var(--text-secondary)" }}>
            Select source &amp; destination, then run AEGIS to see dynamic analysis.
          </p>
        </div>
      </div>
    );
  }

  const plan = plans[selectedPlanIndex] || plans[0];
  const routeMap = Object.fromEntries(graph.routes.map((r) => [r.id, r]));

  // Compute totals
  const totalTime = plan.route_ids.reduce((sum, rid) => {
    const r = routeMap[rid];
    return sum + (r ? r.time_hours : 0);
  }, 0);

  const avgRisk =
    plan.route_ids.length > 0
      ? plan.route_ids.reduce((sum, rid) => {
          const r = routeMap[rid];
          return sum + (r ? r.risk_prior : 0);
        }, 0) / plan.route_ids.length
      : 0;

  // Cumulative hours at each stop
  const cumTimes: number[] = [];
  let runningHours = 0;
  for (const rid of plan.route_ids) {
    const r = routeMap[rid];
    runningHours += r ? r.time_hours : 0;
    cumTimes.push(runningHours);
  }

  // First origin name
  const firstRoute = plan.route_ids.length > 0 ? routeMap[plan.route_ids[0]] : null;
  const firstOriginName = firstRoute
    ? graph.depots.find((d) => d.id === firstRoute.origin_id)?.name || firstRoute.origin_id
    : "Origin";

  // Highest risk bottleneck leg
  let bottleneckRoute: typeof graph.routes[0] | null = null;
  for (const rid of plan.route_ids) {
    const r = routeMap[rid];
    if (r && (!bottleneckRoute || r.risk_prior > bottleneckRoute.risk_prior)) {
      bottleneckRoute = r;
    }
  }
  const bottleneckOrigin = bottleneckRoute
    ? graph.depots.find((d) => d.id === bottleneckRoute.origin_id)?.name || bottleneckRoute.origin_id
    : "";
  const bottleneckDest = bottleneckRoute
    ? graph.depots.find((d) => d.id === bottleneckRoute.destination_id)?.name || bottleneckRoute.destination_id
    : "";

  // Risk health spectrum breakdown
  let lowRiskCount = 0;
  let medRiskCount = 0;
  let highRiskCount = 0;
  for (const rid of plan.route_ids) {
    const r = routeMap[rid];
    if (!r) continue;
    if (r.risk_prior < 0.1) lowRiskCount++;
    else if (r.risk_prior <= 0.2) medRiskCount++;
    else highRiskCount++;
  }
  const totalHops = Math.max(plan.route_ids.length, 1);
  const lowPct = Math.round((lowRiskCount / totalHops) * 100);
  const medPct = Math.round((medRiskCount / totalHops) * 100);
  const highPct = 100 - lowPct - medPct;

  return (
    <div className="stack">

      {/* Best-route recommendation banner */}
      {plan.recommendation && (
        <div
          className="animate-fade-in"
          style={{
            padding: "10px 14px",
            borderRadius: 10,
            background: plan.is_best ? "rgba(37,99,235,0.07)" : "rgba(245,158,11,0.07)",
            border: `1px solid ${plan.is_best ? "rgba(37,99,235,0.25)" : "rgba(245,158,11,0.25)"}`,
            display: "flex",
            alignItems: "flex-start",
            gap: 8,
            fontSize: "0.8rem",
            fontWeight: 600,
            color: plan.is_best ? "#1d4ed8" : "#b45309",
          }}
        >
          {plan.is_best ? <Star size={14} fill="#2563eb" /> : <Zap size={14} />}
          <span>{plan.recommendation}</span>
        </div>
      )}

      {/* Metric Cards */}
      <div className="metric-grid">
        <div className="metric-card" style={{ borderLeft: "3px solid #2563eb" }}>
          <div className="metric-label">
            <DollarSign size={12} style={{ color: "#2563eb" }} /> Operating Cost
          </div>
          <div className="metric-value">
            ₹{(plan.total_operating_cost_inr || plan.total_cost).toLocaleString("en-IN", { maximumFractionDigits: 0 })}
          </div>
          <div className="metric-sub">
            {plan.distance_km ? `${plan.distance_km.toFixed(0)} km · fuel + toll + driver` : `${plan.route_ids.length} corridor hops`}
          </div>
        </div>

        <div className="metric-card" style={{ borderLeft: "3px solid #dc2626" }}>
          <div className="metric-label">
            <AlertTriangle size={12} style={{ color: "#dc2626" }} /> Regret
          </div>
          <div className="metric-value">{plan.expected_regret.toFixed(2)}</div>
          <div className="metric-sub">Risk: {(avgRisk * 100).toFixed(0)}% avg</div>
        </div>

        <div className="metric-card" style={{ borderLeft: "3px solid #0f172a" }}>
          <div className="metric-label">
            <Clock size={12} style={{ color: "#0f172a" }} /> Time
          </div>
          <div className="metric-value">{totalTime}h</div>
          <div className="metric-sub">Transit est.</div>
        </div>
      </div>

      {/* Fuel & Operating Cost Breakdown (real Indian rates) */}
      {plan.distance_km > 0 && (
        <div className="card animate-fade-in" style={{ padding: "12px 16px" }}>
          <div className="card-header" style={{ marginBottom: 8 }}>
            <h2 style={{ fontSize: "0.82rem" }}>
              <Fuel size={13} style={{ color: "#16a34a" }} /> Fuel &amp; Operating Cost
            </h2>
            <span
              style={{
                fontSize: "0.65rem",
                background: "rgba(22,163,74,0.08)",
                color: "#16a34a",
                padding: "2px 7px",
                borderRadius: 9999,
                fontWeight: 700,
                textTransform: "capitalize",
              }}
            >
              {plan.fuel_type}
            </span>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
            <div>
              <div style={{ fontSize: "0.68rem", color: "#64748b", fontWeight: 600 }}>Distance</div>
              <div style={{ fontWeight: 700, fontSize: "0.88rem", color: "#0f172a" }}>
                {plan.distance_km.toFixed(0)} km
              </div>
            </div>
            <div>
              <div style={{ fontSize: "0.68rem", color: "#64748b", fontWeight: 600 }}>
                {plan.fuel_unit === "kWh" ? "Energy" : "Fuel Used"}
              </div>
              <div style={{ fontWeight: 700, fontSize: "0.88rem", color: "#0f172a" }}>
                {plan.fuel_consumption.toLocaleString("en-IN", { maximumFractionDigits: 1 })} {plan.fuel_unit}
              </div>
            </div>
            <div>
              <div style={{ fontSize: "0.68rem", color: "#64748b", fontWeight: 600 }}>
                {plan.fuel_unit === "kWh" ? "Charger Tariff" : "Pump Price"}
              </div>
              <div style={{ fontWeight: 700, fontSize: "0.88rem", color: "#0f172a" }}>
                ₹{plan.fuel_price_per_unit.toFixed(2)}/{plan.fuel_unit === "kWh" ? "kWh" : "L"}
              </div>
            </div>
            <div>
              <div style={{ fontSize: "0.68rem", color: "#64748b", fontWeight: 600 }}>Fuel Cost</div>
              <div style={{ fontWeight: 700, fontSize: "0.88rem", color: "#16a34a" }}>
                ₹{plan.fuel_cost_inr.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
              </div>
            </div>
            <div>
              <div style={{ fontSize: "0.68rem", color: "#64748b", fontWeight: 600 }}>NH Toll</div>
              <div style={{ fontWeight: 700, fontSize: "0.88rem", color: "#0f172a" }}>
                ₹{plan.toll_cost_inr.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
              </div>
            </div>
            <div>
              <div style={{ fontSize: "0.68rem", color: "#64748b", fontWeight: 600 }}>Driver (AITWA)</div>
              <div style={{ fontWeight: 700, fontSize: "0.88rem", color: "#0f172a" }}>
                ₹{plan.driver_cost_inr.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
              </div>
            </div>
          </div>

          {/* State-wise economics (fuel VAT / road quality / tolls) */}
          {plan.state_breakdown && plan.state_breakdown.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div
                style={{
                  fontSize: "0.72rem",
                  fontWeight: 700,
                  color: "#64748b",
                  marginBottom: 6,
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                }}
              >
                <MapPin size={11} style={{ color: "#b45309" }} />
                STATE-WISE ECONOMICS — VAT, ROAD QUALITY &amp; TOLLS VARY BY STATE
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {plan.state_breakdown.map((s) => (
                  <div
                    key={s.state}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1.3fr 0.8fr 0.9fr 0.9fr 1fr",
                      gap: 6,
                      alignItems: "center",
                      padding: "6px 10px",
                      borderRadius: 8,
                      background: "rgba(15,23,42,0.02)",
                      border: "1px solid var(--border-light)",
                      fontSize: "0.7rem",
                    }}
                  >
                    <span style={{ fontWeight: 700, color: "#0f172a" }}>{s.label}</span>
                    <span style={{ color: "#64748b" }}>{s.distance_km.toFixed(0)} km</span>
                    <span style={{ color: "#64748b", fontFamily: "var(--font-mono)" }}>
                      ₹{s.fuel_price_per_unit.toFixed(2)}/{plan.fuel_unit === "kWh" ? "kWh" : "L"}
                    </span>
                    <span
                      style={{
                        color: s.road_quality >= 0.95 ? "#16a34a" : s.road_quality >= 0.9 ? "#b45309" : "#dc2626",
                        fontWeight: 700,
                      }}
                      title="Road-quality factor — multiplies effective mileage"
                    >
                      road {(s.road_quality * 100).toFixed(0)}%
                    </span>
                    <span style={{ color: "#0f172a", fontWeight: 700, textAlign: "right", fontFamily: "var(--font-mono)" }}>
                      ₹{(s.fuel_cost_inr + s.toll_cost_inr).toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Market freight benchmark */}
          {plan.market_freight_cost_inr > 0 && (
            <div
              style={{
                marginTop: 10,
                padding: "7px 10px",
                borderRadius: 8,
                background: "rgba(37,99,235,0.05)",
                border: "1px solid rgba(37,99,235,0.15)",
                fontSize: "0.72rem",
                color: "#1d4ed8",
                fontWeight: 600,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <span>Spot-market freight benchmark (₹/tonne-km)</span>
              <span style={{ fontFamily: "var(--font-mono)" }}>
                ₹{plan.market_freight_cost_inr.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
              </span>
            </div>
          )}

          {/* EV charging plan */}
          {plan.fuel_type === "electric" && <EvChargingPlan plan={plan} graph={graph} />}

          <div
            style={{
              marginTop: 10,
              paddingTop: 8,
              borderTop: "1px solid var(--border-light)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
            }}
          >
            <span style={{ fontSize: "0.72rem", color: "#64748b", fontWeight: 700 }}>
              TOTAL TRIP COST (FUEL + TOLL + DRIVER)
            </span>
            <span style={{ fontSize: "1rem", fontWeight: 800, color: "#0f172a", fontFamily: "var(--font-mono)" }}>
              ₹{plan.total_operating_cost_inr.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
            </span>
          </div>
        </div>
      )}

      {/* Truck Capacity Card */}
      {plan.truck_class && (
        <div className="card animate-fade-in" style={{ padding: "12px 16px" }}>
          <div className="card-header" style={{ marginBottom: 8 }}>
            <h2 style={{ fontSize: "0.82rem" }}>
              <Truck size={13} style={{ color: "#2563eb" }} /> Truck Specification
            </h2>
            <span
              style={{
                fontSize: "0.65rem",
                background: "rgba(37,99,235,0.08)",
                color: "#2563eb",
                padding: "2px 7px",
                borderRadius: 9999,
                fontWeight: 700,
              }}
            >
              {plan.truck_class.toUpperCase()}
            </span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div>
              <div style={{ fontSize: "0.68rem", color: "#64748b", fontWeight: 600 }}>Max Payload</div>
              <div style={{ fontWeight: 700, fontSize: "0.88rem", color: "#0f172a" }}>
                {(plan.max_payload_kg / 1000).toFixed(1)} T
              </div>
            </div>
            <div>
              <div style={{ fontSize: "0.68rem", color: "#64748b", fontWeight: 600 }}>GVW Limit</div>
              <div style={{ fontWeight: 700, fontSize: "0.88rem", color: "#0f172a" }}>
                {(plan.gross_vehicle_weight_kg / 1000).toFixed(1)} T
              </div>
            </div>
            <div>
              <div style={{ fontSize: "0.68rem", color: "#64748b", fontWeight: 600 }}>Cargo Weight</div>
              <div style={{ fontWeight: 700, fontSize: "0.88rem", color: "#0f172a" }}>
                {plan.cargo_weight_kg.toFixed(0)} kg
              </div>
            </div>
            <div>
              <div style={{ fontSize: "0.68rem", color: "#64748b", fontWeight: 600 }}>Capacity Used</div>
              <div
                style={{
                  fontWeight: 700,
                  fontSize: "0.88rem",
                  color:
                    plan.capacity_utilisation_pct > 90
                      ? "#dc2626"
                      : plan.capacity_utilisation_pct > 70
                      ? "#f59e0b"
                      : "#16a34a",
                }}
              >
                {plan.capacity_utilisation_pct.toFixed(1)}%
              </div>
            </div>
          </div>
          {/* Capacity bar */}
          <div
            style={{
              marginTop: 10,
              height: 6,
              borderRadius: 3,
              background: "#e2e8f0",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${Math.min(plan.capacity_utilisation_pct, 100)}%`,
                borderRadius: 3,
                background:
                  plan.capacity_utilisation_pct > 90
                    ? "#dc2626"
                    : plan.capacity_utilisation_pct > 70
                    ? "#f59e0b"
                    : "#2563eb",
                transition: "width 0.6s ease",
              }}
            />
          </div>
        </div>
      )}

      {/* Plan Selector (if multiple Pareto options) */}
      {plans.length > 1 && (
        <div className="card" style={{ padding: "12px 16px" }}>
          <div className="card-header" style={{ marginBottom: 8 }}>
            <h2 style={{ fontSize: "0.85rem" }}>Pareto Frontier Options</h2>
            <span className="badge badge-accent">{plans.length} non-dominated</span>
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {plans.map((p, i) => (
              <button
                key={p.id || i}
                className={`btn btn-sm ${i === selectedPlanIndex ? "btn-primary" : "btn-secondary"}`}
                onClick={() => onSelectPlan(i)}
                style={{ fontSize: "0.75rem", padding: "5px 10px", display: "flex", alignItems: "center", gap: 4 }}
              >
                {p.is_best && <Star size={11} fill="currentColor" />}
                Plan {i + 1} · ₹{p.total_cost.toFixed(1)} · R:{p.expected_regret.toFixed(2)}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Dynamic Graph Intelligence Panel */}
      <div className="card">
        <div className="card-header" style={{ marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Activity size={15} style={{ color: "#2563eb" }} />
            <h2 style={{ fontSize: "0.875rem" }}>Dynamic Visual Intelligence</h2>
          </div>
          {/* Tab Switcher */}
          <div className="graph-tab-bar">
            <button
              className={`graph-tab-btn ${activeGraphTab === "radar" ? "active" : ""}`}
              onClick={() => setActiveGraphTab("radar")}
              title="Multi-Criteria Radar"
            >
              <Sliders size={11} /> Radar
            </button>
            <button
              className={`graph-tab-btn ${activeGraphTab === "hops" ? "active" : ""}`}
              onClick={() => setActiveGraphTab("hops")}
              title="Hop Breakdown"
            >
              <BarChart3 size={11} /> Hops
            </button>
            <button
              className={`graph-tab-btn ${activeGraphTab === "profile" ? "active" : ""}`}
              onClick={() => setActiveGraphTab("profile")}
              title="Transit Profile"
            >
              <TrendingUp size={11} /> Profile
            </button>
          </div>
        </div>

        {/* Tab 1: Multi-Criteria Radar */}
        {activeGraphTab === "radar" && (
          <div className="animate-fade-in">
            <TradeoffRadarChart plan={plan} />
            <div
              style={{
                fontSize: "0.7rem",
                color: "var(--text-secondary)",
                textAlign: "center",
                marginTop: 6,
              }}
            >
              Comprehensive 5-axis scoring evaluating resilience, cost, velocity &amp; compliance.
            </div>
          </div>
        )}

        {/* Tab 2: Hop Breakdown */}
        {activeGraphTab === "hops" && (
          <div className="animate-fade-in">
            <HopBreakdownChart routeIds={plan.route_ids} graph={graph} />
            <div
              style={{
                fontSize: "0.7rem",
                color: "var(--text-secondary)",
                textAlign: "center",
                marginTop: 6,
              }}
            >
              Per-segment freight costs (₹) and transit duration (hrs) across corridors.
            </div>
          </div>
        )}

        {/* Tab 3: Transit Profile Area Chart */}
        {activeGraphTab === "profile" && (
          <div className="animate-fade-in">
            <TransitProfileChart routeIds={plan.route_ids} graph={graph} />
            <div
              style={{
                fontSize: "0.7rem",
                color: "var(--text-secondary)",
                textAlign: "center",
                marginTop: 6,
              }}
            >
              Cumulative route progression curve from origin to destination.
            </div>
          </div>
        )}
      </div>

      {/* Turn-by-Turn Route Breakdown & Interactive Visual Journey */}
      <div className="card">
        <div className="card-header" style={{ marginBottom: 8 }}>
          <div>
            <h2 style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.88rem" }}>
              <Route size={15} style={{ color: "#2563eb" }} />
              Route Taken Journey Visualizer
            </h2>
            <div style={{ fontSize: "0.68rem", color: "#64748b", marginTop: 2 }}>
              {plan.route_ids.length} corridor hops · {plan.distance_km ? `${plan.distance_km.toFixed(0)} km` : `${totalTime}h`} total
            </div>
          </div>
          <span style={{ fontSize: "0.725rem" }}>
            {plan.status === "finalized" ? (
              <span style={{ color: "#2563eb", display: "inline-flex", alignItems: "center", gap: 4, fontWeight: 600 }}>
                <CheckCircle size={12} /> Feasible &amp; Compliant
              </span>
            ) : (
              <span style={{ color: "#dc2626", display: "inline-flex", alignItems: "center", gap: 4, fontWeight: 600 }}>
                <XCircle size={12} /> {plan.status}
              </span>
            )}
          </span>
        </div>

        {/* 1. Visual Route Journey Stepper (Milestone Timeline) */}
        <div style={{ margin: "4px 0 10px", padding: "10px", background: "rgba(15,23,42,0.02)", borderRadius: 8, border: "1px solid #e2e8f0" }}>
          <div style={{ fontSize: "0.68rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>
            Interactive Waypoint Flow (Hover leg to spotlight on map)
          </div>

          <div className="journey-stepper">
            {/* Origin Stop */}
            <div
              className="journey-stop-node"
              onMouseEnter={() => plan.route_ids[0] && onHoverRoute?.(plan.route_ids[0])}
              onMouseLeave={() => onHoverRoute?.(null)}
            >
              <div className="journey-stop-pill start">1</div>
              <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "#0f172a" }}>{firstOriginName}</div>
              <div style={{ fontSize: "0.62rem", color: "#64748b" }}>0h · Start</div>
            </div>

            {/* Legs & Subsequent Stops */}
            {plan.route_ids.map((rid, idx) => {
              const route = routeMap[rid];
              if (!route) return null;
              const dest = graph.depots.find((d) => d.id === route.destination_id);
              const isDest = idx === plan.route_ids.length - 1;
              const isHovered = hoveredRouteId === rid;
              const isEvStop = Boolean(plan.ev_charging_stop_nodes?.includes(route.destination_id));

              return (
                <Fragment key={rid}>
                  <div
                    className={`journey-leg-connector ${isHovered ? "active" : ""}`}
                    onMouseEnter={() => onHoverRoute?.(rid)}
                    onMouseLeave={() => onHoverRoute?.(null)}
                    title={`Leg ${idx + 1}: ${route.origin_id} → ${route.destination_id} (Hover to spotlight)`}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", fontSize: "0.62rem", fontWeight: 600, color: "#64748b" }}>
                      <span>₹{route.cost}</span>
                      <span>{route.time_hours}h</span>
                    </div>
                    <div className={`journey-leg-line ${route.risk_prior >= 0.2 ? "elevated" : ""}`} />
                    <span
                      style={{
                        fontSize: "0.58rem",
                        fontWeight: 700,
                        padding: "1px 5px",
                        borderRadius: 4,
                        background: route.risk_prior >= 0.2 ? "rgba(220,38,38,0.1)" : "rgba(22,163,74,0.1)",
                        color: route.risk_prior >= 0.2 ? "#dc2626" : "#16a34a",
                      }}
                    >
                      {(route.risk_prior * 100).toFixed(0)}% risk
                    </span>
                  </div>

                  <div
                    className="journey-stop-node"
                    onMouseEnter={() => onHoverRoute?.(rid)}
                    onMouseLeave={() => onHoverRoute?.(null)}
                  >
                    <div className={`journey-stop-pill ${isDest ? "end" : "step"}`}>
                      {isDest ? "END" : idx + 2}
                    </div>
                    <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "#0f172a", whiteSpace: "nowrap" }}>
                      {dest?.name || route.destination_id}
                      {isEvStop && " (EV)"}
                    </div>
                    <div style={{ fontSize: "0.62rem", color: "#64748b" }}>
                      +{cumTimes[idx]}h
                    </div>
                  </div>
                </Fragment>
              );
            })}
          </div>

          {/* 2. Route Corridor Health Spectrum Ribbon */}
          <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid #e2e8f0" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.68rem", fontWeight: 700, color: "#475569", marginBottom: 4 }}>
              <span>Corridor Risk Spectrum</span>
              <span>{lowPct}% Low Risk · {medPct}% Moderate · {highPct}% Elevated</span>
            </div>
            <div style={{ width: "100%", height: 5, borderRadius: 3, display: "flex", overflow: "hidden", background: "#e2e8f0" }}>
              {lowPct > 0 && <div style={{ width: `${lowPct}%`, background: "#16a34a" }} title={`Low Risk: ${lowPct}%`} />}
              {medPct > 0 && <div style={{ width: `${medPct}%`, background: "#d97706" }} title={`Moderate Risk: ${medPct}%`} />}
              {highPct > 0 && <div style={{ width: `${highPct}%`, background: "#dc2626" }} title={`Elevated Risk: ${highPct}%`} />}
            </div>
            {bottleneckRoute && (
              <div style={{ fontSize: "0.68rem", color: "#64748b", marginTop: 5, display: "flex", alignItems: "center", gap: 4 }}>
                <AlertTriangle size={11} style={{ color: "#d97706" }} />
                <span>
                  <strong>Highest Risk Segment:</strong> {bottleneckOrigin} → {bottleneckDest} ({(bottleneckRoute.risk_prior * 100).toFixed(0)}% prior risk · {bottleneckRoute.time_hours}h)
                </span>
              </div>
            )}
          </div>
        </div>

        {/* 3. Detailed Leg Breakdown Table */}
        <table className="data-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Leg</th>
              <th>Cost</th>
              <th>Time</th>
              <th>Risk</th>
            </tr>
          </thead>
          <tbody>
            {plan.route_ids.map((rid, i) => {
              const route = routeMap[rid];
              if (!route) return null;
              const originName = graph.depots.find((d) => d.id === route.origin_id)?.name || route.origin_id;
              const destName = graph.depots.find((d) => d.id === route.destination_id)?.name || route.destination_id;
              const isHovered = hoveredRouteId === rid;

              return (
                <tr
                  key={rid}
                  className="animate-fade-in"
                  style={{
                    animationDelay: `${i * 60}ms`,
                    background: isHovered ? "rgba(37,99,235,0.08)" : undefined,
                    cursor: "pointer",
                  }}
                  onMouseEnter={() => onHoverRoute?.(rid)}
                  onMouseLeave={() => onHoverRoute?.(null)}
                >
                  <td style={{ color: isHovered ? "#2563eb" : "var(--text-muted)", fontWeight: 700, fontSize: "0.72rem" }}>
                    {i + 1}
                  </td>
                  <td>
                    <div style={{ fontWeight: 600, fontSize: "0.8rem", color: isHovered ? "#2563eb" : "#0f172a" }}>
                      {originName} <span style={{ color: "#94a3b8" }}>→</span> {destName}
                    </div>
                    <div style={{ fontSize: "0.68rem", color: "#94a3b8", fontFamily: "var(--font-mono)" }}>
                      {rid}
                    </div>
                  </td>
                  <td style={{ fontWeight: 600, fontSize: "0.8rem" }}>₹{route.cost}</td>
                  <td style={{ fontSize: "0.8rem" }}>{route.time_hours}h</td>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <span style={{ fontSize: "0.72rem", color: riskColor(route.risk_prior), fontWeight: 700 }}>
                        {(route.risk_prior * 100).toFixed(0)}%
                      </span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* Potential Risks */}
        {plan.potential_risks && plan.potential_risks.length > 0 ? (
          <div style={{ marginTop: 14 }}>
            <div
              style={{
                fontSize: "0.72rem",
                fontWeight: 700,
                color: "#64748b",
                marginBottom: 6,
                display: "flex",
                alignItems: "center",
                gap: 5,
              }}
            >
              <AlertTriangle size={11} style={{ color: "#ea580c" }} />
              POTENTIAL RISKS ON THIS ROUTE
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {plan.potential_risks.map((risk) => (
                <div
                  key={risk.id}
                  style={{
                    padding: "8px 10px",
                    borderRadius: 8,
                    background: "rgba(234,88,12,0.05)",
                    border: "1px solid rgba(234,88,12,0.15)",
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 8,
                  }}
                >
                  <span
                    style={{
                      flexShrink: 0,
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: SEVERITY_COLOR[risk.severity_label] || "#ea580c",
                      marginTop: 5,
                    }}
                  />
                  <div style={{ flex: 1 }}>
                    <div
                      style={{
                        fontSize: "0.78rem",
                        fontWeight: 700,
                        color: "#0f172a",
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                      }}
                    >
                      {risk.description}
                      <span
                        style={{
                          fontSize: "0.62rem",
                          padding: "1px 6px",
                          borderRadius: 9999,
                          fontWeight: 700,
                          background: `${SEVERITY_COLOR[risk.severity_label]}22`,
                          color: SEVERITY_COLOR[risk.severity_label] || "#ea580c",
                        }}
                      >
                        {risk.severity_label}
                      </span>
                    </div>
                    <div style={{ fontSize: "0.68rem", color: "#64748b", fontFamily: "var(--font-mono)", marginTop: 2 }}>
                      edge: {risk.edge_id}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div
            style={{
              marginTop: 12,
              padding: "8px 12px",
              borderRadius: 8,
              background: "rgba(22,163,74,0.06)",
              border: "1px solid rgba(22,163,74,0.2)",
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: "0.78rem",
              color: "#15803d",
              fontWeight: 600,
            }}
          >
            <Shield size={13} /> No active disruptions on this route.
          </div>
        )}
      </div>
    </div>
  );
}
