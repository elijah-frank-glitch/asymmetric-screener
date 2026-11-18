import React from "react";
import { PRESETS } from "../model.js";

const CASES = [
  { n: "NVIDIA", y: "inicio 2016", pts: ["Cap. ≈ $17B, ingresos ≈ $5B creciendo ~7% y acelerando a +38% el año siguiente.", "Margen bruto ~56% y subiendo; I+D ≈ 25% de ventas; caja neta.", "La tesis: las GPU pasan de videojuegos a centros de datos e IA (deep learning).", "Resultado: más de 100x en ~8 años."], f: "Aceleración de ventas · margen bruto · I+D · caja neta" },
  { n: "Monster Beverage (Hansen Natural)", y: "inicio 2003", pts: ["Cap. < $100M con ventas ≈ $110M (P/S < 1).", "Lanzó Monster Energy en 2002; ventas se triplicaron a ≈ $350M en 2005.", "Modelo asset-light: embotellado tercerizado, alto retorno sobre capital.", "Resultado: una de las acciones de mejor desempeño de EE.UU. en dos décadas."], f: "Tamaño pequeño · P/S bajo · aceleración · ROIC" },
  { n: "Apple", y: "abril 2003", pts: ["Cap. ≈ $5–6B con ≈ $4.5B en caja: el mercado valoraba el negocio casi en cero.", "iPod + iTunes Store (2003) abrieron un nuevo ciclo de producto.", "Resultado: ~100x en ~9 años."], f: "Caja neta / capitalización · book-to-market · producto disruptivo" },
  { n: "Micron", y: "2016", pts: ["Cotizaba por debajo de su valor en libros en el fondo del ciclo de memorias.", "La industria DRAM se había consolidado en 3 jugadores (mejor disciplina de precios).", "Resultado: ~6x en dos años."], f: "Book-to-market · cerca de mínimos de 52s · ciclo" },
  { n: "Super Micro Computer", y: "mediados 2022", pts: ["Cap. ≈ $2B, P/E < 10, ventas +46% anual.", "Servidores para IA justo antes del boom de demanda de GPUs.", "Resultado: ~25–30x en menos de 2 años (al pico)."], f: "FCF/earnings yield alto · crecimiento · tamaño pequeño" },
  { n: "Celsius Holdings", y: "inicio 2020", pts: ["Cap. ≈ $200–300M; ventas creciendo de ~40% a ~75% anual.", "Bebida energética 'fitness' con distribución en expansión.", "Resultado: ~20x en ~18 meses."], f: "Tamaño pequeño · aceleración · margen bruto" },
  { n: "Amazon", y: "2001", pts: ["Cap. ≈ $2–3B tras el colapso puntocom, ventas ≈ $3B creciendo.", "El flujo de caja libre se volvió positivo en 2002.", "Resultado: cientos de veces en dos décadas."], f: "P/S bajo · inflexión del FCF · cerca de mínimos" },
  { n: "Tesla", y: "mediados 2019", pts: ["Cap. ≈ $35B en el pesimismo máximo por la producción del Model 3.", "Inflexión a rentabilidad sostenida en 2020.", "Resultado: ~30x en ~2.5 años."], f: "Inflexión de márgenes · crecimiento · cerca de mínimos" },
];

