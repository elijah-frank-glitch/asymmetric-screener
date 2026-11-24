import React from "react";
import { fmtPct } from "../format.js";

// Sección "Validación científica" del backtest: supervivencia, azar, fuera de muestra, factores simples y calibración.
const ok = (x) => typeof x === "number" && Number.isFinite(x);
const P = (x, d = 1) => (ok(x) ? fmtPct(x * 100, d) : "—");
const pc = (x) => (ok(x) ? `${Math.round(x * 100)}%` : "—");
const cls = (x) => (ok(x) ? (x > 0 ? "pos2" : x < 0 ? "neg" : "") : "");

export default function Validation({ B, h, theory = "adn" }) {
  if (!B?.survivorship) return null;
  const S = B.survivorship, sig = B.significance?.[h], oos = B.oos?.[h], sum = B.summary?.[theory]?.[h];
  const adj = sum?.adj || {};
  const base = (B.baselines || []).map((b) => ({ ...b, s: b.summary?.[h] })).filter((b) => b.s && ok(b.s.top20Cagr));
  const lam = S.lambda, dh = S.delistedShare?.[h];
  return (
    <div className="box valid">
      <h4>Validación científica · {h} {h === 1 ? "año" : "años"}</h4>
      <p className="small" style={{ marginTop: 0 }}>
        Las pruebas que separan una señal real de una casualidad. Todas usan el mismo backtest; donde el resultado no es favorable, se muestra igual.
      </p>

      <h5>1 · Sesgo de supervivencia (corregido)</h5>
      <div className="small">
        El histórico de precios solo existe para empresas que cotizan hoy. Comparando cuántas empresas con ventas reportaban a la SEC en cada año con cuántas
        tenemos con precio, se estima que <b>{ok(lam) ? (lam * 100).toFixed(1) + "%" : "—"} de las empresas listadas dejan de cotizar cada año</b> (compradas o quebradas; la literatura de EE.UU. reporta 6–9%).
        A {h} {h === 1 ? "año" : "años"} eso es <b>{ok(dh) ? Math.round(dh * 100) + "%" : "—"}</b> del universo real que falta. Se reincorpora con un supuesto explícito: 55% compradas con prima, 45% fallidas (−85%).
        Las selecciones ya no descartan a las que dejaron de cotizar (antes se elegían sabiendo que tendrían precio en el futuro).
      </div>
      <table className="simple" style={{ marginTop: 6 }}>
        <thead><tr><th>CAGR</th><th>Sin corregir</th><th>Corregido (central)</th><th>Pesimista</th><th>Optimista</th></tr></thead>
        <tbody>
          {[["Top 5 (Kelly)", "top5Cagr"], ["Top 20", "top20Cagr"], ["Top 50", "top50Cagr"], ["Universo", "universeCagr"]].map(([l, k]) => (
            <tr key={k}><td style={{ fontFamily: "var(--sans)" }}>{l}</td><td>{P(sum?.[k])}</td><td><b>{P(adj.central?.[k])}</b></td><td>{P(adj.pessimist?.[k])}</td><td>{P(adj.optimist?.[k])}</td></tr>
          ))}
          <tr><td style={{ fontFamily: "var(--sans)" }}>S&P 500 (SPY, sin sesgo)</td><td colSpan={4}>{P(sum?.spyCagr)}</td></tr>
        </tbody>
      </table>

      {sig && (
        <>
          <h5>2 · ¿Mejor que el azar?</h5>
          <div className="small">
            En cada fecha se compararon las 20 primeras del ranking contra <b>2,000 portafolios aleatorios</b> de 20 acciones del mismo universo.
            En promedio quedaron en el <b>percentil {Math.round(sig.meanPercentile * 100)}</b> (50 = igual que el azar) y superaron a la mitad de los aleatorios en
            {" "}{pc(sig.beatRandomMedian)} de las {sig.cohorts} fechas. Valor p ≈ <b>{ok(sig.pValue) ? sig.pValue.toFixed(3) : "—"}</b>
            {" "}({sig.pValue < 0.05 ? "significativo al 5%" : sig.pValue < 0.1 ? "evidencia débil, al 10%" : "no significativo"}).
            Exceso anual promedio sobre el universo: <b className={cls(sig.meanAnnualExcessVsUniverse)}>{P(sig.meanAnnualExcessVsUniverse)}</b>
            {ok(sig.tStat) ? <> (t = {sig.tStat.toFixed(2)})</> : null}.
            {sig.overlapping ? " Ojo: con horizontes de más de un año las fechas se solapan y no son independientes, así que la significancia real es menor." : " A 1 año las fechas no se solapan: es la prueba más limpia."}
          </div>
        </>
      )}

      {oos && (
        <>
          <h5>3 · Calibración fuera de muestra (walk-forward)</h5>
          <div className="small">
            Para cada año de prueba, la tabla de calibración se construyó <b>solo</b> con cohortes cuyo resultado ya se conocía en ese momento (años de prueba: {oos.cohorts.join(", ")}; {oos.n.toLocaleString("es")} observaciones).
            {" "}Habilidad (Brier skill score, 0 = igual que usar la tasa base de todo el mercado): P(≥2x) <b className={cls(oos.skill2x)}>{oos.skill2x.toFixed(3)}</b>, P(pérdida) <b className={cls(oos.skillLoss)}>{oos.skillLoss.toFixed(3)}</b>.
            {" "}El rango 10–90% contuvo el resultado real el <b>{pc(oos.coverage80)}</b> de las veces (lo ideal es 80%) y el {pc(oos.aboveMedian)} terminó por encima de la mediana pronosticada (ideal 50%).
            {" "}<b>Lectura honesta:</b> el ranking aporta poca información sobre la probabilidad de cada acción individual: casi todo el riesgo de una acción es propio o de mercado. Lo útil es el orden promedio, no la precisión individual.
          </div>
          {oos.reliability?.length > 0 && (
            <div style={{ overflowX: "auto" }}>
              <table className="simple" style={{ marginTop: 6 }}>
                <thead><tr><th>Percentil del ranking</th><th>n</th><th>P(≥2x) pronosticada</th><th>P(≥2x) real</th><th>CAGR mediano pronosticado</th><th>CAGR mediano real</th></tr></thead>
                <tbody>
                  {oos.reliability.map((r) => (
                    <tr key={r.lo}><td>{Math.round(r.lo * 1000) / 10}–{Math.round(r.hi * 1000) / 10}</td><td>{r.n.toLocaleString("es")}</td><td>{pc(r.pred2x)}</td><td>{pc(r.real2x)}</td><td>{P(r.predMedianCagr)}</td><td className={cls(r.realMedianCagr)}>{P(r.realMedianCagr)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {base.length > 0 && (
        <>
          <h5>4 · Contra estrategias factoriales simples</h5>
          <div className="small">Top 20 igual ponderado con los mismos filtros, ordenando por un solo factor. Si una regla de una línea le gana al modelo, el modelo no está aportando.</div>
          <table className="simple" style={{ marginTop: 6 }}>
            <thead><tr><th>Estrategia (top 20)</th><th>CAGR</th><th>Corregido</th></tr></thead>
            <tbody>
              <tr className="tot"><td style={{ fontFamily: "var(--sans)" }}>Modelo ({theory.toUpperCase()})</td><td>{P(sum?.top20Cagr)}</td><td>{P(adj.central?.top20Cagr)}</td></tr>
              {base.sort((a, b) => b.s.top20Cagr - a.s.top20Cagr).map((b) => (
                <tr key={b.id}><td style={{ fontFamily: "var(--sans)" }}>{b.name}</td><td className={b.s.top20Cagr > (sum?.top20Cagr ?? Infinity) ? "neg" : ""}>{P(b.s.top20Cagr)}</td><td>{P(b.s.top20CagrAdj)}</td></tr>
              ))}
            </tbody>
          </table>
          <div className="small" style={{ marginTop: 4 }}>En rojo, las que superan al modelo. Las estrategias de “más baratas” son las más expuestas al sesgo de supervivencia (las baratas que quebraron no están), así que su ventaja real probablemente es menor que la mostrada.</div>
        </>
      )}
    </div>
  );
}
