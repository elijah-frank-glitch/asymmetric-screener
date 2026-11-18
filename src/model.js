// ============================================================================
// Motor del modelo: ADN Multibagger → escenarios → retorno esperado → Kelly
// Todo corre en el navegador, sobre ~49k acciones, cada vez que el usuario
// cambia horizonte, teoría, pesos o supuestos.
// ============================================================================

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const isNum = (x) => typeof x === "number" && Number.isFinite(x);

// ---------------------------------------------------------------------------
// Teorías / presets. weights: id de métrica → peso. La dirección (más alto o
// más bajo es mejor) viene del catálogo de métricas.
// ---------------------------------------------------------------------------
export const PRESETS = {
  adn: {
    name: "ADN Multibagger (default)",
    short: "ADN",
    desc:
      "Combina lo que tenían en común las grandes apuestas antes de explotar (NVDA 2016, MNST 2003, MU 2016, AAPL 2003, SMCI 2022, CELH 2020): tamaño pequeño, flujo de caja libre barato, crecimiento acelerando, margen bruto alto, ROIC alto, I+D, balance limpio y precio cerca de mínimos. Pesos basados en Yartseva (2025) y Mayer (100 Baggers, 2015).",
    weights: {
      mcap: 12, fcf_yield: 14, bm: 5, rev_g: 10, accel: 6, rev_fwd_g: 6, rev_cagr5: 6, gm: 8, roic: 8, roa: 4,
      rd_rev: 5, invest_gap: 5, off_low: 4, de: 4, piotroski: 3, altman: 3, rule40: 6,
    },
    params: { gT: 4, peCap: 40, persistBase: 0.55, persistQual: 0.35, marginSpeed: 0.25, marketAnchor: 0.35, shrink: 0.25, convSpeed: 0.3, bullScale: 1, bearScale: 1 },
  },
  mayer: {
    name: "Twin Engines · 100 Baggers (Mayer)",
    short: "Mayer",
    desc:
      "Chris Mayer: los 100-baggers combinan dos motores — crecimiento sostenido de utilidades por reinvertir a ROIC alto, y expansión del múltiplo. Prioriza ROIC, márgenes, crecimiento largo, tamaño pequeño y reinversión (bajo payout).",
    weights: { roic: 16, roe: 6, gm: 10, rev_cagr5: 12, rev_g: 10, mcap: 12, payout: 5, ps: 6, pe: 6, de: 5, rule40: 6, nm: 6 },
    params: { gT: 4, peCap: 50, persistBase: 0.62, persistQual: 0.33, marginSpeed: 0.25, marketAnchor: 0.3, shrink: 0.25, convSpeed: 0.3, bullScale: 1.1, bearScale: 1 },
  },
  value: {
    name: "Valor + Flujo de caja (Yartseva)",
    short: "Valor",
    desc:
      "Réplica de los hallazgos de 'The Alchemy of Multibagger Stocks' (Yartseva, 2025, 464 multibaggers 2009-2024): FCF yield alto y book-to-market alto como predictores más fuertes, empresas pequeñas y rentables (ROA, margen EBITDA), que no inflan activos más rápido que su EBITDA y que se compran cerca de mínimos de 52 semanas.",
    weights: { fcf_yield: 22, bm: 14, mcap: 14, roa: 10, ebitda_m: 8, invest_gap: 10, off_low: 10, ev_ebitda: 6, altman: 3, piotroski: 3 },
    params: { gT: 3, peCap: 30, persistBase: 0.5, persistQual: 0.3, marginSpeed: 0.2, marketAnchor: 0.35, shrink: 0.25, convSpeed: 0.3, bullScale: 0.9, bearScale: 0.9 },
  },
  disrupt: {
    name: "Hipercrecimiento / Disrupción",
    short: "Disrupción",
    desc:
      "Para cazar la próxima disrupción tecnológica: crecimiento explosivo y acelerando, regla del 40, margen bruto alto, I+D intensiva y crecimiento esperado por consenso. Tolera valuaciones altas y pérdidas actuales si la economía unitaria es buena.",
    weights: { rev_g: 16, accel: 12, rev_fwd_g: 12, rule40: 12, gm: 12, rd_rev: 10, gp_g: 8, mcap: 8, ps: 4, runway: 6 },
    params: { gT: 5, peCap: 55, persistBase: 0.62, persistQual: 0.33, marginSpeed: 0.3, marketAnchor: 0.25, shrink: 0.25, convSpeed: 0.3, bullScale: 1.25, bearScale: 1.15 },
  },
  quality: {
    name: "Calidad compuesta (compounders)",
    short: "Calidad",
    desc:
      "Negocios excelentes a precio razonable: ROIC y márgenes altos y estables, balance sólido, Piotroski alto y crecimiento constante. Menos explosivo, más probable.",
    weights: { roic: 15, gm: 10, fcf_m: 10, piotroski: 8, altman: 6, de: 8, rev_cagr5: 10, rev_g: 8, fcf_yield: 10, pe: 7, sloan: 4, gp_assets: 4 },
    params: { gT: 4, peCap: 35, persistBase: 0.6, persistQual: 0.3, marginSpeed: 0.2, marketAnchor: 0.35, shrink: 0.25, convSpeed: 0.3, bullScale: 0.85, bearScale: 0.75 },
  },
  custom: {
    name: "Personalizado",
    short: "Custom",
    desc: "Tus propios pesos y supuestos. Activa métricas en la pestaña Métricas y ajusta sus pesos.",
    weights: {},
    params: { gT: 4, peCap: 40, persistBase: 0.55, persistQual: 0.35, marginSpeed: 0.25, marketAnchor: 0.35, shrink: 0.25, convSpeed: 0.3, bullScale: 1, bearScale: 1 },
  },
};

