// Utilidades compartidas para Yahoo Finance (usadas por fetch-profiles.mjs y fetch-signals.mjs):
// cookie/crumb, mapeo de bolsa de TradingView → sufijo de Yahoo, quoteSummary con reintentos y guardado atómico.
import { writeFileSync, renameSync } from "node:fs";

// Sufijos de Yahoo por bolsa de TradingView (se prueban en orden)
export const SUFFIX = {
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

// Símbolos candidatos de Yahoo para una fila del universo (ticker, bolsa, ISIN)
export function yahooCandidates(ticker, ex, isin) {
  let t = String(ticker);
  let sfx = SUFFIX[ex];
  if (ex === "EURONEXT") {
    const cc = String(isin || "").slice(0, 2);
    sfx = [EURONEXT_BY_ISIN[cc] || ".PA", ".PA", ".AS", ".BR"];
  }
  if (!sfx) return [];
  if (ex === "HKEX") t = t.padStart(4, "0");
  if (sfx[0] === "") t = t.replace(/\./g, "-");
  else t = t.replace(/\.(?=[A-Z]$)/, "-").replace(/\//g, "-");
  if (ex === "TSX" || ex === "TSXV") t = t.replace(/\./g, "-");
  return [...new Set(sfx)].map((s) => t + s);
}

// Sesión de Yahoo (cookie + crumb); se renueva sola ante 401/403
let cookie = "", crumb = "";
export async function yahooAuth() {
  const r1 = await fetch("https://fc.yahoo.com", { redirect: "manual" });
  cookie = (r1.headers.get("set-cookie") || "").split(";")[0];
  crumb = await (await fetch("https://query2.finance.yahoo.com/v1/test/getcrumb", { headers: { cookie, "user-agent": "Mozilla/5.0" } })).text();
}

const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

// quoteSummary con reintentos y backoff ante 429. Devuelve result[0] o null (404 / sin datos).
export async function quoteSummary(ySym, modules) {
  for (let attempt = 0; attempt < 5; attempt++) {
    let r;
    try {
      r = await fetch(
        `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(ySym)}?modules=${modules}&crumb=${encodeURIComponent(crumb)}`,
        { headers: { cookie, "user-agent": "Mozilla/5.0" } }
      );
    } catch { await sleep(2000); continue; }
    if (r.status === 401 || r.status === 403) { await yahooAuth().catch(() => {}); continue; }
    if (r.status === 429) { await sleep(5000 * (attempt + 1)); continue; }
    if (r.status === 404) return null;
    if (!r.ok) { await sleep(1000); continue; }
    const j = await r.json().catch(() => null);
    return j?.quoteSummary?.result?.[0] || null;
  }
  return null;
}

// Escritura atómica (tmp + rename) y tolerante a bloqueos de archivo
export function atomicSave(path, obj) {
  try { writeFileSync(path + ".tmp", JSON.stringify(obj)); renameSync(path + ".tmp", path); return true; }
  catch (e) { console.warn("no se pudo guardar (se reintenta luego):", e.code); return false; }
}
