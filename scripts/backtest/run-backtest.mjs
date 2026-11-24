// Backtest histórico del modelo (EE.UU., datos SEC). Contrato: docs/BACKTEST_CONTRACT.md.
// Lee el panel point-in-time (§1) y escribe public/backtest.json (§2). Para cada fecha de rebalanceo arma un D
// compatible con src/engine.js SOLO con los datos de esa fecha, corre el MISMO modelo (sin cambiar su lógica)
// con cada teoría (todas menos "custom", horizonte 5) y los filtros default, y mide el retorno real posterior.
//   node scripts/backtest/run-backtest.mjs [--panel <panel.json|panel.json.gz>] [--out <backtest.json>]
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runModel, passesFilters, DEFAULT_FILTERS, companyInputs, clearRankCache, clearConfidenceCache, CORE_IDS } from "../../src/engine.js";
import { PRESETS, evaluate, buildWeights } from "../../src/model.js";
import { METRICS } from "../metrics.mjs";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const H_MODEL = 5, NPORT = 5;

// ---------- 1) Leer el panel (json o json.gz)
function findPanel() {
  const p = arg("--panel");
  if (p) return resolve(p);
  for (const f of ["data/backtest/panel.json", "data/backtest/panel.json.gz"]) if (existsSync(resolve(ROOT, f))) return resolve(ROOT, f);
  return null;
}
const panelPath = findPanel();
if (!panelPath || !existsSync(panelPath)) {
  console.error("No se encontró el panel (data/backtest/panel.json[.gz]). Usa --panel <ruta>.");
  process.exit(1);
}
const outPath = resolve(arg("--out") || resolve(ROOT, "public/backtest.json"));
const t0 = Date.now();
let buf = readFileSync(panelPath);
if (buf[0] === 0x1f && buf[1] === 0x8b) buf = gunzipSync(buf);
const panel = JSON.parse(buf.toString("utf8"));
buf = null;
const NC = panel.companies.length;
const HORIZONS = panel.horizons || [1, 3, 5];
const yearOf = (d) => Number(String(d).slice(0, 4));
console.log(`Panel: ${panelPath} — ${NC} empresas, ${panel.dates.length} fechas (${((Date.now() - t0) / 1000).toFixed(1)} s de lectura)`);

// ---------- 2) Clasificación por SIC (si el panel la trae). Solo importa para el modelo:
//   sector "Finance" (penaliza confianza y limita crecimiento), industrias cíclicas (CYCLICAL en engine.js)
//   y "Investment Trusts/Mutual Funds" (excluida por los filtros default). Los nombres coinciden con los de la app.
const SIC_IND = [
  [[6722, 6726], "Investment Trusts/Mutual Funds"], [[3674, 3674], "Semiconductors"], [[3670, 3679], "Electronic Components"],
  [[3577, 3577], "Computer Peripherals"], [[1311, 1311], "Oil & Gas Production"], [[2911, 2911], "Oil Refining/Marketing"],
  [[1381, 1381], "Contract Drilling"], [[1382, 1389], "Oilfield Services/Equipment"], [[3533, 3533], "Oilfield Services/Equipment"],
  [[3310, 3317], "Steel"], [[3334, 3334], "Aluminum"], [[3350, 3357], "Aluminum"], [[1040, 1044], "Precious Metals"],
  [[1220, 1241], "Coal"], [[1000, 1099], "Other Metals/Minerals"], [[4400, 4499], "Marine Shipping"],
  [[1520, 1531], "Homebuilding"], [[4512, 4513], "Airlines"], [[3711, 3711], "Motor Vehicles"], [[4213, 4213], "Trucking"],
  [[2800, 2821], "Chemicals: Major Diversified"], [[2870, 2879], "Chemicals: Agricultural"], [[2400, 2499], "Forest Products"],
  [[2600, 2631], "Pulp & Paper"], [[3240, 3241], "Construction Materials"], [[3270, 3279], "Construction Materials"],
  [[2200, 2299], "Textiles"], [[6552, 6552], "Real Estate Development"], [[2040, 2048], "Agricultural Commodities/Milling"],
];
const hasSic = panel.companies.some((c) => Number.isFinite(c.sic));
const industries = ["Miscellaneous"], sectors = ["—", "Finance"];
const industryOf = new Int32Array(NC), sectorOf = new Int32Array(NC);
if (hasSic) {
  panel.companies.forEach((c, i) => {
    const s = Number(c.sic);
    const hit = Number.isFinite(s) ? SIC_IND.find(([[a, b]]) => s >= a && s <= b) : null;
    if (hit) { let k = industries.indexOf(hit[1]); if (k < 0) k = industries.push(hit[1]) - 1; industryOf[i] = k; }
    sectorOf[i] = Number.isFinite(s) && s >= 6000 && s <= 6799 ? 1 : 0;
  });
}
const exchanges = [...new Set(panel.companies.map((c) => c.exchange || ""))];
const exchangeOf = panel.companies.map((c) => exchanges.indexOf(c.exchange || ""));
const dirs = Object.fromEntries(METRICS.map((m) => [m.id, m.better || 1]));
// Columnas que el motor necesita: las del modelo + las que traiga el panel. Las que no existan históricamente
// (consenso, trimestrales, Piotroski, aceleración) van como null → el modelo las trata como percentil 35 para todas.
const panelCols = new Set(Object.values(panel.snapshots).flatMap((s) => Object.keys(s.cols || {})));
const COL_IDS = [...new Set([...CORE_IDS, ...panelCols])];

