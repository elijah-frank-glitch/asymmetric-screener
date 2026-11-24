// Construye el panel point-in-time del backtest (docs/BACKTEST_CONTRACT.md §1) a partir de:
//   data/backtest/raw/<Concepto>_<CYyyyy|CYyyyyQ4I>.json  (frames XBRL de la SEC, fetch-sec.mjs)
//   data/backtest/raw/tickers.json                        (mapa CIK → ticker de empresas que cotizan HOY)
//   data/backtest/prices/<T>.json                         (precios mensuales de Yahoo, fetch-prices.mjs)
// Salida: data/backtest/panel.json.gz
//   node scripts/backtest/build-panel.mjs [--out data/backtest/panel.json.gz]
import { readFileSync, writeFileSync, existsSync, statSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { sharesGrowth } from "./shares-growth.mjs";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const RAW = resolve(ROOT, "data/backtest/raw");
const PRICES = resolve(ROOT, "data/backtest/prices");
const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const OUT = resolve(arg("--out") || resolve(ROOT, "data/backtest/panel.json.gz"));
const t0 = Date.now();

const YEARS = Array.from({ length: 2025 - 2007 + 1 }, (_, k) => 2007 + k);
const DATES = Array.from({ length: 2025 - 2011 + 1 }, (_, k) => `${2011 + k}-04-30`);
const HORIZONS = [1, 3, 5, 10];
const LAG_DAYS = 75;
const DAY = 86400e3;
const NOW = Date.now();
const EXCH = new Set(["NYSE", "Nasdaq", "NYSE American", "NYSE MKT", "NYSE Arca", "AMEX"]);

// ---------- 1) Frames de la SEC: F[concepto][año] = Map(cik → [valor, finMs])
const DUR = ["Revenues", "RevenueFromContractWithCustomerExcludingAssessedTax", "SalesRevenueNet", "GrossProfit", "CostOfRevenue",
  "CostOfGoodsAndServicesSold", "OperatingIncomeLoss", "NetIncomeLoss", "NetCashProvidedByUsedInOperatingActivities",
  "PaymentsToAcquirePropertyPlantAndEquipment", "ResearchAndDevelopmentExpense", "DepreciationDepletionAndAmortization",
  "DepreciationAndAmortization", "InterestExpense", "PaymentsOfDividends", "PaymentsOfDividendsCommonStock",
  "PaymentsForRepurchaseOfCommonStock", "WeightedAverageNumberOfDilutedSharesOutstanding"];
const INST = ["Assets", "Liabilities", "StockholdersEquity", "AssetsCurrent", "LiabilitiesCurrent", "CashAndCashEquivalentsAtCarryingValue",
  "LongTermDebt", "LongTermDebtNoncurrent", "DebtCurrent", "RetainedEarningsAccumulatedDeficit", "Goodwill", "InventoryNet",
  "EntityCommonStockSharesOutstanding"];
const F = {};
const names = new Map(); // cik → nombre de la entidad (último visto)
for (const c of [...DUR, ...INST]) {
  F[c] = {};
  for (const y of YEARS) {
    const f = resolve(RAW, `${c}_CY${y}${INST.includes(c) ? "Q4I" : ""}.json`);
    const m = new Map();
    if (existsSync(f)) {
      const j = JSON.parse(readFileSync(f, "utf8"));
      for (const [cik, [val, end, nm]] of Object.entries(j)) {
        if (typeof val !== "number" || !Number.isFinite(val)) continue;
        m.set(Number(cik), [val, Date.parse(end + "T00:00:00Z")]);
        if (nm) names.set(Number(cik), nm);
      }
    } else console.warn("⚠ falta", f);
    F[c][y] = m;
  }
}
console.log(`Frames cargados (${((Date.now() - t0) / 1000).toFixed(1)} s)`);

// ---------- 2) Empresas: un ticker por CIK en NYSE/Nasdaq/NYSE American, con precios descargados
const tk = JSON.parse(readFileSync(resolve(RAW, "tickers.json"), "utf8"));
const companies = [], prices = [];
const seen = new Set();
let noPrice = 0;
for (const [cik, name, ticker, ex] of tk.data) {
  if (!EXCH.has(ex) || !ticker || seen.has(cik)) continue;
  seen.add(cik);
  const pf = resolve(PRICES, `${ticker}.json`);
  if (!existsSync(pf)) { noPrice++; continue; }
  const p = JSON.parse(readFileSync(pf, "utf8"));
  p.mk = p.t.map((t) => { const d = new Date(t * 1000 + 12 * 3600e3); return d.getUTCFullYear() * 12 + d.getUTCMonth(); }); // índice de mes
  p.splits = (p.splits || []).map(([t, r]) => [t * 1000, r]);
  companies.push({ cik, ticker, name, exchange: ex, sic: null });
  prices.push(p);
}
const spyP = JSON.parse(readFileSync(resolve(PRICES, "SPY.json"), "utf8"));
spyP.mk = spyP.t.map((t) => { const d = new Date(t * 1000 + 12 * 3600e3); return d.getUTCFullYear() * 12 + d.getUTCMonth(); });
const NC = companies.length;
console.log(`Empresas con precios: ${NC} (sin archivo de precios: ${noPrice})`);

// ---------- 3) Utilidades de precios
const monthKey = (iso) => { const [y, m] = iso.split("-").map(Number); return y * 12 + (m - 1); };
const nowKey = (() => { const d = new Date(NOW); return d.getUTCFullYear() * 12 + d.getUTCMonth(); })();
// Índice de la última barra mensual con mes ≤ k (y no más de `maxGap` meses antes)
function barAt(p, k, maxGap = 1) {
  let lo = 0, hi = p.mk.length - 1, r = -1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (p.mk[m] <= k) { r = m; lo = m + 1; } else hi = m - 1; }
  return r >= 0 && k - p.mk[r] <= maxGap ? r : -1;
}
// Producto de splits posteriores a un instante (para pasar de "base hoy" a "base de esa fecha")
const splitsAfter = (p, ms) => p.splits.reduce((s, [t, r]) => (t > ms ? s * r : s), 1);
const splitsBetween = (p, a, b) => p.splits.reduce((s, [t, r]) => (t > a && t <= b ? s * r : s), 1);

