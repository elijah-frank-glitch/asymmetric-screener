import React, { useEffect, useMemo, useState } from "react";
import { fmtPct, cagrClass } from "../format.js";

// Backtest histórico (EE.UU., datos SEC): el mismo modelo reproducido con datos point-in-time.
// Consume /backtest.json (ver docs/BACKTEST_CONTRACT.md §2).

const DEFAULT_THEORY = "adn";
const PAL = { adn: "#34d399", mayer: "#22d3ee", value: "#60a5fa", disrupt: "#a78bfa", quality: "#f472b6" };
const EXTRA = ["#fbbf24", "#fb923c", "#4ade80", "#38bdf8", "#e879f9"];
const SERIES = [
  { key: "top5", name: "Portafolio Kelly de 5", color: "#34d399" },
  { key: "top20", name: "Top 20 (igual peso)", color: "#22d3ee" },
  { key: "universe", name: "Universo filtrado", color: "#8b97b0" },
  { key: "spy", name: "S&P 500 (SPY)", color: "#e6ebf5" },
];
const H_LABEL = { 1: "1 año", 3: "3 años", 5: "5 años" };

const ok = (x) => typeof x === "number" && Number.isFinite(x);
const arr = (x) => (Array.isArray(x) ? x : []);
const pct = (x, d = 1) => (ok(x) ? fmtPct(x * 100, d) : "—");
const pctPlain = (x, d = 0) => (ok(x) ? `${(x * 100).toFixed(d)}%` : "—");
const rc = (x) => (!ok(x) ? "" : x > 0.0005 ? "pos2" : x < -0.0005 ? "neg" : "neu");
const colorOf = (id, k) => PAL[id] || EXTRA[k % EXTRA.length];
const yearOf = (d) => (typeof d === "string" ? d.slice(0, 4) : "—");
const hLabel = (h) => H_LABEL[h] || `${h} años`;

function fmtDate(d) {
  if (!d) return "—";
  const t = new Date(`${d}T00:00:00Z`);
  if (Number.isNaN(t.getTime())) return d;
  return t.toLocaleDateString("es", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" });
}

// caché a nivel de módulo: se descarga una sola vez aunque se cambie de pestaña
let cache = null;
function loadBacktest() {
  if (!cache) {
    cache = fetch("/backtest.json", { cache: "no-cache" })
      .then(async (r) => {
        if (!r.ok) throw new Error(r.status === 404 ? "notfound" : `HTTP ${r.status}`);
        let j;
        try { j = await r.json(); } catch { throw new Error("notfound"); } // el fallback SPA devuelve HTML
        if (!j || typeof j !== "object" || !j.byDate || typeof j.byDate !== "object") throw new Error("notfound");
        return j;
      })
      .catch((e) => { cache = null; throw e; });
  }
  return cache;
}

export default function Backtest() {
  const [B, setB] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => {
    let alive = true;
    loadBacktest().then((j) => alive && setB(j)).catch((e) => alive && setErr(e.message || String(e)));
    return () => { alive = false; };
  }, []);

  if (err) {
    return (
      <div className="page">
        <h2>Backtest histórico</h2>
        <div className="box" style={{ maxWidth: 720 }}>
          <h4>{err === "notfound" ? "El backtest aún no se ha generado" : "No se pudo cargar el backtest"}</h4>
          <div className="prose">
            {err === "notfound"
              ? "Todavía no hay resultados del backtest en este despliegue. Cuando se ejecute la simulación histórica con los datos de la SEC, aquí verás cómo le habría ido al modelo desde 2011."
              : <>Ocurrió un error al leer los resultados ({err}). Intenta recargar la página en unos minutos.</>}
          </div>
        </div>
      </div>
    );
  }
  if (!B) return <div className="loading">Cargando el backtest…</div>;
  return <BacktestView B={B} />;
}

