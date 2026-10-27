from __future__ import annotations

import heapq
import math
import random
from collections import deque
from collections.abc import Callable
from typing import TypeVar

Node = TypeVar("Node", bound=str)
Neighbors = Callable[[Node], list[tuple[Node, float]]]
Heuristic = Callable[[str], float]

_EARTH_RADIUS_KM = 6371.0088


# ---------------------------------------------------------------------------
# 1. Uninformed Search Algorithms
# ---------------------------------------------------------------------------

def bfs(start: Node, goal: Node, neighbors: Neighbors[Node]) -> list[Node] | None:
    """Breadth-first search for unweighted shortest hop-count path."""
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


def dls(
    start: Node,
    goal: Node,
    neighbors: Neighbors[Node],
    limit: int,
) -> tuple[list[Node] | None, bool]:
    """Depth-Limited Search (DLS).

    Returns ``(path, cutoff_occurred)``.
    """
    stack: list[tuple[Node, list[Node], int]] = [(start, [start], 0)]
    cutoff_occurred = False
    visited_at_depth: dict[Node, int] = {start: 0}

    while stack:
        node, path, depth = stack.pop()
        if node == goal:
            return path, False
        if depth >= limit:
            cutoff_occurred = True
            continue
        for child, _ in reversed(neighbors(node)):
            if child not in visited_at_depth or visited_at_depth[child] > depth + 1:
                visited_at_depth[child] = depth + 1
                stack.append((child, path + [child], depth + 1))
    return None, cutoff_occurred


def iddfs(
    start: Node,
    goal: Node,
    neighbors: Neighbors[Node],
    max_depth: int = 50,
) -> list[Node] | None:
    """Iterative Deepening Depth-First Search (IDDFS).

    Combines the completeness of BFS with the O(b*d) space efficiency of DFS.
    Guarantees the minimum-hop path.
    """
    for depth in range(max_depth + 1):
        path, cutoff = dls(start, goal, neighbors, depth)
        if path is not None:
            return path
        if not cutoff:
            break
    return None


# ---------------------------------------------------------------------------
# 2. Uniform-Cost & Dijkstra Search
# ---------------------------------------------------------------------------

def ucs(
    start: Node,
    goal: Node,
    neighbors: Neighbors[Node],
    heuristic: Heuristic | None = None,
) -> tuple[list[Node], float] | None:
    """Uniform-Cost Search (Dijkstra) or A* when heuristic is provided.

    Expands the frontier in order of increasing path cost g(n) + h(n).
    Returns ``(path, cost)`` or ``None`` if no path exists.
    """
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


dijkstra = ucs


# ---------------------------------------------------------------------------
# 3. Informed (Heuristic) Search Algorithms: A*, Greedy, IDA*
# ---------------------------------------------------------------------------

def astar(
    start: Node,
    goal: Node,
    neighbors: Neighbors[Node],
    heuristic: Heuristic | None = None,
) -> tuple[list[Node], float] | None:
    """A* Search Algorithm.

    Minimizes f(n) = g(n) + h(n), where g(n) is the exact cost from start to n,
    and h(n) is an admissible heuristic estimating cost from n to goal.
    Guarantees optimal solution when heuristic is admissible.
    """
    return ucs(start, goal, neighbors, heuristic)


def ida_star(
    start: Node,
    goal: Node,
    neighbors: Neighbors[Node],
    heuristic: Heuristic | None = None,
) -> tuple[list[Node], float] | None:
    """Iterative Deepening A* (IDA*) search.

    Memory-efficient (O(d)) optimal search that uses successive f-cost contours
    instead of an open priority queue.
    """
    heuristic = heuristic or (lambda _: 0.0)
    bound = heuristic(start)
    path: list[Node] = [start]

    def search(node: Node, g: float, limit: float) -> tuple[bool, float, list[Node]]:
        f = g + heuristic(node)
        if f > limit:
            return False, f, []
        if node == goal:
            return True, g, list(path)
        min_excess = float("inf")
        for child, edge_cost in neighbors(node):
            if child not in path:
                path.append(child)
                found, next_bound, goal_path = search(child, g + edge_cost, limit)
                if found:
                    return True, next_bound, goal_path
                if next_bound < min_excess:
                    min_excess = next_bound
                path.pop()
        return False, min_excess, []

    while True:
        found, next_bound, goal_path = search(start, 0.0, bound)
        if found:
            return goal_path, next_bound
        if math.isinf(next_bound):
            return None
        bound = next_bound