const median = (a) => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };

// Arma el D de una fecha. Solo entran empresas con mcap > 0 en esa fecha (las demás no cotizaban o no hay dato;
// tampoco pasarían el filtro). Los percentiles se calculan sobre ese universo, como en la app.
function buildD(date) {
  const snap = panel.snapshots[date];
  const mc = snap.cols.mcap || [];
  const idx = [];
  for (let i = 0; i < NC; i++) if (mc[i] > 0) idx.push(i);
  const n = idx.length;
  const cols = {};
  for (const id of COL_IDS) {
    const src = snap.cols[id];
    cols[id] = src ? idx.map((i) => (typeof src[i] === "number" && Number.isFinite(src[i]) ? src[i] : null)) : new Array(n).fill(null);
  }
  const industry = idx.map((i) => industryOf[i]);
  // Margen neto mediano por industria (misma regla que scripts/build-data.mjs); sin SIC → 7% para todas
  const indNM = industries.map((_, k) => {
    if (!hasSic) return 7;
    const v = []; for (let j = 0; j < n; j++) if (industry[j] === k && cols.nm[j] > 0 && cols.nm[j] < 80 && cols.mcap[j] > 2e8) v.push(cols.nm[j]);
    return v.length >= 5 ? Math.round(median(v) * 10) / 10 : 7;
  });
  const co = idx.map((i) => panel.companies[i]);
  return {
    idx,
    D: {
      n, cols, dirs, ticker: co.map((c) => c.ticker || String(c.cik)), name: co.map((c) => c.name || ""),
      sym: co.map((c) => `${(c.exchange || "US").toUpperCase()}:${c.ticker || c.cik}`), common: new Array(n).fill(1),
      exchange: idx.map((i) => exchangeOf[i]), exchanges, country: new Array(n).fill(0), countries: ["United States"],
      sector: idx.map((i) => sectorOf[i]), sectors, industry, industries, indNM,
    },
  };
}

// ---------- 3) Utilidades estadísticas
const ok = (x) => typeof x === "number" && Number.isFinite(x);
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
const ew = (rets) => mean(rets);
const annual = (r, h) => Math.pow(Math.max(1 + r, 1e-6), 1 / h) - 1;
// CAGR anualizado = media geométrica de (1+ret)^(1/h) entre fechas
const geoCagr = (rets, h) => (rets.length ? Math.exp(mean(rets.map((r) => Math.log(Math.max(1 + r, 1e-6)) / h))) - 1 : null);
function rankAvg(a) {
  const o = a.map((v, i) => [v, i]).sort((x, y) => x[0] - y[0]);
  const r = new Array(a.length);
  for (let k = 0; k < o.length;) {
    let j = k; while (j + 1 < o.length && o[j + 1][0] === o[k][0]) j++;
    for (let m = k; m <= j; m++) r[o[m][1]] = (k + j) / 2;
    k = j + 1;
  }
  return r;
}
function spearman(x, y) {
  if (x.length < 10) return null;
  const rx = rankAvg(x), ry = rankAvg(y);
  const mx = mean(rx), my = mean(ry);
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < rx.length; i++) { const a = rx[i] - mx, b = ry[i] - my; sxy += a * b; sxx += a * a; syy += b * b; }
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : null;
}

