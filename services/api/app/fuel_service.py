"""
fuel_service.py — Real-life Indian freight fuel cost calculations.

Sources / rates used (September 2024 averages):
  Diesel (IOCL metro average) : ₹91.50 / litre
  Petrol                      : ₹96.72 / litre
  EV charging (EESL/Tata Power highway stations) : ₹9.00 / kWh

Truck mileage (laden, highway, source: SIAM / IRTSA field data):
  LCV      (≤7.5T GVW)        : 13 km/l
  ICV      (≤12T GVW)         : 9  km/l
  MCV      (≤16.2T GVW)       : 7  km/l
  HCV 2-ax (≤25T GVW)         : 4.5 km/l
  HCV multi(≤40.2T GVW)       : 3.5 km/l
  MHCV/ODC(>40.2T GVW)        : 2.5 km/l

EV truck range (fully laden, source: Tata/Eicher/Euler Motor datasheets):
  LCV  EV (Tata Ace EV / Euler HiLoad) : 140 km per charge
  ICV  EV (Tata Ultra T7)              : 200 km per charge
  HCV  EV (Tata Prima EV — pilot)      : 300 km per charge
  Default EV range                     : 150 km per charge

Driver wages (AITWA per-day scale, prorated per hour):
  ₹800 / day → ₹33.33 / hour

National highway toll (average per km, NHAI 2024 data):
  LCV : ₹1.00 / km
  MCV : ₹1.60 / km
  HCV : ₹2.00 / km
  MHCV: ₹2.80 / km

Real freight market rates (spot market, ₹ per tonne-km, LEADS/CRISIL 2024):
  LCV : ₹4.20 / tonne-km
  ICV : ₹3.50 / tonne-km
  MCV : ₹2.90 / tonne-km
  HCV : ₹2.20 / tonne-km
  HCV multi: ₹1.80 / tonne-km
  MHCV: ₹1.50 / tonne-km
"""

from __future__ import annotations

import math
from typing import Any

from pydantic import BaseModel

# ---------------------------------------------------------------------------
# Current fuel prices (₹ / unit) — update monthly from IOCL/BPCL website
# ---------------------------------------------------------------------------
DIESEL_PRICE_PER_LITRE: float = 91.50   # IOCL Delhi pump price, Sep 2024
PETROL_PRICE_PER_LITRE: float = 96.72   # IOCL Delhi pump price, Sep 2024
EV_CHARGE_RATE_PER_KWH: float = 9.00    # EESL / Tata Power DC fast-charger

# ---------------------------------------------------------------------------
# Per-class data
# ---------------------------------------------------------------------------
_CLASS_DATA: dict[str, dict[str, Any]] = {
    "lcv": {
        "mileage_kmpl": 13.0,
        "ev_range_km": 140.0,
        "ev_kwh_per_100km": 28.0,   # Euler HiLoad / Tata Ace EV
        "toll_per_km": 1.00,
        "driver_cost_per_hr": 33.33,
        "freight_rate_per_tonne_km": 4.20,
    },
    "icv": {
        "mileage_kmpl": 9.0,
        "ev_range_km": 200.0,
        "ev_kwh_per_100km": 55.0,   # Tata Ultra T7 EV
        "toll_per_km": 1.30,
        "driver_cost_per_hr": 33.33,
        "freight_rate_per_tonne_km": 3.50,
    },
    "mcv": {
        "mileage_kmpl": 7.0,
        "ev_range_km": 150.0,
        "ev_kwh_per_100km": 72.0,
        "toll_per_km": 1.60,
        "driver_cost_per_hr": 33.33,
        "freight_rate_per_tonne_km": 2.90,
    },
    "hcv": {
        "mileage_kmpl": 4.5,
        "ev_range_km": 300.0,
        "ev_kwh_per_100km": 120.0,  # Tata Prima EV (pilot programme)
        "toll_per_km": 2.00,
        "driver_cost_per_hr": 33.33,
        "freight_rate_per_tonne_km": 2.20,
    },
    "hcv_multi": {
        "mileage_kmpl": 3.5,
        "ev_range_km": 250.0,
        "ev_kwh_per_100km": 150.0,
        "toll_per_km": 2.40,
        "driver_cost_per_hr": 33.33,
        "freight_rate_per_tonne_km": 1.80,
    },
    "mhcv": {
        "mileage_kmpl": 2.5,
        "ev_range_km": 200.0,
        "ev_kwh_per_100km": 190.0,
        "toll_per_km": 2.80,
        "driver_cost_per_hr": 33.33,
        "freight_rate_per_tonne_km": 1.50,
    },
}

