import { clave } from "./dashboard-normalize";

// Equivalencias que la unificación automática no puede deducir: apodos escritos sin comillas o
// nombres con apellidos acomodados distinto. Agrega aquí un par "como viene" -> "nombre oficial"
// cuando encuentres a la misma persona escrita de dos formas.
const ALIAS: Record<string, string> = {
  "Javier Javo Torres": "Javier Torres Rodríguez",
  'Delfino "El Changuito" Suárez': "Delfino Suárez Piedras",
  "Alejandra León Gastélum": "Alejandra del Carmen León Gastélum",
  "Alejandra del Carmen León": "Alejandra del Carmen León Gastélum",
  // Confirmados por Gadiel (26 nov 2026)
  "Graciela Ortíz Hernández": "Graciela Ortiz González",
  "Viridiana Valencia Espinoza": "Viridiana Valencia Vargas",
  "Anylú Bendición": "Anylú Bendición Hernández Sepúlveda",
  "Anylú Bendición Hernández": "Anylú Bendición Hernández Sepúlveda",
  "Anylú Hernández Sepúlveda": "Anylú Bendición Hernández Sepúlveda",
  'Hernán "El Grillo" Sada': 'Hernán "El Grillo" Sada Garza',
  "Hernán Sada Garza": 'Hernán "El Grillo" Sada Garza',
  "Hernán Gerardo Sada Garza": 'Hernán "El Grillo" Sada Garza',
  "Hernán El Grillo Sada": 'Hernán "El Grillo" Sada Garza',
  "Marco Armando Fernández Samaniego": "José Armando Fernández Samaniego",
  "Armando Samaniego": "José Armando Fernández Samaniego",
};

const PORCLAVE = new Map(Object.entries(ALIAS).map(([de, a]) => [clave(de), a]));

export const aliasCandidato = (nombre: string) => (nombre ? PORCLAVE.get(clave(nombre)) ?? nombre : nombre);
