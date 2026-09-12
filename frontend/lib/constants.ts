/**
 * Constants — India logistics network, design tokens, and configuration.
 */

import type { GraphInput } from "./api";

/* ── Design Tokens (4-Color Strict System) ───────────────────────── */

export const COLORS = {
  bgPrimary: "#f8fafc",
  bgSurface: "#ffffff",
  bgGlass: "rgba(255, 255, 255, 0.85)",
  accent: "#2563eb",       // Primary Cobalt
  accentDim: "rgba(37, 99, 235, 0.08)",
  danger: "#dc2626",       // Alert Crimson
  dangerDim: "rgba(220, 38, 38, 0.08)",
  text: "#0f172a",         // Obsidian Text
  textSecondary: "#475569",
  textMuted: "#94a3b8",
  border: "#e2e8f0",
  borderLight: "rgba(15, 23, 42, 0.06)",
} as const;

export const RISK_GRADIENT = [
  { threshold: 0.0, color: "rgba(100, 116, 139, 0.35)" },
  { threshold: 0.15, color: "rgba(100, 116, 139, 0.55)" },
  { threshold: 0.3, color: "#d97706" },
  { threshold: 0.5, color: "#dc2626" },
] as const;

export function riskColor(risk: number): string {
  for (let i = RISK_GRADIENT.length - 1; i >= 0; i--) {
    if (risk >= RISK_GRADIENT[i].threshold) return RISK_GRADIENT[i].color;
  }
  return RISK_GRADIENT[0].color;
}

/* ── Algorithm metadata (Cobalt / Slate / Crimson Palette) ────── */

export const ALGORITHM_META: Record<
  string,
  { label: string; color: string; description: string }
> = {
  bfs: {
    label: "BFS",
    color: "#2563eb",
    description: "Breadth-First Search — explores level by level, guarantees shortest hop-count path",
  },
  dfs: {
    label: "DFS",
    color: "#64748b",
    description: "Depth-First Search — explores deep before wide, memory efficient but not optimal",
  },
  ucs: {
    label: "UCS",
    color: "#0f172a",
    description: "Uniform-Cost Search — expands cheapest-first, guarantees optimal cost path",
  },
  astar: {
    label: "A*",
    color: "#1d4ed8",
    description: "A* Search — UCS + admissible heuristic, optimal and typically faster than UCS",
  },
  greedy: {
    label: "Greedy",
    color: "#dc2626",
    description: "Greedy Best-First — expands closest-to-goal, fast but not optimal",
  },
  hill_climbing: {
    label: "Hill Climb",
    color: "#475569",
    description: "Hill Climbing — local search, can get stuck at local optima",
  },
};

/* ── India Logistics Network ──────────────────────────────────── */

