from __future__ import annotations

import asyncio
import heapq
import math
import time
from collections import deque
from typing import Any

from aegis_core import Disruption, ResiliencePlanner
from aegis_core.algorithms.search import (
    astar,
    bfs,
    dfs,
    great_circle_heuristic,
    greedy_best_first,
    hill_climbing,
    ucs,
)
from aegis_core.domain.models import GraphInput, PlanStatus, Shipment
from aegis_core.services.compliance import route_is_compliant
from aegis_core.services.pareto import frontier
from fastapi import Depends, FastAPI, HTTPException, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse
from fastapi.security import APIKeyHeader
from prometheus_client import Counter, generate_latest

from .config import settings
from .schemas import (
    TRUCK_CLASSES,
    BenchmarkResult,
    CompareRequest,
    DisruptionInfo,
    PlanRequest,
    PlanResponse,
    TraceRequest,
)
from .fuel_service import compute_fuel_cost
from .store import store

app = FastAPI(title="AEGIS API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

plans_created = Counter("aegis_plans_created_total", "Number of plans generated")
api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)


def auth(x_api_key: str | None = Depends(api_key_header)) -> None:
    if x_api_key != settings.aegis_api_key:
        raise HTTPException(status_code=401, detail="Invalid API key")


def planner() -> ResiliencePlanner:
    if store.graph is None:
        raise HTTPException(status_code=409, detail="Load a graph first")
    return ResiliencePlanner(store.graph)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _severity_label(s: float) -> str:
    if s < 0.25:
        return "Low"
    if s < 0.5:
        return "Medium"
    if s < 0.75:
        return "High"
    return "Critical"


def _disruption_description(d: Disruption) -> str:
    return (
        f"{d.type.replace('_', ' ').title()} on segment {d.edge_id} "
        f"(severity {d.severity:.0%})"
    )


def _risks_for_route(route_ids: list[str], disruptions: list[Disruption]) -> list[DisruptionInfo]:
    """Return disruptions whose edge_id appears in the given route."""
    edge_set = set(route_ids)
    seen: set[str] = set()
    risks: list[DisruptionInfo] = []
    for d in disruptions:
        key = str(d.id)
        if d.edge_id in edge_set and key not in seen:
            seen.add(key)
            risks.append(DisruptionInfo(
                id=key,
                type=d.type,
                edge_id=d.edge_id,
                severity=d.severity,
                severity_label=_severity_label(d.severity),
                description=_disruption_description(d),
            ))
    return risks


def _aggregate_risk_score(risks: list[DisruptionInfo]) -> float:
    """Weighted aggregate — worst disruption dominates."""
    if not risks:
        return 0.0
    scores = sorted([r.severity for r in risks], reverse=True)
    # Exponential decay weighting so the worst disruption carries most weight
    total = sum(s * (0.7 ** i) for i, s in enumerate(scores))
    return min(total, 1.0)


def _recommendation(
    is_best: bool,
    risk_score: float,
    utilisation: float,
    fuel_type: str = "diesel",
    ev_charger_available: bool = True,
    ev_stops: int = 0,
) -> str:
    if is_best:
        parts = ["✅ Recommended route"]
        if risk_score > 0.5:
            parts.append("— monitor active disruptions")
        if utilisation > 90:
            parts.append("— truck near capacity limit")
        if fuel_type == "electric":
            if not ev_charger_available:
                parts.append("— ⚠ insufficient DC fast chargers for required stops")
            elif ev_stops > 0:
                parts.append(f"— {ev_stops} charging stop(s) planned")
            else:
                parts.append("— within single-charge EV range")
        return ". ".join(parts) + "."
    if risk_score >= 0.75:
        return "⚠ High disruption risk — consider alternate corridor."
    if fuel_type == "electric" and not ev_charger_available:
        return "⚠ Corridor lacks enough EV fast chargers — avoid for electric fleets."
    if risk_score >= 0.5:
        return "⚠ Moderate risk — re-check before dispatch."
    return "Alternative viable route."


