// Genera public/Universo_Global_Multibagger.xlsx:
//  1) Universo  — todas las acciones del mundo, una por fila: ticker, sector, qué hace, cómo gana dinero,
//                 métricas clave y el resultado del modelo por defecto (5 años)
//  2) Métricas  — catálogo completo con selectores "Habilitada" / "Usada en el modelo" (Sí/No) y peso
//  3) Supuestos — parámetros del modelo por defecto
//  4) Portafolio — canasta de 5 empresas por defecto con pesos Kelly
import ExcelJS from "exceljs";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { loadData } from "./load-node.mjs";
import { runModel, passesFilters, DEFAULT_FILTERS, companyInputs, confidence } from "../src/engine.js";
import { PRESETS, PARAM_INFO, evaluate, buildWeights, portfolioDistribution } from "../src/model.js";
import { calDist, calKelly, calOutcomes, rankPercentiles, RF_ANNUAL } from "../src/calcore.js";

const root = new URL("../", import.meta.url);
const { D, meta, core } = loadData();
const profiles = existsSync(new URL("data/profiles.json", root)) ? JSON.parse(readFileSync(new URL("data/profiles.json", root))) : {};
const H = 5, P = PRESETS.adn;
const R = runModel(D, { weights: P.weights, params: P.params, horizon: H });

// Calibración histórica (public/calibration.json): percentil del ranking → distribución realizada en el backtest de EE.UU.
const calFile = new URL("public/calibration.json", root);
const CT = existsSync(calFile) ? JSON.parse(readFileSync(calFile)) : null;
const pct = CT ? rankPercentiles(D, R, passesFilters, DEFAULT_FILTERS) : null;
const G = 401;
const grid = CT ? Array.from({ length: G }, (_, k) => calDist(CT, "adn", H, k / (G - 1))) : null;
const gridK = grid ? grid.map((d) => calKelly(d, H)) : null;
const calOf = (i) => (grid && !Number.isNaN(pct[i]) ? grid[Math.round(pct[i] * (G - 1))] : null);
const kOf = (i) => (gridK && !Number.isNaN(pct[i]) ? gridK[Math.round(pct[i] * (G - 1))] : NaN);
const ranked = [];
for (let i = 0; i < D.n; i++) if (passesFilters(D, i, DEFAULT_FILTERS) && !Number.isNaN(R.cagr[i])) ranked.push(i);
ranked.sort((a, b) => R.elog[b] - R.elog[a]);
const rankOf = new Int32Array(D.n).fill(-1);
ranked.forEach((i, k) => (rankOf[i] = k + 1));
// orden de filas: primero ranking del modelo, luego el resto por capitalización
const rest = [];
for (let i = 0; i < D.n; i++) if (rankOf[i] < 0) rest.push(i);
rest.sort((a, b) => (D.cols.mcap[b] || 0) - (D.cols.mcap[a] || 0));
const order = [...ranked, ...rest];

