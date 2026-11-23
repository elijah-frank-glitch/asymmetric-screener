// Descarga cortes "point-in-time" de fundamentales de TODAS las empresas que reportan a la SEC (XBRL frames API),
// por año calendario, más el mapa CIK → ticker. Política de acceso de la SEC: identificarse con un User-Agent
// que incluya un contacto. Se lee de la variable de entorno SEC_UA (no se guarda en el repo).
//   $env:SEC_UA = "NombreApp tu@email.com"; node scripts/backtest/fetch-sec.mjs
// Salida: data/backtest/raw/<concepto>_<periodo>.json  → { "<cik>": [val, "end", "name"] }
//         data/backtest/raw/tickers.json               → company_tickers_exchange.json tal cual
import { mkdirSync, writeFileSync, existsSync } from "node:fs";

const UA = process.env.SEC_UA;
if (!UA || !/@/.test(UA)) {
  console.error("Falta la variable SEC_UA con un contacto (la SEC lo exige). Ej.: $env:SEC_UA = \"App tu@email.com\"");
  process.exit(1);
}
const OUT = new URL("../../data/backtest/raw/", import.meta.url);
mkdirSync(OUT, { recursive: true });
const YEARS = Array.from({ length: 2025 - 2007 + 1 }, (_, k) => 2007 + k);

// [taxonomía, concepto, unidad, tipo] tipo: D = duración anual (CYyyyy), I = instante fin de año (CYyyyyQ4I)
const CONCEPTS = [
  ["us-gaap", "Revenues", "USD", "D"],
  ["us-gaap", "RevenueFromContractWithCustomerExcludingAssessedTax", "USD", "D"],
  ["us-gaap", "SalesRevenueNet", "USD", "D"],
  ["us-gaap", "GrossProfit", "USD", "D"],
  ["us-gaap", "CostOfRevenue", "USD", "D"],
  ["us-gaap", "CostOfGoodsAndServicesSold", "USD", "D"],
  ["us-gaap", "OperatingIncomeLoss", "USD", "D"],
  ["us-gaap", "NetIncomeLoss", "USD", "D"],
  ["us-gaap", "NetCashProvidedByUsedInOperatingActivities", "USD", "D"],
  ["us-gaap", "PaymentsToAcquirePropertyPlantAndEquipment", "USD", "D"],
  ["us-gaap", "ResearchAndDevelopmentExpense", "USD", "D"],
  ["us-gaap", "DepreciationDepletionAndAmortization", "USD", "D"],
  ["us-gaap", "DepreciationAndAmortization", "USD", "D"],
  ["us-gaap", "InterestExpense", "USD", "D"],
  ["us-gaap", "PaymentsOfDividends", "USD", "D"],
  ["us-gaap", "PaymentsOfDividendsCommonStock", "USD", "D"],
  ["us-gaap", "PaymentsForRepurchaseOfCommonStock", "USD", "D"],
  ["us-gaap", "WeightedAverageNumberOfDilutedSharesOutstanding", "shares", "D"],
  ["us-gaap", "Assets", "USD", "I"],
  ["us-gaap", "Liabilities", "USD", "I"],
  ["us-gaap", "StockholdersEquity", "USD", "I"],
  ["us-gaap", "AssetsCurrent", "USD", "I"],
  ["us-gaap", "LiabilitiesCurrent", "USD", "I"],
  ["us-gaap", "CashAndCashEquivalentsAtCarryingValue", "USD", "I"],
  ["us-gaap", "LongTermDebt", "USD", "I"],
  ["us-gaap", "LongTermDebtNoncurrent", "USD", "I"],
  ["us-gaap", "DebtCurrent", "USD", "I"],
  ["us-gaap", "RetainedEarningsAccumulatedDeficit", "USD", "I"],
  ["us-gaap", "Goodwill", "USD", "I"],
  ["us-gaap", "InventoryNet", "USD", "I"],
  ["dei", "EntityCommonStockSharesOutstanding", "shares", "I"],
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function get(url) {
  for (let a = 1; a <= 5; a++) {
    const r = await fetch(url, { headers: { "User-Agent": UA, "Accept-Encoding": "gzip, deflate" } });
    if (r.status === 404) return null;
    if (r.ok) return r.json();
    await sleep(1500 * a);
  }
  throw new Error("fallo " + url);
}

// Mapa CIK → ticker (empresas que cotizan hoy)
const tick = await get("https://www.sec.gov/files/company_tickers_exchange.json");
writeFileSync(new URL("tickers.json", OUT), JSON.stringify(tick));
console.log("tickers:", tick?.data?.length);

let n = 0;
for (const [tax, c, unit, kind] of CONCEPTS) {
  for (const y of YEARS) {
    const per = kind === "D" ? `CY${y}` : `CY${y}Q4I`;
    const file = new URL(`${c}_${per}.json`, OUT);
    if (existsSync(file)) continue;
    const j = await get(`https://data.sec.gov/api/xbrl/frames/${tax}/${c}/${unit}/${per}.json`);
    const m = {};
    for (const d of j?.data || []) m[d.cik] = [d.val, d.end, d.entityName];
    writeFileSync(file, JSON.stringify(m));
    n++;
    if (n % 25 === 0) console.log(`${n} cortes descargados (${c} ${per})`);
    await sleep(150); // < 10 solicitudes/segundo
  }
}
console.log("OK fetch-sec:", n, "cortes nuevos");
