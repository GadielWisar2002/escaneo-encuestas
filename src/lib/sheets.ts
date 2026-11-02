import { google, sheets_v4 } from "googleapis";
import path from "node:path";
import { existsSync } from "node:fs";

const SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];

export class ErrorSheets extends Error {
  codigo: "sin_credenciales" | "pestana_no_encontrada" | "encabezados_no_coinciden" | "api";
  detalle?: unknown;
  constructor(message: string, codigo: ErrorSheets["codigo"], detalle?: unknown) {
    super(message);
    this.codigo = codigo;
    this.detalle = detalle;
  }
}

let clienteCache: sheets_v4.Sheets | null = null;

export function getSheetsClient(): sheets_v4.Sheets {
  if (clienteCache) return clienteCache;

  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) {
    throw new ErrorSheets(
      "Falta GOOGLE_SERVICE_ACCOUNT_JSON en .env (ruta local al JSON, o el JSON completo como texto en producción).",
      "sin_credenciales",
    );
  }

  // En local es una ruta a un archivo (service-account.json); en Vercel no
  // hay filesystem persistente para subir ese archivo, así que ahí la
  // variable trae el JSON completo como texto. Detectamos cuál es.
  const pareceJson = raw.trim().startsWith("{");

  try {
    if (pareceJson) {
      const credentials = JSON.parse(raw);
      const auth = new google.auth.GoogleAuth({ credentials, scopes: SCOPES });
      clienteCache = google.sheets({ version: "v4", auth });
      return clienteCache;
    }

    // La ruta viene de env (no es estática): no se debe tracear/empaquetar.
    const keyFile = path.isAbsolute(raw)
      ? raw
      : path.join(/* turbopackIgnore: true */ process.cwd(), raw);

    // GoogleAuth no lee el archivo hasta la primera llamada real (sería un
    // error genérico tipo ENOENT más adelante, fuera de este try/catch).
    // Lo validamos aquí para dar un mensaje claro de una vez.
    if (!existsSync(keyFile)) {
      throw new ErrorSheets(
        `No se encontró el archivo de la cuenta de servicio en ${keyFile}. Sigue los pasos de configuración y guarda el JSON descargado ahí.`,
        "sin_credenciales",
      );
    }

    const auth = new google.auth.GoogleAuth({ keyFile, scopes: SCOPES });
    clienteCache = google.sheets({ version: "v4", auth });
    return clienteCache;
  } catch (err) {
    if (err instanceof ErrorSheets) throw err;
    throw new ErrorSheets(
      "No se pudo cargar la cuenta de servicio desde GOOGLE_SERVICE_ACCOUNT_JSON. ¿Seguiste los pasos de configuración?",
      "sin_credenciales",
      err,
    );
  }
}

function getSheetId(): string {
  const id = process.env.GOOGLE_SHEET_ID;
  if (!id) throw new ErrorSheets("Falta GOOGLE_SHEET_ID en .env.", "sin_credenciales");
  return id;
}

function colLetra(n: number): string {
  // 0 -> A, 25 -> Z, 26 -> AA, ...
  let s = "";
  let x = n;
  while (x >= 0) {
    s = String.fromCharCode((x % 26) + 65) + s;
    x = Math.floor(x / 26) - 1;
  }
  return s;
}

export async function obtenerGidDePestana(nombrePestana: string): Promise<number> {
  const sheets = getSheetsClient();
  const spreadsheetId = getSheetId();
  const meta = await sheets.spreadsheets.get({ spreadsheetId, fields: "sheets.properties" });
  const hoja = meta.data.sheets?.find((s) => s.properties?.title === nombrePestana);
  if (!hoja || hoja.properties?.sheetId == null) {
    throw new ErrorSheets(
      `La pestaña "${nombrePestana}" no existe en la hoja de Google configurada (GOOGLE_SHEET_ID).`,
      "pestana_no_encontrada",
    );
  }
  return hoja.properties.sheetId;
}

// Compara los encabezados reales de la pestaña contra destinations.json. Si
// no coinciden exactamente, aborta (nunca escribe a ciegas).
export async function validarEncabezados(nombrePestana: string, columnasEsperadas: string[]): Promise<void> {
  const sheets = getSheetsClient();
  const spreadsheetId = getSheetId();
  const ultimaCol = colLetra(columnasEsperadas.length - 1);
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `'${nombrePestana}'!A1:${ultimaCol}1`,
  });
  const encontrados = (res.data.values?.[0] ?? []).map((v) => String(v));
  const coincide =
    encontrados.length === columnasEsperadas.length &&
    encontrados.every((v, i) => v === columnasEsperadas[i]);
  if (!coincide) {
    throw new ErrorSheets(
      `Los encabezados de "${nombrePestana}" no coinciden con destinations.json. Esperados: [${columnasEsperadas.join(", ")}]. Encontrados: [${encontrados.join(", ")}].`,
      "encabezados_no_coinciden",
      { esperados: columnasEsperadas, encontrados },
    );
  }
}

export type ResultadoAppend = { updatedRange: string; updatedRows: number; gid: number };

export async function appendFilas(nombrePestana: string, matriz: string[][]): Promise<ResultadoAppend> {
  const sheets = getSheetsClient();
  const spreadsheetId = getSheetId();
  const ultimaCol = colLetra(matriz[0].length - 1);

  const [gid, res] = await Promise.all([
    obtenerGidDePestana(nombrePestana),
    sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `'${nombrePestana}'!A1:${ultimaCol}1`,
      valueInputOption: "USER_ENTERED",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values: matriz },
    }),
  ]);

  const updatedRange = res.data.updates?.updatedRange ?? "";
  const updatedRows = res.data.updates?.updatedRows ?? matriz.length;
  return { updatedRange, updatedRows, gid };
}

export function linkAHoja(spreadsheetIdOverride: string | undefined, gid: number, primeraCelda?: string): string {
  const spreadsheetId = spreadsheetIdOverride ?? getSheetId();
  const rango = primeraCelda ? `&range=${primeraCelda}` : "";
  return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit#gid=${gid}${rango}`;
}
