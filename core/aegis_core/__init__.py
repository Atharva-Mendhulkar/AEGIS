"""AEGIS planning algorithms and multi-agent system.

Intentionally pure Python, independent of web frameworks and external solvers.
"""

from .agents import (
    AdversaryAgent,
    PlannerAgent,
    PlanRepairAgent,
    RegretOracleAgent,
)
from .algorithms.adversarial import alpha_beta, generate_adversarial_disruption, minimax
from .algorithms.search import (
    Heuristic,
    astar,
    bfs,
    bidirectional_astar,
    bidirectional_dijkstra,
    bidirectional_ucs,
    dfs,
    dijkstra,
    dls,
    find_path,
    great_circle_heuristic,
    greedy_best_first,
    haversine_km,
    hill_climbing,
    hill_climbing_random_restart,
    ida_star,
    iddfs,
    ucs,
)
from .domain.models import Depot, Disruption, GraphInput, Plan, PlanStatus, Route, Shipment
from .services.compliance import route_is_compliant
from .services.pareto import frontier
from .services.planner import ResiliencePlanner
from .services.repair import repair_plan
from .services.risk import edge_risk

__all__ = [
    # Domain Models
    "Depot",
    "Disruption",
    "GraphInput",
    "Plan",
    "PlanStatus",
    "Route",
    "Shipment",
    # Search Algorithms
    "Heuristic",
    "astar",
    "bfs",
    "bidirectional_astar",
    "bidirectional_dijkstra",
    "bidirectional_ucs",
    "dfs",
    "dijkstra",
    "dls",
    "find_path",
    "great_circle_heuristic",
    "greedy_best_first",
    "haversine_km",
    "hill_climbing",
    "hill_climbing_random_restart",
    "ida_star",
    "iddfs",
    "ucs",
    # Adversarial Search
    "alpha_beta",
    "generate_adversarial_disruption",
    "minimax",
    # Agents
    "AdversaryAgent",
    "PlanRepairAgent",
    "PlannerAgent",
    "RegretOracleAgent",
    # Services
    "ResiliencePlanner",
    "edge_risk",
    "frontier",
    "repair_plan",
    "route_is_compliant",
]
