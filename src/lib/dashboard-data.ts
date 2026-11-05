import { getSupabaseClient } from "./supabase";

export type CandidatoFila = {
  partido: string;
  candidato: string;
  porcentaje: number | null;
  porcentajeTexto: string;
};

export type EscenarioAgrupado = {
  tipoEscenario: string;
  escenarioPartidos: string;
  escenarioCandidato: string;
  candidatos: CandidatoFila[];
};

export type EncuestaResumen = {
  id: string;
  destino: "GUBERNATURA" | "ALCALDES";
  ubicacion: string;
  fecha: string;
  encuestadora: string;
  metodologia: string;
  sheetLink: string | null;
  creadoEn: string;
  escenarios: EscenarioAgrupado[];
};

type FilaCruda = Record<string, string>;

function esIndecisoOSentinela(candidato: string, partido: string): boolean {
  const c = candidato.trim().toLowerCase();
  const p = partido.trim().toLowerCase();
  return c === "aún no decide" || c === "aun no decide" || p === "ninguno" || c === "";
}

function parsearPorcentaje(texto: string): number | null {
  const n = parseFloat(texto.replace("%", "").replace(",", ".").trim());
  return Number.isNaN(n) ? null : n;
}

// Las columnas vienen en orden distinto según el destino (confirmado en
// destinations.json: ALCALDES pone "%Confianza" antes de los ganadores,
// GUBERNATURA la pone al final) — por eso se arma un objeto por nombre de
// columna en vez de asumir posiciones fijas.
function filaPorNombre(columnas: string[], fila: string[]): FilaCruda {
  const obj: FilaCruda = {};
  columnas.forEach((col, i) => {
    obj[col.trim()] = fila[i] ?? "";
  });
  return obj;
}

function agruparEnEscenarios(columnas: string[], filas: string[][]): EscenarioAgrupado[] {
  const grupos = new Map<string, EscenarioAgrupado>();
  for (const fila of filas) {
    const f = filaPorNombre(columnas, fila);
    const tipoEscenario = f["Sub-tipo"] ?? f["Tipo de escenario"] ?? "";
    const clave = `${tipoEscenario}|${f["Escenario Partido"]}|${f["Escenario Candidato"]}`;
    let grupo = grupos.get(clave);
    if (!grupo) {
      grupo = {
        tipoEscenario,
        escenarioPartidos: f["Escenario Partido"] ?? "",
        escenarioCandidato: f["Escenario Candidato"] ?? "",
        candidatos: [],
      };
      grupos.set(clave, grupo);
    }
    const partido = f["Alianza/Partido"] ?? "";
    const candidato = f["Candidato"] ?? "";
    const porcentajeTexto = f["%Confianza"] ?? "";
    grupo.candidatos.push({
      partido,
      candidato,
      porcentaje: parsearPorcentaje(porcentajeTexto),
      porcentajeTexto,
    });
  }
  // Dentro de cada escenario, de mayor a menor (indecisos/sentinelas al final).
  for (const grupo of grupos.values()) {
    grupo.candidatos.sort((a, b) => {
      const aInd = esIndecisoOSentinela(a.candidato, a.partido);
      const bInd = esIndecisoOSentinela(b.candidato, b.partido);
      if (aInd !== bInd) return aInd ? 1 : -1;
      return (b.porcentaje ?? -Infinity) - (a.porcentaje ?? -Infinity);
    });
  }
  return [...grupos.values()];
}

// Trae y agrupa las encuestas guardadas. Server-only: usa la service_role
// key (la misma que ya usa /api/scan), nunca se expone al navegador.
export async function listarEncuestas(limite = 5000): Promise<EncuestaResumen[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("encuestas")
    .select("id, destino, ubicacion, fecha, encuestadora, metodologia, columnas, filas, sheet_link, creado_en")
    .order("creado_en", { ascending: false })
    .limit(limite);
  if (error) throw error;

  return (data ?? []).map((r) => ({
    id: r.id,
    destino: r.destino,
    ubicacion: r.ubicacion ?? "",
    fecha: r.fecha ?? "",
    encuestadora: r.encuestadora ?? "",
    metodologia: r.metodologia ?? "",
    sheetLink: r.sheet_link ?? null,
    creadoEn: r.creado_en,
    escenarios: agruparEnEscenarios(r.columnas as string[], r.filas as string[][]),
  }));
}
