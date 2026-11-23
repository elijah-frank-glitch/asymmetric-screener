import React, { useEffect, useMemo, useState } from "react";
import { fmtPct, cagrClass } from "../format.js";

// Track record: snapshots semanales inmutables (data/predictions) evaluados contra benchmarks.
// Consume public/data/track.json (ver docs/TRACK_CONTRACT.md §2).

const LOG_URL = "https://github.com/elijah-frank-glitch/asymmetric-screener/tree/main/data/predictions";
const DEFAULT_THEORY = "adn";
const PAL = { adn: "#34d399", mayer: "#22d3ee", value: "#60a5fa", disrupt: "#a78bfa", quality: "#f472b6" };
const EXTRA = ["#fbbf24", "#fb923c", "#4ade80", "#38bdf8", "#e879f9"];
const BENCH_COLORS = ["#e6ebf5", "#8b97b0"];

const ok = (x) => typeof x === "number" && Number.isFinite(x);
const pct = (x, d = 1) => (ok(x) ? fmtPct(x * 100, d) : "—");
const rc = (x) => (!ok(x) ? "" : x > 0.0005 ? "pos2" : x < -0.0005 ? "neg" : "neu");
const sub = (a, b) => (ok(a) && ok(b) ? a - b : null);
const colorOf = (id, k) => PAL[id] || EXTRA[k % EXTRA.length];

function fmtDate(d, long = true) {
  if (!d) return "—";
  const t = new Date(`${d}T00:00:00Z`);
  if (Number.isNaN(t.getTime())) return d;
  return t.toLocaleDateString("es", { timeZone: "UTC", day: "numeric", month: "short", ...(long ? { year: "numeric" } : {}) });
}
function fmtPrice(x) {
  if (!ok(x)) return "—";
  const a = Math.abs(x);
  if (a >= 1000) return x.toLocaleString("es", { maximumFractionDigits: 0 });
  if (a >= 1) return x.toLocaleString("es", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return x.toPrecision(3);
}
const daysLabel = (n) => (ok(n) ? `${n} ${n === 1 ? "día" : "días"}` : "—");

// caché a nivel de módulo: se descarga una sola vez aunque se cambie de pestaña
let cache = null;
function loadTrack() {
  if (!cache) {
    cache = fetch("/data/track.json", { cache: "no-cache" })
      .then(async (r) => {
        if (!r.ok) throw new Error(r.status === 404 ? "notfound" : `HTTP ${r.status}`);
        let j;
        try { j = await r.json(); } catch { throw new Error("notfound"); }
        if (!j || typeof j !== "object" || !Array.isArray(j.snapshots)) throw new Error("formato inválido");
        return j;
      })
      .catch((e) => { cache = null; throw e; });
  }
  return cache;
}

export default function Track() {
  const [T, setT] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => {
    let alive = true;
    loadTrack().then((j) => alive && setT(j)).catch((e) => alive && setErr(e.message || String(e)));
    return () => { alive = false; };
  }, []);

  if (err) {
    return (
      <div className="page">
        <h2>Track record</h2>
        <div className="warnbox" style={{ maxWidth: 720 }}>
          {err === "notfound"
            ? "Todavía no hay un registro de predicciones publicado en este despliegue. El primer registro se crea el próximo lunes."
            : <>No se pudo cargar el registro de predicciones ({err}). Intenta recargar la página en unos minutos.</>}
          {" "}El historial inmutable está en <a href={LOG_URL} target="_blank" rel="noreferrer">GitHub</a>.
        </div>
      </div>
    );
  }
  if (!T) return <div className="loading">Cargando el registro de predicciones…</div>;
  return <TrackView T={T} />;
}

