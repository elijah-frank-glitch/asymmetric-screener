// Descarga la descripción de negocio de cada empresa desde Yahoo Finance (assetProfile).
// Reanudable: guarda en data/profiles.json  { "EXCH:TICKER": "descripción" | "" }
// Uso: node scripts/fetch-profiles.mjs [maxNuevos]
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const MAX_NEW = Number(process.argv[2] || Infinity);
const CONC = 6;
const uni = JSON.parse(readFileSync(new URL("../data/universe.json", import.meta.url)));
const F = uni.fields;
const iName = F.indexOf("name"), iEx = F.indexOf("exchange"), iIsin = F.indexOf("isin");
const cachePath = new URL("../data/profiles.json", import.meta.url);
const cache = existsSync(cachePath) ? JSON.parse(readFileSync(cachePath)) : {};

// Sufijos de Yahoo por bolsa de TradingView (se prueban en orden)
const SUFFIX = {
  NASDAQ: [""], NYSE: [""], AMEX: [""], OTC: [""], CBOE: [""], NYSE_ARCA: [""],
  TSX: [".TO"], TSXV: [".V"], CSE: [".CN"], NEO: [".NE"],
  LSE: [".L"], AQUIS: [".AQ"], XETR: [".DE"], FWB: [".F"], GETTEX: [".MU"], LS: [".DE"], LSX: [".DE"],
  MIL: [".MI"], BME: [".MC"], SIX: [".SW"], BX: [".SW"], VIE: [".VI"], ATHEX: [".AT"], BIST: [".IS"],
  OMXSTO: [".ST"], NGM: [".ST"], OMXHEX: [".HE"], OMXCOP: [".CO"], OSL: [".OL"], OMXICE: [".IC"],
  OMXTSE: [".TL"], OMXRSE: [".RG"], OMXVSE: [".VS"], GPW: [".WA"], PSECZ: [".PR"], BET: [".BD"],
  BVB: [".RO"], ZSE: [".ZA"], LUXSE: [".LU"], TASE: [".TA"], JSE: [".JO"], EGX: [".CA"],
  TSE: [".T"], NAG: [".N"], FSE: [".F"], SAPSE: [".S"], SSE: [".SS"], SZSE: [".SZ"], HKEX: [".HK"],
  TWSE: [".TW"], TPEX: [".TWO"], KRX: [".KS", ".KQ"], NSE: [".NS"], BSE: [".BO"], IDX: [".JK"],
  MYX: [".KL"], SET: [".BK"], SGX: [".SI"], PSE: [".PS"], ASX: [".AX"], NZX: [".NZ"],
  BMFBOVESPA: [".SA"], BMV: [".MX"], BIVA: [".MX"], BCBA: [".BA"], BCS: [".SN"], BVL: [".LM"], BVC: [".CL"],
  TADAWUL: [".SR"], QSE: [".QA"], DFM: [".AE"], ADX: [".AE"], KSE: [".KW"], PSX: [".KA"],
  BAHRAIN: [".BH"], CSECY: [".CY"],
};
const EURONEXT_BY_ISIN = { FR: ".PA", NL: ".AS", BE: ".BR", PT: ".LS", IE: ".IR", NO: ".OL", IT: ".MI" };

function candidates(row) {
  const ex = row[iEx];
  let t = String(row[iName]);
  let sfx = SUFFIX[ex];
  if (ex === "EURONEXT") {
    const cc = String(row[iIsin] || "").slice(0, 2);
    sfx = [EURONEXT_BY_ISIN[cc] || ".PA", ".PA", ".AS", ".BR"];
  }
  if (!sfx) return [];
  if (ex === "HKEX") t = t.padStart(4, "0");
  if (sfx[0] === "") t = t.replace(/\./g, "-");
  else t = t.replace(/\.(?=[A-Z]$)/, "-").replace(/\//g, "-");
  if (ex === "TSX" || ex === "TSXV") t = t.replace(/\./g, "-");
  return [...new Set(sfx)].map((s) => t + s);
}

let cookie = "", crumb = "";
async function auth() {
  const r1 = await fetch("https://fc.yahoo.com", { redirect: "manual" });
  cookie = (r1.headers.get("set-cookie") || "").split(";")[0];
  crumb = await (await fetch("https://query2.finance.yahoo.com/v1/test/getcrumb", { headers: { cookie, "user-agent": "Mozilla/5.0" } })).text();
}

function trimSummary(s) {
  if (!s) return "";
  s = s.replace(/\s+/g, " ").trim();
  if (s.length <= 700) return s;
  const cut = s.slice(0, 700);
  const dot = cut.lastIndexOf(". ");
  return dot > 300 ? cut.slice(0, dot + 1) : cut + "…";
}

async function fetchOne(ySym) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const r = await fetch(
      `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(ySym)}?modules=assetProfile&crumb=${encodeURIComponent(crumb)}`,
      { headers: { cookie, "user-agent": "Mozilla/5.0" } }
    );
    if (r.status === 401 || r.status === 403) { await auth(); continue; }
    if (r.status === 429) { await new Promise((res) => setTimeout(res, 5000 * (attempt + 1))); continue; }
    if (r.status === 404) return null;
    if (!r.ok) { await new Promise((res) => setTimeout(res, 1000)); continue; }
    const j = await r.json();
    const p = j?.quoteSummary?.result?.[0]?.assetProfile;
    return p ? trimSummary(p.longBusinessSummary || p.description || "") : null;
  }
  return null;
}

await auth();
const todo = uni.rows.filter((r) => !(r[0] in cache)).slice(0, MAX_NEW);
console.log(`pendientes: ${todo.length} (en caché: ${Object.keys(cache).length})`);
let done = 0, found = 0, i = 0;
const save = () => writeFileSync(cachePath, JSON.stringify(cache));
async function worker() {
  while (i < todo.length) {
    const row = todo[i++];
    let summary = null;
    for (const y of candidates(row)) {
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
