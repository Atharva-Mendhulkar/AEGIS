from __future__ import annotations

import math

from aegis_core.algorithms.search import (
    astar,
    bfs,
    bidirectional_astar,
    bidirectional_ucs,
    dfs,
    find_path,
    great_circle_heuristic,
    greedy_best_first,
    hill_climbing,
    hill_climbing_random_restart,
    ida_star,
    iddfs,
    ucs,
)


def sample_neighbors(node: str) -> list[tuple[str, float]]:
    return {
        "A": [("B", 3.0), ("C", 8.0)],
        "B": [("A", 3.0), ("C", 3.0)],
        "C": [("B", 3.0), ("A", 8.0), ("D", 1.0)],
        "D": [("A", 20.0), ("C", 1.0)],
    }[node]


def test_bfs_finds_shortest_hop_path() -> None:
    assert bfs("A", "D", sample_neighbors) == ["A", "C", "D"]


def test_dfs_reaches_goal() -> None:
    path = dfs("A", "D", sample_neighbors)
    assert path is not None
    assert path[0] == "A" and path[-1] == "D"


def test_ucs_finds_lowest_cost() -> None:
    path, cost = ucs("A", "D", sample_neighbors)
    assert path == ["A", "B", "C", "D"]
    assert cost == 7.0


def test_astar_optimal_with_admissible_heuristic() -> None:
    # True cost-to-D remaining: A=7, B=4, C=1, D=0. Heuristic underestimates all -> admissible.
    heuristic = {"A": 5.0, "B": 3.0, "C": 1.0, "D": 0.0}.__getitem__
    path, cost = astar("A", "D", sample_neighbors, heuristic)
    assert path == ["A", "B", "C", "D"]
    assert cost == 7.0


def test_greedy_best_first_uses_heuristic_only() -> None:
    heuristic = {"A": 7.0, "B": 4.0, "C": 1.0, "D": 0.0}.__getitem__
    path = greedy_best_first("A", "D", sample_neighbors, heuristic)
    assert path == ["A", "C", "D"]


def test_hill_climbing_reaches_goal() -> None:
    value = {"A": 0.0, "B": 1.0, "C": 2.0, "D": 10.0}.__getitem__
    result = hill_climbing("A", "D", sample_neighbors, value, maximizing=True)
    assert result == ["A", "C", "D"]


def test_hill_climbing_stuck_at_local_optimum_returns_none() -> None:
    neighbors = {
        "A": [("B", 1.0), ("C", 1.0)],
        "B": [("E", 1.0)],
        "C": [("D", 1.0)],
        "D": [],
        "E": [],
    }

    def lookup(node: str) -> list[tuple[str, float]]:
        return neighbors[node]

    # B is a local peak; D is only reachable via C, whose value (3) < B's (100).
    value = {"A": 0.0, "B": 100.0, "C": 3.0, "D": 200.0, "E": 1.0}.__getitem__
    assert hill_climbing("A", "D", lookup, value, maximizing=True) is None


def test_great_circle_heuristic_goal_distance_is_zero() -> None:
    coords = {"A": (0.0, 0.0), "B": (0.0, 1.0)}
    h = great_circle_heuristic(coords, "B")
    assert h("B") == 0.0


def test_great_circle_heuristic_known_distance() -> None:
    # 1 degree of longitude at the equator ~= 111.195 km.
    coords = {"A": (0.0, 0.0), "B": (0.0, 1.0)}
    h = great_circle_heuristic(coords, "B")
    assert math.isclose(h("A"), 111.195, rel_tol=1e-3)


def test_bidirectional_astar_finds_optimal_path() -> None:
    forward_h = {"A": 5.0, "B": 3.0, "C": 1.0, "D": 0.0}.__getitem__
    backward_h = {"A": 0.0, "B": 3.0, "C": 5.0, "D": 7.0}.__getitem__
    res = bidirectional_astar(
        "A", "D", sample_neighbors, sample_neighbors, forward_h, backward_h
    )
    assert res is not None
    path, cost = res
    assert path == ["A", "B", "C", "D"]
    assert cost == 7.0


def test_bidirectional_ucs_finds_optimal_path() -> None:
    res = bidirectional_ucs("A", "D", sample_neighbors, sample_neighbors)
    assert res is not None
    path, cost = res
    assert path == ["A", "B", "C", "D"]
    assert cost == 7.0


def test_ida_star_finds_optimal_path() -> None:
    heuristic = {"A": 5.0, "B": 3.0, "C": 1.0, "D": 0.0}.__getitem__
    res = ida_star("A", "D", sample_neighbors, heuristic)
    assert res is not None
    path, cost = res
    assert path == ["A", "B", "C", "D"]
    assert cost == 7.0


def test_iddfs_finds_shortest_hop_path() -> None:
    path = iddfs("A", "D", sample_neighbors, max_depth=5)
    assert path == ["A", "C", "D"]


def test_hill_climbing_random_restart_finds_path() -> None:
    value = {"A": 0.0, "B": 1.0, "C": 2.0, "D": 10.0}.__getitem__
    path = hill_climbing_random_restart("A", "D", sample_neighbors, value, restarts=5, seed=42)
    assert path == ["A", "C", "D"]


def test_find_path_dispatcher_works_for_all_algorithms() -> None:
    h = {"A": 5.0, "B": 3.0, "C": 1.0, "D": 0.0}.__getitem__
    algos = [
        "astar", "ucs", "dijkstra", "bidirectional_astar",
        "bidirectional_ucs", "ida_star", "bfs"
    ]
    for algo in algos:
        res = find_path(
            "A", "D", sample_neighbors, algorithm=algo,
            heuristic=h, backward_neighbors=sample_neighbors
        )
        assert res is not None, f"Failed for {algo}"
        path, cost = res
        assert path[0] == "A" and path[-1] == "D"


