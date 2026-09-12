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
from dataclasses import dataclass, field
from typing import Any

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
# Data classes for the computed cost breakdown
# ---------------------------------------------------------------------------

@dataclass
class FuelCostBreakdown:
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
    ev_charging_stop_nodes: list[str] = field(default_factory=list)
    ev_charging_cost_per_stop: float = 0.0  # ₹ per stop (fast-charger session)
    ev_total_charging_cost_inr: float = 0.0
    ev_range_km: float = 0.0                # per charge
    ev_charger_available: bool = True       # False if route has insufficient charging infra

    # Grand total (fuel + toll + driver + EV charging)
    total_operating_cost_inr: float = 0.0

    def as_dict(self) -> dict:
        return {
            "truck_class": self.truck_class,
            "fuel_type": self.fuel_type,
            "distance_km": round(self.distance_km, 1),
            "fuel_consumption": round(self.fuel_consumption, 2),
            "fuel_unit": self.fuel_unit,
            "fuel_price_per_unit": self.fuel_price_per_unit,
            "fuel_cost_inr": round(self.fuel_cost_inr, 2),
            "toll_cost_inr": round(self.toll_cost_inr, 2),
            "driver_cost_inr": round(self.driver_cost_inr, 2),
            "market_freight_cost_inr": round(self.market_freight_cost_inr, 2),
            "ev_charging_stops": self.ev_charging_stops,
            "ev_charging_stop_nodes": self.ev_charging_stop_nodes,
            "ev_total_charging_cost_inr": round(self.ev_total_charging_cost_inr, 2),
            "ev_range_km": self.ev_range_km,
            "ev_charger_available": self.ev_charger_available,
            "total_operating_cost_inr": round(self.total_operating_cost_inr, 2),
        }


# ---------------------------------------------------------------------------
# Core computation
# ---------------------------------------------------------------------------

def compute_fuel_cost(
    truck_class: str,
    fuel_type: str,
    distance_km: float,
    time_hours: float,
    cargo_weight_kg: float,
    route_node_ids: list[str],
) -> FuelCostBreakdown:
    """
    Compute the full operating cost for a route segment.

    Parameters
    ----------
    truck_class    : AEGIS truck class key (lcv, icv, mcv, hcv, hcv_multi, mhcv)
    fuel_type      : "diesel" | "petrol" | "electric"
    distance_km    : total route distance in km (sum of all legs)
    time_hours     : total transit time in hours
    cargo_weight_kg: shipment cargo weight
    route_node_ids : list of depot IDs along the route (for EV charging lookup)
    """
    cls = _CLASS_DATA.get(truck_class, _CLASS_DATA["hcv"])
    bd = FuelCostBreakdown(
        truck_class=truck_class,
        fuel_type=fuel_type,
        distance_km=distance_km,
    )

    cargo_tonnes = cargo_weight_kg / 1000.0

    # ── Fuel / energy ────────────────────────────────────────────────────
    if fuel_type == "electric":
        kwh_per_100km = cls["ev_kwh_per_100km"]
        total_kwh = (distance_km / 100.0) * kwh_per_100km
        bd.fuel_consumption = total_kwh
        bd.fuel_unit = "kWh"
        bd.fuel_price_per_unit = EV_CHARGE_RATE_PER_KWH
        bd.fuel_cost_inr = total_kwh * EV_CHARGE_RATE_PER_KWH

        # EV charging stops needed
        ev_range = cls["ev_range_km"]
        bd.ev_range_km = ev_range
        # Number of intermediate charges (not counting start with full battery)
        stops_needed = max(0, math.ceil(distance_km / ev_range) - 1)
        bd.ev_charging_stops = stops_needed

        # Check which route nodes have chargers. Skip the origin — the truck
        # departs with a full battery — and the destination, which needs no
        # charger since the final leg may end on an empty battery.
        charging_nodes = [n for n in route_node_ids[1:-1] if n in EV_CHARGING_NODES]
        bd.ev_charging_stop_nodes = charging_nodes

        if stops_needed > 0 and len(charging_nodes) < stops_needed:
            bd.ev_charger_available = False

        # Each fast-charger session: ~60-80% of battery from DC fast charger
        # Assume 150 kWh per stop (full recharge equivalent on large trucks)
        # For small LCV: 30 kWh per stop
        kwh_per_stop = min(kwh_per_100km * ev_range / 100.0, 150.0)
        charging_cost_per_stop = kwh_per_stop * EV_CHARGE_RATE_PER_KWH
        bd.ev_charging_cost_per_stop = round(charging_cost_per_stop, 2)
        bd.ev_total_charging_cost_inr = round(stops_needed * charging_cost_per_stop, 2)

    elif fuel_type == "petrol":
        litres = distance_km / cls["mileage_kmpl"]
        bd.fuel_consumption = litres
        bd.fuel_unit = "litres"
        bd.fuel_price_per_unit = PETROL_PRICE_PER_LITRE
        bd.fuel_cost_inr = litres * PETROL_PRICE_PER_LITRE

    else:  # diesel (default)
        litres = distance_km / cls["mileage_kmpl"]
        bd.fuel_consumption = litres
        bd.fuel_unit = "litres"
        bd.fuel_price_per_unit = DIESEL_PRICE_PER_LITRE
        bd.fuel_cost_inr = litres * DIESEL_PRICE_PER_LITRE

    # ── Toll ─────────────────────────────────────────────────────────────
    bd.toll_cost_inr = distance_km * cls["toll_per_km"]

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

    return bd
