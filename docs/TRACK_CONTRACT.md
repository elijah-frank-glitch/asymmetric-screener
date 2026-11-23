# Registro de predicciones (Track record) — contrato de datos

Objetivo: cada semana guardar una foto inmutable de lo que el modelo recomienda HOY (top 20 y portafolio de 5 por teoría,
con precio de entrada), y en cada build evaluar cómo les ha ido desde entonces contra benchmarks, en USD.

## 1. Snapshot semanal (inmutable, se commitea al repo)

Archivo: `data/predictions/YYYY-MM-DD.json` (fecha UTC del snapshot). Si ya existe el de esa fecha, NO se sobrescribe.
Lo genera `scripts/snapshot-predictions.mjs`, que corre después de `build-data.mjs` (usa `scripts/load-node.mjs`,
`src/engine.js` y `src/model.js` exactamente como `scripts/build-excel.mjs`).

```jsonc
{
  "version": 1,
  "date": "2026-11-22",                 // fecha UTC
  "createdAt": "2026-11-22T06:01:02Z",
  "dataFetchedAt": "...",               // meta.fetchedAt del universo usado
  "commit": "d8efea3",                  // git sha corto si está disponible, si no "local"
  "horizon": 5,
  "filters": { ...DEFAULT_FILTERS },
  "universe": { "n": 49387, "passing": 19299, "medianCagr": 0.043 },
  "benchmarks": {                       // precio de cierre al momento del snapshot
    "AMEX:SPY":   { "label": "S&P 500 (SPY)",     "close": 689.81, "currency": "USD" },
    "NASDAQ:ACWI":{ "label": "MSCI ACWI (ACWI)", "close": 142.59, "currency": "USD" }
  },
  "fx": { "JPY": 0.006288, "GBP": 1.3108, "USD": 1 },   // 1 unidad de moneda = X USD, para cada moneda presente
  "theories": {
    "adn": {
      "name": "ADN Multibagger (default)",
      "top": [                          // top 20 por retorno esperado (CAGR), filtros default
        { "rank": 1, "sym": "ASX:FML", "ticker": "FML", "name": "Focus Minerals Ltd", "country": "Australia",
          "industry": "Precious Metals", "currency": "AUD", "price": 0.42, "mcap": 337000000,
          "cagr": 0.597, "E": 10.4, "bull": 22.2, "base": 8.3, "bear": 1.4, "score": 0.72, "conf": 0.65, "kelly": 1.0 }
      ],
      "portfolio": [ { "sym": "ASX:FML", "weight": 0.286 } ]   // 5 empresas, método "kelly", maxW 0.4
    },
    "mayer": { ... }, "value": { ... }, "disrupt": { ... }, "quality": { ... }
  }
}
```
Teorías: todas las de `PRESETS` excepto `custom`. Precio = `close` de TradingView (moneda local de cotización).

Monedas de "subunidad": GBX→GBP/100, ILA→ILS/100, ZAC→ZAR/100 (para retornos solo importa el ratio, pero guardar el factor correcto).
Tipos de cambio: `POST https://scanner.tradingview.com/forex/scan` con `{"symbols":{"tickers":["FX_IDC:JPYUSD",...]},"columns":["close"]}`.
Precios por símbolo: `POST https://scanner.tradingview.com/global/scan` con `{"symbols":{"tickers":[...]},"columns":["close","currency"]}`.

## 2. Evaluación (se regenera en cada build, NO se commitea)

Archivo: `public/data/track.json`, generado por `scripts/build-track.mjs` (corre en `vercel-build.mjs` después de
`build-data.mjs`; si falla la red debe registrar el error y escribir igual un track.json válido sin romper el build).

Retorno USD de una acción = (precio_actual / precio_entrada) × (fx_actual / fx_entrada) − 1. Es retorno de PRECIO
(sin dividendos), igual que los benchmarks (SPY/ACWI precio). Si un símbolo ya no cotiza o no devuelve precio:
`missing: true`, `ret: null`, y se excluye de los promedios (se reporta cuántos faltan).

```jsonc
{
  "version": 1,
  "evaluatedAt": "2026-11-29T06:03:00Z",
  "error": null,                          // string si no se pudieron obtener precios actuales
  "benchmarks": [ { "sym": "AMEX:SPY", "label": "S&P 500 (SPY)" }, { "sym": "NASDAQ:ACWI", "label": "MSCI ACWI (ACWI)" } ],
  "theories": [ { "id": "adn", "name": "ADN Multibagger (default)" }, ... ],
  "snapshots": [                          // más reciente primero
    {
      "date": "2026-11-22", "days": 7, "horizon": 5,
      "bench": { "AMEX:SPY": 0.012, "NASDAQ:ACWI": 0.009 },          // retorno desde la fecha del snapshot
      "theories": {
        "adn": {
          "portfolio": { "ret": 0.034, "missing": 0,
            "picks": [ { "sym": "ASX:FML", "ticker": "FML", "name": "...", "country": "...", "currency": "AUD",
                         "weight": 0.286, "entry": 0.42, "current": 0.45, "ret": 0.071, "expCagr": 0.597, "missing": false } ] },
          "top20": { "ret": 0.021, "hitRate": 0.55, "n": 20, "missing": 0 },   // igual ponderado; hitRate = % que supera a SPY
          "top":   [ { "rank": 1, "sym": "...", "ticker": "...", "name": "...", "country": "...", "currency": "...",
                       "entry": 0.42, "current": 0.45, "ret": 0.071, "expCagr": 0.597, "missing": false } ]
        }
      }
    }
  ],
  "summary": {                            // agregados sobre todos los snapshots con days >= 1
    "adn": { "snapshots": 1, "avgPortfolioRet": 0.034, "avgExcessVsSPY": 0.022, "avgTop20Ret": 0.021, "winRateVsSPY": 1.0 }
  }
}
```
Todos los retornos son decimales (0.034 = 3.4%).
