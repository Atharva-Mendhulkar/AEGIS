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