# Known EV charging stations on Indian national highways
# (subset of EVYATRA / Tata Power / EESL station data, as of Sep 2024)
# Each station is tagged to the nearest depot node in AEGIS's graph.
EV_CHARGING_NODES: set[str] = {
    "delhi",       # Multiple stations: DMRC depots + Tata Power
    "mumbai",      # BEST + Tata Power + EESL
    "bangalore",   # BESCOM + Tata Power
    "hyderabad",   # TSREDCO highway stations
    "pune",        # Mahadiscom + Tata Power
    "ahmedabad",   # PGVCL stations
    "jaipur",      # Rajasthan EV mission hubs
    "chennai",     # TANGEDCO hubs
    "kolkata",     # WBSEDCL stations
    "lucknow",     # UPCL pilot stations
}

# ---------------------------------------------------------------------------
# State-wise economics — every Indian state sets its own fuel VAT (so pump
# prices differ), has different NH road quality (affects effective mileage)
# and levies tolls at different per-km rates.
# Sources: IOCL/BPCL state pump prices, MoRTH road-condition survey (IRI),
# NHAI toll notifications — indicative Sep 2024 values.
# ---------------------------------------------------------------------------

DEPOT_STATE: dict[str, str] = {
    "delhi": "delhi",
    "jaipur": "rajasthan",
    "lucknow": "uttar_pradesh",
    "ahmedabad": "gujarat",
    "mumbai": "maharashtra",
    "pune": "maharashtra",
    "bangalore": "karnataka",
    "hyderabad": "telangana",
    "chennai": "tamil_nadu",
    "kolkata": "west_bengal",
}

#: road_quality = multiplier on mileage (1.00 = ideal expressway tarmac);
#: toll_mult = multiplier on the national average per-km truck toll.
STATE_DATA: dict[str, dict[str, Any]] = {
    "delhi":        {"label": "Delhi (NCT)",     "diesel": 87.62, "petrol":  94.77, "ev":  8.50, "road_quality": 1.00, "toll_mult": 1.00},
    "rajasthan":    {"label": "Rajasthan",       "diesel": 91.16, "petrol":  98.24, "ev":  9.20, "road_quality": 0.92, "toll_mult": 1.05},
    "uttar_pradesh":{"label": "Uttar Pradesh",   "diesel": 87.86, "petrol":  94.56, "ev":  9.50, "road_quality": 0.88, "toll_mult": 1.10},
    "gujarat":      {"label": "Gujarat",         "diesel": 90.17, "petrol":  95.48, "ev":  8.90, "road_quality": 0.96, "toll_mult": 0.95},
    "maharashtra":  {"label": "Maharashtra",     "diesel": 92.30, "petrol":  97.80, "ev": 10.20, "road_quality": 0.94, "toll_mult": 1.15},
    "karnataka":    {"label": "Karnataka",       "diesel": 90.94, "petrol":  97.52, "ev":  9.00, "road_quality": 0.95, "toll_mult": 1.00},
    "telangana":    {"label": "Telangana",       "diesel": 96.90, "petrol": 107.20, "ev": 10.50, "road_quality": 0.93, "toll_mult": 1.10},
    "tamil_nadu":   {"label": "Tamil Nadu",      "diesel": 92.81, "petrol": 100.76, "ev":  9.80, "road_quality": 0.96, "toll_mult": 1.05},
    "west_bengal":  {"label": "West Bengal",     "diesel": 95.24, "petrol": 104.90, "ev": 10.00, "road_quality": 0.90, "toll_mult": 1.00},
}

#: Fallback for custom/feeder nodes outside the known depot set (national avg).
DEFAULT_STATE: dict[str, Any] = {
    "label": "En-route (national avg)",
    "diesel": 91.50, "petrol": 96.72, "ev": 9.00,
    "road_quality": 0.93, "toll_mult": 1.00,
}


def _state_for_depot(depot_id: str) -> dict[str, Any] | None:
    state_key = DEPOT_STATE.get(depot_id)
    return STATE_DATA.get(state_key) if state_key else None


# ---------------------------------------------------------------------------
# Data classes for the computed cost breakdown
# ---------------------------------------------------------------------------

class StateBreakdown(BaseModel):
    """Per-state slice of the route cost (distance split across states)."""
    state: str
    label: str
    distance_km: float = 0.0
    fuel_price_per_unit: float = 0.0
    road_quality: float = 1.0
    toll_multiplier: float = 1.0
    fuel_cost_inr: float = 0.0
    toll_cost_inr: float = 0.0


