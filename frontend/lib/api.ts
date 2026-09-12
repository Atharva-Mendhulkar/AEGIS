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

export interface AlgorithmResult {
  algorithm: string;
  path: string[] | null;
  cost: number | null;
  nodes_explored: number;
  time_ms: number;
  path_length: number;
}

export interface SearchTraceStep {
  step: number;
  node: string;
  parent: string | null;
  cost_so_far: number;
  frontier_size: number;
  is_goal: boolean;
}

export interface SearchTrace {
  algorithm: string;
  steps: SearchTraceStep[];
  final_path: string[] | null;
  final_cost: number | null;
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

export async function fetchPareto(): Promise<Plan[]> {
  return request("/v1/pareto");
}

export async function fetchBenchmark(
  planId: string
): Promise<{ plan_id: string; aegis_cost: number; aegis_regret: number }> {
  return request(`/v1/benchmark/ortools?plan_id=${planId}`);
}

export async function compareAlgorithms(
  shipmentId: string
): Promise<AlgorithmResult[]> {
  return request("/v1/plan/compare", {
    method: "POST",
    body: JSON.stringify({ shipment_id: shipmentId }),
  });
}

export async function fetchSearchTrace(
  shipmentId: string,
  algorithm: string = "ucs"
): Promise<SearchTrace> {
  return request("/v1/plan/trace", {
    method: "POST",
    body: JSON.stringify({ shipment_id: shipmentId, algorithm }),
  });
}

export function createSimulationWS(): WebSocket {
  const wsUrl = (
    process.env.NEXT_PUBLIC_WS_URL ??
    (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").replace(
      /^http/,
      "ws"
    )
  );
  return new WebSocket(`${wsUrl}/v1/stream/simulation`);
}
