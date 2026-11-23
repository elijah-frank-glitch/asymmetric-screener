// Investigación de variantes del modelo sobre el panel del backtest (NO escribe public/backtest.json).
// Usa COPIAS de model/engine en scripts/backtest/variants/ (src/ no se toca; re-sincronizadas con src → V por defecto = producción). Misma construcción de D que run-backtest.mjs.
//   node scripts/backtest/research.mjs [--only base,elog,...] [--json out.json]
// Protocolo: TRAIN = rebalanceos 2011–2017 (5a y 1a); TEST = 2018–2021 a 5a, y 2018–2024 a 1a (extra fuera de muestra).
// Se eligen variantes SOLO con TRAIN.
import { readFileSync, writeFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { runModel, passesFilters, DEFAULT_FILTERS, clearRankCache, clearConfidenceCache, CORE_IDS } from "./variants/engine.js";
import { PRESETS, setVariant } from "./variants/model.js";
import { METRICS } from "../metrics.mjs";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const H_MODEL = 5;
const P = PRESETS.adn;

let buf = readFileSync(ROOT + "data/backtest/panel.json.gz");
if (buf[0] === 0x1f && buf[1] === 0x8b) buf = gunzipSync(buf);
const panel = JSON.parse(buf.toString("utf8"));
buf = null;
const NC = panel.companies.length;

// ---------- D por fecha (copia de run-backtest.mjs; el panel actual no trae SIC → una sola industria)
const hasSic = panel.companies.some((c) => Number.isFinite(c.sic));
if (hasSic) console.warn("⚠ El panel trae SIC: este arnés no replica la clasificación por industria de run-backtest.mjs");
const industries = ["Miscellaneous"], sectors = ["—", "Finance"];
const exchanges = [...new Set(panel.companies.map((c) => c.exchange || ""))];
const exchangeOf = panel.companies.map((c) => exchanges.indexOf(c.exchange || ""));
const baseDirs = Object.fromEntries(METRICS.map((m) => [m.id, m.better || 1]));
const panelCols = new Set(Object.values(panel.snapshots).flatMap((s) => Object.keys(s.cols || {})));
const COL_IDS = [...new Set([...CORE_IDS, ...panelCols])];
function buildD(date, dirs) {
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
  const co = idx.map((i) => panel.companies[i]);
  return {
    idx,
    D: {
      n, cols, dirs, ticker: co.map((c) => c.ticker || String(c.cik)), name: co.map((c) => c.name || ""),
      sym: co.map((c) => c.ticker), common: new Array(n).fill(1), exchange: idx.map((i) => exchangeOf[i]), exchanges,
      country: new Array(n).fill(0), countries: ["United States"], sector: new Array(n).fill(0), sectors,
      industry: new Array(n).fill(0), industries, indNM: [7],
    },
  };
}

// ---------- Variantes del MODELO (requieren recalcular): params, dirección de métricas, perillas V de model.js
const MODEL_VARIANTS = {
  base: {},
  anchor50: { params: { marketAnchor: 0.5 } },
  anchor70: { params: { marketAnchor: 0.7 } },
  offlowFlip: { dirs: { off_low: 1 } }, // preferir cerca de máximos (momentum) en vez de cerca de mínimos
  revertStrong: { V: { revertBase: 0.1, revertCyc: 0.0, revertQual: 0.25, cycSpeedMult: 2.5 } },
  // extra (tras diagnóstico SOLO de TRAIN: en el decil 1, P/S alto, margen alto y crecimiento 15–50% rinden peor → persistencia/múltiplo de crecimiento sobreestimados)
  persistLow: { params: { persistBase: 0.45, persistQual: 0.25 } },
  peCap25: { params: { peCap: 25 } },
  shrink50: { params: { shrink: 0.5 } },
  // combinación elegida en TRAIN: persistLow + anchor70 + revertStrong
  // Dilución (shares_g3 del panel): peso en el score ADN (mejor = menos dilución) y dilución observada en projectScenario
  sg3w5: { weights: { shares_g3: 5 }, dirs: { shares_g3: -1 } },
  sg3w8: { weights: { shares_g3: 8 }, dirs: { shares_g3: -1 } },
  sg3w12: { weights: { shares_g3: 12 }, dirs: { shares_g3: -1 } },
  dilReal: { V: { dilMode: "real" } },
  dilBlend: { V: { dilMode: "blend" } },
  w8blend: { weights: { shares_g3: 8 }, dirs: { shares_g3: -1 }, V: { dilMode: "blend" } }, // combinación elegida en TRAIN
  combo: { params: { persistBase: 0.45, persistQual: 0.25, marketAnchor: 0.7 }, V: { revertBase: 0.1, revertCyc: 0.0, revertQual: 0.25, cycSpeedMult: 2.5 } },
};

const ok = (x) => typeof x === "number" && Number.isFinite(x);
const fin = (x) => (ok(x) ? x : null);
const recsCache = {};
function records(mv) {
  if (recsCache[mv]) return recsCache[mv];
  const spec = MODEL_VARIANTS[mv];
  setVariant(spec.V);
  const dirs = { ...baseDirs, ...(spec.dirs || {}) };
  const params = { ...P.params, ...(spec.params || {}) };
  const out = {};
  for (const date of panel.dates) {
    clearRankCache(); clearConfidenceCache();
    const { idx, D } = buildD(date, dirs);
    const R = runModel(D, { weights: { ...P.weights, ...(spec.weights || {}) }, params, horizon: H_MODEL });
    const F = panel.fwd[date] || {};
    const rs = [];
    for (let j = 0; j < D.n; j++) {
      if (!passesFilters(D, j, DEFAULT_FILTERS) || Number.isNaN(R.cagr[j])) continue;
      const c = (k) => fin(D.cols[k]?.[j]);
      rs.push({
        t: D.ticker[j], cagr: R.cagr[j], score: R.score[j], elog: R.elog[j], growth: R.growth[j], conf: R.conf[j],
        nm: c("nm"), fcf_m: c("fcf_m"), pe: c("pe"), ps: c("ps"), rev_g: c("rev_g"), mcap: c("mcap"), off_low: c("off_low"), sg3: c("shares_g3"),
        f1: fin(F[1]?.[idx[j]]), f5: fin(F[5]?.[idx[j]]),
      });
    }
    out[date] = rs;
  }
  setVariant({});
  return (recsCache[mv] = out);
}

// ---------- Variantes de RANKING (post-proceso): clave de orden y compuertas
const pctRank = (rs, f) => {
  const o = rs.map((r, i) => [f(r), i]).sort((a, b) => a[0] - b[0]);
  const p = new Array(rs.length);
  o.forEach(([, i], k) => (p[i] = rs.length > 1 ? k / (rs.length - 1) : 0.5));
  return p;
};
const KEYS = {
  cagr: (rs) => rs.map((r) => r.cagr),
  elog: (rs) => rs.map((r) => r.elog),
  score: (rs) => rs.map((r) => r.score),
  cap20: (rs) => rs.map((r) => (r.cagr < 0.2 ? r.cagr : 0.2 + 0.01 * r.score)), // tope 20%; sobre el tope ordena el score
  blend05: (rs) => { const a = pctRank(rs, (r) => r.cagr), b = pctRank(rs, (r) => r.score); return a.map((x, i) => x + 0.5 * b[i]); },
  blend1: (rs) => { const a = pctRank(rs, (r) => r.cagr), b = pctRank(rs, (r) => r.score); return a.map((x, i) => x + b[i]); },
  fold15: (rs) => rs.map((r) => (r.cagr <= 0.15 ? r.cagr : 0.3 - r.cagr)), // >15% esperado = sospechoso: se pliega
  blendElog1: (rs) => { const a = pctRank(rs, (r) => r.elog), b = pctRank(rs, (r) => r.score); return a.map((x, i) => x + b[i]); },
};
const GATES = {
  profitable: (r) => r.fcf_m > 0 && r.nm > 0,
  fcfPos: (r) => r.fcf_m > 0,
  conf70: (r) => r.conf >= 0.7 - 1e-6,
  noTrap: (r) => !(r.pe != null && r.pe > 0 && r.pe < 4) && !(r.ps != null && r.ps < 0.1) && !(r.rev_g != null && r.rev_g > 100),
  noMicro: (r) => r.mcap >= 3e8,
  smallOnly: (r) => r.mcap < 2e9,
  dil10: (r) => !(r.sg3 > 10), // excluye diluidores > 10%/año (CAGR 3a); sin dato pasa
  dil5: (r) => !(r.sg3 > 5),
};

let VARIANTS = [
  { id: "base", m: "base", key: "cagr" },
  // H1: expectativas extremas = ruido → ordenar por crecimiento log esperado o CAGR con tope
  { id: "elog", m: "base", key: "elog" },
  { id: "cap20", m: "base", key: "cap20" },
  // H2: mezcla con el score ADN
  { id: "blend05", m: "base", key: "blend05" },
  { id: "blend1", m: "base", key: "blend1" },
  { id: "scoreOnly", m: "base", key: "score" },
  // H3: compuertas de calidad
  { id: "profitable", m: "base", key: "cagr", gates: ["profitable"] },
  { id: "conf70", m: "base", key: "cagr", gates: ["conf70"] },
  { id: "noTrap", m: "base", key: "cagr", gates: ["noTrap"] },
  // H4: momentum vs reversión
  { id: "offlowFlip", m: "offlowFlip", key: "cagr" },
  // H5: reversión de márgenes / anclaje al P/E de mercado
  { id: "anchor50", m: "anchor50", key: "cagr" },
  { id: "anchor70", m: "anchor70", key: "cagr" },
  { id: "revertStrong", m: "revertStrong", key: "cagr" },
  // H6: tamaño
  { id: "noMicro", m: "base", key: "cagr", gates: ["noMicro"] },
  { id: "smallOnly", m: "base", key: "cagr", gates: ["smallOnly"] },
  // extra post-diagnóstico
  { id: "persistLow", m: "persistLow", key: "cagr" },
  { id: "peCap25", m: "peCap25", key: "cagr" },
  { id: "shrink50", m: "shrink50", key: "cagr" },
  { id: "fold15", m: "base", key: "fold15" },
  // combinaciones (elegidas en TRAIN)
  { id: "comboA", m: "combo", key: "elog" },
  { id: "comboA_cagr", m: "combo", key: "cagr" },
  { id: "comboA_fold", m: "combo", key: "fold15" },
  // Dilución (producción actual = ranking por elog con el preset ADN de src)
  { id: "prod", m: "base", key: "elog" },
  { id: "sg3w5", m: "sg3w5", key: "elog" },
  { id: "sg3w8", m: "sg3w8", key: "elog" },
  { id: "sg3w12", m: "sg3w12", key: "elog" },
  { id: "gate10", m: "base", key: "elog", gates: ["dil10"] },
  { id: "gate5", m: "base", key: "elog", gates: ["dil5"] },
  { id: "dilReal", m: "dilReal", key: "elog" },
  { id: "dilBlend", m: "dilBlend", key: "elog" },
  { id: "w8blend", m: "w8blend", key: "elog" },
];
// Combinaciones (definidas DESPUÉS de mirar solo TRAIN; ver reporte)
const COMBOS = JSON.parse(arg("--combos") || "[]");
VARIANTS.push(...COMBOS);
const only = arg("--only");
if (only) VARIANTS = VARIANTS.filter((v) => only.split(",").includes(v.id));

// ---------- Estadística
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
const median = (a) => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const ann = (r, h) => Math.pow(Math.max(1 + r, 1e-6), 1 / h) - 1;
const geo = (rets, h) => (rets.length ? Math.exp(mean(rets.map((r) => Math.log(Math.max(1 + r, 1e-6)) / h))) - 1 : null);
function rankAvg(a) {
  const o = a.map((v, i) => [v, i]).sort((x, y) => x[0] - y[0]);
  const r = new Array(a.length);
  for (let k = 0; k < o.length;) { let j = k; while (j + 1 < o.length && o[j + 1][0] === o[k][0]) j++; for (let m = k; m <= j; m++) r[o[m][1]] = (k + j) / 2; k = j + 1; }
  return r;
}
function spearman(x, y) {
  const rx = rankAvg(x), ry = rankAvg(y), mx = mean(rx), my = mean(ry);
  let a = 0, b = 0, c = 0;
  for (let i = 0; i < rx.length; i++) { const u = rx[i] - mx, v = ry[i] - my; a += u * v; b += u * u; c += v * v; }
  return a / Math.sqrt(b * c);
}
const yr = (d) => Number(d.slice(0, 4));

function evalVariant(v, y0, y1, h) {
  const recs = records(v.m);
  const per = [];
  const poolMc = [];
  const poolD1 = [], poolD10 = [], cal = Array.from({ length: 10 }, () => ({ e: [], r: [] }));
  for (const date of panel.dates) {
    if (yr(date) < y0 || yr(date) > y1) continue;
    if (panel.partial?.[date]?.[h]) continue;
    const fk = h === 5 ? "f5" : "f1";
    let rs = recs[date];
    for (const g of v.gates || []) rs = rs.filter(GATES[g]);
    rs = rs.filter((r) => r[fk] != null);
    const key = KEYS[v.key](rs);
    const ord = rs.map((r, i) => [key[i], r]).sort((a, b) => b[0] - a[0]).map((x) => x[1]);
    const n = ord.length, nd = Math.ceil(n / 10);
    const ew = (a) => mean(a.map((r) => r[fk]));
    const d1 = ord.slice(0, nd), d10 = ord.slice(n - nd);
    d1.forEach((r) => { poolD1.push(r[fk]); poolMc.push(Math.log10(r.mcap)); }); d10.forEach((r) => poolD10.push(r[fk]));
    for (let d = 0; d < 10; d++) for (const r of ord.slice(Math.floor((d * n) / 10), Math.floor(((d + 1) * n) / 10))) { cal[d].e.push(r.cagr); cal[d].r.push(ann(r[fk], h)); }
    const spy = panel.spy?.[date]?.[h];
    per.push({ date, n, top20: ew(ord.slice(0, 20)), top50: ew(ord.slice(0, 50)), d1: ew(d1), d10: ew(d10), uni: ew(ord), spy, ic: spearman(key, rs.map((r) => r[fk])) });
  }
  const col = (k) => per.map((p) => p[k]).filter(ok);
  const calRows = cal.map((c) => ({ e: mean(c.e), r: median(c.r) })).filter((c) => ok(c.e) && ok(c.r));
  const me = mean(calRows.map((c) => c.e)), mr = mean(calRows.map((c) => c.r));
  const slope = calRows.reduce((s, c) => s + (c.e - me) * (c.r - mr), 0) / calRows.reduce((s, c) => s + (c.e - me) ** 2, 0);
  const d1a = poolD1.map((r) => ann(r, h)), d10a = poolD10.map((r) => ann(r, h));
  return {
    periods: per.length, n: Math.round(mean(col("n"))),
    d1Med: median(d1a), d1Mean: mean(d1a), d1Pool: geo(poolD1, h), d10Med: median(d10a), spread: median(d1a) - median(d10a),
    top20: geo(col("top20"), h), top50: geo(col("top50"), h), d1Ew: geo(col("d1"), h), uni: geo(col("uni"), h), spy: geo(col("spy"), h),
    beatD1: per.filter((p, k) => p.d1 > (v.basePer?.[k]?.d1 ?? Infinity)).length, beat20: per.filter((p, k) => p.top20 > (v.basePer?.[k]?.top20 ?? Infinity)).length,
    win20: per.filter((p) => p.top20 > p.spy).length / per.length, ic: mean(col("ic")), slope,
    d1Exp: calRows[0]?.e, per, cal: calRows, d1MeanLogMcap: mean(poolMc),
  };
}

// ---------- Correr y tabular
const WINDOWS = [["TRAIN5", 2011, 2017, 5], ["TEST5", 2018, 2021, 5], ["TRAIN1", 2011, 2017, 1], ["TEST1", 2018, 2024, 1]];
const res = {};
for (const v of VARIANTS) {
  res[v.id] = {};
  for (const [w, a, b, h] of WINDOWS) { v.basePer = (res.prod || res.base)?.[w]?.per; res[v.id][w] = evalVariant(v, a, b, h); }
}
const pc = (x, d = 1) => (ok(x) ? (x * 100).toFixed(d).padStart(6) : "    — ");
const f2 = (x) => (ok(x) ? x.toFixed(3).padStart(6) : "    — ");
for (const [w, , , h] of WINDOWS) {
  console.log(`\n=== ${w} (h=${h}a) — anualizado %; D1 = decil superior (pool de nombres); top20/top50/D1ew = CAGR geométrico entre fechas del portafolio EW`);
  console.log("variante        n  D1exp  D1med D1mean D1pool  D1ew  top20  top50  D10med spread  univ   spy  win20   IC   slope  >base(D1,t20)");
  for (const v of VARIANTS) {
    const r = res[v.id][w];
    console.log(`${v.id.padEnd(13)} ${String(r.n).padStart(4)} ${pc(r.d1Exp)} ${pc(r.d1Med)} ${pc(r.d1Mean)} ${pc(r.d1Pool)} ${pc(r.d1Ew)} ${pc(r.top20)} ${pc(r.top50)} ${pc(r.d10Med)} ${pc(r.spread)} ${pc(r.uni)} ${pc(r.spy)} ${f2(r.win20)} ${f2(r.ic)} ${f2(r.slope)}  ${r.beatD1}/${r.periods},${r.beat20}/${r.periods}`);
  }
}
if (arg("--json")) writeFileSync(arg("--json"), JSON.stringify(res, null, 1));

// ---------- Diagnóstico (--diag): ¿qué hay en el decil superior del modelo base? (solo TRAIN por defecto)
if (process.argv.includes("--diag")) {
  const [y0, y1] = (arg("--diagYears") || "2011-2017").split("-").map(Number);
  const recs = records("base");
  const top = [], all = [];
  for (const date of panel.dates) {
    if (yr(date) < y0 || yr(date) > y1 || panel.partial?.[date]?.[5]) continue;
    const rs = recs[date].filter((r) => r.f5 != null).sort((a, b) => b.cagr - a.cagr);
    const nd = Math.ceil(rs.length / 10);
    rs.forEach((r, k) => { r.dec = Math.floor((k * 10) / rs.length) + 1; all.push(r); if (k < nd) top.push(r); });
  }
  const grp = (name, rows, f, buckets) => {
    console.log(`\n${name}`);
    for (const [lab, test] of buckets) {
      const s = rows.filter((r) => test(f(r)));
      const a = s.map((r) => ann(r.f5, 5));
      console.log(`  ${lab.padEnd(18)} n=${String(s.length).padStart(5)} (${((s.length / rows.length) * 100).toFixed(0).padStart(3)}%)  med=${pc(median(a))} mean=${pc(mean(a))} pool=${pc(geo(s.map((r) => r.f5), 5))} exp=${pc(mean(s.map((r) => r.cagr)))}`);
    }
  };
  const nul = (x) => x == null;
  for (const [lab, rows] of [["DECIL 1", top], ["TODOS", all]]) {
    console.log(`\n##### ${lab} (${y0}-${y1}, 5a)`);
    grp("mcap", rows, (r) => r.mcap, [["<300M", (x) => x < 3e8], ["300M-1B", (x) => x >= 3e8 && x < 1e9], ["1-5B", (x) => x >= 1e9 && x < 5e9], [">5B", (x) => x >= 5e9]]);
    grp("nm (margen neto)", rows, (r) => r.nm, [["null", nul], ["<0", (x) => x != null && x < 0], ["0-10", (x) => x != null && x >= 0 && x < 10], [">=10", (x) => x != null && x >= 10]]);
    grp("fcf_m", rows, (r) => r.fcf_m, [["null", nul], ["<0", (x) => x != null && x < 0], [">=0", (x) => x != null && x >= 0]]);
    grp("pe", rows, (r) => r.pe, [["null/neg", (x) => x == null || x <= 0], ["<8", (x) => x > 0 && x < 8], ["8-15", (x) => x >= 8 && x < 15], ["15-30", (x) => x >= 15 && x < 30], [">=30", (x) => x >= 30]]);
    grp("ps", rows, (r) => r.ps, [["null", nul], ["<0.3", (x) => x != null && x < 0.3], ["0.3-1", (x) => x >= 0.3 && x < 1], ["1-3", (x) => x >= 1 && x < 3], [">=3", (x) => x >= 3]]);
    grp("rev_g", rows, (r) => r.rev_g, [["null", nul], ["<0", (x) => x != null && x < 0], ["0-15", (x) => x >= 0 && x < 15], ["15-50", (x) => x >= 15 && x < 50], [">=50", (x) => x >= 50]]);
    grp("off_low", rows, (r) => r.off_low, [["<10", (x) => x != null && x < 10], ["10-30", (x) => x >= 10 && x < 30], ["30-60", (x) => x >= 30 && x < 60], [">=60", (x) => x >= 60]]);
    grp("conf", rows, (r) => r.conf, [["<0.7", (x) => x < 0.7 - 1e-6], ["0.7-0.9", (x) => x >= 0.7 - 1e-6 && x < 0.9 - 1e-6], [">=0.9", (x) => x >= 0.9 - 1e-6]]);
    grp("score ADN", rows, (r) => r.score, [["<0.45", (x) => x < 0.45], ["0.45-0.55", (x) => x >= 0.45 && x < 0.55], [">=0.55", (x) => x >= 0.55]]);
    grp("cagr esperado", rows, (r) => r.cagr, [["<0", (x) => x < 0], ["0-10", (x) => x >= 0 && x < 0.1], ["10-20", (x) => x >= 0.1 && x < 0.2], ["20-30", (x) => x >= 0.2 && x < 0.3], [">=30", (x) => x >= 0.3]]);
  }
  grp("\nTODOS por decil", all, (r) => r.dec, Array.from({ length: 10 }, (_, d) => [`dec ${d + 1}`, (x) => x === d + 1]));
}

if (process.argv.includes("--deciles")) {
  for (const [w] of WINDOWS) {
    console.log("\nDeciles realizados (mediana anualizada %, decil 1 = mayor clave) " + w);
    for (const v of VARIANTS) console.log(v.id.padEnd(13), res[v.id][w].cal.map((c) => pc(c.r)).join(""), "  | log10 mcap medio D1:", res[v.id][w].d1MeanLogMcap.toFixed(2));
  }
}
