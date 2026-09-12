"use client";
import { useEffect, useRef, useState } from "react";
import type { GraphInput, Plan, Disruption } from "../lib/api";
import { MAP_CONFIG, riskColor } from "../lib/constants";

let L: typeof import("leaflet") | null = null;

interface Props {
  graph: GraphInput;
  plans?: Plan[];
  source: string | null;
  destination: string | null;
  onSelectDepot?: (depotId: string) => void;
  searchedLocation?: { name: string; latitude: number; longitude: number } | null;
  height?: string | number;
  /** Risk-heatmap overlay: colour every corridor by effective risk. */
  riskHeatmap?: boolean;
  /** Active disruptions folded into the heatmap (Bayesian union). */
  disruptions?: Disruption[];
}

export function MapView({
  graph,
  plans = [],
  source,
  destination,
  onSelectDepot,
  searchedLocation,
  height = "100%",
  riskHeatmap = false,
  disruptions = [],
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const linesRef = useRef<any[]>([]);
  const searchedMarkerRef = useRef<any>(null);
  const [ready, setReady] = useState(false);

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
          <div style="font-weight: 700; font-size: 13px; color: #0f172a;">📍 ${searchedLocation.name}</div>
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

  // Draw depots and routes
  useEffect(() => {
    if (!ready || !mapRef.current || !L) return;
    const map = mapRef.current;

    // Clear previous elements
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];
    linesRef.current.forEach((l) => l.remove());
    linesRef.current = [];

    const depotMap: Record<string, { lat: number; lng: number }> = {};
    const plannedRouteIds = new Set(plans.flatMap((p) => p.route_ids));

    // Effective risk = independent-event Bayesian union of the route's prior
    // and every active disruption on that edge (same model as the planner).
    const effectiveRisk = (routeId: string, basePrior: number): number => {
      let survival = 1 - basePrior;
      for (const d of disruptions) {
        if (d.edge_id === routeId) survival *= 1 - d.severity;
      }
      return 1 - survival;
    };

    // 1. Draw network routes underneath markers
    for (const route of graph.routes) {
      const origin = graph.depots.find((d) => d.id === route.origin_id);
      const dest = graph.depots.find((d) => d.id === route.destination_id);
      if (!origin || !dest) continue;

      const isPlanned = plannedRouteIds.has(route.id);
      const effRisk = riskHeatmap ? effectiveRisk(route.id, route.risk_prior) : route.risk_prior;
      const disrupted = disruptions.some((d) => d.edge_id === route.id);

      // Strict 4-color palette in normal mode; risk gradient in heatmap mode
      let color: string;
      let weight: number;
      let opacity: number;
      let dashArray: string | undefined;

      if (riskHeatmap) {
        color = riskColor(effRisk);
        weight = 2 + effRisk * 5;
        opacity = 0.55 + effRisk * 0.45;
        dashArray = disrupted ? "5 4" : undefined;
      } else {
        // Cobalt for planned, Slate for available, Crimson for high risk
        color = isPlanned
          ? "#2563eb"
          : route.risk_prior >= 0.2
          ? "rgba(220, 38, 38, 0.45)"
          : "rgba(100, 116, 139, 0.35)";
        weight = isPlanned ? 4.5 : 1.5;
        opacity = isPlanned ? 1 : 0.6;
        dashArray = isPlanned ? undefined : "6 4";
      }

      // Heat glow underneath hot corridors
      if (riskHeatmap && effRisk > 0.3) {
        const glow = L.polyline(
          [
            [origin.latitude, origin.longitude],
            [dest.latitude, dest.longitude],
          ],
          {
            color: riskColor(effRisk),
            weight: weight + 8,
            opacity: 0.18,
            interactive: false,
          }
        ).addTo(map);
        linesRef.current.push(glow);
      }

      const line = L.polyline(
        [
          [origin.latitude, origin.longitude],
          [dest.latitude, dest.longitude],
        ],
        {
          color,
          weight,
          opacity,
          dashArray,
        }
      ).addTo(map);

      // Tooltip on hover — shows effective (disruption-aware) risk in heatmap mode
      const riskLabel = riskHeatmap
        ? `<strong>${route.id}</strong>${disrupted ? " ⚡" : ""}<br/>Effective risk: <strong>${(effRisk * 100).toFixed(0)}%</strong>${disrupted ? " (disrupted)" : ""}<br/>Base: ₹${route.cost} · ${route.time_hours}h`
        : `<strong>${route.id}</strong><br/>Cost: ₹${route.cost} · Risk: ${(route.risk_prior * 100).toFixed(0)}% · ${route.time_hours}h`;
      line.bindTooltip(riskLabel, {
        sticky: true,
        className: "route-tooltip",
      });

      // Animated dash for planned routes
      if (isPlanned) {
        const el = line.getElement() as HTMLElement | undefined;
        el?.style.setProperty("stroke-dasharray", "12 6");
        el?.style.setProperty("animation", "dash-flow 1s linear infinite");
      }

      linesRef.current.push(line);
    }

    // 2. Draw depot markers
    for (const depot of graph.depots) {
      depotMap[depot.id] = { lat: depot.latitude, lng: depot.longitude };

      const isSource = depot.id === source;
      const isDest = depot.id === destination;

      // Strict palette: Cobalt for source, Crimson for dest, Clean White/Slate for unselected
      let markerColor = "#0f172a";
      let fillColor = "#ffffff";
      let radius = 7;

      if (isSource) {
        markerColor = "#2563eb";
        fillColor = "#2563eb";
        radius = 10;
      } else if (isDest) {
        markerColor = "#dc2626";
        fillColor = "#dc2626";
        radius = 10;
      }

      const marker = L.circleMarker([depot.latitude, depot.longitude], {
        radius,
        fillColor,
        fillOpacity: isSource || isDest ? 1 : 0.9,
        color: isSource || isDest ? "#ffffff" : markerColor,
        weight: isSource || isDest ? 3 : 2,
        opacity: 1,
      }).addTo(map);

      // Permanent subtle label
      const label = L.tooltip({
        permanent: true,
        direction: "top",
        offset: [0, -10],
        className: "depot-label",
      }).setContent(depot.name);

      marker.bindTooltip(label);

      marker.on("click", () => {
        onSelectDepot?.(depot.id);
      });

      marker.bindPopup(
        `<div style="font-family: var(--font); min-width: 140px; padding: 2px;">
          <div style="font-weight: 700; font-size: 14px; color: #0f172a; margin-bottom: 2px;">${depot.name}</div>
          <div style="font-size: 12px; color: #64748b;">
            ${depot.latitude.toFixed(4)}°N, ${depot.longitude.toFixed(4)}°E
          </div>
          <div style="margin-top: 6px; font-size: 11px; font-weight: 700; text-transform: uppercase; color: ${
            isSource ? '#2563eb' : isDest ? '#dc2626' : '#64748b'
          };">
            ${isSource ? "● Current Source" : isDest ? "● Current Destination" : "Click to select"}
          </div>
        </div>`,
        { closeButton: false }
      );

      markersRef.current.push(marker);
    }

    // 3. Zoom-to-fit: planned routes, or the whole network in heatmap mode
    if (plans.length > 0) {
      const planDepotIds = new Set<string>();
      for (const plan of plans) {
        for (const rid of plan.route_ids) {
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
        // Pad on left so the floating drawer doesn't obstruct the route
        map.fitBounds(bounds, {
          paddingTopLeft: [480, 80],
          paddingBottomRight: [80, 80],
          maxZoom: 7,
        });
      }
    } else if (riskHeatmap && graph.depots.length > 1) {
      // Heatmap card: frame the entire corridor network
      const bounds = graph.depots.map(
        (d) => [d.latitude, d.longitude] as [number, number]
      );
      map.fitBounds(bounds, {
        paddingTopLeft: [30, 30],
        paddingBottomRight: [30, 30],
        maxZoom: 6,
      });
    }
  }, [ready, graph, plans, source, destination, onSelectDepot, disruptions, riskHeatmap]);

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
              ⚡ Disrupted corridor
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#2563eb", border: "2px solid #fff", boxShadow: "0 0 0 1px #2563eb" }} />
              Source
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#dc2626", border: "2px solid #fff", boxShadow: "0 0 0 1px #dc2626" }} />
              Destination
            </div>
          </>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#2563eb", border: "2px solid #fff", boxShadow: "0 0 0 1px #2563eb" }} />
              Source
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#dc2626", border: "2px solid #fff", boxShadow: "0 0 0 1px #dc2626" }} />
              Destination
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ width: 18, height: 3.5, background: "#2563eb", borderRadius: 2 }} />
              Planned Route
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ width: 18, height: 2, background: "#94a3b8", borderRadius: 2, borderBottom: "1px dashed #64748b" }} />
              Available Corridor
            </div>
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
