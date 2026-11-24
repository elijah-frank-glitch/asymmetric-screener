import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { PRESETS, WEIGHTING, RUIN_MULT } from "../model.js";
import { loadCompany } from "../data.js";
import { confidence } from "../engine.js";
import { fmtUsd, fmtPct, fmtX, fmtMetric } from "../format.js";
import "../print.css";

// ============================================================================
// Reporte imprimible del portafolio (A4 / Carta). Se monta en un portal sobre
// <body>; bajo @media print es lo único visible (ver print.css). El usuario
// elige "Guardar como PDF" en el diálogo de impresión del navegador.
// ============================================================================

// Paleta segura para papel (tonos oscuros, legibles en blanco y en escala de grises)
const PAL = ["#047857", "#0e7490", "#1d4ed8", "#6d28d9", "#be185d", "#b45309", "#c2410c", "#15803d", "#0369a1", "#a21caf"];
const COL = { bull: "#059669", base: "#2563eb", bear: "#dc2626", exp: "#b45309", ruin: "#64748b" };
const SITE = "https://asymmetric-screener.vercel.app";

const ok = (x) => typeof x === "number" && Number.isFinite(x);
const pct0 = (p) => (ok(p) ? `${Math.round(p * 100)}%` : "—");
const cg = (m, H) => (ok(m) && m > 0 ? Math.pow(m, 1 / H) - 1 : NaN);
const yrs = (H) => `${H} ${H === 1 ? "año" : "años"}`;
const tone = (c) => (!ok(c) ? "" : c >= 0.15 ? "pr-pos" : c >= 0 ? "" : "pr-neg");

// Métricas clave por bloque (id del catálogo). Las de "señales" solo se muestran si existen.
const GROUPS = [
  ["Tamaño y precio", ["mcap", "revenue", "price", "liq_usd"]],
  ["Valuación", ["pe", "pe_fwd", "ps", "pb", "pfcf", "ev_ebitda", "fcf_yield", "peg"]],
  ["Crecimiento", ["rev_g", "rev_cagr5", "rev_fwd_g", "accel", "gp_g", "eps_g"]],
  ["Rentabilidad", ["gm", "om", "nm", "roic", "roe", "fcf_m"]],
  ["Salud financiera", ["de", "nd_ebitda", "cr", "runway", "altman", "piotroski"]],
];
const SIGNALS = ["insider_pct", "founder", "eps_rev30", "shares_g3", "short_pct"];

function presetInfo(settings) {
  const p = PRESETS[settings.preset];
  if (!p) return { name: settings.preset || "Personalizado", desc: "" };
  return { name: p.name, desc: p.desc };
}

