from __future__ import annotations

from collections.abc import Callable
from typing import Any, TypeVar

State = TypeVar("State")
Action = TypeVar("Action")


def minimax(
    state: State,
    depth: int,
    is_maximizing: bool,
    get_actions: Callable[[State], list[Action]],
    apply_action: Callable[[State, Action], State],
    evaluate: Callable[[State], float],
    is_terminal: Callable[[State], bool] | None = None,
) -> tuple[float, Action | None]:
    """Classic Minimax game search without pruning.

    Returns ``(best_evaluation, best_action)``.
    """
    if depth == 0 or (is_terminal is not None and is_terminal(state)):
        return evaluate(state), None

    actions = get_actions(state)
    if not actions:
        return evaluate(state), None

    best_action: Action | None = None

    if is_maximizing:
        max_eval = float("-inf")
        for action in actions:
            next_state = apply_action(state, action)
            val, _ = minimax(
                next_state,
                depth - 1,
                False,
                get_actions,
                apply_action,
                evaluate,
                is_terminal,
            )
            if val > max_eval:
                max_eval = val
                best_action = action
        return max_eval, best_action
    else:
        min_eval = float("inf")
        for action in actions:
            next_state = apply_action(state, action)
            val, _ = minimax(
                next_state,
                depth - 1,
                True,
                get_actions,
                apply_action,
                evaluate,
                is_terminal,
            )
            if val < min_eval:
                min_eval = val
                best_action = action
        return min_eval, best_action


def alpha_beta(
    state: State,
    depth: int,
    alpha: float,
    beta: float,
    is_maximizing: bool,
    get_actions: Callable[[State], list[Action]],
    apply_action: Callable[[State, Action], State],
    evaluate: Callable[[State], float],
    is_terminal: Callable[[State], bool] | None = None,
) -> tuple[float, Action | None]:
    """Minimax search with Alpha-Beta pruning.

    Prunes subtrees where alpha >= beta, cutting computational complexity
    from O(b^d) down to O(b^(d/2)) with optimal move ordering.
    """
    if depth == 0 or (is_terminal is not None and is_terminal(state)):
        return evaluate(state), None

    actions = get_actions(state)
    if not actions:
        return evaluate(state), None

    best_action: Action | None = actions[0] if actions else None

    if is_maximizing:
        max_eval = float("-inf")
        for action in actions:
            next_state = apply_action(state, action)
            val, _ = alpha_beta(
                next_state,
                depth - 1,
                alpha,
                beta,
                False,
                get_actions,
                apply_action,
                evaluate,
                is_terminal,
            )
            if val > max_eval:
                max_eval = val
                best_action = action
            alpha = max(alpha, val)
            if beta <= alpha:
                break  # Beta cutoff
        return max_eval, best_action
    else:
        min_eval = float("inf")
        for action in actions:
            next_state = apply_action(state, action)
            val, _ = alpha_beta(
                next_state,
                depth - 1,
                alpha,
                beta,
                True,
                get_actions,
                apply_action,
                evaluate,
                is_terminal,
            )
            if val < min_eval:
                min_eval = val
                best_action = action
            beta = min(beta, val)
            if beta <= alpha:
                break  # Alpha cutoff
        return min_eval, best_action


def generate_adversarial_disruption(
    graph_routes: list[Any],
    baseline_route_ids: list[str],
    eval_plan_cost: Callable[[list[str]], float],
    severity_budget: int = 2,
    max_depth: int = 2,
) -> list[str]:
    """Synthesize the worst-case disruption set using Alpha-Beta search.

    The adversary (MAX) searches for the combination of edge closures
    (up to ``severity_budget``) that maximizes the planner's post-disruption cost.
    """
    candidate_edges = [rid for rid in baseline_route_ids if any(r.id == rid for r in graph_routes)]
    if not candidate_edges:
        candidate_edges = [r.id for r in graph_routes]

    # State: tuple of severed edge ids
    initial_state: tuple[str, ...] = ()

    def get_actions(state: tuple[str, ...]) -> list[str]:
        if len(state) >= severity_budget:
            return []
        return [e for e in candidate_edges if e not in state]

    def apply_action(state: tuple[str, ...], action: str) -> tuple[str, ...]:
        return state + (action,)

    def evaluate(state: tuple[str, ...]) -> float:
        # Higher cost means worse disruption for the planner
        return eval_plan_cost(list(state))

    _, best_action = alpha_beta(
        state=initial_state,
        depth=max_depth,
        alpha=float("-inf"),
        beta=float("inf"),
        is_maximizing=True,
        get_actions=get_actions,
        apply_action=apply_action,
        evaluate=evaluate,
    )

    if best_action:
        return [best_action]
    return []
