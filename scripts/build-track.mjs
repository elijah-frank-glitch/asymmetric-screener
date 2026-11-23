// Evalúa todos los snapshots de data/predictions contra precios actuales (retorno de precio en USD)
// y escribe public/data/track.json. Contrato: docs/TRACK_CONTRACT.md §2.
// Nunca rompe el build: si falla la red escribe un track.json válido con "error" y retornos null.
// Opcional: --dir <carpeta> (o PREDICTIONS_DIR) para leer snapshots de otro lado, --out <archivo> para otra salida.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PRESETS } from "../src/model.js";
import { BENCHMARKS, fetchCloses, fetchFx, rnd, predictionsDir } from "./tv-prices.mjs";

const root = new URL("../", import.meta.url);
const dir = predictionsDir(root);
const oi = process.argv.indexOf("--out");
const outPath = oi > 0 && process.argv[oi + 1] ? resolve(process.argv[oi + 1]) : fileURLToPath(new URL("public/data/track.json", root));
const now = new Date();
const DAY = 86400000;
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);

function write(obj) {
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(obj));
  console.log(`OK track: ${obj.snapshots.length} snapshots${obj.error ? ` (error: ${obj.error})` : ""} → ${outPath}`);
}

// ---------- 1) Leer snapshots
const snaps = [];
try {
  if (existsSync(dir))
    for (const f of readdirSync(dir).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort().reverse()) {
      try { snaps.push(JSON.parse(readFileSync(new URL(f, dir)))); } catch (e) { console.warn(`⚠ Snapshot inválido ${f}: ${e.message}`); }
    }
} catch (e) {
  console.warn(`⚠ No se pudo leer ${fileURLToPath(dir)}: ${e.message}`);
}

const theoryIds = [];
const theoryNames = {};
for (const [id, p] of Object.entries(PRESETS)) if (id !== "custom") { theoryIds.push(id); theoryNames[id] = p.name; }
for (const s of snaps) for (const [id, t] of Object.entries(s.theories || {})) if (!theoryNames[id]) { theoryIds.push(id); theoryNames[id] = t.name; }

// ---------- 2) Precios y tipos de cambio actuales
let error = null, cur = {}, fxNow = {};
if (snaps.length) {
  try {
    const syms = new Set(BENCHMARKS.map((b) => b.sym));
    const curs = new Set(["USD"]);
    for (const s of snaps) {
      for (const b of Object.keys(s.benchmarks || {})) syms.add(b);
      for (const t of Object.values(s.theories || {})) for (const r of t.top || []) { syms.add(r.sym); if (r.currency) curs.add(r.currency); }
    }
    cur = await fetchCloses([...syms]);
    const r = await fetchFx([...curs]);
    fxNow = r.fx;
    if (r.missing.length) console.warn(`⚠ Sin tipo de cambio actual para: ${r.missing.join(", ")}`);
    if (!Object.keys(cur).length) throw new Error("TradingView no devolvió ningún precio");
  } catch (e) {
    error = e.message || String(e);
    cur = {}; fxNow = {};
    console.warn(`⚠ ${error}; se escribe track.json sin retornos.`);
  }
}

// ---------- 3) Evaluar
// Retorno USD = (actual/entrada) × (fx_actual/fx_entrada) − 1; null si falta algún dato
function usdRet(entry, current, currency, fxEntry) {
  if (!(entry > 0) || !(current > 0)) return null;
  const c = currency || "USD";
  const f0 = c === "USD" ? 1 : fxEntry?.[c], f1 = c === "USD" ? 1 : fxNow[c];
  if (!(f0 > 0) || !(f1 > 0)) return null;
  return (current / entry) * (f1 / f0) - 1;
}