export function TrackView({ T }) {
  const snaps = T.snapshots || [];
  const benches = useMemo(() => {
    const b = Array.isArray(T.benchmarks) && T.benchmarks.length ? T.benchmarks : [{ sym: "AMEX:SPY", label: "S&P 500 (SPY)" }, { sym: "NASDAQ:ACWI", label: "MSCI ACWI (ACWI)" }];
    return b.filter((x) => x && x.sym);
  }, [T]);
  const spy = (benches.find((b) => /SPY/i.test(b.sym)) || benches[0] || { sym: "AMEX:SPY" }).sym;
  const theories = useMemo(() => {
    let th = Array.isArray(T.theories) && T.theories.length ? T.theories.filter((t) => t && t.id) : [];
    if (!th.length) th = Object.keys(snaps[0]?.theories || {}).map((id) => ({ id, name: id }));
    // default primero
    return [...th].sort((a, b) => (a.id === DEFAULT_THEORY ? -1 : b.id === DEFAULT_THEORY ? 1 : 0));
  }, [T, snaps]);

  const [selDate, setSelDate] = useState(snaps[0]?.date || null);
  const [selTh, setSelTh] = useState(theories.find((t) => t.id === DEFAULT_THEORY)?.id || theories[0]?.id || null);
  const snap = snaps.find((s) => s.date === selDate) || snaps[0] || null;
  const latest = snaps[0] || null;
  const oldest = snaps[snaps.length - 1] || null;
  const evaluated = T.evaluatedAt ? new Date(T.evaluatedAt) : null;

  return (
    <div className="page">
      <h2>Track record</h2>
      <p className="lead">
        Cada lunes se congelan las recomendaciones del modelo para cada teoría —el top 20 y el portafolio Kelly de 5 empresas— junto con su
        precio de entrada, en un <a href={LOG_URL} target="_blank" rel="noreferrer">registro público e inmutable</a>. En cada actualización se mide
        su retorno real en USD contra el S&P 500 (SPY) y el MSCI ACWI. Los retornos son solo de precio, sin dividendos, en ambos lados.
        Ojo: en semanas o meses esto es casi puro ruido; el modelo apunta a un horizonte de 5 años.
      </p>

      {T.error && (
        <div className="warnbox" style={{ marginBottom: 12 }}>
          <b>Precios desactualizados.</b> En la última actualización no se pudieron obtener los precios actuales, así que los retornos pueden no estar al día.
          <div className="small" style={{ marginTop: 4, color: "#d9c49a" }}>Detalle: {String(T.error)}</div>
        </div>
      )}

      {!snaps.length ? (
        <div className="box" style={{ maxWidth: 720 }}>
          <h4>Sin registros todavía</h4>
          <div>El primer registro se crea el próximo lunes. A partir de ahí, cada semana se agrega una foto nueva de las recomendaciones y aquí verás cómo les va contra el mercado.</div>
        </div>
      ) : (
        <>
          {ok(latest?.days) && latest.days < 7 && (
            <div className="warnbox" style={{ marginBottom: 12 }}>
              El registro más reciente ({fmtDate(latest.date)}) tiene apenas {daysLabel(latest.days)}: sus retornos todavía están cerca de 0%.
              Los resultados empiezan a significar algo después de varios meses, y de verdad recién a varios años.
            </div>
          )}

          <div className="small" style={{ marginBottom: 6 }}>
            {snaps.length} {snaps.length === 1 ? "registro" : "registros"} desde el {fmtDate(oldest?.date)}
            {evaluated && !Number.isNaN(evaluated.getTime()) ? <> · precios evaluados el {evaluated.toLocaleString("es", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</> : null}
          </div>

          <div className="tcards">
            {theories.map((t, k) => (
              <TheoryCard key={t.id} t={t} color={colorOf(t.id, k)} sum={T.summary?.[t.id]} oldest={oldest} spy={spy}
                on={t.id === selTh} onClick={() => setSelTh(t.id)} />
            ))}
          </div>

          <div className="box">
            <h4>Retorno del portafolio de 5 por fecha de registro vs SPY</h4>
            <TrackChart snaps={snaps} theories={theories} benches={benches} spy={spy} />
            <div className="small" style={{ marginTop: 6 }}>
              Cada punto es el retorno acumulado, desde esa fecha hasta hoy, del portafolio congelado ese lunes. Los registros más antiguos llevan más tiempo en el mercado.
            </div>
          </div>

          <div className="box">
            <h4>Detalle por registro</h4>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}>
              <select value={snap?.date || ""} onChange={(e) => setSelDate(e.target.value)}>
                {snaps.map((s) => <option key={s.date} value={s.date}>{fmtDate(s.date)} · {daysLabel(s.days)}</option>)}
              </select>
              <div className="chips">
                {theories.map((t) => (
                  <button key={t.id} className={`chip ${t.id === selTh ? "on" : ""}`} onClick={() => setSelTh(t.id)}>{t.name || t.id}</button>
                ))}
              </div>
            </div>
            {snap && <SnapshotDetail snap={snap} th={theories.find((t) => t.id === selTh)} benches={benches} spy={spy} />}
          </div>
        </>
      )}
    </div>
  );
}

function TheoryCard({ t, color, sum, oldest, spy, on, onClick }) {
  const isDef = t.id === DEFAULT_THEORY;
  const n = ok(sum?.snapshots) ? sum.snapshots : 0;
  const first = oldest?.theories?.[t.id];
  const firstRet = first?.portfolio?.ret;
  const firstSpy = oldest?.bench?.[spy];
  return (
    <button className={`card tcard ${isDef ? "def" : ""} ${on ? "on" : ""}`} onClick={onClick} style={{ borderTopColor: color }}>
      <small style={{ color: "var(--text)", fontWeight: 600 }}>{t.name || t.id}{isDef && <span className="tag" style={{ marginLeft: 6 }}>default</span>}</small>
      {n > 0 ? (
        <>
          <b className={rc(sum.avgPortfolioRet)}>{pct(sum.avgPortfolioRet, 2)}</b>
          <em>Portafolio, promedio por registro · <span className={rc(sum.avgExcessVsSPY)}>{pct(sum.avgExcessVsSPY, 2)}</span> vs SPY</em>
          <span className="tstats">
            <span>Top 20 <b className={rc(sum.avgTop20Ret)}>{pct(sum.avgTop20Ret, 2)}</b></span>
            <span>Gana a SPY <b>{ok(sum.winRateVsSPY) ? `${Math.round(sum.winRateVsSPY * 100)}%` : "—"}</b></span>
            <span>Registros <b>{n}</b></span>
          </span>
        </>
      ) : (
        <>
          <b className="neu">—</b>
          <em>Aún no hay registros con al menos 1 día de antigüedad.</em>
        </>
      )}
      {oldest && first && (
        <span className="small" style={{ marginTop: 6, display: "block" }}>
          Desde el {fmtDate(oldest.date, false)} ({daysLabel(oldest.days)}): <span className={rc(firstRet)}>{pct(firstRet)}</span> vs SPY <span className={rc(firstSpy)}>{pct(firstSpy)}</span>
        </span>
      )}
    </button>
  );
}

// Gráfico de líneas: x = fecha de registro (antiguo → reciente), y = retorno acumulado hasta hoy
function TrackChart({ snaps, theories, benches, spy }) {
  const [hover, setHover] = useState(null);
  const pts = useMemo(() => [...snaps].reverse(), [snaps]); // antiguo → reciente
  const series = useMemo(() => {
    const s = theories.map((t, k) => ({
      key: t.id, name: t.name || t.id, color: colorOf(t.id, k), bold: t.id === DEFAULT_THEORY,
      data: pts.map((p) => p.theories?.[t.id]?.portfolio?.ret),
    }));
    benches.forEach((b, k) => s.push({
      key: b.sym, name: b.label || b.sym, color: BENCH_COLORS[k % BENCH_COLORS.length], dash: b.sym === spy ? "5 4" : "2 3", bench: true,
      data: pts.map((p) => p.bench?.[b.sym]),
    }));
    return s;
  }, [pts, theories, benches, spy]);

  const W = 680, height = 240, P = { l: 52, r: 16, t: 12, b: 28 };
  const vals = series.flatMap((s) => s.data).filter(ok);
  let lo = Math.min(0, ...vals), hi = Math.max(0, ...vals);
  if (hi - lo < 0.02) { const mid = (lo + hi) / 2; lo = mid - 0.01; hi = mid + 0.01; }
  const pad = (hi - lo) * 0.12;
  lo -= pad; hi += pad;
  const n = pts.length;
  const xs = (i) => (n <= 1 ? (P.l + W - P.r) / 2 : P.l + 14 + (i / (n - 1)) * (W - P.l - P.r - 28));
  const ys = (v) => P.t + (1 - (v - lo) / (hi - lo)) * (height - P.t - P.b);
  const step = niceStep((hi - lo) / 5);
  const ticks = [];
  for (let k = Math.ceil(lo / step - 1e-9); k * step <= hi + 1e-12; k++) ticks.push(k === 0 ? 0 : k * step);
  const tickDec = step * 100 >= 1 ? 0 : step * 100 >= 0.1 ? 1 : 2;
  const labelEvery = Math.max(1, Math.ceil(n / 8));

  return (
    <div style={{ position: "relative" }}>
      <svg viewBox={`0 0 ${W} ${height}`} width="100%" style={{ display: "block" }} onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const x = ((e.clientX - r.left) / r.width) * W;
          let best = null, bd = Infinity;
          for (let i = 0; i < n; i++) { const d = Math.abs(xs(i) - x); if (d < bd) { bd = d; best = i; } }
          setHover(best);
        }}>
        {ticks.map((t) => (
          <g key={t.toFixed(6)}>
            <line x1={P.l} x2={W - P.r} y1={ys(t)} y2={ys(t)} stroke={t === 0 ? "#2a3858" : "#16203a"} strokeDasharray={t === 0 ? "" : "3 3"} />
            <text x={P.l - 8} y={ys(t) + 4} textAnchor="end" fontSize="10" fill="#5d6a86" fontFamily="JetBrains Mono">{fmtPct(t * 100, tickDec)}</text>
          </g>
        ))}
        {pts.map((p, i) => (i % labelEvery === 0 || i === n - 1) && (
          <text key={p.date} x={xs(i)} y={height - 9} textAnchor="middle" fontSize="10" fill="#5d6a86" fontFamily="JetBrains Mono">{fmtDate(p.date, false)}</text>
        ))}
        {hover != null && <line x1={xs(hover)} x2={xs(hover)} y1={P.t} y2={height - P.b} stroke="#5d6a86" strokeDasharray="2 2" />}
        {series.map((s) => {
          const segs = [];
          let cur = [];
          s.data.forEach((v, i) => { if (ok(v)) cur.push(`${xs(i)},${ys(v)}`); else if (cur.length) { segs.push(cur); cur = []; } });
          if (cur.length) segs.push(cur);
          return (
            <g key={s.key}>
              {segs.filter((g) => g.length > 1).map((g, j) => (
                <polyline key={j} fill="none" stroke={s.color} strokeWidth={s.bold ? 2.6 : s.bench ? 1.6 : 1.4} strokeDasharray={s.dash || ""} opacity={s.bench || s.bold ? 1 : 0.85} points={g.join(" ")} />
              ))}
              {s.data.map((v, i) => ok(v) && (
                <circle key={i} cx={xs(i)} cy={ys(v)} r={hover === i ? 4 : s.bold ? 3.2 : 2.4} fill={s.bench ? "#0b1220" : s.color} stroke={s.color} strokeWidth={s.bench ? 1.5 : 0} />
              ))}
            </g>
          );
        })}
      </svg>
      {hover != null && pts[hover] && (
        <div style={{ position: "absolute", top: 6, left: `${Math.min(80, Math.max(20, (xs(hover) / W) * 100))}%`, transform: "translateX(-50%)", background: "#0b1220", border: "1px solid #2a3858", borderRadius: 7, padding: "6px 9px", fontSize: 11, pointerEvents: "none", whiteSpace: "nowrap", zIndex: 2 }}>
          <div style={{ color: "#8b97b0", marginBottom: 3 }}>Registro del {fmtDate(pts[hover].date)} · {daysLabel(pts[hover].days)}</div>
          {series.map((s) => (
            <div key={s.key} style={{ color: s.color, fontFamily: "JetBrains Mono" }}>{s.name}: {pct(s.data[hover], 2)}</div>
          ))}
        </div>
      )}
      <div className="legend">
        {series.map((s) => (
          <span key={s.key}><i style={{ background: s.bench ? "transparent" : s.color, borderTop: s.bench ? `2px dashed ${s.color}` : 0, height: s.bench ? 0 : 3 }} />{s.name}</span>
        ))}
      </div>
    </div>
  );
}