// Retornos totales hacia adelante con adjclose (dividendos + splits)
function fwdReturn(p, k0, h) {
  const i0 = barAt(p, k0, 0);
  if (i0 < 0 || !(p.a[i0] > 0)) return [null, false];
  const kT = k0 + 12 * h;
  const partial = kT > nowKey;
  const kEnd = partial ? nowKey : kT;
  const i1 = barAt(p, kEnd, partial ? 1 : 0);
  if (i1 >= 0 && p.a[i1] > 0 && i1 > i0 && p.mk[i1] >= kEnd - 1) return [p.a[i1] / p.a[i0] - 1, partial, false];
  // El historial termina antes del horizonte (dejó de cotizar: compra, quiebra, deslistado). NO se descarta: se devuelve el
  // retorno hasta el último precio disponible y la marca "delisted"; run-backtest decide qué supuesto aplicar después.
  let iL = -1; for (let j = p.a.length - 1; j > i0; j--) if (p.a[j] > 0 && p.mk[j] <= kEnd) { iL = j; break; }
  if (iL < 0) return [null, partial, true];
  return [p.a[iL] / p.a[i0] - 1, partial, true];
}

// ---------- 4) Fundamentales point-in-time
const okn = (x) => typeof x === "number" && Number.isFinite(x);
const pct = (a, b) => (okn(a) && okn(b) && b !== 0 ? (a / b) * 100 : null);
const growth = (a, b) => (okn(a) && okn(b) && b > 0 ? (a / b - 1) * 100 : null);
const growthAbs = (a, b) => (okn(a) && okn(b) && b !== 0 ? ((a - b) / Math.abs(b)) * 100 : null);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const REV = ["Revenues", "RevenueFromContractWithCustomerExcludingAssessedTax", "SalesRevenueNet"];

