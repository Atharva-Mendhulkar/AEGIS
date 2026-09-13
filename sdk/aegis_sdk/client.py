from typing import Any

import httpx


class AEGISClient:
    """Synchronous one-to-one typed HTTP client for the AEGIS FastAPI service."""

    def __init__(self, base_url: str, api_key: str, timeout: float = 30) -> None:
        url = base_url.rstrip("/") + "/v1"
        self.client = httpx.Client(
            base_url=url,
            headers={"X-API-Key": api_key},
            timeout=timeout,
        )

    def load_graph(
        self, depots: list[dict[str, Any]], routes: list[dict[str, Any]]
    ) -> dict[str, Any]:
        return self.client.post(
            "/graph", json={"depots": depots, "routes": routes}
        ).raise_for_status().json()

    def load_shipments(
        self, shipments: list[dict[str, Any]]
    ) -> list[dict[str, Any]]:
        return self.client.post(
            "/shipments", json=shipments
        ).raise_for_status().json()

    def plan(
        self,
        shipment_id: str,
        truck_class: str = "hcv",
        fuel_type: str = "diesel",
    ) -> dict[str, Any]:
        return self.client.post(
            "/plan", json={
                "shipment_id": shipment_id,
                "truck_class": truck_class,
                "fuel_type": fuel_type,
            }
        ).raise_for_status().json()

    def disrupt(
        self, type: str, edge_id: str, severity: float, source: str = "manual"
    ) -> dict[str, Any]:
        return self.client.post(
            "/disrupt", json={
                "type": type,
                "edge_id": edge_id,
                "severity": severity,
                "source": source,
            }
        ).raise_for_status().json()

    def replan(self, plan_id: str) -> dict[str, Any]:
        return self.client.post(
            f"/plan/{plan_id}/replan"
        ).raise_for_status().json()