export const INDIA_NETWORK: GraphInput = {
  depots: [
    { id: "delhi", name: "Delhi", latitude: 28.6139, longitude: 77.2090 },
    { id: "mumbai", name: "Mumbai", latitude: 19.0760, longitude: 72.8777 },
    { id: "chennai", name: "Chennai", latitude: 13.0827, longitude: 80.2707 },
    { id: "kolkata", name: "Kolkata", latitude: 22.5726, longitude: 88.3639 },
    { id: "bangalore", name: "Bangalore", latitude: 12.9716, longitude: 77.5946 },
    { id: "hyderabad", name: "Hyderabad", latitude: 17.3850, longitude: 78.4867 },
    { id: "pune", name: "Pune", latitude: 18.5204, longitude: 73.8567 },
    { id: "jaipur", name: "Jaipur", latitude: 26.9124, longitude: 75.7873 },
    { id: "ahmedabad", name: "Ahmedabad", latitude: 23.0225, longitude: 72.5714 },
    { id: "lucknow", name: "Lucknow", latitude: 26.8467, longitude: 80.9462 },
  ],
  routes: [
    // Delhi corridor
    { id: "r-del-jai", origin_id: "delhi", destination_id: "jaipur", cost: 5, time_hours: 5, risk_prior: 0.08, restricted_goods: [] },
    { id: "r-del-luc", origin_id: "delhi", destination_id: "lucknow", cost: 6, time_hours: 6, risk_prior: 0.05, restricted_goods: [] },
    { id: "r-del-ahm", origin_id: "delhi", destination_id: "ahmedabad", cost: 12, time_hours: 10, risk_prior: 0.12, restricted_goods: [] },
    { id: "r-del-kol", origin_id: "delhi", destination_id: "kolkata", cost: 18, time_hours: 16, risk_prior: 0.15, restricted_goods: [] },

    // Jaipur connections
    { id: "r-jai-ahm", origin_id: "jaipur", destination_id: "ahmedabad", cost: 8, time_hours: 7, risk_prior: 0.06, restricted_goods: [] },
    { id: "r-jai-del", origin_id: "jaipur", destination_id: "delhi", cost: 5, time_hours: 5, risk_prior: 0.08, restricted_goods: [] },

    // Ahmedabad connections
    { id: "r-ahm-mum", origin_id: "ahmedabad", destination_id: "mumbai", cost: 7, time_hours: 6, risk_prior: 0.10, restricted_goods: [] },
    { id: "r-ahm-jai", origin_id: "ahmedabad", destination_id: "jaipur", cost: 8, time_hours: 7, risk_prior: 0.06, restricted_goods: [] },

    // Mumbai corridor
    { id: "r-mum-pun", origin_id: "mumbai", destination_id: "pune", cost: 3, time_hours: 3, risk_prior: 0.04, restricted_goods: [] },
    { id: "r-mum-hyd", origin_id: "mumbai", destination_id: "hyderabad", cost: 10, time_hours: 9, risk_prior: 0.18, restricted_goods: [] },
    { id: "r-mum-ahm", origin_id: "mumbai", destination_id: "ahmedabad", cost: 7, time_hours: 6, risk_prior: 0.10, restricted_goods: [] },

    // Pune connections
    { id: "r-pun-ban", origin_id: "pune", destination_id: "bangalore", cost: 12, time_hours: 10, risk_prior: 0.14, restricted_goods: [] },
    { id: "r-pun-hyd", origin_id: "pune", destination_id: "hyderabad", cost: 9, time_hours: 8, risk_prior: 0.11, restricted_goods: [] },
    { id: "r-pun-mum", origin_id: "pune", destination_id: "mumbai", cost: 3, time_hours: 3, risk_prior: 0.04, restricted_goods: [] },

    // Hyderabad connections
    { id: "r-hyd-ban", origin_id: "hyderabad", destination_id: "bangalore", cost: 8, time_hours: 7, risk_prior: 0.09, restricted_goods: [] },
    { id: "r-hyd-che", origin_id: "hyderabad", destination_id: "chennai", cost: 9, time_hours: 8, risk_prior: 0.13, restricted_goods: [] },
    { id: "r-hyd-mum", origin_id: "hyderabad", destination_id: "mumbai", cost: 10, time_hours: 9, risk_prior: 0.18, restricted_goods: [] },
    { id: "r-hyd-pun", origin_id: "hyderabad", destination_id: "pune", cost: 9, time_hours: 8, risk_prior: 0.11, restricted_goods: [] },

    // Bangalore connections
    { id: "r-ban-che", origin_id: "bangalore", destination_id: "chennai", cost: 6, time_hours: 5, risk_prior: 0.07, restricted_goods: [] },
    { id: "r-ban-hyd", origin_id: "bangalore", destination_id: "hyderabad", cost: 8, time_hours: 7, risk_prior: 0.09, restricted_goods: [] },
    { id: "r-ban-pun", origin_id: "bangalore", destination_id: "pune", cost: 12, time_hours: 10, risk_prior: 0.14, restricted_goods: [] },

    // Chennai connections
    { id: "r-che-kol", origin_id: "chennai", destination_id: "kolkata", cost: 20, time_hours: 18, risk_prior: 0.22, restricted_goods: ["hazardous"] },
    { id: "r-che-ban", origin_id: "chennai", destination_id: "bangalore", cost: 6, time_hours: 5, risk_prior: 0.07, restricted_goods: [] },
    { id: "r-che-hyd", origin_id: "chennai", destination_id: "hyderabad", cost: 9, time_hours: 8, risk_prior: 0.13, restricted_goods: [] },

    // Kolkata connections
    { id: "r-kol-del", origin_id: "kolkata", destination_id: "delhi", cost: 18, time_hours: 16, risk_prior: 0.15, restricted_goods: [] },
    { id: "r-kol-luc", origin_id: "kolkata", destination_id: "lucknow", cost: 12, time_hours: 11, risk_prior: 0.10, restricted_goods: [] },
    { id: "r-kol-che", origin_id: "kolkata", destination_id: "chennai", cost: 20, time_hours: 18, risk_prior: 0.22, restricted_goods: ["hazardous"] },

    // Lucknow connections
    { id: "r-luc-del", origin_id: "lucknow", destination_id: "delhi", cost: 6, time_hours: 6, risk_prior: 0.05, restricted_goods: [] },
    { id: "r-luc-kol", origin_id: "lucknow", destination_id: "kolkata", cost: 12, time_hours: 11, risk_prior: 0.10, restricted_goods: [] },
  ],
};

