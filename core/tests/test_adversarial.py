from __future__ import annotations

from aegis_core import Depot, Disruption, GraphInput, Route, Shipment
from aegis_core.algorithms.adversarial import alpha_beta, generate_adversarial_disruption, minimax
from aegis_core.services.planner import ResiliencePlanner


def test_minimax_basic_tree() -> None:
    # Simple binary game tree with known values
    tree = {
        "root": ["A", "B"],
        "A": ["A1", "A2"],
        "B": ["B1", "B2"],
    }
    leaf_values = {
        "A1": 3,
        "A2": 5,
        "B1": 2,
        "B2": 9,
    }

    def get_actions(state: str) -> list[str]:
        return tree.get(state, [])

    def apply_action(state: str, action: str) -> str:
        return action

    def evaluate(state: str) -> float:
        return leaf_values[state]

    # MAX at root, MIN at level 1:
    # A has min(3, 5) = 3
    # B has min(2, 9) = 2
    # MAX at root picks max(3, 2) = 3 with action "A"
    val, action = minimax(
        "root",
        depth=2,
        is_maximizing=True,
        get_actions=get_actions,
        apply_action=apply_action,
        evaluate=evaluate,
    )
    assert val == 3
    assert action == "A"


def test_alpha_beta_matches_minimax() -> None:
    tree = {
        "root": ["A", "B"],
        "A": ["A1", "A2"],
        "B": ["B1", "B2"],
    }
    leaf_values = {
        "A1": 3,
        "A2": 5,
        "B1": 2,
        "B2": 9,
    }

    val, action = alpha_beta(
        "root",
        depth=2,
        alpha=float("-inf"),
        beta=float("inf"),
        is_maximizing=True,
        get_actions=lambda s: tree.get(s, []),
        apply_action=lambda s, a: a,
        evaluate=lambda s: leaf_values[s],
    )
    assert val == 3
    assert action == "A"


def test_generate_adversarial_disruption() -> None:
    # Graph where AB is cheap (5), AC+CB is alternative (10)
    depots = [Depot(id=x, name=x, latitude=0.0, longitude=0.0) for x in "ABC"]
    routes = [
        Route(id="ab", origin_id="A", destination_id="B", cost=5, time_hours=1),
        Route(id="ac", origin_id="A", destination_id="C", cost=5, time_hours=1),
        Route(id="cb", origin_id="C", destination_id="B", cost=5, time_hours=1),
    ]
    graph = GraphInput(depots=depots, routes=routes)
    planner = ResiliencePlanner(graph)
    shipment = Shipment(
        id="s", origin_id="A", destination_id="B", goods_type="general", weight_kg=10
    )

    base_plan = planner.plan(shipment)
    assert base_plan.route_ids == ["ab"]

    def eval_cost(severed: list[str]) -> float:
        d = [Disruption(type="cut", edge_id=e, severity=1.0) for e in severed]
        try:
            return planner.plan(shipment, disruptions=d).total_cost
        except ValueError:
            return 999.0

    worst = generate_adversarial_disruption(
        graph_routes=routes,
        baseline_route_ids=base_plan.route_ids,
        eval_plan_cost=eval_cost,
        severity_budget=1,
    )
    assert "ab" in worst
