// Catálogo maestro de métricas.
// src: campo del escáner público de TradingView ("tv") o métrica derivada calculada en build ("calc").
// unit: usd | pct | x | num | score | days
// better: 1 = más alto es mejor, -1 = más bajo es mejor, 0 = neutral
// model: true = la usa el modelo por defecto "ADN Multibagger"
// srcLabel: fuente legible para métricas calculadas fuera de TradingView (Yahoo Finance, SEC)
export const CATEGORIES = [
  "Tamaño y acciones",
  "Valuación",
  "Crecimiento",
  "Rentabilidad",
  "Flujo de caja",
  "Salud financiera",
  "Eficiencia",
  "Dividendos y recompras",
  "Calidad y scores",
  "Gobierno y señales",
  "Consenso de analistas",
  "Desempeño de mercado",
];

export const METRICS = [
  // ---------- Tamaño y acciones
  { id: "mcap", tv: "market_cap_basic", label: "Capitalización de mercado", cat: "Tamaño y acciones", unit: "usd", better: -1, model: true, desc: "Valor de mercado del capital en USD. Los multibaggers casi siempre empiezan pequeños: es difícil que una empresa de $1T se multiplique x10." },
  { id: "ev", tv: "enterprise_value_current", label: "Enterprise Value (EV)", cat: "Tamaño y acciones", unit: "usd", better: 0, desc: "Capitalización + deuda − caja. Valor de la empresa entera." },
  { id: "revenue", tv: "total_revenue_ttm", label: "Ingresos (TTM)", cat: "Tamaño y acciones", unit: "usd", better: 0, model: true, desc: "Ventas de los últimos 12 meses en USD." },
  { id: "employees", tv: "number_of_employees", label: "Empleados", cat: "Tamaño y acciones", unit: "num", better: 0, desc: "Número de empleados." },
  { id: "shares", tv: "total_shares_outstanding_current", label: "Acciones en circulación", cat: "Tamaño y acciones", unit: "num", better: 0, desc: "Total de acciones emitidas." },
  { id: "float_pct", tv: "float_shares_percent_current", label: "Free float %", cat: "Tamaño y acciones", unit: "pct", better: 0, desc: "Porcentaje de acciones que cotizan libremente. Un float bajo suele indicar dueños/fundadores con mucha participación." },
  { id: "shareholders", tv: "number_of_shareholders", label: "Número de accionistas", cat: "Tamaño y acciones", unit: "num", better: 0, desc: "Accionistas registrados (cuando está disponible)." },

  // ---------- Valuación
  { id: "pe", tv: "price_earnings_ttm", label: "P/E (TTM)", cat: "Valuación", unit: "x", better: -1, desc: "Precio / utilidad por acción de los últimos 12 meses." },
  { id: "pe_fwd", tv: "non_gaap_price_to_earnings_per_share_forecast_next_fy", label: "P/E forward (próx. año)", cat: "Valuación", unit: "x", better: -1, desc: "Precio / EPS estimado por analistas para el próximo año fiscal." },
  { id: "peg", tv: "price_earnings_growth_ttm", label: "PEG", cat: "Valuación", unit: "x", better: -1, desc: "P/E dividido por el crecimiento del EPS. <1 sugiere crecimiento barato." },
  { id: "ps", tv: "price_sales_current", label: "P/S (Precio / Ventas)", cat: "Valuación", unit: "x", better: -1, model: true, desc: "Capitalización / ingresos. Clave para empresas que aún no tienen utilidades." },
  { id: "pb", tv: "price_book_fq", label: "P/B (Precio / Valor en libros)", cat: "Valuación", unit: "x", better: -1, desc: "Capitalización / patrimonio contable." },
  { id: "pfcf", tv: "price_free_cash_flow_ttm", label: "P/FCF", cat: "Valuación", unit: "x", better: -1, desc: "Capitalización / flujo de caja libre." },
  { id: "ev_ebitda", tv: "enterprise_value_ebitda_ttm", label: "EV/EBITDA", cat: "Valuación", unit: "x", better: -1, desc: "Múltiplo de valor de empresa sobre EBITDA." },
  { id: "ev_rev", tv: "enterprise_value_to_revenue_ttm", label: "EV/Ventas", cat: "Valuación", unit: "x", better: -1, desc: "Valor de empresa sobre ingresos." },
  { id: "earn_yield", tv: "earnings_yield", label: "Earnings yield", cat: "Valuación", unit: "pct", better: 1, desc: "Utilidad / precio (inverso del P/E)." },
  { id: "graham", tv: "graham_numbers_ttm", label: "Número de Graham", cat: "Valuación", unit: "num", better: 0, desc: "√(22.5 × EPS × valor libro por acción). Valor intrínseco conservador de Benjamin Graham (moneda local de la acción)." },
  { id: "fcf_yield", calc: true, label: "FCF yield", cat: "Valuación", unit: "pct", better: 1, model: true, desc: "Flujo de caja libre / capitalización. Fue el predictor más fuerte de multibaggers en el estudio de Yartseva (2025, 464 acciones 2009-2024)." },
  { id: "bm", calc: true, label: "Book-to-market", cat: "Valuación", unit: "x", better: 1, model: true, desc: "Patrimonio / capitalización. Factor value: los multibaggers suelen arrancar con valuaciones razonables, no extremas." },
  { id: "ev_gp", calc: true, label: "EV / Utilidad bruta", cat: "Valuación", unit: "x", better: -1, desc: "Valor de empresa sobre utilidad bruta: mide el precio de la economía unitaria antes de gastos de crecimiento." },
  { id: "net_cash_pct", calc: true, label: "Caja neta / capitalización", cat: "Valuación", unit: "pct", better: 1, desc: "(Caja − deuda) / capitalización. Colchón y opcionalidad." },
  { id: "rd_mcap", calc: true, label: "I+D / capitalización", cat: "Valuación", unit: "pct", better: 1, desc: "Inversión anual en I+D como % del valor de mercado. Proxy de innovación subvalorada." },

  // ---------- Crecimiento
  { id: "rev_g", tv: "total_revenue_yoy_growth_ttm", label: "Crecimiento ventas YoY (TTM)", cat: "Crecimiento", unit: "pct", better: 1, model: true, desc: "Variación anual de los ingresos de los últimos 12 meses." },
  { id: "rev_g_q", tv: "total_revenue_yoy_growth_fq", label: "Crecimiento ventas YoY (último trimestre)", cat: "Crecimiento", unit: "pct", better: 1, model: true, desc: "Crecimiento del último trimestre vs. el mismo trimestre del año anterior. Detecta aceleración." },
  { id: "rev_qoq", tv: "total_revenue_qoq_growth_fq", label: "Crecimiento ventas QoQ", cat: "Crecimiento", unit: "pct", better: 1, desc: "Trimestre contra trimestre anterior." },
  { id: "rev_cagr5", tv: "total_revenue_cagr_5y", label: "CAGR ventas 5 años", cat: "Crecimiento", unit: "pct", better: 1, model: true, desc: "Crecimiento anual compuesto de ingresos en 5 años." },
  { id: "gp_g", tv: "gross_profit_yoy_growth_ttm", label: "Crecimiento utilidad bruta YoY", cat: "Crecimiento", unit: "pct", better: 1, desc: "Variación anual de la utilidad bruta." },
  { id: "ebitda_g", tv: "ebitda_yoy_growth_ttm", label: "Crecimiento EBITDA YoY", cat: "Crecimiento", unit: "pct", better: 1, desc: "Variación anual del EBITDA." },
  { id: "ni_g", tv: "net_income_yoy_growth_ttm", label: "Crecimiento utilidad neta YoY", cat: "Crecimiento", unit: "pct", better: 1, desc: "Variación anual de la utilidad neta." },
  { id: "ni_cagr5", tv: "net_income_cagr_5y", label: "CAGR utilidad neta 5 años", cat: "Crecimiento", unit: "pct", better: 1, desc: "Crecimiento compuesto de utilidad neta en 5 años." },
  { id: "eps_g", tv: "earnings_per_share_diluted_yoy_growth_ttm", label: "Crecimiento EPS YoY", cat: "Crecimiento", unit: "pct", better: 1, desc: "Variación anual del EPS diluido." },
  { id: "fcf_g", tv: "free_cash_flow_yoy_growth_ttm", label: "Crecimiento FCF YoY", cat: "Crecimiento", unit: "pct", better: 1, desc: "Variación anual del flujo de caja libre." },
  { id: "fcf_cagr5", tv: "free_cash_flow_cagr_5y", label: "CAGR FCF 5 años", cat: "Crecimiento", unit: "pct", better: 1, desc: "Crecimiento compuesto del FCF en 5 años." },
  { id: "assets_g", tv: "total_assets_yoy_growth_fy", label: "Crecimiento de activos YoY", cat: "Crecimiento", unit: "pct", better: 0, desc: "Variación anual de los activos totales." },
  { id: "invest_gap", calc: true, label: "Brecha inversión (activos − EBITDA)", cat: "Crecimiento", unit: "pct", better: -1, model: true, desc: "Crecimiento de activos menos crecimiento de EBITDA. Si los activos crecen más rápido que el EBITDA, la empresa invierte sin retorno: Yartseva encontró que esto predice bajo rendimiento." },
  { id: "rev_fwd_g", calc: true, label: "Crecimiento ventas esperado (consenso)", cat: "Crecimiento", unit: "pct", better: 1, model: true, desc: "Ingresos estimados próximo año fiscal / ingresos TTM − 1." },
  { id: "eps_fwd_g", calc: true, label: "Crecimiento EPS esperado (consenso)", cat: "Crecimiento", unit: "pct", better: 1, desc: "EPS estimado próximo año / EPS TTM − 1 (solo si EPS actual > 0)." },
  { id: "rule40", calc: true, label: "Regla del 40", cat: "Crecimiento", unit: "pct", better: 1, model: true, desc: "Crecimiento de ventas + margen FCF. >40 es élite en software/tecnología." },
  { id: "accel", calc: true, label: "Aceleración de ventas", cat: "Crecimiento", unit: "pct", better: 1, model: true, desc: "Crecimiento último trimestre − crecimiento TTM. Positivo = el negocio está acelerando (señal clásica previa a NVDA 2023, MU 2016)." },

  // ---------- Rentabilidad
  { id: "gm", tv: "gross_margin_ttm", label: "Margen bruto", cat: "Rentabilidad", unit: "pct", better: 1, model: true, desc: "Utilidad bruta / ventas. Mide poder de fijación de precios y economía unitaria." },
  { id: "om", tv: "operating_margin_ttm", label: "Margen operativo", cat: "Rentabilidad", unit: "pct", better: 1, desc: "Utilidad operativa / ventas." },
  { id: "ebitda_m", tv: "ebitda_margin_ttm", label: "Margen EBITDA", cat: "Rentabilidad", unit: "pct", better: 1, model: true, desc: "EBITDA / ventas." },
  { id: "nm", tv: "net_margin_ttm", label: "Margen neto", cat: "Rentabilidad", unit: "pct", better: 1, model: true, desc: "Utilidad neta / ventas." },
  { id: "roe", tv: "return_on_equity", label: "ROE", cat: "Rentabilidad", unit: "pct", better: 1, desc: "Utilidad neta / patrimonio." },
  { id: "roa", tv: "return_on_assets", label: "ROA", cat: "Rentabilidad", unit: "pct", better: 1, model: true, desc: "Utilidad neta / activos." },
  { id: "roic", tv: "return_on_invested_capital", label: "ROIC", cat: "Rentabilidad", unit: "pct", better: 1, model: true, desc: "Retorno sobre capital invertido. Chris Mayer (100 Baggers): el motor de largo plazo es reinvertir a ROIC alto." },
  { id: "roce", tv: "return_on_capital_employed_fq", label: "ROCE", cat: "Rentabilidad", unit: "pct", better: 1, desc: "Retorno sobre capital empleado." },
  { id: "gp_assets", calc: true, label: "Utilidad bruta / activos", cat: "Rentabilidad", unit: "pct", better: 1, desc: "Factor de rentabilidad de Novy-Marx (2013): predice retornos tan bien como el value." },
  { id: "ni", tv: "net_income_ttm", label: "Utilidad neta (TTM)", cat: "Rentabilidad", unit: "usd", better: 1, desc: "Utilidad neta de los últimos 12 meses." },
  { id: "ebitda", tv: "ebitda_ttm", label: "EBITDA (TTM)", cat: "Rentabilidad", unit: "usd", better: 1, desc: "EBITDA de los últimos 12 meses." },
  { id: "gp", tv: "gross_profit_ttm", label: "Utilidad bruta (TTM)", cat: "Rentabilidad", unit: "usd", better: 1, desc: "Utilidad bruta de los últimos 12 meses." },
  { id: "rev_emp", tv: "revenue_per_employee", label: "Ventas por empleado", cat: "Rentabilidad", unit: "usd", better: 1, desc: "Productividad por empleado." },
  { id: "ni_emp", tv: "net_income_per_employee_fy", label: "Utilidad por empleado", cat: "Rentabilidad", unit: "usd", better: 1, desc: "Utilidad neta por empleado." },

  // ---------- Flujo de caja
  { id: "fcf", tv: "free_cash_flow_ttm", label: "Flujo de caja libre (TTM)", cat: "Flujo de caja", unit: "usd", better: 1, desc: "Flujo operativo − capex." },
  { id: "fcf_m", tv: "free_cash_flow_margin_ttm", label: "Margen FCF", cat: "Flujo de caja", unit: "pct", better: 1, model: true, desc: "FCF / ventas." },
  { id: "cfo", tv: "cash_f_operating_activities_ttm", label: "Flujo operativo (TTM)", cat: "Flujo de caja", unit: "usd", better: 1, desc: "Caja generada por la operación." },
  { id: "capex", tv: "capital_expenditures_ttm", label: "Capex (TTM)", cat: "Flujo de caja", unit: "usd", better: 0, desc: "Inversión en activos fijos (negativo = salida de caja)." },
  { id: "capex_rev", calc: true, label: "Capex / ventas", cat: "Flujo de caja", unit: "pct", better: 0, desc: "Intensidad de capital." },
  { id: "rd", tv: "research_and_dev_ttm", label: "I+D (TTM)", cat: "Flujo de caja", unit: "usd", better: 0, desc: "Gasto en investigación y desarrollo." },
  { id: "rd_rev", tv: "research_and_dev_ratio_ttm", label: "I+D / ventas", cat: "Flujo de caja", unit: "pct", better: 1, model: true, desc: "Intensidad de innovación: casi todas las disrupciones (NVDA, ISRG, ASML) invirtieron >10% de ventas en I+D." },
  { id: "sga_rev", tv: "sell_gen_admin_exp_other_ratio_ttm", label: "SG&A / ventas", cat: "Flujo de caja", unit: "pct", better: -1, desc: "Gastos de venta y administración sobre ventas." },
  { id: "sloan", tv: "sloan_ratio_ttm", label: "Ratio de Sloan (accruals)", cat: "Flujo de caja", unit: "pct", better: -1, desc: "Utilidad no respaldada por caja. Alto (>10%) = calidad de ganancias dudosa." },

  // ---------- Salud financiera
  { id: "de", tv: "debt_to_equity", label: "Deuda / patrimonio", cat: "Salud financiera", unit: "x", better: -1, model: true, desc: "Apalancamiento. Los multibaggers rara vez necesitan deuda alta." },
  { id: "nd_ebitda", tv: "net_debt_to_ebitda_fq", label: "Deuda neta / EBITDA", cat: "Salud financiera", unit: "x", better: -1, desc: "Años de EBITDA necesarios para pagar la deuda neta." },
  { id: "cr", tv: "current_ratio", label: "Current ratio", cat: "Salud financiera", unit: "x", better: 1, desc: "Activo corriente / pasivo corriente." },
  { id: "qr", tv: "quick_ratio", label: "Quick ratio", cat: "Salud financiera", unit: "x", better: 1, desc: "(Activo corriente − inventario) / pasivo corriente." },
  { id: "cash", tv: "cash_n_short_term_invest_fq", label: "Caja e inversiones CP", cat: "Salud financiera", unit: "usd", better: 1, desc: "Efectivo e inversiones de corto plazo." },
  { id: "debt", tv: "total_debt", label: "Deuda total", cat: "Salud financiera", unit: "usd", better: -1, desc: "Deuda financiera total." },
  { id: "net_debt", tv: "net_debt", label: "Deuda neta", cat: "Salud financiera", unit: "usd", better: -1, desc: "Deuda − caja." },
  { id: "lt_debt", tv: "long_term_debt_fq", label: "Deuda de largo plazo", cat: "Salud financiera", unit: "usd", better: -1, desc: "Deuda con vencimiento > 1 año." },
  { id: "assets", tv: "total_assets_fq", label: "Activos totales", cat: "Salud financiera", unit: "usd", better: 0, desc: "Activos totales del balance." },
  { id: "liab", tv: "total_liabilities_fq", label: "Pasivos totales", cat: "Salud financiera", unit: "usd", better: 0, desc: "Pasivos totales." },
  { id: "equity", tv: "total_equity_fq", label: "Patrimonio", cat: "Salud financiera", unit: "usd", better: 1, desc: "Patrimonio contable." },
  { id: "wc", tv: "working_capital_fq", label: "Capital de trabajo", cat: "Salud financiera", unit: "usd", better: 0, desc: "Activo corriente − pasivo corriente." },
  { id: "goodwill", tv: "goodwill_fq", label: "Goodwill", cat: "Salud financiera", unit: "usd", better: 0, desc: "Plusvalía por adquisiciones." },
  { id: "debt_g", tv: "total_debt_yoy_growth_fy", label: "Crecimiento de deuda YoY", cat: "Salud financiera", unit: "pct", better: -1, desc: "Variación anual de la deuda." },
  { id: "runway", calc: true, label: "Runway de caja (años)", cat: "Salud financiera", unit: "num", better: 1, desc: "Si el FCF es negativo: caja / quema anual. Cuántos años puede operar sin levantar capital." },

  // ---------- Eficiencia
  { id: "asset_turn", calc: true, label: "Rotación de activos", cat: "Eficiencia", unit: "x", better: 1, desc: "Ventas / activos totales." },
  { id: "goodwill_assets", calc: true, label: "Goodwill / activos", cat: "Eficiencia", unit: "pct", better: -1, desc: "Dependencia de adquisiciones." },

  // ---------- Dividendos y recompras
  { id: "div_yield", tv: "dividends_yield_current", label: "Dividend yield", cat: "Dividendos y recompras", unit: "pct", better: 1, desc: "Dividendo anual / precio." },
  { id: "payout", tv: "dividend_payout_ratio_ttm", label: "Payout ratio", cat: "Dividendos y recompras", unit: "pct", better: 0, desc: "Dividendos / utilidad neta. Un multibagger normalmente reinvierte en vez de repartir." },
  { id: "div_years", tv: "continuous_dividend_payout", label: "Años pagando dividendo", cat: "Dividendos y recompras", unit: "num", better: 0, desc: "Años consecutivos con dividendo." },
  { id: "div_growth_years", tv: "continuous_dividend_growth", label: "Años aumentando dividendo", cat: "Dividendos y recompras", unit: "num", better: 1, desc: "Años consecutivos de aumento del dividendo." },
  { id: "buyback", tv: "buyback_yield", label: "Buyback yield", cat: "Dividendos y recompras", unit: "pct", better: 1, desc: "Recompras netas / capitalización." },

  // ---------- Calidad y scores
  { id: "piotroski", tv: "piotroski_f_score_ttm", label: "Piotroski F-Score", cat: "Calidad y scores", unit: "score", better: 1, model: true, desc: "0-9. Fortaleza fundamental (rentabilidad, apalancamiento, eficiencia). ≥7 = fuerte." },
  { id: "altman", tv: "altman_z_score_ttm", label: "Altman Z-Score", cat: "Calidad y scores", unit: "score", better: 1, model: true, desc: "Riesgo de quiebra. <1.8 zona de peligro, >3 zona segura." },
  { id: "beneish", tv: "beneish_m_score_ttm", label: "Beneish M-Score", cat: "Calidad y scores", unit: "score", better: -1, desc: "Probabilidad de manipulación contable. > −1.78 = alerta." },

  // ---------- Gobierno y señales (Yahoo Finance: data/signals.json; SEC: data/dilution_us.json — ver docs/SIGNALS_CONTRACT.md)
  { id: "insider_pct", calc: true, srcLabel: "Yahoo Finance (majorHoldersBreakdown)", label: "Propiedad de insiders", cat: "Gobierno y señales", unit: "pct", better: 1, desc: "% de las acciones en manos de directivos y consejeros. Skin in the game: Chris Mayer (100 Baggers) encontró que muchos multibaggers tenían dueños-operadores con participaciones grandes, que piensan en décadas y asignan capital como accionistas, no como empleados." },
  { id: "inst_pct", calc: true, srcLabel: "Yahoo Finance (majorHoldersBreakdown)", label: "Propiedad institucional", cat: "Gobierno y señales", unit: "pct", better: 0, desc: "% en manos de fondos e instituciones. Neutral: baja propiedad institucional = empresa poco descubierta (espacio para que lleguen compradores grandes); alta = validación pero menos sorpresa posible." },
  { id: "short_pct", calc: true, srcLabel: "Yahoo Finance (defaultKeyStatistics)", label: "Short interest (% del float)", cat: "Gobierno y señales", unit: "pct", better: -1, desc: "% del float vendido en corto. Mide el escepticismo de la multitud informada: un short interest alto suele anticipar bajo rendimiento (aunque a veces alimenta short squeezes). Mayormente disponible para EE.UU." },
  { id: "founder", calc: true, srcLabel: "Yahoo Finance (assetProfile: companyOfficers)", label: "Dirigida por fundador (1/0)", cat: "Gobierno y señales", unit: "num", better: 1, desc: "1 si algún directivo listado tiene \"founder\"/\"co-founder\" en su cargo. Bain & Company (The Founder's Mentality) halló que las empresas del S&P 500 lideradas por fundadores generaron ~3.1x más retorno total que el resto en 15 años; Mayer también destaca al dueño-fundador como rasgo común de los 100-baggers." },
  { id: "eps_rev30", calc: true, srcLabel: "Yahoo Finance (earningsTrend 0y)", label: "Revisión EPS 30 días", cat: "Gobierno y señales", unit: "pct", better: 1, desc: "Cambio % del EPS estimado por analistas para el año fiscal en curso vs. hace 30 días. Momentum de utilidades: las revisiones al alza tienden a persistir y anticipan sorpresas positivas (los analistas ajustan lento)." },
  { id: "eps_rev90", calc: true, srcLabel: "Yahoo Finance (earningsTrend 0y)", label: "Revisión EPS 90 días", cat: "Gobierno y señales", unit: "pct", better: 1, desc: "Cambio % del EPS estimado del año en curso vs. hace 90 días. Versión más lenta y estable del momentum de revisiones." },
  { id: "rev_breadth", calc: true, srcLabel: "Yahoo Finance (earningsTrend 0y)", label: "Amplitud de revisiones (up−down)/(up+down)", cat: "Gobierno y señales", unit: "x", better: 1, desc: "De −1 a +1: proporción neta de analistas que subieron vs. bajaron su estimado de EPS en 30 días. Mide si el cambio de expectativas es generalizado o lo mueve un solo analista." },
  { id: "shares_g1", calc: true, srcLabel: "SEC EDGAR (dei / acciones diluidas)", label: "Dilución 1 año (EE.UU.)", cat: "Gobierno y señales", unit: "pct", better: -1, desc: "Cambio % anual del número de acciones (solo EE.UU.). La dilución destruye el compounding por acción: si la empresa crece 20% pero emite 10% más acciones, el accionista solo captura ~9%. Negativo = recompras." },
  { id: "shares_g3", calc: true, srcLabel: "SEC EDGAR (dei / acciones diluidas)", label: "Dilución anual 3 años (EE.UU.)", cat: "Gobierno y señales", unit: "pct", better: -1, desc: "CAGR del número de acciones en 3 años (solo EE.UU.). Emisión crónica de acciones (SBC alto, ampliaciones para financiar pérdidas) es uno de los mayores frenos a un multibagger." },

  // ---------- Consenso de analistas
  { id: "pt_avg", tv: "price_target_average", label: "Precio objetivo promedio", cat: "Consenso de analistas", unit: "num", better: 0, desc: "Precio objetivo medio de analistas (moneda de cotización)." },
  { id: "pt_upside", calc: true, label: "Upside a precio objetivo", cat: "Consenso de analistas", unit: "pct", better: 1, desc: "Precio objetivo promedio / precio actual − 1." },
  { id: "pt_high", tv: "price_target_high", label: "Precio objetivo máximo", cat: "Consenso de analistas", unit: "num", better: 0, desc: "Precio objetivo más optimista." },
  { id: "pt_low", tv: "price_target_low", label: "Precio objetivo mínimo", cat: "Consenso de analistas", unit: "num", better: 0, desc: "Precio objetivo más pesimista." },
  { id: "reco", tv: "recommendation_mark", label: "Recomendación analistas (1=compra fuerte, 5=venta)", cat: "Consenso de analistas", unit: "score", better: -1, desc: "Promedio de recomendaciones." },
  { id: "rev_fwd", tv: "revenue_forecast_next_fy", label: "Ingresos estimados próx. año", cat: "Consenso de analistas", unit: "usd", better: 1, desc: "Consenso de ingresos del próximo año fiscal." },
  { id: "eps_fwd", tv: "earnings_per_share_forecast_next_fy", label: "EPS estimado próx. año", cat: "Consenso de analistas", unit: "num", better: 1, desc: "Consenso de EPS del próximo año fiscal." },
  { id: "eps_ttm", tv: "earnings_per_share_diluted_ttm", label: "EPS diluido (TTM)", cat: "Consenso de analistas", unit: "num", better: 1, desc: "Utilidad por acción diluida." },
  { id: "next_earn", tv: "earnings_release_next_date", label: "Próximo reporte", cat: "Consenso de analistas", unit: "date", better: 0, desc: "Fecha del próximo reporte de resultados." },

  // ---------- Desempeño de mercado
  { id: "price", tv: "close", label: "Precio", cat: "Desempeño de mercado", unit: "num", better: 0, desc: "Último precio (moneda local de cotización)." },
  { id: "perf_1m", tv: "Perf.1M", label: "Rendimiento 1 mes", cat: "Desempeño de mercado", unit: "pct", better: 0, desc: "Variación del precio en 1 mes." },
  { id: "perf_6m", tv: "Perf.6M", label: "Rendimiento 6 meses", cat: "Desempeño de mercado", unit: "pct", better: 0, desc: "Variación del precio en 6 meses." },
  { id: "perf_ytd", tv: "Perf.YTD", label: "Rendimiento YTD", cat: "Desempeño de mercado", unit: "pct", better: 0, desc: "Variación en el año." },
  { id: "perf_1y", tv: "Perf.Y", label: "Rendimiento 1 año", cat: "Desempeño de mercado", unit: "pct", better: 0, desc: "Variación del precio en 12 meses." },
  { id: "perf_3y", tv: "Perf.3Y", label: "Rendimiento 3 años", cat: "Desempeño de mercado", unit: "pct", better: 0, desc: "Variación del precio en 3 años." },
  { id: "perf_5y", tv: "Perf.5Y", label: "Rendimiento 5 años", cat: "Desempeño de mercado", unit: "pct", better: 0, desc: "Variación del precio en 5 años." },
  { id: "hi52", tv: "price_52_week_high", label: "Máximo 52 semanas", cat: "Desempeño de mercado", unit: "num", better: 0, desc: "Precio máximo del último año." },
  { id: "lo52", tv: "price_52_week_low", label: "Mínimo 52 semanas", cat: "Desempeño de mercado", unit: "num", better: 0, desc: "Precio mínimo del último año." },
  { id: "off_low", calc: true, label: "Distancia sobre mínimo 52s", cat: "Desempeño de mercado", unit: "pct", better: -1, model: true, desc: "Precio / mínimo de 52 semanas − 1. Yartseva: los multibaggers tendían a comprarse cerca de mínimos del año (reversión, no momentum)." },
  { id: "off_high", calc: true, label: "Caída desde máximo 52s", cat: "Desempeño de mercado", unit: "pct", better: 0, desc: "Precio / máximo de 52 semanas − 1." },
  { id: "beta", tv: "beta_1_year", label: "Beta 1 año", cat: "Desempeño de mercado", unit: "x", better: 0, desc: "Sensibilidad al mercado." },
  { id: "vol_m", tv: "Volatility.M", label: "Volatilidad mensual", cat: "Desempeño de mercado", unit: "pct", better: 0, desc: "Volatilidad del último mes." },
  { id: "avg_vol", tv: "average_volume_30d_calc", label: "Volumen promedio 30d", cat: "Desempeño de mercado", unit: "num", better: 1, desc: "Acciones negociadas por día (liquidez)." },
  { id: "liq_usd", calc: true, label: "Liquidez diaria aprox. (USD)", cat: "Desempeño de mercado", unit: "usd", better: 1, desc: "Volumen promedio × precio convertido a USD (aproximado vía capitalización / acciones)." },
];

// Campos de identidad que también se descargan
export const ID_FIELDS = ["name", "description", "exchange", "country", "sector", "industry", "isin", "currency", "logoid", "typespecs"];

// Campos crudos adicionales necesarios solo para cálculos
export const RAW_EXTRA = ["ebitda_yoy_growth_fy", "total_assets_yoy_growth_fy", "total_revenue_fy"];