const wb = new ExcelJS.stream.xlsx.WorkbookWriter({ filename: fileURLToPath(new URL("public/Universo_Global_Multibagger.xlsx", root)), useStyles: true, useSharedStrings: false });
wb.creator = "Asymmetric";
const HEAD = { font: { bold: true, color: { argb: "FFFFFFFF" } }, fill: { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F172A" } }, alignment: { vertical: "middle", wrapText: true } };

// ---------- 1) Universo
const ws = wb.addWorksheet("Universo", { views: [{ state: "frozen", xSplit: 2, ySplit: 1 }] });
const keyMetrics = ["mcap", "revenue", "rev_g", "rev_cagr5", "gm", "nm", "roic", "fcf_yield", "ps", "pe", "de", "insider_pct", "eps_rev30", "shares_g3"];
const cat = Object.fromEntries(meta.catalog.map((m) => [m.id, m]));
ws.columns = [
  { header: "Ranking modelo (5a)", key: "rank", width: 10 },
  { header: "Ticker", key: "ticker", width: 12 },
  { header: "Símbolo (Bolsa:Ticker)", key: "sym", width: 20 },
  { header: "Empresa", key: "name", width: 34 },
  { header: "País", key: "country", width: 16 },
  { header: "Bolsa", key: "exch", width: 10 },
  { header: "ISIN", key: "isin", width: 15 },
  { header: "Sector", key: "sector", width: 22 },
  { header: "Industria", key: "industry", width: 26 },
  { header: "Qué hace", key: "desc", width: 70 },
  { header: "Cómo gana dinero", key: "money", width: 60 },
  ...keyMetrics.map((id) => ({ header: cat[id].label + (cat[id].unit === "usd" ? " (USD)" : cat[id].unit === "pct" ? " (%)" : ""), key: id, width: 14 })),
  { header: "Score ADN (0-100)", key: "score", width: 11 },
  { header: "Integridad de datos (0-100)", key: "conf", width: 11 },
  { header: "Percentil del ranking", key: "pct", width: 10 },
  { header: "Ret. anual CALIBRADO 5a, mediana histórica (%)", key: "calm", width: 14 },
  { header: "P(pérdida) 5a (%)", key: "ploss", width: 10 },
  { header: "P(≥2x) 5a (%)", key: "p2x", width: 10 },
  { header: "P(≥5x) 5a (%)", key: "p5x", width: 10 },
  { header: "Kelly calibrado (%)", key: "kcal", width: 10 },
  { header: "Retorno anual del MODELO 5a, sin calibrar (%)", key: "cagr", width: 13 },
  { header: "Múltiplo esperado 5a (x)", key: "E", width: 12 },
  { header: "Alcista (x)", key: "bull", width: 10 },
  { header: "Base (x)", key: "base", width: 10 },
  { header: "Bajista (x)", key: "bear", width: 10 },
  { header: "Kelly con escenarios del modelo (%)", key: "kelly", width: 10 },
];
ws.getRow(1).eachCell((c) => Object.assign(c, HEAD));
ws.getRow(1).height = 42;
ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: ws.columns.length } };
ws.getRow(1).commit();
const r2 = (x, d = 2) => (typeof x === "number" && Number.isFinite(x) ? Number(x.toFixed(d)) : null);
for (const i of order) {
  const ind = D.industry[i];
  const desc = profiles[D.sym[i]] || "";
  const row = {
    rank: rankOf[i] > 0 ? rankOf[i] : null,
    ticker: D.ticker[i], sym: D.sym[i], name: D.name[i],
    country: meta.countries[D.country[i]], exch: meta.exchanges[D.exchange[i]], isin: core.isin[i] || "",
    sector: meta.sectorEs[D.sector[i]], industry: meta.industryEs[ind],
    desc: desc || `${meta.industryEs[ind]} (${meta.sectorEs[D.sector[i]]}). Sin descripción pública disponible.`,
    money: meta.industryModel[ind] || "",
    score: r2(R.score[i] * 100, 0), conf: r2(R.conf[i] * 100, 0),
    ...(() => { const c = calOf(i); return c ? { pct: r2(pct[i] * 100, 1), calm: r2(c.cagrMed * 100, 1), ploss: r2(c.pLoss * 100, 0), p2x: r2(c.p2x * 100, 0), p5x: r2(c.p5x * 100, 1), kcal: r2(kOf(i) * 100, 0) } : {}; })(),
    cagr: r2(R.cagr[i] * 100, 1), E: r2(R.E[i]), bull: r2(R.bull[i]), base: r2(R.base[i]), bear: r2(R.bear[i]), kelly: r2(R.kelly[i] * 100, 0),
  };
  for (const id of keyMetrics) row[id] = r2(D.cols[id]?.[i], cat[id].unit === "usd" ? 0 : 2);
  ws.addRow(row).commit();
}
ws.commit();

// ---------- 2) Métricas
const wm = wb.addWorksheet("Métricas", { views: [{ state: "frozen", ySplit: 1 }] });
wm.columns = [
  { header: "ID", key: "id", width: 16 }, { header: "Métrica", key: "label", width: 38 }, { header: "Categoría", key: "cat", width: 22 },
  { header: "Unidad", key: "unit", width: 8 }, { header: "Dirección", key: "dir", width: 14 }, { header: "Qué mide", key: "desc", width: 90 },
  { header: "Fuente", key: "src", width: 40 }, { header: "Habilitada en el screener", key: "en", width: 14 },
  { header: "Usada en el modelo default", key: "used", width: 14 }, { header: "Peso default (%)", key: "w", width: 12 },
  { header: "Cobertura (empresas con dato)", key: "cov", width: 14 },
];
wm.getRow(1).eachCell((c) => Object.assign(c, HEAD));
wm.getRow(1).height = 36;
wm.getRow(1).commit();
const wTot = Object.values(P.weights).reduce((a, b) => a + b, 0);
let r = 2;
for (const m of meta.catalog) {
  const cov = D.cols[m.id] ? D.cols[m.id].filter((x) => x != null).length : 0;
  const row = wm.addRow({
    id: m.id, label: m.label, cat: m.cat, unit: m.unit, dir: m.better > 0 ? "Más alto mejor" : m.better < 0 ? "Más bajo mejor" : "Neutral",
    desc: m.desc, src: m.src, en: "Sí", used: P.weights[m.id] ? "Sí" : "No", w: P.weights[m.id] ? Number(((P.weights[m.id] / wTot) * 100).toFixed(1)) : 0, cov,
  });
  for (const col of [8, 9]) row.getCell(col).dataValidation = { type: "list", allowBlank: false, formulae: ['"Sí,No"'] };
  row.commit();
  r++;
}
wm.commit();

