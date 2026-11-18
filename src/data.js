// Carga de datos en el navegador
let META = null;
const metricLoads = new Map();
const blockLoads = new Map();

export async function loadData(onProgress) {
  META = await (await fetch("/data/meta.json")).json();
  const res = await fetch("/data/core.json");
  const total = META.coreBytes || 15e6;
  let core;
  if (res.body && res.body.getReader) {
    const reader = res.body.getReader();
    const chunks = [];
    let got = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      got += value.length;
      onProgress?.(Math.min(0.99, got / total));
    }
    const buf = new Uint8Array(got);
    let o = 0;
    for (const c of chunks) { buf.set(c, o); o += c.length; }
    core = JSON.parse(new TextDecoder().decode(buf));
  } else core = await res.json();
  onProgress?.(1);
  const dirs = Object.fromEntries(META.catalog.map((m) => [m.id, m.better || 1]));
  const D = {
    n: META.n,
    cols: core.cols,
    dirs,
    sym: core.sym, ticker: core.ticker, name: core.name, isin: core.isin, cur: core.cur,
    common: core.common, hasDesc: core.hasDesc,
    country: core.country, sector: core.sector, industry: core.industry, exchange: core.exchange,
    countries: META.countries, sectors: META.sectors, industries: META.industries, exchanges: META.exchanges,
    indNM: META.indNM,
  };
  return { D, meta: META };
}

// Carga una métrica que no está en el núcleo (bajo demanda)
export function ensureMetric(D, id) {
  if (D.cols[id]) return Promise.resolve(false);
  if (!metricLoads.has(id)) {
    metricLoads.set(id, fetch(`/data/m/${id}.json`).then((r) => r.json()).then((arr) => { D.cols[id] = arr; return true; }));
  }
  return metricLoads.get(id);
}
export async function ensureMetrics(D, ids) {
  const r = await Promise.all(ids.filter((id) => !D.cols[id]).map((id) => ensureMetric(D, id)));
  return r.some(Boolean);
}

// Ficha completa de una empresa (todas las métricas + descripción)
export async function loadCompany(i) {
  const B = META.rowsBlock || 500;
  const k = Math.floor(i / B);
  if (!blockLoads.has(k)) blockLoads.set(k, fetch(`/data/rows/${k}.json`).then((r) => r.json()));
  const blk = await blockLoads.get(k);
  const j = i - k * B;
  const vals = {};
  for (const [id, arr] of Object.entries(blk.vals)) vals[id] = arr[j];
  return { desc: blk.desc[j], vals };
}
