// Señales cualitativas globales desde Yahoo Finance (ver docs/SIGNALS_CONTRACT.md §1):
// propiedad de insiders / institucional, short interest, CEO fundador y revisiones del EPS estimado.
// Reanudable y con guardado atómico: data/signals.json
//   { fetchedAt, rows: { "EXCH:TICKER": [insiderPct, instPct, shortPct, founder, epsRev30, epsRev90, revUp30, revDown30, fetchedDay] } }
// Uso: node scripts/fetch-signals.mjs [--minMcap 50e6] [--maxAgeDays 6] [--budgetMin 100] [--limit N]
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { yahooCandidates, yahooAuth, quoteSummary, atomicSave } from "./yahoo.mjs";

// ---------- opciones
const opt = { minMcap: 50e6, maxAgeDays: 6, budgetMin: 100, limit: Infinity };
const argv = process.argv.slice(2);
for (let k = 0; k < argv.length; k++) {
  const m = argv[k].match(/^--(\w+)(?:=(.*))?$/);
  if (!m || !(m[1] in opt)) continue;
  const v = m[2] ?? argv[++k];
  opt[m[1]] = Number(v);
}
const CONC = 6;
const MODULES = "majorHoldersBreakdown,defaultKeyStatistics,earningsTrend,assetProfile";

const uni = JSON.parse(readFileSync(new URL("../data/universe.json", import.meta.url)));
const F = uni.fields;
const iName = F.indexOf("name"), iEx = F.indexOf("exchange"), iIsin = F.indexOf("isin"), iMcap = F.indexOf("market_cap_basic");
const cachePath = fileURLToPath(new URL("../data/signals.json", import.meta.url));
const cache = existsSync(cachePath) ? JSON.parse(readFileSync(cachePath)) : { fetchedAt: null, rows: {} };
cache.rows ||= {};

const today = new Date().toISOString().slice(0, 10);
const ageDays = (day) => (day ? (Date.parse(today) - Date.parse(day)) / 864e5 : Infinity);

// Pendientes: sin dato o con dato más viejo que maxAgeDays. Primero los que nunca se bajaron, luego los más viejos;
// dentro de cada grupo se respeta el orden del universo (capitalización descendente).
const todo = uni.rows
  .filter((r) => (r[iMcap] || 0) >= opt.minMcap)
  .map((r) => ({ r, age: ageDays(cache.rows[r[0]]?.[8]) }))
  .filter((x) => x.age > opt.maxAgeDays)
  .sort((a, b) => (b.age === Infinity) - (a.age === Infinity) || b.age - a.age)
  .slice(0, opt.limit)
  .map((x) => x.r);

// ---------- extracción
const raw = (x) => (x && typeof x.raw === "number" && Number.isFinite(x.raw) ? x.raw : null);
const pct = (x) => (x == null ? null : Number((x * 100).toFixed(3)));
const FOUNDER_RE = /founder|fundador|fundadora/i; // cubre "Co-Founder", "Cofounder", "Founder & CEO"
function revision(trend, key) {
  const cur = raw(trend?.current), old = raw(trend?.[key]);
  if (cur == null || old == null || old <= 0) return null;
  return Number(((cur / old - 1) * 100).toFixed(3));
}
function extract(res) {
  const mh = res.majorHoldersBreakdown || {}, ks = res.defaultKeyStatistics || {};
  const insider = raw(mh.insidersPercentHeld) ?? raw(ks.heldPercentInsiders);
  const inst = raw(mh.institutionsPercentHeld) ?? raw(ks.heldPercentInstitutions);
  const short = raw(ks.shortPercentOfFloat);
  const officers = res.assetProfile?.companyOfficers || [];
  const founder = officers.length ? (officers.some((o) => FOUNDER_RE.test(String(o.title || ""))) ? 1 : 0) : null;
  const t0 = (res.earningsTrend?.trend || []).find((t) => t.period === "0y");
  const rv = t0?.epsRevisions;
  const hasRev = rv && (raw(rv.upLast30days) != null || raw(rv.downLast30days) != null);
  return [
    pct(insider), pct(inst), pct(short), founder,
    revision(t0?.epsTrend, "30daysAgo"), revision(t0?.epsTrend, "90daysAgo"),
    hasRev ? raw(rv.upLast30days) ?? 0 : null, hasRev ? raw(rv.downLast30days) ?? 0 : null,
    today,
  ];
}
const useful = (res) => res && (res.majorHoldersBreakdown || res.defaultKeyStatistics || res.earningsTrend || res.assetProfile);

// ---------- descarga
await yahooAuth();
console.log(`pendientes: ${todo.length} (en caché: ${Object.keys(cache.rows).length}; minMcap ${opt.minMcap}, maxAgeDays ${opt.maxAgeDays}, budget ${opt.budgetMin} min)`);
const t0 = Date.now();
const overBudget = () => (Date.now() - t0) / 6e4 > opt.budgetMin;
let done = 0, found = 0, i = 0, stopped = false;
const save = () => { cache.fetchedAt = new Date().toISOString(); atomicSave(cachePath, cache); };
process.on("SIGINT", () => { save(); console.log("interrumpido: guardado"); process.exit(130); });

async function worker() {
  while (i < todo.length) {
    if (overBudget()) { stopped = true; return; }
    const row = todo[i++];
    let res = null;
    for (const y of yahooCandidates(row[iName], row[iEx], row[iIsin])) {
      try { res = await quoteSummary(y, MODULES); } catch { res = null; }
      if (useful(res)) break;
    }
    if (useful(res)) { cache.rows[row[0]] = extract(res); found++; }
    else cache.rows[row[0]] = [null, null, null, null, null, null, null, null, today]; // sin datos: se reintenta tras maxAgeDays
    if (++done % 250 === 0) { save(); console.log(`${done}/${todo.length} con datos ${found} (${((Date.now() - t0) / 6e4).toFixed(1)} min)`); }
  }
}
await Promise.all(Array.from({ length: CONC }, worker));
save();
console.log(`FIN${stopped ? " (presupuesto de tiempo agotado; continúa en la próxima corrida)" : ""}: ${done} procesados, ${found} con datos, ${todo.length - done} pendientes`);