// ---------- 3) Supuestos
const wsP = wb.addWorksheet("Supuestos");
wsP.columns = [{ header: "Parámetro", key: "k", width: 44 }, { header: "Valor default", key: "v", width: 14 }, { header: "Descripción", key: "d", width: 100 }];
wsP.getRow(1).eachCell((c) => Object.assign(c, HEAD));
wsP.getRow(1).commit();
wsP.addRow({ k: "Teoría", v: P.name, d: P.desc }).commit();
wsP.addRow({ k: "Horizonte (años)", v: H, d: "En la web-app puede ser cualquier plazo de 0.5 a 20 años." }).commit();
for (const [k, p] of Object.entries(PARAM_INFO)) wsP.addRow({ k: p.label, v: P.params[k], d: p.desc }).commit();
wsP.addRow({ k: "Filtros default", v: "", d: "Cap. ≥ $100M, liquidez ≥ $100K/día, con ingresos, solo comunes, sin fondos, confianza de datos ≥ 50%." }).commit();
wsP.addRow({ k: "Datos al", v: meta.fetchedAt.slice(0, 10), d: "Escáner público de TradingView (fundamentales en USD) + Yahoo Finance (descripciones, insiders, short interest, revisiones de EPS) + SEC EDGAR (dilución EE.UU.)." }).commit();
wsP.commit();

// ---------- 4) Portafolio default
const rf = Math.pow(1 + RF_ANNUAL, H);
const picks = ranked.slice(0, 5).map((i) => { const ev = evaluate(companyInputs(D, i, R.quality[i]), H, P.params, R.score[i], true); const c = calOf(i); return { i, ind: D.industry[i], sec: D.sector[i], ...ev, cal: c, outcomes: c ? calOutcomes(c) : ev.outcomes, score: R.score[i] }; });
const w = buildWeights(picks, "kelly", 0.4, { cash: rf });
const dist = portfolioDistribution(picks, w, 6000, undefined, rf);
const wp = wb.addWorksheet("Portafolio 5");
wp.columns = [{ header: "Empresa", key: "n", width: 34 }, { header: "Símbolo", key: "s", width: 18 }, { header: "País", key: "c", width: 16 }, { header: "Peso Kelly calibrado (%)", key: "w", width: 12 }, { header: "Ret. calibrado mediano (%)", key: "cm", width: 12 }, { header: "P(pérdida) %", key: "pl", width: 10 }, { header: "P(≥2x) %", key: "p2", width: 10 }, { header: "Ret. del modelo (%)", key: "cagr", width: 14 }, { header: "Múltiplo esp. 5a", key: "E", width: 12 }, { header: "Alcista", key: "b", width: 9 }, { header: "Base", key: "m", width: 9 }, { header: "Bajista", key: "r", width: 9 }, { header: "P(ruina) %", key: "pr", width: 10 }];
wp.getRow(1).eachCell((c) => Object.assign(c, HEAD));
wp.getRow(1).commit();
picks.forEach((p, j) => wp.addRow({ n: D.name[p.i], s: D.sym[p.i], c: meta.countries[D.country[p.i]], w: r2(w[j] * 100, 1), cm: p.cal ? r2(p.cal.cagrMed * 100, 1) : null, pl: p.cal ? r2(p.cal.pLoss * 100, 0) : null, p2: p.cal ? r2(p.cal.p2x * 100, 0) : null, cagr: r2(p.cagr * 100, 1), E: r2(p.E), b: r2(p.bull), m: r2(p.base), r: r2(p.bear), pr: r2(p.probs.ruin * 100, 0) }).commit());
wp.addRow({}).commit();
if (dist.cash > 0.005) wp.addRow({ n: "Efectivo (3% anual)", w: r2(dist.cash * 100, 1) }).commit();
wp.addRow({ n: "Múltiplo esperado del portafolio (calibrado)", w: r2(dist.mean) }).commit();
wp.addRow({ n: "P(perder dinero) / P(≥2x)", w: `${r2(dist.pLoss * 100, 0)}% / ${r2(dist.p2x * 100, 0)}%` }).commit();
wp.addRow({ n: "Mediana / P10 / P90", w: `${r2(dist.median)} / ${r2(dist.p10)} / ${r2(dist.p90)}` }).commit();
wp.addRow({ n: "Aviso: modelo cuantitativo educativo, no es recomendación de inversión." }).commit();
wp.commit();

await wb.commit();
console.log(`OK Excel: ${order.length} filas, ${meta.catalog.length} métricas`);
