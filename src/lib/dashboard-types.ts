export type Modulo = "GUB" | "ALC";
// "Aspirante": medición de un solo aspirante contra "otro" o "no sabe" (¿quiere que X sea el
// candidato?). No es una interna con varios aspirantes y no se promedia con ellas.
export type Tipo = "Multipartidista" | "Interna" | "Aspirante" | "Careos" | "Otro";

export type EncuestaMeta = {
  id: string;
  modulo: Modulo;
  estado: string;
  municipio: string;
  fecha: string; // YYYY-MM-DD
  mes: string; // YYYY-MM
  fechaAprox: boolean; sinFecha: boolean;
  fechaTexto: string;
  encuestadora: string;
  metodologia: string;
  sheetLink: string | null;
};

export type Escenario = {
  e: number; // índice en encuestas
  tipo: Tipo;
  partidoInterna: string;
  etiqueta: string;
  sujeto: "partido" | "candidato";
  ganador: string | null;
};

export type Resultado = {
  s: number; // índice en escenarios
  p: string; // partido normalizado
  c: string; // candidato normalizado ("" si no aplica)
  v: number | null; // porcentaje 0-100
  sent: boolean; // Ninguno / Aún no decide / Otro
};

export type DatosDashboard = {
  encuestas: EncuestaMeta[];
  escenarios: Escenario[];
  resultados: Resultado[];
};
