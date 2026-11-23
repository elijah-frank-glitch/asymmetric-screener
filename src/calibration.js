// Calibración del retorno esperado con el backtest de EE.UU. (public/backtest.json → calibration[teoría]).
// Convierte el CAGR esperado del modelo en el CAGR mediano que históricamente realizaron las acciones con
// un esperado similar (horizonte 5 años). No altera el ranking: es solo una lectura adicional.
import { useEffect, useState } from "react";
import { loadBacktest } from "./backtestData.js";

const ok = (x) => typeof x === "number" && Number.isFinite(x);

// Regresión isotónica (pool-adjacent-violators, ponderada por n) sobre los deciles y mapeo lineal por tramos
// entre los centros de cada decil; fuera del rango observado se mantiene el valor del extremo.
export function buildCalibration(deciles) {
  const pts = (Array.isArray(deciles) ? deciles : [])
    .filter((d) => d && ok(d.expCagr) && ok(d.realCagr))
    .map((d) => ({ x: d.expCagr, y: d.realCagr, w: ok(d.n) && d.n > 0 ? d.n : 1 }))
    .sort((a, b) => a.x - b.x);
  if (pts.length < 2) return null;
  // PAV: bloques con media ponderada no decreciente
  const blocks = [];
  for (const p of pts) {
    blocks.push({ y: p.y, w: p.w, n: 1 });
    while (blocks.length > 1 && blocks[blocks.length - 2].y > blocks[blocks.length - 1].y) {
      const b = blocks.pop(), a = blocks.pop();
      const w = a.w + b.w;
      blocks.push({ y: (a.y * a.w + b.y * b.w) / w, w, n: a.n + b.n });
    }
  }
  const fit = [];
  for (const b of blocks) for (let k = 0; k < b.n; k++) fit.push(b.y);
  const xs = pts.map((p) => p.x), ys = fit;
  const map = (x) => {
    if (!ok(x)) return NaN;
    if (x <= xs[0]) return ys[0];
    const last = xs.length - 1;
    if (x >= xs[last]) return ys[last];
    let k = 1;
    while (xs[k] < x) k++;
    const t = (x - xs[k - 1]) / (xs[k] - xs[k - 1] || 1);
    return ys[k - 1] + t * (ys[k] - ys[k - 1]);
  };
  // a partir de qué esperado el realizado histórico deja de subir (inicio del tramo plano superior)
  const top = ys[ys.length - 1];
  let plateauFrom = xs[xs.length - 1];
  for (let k = xs.length - 1; k >= 0 && Math.abs(ys[k] - top) < 1e-9; k--) plateauFrom = xs[k];
  return { map, xs, ys, min: ys[0], max: top, plateauFrom };
}

export const theoryOf = (settings) => (settings?.preset && settings.preset !== "custom" ? settings.preset : "adn");

// Hook: carga /backtest.json una sola vez (caché compartida con la pestaña Backtest) y devuelve
// { cal, H, universe } para la teoría, o null si no hay backtest/calibración disponible.
const calCache = new Map();
export function useCalibration(theory) {
  const [state, setState] = useState(() => calCache.get(theory) || null);
  useEffect(() => {
    let alive = true;
    if (calCache.has(theory)) { setState(calCache.get(theory)); return; }
    loadBacktest()
      .then((B) => {
        const deciles = B?.calibration?.[theory] || B?.calibration?.adn;
        const cal = buildCalibration(deciles);
        const v = cal ? { cal, H: B.modelHorizon || 5, universe: B.universe || "EE.UU.", runAt: B.runAt } : null;
        calCache.set(theory, v);
        if (alive) setState(v);
      })
      .catch(() => { if (alive) setState(null); });
    return () => { alive = false; };
  }, [theory]);
  return state;
}
