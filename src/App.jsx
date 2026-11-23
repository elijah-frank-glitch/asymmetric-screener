import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { loadData, ensureMetrics } from "./data.js";
import { runModel, passesFilters, DEFAULT_FILTERS, companyInputs } from "./engine.js";
import { PRESETS, evaluate, buildWeights, portfolioDistribution } from "./model.js";
import Sidebar from "./components/Sidebar.jsx";
import Screener from "./components/Screener.jsx";
import Detail from "./components/Detail.jsx";
import Portfolio from "./components/Portfolio.jsx";
import Metrics from "./components/Metrics.jsx";
import Method from "./components/Method.jsx";
import Track from "./components/Track.jsx";
import Backtest from "./components/Backtest.jsx";

const STORE = "asymmetric-settings-v3";
const defaultSettings = () => ({
  preset: "adn",
  weights: { ...PRESETS.adn.weights },
  params: { ...PRESETS.adn.params },
  horizon: 5,
  nPicks: 5,
  weighting: "kelly",
  maxW: 0.4,
  rankBy: "elog",
  capital: 10000,
  maxPerIndustry: 0,
  excluded: [],
  columns: ["rev_g", "gm", "fcf_yield"],
  filters: { ...DEFAULT_FILTERS },
});
function loadSettings() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE));
    if (s && s.weights) return { ...defaultSettings(), ...s, filters: { ...DEFAULT_FILTERS, ...s.filters } };
  } catch {}
  return defaultSettings();
}

