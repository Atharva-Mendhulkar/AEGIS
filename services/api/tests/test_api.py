from fastapi.testclient import TestClient

from services.api.app.main import app

client = TestClient(app)
headers = {"X-API-Key": "local-dev-key"}


def test_requires_key() -> None:
    # Without a valid X-API-Key the auth dependency rejects the request before body validation.
    assert client.post("/v1/graph", json={}).status_code == 401


def test_requires_key_blocks_wrong_key() -> None:
    bad = {"X-API-Key": "not-the-key"}
    assert client.post("/v1/graph", json={}, headers=bad).status_code == 401


def test_plan_flow() -> None:
    graph = {
        "depots": [
            {"id": "a", "name": "A", "latitude": 0, "longitude": 0},
            {"id": "b", "name": "B", "latitude": 1, "longitude": 1},
        ],
        "routes": [
            {"id": "ab", "origin_id": "a", "destination_id": "b", "cost": 4, "time_hours": 1}
        ],
    }
    assert client.post("/v1/graph", json=graph, headers=headers).status_code == 200
    shipment = {
        "id": "s1",
        "origin_id": "a",
        "destination_id": "b",
        "goods_type": "general",
        "weight_kg": 1,
    }
    assert client.post("/v1/shipments", json=[shipment], headers=headers).status_code == 200
    response = client.post("/v1/plan", json={"shipment_id": "s1"}, headers=headers)
    assert response.status_code == 200
    plans = response.json()
    assert isinstance(plans, list)
    assert any(plan["total_cost"] == 4 for plan in plans)


def test_pareto_returns_frontier() -> None:
    graph = {
        "depots": [
            {"id": "a", "name": "A", "latitude": 0, "longitude": 0},
            {"id": "b", "name": "B", "latitude": 1, "longitude": 1},
        ],
        "routes": [
            {"id": "ab", "origin_id": "a", "destination_id": "b", "cost": 4, "time_hours": 1}
        ],
    }
    assert client.post("/v1/graph", json=graph, headers=headers).status_code == 200
    shipment = {
        "id": "s1",
        "origin_id": "a",
        "destination_id": "b",
        "goods_type": "general",
        "weight_kg": 1,
    }
    assert client.post("/v1/shipments", json=[shipment], headers=headers).status_code == 200
    assert client.post("/v1/plan", json={"shipment_id": "s1"}, headers=headers).status_code == 200
    response = client.get("/v1/pareto", headers=headers)
    assert response.status_code == 200
    plans = response.json()
    assert isinstance(plans, list)
    assert len(plans) >= 1


def test_plan_with_inline_disruptions_and_clear() -> None:
    # 3-node triangle graph: a->b direct (cost 5), a->c->b detour (cost 3 + 3 = 6)
    graph = {
        "depots": [
            {"id": "a", "name": "A", "latitude": 0, "longitude": 0},
            {"id": "b", "name": "B", "latitude": 1, "longitude": 1},
            {"id": "c", "name": "C", "latitude": 0.5, "longitude": 0.5},
        ],
        "routes": [
            {"id": "ab", "origin_id": "a", "destination_id": "b", "cost": 5, "time_hours": 2, "risk_prior": 0.05},
            {"id": "ac", "origin_id": "a", "destination_id": "c", "cost": 3, "time_hours": 1, "risk_prior": 0.01},
            {"id": "cb", "origin_id": "c", "destination_id": "b", "cost": 3, "time_hours": 1, "risk_prior": 0.01},
        ],
    }
    assert client.post("/v1/graph", json=graph, headers=headers).status_code == 200
    shipment = {"id": "s_detour", "origin_id": "a", "destination_id": "b", "goods_type": "general", "weight_kg": 100}
    assert client.post("/v1/shipments", json=[shipment], headers=headers).status_code == 200

    # Without disruption: direct route ab is optimal (cost 5)
    res_base = client.post("/v1/plan", json={"shipment_id": "s_detour"}, headers=headers)
    assert res_base.status_code == 200
    base_plans = res_base.json()
    assert any("ab" in p["route_ids"] for p in base_plans)

    # With 100% disruption on ab: planner detours through a -> c -> b (cost 6)
    res_disrupt = client.post(
        "/v1/plan",
        json={
            "shipment_id": "s_detour",
            "disruptions": [{"type": "road_closure", "edge_id": "ab", "severity": 1.0}],
        },
        headers=headers,
    )
    assert res_disrupt.status_code == 200
    detour_plans = res_disrupt.json()
    assert all("ab" not in p["route_ids"] for p in detour_plans)
    assert any("ac" in p["route_ids"] and "cb" in p["route_ids"] for p in detour_plans)

    # Clear disruptions endpoint
    del_res = client.delete("/v1/disrupt", headers=headers)
    assert del_res.status_code == 200
    assert del_res.json() == {"status": "cleared"}