// ---------- 3b) Sesgo de supervivencia y supuesto de deslistado
// El panel solo tiene precios de empresas que cotizan HOY. Se estima la tasa anual λ a la que desaparecen las empresas
// listadas comparando, por fecha, la fracción de emisores con ventas en la SEC que tenemos con precio contra la de hoy
// (la de hoy mide la parte que nunca cotizó en NYSE/Nasdaq: OTC, solo deuda). S_t = cov_t / cov_hoy ≈ (1−λ)^(años).
// Con λ, la fracción del universo real que deja de cotizar dentro de un horizonte h es d_h = 1 − (1−λ)^h.
// Esas empresas no están en el panel; su resultado se modela como una mezcla (literatura de EE.UU.: Shumway 1997,
// Doidge-Karolyi-Stulz 2017): ~55% compradas con prima (M ≈ 1.25 · 1.07^(h/2)) y ~45% fallidas (M ≈ 0.15).
const NOW_Y = new Date().getUTCFullYear() + new Date().getUTCMonth() / 12;
const covOf = (d) => { const c = panel.coverage?.[d]; return c?.secFilers > 0 ? c.secInPanel / c.secFilers : null; };
const lastD = panel.dates[panel.dates.length - 1];
const covNow = covOf(lastD);
const lamByDate = {};
for (const d of panel.dates) {
  const c = covOf(d), yrs = NOW_Y - (yearOf(d) + 0.33);
  if (c && covNow && yrs >= 4) lamByDate[d] = 1 - Math.pow(Math.min(1, c / covNow), 1 / yrs);
}
const lamVals = Object.values(lamByDate).filter((x) => x > 0).sort((a, b) => a - b);
const LAMBDA = lamVals.length ? Math.min(0.12, Math.max(0.03, lamVals[lamVals.length >> 1])) : 0.07;
const DELIST = {
  central: { merger: 0.55, failMult: 0.15 },
  pessimist: { merger: 0.4, failMult: 0.05 },
  optimist: { merger: 0.7, failMult: 0.3 },
};
const mergerMult = (h) => 1.25 * Math.pow(1.07, h / 2);
const delistMean = (h, k = "central") => DELIST[k].merger * mergerMult(h) + (1 - DELIST[k].merger) * DELIST[k].failMult;
const dOf = (h) => 1 - Math.pow(1 - LAMBDA, h);
// Retorno de un portafolio corregido: (1 − d_h) · observado + d_h · resultado esperado de las deslistadas
const survAdj = (r, h, k = "central") => (ok(r) ? (1 - dOf(h)) * r + dOf(h) * (delistMean(h, k) - 1) : null);
console.log(`Supervivencia: λ = ${(LAMBDA * 100).toFixed(1)}%/año (por fecha: ${Object.entries(lamByDate).map(([d, l]) => yearOf(d) + " " + (l * 100).toFixed(1)).join(", ")}); d_5 = ${(dOf(5) * 100).toFixed(0)}%, M deslistadas 5a = ${delistMean(5).toFixed(2)}`);

// ---------- 3c) Calibración empírica: percentil del ranking del modelo → distribución del múltiplo realizado
const EDGES = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0.95, 0.98, 0.995, 1];
const ZS = [-1.6, -1.0, -0.6, -0.3, 0, 0.3, 0.6, 1.0, 1.6];
const NQ = 50, QL = Array.from({ length: NQ }, (_, k) => (k + 0.5) / NQ);
const binOf = (q) => { for (let b = EDGES.length - 2; b >= 0; b--) if (q >= EDGES[b]) return b; return 0; };
// cuantiles ponderados (en log)
function wQuant(pts) { // pts: [[M, w]]
  const a = pts.filter(([m, w]) => m > 0 && w > 0).map(([m, w]) => [Math.log(m), w]).sort((x, y) => x[0] - y[0]);
  const W = a.reduce((s, p) => s + p[1], 0);
  const out = []; let acc = 0, k = 0;
  for (const lv of QL) {
    const target = lv * W;
    while (k < a.length - 1 && acc + a[k][1] < target) { acc += a[k][1]; k++; }
    out.push(Math.exp(a[k][0]));
  }
  return out;
}
// tabla: pool [[rankPct, M]] → por bin { n, q[50], pLoss, pHalf, p2x, p5x, p10x, mean, meanLog }
function calTable(pool, h, mix) {
  const all = pool.filter(([q, m]) => ok(q) && m > 0);
  if (all.length < 200) return null;
  const d = mix ? dOf(h) : 0, ms = DELIST.central.merger;
  const mm = mergerMult(h), fm = DELIST.central.failMult;
  const probs = (pts) => {
    const W = pts.reduce((s, p) => s + p[1], 0);
    const f = (pred) => pts.reduce((s, [m, w]) => s + (pred(m) ? w : 0), 0) / W;
    return { W, pLoss: f((m) => m < 1), pHalf: f((m) => m < 0.5), p2x: f((m) => m >= 2), p5x: f((m) => m >= 5), p10x: f((m) => m >= 10),
      mean: pts.reduce((s, [m, w]) => s + m * w, 0) / W, meanLog: pts.reduce((s, [m, w]) => s + Math.log(m) * w, 0) / W };
  };
  const withMix = (obs) => {
    const n = obs.length, pts = obs.map((m) => [m, 1]);
    if (d > 0) {
      // cada grupo de deslistadas como una distribución (no un punto): compradas ~ lognormal(mm, σ=0.3),
      // fallidas ~ lognormal(0.15, σ=0.9) acotada a [0.005, 0.9]
      const wd = (n * d) / (1 - d);
      for (const z of ZS) {
        pts.push([mm * Math.exp(0.3 * z), (wd * ms) / ZS.length]);
        pts.push([Math.min(0.9, Math.max(0.005, fm * Math.exp(0.9 * z))), (wd * (1 - ms)) / ZS.length]);
      }
    }
    return pts;
  };
  const glob = probs(withMix(all.map(([, m]) => m)));
  const A = 25; // pseudo-observaciones del universo (encogimiento bayesiano de cada tramo hacia el universo)
  const bins = [];
  for (let b = 0; b < EDGES.length - 1; b++) {
    const mem = all.filter(([q]) => binOf(q) === b);
    if (mem.length < 15) { bins.push(null); continue; }
    const pts = withMix(mem.map(([, m]) => m));
    const p = probs(pts);
    const sh = (k) => (p[k] * p.W + glob[k] * A) / (p.W + A);
    bins.push({
      lo: EDGES[b], hi: EDGES[b + 1], n: mem.length, rank: mem.reduce((s, [q]) => s + q, 0) / mem.length,
      q: wQuant(pts), pLoss: sh("pLoss"), pHalf: sh("pHalf"), p2x: sh("p2x"), p5x: sh("p5x"), p10x: sh("p10x"),
      mean: p.mean, meanLog: p.meanLog,
    });
  }
  return { h, mixed: !!mix, n: all.length, bins, universe: { ...glob, q: wQuant(withMix(all.map(([, m]) => m))) } };
}
const qAt = (q, lv) => { const x = lv * NQ - 0.5; const k = Math.max(0, Math.min(NQ - 2, Math.floor(x))); const t = Math.max(0, Math.min(1, x - k)); return Math.exp(Math.log(q[k]) * (1 - t) + Math.log(q[k + 1]) * t); };

