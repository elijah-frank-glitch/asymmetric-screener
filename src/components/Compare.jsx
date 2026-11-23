import React, { useEffect, useMemo, useState } from "react";
import { loadCompany } from "../data.js";
import { detail } from "../engine.js";
import { fmtPct, fmtX, fmtMetric, cagrClass } from "../format.js";
import PathChart from "./PathChart.jsx";
import { avColor } from "./Screener.jsx";

const MAIN_CATS = ["Valuación", "Crecimiento", "Rentabilidad", "Salud financiera", "Gobierno y señales"];
const LINE = ["#34d399", "#60a5fa", "#fbbf24", "#f472b6"];
const ok = (x) => typeof x === "number" && Number.isFinite(x);

// Índices de las celdas con el mejor valor según la dirección (1 = más alto es mejor, −1 = más bajo)
function bestOf(vals, better) {
  if (!better) return new Set();
  const v = vals.map((x) => (ok(x) ? x : null));
  const valid = v.filter((x) => x != null);
  if (valid.length < 2) return new Set();
  const b = better > 0 ? Math.max(...valid) : Math.min(...valid);
  if (valid.every((x) => x === b)) return new Set();
  return new Set(v.map((x, k) => (x === b ? k : -1)).filter((k) => k >= 0));
}

export default function Compare({ D, meta, R, settings, syms, rankPos, total, onClose, onRemove, onOpen, onShare }) {
  const idx = useMemo(() => syms.map((s) => D.sym.indexOf(s)).filter((i) => i >= 0), [D, syms]);
  const [cos, setCos] = useState({});
  const [allCats, setAllCats] = useState(false);
  const H = settings.horizon;

  useEffect(() => {
    let alive = true;
    for (const i of idx) {
      if (cos[i]) continue;
      loadCompany(i).then((co) => { if (alive) setCos((m) => ({ ...m, [i]: co })); }).catch(() => {});
    }
    return () => { alive = false; };
  }, [idx]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const k = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", k); document.body.style.overflow = prev; };
  }, [onClose]);

  const evs = useMemo(() => idx.map((i) => detail(D, i, settings, R.score, R.quality)), [D, idx, settings, R]);

  // Nombres únicos para la leyenda del gráfico (el mismo ticker puede cotizar en varias bolsas)
  const names = useMemo(() => {
    const t = idx.map((i) => D.ticker[i]);
    return idx.map((i, k) => (t.filter((x) => x === t[k]).length > 1 ? `${t[k]} (${meta.exchanges[D.exchange[i]]})` : t[k]));
  }, [idx, D, meta]);

  const modelRows = [
    { l: `Retorno esperado anual (${H}a)`, better: 1, vals: evs.map((e) => e?.cagr), f: (x) => <span className={cagrClass(x)}>{fmtPct(x * 100)}</span> },
    { l: `Múltiplo esperado a ${H}a`, better: 1, vals: evs.map((e) => e?.E), f: (x) => fmtX(x) },
    { l: "Escenario alcista", better: 1, vals: evs.map((e) => e?.bull), f: (x) => <span style={{ color: "var(--bull)" }}>{fmtX(x)}</span> },
    { l: "Escenario base", better: 1, vals: evs.map((e) => e?.base), f: (x) => <span style={{ color: "var(--base)" }}>{fmtX(x)}</span> },
    { l: "Escenario bajista", better: 1, vals: evs.map((e) => e?.bear), f: (x) => <span style={{ color: "var(--bear)" }}>{fmtX(x)}</span> },
    { l: "Score ADN Multibagger", better: 1, vals: idx.map((i) => R.score[i] * 100), f: (x) => Math.round(x) },
    { l: "Confianza en los datos", better: 1, vals: idx.map((i) => R.conf[i] * 100), f: (x) => `${Math.round(x)}%` },
    { l: "Kelly individual f*", better: 1, vals: evs.map((e) => (e ? e.kelly * 100 : NaN)), f: (x) => `${Math.round(x)}%` },
    { l: "Posición en el ranking", better: -1, vals: idx.map((i) => (rankPos[i] >= 0 ? rankPos[i] + 1 : NaN)), f: (x) => `#${x.toLocaleString("es")}`, hint: `de ${total.toLocaleString("es")}` },
  ];

  const cats = allCats ? meta.categories : MAIN_CATS.filter((c) => meta.categories.includes(c));
  const val = (i, id) => {
    const co = cos[i];
    if (co && id in co.vals) return co.vals[id];
    return D.cols[id]?.[i];
  };
  const loading = idx.some((i) => !cos[i]);

  const series = idx.map((i, k) => evs[k] && { name: names[k], color: LINE[k % LINE.length], data: evs[k].paths.exp, bold: true }).filter(Boolean);

  const Row = ({ l, vals, better, f, title, hint }) => {
    const best = bestOf(vals, better);
    return (
      <tr>
        <th scope="row" title={title}>{l}{hint ? <span className="small"> {hint}</span> : null}</th>
        {vals.map((x, k) => (
          <td key={k} className={best.has(k) ? "best" : ""}>{ok(x) ? f(x) : "—"}</td>
        ))}
      </tr>
    );
  };

  return (
    <div className="cmpview" role="dialog" aria-modal="true" aria-label="Comparar empresas">
      <div className="cmphead">
        <h2>⚖ Comparar empresas <span className="small">({idx.length})</span></h2>
        <span className="small cmpnote">Horizonte {H} {H === 1 ? "año" : "años"} · mejor valor de cada fila resaltado</span>
        <span style={{ flex: 1 }} />
        <label className="small cmpall"><input type="checkbox" checked={allCats} onChange={(e) => setAllCats(e.target.checked)} /> Todas las categorías</label>
        <button className="btn small" onClick={onShare}>🔗 Compartir</button>
        <button className="btn small" onClick={onClose}>✕ Cerrar</button>
      </div>
      <div className="cmpbody">
        {idx.length === 0 ? <div className="warnbox">No se encontraron estas empresas en los datos actuales.</div> : (
          <>
            {series.length > 0 && (
              <div className="box cmpchart">
                <h4>Trayectoria esperada (múltiplo del capital)</h4>
                <PathChart H={H} capital={settings.capital} height={200} series={series} />
              </div>
            )}
            <div className="cmpscroll">
              <table className="cmptable">
                <thead>
                  <tr>
                    <th className="corner">{loading ? <span className="small">Cargando métricas…</span> : null}</th>
                    {idx.map((i, k) => (
                      <th key={i} className="cmpco" style={{ borderTop: `3px solid ${LINE[k % LINE.length]}` }}>
                        <div className="co">
                          <div className="av" style={{ background: avColor(D.ticker[i]) }}>{D.ticker[i].slice(0, 2)}</div>
                          <button className="nm linkish" onClick={() => onOpen(i)} title="Abrir ficha">
                            <b>{D.ticker[i]} <span className="small" style={{ fontWeight: 400 }}>{meta.exchanges[D.exchange[i]]}</span></b>
                            <span>{D.name[i]}</span>
                          </button>
                          <button className="cmprm" aria-label={`Quitar ${D.ticker[i]}`} title="Quitar" onClick={() => onRemove(D.sym[i])}>✕</button>
                        </div>
                        <div className="small cmpsub">{meta.countries[D.country[i]]} · {meta.industryEs[D.industry[i]]}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr className="grp"><th colSpan={idx.length + 1}>Resultado del modelo</th></tr>
                  {modelRows.map((r) => <Row key={r.l} {...r} />)}
                  {cats.map((c) => (
                    <React.Fragment key={c}>
                      <tr className="grp"><th colSpan={idx.length + 1}>{c}</th></tr>
                      {meta.catalog.filter((m) => m.cat === c).map((m) => (
                        <Row key={m.id} l={m.label} title={m.desc} better={m.better || 0}
                          vals={idx.map((i) => val(i, m.id))} f={(x) => fmtMetric(x, m.id, m.unit)} />
                      ))}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