/* ── Animation config ─────────────────────────────────────────── */

export const ANIMATION = {
  fast: 0.15,
  normal: 0.3,
  slow: 0.6,
  spring: { type: "spring" as const, stiffness: 300, damping: 25 },
  easeOut: [0.4, 0, 0.2, 1] as [number, number, number, number],
} as const;

/* ── Map config ───────────────────────────────────────────────── */

export const MAP_CONFIG = {
  center: [22.5, 78.5] as [number, number], // center of India
  zoom: 5,
  minZoom: 4,
  maxZoom: 18,
  tileUrl: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
  tileAttribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors',
} as const;

/* ── Real-life Indian fuel pricing & truck economics ──────────── */
/* Sources: IOCL/BPCL metro pump prices (Sep 2024), SIAM/IRTSA    */
/* mileage field data, NHAI toll schedule, AITWA wage scale,      */
/* LEADS/CRISIL spot freight rates, EVYATRA/Tata Power chargers.  */

export type FuelType = "diesel" | "petrol" | "electric";

export const FUEL_META: Record<
  FuelType,
  {
    label: string;
    priceLabel: string;
    pricePerUnit: number;
    unit: string;
    note: string;
    color: string;
  }
> = {
  diesel: {
    label: "Diesel",
    priceLabel: "₹91.50 / L",
    pricePerUnit: 91.5,
    unit: "litres",
    note: "IOCL metro average — most Indian freight trucks run diesel",
    color: "#0f172a",
  },
  petrol: {
    label: "Petrol",
    priceLabel: "₹96.72 / L",
    pricePerUnit: 96.72,
    unit: "litres",
    note: "IOCL metro average — only viable for small LCVs",
    color: "#b45309",
  },
  electric: {
    label: "Electric",
    priceLabel: "₹9.00 / kWh",
    pricePerUnit: 9.0,
    unit: "kWh",
    note: "EESL / Tata Power highway DC fast-charger tariff",
    color: "#16a34a",
  },
};

/* Depots with known EV charging infrastructure (EVYATRA / Tata    */
/* Power / EESL / state DISCOM stations, Sep 2024 snapshot).       */
export const EV_CHARGING_DEPOTS: Record<string, string> = {
  delhi: "Tata Power + EESL + DMRC hub chargers",
  mumbai: "BEST + Tata Power + EESL",
  bangalore: "BESCOM + Tata Power",
  hyderabad: "TSREDCO highway stations",
  pune: "Mahadiscom + Tata Power",
  ahmedabad: "PGVCL stations",
  jaipur: "Rajasthan EV Mission hubs",
  chennai: "TANGEDCO hubs",
  kolkata: "WBSEDCL stations",
  lucknow: "UPCL pilot stations",
};

export function hasEvCharging(depotId: string): boolean {
  return depotId in EV_CHARGING_DEPOTS;
}

export function formatInr(value: number): string {
  return `₹${value.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}
