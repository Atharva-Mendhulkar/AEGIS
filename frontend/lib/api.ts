/**
 * AEGIS API client — typed wrapper around the FastAPI backend.
 */

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const API_KEY = "local-dev-key";

const headers = (): Record<string, string> => ({
  "X-API-Key": API_KEY,
  "Content-Type": "application/json",
});

/* ── Types ────────────────────────────────────────────────────── */

export interface Depot {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
}

export interface Route {
  id: string;
  origin_id: string;
  destination_id: string;
  cost: number;
  time_hours: number;
  risk_prior: number;
  restricted_goods: string[];
}

export interface GraphInput {
  depots: Depot[];
  routes: Route[];
}

export interface Shipment {
  id: string;
  origin_id: string;
  destination_id: string;
  goods_type: string;
  weight_kg: number;
  deadline_hours?: number | null;
}

export interface DisruptionInfo {
  id: string;
  type: string;
  edge_id: string;
  severity: number;
  severity_label: string;
  description: string;
}

export interface StateFuelInfo {
  state: string;
  label: string;
  distance_km: number;
  fuel_price_per_unit: number;
  road_quality: number;
  toll_multiplier: number;
  fuel_cost_inr: number;
  toll_cost_inr: number;
}

export interface Plan {
  id: string;
  shipment_id: string;
  route_ids: string[];
  total_cost: number;
  expected_regret: number;
  status: string;
  // Truck capacity
  truck_class: string;
  max_payload_kg: number;
  gross_vehicle_weight_kg: number;
  cargo_weight_kg: number;
  capacity_utilisation_pct: number;
  // Fuel / operating cost breakdown (real ₹)
  fuel_type: string;
  fuel_cost_inr: number;
  fuel_consumption: number;
  fuel_unit: string;
  fuel_price_per_unit: number;
  toll_cost_inr: number;
  driver_cost_inr: number;
  total_operating_cost_inr: number;
  market_freight_cost_inr: number;
  distance_km: number;
  // EV-specific
  ev_charging_stops: number;
  ev_charging_stop_nodes: string[];
  ev_charger_available: boolean;
  ev_range_km: number;
  // State-wise economics
  state_breakdown: StateFuelInfo[];
  // Risk intelligence
  potential_risks: DisruptionInfo[];
  risk_score: number;
  // Recommendation
  is_best: boolean;
  recommendation: string;
}

export interface PlanPoint {
  total_cost: number;
  expected_regret: number;
  label?: string;
}

export interface Disruption {
  id?: string;
  type: string;
  edge_id: string;
  severity: number;
  source?: string;
}

export interface SimulationEvent {
  type:
    | "connected"
    | "heartbeat"
    | "plan_started"
    | "disruption_injected"
    | "replan_started"
    | "replan_finalized";
  payload: Record<string, unknown>;
}

/* ── API calls ────────────────────────────────────────────────── */

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: { ...headers(), ...(options?.headers || {}) },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API ${res.status}: ${body}`);
  }
  return res.json();
}

export async function loadGraph(graph: GraphInput): Promise<GraphInput> {
  return request("/v1/graph", {
    method: "POST",
    body: JSON.stringify(graph),
  });
}

export async function loadShipments(shipments: Shipment[]): Promise<Shipment[]> {
  return request("/v1/shipments", {
    method: "POST",
    body: JSON.stringify(shipments),
  });
}

export interface TruckClass {
  key: string;
  label: string;
  max_payload_kg: number;
  max_gvw_kg: number;
}

export async function fetchTruckClasses(): Promise<TruckClass[]> {
  return request("/v1/truck-classes");
}

export async function createPlan(
  shipmentId: string,
  truckClass: string = "hcv",
  maxPayloadKg?: number,
  gvwKg?: number,
  fuelType: string = "diesel"
): Promise<Plan[]> {
  return request("/v1/plan", {
    method: "POST",
    body: JSON.stringify({
      shipment_id: shipmentId,
      truck_class: truckClass,
      fuel_type: fuelType,
      ...(maxPayloadKg ? { max_payload_kg: maxPayloadKg } : {}),
      ...(gvwKg ? { gross_vehicle_weight_kg: gvwKg } : {}),
    }),
  });
}

export async function injectDisruption(disruption: Disruption): Promise<Disruption> {
  return request("/v1/disrupt", {
    method: "POST",
    body: JSON.stringify(disruption),
  });
}

export async function replan(planId: string): Promise<Plan> {
  return request(`/v1/plan/${planId}/replan`, { method: "POST" });
}

/* ── AEGIS planning-pipeline trace (visualiser) ───────────────── */

export interface AegisTraceEdge {
  route_id: string;
  origin: string;
  destination: string;
  base_cost: number;
  risk: number;
  weighted_cost: number;
  time_hours: number;
}

export interface AegisTraceCandidate {
  risk_weight: number;
  path_nodes: string[] | null;
  edges: AegisTraceEdge[];
  total_cost: number;
  expected_regret: number;
  blocked_edges: string[];
  non_compliant_edges: string[];
  on_frontier: boolean;
}

export interface AegisTrace {
  origin: string;
  destination: string;
  risk_grid: number[];
  candidates: AegisTraceCandidate[];
}

export interface AegisTraceInput {
  origin_id: string;
  destination_id: string;
  goods_type?: string;
  weight_kg?: number;
  disruptions?: Disruption[];
}

export async function fetchAegisTrace(input: AegisTraceInput): Promise<AegisTrace> {
  return request("/v1/plan/aegis-trace", {
    method: "POST",
    body: JSON.stringify({
      origin_id: input.origin_id,
      destination_id: input.destination_id,
      goods_type: input.goods_type ?? "general",
      weight_kg: input.weight_kg ?? 1000,
      disruptions: input.disruptions ?? [],
    }),
  });
}

