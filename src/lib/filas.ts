import destinationsConfig from "../../destinations.json";
import type { DestinoId, RevisionEstado } from "./revision-types";
import { mesDeFecha, encuestadoraMasFecha, ganador, escenarioCandidatoLista, formatearPorcentaje, type FormatoPorcentaje } from "./calculos";

type DestinoConfig = {
  sheetTab: string;
  locationField: string;
  estadoField?: string;
  writeRange: string;
  columns: string[];
  untouchedColumns: string[];
};

const destinations = destinationsConfig as Record<string, DestinoConfig>;

export type FilasConstruidas = {
  sheetTab: string;
  columnas: string[];
  matriz: string[][];
};

// Arma las filas EXACTAMENTE en el orden de columnas de destinations.json
// (nunca columnas fijas en el código, per spec). Una fila por candidato,
// repitiendo los campos generales/calculados en cada una — igual al histórico.
export function construirFilas(
  estado: RevisionEstado,
  encuestadoraCorta: string,
  formatoPorcentaje: FormatoPorcentaje,
): FilasConstruidas | null {
  if (!estado.destino) return null;
  const cfg = destinations[estado.destino];
  const mes = mesDeFecha(estado.fecha);
  const encuestadoraFecha = encuestadoraMasFecha(encuestadoraCorta, mes);

  const filas: Record<string, string>[] = [];

  for (const esc of estado.escenarios) {
    const { partido: partidoGanador, candidato: candidatoGanador } = ganador(esc.candidatos);
    const escenarioCandidato = escenarioCandidatoLista(esc.candidatos);

    for (const c of esc.candidatos) {
      const pctNum = parseFloat(c.porcentaje.replace(",", "."));
      const pctFmt = Number.isNaN(pctNum) ? c.porcentaje : formatearPorcentaje(pctNum, formatoPorcentaje);

      const fila: Record<string, string> = {
        Fecha: estado.fecha,
        "Encuestadora + Fecha": encuestadoraFecha,
        MES: mes,
        Encuestadora: encuestadoraCorta,
        "Metodología": estado.metodologia,
        "Sub-tipo": esc.tipoEscenario,
        "Escenario Partido": esc.escenarioPartidos,
        "Escenario Candidato": escenarioCandidato,
        [cfg.locationField]: estado.ubicacion,
        "Alianza/Partido": c.partido,
        Candidato: c.candidato,
        "%Confianza": pctFmt,
        "Partido Ganador": partidoGanador,
        "Candidato Ganador": candidatoGanador,
      };
      if (cfg.estadoField) fila[cfg.estadoField] = estado.estadoUbicacion;
      filas.push(fila);
    }
  }

  const matriz = filas.map((fila) => cfg.columns.map((col) => fila[col] ?? ""));
  return { sheetTab: cfg.sheetTab, columnas: cfg.columns, matriz };
}

export function destinoLabel(id: DestinoId): string {
  return destinations[id].sheetTab;
}

export function locationFieldDe(id: DestinoId): string {
  return destinations[id].locationField;
}
