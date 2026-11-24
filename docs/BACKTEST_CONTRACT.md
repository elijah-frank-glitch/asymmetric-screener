# Backtest histórico (EE.UU., datos SEC) — contrato

Objetivo: responder con datos si el modelo habría funcionado. Para cada fecha de rebalanceo histórica se reconstruye
el universo de EE.UU. SOLO con información disponible en esa fecha, se corre el MISMO motor del modelo
(`src/engine.js` + `src/model.js`, sin cambiar su lógica) y se mide el retorno real posterior.

Fechas de rebalanceo: 30 de abril de cada año, 2011 → 2025. Fundamentales del año calendario anterior (frames CY{y-1}),
solo si `end` + 75 días ≤ fecha de rebalanceo (si no, el año previo). Así se evita el sesgo de mirar al futuro.
Retornos: precios ajustados por dividendos y splits (retorno total) para acciones y para SPY.
Horizontes medidos: 1, 3 y 5 años (o hasta la fecha actual si no han pasado; marcar `partial: true`).

## 1. Panel point-in-time (lo genera el agente de datos)

`data/backtest/panel.json` (puede ir comprimido como `panel.json.gz`, el lector debe aceptar ambos). NO se commitea si pesa > 40 MB.

```jsonc
{
  "version": 1,
  "builtAt": "...",
  "dates": ["2011-04-30", ..., "2025-04-30"],
  "companies": [ { "cik": 320193, "ticker": "AAPL", "name": "Apple Inc.", "exchange": "Nasdaq", "sic": null } ],
  // Para cada fecha, un corte con arrays alineados con "companies" (null si no hay dato / no cotizaba)
  "snapshots": {
    "2016-04-30": {
      "fyEnd": [ "2015-09-26", ... ],      // fin del año fiscal usado
      "cols": {                             // MISMOS ids y unidades que el catálogo de la app (scripts/metrics.mjs):
        "mcap": [...], "revenue": [...], "rev_g": [...], "rev_cagr5": [...], "gm": [...], "nm": [...],
        "fcf_m": [...], "ebitda_m": [...], "roic": [...], "roa": [...], "roe": [...], "rd_rev": [...],
        "net_cash": [...], "div_yield": [...], "buyback": [...], "liq_usd": [...], "ps": [...], "pe": [...],
        "pb": [...], "ev_ebitda": [...], "fcf_yield": [...], "bm": [...], "de": [...], "invest_gap": [...],
        "rule40": [...], "gp_assets": [...], "gp_g": [...], "payout": [...], "altman": [...], "runway": [...],
        "off_low": [...], "price": [...], "cr": [...]
      }                                     // porcentajes en % (21.5), dinero en USD, ratios en x — igual que la app
    }
  },
  // Retornos totales hacia adelante desde cada fecha (decimal, 0.25 = +25%); null si no hay precio
  "fwd": { "2016-04-30": { "1": [...], "3": [...], "5": [...] } },
  "partial": { "2016-04-30": { "1": false, "3": false, "5": false } },  // true si el horizonte no ha terminado (se mide hasta hoy)
  "spy": { "2016-04-30": { "1": 0.12, "3": 0.41, "5": 1.02 } },
  "notes": ["Sesgo de supervivencia: solo empresas que cotizan hoy (mapa CIK→ticker actual de la SEC)", "..."]
}
```
Métricas sin dato histórico (consenso de analistas, crecimiento trimestral, Piotroski) van como null: el modelo
las trata como percentil 35, igual para todas, así que no sesgan el ranking.

## 2. Resultado del backtest (lo genera el agente de motor) → se commitea, la app lo lee

`public/backtest.json` (archivo estático fuera de public/data, porque public/data se regenera en cada build;
generado por `scripts/backtest/run-backtest.mjs` desde el panel).