export default function App() {
  const [D, setD] = useState(null);
  const [meta, setMeta] = useState(null);
  const [progress, setProgress] = useState(0);
  const [err, setErr] = useState(null);
  const [settings, setSettings] = useState(loadSettings);
  const [R, setR] = useState(null);
  const [busy, setBusy] = useState(false);
  const [dataVer, setDataVer] = useState(0);
  const [tab, setTab] = useState("screener");
  const [sel, setSel] = useState(null);
  const [sort, setSort] = useState({ key: "rank", dir: -1 });
  const [sideOpen, setSideOpen] = useState(false);

  useEffect(() => {
    loadData(setProgress).then(({ D, meta }) => { setD(D); setMeta(meta); }).catch((e) => setErr(String(e)));
  }, []);
  useEffect(() => { try { localStorage.setItem(STORE, JSON.stringify(settings)); } catch {} }, [settings]);

  const update = useCallback((patch) => setSettings((s) => ({ ...s, ...(typeof patch === "function" ? patch(s) : patch) })), []);

  // métricas que deben estar cargadas
  const neededMetrics = useMemo(() => {
    const ids = new Set([...Object.keys(settings.weights).filter((k) => settings.weights[k] > 0), ...settings.columns, ...settings.filters.ranges.map((r) => r.id)]);
    return [...ids];
  }, [settings.weights, settings.columns, settings.filters.ranges]);
  useEffect(() => {
    if (!D) return;
    ensureMetrics(D, neededMetrics).then((changed) => { if (changed) setDataVer((v) => v + 1); });
  }, [D, neededMetrics]);

  // correr el modelo (diferido para no congelar la UI mientras se arrastra un control)
  const timer = useRef(null);
  useEffect(() => {
    if (!D) return;
    setBusy(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const t0 = performance.now();
      const res = runModel(D, { weights: settings.weights, params: settings.params, horizon: settings.horizon });
      res.ms = performance.now() - t0;
      setR(res);
      setBusy(false);
    }, 120);
  }, [D, dataVer, settings.weights, settings.params, settings.horizon]);

  // universo filtrado y ordenado por la métrica de ranking
  const rankKey = settings.rankBy;
  const rankVal = useCallback((i) => {
    if (!R) return NaN;
    if (rankKey === "score") return R.score[i];
    if (rankKey === "elog") return R.elog[i];
    if (rankKey === "kelly") return Number.isNaN(R.cagr[i]) ? NaN : R.kellyRaw[i] * (1 + R.cagr[i]);
    return R.cagr[i];
  }, [R, rankKey]);

  const ranked = useMemo(() => {
    if (!D || !R) return [];
    const F = settings.filters;
    const idx = [];
    for (let i = 0; i < D.n; i++) if (passesFilters(D, i, F)) idx.push(i);
    idx.sort((a, b) => {
      const va = rankVal(a), vb = rankVal(b);
      const na = Number.isNaN(va), nb = Number.isNaN(vb);
      if (na !== nb) return na ? 1 : -1;
      return vb - va;
    });
    return idx;
  }, [D, R, settings.filters, rankVal, dataVer]);

  const rankPos = useMemo(() => { const m = new Int32Array(D ? D.n : 0).fill(-1); ranked.forEach((i, k) => (m[i] = k)); return m; }, [ranked, D]);

  // portafolio
  const portfolio = useMemo(() => {
    if (!D || !R || !ranked.length) return null;
    const excl = new Set(settings.excluded);
    const perInd = {};
    const picks = [];
    for (const i of ranked) {
      if (picks.length >= settings.nPicks) break;
      if (Number.isNaN(R.cagr[i]) || excl.has(D.sym[i])) continue;
      if (settings.maxPerIndustry > 0) {
        const k = D.industry[i];
        if ((perInd[k] || 0) >= settings.maxPerIndustry) continue;
        perInd[k] = (perInd[k] || 0) + 1;
      }
      const ev = evaluate(companyInputs(D, i, R.quality[i]), settings.horizon, settings.params, R.score[i], true);
      if (ev) picks.push({ i, ind: D.industry[i], sec: D.sector[i], ...ev, score: R.score[i] });
    }
    const w = buildWeights(picks, settings.weighting, settings.maxW);
    const dist = portfolioDistribution(picks, w);
    const steps = picks[0]?.paths.exp.length || 0;
    const path = Array.from({ length: steps }, (_, t) => picks.reduce((s, p, j) => s + w[j] * p.paths.exp[t], 0));
    const pathBull = Array.from({ length: steps }, (_, t) => picks.reduce((s, p, j) => s + w[j] * p.paths.bull[t], 0));
    const pathBase = Array.from({ length: steps }, (_, t) => picks.reduce((s, p, j) => s + w[j] * p.paths.base[t], 0));
    const pathBear = Array.from({ length: steps }, (_, t) => picks.reduce((s, p, j) => s + w[j] * p.paths.bear[t], 0));
    return { picks, w, dist, path, pathBull, pathBase, pathBear };
  }, [D, R, ranked, settings.nPicks, settings.weighting, settings.maxW, settings.excluded, settings.maxPerIndustry, settings.horizon, settings.params]);
  const pickSet = useMemo(() => new Set(portfolio?.picks.map((p) => p.i) || []), [portfolio]);

  if (err) return <div className="loading"><div>Error cargando datos: {err}</div></div>;
  if (!D || !meta) {
    return (
      <div className="loading">
        <div>
          <Logo />
          <h2 style={{ color: "var(--text)", margin: "10px 0 4px" }}>Asymmetric</h2>
          <div>Cargando {meta?.n?.toLocaleString("es") || "≈49,000"} acciones de todo el mundo…</div>
          <div className="progress" style={{ margin: "12px auto" }}><i style={{ width: `${Math.round(progress * 100)}%` }} /></div>
          <div className="small">{Math.round(progress * 100)}%</div>
        </div>
      </div>
    );
  }

  const fetched = new Date(meta.fetchedAt);
  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          <Logo />
          <div>
            <h1>Asymmetric</h1>
            <small>Screener global de multibaggers</small>
          </div>
        </div>
        <nav className="tabs">
          {[["screener", "Screener"], ["portfolio", `Portafolio (${settings.nPicks})`], ["track", "Track record"], ["backtest", "Backtest"],["metrics", "Métricas y modelo"], ["method", "Metodología"]].map(([k, l]) => (
            <button key={k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{l}</button>
          ))}
        </nav>
        <button className="btn small mobile-toggle" onClick={() => setSideOpen((o) => !o)}>⚙ Ajustes</button>
        <div className="spacer" />
        <div className="stat">
          <div><b>{D.n.toLocaleString("es")}</b> acciones · <b>{meta.countries.length}</b> países · <b>{meta.exchanges.length}</b> bolsas</div>
          <div>Datos al {fetched.toLocaleDateString("es", { day: "numeric", month: "short", year: "numeric" })} · {busy ? <span className="calc">calculando…</span> : <>modelo en {Math.round(R?.ms || 0)} ms</>}</div>
        </div>
        <a className="btn small" href="/Universo_Global_Multibagger.xlsx" download>⬇ Excel</a>
      </header>

      {tab === "screener" && (
        <div className="layout">
          <aside className={`side ${sideOpen ? "open" : ""}`}>
            <Sidebar D={D} meta={meta} settings={settings} update={update} />
          </aside>
          <main className="main">
            <Screener D={D} meta={meta} R={R} ranked={ranked} settings={settings} update={update} sel={sel} setSel={setSel}
              sort={sort} setSort={setSort} rankVal={rankVal} pickSet={pickSet} busy={busy} dataVer={dataVer} />
          </main>
        </div>
      )}
      {tab === "portfolio" && (
        <div className="layout">
          <aside className={`side ${sideOpen ? "open" : ""}`}>
            <Sidebar D={D} meta={meta} settings={settings} update={update} />
          </aside>
          <main className="main">
            <Portfolio D={D} meta={meta} R={R} portfolio={portfolio} settings={settings} update={update} setSel={setSel} rankPos={rankPos} />
          </main>
        </div>
      )}
      {tab === "track" && <main className="main"><Track /></main>}
      {tab === "backtest" && <main className="main"><Backtest /></main>}
      {tab === "metrics" && <main className="main"><Metrics D={D} meta={meta} settings={settings} update={update} /></main>}
      {tab === "method" && <main className="main"><Method meta={meta} settings={settings} /></main>}

      {sel != null && R && (
        <>
          <div className="overlay" onClick={() => setSel(null)} />
          <Detail D={D} meta={meta} R={R} i={sel} settings={settings} rank={rankPos[sel]} total={ranked.length} onClose={() => setSel(null)}
            inPortfolio={pickSet.has(sel)} update={update} />
        </>
      )}
    </div>
  );
}

export function Logo() {
  return (
    <svg className="logo" viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="7" fill="#0f1b33" stroke="#1e2a44" />
      <path d="M6 24 L13 15 L18 19 L26 7" stroke="#34d399" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="26" cy="7" r="2.6" fill="#22d3ee" />
    </svg>
  );
}