class FuelCostBreakdown(BaseModel):
    truck_class: str
    fuel_type: str                          # "diesel" | "petrol" | "electric"
    distance_km: float

    # Fuel / energy
    fuel_consumption: float = 0.0           # litres (diesel/petrol) or kWh (EV)
    fuel_unit: str = "litres"
    fuel_price_per_unit: float = 0.0
    fuel_cost_inr: float = 0.0

    # Ancillaries
    toll_cost_inr: float = 0.0
    driver_cost_inr: float = 0.0

    # Market freight rate (benchmark)
    market_freight_cost_inr: float = 0.0    # ₹ per tonne-km × weight × distance

    # EV charging stops (only for electric)
    ev_charging_stops: int = 0
    ev_charging_stop_nodes: list[str] = []
    ev_charging_cost_per_stop: float = 0.0  # ₹ per stop (fast-charger session)
    ev_total_charging_cost_inr: float = 0.0
    ev_range_km: float = 0.0                # per charge
    ev_charger_available: bool = True       # False if route has insufficient charging infra

    # Grand total (fuel + toll + driver + EV charging)
    total_operating_cost_inr: float = 0.0

    # Per-state economics along the route
    state_breakdown: list[StateBreakdown] = []


# ---------------------------------------------------------------------------
# Core computation
# ---------------------------------------------------------------------------

def _state_key_of(depot_id: str) -> str:
    return DEPOT_STATE.get(depot_id, "__feeder__")


def _leg_economics(leg: dict, fuel_type: str) -> tuple[float, float, float, dict[str, float]]:
    """Return (fuel_price, road_quality, toll_mult, state_weights) for one leg.

    A leg crossing two known states is blended 50/50; if only one endpoint maps
    to a known state, that state carries the whole leg; unknown / custom feeder
    endpoints fall back to national-average economics.
    """
    price_key = {"diesel": "diesel", "petrol": "petrol", "electric": "ev"}[fuel_type]
    s_o = _state_for_depot(leg["origin_id"])
    s_d = _state_for_depot(leg["destination_id"])
    if s_o is not None and s_d is not None:
        w_o, w_d = 0.5, 0.5
    elif s_o is not None:
        w_o, w_d = 1.0, 0.0
    elif s_d is not None:
        w_o, w_d = 0.0, 1.0
    else:
        w_o, w_d = 0.5, 0.5

    def blend(key: str) -> float:
        v_o = s_o[key] if s_o is not None else DEFAULT_STATE[key]
        v_d = s_d[key] if s_d is not None else DEFAULT_STATE[key]
        return w_o * v_o + w_d * v_d

    weights: dict[str, float] = {}
    if s_o is None and s_d is None:
        # Custom / feeder nodes outside the depot set — national-average bucket
        weights["__feeder__"] = 1.0
    else:
        if s_o is not None and w_o > 0:
            weights[_state_key_of(leg["origin_id"])] = w_o
        if s_d is not None and w_d > 0:
            key_d = _state_key_of(leg["destination_id"])
            weights[key_d] = weights.get(key_d, 0.0) + w_d
    return blend(price_key), blend("road_quality"), blend("toll_mult"), weights


