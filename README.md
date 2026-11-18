# Asymmetric · Screener global de multibaggers

Un screener fundamental de **~49,000 acciones de 113 países y 93 bolsas** que va más allá de filtrar. Para cada empresa estima el **retorno esperado a cualquier horizonte** (de 6 meses a 20 años) y arma un **portafolio de N empresas ponderado con el criterio de Kelly**, pensado para invertir hoy y no tocarlo hasta el final del plazo.

La tesis: las grandes apuestas de la historia (NVIDIA 2016, Monster 2003, Apple 2003, Micron 2016, Super Micro 2022) no pasaban los filtros tradicionales de riesgo y diversificación. Eran **apuestas asimétricas**: mucho más que ganar que perder. Este screener busca la próxima.

## Qué hace

- **Universo global completo:** todas las acciones con listado primario del escáner público de TradingView, con fundamentales en USD. Cada empresa trae su descripción de negocio (Yahoo Finance) y su modelo de ingresos ("cómo gana dinero").
- **111 métricas** fundamentales y de mercado en 11 categorías: valuación, crecimiento, rentabilidad, flujo de caja, salud financiera, scores de calidad (Piotroski, Altman, Beneish), consenso de analistas y otras. Cualquiera puede ser columna, filtro o factor del modelo.
- **Score ADN Multibagger:** percentiles ponderados según la evidencia de Yartseva (2025) y Mayer (*100 Baggers*, 2015), más rasgos de disrupción (aceleración de ventas, margen bruto, I+D).
- **Proyección por escenarios** (alcista, base, bajista y ruina) de ventas, márgenes, múltiplo de salida y dilución, año por año.
- **Portafolio Kelly:** maximiza E[ln riqueza] de la canasta por Monte Carlo. También ofrece medio Kelly, igual ponderado, por convicción o por retorno.
- **6 teorías intercambiables:** ADN Multibagger (default), Twin Engines (Mayer), Valor + FCF (Yartseva), Hipercrecimiento/Disrupción, Calidad compuesta y Personalizado. Todos los supuestos se pueden ajustar.
- **Excel descargable** con el universo completo, el catálogo de métricas (con selectores Sí/No), los supuestos y el portafolio default.

## Estructura

```
scripts/fetch-universe.mjs   descarga todas las acciones (TradingView scanner)
scripts/fetch-profiles.mjs   descripciones de negocio (Yahoo Finance), reanudable
scripts/metrics.mjs          catálogo de métricas
scripts/industries.mjs       sectores/industrias en español + cómo gana dinero cada una
scripts/build-data.mjs       genera public/data (núcleo + métricas bajo demanda + fichas)
scripts/build-excel.mjs      genera public/Universo_Global_Multibagger.xlsx
src/model.js                 motor: proyección, escenarios, Kelly, portafolio
src/engine.js                score, confianza de datos, filtros sobre todo el universo
src/components/              UI (React)
```

## Uso local

```bash
npm install
npm run fetch            # universo global (~1 min)
npm run fetch:profiles   # descripciones (~1-2 h la primera vez, luego incremental)
npm run data             # archivos de la app + Excel
npm run dev
```

## Despliegue

Vercel ejecuta `npm run vercel-build`, que descarga datos frescos (o usa `data/universe.json.gz` como respaldo), genera los archivos y compila la app. Un GitHub Action semanal agrega descripciones de empresas nuevas y hace commit, lo que dispara un redeploy con datos actualizados.

## Aviso

Proyecto personal y educativo. **No es asesoría de inversión.** El modelo usa datos públicos que pueden tener errores, no tiene backtest estadístico point-in-time y no captura lo cualitativo (gerencia, foso competitivo, regulación). Invertir en acciones individuales puede llevar a la pérdida total del capital.
