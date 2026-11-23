// Enlaces compartibles: el estado relevante viaja en el hash de la URL como
// "#v1.<base64url(JSON)>". Solo se guarda lo que difiere de los valores por defecto
// para que el link quede corto. Al abrirlo, se valida todo y lo desconocido se ignora.
import { PRESETS, PARAM_INFO, WEIGHTING } from "./model.js";
import { DEFAULT_FILTERS } from "./engine.js";

export const PREFIX = "v1.";
export const TABS = ["screener", "portfolio", "track", "backtest", "metrics", "method"];
export const MAX_COMPARE = 4;
const RANK_BY = ["elog", "cagr", "kelly", "score"];

// ── base64url de texto UTF-8 ──
function b64urlEncode(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlDecode(s) {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const isNum = (x) => typeof x === "number" && Number.isFinite(x);
const isObj = (x) => x && typeof x === "object" && !Array.isArray(x);
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const strArr = (x, max = 500) => (Array.isArray(x) ? x.filter((v) => typeof v === "string" && v.length <= 200).slice(0, max) : null);

// ── codificar ──
// defaults: defaultSettings() de App. extra: { tab, sym, cmp, cv }
export function encodeState(settings, defaults, extra = {}) {
  const S = {};
  if (settings.preset !== defaults.preset) S.p = settings.preset;
  if (settings.preset === "custom") S.w = settings.weights;
  else if (!same(settings.weights, PRESETS[settings.preset]?.weights)) S.w = settings.weights;
  const baseP = PRESETS[settings.preset]?.params || {};
  const pd = {};
  for (const [k, v] of Object.entries(settings.params || {})) if (baseP[k] !== v) pd[k] = v;
  if (Object.keys(pd).length) S.pa = pd;
  const simple = { h: "horizon", n: "nPicks", wt: "weighting", mw: "maxW", rb: "rankBy", c: "capital", mi: "maxPerIndustry", x: "excluded", cl: "columns" };
  for (const [short, k] of Object.entries(simple)) if (!same(settings[k], defaults[k])) S[short] = settings[k];
  const fd = {};
  for (const k of Object.keys(DEFAULT_FILTERS)) if (!same(settings.filters?.[k], DEFAULT_FILTERS[k])) fd[k] = settings.filters[k];
  if (Object.keys(fd).length) S.f = fd;

  const o = { S };
  if (extra.tab && extra.tab !== "screener") o.t = extra.tab;
  if (extra.sym) o.s = extra.sym;
  if (extra.cmp?.length) o.k = extra.cmp;
  if (extra.cv) o.cv = 1;
  return PREFIX + b64urlEncode(JSON.stringify(o));
}

export function shareUrl(hash) {
  const { origin, pathname, search } = window.location;
  return `${origin}${pathname}${search}#${hash}`;
}

// ── decodificar (nunca lanza; null si no es un link válido) ──
export function decodeHash(hash) {
  try {
    const h = (hash || "").replace(/^#/, "");
    if (!h.startsWith(PREFIX)) return null;
    const o = JSON.parse(b64urlDecode(h.slice(PREFIX.length)));
    return isObj(o) ? o : null;
  } catch {
    return null;
  }
}

// Valida el payload contra los defaults y el catálogo (si ya está cargado).
// Devuelve { settings | null, tab | null, sym | null, cmp: [], cv: bool }
export function applyShared(o, defaults, meta, D) {
  const out = { settings: null, tab: null, sym: null, cmp: [], cv: false };
  if (!isObj(o)) return out;
  const catIds = meta ? new Set(meta.catalog.map((m) => m.id)) : null;
  const okId = (id) => typeof id === "string" && /^[a-z0-9_]{1,40}$/i.test(id) && (!catIds || catIds.has(id));
  const symSet = D ? new Set(D.sym) : null;
  const okSym = (s) => typeof s === "string" && s.length <= 60 && (!symSet || symSet.has(s));

  if (isObj(o.S)) {
    try {
      const S = o.S;
      const s = { ...defaults, filters: { ...DEFAULT_FILTERS } };
      if (typeof S.p === "string" && PRESETS[S.p]) s.preset = S.p;
      const P = PRESETS[s.preset];
      s.weights = { ...P.weights };
      s.params = { ...P.params };
      if (isObj(S.w)) {
        const w = {};
        for (const [k, v] of Object.entries(S.w)) if (okId(k) && isNum(v) && v >= 0) w[k] = Math.min(v, 1000);
        s.weights = w;
      }
      if (isObj(S.pa)) {
        for (const [k, v] of Object.entries(S.pa)) {
          const info = PARAM_INFO[k];
          if (info && isNum(v)) s.params[k] = clamp(v, info.min, info.max);
          else if (k in s.params && typeof v === typeof s.params[k]) s.params[k] = v; // supuestos sin rango definido
        }
      }
      if (isNum(S.h)) s.horizon = clamp(Math.round(S.h * 2) / 2, 0.5, 20);
      if (isNum(S.n)) s.nPicks = clamp(Math.round(S.n), 1, 30);
      if (typeof S.wt === "string" && WEIGHTING[S.wt]) s.weighting = S.wt;
      if (isNum(S.mw)) s.maxW = clamp(S.mw, 0.05, 1);
      if (RANK_BY.includes(S.rb)) s.rankBy = S.rb;
      if (isNum(S.c)) s.capital = clamp(S.c, 0, 1e12);
      if (isNum(S.mi)) s.maxPerIndustry = clamp(Math.round(S.mi), 0, 30);
      const x = strArr(S.x); if (x) s.excluded = x;
      const cl = strArr(S.cl, 60); if (cl) s.columns = [...new Set(cl.filter(okId))];
      if (isObj(S.f)) {
        const f = S.f, F = s.filters;
        for (const k of ["mcapMin", "mcapMax", "liqMin"]) if (k in f) F[k] = isNum(f[k]) && f[k] > 0 ? f[k] : null;
        if (isNum(f.confMin)) F.confMin = clamp(f.confMin, 0, 1);
        for (const k of ["requireRevenue", "commonOnly", "accessibleOnly"]) if (typeof f[k] === "boolean") F[k] = f[k];
        for (const k of ["sectors", "countries", "excludeIndustries"]) { const a = strArr(f[k]); if (a) F[k] = a; }
        if (typeof f.search === "string") F.search = f.search.slice(0, 100);
        if (Array.isArray(f.ranges)) {
          const nv = (v) => (v === "" || v == null ? "" : isNum(v) ? v : typeof v === "string" && v.length < 30 && Number.isFinite(Number(v)) ? v : "");
          F.ranges = f.ranges.filter((r) => isObj(r) && okId(r.id)).slice(0, 30).map((r) => ({ id: r.id, min: nv(r.min), max: nv(r.max) }));
        }
      }
      out.settings = s;
    } catch {
      out.settings = null;
    }
  }
  out.tab = TABS.includes(o.t) ? o.t : "screener"; // sin pestaña en el link = Screener
  if (okSym(o.s)) out.sym = o.s;
  if (Array.isArray(o.k)) out.cmp = [...new Set(o.k.filter(okSym))].slice(0, MAX_COMPARE);
  out.cv = o.cv === 1 && out.cmp.length > 0;
  return out;
}

// Copiar al portapapeles con respaldo para contextos no seguros
export async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {}
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

// En móvil usa la hoja nativa de compartir; si no, copia. Devuelve "shared" | "copied" | "aborted" | "failed".
export async function shareLink(url, title) {
  const mobile = typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches;
  if (mobile && navigator.share) {
    try {
      await navigator.share({ title, url });
      return "shared";
    } catch (e) {
      if (e && e.name === "AbortError") return "aborted";
    }
  }
  return (await copyText(url)) ? "copied" : "failed";
}
