"use client";
import { useEffect, useRef } from "react";
import type { GraphInput, Disruption } from "../lib/api";
import { riskColor } from "../lib/constants";

interface Props {
  graph: GraphInput;
  disruptions: Disruption[];
}

export function RiskHeatmap({ graph, disruptions }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    const W = rect.width;
    const H = rect.height;

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, W, H);

    // Node positions
    const lats = graph.depots.map((d) => d.latitude);
    const lons = graph.depots.map((d) => d.longitude);
    const minLat = Math.min(...lats), maxLat = Math.max(...lats);
    const minLon = Math.min(...lons), maxLon = Math.max(...lons);
    const latR = Math.max(maxLat - minLat, 0.01);
    const lonR = Math.max(maxLon - minLon, 0.01);
    const pad = 50;

    const pos: Record<string, { x: number; y: number }> = {};
    for (const depot of graph.depots) {
      pos[depot.id] = {
        x: pad + ((depot.longitude - minLon) / lonR) * (W - 2 * pad),
        y: H - pad - ((depot.latitude - minLat) / latR) * (H - 2 * pad),
      };
    }

    // Compute effective risk per route
    const effectiveRisk = (routeId: string, basePrior: number): number => {
      const related = disruptions.filter((d) => d.edge_id === routeId);
      let survival = 1 - basePrior;
      for (const d of related) {
        survival *= 1 - d.severity;
      }
      return 1 - survival;
    };

    // Draw edges with risk color and thickness
    for (const route of graph.routes) {
      const from = pos[route.origin_id];
      const to = pos[route.destination_id];
      if (!from || !to) continue;

      const risk = effectiveRisk(route.id, route.risk_prior);
      const color = riskColor(risk);
      const width = 1 + risk * 6;
      const disrupted = disruptions.some((d) => d.edge_id === route.id);

      // Glow for high risk
      if (risk > 0.3) {
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
        ctx.strokeStyle = color + "30";
        ctx.lineWidth = width + 6;
        ctx.stroke();
      }

      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.globalAlpha = 0.8;
      ctx.stroke();
      ctx.globalAlpha = 1;

      // Risk label at midpoint
      const mx = (from.x + to.x) / 2;
      const my = (from.y + to.y) / 2;
      ctx.fillStyle = color;
      ctx.font = "bold 9px Inter, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(`${(risk * 100).toFixed(0)}%`, mx, my - 6);

      // Disruption indicator
      if (disrupted) {
        ctx.fillStyle = "#ef4444";
        ctx.font = "bold 9px Inter, sans-serif";
        ctx.fillText("(!)", mx + 16, my - 6);
      }
    }

    // Draw nodes
    for (const depot of graph.depots) {
      const p = pos[depot.id];

      // Node glow
      ctx.beginPath();
      ctx.arc(p.x, p.y, 14, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(37, 99, 235, 0.08)";
      ctx.fill();

      ctx.beginPath();
      ctx.arc(p.x, p.y, 8, 0, Math.PI * 2);
      ctx.fillStyle = "#ffffff";
      ctx.fill();
      ctx.strokeStyle = "#0f172a";
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = "#0f172a";
      ctx.font = "bold 11px Inter, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(depot.name, p.x, p.y + 22);
    }

    // Legend
    const legendX = 12;
    const legendY = H - 60;
    const gradientStops = [
      { risk: 0, label: "Low" },
      { risk: 0.3, label: "" },
      { risk: 0.5, label: "Med" },
      { risk: 0.7, label: "" },
      { risk: 1.0, label: "High" },
    ];

    ctx.fillStyle = "#64748b";
    ctx.font = "10px Inter, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("Risk Level", legendX, legendY);

    const barW = 120;
    const barH = 6;
    const grad = ctx.createLinearGradient(legendX, 0, legendX + barW, 0);
    grad.addColorStop(0, "#10b981");
    grad.addColorStop(0.3, "#fbbf24");
    grad.addColorStop(0.6, "#f59e0b");
    grad.addColorStop(1, "#ef4444");

    ctx.fillStyle = grad;
    ctx.fillRect(legendX, legendY + 8, barW, barH);

    ctx.fillStyle = "#64748b";
    ctx.font = "9px Inter, sans-serif";
    ctx.fillText("0%", legendX, legendY + 26);
    ctx.textAlign = "right";
    ctx.fillText("100%", legendX + barW, legendY + 26);
  }, [graph, disruptions]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        width: "100%",
        height: 340,
        borderRadius: "var(--radius)",
        border: "1px solid var(--border)",
      }}
    />
  );
}