function niceStep(raw) {
  if (!(raw > 0)) return 0.01;
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const m = raw / p;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p;
}

function SnapshotDetail({ snap, th, benches, spy }) {
  const d = th ? snap.theories?.[th.id] : null;
  if (!th || !d) return <div className="small">Esta teoría no tiene datos en el registro del {fmtDate(snap.date)}.</div>;
  const port = d.portfolio || {};
  const picks = Array.isArray(port.picks) ? port.picks : [];
  const top = Array.isArray(d.top) ? d.top : [];
  const t20 = d.top20 || {};
  const spyRet = snap.bench?.[spy];
  const wSum = picks.reduce((s, p) => s + (ok(p.weight) ? p.weight : 0), 0);
  const wExp = picks.reduce((s, p) => s + (ok(p.weight) && ok(p.expCagr) ? p.weight * p.expCagr : 0), 0);
  const missP = ok(port.missing) ? port.missing : picks.filter((p) => p.missing).length;
  const missT = ok(t20.missing) ? t20.missing : top.filter((p) => p.missing).length;

  return (
    <>
      <div className="kpis">
        <div className="card"><small>Portafolio de 5</small><b className={rc(port.ret)}>{pct(port.ret, 2)}</b><em>{ok(sub(port.ret, spyRet)) ? <>vs SPY: <span className={rc(sub(port.ret, spyRet))}>{pct(sub(port.ret, spyRet), 2)}</span></> : "—"}</em></div>
        <div className="card"><small>Top 20 (igual peso)</small><b className={rc(t20.ret)}>{pct(t20.ret, 2)}</b><em>Superan a SPY: {ok(t20.hitRate) ? `${Math.round(t20.hitRate * 100)}%` : "—"}{ok(t20.n) ? ` de ${t20.n}` : ""}</em></div>
        {benches.map((b) => (
          <div className="card" key={b.sym}><small>{b.label || b.sym}</small><b className={rc(snap.bench?.[b.sym])}>{pct(snap.bench?.[b.sym], 2)}</b><em>mismo periodo</em></div>
        ))}
        <div className="card"><small>Periodo</small><b style={{ fontSize: 15 }}>{daysLabel(snap.days)}</b><em>desde el {fmtDate(snap.date)}{ok(snap.horizon) ? ` · horizonte ${snap.horizon}a` : ""}</em></div>
      </div>
      {(missP > 0 || missT > 0) && (
        <div className="small" style={{ margin: "-6px 0 10px", color: "var(--warn)" }}>
          Sin precio actual: {missP} en el portafolio, {missT} en el top 20. Se excluyen de los promedios.
        </div>
      )}

      <h4 className="tsub">Portafolio Kelly de {picks.length} · {th.name || th.id}</h4>
      <div style={{ overflowX: "auto" }}>
        <table className="simple">
          <thead><tr><th>Empresa</th><th>País</th><th>Peso</th><th>Precio entrada</th><th>Precio actual</th><th>Ret. USD</th><th>CAGR esp. (entonces)</th></tr></thead>
          <tbody>
            {picks.map((p, j) => <PickRow key={p.sym || j} p={p} weight={p.weight} />)}
            <tr className="tot">
              <td style={{ fontFamily: "var(--sans)" }}>Portafolio{missP > 0 ? <span className="small"> ({missP} sin precio)</span> : null}</td>
              <td></td>
              <td>{ok(wSum) ? `${(wSum * 100).toFixed(0)}%` : "—"}</td>
              <td></td><td></td>
              <td className={rc(port.ret)}>{pct(port.ret, 2)}</td>
              <td className={cagrClass(wSum > 0 ? wExp / wSum : NaN)}>{wSum > 0 ? pct(wExp / wSum) : "—"}</td>
            </tr>
            {benches.map((b) => (
              <tr key={b.sym}>
                <td style={{ fontFamily: "var(--sans)", color: "var(--muted)" }}>{b.label || b.sym}</td>
                <td></td><td></td><td></td><td></td>
                <td className={rc(snap.bench?.[b.sym])}>{pct(snap.bench?.[b.sym], 2)}</td>
                <td></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h4 className="tsub" style={{ marginTop: 16 }}>Top {top.length} por retorno esperado{missT > 0 ? <span className="small" style={{ textTransform: "none", letterSpacing: 0 }}> · {missT} sin precio</span> : null}</h4>
      <div style={{ overflowX: "auto" }}>
        <table className="simple">
          <thead><tr><th>#</th><th style={{ textAlign: "left" }}>Empresa</th><th>País</th><th>Precio entrada</th><th>Precio actual</th><th>Ret. USD</th><th>CAGR esp. (entonces)</th></tr></thead>
          <tbody>
            {top.map((p, j) => <PickRow key={p.sym || j} p={p} rank={ok(p.rank) ? p.rank : j + 1} />)}
            <tr className="tot">
              <td></td>
              <td style={{ textAlign: "left", fontFamily: "var(--sans)" }}>Promedio igual peso{ok(t20.n) ? ` (${t20.n})` : ""}</td>
              <td></td><td></td><td></td>
              <td className={rc(t20.ret)}>{pct(t20.ret, 2)}</td>
              <td></td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className="small" style={{ marginTop: 6 }}>
        Precios en la moneda local de cotización. El retorno USD incluye la variación del tipo de cambio y excluye dividendos.
      </div>
    </>
  );
}

function PickRow({ p, rank, weight }) {
  const name = (
    <div className="nm" style={{ display: "flex", flexDirection: "column", lineHeight: 1.2 }}>
      <b style={{ fontFamily: "var(--mono)", fontSize: 12 }}>{p.ticker || p.sym || "—"}{p.missing && <span className="tag" style={{ marginLeft: 6, color: "var(--warn)" }}>sin precio</span>}</b>
      <span style={{ color: "var(--muted)", fontSize: 11, fontFamily: "var(--sans)", maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name || ""}</span>
    </div>
  );
  const cur = p.currency ? <span className="small"> {p.currency}</span> : null;
  return (
    <tr style={p.missing ? { opacity: 0.6 } : undefined}>
      {rank != null && <td>{rank}</td>}
      <td style={{ textAlign: "left", fontFamily: "var(--sans)" }}>{name}</td>
      <td style={{ fontFamily: "var(--sans)", color: "var(--muted)", whiteSpace: "nowrap" }}>{p.country || "—"}</td>
      {rank == null && <td>{ok(weight) ? `${(weight * 100).toFixed(1)}%` : "—"}</td>}
      <td style={{ whiteSpace: "nowrap" }}>{fmtPrice(p.entry)}{cur}</td>
      <td style={{ whiteSpace: "nowrap" }}>{p.missing ? "—" : <>{fmtPrice(p.current)}{cur}</>}</td>
      <td className={rc(p.ret)}>{p.missing ? "—" : pct(p.ret, 2)}</td>
      <td className={cagrClass(p.expCagr)}>{pct(p.expCagr)}</td>
    </tr>
  );
}
