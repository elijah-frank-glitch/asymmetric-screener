// Panel SINTÉTICO para probar run-backtest.mjs de punta a punta mientras no existe el panel real.
// Mismo formato que docs/BACKTEST_CONTRACT.md §1. Los retornos hacia adelante están parcialmente correlacionados
// con algunos fundamentales (FCF yield, ROIC, crecimiento, tamaño), así que un modelo razonable debería ordenar algo.
// NO escribe en data/backtest/panel.json: exige --out (por defecto un archivo temporal del sistema).
//   node scripts/backtest/make-fake-panel.mjs --out C:\tmp\fake-panel.json [--n 800] [--dates 5] [--gz]
import { writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { tmpdir } from "node:os";
import { join } from "node:path";

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const N = Number(arg("--n", 800));
const ND = Number(arg("--dates", 5));
const gz = process.argv.includes("--gz");
let out = arg("--out", join(tmpdir(), "fake-panel.json" + (gz ? ".gz" : "")));
if (/data[\\/]+backtest[\\/]+panel\.json/i.test(out)) { console.error("No sobrescribas el panel real con datos falsos."); process.exit(1); }

// Generador pseudoaleatorio con semilla fija (reproducible)
let seed = 4242;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const gauss = () => { const u = Math.max(rnd(), 1e-12), v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
const r1 = (x, d = 2) => Math.round(x * 10 ** d) / 10 ** d;

const dates = Array.from({ length: ND }, (_, k) => `${2017 + k}-04-30`);
const lastYear = 2025; // "hoy" ficticio: horizontes que terminen después de 2025-04-30 se marcan parciales
const companies = Array.from({ length: N }, (_, i) => ({
  cik: 100000 + i, ticker: `FK${String(i).padStart(4, "0")}`, name: `Fake Corp ${i}`,
  exchange: rnd() < 0.5 ? "Nasdaq" : "NYSE", sic: rnd() < 0.12 ? 6020 : rnd() < 0.1 ? 3674 : 7372,
}));

// Rasgos persistentes por empresa: calidad latente q y tamaño
const q = companies.map(() => gauss());
const size = companies.map(() => 8 + 3.2 * rnd() + 0.8 * gauss()); // log10 de mcap aprox.
const COLS = ["mcap", "revenue", "rev_g", "rev_cagr5", "gm", "nm", "fcf_m", "ebitda_m", "roic", "roa", "roe", "rd_rev",
  "net_cash", "div_yield", "buyback", "liq_usd", "ps", "pe", "pb", "ev_ebitda", "fcf_yield", "bm", "de", "invest_gap",
  "rule40", "gp_assets", "gp_g", "payout", "altman", "runway", "off_low", "price", "cr"];

const snapshots = {}, fwd = {}, partial = {}, spy = {};
for (const [d, date] of dates.entries()) {
  const C = Object.fromEntries(COLS.map((k) => [k, new Array(N).fill(null)]));
  const fyEnd = new Array(N).fill(null);
  const F = { 1: new Array(N).fill(null), 3: new Array(N).fill(null), 5: new Array(N).fill(null) };
  const y = 2017 + d;
  const mkt = 0.08 + 0.12 * gauss(); // shock de mercado del año
  for (let i = 0; i < N; i++) {
    if (rnd() < 0.07) continue; // no cotizaba / sin datos en esta fecha
    const qi = q[i] + 0.4 * gauss();
    const mcap = 10 ** (size[i] + 0.15 * d + 0.2 * gauss());
    const gm = Math.min(95, Math.max(5, 40 + 15 * qi + 10 * gauss()));
    const nm = Math.max(-60, Math.min(45, 4 + 6 * qi + 8 * gauss()));
    const revG = 8 + 10 * qi + 18 * gauss();
    const ps = Math.max(0.1, Math.exp(0.6 + 0.4 * qi + 0.7 * gauss()));
    const revenue = mcap / ps;
    const fcfM = nm + 3 * gauss();
    const fcfY = (fcfM / 100) * revenue / mcap * 100;
    const roic = 6 + 8 * qi + 6 * gauss();
    const sic = companies[i].sic;
    fyEnd[i] = `${y - 1}-12-31`;
    const v = {
      mcap, revenue, rev_g: revG, rev_cagr5: rnd() < 0.2 ? null : 0.7 * revG + 5 * gauss(), gm, nm, fcf_m: fcfM,
      ebitda_m: nm + 8 + 3 * gauss(), roic, roa: roic * 0.6, roe: roic * 1.3, rd_rev: sic === 3674 || sic === 7372 ? Math.max(0, 10 + 5 * gauss()) : null,
      net_cash: revenue * 0.1 * gauss(), div_yield: rnd() < 0.4 ? Math.max(0, 2 + gauss()) : 0, buyback: rnd() < 0.3 ? Math.max(0, 1 + gauss()) : 0,
      liq_usd: mcap * 0.004 * Math.exp(0.5 * gauss()), ps, pe: nm > 0 ? ps / (nm / 100) : null, pb: Math.exp(0.8 + 0.5 * gauss()),
      ev_ebitda: 8 + 4 * gauss(), fcf_yield: fcfY, bm: Math.exp(-0.8 + 0.5 * gauss()), de: Math.max(0, 0.6 + 0.5 * gauss()),
      invest_gap: 5 * gauss() - 2 * qi, rule40: revG + fcfM, gp_assets: gm * 0.6, gp_g: revG + 3 * gauss(), payout: rnd() < 0.4 ? 30 + 10 * gauss() : 0,
      altman: 2.5 + qi + gauss(), runway: fcfM < 0 ? Math.max(0.2, 2 + gauss()) : null, off_low: Math.max(0, 25 + 20 * gauss()),
      price: Math.exp(3 + gauss()), cr: Math.max(0.3, 1.8 + 0.6 * gauss()),
    };
    for (const k of COLS) C[k][i] = v[k] == null ? null : r1(v[k], k === "mcap" || k === "revenue" || k === "liq_usd" || k === "net_cash" ? 0 : 3);
    // Alpha anual: parte explicada por fundamentales (FCF yield, ROIC, crecimiento, tamaño pequeño) + ruido idiosincrático
    const alpha = 0.035 * qi + 0.004 * Math.max(-20, Math.min(20, fcfY)) - 0.02 * (size[i] - 9.5);
    for (const h of [1, 3, 5]) {
      if (rnd() < 0.03) continue; // sin precio al final del horizonte
      const hh = Math.min(h, lastYear - y) || 0.5; // horizontes parciales: se mide hasta "hoy"
      const lr = hh * (Math.log(1 + mkt) * (h === 1 ? 1 : 0.6) + 0.04 + alpha) + 0.42 * Math.sqrt(hh) * gauss();
      F[h][i] = r1(Math.max(-0.99, Math.exp(lr) - 1), 4);
    }
  }
  snapshots[date] = { fyEnd, cols: C };
  fwd[date] = F;
  partial[date] = { 1: y + 1 > lastYear, 3: y + 3 > lastYear, 5: y + 5 > lastYear };
  spy[date] = Object.fromEntries([1, 3, 5].map((h) => { const hh = Math.min(h, lastYear - y) || 0.5; return [h, r1(Math.exp(hh * (Math.log(1 + mkt) * (h === 1 ? 1 : 0.6) + 0.05)) - 1, 4)]; }));
}

const panel = {
  version: 1, builtAt: new Date().toISOString(), synthetic: true, dates, companies, snapshots, fwd, partial, spy,
  notes: ["PANEL SINTÉTICO (make-fake-panel.mjs): solo para probar el runner; los números no significan nada."],
};
const txt = JSON.stringify(panel);
writeFileSync(out, gz ? gzipSync(txt) : txt);
console.log(`OK panel sintético: ${N} empresas × ${ND} fechas → ${out}`);
