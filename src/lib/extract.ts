import { readFileSync } from "node:fs";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { anthropic, CLAUDE_MODEL, estimarCostoUsd } from "./anthropic";
import { ExtraccionEncuestaSchema, type ExtraccionEncuesta } from "./schema";
import { prepararImagen } from "./image-prep";

const PROMPT_PATH = path.join(process.cwd(), "extraction-prompt.md");

export type ResultadoEscaneo = {
  datos: ExtraccionEncuesta;
  tokensEntrada: number;
  tokensSalida: number;
  costoUsd: number | null;
  modelo: string;
};

export type CodigoErrorEscaneo = "timeout" | "rate_limit" | "api";

export class ErrorEscaneo extends Error {
  codigo: CodigoErrorEscaneo;
  constructor(message: string, codigo: CodigoErrorEscaneo) {
    super(message);
    this.codigo = codigo;
  }
}

export async function escanearEncuesta(
  buffer: Buffer,
  mime: string,
  nombreArchivo: string,
): Promise<ResultadoEscaneo> {
  const systemPrompt = readFileSync(PROMPT_PATH, "utf-8");
  const { base64, mediaType } = await prepararImagen(buffer, mime, nombreArchivo);

  try {
    // El SDK ya reintenta 429/5xx/errores de red con espera exponencial
    // (max_retries por defecto = 2); aquí solo traducimos el error a algo
    // legible para la UI si todos los reintentos fallan.
    const response = await anthropic.messages.parse(
      {
        model: CLAUDE_MODEL,
        max_tokens: 8000,
        system: systemPrompt,
        output_config: { format: zodOutputFormat(ExtraccionEncuestaSchema) },
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: { type: "base64", media_type: mediaType, data: base64 },
              },
              {
                type: "text",
                text: "Extrae los datos de esta encuesta electoral siguiendo las reglas del system prompt. Si la imagen no es legible o no es una encuesta, indícalo en esEncuestaValida y advertencias.",
              },
            ],
          },
        ],
      },
      { timeout: 60_000 },
    );

    if (!response.parsed_output) {
      throw new ErrorEscaneo(
        "Claude no devolvió datos estructurados válidos para esta imagen.",
        "api",
      );
    }

    const inputTokens = response.usage.input_tokens;
    const outputTokens = response.usage.output_tokens;

    return {
      datos: response.parsed_output,
      tokensEntrada: inputTokens,
      tokensSalida: outputTokens,
      costoUsd: estimarCostoUsd(CLAUDE_MODEL, inputTokens, outputTokens),
      modelo: CLAUDE_MODEL,
    };
  } catch (err) {
    if (err instanceof ErrorEscaneo) throw err;
    if (err instanceof Anthropic.RateLimitError) {
      throw new ErrorEscaneo(
        "Se alcanzó el límite de solicitudes a la API. Intenta de nuevo en unos segundos.",
        "rate_limit",
      );
    }
    if (err instanceof Anthropic.APIConnectionError) {
      throw new ErrorEscaneo(
        "No se pudo conectar con la API de Claude (timeout o red).",
        "timeout",
      );
    }
    if (err instanceof Anthropic.APIError) {
      throw new ErrorEscaneo(`Error de la API: ${err.message}`, "api");
    }
    throw err;
  }
}