// ---------- 4) Correr el modelo fecha por fecha
// "signals" se excluye: sus señales (insiders, revisiones…) no existen en el histórico, solo con su valor de hoy.
const THEORIES = Object.entries(PRESETS).filter(([id]) => id !== "custom" && id !== "signals");
const byDate = Object.fromEntries(THEORIES.map(([id]) => [id, Object.fromEntries(HORIZONS.map((h) => [h, []]))]));
const ic = Object.fromEntries(THEORIES.map(([id]) => [id, { 1: [], 5: [] }]));
const calPool = Object.fromEntries(THEORIES.map(([id]) => [id, []])); // [expCagr, retorno 5a] de fechas no parciales
const rankPool = Object.fromEntries(THEORIES.map(([id]) => [id, Object.fromEntries(HORIZONS.map((h) => [h, []]))])); // [rankPct, M, año]
const randTest = Object.fromEntries(HORIZONS.map((h) => [h, []]));
const BASELINES = [
  ["cheap_ps", "Más baratas por P/S", "ps", -1], ["cheap_pe", "Más baratas por P/E", "pe", -1], ["fcf_yield", "Mayor FCF yield", "fcf_yield", 1],
  ["roic", "Mayor ROIC (calidad)", "roic", 1], ["growth", "Mayor crecimiento de ventas", "rev_g", 1], ["small", "Más pequeñas (tamaño)", "mcap", -1],
];
const baseRows = Object.fromEntries(BASELINES.map(([id]) => [id, Object.fromEntries(HORIZONS.map((h) => [h, []]))]));
const hits = Object.fromEntries(THEORIES.map(([id]) => [id, Object.fromEntries(HORIZONS.map((h) => [h, { n: 0, x10: 0 }]))]));
const timing = [];

