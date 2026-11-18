import React, { useState } from "react";
import { fmtX } from "../format.js";

// Gráfico de trayectorias (múltiplo del capital) por año, escala logarítmica
export default function PathChart({ series, H, height = 220, capital }) {
  const [hover, setHover] = useState(null);
  const W = 680, P = { l: 52, r: 16, t: 12, b: 26 };
  const all = series.flatMap((s) => [1, ...s.data]).filter((x) => x > 0);
  const lo = Math.max(0.02, Math.min(...all) * 0.9), hi = Math.max(...all) * 1.1;
  const ly = (v) => Math.log(Math.max(v, lo));
  const steps = series[0]?.data.length || 1;
  const xs = (t) => P.l + (t / steps) * (W - P.l - P.r);
  const ys = (v) => P.t + (1 - (ly(v) - Math.log(lo)) / (Math.log(hi) - Math.log(lo))) * (height - P.t - P.b);
  const ticks = [];
  for (const base of [0.1, 0.25, 0.5, 1, 2, 3, 5, 10, 20, 50, 100, 200, 500]) if (base >= lo && base <= hi) ticks.push(base);
  const yearLabel = (t) => (t === steps && H % 1 ? H : t);
  return (
    <div style={{ position: "relative" }}>
      <svg viewBox={`0 0 ${W} ${height}`} width="100%" style={{ display: "block" }} onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const x = ((e.clientX - r.left) / r.width) * W;
          const t = Math.round(((x - P.l) / (W - P.l - P.r)) * steps);
          setHover(t >= 1 && t <= steps ? t : null);
        }}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={P.l} x2={W - P.r} y1={ys(t)} y2={ys(t)} stroke={t === 1 ? "#2a3858" : "#16203a"} strokeDasharray={t === 1 ? "" : "3 3"} />
            <text x={P.l - 8} y={ys(t) + 4} textAnchor="end" fontSize="10" fill="#5d6a86" fontFamily="JetBrains Mono">{t}x</text>
          </g>
        ))}
        {Array.from({ length: steps + 1 }, (_, t) => (
          <text key={t} x={xs(t)} y={height - 8} textAnchor="middle" fontSize="10" fill="#5d6a86" fontFamily="JetBrains Mono">{t === 0 ? "hoy" : `a${yearLabel(t)}`}</text>
        ))}
        {series.map((s) => (
          <polyline key={s.name} fill="none" stroke={s.color} strokeWidth={s.bold ? 2.6 : 1.5} strokeDasharray={s.dash || ""}
            points={[[0, 1], ...s.data.map((v, t) => [t + 1, v])].map(([t, v]) => `${xs(t)},${ys(v)}`).join(" ")} />
        ))}
        {hover && <line x1={xs(hover)} x2={xs(hover)} y1={P.t} y2={height - P.b} stroke="#5d6a86" strokeDasharray="2 2" />}
        {hover && series.map((s) => <circle key={s.name} cx={xs(hover)} cy={ys(s.data[hover - 1])} r="3.5" fill={s.color} />)}
      </svg>
      {hover && (
        <div style={{ position: "absolute", top: 6, left: `${(xs(hover) / W) * 100}%`, transform: "translateX(-50%)", background: "#0b1220", border: "1px solid #2a3858", borderRadius: 7, padding: "6px 9px", fontSize: 11, pointerEvents: "none", whiteSpace: "nowrap" }}>
          <div style={{ color: "#8b97b0", marginBottom: 3 }}>Año {yearLabel(hover)}</div>
          {series.map((s) => (
            <div key={s.name} style={{ color: s.color, fontFamily: "JetBrains Mono" }}>
              {s.name}: {fmtX(s.data[hover - 1])}{capital ? ` · $${Math.round(capital * s.data[hover - 1]).toLocaleString("es")}` : ""}
            </div>
          ))}
        </div>
      )}
      <div className="legend">{series.map((s) => <span key={s.name}><i style={{ background: s.color }} />{s.name}</span>)}</div>
    </div>
  );
}
