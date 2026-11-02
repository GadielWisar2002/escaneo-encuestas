import Anthropic from "@anthropic-ai/sdk";

// Cliente único del backend. La API key nunca debe llegar al navegador:
// este archivo solo se importa desde server components / route handlers.
export const anthropic = new Anthropic();

export const CLAUDE_MODEL = process.env.CLAUDE_MODEL ?? "claude-opus-5-5";

// Precios por millón de tokens (USD), para estimar costo por escaneo.
// Actualiza si cambias CLAUDE_MODEL. Fuente: shared/live-sources.md del skill claude-api.
const PRECIOS_POR_MODELO: Record<string, { input: number; output: number }> = {
  "claude-opus-5-5": { input: 4.0, output: 20.0 },
  "claude-sonnet-5-5": { input: 2.0, output: 10.0 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5 },
};

export function estimarCostoUsd(
  modelo: string,
  inputTokens: number,
  outputTokens: number,
): number | null {
  const precios = PRECIOS_POR_MODELO[modelo];
  if (!precios) return null;
  return (inputTokens / 1_000_000) * precios.input + (outputTokens / 1_000_000) * precios.output;
}
