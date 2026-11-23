import React, { useEffect, useMemo, useState } from "react";
import { loadCompany } from "../data.js";
import { detail, confidence, getRank } from "../engine.js";
import { fmtUsd, fmtPct, fmtX, fmtByUnit, cagrClass } from "../format.js";
import PathChart from "./PathChart.jsx";
import { avColor } from "./Screener.jsx";
import { useCalibration, theoryOf } from "../calibration.js";

// Retorno esperado del modelo vs. lo que históricamente realizaron (mediana) las acciones de EE.UU. con un esperado similar
export function CalibratedNote({ cagr, settings, label = "esta empresa" }) {
  const C = useCalibration(theoryOf(settings));
  if (!C || !Number.isFinite(cagr)) return null;
  const real = C.cal.map(cagr);
  const flat = cagr >= C.cal.plateauFrom;
  return (
    <div className="box" style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
      <div style={{ minWidth: 150 }}>
        <div className="small">Retorno calibrado con el backtest de EE.UU.</div>
        <b className={cagrClass(real)} style={{ fontSize: 20, fontFamily: "var(--mono)" }}>{fmtPct(real * 100)}</b>
        <span className="small"> anual · modelo: {fmtPct(cagr * 100)}</span>
      </div>
      <div className="small" style={{ flex: 1, minWidth: 220 }}>
        Es el retorno anual mediano a {C.H} años que realizaron en el backtest las acciones a las que el modelo les daba un retorno esperado parecido al de {label}
        {flat ? <> (por encima de ~{fmtPct(C.cal.plateauFrom * 100)} esperado, el realizado histórico ya no subía)</> : null}.
        {" "}Ojo: se calibró solo con empresas de NYSE/Nasdaq que siguen cotizando hoy (sesgo de supervivencia){settings.horizon !== C.H ? <>, a {C.H} años aunque tu horizonte es {settings.horizon}</> : null}; en otros mercados puede no aplicar. No cambia el ranking.
      </div>
    </div>
  );
}