export default function PrintReport({ D, meta, portfolio, settings, C, calC, calPort, autoPrint, onClose }) {
  const { picks, w, dist, path, pathBull, pathBase, pathBear } = portfolio;
  const H = settings.horizon;
  const cap = settings.capital;
  const E = path[path.length - 1] || 1;
  const cagr = cg(E, H);
  const medCagr = cg(Math.max(dist.median, 1e-6), H);
  const preset = presetInfo(settings);
  const wt = WEIGHTING[settings.weighting] || { label: settings.weighting, desc: "" };
  const now = useMemo(() => new Date(), []);
  const dateLong = now.toLocaleDateString("es-EC", { year: "numeric", month: "long", day: "numeric" });
  const dateIso = now.toISOString().slice(0, 10);
  const cat = useMemo(() => Object.fromEntries((meta.catalog || []).map((m) => [m.id, m])), [meta]);

  const [cos, setCos] = useState(null); // fichas cargadas (desc + métricas)
  const printed = useRef(false);

  // Carga todas las fichas antes de mostrar/imprimir
  useEffect(() => {
    let alive = true;
    Promise.all(picks.map((p) => loadCompany(p.i).catch(() => null))).then((r) => { if (alive) setCos(r); });
    return () => { alive = false; };
  }, [picks]);

  // Título del documento → nombre sugerido del PDF; bloquea el scroll de la app mientras está abierto
  useEffect(() => {
    const prevTitle = document.title;
    document.title = `Asymmetric - Reporte de portafolio - ${dateIso}`;
    document.documentElement.classList.add("pr-open");
    const k = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => {
      document.title = prevTitle;
      document.documentElement.classList.remove("pr-open");
      window.removeEventListener("keydown", k);
    };
  }, [dateIso, onClose]);

  // Imprime cuando todo está listo (fuentes + layout)
  useEffect(() => {
    if (!cos || !autoPrint || printed.current) return;
    let cancel = false, t = 0;
    // setTimeout (no requestAnimationFrame): rAF no corre si la pestaña queda en segundo plano
    (document.fonts?.ready || Promise.resolve()).then(() => { if (!cancel) t = setTimeout(() => { printed.current = true; window.print(); }, 300); });
    return () => { cancel = true; clearTimeout(t); };
  }, [cos, autoPrint]);

  // Encabezado/pie de página impresos (cajas de margen de @page; Chrome/Edge 131+)
  const pageCss = `@page { margin: 16mm 13mm 17mm;
    @top-left { content: "Asymmetric · Reporte de portafolio"; font: 600 8pt ${"system-ui, sans-serif"}; color: #475569; }
    @top-right { content: "${dateLong}"; font: 8pt system-ui, sans-serif; color: #64748b; }
    @bottom-left { content: "asymmetric-screener.vercel.app · No es asesoría de inversión"; font: 7.5pt system-ui, sans-serif; color: #64748b; }
    @bottom-right { content: "Página " counter(page) " de " counter(pages); font: 7.5pt system-ui, sans-serif; color: #64748b; } }`;

  const gapPP = calPort != null ? (cagr - calPort) * 100 : null;

  const body = !cos ? (
    <div className="pr-loading"><div className="pr-spin" />Preparando reporte… cargando {picks.length} {picks.length === 1 ? "ficha" : "fichas"} de empresa</div>
  ) : (
    <div className="pr-doc">
      {/* ---------------- Portada ---------------- */}
      <section className="pr-sheet pr-cover">
        <div className="pr-brand">
          <svg viewBox="0 0 32 32" width="34" height="34" aria-hidden="true"><rect width="32" height="32" rx="7" fill="#0f172a" /><path d="M6 24 L13 15 L18 19 L26 8" stroke="#34d399" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
          <span>Asymmetric</span>
        </div>
        <h1>Reporte de portafolio</h1>
        <p className="pr-sub">Portafolio modelo de {picks.length} {picks.length === 1 ? "empresa" : "empresas"} a {yrs(H)} · generado el {dateLong}</p>
        <table className="pr-kv">
          <tbody>
            <tr><th>Fecha</th><td>{dateLong}</td></tr>
            <tr><th>Horizonte</th><td>{yrs(H)} (comprar hoy y mantener)</td></tr>
            <tr><th>Empresas</th><td>{picks.length}</td></tr>
            <tr><th>Capital inicial</th><td>{cap.toLocaleString("es-EC", { maximumFractionDigits: 0 })} USD</td></tr>
            <tr><th>Teoría</th><td><b>{preset.name}</b></td></tr>
            <tr><th>Ponderación</th><td>{wt.label}{settings.maxW < 1 ? ` · máx. ${Math.round(settings.maxW * 100)}% por posición` : ""}{settings.maxPerIndustry ? ` · máx. ${settings.maxPerIndustry} por industria` : ""}</td></tr>
          </tbody>
        </table>
        {preset.desc && <div className="pr-note"><h4>La teoría: {preset.name}</h4><p>{preset.desc}</p></div>}
        {wt.desc && <div className="pr-note"><h4>Método de ponderación: {wt.label}</h4><p>{wt.desc}</p></div>}
        <p className="pr-fine">Este documento es el resultado de un modelo cuantitativo con datos públicos. No es una recomendación personalizada de inversión. Lee la sección de metodología y limitaciones al final.</p>
      </section>

      {/* ---------------- Resumen ---------------- */}
      <section className="pr-sheet">
        <h2>Resumen</h2>
        <div className="pr-kpis">
          <div><small>Valor esperado a {yrs(H)}</small><b className={tone(cagr)}>{fmtUsd(cap * E)}</b><em>{fmtX(E)} · {fmtPct(cagr * 100)} anual</em></div>
          <div><small>Resultado mediano</small><b>{fmtUsd(cap * dist.median)}</b><em>{fmtX(dist.median)} · {fmtPct(medCagr * 100)} anual</em></div>
          <div><small>Rango 10%–90%</small><b>{fmtX(dist.p10)} – {fmtX(dist.p90)}</b><em>{fmtUsd(cap * dist.p10)} a {fmtUsd(cap * dist.p90)}</em></div>
          <div><small>Prob. de perder dinero</small><b className={dist.pLoss > 0.25 ? "pr-neg" : ""}>{pct0(dist.pLoss)}</b><em>al final del horizonte</em></div>
        </div>
        <table className="pr-t pr-probs">
          <thead><tr><th>Probabilidad de terminar con…</th><th>≥ 2x</th><th>≥ 5x</th><th>≥ 10x</th><th>&lt; 1x (pérdida)</th></tr></thead>
          <tbody><tr><td>Portafolio completo (6,000 simulaciones con correlación)</td><td>{pct0(dist.p2x)}</td><td>{pct0(dist.p5x)}</td><td>{pct0(dist.p10x)}</td><td>{pct0(dist.pLoss)}</td></tr></tbody>
        </table>

        <h3>Retorno anual: modelo vs. calibrado</h3>
        <div className="pr-cmp">
          <div><small>Retorno esperado del modelo</small><b className={tone(cagr)}>{fmtPct(cagr * 100)}</b><em>anual a {yrs(H)}</em></div>
          <div><small>Retorno calibrado (backtest EE.UU.)</small><b className={tone(calPort)}>{calPort != null ? fmtPct(calPort * 100) : "n/d"}</b><em>{C ? `mediana histórica a ${yrs(C.H)}` : "backtest no disponible"}</em></div>
        </div>
        <p className="pr-p">
          {calPort == null ? (
            <>No se pudo cargar la calibración del backtest, así que solo se muestra el retorno del modelo. Tómalo como una cota optimista.</>
          ) : gapPP > 0.5 ? (
            <>El modelo espera <b>{fmtPct(cagr * 100)}</b> anual, pero en el backtest las acciones de EE.UU. a las que el modelo asignaba un retorno esperado parecido realizaron en mediana <b>{fmtPct(calPort * 100)}</b> anual: unos <b>{gapPP.toFixed(1)} puntos menos</b>. La brecha es normal y esperable: el modelo proyecta escenarios con supuestos de crecimiento y múltiplo que en la práctica se cumplen solo en parte, y al elegir las mejores de miles de estimaciones con ruido se seleccionan justamente las más sobreestimadas (la "maldición del ganador"). El calibrado es la lectura más realista; aun así, viene de empresas de NYSE/Nasdaq que siguen cotizando (sesgo de supervivencia){H !== C.H ? `, a ${yrs(C.H)} aunque tu horizonte es de ${yrs(H)}` : ""}, y fuera de EE.UU. puede no aplicar.</>
          ) : gapPP < -0.5 ? (
            <>En este caso el calibrado (<b>{fmtPct(calPort * 100)}</b>) supera al modelo (<b>{fmtPct(cagr * 100)}</b>): históricamente las acciones con un esperado similar rindieron algo más de lo proyectado. No lo tomes como un piso: el backtest es solo de EE.UU., con sesgo de supervivencia{H !== C.H ? ` y a ${yrs(C.H)} aunque tu horizonte es de ${yrs(H)}` : ""}.</>
          ) : (
            <>El modelo (<b>{fmtPct(cagr * 100)}</b>) y el calibrado (<b>{fmtPct(calPort * 100)}</b>) prácticamente coinciden. Recuerda que el calibrado viene de un backtest solo de EE.UU. con sesgo de supervivencia{H !== C.H ? ` y a ${yrs(C.H)} aunque tu horizonte es de ${yrs(H)}` : ""}.</>
          )}
          {" "}La calibración no cambia el ranking ni los pesos.
        </p>

        <h3>Asignación</h3>
        <div className="pr-wbar">
          {picks.map((p, j) => w[j] > 0.001 && (
            <div key={p.i} style={{ width: `${w[j] * 100}%`, background: PAL[j % PAL.length] }}>{w[j] > 0.07 ? `${D.ticker[p.i]} ${Math.round(w[j] * 100)}%` : ""}</div>
          ))}
        </div>
        <table className="pr-t pr-num">
          <thead><tr><th>Empresa</th><th>Peso</th><th>Monto</th><th>Ret. anual esp.</th><th>Ret. calibrado</th><th>Alcista</th><th>Base</th><th>Bajista</th><th>P(ruina)</th></tr></thead>
          <tbody>
            {picks.map((p, j) => (
              <tr key={p.i}>
                <td className="pr-co"><i style={{ background: PAL[j % PAL.length] }} /><b>{D.ticker[p.i]}</b> <span>{D.name[p.i]}</span></td>
                <td><b>{(w[j] * 100).toFixed(1)}%</b></td>
                <td>{fmtUsd(cap * w[j])}</td>
                <td className={tone(p.cagr)}>{fmtPct(p.cagr * 100)}</td>
                <td className={tone(calC?.[j])}>{calC ? fmtPct(calC[j] * 100) : "—"}</td>
                <td style={{ color: COL.bull }}>{fmtX(p.bull, 1)}</td>
                <td style={{ color: COL.base }}>{fmtX(p.base, 1)}</td>
                <td style={{ color: COL.bear }}>{fmtX(p.bear, 1)}</td>
                <td>{pct0(p.probs.ruin)}</td>
              </tr>
            ))}
            <tr className="pr-tot"><td>Portafolio</td><td>100%</td><td>{fmtUsd(cap)}</td><td className={tone(cagr)}>{fmtPct(cagr * 100)}</td><td className={tone(calPort)}>{calPort != null ? fmtPct(calPort * 100) : "—"}</td><td style={{ color: COL.bull }}>{fmtX(pathBull[pathBull.length - 1], 1)}</td><td style={{ color: COL.base }}>{fmtX(pathBase[pathBase.length - 1], 1)}</td><td style={{ color: COL.bear }}>{fmtX(pathBear[pathBear.length - 1], 1)}</td><td></td></tr>
          </tbody>
        </table>
        <p className="pr-fine">Alcista / Base / Bajista: múltiplo del capital a {yrs(H)} en cada escenario. P(ruina): probabilidad de pérdida casi total (−90%) por quiebra, fraude, dilución masiva o dato erróneo. Retorno calibrado: retorno anual mediano que realizaron en el backtest de EE.UU. las acciones con un esperado similar.</p>
      </section>

      {/* ---------------- Trayectoria ---------------- */}
      <section className="pr-sheet">
        <h2>Valor del portafolio año por año</h2>
        <PrintPathChart H={H} series={[
          { name: "Todo alcista", color: COL.bull, data: pathBull, dash: "5 3" },
          { name: "Todo base", color: COL.base, data: pathBase, dash: "5 3" },
          { name: "Todo bajista", color: COL.bear, data: pathBear, dash: "5 3" },
          { name: "Esperado", color: COL.exp, data: path, bold: true },
        ]} />
        <table className="pr-t pr-num">
          <thead><tr><th>Año</th><th>Valor esperado</th><th>Múltiplo acumulado</th><th>Retorno del año</th><th>Todo alcista</th><th>Todo base</th><th>Todo bajista</th></tr></thead>
          <tbody>
            <tr><td>Hoy</td><td>{fmtUsd(cap)}</td><td>1.00x</td><td></td><td>{fmtUsd(cap)}</td><td>{fmtUsd(cap)}</td><td>{fmtUsd(cap)}</td></tr>
            {path.map((v, t) => {
              const r = v / (t ? path[t - 1] : 1) - 1;
              return (
                <tr key={t}>
                  <td>{t + 1 > H ? H : t + 1}</td>
                  <td><b>{fmtUsd(cap * v)}</b></td>
                  <td>{fmtX(v)}</td>
                  <td className={tone(r)}>{fmtPct(r * 100, 0)}</td>
                  <td style={{ color: COL.bull }}>{fmtUsd(cap * pathBull[t])}</td>
                  <td style={{ color: COL.base }}>{fmtUsd(cap * pathBase[t])}</td>
                  <td style={{ color: COL.bear }}>{fmtUsd(cap * pathBear[t])}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="pr-fine">"Todo alcista/base/bajista" supone que todas las empresas caen en el mismo escenario a la vez (correlación perfecta). La mediana, el rango 10–90% y las probabilidades del resumen sí modelan correlación entre empresas (ρ≈0.6 en la misma industria, ≈0.3 en el mismo sector, ≈0.15 con el resto); el valor esperado no depende de la correlación.</p>
      </section>

      {/* ---------------- Una página por empresa ---------------- */}
      {picks.map((p, j) => (
        <CompanyPage key={p.i} D={D} meta={meta} cat={cat} p={p} j={j} w={w[j]} cap={cap} H={H} co={cos[j]} cal={calC?.[j]} />
      ))}

      {/* ---------------- Metodología ---------------- */}
      <section className="pr-sheet pr-method">
        <h2>Metodología, limitaciones y aviso legal</h2>
        <h3>Cómo se construye</h3>
        <ol>
          <li><b>Score ADN.</b> Cada empresa del universo (~49,000 acciones listadas) se ordena por percentil en cada métrica de la teoría elegida ("{preset.name}") y se combinan con sus pesos.</li>
          <li><b>Escenarios.</b> Para cada empresa se proyectan tres escenarios a {yrs(H)} (alcista, base y bajista) a partir de crecimiento, márgenes y múltiplo de salida, con reversión a la media, más un escenario de ruina (−90%). Las probabilidades dependen del score y de la calidad de los datos.</li>
          <li><b>Retorno esperado.</b> Es el promedio de los escenarios ponderado por sus probabilidades, mezclado con el retorno histórico del mercado (escepticismo) para no confiar ciegamente en el modelo.</li>
          <li><b>Pesos.</b> {wt.label}: {wt.desc}</li>
          <li><b>Distribución del portafolio.</b> 6,000 simulaciones de escenarios correlacionados entre empresas dan la mediana, el rango 10–90% y las probabilidades.</li>
          <li><b>Calibración.</b> Un backtest sobre acciones de EE.UU. compara, por deciles, el retorno esperado del modelo con el realizado. Con una regresión isotónica se traduce el esperado de cada empresa a su retorno histórico mediano.</li>
        </ol>
        <h3>Limitaciones</h3>
        <ul>
          <li><b>Maldición del ganador:</b> elegir las mejores de miles de estimaciones con ruido sobreestima sistemáticamente el resultado. Estas cifras ordenan candidatos para investigar; no son una promesa.</li>
          <li><b>Backtest solo de EE.UU. y con sesgo de supervivencia:</b> se calibró con NYSE/Nasdaq y solo con empresas que siguen cotizando hoy; las que quebraron o dejaron de cotizar no están, lo que infla los retornos realizados. Fuera de EE.UU. la calibración puede no aplicar.</li>
          <li><b>Datos públicos con errores:</b> los datos pueden estar incompletos, desactualizados o mal reportados (monedas, adquisiciones, partidas extraordinarias). Revisa las alertas de calidad de datos de cada empresa.</li>
          <li><b>Señales cualitativas</b> (insiders, fundador, revisiones de analistas, short interest) solo existen con su valor de hoy y no están validadas en el backtest.</li>
          <li><b>No incluye</b> impuestos, comisiones, tipo de cambio, liquidez real ni el riesgo de no poder comprar ciertas bolsas desde tu bróker.</li>
        </ul>
        <h3>Fuentes de datos</h3>
        <p className="pr-p">Fundamentales y precios: TradingView (screener público) y Yahoo Finance. Descripciones, insiders y otros datos de empresas de EE.UU.: SEC EDGAR. Fecha de los datos: {meta.fetchedAt ? new Date(meta.fetchedAt).toLocaleDateString("es-EC", { year: "numeric", month: "long", day: "numeric" }) : "—"}.</p>
        <h3>Supuestos de este reporte</h3>
        <table className="pr-kv pr-small">
          <tbody>
            <tr><th>Teoría</th><td>{preset.name}</td></tr>
            <tr><th>Horizonte</th><td>{yrs(H)}</td></tr>
            <tr><th>Empresas / ponderación</th><td>{picks.length} · {wt.label} · máx. {Math.round(settings.maxW * 100)}% por posición{settings.maxPerIndustry ? ` · máx. ${settings.maxPerIndustry} por industria` : ""}</td></tr>
            {settings.params && <tr><th>Parámetros</th><td>Crec. terminal {settings.params.gT}% · P/E máx. de salida {settings.params.peCap} · escepticismo {Math.round((settings.params.shrink || 0) * 100)}% · persistencia base {settings.params.persistBase}</td></tr>}
            {settings.excluded?.length > 0 && <tr><th>Excluidas a mano</th><td>{settings.excluded.join(", ")}</td></tr>}
          </tbody>
        </table>
        <div className="pr-disclaimer">
          <b>Aviso importante.</b> Este reporte es material educativo generado automáticamente por un modelo cuantitativo. <b>No es asesoría de inversión</b> ni una recomendación personalizada de comprar o vender valores. Invertir en acciones, especialmente pequeñas y de mercados emergentes, puede implicar la pérdida total del capital. Los retornos pasados y los resultados de un backtest no garantizan resultados futuros. Haz tu propia investigación y, si lo necesitas, consulta con un asesor financiero autorizado.
        </div>
        <p className="pr-p">Versión interactiva y metodología completa: <a href={SITE}>{SITE.replace("https://", "")}</a></p>
      </section>
    </div>
  );

  return createPortal(
    <div className="pr-root">
      <style>{pageCss}</style>
      <div className="pr-toolbar">
        <b>Vista previa del reporte</b>
        <span className="pr-tip">En el diálogo de impresión elige <b>"Guardar como PDF"</b> como destino. Para mejores resultados: tamaño A4 o Carta, márgenes predeterminados y "Gráficos de fondo" activado.</span>
        <button className="pr-btn pr-primary" disabled={!cos} onClick={() => window.print()}>⬇ Guardar como PDF / Imprimir</button>
        <button className="pr-btn" onClick={onClose}>✕ Cerrar</button>
      </div>
      {body}
    </div>,
    document.body
  );
}

function CompanyPage({ D, meta, cat, p, j, w, cap, H, co, cal }) {
  const i = p.i;
  const ind = D.industry[i];
  const conf = confidence(D, i);
  const vals = co?.vals || {};
  const get = (id) => (vals[id] !== undefined ? vals[id] : D.cols[id]?.[i]);
  const sigs = SIGNALS.filter((id) => cat[id] && ok(get(id)));
  const rows = [
    ["Alcista — la tesis funciona", p.probs.bull, p.bull, COL.bull],
    ["Base — fundamentales actuales con reversión a la media", p.probs.base, p.base, COL.base],
    ["Bajista — el crecimiento se frena y el múltiplo se comprime", p.probs.bear, p.bear, COL.bear],
    ["Ruina — quiebra, fraude o dilución masiva (−90%)", p.probs.ruin, RUIN_MULT, COL.ruin],
  ];
  const amt = cap * w;
  return (
    <section className="pr-sheet pr-company">
      <div className="pr-cohead">
        <div className="pr-badge" style={{ background: PAL[j % PAL.length] }}>{j + 1}</div>
        <div>
          <h2>{D.name[i]}</h2>
          <div className="pr-meta">
            <b>{D.ticker[i]}</b> · {meta.exchanges[D.exchange[i]]} · {meta.countries[D.country[i]]} · {meta.sectorEs?.[D.sector[i]] || meta.sectors?.[D.sector[i]]} › {meta.industryEs?.[ind] || meta.industries?.[ind]}
            {D.isin?.[i] ? <> · ISIN {D.isin[i]}</> : null}
          </div>
        </div>
        <div className="pr-alloc"><small>Peso</small><b>{(w * 100).toFixed(1)}%</b><em>{fmtUsd(amt)}</em></div>
      </div>

      <div className="pr-cokpis">
        <div><small>Retorno anual esperado</small><b className={tone(p.cagr)}>{fmtPct(p.cagr * 100)}</b></div>
        <div><small>Retorno calibrado</small><b className={tone(cal)}>{ok(cal) ? fmtPct(cal * 100) : "—"}</b></div>
        <div><small>Múltiplo esperado</small><b>{fmtX(p.E)}</b></div>
        <div><small>Integridad de datos</small><b>{pct0(conf.conf)}</b></div>
      </div>

      <h3>Qué hace</h3>
      <p className="pr-p pr-desc">{co == null ? "No se pudo cargar la ficha de la empresa." : co.desc || `Sin descripción disponible en la fuente pública. Industria: ${meta.industryEs?.[ind] || "—"}.`}</p>
      <h3>Cómo gana dinero</h3>
      <p className="pr-p">{meta.industryModel?.[ind] || "—"}</p>

      <h3>Escenarios a {yrs(H)}</h3>
      <table className="pr-t pr-num">
        <thead><tr><th>Escenario</th><th>Prob.</th><th>Múltiplo</th><th>Ret. anual</th><th>{fmtUsd(amt)} se vuelven</th></tr></thead>
        <tbody>
          {rows.map(([n, pr, m, c]) => (
            <tr key={n}><td style={{ color: c }}>{n}</td><td>{pct0(pr)}</td><td>{fmtX(m)}</td><td>{fmtPct(cg(m, H) * 100)}</td><td>{fmtUsd(amt * m)}</td></tr>
          ))}
          <tr className="pr-tot"><td>Valor esperado (ponderado)</td><td>100%</td><td>{fmtX(p.E)}</td><td>{fmtPct(p.cagr * 100)}</td><td>{fmtUsd(amt * p.E)}</td></tr>
        </tbody>
      </table>

      <h3>Métricas clave</h3>
      <div className="pr-mgrid">
        {GROUPS.map(([g, ids]) => (
          <div key={g} className="pr-mg">
            <h5>{g}</h5>
            {ids.filter((id) => cat[id]).map((id) => (
              <div className="pr-mrow" key={id}><span>{cat[id].label}</span><b>{fmtMetric(get(id), id, cat[id].unit)}</b></div>
            ))}
          </div>
        ))}
        {sigs.length > 0 && (
          <div className="pr-mg">
            <h5>Señales</h5>
            {sigs.map((id) => (
              <div className="pr-mrow" key={id}><span>{cat[id].label}</span><b>{fmtMetric(get(id), id, cat[id].unit)}</b></div>
            ))}
          </div>
        )}
      </div>

      <h3>Alertas de integridad de datos</h3>
      {conf.why.length > 0 ? (
        <ul className="pr-alerts">{conf.why.map((x) => <li key={x}>{x}</li>)}</ul>
      ) : (
        <p className="pr-p">Sin alertas de calidad de datos.</p>
      )}
    </section>
  );
}

// Gráfico de trayectorias para papel: fondo blanco, rejilla gris clara, escala logarítmica
function PrintPathChart({ series, H, height = 260 }) {
  const W = 700, P = { l: 46, r: 14, t: 12, b: 26 };
  const all = series.flatMap((s) => [1, ...s.data]).filter((x) => x > 0);
  const lo = Math.max(0.02, Math.min(...all) * 0.9), hi = Math.max(...all) * 1.1;
  const ly = (v) => Math.log(Math.max(v, lo));
  const steps = series[0]?.data.length || 1;
  const xs = (t) => P.l + (t / steps) * (W - P.l - P.r);
  const ys = (v) => P.t + (1 - (ly(v) - Math.log(lo)) / (Math.log(hi) - Math.log(lo) || 1)) * (height - P.t - P.b);
  const ticks = [0.1, 0.25, 0.5, 1, 2, 3, 5, 10, 20, 50, 100, 200, 500].filter((b) => b >= lo && b <= hi);
  const every = Math.ceil(steps / 20);
  return (
    <div className="pr-chart">
      <svg viewBox={`0 0 ${W} ${height}`} width="100%" role="img" aria-label="Trayectoria del portafolio">
        <rect x="0" y="0" width={W} height={height} fill="#fff" />
        {ticks.map((t) => (
          <g key={t}>
            <line x1={P.l} x2={W - P.r} y1={ys(t)} y2={ys(t)} stroke={t === 1 ? "#94a3b8" : "#e2e8f0"} strokeDasharray={t === 1 ? "" : "3 3"} />
            <text x={P.l - 6} y={ys(t) + 3.5} textAnchor="end" fontSize="10" fill="#475569">{t}x</text>
          </g>
        ))}
        {Array.from({ length: steps + 1 }, (_, t) => (t % every === 0 || t === steps) && (
          <text key={t} x={xs(t)} y={height - 8} textAnchor="middle" fontSize="10" fill="#475569">{t === 0 ? "hoy" : `a${t === steps && H % 1 ? H : t}`}</text>
        ))}
        {series.map((s) => (
          <polyline key={s.name} fill="none" stroke={s.color} strokeWidth={s.bold ? 2.8 : 1.6} strokeDasharray={s.dash || ""} strokeLinejoin="round"
            points={[[0, 1], ...s.data.map((v, t) => [t + 1, v])].map(([t, v]) => `${xs(t).toFixed(1)},${ys(v).toFixed(1)}`).join(" ")} />
        ))}
      </svg>
      <div className="pr-legend">{series.map((s) => <span key={s.name}><i style={{ borderTop: `${s.bold ? 3 : 2}px ${s.dash ? "dashed" : "solid"} ${s.color}` }} />{s.name}</span>)}</div>
    </div>
  );
}