// Inflación anual aproximada (%) usada para deflactar crecimientos nominales en monedas débiles.
// Cifras redondeadas y conservadoras; se pueden desactivar con el supuesto "Ajuste por inflación".
export const INFLATION = {
  "Turkey": 30, "Argentina": 30, "Venezuela": 100, "Iran": 35, "Zimbabwe": 50, "Egypt": 15, "Nigeria": 20,
  "Ghana": 15, "Malawi": 25, "Russian Federation": 8, "Russia": 8, "Ukraine": 12, "Pakistan": 8, "Bangladesh": 9,
  "Kazakhstan": 10, "Sri Lanka": 5, "Kenya": 5, "Zambia": 12, "Uzbekistan": 10, "Mongolia": 7, "Brazil": 5,
  "Colombia": 5, "India": 4, "South Africa": 4, "Mexico": 4, "Vietnam": 4, "Indonesia": 3, "Philippines": 3,
  "Romania": 6, "Hungary": 5, "Poland": 4, "Serbia": 4, "Tunisia": 6, "Morocco": 2.5, "Jamaica": 5, "Peru": 3,
  "Chile": 4, "Botswana": 4, "Mauritius": 4, "Namibia": 4, "Uganda": 4, "Tanzania": 4, "Rwanda": 5, "Cote d'Ivoire": 3,
};

