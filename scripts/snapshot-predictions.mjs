// Guarda una foto inmutable de lo que recomienda el modelo HOY: top 20 y portafolio de 5 (Kelly) por teoría,
// con precio de entrada, benchmarks y tipos de cambio. Salida: data/predictions/YYYY-MM-DD.json (fecha UTC).
// Contrato: docs/TRACK_CONTRACT.md §1. No sobrescribe un snapshot existente salvo con --force.
// Opcional: --dir <carpeta> o PREDICTIONS_DIR para escribir en otro directorio.
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { loadData } from "./load-node.mjs";
import { runModel, passesFilters, DEFAULT_FILTERS, companyInputs } from "../src/engine.js";
import { PRESETS, evaluate, buildWeights } from "../src/model.js";
import { BENCHMARKS, fetchCloses, fetchFx, rnd, sig, predictionsDir } from "./tv-prices.mjs";

const root = new URL("../", import.meta.url);
const H = 5, TOP = 20, NPORT = 5;
const now = new Date();
const date = now.toISOString().slice(0, 10);
const dir = predictionsDir(root);
const file = new URL(`${date}.json`, dir);
if (existsSync(file) && !process.argv.includes("--force")) {
  console.log(`Ya existe el snapshot ${date}; no se sobrescribe (usa --force).`);
  process.exit(0);
}

let commit = "local";
try { commit = execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim() || "local"; } catch {}

const { D, meta, core } = loadData();

// Universo: cuántas pasan los filtros default y su CAGR mediana (con la teoría default)
const theories = {};
let universe = null;
for (const [id, P] of Object.entries(PRESETS)) {
  if (id === "custom") continue;
  const R = runModel(D, { weights: P.weights, params: P.params, horizon: H });
  const ranked = [];
  let passing = 0;
  for (let i = 0; i < D.n; i++) {
    if (!passesFilters(D, i, DEFAULT_FILTERS)) continue;
    passing++;
    if (!Number.isNaN(R.cagr[i])) ranked.push(i);
  }
  ranked.sort((a, b) => R.cagr[b] - R.cagr[a]);
  if (id === "adn") {
    const c = ranked.map((i) => R.cagr[i]).sort((a, b) => a - b);
    const med = c.length ? (c.length % 2 ? c[(c.length - 1) / 2] : (c[c.length / 2 - 1] + c[c.length / 2]) / 2) : null;
    universe = { n: D.n, passing, medianCagr: rnd(med) };
  }
  const topIdx = ranked.slice(0, TOP);
  const top = topIdx.map((i, k) => ({
    rank: k + 1, sym: D.sym[i], ticker: D.ticker[i], name: D.name[i], country: meta.countries[D.country[i]],
    industry: meta.industries[D.industry[i]], currency: core.cur[i] || null, price: D.cols.price?.[i] ?? null,
    mcap: D.cols.mcap[i] != null ? Math.round(D.cols.mcap[i]) : null,
    cagr: rnd(R.cagr[i]), E: rnd(R.E[i]), bull: rnd(R.bull[i]), base: rnd(R.base[i]), bear: rnd(R.bear[i]),
    score: rnd(R.score[i]), conf: rnd(R.conf[i]), kelly: rnd(R.kelly[i]),
  }));
  // Portafolio: top 5 evaluadas con trayectorias, pesos Kelly de portafolio con tope 40%
  const picks = topIdx.slice(0, NPORT).map((i) => ({ i, ...evaluate(companyInputs(D, i, R.quality[i]), H, P.params, R.score[i], true), score: R.score[i] }));
  const w = buildWeights(picks, "kelly", 0.4);
  const portfolio = picks.map((p, j) => ({ sym: D.sym[p.i], weight: rnd(w[j]) }));
  // Ajuste de redondeo para que los pesos sumen exactamente 1
  const s = portfolio.reduce((a, p) => a + p.weight, 0);
  if (portfolio.length) portfolio[0].weight = rnd(portfolio[0].weight + (1 - s));
  theories[id] = { name: P.name, top, portfolio };
  console.log(`${id}: ${ranked.length} con CAGR, top ${top.length}, portafolio ${portfolio.map((p) => p.sym).join(", ")}`);
}

// Precio de entrada = último cierre de TradingView al momento del snapshot (si falla, el del universo descargado)
const syms = [...new Set(Object.values(theories).flatMap((t) => t.top.map((r) => r.sym)))];
let live = {};
try {
  live = await fetchCloses([...syms, ...BENCHMARKS.map((b) => b.sym)]);
} catch (e) {
  console.warn(`⚠ No se pudieron obtener cierres actuales (${e.message}); se usan los precios del universo.`);
}
for (const t of Object.values(theories))
  for (const r of t.top) {
    const l = live[r.sym];
    if (l) { r.price = l.close; if (l.currency) r.currency = l.currency; }
  }

const benchmarks = {};
for (const b of BENCHMARKS) {
  const l = live[b.sym];
  benchmarks[b.sym] = { label: b.label, close: l ? l.close : null, currency: l?.currency || "USD" };
}

const curs = [...new Set(["USD", ...Object.values(theories).flatMap((t) => t.top.map((r) => r.currency)), ...Object.values(benchmarks).map((b) => b.currency)])].filter(Boolean);
let fx = { USD: 1 };
try {
  const r = await fetchFx(curs);
  fx = Object.fromEntries(Object.entries(r.fx).map(([k, v]) => [k, sig(v)]));
  if (r.missing.length) console.warn(`⚠ Sin tipo de cambio para: ${r.missing.join(", ")}`);
} catch (e) {
  console.warn(`⚠ No se pudieron obtener tipos de cambio (${e.message}).`);
}

const snap = {
  version: 1, date, createdAt: now.toISOString().replace(/\.\d{3}Z$/, "Z"), dataFetchedAt: meta.fetchedAt, commit,
  horizon: H, filters: { ...DEFAULT_FILTERS }, universe, benchmarks, fx, theories,
};
mkdirSync(dir, { recursive: true });
writeFileSync(file, JSON.stringify(snap, null, 1));
console.log(`OK snapshot ${date}: ${Object.keys(theories).length} teorías, ${syms.length} símbolos, ${Object.keys(fx).length} monedas`);
