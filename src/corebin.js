// Formato binario del núcleo (core) — compartido por build-data (Node) y el navegador.
//
// Contenedor:  "ASY1" | u32 LE largo del header | header JSON (UTF-8) | relleno a 4 | bloque binario
// Header:      { v, n, ids, exchanges, ints:{campo:ancho}, symEx:{i:sym}, str:{ticker,name,isin,cur} }
// Bloque:      por cada campo entero (country, sector, …): n×ancho bytes en planos (byte bajo, luego alto)
//              por cada métrica (ids): plano de exponentes Int8 (n bytes; -128 = null) +
//              mantisa entera de 24 bits en 3 planos de bytes (3n). valor = m·10^e (o m/10^-e),
//              que es exactamente el double más cercano al decimal → idéntico a JSON.parse del valor r4.
// sym no se guarda: es exchanges[exchange[i]] + ":" + ticker[i]; las excepciones van en symEx.
const MAGIC = 0x31595341; // "ASY1" LE
const P = Array.from({ length: 23 }, (_, k) => 10 ** k);
const NULL_E = -128;
export const INT_FIELDS = ["country", "sector", "industry", "exchange", "common", "hasDesc"];
export const STR_FIELDS = ["ticker", "name", "isin", "cur"];

const dec = (m, e) => (e >= 0 ? m * P[e] : m / P[-e]);

// Descompone un número (ya redondeado a 4–5 cifras) en mantisa entera y exponente decimal
function split(y) {
  if (y === 0) return [0, 0];
  let s = String(y);
  const neg = s[0] === "-";
  if (neg) s = s.slice(1);
  let e = 0;
  const ei = s.indexOf("e");
  if (ei >= 0) { e = +s.slice(ei + 1); s = s.slice(0, ei); }
  const di = s.indexOf(".");
  if (di >= 0) { e -= s.length - di - 1; s = s.slice(0, di) + s.slice(di + 1); }
  s = s.replace(/^0+/, "");
  while (s.length > 1 && s.endsWith("0")) { s = s.slice(0, -1); e++; }
  const m = neg ? -Number(s) : Number(s);
  return [m, e];
}

export function encodeCore(core, exchanges) {
  const n = core.ticker.length;
  const ids = Object.keys(core.cols);
  const symEx = {};
  for (let i = 0; i < n; i++) if (core.sym[i] !== exchanges[core.exchange[i]] + ":" + core.ticker[i]) symEx[i] = core.sym[i];
  const ints = {};
  for (const f of INT_FIELDS) {
    let max = 0;
    for (const x of core[f]) {
      if (!Number.isInteger(x) || x < 0) throw new Error(`corebin: ${f} no es entero ≥0: ${x}`);
      if (x > max) max = x;
    }
    if (max > 65535) throw new Error(`corebin: ${f} excede 16 bits`);
    ints[f] = max < 256 ? 1 : 2;
  }
  const header = { v: 1, n, ids, exchanges, ints, symEx, str: Object.fromEntries(STR_FIELDS.map((f) => [f, core[f]])) };
  const hb = new TextEncoder().encode(JSON.stringify(header));
  const start = (8 + hb.length + 3) & ~3;
  const size = start + INT_FIELDS.reduce((a, f) => a + n * ints[f], 0) + ids.length * 4 * n;
  const buf = new Uint8Array(size);
  const dv = new DataView(buf.buffer);
  dv.setUint32(0, MAGIC, true);
  dv.setUint32(4, hb.length, true);
  buf.set(hb, 8);
  let o = start;
  for (const f of INT_FIELDS) {
    const a = core[f], w = ints[f];
    for (let i = 0; i < n; i++) { buf[o + i] = a[i] & 255; if (w === 2) buf[o + n + i] = a[i] >> 8; }
    o += n * w;
  }
  for (const id of ids) {
    const a = core.cols[id];
    if (a.length !== n) throw new Error(`corebin: ${id} largo ${a.length} ≠ ${n}`);
    for (let i = 0; i < n; i++) {
      const y = a[i];
      let m = 0, e = NULL_E;
      if (y != null) {
        [m, e] = split(y);
        if (Math.abs(m) >= 1 << 23 || e < -22 || e > 22 || dec(m, e) !== y) throw new Error(`corebin: ${id}[${i}]=${y} no representable`);
      }
      const u = m & 0xffffff;
      buf[o + i] = e & 255;
      buf[o + n + i] = u & 255;
      buf[o + 2 * n + i] = (u >> 8) & 255;
      buf[o + 3 * n + i] = u >> 16;
    }
    o += 4 * n;
  }
  return buf;
}

// ArrayBuffer | Uint8Array → { sym, ticker, name, isin, cur, country, …, hasDesc, cols } con arrays planos (number|null)
export function decodeCore(input) {
  const buf = input instanceof Uint8Array ? input : new Uint8Array(input);
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (dv.getUint32(0, true) !== MAGIC) throw new Error("corebin: formato desconocido");
  const hl = dv.getUint32(4, true);
  const header = JSON.parse(new TextDecoder().decode(buf.subarray(8, 8 + hl)));
  const { n, ids, ints, exchanges, symEx, str } = header;
  const core = { ...str };
  let o = (8 + hl + 3) & ~3;
  for (const f of INT_FIELDS) {
    const w = ints[f], a = new Array(n);
    if (w === 1) for (let i = 0; i < n; i++) a[i] = buf[o + i];
    else for (let i = 0; i < n; i++) a[i] = buf[o + i] | (buf[o + n + i] << 8);
    core[f] = a;
    o += n * w;
  }
  const sym = new Array(n);
  for (let i = 0; i < n; i++) sym[i] = symEx[i] ?? exchanges[core.exchange[i]] + ":" + core.ticker[i];
  core.sym = sym;
  const E = new Int8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  const cols = {};
  for (const id of ids) {
    const a = new Array(n);
    for (let i = 0; i < n; i++) {
      const e = E[o + i];
      if (e === NULL_E) { a[i] = null; continue; }
      let m = buf[o + n + i] | (buf[o + 2 * n + i] << 8) | (buf[o + 3 * n + i] << 16);
      if (m & 0x800000) m -= 0x1000000;
      a[i] = e >= 0 ? m * P[e] : m / P[-e];
    }
    cols[id] = a;
    o += 4 * n;
  }
  core.cols = cols;
  return core;
}
