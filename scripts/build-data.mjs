// Transforma data/universe.json (+ data/profiles.json) en los archivos que consume la web-app:
//   public/data/meta.json      catálogo, sectores, industrias, países, medianas
//   public/data/core.bin.json  identidad + métricas que usa el modelo (carga inicial; binario, ver src/corebin.js)
//   public/data/logo.json      logoid por empresa (solo Node: load-node.mjs)
//   public/data/m/<id>.json    resto de métricas (carga bajo demanda)
//   public/data/desc/<k>.json  descripciones de negocio por bloques de 1000
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from "node:fs";
import { METRICS, CATEGORIES } from "./metrics.mjs";
import { SECTOR_ES, INDUSTRY } from "./industries.mjs";
import { CORE_IDS } from "../src/engine.js";
import { encodeCore, decodeCore } from "../src/corebin.js";
import { isDeepStrictEqual } from "node:util";

const root = new URL("../", import.meta.url);
const uni = JSON.parse(readFileSync(new URL("data/universe.json", root)));
const profiles = existsSync(new URL("data/profiles.json", root)) ? JSON.parse(readFileSync(new URL("data/profiles.json", root))) : {};
const F = uni.fields;
const col = (f) => { const i = F.indexOf(f); if (i < 0) throw new Error("missing field " + f); return uni.rows.map((r) => r[i]); };
const n = uni.rows.length;
const num = (x) => (typeof x === "number" && Number.isFinite(x) ? x : null);

// ---------- métricas crudas
const cols = {};
for (const m of METRICS) if (m.tv) cols[m.id] = col(m.tv).map(num);
const raw = { ebitda_g_fy: col("ebitda_yoy_growth_fy").map(num), assets_g_fy: col("total_assets_yoy_growth_fy").map(num) };

// ---------- métricas derivadas
const div = (a, b) => (a != null && b != null && b !== 0 ? a / b : null);
const C = cols;
const derive = {
  fcf_yield: (i) => (C.mcap[i] > 0 && C.fcf[i] != null ? (C.fcf[i] / C.mcap[i]) * 100 : null),
  bm: (i) => (C.mcap[i] > 0 && C.equity[i] != null ? C.equity[i] / C.mcap[i] : null),
  ev_gp: (i) => (C.gp[i] > 0 ? div(C.ev[i], C.gp[i]) : null),
  net_cash: (i) => (C.cash[i] != null || C.debt[i] != null ? (C.cash[i] || 0) - (C.debt[i] || 0) : null),
  rd_mcap: (i) => (C.mcap[i] > 0 && C.rd[i] != null ? (Math.abs(C.rd[i]) / C.mcap[i]) * 100 : null),
  invest_gap: (i) => (raw.assets_g_fy[i] != null && raw.ebitda_g_fy[i] != null ? raw.assets_g_fy[i] - Math.max(-100, Math.min(300, raw.ebitda_g_fy[i])) : null),
  rev_fwd_g: (i) => (C.revenue[i] > 1e6 && C.rev_fwd[i] > 0 ? (C.rev_fwd[i] / C.revenue[i] - 1) * 100 : null),
  eps_fwd_g: (i) => (C.eps_ttm[i] > 0 && C.eps_fwd[i] != null ? (C.eps_fwd[i] / C.eps_ttm[i] - 1) * 100 : null),
  rule40: (i) => (C.rev_g[i] != null && C.fcf_m[i] != null ? C.rev_g[i] + C.fcf_m[i] : null),
  accel: (i) => (C.rev_g_q[i] != null && C.rev_g[i] != null ? C.rev_g_q[i] - C.rev_g[i] : null),
  gp_assets: (i) => (C.assets[i] > 0 && C.gp[i] != null ? (C.gp[i] / C.assets[i]) * 100 : null),
  capex_rev: (i) => (C.revenue[i] > 0 && C.capex[i] != null ? (Math.abs(C.capex[i]) / C.revenue[i]) * 100 : null),
  runway: (i) => (C.fcf[i] == null ? null : C.fcf[i] >= 0 ? 50 : C.cash[i] != null ? Math.min(50, C.cash[i] / -C.fcf[i]) : null),
  asset_turn: (i) => (C.assets[i] > 0 ? div(C.revenue[i], C.assets[i]) : null),
  goodwill_assets: (i) => (C.assets[i] > 0 && C.goodwill[i] != null ? (C.goodwill[i] / C.assets[i]) * 100 : null),
  pt_upside: (i) => (C.price[i] > 0 && C.pt_avg[i] > 0 ? (C.pt_avg[i] / C.price[i] - 1) * 100 : null),
  off_low: (i) => (C.lo52[i] > 0 && C.price[i] > 0 ? (C.price[i] / C.lo52[i] - 1) * 100 : null),
  off_high: (i) => (C.hi52[i] > 0 && C.price[i] > 0 ? (C.price[i] / C.hi52[i] - 1) * 100 : null),
  net_cash_pct: (i) => { const nc = derive.net_cash(i); return C.mcap[i] > 0 && nc != null ? (nc / C.mcap[i]) * 100 : null; },
  liq_usd: (i) => (C.avg_vol[i] > 0 && C.mcap[i] > 0 && C.shares[i] > 0 ? C.avg_vol[i] * (C.mcap[i] / C.shares[i]) : null),
};
for (const [id, fn] of Object.entries(derive)) cols[id] = Array.from({ length: n }, (_, i) => fn(i));

