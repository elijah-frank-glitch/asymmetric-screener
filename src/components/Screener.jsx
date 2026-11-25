import React, { useMemo, useRef, useState, useEffect } from "react";
import { fmtUsd, fmtPct, fmtX, fmtMetric, cagrClass } from "../format.js";

const ROW = 34;
const COLORS = ["#34d399", "#22d3ee", "#60a5fa", "#a78bfa", "#f472b6", "#fbbf24", "#fb923c", "#4ade80"];
export const avColor = (s) => COLORS[[...s].reduce((a, c) => a + c.charCodeAt(0), 0) % COLORS.length];

export default function Screener({ D, meta, R, ranked, total, outside = 0, rankPos, settings, update, sel, setSel, sort, setSort, rankVal, pickSet, busy, dataVer, cmpSet, toggleCmp, cmpFull, cal }) {
  const cat = useMemo(() => Object.fromEntries(meta.catalog.map((m) => [m.id, m])), [meta]);
  const [q, setQ] = useState(settings.filters.search || "");
  const [showAdd, setShowAdd] = useState(false);
  const [showFilter, setShowFilter] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => update((s) => ({ filters: { ...s.filters, search: q } })), 200);
    return () => clearTimeout(t);
  }, [q]);

  const H = settings.horizon;
  // puesto real en el ranking completo (no en la lista filtrada por el buscador); -1 = no pasa tus filtros
  const posOf = useMemo(() => ({ get: (i) => (rankPos ? rankPos[i] : ranked.indexOf(i)) }), [rankPos, ranked]);
  const cols = useMemo(() => {
    const base = [
      ...(toggleCmp ? [{ k: "cmp", l: "⚖", w: "34px", nosort: true }] : []),
      { k: "rank", l: "#", w: "60px", num: true, v: (i) => { const p = posOf.get(i); return p >= 0 ? p + 1 : Infinity; } },
      { k: "name", l: "Empresa", w: "250px", v: (i) => D.name[i] },
      { k: "country", l: "País", w: "120px", v: (i) => meta.countries[D.country[i]] },
      { k: "industry", l: "Industria", w: "170px", v: (i) => meta.industryEs[D.industry[i]] },
      { k: "mcap", l: "Cap. mercado", w: "100px", num: true, v: (i) => D.cols.mcap[i], f: fmtUsd },
      ...(cal ? [
        { k: "calm", l: "Ret. calibrado", w: "112px", num: true, v: (i) => cal.med[i], tip: `Retorno anual MEDIANO que realizaron en el backtest de EE.UU. (2011–2025, corregido por empresas que dejaron de cotizar) las acciones en el mismo percentil del ranking, a ${H} años.` },
        { k: "p2x", l: `P(≥2x) ${H}a`, w: "90px", num: true, v: (i) => cal.p2x[i], tip: `Probabilidad histórica de duplicar el capital en ${H} años para ese percentil del ranking.` },
        { k: "ploss", l: "P(pérdida)", w: "90px", num: true, v: (i) => cal.pLoss[i], tip: `Probabilidad histórica de terminar con menos dinero del invertido a ${H} años.` },
      ] : []),
      { k: "cagr", l: `Ret. modelo`, w: "112px", num: true, v: (i) => R.cagr[i], tip: "Retorno anual esperado por la proyección de escenarios del modelo. NO calibrado: en el backtest el decil superior del modelo esperaba mucho más de lo que realizó." },
      { k: "E", l: `Múltiplo ${H}a`, w: "100px", num: true, v: (i) => R.E[i], tip: "Múltiplo esperado por el modelo (no calibrado)." },
      { k: "scen", l: "Alc · Base · Baj", w: "180px", num: true, v: (i) => R.base[i], tip: "Escenarios del modelo (no calibrados)." },
      { k: "score", l: "Score ADN", w: "108px", num: true, v: (i) => R.score[i] },
      { k: "conf", l: "Integridad", w: "88px", num: true, v: (i) => R.conf[i], tip: "Integridad de datos: puntaje heurístico (no una probabilidad) que baja con patrones típicos de datos erróneos o no recurrentes." },
      { k: "kelly", l: cal ? "Kelly cal." : "Kelly f*", w: "80px", num: true, v: (i) => (cal ? cal.kelly[i] : R.kelly[i]), tip: cal ? "Fracción Kelly individual (contra efectivo al 3%) con la distribución histórica calibrada." : "Fracción Kelly individual con los escenarios del modelo." },
    ];
    const extra = settings.columns.filter((id) => cat[id]).map((id) => ({ k: id, l: cat[id].label, w: "120px", num: true, v: (i) => D.cols[id]?.[i], f: (x) => fmtMetric(x, id, cat[id].unit), metric: true }));
    return [...base, ...extra];
  }, [D, R, meta, settings.columns, cat, H, dataVer, toggleCmp, cal, posOf]);

  const rows = useMemo(() => {
    if (sort.key === "rank") return sort.dir === -1 ? ranked : [...ranked].reverse();
    // (ranked ya viene en orden de puesto, con las de "fuera" al final)
    const c = cols.find((c) => c.k === sort.key);
    if (!c) return ranked;
    const arr = [...ranked];
    const val = (i) => c.v(i);
    arr.sort((a, b) => {
      const va = val(a), vb = val(b);
      const na = va == null || Number.isNaN(va), nb = vb == null || Number.isNaN(vb);
      if (na !== nb) return na ? 1 : -1;
      if (typeof va === "string") return sort.dir * va.localeCompare(vb);
      return sort.dir * (va - vb);
    });
    return arr;
  }, [ranked, sort, cols]);

  // virtualización
  const wrap = useRef(null);
  const [scroll, setScroll] = useState({ top: 0, h: 800 });
  useEffect(() => {
    const el = wrap.current; if (!el) return;
    const on = () => setScroll({ top: el.scrollTop, h: el.clientHeight });
    on(); el.addEventListener("scroll", on, { passive: true }); window.addEventListener("resize", on);
    return () => { el.removeEventListener("scroll", on); window.removeEventListener("resize", on); };
  }, []);
  const start = Math.max(0, Math.floor(scroll.top / ROW) - 15);
  const end = Math.min(rows.length, Math.ceil((scroll.top + scroll.h) / ROW) + 15);
  const tpl = cols.map((c) => c.w).join(" ");

  const clickHead = (k) => k !== "cmp" && setSort((s) => (s.key === k ? { key: k, dir: -s.dir } : { key: k, dir: k === "name" || k === "country" || k === "industry" ? 1 : -1 }));

  const cell = (c, i) => {
    const pos = posOf.get(i) ?? -1;
    switch (c.k) {
      case "cmp": {
        const on = cmpSet?.has(D.sym[i]);
        return (
          <input type="checkbox" className="cmpbox" checked={!!on} disabled={!on && cmpFull}
            title={on ? "Quitar de la comparación" : cmpFull ? "Máximo 4 empresas" : "Agregar a la comparación"}
            aria-label={`Comparar ${D.ticker[i]}`}
            onClick={(e) => e.stopPropagation()} onChange={() => toggleCmp(D.sym[i])} />
        );
      }
      case "rank": return pos >= 0 ? <span title={`Puesto ${pos + 1} de ${(total ?? ranked.length).toLocaleString("es")} con tus filtros`}>{pos + 1}</span> : <span className="neu" title="No pasa tus filtros: abre la ficha para ver por qué">fuera</span>;
      case "name": return (
        <div className="co">
          <div className="av" style={{ background: avColor(D.ticker[i]) }}>{D.ticker[i].slice(0, 2)}</div>
          <div className="nm"><b>{D.ticker[i]} <span className="small" style={{ fontWeight: 400 }}>{meta.exchanges[D.exchange[i]]}</span></b><span title={D.name[i]}>{D.name[i]}</span></div>
        </div>
      );
      case "country": return <span className="neu">{meta.countries[D.country[i]]}</span>;
      case "industry": return <span className="neu" title={meta.industries[D.industry[i]]}>{meta.industryEs[D.industry[i]]}</span>;
      case "cagr": return <span className={cagrClass(R.cagr[i])}>{Number.isNaN(R.cagr[i]) ? "—" : fmtPct(R.cagr[i] * 100)}</span>;
      case "E": return <span className={cagrClass(R.cagr[i])}>{fmtX(R.E[i])}</span>;
      case "scen": return Number.isNaN(R.base[i]) ? "—" : <span className="scen"><span className="b">{fmtX(R.bull[i], 1)}</span><span className="m">{fmtX(R.base[i], 1)}</span><span className="r">{fmtX(R.bear[i], 1)}</span></span>;
      case "score": return <span style={{ display: "flex", gap: 6, alignItems: "center" }}><span className="bar"><i style={{ width: `${R.score[i] * 100}%` }} /></span>{Math.round(R.score[i] * 100)}</span>;
      case "conf": { const c2 = R.conf[i]; return <span className={`conf ${c2 >= 0.75 ? "h" : c2 >= 0.5 ? "m" : "l"}`}>{Math.round(c2 * 100)}%</span>; }
      case "kelly": { const k = c.v(i); return Number.isNaN(k) ? "—" : `${Math.round(k * 100)}%`; }
      case "calm": { const x = cal.med[i]; return Number.isNaN(x) ? "—" : <span className={cagrClass(x)}>{fmtPct(x * 100)}</span>; }
      case "p2x": case "ploss": { const x = c.v(i); return Number.isNaN(x) ? "—" : `${Math.round(x * 100)}%`; }
      default: { const v = c.v(i); return c.f ? c.f(v) : v; }
    }
  };

  const addable = meta.catalog.filter((m) => !settings.columns.includes(m.id));
  const ranges = settings.filters.ranges;

  return (
    <>
      <div className="toolbar">
        <input className="search" placeholder="Buscar ticker o empresa…" value={q} onChange={(e) => setQ(e.target.value)} />
        <span className="info"><b>{(total ?? ranked.length).toLocaleString("es")}</b> de {D.n.toLocaleString("es")} acciones pasan los filtros{settings.filters.search ? <> · búsqueda: {(ranked.length - outside).toLocaleString("es")} dentro{outside ? <>, {outside} fuera de tus filtros (al final, marcadas “fuera”)</> : null}</> : null}</span>
        {busy && <span className="calc">recalculando…</span>}
        <span style={{ flex: 1 }} />
        <button className="btn small" onClick={() => { setShowFilter((x) => !x); setShowAdd(false); }}>⧩ Filtro por métrica {ranges.length ? `(${ranges.length})` : ""}</button>
        <button className="btn small" onClick={() => { setShowAdd((x) => !x); setShowFilter(false); }}>＋ Columna</button>
      </div>
      {(showAdd || showFilter || ranges.length > 0 || settings.columns.length > 0) && (
        <div className="toolbar" style={{ paddingTop: 6, paddingBottom: 8, gap: 6 }}>
          {showAdd && (
            <MetricPicker meta={meta} options={addable} placeholder="Agregar columna…" onPick={(id) => update((s) => ({ columns: [...s.columns, id] }))} />
          )}
          {showFilter && (
            <MetricPicker meta={meta} options={meta.catalog} placeholder="Filtrar por métrica…" onPick={(id) => update((s) => ({ filters: { ...s.filters, ranges: [...s.filters.ranges, { id, min: "", max: "" }] } }))} />
          )}
          {settings.columns.map((id) => (
            <span key={id} className="tag">{cat[id]?.label} <a href="#" onClick={(e) => { e.preventDefault(); update((s) => ({ columns: s.columns.filter((x) => x !== id) })); }}>✕</a></span>
          ))}
          {ranges.map((r, k) => (
            <span key={k} className="tag" style={{ display: "inline-flex", gap: 4, alignItems: "center", color: "var(--text)" }}>
              {cat[r.id]?.label}
              <input style={{ width: 70 }} placeholder="mín" value={r.min} onChange={(e) => update((s) => ({ filters: { ...s.filters, ranges: s.filters.ranges.map((x, j) => (j === k ? { ...x, min: e.target.value } : x)) } }))} />
              <input style={{ width: 70 }} placeholder="máx" value={r.max} onChange={(e) => update((s) => ({ filters: { ...s.filters, ranges: s.filters.ranges.map((x, j) => (j === k ? { ...x, max: e.target.value } : x)) } }))} />
              <span className="small">{unitHint(cat[r.id]?.unit)}</span>
              <a href="#" onClick={(e) => { e.preventDefault(); update((s) => ({ filters: { ...s.filters, ranges: s.filters.ranges.filter((_, j) => j !== k) } })); }}>✕</a>
            </span>
          ))}
        </div>
      )}
      <div className="tablewrap" ref={wrap}>
        {!R ? <div className="loading">Calculando el modelo sobre {D.n.toLocaleString("es")} acciones…</div> : (
          <div className="tgrid" style={{ gridTemplateColumns: tpl }}>
            {cols.map((c) => (
              <div key={c.k} className={`th thead ${c.num ? "num" : ""} ${c.k === "cmp" ? "cmpcol" : ""} ${sort.key === c.k ? "sorted" : ""}`} onClick={() => clickHead(c.k)} title={c.k === "cmp" ? "Seleccionar hasta 4 empresas para comparar" : c.tip || c.l}>
                {c.l}{sort.key === c.k ? (sort.dir === -1 ? " ↓" : " ↑") : ""}
              </div>
            ))}
            {start > 0 && <div style={{ gridColumn: "1 / -1", height: start * ROW }} />}
            {rows.slice(start, end).map((i) => (
              <div key={i} className={`trow ${sel === i ? "sel" : ""} ${pickSet.has(i) ? "pick" : ""}`} onClick={() => setSel(i)}>
                {cols.map((c) => <div key={c.k} className={`td ${c.num ? "num" : ""} ${c.k === "cmp" ? "cmpcol" : ""}`} onClick={c.k === "cmp" ? (e) => { e.stopPropagation(); if (e.target === e.currentTarget && (cmpSet?.has(D.sym[i]) || !cmpFull)) toggleCmp(D.sym[i]); } : undefined}>{cell(c, i)}</div>)}
              </div>
            ))}
            {end < rows.length && <div style={{ gridColumn: "1 / -1", height: (rows.length - end) * ROW }} />}
          </div>
        )}
      </div>
    </>
  );
}

function unitHint(u) {
  return u === "pct" ? "%" : u === "usd" ? "USD" : u === "x" ? "x" : "";
}

export function MetricPicker({ meta, options, onPick, placeholder }) {
  const [v, setV] = useState("");
  return (
    <select value={v} onChange={(e) => { if (e.target.value) { onPick(e.target.value); setV(""); } }} style={{ maxWidth: 320 }}>
      <option value="">{placeholder}</option>
      {meta.categories.map((c) => (
        <optgroup key={c} label={c}>
          {options.filter((m) => m.cat === c).map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
        </optgroup>
      ))}
    </select>
  );
}
