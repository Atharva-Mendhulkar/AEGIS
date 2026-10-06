from __future__ import annotations

import heapq
import math
from collections import deque
from collections.abc import Callable
from typing import TypeVar

Node = TypeVar("Node", bound=str)
Neighbors = Callable[[Node], list[tuple[Node, float]]]
Heuristic = Callable[[str], float]

_EARTH_RADIUS_KM = 6371.0088


def bfs(start: Node, goal: Node, neighbors: Neighbors[Node]) -> list[Node] | None:
    queue: deque[tuple[Node, list[Node]]] = deque([(start, [start])])
    seen = {start}
    while queue:
        node, path = queue.popleft()
        if node == goal:
            return path
        for child, _ in neighbors(node):
            if child not in seen:
                seen.add(child)
                queue.append((child, path + [child]))
    return None


def ucs(
    start: Node,
    goal: Node,
    neighbors: Neighbors[Node],
    heuristic: Heuristic | None = None,
) -> tuple[list[Node], float] | None:
    heuristic = heuristic or (lambda _: 0.0)
    frontier: list[tuple[float, float, Node, list[Node]]] = [
        (heuristic(start), 0.0, start, [start])
    ]
    best: dict[Node, float] = {start: 0.0}
    while frontier:
        _, cost, node, path = heapq.heappop(frontier)
        if node == goal:
            return path, cost
        if cost > best.get(node, float("inf")):
            continue
        for child, edge_cost in neighbors(node):
            candidate = cost + edge_cost
            if candidate < best.get(child, float("inf")):
                best[child] = candidate
                heapq.heappush(
                    frontier,
                    (candidate + heuristic(child), candidate, child, path + [child]),
                )
    return None


def astar(
    start: Node, goal: Node, neighbors: Neighbors[Node], heuristic: Heuristic
) -> tuple[list[Node], float] | None:
    """A* search.

    A* is uniform-cost search augmented with an admissible heuristic. It reuses the
    relaxed-dijkstra loop of :func:`ucs` and is kept as an explicit named entry
    point so the planner's toolkit matches the methods enumerated in
    docs/implementation-plan.md. Returns ``(path, cost)`` or ``None``.
    """
    return ucs(start, goal, neighbors, heuristic)


def dfs(start: Node, goal: Node, neighbors: Neighbors[Node]) -> list[Node] | None:
    """Depth-first path-finding. Returns the first path found, not necessarily shortest."""
    stack: list[tuple[Node, list[Node]]] = [(start, [start])]
    seen = {start}
    while stack:
        node, path = stack.pop()
        if node == goal:
            return path
        for child, _ in reversed(neighbors(node)):
            if child not in seen:
                seen.add(child)
                stack.append((child, path + [child]))
    return None


def greedy_best_first(
    start: Node, goal: Node, neighbors: Neighbors[Node], heuristic: Heuristic
) -> list[Node] | None:
    """Greedy best-first search: expand the node estimated closest to the goal.

    Uses only the heuristic (never path cost), so it is neither optimal nor
    complete on cyclic graphs; a ``seen`` set prevents infinite loops and the
    first path reaching the goal is returned.
    """
    counter = 0
    frontier: list[tuple[float, int, Node, list[Node]]] = [
        (heuristic(start), 0, start, [start])
    ]
    seen = {start}
    while frontier:
        _, _, node, path = heapq.heappop(frontier)
        if node == goal:
            return path
        for child, _ in neighbors(node):
            if child not in seen:
                seen.add(child)
                counter += 1
                heapq.heappush(
                    frontier, (heuristic(child), counter, child, path + [child])
                )
    return None


def hill_climbing(
    start: Node,
    goal: Node,
    neighbors: Neighbors[Node],
    value: Heuristic,
    maximizing: bool = True,
) -> list[Node] | None:
    """Hill-climbing local search over a node ``value`` function.

    Moves to the best-valued unvisited neighbour; stops at a local optimum where
    no neighbour improves on the current value, or when the goal is reached.
    Returns the goal path, or ``None`` if a local optimum blocks progress.
    """
    current = start
    path: list[Node] = [start]
    seen: set[Node] = {start}
    while current != goal:
        candidates = [child for child, _ in neighbors(current) if child not in seen]
        if not candidates:
            return None
        if maximizing:
            best = max(candidates, key=value)
            if value(best) <= value(current):
                return None  # local optimum
        else:
            best = min(candidates, key=value)
            if value(best) >= value(current):
                return None  # local optimum
        seen.add(best)
        current = best
        path.append(current)
    return path


def great_circle_heuristic(
    coordinates: dict[str, tuple[float, float]], goal: str, base_cost_per_km: float = 1.0
) -> Heuristic:
    """Admissible A* heuristic from great-circle (haversine) distance to ``goal``.

    ``coordinates`` maps each node id to a ``(latitude, longitude)`` pair. The
    returned estimator scales the haversine distance by ``base_cost_per_km`` and is
    admissible (never overestimates) when every edge cost is at least that great-
    circle distance at the same scale.
    """
    goal_lat, goal_lon = coordinates[goal]

    def heuristic(node: str) -> float:
        lat, lon = coordinates[node]
        return base_cost_per_km * haversine_km(lat, lon, goal_lat, goal_lon)

    return heuristic


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance between two WGS-84 points, in km."""
    lat1, lon1, lat2, lon2 = map(math.radians, (lat1, lon1, lat2, lon2))
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    a = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 2 * _EARTH_RADIUS_KM * math.asin(math.sqrt(a))