export function BacktestView({ B }) {
  const theories = useMemo(() => {
    let th = arr(B.theories).filter((t) => t && t.id && B.byDate?.[t.id]);
    if (!th.length) th = Object.keys(B.byDate || {}).map((id) => ({ id, name: id }));
    return [...th].sort((a, b) => (a.id === DEFAULT_THEORY ? -1 : b.id === DEFAULT_THEORY ? 1 : 0));
  }, [B]);
  const horizons = useMemo(() => {
    const h = arr(B.horizons).filter(ok);
    return h.length ? h : [1, 3, 5];
  }, [B]);

  const [selTh, setSelTh] = useState(theories.find((t) => t.id === DEFAULT_THEORY)?.id || theories[0]?.id || null);
  const [h, setH] = useState(horizons.includes(5) ? 5 : horizons[horizons.length - 1]);
  const th = theories.find((t) => t.id === selTh) || theories[0] || null;
  const thK = Math.max(0, theories.indexOf(th));
  const rows = arr(B.byDate?.[th?.id]?.[h]);
  const sum = B.summary?.[th?.id]?.[h] || null;
  const calib = arr(B.calibration?.[th?.id]).filter((c) => c && ok(c.decile)).sort((a, b) => a.decile - b.decile);
  const ic1 = arr(B.ic?.[th?.id]?.[1]);
  const ic5 = arr(B.ic?.[th?.id]?.[5]);
  const dates = arr(B.dates);
  const runAt = B.runAt ? new Date(B.runAt) : null;
  const notes = arr(B.notes).filter((n) => typeof n === "string" && n.trim());

  return (
    <div className="page">
      <h2>Backtest histórico</h2>
      <p className="lead">
        ¿Habría funcionado el modelo? Para cada 30 de abril entre {yearOf(dates[0]) !== "—" ? yearOf(dates[0]) : "2011"} y {yearOf(dates[dates.length - 1]) !== "—" ? yearOf(dates[dates.length - 1]) : "2025"} se
        reconstruyó el universo de acciones de EE.UU. con los reportes anuales presentados a la SEC (XBRL), usando <b>solo la información que ya era pública en esa fecha</b>,
        y se corrió exactamente el mismo modelo que usa la app. Luego se midió el retorno total real (con dividendos) de sus recomendaciones a 1, 3 y 5 años, frente al S&P 500 (SPY)
        y frente al promedio de todo el universo filtrado.
      </p>
      <div className="warnbox" style={{ marginBottom: 14, maxWidth: 900 }}>
        <b>Limitaciones importantes.</b> Solo cubre EE.UU.: no existe un histórico equivalente para las otras ~48.000 acciones globales del screener.
        Hay <b>sesgo de supervivencia</b>: solo entran empresas que siguen cotizando hoy, así que las quiebras y las compradas no aparecen, lo que infla los retornos de todos los grupos (incluido el universo).
        El consenso de analistas y los datos trimestrales no existen en el histórico, así que esos factores no influyen. Un buen backtest no garantiza resultados futuros.
        {notes.length > 0 && (
          <details style={{ marginTop: 6 }}>
            <summary style={{ cursor: "pointer" }}>Ver notas técnicas de la metodología ({notes.length})</summary>
            <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
              {notes.map((n, i) => <li key={i}>{n}</li>)}
            </ul>
          </details>
        )}
        {(runAt && !Number.isNaN(runAt.getTime())) || B.universe ? (
          <div className="small" style={{ marginTop: 6, color: "#d9c49a" }}>
            {B.universe ? <>Universo: {B.universe}</> : null}
            {B.universe && runAt && !Number.isNaN(runAt.getTime()) ? " · " : null}
            {runAt && !Number.isNaN(runAt.getTime()) ? <>Generado el {runAt.toLocaleDateString("es", { day: "numeric", month: "short", year: "numeric" })}</> : null}
          </div>
        ) : null}
      </div>

      {!th ? (
        <div className="box" style={{ maxWidth: 720 }}><h4>Sin resultados</h4><div>El archivo del backtest no contiene teorías con datos.</div></div>
      ) : (
        <>
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
            <div className="chips">
              {theories.map((t, k) => (
                <button key={t.id} className={`chip ${t.id === th.id ? "on" : ""}`} onClick={() => setSelTh(t.id)}
                  style={t.id === th.id ? { borderColor: colorOf(t.id, k), color: colorOf(t.id, k) } : undefined}>{t.name || t.id}</button>
              ))}
            </div>
            <div className="chips">
              {horizons.map((x) => (
                <button key={x} className={`chip ${x === h ? "on" : ""}`} onClick={() => setH(x)}>{hLabel(x)}</button>
              ))}
            </div>
          </div>

          <Kpis sum={sum} h={h} />

          <Conclusion th={th} h={h} sum={sum} calib={calib} ic={h === 1 ? ic1 : ic5} icH={h === 1 ? 1 : 5} />

          <div className="box">
            <h4>Retorno acumulado a {hLabel(h)} por fecha de inicio · {th.name || th.id}</h4>
            {rows.length ? <ReturnsChart rows={rows} h={h} /> : <div className="small">No hay datos para esta teoría y horizonte.</div>}
            <div className="small" style={{ marginTop: 6 }}>
              Cada grupo de barras es una cartera armada el 30 de abril de ese año y mantenida {hLabel(h)}. Las barras rayadas son periodos que aún no terminan
              (se miden hasta hoy) y no entran en los promedios.{h > 1 ? " Con horizontes de varios años, los periodos se superponen: no son observaciones independientes." : ""}
            </div>
          </div>

          <div className="box">
            <h4>Calibración: retorno esperado vs realizado por decil (horizonte 5 años)</h4>
            {calib.length ? <CalibChart calib={calib} color={colorOf(th.id, thK)} /> : <div className="small">No hay datos de calibración para esta teoría.</div>}
            <div className="small" style={{ marginTop: 6 }}>
              En cada fecha se ordenan todas las empresas por su CAGR esperado y se dividen en 10 grupos: el decil 1 es el 10% con mayor retorno esperado y el decil 10 el de menor.
              Si el modelo ordena bien, el CAGR realizado debería ir bajando del decil 1 al 10. No importa tanto que el nivel coincida (el modelo suele ser optimista); importa el orden.
            </div>
          </div>

          <div className="box">
            <h4>Poder predictivo (IC) por fecha</h4>
            <IcBlock ic1={ic1} ic5={ic5} />
          </div>

          <div className="box">
            <h4>Portafolio Kelly de 5 en cada fecha · retorno a {hLabel(h)}</h4>
            <PicksList rows={rows} h={h} />
          </div>
        </>
      )}
    </div>
  );
}