```jsonc
{
  "version": 1,
  "runAt": "...", "universe": "EE.UU. (SEC XBRL)", "dates": ["2011-04-30", ...],
  "filters": { "mcapMin": 100e6, "liqMin": 100e3, ... },
  "notes": [ "..." ],
  "theories": [ { "id": "adn", "name": "ADN Multibagger (default)" }, ... ],   // todas menos custom
  "horizons": [1, 3, 5],
  // Por teoría y horizonte, una fila por fecha
  "byDate": {
    "adn": {
      "5": [ { "date": "2016-04-30", "partial": false, "n": 1520,
               "top5": 1.85, "top20": 1.10, "top50": 0.92, "decile1": 0.95, "universe": 0.61, "spy": 1.02,
               "picks": [ { "ticker": "XYZ", "name": "...", "weight": 0.3, "expCagr": 0.41, "ret": 3.2 } ] } ]  // portafolio Kelly de 5
    }
  },
  // Resumen por teoría y horizonte (solo fechas con partial=false)
  "summary": {
    "adn": { "5": { "periods": 10, "top5Cagr": 0.18, "top20Cagr": 0.14, "universeCagr": 0.09, "spyCagr": 0.13,
                    "top5WinRateVsSpy": 0.6, "top20WinRateVsSpy": 0.7, "hitRate10x": 0.05 } }
  },
  // Calibración: ¿el retorno esperado del modelo ordena bien? Deciles de CAGR esperado vs CAGR realizado (horizonte 5)
  "calibration": { "adn": [ { "decile": 1, "expCagr": 0.35, "realCagr": 0.17, "n": 1400 } ] },   // decile 1 = mayor esperado
  // Correlación de rangos (Spearman) entre retorno esperado y realizado, por fecha (horizonte 1 y 5)
  "ic": { "adn": { "1": [ { "date": "...", "ic": 0.05 } ], "5": [...] } }
}
```
"top5" = portafolio de 5 ponderado con Kelly (`buildWeights(picks, "kelly", 0.4)`), igual que la app. top20/top50/decile1 = igual ponderado.
Retornos acumulados en decimal (1.85 = +185%). CAGR anualizados en decimal.

## 3. Versión 2 (auditoría, nov-2026): sin mirar el futuro, supervivencia y calibración

- **Panel**: horizontes 1, 3, 5 y **10** años. Si el historial de precios termina antes del horizonte ya no se pone `null`:
  se guarda el retorno hasta el último precio y el índice va en `delisted[fecha][h]`. `coverage[fecha]` agrega
  `secFilers` (emisores con ventas > $1M en la SEC) y `secInPanel` (cuántos de ellos tenemos con precio).
- **Selección sin mirar el futuro**: el top N se toma del ranking completo; si una elegida dejó de cotizar se usa su último
  precio con −15%, y si no hay precio posterior, el resultado esperado de una deslistada.
- **Supervivencia**: λ (tasa anual de desaparición de empresas listadas) = mediana por fecha de 1 − (cov_t / cov_hoy)^(1/años).
  Fracción deslistada a h años d_h = 1 − (1−λ)^h; resultado de las deslistadas: 55% compradas (M ≈ 1.25·1.07^(h/2), σ log 0.3)
  y 45% fallidas (M ≈ 0.15, σ log 0.9). `summary[t][h].adj.{central,pessimist,optimist}` = CAGR corregidos.
- **Calibración** → `public/calibration.json`: por teoría y horizonte, tramos del percentil del ranking (bordes
  0, .1, … .9, .95, .98, .995, 1) con 50 cuantiles del múltiplo realizado (mezclando deslistadas), P(pérdida), P(<0.5x),
  P(≥2x/5x/10x) con encogimiento bayesiano (25 pseudo-obs. del universo). La app interpola por percentil y horizonte.
- **Validación**: `oos[h]` (walk-forward: tablas solo con cohortes ya conocidas; Brier skill, cobertura 80%),
  `significance[h]` (top 20 vs 2,000 portafolios aleatorios por fecha) y `baselines` (top 20 por un solo factor).
