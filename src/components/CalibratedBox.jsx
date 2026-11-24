import React from "react";
import { fmtPct, fmtX, cagrClass } from "../format.js";

const pc = (x) => (Number.isFinite(x) ? `${x < 0.01 && x > 0 ? "<1" : Math.round(x * 100)}%` : "—");

// Histograma de la distribución calibrada (50 cuantiles equiprobables) en escala log, con marcas en 1x/2x/5x/10x
export function DistBars({ q, H, height = 64 }) {
  if (!q?.length) return null;
  const lo = Math.log(0.05), hi = Math.log(20);
  const nb = 28;
  const bins = new Array(nb).fill(0);
  for (const m of q) {
    const x = Math.min(hi - 1e-9, Math.max(lo, Math.log(m)));
    bins[Math.floor(((x - lo) / (hi - lo)) * nb)]++;
  }
  const mx = Math.max(...bins) || 1;
  const xOf = (m) => ((Math.log(m) - lo) / (hi - lo)) * 100;
  return (
    <div className="distbars" aria-label={`Distribución histórica del múltiplo a ${H} años`}>
      <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" style={{ width: "100%", height }}>
        {bins.map((b, k) => {
          const mid = Math.exp(lo + ((k + 0.5) / nb) * (hi - lo));
          const h = (b / mx) * (height - 14);
          return <rect key={k} x={(k / nb) * 100 + 0.3} width={100 / nb - 0.6} y={height - 12 - h} height={h}
            fill={mid < 1 ? "var(--neg)" : mid < 2 ? "var(--warn)" : "var(--accent)"} opacity="0.85" />;
        })}
        {[1, 2, 5, 10].map((m) => <line key={m} x1={xOf(m)} x2={xOf(m)} y1="0" y2={height - 12} stroke="var(--muted)" strokeWidth="0.3" strokeDasharray="1 1" vectorEffect="non-scaling-stroke" />)}
      </svg>
      <div className="distaxis">
        {[[0.1, "0.1x"], [0.5, "0.5x"], [1, "1x"], [2, "2x"], [5, "5x"], [10, "10x"]].map(([m, l]) => <span key={l} style={{ left: `${xOf(m)}%` }}>{l}</span>)}
      </div>
    </div>
  );
}

// Caja principal de la ficha: lo que históricamente pasó con las acciones en el mismo percentil del ranking
export default function CalibratedBox({ dist, pct, H, kelly, modelCagr, capital = 10000, title = "Lo que pasó históricamente con acciones en su posición del ranking" }) {
  if (!dist) return null;
  const extrapNote = dist.extrap ? ` Tu horizonte (${H} años) es mayor que el máximo medido (10): se extrapola con mediana ∝ años y dispersión ∝ √años.` : dist.interpolatedH ? ` Interpolado entre los horizontes medidos (1, 3, 5 y 10 años).` : "";
  return (
    <div className="box calbox">
      <h4>{title}</h4>
      <div className="small" style={{ marginBottom: 8 }}>
        Percentil <b>{Math.round(pct * 1000) / 10}</b> del ranking (100 = la mejor del universo con filtros por defecto). Backtest EE.UU. 2011–2025 con el mismo modelo,
        corregido por las empresas que dejaron de cotizar. El modelo decide el <i>orden</i>; esta tabla, los <i>números</i>.{extrapNote}
      </div>
      <div className="cards">
        <div className="card"><small>Retorno anual mediano</small><b className={cagrClass(dist.cagrMed)}>{fmtPct(dist.cagrMed * 100)}</b><em>{fmtX(dist.median)} en {H}a · modelo: {Number.isFinite(modelCagr) ? fmtPct(modelCagr * 100) : "—"}</em></div>
        <div className="card"><small>Prob. de perder dinero</small><b className={dist.pLoss > 0.35 ? "neg" : ""}>{pc(dist.pLoss)}</b><em>perder ≥50%: {pc(dist.pHalf)}</em></div>
        <div className="card"><small>Prob. de 2x · 5x · 10x</small><b>{pc(dist.p2x)}</b><em>5x: {pc(dist.p5x)} · 10x: {pc(dist.p10x)}</em></div>
        <div className="card"><small>Kelly calibrado</small><b>{Number.isFinite(kelly) ? `${Math.round(kelly * 100)}%` : "—"}</b><em>vs. efectivo al 3% anual</em></div>
      </div>
      <DistBars q={dist.q} H={H} />
      <div className="small" style={{ marginTop: 6 }}>
        Rango 10%–90%: <b>{fmtX(dist.p10)} – {fmtX(dist.p90)}</b> (${Math.round(capital * dist.p10).toLocaleString("es")} a ${Math.round(capital * dist.p90).toLocaleString("es")} por cada ${capital.toLocaleString("es")}).
        Media {fmtX(dist.mean)} ({fmtPct(dist.cagrMean * 100)} anual): la media supera a la mediana porque unas pocas acciones explican casi toda la ganancia.
        {dist.bin ? <> Tramo del ranking {Math.round(dist.bin.lo * 1000) / 10}–{Math.round(dist.bin.hi * 1000) / 10} con {dist.bin.n.toLocaleString("es")} observaciones.</> : null}
        {" "}Solo EE.UU.: en otros mercados puede no aplicar.
      </div>
    </div>
  );
}
