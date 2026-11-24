// Calibración v2: funciones puras (navegador y Node). Ver src/calibration.js para el hook de React.
// ---------------------------------------------------------------------------------------------------------------
// Calibración v2 (public/calibration.json, generado por scripts/backtest/run-backtest.mjs).
// Para cada teoría y horizonte (1, 3, 5 y 10 años) hay una tabla por tramos del PERCENTIL del ranking del modelo
// (1 = la mejor del universo con filtros por defecto) con la distribución del múltiplo que realmente se realizó en
// el backtest de EE.UU. (50 cuantiles), corregida por las empresas que dejaron de cotizar (sesgo de supervivencia).
// El modelo decide el ORDEN; la historia decide los NÚMEROS.
import { kellyFraction } from "./model.js";

export const RF_ANNUAL = 0.03; // efectivo / letras del Tesoro (promedio aproximado 2011–2025)
const LN2 = Math.log(2), LN5 = Math.log(5), LN10 = Math.log(10);
// P(log M ≥ x) desde cuantiles equiprobables en log, con interpolación lineal de la CDF entre puntos
function exceed(lq, x) {
  const n = lq.length;
  if (x <= lq[0]) return 1 - 0.5 / n;
  if (x >= lq[n - 1]) return 0.5 / n * (x === lq[n - 1] ? 1 : 0);
  let k = 0;
  while (lq[k + 1] < x) k++;
  const t = (x - lq[k]) / (lq[k + 1] - lq[k] || 1);
  const cdf = (k + 0.5 + t) / n;
  return 1 - cdf;
}
const probsFrom = (lq) => ({ pLoss: 1 - exceed(lq, 0), pHalf: 1 - exceed(lq, Math.log(0.5)), p2x: exceed(lq, LN2), p5x: exceed(lq, LN5), p10x: exceed(lq, LN10) });
const medLog = (lq) => { const n = lq.length; return n % 2 ? lq[(n - 1) / 2] : (lq[n / 2 - 1] + lq[n / 2]) / 2; };

// distribución de un tramo interpolada por percentil de ranking
function atRank(tab, p) {
  const bins = tab.bins.filter(Boolean);
  const pack = (b) => ({ lq: b.q.map((m) => Math.log(m)), pr: { pLoss: b.pLoss, pHalf: b.pHalf, p2x: b.p2x, p5x: b.p5x, p10x: b.p10x }, n: b.n, lo: b.lo, hi: b.hi });
  if (p <= bins[0].rank) return pack(bins[0]);
  const last = bins[bins.length - 1];
  if (p >= last.rank) return pack(last);
  let k = 0;
  while (bins[k + 1].rank < p) k++;
  const a = pack(bins[k]), b = pack(bins[k + 1]);
  const t = (p - bins[k].rank) / (bins[k + 1].rank - bins[k].rank || 1);
  const pr = {};
  for (const key of Object.keys(a.pr)) pr[key] = a.pr[key] * (1 - t) + b.pr[key] * t;
  return { lq: a.lq.map((x, i) => x * (1 - t) + b.lq[i] * t), pr, n: t < 0.5 ? a.n : b.n, lo: t < 0.5 ? a.lo : b.lo, hi: t < 0.5 ? a.hi : b.hi };
}
// escala una distribución de horizonte h0 a H: mediana ∝ H, dispersión ∝ √H (paseo aleatorio en log)
function rescale(lq, h0, H) {
  const mu = medLog(lq), s = Math.sqrt(H / h0);
  return lq.map((x) => (mu * H) / h0 + (x - mu) * s);
}

// Distribución calibrada para el percentil p (0..1) a H años. Devuelve múltiplos (50 cuantiles) y resumen.
export function calDist(CT, theory, H, p) {
  const tabs = CT.tables[theory] || CT.tables.adn;
  const hs = Object.keys(tabs).map(Number).filter((h) => tabs[h]).sort((a, b) => a - b);
  if (!hs.length) return null;
  let lq, pr = null, extrap = false, base = null;
  if (hs.includes(H)) { const r = atRank(tabs[H], p); lq = r.lq; pr = r.pr; base = r; }
  else if (H < hs[0]) { const r = atRank(tabs[hs[0]], p); lq = rescale(r.lq, hs[0], H); base = r; }
  else if (H > hs[hs.length - 1]) { const h0 = hs[hs.length - 1]; const r = atRank(tabs[h0], p); lq = rescale(r.lq, h0, H); extrap = true; base = r; }
  else {
    let k = 0; while (hs[k + 1] < H) k++;
    const ha = hs[k], hb = hs[k + 1], t = (H - ha) / (hb - ha);
    const a = atRank(tabs[ha], p), b = atRank(tabs[hb], p);
    // se llevan ambos al horizonte H antes de mezclar
    const la = rescale(a.lq, ha, H), lb = rescale(b.lq, hb, H);
    lq = la.map((x, i) => x * (1 - t) + lb[i] * t);
    base = t < 0.5 ? a : b;
  }
  if (!pr) pr = probsFrom(lq);
  const q = lq.map((x) => Math.exp(x));
  const mean = q.reduce((s, x) => s + x, 0) / q.length;
  const median = Math.exp(medLog(lq));
  const qa = (lv) => { const x = lv * q.length - 0.5, k = Math.max(0, Math.min(q.length - 2, Math.floor(x))), t = Math.max(0, Math.min(1, x - k)); return Math.exp(lq[k] * (1 - t) + lq[k + 1] * t); };
  return {
    q, mean, median, p10: qa(0.1), p25: qa(0.25), p75: qa(0.75), p90: qa(0.9), ...pr,
    cagrMed: Math.pow(median, 1 / H) - 1, cagrMean: Math.pow(mean, 1 / H) - 1,
    extrap, interpolatedH: !hs.includes(H), bin: base ? { lo: base.lo, hi: base.hi, n: base.n } : null,
  };
}
// Kelly individual contra efectivo con la distribución calibrada (sin apalancamiento: 0..100%)
export function calKelly(dist, H) {
  if (!dist) return NaN;
  const rf = Math.pow(1 + RF_ANNUAL, H);
  return kellyFraction(dist.q.map((m) => [1 / dist.q.length, m / rf - 1]), 1);
}
// outcomes en el formato del modelo ([prob, múltiplo]) para Kelly de portafolio / Monte Carlo
export const calOutcomes = (dist) => dist.q.map((m) => [1 / dist.q.length, m]);

// Percentil del ranking (por elog) relativo al universo con filtros por defecto, igual que el backtest.
export function rankPercentiles(D, R, passesFilters, DEFAULT_FILTERS) {
  const ref = [];
  for (let i = 0; i < D.n; i++) if (!Number.isNaN(R.elog[i]) && passesFilters(D, i, DEFAULT_FILTERS)) ref.push(R.elog[i]);
  ref.sort((a, b) => a - b);
  const N = ref.length;
  const pct = new Float32Array(D.n).fill(NaN);
  if (N < 2) return pct;
  for (let i = 0; i < D.n; i++) {
    const v = R.elog[i];
    if (Number.isNaN(v)) continue;
    let lo = 0, hi = N; while (lo < hi) { const m = (lo + hi) >> 1; if (ref[m] < v) lo = m + 1; else hi = m; }
    pct[i] = Math.min(1, Math.max(0, lo / (N - 1)));
  }
  return pct;
}
