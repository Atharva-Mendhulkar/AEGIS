from __future__ import annotations

from aegis_core.algorithms.adversarial import alpha_beta
from aegis_core.domain.models import Disruption, GraphInput, Plan, Shipment
from aegis_core.services.planner import ResiliencePlanner


class AdversaryAgent:
    """Antagonist Agent formulating adversarial disruption curricula.

    Stress-tests candidate plans by searching the combinatorial space of
    edge disruptions using Minimax search with Alpha-Beta pruning under a
    global severity budget to uncover operational failure modes.
    """

    def __init__(self, graph: GraphInput, severity_budget: int = 2, max_depth: int = 2) -> None:
        self.graph = graph
        self.severity_budget = severity_budget
        self.max_depth = max_depth
        self.planner = ResiliencePlanner(graph)

    def find_worst_disruption(
        self,
        shipment: Shipment,
        target_plan: Plan,
        candidate_severities: tuple[float, ...] = (1.0,),
    ) -> list[Disruption]:
        """Find the edge cut combination that maximizes planner regret."""
        candidate_edges = [rid for rid in target_plan.route_ids]
        if not candidate_edges:
            candidate_edges = [r.id for r in self.graph.routes]

        # Initial state: tuple of (edge_id, severity)
        initial_state: tuple[tuple[str, float], ...] = ()

        def get_actions(state: tuple[tuple[str, float], ...]) -> list[tuple[str, float]]:
            if len(state) >= self.severity_budget:
                return []
            chosen_edges = {e for e, _ in state}
            return [
                (e, s)
                for e in candidate_edges
                if e not in chosen_edges
                for s in candidate_severities
            ]

        def apply_action(
            state: tuple[tuple[str, float], ...], action: tuple[str, float]
        ) -> tuple[tuple[str, float], ...]:
            return state + (action,)

        def evaluate(state: tuple[tuple[str, float], ...]) -> float:
            disruptions = [
                Disruption(type="adversarial_cut", edge_id=e, severity=s)
                for e, s in state
            ]
            try:
                repaired = self.planner.plan(shipment, disruptions=disruptions)
                return repaired.total_cost - target_plan.total_cost
            except ValueError:
                # Disruption completely severed connectivity (infinite regret)
                return 10_000.0

        _, best_action = alpha_beta(
            state=initial_state,
            depth=self.max_depth,
            alpha=float("-inf"),
            beta=float("inf"),
            is_maximizing=True,
            get_actions=get_actions,
            apply_action=apply_action,
            evaluate=evaluate,
        )

        if best_action:
            edge_id, severity = best_action
            return [Disruption(type="adversarial_cut", edge_id=edge_id, severity=severity)]
        return []
