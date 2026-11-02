import type { ExtraccionEncuesta } from "./schema";
import type { RevisionEstado } from "./revision-types";

function id(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);
}

// Convierte el resultado crudo de /api/scan (con valor+confianza por campo)
// en el estado editable que maneja la pantalla de revisión.
export function estadoInicialDesdeExtraccion(datos: ExtraccionEncuesta): RevisionEstado {
  const destinoSugerido =
    datos.general.ubicacionTipo.valor === "entidad"
      ? "GUBERNATURA"
      : datos.general.ubicacionTipo.valor === "municipio"
        ? "ALCALDES"
        : null;

  return {
    fecha: datos.general.fecha.valor ?? "",
    encuestadora: datos.general.encuestadora.valor ?? "",
    metodologia: datos.general.metodologia.valor ?? "",
    ubicacion: datos.general.ubicacionValor.valor ?? "",
    estadoUbicacion: "",
    destino: destinoSugerido,
    escenarios: datos.escenarios.map((esc) => ({
      id: id(),
      tipoEscenario: esc.tipoEscenario.valor ?? "",
      escenarioPartidos: esc.escenarioPartidos.valor ?? "",
      candidatos: esc.candidatos.map((c) => ({
        id: id(),
        partido: c.partido.valor ?? "",
        candidato: c.candidato.valor ?? "",
        porcentaje: c.porcentaje.valor !== null ? String(c.porcentaje.valor) : "",
        confianzaPartido: c.partido.confianza,
        confianzaCandidato: c.candidato.confianza,
        confianzaPorcentaje: c.porcentaje.confianza,
      })),
    })),
  };
}

export function nuevaFilaCandidato() {
  return {
    id: id(),
    partido: "",
    candidato: "",
    porcentaje: "",
    confianzaPartido: "alta" as const,
    confianzaCandidato: "alta" as const,
    confianzaPorcentaje: "alta" as const,
  };
}