export const PARAM_INFO = {
  gT: { label: "Crecimiento terminal (%)", min: 0, max: 8, step: 0.5, desc: "Crecimiento al que converge cualquier empresa a largo plazo." },
  peCap: { label: "P/E máximo de salida", min: 15, max: 80, step: 1, desc: "Tope al múltiplo P/E que el mercado pagará al final del horizonte." },
  persistBase: { label: "Persistencia base del crecimiento", min: 0.3, max: 0.9, step: 0.01, desc: "Qué fracción del exceso de crecimiento sobrevive cada año (0.55 = vida media ~1.2 años)." },
  persistQual: { label: "Bono de persistencia por calidad", min: 0, max: 0.5, step: 0.01, desc: "Persistencia extra para negocios con margen bruto, ROIC e I+D altos (fosos)." },
  marginSpeed: { label: "Velocidad de convergencia de márgenes", min: 0.05, max: 0.6, step: 0.01, desc: "Qué tan rápido el margen neto converge a su objetivo maduro." },
  marketAnchor: { label: "Anclaje al P/E actual del mercado", min: 0, max: 1, step: 0.05, desc: "0 = el múltiplo de salida lo define solo el modelo; 1 = el mercado mantiene el P/E de hoy. Un P/E de 4 en pleno boom suele significar que el mercado espera que las utilidades caigan." },
  convSpeed: { label: "Velocidad de convergencia precio → valor", min: 0.05, max: 1, step: 0.05, desc: "Qué fracción de la brecha entre precio y valor fundamental se cierra cada año. 0.3 ≈ vida media de 2 años; 1 = el mercado corrige de inmediato." },
  shrink: { label: "Escepticismo (encogimiento al mercado)", min: 0, max: 0.8, step: 0.05, desc: "Mezcla cada resultado del modelo con el retorno histórico del mercado (8% anual). 0 = confías 100% en el modelo." },
  bullScale: { label: "Intensidad escenario alcista", min: 0.5, max: 2, step: 0.05, desc: "Escala el optimismo del escenario alcista." },
  bearScale: { label: "Severidad escenario bajista", min: 0.5, max: 2, step: 0.05, desc: "Escala la severidad del escenario bajista." },
};

// ---------------------------------------------------------------------------
// Percentiles: rank de 0..1 de cada valor dentro del universo filtrado base
// ---------------------------------------------------------------------------
export function percentileRanks(values, direction) {
  const n = values.length;
  const out = new Float32Array(n).fill(NaN);
  const idx = [];
  for (let i = 0; i < n; i++) if (isNum(values[i])) idx.push(i);
  idx.sort((a, b) => values[a] - values[b]);
  const m = idx.length;
  for (let r = 0; r < m; r++) {
    const p = m > 1 ? r / (m - 1) : 0.5;
    out[idx[r]] = direction < 0 ? 1 - p : p;
  }
  return out;
}

// Score 0..1 por empresa = promedio ponderado de percentiles.
// Valor faltante → 0.35 (penalización por falta de información).
export function computeScores(n, factorRanks, weights) {
  const ids = Object.keys(weights).filter((k) => weights[k] > 0 && factorRanks[k]);
  const tot = ids.reduce((s, k) => s + weights[k], 0) || 1;
  const score = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (const k of ids) {
      const v = factorRanks[k][i];
      s += weights[k] * (Number.isNaN(v) ? 0.35 : v);
    }
    score[i] = s / tot;
  }
  return score;
}

