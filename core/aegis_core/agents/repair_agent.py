from __future__ import annotations

from aegis_core.domain.models import Disruption, GraphInput, Plan, Shipment
from aegis_core.services.planner import ResiliencePlanner
from aegis_core.services.repair import repair_plan


class PlanRepairAgent:
    """Repair Agent executing dynamic online sub-graph patching.

    When an active disruption cuts an in-flight route, this agent preserves
    the safe prefix completed so far and swiftly replans only the remaining
    sub-path to restore delivery continuity with minimal schedule churn.
    """

    def __init__(self, graph: GraphInput) -> None:
        self.graph = graph
        self.planner = ResiliencePlanner(graph)

    def repair(
        self,
        active_plan: Plan,
        shipment: Shipment,
        disruptions: list[Disruption],
        algorithm: str = "astar",
    ) -> Plan:
        """Surgically repair the active plan around disrupted edges."""
        return repair_plan(
            plan=active_plan,
            shipment=shipment,
            disruptions=disruptions,
            planner=self.planner,
            algorithm=algorithm,
        )