def _resolve_truck(request: PlanRequest) -> tuple[int, int]:
    """Return (max_payload_kg, gvw_kg) resolving class defaults vs overrides."""
    cls = TRUCK_CLASSES.get(request.truck_class, TRUCK_CLASSES["hcv"])
    max_payload = request.max_payload_kg or cls["max_payload_kg"]
    gvw = request.gross_vehicle_weight_kg or cls["max_gvw_kg"]
    return int(max_payload), int(gvw)


# Road distance ≈ 1.25 × great-circle (empirical factor for the Indian NH grid)
ROAD_CIRCUITY_FACTOR: float = 1.25


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance between two WGS-84 points, in km."""
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlmb = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlmb / 2) ** 2
    return 2 * 6371.0088 * math.asin(math.sqrt(a))


def _plan_leg_stats(route_ids: list[str]) -> tuple[float, float]:
    """Return (distance_km, transit_hours) for a plan's route legs.

    Distance uses real depot coordinates (haversine × road-circuity factor),
    so fuel costs are computed on actual road kilometres, not abstract units.
    """
    graph = store.graph
    depots = {d.id: d for d in graph.depots}
    routes = {r.id: r for r in graph.routes}
    distance = 0.0
    hours = 0.0
    for rid in route_ids:
        route = routes.get(rid)
        if route is None:
            continue
        hours += route.time_hours
        origin = depots.get(route.origin_id)
        dest = depots.get(route.destination_id)
        if origin is not None and dest is not None:
            distance += _haversine_km(
                origin.latitude, origin.longitude, dest.latitude, dest.longitude
            ) * ROAD_CIRCUITY_FACTOR
    return distance, hours


def _nodes_for_route(route_ids: list[str]) -> list[str]:
    """Ordered depot-node IDs traversed by a plan (for EV charger lookup)."""
    routes = {r.id: r for r in store.graph.routes}
    nodes: list[str] = []
    for rid in route_ids:
        route = routes.get(rid)
        if route is None:
            continue
        if not nodes or nodes[-1] != route.origin_id:
            nodes.append(route.origin_id)
        nodes.append(route.destination_id)
    return nodes


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@app.post("/v1/graph", dependencies=[Depends(auth)])
def load_graph(graph: GraphInput) -> GraphInput:
    store.graph = graph
    return graph


@app.post("/v1/shipments", dependencies=[Depends(auth)])
def load_shipments(shipments: list[Shipment]) -> list[Shipment]:
    store.shipments.update({shipment.id: shipment for shipment in shipments})
    return shipments


@app.post("/v1/plan", dependencies=[Depends(auth)], response_model=list[PlanResponse])
def create_plan(request: PlanRequest) -> list[PlanResponse]:
    shipment = store.shipments.get(request.shipment_id)
    if shipment is None:
        raise HTTPException(status_code=404, detail="Shipment not found")

    # ── Truck capacity check ─────────────────────────────────────────────
    max_payload_kg, gvw_kg = _resolve_truck(request)
    cargo_kg = shipment.weight_kg
    if cargo_kg > max_payload_kg:
        truck_label = TRUCK_CLASSES.get(request.truck_class, {}).get("label", request.truck_class)
        raise HTTPException(
            status_code=422,
            detail=(
                f"Cargo weight {cargo_kg:.0f} kg exceeds the selected truck's "
                f"maximum payload of {max_payload_kg:,} kg "
                f"({truck_label}). "
                "Please choose a larger truck class or split the shipment."
            ),
        )

    # ── Run AEGIS planner (full Pareto frontier) ─────────────────────────
    try:
        raw_plans = planner().frontier(shipment, store.disruptions)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error

    if not raw_plans:
        raise HTTPException(status_code=422, detail="No feasible route found.")

    # ── Enrich plans with risk info ──────────────────────────────────────
    disruptions = store.disruptions
    responses: list[PlanResponse] = []

    for plan in raw_plans:
        risks = _risks_for_route(plan.route_ids, disruptions)
        risk_score = _aggregate_risk_score(risks)
        utilisation = round((cargo_kg / max_payload_kg) * 100, 1)

        # ── Real-world fuel / operating cost (₹) ─────────────────────────
        distance_km, transit_hours = _plan_leg_stats(plan.route_ids)
        fuel = compute_fuel_cost(
            truck_class=request.truck_class,
            fuel_type=request.fuel_type,
            distance_km=distance_km,
            time_hours=transit_hours,
            cargo_weight_kg=cargo_kg,
            route_node_ids=_nodes_for_route(plan.route_ids),
        )

        responses.append(PlanResponse(
            id=str(plan.id),
            shipment_id=plan.shipment_id,
            route_ids=plan.route_ids,
            total_cost=plan.total_cost,
            expected_regret=plan.expected_regret,
            status=plan.status,
            truck_class=request.truck_class,
            max_payload_kg=max_payload_kg,
            gross_vehicle_weight_kg=gvw_kg,
            cargo_weight_kg=cargo_kg,
            capacity_utilisation_pct=utilisation,
            fuel_type=request.fuel_type,
            fuel_cost_inr=round(fuel.fuel_cost_inr, 2),
            fuel_consumption=round(fuel.fuel_consumption, 2),
            fuel_unit=fuel.fuel_unit,
            fuel_price_per_unit=fuel.fuel_price_per_unit,
            toll_cost_inr=round(fuel.toll_cost_inr, 2),
            driver_cost_inr=round(fuel.driver_cost_inr, 2),
            total_operating_cost_inr=round(fuel.total_operating_cost_inr, 2),
            market_freight_cost_inr=round(fuel.market_freight_cost_inr, 2),
            distance_km=round(distance_km, 1),
            ev_charging_stops=fuel.ev_charging_stops,
            ev_charging_stop_nodes=fuel.ev_charging_stop_nodes,
            ev_charger_available=fuel.ev_charger_available,
            ev_range_km=fuel.ev_range_km,
            potential_risks=risks,
            risk_score=risk_score,
        ))

    # ── Pick "best" route ────────────────────────────────────────────────
    # Optimisation is fuel-aware: we score on real ₹ operating cost
    # (fuel at live pump prices + toll + driver wages) blended with risk,
    # not on the abstract planner cost units. Electric routes whose
    # corridor lacks enough DC fast chargers get a hard penalty so the
    # optimiser prefers EV-feasible corridors.
    max_op = max(p.total_operating_cost_inr for p in responses) or 1.0
    min_op = min(p.total_operating_cost_inr for p in responses)
    op_range = max_op - min_op or 1.0

    def combined_score(p: PlanResponse) -> float:
        norm_op_cost = (p.total_operating_cost_inr - min_op) / op_range
        score = 0.5 * norm_op_cost + 0.5 * p.risk_score
        if p.fuel_type == "electric" and p.ev_charging_stops > 0 and not p.ev_charger_available:
            score += 0.35  # corridor cannot support required charging stops
        return score

    best = min(responses, key=combined_score)
    best.is_best = True

    for p in responses:
        utilisation = p.capacity_utilisation_pct
        p.recommendation = _recommendation(
            p.is_best,
            p.risk_score,
            utilisation,
            fuel_type=p.fuel_type,
            ev_charger_available=p.ev_charger_available,
            ev_stops=p.ev_charging_stops,
        )

    # ── Persist & return ─────────────────────────────────────────────────
    for plan in raw_plans:
        store.plans[str(plan.id)] = plan
        plans_created.inc()

    return responses


@app.post("/v1/disrupt", dependencies=[Depends(auth)])
def inject_disruption(disruption: Disruption) -> Disruption:
    store.disruptions.append(disruption)
    return disruption


@app.post("/v1/plan/{plan_id}/replan", dependencies=[Depends(auth)])
def replan(plan_id: str):
    plan = store.plans.get(plan_id)
    if plan is None:
        raise HTTPException(status_code=404, detail="Plan not found")
    shipment = store.shipments[plan.shipment_id]
    replanned = planner().plan(shipment, store.disruptions, risk_weight=1.0)
    replanned.status = PlanStatus.REPLANNED
    store.plans[str(replanned.id)] = replanned
    return replanned


@app.get("/v1/benchmark/ortools", response_model=BenchmarkResult, dependencies=[Depends(auth)])
def benchmark(plan_id: str) -> BenchmarkResult:
    plan = store.plans.get(plan_id)
    if plan is None:
        raise HTTPException(status_code=404, detail="Plan not found")
    return BenchmarkResult(
        plan_id=plan_id,
        aegis_cost=plan.total_cost,
        aegis_regret=plan.expected_regret,
    )


@app.get("/v1/pareto", dependencies=[Depends(auth)])
def pareto():
    return frontier(list(store.plans.values()))


@app.get("/v1/truck-classes")
def truck_classes():
    """Return all supported Indian truck classes with their limits."""
    return [
        {"key": k, **v}
        for k, v in TRUCK_CLASSES.items()
    ]


@app.post("/v1/plan/compare", dependencies=[Depends(auth)])
def compare_algorithms(request: CompareRequest):
    shipment = store.shipments.get(request.shipment_id)
    if shipment is None:
        raise HTTPException(status_code=404, detail="Shipment not found")
    p = planner()
    disruptions = store.disruptions
    start = shipment.origin_id
    goal = shipment.destination_id

    def base_neighbors(node: str) -> list[tuple[str, float]]:
        return [
            (route.destination_id, route.cost)
            for route in p.adjacency.get(node, [])
            if route_is_compliant(route, shipment)
            and not any(d.edge_id == route.id and d.severity >= 1 for d in disruptions)
        ]

    coordinates = {d.id: (d.latitude, d.longitude) for d in store.graph.depots}
    try:
        h = great_circle_heuristic(coordinates, goal)
    except Exception:
        def h(_: Any) -> float:
            return 0.0

    def calc_cost(path: list[str] | None) -> float | None:
        if not path or len(path) < 2:
            return 0.0 if path else None
        total = 0.0
        for u, v in zip(path[:-1], path[1:], strict=True):
            edges = [r for r in p.adjacency.get(u, []) if r.destination_id == v]
            if edges:
                total += min(r.cost for r in edges)
        return total

    def bfs_algo(neighbors):
        return bfs(start, goal, neighbors)

    def dfs_algo(neighbors):
        return dfs(start, goal, neighbors)

    def ucs_algo(neighbors):
        res = ucs(start, goal, neighbors)
        return res[0] if res else None

    def astar_algo(neighbors):
        res = astar(start, goal, neighbors, h)
        return res[0] if res else None

    def greedy_algo(neighbors):
        return greedy_best_first(start, goal, neighbors, h)

    def hill_climbing_algo(neighbors):
        return hill_climbing(start, goal, neighbors, h, maximizing=False)

    algos = [
        ("bfs", bfs_algo),
        ("dfs", dfs_algo),
        ("ucs", ucs_algo),
        ("astar", astar_algo),
        ("greedy", greedy_algo),
        ("hill_climbing", hill_climbing_algo),
    ]

    results = []
    for name, run_fn in algos:
        explored: set[str] = set()

        def n_wrap(node: str, _n=base_neighbors, _exp=explored) -> list[tuple[str, float]]:
            _exp.add(node)
            return _n(node)

        t0 = time.perf_counter()
        try:
            path = run_fn(n_wrap)
        except Exception:
            path = None
        elapsed_ms = (time.perf_counter() - t0) * 1000

        cost = calc_cost(path)
        results.append({
            "algorithm": name,
            "path": path,
            "cost": cost,
            "nodes_explored": len(explored),
            "time_ms": round(elapsed_ms, 3),
            "path_length": len(path) if path else 0,
        })

    return results


@app.post("/v1/plan/trace", dependencies=[Depends(auth)])
def plan_trace(request: TraceRequest):
    shipment = store.shipments.get(request.shipment_id)
    if shipment is None:
        raise HTTPException(status_code=404, detail="Shipment not found")
    p = planner()
    disruptions = store.disruptions
    start = shipment.origin_id
    goal = shipment.destination_id
    algo = request.algorithm.lower()

    def base_neighbors(node: str) -> list[tuple[str, float]]:
        return [
            (route.destination_id, route.cost)
            for route in p.adjacency.get(node, [])
            if route_is_compliant(route, shipment)
            and not any(d.edge_id == route.id and d.severity >= 1 for d in disruptions)
        ]

    coordinates = {d.id: (d.latitude, d.longitude) for d in store.graph.depots}
    try:
        h = great_circle_heuristic(coordinates, goal)
    except Exception:
        def h(_: Any) -> float:
            return 0.0

    steps = []
    step_idx = 0
    final_path = None
    final_cost = None

    if algo == "dfs":
        stack = [(start, None, 0.0, [start])]
        seen = {start}
        while stack:
            node, parent, cost, path = stack.pop()
            is_goal = (node == goal)
            steps.append({
                "step": step_idx,
                "node": node,
                "parent": parent,
                "cost_so_far": cost,
                "frontier_size": len(stack),
                "is_goal": is_goal,
            })
            step_idx += 1
            if is_goal:
                final_path = path
                final_cost = cost
                break
            for child, edge_cost in reversed(base_neighbors(node)):
                if child not in seen:
                    seen.add(child)
                    stack.append((child, node, cost + edge_cost, path + [child]))
    elif algo in ("ucs", "astar"):
        pq_frontier = [(h(start) if algo == "astar" else 0.0, 0.0, start, None, [start])]
        best = {start: 0.0}
        while pq_frontier:
            _, cost, node, parent, path = heapq.heappop(pq_frontier)
            is_goal = (node == goal)
            steps.append({
                "step": step_idx,
                "node": node,
                "parent": parent,
                "cost_so_far": cost,
                "frontier_size": len(pq_frontier),
                "is_goal": is_goal,
            })
            step_idx += 1
            if is_goal:
                final_path = path
                final_cost = cost
                break
            if cost > best.get(node, float("inf")):
                continue
            for child, edge_cost in base_neighbors(node):
                cand = cost + edge_cost
                if cand < best.get(child, float("inf")):
                    best[child] = cand
                    prio = cand + (h(child) if algo == "astar" else 0.0)
                    heapq.heappush(pq_frontier, (prio, cand, child, node, path + [child]))
    else:  # default bfs
        queue = deque([(start, None, 0.0, [start])])
        seen = {start}
        while queue:
            node, parent, cost, path = queue.popleft()
            is_goal = (node == goal)
            steps.append({
                "step": step_idx,
                "node": node,
                "parent": parent,
                "cost_so_far": cost,
                "frontier_size": len(queue),
                "is_goal": is_goal,
            })
            step_idx += 1
            if is_goal:
                final_path = path
                final_cost = cost
                break
            for child, edge_cost in base_neighbors(node):
                if child not in seen:
                    seen.add(child)
                    queue.append((child, node, cost + edge_cost, path + [child]))

    return {
        "algorithm": algo,
        "steps": steps,
        "final_path": final_path,
        "final_cost": final_cost,
    }


@app.websocket("/v1/stream/simulation")
async def stream_simulation(websocket: WebSocket) -> None:
    await websocket.accept()
    try:
        await websocket.send_json({"type": "connected", "payload": {}})
        while True:
            await asyncio.sleep(15)
            await websocket.send_json({"type": "heartbeat", "payload": {}})
    except Exception:
        pass


@app.get("/v1/metrics", response_class=PlainTextResponse)
def metrics() -> bytes:
    return generate_latest()
