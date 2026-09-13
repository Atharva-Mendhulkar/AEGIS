from __future__ import annotations

from aegis_core.domain.models import Disruption, GraphInput, Shipment
from pydantic import BaseModel, Field

from .fuel_service import StateBreakdown as StateFuelBreakdown

# ---------------------------------------------------------------------------
# Indian-standard truck classes (MoRTH / CMVR 1989 categories)
# ---------------------------------------------------------------------------
#   LCV  – Light Commercial Vehicle     ≤ 7,500 kg GVW
#   ICV  – Intermediate Commercial      ≤ 12,000 kg GVW
#   MCV  – Medium Commercial            ≤ 16,200 kg GVW
#   HCV  – Heavy Commercial             ≤ 49,000 kg GVW  (6‑axle, national permit)
#   MHCV – Multi-axle / Over-Dimensional  > 49,000 kg GVW  (requires special permit)

TRUCK_CLASSES: dict[str, dict] = {
    "lcv": {
        "label": "LCV – Light Commercial Vehicle (≤7.5 T GVW)",
        "max_payload_kg": 3_500,
        "max_gvw_kg": 7_500,
    },
    "icv": {
        "label": "ICV – Intermediate Commercial Vehicle (≤12 T GVW)",
        "max_payload_kg": 7_000,
        "max_gvw_kg": 12_000,
    },
    "mcv": {
        "label": "MCV – Medium Commercial Vehicle (≤16.2 T GVW)",
        "max_payload_kg": 10_000,
        "max_gvw_kg": 16_200,
    },
    "hcv": {
        "label": "HCV – Heavy Commercial Vehicle (≤25 T GVW, 2‑axle)",
        "max_payload_kg": 16_200,
        "max_gvw_kg": 25_000,
    },
    "hcv_multi": {
        "label": "HCV Multi-Axle (≤40.2 T GVW, national permit)",
        "max_payload_kg": 25_000,
        "max_gvw_kg": 40_200,
    },
    "mhcv": {
        "label": "MHCV / Over-Dimensional Cargo (>40.2 T, special permit)",
        "max_payload_kg": 40_000,
        "max_gvw_kg": 55_000,
    },
}


# ---------------------------------------------------------------------------
# Request / Response models
# ---------------------------------------------------------------------------

class PlanRequest(BaseModel):
    shipment_id: str

    # Truck specification (Indian standards)
    truck_class: str = Field(
        default="hcv",
        description="Indian truck class key: lcv | icv | mcv | hcv | hcv_multi | mhcv",
    )
    # Optional overrides – when provided they take precedence over the class defaults
    max_payload_kg: int | None = Field(
        default=None,
        gt=0,
        description="Maximum payload the truck can carry (kg). Overrides truck_class default.",
    )
    gross_vehicle_weight_kg: int | None = Field(
        default=None,
        gt=0,
        description=(
            "Gross Vehicle Weight limit as per RC / permit (kg). "
            "Overrides truck_class default."
        ),
    )

    # Fuel / propulsion type
    fuel_type: str = Field(
        default="diesel",
        description="Propulsion type: diesel | petrol | electric",
    )


class AegisTraceRequest(BaseModel):
    """Scenario for the AEGIS planning pipeline visualiser — no stored
    shipment needed; the planner is traced directly on this corridor."""
    origin_id: str
    destination_id: str
    goods_type: str = "general"
    weight_kg: float = Field(default=1000, gt=0)
    disruptions: list[Disruption] = Field(default_factory=list)


class DisruptionInfo(BaseModel):
    """Potential risk associated with a route segment."""
    id: str
    type: str
    edge_id: str
    severity: float = Field(ge=0, le=1)
    severity_label: str   # "Low" | "Medium" | "High" | "Critical"
    description: str


class PlanResponse(BaseModel):
    """Extended plan with truck-aware capacity info, fuel costs, risks, best-route flag."""
    id: str
    shipment_id: str
    route_ids: list[str]
    total_cost: float
    expected_regret: float
    status: str

    # Truck / capacity metadata
    truck_class: str
    max_payload_kg: int
    gross_vehicle_weight_kg: int
    cargo_weight_kg: float
    capacity_utilisation_pct: float

    # Fuel / operating cost breakdown
    fuel_type: str = "diesel"
    fuel_cost_inr: float = 0.0
    fuel_consumption: float = 0.0
    fuel_unit: str = "litres"
    fuel_price_per_unit: float = 0.0
    toll_cost_inr: float = 0.0
    driver_cost_inr: float = 0.0
    total_operating_cost_inr: float = 0.0
    market_freight_cost_inr: float = 0.0
    distance_km: float = 0.0

    # EV-specific fields
    ev_charging_stops: int = 0
    ev_charging_stop_nodes: list[str] = Field(default_factory=list)
    ev_charger_available: bool = True
    ev_range_km: float = 0.0

    # State-wise economics (fuel VAT / road quality / tolls differ by state)
    state_breakdown: list[StateFuelBreakdown] = Field(default_factory=list)

    # Risk intelligence
    potential_risks: list[DisruptionInfo] = Field(default_factory=list)
    risk_score: float = 0.0

    # Recommendation
    is_best: bool = False
    recommendation: str = ""


__all__ = [
    "AegisTraceRequest",
    "DisruptionInfo",
    "Disruption",
    "GraphInput",
    "PlanRequest",
    "PlanResponse",
    "Shipment",
    "StateFuelBreakdown",
    "TRUCK_CLASSES",
]