function Kpis({ sum, h }) {
  if (!sum || !ok(sum.periods) || sum.periods <= 0) {
    return (
      <div className="box" style={{ marginTop: 0 }}>
        <div className="small">Para el horizonte de {hLabel(h)} todavía no hay periodos completos con los que calcular un resumen.</div>
      </div>
    );
  }
  const exc = (a) => (ok(a) && ok(sum.spyCagr) ? a - sum.spyCagr : null);
  const excTxt = (a) => (ok(exc(a)) ? <>vs SPY: <span className={rc(exc(a))}>{fmtPct(exc(a) * 100, 1).replace("%", " pp")}</span></> : "anual");
  return (
    <>
      <div className="kpis">
        <div className="card"><small>Portafolio Kelly de 5</small><b className={cagrClass(sum.top5Cagr)}>{pct(sum.top5Cagr)}</b><em>CAGR · {excTxt(sum.top5Cagr)}</em></div>
        <div className="card"><small>Top 20 (igual peso)</small><b className={cagrClass(sum.top20Cagr)}>{pct(sum.top20Cagr)}</b><em>CAGR · {excTxt(sum.top20Cagr)}</em></div>
        <div className="card"><small>Universo filtrado</small><b className={cagrClass(sum.universeCagr)}>{pct(sum.universeCagr)}</b><em>CAGR · promedio igual peso</em></div>
        <div className="card"><small>S&amp;P 500 (SPY)</small><b className={cagrClass(sum.spyCagr)}>{pct(sum.spyCagr)}</b><em>CAGR · retorno total</em></div>
        <div className="card"><small>Le gana a SPY</small><b>{pctPlain(sum.top20WinRateVsSpy)}</b><em>top 20 · portafolio de 5: {pctPlain(sum.top5WinRateVsSpy)}</em></div>
        <div className="card"><small>Se volvieron 10x</small><b>{ok(sum.hitRate10x) ? `${(sum.hitRate10x * 100).toFixed(1)}%` : "—"}</b><em>de los nombres del top 20 en {hLabel(h)}</em></div>
      </div>
      <div className="small" style={{ margin: "-6px 0 12px" }}>
        Basado en {sum.periods} {sum.periods === 1 ? "periodo completo" : "periodos completos"} de {hLabel(h)}. CAGR = retorno anual compuesto. pp = puntos porcentuales por año.
      </div>
    </>
  );
}

