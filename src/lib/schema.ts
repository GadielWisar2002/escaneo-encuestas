import { z } from "zod";

// "alta" = se lee con claridad; "media" = se infiere o hay ambigüedad leve;
// "baja" = casi ilegible / muy inferido. Nunca se inventa: si no se lee, valor = null.
export const Confianza = z.enum(["alta", "media", "baja"]);
export type Confianza = z.infer<typeof Confianza>;

// `nota` es opcional (se omite si no aplica) en vez de nullable: la API de
// Claude limita a 16 parámetros con tipos unión/nullable por request, y
// `valor: null` es el que realmente importa para "no inventar datos".
const campoTexto = () =>
  z.object({
    valor: z.string().nullable(),
    confianza: Confianza,
    nota: z.string().optional(),
  });

const campoNumero = () =>
  z.object({
    valor: z.number().nullable(),
    confianza: Confianza,
    nota: z.string().optional(),
  });

export const CandidatoSchema = z.object({
  partido: campoTexto(),
  // candidato.valor puede ser null o "Aún no decide": ver extraction-prompt.md
  // para la convención exacta de indecisos/otros por tipo de escenario.
  candidato: campoTexto(),
  porcentaje: campoNumero(),
});
export type Candidato = z.infer<typeof CandidatoSchema>;

export const EscenarioSchema = z.object({
  tipoEscenario: campoTexto(), // "Interna" | "Multipartidista" | otro
  escenarioPartidos: campoTexto(), // lista separada por comas, tal como aparece
  candidatos: z.array(CandidatoSchema),
});
export type Escenario = z.infer<typeof EscenarioSchema>;

export const ExtraccionEncuestaSchema = z.object({
  esEncuestaValida: z.boolean(),
  advertencias: z.array(z.string()),
  general: z.object({
    fecha: campoTexto(), // fecha de levantamiento, formato d/m/yyyy tal como se lee
    encuestadora: campoTexto(),
    metodologia: campoTexto(), // tamaño de muestra + tipo, texto libre
    ubicacionTipo: z.object({
      valor: z.enum(["entidad", "municipio"]).nullable(),
      confianza: Confianza,
      nota: z.string().optional(),
    }),
    ubicacionValor: campoTexto(), // nombre de la entidad o municipio
  }),
  escenarios: z.array(EscenarioSchema),
});
export type ExtraccionEncuesta = z.infer<typeof ExtraccionEncuestaSchema>;
