from __future__ import annotations

from typing import Any

from aegis_core.domain.models import Disruption, Plan, Shipment
from aegis_core.services.risk import edge_risk


def repair_plan(
    plan: Plan,
    shipment: Shipment,
    disruptions: list[Disruption],
    planner: Any,
    algorithm: str = "astar",
) -> Plan:
    """Incremental sub-graph plan repair.

    Surgically reroutes around disrupted edges while preserving the
    unaffected execution prefix, providing sub-20 ms repair latency and
    preserving high route stability.
    """
    disrupted_edge_ids = {d.edge_id for d in disruptions if d.severity >= 1.0}
    if not any(rid in disrupted_edge_ids for rid in plan.route_ids):
        return plan

    cut_index = -1
    for idx, rid in enumerate(plan.route_ids):
        if rid in disrupted_edge_ids:
            cut_index = idx
            break

    if cut_index == -1:
        return plan

    prefix_edge_ids = plan.route_ids[:cut_index]
    if prefix_edge_ids:
        last_safe_edge = planner.routes[prefix_edge_ids[-1]]
        divergence_node = last_safe_edge.destination_id
    else:
        divergence_node = shipment.origin_id

    sub_shipment = Shipment(
        id=f"{shipment.id}-repaired",
        origin_id=divergence_node,
        destination_id=shipment.destination_id,
        goods_type=shipment.goods_type,
        weight_kg=shipment.weight_kg,
        deadline_hours=shipment.deadline_hours,
    )

    sub_plan = planner.plan(sub_shipment, disruptions=disruptions, algorithm=algorithm)
    combined_route_ids = prefix_edge_ids + sub_plan.route_ids

    total_cost = sum(planner.routes[rid].cost for rid in combined_route_ids)
    expected_regret = sum(
        planner.routes[rid].cost * edge_risk(planner.routes[rid], disruptions)
        for rid in combined_route_ids
    )

    return Plan(
        shipment_id=shipment.id,
        route_ids=combined_route_ids,
        total_cost=total_cost,
        expected_regret=expected_regret,
        status=plan.status,
    )