// Fundamentales de una empresa para el año calendario Y, visibles en la fecha `dMs` (fin + 75 días ≤ fecha)
function fundamentals(cik, Y, dMs) {
  const vis = (e) => e && e[1] + LAG_DAYS * DAY <= dMs;
  const D = (c, y = Y) => { const e = F[c][y]?.get(cik); return vis(e) ? e[0] : null; };
  const Dend = (c, y = Y) => { const e = F[c][y]?.get(cik); return vis(e) ? e[1] : null; };
  // Instantes: corte CY{Y}Q4I si ya era visible; si no, el del año previo
  const I = (c, y = Y) => { const e = F[c][y]?.get(cik); if (vis(e)) return e[0]; const e2 = F[c][y - 1]?.get(cik); return vis(e2) ? e2[0] : null; };
  // Ingresos: primer concepto disponible; si los conceptos discrepan > 3x (errores de escala del filer), el más cercano al año previo
  const revCands = (y) => REV.map((c) => D(c, y)).filter((v) => okn(v));
  const rev = (y, depth = 0) => {
    const v = revCands(y);
    if (v.length < 2 || Math.max(...v.map(Math.abs)) <= 3 * Math.min(...v.map(Math.abs))) return v[0] ?? null;
    const ref = depth < 2 ? rev(y - 1, depth + 1) : null;
    return ref > 0 ? v.reduce((b, x) => (Math.abs(Math.log(Math.abs(x) / ref)) < Math.abs(Math.log(Math.abs(b) / ref)) ? x : b)) : Math.min(...v);
  };
  const revEnd = (y) => { for (const c of REV) { const v = Dend(c, y); if (v != null) return v; } return null; };
  // Utilidad bruta: GrossProfit o ingresos − costo. Si es derivada y deja > 60% de las ventas en gastos operativos
  // distintos de I+D, el costo etiquetado suele ser parcial (aseguradoras, servicios) → null
  const gp = (y) => {
    const g = D("GrossProfit", y); if (okn(g)) return g;
    const r = rev(y), c = D("CostOfRevenue", y) ?? D("CostOfGoodsAndServicesSold", y);
    if (!(okn(r) && okn(c) && r > 0)) return null;
    const o = D("OperatingIncomeLoss", y), rd = D("ResearchAndDevelopmentExpense", y) || 0;
    if (okn(o) && (r - c - o - rd) / r > 0.6) return null;
    return r - c;
  };
  const da = (y) => D("DepreciationDepletionAndAmortization", y) ?? D("DepreciationAndAmortization", y);
  const ebitda = (y) => { const o = D("OperatingIncomeLoss", y); return okn(o) ? o + (da(y) ?? 0) : null; };
  const debtOf = (y) => { const lt = I("LongTermDebt", y); if (okn(lt)) return lt; const nc = I("LongTermDebtNoncurrent", y), cur = I("DebtCurrent", y); return okn(nc) || okn(cur) ? (nc || 0) + (cur || 0) : null; };
  return {
    rev: rev(Y), rev1: rev(Y - 1), rev5: rev(Y - 5), gp: gp(Y), gp1: gp(Y - 1),
    end: revEnd(Y) ?? Dend("NetIncomeLoss") ?? Dend("OperatingIncomeLoss"),
    ni: D("NetIncomeLoss"), op: D("OperatingIncomeLoss"), ebitda: ebitda(Y), ebitda1: ebitda(Y - 1),
    cfo: D("NetCashProvidedByUsedInOperatingActivities"), capex: D("PaymentsToAcquirePropertyPlantAndEquipment"),
    rd: D("ResearchAndDevelopmentExpense"), div: D("PaymentsOfDividends") ?? D("PaymentsOfDividendsCommonStock"),
    buyback: D("PaymentsForRepurchaseOfCommonStock"),
    dil: D("WeightedAverageNumberOfDilutedSharesOutstanding"), dilEnd: Dend("WeightedAverageNumberOfDilutedSharesOutstanding"),
    assets: I("Assets"), assets1: I("Assets", Y - 1), liab: I("Liabilities"), equity: I("StockholdersEquity"),
    ca: I("AssetsCurrent"), cl: I("LiabilitiesCurrent"), cash: I("CashAndCashEquivalentsAtCarryingValue"),
    debt: debtOf(Y), re: I("RetainedEarningsAccumulatedDeficit"),
  };
}
// ¿Qué año calendario usar? CY(y-1) si su cierre + 75 días ≤ fecha; si no, CY(y-2)
function pickYear(cik, y, dMs) {
  const keys = [...REV, "NetIncomeLoss", "OperatingIncomeLoss"];
  for (const Y of [y - 1, y - 2]) for (const c of keys) { const e = F[c][Y]?.get(cik); if (e && e[1] + LAG_DAYS * DAY <= dMs) return Y; }
  return null;
}
// Acciones en "base de hoy" (ajustadas por todos los splits posteriores). dei = acciones de portada (no se reexpresan).
// Las diluidas promedio de los frames vienen del ÚLTIMO filing que reportó ese año (≈ fin + 26 meses), que ya
// incorpora los splits ocurridos hasta entonces: solo se ajustan por los splits posteriores a esa ventana.
function sharesToday(p, cik, y, dMs, f) {
  let dei = null;
  for (const Y of [y - 1, y - 2]) {
    const e = F.EntityCommonStockSharesOutstanding[Y]?.get(cik);
    if (e && e[1] <= dMs && e[0] > 0) { dei = e[0] * splitsAfter(p, e[1]); break; }
  }
  let dil = null;
  if (f.dil > 0 && f.dilEnd != null) {
    const lastFiling = Math.min(f.dilEnd + 26 * 30.4 * DAY, NOW - 270 * DAY);
    dil = f.dil * splitsAfter(p, Math.max(lastFiling, f.dilEnd));
  }
  // Multiclase (p. ej. GOOGL): la portada a veces trae una sola clase → si dei < 60% de las diluidas, usar diluidas
  if (dei && dil && dei < 0.6 * dil) return [dil, "dil"];
  return dei ? [dei, "dei"] : dil ? [dil, "dil"] : [null, null];
}

