import React, { useEffect, useState } from "react";
import { PRESETS, PARAM_INFO } from "../model.js";

export default function Metrics({ D, meta, settings, update }) {
  const [q, setQ] = useState("");
  const W = settings.weights;
  const totalW = Object.values(W).reduce((s, x) => s + (x > 0 ? x : 0), 0) || 1;
  const used = Object.keys(W).filter((k) => W[k] > 0).length;

  const setW = (id, v) => update((s) => ({ preset: "custom", weights: { ...s.weights, [id]: Math.max(0, v) } }));
  const toggleModel = (id, on) => setW(id, on ? (W[id] > 0 ? W[id] : 5) : 0);
  const toggleCol = (id, on) => update((s) => ({ columns: on ? [...new Set([...s.columns, id])] : s.columns.filter((x) => x !== id) }));
  const setP = (k, v) => update((s) => ({ preset: s.preset === "custom" ? "custom" : s.preset, params: { ...s.params, [k]: v } }));

  const list = meta.catalog.filter((m) => !q || (m.label + " " + m.desc).toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="page">
      <h2>Métricas y modelo</h2>
      <p className="lead">
        {meta.catalog.length} métricas fundamentales y de mercado para {D.n.toLocaleString("es")} acciones. Marca <b>Columna</b> para verla en el screener y <b>En el modelo</b> para que cuente en el
        Score ADN Multibagger (que determina la probabilidad del escenario alcista). El peso es relativo: ahora mismo usas <b>{used}</b> métricas. Cambiar cualquier peso cambia la teoría a <i>Personalizado</i>.
      </p>

      <div className="box" style={{ maxWidth: 1100 }}>
        <h4>Supuestos de la proyección · teoría actual: {PRESETS[settings.preset]?.name}</h4>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "4px 18px" }}>
          {Object.entries(PARAM_INFO).map(([k, p]) => (
            <div className="field" key={k}>
              <label>{p.label} <b>{settings.params[k] ?? "—"}</b></label>
              <input type="range" min={p.min} max={p.max} step={p.step} value={settings.params[k] ?? p.min} onChange={(e) => setP(k, Number(e.target.value))} />
              <div className="hint">{p.desc}</div>
            </div>
          ))}
          <div className="field">
            <label><span><input type="checkbox" checked={settings.params.inflAdj !== false} onChange={(e) => setP("inflAdj", e.target.checked)} /> Ajuste por inflación local</span></label>
            <div className="hint">Deflacta el crecimiento nominal de países con inflación alta (Turquía, Argentina, Egipto, Nigeria…) para compararlo con empresas en USD.</div>
          </div>
        </div>
        <button className="btn small" onClick={() => update({ weights: { ...PRESETS[settings.preset === "custom" ? "adn" : settings.preset].weights }, params: { ...PRESETS[settings.preset === "custom" ? "adn" : settings.preset].params }, preset: settings.preset === "custom" ? "adn" : settings.preset })}>
          Restablecer a la teoría {settings.preset === "custom" ? "ADN (default)" : "seleccionada"}
        </button>
      </div>

      <input placeholder="Buscar métrica…" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 300, margin: "6px 0 14px" }} />
      {meta.categories.map((c) => {
        const ms = list.filter((m) => m.cat === c);
        if (!ms.length) return null;
        return (
          <div className="catblock" key={c}>
            <h3>{c}</h3>
            <table className="mtable">
              <thead><tr><th style={{ width: "26%" }}>Métrica</th><th>Qué mide</th><th className="c" style={{ width: 70 }}>Columna</th><th className="c" style={{ width: 90 }}>En el modelo</th><th className="c" style={{ width: 90 }}>Peso</th><th className="c" style={{ width: 80 }}>Dirección</th></tr></thead>
              <tbody>
                {ms.map((m) => (
                  <tr key={m.id}>
                    <td><b>{m.label}</b><div className="small">{m.src}</div></td>
                    <td className="d">{m.desc}</td>
                    <td className="c"><input type="checkbox" checked={settings.columns.includes(m.id)} onChange={(e) => toggleCol(m.id, e.target.checked)} /></td>
                    <td className="c"><input type="checkbox" checked={W[m.id] > 0} onChange={(e) => toggleModel(m.id, e.target.checked)} /></td>
                    <td className="c">{W[m.id] > 0 ? <><WeightInput value={W[m.id]} onCommit={(v) => setW(m.id, v)} /><div className="small">{Math.round((W[m.id] / totalW) * 100)}%</div></> : <span className="small">—</span>}</td>
                    <td className="c small">{m.better > 0 ? "↑ mejor" : m.better < 0 ? "↓ mejor" : "↑ (neutral)"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}

// Campo de peso con borrador local: se puede borrar el número y escribir otro sin que la métrica salga del modelo.
// Solo se aplica un número > 0; si se deja vacío o en 0 al salir, vuelve al valor anterior (para quitarla, desmarca "En el modelo").
function WeightInput({ value, onCommit }) {
  const [draft, setDraft] = useState(String(value));
  const [editing, setEditing] = useState(false);
  useEffect(() => { if (!editing) setDraft(String(value)); }, [value, editing]);
  const commit = (txt) => { const v = Number(String(txt).replace(",", ".")); if (txt !== "" && Number.isFinite(v) && v > 0) onCommit(Math.min(100, v)); };
  return (
    <input type="number" min="0" max="100" step="0.5" value={draft}
      onFocus={() => setEditing(true)}
      onChange={(e) => { setDraft(e.target.value); commit(e.target.value); }}
      onBlur={() => { setEditing(false); setDraft(String(value)); }}
      onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} />
  );
}
