// Forma de catalogs/catalogs.json, generado por scripts/generate-catalogs.ts.
export type EntradaSimple = { valor: string; conteo: number };
export type EntradaEncuestadora = { valor: string; corto: string; conteo: number };

export type Catalogos = {
  generadoEn: string;
  gubernatura: {
    filas: number;
    formatoFecha: { dominante: string; muestras: string[] };
    formatoPorcentaje: { dominante: "NN%" | "NN.N%" | "NN.NN%" | "desconocido"; muestras: string[] };
  };
  alcaldes: {
    filas: number;
    formatoFecha: { dominante: string; muestras: string[] };
    formatoPorcentaje: { dominante: "NN%" | "NN.N%" | "NN.NN%" | "desconocido"; muestras: string[] };
  };
  encuestadoras: EntradaEncuestadora[];
  entidades: EntradaSimple[];
  municipios: EntradaSimple[];
  partidos: EntradaSimple[];
  tiposEscenario: EntradaSimple[];
  candidatos: EntradaSimple[];
};
