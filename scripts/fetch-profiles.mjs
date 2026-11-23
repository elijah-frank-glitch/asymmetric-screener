// Descarga la descripción de negocio de cada empresa desde Yahoo Finance (assetProfile).
// Reanudable: guarda en data/profiles.json  { "EXCH:TICKER": "descripción" | "" }
// Uso: node scripts/fetch-profiles.mjs [maxNuevos]
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { yahooCandidates, yahooAuth, quoteSummary, atomicSave } from "./yahoo.mjs";

const MAX_NEW = Number(process.argv[2] || Infinity);
const CONC = 6;
const uni = JSON.parse(readFileSync(new URL("../data/universe.json", import.meta.url)));
const F = uni.fields;
const iName = F.indexOf("name"), iEx = F.indexOf("exchange"), iIsin = F.indexOf("isin");
const cachePath = new URL("../data/profiles.json", import.meta.url);
const cache = existsSync(cachePath) ? JSON.parse(readFileSync(cachePath)) : {};

function trimSummary(s) {
  if (!s) return "";
  s = s.replace(/\s+/g, " ").trim();
  if (s.length <= 700) return s;
  const cut = s.slice(0, 700);
  const dot = cut.lastIndexOf(". ");
  return dot > 300 ? cut.slice(0, dot + 1) : cut + "…";
}

async function fetchOne(ySym) {
  const res = await quoteSummary(ySym, "assetProfile");
  const p = res?.assetProfile;
  return p ? trimSummary(p.longBusinessSummary || p.description || "") : null;
}

await yahooAuth();
const todo = uni.rows.filter((r) => !(r[0] in cache)).slice(0, MAX_NEW);
console.log(`pendientes: ${todo.length} (en caché: ${Object.keys(cache).length})`);
let done = 0, found = 0, i = 0;
const save = () => atomicSave(fileURLToPath(cachePath), cache);
async function worker() {
  while (i < todo.length) {
    const row = todo[i++];
    let summary = null;
    for (const y of yahooCandidates(row[iName], row[iEx], row[iIsin])) {
      try { summary = await fetchOne(y); } catch { summary = null; }
      if (summary) break;
    }
    cache[row[0]] = summary || "";
    if (summary) found++;
    if (++done % 250 === 0) { save(); console.log(`${done}/${todo.length} encontrados ${found}`); }
  }
}
await Promise.all(Array.from({ length: CONC }, worker));
save();
console.log(`FIN: ${done} procesados, ${found} con descripción`);
