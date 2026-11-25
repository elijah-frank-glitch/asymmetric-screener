// Modelo personalizado de la sesión: se guarda en sessionStorage (sobrevive a cambiar de teoría y a recargar,
// y se borra al cerrar la pestaña/navegador).
const KEY = "asymmetric-custom-model-v1";
export function saveCustomModel(weights, params) {
  try { sessionStorage.setItem(KEY, JSON.stringify({ weights, params })); } catch {}
}
export function loadCustomModel() {
  try {
    const s = JSON.parse(sessionStorage.getItem(KEY));
    if (s && s.weights && typeof s.weights === "object" && s.params && typeof s.params === "object") return s;
  } catch {}
  return null;
}
