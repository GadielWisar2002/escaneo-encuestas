import type { Confianza } from "./schema";

export type DestinoId = "GUBERNATURA" | "ALCALDES" | "ALCALDES_OTROS_ESTADOS";

export type NotaNormalizacion = {
  campo: "encuestadora" | "ubicacion" | "estado" | "partido" | "candidato";
  original: string;
  corregido: string;
  tipo: "auto" | "nuevo"; // "auto" = se corrigió solo; "nuevo" = no está en catálogo, falta confirmar
};

export type FilaCandidato = {
  id: string;
  partido: string;
  candidato: string;
  porcentaje: string; // string para permitir edición libre en el input; se parsea al construir filas
  confianzaPartido: Confianza;
  confianzaCandidato: Confianza;
  confianzaPorcentaje: Confianza;
  nota?: NotaNormalizacion;
  confirmadoNuevo?: boolean; // true cuando el usuario ya confirmó un valor "nuevo"
};

export type EscenarioEditable = {
  id: string;
  tipoEscenario: string;
  escenarioPartidos: string;
  candidatos: FilaCandidato[];
};

export type RevisionEstado = {
  fecha: string;
  encuestadora: string;
  notaEncuestadora?: NotaNormalizacion;
  encuestadoraConfirmada?: boolean;
  metodologia: string;
  ubicacion: string;
  notaUbicacion?: NotaNormalizacion;
  ubicacionConfirmada?: boolean;
  // Solo se usa (y se muestra en la UI) cuando destino === "ALCALDES_OTROS_ESTADOS".
  // Claude no puede leer el estado desde la imagen de forma confiable, así que
  // se captura a mano — por eso no tiene "confianza" como los demás campos.
  estadoUbicacion: string;
  notaEstadoUbicacion?: NotaNormalizacion;
  estadoUbicacionConfirmada?: boolean;
  destino: DestinoId | null;
  escenarios: EscenarioEditable[];
};
