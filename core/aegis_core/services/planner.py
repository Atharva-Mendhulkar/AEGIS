from __future__ import annotations

from collections import defaultdict

from aegis_core.algorithms.search import Heuristic, find_path, great_circle_heuristic
from aegis_core.domain.models import Disruption, GraphInput, Plan, Route, Shipment
from aegis_core.services.compliance import route_is_compliant
from aegis_core.services.risk import edge_risk


class ResiliencePlanner:
    """Cost + disruption-risk shortest path planner; no external solver is used here."""

    def __init__(self, graph: GraphInput) -> None:
        self.graph = graph
        self.routes = {route.id: route for route in graph.routes}
        self.adjacency: dict[str, list[Route]] = defaultdict(list)
        self.reverse_adjacency: dict[str, list[Route]] = defaultdict(list)
        for route in graph.routes:
            self.adjacency[route.origin_id].append(route)
            self.reverse_adjacency[route.destination_id].append(route)
        self.depot_coords: dict[str, tuple[float, float]] = {
            depot.id: (depot.latitude, depot.longitude) for depot in graph.depots
        }

    def plan(
        self,
        shipment: Shipment,
        disruptions: list[Disruption] | None = None,
        risk_weight: float = 0.0,
        heuristic: Heuristic | None = None,
        algorithm: str = "astar",
    ) -> Plan:
        """Plan a route for ``shipment`` using the chosen search algorithm.

        Supports A*, Bidirectional A*, UCS/Dijkstra, IDA*, BFS, DFS, IDDFS,
        and Greedy search. When ``algorithm='astar'`` and no custom heuristic
        is provided, an admissible great-circle geodetic heuristic is
        automatically derived from depot coordinates.
        """
        disruptions = disruptions or []

        # Auto-construct admissible great-circle heuristic if none provided
        backward_h: Heuristic | None = None
        heuristic_algos = ("astar", "bidirectional_astar", "ida_star", "greedy")
        if heuristic is None and algorithm in heuristic_algos:
            if shipment.destination_id in self.depot_coords:
                heuristic = great_circle_heuristic(
                    self.depot_coords, shipment.destination_id, base_cost_per_km=0.01
                )
            if shipment.origin_id in self.depot_coords:
                backward_h = great_circle_heuristic(
                    self.depot_coords, shipment.origin_id, base_cost_per_km=0.01
                )

        def neighbors(node: str) -> list[tuple[str, float]]:
            return [
                (
                    route.destination_id,
                    route.cost * (1 + risk_weight * edge_risk(route, disruptions)),
                )
                for route in self.adjacency[node]
                if route_is_compliant(route, shipment)
                and not any(d.edge_id == route.id and d.severity >= 1 for d in disruptions)
            ]

        def backward_neighbors(node: str) -> list[tuple[str, float]]:
            return [
                (
                    route.origin_id,
                    route.cost * (1 + risk_weight * edge_risk(route, disruptions)),
                )
                for route in self.reverse_adjacency[node]
                if route_is_compliant(route, shipment)
                and not any(d.edge_id == route.id and d.severity >= 1 for d in disruptions)
            ]

        result = find_path(
            start=shipment.origin_id,
            goal=shipment.destination_id,
            neighbors=neighbors,
            algorithm=algorithm,
            heuristic=heuristic,
            backward_neighbors=backward_neighbors,
            backward_heuristic=backward_h,
        )
        if result is None:
            raise ValueError("No feasible compliant route exists for shipment")
        nodes, _ = result
        route_ids = self._edges_for(nodes, shipment, disruptions, risk_weight)
        total_cost = sum(self.routes[route_id].cost for route_id in route_ids)
        regret = sum(
            self.routes[route_id].cost * edge_risk(self.routes[route_id], disruptions)
            for route_id in route_ids
        )
        return Plan(
            shipment_id=shipment.id,
            route_ids=route_ids,
            total_cost=total_cost,
            expected_regret=regret,
        )

    #: Risk weights swept when enumerating the cost-vs-regret frontier.
    DEFAULT_RISK_GRID: tuple[float, ...] = (0.0, 0.5, 1.0, 2.0, 5.0)

    def frontier(
        self,
        shipment: Shipment,
        disruptions: list[Disruption] | None = None,
        risk_weights: tuple[float, ...] | None = None,
        heuristic: Heuristic | None = None,
        algorithm: str = "astar",
    ) -> list[Plan]:
        """Enumerate candidate plans at several risk weights and return the
        Pareto non-dominated subset on ``(total_cost, expected_regret)``.

        Each risk weight yields one candidate via :meth:`plan`; ties on cost
        and regret are deduplicated so the frontier holds distinct (cost, regret)
        points only.
        """
        from aegis_core.services.pareto import frontier as _pareto_frontier

        grid = risk_weights if risk_weights is not None else self.DEFAULT_RISK_GRID
        candidates = [
            self.plan(shipment, disruptions, w, heuristic, algorithm=algorithm)
            for w in grid
        ]
        return _pareto_frontier(candidates)

    def _edges_for(
        self,
        nodes: list[str],
        shipment: Shipment,
        disruptions: list[Disruption],
        risk_weight: float,
    ) -> list[str]:
        selected: list[str] = []
        for origin, destination in zip(nodes[:-1], nodes[1:], strict=True):
            candidates = [
                route
                for route in self.adjacency[origin]
                if route.destination_id == destination
                and route_is_compliant(route, shipment)
            ]

            def weighted_cost(route: Route) -> float:
                return route.cost * (1 + risk_weight * edge_risk(route, disruptions))

            selected.append(min(candidates, key=weighted_cost).id)
        return selected
