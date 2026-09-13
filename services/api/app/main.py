from __future__ import annotations

import asyncio

from aegis_core import Disruption, ResiliencePlanner
from aegis_core.algorithms.search import haversine_km, ucs
from aegis_core.domain.models import GraphInput, Plan, PlanStatus, Shipment
from aegis_core.services.compliance import route_is_compliant
from aegis_core.services.pareto import frontier
from aegis_core.services.risk import edge_risk
from fastapi import Depends, FastAPI, HTTPException, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse
from fastapi.security import APIKeyHeader
from prometheus_client import Counter, generate_latest

from .config import settings
from .fuel_service import compute_fuel_cost
from .schemas import (
    TRUCK_CLASSES,
    AegisTraceRequest,
    DisruptionInfo,
    PlanRequest,
    PlanResponse,
)
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


def _plan_legs(route_ids: list[str]) -> list[dict]:
    """Build ordered leg records for a plan with real-world distances.

    Each leg carries {distance_km, time_hours, origin_id, destination_id} so
    the fuel service can resolve state-level VAT, road quality and tolls.
    """
    graph = store.graph
    depots = {d.id: d for d in graph.depots}
    routes = {r.id: r for r in graph.routes}
    legs: list[dict] = []
    for rid in route_ids:
        route = routes.get(rid)
        if route is None:
            continue
        origin = depots.get(route.origin_id)
        dest = depots.get(route.destination_id)
        distance = 0.0
        if origin is not None and dest is not None:
            distance = haversine_km(
                origin.latitude, origin.longitude, dest.latitude, dest.longitude
            ) * ROAD_CIRCUITY_FACTOR
        legs.append({
            "distance_km": distance,
            "time_hours": route.time_hours,
            "origin_id": route.origin_id,
            "destination_id": route.destination_id,
        })
    return legs


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

        # ── Real-world, state-aware fuel / operating cost (₹) ────────────
        legs = _plan_legs(plan.route_ids)
        distance_km = sum(leg["distance_km"] for leg in legs)
        fuel = compute_fuel_cost(
            truck_class=request.truck_class,
            fuel_type=request.fuel_type,
            legs=legs,
            cargo_weight_kg=cargo_kg,
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
            state_breakdown=fuel.state_breakdown,
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


@app.post("/v1/plan/aegis-trace", dependencies=[Depends(auth)])
def aegis_trace(request: AegisTraceRequest) -> dict:
    """Instrument the AEGIS planning pipeline stage by stage.

    Stage 1 — compliance filter (restricted goods, fully blocked corridors)
    Stage 2 — risk-weighted UCS sweep over the risk-weight grid; each weight
              re-weights every edge to ``cost × (1 + w × edge_risk)``
    Stage 3 — Pareto frontier selection on (total_cost, expected_regret)
    """
    p = planner()
    shipment = Shipment(
        id=f"viz-{request.origin_id}-{request.destination_id}",
        origin_id=request.origin_id,
        destination_id=request.destination_id,
        goods_type=request.goods_type,
        weight_kg=request.weight_kg,
    )
    disruptions = request.disruptions

    grid = ResiliencePlanner.DEFAULT_RISK_GRID
    candidates: list[dict] = []

    for weight in grid:
        blocked: list[str] = []
        non_compliant: list[str] = []

        def neighbors(node: str, _w: float = weight) -> list[tuple[str, float]]:
            outs: list[tuple[str, float]] = []
            for route in p.adjacency.get(node, []):
                if not route_is_compliant(route, shipment):
                    if route.id not in non_compliant:
                        non_compliant.append(route.id)
                    continue
                if any(d.edge_id == route.id and d.severity >= 1 for d in disruptions):
                    if route.id not in blocked:
                        blocked.append(route.id)
                    continue
                outs.append((
                    route.destination_id,
                    route.cost * (1 + _w * edge_risk(route, disruptions)),
                ))
            return outs

        result = ucs(request.origin_id, request.destination_id, neighbors)
        path_nodes = result[0] if result else None

        edge_rows: list[dict] = []
        total_cost = 0.0
        regret = 0.0
        if path_nodes and len(path_nodes) >= 2:
            for u, v in zip(path_nodes[:-1], path_nodes[1:], strict=True):
                options = [
                    r for r in p.adjacency.get(u, [])
                    if r.destination_id == v and route_is_compliant(r, shipment)
                ]
                if not options:
                    continue
                chosen = min(
                    options,
                    key=lambda r: r.cost * (1 + weight * edge_risk(r, disruptions)),
                )
                risk = edge_risk(chosen, disruptions)
                edge_rows.append({
                    "route_id": chosen.id,
                    "origin": u,
                    "destination": v,
                    "base_cost": chosen.cost,
                    "risk": round(risk, 4),
                    "weighted_cost": round(chosen.cost * (1 + weight * risk), 3),
                    "time_hours": chosen.time_hours,
                })
                total_cost += chosen.cost
                regret += chosen.cost * risk

        plan = Plan(
            shipment_id=shipment.id,
            route_ids=[e["route_id"] for e in edge_rows],
            total_cost=total_cost,
            expected_regret=regret,
        )
        candidates.append({
            "risk_weight": weight,
            "path_nodes": path_nodes,
            "edges": edge_rows,
            "total_cost": round(total_cost, 3),
            "expected_regret": round(regret, 4),
            "blocked_edges": blocked,
            "non_compliant_edges": non_compliant,
            "_plan": plan,
        })

    frontier_plans = frontier([c["_plan"] for c in candidates])
    frontier_keys = {(pl.total_cost, pl.expected_regret) for pl in frontier_plans}
    for c in candidates:
        c["on_frontier"] = (c["_plan"].total_cost, c["_plan"].expected_regret) in frontier_keys
        del c["_plan"]

    return {
        "origin": request.origin_id,
        "destination": request.destination_id,
        "risk_grid": list(grid),
        "candidates": candidates,
    }


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
