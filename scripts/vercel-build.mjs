// Build completo en Vercel: datos frescos → archivos de la app → registro de predicciones → Excel → bundle.
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
// Registro de predicciones: evalúa snapshots contra precios actuales (nunca rompe el build)
try {
  run("node scripts/build-track.mjs");
} catch {
  console.warn("⚠ build-track falló; la app seguirá sin registro de predicciones.");
}
run("node scripts/build-excel.mjs");
run("npx vite build");