// ---------- señales cualitativas (docs/SIGNALS_CONTRACT.md): Yahoo (global) + SEC (dilución EE.UU.), por símbolo TradingView
const readOpt = (f) => { try { return existsSync(new URL(f, root)) ? JSON.parse(readFileSync(new URL(f, root))) : null; } catch (e) { console.warn("⚠ no se pudo leer " + f + ":", e.message); return null; } };
const signals = readOpt("data/signals.json")?.rows || {};
const dilution = readOpt("data/dilution_us.json")?.rows || {};
const symAll = col("symbol");
const pick = (src, k) => symAll.map((s) => num(src[s]?.[k]));
cols.insider_pct = pick(signals, 0);
cols.inst_pct = pick(signals, 1);
cols.short_pct = pick(signals, 2);
cols.founder = pick(signals, 3);
cols.eps_rev30 = pick(signals, 4);
cols.eps_rev90 = pick(signals, 5);
cols.rev_breadth = symAll.map((s) => { const up = num(signals[s]?.[6]), dn = num(signals[s]?.[7]); return up != null && dn != null && up + dn > 0 ? (up - dn) / (up + dn) : null; });
cols.shares_g1 = pick(dilution, 0);
cols.shares_g3 = pick(dilution, 1);
const covSig = { signals: Object.keys(signals).length, dilution: Object.keys(dilution).length };
// net_cash es entrada del modelo (no está en el catálogo como métrica visible por separado)
const allIds = [...METRICS.map((m) => m.id), "net_cash"];

// ---------- identidad
const sym = col("symbol"), ticker = col("name"), name = col("description"), exch = col("exchange");
const typespecs = col("typespecs");
const descr = col("description");
const common = typespecs.map((t, i) => (Array.isArray(t) && t.includes("common") && !/\b(pfd|preferred|pref)\b/i.test(String(descr[i] ?? "")) ? 1 : 0));
const countryRaw = col("country"), sectorRaw = col("sector"), industryRaw = col("industry"), isin = col("isin"), logo = col("logoid"), cur = col("currency");
const dict = (arr) => { const list = [...new Set(arr.map((x) => x ?? "—"))].sort(); const ix = new Map(list.map((v, i) => [v, i])); return [list, arr.map((x) => ix.get(x ?? "—"))]; };
const [countries, country] = dict(countryRaw);
const [sectors, sector] = dict(sectorRaw);
const [industries, industry] = dict(industryRaw);
const [exchanges, exchange] = dict(exch);

