import React, { useCallback, useState } from "react";
import { WEIGHTING } from "../model.js";
import { fmtUsd, fmtPct, fmtX, cagrClass } from "../format.js";
import PathChart from "./PathChart.jsx";
import PrintReport from "./PrintReport.jsx";
import { avColor } from "./Screener.jsx";
import { useCalibration, theoryOf } from "../calibration.js";

const PAL = ["#34d399", "#22d3ee", "#60a5fa", "#a78bfa", "#f472b6", "#fbbf24", "#fb923c", "#4ade80", "#38bdf8", "#e879f9"];

export default function Portfolio({ D, meta, R, portfolio, settings, update, setSel, rankPos, cal }) {
  const Cold = useCalibration(theoryOf(settings));
  const [report, setReport] = useState(null); // null | "print" (abre e imprime) | "preview" (solo vista previa)
  const closeReport = useCallback(() => setReport(null), []);
  if (!R || !portfolio) return <div className="loading">Calculando…</div>;
  const { picks, w, dist, path, pathBull, pathBase, pathBear, mode } = portfolio;
  const isCal = mode === "cal";
  const cash = portfolio.cash || 0;
  const H = settings.horizon;
  const cap = settings.capital;
  const E = isCal ? dist.mean : path[path.length - 1] || 1;
  const cagr = Math.pow(E, 1 / H) - 1;
  const medCagr = Math.pow(Math.max(dist.median, 1e-6), 1 / H) - 1;
  const geoCagr = Math.exp(dist.meanLog / H) - 1;
  // retorno calibrado por empresa (mediana histórica de su percentil) y del portafolio (con los mismos pesos)
  const hasCal = picks.length > 0 && picks.every((p) => p.cal);
  const C = hasCal ? { H } : Cold;
  const calC = hasCal ? picks.map((p) => p.cal.cagrMed) : Cold ? picks.map((p) => Cold.cal.map(p.cagr)) : null;
  const calPort = isCal && hasCal ? medCagr : calC ? Math.pow(picks.reduce((s, _, j) => s + w[j] * Math.pow(1 + calC[j], C.H), 0) + cash * Math.pow(1.03, C.H), 1 / C.H) - 1 : null;
  const modelE = picks.reduce((s, p, j) => s + w[j] * p.E, 0) + cash * Math.pow(1.03, H);
  const modelCagr = Math.pow(modelE, 1 / H) - 1;

  return (
    <div className="page">
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", justifyContent: "space-between" }}>
        <h2>Portafolio de {picks.length} {picks.length === 1 ? "empresa" : "empresas"} · {H} {H === 1 ? "año" : "años"}</h2>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button className="btn primary" onClick={() => setReport("print")} disabled={!picks.length} title="Genera un reporte para imprimir; en el diálogo elige “Guardar como PDF”">⬇ Descargar reporte PDF</button>
          <button className="btn" onClick={() => setReport("preview")} disabled={!picks.length} title="Ver el reporte en pantalla sin abrir el diálogo de impresión">Vista previa</button>
        </div>
      </div>
      {report && (
        <PrintReport D={D} meta={meta} portfolio={portfolio} settings={settings} C={C} calC={calC} calPort={calPort}
          autoPrint={report === "print"} onClose={closeReport} />
      )}
      <p className="lead">
        Las {settings.nPicks} acciones con mayor {settings.rankBy === "score" ? "score ADN" : settings.rankBy === "kelly" ? "asimetría (Kelly × retorno)" : settings.rankBy === "elog" ? "crecimiento esperado (geométrico)" : "retorno esperado"} según la teoría <b>“{settingsPresetName(settings)}”</b> y tus filtros.
        Se compra hoy y no se toca hasta el año {H}. Los pesos salen de <b>{WEIGHTING[settings.weighting]?.label || settings.weighting}</b>
        {" "}aplicado a {isCal ? <><b>la distribución histórica calibrada</b> (lo que realmente pasó en el backtest con acciones en la misma posición del ranking)</> : <><b>los escenarios del modelo</b> (proyección sin calibrar: optimista)</>}.
      </p>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", margin: "4px 0 10px" }}>
        <span className="small">Probabilidades:</span>
        <div className="modetoggle" role="group" aria-label="Distribución usada">
          <button className={isCal ? "on" : ""} disabled={!cal} onClick={() => update({ distMode: "cal" })} title={cal ? "" : "La calibración aún no se cargó"}>Calibradas (históricas)</button>
          <button className={!isCal ? "on" : ""} onClick={() => update({ distMode: "model" })}>Escenarios del modelo</button>
        </div>
      </div>

      <div className="pgrid">
        <div>
          <div className="box">
            <h4>Configuración</h4>
            <div className="field">
              <label>Capital inicial (USD)</label>
              <input type="number" min="0" step="1000" value={cap} onChange={(e) => update({ capital: Math.max(0, Number(e.target.value) || 0) })} style={{ width: "100%" }} />
            </div>
            <div className="field">
              <label>Número de empresas <b>{settings.nPicks}</b></label>
              <input type="range" min="1" max="30" value={settings.nPicks} onChange={(e) => update({ nPicks: Number(e.target.value) })} />
            </div>
            <div className="field">
              <label>Método de ponderación</label>
              <select value={settings.weighting} onChange={(e) => update({ weighting: e.target.value })} style={{ width: "100%" }}>
                {Object.entries(WEIGHTING).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
              <div className="hint">{WEIGHTING[settings.weighting]?.desc}</div>
            </div>
            <div className="field">
              <label>Peso máximo por posición <b>{Math.round(settings.maxW * 100)}%</b></label>
              <input type="range" min="0.1" max="1" step="0.05" value={settings.maxW} onChange={(e) => update({ maxW: Number(e.target.value) })} />
            </div>
            <div className="field">
              <label>Máximo por industria <b>{settings.maxPerIndustry || "sin límite"}</b></label>
              <input type="range" min="0" max="5" step="1" value={settings.maxPerIndustry} onChange={(e) => update({ maxPerIndustry: Number(e.target.value) })} />
              <div className="hint">Kelly ya modela que empresas de la misma industria (ρ≈0.6) o sector (ρ≈0.3) tienden a fallar juntas y les da menos peso conjunto, pero el ranking sí puede llenarse de una sola industria: cinco mineras de oro siguen siendo, en buena parte, una sola apuesta al precio del oro. Este tope lo evita.</div>
            </div>
            {settings.excluded.length > 0 && (
              <div className="field">
                <label>Excluidas manualmente</label>
                <div>{settings.excluded.map((s) => <span key={s} className="tag">{s} <a href="#" onClick={(e) => { e.preventDefault(); update((st) => ({ excluded: st.excluded.filter((x) => x !== s) })); }}>✕</a></span>)}</div>
              </div>
            )}
          </div>
          <div className="warnbox">
            <b>Léelo antes de invertir.</b> Esto es un modelo cuantitativo con datos públicos, no una recomendación personalizada de inversión.
            Elegir las mejores 5 de ~20,000 estimaciones con ruido sobreestima sistemáticamente el resultado (la "maldición del ganador"): toma estas cifras como un ordenamiento de candidatos para investigar a fondo, no como una promesa.
          </div>
        </div>

        <div>
          <div className="kpis">
            <div className="card"><small>Resultado mediano{isCal ? " (histórico)" : ""}</small><b className={cagrClass(medCagr)}>{fmtUsd(cap * dist.median)}</b><em>{fmtX(dist.median)} · {fmtPct(medCagr * 100)} anual</em></div>
            <div className="card"><small>Valor esperado (media) en {H}a</small><b className={cagrClass(cagr)}>{fmtUsd(cap * E)}</b><em>{fmtX(E)} · {fmtPct(cagr * 100)} anual · geométrico {fmtPct(geoCagr * 100)}</em></div>
            <div className="card"><small>Rango 10%–90%</small><b style={{ fontSize: 15 }}>{fmtX(dist.p10)} – {fmtX(dist.p90)}</b><em>{fmtUsd(cap * dist.p10)} a {fmtUsd(cap * dist.p90)}</em></div>
            <div className="card"><small>Prob. de perder dinero</small><b className={dist.pLoss > 0.25 ? "neg" : ""}>{Math.round(dist.pLoss * 100)}%</b><em>≥2x: {Math.round(dist.p2x * 100)}% · ≥5x: {Math.round(dist.p5x * 100)}% · ≥10x: {Math.round(dist.p10x * 100)}%</em></div>
          </div>

          {cash > 0.005 && (
            <div className="box small" style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <b style={{ fontSize: 16, fontFamily: "var(--mono)" }}>{Math.round(cash * 100)}% en efectivo</b>
              <span style={{ flex: 1, minWidth: 220 }}>{settings.weighting === "halfkelly" ? "Medio Kelly clásico: la mitad de cada peso Kelly y el resto en efectivo (3% anual)." : "Kelly deja esta parte en efectivo (3% anual): con estas probabilidades, apostar más reduce el crecimiento esperado de largo plazo, o el tope por posición no deja invertir más."} Si quieres estar 100% invertido, elige “Kelly 100% invertido”.</span>
            </div>
          )}
          {!isCal && calPort != null && (
            <div className="box" style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
              <div style={{ minWidth: 160 }}>
                <div className="small">Retorno calibrado con el backtest de EE.UU.</div>
                <b className={cagrClass(calPort)} style={{ fontSize: 20, fontFamily: "var(--mono)" }}>{fmtPct(calPort * 100)}</b>
                <span className="small"> anual · modelo: {fmtPct(cagr * 100)}</span>
              </div>
              <div className="small" style={{ flex: 1, minWidth: 220 }}>
                Traduce el retorno esperado de cada empresa al retorno anual mediano a {C.H} años que realizaron en el backtest las acciones con un esperado parecido, y lo combina con estos pesos.
                {" "}Ojo: calibrado solo con NYSE/Nasdaq y empresas que siguen cotizando (sesgo de supervivencia){H !== C.H ? <>, a {C.H} años aunque tu horizonte es {H}</> : null}; fuera de EE.UU. puede no aplicar. No cambia el ranking ni los pesos.
              </div>
            </div>
          )}

          <div className="box">
            <h4>Asignación</h4>
            <div className="wbar">
              {picks.map((p, j) => w[j] > 0.001 && (
                <div key={p.i} style={{ width: `${w[j] * 100}%`, background: PAL[j % PAL.length] }} title={`${D.ticker[p.i]} ${Math.round(w[j] * 100)}%`}>{w[j] > 0.06 ? `${D.ticker[p.i]} ${Math.round(w[j] * 100)}%` : ""}</div>
              ))}
            </div>
            <div style={{ overflowX: "auto" }}>
              <table className="simple">
                <thead><tr><th>Empresa</th><th>Peso</th><th>Monto</th>{calC && <th title="Retorno anual mediano histórico de su percentil del ranking">Ret. calibrado</th>}{hasCal && <th title="Probabilidad histórica de perder dinero">P(pérdida)</th>}{hasCal && <th title="Probabilidad histórica de duplicar">P(≥2x)</th>}<th title="Proyección del modelo, sin calibrar">Ret. modelo</th>{!isCal && <><th>Múltiplo esp.</th><th>Alc. / Base / Baj.</th><th>P(ruina)</th></>}<th>Valor final esp.</th></tr></thead>
                <tbody>
                  {picks.map((p, j) => (
                    <tr key={p.i} style={{ cursor: "pointer" }} onClick={() => setSel(p.i)}>
                      <td style={{ fontFamily: "var(--sans)" }}>
                        <div className="co">
                          <div className="av" style={{ background: avColor(D.ticker[p.i]) }}>{D.ticker[p.i].slice(0, 2)}</div>
                          <div className="nm"><b>{D.ticker[p.i]} <span className="small">#{rankPos[p.i] + 1}</span></b><span>{D.name[p.i]} · {meta.countries[D.country[p.i]]}</span></div>
                        </div>
                      </td>
                      <td style={{ color: PAL[j % PAL.length], fontWeight: 600 }}>{(w[j] * 100).toFixed(1)}%</td>
                      <td>{fmtUsd(cap * w[j])}</td>
                      {calC && <td className={cagrClass(calC[j])}>{fmtPct(calC[j] * 100)}</td>}
                      {hasCal && <td>{Math.round(p.cal.pLoss * 100)}%</td>}
                      {hasCal && <td>{Math.round(p.cal.p2x * 100)}%</td>}
                      <td className={cagrClass(p.cagr)}>{fmtPct(p.cagr * 100)}</td>
                      {!isCal && <><td>{fmtX(p.E)}</td>
                      <td><span className="scen" style={{ justifyContent: "flex-end" }}><span className="b">{fmtX(p.bull, 1)}</span><span className="m">{fmtX(p.base, 1)}</span><span className="r">{fmtX(p.bear, 1)}</span></span></td>
                      <td>{Math.round(p.probs.ruin * 100)}%</td></>}
                      <td>{fmtUsd(cap * w[j] * (isCal && p.cal ? p.cal.mean : p.E))}</td>
                    </tr>
                  ))}
                  {cash > 0.005 && <tr><td style={{ fontFamily: "var(--sans)" }}>Efectivo (3% anual)</td><td>{(cash * 100).toFixed(1)}%</td><td>{fmtUsd(cap * cash)}</td>{calC && <td>{fmtPct(3)}</td>}{hasCal && <td>0%</td>}{hasCal && <td>0%</td>}<td>{fmtPct(3)}</td>{!isCal && <><td>{fmtX(Math.pow(1.03, H))}</td><td></td><td>0%</td></>}<td>{fmtUsd(cap * cash * Math.pow(1.03, H))}</td></tr>}
                  <tr className="tot"><td style={{ fontFamily: "var(--sans)" }}>Portafolio</td><td>100%</td><td>{fmtUsd(cap)}</td>{calC && <td className={cagrClass(calPort)}>{fmtPct(calPort * 100)}</td>}{hasCal && <td>{Math.round(dist.pLoss * 100)}%</td>}{hasCal && <td>{Math.round(dist.p2x * 100)}%</td>}<td className={cagrClass(modelCagr)}>{fmtPct(modelCagr * 100)}</td>{!isCal && <><td>{fmtX(E)}</td><td></td><td></td></>}<td>{fmtUsd(cap * E)}</td></tr>
                </tbody>
              </table>
            </div>
          </div>

          <div className="box">
            <h4>Valor del portafolio año por año</h4>
            <PathChart H={H} capital={cap} height={240} series={isCal ? [
              { name: "Percentil 90", color: "var(--bull)", data: pathBull, dash: "4 3" },
              { name: "Mediana", color: "var(--base)", data: pathBase, dash: "4 3" },
              { name: "Percentil 10", color: "var(--bear)", data: pathBear, dash: "4 3" },
              { name: "Media", color: "var(--exp)", data: path, bold: true },
            ] : [
              { name: "Todo alcista", color: "var(--bull)", data: pathBull, dash: "4 3" },
              { name: "Todo base", color: "var(--base)", data: pathBase, dash: "4 3" },
              { name: "Todo bajista", color: "var(--bear)", data: pathBear, dash: "4 3" },
              { name: "Esperado", color: "var(--exp)", data: path, bold: true },
            ]} />
            <div style={{ overflowX: "auto" }}>
              <table className="simple" style={{ marginTop: 8 }}>
                <thead><tr><th>Año</th><th>Hoy</th>{path.map((_, t) => <th key={t}>{t + 1 > H ? H : t + 1}</th>)}</tr></thead>
                <tbody>
                  <tr><td>Valor esperado</td><td>{fmtUsd(cap)}</td>{path.map((v, t) => <td key={t}>{fmtUsd(cap * v)}</td>)}</tr>
                  <tr><td>Múltiplo acumulado</td><td>1.00x</td>{path.map((v, t) => <td key={t}>{fmtX(v)}</td>)}</tr>
                  <tr><td>Retorno del año</td><td></td>{path.map((v, t) => <td key={t} className={cagrClass(v / (t ? path[t - 1] : 1) - 1)}>{fmtPct((v / (t ? path[t - 1] : 1) - 1) * 100, 0)}</td>)}</tr>
                </tbody>
              </table>
            </div>
            <div className="small" style={{ marginTop: 6 }}>{isCal ? <>Con probabilidades calibradas, cada año se simula el portafolio (3,000 escenarios correlacionados) con la distribución histórica de su percentil del ranking a ese plazo; las líneas son la media, la mediana y los percentiles 10 y 90. En modo modelo, </> : null}"Todo alcista/base/bajista" asume que todas las empresas caen en el mismo escenario a la vez (correlación perfecta). La distribución de arriba (mediana, rango 10–90% y probabilidades) y los pesos Kelly modelan correlación entre empresas (6,000 simulaciones): ρ≈0.6 dentro de una misma industria, ≈0.3 dentro de un sector y ≈0.15 con el resto del mercado; el valor esperado no depende de la correlación.</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function settingsPresetName(s) {
  return { adn: "ADN Multibagger", signals: "ADN + Señales cualitativas", mayer: "Twin Engines (Mayer)", value: "Valor + FCF (Yartseva)", disrupt: "Hipercrecimiento / Disrupción", quality: "Calidad compuesta", custom: "Personalizado" }[s.preset] || s.preset;
}
