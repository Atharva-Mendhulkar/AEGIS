"use client";
import { useState } from "react";
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
                <MapPin size={9} />⚡ {depot?.name || nodeId}
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
}

export function AnalysisPanel({ plans, graph, selectedPlanIndex, onSelectPlan }: Props) {
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

      {/* Turn-by-Turn Route Breakdown */}
      <div className="card">
        <div className="card-header">
          <h2>
            <Route size={15} style={{ color: "#2563eb" }} />
            Corridor Route Details
          </h2>
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
              return (
                <tr key={rid} className="animate-fade-in" style={{ animationDelay: `${i * 60}ms` }}>
                  <td style={{ color: "var(--text-muted)", fontWeight: 600, fontSize: "0.72rem" }}>{i + 1}</td>
                  <td>
                    <div style={{ fontWeight: 600, fontSize: "0.8rem", color: "#0f172a" }}>
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