// ---------- 5) Snapshots
const COLS = ["mcap", "revenue", "rev_g", "rev_cagr5", "gm", "nm", "fcf_m", "ebitda_m", "roic", "roa", "roe", "rd_rev",
  "net_cash", "div_yield", "buyback", "liq_usd", "ps", "pe", "pb", "ev_ebitda", "fcf_yield", "bm", "de", "invest_gap",
  "rule40", "gp_assets", "gp_g", "payout", "altman", "runway", "off_low", "price", "cr", "shares_g1", "shares_g3"];
// Dilución histórica (shares-growth.mjs): frames crudos por año
const deiF = (cik) => (Y) => F.EntityCommonStockSharesOutstanding[Y]?.get(cik) || null;
const LISTED_FLOOR = Date.parse("2009-03-01T00:00:00Z"); // los precios de Yahoo empiezan en 2009-01
const dilF = (cik) => (Y) => F.WeightedAverageNumberOfDilutedSharesOutstanding[Y]?.get(cik) || null;
const r4 = (x) => (okn(x) ? Number(x.toPrecision(4)) : null);
const snapshots = {}, fwd = {}, partial = {}, spy = {}, coverage = {}, delisted = {};
let dropped = 0, sharesSrc = { dei: 0, dil: 0 };

for (const date of DATES) {
  const y = Number(date.slice(0, 4));
  const dMs = Date.parse(date + "T23:59:59Z");
  const k0 = monthKey(date);
  const C = Object.fromEntries(COLS.map((c) => [c, new Array(NC).fill(null)]));
  const fyEnd = new Array(NC).fill(null);
  const FW = Object.fromEntries(HORIZONS.map((h) => [h, new Array(NC).fill(null)]));
  const DL = Object.fromEntries(HORIZONS.map((h) => [h, []])); // índices cuyo historial terminó antes del horizonte
  const cov = { listed: 0, fundamentals: 0, mcap: 0, liq: 0 };
  for (let i = 0; i < NC; i++) {
    const p = prices[i], cik = companies[i].cik;
    const bi = barAt(p, k0, 0); // debe cotizar en el mes de la fecha
    if (bi < 0 || !(p.c[bi] > 0)) continue;
    cov.listed++;
    for (const h of HORIZONS) { const [r, , dl] = fwdReturn(p, k0, h); FW[h][i] = r4(r); if (dl) DL[h].push(i); }
    const close = p.c[bi]; // ajustado por splits a hoy
    const price = close * splitsAfter(p, dMs); // precio tal como cotizaba en la fecha
    C.price[i] = r4(price);
    // Mínimo de 12 meses (cierres mensuales, base hoy) → distancia sobre mínimo
    let lo = Infinity; for (let j = Math.max(0, bi - 11); j <= bi; j++) if (p.c[j] > 0 && p.mk[j] > k0 - 12) lo = Math.min(lo, p.c[j]);
    if (Number.isFinite(lo) && lo > 0) C.off_low[i] = r4((close / lo - 1) * 100);
    // Liquidez diaria aprox.: volumen mensual promedio (3 meses) / 21 × precio (ambos en base hoy)
    const vs = []; for (let j = Math.max(0, bi - 2); j <= bi; j++) if (p.v[j] > 0 && p.mk[j] > k0 - 3) vs.push(p.v[j] * p.c[j]);
    if (vs.length) { C.liq_usd[i] = r4(vs.reduce((a, b) => a + b, 0) / vs.length / 21); cov.liq++; }

    const Y = pickYear(cik, y, dMs);
    if (Y == null) continue;
    const f = fundamentals(cik, Y, dMs);
    cov.fundamentals++;
    fyEnd[i] = f.end != null ? new Date(f.end).toISOString().slice(0, 10) : null;
    const [shToday, src] = sharesToday(p, cik, y, dMs, f);
    let mcap = shToday > 0 ? shToday * close : null;
    // Sanidad de acciones/precio (ADS con ratio ≠ 1, clases, errores de escala): P/S > 1000 o < 0.005, P/E < 1, FCF > 150% o < −300% de mcap
    if (mcap) {
      const fcf0 = okn(f.cfo) ? f.cfo - (f.capex || 0) : null;
      if ((f.rev > 0 && (mcap / f.rev > 1000 || mcap / f.rev < 0.005)) || (f.ni > 0 && mcap / f.ni < 1) || (okn(fcf0) && (fcf0 / mcap > 1.5 || fcf0 / mcap < -3))) { mcap = null; dropped++; }
    }
    if (mcap && mcap < 1e6) { mcap = null; dropped++; }
    if (mcap) { cov.mcap++; sharesSrc[src]++; }

    const rev = f.rev, fcf = okn(f.cfo) ? f.cfo - (f.capex || 0) : null;
    const v = {};
    v.mcap = mcap; v.revenue = rev;
    v.rev_g = growth(rev, f.rev1);
    v.rev_cagr5 = rev > 0 && f.rev5 > 0 ? (Math.pow(rev / f.rev5, 1 / 5) - 1) * 100 : null;
    const rp = (x) => (rev > 0 ? pct(x, rev) : null);
    v.gm = rp(f.gp); v.nm = rp(f.ni); v.fcf_m = rp(fcf); v.ebitda_m = rp(f.ebitda); v.rd_rev = rp(f.rd);
    const invested = okn(f.equity) || okn(f.debt) ? (f.equity || 0) + (f.debt || 0) : null;
    v.roic = invested > 0 ? pct(f.ni, invested) : null;
    v.roa = f.assets > 0 ? pct(f.ni, f.assets) : null;
    v.roe = f.equity > 0 ? pct(f.ni, f.equity) : null;
    v.net_cash = okn(f.cash) || okn(f.debt) ? (f.cash || 0) - (f.debt || 0) : null;
    if (mcap) {
      v.div_yield = f.div > 0 ? (f.div / mcap) * 100 : 0;
      v.buyback = f.buyback > 0 ? (f.buyback / mcap) * 100 : 0;
      v.ps = rev > 0 ? mcap / rev : null;
      v.pe = f.ni > 0 ? mcap / f.ni : null;
      v.pb = f.equity > 0 ? mcap / f.equity : null;
      const ev = mcap + (f.debt || 0) - (f.cash || 0);
      v.ev_ebitda = f.ebitda > 0 ? ev / f.ebitda : null;
      v.fcf_yield = okn(fcf) ? (fcf / mcap) * 100 : null;
      v.bm = okn(f.equity) ? f.equity / mcap : null;
    }
    v.de = f.equity > 0 && okn(f.debt) ? f.debt / f.equity : null;
    const assetsG = growth(f.assets, f.assets1), ebitdaG = growthAbs(f.ebitda, f.ebitda1);
    v.invest_gap = okn(assetsG) && okn(ebitdaG) ? assetsG - clamp(ebitdaG, -100, 300) : null;
    v.rule40 = okn(v.rev_g) && okn(v.fcf_m) ? v.rev_g + v.fcf_m : null;
    v.gp_assets = f.assets > 0 && okn(f.gp) ? (f.gp / f.assets) * 100 : null;
    v.gp_g = growth(f.gp, f.gp1);
    v.payout = f.ni > 0 ? ((f.div || 0) / f.ni) * 100 : null;
    // Altman Z clásico: 1.2·CT/AT + 1.4·UR/AT + 3.3·EBIT/AT + 0.6·VM/PT + 1.0·Ventas/AT
    const tl = okn(f.liab) ? f.liab : okn(f.assets) && okn(f.equity) ? f.assets - f.equity : null;
    if (f.assets > 0 && okn(f.ca) && okn(f.cl) && okn(f.re) && okn(f.op) && tl > 0 && mcap && okn(rev))
      v.altman = (1.2 * (f.ca - f.cl) + 1.4 * f.re + 3.3 * f.op + 1.0 * rev) / f.assets + 0.6 * (mcap / tl);
    v.runway = fcf == null ? null : fcf >= 0 ? 50 : okn(f.cash) ? Math.min(50, f.cash / -fcf) : null;
    v.cr = f.cl > 0 && okn(f.ca) ? f.ca / f.cl : null;
    // Cambio % anual de acciones (1a y CAGR 3a), ajustado por splits de Yahoo. Point-in-time: portada visible a la
    // fecha (CY(y-1) o CY(y-2)); diluidas del año fundamental Y (ya visible: fin + 75 días)
    let deiY = null;
    for (const Yd of [y - 1, y - 2]) { const e = F.EntityCommonStockSharesOutstanding[Yd]?.get(cik); if (e && e[1] <= dMs && e[0] > 0) { deiY = Yd; break; } }
    // listedMs: primera barra de precios si es posterior al inicio del historial de Yahoo (IPO / de-SPAC / relisting)
    const listedMs = p.t[0] * 1000 > LISTED_FLOOR ? p.t[0] * 1000 : null;
    const sg = sharesGrowth({ dei: deiF(cik), dil: dilF(cik), splits: p.splits, deiY, dilY: f.dil > 0 ? Y : null, listedMs, now: NOW });
    v.shares_g1 = sg.g1; v.shares_g3 = sg.g3;
    if (sg.g3 != null) cov.sharesG3 = (cov.sharesG3 || 0) + 1;
    for (const [k, x] of Object.entries(v)) if (k !== "price" && k !== "off_low" && k !== "liq_usd") C[k][i] = r4(x);
  }
  snapshots[date] = { fyEnd, cols: C };
  fwd[date] = FW;
  delisted[date] = DL;
  // Sesgo de supervivencia medible: emisores que reportaban a la SEC con ventas > $1M (CY y-1 visible) y acciones comunes
  // en portada (dei), frente a los que tenemos con precio. Los que faltan dejaron de cotizar antes de hoy (o nunca cotizaron
  // en NYSE/Nasdaq: OTC, solo deuda), así que es una cota superior del universo perdido.
  { const inPanel = new Set(); for (let i = 0; i < NC; i++) if (C.mcap[i] > 0 && C.revenue[i] > 1e6) inPanel.add(companies[i].cik);
    const sec = new Set(); const Ys = y - 1;
    for (const c of REV) for (const [cik, e] of F[c][Ys] || []) if (e[0] > 1e6 && e[1] + LAG_DAYS * DAY <= dMs) sec.add(cik);
    let both = 0; for (const c of inPanel) if (sec.has(c)) both++;
    cov.secFilers = sec.size; cov.secInPanel = both; cov.panelWithRev = inPanel.size; }
  const pa = {}, sp = {};
  for (const h of HORIZONS) {
    const [r, part] = fwdReturn(spyP, k0, h);
    pa[h] = part; sp[h] = r4(r);
  }
  partial[date] = pa; spy[date] = sp;
  coverage[date] = cov;
  console.log(`${date}: cotizan ${cov.listed}, con fundamentales ${cov.fundamentals}, con mcap ${cov.mcap}, con liquidez ${cov.liq}, con shares_g3 ${cov.sharesG3 || 0}, SEC con ventas ${cov.secFilers} (en panel ${cov.secInPanel}), deslistadas 5a ${DL[5].length} | SPY 1/3/5a ${sp[1]} ${sp[3]} ${sp[5]}${pa[5] ? " (5a parcial)" : ""}`);
}

