import { NextRequest, NextResponse } from "next/server";
import destinationsConfig from "../../../../../destinations.json";
import { validarEncabezados, appendFilas, linkAHoja, ErrorSheets } from "@/lib/sheets";
import { registrarEncuesta } from "@/lib/supabase";

type DestinoConfig = { sheetTab: string; locationField: string; writeRange: string; columns: string[] };
const destinations = destinationsConfig as Record<string, DestinoConfig>;

type Body = {
  destino: "GUBERNATURA" | "ALCALDES" | "ALCALDES_OTROS_ESTADOS";
  columnas: string[];
  matriz: string[][];
  hash?: string;
  fecha?: string;
  encuestadora?: string;
  metodologia?: string;
  ubicacion?: string;
};

export async function POST(req: NextRequest) {
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido, se esperaba JSON." }, { status: 400 });
  }

  const cfg = destinations[body.destino];
  if (!cfg) {
    return NextResponse.json({ error: `Destino desconocido: ${body.destino}` }, { status: 400 });
  }

  const columnasEsperadas = cfg.columns;
  const columnasIguales =
    Array.isArray(body.columnas) &&
    body.columnas.length === columnasEsperadas.length &&
    body.columnas.every((c, i) => c === columnasEsperadas[i]);
  if (!columnasIguales) {
    return NextResponse.json(
      { error: "Las columnas enviadas no coinciden con destinations.json. Recarga y vuelve a intentar." },
      { status: 400 },
    );
  }

  if (!Array.isArray(body.matriz) || body.matriz.length === 0) {
    return NextResponse.json({ error: "No hay filas para subir." }, { status: 400 });
  }
  if (body.matriz.some((fila) => fila.length !== columnasEsperadas.length)) {
    return NextResponse.json({ error: "Alguna fila no tiene el número correcto de columnas." }, { status: 400 });
  }

  try {
    await validarEncabezados(cfg.sheetTab, columnasEsperadas);
    const { updatedRange, updatedRows, gid } = await appendFilas(cfg.sheetTab, body.matriz);
    const primeraCelda = updatedRange.split("!")[1]?.split(":")[0];
    const link = linkAHoja(process.env.GOOGLE_SHEET_ID, gid, primeraCelda);

    let avisoSupabase: string | undefined;
    if (body.hash) {
      try {
        await registrarEncuesta({
          hash_imagen: body.hash,
          destino: body.destino,
          sheet_tab: cfg.sheetTab,
          fecha: body.fecha ?? "",
          encuestadora: body.encuestadora ?? "",
          metodologia: body.metodologia ?? "",
          ubicacion: body.ubicacion ?? "",
          columnas: body.columnas,
          filas: body.matriz,
          sheet_link: link,
        });
      } catch (err) {
        // El Sheet ya quedó actualizado (fuente de verdad para el equipo);
        // un fallo en el respaldo/duplicados de Supabase no debe tumbar la
        // subida, pero sí avisarse.
        console.error("No se pudo guardar el respaldo en Supabase:", err);
        avisoSupabase = "Se subió a Google Sheets, pero no se pudo guardar el respaldo en Supabase.";
      }
    }

    return NextResponse.json({ ok: true, updatedRows, link, sheetTab: cfg.sheetTab, avisoSupabase });
  } catch (err) {
    if (err instanceof ErrorSheets) {
      const status =
        err.codigo === "sin_credenciales" ? 500 : err.codigo === "pestana_no_encontrada" ? 404 : 409;
      return NextResponse.json({ error: err.message, codigo: err.codigo }, { status });
    }
    console.error(err);
    return NextResponse.json({ error: "Error inesperado al subir a Google Sheets." }, { status: 500 });
  }
}
