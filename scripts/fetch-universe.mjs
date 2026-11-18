// Descarga TODAS las acciones con listado primario del mundo desde el escáner público de TradingView.
// Salida: data/universe.json  ({ fetchedAt, fields, rows: [[symbol, ...values]] })
import { writeFileSync, mkdirSync } from "node:fs";
import { METRICS, ID_FIELDS, RAW_EXTRA } from "./metrics.mjs";

const API = "https://scanner.tradingview.com/global/scan";
const tvFields = [...new Set([...ID_FIELDS, ...METRICS.filter((m) => m.tv).map((m) => m.tv), ...RAW_EXTRA])];
const PAGE = 5000;

async function page(from) {
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      const r = await fetch(API, {
        method: "POST",
        headers: { "Content-Type": "application/json", "User-Agent": "Mozilla/5.0" },
        body: JSON.stringify({
          filter: [
            { left: "type", operation: "equal", right: "stock" },
            { left: "is_primary", operation: "equal", right: true },
          ],
          columns: tvFields,
          range: [from, from + PAGE],
          sort: { sortBy: "market_cap_basic", sortOrder: "desc", nullsFirst: false },
        }),
      });
      if (!r.ok) throw new Error("HTTP " + r.status);
      return await r.json();
    } catch (e) {
      console.warn(`page ${from} attempt ${attempt} failed: ${e.message}`);
      await new Promise((res) => setTimeout(res, 2000 * attempt));
    }
  }
  throw new Error("page failed " + from);
}

const first = await page(0);
const total = first.totalCount;
let rows = first.data.map((d) => [d.s, ...d.d]);
for (let from = PAGE; from < total; from += PAGE) {
  const p = await page(from);
  rows.push(...p.data.map((d) => [d.s, ...d.d]));
  console.log(`${rows.length}/${total}`);
}
// dedupe por símbolo
const seen = new Set();
rows = rows.filter((r) => (seen.has(r[0]) ? false : (seen.add(r[0]), true)));
mkdirSync(new URL("../data/", import.meta.url), { recursive: true });
writeFileSync(
  new URL("../data/universe.json", import.meta.url),
  JSON.stringify({ fetchedAt: new Date().toISOString(), fields: ["symbol", ...tvFields], rows })
);
console.log(`OK: ${rows.length} acciones (totalCount ${total})`);
