// Orquestación del modelo sobre todo el universo. Compartido por el navegador y el build.
import { percentileRanks, computeScores, evaluate, PRESETS, INFLATION } from "./model.js";

// Métricas que el modelo necesita siempre (además de las de los pesos)
export const MODEL_INPUTS = [
  "mcap", "revenue", "rev_g", "rev_g_q", "rev_cagr5", "rev_fwd_g", "gm", "nm", "fcf_m", "ebitda_m",
  "roic", "rd_rev", "net_cash", "div_yield", "buyback", "liq_usd", "ps", "pe", "altman", "runway", "shares_g3", "om", "mcap_fix", "fcf_yield",
];
export const CORE_IDS = [
  ...new Set([...MODEL_INPUTS, ...Object.values(PRESETS).flatMap((p) => Object.keys(p.weights))]),
];

// Industrias cuyas utilidades siguen ciclos de precios de commodities / capacidad
export const CYCLICAL = new Set([
  "Semiconductors", "Computer Peripherals", "Electronic Components", "Steel", "Aluminum", "Other Metals/Minerals",
  "Precious Metals", "Coal", "Oil & Gas Production", "Integrated Oil", "Oil Refining/Marketing", "Contract Drilling",
  "Oilfield Services/Equipment", "Marine Shipping", "Chemicals: Major Diversified", "Chemicals: Agricultural",
  "Forest Products", "Pulp & Paper", "Agricultural Commodities/Milling", "Homebuilding", "Airlines",
  "Construction Materials", "Trucking", "Motor Vehicles", "Real Estate Development", "Textiles",
]);

export const DEFAULT_FILTERS = {
  mcapMin: 100e6, mcapMax: null, liqMin: 100e3, requireRevenue: true, commonOnly: true, confMin: 0.5,
  accessibleOnly: false,
  sectors: [], countries: [], excludeIndustries: ["Investment Trusts/Mutual Funds"], search: "",
  ranges: [], // [{id, min, max}]
};

// Bolsas que un inversionista minorista en Latinoamérica suele poder comprar vía un bróker internacional
// (códigos de bolsa de TradingView). CBOE = listados de Cboe en EE.UU.
export const ACCESSIBLE_EXCHANGES = new Set([
  "NYSE", "NASDAQ", "AMEX", "CBOE", // EE.UU.
  "TSX", "TSXV", // Canadá
  "LSE", "XETR", "FWB", "EURONEXT", "SIX", "MIL", "BME", // Europa
  "OMXSTO", "OMXCOP", "OMXHEX", "OSL", // nórdicos
  "ASX", "TSE", "HKEX", "SGX", "NZX", // Asia-Pacífico
]);

// D: { n, cols: {id: array}, industry: Int array, industries: [name], indNM: [median %], dirs: {id: ±1} }
const rankCache = new Map();
export function getRank(D, id) {
  if (!rankCache.has(id)) rankCache.set(id, percentileRanks(D.cols[id], D.dirs[id] || 1));
  return rankCache.get(id);
}
export function clearRankCache() { rankCache.clear(); }

export function companyInputs(D, i, quality) {
  const c = { quality };
  for (const id of MODEL_INPUTS) c[id] = D.cols[id]?.[i];
  c.ind_nm = D.indNM[D.industry[i]];
  c.infl = INFLATION[D.countries[D.country[i]]] || 2.5;
  c.pe = D.cols.pe?.[i];
  const indName = D.industries[D.industry[i]];
  c.cyc = CYCLICAL.has(indName);
  c.fin = D.sectors[D.sector[i]] === "Finance";
  // Intermediarios financieros: su caja y su deuda son materia prima del negocio (depósitos, márgenes, reservas)
  c.interm = c.fin && /Banks|Brokers|Insurance|Financial Conglomerates|Savings/.test(indName || "");
  c.altman = D.cols.altman?.[i];
  c.runway = D.cols.runway?.[i];
  c.conf = confidenceAll(D)[i];
  return c;
}

