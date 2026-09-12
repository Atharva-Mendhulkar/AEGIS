"use client";
import { useState, useEffect, useRef } from "react";
import {
  MapPin,
  Navigation,
  Package,
  Truck,
  Weight,
  ArrowUpDown,
  Search,
  X,
  Compass,
  Sparkles,
  Building2,
  AlertTriangle,
  Fuel,
  Zap,
} from "lucide-react";
import type { Depot, TruckClass } from "../lib/api";
import { searchAddress, type GeocodedLocation } from "../lib/geocoding";
import type { CustomLocation } from "../lib/dynamicGraph";
import { FUEL_META, type FuelType } from "../lib/constants";

interface Props {
  depots: Depot[];
  sourceLoc: CustomLocation | null;
  destLoc: CustomLocation | null;
  goodsType: string;
  truckClass: string;
  maxPayloadKg: number | undefined;
  gvwKg: number | undefined;
  truckClasses: TruckClass[];
  fuelType: FuelType;
  onSourceSelect: (loc: CustomLocation) => void;
  onDestSelect: (loc: CustomLocation) => void;
  onSwap: () => void;
  onGoodsChange: (type: string) => void;
  onTruckClassChange: (cls: string) => void;
  onMaxPayloadChange: (kg: number | undefined) => void;
  onGvwChange: (kg: number | undefined) => void;
  onFuelTypeChange: (fuel: FuelType) => void;
  onPresetSelect: (src: CustomLocation, dst: CustomLocation) => void;
}

