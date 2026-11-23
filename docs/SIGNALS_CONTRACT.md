# Señales cualitativas — contrato

## 1. Señales globales (Yahoo Finance, valor actual, sin historia)

`data/signals.json` (se commitea; se actualiza cada semana). Lo genera `scripts/fetch-signals.mjs`
con `quoteSummary?modules=majorHoldersBreakdown,defaultKeyStatistics,earningsTrend,assetProfile`
(mismo manejo de cookie/crumb y mapeo de bolsa→sufijo que `scripts/fetch-profiles.mjs`; reutilizar ese código).

```jsonc
{
  "fetchedAt": "...",
  "rows": {
    "NASDAQ:NVDA": [insiderPct, instPct, shortPct, founder, epsRev30, epsRev90, revUp30, revDown30, fetchedDay]
  }
}
```
- insiderPct, instPct, shortPct en % (4.04 = 4.04%). null si falta.
- founder: 1 si algún officer tiene "founder" / "fundador" / "co-founder" en el título, 0 si hay officers y ninguno, null si no hay officers.
- epsRev30 / epsRev90: cambio % del EPS estimado del año fiscal en curso ("0y") vs hace 30/90 días; null si no hay cobertura o el EPS de hace N días es ≤ 0 o falta.
- revUp30 / revDown30: número de analistas que subieron/bajaron en 30 días.
- fetchedDay: "YYYY-MM-DD".

## 2. Dilución histórica EE.UU. (SEC, validable en el backtest)

`data/dilution_us.json` (se commitea): `{ "builtAt": "...", "rows": { "NASDAQ:AAPL": [sharesG1, sharesG3] } }` con el cambio %
anual del número de acciones (1 año y CAGR 3 años) usando los frames de la SEC más recientes
(dei EntityCommonStockSharesOutstanding, fallback acciones diluidas promedio; corregir splits si el salto es un múltiplo
entero sospechoso ≥ 1.8x o ≤ 0.55x — la SEC no ajusta splits). Símbolo = "NASDAQ:" o "NYSE:" + ticker como en TradingView.

## 3. Métricas nuevas en el catálogo (`scripts/metrics.mjs`, calc: true, las llena `scripts/build-data.mjs`)

| id | label | cat | unit | better |
|---|---|---|---|---|
| insider_pct | Propiedad de insiders | Calidad y scores (nueva cat. "Gobierno y señales" mejor) | pct | 1 |
| inst_pct | Propiedad institucional | idem | pct | 0 |
| short_pct | Short interest (% del float) | idem | pct | -1 |
| founder | Dirigida por fundador (1/0) | idem | num | 1 |
| eps_rev30 | Revisión EPS 30 días | idem | pct | 1 |
| eps_rev90 | Revisión EPS 90 días | idem | pct | 1 |
| rev_breadth | Amplitud de revisiones (up−down)/(up+down) | idem | x | 1 |
| shares_g1 | Dilución 1 año (EE.UU.) | idem | pct | -1 |
| shares_g3 | Dilución anual 3 años (EE.UU.) | idem | pct | -1 |

Nueva categoría: "Gobierno y señales" (agregar a CATEGORIES). Estas métricas son lazy (no core) salvo que un preset las use.