export default function Method({ meta, settings }) {
  const P = PRESETS.adn;
  const tot = Object.values(P.weights).reduce((a, b) => a + b, 0);
  const cat = Object.fromEntries(meta.catalog.map((m) => [m.id, m]));
  return (
    <div className="page">
      <div style={{ maxWidth: 1050 }}>
        <h2>Metodología</h2>
        <p className="lead">
          Asymmetric no busca la acción "más segura" ni la más parecida al índice. Busca <b>apuestas asimétricas</b>: empresas donde lo que puedes ganar si la tesis funciona es mucho
          mayor que lo que pierdes si falla. Esa es la forma de las grandes apuestas históricas (NVIDIA, Monster, Micron, Apple), que en su momento no pasaban los filtros de riesgo y diversificación tradicionales.
        </p>

        <div className="box">
          <h4>1 · Universo: todas las acciones del mundo</h4>
          <div className="prose">
            {meta.n.toLocaleString("es")} acciones con listado primario en {meta.exchanges.length} bolsas de {meta.countries.length} países, del escáner público de TradingView, que es la misma base que ves en su screener.
            TradingView muestra ~56k "instrumentos" porque cuenta listados duplicados y recibos de depósito: cada empresa aparece aquí una sola vez, en su bolsa principal. Todas las cifras fundamentales vienen convertidas a USD.
            Las descripciones de negocio salen de Yahoo Finance ({meta.descCoverage.toLocaleString("es")} empresas con descripción); "cómo gana dinero" se explica por el modelo de ingresos de cada una de las 130 industrias.
            Los datos se actualizan automáticamente cada semana.
          </div>
        </div>

        <div className="box">
          <h4>2 · Score ADN Multibagger (0–100)</h4>
          <div className="prose">
            Cada métrica se convierte en un percentil contra todo el universo (0 = peor, 100 = mejor, según si conviene alta o baja). El score es el promedio ponderado de esos percentiles.
            Una métrica sin dato cuenta como percentil 35: la falta de información es una penalización. Pesos de la teoría por defecto:
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: "2px 18px", marginTop: 8 }}>
            {Object.entries(P.weights).sort((a, b) => b[1] - a[1]).map(([k, w]) => (
              <div className="mrow" key={k}><span>{cat[k]?.label || k}</span><b>{Math.round((w / tot) * 100)}%</b></div>
            ))}
          </div>
          <div className="prose" style={{ marginTop: 10 }}>
            <b>De dónde salen.</b> Anna Yartseva (2025, <i>The Alchemy of Multibagger Stocks</i>, 464 acciones que se multiplicaron ≥10x entre 2009 y 2024) encontró que los predictores más fuertes fueron
            el FCF yield alto y el book-to-market alto, en empresas pequeñas y rentables. También encontró que las empresas que inflan activos más rápido que su EBITDA tienen peor desempeño, y que los ganadores
            tendían a comprarse cerca de sus mínimos de 12 meses. Chris Mayer (<i>100 Baggers</i>, 2015) mostró que el motor de largo plazo es reinvertir a ROIC alto durante muchos años, sumado a la expansión del múltiplo (los "dos motores").
            La aceleración de ventas, el margen bruto y el I+D capturan la parte de <b>disrupción tecnológica</b> que aparece en todos los casos de abajo.
          </div>
        </div>

        <div className="box">
          <h4>3 · Proyección fundamental por escenarios</h4>
          <div className="prose">
            Para cada empresa y para cualquier horizonte (de 6 meses a 20 años) se proyecta año por año:
            <ul>
              <li><b>Ventas:</b> el crecimiento inicial mezcla el consenso de analistas, el TTM, el último trimestre y el CAGR de 5 años. Por encima de 30% se amortigua (Chan, Karceski y Lakonishok, 2003, mostraron que el crecimiento alto casi nunca persiste) y luego converge al crecimiento terminal con una persistencia que sube con la calidad del negocio (margen bruto, ROIC, I+D). En industrias cíclicas pesa más el crecimiento de 5 años. En países con inflación alta el crecimiento nominal se deflacta.</li>
              <li><b>Margen neto:</b> converge a un margen maduro (mediana rentable de su industria o ≈22% del margen bruto). Los márgenes extraordinarios revierten (más rápido en cíclicas), y la expansión de margen solo se acredita cuando hay margen bruto que la respalde.</li>
              <li><b>Múltiplo de salida:</b> P/E = 10 + 90 × crecimiento remanente + 10 × calidad, con tope, y anclado parcialmente al P/E actual del mercado (si el mercado paga 4x en pleno boom, sabe algo). Las empresas con pérdidas se valoran por ventas.</li>
              <li><b>Dilución, dividendos y caja neta</b> se incorporan; las empresas que queman caja diluyen ~4% anual.</li>
              <li><b>Escepticismo:</b> cada resultado se mezcla un {Math.round((P.params.shrink) * 100)}% con el retorno histórico del mercado (8% anual). Es un encogimiento bayesiano: corrige que los modelos exageran la dispersión y que elegir las mejores de 20,000 estimaciones selecciona errores.</li>
            </ul>
            Hay cuatro escenarios: <b style={{ color: "var(--bull)" }}>alcista</b> (el crecimiento dura más, los márgenes escalan y el mercado paga más), <b style={{ color: "var(--base)" }}>base</b>, <b style={{ color: "var(--bear)" }}>bajista</b> (el crecimiento se frena y el múltiplo colapsa) y <b>ruina</b> (−90%).
            El score ADN determina las probabilidades: un score de 100 da 40% al alcista y 15% al bajista; un score de 0 da 8% y 42%. La probabilidad de ruina sube con mala calidad de datos, Altman Z bajo, pérdidas, poco runway de caja y tamaño micro.
            El <b>retorno esperado</b> es el múltiplo ponderado por probabilidad, anualizado.
          </div>
        </div>

        <div className="box">
          <h4>4 · Portafolio con criterio de Kelly</h4>
          <div className="prose">
            El criterio de Kelly elige los pesos que maximizan el crecimiento geométrico esperado del capital, E[ln(riqueza final)]: la tasa a la que crece tu patrimonio si repites la apuesta muchas veces.
            Para la canasta de N empresas se simulan 6,000 combinaciones de escenarios (asumiendo independencia entre empresas) y se optimizan los pesos con gradiente exponenciado sobre el simplex: pesos ≥ 0 que suman 100% y sin apalancamiento.
            Kelly completo es agresivo por diseño (maximiza el crecimiento, no minimiza la volatilidad); por eso existe <i>Medio Kelly</i> y un tope por posición.
            El "Kelly f*" de cada fila del screener es la fracción óptima si esa fuera tu única apuesta.
          </div>
        </div>

        <h3 style={{ margin: "22px 0 8px" }}>Cómo se veían las grandes apuestas antes de explotar</h3>
        <p className="lead">Cifras aproximadas y redondeadas, como referencia cualitativa de los rasgos que el modelo busca.</p>
        <div className="cases">
          {CASES.map((c) => (
            <div className="case" key={c.n}>
              <h4>{c.n}</h4>
              <div className="yr">{c.y}</div>
              <ul>{c.pts.map((p) => <li key={p}>{p}</li>)}</ul>
              <div className="small" style={{ marginTop: 8 }}>Rasgos que captura el modelo: <span style={{ color: "var(--accent)" }}>{c.f}</span></div>
            </div>
          ))}
        </div>

        <div className="box" style={{ marginTop: 18 }}>
          <h4>Limitaciones (importante)</h4>
          <div className="prose">
            <ul>
              <li><b>No hay backtest estadístico.</b> La fuente pública no tiene fundamentales "point-in-time" del pasado para todo el mundo. Los pesos se basan en la literatura y en los casos de arriba, no en una optimización sobre datos históricos.</li>
              <li><b>Calidad de datos.</b> En micro caps y mercados frontera hay errores frecuentes (unidades, ganancias extraordinarias, holdings con intereses minoritarios). El filtro de <i>confianza</i> mitiga esto, pero no lo elimina. Verifica siempre los estados financieros originales.</li>
              <li><b>Lo cualitativo no está en los números:</b> la calidad de la gerencia, el foso competitivo real, la regulación y la tecnología. Las disrupciones casi nunca se ven completas en los datos antes de ocurrir; el modelo solo encuentra candidatos.</li>
              <li><b>Las probabilidades son supuestos</b> calibrados con criterio, no frecuencias observadas.</li>
            </ul>
          </div>
        </div>
        <div className="warnbox" style={{ marginTop: 12 }}>
          <b>Aviso.</b> Asymmetric es un proyecto personal y educativo. No es asesoría de inversión ni una recomendación de comprar o vender ningún valor. Invertir en acciones individuales, sobre todo en empresas pequeñas, puede llevar a la pérdida total del capital.
          Haz tu propio análisis y consulta a un asesor financiero autorizado antes de invertir.
        </div>
        <p className="small" style={{ marginTop: 14 }}>
          Fuentes: escáner público de TradingView (fundamentales y mercado), Yahoo Finance (descripciones de negocio). Datos al {new Date(meta.fetchedAt).toLocaleString("es")}. Construido con React + Vite. Código abierto en GitHub.
        </p>
      </div>
    </div>
  );
}