def compute_fuel_cost(
    truck_class: str,
    fuel_type: str,
    legs: list[dict],
    cargo_weight_kg: float,
) -> FuelCostBreakdown:
    """
    Compute the full operating cost for a route — state-aware.

    Parameters
    ----------
    truck_class    : AEGIS truck class key (lcv, icv, mcv, hcv, hcv_multi, mhcv)
    fuel_type      : "diesel" | "petrol" | "electric"
    legs           : ordered route legs, each {distance_km, time_hours,
                     origin_id, destination_id}. Fuel VAT, road quality and
                     toll rates are resolved per leg from the states touched.
    cargo_weight_kg: shipment cargo weight
    """
    cls = _CLASS_DATA.get(truck_class, _CLASS_DATA["hcv"])
    distance_km = sum(leg["distance_km"] for leg in legs)
    time_hours = sum(leg["time_hours"] for leg in legs)
    node_sequence = [leg["origin_id"] for leg in legs] + (
        [legs[-1]["destination_id"]] if legs else []
    )
    cargo_tonnes = cargo_weight_kg / 1000.0

    bd = FuelCostBreakdown(
        truck_class=truck_class,
        fuel_type=fuel_type,
        distance_km=distance_km,
    )

    price_sum = 0.0  # distance-weighted unit price accumulator
    price_key = {"diesel": "diesel", "petrol": "petrol", "electric": "ev"}[fuel_type]
    state_acc: dict[str, dict[str, float]] = {}

    def _acc(key: str, price: float, road: float, toll_m: float) -> dict[str, float]:
        if key not in state_acc:
            state = STATE_DATA.get(key, DEFAULT_STATE)
            state_acc[key] = {
                "label": state["label"],
                "distance_km": 0.0,
                "fuel_price_per_unit": price,
                "road_quality": road,
                "toll_multiplier": toll_m,
                "fuel_cost_inr": 0.0,
                "toll_cost_inr": 0.0,
            }
        return state_acc[key]

    # ── Per-leg state-aware fuel & toll ──────────────────────────────────
    for leg in legs:
        dist = leg["distance_km"]
        price, road_q, toll_mult, weights = _leg_economics(leg, fuel_type)
        if fuel_type == "electric":
            # EV consumption is largely insensitive to tarmac quality (regen
            # braking recovers energy); the charging tariff is state-set.
            leg_consumption = (dist / 100.0) * cls["ev_kwh_per_100km"]
            leg_fuel = leg_consumption * price
        else:
            # Poor roads = lower effective mileage (vibration, idling, gradients)
            effective_mileage = cls["mileage_kmpl"] * road_q
            leg_consumption = dist / effective_mileage
            leg_fuel = leg_consumption * price
        leg_toll = dist * cls["toll_per_km"] * toll_mult

        bd.fuel_consumption += leg_consumption
        bd.fuel_cost_inr += leg_fuel
        bd.toll_cost_inr += leg_toll
        price_sum += price * dist

        for key, share in weights.items():
            # Each state's row carries ITS OWN pump price / road quality /
            # toll multiplier — not the leg-blended values.
            st = STATE_DATA.get(key, DEFAULT_STATE)
            slot = _acc(key, st[price_key], st["road_quality"], st["toll_mult"])
            slot["distance_km"] += dist * share
            slot["fuel_cost_inr"] += leg_fuel * share
            slot["toll_cost_inr"] += leg_toll * share

    bd.fuel_unit = "kWh" if fuel_type == "electric" else "litres"
    bd.fuel_price_per_unit = round(price_sum / distance_km, 2) if distance_km else 0.0

    # ── EV charging stops (electric only) ────────────────────────────────
    if fuel_type == "electric":
        ev_range = cls["ev_range_km"]
        bd.ev_range_km = ev_range
        # Intermediate charges (start with a full battery; arrival may be empty)
        stops_needed = max(0, math.ceil(distance_km / ev_range) - 1)
        bd.ev_charging_stops = stops_needed

        # Chargers only count at intermediate stops: origin starts full and
        # the destination needs none (final leg may end on an empty battery).
        charging_nodes = [n for n in node_sequence[1:-1] if n in EV_CHARGING_NODES]
        bd.ev_charging_stop_nodes = charging_nodes

        if stops_needed > 0 and len(charging_nodes) < stops_needed:
            bd.ev_charger_available = False

        # DC fast-charge session priced at the state tariffs of the stop nodes
        kwh_per_stop = min(cls["ev_kwh_per_100km"] * ev_range / 100.0, 150.0)
        if charging_nodes:
            avg_stop_rate = sum(
                _state_for_depot(n)["ev"] for n in charging_nodes
            ) / len(charging_nodes)
        else:
            avg_stop_rate = DEFAULT_STATE["ev"]
        charging_cost_per_stop = kwh_per_stop * avg_stop_rate
        bd.ev_charging_cost_per_stop = round(charging_cost_per_stop, 2)
        bd.ev_total_charging_cost_inr = round(stops_needed * charging_cost_per_stop, 2)

    # ── Driver wages ─────────────────────────────────────────────────────
    # Add 20% buffer for loading/unloading time
    effective_hours = time_hours * 1.2
    bd.driver_cost_inr = effective_hours * cls["driver_cost_per_hr"]

    # ── Market freight benchmark ─────────────────────────────────────────
    bd.market_freight_cost_inr = (
        cls["freight_rate_per_tonne_km"] * cargo_tonnes * distance_km
    )

    # ── Grand total ───────────────────────────────────────────────────────
    base = bd.fuel_cost_inr + bd.toll_cost_inr + bd.driver_cost_inr
    if fuel_type == "electric":
        base += bd.ev_total_charging_cost_inr
    bd.total_operating_cost_inr = base

    # ── State breakdown ───────────────────────────────────────────────────
    bd.state_breakdown = [
        StateBreakdown(
            state=key,
            label=acc["label"],
            distance_km=acc["distance_km"],
            fuel_price_per_unit=acc["fuel_price_per_unit"],
            road_quality=acc["road_quality"],
            toll_multiplier=acc["toll_multiplier"],
            fuel_cost_inr=acc["fuel_cost_inr"],
            toll_cost_inr=acc["toll_cost_inr"],
        )
        for key, acc in state_acc.items()
    ]

    return bd
