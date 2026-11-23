// Carga los datos de public/data en Node con la misma forma que usa el navegador.
import { readFileSync, existsSync } from "node:fs";
import { decodeCore } from "../src/corebin.js";
export function loadData() {
  const root = new URL("../public/data/", import.meta.url);
  const meta = JSON.parse(readFileSync(new URL("meta.json", root)));
  let core;
  if (meta.coreFile) {
    // núcleo binario (src/corebin.js) + logos aparte; misma forma que el antiguo core.json
    core = decodeCore(readFileSync(new URL(meta.coreFile, root)));
    const logoUrl = new URL("logo.json", root);
    core.logo = existsSync(logoUrl) ? JSON.parse(readFileSync(logoUrl)) : core.sym.map(() => null);
  } else core = JSON.parse(readFileSync(new URL("core.json", root)));
  const derived = JSON.parse(readFileSync(new URL("../../data/derived.json", root)));
  const dirs = Object.fromEntries(meta.catalog.map((m) => [m.id, m.better || 1]));
  const D = {
    n: meta.n, cols: derived.cols, dirs, ticker: core.ticker, name: core.name, sym: core.sym,
    common: core.common, exchange: core.exchange, country: core.country, sector: core.sector, industry: core.industry,
    countries: meta.countries, sectors: meta.sectors, industries: meta.industries, exchanges: meta.exchanges, indNM: meta.indNM,
  };
  return { D, meta, core };
}