export function SourceDestPicker({
  depots,
  sourceLoc,
  destLoc,
  goodsType,
  truckClass,
  maxPayloadKg,
  gvwKg,
  truckClasses,
  fuelType,
  onSourceSelect,
  onDestSelect,
  onSwap,
  onGoodsChange,
  onTruckClassChange,
  onMaxPayloadChange,
  onGvwChange,
  onFuelTypeChange,
  onPresetSelect,
}: Props) {
  // Source search state
  const [srcQuery, setSrcQuery] = useState(sourceLoc?.name || "");
  const [srcResults, setSrcResults] = useState<GeocodedLocation[]>([]);
  const [srcSearching, setSrcSearching] = useState(false);
  const [showSrcDropdown, setShowSrcDropdown] = useState(false);
  const srcTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const srcDropdownRef = useRef<HTMLDivElement>(null);

  // Dest search state
  const [destQuery, setDestQuery] = useState(destLoc?.name || "");
  const [destResults, setDestResults] = useState<GeocodedLocation[]>([]);
  const [destSearching, setDestSearching] = useState(false);
  const [showDestDropdown, setShowDestDropdown] = useState(false);
  const destTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const destDropdownRef = useRef<HTMLDivElement>(null);

  // Sync queries with prop changes
  useEffect(() => {
    if (sourceLoc) setSrcQuery(sourceLoc.name);
    else setSrcQuery("");
  }, [sourceLoc]);

  useEffect(() => {
    if (destLoc) setDestQuery(destLoc.name);
    else setDestQuery("");
  }, [destLoc]);

  // Handle source search change
  const handleSrcInputChange = (val: string) => {
    setSrcQuery(val);
    if (srcTimeoutRef.current) clearTimeout(srcTimeoutRef.current);

    if (val.trim().length < 2) {
      setSrcResults([]);
      setShowSrcDropdown(false);
      return;
    }

    setSrcSearching(true);
    srcTimeoutRef.current = setTimeout(async () => {
      const res = await searchAddress(val, depots);
      setSrcResults(res);
      setShowSrcDropdown(res.length > 0);
      setSrcSearching(false);
    }, 280);
  };

  // Handle dest search change
  const handleDestInputChange = (val: string) => {
    setDestQuery(val);
    if (destTimeoutRef.current) clearTimeout(destTimeoutRef.current);

    if (val.trim().length < 2) {
      setDestResults([]);
      setShowDestDropdown(false);
      return;
    }

    setDestSearching(true);
    destTimeoutRef.current = setTimeout(async () => {
      const res = await searchAddress(val, depots);
      setDestResults(res);
      setShowDestDropdown(res.length > 0);
      setDestSearching(false);
    }, 280);
  };

  // Close dropdowns on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        srcDropdownRef.current &&
        !srcDropdownRef.current.contains(event.target as Node)
      ) {
        setShowSrcDropdown(false);
      }
      if (
        destDropdownRef.current &&
        !destDropdownRef.current.contains(event.target as Node)
      ) {
        setShowDestDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectSourceGeocoded = (loc: GeocodedLocation) => {
    onSourceSelect({
      name: loc.name,
      latitude: loc.latitude,
      longitude: loc.longitude,
      displayName: loc.displayName,
      isCustom: true,
    });
    setSrcQuery(loc.name);
    setShowSrcDropdown(false);
  };

  const selectSourceDepot = (depotId: string) => {
    const d = depots.find((x) => x.id === depotId);
    if (d) {
      onSourceSelect({
        id: d.id,
        name: d.name,
        latitude: d.latitude,
        longitude: d.longitude,
        isCustom: false,
      });
      setSrcQuery(d.name);
      setShowSrcDropdown(false);
    }
  };

  const selectDestGeocoded = (loc: GeocodedLocation) => {
    onDestSelect({
      name: loc.name,
      latitude: loc.latitude,
      longitude: loc.longitude,
      displayName: loc.displayName,
      isCustom: true,
    });
    setDestQuery(loc.name);
    setShowDestDropdown(false);
  };

  const selectDestDepot = (depotId: string) => {
    const d = depots.find((x) => x.id === depotId);
    if (d) {
      onDestSelect({
        id: d.id,
        name: d.name,
        latitude: d.latitude,
        longitude: d.longitude,
        isCustom: false,
      });
      setDestQuery(d.name);
      setShowDestDropdown(false);
    }
  };

  return (
    <div className="card">
      <div className="card-header">
        <h2>
          <Navigation size={15} style={{ color: "#2563eb" }} />
          Route Configuration
        </h2>
        <span
          style={{
            fontSize: "0.68rem",
            color: "#2563eb",
            background: "rgba(37, 99, 235, 0.08)",
            padding: "2px 8px",
            borderRadius: 9999,
            fontWeight: 600,
          }}
        >
          OSM Dynamic Graph
        </span>
      </div>

      {/* Quick Presets Bar */}
      <div style={{ marginBottom: 14 }}>
        <div
          style={{
            fontSize: "0.7rem",
            fontWeight: 600,
            color: "var(--text-secondary)",
            marginBottom: 6,
            display: "flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          <Sparkles size={11} style={{ color: "#2563eb" }} />
          Quick Test Corridors
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button
            className="search-action-btn"
            onClick={() => {
              const d1 = depots.find((d) => d.id === "delhi")!;
              const d2 = depots.find((d) => d.id === "chennai")!;
              onPresetSelect(d1, d2);
            }}
          >
            Delhi → Chennai
          </button>
          <button
            className="search-action-btn"
            onClick={() => {
              onPresetSelect(
                { name: "Gurugram, Haryana", latitude: 28.4595, longitude: 77.0266, isCustom: true },
                { name: "Kochi, Kerala", latitude: 9.9312, longitude: 76.2673, isCustom: true }
              );
            }}
          >
            Gurugram → Kochi (Custom)
          </button>
          <button
            className="search-action-btn"
            onClick={() => {
              const d1 = depots.find((d) => d.id === "mumbai")!;
              const d2 = depots.find((d) => d.id === "kolkata")!;
              onPresetSelect(d1, d2);
            }}
          >
            Mumbai → Kolkata
          </button>
          <button
            className="search-action-btn"
            onClick={() => {
              onPresetSelect(
                { name: "Noida, UP", latitude: 28.5355, longitude: 77.3910, isCustom: true },
                depots.find((d) => d.id === "bangalore")!
              );
            }}
          >
            Noida → Bangalore
          </button>
        </div>
      </div>

      {/* Source Address Search Input */}
      <div className="form-group" style={{ position: "relative" }} ref={srcDropdownRef}>
        <label className="form-label" style={{ display: "flex", justifyContent: "space-between" }}>
          <span>
            <MapPin size={11} style={{ color: "#2563eb" }} /> Origin / Source Address
          </span>
          {sourceLoc?.isCustom && (
            <span className="badge badge-accent" style={{ fontSize: "0.62rem" }}>
              Custom Node
            </span>
          )}
        </label>
        <div style={{ position: "relative" }}>
          <input
            type="text"
            className="form-input"
            placeholder="Type any address, city, or pin code (e.g. Gurugram)..."
            value={srcQuery}
            onChange={(e) => handleSrcInputChange(e.target.value)}
            onFocus={() => {
              if (srcResults.length > 0) setShowSrcDropdown(true);
            }}
            style={{ paddingRight: srcQuery ? 50 : 28 }}
          />
          {srcSearching && (
            <span
              className="spinner"
              style={{
                position: "absolute",
                right: srcQuery ? 28 : 10,
                top: "50%",
                transform: "translateY(-50%)",
                width: 12,
                height: 12,
              }}
            />
          )}
          {srcQuery && (
            <button
              onClick={() => {
                setSrcQuery("");
                setSrcResults([]);
                setShowSrcDropdown(false);
              }}
              style={{
                position: "absolute",
                right: 8,
                top: "50%",
                transform: "translateY(-50%)",
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "var(--text-muted)",
              }}
            >
              <X size={13} />
            </button>
          )}
        </div>

        {/* Source Dropdown Suggestions */}
        {showSrcDropdown && (
          <div className="search-dropdown-menu">
            <div style={{ padding: "4px 8px", fontSize: "0.68rem", fontWeight: 700, color: "#64748b" }}>
              NATIONAL BACKBONE HUBS
            </div>
            {depots.slice(0, 4).map((d) => (
              <div
                key={d.id}
                className="search-result-item"
                onClick={() => selectSourceDepot(d.id)}
              >
                <div className="search-result-title">
                  <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <Building2 size={11} style={{ color: "#2563eb" }} /> {d.name}
                  </span>
                  <span style={{ fontSize: "0.65rem", color: "#64748b" }}>Core Hub</span>
                </div>
              </div>
            ))}

            {srcResults.length > 0 && (
              <>
                <div style={{ padding: "6px 8px 4px", fontSize: "0.68rem", fontWeight: 700, color: "#64748b", borderTop: "1px solid #f1f5f9" }}>
                  OPENSTREETMAP RESULTS
                </div>
                {srcResults.map((loc) => (
                  <div
                    key={loc.placeId}
                    className="search-result-item"
                    onClick={() => selectSourceGeocoded(loc)}
                  >
                    <div className="search-result-title">
                      <span>{loc.name}</span>
                      {loc.nearestDepot && (
                        <span className="badge badge-accent" style={{ fontSize: "0.62rem" }}>
                          Nearest: {loc.nearestDepot.depot.name} ({loc.nearestDepot.distanceKm} km)
                        </span>
                      )}
                    </div>
                    <div className="search-result-subtitle">{loc.displayName}</div>
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </div>

      {/* Fast Swap Button */}
      <div style={{ display: "flex", justifyContent: "center", margin: "-6px 0 4px" }}>
        <button
          onClick={onSwap}
          className="search-action-btn"
          style={{ borderRadius: 9999, padding: "4px 12px", gap: 6 }}
          title="Swap Source and Destination"
        >
          <ArrowUpDown size={12} style={{ color: "#2563eb" }} /> Swap Origin &amp; Destination
        </button>
      </div>

      {/* Destination Address Search Input */}
      <div className="form-group" style={{ position: "relative" }} ref={destDropdownRef}>
        <label className="form-label" style={{ display: "flex", justifyContent: "space-between" }}>
          <span>
            <MapPin size={11} style={{ color: "#dc2626" }} /> Destination Address
          </span>
          {destLoc?.isCustom && (
            <span className="badge badge-danger" style={{ fontSize: "0.62rem" }}>
              Custom Node
            </span>
          )}
        </label>
        <div style={{ position: "relative" }}>
          <input
            type="text"
            className="form-input"
            placeholder="Type any address, city, or pin code (e.g. Kochi)..."
            value={destQuery}
            onChange={(e) => handleDestInputChange(e.target.value)}
            onFocus={() => {
              if (destResults.length > 0) setShowDestDropdown(true);
            }}
            style={{ paddingRight: destQuery ? 50 : 28 }}
          />
          {destSearching && (
            <span
              className="spinner"
              style={{
                position: "absolute",
                right: destQuery ? 28 : 10,
                top: "50%",
                transform: "translateY(-50%)",
                width: 12,
                height: 12,
              }}
            />
          )}
          {destQuery && (
            <button
              onClick={() => {
                setDestQuery("");
                setDestResults([]);
                setShowDestDropdown(false);
              }}
              style={{
                position: "absolute",
                right: 8,
                top: "50%",
                transform: "translateY(-50%)",
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "var(--text-muted)",
              }}
            >
              <X size={13} />
            </button>
          )}
        </div>

        {/* Destination Dropdown Suggestions */}
        {showDestDropdown && (
          <div className="search-dropdown-menu">
            <div style={{ padding: "4px 8px", fontSize: "0.68rem", fontWeight: 700, color: "#64748b" }}>
              NATIONAL BACKBONE HUBS
            </div>
            {depots.slice(0, 4).map((d) => (
              <div
                key={d.id}
                className="search-result-item"
                onClick={() => selectDestDepot(d.id)}
              >
                <div className="search-result-title">
                  <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <Building2 size={11} style={{ color: "#dc2626" }} /> {d.name}
                  </span>
                  <span style={{ fontSize: "0.65rem", color: "#64748b" }}>Core Hub</span>
                </div>
              </div>
            ))}

            {destResults.length > 0 && (
              <>
                <div style={{ padding: "6px 8px 4px", fontSize: "0.68rem", fontWeight: 700, color: "#64748b", borderTop: "1px solid #f1f5f9" }}>
                  OPENSTREETMAP RESULTS
                </div>
                {destResults.map((loc) => (
                  <div
                    key={loc.placeId}
                    className="search-result-item"
                    onClick={() => selectDestGeocoded(loc)}
                  >
                    <div className="search-result-title">
                      <span>{loc.name}</span>
                      {loc.nearestDepot && (
                        <span className="badge badge-accent" style={{ fontSize: "0.62rem" }}>
                          Nearest: {loc.nearestDepot.depot.name} ({loc.nearestDepot.distanceKm} km)
                        </span>
                      )}
                    </div>
                    <div className="search-result-subtitle">{loc.displayName}</div>
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </div>

      {/* Goods Type Selection */}
      <div className="form-group">
        <label className="form-label">
          <Package size={11} /> Goods Classification
        </label>
        <select
          className="form-select"
          value={goodsType}
          onChange={(e) => onGoodsChange(e.target.value)}
        >
          <option value="general">General Commercial Cargo</option>
          <option value="perishable">Cold-Chain / Perishable Foods</option>
          <option value="hazardous">Hazardous / Chemical Materials</option>
          <option value="fragile">High-Value / Fragile Electronics</option>
        </select>
      </div>

      {/* ── Indian Truck Specification ───────────────────────────────── */}
      <div className="form-group">
        <label className="form-label">
          <Truck size={11} style={{ color: "#2563eb" }} /> Truck Class
          <span
            style={{
              marginLeft: 6,
              fontSize: "0.65rem",
              background: "rgba(37,99,235,0.08)",
              color: "#2563eb",
              padding: "1px 6px",
              borderRadius: 9999,
              fontWeight: 600,
            }}
          >
            MoRTH / CMVR 1989
          </span>
        </label>
        <select
          className="form-select"
          value={truckClass}
          onChange={(e) => onTruckClassChange(e.target.value)}
        >
          {truckClasses.length > 0 ? (
            truckClasses.map((tc) => (
              <option key={tc.key} value={tc.key}>
                {tc.label}
              </option>
            ))
          ) : (
            <>
              <option value="lcv">LCV – Light Commercial Vehicle (≤7.5 T GVW)</option>
              <option value="icv">ICV – Intermediate Commercial Vehicle (≤12 T GVW)</option>
              <option value="mcv">MCV – Medium Commercial Vehicle (≤16.2 T GVW)</option>
              <option value="hcv">HCV – Heavy Commercial Vehicle (≤25 T GVW)</option>
              <option value="hcv_multi">HCV Multi-Axle (≤40.2 T GVW, national permit)</option>
              <option value="mhcv">MHCV / Over-Dimensional Cargo (&gt;40.2 T)</option>
            </>
          )}
        </select>
      </div>

      {/* ── Fuel / Propulsion Type (real Indian pricing) ──────────────── */}
      <div className="form-group">
        <label className="form-label">
          <Fuel size={11} style={{ color: "#16a34a" }} /> Fuel Type
          <span
            style={{
              marginLeft: 6,
              fontSize: "0.65rem",
              background: "rgba(22,163,74,0.08)",
              color: "#16a34a",
              padding: "1px 6px",
              borderRadius: 9999,
              fontWeight: 600,
            }}
          >
            {FUEL_META[fuelType].priceLabel}
          </span>
        </label>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
          {(Object.keys(FUEL_META) as FuelType[]).map((key) => {
            const meta = FUEL_META[key];
            const active = fuelType === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => onFuelTypeChange(key)}
                style={{
                  padding: "7px 4px",
                  borderRadius: 8,
                  border: `1px solid ${active ? meta.color : "var(--border)"}`,
                  background: active ? `${meta.color}14` : "transparent",
                  color: active ? meta.color : "var(--text-secondary)",
                  fontWeight: active ? 700 : 600,
                  fontSize: "0.72rem",
                  cursor: "pointer",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 2,
                  transition: "all 0.15s ease",
                }}
              >
                <span>{meta.label}</span>
                <span style={{ fontSize: "0.6rem", opacity: 0.8 }}>{meta.priceLabel}</span>
              </button>
            );
          })}
        </div>
        <div
          style={{
            fontSize: "0.68rem",
            color: "#64748b",
            marginTop: 4,
            display: "flex",
            alignItems: "flex-start",
            gap: 4,
          }}
        >
          {fuelType === "electric" ? (
            <>
              <Zap size={11} style={{ color: "#16a34a", flexShrink: 0, marginTop: 1 }} />
              <span>
                EV mode checks corridor charging stations (Tata Power / EESL / EVYATRA) and
                plans charging stops based on the truck&apos;s real range per charge.
              </span>
            </>
          ) : (
            <>
              <AlertTriangle size={11} style={{ color: "#f59e0b", flexShrink: 0, marginTop: 1 }} />
              <span>{FUEL_META[fuelType].note}. Rates updated monthly from IOCL metro pumps.</span>
            </>
          )}
        </div>
      </div>

      {/* Payload & GVW overrides */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">
            <Weight size={11} /> Max Payload (kg)
          </label>
          <input
            type="number"
            className="form-input"
            placeholder="Auto from class"
            min={1}
            value={maxPayloadKg ?? ""}
            onChange={(e) =>
              onMaxPayloadChange(e.target.value ? Number(e.target.value) : undefined)
            }
          />
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">
            <Weight size={11} /> GVW Limit (kg)
          </label>
          <input
            type="number"
            className="form-input"
            placeholder="Auto from class"
            min={1}
            value={gvwKg ?? ""}
            onChange={(e) =>
              onGvwChange(e.target.value ? Number(e.target.value) : undefined)
            }
          />
        </div>
      </div>

      <div
        style={{
          fontSize: "0.68rem",
          color: "#64748b",
          marginTop: 4,
          display: "flex",
          alignItems: "flex-start",
          gap: 4,
        }}
      >
        <AlertTriangle size={11} style={{ color: "#f59e0b", flexShrink: 0, marginTop: 1 }} />
        Override only if your permit differs from the class default.
        Cargo exceeding max payload will be rejected by the planner.
      </div>
    </div>
  );
}
