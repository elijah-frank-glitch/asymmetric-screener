import { loadData } from "./load-node.mjs";
import { runModel, passesFilters, DEFAULT_FILTERS } from "../src/engine.js";
import { PRESETS, buildWeights } from "../src/model.js";
const { D, meta } = loadData();
const preset = process.argv[2] || "adn", H = Number(process.argv[3] || 5);
const t = Date.now();
const R = runModel(D, { weights: PRESETS[preset].weights, params: PRESETS[preset].params, horizon: H });
console.log("ms", Date.now() - t);
const idx = []; for (let i = 0; i < D.n; i++) if (passesFilters(D, i, DEFAULT_FILTERS) && !Number.isNaN(R.cagr[i])) idx.push(i);
idx.sort((a, b) => R.cagr[b] - R.cagr[a]);
console.log("pasan filtros:", idx.length);
const f = (x, d = 1) => (x * 100).toFixed(d) + "%";
for (const i of idx.slice(0, 30)) console.log(D.sym[i].padEnd(18), D.name[i].slice(0, 28).padEnd(28), D.industries[D.industry[i]].slice(0,22).padEnd(22), "mcap", (D.cols.mcap[i]/1e9).toFixed(2)+"B", "CAGR", f(R.cagr[i]), "E", R.E[i].toFixed(1)+"x", "bull/base/bear", R.bull[i].toFixed(1), R.base[i].toFixed(1), R.bear[i].toFixed(2), "score", R.score[i].toFixed(2), "kelly", R.kelly[i].toFixed(2), "kRaw", R.kellyRaw[i].toFixed(2), "conf", R.conf[i].toFixed(2), "g", D.cols.rev_g[i], "nm", D.cols.nm[i]);
const med = idx.map(i=>R.cagr[i]).sort((a,b)=>a-b); console.log("mediana CAGR", f(med[Math.floor(med.length/2)]), "p90", f(med[Math.floor(med.length*0.9)]));
for (const tk of ["NVDA","AAPL","MU","MNST","CELH","SMCI","KO","TSLA","PLTR"]) { const i = D.ticker.findIndex((x,j)=>x===tk && ["NASDAQ","NYSE"].includes(D.sym[j].split(":")[0])); if(i>=0) console.log(tk, "CAGR", f(R.cagr[i]), "E", R.E[i]?.toFixed(2), "score", R.score[i].toFixed(2), "rank", idx.indexOf(i)); }
import { evaluate, kellyPortfolio, portfolioDistribution } from "../src/model.js";
import { companyInputs } from "../src/engine.js";
const picks = idx.slice(0, 5).map(i => ({ i, ...evaluate(companyInputs(D, i, R.quality[i]), H, PRESETS[preset].params, R.score[i]) , score: R.score[i]}));
for (const m of ["kelly","halfkelly","equal"]) { const w = buildWeights(picks, m, 0.4); console.log(m, w.map(x=>(x*100).toFixed(1)).join(" "), JSON.stringify(portfolioDistribution(picks, w), (k,v)=>typeof v==="number"?+v.toFixed(2):v)); }
