// Cambio % anual del número de acciones (1 año y CAGR 3 años), ajustado por splits.
// Compartido por build-panel.mjs (backtest, point-in-time) y scripts/build-dilution-us.mjs (universo de hoy).
//
// Fuentes (frames XBRL de la SEC, no ajustan splits):
//   dei  = EntityCommonStockSharesOutstanding (portada; valor "tal cual" a la fecha de portada, no se reexpresa)
//   dil  = WeightedAverageNumberOfDilutedSharesOutstanding (promedio del año; el frame trae el ÚLTIMO filing que
//          reportó ese año: fin + ~14 meses si el filer muestra 2 años, + ~26 meses si muestra 3; ese filing ya
//          reexpresa los splits ocurridos hasta entonces → un split en esa ventana puede estar o no aplicado)
// Se compara siempre dentro de la MISMA fuente. dei: ajuste exacto con los splits de Yahoo entre ambas portadas.
// dil: el ratio año contra año se corrige por los splits de la ventana ambigua eligiendo la hipótesis
// (aplicado / no aplicado) con el cambio más pequeño; el CAGR 3a encadena los 3 ratios anuales cuando existen.
// Red de seguridad SOLO si no hay historial de splits de Yahoo (splits = null): un salto ≈ múltiplo entero (≥ 1.8x o
// ≤ 0.55x, ±3%) se trata como split no ajustado. Con historial de Yahoo no se aplica: diluidores reales duplican
// acciones en un año (AMC 2024: 1.99x) y se confundirían con un split.
const DAY = 86400e3;
const MO = 30.4 * DAY;
const YEAR = 365.25 * DAY;
const okn = (x) => typeof x === "number" && Number.isFinite(x);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

// Yahoo mete los spin-offs como "splits" con ratios raros (GE 1.281, 1.04...): el número de acciones NO cambia.
// Solo se aceptan ratios racionales simples n/k (k ≤ 10), directos o inversos.
const nearRational = (r) => { for (let k = 1; k <= 10; k++) { const x = r * k; if (Math.round(x) >= 1 && Math.abs(x - Math.round(x)) / x < 2e-3) return true; } return false; };
export const isRealSplit = (r) => r > 0 && r !== 1 && (nearRational(r) || nearRational(1 / r));
// splits: [[ms, ratio]] → solo los reales
export const realSplits = (splits) => (splits || []).filter(([, r]) => isRealSplit(r));
const splitsAfter = (splits, ms) => splits.reduce((s, [t, r]) => (t > ms ? s * r : s), 1);

// ¿El ratio parece un split no ajustado? Devuelve el factor a quitar (o 1)
const SPLIT_K = [2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30, 40, 50, 100];
function residualSplit(r) {
  if (!(r > 0)) return 1;
  if (r >= 1.8) { for (const k of SPLIT_K) if (Math.abs(r / k - 1) < 0.03) return k; }
  else if (r <= 0.55) { for (const k of SPLIT_K) if (Math.abs(r * k - 1) < 0.03) return 1 / k; }
  return 1;
}

// Ratio limpio: quita splits residuales; errores de escala del filer (miles vs unidades) o cambios de clase
// (fuera de [1/8, 8]) → null
function cleanRatio(r, residual) {
  if (!(r > 0 && Number.isFinite(r))) return null;
  if (residual) r /= residualSplit(r);
  return r > 8 || r < 1 / 8 ? null : r;
}
const annualized = (r, years) => (r > 0 && years > 0 ? (Math.pow(r, 1 / years) - 1) * 100 : null);
// Productos de todos los subconjuntos de una lista de ratios (≤ 4 splits → ≤ 16 hipótesis)
const subsetProducts = (rs) => rs.slice(0, 4).reduce((acc, r) => acc.concat(acc.map((x) => x * r)), [1]);

// Límites de sanidad (en %/año): recompras > 25%/año casi no existen; diluciones > 150%/año suelen ser recapitalizaciones
export const G1_RANGE = [-30, 150];
export const G3_RANGE = [-20, 80];

