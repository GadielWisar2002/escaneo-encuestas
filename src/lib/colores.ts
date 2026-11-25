// Colores de identidad por partido. Validados en este orden (Morena, PAN, PRI, MC, PVEM, PT) con
// el validador de paleta: pasan separación por daltonismo entre vecinos. Como con más de 3 colores
// en pantalla no hay paleta que pase entre todos los pares, cada barra y línea lleva su nombre.
const PARTIDOS: Record<string, string> = {
  Morena: "#9b2d48",
  PAN: "#2a78d6",
  PRI: "#d62828",
  MC: "#f29b00",
  PVEM: "#1a9850",
  PT: "#e87ba4",
  PRD: "#eda100",
  Independiente: "#6250d6",
};

export const GRIS_SENTINELA = "#a8a7a1";
export const GRIS_OTRO = "#78776f";

export function colorPartido(partido: string): string {
  if (!partido) return GRIS_OTRO;
  if (PARTIDOS[partido]) return PARTIDOS[partido];
  // Una coalición toma el color del partido que la encabeza.
  const lider = partido.split("-")[0];
  if (PARTIDOS[lider]) return PARTIDOS[lider];
  if (["Ninguno", "Aún no decide", "Otro"].includes(partido)) return GRIS_SENTINELA;
  return GRIS_OTRO;
}

// Paleta categórica de referencia (orden fijo, validada) para distinguir candidatos
// de un mismo partido, como en las internas.
export const CATEGORICA = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948"];
