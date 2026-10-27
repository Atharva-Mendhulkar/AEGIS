from __future__ import annotations

from typing import TYPE_CHECKING

from aegis_core.algorithms.search import Heuristic
from aegis_core.domain.models import Disruption, GraphInput, Plan, Shipment
from aegis_core.services.planner import ResiliencePlanner

if TYPE_CHECKING:
    pass


class PlannerAgent:
    """Protagonist Agent responsible for resilient route planning.

    Consumes shipment consignments, enforces physical and regulatory
    compliance, selects search algorithms (defaulting to A* with geodetic
    heuristics), and constructs the cost-vs-regret Pareto frontier across
    risk weights.
    """

    def __init__(self, graph: GraphInput) -> None:
        self.graph = graph
        self.planner = ResiliencePlanner(graph)

    def plan_route(
        self,
        shipment: Shipment,
        disruptions: list[Disruption] | None = None,
        risk_weight: float = 0.0,
        algorithm: str = "astar",
        heuristic: Heuristic | None = None,
    ) -> Plan:
        """Generate a single compliance-verified, risk-weighted plan."""
        return self.planner.plan(
            shipment=shipment,
            disruptions=disruptions,
            risk_weight=risk_weight,
            heuristic=heuristic,
            algorithm=algorithm,
        )

    def compute_frontier(
        self,
        shipment: Shipment,
        disruptions: list[Disruption] | None = None,
        risk_weights: tuple[float, ...] | None = None,
        algorithm: str = "astar",
        heuristic: Heuristic | None = None,
    ) -> list[Plan]:
        """Compute the non-dominated Pareto frontier across risk weights."""
        return self.planner.frontier(
            shipment=shipment,
            disruptions=disruptions,
            risk_weights=risk_weights,
            heuristic=heuristic,
            algorithm=algorithm,
        )
