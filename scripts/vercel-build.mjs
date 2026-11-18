// Build completo en Vercel: datos frescos → archivos de la app → Excel → bundle.
// Si TradingView no responde, usa el snapshot comprimido del repo (data/universe.json.gz).
import { execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
const run = (c) => execSync(c, { stdio: "inherit" });
try {
  run("node scripts/fetch-universe.mjs");
} catch (e) {
  console.warn("⚠ No se pudo descargar el universo; usando snapshot del repo.");
  if (!existsSync("data/universe.json.gz")) throw e;
  writeFileSync("data/universe.json", gunzipSync(readFileSync("data/universe.json.gz")));
}
run("node scripts/build-data.mjs");
run("node scripts/build-excel.mjs");
run("npx vite build");