// ---------------------------------------------------------------------------
// Proyección fundamental de un escenario.
// c: objeto con campos de la empresa (porcentajes como en TradingView, p.ej. 21.5)
// Devuelve el múltiplo de precio (valor final / valor hoy) para cada año 1..H
// ---------------------------------------------------------------------------
function projectScenario(c, H, P, sc) {
  const rev0 = c.revenue;
  const mcap = c.mcap;
  if (!(rev0 > 0) || !(mcap > 0)) return null;

  // 1) Crecimiento inicial: mezcla de consenso, TTM, último trimestre y CAGR 5a.
  //    En industrias cíclicas pesa más el CAGR de 5 años (crecimiento a través del ciclo).
  const W = c.cyc ? [0.25, 0.15, 0.1, 0.5] : [0.35, 0.3, 0.15, 0.2];
  const parts = [];
  if (isNum(c.rev_fwd_g)) parts.push([c.rev_fwd_g, W[0]]);
  if (isNum(c.rev_g)) parts.push([c.rev_g, W[1]]);
  if (isNum(c.rev_g_q)) parts.push([c.rev_g_q, W[2]]);
  if (isNum(c.rev_cagr5)) parts.push([c.rev_cagr5, W[3]]);
  const wsum = parts.reduce((s, p) => s + p[1], 0);
  let gObs = wsum ? parts.reduce((s, p) => s + clamp(p[0], -60, 150) * p[1], 0) / wsum / 100 : 0.03;
  // Crecimiento nominal en monedas con inflación alta → se deflacta a términos comparables con USD
  if (P.inflAdj !== false && c.infl > 2.5) gObs = (1 + gObs) / (1 + (c.infl - 2.5) / 100) - 1;
  // Amortiguación: el crecimiento por encima de 30% casi nunca persiste (Chan, Karceski & Lakonishok 2003)
  if (gObs > 0.3) gObs = 0.3 + (gObs - 0.3) * 0.35;
  let g0 = clamp(gObs, -0.3, c.fin ? 0.25 : 0.6);

  const gT = P.gT / 100;
  let phi = clamp(P.persistBase + P.persistQual * c.quality, 0.2, 0.95);

  // 2) Margen neto objetivo maduro
  const gm = isNum(c.gm) ? clamp(c.gm, -50, 100) / 100 : null;
  let nm0 = isNum(c.nm) ? clamp(c.nm, -300, 80) / 100 : (isNum(c.ebitda_m) ? c.ebitda_m / 200 : 0);
  // Utilidad neta mayor que la utilidad bruta = ganancias extraordinarias (venta de activos, revaluaciones)
  if (gm != null && gm > 0 && nm0 > gm * 0.85) nm0 = gm * 0.5;
  const ind = isNum(c.ind_nm) ? c.ind_nm / 100 : 0.07;
  let mT = Math.max(ind, gm != null ? 0.22 * gm : ind);
  mT = clamp(mT, 0.02, 0.35);
  // Márgenes extraordinarios revierten (más rápido si el negocio no tiene foso o es cíclico)
  if (nm0 > mT) mT = mT + (nm0 - mT) * ((c.cyc ? 0.1 : 0.25) + 0.4 * c.quality);
  else if (c.fin && nm0 > 0) mT = nm0;
  // La expansión de margen solo se acredita si hay economía unitaria que la respalde
  //    (en negocios de margen bruto bajo —comercializadoras, distribuidoras— casi no hay apalancamiento operativo)
  else if (nm0 > 0) mT = Math.min(mT, nm0 + (gm != null ? 0.003 + 0.2 * gm * c.quality : 0.005));
  else {
    // Empresa en pérdidas: solo llega a margen de industria si tiene margen bruto ≥ 40% y crece
    mT = Math.min(mT, ind) * (gm != null && gm >= 0.4 ? 1 : 0.5);
    if (g0 <= 0) mT = Math.min(mT, 0.02);
  }
  let speed = P.marginSpeed * (c.cyc && nm0 > mT ? 1.6 : 1);

  // 3) Dilución anual
  const burning = nm0 < 0 || (isNum(c.fcf_m) && c.fcf_m < 0);
  let dil = burning ? 0.04 : 0.005;
  if (isNum(c.buyback) && c.buyback > 0) dil -= clamp(c.buyback, 0, 6) / 100;

  // 4) Múltiplo de salida
  let peCap = P.peCap;

  // Ajustes de escenario
  if (sc === "bull") {
    // La tesis funciona: el crecimiento dura más, los márgenes escalan y el mercado paga más
    const k = P.bullScale;
    g0 = Math.max(g0, 0) * (1 + 0.25 * k) + 0.04 * k;
    phi = clamp(phi + 0.08 * k, 0.2, 0.93);
    mT = Math.min(0.45, mT * (1 + 0.2 * k));
    peCap = peCap * (1 + 0.2 * k);
    speed = speed * 1.2;
  } else if (sc === "bear") {
    // La tesis falla: el crecimiento se frena, márgenes se comprimen, el múltiplo colapsa
    const k = P.bearScale;
    g0 = g0 * Math.max(0, 1 - 0.7 * k) - 0.04 * k;
    phi = clamp(phi - 0.2 * k, 0.2, 0.9);
    mT = Math.min(mT * Math.max(0.2, 1 - 0.45 * k), Math.max(nm0 * 0.8, 0.01));
    peCap = peCap * Math.max(0.3, 1 - 0.45 * k);
    speed = speed * 0.6;
    dil = burning ? dil + 0.06 * k : dil + 0.005;
  }

  const netCash = isNum(c.net_cash) ? c.net_cash : 0;
  const divY = isNum(c.div_yield) ? clamp(c.div_yield, 0, 15) / 100 : 0;
  const path = [];
  let rev = rev0, nm = nm0, shares = 1, g = g0, cumDiv = 0;
  const steps = Math.ceil(H);
  for (let t = 1; t <= steps; t++) {
    const frac = t > H ? H - (t - 1) : 1; // año parcial
    g = gT + (g - gT) * phi;
    rev *= Math.pow(1 + g, frac);
    nm = nm + (mT - nm) * (1 - Math.pow(1 - speed, frac));
    shares *= Math.pow(1 + dil, frac);
    cumDiv += divY * frac;
    const ni = rev * nm;
    // P/E de salida según crecimiento remanente y calidad
    let pe = clamp(10 + 90 * Math.max(g, 0) + 10 * c.quality, 6, peCap);
    // Anclaje al mercado: el P/E actual contiene información (ciclicidad, riesgo país, gobierno corporativo)
    //    En el bajista es una trampa de valor: el mercado nunca re-califica (P/E ≤ 85% del actual).
    let a = P.marketAnchor ?? 0.35;
    if (sc === "bull") a = a * 0.5;
    if (isNum(c.pe) && c.pe > 0) {
      if (sc === "bear") pe = Math.min(pe, clamp(c.pe, 3, 80) * 0.85);
      else if (a > 0) pe = Math.exp((1 - a) * Math.log(pe) + a * Math.log(clamp(c.pe, 3, 80)));
    }
    let equity;
    if (ni > 0) equity = ni * pe + netCash;
    else {
      // empresa aún en pérdidas: valuación por ventas
      let ps = Math.max(0.3, 0.5 + 4 * g) * (gm != null ? clamp(gm * 2, 0.2, 1.6) : 0.6);
      if (sc === "bear" && isNum(c.ps) && c.ps > 0) ps = Math.min(ps, c.ps * 0.7);
      equity = rev * ps + netCash;
    }
    let mult = Math.max(0.02, equity / mcap / shares) + cumDiv;
    // (a) El precio converge al valor fundamental de forma gradual (vida media ≈ 2 años), no de golpe.
    // (b) Encogimiento bayesiano hacia el retorno de mercado (8% anual): los modelos exageran la dispersión.
    const yrs = t - 1 + frac;
    const lam = 1 - Math.pow(1 - (P.convSpeed ?? 0.3), yrs);
    const s = P.shrink ?? 0.25;
    const wModel = lam * (1 - s);
    mult = Math.exp(wModel * Math.log(mult) + (1 - wModel) * Math.log(Math.pow(1.08, yrs)));
    path.push(mult);
  }
  return path;
}