export default function Detail({ D, meta, R, i, settings, rank, total, onClose, inPortfolio, update }) {
  const [co, setCo] = useState(null);
  useEffect(() => { setCo(null); loadCompany(i).then(setCo); }, [i]);
  useEffect(() => {
    const k = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  }, [onClose]);

  const ev = useMemo(() => detail(D, i, settings, R.score, R.quality), [D, i, settings, R]);
  const conf = useMemo(() => confidence(D, i), [D, i]);
  const cat = useMemo(() => Object.fromEntries(meta.catalog.map((m) => [m.id, m])), [meta]);
  const H = settings.horizon;
  const ind = D.industry[i];
  const excluded = settings.excluded.includes(D.sym[i]);

  const factors = Object.entries(settings.weights).filter(([k, w]) => w > 0 && D.cols[k]).sort((a, b) => b[1] - a[1]).map(([k, w]) => {
    const r = getRank(D, k)[i];
    return { k, w, r, v: D.cols[k][i] };
  });
  const wTot = factors.reduce((s, f) => s + f.w, 0) || 1;

  const tv = `https://www.tradingview.com/symbols/${D.sym[i].replace(":", "-")}/`;
  return (
    <div className="drawer" role="dialog" aria-label={D.name[i]}>
      <div className="dh">
        <button className="btn small close" onClick={onClose}>✕ Cerrar</button>
        <div className="co" style={{ gap: 12 }}>
          <div className="av" style={{ width: 40, height: 40, fontSize: 14, borderRadius: 9, background: avColor(D.ticker[i]) }}>{D.ticker[i].slice(0, 2)}</div>
          <div>
            <h2>{D.name[i]}</h2>
            <div className="sub">
              <b style={{ fontFamily: "var(--mono)", color: "var(--text)" }}>{D.ticker[i]}</b> · {meta.exchanges[D.exchange[i]]} · {meta.countries[D.country[i]]} · {meta.sectorEs[D.sector[i]]} › {meta.industryEs[ind]}
              {D.isin[i] ? <> · ISIN {D.isin[i]}</> : null}
            </div>
          </div>
        </div>
      </div>
      <div className="db">
        {!ev ? (
          <div className="warnbox">Esta empresa no tiene ingresos o capitalización reportados, así que el modelo no puede proyectarla (típico de exploradoras mineras o biotech pre-comerciales). Aun así puedes ver sus métricas abajo.</div>
        ) : (
          <>
            <div className="cards">
              <div className="card"><small>Retorno anual esperado</small><b className={cagrClass(ev.cagr)}>{fmtPct(ev.cagr * 100)}</b><em>a {H} años</em></div>
              <div className="card"><small>Múltiplo esperado</small><b className={cagrClass(ev.cagr)}>{fmtX(ev.E)}</b><em>${Math.round(settings.capital * ev.E).toLocaleString("es")} por cada ${settings.capital.toLocaleString("es")}</em></div>
              <div className="card"><small>Score ADN Multibagger</small><b>{Math.round(R.score[i] * 100)}</b><em>{rank >= 0 ? `#${rank + 1} de ${total.toLocaleString("es")}` : "fuera del filtro"}</em></div>
              <div className="card"><small>Kelly individual f*</small><b>{Math.round(ev.kelly * 100)}%</b><em>confianza datos {Math.round(conf.conf * 100)}%</em></div>
            </div>

            <CalibratedNote cagr={ev.cagr} settings={settings} />

            <div className="box">
              <h4>Escenarios a {H} años</h4>
              <table className="simple">
                <thead><tr><th>Escenario</th><th>Probabilidad</th><th>Múltiplo</th><th>Retorno anual</th><th>${settings.capital.toLocaleString("es")} se vuelven</th></tr></thead>
                <tbody>
                  {[["Alcista — la tesis funciona", ev.probs.bull, ev.bull, "var(--bull)"], ["Base — fundamentales actuales con reversión a la media", ev.probs.base, ev.base, "var(--base)"], ["Bajista — el crecimiento se frena y el múltiplo se comprime", ev.probs.bear, ev.bear, "var(--bear)"], ["Ruina — quiebra, fraude o dilución masiva (−90%)", ev.probs.ruin, 0.1, "#94a3b8"]].map(([n, p, m, c]) => (
                    <tr key={n}><td style={{ color: c, fontFamily: "var(--sans)" }}>{n}</td><td>{Math.round(p * 100)}%</td><td>{fmtX(m)}</td><td>{fmtPct((Math.pow(m, 1 / H) - 1) * 100)}</td><td>${Math.round(settings.capital * m).toLocaleString("es")}</td></tr>
                  ))}
                  <tr className="tot"><td style={{ fontFamily: "var(--sans)", color: "var(--exp)" }}>Valor esperado (ponderado)</td><td>100%</td><td>{fmtX(ev.E)}</td><td>{fmtPct(ev.cagr * 100)}</td><td>${Math.round(settings.capital * ev.E).toLocaleString("es")}</td></tr>
                </tbody>
              </table>
            </div>

            <div className="box">
              <h4>Trayectoria año por año</h4>
              <PathChart H={H} capital={settings.capital} series={[
                { name: "Alcista", color: "var(--bull)", data: ev.paths.bull, dash: "4 3" },
                { name: "Base", color: "var(--base)", data: ev.paths.base, dash: "4 3" },
                { name: "Bajista", color: "var(--bear)", data: ev.paths.bear, dash: "4 3" },
                { name: "Esperado", color: "var(--exp)", data: ev.paths.exp, bold: true },
              ]} />
              <table className="simple" style={{ marginTop: 8 }}>
                <thead><tr><th>Año</th>{ev.paths.exp.map((_, t) => <th key={t}>{t + 1 > H ? H : t + 1}</th>)}</tr></thead>
                <tbody>
                  <tr><td>Múltiplo esperado</td>{ev.paths.exp.map((v, t) => <td key={t}>{fmtX(v)}</td>)}</tr>
                  <tr><td>Retorno de ese año</td>{ev.paths.exp.map((v, t) => <td key={t} className={cagrClass(v / (t ? ev.paths.exp[t - 1] : 1) - 1)}>{fmtPct((v / (t ? ev.paths.exp[t - 1] : 1) - 1) * 100, 0)}</td>)}</tr>
                </tbody>
              </table>
            </div>
          </>
        )}

        <div className="box">
          <h4>Qué hace</h4>
          <div className="prose">{co == null ? "Cargando…" : co.desc || <span className="neu">Sin descripción disponible en la fuente pública. Industria: {meta.industryEs[ind]}.</span>}</div>
          <h4 style={{ marginTop: 12 }}>Cómo gana dinero</h4>
          <div className="prose">{meta.industryModel[ind] || "—"}</div>
        </div>

        {factors.length > 0 && (
          <div className="box">
            <h4>Por qué tiene este score (percentil vs. {D.n.toLocaleString("es")} acciones)</h4>
            {factors.map((f) => (
              <div className="factor" key={f.k} title={cat[f.k]?.desc}>
                <span>{cat[f.k]?.label} <span className="small">· {Math.round((f.w / wTot) * 100)}%</span></span>
                <span className="fb"><i style={{ width: `${Number.isNaN(f.r) ? 0 : f.r * 100}%`, background: Number.isNaN(f.r) ? "transparent" : f.r > 0.66 ? "var(--accent)" : f.r > 0.33 ? "var(--warn)" : "var(--neg)" }} /></span>
                <b style={{ fontFamily: "var(--mono)", fontSize: 11, textAlign: "right" }}>{Number.isNaN(f.r) ? "n/d" : Math.round(f.r * 100)}</b>
              </div>
            ))}
          </div>
        )}

        {conf.why.length > 0 && (
          <div className="box">
            <h4>Alertas de calidad de datos</h4>
            {conf.why.map((w) => <span key={w} className="tag">{w}</span>)}
          </div>
        )}

        <div className="box">
          <h4>Todas las métricas</h4>
          {co == null ? "Cargando…" : meta.categories.map((c) => (
            <div key={c} style={{ marginBottom: 10 }}>
              <div style={{ color: "var(--accent2)", fontSize: 12, margin: "8px 0 4px", fontWeight: 600 }}>{c}</div>
              <div className="mgrid">
                {meta.catalog.filter((m) => m.cat === c).map((m) => (
                  <div className="mrow" key={m.id} title={m.desc}><span>{m.label}</span><b>{fmtByUnit(co.vals[m.id], m.unit)}</b></div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn" onClick={() => update((s) => ({ excluded: excluded ? s.excluded.filter((x) => x !== D.sym[i]) : [...s.excluded, D.sym[i]] }))}>
            {excluded ? "↺ Volver a permitir en el portafolio" : inPortfolio ? "✕ Sacar del portafolio" : "✕ Excluir del portafolio"}
          </button>
          <a className="btn" href={tv} target="_blank" rel="noreferrer">Ver en TradingView ↗</a>
        </div>
      </div>
    </div>
  );
}
