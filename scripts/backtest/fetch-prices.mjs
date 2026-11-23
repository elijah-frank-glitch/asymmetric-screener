// Descarga el historial MENSUAL de precios (2009 → hoy) de Yahoo Finance para las empresas de EE.UU. que cotizan hoy
// en NYSE / Nasdaq / NYSE American (según data/backtest/raw/tickers.json de la SEC), más SPY.
// Un ticker por CIK (el primero que lista la SEC = la clase principal); se omiten OTC, CBOE, TXSE y sin bolsa.
//   node scripts/backtest/fetch-prices.mjs [--force] [--only AAPL,MSFT]
// Salida: data/backtest/prices/<T>.json → { t:[unix], c:[cierre ajustado por splits], a:[adjclose (splits+dividendos)],
//                                          v:[volumen mensual], splits:[[unix, ratio]] }   (gitignored)
// Reanudable: si el archivo ya existe se salta (salvo --force). Los tickers sin datos se anotan en _missing.json.
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";

const RAW = new URL("../../data/backtest/raw/", import.meta.url);
const OUT = new URL("../../data/backtest/prices/", import.meta.url);
mkdirSync(OUT, { recursive: true });
const force = process.argv.includes("--force");
const onlyArg = (() => { const i = process.argv.indexOf("--only"); return i > 0 ? process.argv[i + 1].split(",") : null; })();
const EXCH = new Set(["NYSE", "Nasdaq", "NYSE American", "NYSE MKT", "NYSE Arca", "AMEX"]);

const tk = JSON.parse(readFileSync(new URL("tickers.json", RAW)));
const counts = {};
for (const r of tk.data) counts[r[3] ?? "null"] = (counts[r[3] ?? "null"] || 0) + 1;
const seen = new Set();
const list = [];
for (const [cik, , ticker, ex] of tk.data) {
  if (!EXCH.has(ex) || !ticker || seen.has(cik)) continue;
  seen.add(cik);
  list.push(ticker);
}
list.push("SPY");
const todo = (onlyArg || list).filter((t) => force || onlyArg || !existsSync(new URL(`${t}.json`, OUT)));
console.log("Filas por bolsa en tickers.json:", counts);
console.log(`Tickers objetivo (1 por CIK, NYSE/Nasdaq/NYSE American + SPY): ${list.length}; pendientes: ${todo.length}`);

const P1 = Math.floor(Date.UTC(2009, 0, 1) / 1000);
const P2 = Math.floor(Date.now() / 1000);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sig = (x, d = 6) => (x == null || !Number.isFinite(x) ? null : Number(x.toPrecision(d)));
const yahooSym = (t) => t.replace(/\./g, "-"); // BRK.B → BRK-B

async function fetchOne(t) {
  const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSym(t))}?period1=${P1}&period2=${P2}&interval=1mo&events=split,div`;
  for (let a = 1; a <= 6; a++) {
    let r;
    try { r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } }); }
    catch { await sleep(2000 * a); continue; }
    if (r.status === 404) return null;
    if (r.status === 429 || r.status >= 500) { await sleep(3000 * a * a); continue; }
    if (!r.ok) return null;
    const j = await r.json().catch(() => null);
    const res = j?.chart?.result?.[0];
    if (!res?.timestamp?.length) return null;
    const q = res.indicators?.quote?.[0] || {};
    const adj = res.indicators?.adjclose?.[0]?.adjclose || q.close;
    const o = { t: [], c: [], a: [], v: [], splits: [] };
    res.timestamp.forEach((ts, i) => {
      if (q.close?.[i] == null) return; // meses sin cierre
      o.t.push(ts); o.c.push(sig(q.close[i])); o.a.push(sig(adj?.[i])); o.v.push(q.volume?.[i] ?? null);
    });
    for (const s of Object.values(res.events?.splits || {})) if (s.numerator > 0 && s.denominator > 0) o.splits.push([s.date, sig(s.numerator / s.denominator)]);
    o.splits.sort((x, y) => x[0] - y[0]);
    return o.t.length ? o : null;
  }
  throw new Error("reintentos agotados " + t);
}

const missingFile = new URL("_missing.json", OUT);
const missing = existsSync(missingFile) && !force ? JSON.parse(readFileSync(missingFile)) : [];
const missSet = new Set(missing);
const queue = todo.filter((t) => !missSet.has(t));
let done = 0, ok = 0, fail = 0;
const t0 = Date.now();
async function worker() {
  while (queue.length) {
    const t = queue.shift();
    try {
      const o = await fetchOne(t);
      if (o) { writeFileSync(new URL(`${t}.json`, OUT), JSON.stringify(o)); ok++; }
      else { missSet.add(t); fail++; }
    } catch (e) { console.warn("⚠", e.message); fail++; }
    if (++done % 250 === 0) {
      console.log(`${done}/${todo.length} (ok ${ok}, sin datos ${fail}) ${((Date.now() - t0) / 1000).toFixed(0)} s`);
      writeFileSync(missingFile, JSON.stringify([...missSet]));
    }
    await sleep(120);
  }
}
await Promise.all(Array.from({ length: 6 }, worker));
writeFileSync(missingFile, JSON.stringify([...missSet]));
const have = list.filter((t) => existsSync(new URL(`${t}.json`, OUT))).length;
console.log(`OK fetch-prices: ${ok} nuevos, ${fail} sin datos. Cobertura: ${have}/${list.length} (${((100 * have) / list.length).toFixed(1)}%)`);
