from __future__ import annotations

from aegis_core import Depot, Disruption, GraphInput, Route, Shipment
from aegis_core.agents import AdversaryAgent, PlannerAgent, PlanRepairAgent, RegretOracleAgent


def make_graph() -> GraphInput:
    depots = [Depot(id=x, name=x, latitude=0.0, longitude=0.0) for x in "ABCD"]
    routes = [
        Route(id="ab", origin_id="A", destination_id="B", cost=3, time_hours=1, risk_prior=0.1),
        Route(id="bc", origin_id="B", destination_id="C", cost=3, time_hours=1, risk_prior=0.1),
        Route(id="cd", origin_id="C", destination_id="D", cost=3, time_hours=1, risk_prior=0.1),
        Route(id="ad", origin_id="A", destination_id="D", cost=15, time_hours=4, risk_prior=0.01),
        Route(id="bd", origin_id="B", destination_id="D", cost=8, time_hours=2, risk_prior=0.05),
    ]
    return GraphInput(depots=depots, routes=routes)


def test_planner_agent() -> None:
    agent = PlannerAgent(make_graph())
    shipment = Shipment(
        id="s1", origin_id="A", destination_id="D", goods_type="general", weight_kg=100
    )
    plan = agent.plan_route(shipment, algorithm="astar")
    assert plan.route_ids == ["ab", "bc", "cd"]
    assert plan.total_cost == 9.0

    frontier = agent.compute_frontier(shipment, algorithm="astar")
    assert len(frontier) >= 1


def test_adversary_agent() -> None:
    graph = make_graph()
    planner_agent = PlannerAgent(graph)
    adversary = AdversaryAgent(graph, severity_budget=1, max_depth=2)

    shipment = Shipment(
        id="s1", origin_id="A", destination_id="D", goods_type="general", weight_kg=100
    )
    base_plan = planner_agent.plan_route(shipment)
    assert base_plan.route_ids == ["ab", "bc", "cd"]

    worst_disruptions = adversary.find_worst_disruption(shipment, base_plan)
    assert len(worst_disruptions) == 1
    assert worst_disruptions[0].edge_id in ["ab", "bc", "cd"]


def test_regret_oracle_agent() -> None:
    graph = make_graph()
    oracle = RegretOracleAgent(graph)
    shipment = Shipment(
        id="s1", origin_id="A", destination_id="D", goods_type="general", weight_kg=100
    )

    # Disruption severs bc
    disruptions = [Disruption(type="flood", edge_id="bc", severity=1.0)]
    oracle_plan = oracle.compute_oracle_plan(shipment, disruptions)
    assert oracle_plan is not None
    assert "bc" not in oracle_plan.route_ids

    # Candidate plan that used ab -> bc -> cd suffers regret
    naive_plan = PlannerAgent(graph).plan_route(shipment, disruptions=[])
    regret = oracle.evaluate_regret(naive_plan, shipment, disruptions)
    assert regret > 0


def test_plan_repair_agent() -> None:
    graph = make_graph()
    repair_agent = PlanRepairAgent(graph)
    shipment = Shipment(
        id="s1", origin_id="A", destination_id="D", goods_type="general", weight_kg=100
    )

    # Original plan: A -> B -> C -> D
    original_plan = PlannerAgent(graph).plan_route(shipment)
    assert original_plan.route_ids == ["ab", "bc", "cd"]

    # In flight: BC is severed. Safe prefix: AB (truck reached B).
    disruptions = [Disruption(type="strike", edge_id="bc", severity=1.0)]
    repaired_plan = repair_agent.repair(original_plan, shipment, disruptions)

    # From B, detour uses BD (cost 8). Combined: AB + BD (cost 3 + 8 = 11)
    assert repaired_plan.route_ids == ["ab", "bd"]
    assert repaired_plan.total_cost == 11.0