// Probabilidades de escenario según el score ADN (0..1) y la probabilidad de ruina
export function scenarioProbs(score, pRuin = 0) {
  const s = clamp(score, 0, 1);
  const k = 1 - pRuin;
  const bull = (0.08 + 0.32 * s) * k;
  const bear = (0.42 - 0.27 * s) * k;
  return { bull, base: k - bull - bear, bear, ruin: pRuin };
}

// Probabilidad de pérdida casi total (quiebra, fraude, dilución masiva, dato erróneo)
export function ruinProb(c, H) {
  let p = 0.02;
  if (isNum(c.conf)) p += 0.12 * (1 - c.conf);
  if (isNum(c.altman) && c.altman < 1.8) p += 0.05;
  if (isNum(c.mcap) && c.mcap < 3e8) p += 0.03;
  if (isNum(c.nm) && c.nm < 0) p += 0.04;
  if (isNum(c.runway) && c.runway < 2) p += 0.05;
  // escala con el horizonte (base 5 años)
  return clamp(1 - Math.pow(1 - p, H / 5), 0.01, 0.5);
}
export const RUIN_MULT = 0.1;

// Kelly multi-escenario: max_f Σ p_i ln(1 + f r_i). fMax > 1 permite medir convicción relativa.
export function kellyFraction(outcomes, fMax = 1) {
  const d = (f) => outcomes.reduce((s, [p, r]) => s + (p * r) / (1 + f * r), 0);
  if (d(0) <= 0) return 0;
  // límite natural: 1 + f·r > 0 para el peor resultado
  const worst = Math.min(...outcomes.map((o) => o[1]));
  const hiLim = worst < 0 ? Math.min(fMax, -0.999 / worst) : fMax;
  if (d(hiLim) >= 0) return hiLim;
  let lo = 0, hi = hiLim;
  for (let k = 0; k < 50; k++) {
    const mid = (lo + hi) / 2;
    if (d(mid) > 0) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

// Evaluación completa de una empresa a horizonte H
export function evaluate(c, H, P, score, withPaths = false) {
  const base = projectScenario(c, H, P, "base");
  if (!base) return null;
  const bull = projectScenario(c, H, P, "bull");
  const bear = projectScenario(c, H, P, "bear");
  const pr = scenarioProbs(score, ruinProb(c, H));
  const last = (a) => a[a.length - 1];
  const expPath = base.map((_, t) => pr.bull * bull[t] + pr.base * base[t] + pr.bear * bear[t] + pr.ruin * RUIN_MULT);
  const E = last(expPath);
  const cagr = Math.pow(Math.max(E, 1e-6), 1 / H) - 1;
  const outcomes = [
    [pr.bull, last(bull) - 1],
    [pr.base, last(base) - 1],
    [pr.bear, last(bear) - 1],
    [pr.ruin, RUIN_MULT - 1],
  ];
  const kRaw = kellyFraction(outcomes, 10);
  const growth = outcomes.reduce((s, [p, r]) => s + p * Math.log(1 + Math.min(kRaw, 1) * r), 0);
  return {
    E, cagr, kelly: Math.min(kRaw, 1), kellyRaw: kRaw, growth, probs: pr,
    outcomes: outcomes.map(([p, r]) => [p, r + 1]),
    bull: last(bull), base: last(base), bear: last(bear),
    paths: withPaths ? { bull, base, bear, exp: expPath } : null,
  };
}

// ---------------------------------------------------------------------------
// Construcción del portafolio
// ---------------------------------------------------------------------------
export const WEIGHTING = {
  kelly: { label: "Kelly de portafolio", desc: "Pesos que maximizan el crecimiento geométrico esperado (E[ln riqueza]) de la canasta completa, simulando 6,000 combinaciones de escenarios (alcista/base/bajista/ruina) por empresa. Invierte el 100%, sin apalancamiento." },
  halfkelly: { label: "Medio Kelly", desc: "50% Kelly de portafolio + 50% igual ponderado. Los profesionales usan fracciones de Kelly porque el modelo siempre tiene error de estimación." },
  equal: { label: "Igual ponderado", desc: "1/N en cada empresa." },
  conviction: { label: "Por convicción (score ADN)", desc: "Peso proporcional al score ADN Multibagger." },
  return: { label: "Por retorno esperado", desc: "Peso proporcional al retorno esperado (CAGR)." },
};

// Kelly de portafolio: maximiza E[ln(Σ w_i · M_i)] con escenarios independientes por empresa.
// Monte Carlo con semilla fija + gradiente exponenciado sobre el simplex (pesos ≥ 0, suma 1).
export function kellyPortfolio(picks, samples = 6000, iters = 400) {
  const n = picks.length;
  if (!n) return [];
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const M = Array.from({ length: samples }, () => new Float64Array(n));
  for (let j = 0; j < n; j++) {
    const oc = picks[j].outcomes;
    for (let s = 0; s < samples; s++) {
      let u = rnd(), acc = 0, v = oc[oc.length - 1][1];
      for (const [p, m] of oc) { acc += p; if (u <= acc) { v = m; break; } }
      M[s][j] = v;
    }
  }
  let w = new Float64Array(n).fill(1 / n);
  const eta = 0.5;
  for (let it = 0; it < iters; it++) {
    const g = new Float64Array(n);
    for (let s = 0; s < samples; s++) {
      let port = 0; const row = M[s];
      for (let j = 0; j < n; j++) port += w[j] * row[j];
      for (let j = 0; j < n; j++) g[j] += row[j] / port;
    }
    let z = 0;
    for (let j = 0; j < n; j++) { w[j] *= Math.exp((eta * g[j]) / samples - eta); z += w[j]; }
    for (let j = 0; j < n; j++) w[j] /= z;
  }
  return Array.from(w);
}

// Estadísticos del portafolio por Monte Carlo: percentiles del múltiplo final
export function portfolioDistribution(picks, weights, samples = 6000) {
  let seed = 999;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const out = new Float64Array(samples);
  for (let s = 0; s < samples; s++) {
    let v = 0;
    picks.forEach((pk, j) => {
      let u = rnd(), acc = 0, m = pk.outcomes[pk.outcomes.length - 1][1];
      for (const [p, mm] of pk.outcomes) { acc += p; if (u <= acc) { m = mm; break; } }
      v += weights[j] * m;
    });
    out[s] = v;
  }
  out.sort();
  const q = (x) => out[Math.min(samples - 1, Math.floor(x * samples))];
  const mean = out.reduce((a, b) => a + b, 0) / samples;
  const pLoss = out.filter((x) => x < 1).length / samples;
  const p2x = out.filter((x) => x >= 2).length / samples;
  const p5x = out.filter((x) => x >= 5).length / samples;
  const p10x = out.filter((x) => x >= 10).length / samples;
  return { mean, p10: q(0.1), p25: q(0.25), median: q(0.5), p75: q(0.75), p90: q(0.9), pLoss, p2x, p5x, p10x };
}

export function buildWeights(picks, method, maxW = 0.4) {
  const n = picks.length;
  if (!n) return [];
  let raw;
  const eq = picks.map(() => 1 / n);
  const norm = (a) => { const s = a.reduce((x, y) => x + y, 0); return s > 0 ? a.map((x) => x / s) : eq; };
  switch (method) {
    case "equal": raw = eq; break;
    case "conviction": raw = norm(picks.map((p) => Math.max(p.score, 0.01))); break;
    case "return": raw = norm(picks.map((p) => Math.max(p.cagr, 0.001))); break;
    case "halfkelly": { const k = kellyPortfolio(picks); raw = k.map((x, i) => 0.5 * x + 0.5 * eq[i]); break; }
    default: raw = kellyPortfolio(picks);
  }
  // tope por posición con redistribución iterativa
  const cap = Math.max(maxW, 1 / n);
  let w = raw.slice();
  for (let it = 0; it < 20; it++) {
    const over = w.map((x) => x > cap + 1e-9);
    if (!over.some(Boolean)) break;
    const excess = w.reduce((s, x, i) => s + (over[i] ? x - cap : 0), 0);
    const freeSum = w.reduce((s, x, i) => s + (over[i] ? 0 : x), 0);
    w = w.map((x, i) => (over[i] ? cap : x + (freeSum > 0 ? (excess * x) / freeSum : excess / n)));
  }
  return w;
}
