// Dilución histórica EE.UU. para el universo de HOY (docs/SIGNALS_CONTRACT.md §2) → data/dilution_us.json
//   { builtAt, rows: { "NASDAQ:AAPL": [sharesG1, sharesG3] } }   (% anual; + = dilución, − = recompras)
// Fuentes LOCALES (no descarga nada; la SEC ya está en data/backtest/raw/ vía scripts/backtest/fetch-sec.mjs):
//   data/backtest/raw/EntityCommonStockSharesOutstanding_CY{Y}Q4I.json, WeightedAverageNumberOfDilutedSharesOutstanding_CY{Y}.json
//   data/backtest/raw/tickers.json (CIK → ticker SEC), data/backtest/prices/<T>.json (splits de Yahoo, si existen)
//   data/universe.json (símbolo de TradingView: rows[i][0] = "NASDAQ:AAPL", rows[i][1] = ticker, rows[i][3] = bolsa)
// Misma lógica que el panel del backtest (scripts/backtest/shares-growth.mjs), así lo validado allí aplica aquí.
//   node scripts/build-dilution-us.mjs [--year 2025]
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { sharesGrowth } from "./backtest/shares-growth.mjs";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const RAW = resolve(ROOT, "data/backtest/raw");
const PRICES = resolve(ROOT, "data/backtest/prices");
const OUT = resolve(ROOT, "data/dilution_us.json");
const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const NOW = Date.now();
// Último año calendario con frames: el de hoy − 1 (los 10-K de CY{hoy−1} ya se presentaron si estamos después de abril)
const LAST = Number(arg("--year")) || new Date(NOW).getUTCFullYear() - 1;
const YEARS = Array.from({ length: 6 }, (_, k) => LAST - 5 + k); // 3 años atrás del último + holgura
const US = new Set(["NASDAQ", "NYSE", "AMEX"]);

// ---------- Frames: concepto → año → Map(cik → [valor, finMs])
function loadFrames(concept, suffix) {
  const out = {};
  for (const Y of YEARS) {
    const f = resolve(RAW, `${concept}_CY${Y}${suffix}.json`);
    const m = new Map();
    if (existsSync(f)) {
      for (const [cik, [val, end]] of Object.entries(JSON.parse(readFileSync(f, "utf8"))))
        if (typeof val === "number" && Number.isFinite(val) && val > 0) m.set(Number(cik), [val, Date.parse(end + "T00:00:00Z")]);
    } else console.warn("⚠ falta", f);
    out[Y] = m;
  }
  return out;
}
const DEI = loadFrames("EntityCommonStockSharesOutstanding", "Q4I");
const DIL = loadFrames("WeightedAverageNumberOfDilutedSharesOutstanding", "");

// ---------- Ticker SEC → CIK (TradingView usa "." para clases: BRK.B; la SEC usa "-": BRK-B)
const tk = JSON.parse(readFileSync(resolve(RAW, "tickers.json"), "utf8"));
const cikOf = new Map(), secTicker = new Map();
for (const [cik, , ticker] of tk.data) {
  if (!ticker) continue;
  const k = ticker.toUpperCase().replace(/-/g, ".");
  if (!cikOf.has(k)) { cikOf.set(k, cik); secTicker.set(k, ticker); }
}

// ---------- Universo de hoy
let buf = readFileSync(resolve(ROOT, existsSync(resolve(ROOT, "data/universe.json")) ? "data/universe.json" : "data/universe.json.gz"));
if (buf[0] === 0x1f && buf[1] === 0x8b) buf = gunzipSync(buf);
const uni = JSON.parse(buf.toString("utf8"));
buf = null;

const rows = {};
const stat = { us: 0, cik: 0, out: 0, g1: 0, g3: 0, splitsYahoo: 0, dei: 0, dil: 0, stale: 0 };
const r2 = (x) => (x == null ? null : Math.round(x * 100) / 100);
const latest = (F, cik) => { for (let Y = LAST; Y >= LAST - 1; Y--) if (F[Y]?.has(cik)) return Y; return null; };
for (const r of uni.rows) {
  const sym = r[0];
  const ex = sym.split(":")[0];
  if (!US.has(ex)) continue;
  stat.us++;
  const t = String(r[1] || sym.split(":")[1]).toUpperCase();
  const cik = cikOf.get(t) ?? cikOf.get(t.replace(/\./g, ""));
  if (cik == null) continue;
  stat.cik++;
  // Splits de Yahoo (archivo de precios del backtest), en ms
  // listedMs: primera barra mensual si es posterior al inicio del historial (2009-01) → IPO / de-SPAC / relisting
  let splits = null, listedMs = null; // sin archivo de precios: splits = null → detección de splits por múltiplo entero
  const pf = resolve(PRICES, `${secTicker.get(t) || t}.json`);
  if (existsSync(pf)) {
    const p = JSON.parse(readFileSync(pf, "utf8"));
    splits = (p.splits || []).map(([s, x]) => [s * 1000, x]);
    if (p.t?.length && p.t[0] * 1000 > Date.parse("2009-03-01T00:00:00Z")) listedMs = p.t[0] * 1000;
    stat.splitsYahoo++;
  }
  // Solo frames recientes (último o penúltimo año); si la empresa dejó de reportar, sin dato
  const deiY = latest(DEI, cik), dilY = latest(DIL, cik);
  if (deiY == null && dilY == null) { stat.stale++; continue; }
  const g = sharesGrowth({ dei: (Y) => DEI[Y]?.get(cik) || null, dil: (Y) => DIL[Y]?.get(cik) || null, splits, deiY, dilY, listedMs, now: NOW });
  if (g.g1 == null && g.g3 == null) continue;
  rows[sym] = [r2(g.g1), r2(g.g3)];
  stat.out++; if (g.g1 != null) stat.g1++; if (g.g3 != null) stat.g3++; if (g.src) stat[g.src]++;
}
writeFileSync(OUT, JSON.stringify({ builtAt: new Date(NOW).toISOString(), lastFrameYear: LAST, rows }));
console.log(`OK build-dilution-us: universo EE.UU. ${stat.us}, con CIK ${stat.cik}, con dato ${stat.out} (g1 ${stat.g1}, g3 ${stat.g3}; fuente dei ${stat.dei}, diluidas ${stat.dil}; splits de Yahoo ${stat.splitsYahoo}; sin frames recientes ${stat.stale}) → ${OUT}`);
