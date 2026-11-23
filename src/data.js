import { decodeCore } from "./corebin.js";
// Carga de datos en el navegador
let META = null;
const metricLoads = new Map();
const blockLoads = new Map();

// Caché local (Cache Storage) por versión de datos: las visitas repetidas no vuelven a descargar
// nada mientras meta.builtAt no cambie. Si el navegador no soporta caché, se descarga normal.
const CACHE = "asymmetric-data";
async function cachedBytes(url, version, onProgress, total) {
  const key = url + "?v=" + encodeURIComponent(version || "");
  let cache = null;
  try { cache = typeof caches !== "undefined" ? await caches.open(CACHE) : null; } catch {}
  if (cache) {
    try {
      const hit = await cache.match(key);
      if (hit) { onProgress?.(0.99); return new Uint8Array(await hit.arrayBuffer()); }
    } catch {}
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(url + " HTTP " + res.status);
  let buf;
  if (res.body && res.body.getReader) {
    const reader = res.body.getReader();
    const chunks = [];
    let got = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      got += value.length;
      onProgress?.(Math.min(0.99, got / (total || 15e6)));
    }
    buf = new Uint8Array(got);
    let o = 0;
    for (const c of chunks) { buf.set(c, o); o += c.length; }
  } else buf = new Uint8Array(await res.arrayBuffer());
  if (cache) {
    try {
      // borra versiones viejas de este mismo archivo y guarda la nueva
      for (const req of await cache.keys()) if (req.url.includes(url + "?v=") && !req.url.endsWith(key.slice(key.indexOf("?v=")))) await cache.delete(req);
      await cache.put(key, new Response(buf));
    } catch {}
  }
  return buf;
}

export async function loadData(onProgress) {
  META = await (await fetch("/data/meta.json", { cache: "no-cache" })).json();
  const file = "/data/" + (META.coreFile || "core.json");
  const bytes = await cachedBytes(file, META.builtAt, onProgress, META.coreBytes);
  const core = META.coreFile ? decodeCore(bytes) : JSON.parse(new TextDecoder().decode(bytes));
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
    metricLoads.set(id, cachedBytes(`/data/m/${id}.json`, META?.builtAt).then((b) => JSON.parse(new TextDecoder().decode(b))).then((arr) => { D.cols[id] = arr; return true; }));
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
  if (!blockLoads.has(k)) blockLoads.set(k, cachedBytes(`/data/rows/${k}.json`, META?.builtAt).then((b) => JSON.parse(new TextDecoder().decode(b))));
  const blk = await blockLoads.get(k);
  const j = i - k * B;
  const vals = {};
  for (const [id, arr] of Object.entries(blk.vals)) vals[id] = arr[j];
  return { desc: blk.desc[j], vals };
}
