// Utilidades compartidas para pedir precios de cierre y tipos de cambio al escáner público de TradingView.
// Usado por snapshot-predictions.mjs y build-track.mjs.

import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const UA = { "Content-Type": "application/json", "User-Agent": "Mozilla/5.0" };
const BATCH = 500;

export const BENCHMARKS = [
  { sym: "AMEX:SPY", label: "S&P 500 (SPY)" },
  { sym: "NASDAQ:ACWI", label: "MSCI ACWI (ACWI)" },
];

// Monedas de subunidad: código → [moneda base, divisor]
export const SUBUNITS = { GBX: ["GBP", 100], ILA: ["ILS", 100], ZAC: ["ZAR", 100], KWF: ["KWD", 1000] };

async function post(url, body, tries = 4) {
  let last;
  for (let attempt = 1; attempt <= tries; attempt++) {
    try {
      const r = await fetch(url, { method: "POST", headers: UA, body: JSON.stringify(body), signal: AbortSignal.timeout(30000) });
      if (!r.ok) throw new Error("HTTP " + r.status);
      return await r.json();
    } catch (e) {
      last = e;
      console.warn(`  ${url.split("/")[3]} intento ${attempt} falló: ${e.message}`);
      if (attempt < tries) await new Promise((res) => setTimeout(res, 1500 * attempt));
    }
  }
  throw new Error(`TradingView no respondió (${last?.message || "error"})`);
}

// Cierres actuales: { "EXCH:TICK": { close, currency } }. Símbolos sin precio simplemente no aparecen.
// Lanza error si algún lote falla después de los reintentos.
export async function fetchCloses(symbols) {
  const uniq = [...new Set(symbols)];
  const out = {};
  for (let k = 0; k < uniq.length; k += BATCH) {
    const tickers = uniq.slice(k, k + BATCH);
    const j = await post("https://scanner.tradingview.com/global/scan", { symbols: { tickers }, columns: ["close", "currency"] });
    for (const d of j.data || []) {
      const [close, currency] = d.d;
      if (typeof close === "number" && Number.isFinite(close) && close > 0) out[d.s] = { close, currency: currency || null };
    }
  }
  return out;
}

// Tipos de cambio: 1 unidad de cada moneda = X USD. Maneja subunidades e intenta el par inverso si falta el directo.
// Devuelve { fx: {CUR: number}, missing: [CUR] }.
export async function fetchFx(currencies) {
  const curs = [...new Set(currencies.filter(Boolean))];
  const bases = [...new Set(curs.map((c) => (SUBUNITS[c] ? SUBUNITS[c][0] : c)).filter((c) => c !== "USD"))];
  const rate = { USD: 1 };
  if (bases.length) {
    const j = await post("https://scanner.tradingview.com/forex/scan", { symbols: { tickers: bases.map((b) => `FX_IDC:${b}USD`) }, columns: ["close"] });
    for (const d of j.data || []) {
      const v = d.d[0];
      if (typeof v === "number" && v > 0) rate[d.s.slice(7, 10)] = v;
    }
    const inv = bases.filter((b) => !rate[b]);
    if (inv.length) {
      const j2 = await post("https://scanner.tradingview.com/forex/scan", { symbols: { tickers: inv.map((b) => `FX_IDC:USD${b}`) }, columns: ["close"] });
      for (const d of j2.data || []) {
        const v = d.d[0];
        if (typeof v === "number" && v > 0) rate[d.s.slice(10, 13)] = 1 / v;
      }
    }
  }
  const fx = {}, missing = [];
  for (const c of curs) {
    const [b, div] = SUBUNITS[c] || [c, 1];
    if (rate[b]) fx[c] = rate[b] / div;
    else missing.push(c);
  }
  return { fx, missing };
}

// Redondeo a cifras significativas (para tipos de cambio y precios con muchos decimales espurios)
export const sig = (x, d = 8) => (typeof x === "number" && Number.isFinite(x) ? Number(x.toPrecision(d)) : null);
export const rnd = (x, d = 4) => (typeof x === "number" && Number.isFinite(x) ? Number(x.toFixed(d)) : null);

// Argumento --dir o variable PREDICTIONS_DIR para el directorio de snapshots
export function predictionsDir(root) {
  const a = process.argv.indexOf("--dir");
  const p = a > 0 && process.argv[a + 1] ? process.argv[a + 1] : process.env.PREDICTIONS_DIR;
  if (p) { const u = pathToFileURL(resolve(p)); if (!u.href.endsWith("/")) u.pathname += "/"; return u; }
  return new URL("data/predictions/", root);
}