// ---------- medianas por industria (margen neto de empresas rentables > $200M)
const median = (a) => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const indNM = industries.map((_, k) => {
  const v = []; for (let i = 0; i < n; i++) if (industry[i] === k && C.nm[i] > 0 && C.nm[i] < 80 && C.mcap[i] > 2e8) v.push(C.nm[i]);
  return v.length >= 5 ? Math.round(median(v) * 10) / 10 : 7;
});
const indPE = industries.map((_, k) => {
  const v = []; for (let i = 0; i < n; i++) if (industry[i] === k && C.pe[i] > 0 && C.pe[i] < 200 && C.mcap[i] > 2e8) v.push(C.pe[i]);
  return v.length >= 5 ? Math.round(median(v) * 10) / 10 : null;
});

// ---------- escritura
const r4 = (x) => (x == null ? null : Math.abs(x) >= 1e4 ? Math.round(Number(x.toPrecision(5))) : Number(x.toPrecision(4)));
const out = new URL("public/data/", root);
if (existsSync(out)) rmSync(out, { recursive: true });
mkdirSync(new URL("m/", out), { recursive: true });
mkdirSync(new URL("rows/", out), { recursive: true });

const catalog = METRICS.map(({ tv, srcLabel, ...m }) => ({ ...m, src: tv ? "TradingView: " + tv : srcLabel || "Calculada", core: CORE_IDS.includes(m.id) }));
const meta = {
  rowsBlock: 500,
  fetchedAt: uni.fetchedAt, builtAt: new Date().toISOString(), n,
  categories: CATEGORIES, catalog,
  countries, sectors, industries, exchanges,
  sectorEs: sectors.map((s) => SECTOR_ES[s] || s),
  industryEs: industries.map((s) => INDUSTRY[s]?.[0] || s),
  industryModel: industries.map((s) => INDUSTRY[s]?.[1] || ""),
  indNM, indPE,
  descCoverage: Object.values(profiles).filter(Boolean).length,
};

const coreIds = [...new Set([...CORE_IDS, "net_cash"])];
const core = {
  sym, ticker, name, isin, logo, cur,
  country, sector, industry, exchange,
  common,
  hasDesc: sym.map((s) => (profiles[s] ? 1 : 0)),
  cols: Object.fromEntries(coreIds.map((id) => [id, cols[id].map(r4)])),
};
// Binario columnar. Extensión .json a propósito: el CDN de Vercel solo comprime (brotli/gzip) tipos de su
// lista (application/json sí, application/octet-stream no); el navegador lo lee con arrayBuffer().
const { logo: logoArr, ...coreWeb } = core;
const coreBin = encodeCore(coreWeb, exchanges);
if (!isDeepStrictEqual(decodeCore(coreBin), coreWeb)) throw new Error("core.bin: la decodificación no reproduce el núcleo");
writeFileSync(new URL("core.bin.json", out), coreBin);
writeFileSync(new URL("logo.json", out), JSON.stringify(logoArr));
meta.coreFile = "core.bin.json";
meta.coreBytes = coreBin.length;
writeFileSync(new URL("meta.json", out), JSON.stringify(meta));
for (const id of allIds) if (!coreIds.includes(id)) writeFileSync(new URL(`m/${id}.json`, out), JSON.stringify(cols[id].map(r4)));
// Bloques de 500 empresas con TODAS sus métricas + descripción (para la ficha de detalle)
for (let k = 0; k * 500 < n; k++) {
  const a = k * 500, b = Math.min(n, a + 500);
  const vals = Object.fromEntries(allIds.map((id) => [id, cols[id].slice(a, b).map(r4)]));
  writeFileSync(new URL(`rows/${k}.json`, out), JSON.stringify({ desc: sym.slice(a, b).map((s) => profiles[s] || ""), vals }));
}
// Columnas completas para el Excel
writeFileSync(new URL("data/derived.json", root), JSON.stringify({ cols: Object.fromEntries(allIds.map((id) => [id, cols[id].map(r4)])) }));
console.log(`OK build-data: ${n} empresas, core ${coreIds.length} métricas, ${allIds.length - coreIds.length} métricas lazy, descripciones ${meta.descCoverage}, señales Yahoo ${covSig.signals}, dilución SEC ${covSig.dilution}`);
