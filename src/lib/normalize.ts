// Normalización contra catálogos (coincidencia aproximada), usada en la
// pantalla de revisión. Misma idea que scripts/generate-catalogs.ts, pero
// esta corre en el navegador sobre catalogs.json ya generado.

import type { RevisionEstado, NotaNormalizacion } from "./revision-types";
import type { Catalogos } from "./catalogs-types";

export type EntradaCatalogo = { valor: string; corto?: string; conteo: number };

export function normalizarTexto(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ");
}

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

export type ResultadoMatch = {
  // valor final a usar (canónico del catálogo si hubo match, o el original si es "nuevo")
  valorFinal: string;
  tipo: "igual" | "auto" | "nuevo"; // "igual" = ya estaba tal cual en el catálogo, no se toca
};

// Busca `texto` en `catalogo` por coincidencia exacta normalizada, luego por
// distancia de Levenshtein (mismo umbral que Fase 0). `preferirCorto` usa el
// nombre corto como valor final (para encuestadoras).
export function matchCatalogo(
  texto: string,
  catalogo: EntradaCatalogo[],
  opts: { preferirCorto?: boolean } = {},
): ResultadoMatch {
  const limpio = texto.trim();
  if (!limpio) return { valorFinal: limpio, tipo: "igual" };

  const n = normalizarTexto(limpio);

  for (const entrada of catalogo) {
    if (normalizarTexto(entrada.valor) === n || (entrada.corto && normalizarTexto(entrada.corto) === n)) {
      const final = opts.preferirCorto && entrada.corto ? entrada.corto : entrada.valor;
      // "igual" solo si el texto crudo ya coincidía tal cual (sin pasar por
      // normalización); si solo coincide tras quitar mayúsculas/acentos, sí
      // es una corrección real y debe marcarse como "auto".
      return { valorFinal: final, tipo: final === limpio ? "igual" : "auto" };
    }
  }

  let mejor: { entrada: EntradaCatalogo; dist: number } | null = null;
  for (const entrada of catalogo) {
    const maxLen = Math.max(n.length, normalizarTexto(entrada.valor).length);
    if (maxLen === 0) continue;
    const dist = levenshtein(n, normalizarTexto(entrada.valor));
    if (dist <= Math.max(2, Math.floor(maxLen * 0.15)) && maxLen > 3) {
      if (!mejor || dist < mejor.dist) mejor = { entrada, dist };
    }
  }
  if (mejor) {
    const final = opts.preferirCorto && mejor.entrada.corto ? mejor.entrada.corto : mejor.entrada.valor;
    return { valorFinal: final, tipo: "auto" };
  }

  return { valorFinal: limpio, tipo: "nuevo" };
}

function esSentinelaPartido(texto: string): boolean {
  return normalizarTexto(texto) === "ninguno";
}

function esSentinelaCandidato(texto: string): boolean {
  const n = normalizarTexto(texto);
  return n === "" || n === "aun no decide";
}

// Aplica normalización a encuestadora, ubicación (según destino) y a cada
// partido/candidato de cada escenario. Sentinelas ("Ninguno", "Aún no
// decide") se dejan intactos: no son errores de catálogo.
export function normalizarEstado(estado: RevisionEstado, catalogos: Catalogos): RevisionEstado {
  const notaDe = (
    campo: NotaNormalizacion["campo"],
    original: string,
    r: ResultadoMatch,
  ): NotaNormalizacion | undefined => {
    if (r.tipo === "igual") return undefined;
    return { campo, original, corregido: r.valorFinal, tipo: r.tipo === "auto" ? "auto" : "nuevo" };
  };

  const rEncuestadora = matchCatalogo(estado.encuestadora, catalogos.encuestadoras, { preferirCorto: true });
  const notaEncuestadora = notaDe("encuestadora", estado.encuestadora, rEncuestadora);

  // "Municipio" es el mismo tipo de dato en ALCALDES (NL) y en
  // ALCALDES_OTROS_ESTADOS, así que comparten catálogo — los municipios de
  // otros estados simplemente no tendrán coincidencia y se marcan "nuevo".
  const catalogoUbicacion =
    estado.destino === "GUBERNATURA"
      ? catalogos.entidades
      : estado.destino === "ALCALDES" || estado.destino === "ALCALDES_OTROS_ESTADOS"
        ? catalogos.municipios
        : null;
  const rUbicacion = catalogoUbicacion ? matchCatalogo(estado.ubicacion, catalogoUbicacion) : { valorFinal: estado.ubicacion, tipo: "igual" as const };
  const notaUbicacion = notaDe("ubicacion", estado.ubicacion, rUbicacion);

  // El campo "Estado" solo existe para ALCALDES_OTROS_ESTADOS y se captura a
  // mano (Claude no lo extrae), pero igual se normaliza contra el catálogo
  // de entidades para detectar typos/variantes.
  const esOtrosEstados = estado.destino === "ALCALDES_OTROS_ESTADOS";
  const rEstado = esOtrosEstados
    ? matchCatalogo(estado.estadoUbicacion, catalogos.entidades)
    : { valorFinal: estado.estadoUbicacion, tipo: "igual" as const };
  const notaEstadoUbicacion = esOtrosEstados ? notaDe("estado", estado.estadoUbicacion, rEstado) : undefined;

  return {
    ...estado,
    encuestadora: rEncuestadora.valorFinal,
    notaEncuestadora,
    encuestadoraConfirmada: notaEncuestadora ? estado.encuestadoraConfirmada : undefined,
    ubicacion: rUbicacion.valorFinal,
    notaUbicacion,
    ubicacionConfirmada: notaUbicacion ? estado.ubicacionConfirmada : undefined,
    estadoUbicacion: esOtrosEstados ? rEstado.valorFinal : estado.estadoUbicacion,
    notaEstadoUbicacion,
    estadoUbicacionConfirmada: notaEstadoUbicacion ? estado.estadoUbicacionConfirmada : undefined,
    escenarios: estado.escenarios.map((esc) => ({
      ...esc,
      candidatos: esc.candidatos.map((fila) => {
        let partido = fila.partido;
        let nota: NotaNormalizacion | undefined;
        if (!esSentinelaPartido(fila.partido)) {
          const r = matchCatalogo(fila.partido, catalogos.partidos);
          partido = r.valorFinal;
          nota = notaDe("partido", fila.partido, r);
        }
        let candidato = fila.candidato;
        if (!nota && !esSentinelaCandidato(fila.candidato)) {
          const r = matchCatalogo(fila.candidato, catalogos.candidatos);
          candidato = r.valorFinal;
          nota = notaDe("candidato", fila.candidato, r);
        }
        return { ...fila, partido, candidato, nota, confirmadoNuevo: nota ? fila.confirmadoNuevo : undefined };
      }),
    })),
  };
}