for (const date of panel.dates) {
  if (!panel.snapshots[date]) { console.warn(`⚠ ${date}: sin snapshot, se omite`); continue; }
  const td = Date.now();
  // engine.js guarda cachés a nivel de módulo (percentiles por id de métrica y confianza por D.n): limpiar por fecha
  clearRankCache();
  clearConfidenceCache();
  const { idx, D } = buildD(date);
  const F = panel.fwd?.[date] || {};
  const isPartial = (h) => !!panel.partial?.[date]?.[h];
  const DLs = Object.fromEntries(HORIZONS.map((h) => [h, new Set(panel.delisted?.[date]?.[h] || [])]));
  // fwdOf: retorno observado completo (null si no hay precio final). retSel: lo que habría vivido quien la eligió —
  // si dejó de cotizar antes del horizonte, último precio con castigo de deslistado de −15% (promedio de compras y
  // quiebras); si no hay ningún precio posterior, el resultado esperado de una deslistada.
  const fwdOf = (h, j) => { const v = F[h]?.[idx[j]]; return ok(v) && !DLs[h].has(idx[j]) ? v : null; };
  const retSel = (h, j) => {
    const v = F[h]?.[idx[j]];
    if (ok(v)) return DLs[h].has(idx[j]) ? (1 + v) * 0.85 - 1 : v;
    return isPartial(h) ? null : delistMean(h) - 1;
  };
  let passingN = 0;
  for (const [tid, P] of THEORIES) {
    const R = runModel(D, { weights: P.weights, params: P.params, horizon: H_MODEL });
    const passing = [];
    for (let j = 0; j < D.n; j++) if (passesFilters(D, j, DEFAULT_FILTERS)) passing.push(j);
    passingN = passing.length;
    const ranked = passing.filter((j) => !Number.isNaN(R.cagr[j])).sort((a, b) => R.elog[b] - R.elog[a]);
    const NR = ranked.length;
    const rankPct = new Map(ranked.map((j, k) => [j, NR > 1 ? 1 - k / (NR - 1) : 0.5]));
    const kellyCache = new Map(); // mismas 5 empresas en varios horizontes → mismo cálculo de pesos
    for (const h of HORIZONS) {
      // Selección SIN mirar el futuro: se eligen las primeras del ranking aunque luego dejen de cotizar (retSel).
      // elig (con retorno observado completo) solo se usa para IC y calibración condicional.
      const elig = ranked.filter((j) => fwdOf(h, j) != null);
      const uni = ranked.filter((j) => retSel(h, j) != null);
      const top = (k) => { const v = ranked.slice(0, k).map((j) => retSel(h, j)); return v.some((x) => x == null) ? null : ew(v); };
      // Portafolio de 5 con pesos Kelly de portafolio (tope 40%), igual que la app
      const p5 = ranked.slice(0, NPORT);
      const key = p5.join(",");
      if (!kellyCache.has(key)) {
        const picks = p5.map((j) => ({ j, ...evaluate(companyInputs(D, j, R.quality[j]), H_MODEL, P.params, R.score[j], true), score: R.score[j] }));
        kellyCache.set(key, { picks, w: buildWeights(picks, "kelly", 0.4) });
      }
      const { picks, w } = kellyCache.get(key);
      const top5 = picks.length && picks.every((p) => retSel(h, p.j) != null) ? picks.reduce((s, p, k) => s + w[k] * retSel(h, p.j), 0) : null;
      const row = {
        date, partial: isPartial(h), n: elig.length, nRanked: ranked.length, nPassing: passing.length,
        missingTop20: ranked.slice(0, 20).filter((j) => fwdOf(h, j) == null).length,
        top5, top5eq: top(NPORT), top20: top(20), top50: top(50), decile1: top(Math.max(1, Math.ceil(NR / 10))),
        universe: ew(uni.map((j) => retSel(h, j))), spy: ok(panel.spy?.[date]?.[h]) ? panel.spy[date][h] : null,
        delistedTop20: ranked.slice(0, 20).filter((j) => DLs[h].has(idx[j]) || !ok(F[h]?.[idx[j]])).length,
        picks: picks.map((p, k) => ({ ticker: D.ticker[p.j], name: D.name[p.j], weight: w[k], expCagr: R.cagr[p.j], ret: retSel(h, p.j) })),
      };
      byDate[tid][h].push(row);
      if (!row.partial) {
        const hr = hits[tid][h];
        for (const j of ranked.slice(0, 20)) { const r = retSel(h, j); if (r == null) continue; hr.n++; if (r >= 9) hr.x10++; }
        if (h === 5) for (const j of elig) calPool[tid].push([R.cagr[j], fwdOf(5, j)]);
        for (const j of elig) rankPool[tid][h].push([rankPct.get(j), 1 + fwdOf(h, j), yearOf(date)]);
        if (tid === "adn") {
          // Prueba contra el azar: 2,000 portafolios aleatorios de 20 del mismo universo rankeado
          const t20 = row.top20, pool = uni.map((j) => retSel(h, j));
          if (ok(t20) && pool.length > 40) {
            let st = 1234567 + yearOf(date) * 31 + h, below = 0;
            const rnd = () => { st = (st * 1103515245 + 12345) % 2147483648; return st / 2147483648; };
            for (let s = 0; s < 2000; s++) { let a = 0; for (let k = 0; k < 20; k++) a += pool[Math.floor(rnd() * pool.length)]; if (a / 20 < t20) below++; }
            randTest[h].push({ date, pct: below / 2000, excessVsUniverse: t20 - row.universe, excessVsSpy: ok(row.spy) ? t20 - row.spy : null });
          }
          // Estrategias factoriales simples (top 20 igual ponderado, mismos filtros)
          for (const [bid, , key, dir] of BASELINES) {
            const cand = passing.filter((j) => ok(D.cols[key][j]) && (key !== "pe" || D.cols.pe[j] > 0)).sort((a, b) => dir * (D.cols[key][b] - D.cols[key][a]));
            const v = cand.slice(0, 20).map((j) => retSel(h, j));
            if (v.length === 20 && v.every(ok)) baseRows[bid][h].push({ date, top20: ew(v) });
          }
        }
      }
      if (h === 1 || h === 5) ic[tid][h].push({ date, partial: row.partial, n: elig.length, ic: spearman(elig.map((j) => R.cagr[j]), elig.map((j) => fwdOf(h, j))) });
    }
  }
  const ms = Date.now() - td;
  timing.push(ms);
  const a5 = byDate.adn?.[5]?.at(-1);
  console.log(`${date}: D.n=${D.n}, pasan filtros=${passingN}, ${ms} ms` + (a5 ? ` | adn 5a top5=${a5.top5?.toFixed(2)} top20=${a5.top20?.toFixed(2)} univ=${a5.universe?.toFixed(2)} spy=${a5.spy}` : ""));
}