// Correlación de rangos simple (Spearman sin empates) para la conclusión
function spearman(xs, ys) {
  const n = xs.length;
  if (n < 3) return null;
  const rank = (v) => { const idx = v.map((x, i) => [x, i]).sort((a, b) => a[0] - b[0]); const r = new Array(n); idx.forEach(([, i], k) => (r[i] = k + 1)); return r; };
  const rx = rank(xs), ry = rank(ys);
  const d2 = rx.reduce((s, r, i) => s + (r - ry[i]) ** 2, 0);
  return 1 - (6 * d2) / (n * (n * n - 1));
}
const avg = (a) => { const v = a.filter(ok); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null; };
function icVerdict(x) {
  if (!ok(x)) return { txt: "sin datos", cls: "neu" };
  if (x > 0.05) return { txt: "bueno", cls: "pos2" };
  if (x >= 0) return { txt: "débil", cls: "neu" };
  return { txt: "no predice", cls: "neg" };
}

function Conclusion({ th, h, sum, calib, ic, icH }) {
  if (!sum || !ok(sum.periods) || sum.periods <= 0) return null;
  const name = th.name || th.id;
  const parts = [];
  const cmp = (a, b) => {
    if (!ok(a) || !ok(b)) return "";
    const d = (a - b) * 100;
    if (Math.abs(d) < 0.25) return "prácticamente lo mismo que";
    return `${Math.abs(d).toFixed(1)} puntos porcentuales al año ${d > 0 ? "más" : "menos"} que`;
  };
  if (ok(sum.top20Cagr) && ok(sum.spyCagr)) {
    parts.push(`A ${hLabel(h)}, el top 20 de la teoría «${name}» rindió ${pct(sum.top20Cagr)} anual frente a ${pct(sum.spyCagr)} del S&P 500: ${cmp(sum.top20Cagr, sum.spyCagr)} el índice, en ${sum.periods} ${sum.periods === 1 ? "periodo completo" : "periodos completos"}.`);
  }
  if (ok(sum.top20WinRateVsSpy)) parts.push(`Le ganó al SPY en el ${pctPlain(sum.top20WinRateVsSpy)} de esos periodos.`);
  if (ok(sum.top5Cagr)) parts.push(`El portafolio concentrado de 5 rindió ${pct(sum.top5Cagr)} anual${ok(sum.top20Cagr) ? `, ${cmp(sum.top5Cagr, sum.top20Cagr)} el top 20` : ""}; al tener pocas acciones, su resultado depende mucho más de la suerte.`);
  if (ok(sum.universeCagr) && ok(sum.top20Cagr)) {
    parts.push(`El universo completo (que también tiene sesgo de supervivencia) rindió ${pct(sum.universeCagr)} anual; la comparación más justa del modelo es contra esa cifra: el top 20 obtuvo ${cmp(sum.top20Cagr, sum.universeCagr)} el universo.`);
  }
  const cv = calib.filter((c) => ok(c.realCagr));
  if (cv.length >= 5) {
    const rho = spearman(cv.map((c) => c.decile), cv.map((c) => c.realCagr));
    const first = cv[0], last = cv[cv.length - 1];
    if (ok(rho)) {
      const q = rho <= -0.7 ? "ordena bien" : rho <= -0.3 ? "ordena de forma parcial" : rho < 0.3 ? "casi no ordena" : "ordena al revés";
      parts.push(`En la calibración, el modelo ${q}: el decil 1 realizó ${pct(first.realCagr)} anual y el decil ${last.decile} ${pct(last.realCagr)}.`);
    }
  }
  const icAvg = avg(arr(ic).map((x) => x?.ic));
  if (ok(icAvg)) parts.push(`El IC promedio a ${hLabel(icH)} fue ${icAvg.toFixed(3)} (${icVerdict(icAvg).txt}).`);
  if (sum.periods < 8) parts.push("Con tan pocos periodos, el resultado es poco concluyente.");
  parts.push("Recuerda las limitaciones de arriba: solo EE.UU., con sesgo de supervivencia y sin datos de analistas.");
  return (
    <div className="box" style={{ borderColor: "var(--line2)" }}>
      <h4>Conclusión</h4>
      <div className="prose">{parts.join(" ")}</div>
    </div>
  );
}

