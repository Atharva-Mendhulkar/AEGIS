"use client";
import { useEffect, useRef, useState } from "react";
import type { GraphInput, Plan, Disruption } from "../lib/api";
import { MAP_CONFIG, riskColor } from "../lib/constants";
import { Play, Pause, RotateCcw, Truck } from "lucide-react";

let L: typeof import("leaflet") | null = null;

function computeBearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const y = Math.sin(dLon) * Math.cos((lat2 * Math.PI) / 180);
  const x =
    Math.cos((lat1 * Math.PI) / 180) * Math.sin((lat2 * Math.PI) / 180) -
    Math.sin((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.cos(dLon);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

interface Props {
  graph: GraphInput;
  plans?: Plan[];
  baselinePlan?: Plan | null;
  replannedPlan?: Plan | null;
  source: string | null;
  destination: string | null;
  onSelectDepot?: (depotId: string) => void;
  searchedLocation?: { name: string; latitude: number; longitude: number } | null;
  height?: string | number;
  /** Risk-heatmap overlay: colour every corridor by effective risk. */
  riskHeatmap?: boolean;
  /** Active disruptions folded into the heatmap (Bayesian union). */
  disruptions?: Disruption[];
  /** Highlighted route leg ID from hover interaction */
  hoveredRouteId?: string | null;
  /** Callback when user hovers a route on the map */
  onHoverRoute?: (routeId: string | null) => void;
  /** Selected plan index for multi-plan Pareto options */
  selectedPlanIndex?: number;
  /** Callback to switch plan directly from map */
  onSelectPlanIndex?: (index: number) => void;
}

export function MapView({
  graph,
  plans = [],
  baselinePlan = null,
  replannedPlan = null,
  source,
  destination,
  onSelectDepot,
  searchedLocation,
  height = "100%",
  riskHeatmap = false,
  disruptions = [],
  hoveredRouteId = null,
  onHoverRoute,
  selectedPlanIndex = 0,
  onSelectPlanIndex,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const linesRef = useRef<any[]>([]);
  const arrowsRef = useRef<any[]>([]);
  const simMarkerRef = useRef<any>(null);
  const searchedMarkerRef = useRef<any>(null);
  const [ready, setReady] = useState(false);
  const [simActive, setSimActive] = useState(false);
  const [simProgress, setSimProgress] = useState(0);
  const [simLegText, setSimLegText] = useState("");

  // Initialize map safely with StrictMode and fast-refresh protection
  useEffect(() => {
    let cancelled = false;
    const container = containerRef.current;
    if (!container) return;

    // Clean up any stale leaflet ID on container before init
    if ((container as any)._leaflet_id) {
      delete (container as any)._leaflet_id;
    }

    import("leaflet").then((leaflet) => {
      if (cancelled || !containerRef.current) return;
      L = leaflet;

      // In case an instance exists, remove it cleanly
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
      if ((containerRef.current as any)._leaflet_id) {
        delete (containerRef.current as any)._leaflet_id;
      }

      // Fix default marker icons
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
        iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
      });

      const map = L.map(containerRef.current, {
        center: MAP_CONFIG.center,
        zoom: MAP_CONFIG.zoom,
        minZoom: MAP_CONFIG.minZoom,
        maxZoom: MAP_CONFIG.maxZoom,
        zoomControl: false,
        attributionControl: false,
      });

      L.tileLayer(MAP_CONFIG.tileUrl, {
        attribution: MAP_CONFIG.tileAttribution,
      }).addTo(map);

      // Attribution bottom-right
      L.control.attribution({ position: "bottomright", prefix: false }).addTo(map);

      // Zoom control top-right
      L.control.zoom({ position: "topright" }).addTo(map);

      mapRef.current = map;
      setReady(true);
    });

    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
      if (container && (container as any)._leaflet_id) {
        delete (container as any)._leaflet_id;
      }
    };
  }, []);

  // Invalidate map size on container resize
  useEffect(() => {
    if (ready && mapRef.current) {
      setTimeout(() => {
        mapRef.current?.invalidateSize();
      }, 100);
    }
  }, [ready, height]);

  // Handle searched location fly-to and pin
  useEffect(() => {
    if (!ready || !mapRef.current || !L) return;
    const map = mapRef.current;

    if (searchedMarkerRef.current) {
      searchedMarkerRef.current.remove();
      searchedMarkerRef.current = null;
    }

    if (searchedLocation) {
      map.flyTo([searchedLocation.latitude, searchedLocation.longitude], 8, {
        duration: 1.2,
      });

      const beacon = L.circleMarker(
        [searchedLocation.latitude, searchedLocation.longitude],
        {
          radius: 9,
          fillColor: "#2563eb",
          fillOpacity: 1,
          color: "#ffffff",
          weight: 3,
        }
      ).addTo(map);

      beacon.bindPopup(
        `<div style="font-family: var(--font); padding: 4px;">
          <div style="font-weight: 700; font-size: 13px; color: #0f172a;">${searchedLocation.name}</div>
          <div style="font-size: 11px; color: #64748b; margin-top: 2px;">
            ${searchedLocation.latitude.toFixed(4)}°N, ${searchedLocation.longitude.toFixed(4)}°E
          </div>
          <div style="font-size: 10px; color: #2563eb; font-weight: 600; margin-top: 4px;">Searched Location (OSM)</div>
        </div>`,
        { closeButton: false }
      ).openPopup();

      searchedMarkerRef.current = beacon;
    }
  }, [ready, searchedLocation]);

  // Active plan derivation for visuals
  const activePlan =
    baselinePlan ||
    (plans.length > 0 ? plans[selectedPlanIndex ?? 0] || plans[0] : null);

  // Path coordinates for simulation transit playback
  const simPathCoords: { lat: number; lng: number; fromName: string; toName: string }[] = [];
  if (activePlan && activePlan.route_ids.length > 0) {
    for (let i = 0; i < activePlan.route_ids.length; i++) {
      const rid = activePlan.route_ids[i];
      const r = graph.routes.find((route) => route.id === rid);
      if (!r) continue;
      const orig = graph.depots.find((d) => d.id === r.origin_id);
      const dest = graph.depots.find((d) => d.id === r.destination_id);
      if (orig && dest) {
        if (simPathCoords.length === 0) {
          simPathCoords.push({ lat: orig.latitude, lng: orig.longitude, fromName: orig.name, toName: orig.name });
        }
        simPathCoords.push({ lat: dest.latitude, lng: dest.longitude, fromName: orig.name, toName: dest.name });
      }
    }
  }

  // Simulation transit animation loop
  useEffect(() => {
    if (!ready || !mapRef.current || !L || simPathCoords.length < 2) return;
    const map = mapRef.current;

    if (!simActive || !L) return;
    const leaflet = L;

    const totalLegs = simPathCoords.length - 1;
    const interval = setInterval(() => {
      setSimProgress((prev) => {
        const next = prev + 0.008;
        if (next >= 1) {
          setSimActive(false);
          setSimLegText(`Arrived in ${simPathCoords[simPathCoords.length - 1].toName}`);
          return 1;
        }

        const legIdx = Math.min(Math.floor(next * totalLegs), totalLegs - 1);
        const t = next * totalLegs - legIdx;
        const p1 = simPathCoords[legIdx];
        const p2 = simPathCoords[legIdx + 1];

        const curLat = (1 - t) * p1.lat + t * p2.lat;
        const curLng = (1 - t) * p1.lng + t * p2.lng;

        if (!simMarkerRef.current) {
          simMarkerRef.current = leaflet.marker([curLat, curLng], {
            icon: leaflet.divIcon({
              className: "sim-truck-marker",
              html: `<div style="
                background: #0f172a;
                color: #ffffff;
                border: 2px solid #3b82f6;
                border-radius: 9999px;
                width: 32px;
                height: 32px;
                display: flex;
                align-items: center;
                justify-content: center;
                box-shadow: 0 4px 14px rgba(37,99,235,0.45);
              "><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/></svg></div>`,
              iconSize: [32, 32],
              iconAnchor: [16, 16],
            }),
            zIndexOffset: 1000,
          }).addTo(map);
        } else {
          simMarkerRef.current.setLatLng([curLat, curLng]);
        }

        setSimLegText(`Leg ${legIdx + 1}/${totalLegs}: ${p2.fromName} → ${p2.toName}`);
        return next;
      });
    }, 45);

    return () => clearInterval(interval);
  }, [ready, simActive, simPathCoords]);

  // Clean up sim marker on reset
  useEffect(() => {
    if (simProgress === 0 && simMarkerRef.current) {
      simMarkerRef.current.remove();
      simMarkerRef.current = null;
    }
  }, [simProgress]);

  // Draw depots, corridors, waypoints, and flow markers
  useEffect(() => {
    if (!ready || !mapRef.current || !L) return;
    const map = mapRef.current;

    // Clear previous elements
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];
    linesRef.current.forEach((l) => l.remove());
    linesRef.current = [];
    arrowsRef.current.forEach((a) => a.remove());
    arrowsRef.current = [];

    const depotMap: Record<string, { lat: number; lng: number }> = {};
    const baselineIds = new Set(
      baselinePlan ? baselinePlan.route_ids : plans.flatMap((p) => p.route_ids)
    );
    const replannedIds = new Set(replannedPlan ? replannedPlan.route_ids : []);
    const hasReplanned = Boolean(replannedPlan && replannedPlan.route_ids.length > 0);
    const disruptedIds = new Set(disruptions.map((d) => d.edge_id));
    const activeRouteIdSet = new Set(activePlan ? activePlan.route_ids : []);

    // Build ordered sequence of visited depots on active route
    const orderedDepotIds: string[] = [];
    if (activePlan && activePlan.route_ids.length > 0) {
      for (let i = 0; i < activePlan.route_ids.length; i++) {
        const rid = activePlan.route_ids[i];
        const r = graph.routes.find((route) => route.id === rid);
        if (r) {
          if (i === 0) orderedDepotIds.push(r.origin_id);
          orderedDepotIds.push(r.destination_id);
        }
      }
    }
    const stopIndexMap = new Map<string, number>();
    orderedDepotIds.forEach((id, idx) => stopIndexMap.set(id, idx));

    // Identify alternative candidate routes for comparison
    const alternativeRouteIds = new Set<string>();
    for (let pIdx = 0; pIdx < plans.length; pIdx++) {
      if (pIdx === (selectedPlanIndex ?? 0)) continue;
      for (const rid of plans[pIdx].route_ids) {
        if (!activeRouteIdSet.has(rid)) {
          alternativeRouteIds.add(rid);
        }
      }
    }

    const effectiveRisk = (routeId: string, basePrior: number): number => {
      let survival = 1 - basePrior;
      for (const d of disruptions) {
        if (d.edge_id === routeId) survival *= 1 - d.severity;
      }
      return 1 - survival;
    };

    // 1. Draw routes
    for (const route of graph.routes) {
      const origin = graph.depots.find((d) => d.id === route.origin_id);
      const dest = graph.depots.find((d) => d.id === route.destination_id);
      if (!origin || !dest) continue;

      const inBaseline = baselineIds.has(route.id);
      const inReplanned = replannedIds.has(route.id);
      const inActiveRoute = activeRouteIdSet.has(route.id);
      const isAlternative = alternativeRouteIds.has(route.id);
      const isDisrupted = disruptedIds.has(route.id);
      const isHovered = hoveredRouteId === route.id;
      const effRisk = riskHeatmap ? effectiveRisk(route.id, route.risk_prior) : route.risk_prior;

      let color: string;
      let weight: number;
      let opacity: number;
      let dashArray: string | undefined;

      if (riskHeatmap) {
        color = riskColor(effRisk);
        weight = 2 + effRisk * 5;
        opacity = 0.55 + effRisk * 0.45;
        dashArray = isDisrupted ? "5 4" : undefined;
      } else if (hasReplanned) {
        if (inBaseline && isDisrupted) {
          color = "#dc2626";
          weight = isHovered ? 7 : 5;
          opacity = 0.95;
          dashArray = "6 4";
        } else if (inReplanned) {
          color = "#10b981";
          weight = isHovered ? 7 : 5;
          opacity = 1;
          dashArray = undefined;
        } else if (inBaseline) {
          color = "#2563eb";
          weight = isHovered ? 6 : 4;
          opacity = 0.75;
          dashArray = undefined;
        } else if (isDisrupted) {
          color = "#ea580c";
          weight = 3;
          opacity = 0.7;
          dashArray = "5 3";
        } else {
          color = "rgba(100, 116, 139, 0.3)";
          weight = 1.5;
          opacity = 0.45;
          dashArray = "6 4";
        }
      } else if (inActiveRoute) {
        color = isDisrupted
          ? "#dc2626"
          : route.risk_prior >= 0.2
          ? "#d97706"
          : isHovered
          ? "#1d4ed8"
          : "#2563eb";
        weight = isHovered ? 7 : 4.5;
        opacity = 1;
        dashArray = isDisrupted ? "8 4" : undefined;
      } else if (isAlternative) {
        color = "#64748b";
        weight = isHovered ? 4 : 2.5;
        opacity = 0.6;
        dashArray = "5 5";
      } else {
        color = isDisrupted
          ? "#ea580c"
          : route.risk_prior >= 0.2
          ? "rgba(220, 38, 38, 0.45)"
          : "rgba(100, 116, 139, 0.3)";
        weight = isDisrupted ? 3 : 1.5;
        opacity = isDisrupted ? 0.8 : 0.45;
        dashArray = "6 4";
      }

      // Heat glow underneath hot corridors or active route halo
      if (riskHeatmap && effRisk > 0.3) {
        const glow = L.polyline(
          [[origin.latitude, origin.longitude], [dest.latitude, dest.longitude]],
          {
            color: riskColor(effRisk),
            weight: weight + 8,
            opacity: 0.18,
            interactive: false,
          }
        ).addTo(map);
        linesRef.current.push(glow);
      } else if (inActiveRoute || inReplanned) {
        // Glowing halo for active route
        const glow = L.polyline(
          [[origin.latitude, origin.longitude], [dest.latitude, dest.longitude]],
          {
            color: isDisrupted ? "#dc2626" : hasReplanned && inReplanned ? "#10b981" : "#2563eb",
            weight: isHovered ? 14 : 9,
            opacity: isHovered ? 0.45 : 0.2,
            interactive: false,
          }
        ).addTo(map);
        linesRef.current.push(glow);

        // Directional flow arrow at midpoint
        const midLat = (origin.latitude + dest.latitude) / 2;
        const midLng = (origin.longitude + dest.longitude) / 2;
        const bearing = computeBearing(origin.latitude, origin.longitude, dest.latitude, dest.longitude);
        const arrow = L.marker([midLat, midLng], {
          icon: L.divIcon({
            className: "route-flow-arrow",
            html: `<div style="transform: rotate(${bearing}deg); color: ${
              isDisrupted ? "#dc2626" : hasReplanned && inReplanned ? "#10b981" : "#2563eb"
            }; font-size: 13px; font-weight: 900; line-height: 1; text-shadow: 0 0 3px #ffffff, 0 0 5px #ffffff;">▶</div>`,
            iconSize: [16, 16],
            iconAnchor: [8, 8],
          }),
          interactive: false,
        }).addTo(map);
        arrowsRef.current.push(arrow);
      }

      const line = L.polyline(
        [[origin.latitude, origin.longitude], [dest.latitude, dest.longitude]],
        {
          color,
          weight,
          opacity,
          dashArray,
        }
      ).addTo(map);

      // Tooltip on hover
      let tag = "";
      if (inBaseline && isDisrupted) tag = " [Baseline - Hit by Disruption]";
      else if (inReplanned) tag = " [Resilient Detour Route]";
      else if (inActiveRoute) tag = " [Active Chosen Route]";
      else if (isAlternative) tag = " [Alternative Candidate Route]";
      else if (isDisrupted) tag = " [Active Disruption]";

      const riskLabel = riskHeatmap
        ? `<strong>${route.id}</strong>${isDisrupted ? " [Disrupted]" : ""}<br/>Effective risk: <strong>${(effRisk * 100).toFixed(0)}%</strong>${isDisrupted ? " (disrupted)" : ""}<br/>Base: ₹${route.cost} · ${route.time_hours}h`
        : `<strong>${route.id}</strong>${tag}<br/>${origin.name} → ${dest.name}<br/>Cost: ₹${route.cost} · Risk: ${(route.risk_prior * 100).toFixed(0)}% · ${route.time_hours}h`;
      
      line.bindTooltip(riskLabel, {
        sticky: true,
        className: "route-tooltip",
      });

      // Hover events to sync with table/timeline
      line.on("mouseover", () => onHoverRoute?.(route.id));
      line.on("mouseout", () => onHoverRoute?.(null));

      // Click to select alternative plan if clicked
      if (isAlternative) {
        line.on("click", () => {
          const matchIdx = plans.findIndex((p) => p.route_ids.includes(route.id));
          if (matchIdx !== -1) onSelectPlanIndex?.(matchIdx);
        });
      }

      // Animated dash for active planned or detour routes
      if (inActiveRoute || inReplanned) {
        const el = line.getElement() as HTMLElement | undefined;
        el?.style.setProperty("stroke-dasharray", "12 6");
        el?.style.setProperty("animation", "dash-flow 1s linear infinite");
      }

      linesRef.current.push(line);
    }

    // 2. Draw depot markers and numbered waypoint badges
    for (const depot of graph.depots) {
      depotMap[depot.id] = { lat: depot.latitude, lng: depot.longitude };

      const isSource = depot.id === source;
      const isDest = depot.id === destination;
      const stopIdx = stopIndexMap.get(depot.id);
      const isVisitedOnActive = stopIdx !== undefined;
      const isEvStop = Boolean(activePlan?.ev_charging_stop_nodes?.includes(depot.id));

      if (isVisitedOnActive && orderedDepotIds.length > 0) {
        const isStart = stopIdx === 0;
        const isEnd = stopIdx === orderedDepotIds.length - 1;

        const badgeMarker = L.marker([depot.latitude, depot.longitude], {
          icon: L.divIcon({
            className: "depot-step-badge",
            html: `<div class="depot-badge-inner ${isStart ? "start" : isEnd ? "end" : "step"}">
              ${isStart ? "START" : isEnd ? "END" : `${stopIdx + 1}${isEvStop ? " (EV)" : ""}`}
            </div>`,
            iconSize: [isStart || isEnd ? 34 : 26, isStart || isEnd ? 34 : 26],
            iconAnchor: [isStart || isEnd ? 17 : 13, isStart || isEnd ? 17 : 13],
          }),
          zIndexOffset: isStart || isEnd ? 600 : 300,
        }).addTo(map);

        const hopLabel = isStart
          ? `${depot.name} (Origin · Start)`
          : isEnd
          ? `${depot.name} (Destination · End)`
          : `${depot.name} (Hop #${stopIdx}${isEvStop ? " · EV Charger" : ""})`;

        badgeMarker.bindTooltip(
          L.tooltip({
            permanent: true,
            direction: "top",
            offset: [0, -14],
            className: "depot-label",
          }).setContent(hopLabel)
        );

        badgeMarker.bindPopup(
          `<div style="font-family: var(--font); min-width: 140px; padding: 2px;">
            <div style="font-weight: 700; font-size: 14px; color: #0f172a; margin-bottom: 2px;">${depot.name}</div>
            <div style="font-size: 11px; color: #64748b;">
              ${depot.latitude.toFixed(4)}°N, ${depot.longitude.toFixed(4)}°E
            </div>
            <div style="margin-top: 6px; font-size: 11px; font-weight: 700; text-transform: uppercase; color: ${
              isStart ? '#2563eb' : isEnd ? '#dc2626' : '#10b981'
            };">
              ● ${isStart ? "Route Origin" : isEnd ? "Route Destination" : `Transit Stop #${stopIdx}`}
            </div>
            ${isEvStop ? `<div style="font-size: 11px; color: #16a34a; font-weight: 600; margin-top: 3px;">EV Fast Charger Available</div>` : ""}
          </div>`,
          { closeButton: false }
        );

        badgeMarker.on("click", () => onSelectDepot?.(depot.id));
        markersRef.current.push(badgeMarker);
      } else {
        // Standard circle marker for unselected / off-route hubs
        const marker = L.circleMarker([depot.latitude, depot.longitude], {
          radius: isSource || isDest ? 9 : 6,
          fillColor: isSource ? "#2563eb" : isDest ? "#dc2626" : "#ffffff",
          fillOpacity: isSource || isDest ? 1 : 0.85,
          color: isSource ? "#ffffff" : isDest ? "#ffffff" : "#64748b",
          weight: isSource || isDest ? 2.5 : 1.5,
          opacity: 1,
        }).addTo(map);

        marker.bindTooltip(
          L.tooltip({
            permanent: true,
            direction: "top",
            offset: [0, -8],
            className: "depot-label",
          }).setContent(depot.name)
        );

        marker.bindPopup(
          `<div style="font-family: var(--font); min-width: 140px; padding: 2px;">
            <div style="font-weight: 700; font-size: 14px; color: #0f172a; margin-bottom: 2px;">${depot.name}</div>
            <div style="font-size: 11px; color: #64748b;">
              ${depot.latitude.toFixed(4)}°N, ${depot.longitude.toFixed(4)}°E
            </div>
            <div style="margin-top: 6px; font-size: 11px; font-weight: 700; text-transform: uppercase; color: #64748b;">
              Click to select as endpoint
            </div>
          </div>`,
          { closeButton: false }
        );

        marker.on("click", () => onSelectDepot?.(depot.id));
        markersRef.current.push(marker);
      }
    }

    // 3. Zoom-to-fit: active planned routes (baseline and/or replanned), or network in heatmap
    const activePlans = [
      ...(baselinePlan ? [baselinePlan] : plans),
      ...(replannedPlan ? [replannedPlan] : []),
    ];
    if (activePlans.length > 0) {
      const planDepotIds = new Set<string>();
      for (const p of activePlans) {
        for (const rid of p.route_ids) {
          const route = graph.routes.find((r) => r.id === rid);
          if (route) {
            planDepotIds.add(route.origin_id);
            planDepotIds.add(route.destination_id);
          }
        }
      }
      const bounds = Array.from(planDepotIds)
        .map((id) => depotMap[id])
        .filter(Boolean)
        .map((p) => [p.lat, p.lng] as [number, number]);
      if (bounds.length > 1) {
        map.fitBounds(bounds, {
          paddingTopLeft: [40, 40],
          paddingBottomRight: [40, 40],
          maxZoom: 7,
        });
      }
    } else if (riskHeatmap && graph.depots.length > 1) {
      const bounds = graph.depots.map(
        (d) => [d.latitude, d.longitude] as [number, number]
      );
      map.fitBounds(bounds, {
        paddingTopLeft: [30, 30],
        paddingBottomRight: [30, 30],
        maxZoom: 6,
      });
    }
  }, [
    ready,
    graph,
    plans,
    baselinePlan,
    replannedPlan,
    source,
    destination,
    onSelectDepot,
    disruptions,
    riskHeatmap,
    hoveredRouteId,
    selectedPlanIndex,
  ]);

  return (
    <div style={{ position: "relative", width: "100%", height, minHeight: "100%" }}>
      <div
        ref={containerRef}
        style={{
          width: "100%",
          height: "100%",
          overflow: "hidden",
        }}
      />

      {/* Route Transit Simulation Playback HUD */}
      {simPathCoords.length >= 2 && (
        <div className="sim-hud animate-fade-in">
          <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <button
                className="btn btn-primary"
                onClick={() => {
                  if (simProgress >= 1) setSimProgress(0);
                  setSimActive(!simActive);
                }}
                style={{
                  padding: "4px 10px",
                  fontSize: "0.72rem",
                  fontWeight: 700,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  borderRadius: 6,
                }}
              >
                {simActive ? <Pause size={12} /> : <Play size={12} fill="currentColor" />}
                {simActive ? "Pause" : simProgress > 0 && simProgress < 1 ? "Resume" : "Simulate Transit"}
              </button>

              {simProgress > 0 && (
                <button
                  className="btn btn-secondary"
                  onClick={() => {
                    setSimActive(false);
                    setSimProgress(0);
                    setSimLegText("");
                  }}
                  style={{ padding: "4px 8px", fontSize: "0.72rem", borderRadius: 6 }}
                  title="Reset simulation"
                >
                  <RotateCcw size={11} />
                </button>
              )}
            </div>

            <span style={{ fontSize: "0.68rem", color: "var(--text-muted)", fontWeight: 600 }}>
              {activePlan?.distance_km ? `${activePlan.distance_km.toFixed(0)} km` : ""}
            </span>
          </div>

          {simLegText && (
            <div style={{ fontSize: "0.725rem", fontWeight: 700, color: "#0f172a", display: "flex", alignItems: "center", gap: 5 }}>
              <Truck size={12} style={{ color: "#2563eb" }} />
              {simLegText}
            </div>
          )}

          {simProgress > 0 && (
            <div style={{ width: "100%", height: 3.5, background: "#e2e8f0", borderRadius: 2, overflow: "hidden" }}>
              <div
                style={{
                  width: `${Math.min(simProgress * 100, 100)}%`,
                  height: "100%",
                  background: "#2563eb",
                  transition: "width 0.08s linear",
                }}
              />
            </div>
          )}
        </div>
      )}

      {/* Floating Light Glassmorphic Legend */}
      <div
        style={{
          position: "absolute",
          bottom: 24,
          right: 24,
          background: "rgba(255, 255, 255, 0.88)",
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
          border: "1px solid rgba(226, 232, 240, 0.9)",
          borderRadius: "var(--radius)",
          padding: "10px 14px",
          fontSize: "0.72rem",
          fontWeight: 500,
          color: "var(--text-secondary)",
          display: "flex",
          flexDirection: "column",
          gap: 6,
          boxShadow: "0 10px 25px -5px rgba(15, 23, 42, 0.08)",
          zIndex: 500,
        }}
      >
        {riskHeatmap ? (
          <>
            <div style={{ fontWeight: 700, color: "var(--text)", marginBottom: 2 }}>
              Corridor Risk
            </div>
            <div
              style={{
                width: 130,
                height: 7,
                borderRadius: 4,
                background:
                  "linear-gradient(90deg, rgba(100,116,139,0.55) 0%, rgba(100,116,139,0.55) 15%, #d97706 50%, #dc2626 100%)",
              }}
            />
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                width: 130,
                fontSize: "0.62rem",
                color: "var(--text-muted)",
              }}
            >
              <span>0%</span>
              <span>30%</span>
              <span>50%+</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 2 }}>
              <span style={{ width: 18, height: 3, borderRadius: 2, background: "rgba(220,38,38,0.8)" }} />
              Disrupted corridor
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#2563eb", border: "2px solid #fff", boxShadow: "0 0 0 1px #2563eb" }} />
              Source (Start)
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#dc2626", border: "2px solid #fff", boxShadow: "0 0 0 1px #dc2626" }} />
              Destination (End)
            </div>
          </>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ width: 12, height: 12, borderRadius: "50%", background: "#2563eb", border: "2px solid #fff", boxShadow: "0 0 0 1px #2563eb" }} />
              Start (Origin)
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ width: 12, height: 12, borderRadius: "50%", background: "#ffffff", border: "2px solid #2563eb", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: "7px", fontWeight: 800, color: "#0f172a" }}>2</span>
              Waypoint (Hop Sequence)
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ width: 12, height: 12, borderRadius: "50%", background: "#dc2626", border: "2px solid #fff", boxShadow: "0 0 0 1px #dc2626" }} />
              End (Destination)
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ width: 18, height: 3.5, background: "#2563eb", borderRadius: 2 }} />
              Active Route (Directional ▶)
            </div>
            {replannedPlan && (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ width: 18, height: 3.5, background: "#10b981", borderRadius: 2 }} />
                Resilient Detour
              </div>
            )}
            {plans.length > 1 && (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ width: 18, height: 2, background: "#64748b", borderRadius: 2, borderBottom: "1px dashed #64748b" }} />
                Alternative Pareto Path
              </div>
            )}
            {disruptions.length > 0 && (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ width: 18, height: 3, background: "#dc2626", borderRadius: 2 }} />
                Disrupted / Blocked
              </div>
            )}
          </>
        )}
      </div>

      <style jsx>{`
        :global(.depot-label) {
          background: transparent !important;
          border: none !important;
          box-shadow: none !important;
          color: #0f172a !important;
          font-size: 11px !important;
          font-weight: 700 !important;
          font-family: var(--font) !important;
          text-shadow: 0 1px 3px rgba(255, 255, 255, 0.9), 0 -1px 3px rgba(255, 255, 255, 0.9), 1px 0 3px rgba(255, 255, 255, 0.9), -1px 0 3px rgba(255, 255, 255, 0.9) !important;
        }
        :global(.route-tooltip) {
          background: rgba(255, 255, 255, 0.95) !important;
          border: 1px solid #e2e8f0 !important;
          border-radius: 8px !important;
          color: #0f172a !important;
          font-family: var(--font) !important;
          font-size: 12px !important;
          padding: 8px 12px !important;
          box-shadow: 0 10px 25px -5px rgba(15, 23, 42, 0.12) !important;
        }
        :global(.leaflet-popup-content-wrapper) {
          background: rgba(255, 255, 255, 0.95) !important;
          border-radius: 12px !important;
          box-shadow: 0 12px 30px -8px rgba(15, 23, 42, 0.15) !important;
          border: 1px solid #e2e8f0 !important;
        }
        :global(.leaflet-popup-tip) {
          background: rgba(255, 255, 255, 0.95) !important;
        }
        @keyframes :global(dash-flow) {
          to { stroke-dashoffset: -18; }
        }
      `}</style>
    </div>
  );
}