// ---------- 5) Resumen (solo fechas no parciales)
const summary = {};
for (const [tid] of THEORIES) {
  summary[tid] = {};
  for (const h of HORIZONS) {
    const rows = byDate[tid][h].filter((r) => !r.partial);
    const col = (k) => rows.map((r) => r[k]).filter(ok);
    const win = (k) => { const v = rows.filter((r) => ok(r[k]) && ok(r.spy)); return v.length ? v.filter((r) => r[k] > r.spy).length / v.length : null; };
    const hr = hits[tid][h];
    summary[tid][h] = {
      periods: rows.length,
      top5Cagr: geoCagr(col("top5"), h), top20Cagr: geoCagr(col("top20"), h), top50Cagr: geoCagr(col("top50"), h),
      decile1Cagr: geoCagr(col("decile1"), h), universeCagr: geoCagr(col("universe"), h), spyCagr: geoCagr(col("spy"), h),
      top5EqCagr: geoCagr(col("top5eq"), h),
      adj: Object.fromEntries(Object.keys(DELIST).map((k) => [k, {
        top5Cagr: geoCagr(col("top5").map((r) => survAdj(r, h, k)), h), top20Cagr: geoCagr(col("top20").map((r) => survAdj(r, h, k)), h),
        top50Cagr: geoCagr(col("top50").map((r) => survAdj(r, h, k)), h), universeCagr: geoCagr(col("universe").map((r) => survAdj(r, h, k)), h),
      }])),
      top5WinRateVsSpy: win("top5"), top20WinRateVsSpy: win("top20"), top50WinRateVsSpy: win("top50"), universeWinRateVsSpy: win("universe"),
      hitRate10x: hr.n ? hr.x10 / hr.n : null, hitRate10xN: hr.n,
      meanIc: h === 1 || h === 5 ? mean(ic[tid][h].filter((r) => !r.partial && ok(r.ic)).map((r) => r.ic)) : undefined,
    };
  }
}

// ---------- 6) Calibración a 5 años: deciles del CAGR esperado (pool de todas las fechas no parciales)
const calibration = {};
for (const [tid] of THEORIES) {
  const pool = calPool[tid].filter(([e, r]) => ok(e) && ok(r)).sort((a, b) => b[0] - a[0]);
  const out = [];
  for (let d = 0; d < 10 && pool.length >= 10; d++) {
    const seg = pool.slice(Math.floor((d * pool.length) / 10), Math.floor(((d + 1) * pool.length) / 10));
    const real = seg.map(([, r]) => annual(r, 5));
    out.push({
      decile: d + 1, n: seg.length, expCagr: mean(seg.map(([e]) => e)),
      realCagr: median(real), realCagrMean: mean(real), realCagrPooled: geoCagr(seg.map(([, r]) => r), 5),
    });
  }
  calibration[tid] = out;
}

// ---------- 6b) Tablas de calibración por percentil de ranking (con mezcla de deslistadas) para la app
const calTables = {};
for (const [tid] of THEORIES) { calTables[tid] = {}; for (const h of HORIZONS) { const t = calTable(rankPool[tid][h], h, true); if (t) calTables[tid][h] = t; } }

// ---------- 6c) Validación walk-forward (fuera de muestra) de la calibración, teoría ADN, sin mezcla:
// para cada cohorte de prueba t la tabla se arma SOLO con cohortes cuyo resultado ya se conocía en t (año + h ≤ año t).
const oos = {};
for (const h of HORIZONS) {
  const pool = rankPool.adn[h];
  const years = [...new Set(pool.map((p) => p[2]))].sort((a, b) => a - b);
  let nObs = 0, bs2 = 0, bs2c = 0, bsL = 0, bsLc = 0, in80 = 0, aboveMed = 0;
  const cohorts = [];
  const rel = EDGES.slice(0, -1).map(() => ({ n: 0, p2x: 0, real2x: 0, predMedLog: 0, realLogs: [] }));
  for (const ty of years) {
    const train = pool.filter((p) => p[2] + h <= ty);
    if (new Set(train.map((p) => p[2])).size < 3) continue;
    const T = calTable(train, h, false);
    if (!T) continue;
    const test = pool.filter((p) => p[2] === ty);
    cohorts.push(ty);
    for (const [q, m] of test) {
      const B = T.bins[binOf(q)] || T.universe;
      const y2 = m >= 2 ? 1 : 0, yL = m < 1 ? 1 : 0;
      bs2 += (B.p2x - y2) ** 2; bs2c += (T.universe.p2x - y2) ** 2;
      bsL += (B.pLoss - yL) ** 2; bsLc += (T.universe.pLoss - yL) ** 2;
      if (m >= qAt(B.q, 0.1) && m <= qAt(B.q, 0.9)) in80++;
      if (m > qAt(B.q, 0.5)) aboveMed++;
      const r = rel[binOf(q)]; r.n++; r.p2x += B.p2x; r.real2x += y2; r.predMedLog += Math.log(qAt(B.q, 0.5)); r.realLogs.push(Math.log(m));
      nObs++;
    }
  }
  if (!nObs) continue;
  oos[h] = {
    cohorts, n: nObs,
    brier2x: bs2 / nObs, brier2xClim: bs2c / nObs, skill2x: 1 - bs2 / bs2c,
    brierLoss: bsL / nObs, brierLossClim: bsLc / nObs, skillLoss: 1 - bsL / bsLc,
    coverage80: in80 / nObs, aboveMedian: aboveMed / nObs,
    reliability: rel.map((r, b) => (r.n ? { lo: EDGES[b], hi: EDGES[b + 1], n: r.n, pred2x: r.p2x / r.n, real2x: r.real2x / r.n,
      predMedianCagr: Math.exp(r.predMedLog / r.n / h) - 1, realMedianCagr: Math.exp(median(r.realLogs) / h) - 1 } : null)).filter(Boolean),
  };
}

