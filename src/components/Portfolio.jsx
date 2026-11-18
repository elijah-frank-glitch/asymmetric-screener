import React from "react";
import { WEIGHTING } from "../model.js";
import { fmtUsd, fmtPct, fmtX, cagrClass } from "../format.js";
import PathChart from "./PathChart.jsx";
import { avColor } from "./Screener.jsx";

const PAL = ["#34d399", "#22d3ee", "#60a5fa", "#a78bfa", "#f472b6", "#fbbf24", "#fb923c", "#4ade80", "#38bdf8", "#e879f9"];

export default function Portfolio({ D, meta, R, portfolio, settings, update, setSel, rankPos }) {
  if (!R || !portfolio) return <div className="loading">Calculando…</div>;
  const { picks, w, dist, path, pathBull, pathBase, pathBear } = portfolio;
  const H = settings.horizon;
  const cap = settings.capital;
  const E = path[path.length - 1] || 1;
  const cagr = Math.pow(E, 1 / H) - 1;
  const medCagr = Math.pow(Math.max(dist.median, 1e-6), 1 / H) - 1;

  return (
    <div className="page">
      <h2>Portafolio de {picks.length} {picks.length === 1 ? "empresa" : "empresas"} · {H} {H === 1 ? "año" : "años"}</h2>
      <p className="lead">
        Las {settings.nPicks} acciones con mayor {settings.rankBy === "score" ? "score ADN" : settings.rankBy === "kelly" ? "asimetría (Kelly × retorno)" : "retorno esperado"} según la teoría <b>“{settingsPresetName(settings)}”</b> y tus filtros.
        Se compra hoy y no se toca hasta el año {H}. Los pesos salen de <b>{WEIGHTING[settings.weighting].label}</b>.
      </p>

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
              <div className="hint">{WEIGHTING[settings.weighting].desc}</div>
            </div>
            <div className="field">
              <label>Peso máximo por posición <b>{Math.round(settings.maxW * 100)}%</b></label>
              <input type="range" min="0.1" max="1" step="0.05" value={settings.maxW} onChange={(e) => update({ maxW: Number(e.target.value) })} />
            </div>
            <div className="field">
              <label>Máximo por industria <b>{settings.maxPerIndustry || "sin límite"}</b></label>
              <input type="range" min="0" max="5" step="1" value={settings.maxPerIndustry} onChange={(e) => update({ maxPerIndustry: Number(e.target.value) })} />
              <div className="hint">Kelly asume que las apuestas son independientes. Cinco mineras de oro son, en la práctica, una sola apuesta al precio del oro.</div>
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
            <div className="card"><small>Valor esperado en {H}a</small><b className={cagrClass(cagr)}>{fmtUsd(cap * E)}</b><em>{fmtX(E)} · {fmtPct(cagr * 100)} anual</em></div>
            <div className="card"><small>Resultado mediano</small><b>{fmtUsd(cap * dist.median)}</b><em>{fmtX(dist.median)} · {fmtPct(medCagr * 100)} anual</em></div>
            <div className="card"><small>Rango 10%–90%</small><b style={{ fontSize: 15 }}>{fmtX(dist.p10)} – {fmtX(dist.p90)}</b><em>{fmtUsd(cap * dist.p10)} a {fmtUsd(cap * dist.p90)}</em></div>
            <div className="card"><small>Prob. de perder dinero</small><b className={dist.pLoss > 0.25 ? "neg" : ""}>{Math.round(dist.pLoss * 100)}%</b><em>≥2x: {Math.round(dist.p2x * 100)}% · ≥5x: {Math.round(dist.p5x * 100)}% · ≥10x: {Math.round(dist.p10x * 100)}%</em></div>
          </div>

          <div className="box">
            <h4>Asignación</h4>
            <div className="wbar">
              {picks.map((p, j) => w[j] > 0.001 && (
                <div key={p.i} style={{ width: `${w[j] * 100}%`, background: PAL[j % PAL.length] }} title={`${D.ticker[p.i]} ${Math.round(w[j] * 100)}%`}>{w[j] > 0.06 ? `${D.ticker[p.i]} ${Math.round(w[j] * 100)}%` : ""}</div>
              ))}
            </div>
            <div style={{ overflowX: "auto" }}>
              <table className="simple">
                <thead><tr><th>Empresa</th><th>Peso</th><th>Monto</th><th>Ret. anual esp.</th><th>Múltiplo esp.</th><th>Alc. / Base / Baj.</th><th>P(ruina)</th><th>Valor final esp.</th></tr></thead>
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
                      <td className={cagrClass(p.cagr)}>{fmtPct(p.cagr * 100)}</td>
                      <td>{fmtX(p.E)}</td>
                      <td><span className="scen" style={{ justifyContent: "flex-end" }}><span className="b">{fmtX(p.bull, 1)}</span><span className="m">{fmtX(p.base, 1)}</span><span className="r">{fmtX(p.bear, 1)}</span></span></td>
                      <td>{Math.round(p.probs.ruin * 100)}%</td>
                      <td>{fmtUsd(cap * w[j] * p.E)}</td>
                    </tr>
                  ))}
                  <tr className="tot"><td style={{ fontFamily: "var(--sans)" }}>Portafolio</td><td>100%</td><td>{fmtUsd(cap)}</td><td className={cagrClass(cagr)}>{fmtPct(cagr * 100)}</td><td>{fmtX(E)}</td><td></td><td></td><td>{fmtUsd(cap * E)}</td></tr>
                </tbody>
              </table>
            </div>
          </div>

          <div className="box">
            <h4>Valor del portafolio año por año</h4>
            <PathChart H={H} capital={cap} height={240} series={[
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
            <div className="small" style={{ marginTop: 6 }}>"Todo alcista/base/bajista" asume que todas las empresas caen en el mismo escenario a la vez (correlación perfecta). El valor esperado y la distribución de arriba asumen escenarios independientes (6,000 simulaciones).</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function settingsPresetName(s) {
  return { adn: "ADN Multibagger", mayer: "Twin Engines (Mayer)", value: "Valor + FCF (Yartseva)", disrupt: "Hipercrecimiento / Disrupción", quality: "Calidad compuesta", custom: "Personalizado" }[s.preset] || s.preset;
}
