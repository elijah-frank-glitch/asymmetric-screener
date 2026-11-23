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
const H_MODEL = 5, HORIZONS = [1, 3, 5], NPORT = 5;

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

// ---------- 4) Correr el modelo fecha por fecha
const THEORIES = Object.entries(PRESETS).filter(([id]) => id !== "custom");
const byDate = Object.fromEntries(THEORIES.map(([id]) => [id, Object.fromEntries(HORIZONS.map((h) => [h, []]))]));
const ic = Object.fromEntries(THEORIES.map(([id]) => [id, { 1: [], 5: [] }]));
const calPool = Object.fromEntries(THEORIES.map(([id]) => [id, []])); // [expCagr, retorno 5a] de fechas no parciales
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
  const fwdOf = (h, j) => { const v = F[h]?.[idx[j]]; return ok(v) ? v : null; };
  const isPartial = (h) => !!panel.partial?.[date]?.[h];
  let passingN = 0;
  for (const [tid, P] of THEORIES) {
    const R = runModel(D, { weights: P.weights, params: P.params, horizon: H_MODEL });
    const passing = [];
    for (let j = 0; j < D.n; j++) if (passesFilters(D, j, DEFAULT_FILTERS)) passing.push(j);
    passingN = passing.length;
    const ranked = passing.filter((j) => !Number.isNaN(R.cagr[j])).sort((a, b) => R.elog[b] - R.elog[a]);
    const kellyCache = new Map(); // mismas 5 empresas en varios horizontes → mismo cálculo de pesos
    for (const h of HORIZONS) {
      // Elegibles = rankeadas con retorno observado en este horizonte (las que no tienen precio final se omiten)
      const elig = ranked.filter((j) => fwdOf(h, j) != null);
      const uni = passing.filter((j) => fwdOf(h, j) != null);
      const top = (k) => ew(elig.slice(0, k).map((j) => fwdOf(h, j)));
      // Portafolio de 5 con pesos Kelly de portafolio (tope 40%), igual que la app
      const p5 = elig.slice(0, NPORT);
      const key = p5.join(",");
      if (!kellyCache.has(key)) {
        const picks = p5.map((j) => ({ j, ...evaluate(companyInputs(D, j, R.quality[j]), H_MODEL, P.params, R.score[j], true), score: R.score[j] }));
        kellyCache.set(key, { picks, w: buildWeights(picks, "kelly", 0.4) });
      }
      const { picks, w } = kellyCache.get(key);
      const top5 = picks.length ? picks.reduce((s, p, k) => s + w[k] * fwdOf(h, p.j), 0) : null;
      const row = {
        date, partial: isPartial(h), n: elig.length, nRanked: ranked.length, nPassing: passing.length,
        missingTop20: ranked.slice(0, 20).filter((j) => fwdOf(h, j) == null).length,
        top5, top20: top(20), top50: top(50), decile1: top(Math.max(1, Math.ceil(elig.length / 10))),
        universe: ew(uni.map((j) => fwdOf(h, j))), spy: ok(panel.spy?.[date]?.[h]) ? panel.spy[date][h] : null,
        picks: picks.map((p, k) => ({ ticker: D.ticker[p.j], name: D.name[p.j], weight: w[k], expCagr: R.cagr[p.j], ret: fwdOf(h, p.j) })),
      };
      byDate[tid][h].push(row);
      if (!row.partial) {
        const hr = hits[tid][h];
        for (const j of elig.slice(0, 20)) { hr.n++; if (fwdOf(h, j) >= 9) hr.x10++; }
        if (h === 5) for (const j of elig) calPool[tid].push([R.cagr[j], fwdOf(5, j)]);
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
};
const rnd = (k, v) => (typeof v === "number" ? (Number.isFinite(v) ? Math.round(v * 1e4) / 1e4 : null) : v);
mkdirSync(dirname(outPath), { recursive: true });
const json = JSON.stringify(result, rnd);
if (/NaN|Infinity/.test(json.replace(/"[^"]*"/g, ""))) throw new Error("El JSON contiene NaN/Infinity");
writeFileSync(outPath, json);
const tm = timing.length ? timing.reduce((a, b) => a + b, 0) / timing.length : 0;
console.log(`OK ${outPath} (${(json.length / 1024).toFixed(0)} KB) — ${timing.length} fechas, ${tm.toFixed(0)} ms/fecha promedio, total ${((Date.now() - t0) / 1000).toFixed(1)} s`);
for (const h of HORIZONS) {
  const s = summary.adn?.[h];
  if (s) console.log(`adn ${h}a: periodos=${s.periods} top5=${s.top5Cagr?.toFixed(3)} top20=${s.top20Cagr?.toFixed(3)} top50=${s.top50Cagr?.toFixed(3)} univ=${s.universeCagr?.toFixed(3)} spy=${s.spyCagr?.toFixed(3)} win5=${s.top5WinRateVsSpy} win20=${s.top20WinRateVsSpy} 10x=${s.hitRate10x?.toFixed(3)}`);
}
