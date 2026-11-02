import type { FilaCandidato } from "./revision-types";

const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

// Fecha esperada en formato d/m/yyyy (como la devuelve la extracción).
export function mesDeFecha(fecha: string): string {
  const partes = fecha.trim().split("/");
  if (partes.length !== 3) return "";
  const mes = parseInt(partes[1], 10);
  if (!Number.isInteger(mes) || mes < 1 || mes > 12) return "";
  return MESES[mes - 1];
}

export function encuestadoraMasFecha(encuestadoraCorta: string, mes: string): string {
  if (!encuestadoraCorta || !mes) return "";
  return `${encuestadoraCorta} - ${mes}`;
}

function esIndecisoOSentinela(fila: FilaCandidato): boolean {
  const c = fila.candidato.trim().toLowerCase();
  const p = fila.partido.trim().toLowerCase();
  return c === "aún no decide" || c === "aun no decide" || p === "ninguno" || c === "";
}

export function ganador(candidatos: FilaCandidato[]): { partido: string; candidato: string } {
  let mejor: FilaCandidato | null = null;
  let mejorPct = -Infinity;
  for (const c of candidatos) {
    if (esIndecisoOSentinela(c)) continue;
    const pct = parseFloat(c.porcentaje.replace(",", "."));
    if (!Number.isNaN(pct) && pct > mejorPct) {
      mejorPct = pct;
      mejor = c;
    }
  }
  return { partido: mejor?.partido ?? "", candidato: mejor?.candidato ?? "" };
}

export function escenarioCandidatoLista(candidatos: FilaCandidato[]): string {
  return candidatos
    .map((c) => c.candidato.trim())
    .filter((v) => v && v.toLowerCase() !== "aún no decide" && v.toLowerCase() !== "aun no decide")
    .join(", ");
}

export function sumaPorcentajes(candidatos: FilaCandidato[]): number {
  return candidatos.reduce((acc, c) => {
    const pct = parseFloat(c.porcentaje.replace(",", "."));
    return acc + (Number.isNaN(pct) ? 0 : pct);
  }, 0);
}

export type FormatoPorcentaje = "NN%" | "NN.N%" | "NN.NN%" | "desconocido";

export function formatearPorcentaje(valor: number, formato: FormatoPorcentaje): string {
  if (Number.isNaN(valor)) return "";
  const decimales = formato === "NN.NN%" ? 2 : formato === "NN.N%" ? 1 : 0;
  return `${valor.toFixed(decimales)}%`;
}