export function computeQuality(D) {
  const parts = ["gm", "roic", "rd_rev"].map((k) => getRank(D, k));
  const q = new Float32Array(D.n);
  for (let i = 0; i < D.n; i++) {
    let s = 0, k = 0;
    for (const p of parts) if (!Number.isNaN(p[i])) { s += p[i]; k++; }
    q[i] = k ? s / k : 0.3;
  }
  return q;
}

// Integridad de datos (0..1) y motivos. NO es una probabilidad: es un puntaje heurístico que penaliza patrones que
// casi siempre son errores de datos, ganancias extraordinarias o contabilidad difícil de proyectar.
export function confidence(D, i) {
  const v = (k) => D.cols[k]?.[i];
  const ok = (x) => typeof x === "number" && Number.isFinite(x);
  let s = 1;
  const why = [];
  const pen = (p, m) => { s -= p; why.push(m); };
  if (!ok(v("gm"))) pen(0.15, "sin margen bruto");
  if (!ok(v("fcf_m"))) pen(0.1, "sin flujo de caja libre");
  if (!ok(v("rev_cagr5"))) pen(0.1, "sin historial de 5 años");
  if (!ok(v("rev_fwd_g"))) pen(0.1, "sin cobertura de analistas");
  if (ok(v("ps")) && v("ps") < 0.05) pen(0.35, "P/S < 0.05 (ingresos brutos tipo trading/holding)");
  if (ok(v("nm")) && v("nm") > 100) pen(0.5, "margen neto > 100%");
  else if (ok(v("nm")) && ok(v("gm")) && v("nm") > v("gm") * 0.85 && v("nm") > 5) pen(0.3, "utilidad neta ≈ utilidad bruta (extraordinarios)");
  if (ok(v("rev_g")) && Math.abs(v("rev_g")) > 300) pen(0.3, "crecimiento > 300% (adquisición, base baja o error)");
  else if (ok(v("rev_g")) && Math.abs(v("rev_g")) > 150) pen(0.15, "crecimiento > 150% (posible efecto de base baja o adquisición)");
  // P/E reportado o, si falta, implícito (capitalización / utilidad neta)
  const peEff = ok(v("pe")) && v("pe") > 0 ? v("pe") : v("nm") > 0 && v("revenue") > 0 && v("mcap") > 0 ? v("mcap") / (v("revenue") * v("nm") / 100) : null;
  const peTag = ok(v("pe")) && v("pe") > 0 ? "P/E" : "P/E implícito";
  if (ok(v("pe")) && v("pe") > 0 && v("nm") > 0 && v("revenue") > 0 && v("mcap") > 0) {
    const r = v("pe") / (v("mcap") / (v("revenue") * v("nm") / 100));
    if (r > 3 || r < 1 / 3) pen(0.3, "P/E no cuadra con la utilidad neta (minoritarios, preferentes o dato erróneo)");
  }
  if (peEff != null && peEff < 1) pen(0.5, peTag + " < 1 (derechos preferentes, minoritarios o dato erróneo)");
  else if (peEff != null && peEff < 3) pen(0.25, peTag + " < 3");
  if (ok(v("mcap_fix"))) pen(0.15, `capitalización reconciliada (TradingView ×${v("mcap_fix").toFixed(1)})`);
  if (ok(v("fcf_m")) && v("fcf_m") > 100) pen(0.3, "FCF > ventas (flujos de clientes o no operativos)");
  else if (ok(v("fcf_yield")) && v("fcf_yield") > 60) pen(0.25, "FCF yield > 60% (dato atípico)");
  if (ok(v("gm")) && v("gm") < 15 && ok(v("ps")) && v("ps") < 0.15) pen(0.3, "ingresos de paso (margen bruto < 15% y P/S < 0.15)");
  if (ok(v("om")) && ok(v("nm")) && v("nm") > v("om") + 10 && v("nm") > 10) pen(0.2, "utilidad neta muy superior a la operativa (no recurrente)");
  if (v("mcap") < 2e8) pen(0.1, "micro cap");
  if ((INFLATION[D.countries[D.country[i]]] || 0) >= 15) pen(0.15, "inflación alta");
  if (D.sectors[D.sector[i]] === "Finance") pen(0.1, "financiera (proyección por ventas menos fiable)");
  return { conf: Math.max(0, Math.min(1, s)), why };
}
let confCache = null;
// La caché se invalida solo si cambia D.n; el backtest corre varios D del mismo tamaño y la limpia entre fechas.
export function clearConfidenceCache() { confCache = null; }
export function confidenceAll(D) {
  if (!confCache || confCache.length !== D.n) {
    confCache = new Float32Array(D.n);
    for (let i = 0; i < D.n; i++) confCache[i] = confidence(D, i).conf;
  }
  return confCache;
}

