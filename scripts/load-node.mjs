// Carga los datos de public/data en Node con la misma forma que usa el navegador.
import { readFileSync } from "node:fs";
export function loadData() {
  const root = new URL("../public/data/", import.meta.url);
  const meta = JSON.parse(readFileSync(new URL("meta.json", root)));
  const core = JSON.parse(readFileSync(new URL("core.json", root)));
  const derived = JSON.parse(readFileSync(new URL("../../data/derived.json", root)));
  const dirs = Object.fromEntries(meta.catalog.map((m) => [m.id, m.better || 1]));
  const D = {
    n: meta.n, cols: derived.cols, dirs, ticker: core.ticker, name: core.name, sym: core.sym,
    common: core.common, exchange: core.exchange, country: core.country, sector: core.sector, industry: core.industry,
    countries: meta.countries, sectors: meta.sectors, industries: meta.industries, indNM: meta.indNM,
  };
  return { D, meta, core };
}