// ---------- 6d) Significancia: top 20 de ADN contra 2,000 portafolios aleatorios por cohorte. Con h = 1 las cohortes
// anuales no se solapan (independientes); con h > 1 se solapan y el error estándar real es mayor que el mostrado.
function erf(x) { const t = 1 / (1 + 0.3275911 * Math.abs(x)); const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x); return x >= 0 ? y : -y; }
const significance = {};
for (const h of HORIZONS) {
  const rows = randTest[h].filter((r) => !panel.partial?.[r.date]?.[h]);
  if (rows.length < 3) continue;
  const n = rows.length, mp = mean(rows.map((r) => r.pct));
  const ex = rows.map((r) => r.excessVsUniverse).filter(ok).map((x) => Math.pow(Math.max(1 + x, 1e-6), 1 / h) - 1);
  const mx = mean(ex), sd = Math.sqrt(ex.reduce((s, x) => s + (x - mx) ** 2, 0) / Math.max(1, ex.length - 1));
  const z = (mp - 0.5) / Math.sqrt(1 / 12 / n);
  const pOne = 0.5 * (1 - erf(z / Math.SQRT2));
  significance[h] = { cohorts: n, overlapping: h > 1, meanPercentile: mp, z, pValue: pOne, beatRandomMedian: rows.filter((r) => r.pct > 0.5).length / n,
    meanAnnualExcessVsUniverse: mx, tStat: ex.length > 2 ? mx / (sd / Math.sqrt(ex.length)) : null, byDate: rows };
}

// ---------- 6e) Comparación con estrategias factoriales simples
const baselines = BASELINES.map(([id, name]) => ({ id, name, summary: Object.fromEntries(HORIZONS.map((h) => {
  const rows = baseRows[id][h].filter((r) => !panel.partial?.[r.date]?.[h]);
  return [h, { periods: rows.length, top20Cagr: geoCagr(rows.map((r) => r.top20), h), top20CagrAdj: geoCagr(rows.map((r) => survAdj(r.top20, h)), h) }];
})) }));

