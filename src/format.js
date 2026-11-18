const ok = (x) => typeof x === "number" && Number.isFinite(x);

export function fmtUsd(x) {
  if (!ok(x)) return "—";
  const a = Math.abs(x), s = x < 0 ? "−" : "";
  if (a >= 1e12) return `${s}$${(a / 1e12).toFixed(2)}T`;
  if (a >= 1e9) return `${s}$${(a / 1e9).toFixed(a >= 1e11 ? 0 : a >= 1e10 ? 1 : 2)}B`;
  if (a >= 1e6) return `${s}$${(a / 1e6).toFixed(a >= 1e8 ? 0 : 1)}M`;
  if (a >= 1e3) return `${s}$${(a / 1e3).toFixed(0)}K`;
  return `${s}$${a.toFixed(0)}`;
}
export function fmtMoney(x) {
  if (!ok(x)) return "—";
  return x.toLocaleString("es", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}
export function fmtPct(x, d = 1) {
  if (!ok(x)) return "—";
  return `${x > 0 ? "+" : x < 0 ? "−" : ""}${Math.abs(x).toFixed(d)}%`;
}
export function fmtPctPlain(x, d = 1) {
  if (!ok(x)) return "—";
  return `${x.toFixed(d)}%`;
}
export function fmtX(x, d = 2) {
  if (!ok(x)) return "—";
  if (x >= 100) return `${x.toFixed(0)}x`;
  if (x >= 10) return `${x.toFixed(1)}x`;
  return `${x.toFixed(d)}x`;
}
export function fmtNum(x) {
  if (!ok(x)) return "—";
  const a = Math.abs(x);
  if (a >= 1e9) return (x / 1e9).toFixed(2) + "B";
  if (a >= 1e6) return (x / 1e6).toFixed(2) + "M";
  if (a >= 1e4) return (x / 1e3).toFixed(1) + "K";
  if (a >= 100) return x.toFixed(0);
  if (a >= 1) return x.toFixed(2);
  return x.toPrecision(3);
}
export function fmtByUnit(x, unit) {
  switch (unit) {
    case "usd": return fmtUsd(x);
    case "pct": return ok(x) ? `${x.toFixed(Math.abs(x) >= 100 ? 0 : 1)}%` : "—";
    case "x": return ok(x) ? `${x.toFixed(Math.abs(x) >= 100 ? 0 : 2)}x` : "—";
    case "score": return ok(x) ? x.toFixed(Math.abs(x) >= 10 ? 1 : 2) : "—";
    case "date": return ok(x) ? new Date(x * 1000).toLocaleDateString("es") : "—";
    default: return fmtNum(x);
  }
}
export const cagrClass = (c) => (!ok(c) ? "" : c >= 0.3 ? "pos3" : c >= 0.15 ? "pos2" : c >= 0.05 ? "pos1" : c >= 0 ? "neu" : "neg");