/**
 * @param o.dei   (Y) => [valor, finMs] | null  — frame CY{Y}Q4I de la portada
 * @param o.dil   (Y) => [valor, finMs] | null  — frame CY{Y} de diluidas promedio
 * @param o.splits [[ms, ratio]] splits de Yahoo (se filtran los reales) o null si no hay archivo de precios
 * @param o.deiY  año del último frame de portada visible (o null)
 * @param o.dilY  año del último frame de diluidas visible (o null)
 * @param o.listedMs ms de la primera cotización si es reciente (IPO / de-SPAC / relisting) o null
 * @param o.now   ms "hoy" (límite de la ventana de splits ambiguos de las diluidas)
 * @returns { g1, g3, src } en %/año (null si no hay dato)
 */
export function sharesGrowth({ dei, dil, splits, deiY, dilY, listedMs = null, now = Date.now() }) {
  const sp = realSplits(splits);
  const residual = splits == null;
  // Ventanas que empiezan antes de que la acción cotizara (IPO, de-SPAC, salida de quiebra): el "cambio" de acciones
  // mezcla la conversión de preferentes / la recapitalización con dilución real → sin dato
  const preListing = (ms) => listedMs != null && ms < listedMs - 31 * DAY;
  // dei: valor tal cual a la fecha de portada → ajuste exacto por los splits entre ambas portadas
  const deiAt = (Y) => { const e = Y != null ? dei(Y) : null; return e && e[0] > 0 ? [e[0] * splitsAfter(sp, e[1]), e[1]] : null; };
  // dei: la fecha de portada varía (10-K / 10-Q) → anualizar con el tiempo real y exigir una separación razonable
  const fromDei = (back) => {
    const a = deiAt(deiY), b = deiAt(deiY != null ? deiY - back : null);
    if (!a || !b || preListing(b[1])) return null;
    const yrs = (a[1] - b[1]) / YEAR;
    if (yrs < back * 0.6 || yrs > back * 1.5) return null;
    return annualized(cleanRatio(a[0] / b[0], residual), yrs);
  };
  // dil: ratio a/b con los splits ambiguos (reexpresados en el último filing de a pero quizá no en el de b):
  // los de (fin_b + 13 meses, min(fin_a + 27 meses, hoy)]. Se elige la hipótesis con |log ratio| mínimo.
  const dilE = (Y) => { const e = Y != null ? dil(Y) : null; return e && e[0] > 0 ? e : null; };
  const dilRatio = (ea, eb) => {
    const r0 = ea[0] / eb[0];
    const amb = sp.filter(([t]) => t > eb[1] + 13 * MO && t <= Math.min(ea[1] + 27 * MO, now)).map(([, r]) => r);
    let best = r0;
    for (const k of subsetProducts(amb)) if (Math.abs(Math.log(r0 / k)) < Math.abs(Math.log(best))) best = r0 / k;
    return cleanRatio(best, residual);
  };
  const fromDil = (back) => {
    const a = dilE(dilY), b = dilE(dilY != null ? dilY - back : null);
    // promedio del año: el año b completo debe ser posterior a la cotización (si no, mezcla la conversión del IPO)
    if (!a || !b || preListing(b[1] - YEAR)) return null;
    const yrs = (a[1] - b[1]) / YEAR;
    if (yrs < back * 0.75 || yrs > back * 1.3) return null;
    // Encadenar ratios anuales (cada salto se limpia por separado); si falta un año intermedio, ratio directo
    let r = 1;
    for (let k = 0; k < back && r != null; k++) {
      const x = dilE(dilY - k), y = dilE(dilY - k - 1);
      r = x && y ? (() => { const q = dilRatio(x, y); return q == null ? null : r * q; })() : null;
    }
    if (r == null) r = dilRatio(a, b);
    return annualized(r, yrs);
  };
  // Preferir portada (contrato); si ambas existen y discrepan > 10 pp/año (multiclase, una sola clase en portada,
  // cambio de definición) usar diluidas, que cubren todas las clases y vienen reexpresadas.
  const pick = (back) => {
    const a = fromDei(back), b = fromDil(back);
    if (okn(a) && okn(b)) return Math.abs(a - b) > 10 ? [b, "dil"] : [a, "dei"];
    if (okn(a)) return [a, "dei"];
    if (okn(b)) return [b, "dil"];
    return [null, null];
  };
  const [g1, s1] = pick(1), [g3, s3] = pick(3);
  return {
    g1: okn(g1) ? clamp(g1, ...G1_RANGE) : null,
    g3: okn(g3) ? clamp(g3, ...G3_RANGE) : null,
    src: s3 || s1,
  };
}
