import React, { useMemo, useState } from "react";
import { PRESETS } from "../model.js";
import { DEFAULT_FILTERS } from "../engine.js";

const MCAP_MIN = [[0, "Todas"], [10e6, "≥ $10M"], [50e6, "≥ $50M"], [100e6, "≥ $100M"], [300e6, "≥ $300M"], [1e9, "≥ $1B"], [10e9, "≥ $10B"]];
const MCAP_MAX = [[0, "Sin tope"], [300e6, "≤ $300M (micro)"], [2e9, "≤ $2B (small)"], [10e9, "≤ $10B (mid)"], [50e9, "≤ $50B"], [200e9, "≤ $200B"]];
const LIQ = [[0, "Cualquiera"], [10e3, "≥ $10K/día"], [100e3, "≥ $100K/día"], [1e6, "≥ $1M/día"], [10e6, "≥ $10M/día"]];

export default function Sidebar({ D, meta, settings, update }) {
  const F = settings.filters;
  const setF = (patch) => update((s) => ({ filters: { ...s.filters, ...patch } }));
  const [cq, setCq] = useState("");

  const countryCounts = useMemo(() => {
    const c = new Array(meta.countries.length).fill(0);
    for (let i = 0; i < D.n; i++) c[D.country[i]]++;
    return meta.countries.map((n, k) => [n, c[k]]).sort((a, b) => b[1] - a[1]);
  }, [D, meta]);

  const choosePreset = (k) => {
    if (k === "custom") update({ preset: "custom" });
    else update({ preset: k, weights: { ...PRESETS[k].weights }, params: { ...PRESETS[k].params } });
  };
  const toggle = (arr, v) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  return (
    <>
      <div className="sec">
        <h3>Horizonte de inversión</h3>
        <div className="horizon-big"><b>{settings.horizon}</b><span>{settings.horizon === 1 ? "año" : "años"}</span></div>
        <input type="range" min="0.5" max="20" step="0.5" value={settings.horizon} onChange={(e) => update({ horizon: Number(e.target.value) })} />
        <div className="horizon-presets">
          {[1, 2, 3, 5, 7, 10, 15, 20].map((h) => (
            <button key={h} className={`chip ${settings.horizon === h ? "on" : ""}`} onClick={() => update({ horizon: h })}>{h}a</button>
          ))}
        </div>
        <div className="hint small" style={{ marginTop: 6 }}>Invertir hoy y no tocar el portafolio hasta el final del plazo.</div>
      </div>

      <div className="sec">
        <h3>Empresas en el portafolio</h3>
        <div className="field">
          <label>Número de empresas <b>{settings.nPicks}</b></label>
          <input type="range" min="1" max="30" step="1" value={settings.nPicks} onChange={(e) => update({ nPicks: Number(e.target.value) })} />
        </div>
      </div>

      <div className="sec">
        <h3>Teoría / modelo de valuación</h3>
        {Object.entries(PRESETS).map(([k, p]) => (
          <button key={k} className={`preset ${settings.preset === k ? "on" : ""}`} onClick={() => choosePreset(k)}>
            <b>{p.name}</b>
            {settings.preset === k && <span>{p.desc}</span>}
          </button>
        ))}
        <div className="field" style={{ marginTop: 8 }}>
          <label>Ordenar ranking por</label>
          <select value={settings.rankBy} onChange={(e) => update({ rankBy: e.target.value })} style={{ width: "100%" }}>
            <option value="cagr">Retorno esperado anual (CAGR)</option>
            <option value="kelly">Kelly × retorno (asimetría)</option>
            <option value="score">Score ADN Multibagger</option>
          </select>
        </div>
      </div>

      <div className="sec">
        <h3>Filtros del universo</h3>
        <div className="row2">
          <div className="field">
            <label>Cap. mínima</label>
            <select value={F.mcapMin || 0} onChange={(e) => setF({ mcapMin: Number(e.target.value) || null })}>
              {MCAP_MIN.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Cap. máxima</label>
            <select value={F.mcapMax || 0} onChange={(e) => setF({ mcapMax: Number(e.target.value) || null })}>
              {MCAP_MAX.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
        </div>
        <div className="field">
          <label>Liquidez diaria mínima</label>
          <select value={F.liqMin || 0} onChange={(e) => setF({ liqMin: Number(e.target.value) || null })} style={{ width: "100%" }}>
            {LIQ.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Confianza mínima en los datos <b>{Math.round((F.confMin || 0) * 100)}%</b></label>
          <input type="range" min="0" max="1" step="0.05" value={F.confMin || 0} onChange={(e) => setF({ confMin: Number(e.target.value) })} />
          <div className="hint">Descarta empresas con datos incompletos, ganancias extraordinarias, inflación alta o contabilidad difícil de proyectar.</div>
        </div>
        <div className="field">
          <label><span><input type="checkbox" checked={!!F.requireRevenue} onChange={(e) => setF({ requireRevenue: e.target.checked })} /> Solo empresas con ingresos</span></label>
          <label><span><input type="checkbox" checked={!!F.commonOnly} onChange={(e) => setF({ commonOnly: e.target.checked })} /> Solo acciones comunes (sin preferentes)</span></label>
          <label><span><input type="checkbox" checked={F.excludeIndustries?.includes("Investment Trusts/Mutual Funds")} onChange={(e) => setF({ excludeIndustries: e.target.checked ? ["Investment Trusts/Mutual Funds"] : [] })} /> Excluir fondos y vehículos de inversión</span></label>
        </div>
        <div className="field">
          <label>Sectores {F.sectors.length ? <b>{F.sectors.length}</b> : <span className="small">todos</span>}</label>
          <div className="chips">
            {meta.sectors.map((s, k) => s !== "—" && (
              <button key={s} className={`chip ${F.sectors.includes(s) ? "on" : ""}`} onClick={() => setF({ sectors: toggle(F.sectors, s) })}>{meta.sectorEs[k]}</button>
            ))}
          </div>
        </div>
        <div className="field">
          <label>Países {F.countries.length ? <b>{F.countries.length}</b> : <span className="small">todos ({meta.countries.length})</span>}</label>
          <input placeholder="Buscar país…" value={cq} onChange={(e) => setCq(e.target.value)} style={{ width: "100%", marginBottom: 6 }} />
          <div className="chips" style={{ maxHeight: 150, overflowY: "auto" }}>
            {countryCounts.filter(([n]) => n !== "—" && (!cq || n.toLowerCase().includes(cq.toLowerCase()))).slice(0, cq ? 60 : 24).map(([n, c]) => (
              <button key={n} className={`chip ${F.countries.includes(n) ? "on" : ""}`} onClick={() => setF({ countries: toggle(F.countries, n) })}>{n} <span className="small">{c}</span></button>
            ))}
          </div>
        </div>
        <button className="btn small ghost" onClick={() => update({ filters: { ...DEFAULT_FILTERS } })}>Restablecer filtros</button>
      </div>
    </>
  );
}