const panel = {
  version: 1, builtAt: new Date().toISOString(), dates: DATES, companies, snapshots, fwd, partial, spy, coverage, delisted, horizons: HORIZONS,
  notes: [
    "Sesgo de supervivencia: solo empresas que cotizan HOY en NYSE/Nasdaq (mapa CIK→ticker actual de la SEC); las quebradas, compradas o deslistadas no están. Infla los retornos del universo y de cualquier estrategia.",
    "Fundamentales anuales de los frames XBRL de la SEC por año calendario (CY): CY(y-1) si fin + 75 días ≤ 30-abr, si no CY(y-2). Balance = corte instantáneo CYQ4I visible. Los frames toman el valor del último filing que reportó ese periodo (puede incluir reexpresiones posteriores).",
    "Métricas anuales (no TTM): ingresos = Revenues / RevenueFromContract... / SalesRevenueNet; utilidad bruta = GrossProfit o ingresos − costo; EBITDA ≈ utilidad operativa + D&A (sin D&A = solo operativa); si los conceptos de ingresos discrepan > 3x se toma el más cercano al año previo; margen bruto derivado se anula si deja > 60% de ventas en gastos no I+D; FCF = flujo operativo − capex; deuda = LongTermDebt o (no corriente + corriente); ROIC ≈ utilidad neta / (patrimonio + deuda).",
    "Acciones: dei EntityCommonStockSharesOutstanding (portada) ajustadas por splits; si faltan o parecen de una sola clase (< 60% de las diluidas) se usan las diluidas promedio. mcap = acciones × precio (ambos en base de hoy) = precio histórico sin ajustar × acciones de la época. Se descarta mcap si P/S > 1000 o < 0.005, P/E < 1 o FCF/mcap > 150% o < −300% (casi siempre acciones mal medidas: ADS con ratio ≠ 1, multiclase, Up-C).",
    "Precios mensuales de Yahoo Finance: precio = último cierre mensual en o antes de la fecha; off_low usa el mínimo de los 12 cierres mensuales (no el mínimo intradía de 52 semanas); liq_usd ≈ volumen mensual promedio de 3 meses / 21 × precio (aproximado).",
    "Retornos hacia adelante con adjclose (dividendos + splits) de mes a mes; si el horizonte no ha terminado se mide hasta el último mes disponible (partial = true); si el historial de precios termina antes del horizonte se guarda el retorno hasta el último precio y el índice va en delisted[fecha][h] (run-backtest aplica el supuesto de deslistado; ya no se descartan).",
    "shares_g1 / shares_g3: cambio % anual de acciones (1 año y CAGR 3 años; + = dilución, − = recompras). Portada dei (visible a la fecha) o diluidas promedio del año fundamental, comparando dentro de la misma fuente (si discrepan > 10 pp/año se usan diluidas). Base de hoy con splits reales de Yahoo (se ignoran los 'splits' de spin-off con ratios no racionales); saltos residuales ≈ múltiplo entero ≥ 1.8x / ≤ 0.55x se tratan como split no ajustado; ratios fuera de [1/8, 8] → null. Recorte: g1 ∈ [−30, 150], g3 ∈ [−20, 80] %/año.",
    "Sin SIC (no está en el mapa de tickers): todas las empresas en una sola industria. Sin consenso, trimestrales, Piotroski ni Sloan: null.",
  ],
};
const txt = JSON.stringify(panel);
writeFileSync(OUT, gzipSync(txt, { level: 9 }));
console.log(`Acciones: dei ${sharesSrc.dei}, diluidas ${sharesSrc.dil}; mcap descartadas por sanidad: ${dropped}`);
console.log(`OK build-panel: ${NC} empresas × ${DATES.length} fechas → ${OUT} (${(statSync(OUT).size / 1048576).toFixed(1)} MB gz, ${(txt.length / 1048576).toFixed(1)} MB sin comprimir) en ${((Date.now() - t0) / 1000).toFixed(1)} s`);