const out = [];
try {
for (const s of snaps) {
  const days = Math.max(0, Math.floor((now - Date.parse(`${s.date}T00:00:00Z`)) / DAY));
  const bench = {};
  for (const b of BENCHMARKS) {
    const e = s.benchmarks?.[b.sym];
    bench[b.sym] = error ? null : rnd(usdRet(e?.close, cur[b.sym]?.close, e?.currency || "USD", s.fx));
  }
  const spy = bench["AMEX:SPY"];
  const theories = {};
  for (const [id, t] of Object.entries(s.theories || {})) {
    const top = (t.top || []).map((r) => {
      const current = cur[r.sym]?.close ?? null;
      const ret = error ? null : usdRet(r.price, current, r.currency, s.fx);
      return {
        rank: r.rank, sym: r.sym, ticker: r.ticker, name: r.name, country: r.country, currency: r.currency,
        entry: r.price, current, ret: rnd(ret), expCagr: r.cagr, missing: !error && ret == null,
      };
    });
    const bySym = Object.fromEntries(top.map((r) => [r.sym, r]));
    const picks = (t.portfolio || []).map((p) => {
      const r = bySym[p.sym] || { sym: p.sym, missing: !error, ret: null, entry: null, current: null };
      return { sym: p.sym, ticker: r.ticker, name: r.name, country: r.country, currency: r.currency, weight: p.weight, entry: r.entry, current: r.current, ret: r.ret, expCagr: r.expCagr, missing: r.missing };
    });
    // Portafolio: promedio ponderado sobre las que tienen precio (pesos renormalizados)
    const ok = picks.filter((p) => p.ret != null);
    const wSum = ok.reduce((a, p) => a + p.weight, 0);
    const pRet = ok.length && wSum > 0 ? ok.reduce((a, p) => a + p.weight * p.ret, 0) / wSum : null;
    const tOk = top.filter((r) => r.ret != null);
    theories[id] = {
      portfolio: { ret: rnd(pRet), missing: picks.filter((p) => p.missing).length, picks },
      top20: {
        ret: rnd(mean(tOk.map((r) => r.ret))),
        hitRate: tOk.length && spy != null ? rnd(tOk.filter((r) => r.ret > spy).length / tOk.length) : null,
        n: top.length, missing: top.filter((r) => r.missing).length,
      },
      top,
    };
  }
  out.push({ date: s.date, days, horizon: s.horizon, bench, theories });
}

// ---------- 4) Resumen sobre snapshots con al menos 1 día
const summary = {};
for (const id of theoryIds) {
  const rows = out.filter((s) => s.days >= 1 && s.theories[id]?.portfolio.ret != null);
  const withSpy = rows.filter((s) => s.bench["AMEX:SPY"] != null);
  const excess = withSpy.map((s) => s.theories[id].portfolio.ret - s.bench["AMEX:SPY"]);
  const t20 = rows.map((s) => s.theories[id].top20.ret).filter((x) => x != null);
  summary[id] = {
    snapshots: rows.length,
    avgPortfolioRet: rnd(mean(rows.map((s) => s.theories[id].portfolio.ret))),
    avgExcessVsSPY: rnd(mean(excess)),
    avgTop20Ret: rnd(mean(t20)),
    winRateVsSPY: excess.length ? rnd(excess.filter((x) => x > 0).length / excess.length) : null,
  };
}

write({
  version: 1,
  evaluatedAt: now.toISOString().replace(/\.\d{3}Z$/, "Z"),
  error,
  benchmarks: BENCHMARKS.map((b) => ({ sym: b.sym, label: b.label })),
  theories: theoryIds.map((id) => ({ id, name: theoryNames[id] })),
  snapshots: out,
  summary,
});
} catch (e) {
  // Último recurso: nunca romper el build
  console.warn(`⚠ Error evaluando snapshots: ${e.stack || e}`);
  write({
    version: 1, evaluatedAt: now.toISOString().replace(/\.\d{3}Z$/, "Z"), error: `Error evaluando snapshots: ${e.message || e}`,
    benchmarks: BENCHMARKS.map((b) => ({ sym: b.sym, label: b.label })),
    theories: theoryIds.map((id) => ({ id, name: theoryNames[id] })),
    snapshots: [], summary: {},
  });
}
