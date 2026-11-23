// Descarga de /backtest.json compartida por la pestaña Backtest y la calibración del retorno esperado.
// caché a nivel de módulo: se descarga una sola vez aunque se cambie de pestaña
let cache = null;
export function loadBacktest() {
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
