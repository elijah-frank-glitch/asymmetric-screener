// Guarda un snapshot comprimido del universo para usar como respaldo en el build
import { readFileSync, writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
writeFileSync("data/universe.json.gz", gzipSync(readFileSync("data/universe.json"), { level: 9 }));
console.log("snapshot ok");