// ---------- 7) Escribir public/backtest.json (sin NaN/Infinity; números redondeados)
const result = {
  version: 1, runAt: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"), universe: "EE.UU. (SEC XBRL)",
  synthetic: !!panel.synthetic || undefined, panelBuiltAt: panel.builtAt || null,
  dates: panel.dates.filter((d) => panel.snapshots[d]), filters: { ...DEFAULT_FILTERS }, modelHorizon: H_MODEL,
  notes: [
    ...(panel.notes || []),
    "Mismo motor que la app (src/engine.js + src/model.js), horizonte del modelo 5 años, filtros por defecto, todas las teorías menos Personalizado.",
    "Ranking por CAGR esperado. top5 = 5 primeras con pesos Kelly de portafolio (tope 40%); top20/top50/decile1/universe = igual ponderado.",
    "Se omiten las empresas sin retorno observado en el horizonte (n = rankeadas con retorno); missingTop20 = cuántas del top 20 original no tenían retorno.",
    "Sin datos históricos de consenso, crecimiento trimestral, Piotroski ni aceleración: van como null (percentil 35 para todas).",
    hasSic ? "Industria aproximada desde el SIC (solo cíclicas, financieras y fondos de inversión); margen neto de industria = mediana por grupo." : "Sin SIC: una sola industria ('Miscellaneous'), margen neto de industria 7%, ninguna se trata como cíclica ni financiera.",
    "Los horizontes de 3 y 5 años se solapan entre fechas de rebalanceo anuales: los periodos no son independientes.",
    "CAGR del resumen = media geométrica de (1+ret)^(1/h) entre fechas no parciales. hitRate10x = % de nombres del top 20 con ret ≥ 9 (10x).",
  ],
  theories: THEORIES.map(([id, P]) => ({ id, name: P.name })),
  horizons: HORIZONS, byDate, summary, calibration, ic,
  survivorship: { lambda: LAMBDA, lambdaByDate: lamByDate, delistedShare: Object.fromEntries(HORIZONS.map((h) => [h, dOf(h)])),
    delistModel: Object.fromEntries(Object.entries(DELIST).map(([k, v]) => [k, { ...v, meanByH: Object.fromEntries(HORIZONS.map((h) => [h, delistMean(h, k)])) }])),
    coverage: Object.fromEntries(panel.dates.map((d) => [d, { secFilers: panel.coverage?.[d]?.secFilers, inPanel: panel.coverage?.[d]?.secInPanel }])) },
  oos, significance, baselines,
};
const rnd = (k, v) => (typeof v === "number" ? (Number.isFinite(v) ? Math.round(v * 1e4) / 1e4 : null) : v);
mkdirSync(dirname(outPath), { recursive: true });
const json = JSON.stringify(result, rnd);
if (/NaN|Infinity/.test(json.replace(/"[^"]*"/g, ""))) throw new Error("El JSON contiene NaN/Infinity");
writeFileSync(outPath, json);
// Tablas de calibración para la app (archivo aparte, lo carga el screener)
const calOut = { version: 2, runAt: result.runAt, universe: result.universe, edges: EDGES, levels: NQ, horizons: HORIZONS,
  lambda: LAMBDA, delistShare: result.survivorship.delistedShare, tables: calTables,
  oos: Object.fromEntries(Object.entries(oos).map(([h, o]) => [h, { cohorts: o.cohorts, n: o.n, skill2x: o.skill2x, skillLoss: o.skillLoss, coverage80: o.coverage80, aboveMedian: o.aboveMedian }])) };
const calPath = resolve(dirname(outPath), "calibration.json");
writeFileSync(calPath, JSON.stringify(calOut, rnd));
console.log("OK", calPath);
for (const h of HORIZONS) { const o = oos[h]; if (o) console.log(`OOS ${h}a: cohortes ${o.cohorts.join(",")} n=${o.n} skill P(2x)=${o.skill2x.toFixed(3)} skill P(pérdida)=${o.skillLoss.toFixed(3)} cobertura 80%=${o.coverage80.toFixed(3)} sobre mediana=${o.aboveMedian.toFixed(3)}`); }
for (const h of HORIZONS) { const g = significance[h]; if (g) console.log(`Azar ${h}a: cohortes ${g.cohorts} percentil medio ${g.meanPercentile.toFixed(3)} z=${g.z.toFixed(2)} p=${g.pValue.toFixed(4)} exceso anual vs universo ${(g.meanAnnualExcessVsUniverse * 100).toFixed(2)}pp t=${g.tStat?.toFixed(2)}`); }
for (const b of baselines) console.log("Base", b.id, HORIZONS.map((h) => h + "a " + (b.summary[h].top20Cagr * 100).toFixed(1) + "% (adj " + (b.summary[h].top20CagrAdj * 100).toFixed(1) + "%)").join(" | "));
for (const h of HORIZONS) { const a = summary.adn?.[h]?.adj?.central; if (a) console.log(`adn ${h}a corregido: top5=${a.top5Cagr?.toFixed(3)} top20=${a.top20Cagr?.toFixed(3)} univ=${a.universeCagr?.toFixed(3)}`); }
const T5 = calTables.adn?.[5]; if (T5) for (const b of T5.bins) if (b) console.log(`cal5 [${b.lo}-${b.hi}] n=${b.n} mediana=${qAt(b.q, 0.5).toFixed(2)} p10=${qAt(b.q, 0.1).toFixed(2)} p90=${qAt(b.q, 0.9).toFixed(2)} P(pérd)=${b.pLoss.toFixed(2)} P2x=${b.p2x.toFixed(2)} P5x=${b.p5x.toFixed(3)} P10x=${b.p10x.toFixed(3)} mean=${b.mean.toFixed(2)}`);
const tm = timing.length ? timing.reduce((a, b) => a + b, 0) / timing.length : 0;
console.log(`OK ${outPath} (${(json.length / 1024).toFixed(0)} KB) — ${timing.length} fechas, ${tm.toFixed(0)} ms/fecha promedio, total ${((Date.now() - t0) / 1000).toFixed(1)} s`);
for (const h of HORIZONS) {
  const s = summary.adn?.[h];
  if (s) console.log(`adn ${h}a: periodos=${s.periods} top5=${s.top5Cagr?.toFixed(3)} top20=${s.top20Cagr?.toFixed(3)} top50=${s.top50Cagr?.toFixed(3)} univ=${s.universeCagr?.toFixed(3)} spy=${s.spyCagr?.toFixed(3)} win5=${s.top5WinRateVsSpy} win20=${s.top20WinRateVsSpy} 10x=${s.hitRate10x?.toFixed(3)}`);
}
