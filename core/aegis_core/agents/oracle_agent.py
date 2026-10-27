from __future__ import annotations

from aegis_core.domain.models import Disruption, GraphInput, Plan, Shipment
from aegis_core.services.planner import ResiliencePlanner


class RegretOracleAgent:
    """Evaluator Agent computing post-hoc oracle bounds and realized regret.

    Under an injected or realized disruption scenario S, computes the
    theoretically optimal post-hoc plan P*_S (with perfect hindsight) and
    evaluates student plan regret:

        Regret(P | S) = Cost(P | S) - Cost(P*_S | S)
    """

    def __init__(self, graph: GraphInput) -> None:
        self.graph = graph
        self.planner = ResiliencePlanner(graph)

    def compute_oracle_plan(
        self,
        shipment: Shipment,
        disruptions: list[Disruption],
        algorithm: str = "astar",
    ) -> Plan | None:
        """Compute the post-hoc optimal plan with perfect hindsight under disruptions."""
        try:
            return self.planner.plan(
                shipment=shipment,
                disruptions=disruptions,
                risk_weight=0.0,
                algorithm=algorithm,
            )
        except ValueError:
            return None

    def evaluate_regret(
        self,
        plan: Plan,
        shipment: Shipment,
        disruptions: list[Disruption],
    ) -> float:
        """Calculate the realized regret of plan P against the post-hoc oracle.

        If plan P traverses disrupted edges, it incurs slowdown costs
        (cost * (1 + severity)) or blockage penalties if severed (severity >= 1.0).
        The post-hoc oracle P*_S avoids severe disruptions proactively.
        """
        severity_map = {d.edge_id: d.severity for d in disruptions}
        oracle = self.compute_oracle_plan(shipment, disruptions)
        oracle_cost = oracle.total_cost if oracle is not None else plan.total_cost

        actual_cost = 0.0
        for rid in plan.route_ids:
            route = self.planner.routes.get(rid)
            if route is None:
                continue
            sev = severity_map.get(rid, 0.0)
            if sev >= 1.0:
                # Impassable edge closure: incurs turnaround and emergency diversion penalty
                actual_cost += route.cost * 2.5
            else:
                actual_cost += route.cost * (1.0 + sev)

        return max(0.0, actual_cost - oracle_cost)