function niceStep(raw) {
  if (!(raw > 0)) return 0.01;
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const m = raw / p;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p;
}
function axis(vals) {
  let lo = Math.min(0, ...vals), hi = Math.max(0, ...vals);
  if (hi - lo < 0.02) { lo -= 0.01; hi += 0.01; }
  const pad = (hi - lo) * 0.08;
  lo = lo < 0 ? lo - pad : lo; hi += pad;
  const step = niceStep((hi - lo) / 5);
  const ticks = [];
  for (let k = Math.ceil(lo / step - 1e-9); k * step <= hi + 1e-12; k++) ticks.push(k === 0 ? 0 : k * step);
  const dec = step * 100 >= 1 ? 0 : 1;
  return { lo, hi, ticks, dec };
}

// Barras agrupadas: por fecha, top5 / top20 / universo / SPY
function ReturnsChart({ rows, h }) {
  const [hover, setHover] = useState(null);
  const W = 720, height = 260, P = { l: 50, r: 10, t: 12, b: 26 };
  const vals = rows.flatMap((r) => SERIES.map((s) => r?.[s.key])).filter(ok);
  const { lo, hi, ticks, dec } = axis(vals);
  const n = rows.length;
  const gw = (W - P.l - P.r) / Math.max(1, n);
  const bw = Math.max(2, (gw * 0.8) / SERIES.length);
  const ys = (v) => P.t + (1 - (v - lo) / (hi - lo)) * (height - P.t - P.b);
  const y0 = ys(0);
  const anyPartial = rows.some((r) => r?.partial);
  const hr = hover != null ? rows[hover] : null;

  return (
    <div style={{ position: "relative" }}>
      <div style={{ overflowX: "auto" }}>
        <svg viewBox={`0 0 ${W} ${height}`} width="100%" style={{ display: "block", minWidth: 560 }} onMouseLeave={() => setHover(null)}
          onMouseMove={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            const x = ((e.clientX - r.left) / r.width) * W;
            const i = Math.floor((x - P.l) / gw);
            setHover(i >= 0 && i < n ? i : null);
          }}>
          <defs>
            <pattern id="bt-hatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <line x1="0" y1="0" x2="0" y2="5" stroke="#070b14" strokeWidth="2.2" />
            </pattern>
          </defs>
          {ticks.map((t) => (
            <g key={t.toFixed(6)}>
              <line x1={P.l} x2={W - P.r} y1={ys(t)} y2={ys(t)} stroke={t === 0 ? "#2a3858" : "#16203a"} strokeDasharray={t === 0 ? "" : "3 3"} />
              <text x={P.l - 7} y={ys(t) + 4} textAnchor="end" fontSize="10" fill="#5d6a86" fontFamily="JetBrains Mono">{fmtPct(t * 100, dec)}</text>
            </g>
          ))}
          {rows.map((r, i) => {
            const gx = P.l + i * gw + gw * 0.1;
            return (
              <g key={r?.date || i} opacity={hover == null || hover === i ? 1 : 0.55}>
                {hover === i && <rect x={P.l + i * gw} y={P.t} width={gw} height={height - P.t - P.b} fill="rgba(52,211,153,0.05)" />}
                {SERIES.map((s, k) => {
                  const v = r?.[s.key];
                  if (!ok(v)) return null;
                  const y = Math.min(ys(v), y0), hh = Math.max(1, Math.abs(ys(v) - y0));
                  const x = gx + k * bw;
                  return r.partial ? (
                    <g key={s.key}>
                      <rect x={x} y={y} width={bw - 1} height={hh} fill={s.color} opacity={0.55} />
                      <rect x={x} y={y} width={bw - 1} height={hh} fill="url(#bt-hatch)" />
                    </g>
                  ) : <rect key={s.key} x={x} y={y} width={bw - 1} height={hh} fill={s.color} opacity={s.key === "universe" ? 0.75 : 0.95} />;
                })}
                <text x={P.l + i * gw + gw / 2} y={height - 9} textAnchor="middle" fontSize="10" fill={r?.partial ? "#fbbf24" : "#5d6a86"} fontFamily="JetBrains Mono">
                  {n > 10 ? `'${yearOf(r?.date).slice(2)}` : yearOf(r?.date)}{r?.partial ? "*" : ""}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      {hr && (
        <div style={{ position: "absolute", top: 6, left: `${Math.min(78, Math.max(22, ((P.l + (hover + 0.5) * gw) / W) * 100))}%`, transform: "translateX(-50%)", background: "#0b1220", border: "1px solid #2a3858", borderRadius: 7, padding: "6px 9px", fontSize: 11, pointerEvents: "none", whiteSpace: "nowrap", zIndex: 2 }}>
          <div style={{ color: "#8b97b0", marginBottom: 3 }}>Desde el {fmtDate(hr.date)} · {hr.partial ? <span style={{ color: "var(--warn)" }}>periodo incompleto (hasta hoy)</span> : hLabel(h)}{ok(hr.n) ? ` · ${hr.n.toLocaleString("es")} empresas` : ""}</div>
          {SERIES.map((s) => (
            <div key={s.key} style={{ color: s.color, fontFamily: "JetBrains Mono" }}>{s.name}: {pct(hr[s.key])}</div>
          ))}
        </div>
      )}
      <div className="legend">
        {SERIES.map((s) => <span key={s.key}><i style={{ background: s.color, height: 8, width: 8, borderRadius: 2 }} />{s.name}</span>)}
        {anyPartial && (
          <span>
            <i style={{ width: 10, height: 8, borderRadius: 2, background: "repeating-linear-gradient(45deg, #8b97b0 0 2px, #070b14 2px 4px)" }} />
            periodo incompleto (<span style={{ color: "var(--warn)" }}>*</span>)
          </span>
        )}
      </div>
    </div>
  );
}

function CalibChart({ calib, color }) {
  const W = 720, height = 220, P = { l: 50, r: 10, t: 12, b: 34 };
  const vals = calib.flatMap((c) => [c.expCagr, c.realCagr]).filter(ok);
  const { lo, hi, ticks, dec } = axis(vals);
  const n = calib.length;
  const gw = (W - P.l - P.r) / Math.max(1, n);
  const bw = (gw * 0.7) / 2;
  const ys = (v) => P.t + (1 - (v - lo) / (hi - lo)) * (height - P.t - P.b);
  const y0 = ys(0);
  const bar = (v, x, fill, op, key) => {
    if (!ok(v)) return null;
    const y = Math.min(ys(v), y0), hh = Math.max(1, Math.abs(ys(v) - y0));
    return <rect key={key} x={x} y={y} width={bw - 1} height={hh} fill={fill} opacity={op}><title>{pct(v)}</title></rect>;
  };
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${height}`} width="100%" style={{ display: "block" }}>
        {ticks.map((t) => (
          <g key={t.toFixed(6)}>
            <line x1={P.l} x2={W - P.r} y1={ys(t)} y2={ys(t)} stroke={t === 0 ? "#2a3858" : "#16203a"} strokeDasharray={t === 0 ? "" : "3 3"} />
            <text x={P.l - 7} y={ys(t) + 4} textAnchor="end" fontSize="11" fill="#5d6a86" fontFamily="JetBrains Mono">{fmtPct(t * 100, dec)}</text>
          </g>
        ))}
        {calib.map((c, i) => {
          const gx = P.l + i * gw + gw * 0.15;
          return (
            <g key={c.decile}>
              {bar(c.expCagr, gx, "#5d6a86", 0.6, "e")}
              {bar(c.realCagr, gx + bw, color, 0.95, "r")}
              <text x={P.l + i * gw + gw / 2} y={height - 18} textAnchor="middle" fontSize="11" fill="#8b97b0" fontFamily="JetBrains Mono">{c.decile}</text>
            </g>
          );
        })}
        <text x={P.l + (W - P.l - P.r) / 2} y={height - 3} textAnchor="middle" fontSize="10" fill="#5d6a86">decil (1 = mayor retorno esperado)</text>
      </svg>
      <div className="legend">
        <span><i style={{ background: "#5d6a86", height: 8, width: 8, borderRadius: 2 }} />CAGR esperado por el modelo</span>
        <span><i style={{ background: color, height: 8, width: 8, borderRadius: 2 }} />CAGR realizado</span>
      </div>
    </div>
  );
}

function Spark({ data }) {
  const vals = data.map((d) => d.ic).filter(ok);
  if (!vals.length) return <span className="small">—</span>;
  const W = 160, H = 30;
  const m = Math.max(0.1, ...vals.map(Math.abs));
  const bw = W / data.length;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} style={{ display: "block" }}>
      <line x1="0" x2={W} y1={H / 2} y2={H / 2} stroke="#2a3858" />
      {data.map((d, i) => ok(d.ic) && (
        <rect key={i} x={i * bw + 1} width={Math.max(1, bw - 2)} y={d.ic >= 0 ? H / 2 - (d.ic / m) * (H / 2 - 1) : H / 2}
          height={Math.max(1, (Math.abs(d.ic) / m) * (H / 2 - 1))} fill={d.ic >= 0 ? "#34d399" : "#f87171"}>
          <title>{`${yearOf(d.date)}: ${d.ic.toFixed(3)}`}</title>
        </rect>
      ))}
    </svg>
  );
}

function IcBlock({ ic1, ic5 }) {
  const byDate = new Map();
  ic1.forEach((x) => x?.date && byDate.set(x.date, { date: x.date, a: x.ic }));
  ic5.forEach((x) => x?.date && byDate.set(x.date, { ...(byDate.get(x.date) || { date: x.date }), b: x.ic }));
  const list = [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
  if (!list.length) return <div className="small">No hay datos de IC para esta teoría.</div>;
  const a1 = avg(ic1.map((x) => x?.ic)), a5 = avg(ic5.map((x) => x?.ic));
  const v1 = icVerdict(a1), v5 = icVerdict(a5);
  return (
    <>
      <div className="prose" style={{ marginBottom: 10 }}>
        El IC (coeficiente de información) mide si las empresas a las que el modelo les veía más potencial realmente rindieron más: es la correlación de rangos entre el retorno esperado
        y el realizado en cada fecha. Va de −1 a +1. Como guía: <span className="pos2">mayor a 0,05 es bueno</span>, <span className="neu">entre 0 y 0,05 es débil</span> y
        {" "}<span className="neg">menor a 0 significa que no predice</span>. En inversión cuantitativa, un IC sostenido de 0,05 ya es valioso.
      </div>
      <div className="kpis">
        <div className="card"><small>IC promedio · 1 año</small><b className={v1.cls}>{ok(a1) ? a1.toFixed(3) : "—"}</b><em>{v1.txt} · {ic1.filter((x) => ok(x?.ic)).length} fechas</em><div style={{ marginTop: 6 }}><Spark data={ic1} /></div></div>
        <div className="card"><small>IC promedio · 5 años</small><b className={v5.cls}>{ok(a5) ? a5.toFixed(3) : "—"}</b><em>{v5.txt} · {ic5.filter((x) => ok(x?.ic)).length} fechas</em><div style={{ marginTop: 6 }}><Spark data={ic5} /></div></div>
      </div>
      <details>
        <summary style={{ cursor: "pointer", color: "var(--muted)", fontSize: 12 }}>Ver IC por fecha</summary>
        <div style={{ overflowX: "auto", marginTop: 8 }}>
          <table className="simple" style={{ maxWidth: 460 }}>
            <thead><tr><th>Fecha</th><th>IC 1 año</th><th>IC 5 años</th></tr></thead>
            <tbody>
              {list.map((r) => (
                <tr key={r.date}>
                  <td style={{ fontFamily: "var(--sans)" }}>{fmtDate(r.date)}</td>
                  <td className={icVerdict(r.a).cls}>{ok(r.a) ? r.a.toFixed(3) : "—"}</td>
                  <td className={icVerdict(r.b).cls}>{ok(r.b) ? r.b.toFixed(3) : "—"}</td>
                </tr>
              ))}
              <tr className="tot">
                <td style={{ fontFamily: "var(--sans)" }}>Promedio</td>
                <td className={v1.cls}>{ok(a1) ? a1.toFixed(3) : "—"}</td>
                <td className={v5.cls}>{ok(a5) ? a5.toFixed(3) : "—"}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </details>
    </>
  );
}

function PicksList({ rows, h }) {
  const list = [...rows].filter(Boolean).reverse(); // reciente primero
  if (!list.length) return <div className="small">No hay portafolios para este horizonte.</div>;
  return (
    <div>
      {list.map((r, i) => {
        const picks = arr(r.picks);
        const wExp = picks.reduce((s, p) => s + (ok(p?.weight) && ok(p?.expCagr) ? p.weight * p.expCagr : 0), 0);
        const wSum = picks.reduce((s, p) => s + (ok(p?.weight) && ok(p?.expCagr) ? p.weight : 0), 0);
        return (
          <details key={r.date || i} style={{ borderBottom: "1px solid var(--line)", padding: "6px 0" }}>
            <summary style={{ cursor: "pointer", display: "flex", flexWrap: "wrap", gap: "4px 12px", alignItems: "baseline", fontSize: 12 }}>
              <b style={{ fontFamily: "var(--mono)" }}><span style={{ color: "var(--dim)" }}>▸ </span>{fmtDate(r.date)}</b>
              {r.partial && <span className="tag" style={{ color: "var(--warn)" }}>incompleto</span>}
              <span className="neu">Portafolio <b className={rc(r.top5)} style={{ fontFamily: "var(--mono)" }}>{pct(r.top5)}</b></span>
              <span className="neu">SPY <b className={rc(r.spy)} style={{ fontFamily: "var(--mono)" }}>{pct(r.spy)}</b></span>
              <span className="small" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%" }}>{picks.map((p) => p?.ticker).filter(Boolean).join(" · ")}</span>
            </summary>
            {picks.length ? (
              <div style={{ overflowX: "auto", marginTop: 6 }}>
                <table className="simple">
                  <thead><tr><th>Empresa</th><th>Peso</th><th>CAGR esp. (entonces)</th><th>Retorno real {r.partial ? "(hasta hoy)" : `a ${hLabel(h)}`}</th></tr></thead>
                  <tbody>
                    {picks.map((p, j) => (
                      <tr key={j}>
                        <td style={{ fontFamily: "var(--sans)" }}>
                          <b style={{ fontFamily: "var(--mono)", fontSize: 12 }}>{p?.ticker || "—"}</b>
                          <span style={{ color: "var(--muted)", fontSize: 11, marginLeft: 6 }}>{p?.name || ""}</span>
                        </td>
                        <td>{ok(p?.weight) ? `${(p.weight * 100).toFixed(1)}%` : "—"}</td>
                        <td className={cagrClass(p?.expCagr)}>{pct(p?.expCagr)}</td>
                        <td className={rc(p?.ret)}>{ok(p?.ret) ? pct(p.ret) : <span className="small">sin precio</span>}</td>
                      </tr>
                    ))}
                    <tr className="tot">
                      <td style={{ fontFamily: "var(--sans)" }}>Portafolio</td>
                      <td></td>
                      <td className={cagrClass(wSum > 0 ? wExp / wSum : NaN)}>{wSum > 0 ? pct(wExp / wSum) : "—"}</td>
                      <td className={rc(r.top5)}>{pct(r.top5)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            ) : <div className="small" style={{ marginTop: 6 }}>Sin portafolio registrado en esta fecha.</div>}
          </details>
        );
      })}
    </div>
  );
}