def greedy_best_first(
    start: Node, goal: Node, neighbors: Neighbors[Node], heuristic: Heuristic
) -> list[Node] | None:
    """Greedy best-first search: expand the node estimated closest to the goal.

    Uses only the heuristic (never path cost), prioritizing exploration speed.
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


# ---------------------------------------------------------------------------
# 4. Bidirectional Search (A* & Dijkstra)
# ---------------------------------------------------------------------------

def bidirectional_astar(
    start: Node,
    goal: Node,
    forward_neighbors: Neighbors[Node],
    backward_neighbors: Neighbors[Node] | None = None,
    forward_heuristic: Heuristic | None = None,
    backward_heuristic: Heuristic | None = None,
) -> tuple[list[Node], float] | None:
    """Bidirectional A* search between start and goal.

    Expands frontiers simultaneously forward from start and backward from goal.
    Reduces the search space from O(b^d) to O(b^(d/2)), making it one of the
    most efficient pathfinding methods for large transportation graphs.
    """
    if start == goal:
        return [start], 0.0

    backward_neighbors = backward_neighbors or forward_neighbors
    forward_heuristic = forward_heuristic or (lambda _: 0.0)
    backward_heuristic = backward_heuristic or (lambda _: 0.0)

    counter = 0
    f_frontier: list[tuple[float, float, int, Node]] = [
        (forward_heuristic(start), 0.0, counter, start)
    ]
    b_frontier: list[tuple[float, float, int, Node]] = [
        (backward_heuristic(goal), 0.0, counter, goal)
    ]

    f_cost: dict[Node, float] = {start: 0.0}
    b_cost: dict[Node, float] = {goal: 0.0}

    f_parent: dict[Node, Node | None] = {start: None}
    b_parent: dict[Node, Node | None] = {goal: None}

    best_mu = float("inf")
    meeting_node: Node | None = None

    while f_frontier and b_frontier:
        if f_frontier[0][0] + b_frontier[0][0] >= best_mu:
            break

        # Expand direction with smaller minimum priority key
        if f_frontier[0][0] <= b_frontier[0][0]:
            _, cost_u, _, u = heapq.heappop(f_frontier)
            if cost_u > f_cost.get(u, float("inf")):
                continue
            for v, edge_cost in forward_neighbors(u):
                cand = cost_u + edge_cost
                if cand < f_cost.get(v, float("inf")):
                    f_cost[v] = cand
                    f_parent[v] = u
                    counter += 1
                    heapq.heappush(
                        f_frontier,
                        (cand + forward_heuristic(v), cand, counter, v),
                    )
                    if v in b_cost and cand + b_cost[v] < best_mu:
                        best_mu = cand + b_cost[v]
                        meeting_node = v
        else:
            _, cost_v, _, v = heapq.heappop(b_frontier)
            if cost_v > b_cost.get(v, float("inf")):
                continue
            for u, edge_cost in backward_neighbors(v):
                cand = cost_v + edge_cost
                if cand < b_cost.get(u, float("inf")):
                    b_cost[u] = cand
                    b_parent[u] = v
                    counter += 1
                    heapq.heappush(
                        b_frontier,
                        (cand + backward_heuristic(u), cand, counter, u),
                    )
                    if u in f_cost and f_cost[u] + cand < best_mu:
                        best_mu = f_cost[u] + cand
                        meeting_node = u

    if meeting_node is None:
        return None

    # Reconstruct path from start -> meeting_node -> goal
    forward_path: list[Node] = []
    curr: Node | None = meeting_node
    while curr is not None:
        forward_path.append(curr)
        curr = f_parent.get(curr)
    forward_path.reverse()

    curr = b_parent.get(meeting_node)
    while curr is not None:
        forward_path.append(curr)
        curr = b_parent.get(curr)

    return forward_path, best_mu


def bidirectional_ucs(
    start: Node,
    goal: Node,
    forward_neighbors: Neighbors[Node],
    backward_neighbors: Neighbors[Node] | None = None,
) -> tuple[list[Node], float] | None:
    """Bidirectional Uniform-Cost / Dijkstra Search."""
    return bidirectional_astar(
        start=start,
        goal=goal,
        forward_neighbors=forward_neighbors,
        backward_neighbors=backward_neighbors,
        forward_heuristic=None,
        backward_heuristic=None,
    )


bidirectional_dijkstra = bidirectional_ucs


# ---------------------------------------------------------------------------
# 5. Local Search Algorithms (Hill Climbing)
# ---------------------------------------------------------------------------

def hill_climbing(
    start: Node,
    goal: Node,
    neighbors: Neighbors[Node],
    value: Heuristic,
    maximizing: bool = True,
) -> list[Node] | None:
    """Hill-climbing local search over a node ``value`` function."""
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


def hill_climbing_random_restart(
    start: Node,
    goal: Node,
    neighbors: Neighbors[Node],
    value: Heuristic,
    restarts: int = 5,
    maximizing: bool = True,
    seed: int | None = None,
) -> list[Node] | None:
    """Hill climbing with random restarts to escape local optima in route landscapes."""
    rng = random.Random(seed)
    best_path = hill_climbing(start, goal, neighbors, value, maximizing)
    if best_path is not None:
        return best_path

    for _ in range(restarts):
        current = start
        path: list[Node] = [start]
        seen: set[Node] = {start}
        while current != goal:
            candidates = [child for child, _ in neighbors(current) if child not in seen]
            if not candidates:
                break
            scored = [(value(c), c) for c in candidates]
            scored.sort(reverse=maximizing)
            chosen = scored[0][1]
            if len(scored) > 1 and rng.random() < 0.35:
                chosen = scored[1][1]

            if maximizing and value(chosen) <= value(current):
                break
            if not maximizing and value(chosen) >= value(current):
                break
            seen.add(chosen)
            current = chosen
            path.append(current)
            if current == goal:
                return path

    return None


# ---------------------------------------------------------------------------
# 6. Unified Search Dispatcher
# ---------------------------------------------------------------------------

def _compute_path_cost(path: list[Node], neighbors: Neighbors[Node]) -> float:
    total = 0.0
    for u, v in zip(path[:-1], path[1:], strict=True):
        edge_costs = [c for n, c in neighbors(u) if n == v]
        if edge_costs:
            total += min(edge_costs)
    return total


def find_path(
    start: Node,
    goal: Node,
    neighbors: Neighbors[Node],
    algorithm: str = "astar",
    heuristic: Heuristic | None = None,
    backward_neighbors: Neighbors[Node] | None = None,
    backward_heuristic: Heuristic | None = None,
    **kwargs,
) -> tuple[list[Node], float] | None:
    """Unified search entry point for AEGIS routing.

    Supported algorithms:
      - 'astar' (default): A* search with admissible heuristic
      - 'ucs' / 'dijkstra': Uniform-Cost Search / Dijkstra
      - 'bidirectional_astar': Bidirectional A* (dual frontier expansion)
      - 'bidirectional_ucs' / 'bidirectional_dijkstra': Bidirectional Dijkstra
      - 'ida_star': Iterative Deepening A* (O(d) space complexity)
      - 'bfs': Breadth-First Search (shortest hops)
      - 'dfs': Depth-First Search
      - 'iddfs': Iterative Deepening DFS
      - 'greedy': Greedy Best-First Search
      - 'hill_climbing': Hill Climbing Local Search
    """
    algo = algorithm.lower().replace("-", "_").strip()

    if algo in ("astar", "a_star", "a*"):
        return astar(start, goal, neighbors, heuristic)
    if algo in ("ucs", "dijkstra"):
        return ucs(start, goal, neighbors, heuristic=None)
    if algo in ("bidirectional_astar", "bi_astar", "bidirectional_a*"):
        return bidirectional_astar(
            start, goal, neighbors, backward_neighbors, heuristic, backward_heuristic
        )
    if algo in ("bidirectional_ucs", "bidirectional_dijkstra", "bi_ucs"):
        return bidirectional_ucs(start, goal, neighbors, backward_neighbors)
    if algo in ("ida_star", "ida*", "idastar"):
        return ida_star(start, goal, neighbors, heuristic)
    if algo == "bfs":
        p = bfs(start, goal, neighbors)
        return (p, _compute_path_cost(p, neighbors)) if p is not None else None
    if algo == "dfs":
        p = dfs(start, goal, neighbors)
        return (p, _compute_path_cost(p, neighbors)) if p is not None else None
    if algo == "iddfs":
        p = iddfs(start, goal, neighbors, max_depth=kwargs.get("max_depth", 50))
        return (p, _compute_path_cost(p, neighbors)) if p is not None else None
    if algo in ("greedy", "greedy_best_first"):
        h = heuristic or (lambda _: 0.0)
        p = greedy_best_first(start, goal, neighbors, h)
        return (p, _compute_path_cost(p, neighbors)) if p is not None else None
    if algo in ("hill_climbing", "hillclimbing"):
        val = kwargs.get("value") or heuristic or (lambda _: 0.0)
        p = hill_climbing(start, goal, neighbors, val, maximizing=kwargs.get("maximizing", False))
        return (p, _compute_path_cost(p, neighbors)) if p is not None else None

    # Fallback default
    return astar(start, goal, neighbors, heuristic)


# ---------------------------------------------------------------------------
# 7. Admissible Geodetic Heuristics (Haversine WGS-84)
# ---------------------------------------------------------------------------

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