export function passesFilters(D, i, F) {
  const mcap = D.cols.mcap[i];
  if (!(mcap > 0)) return false;
  if (F.confMin && confidenceAll(D)[i] < F.confMin) return false;
  if (F.mcapMin && mcap < F.mcapMin) return false;
  if (F.mcapMax && mcap > F.mcapMax) return false;
  if (F.liqMin && !(D.cols.liq_usd[i] >= F.liqMin)) return false;
  if (F.requireRevenue && !(D.cols.revenue[i] > 1e6)) return false;
  if (F.commonOnly && !D.common[i]) return false;
  if (F.accessibleOnly && D.exchanges && !ACCESSIBLE_EXCHANGES.has(D.exchanges[D.exchange[i]])) return false;
  if (F.sectors?.length && !F.sectors.includes(D.sectors[D.sector[i]])) return false;
  if (F.countries?.length && !F.countries.includes(D.countries[D.country[i]])) return false;
  if (F.excludeIndustries?.length && F.excludeIndustries.includes(D.industries[D.industry[i]])) return false;
  for (const r of F.ranges || []) {
    const v = D.cols[r.id]?.[i];
    if (r.min != null && r.min !== "" && !(v >= Number(r.min))) return false;
    if (r.max != null && r.max !== "" && !(v <= Number(r.max))) return false;
  }
  if (F.search) {
    const q = F.search.toLowerCase();
    if (!D.ticker[i].toLowerCase().includes(q) && !D.name[i].toLowerCase().includes(q)) return false;
  }
  return true;
}

// Corre todo: scores, retornos esperados, Kelly. Devuelve arrays tipados.
export function runModel(D, { weights, params, horizon }) {
  const ranks = {};
  for (const id of Object.keys(weights)) if (weights[id] > 0 && D.cols[id]) ranks[id] = getRank(D, id);
  const score = computeScores(D.n, ranks, weights);
  const quality = computeQuality(D);
  const cagr = new Float32Array(D.n).fill(NaN);
  const E = new Float32Array(D.n).fill(NaN);
  const kelly = new Float32Array(D.n).fill(NaN);
  const kellyRaw = new Float32Array(D.n).fill(NaN);
  const elog = new Float32Array(D.n).fill(NaN);
  const bull = new Float32Array(D.n).fill(NaN);
  const base = new Float32Array(D.n).fill(NaN);
  const bear = new Float32Array(D.n).fill(NaN);
  for (let i = 0; i < D.n; i++) {
    const r = evaluate(companyInputs(D, i, quality[i]), horizon, params, score[i]);
    if (!r) continue;
    // Filtro de cordura: múltiplos absurdos casi siempre son errores de datos
    if (!(r.E < 500)) continue;
    elog[i] = r.elog; cagr[i] = r.cagr; E[i] = r.E; kelly[i] = r.kelly; kellyRaw[i] = r.kellyRaw; bull[i] = r.bull; base[i] = r.base; bear[i] = r.bear;
  }
  return { score, quality, elog, cagr, E, kelly, kellyRaw, bull, base, bear, conf: confidenceAll(D) };
}

export function detail(D, i, settings, score, quality) {
  return evaluate(companyInputs(D, i, quality[i]), settings.horizon, settings.params, score[i], true);
}
