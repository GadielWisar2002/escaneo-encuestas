import { NextRequest, NextResponse } from "next/server";
import { escanearEncuesta, ErrorEscaneo } from "@/lib/extract";
import { hashImagen } from "@/lib/hash";
import { buscarPorHash } from "@/lib/supabase";

const TIPOS_ACEPTADOS = new Set(["image/jpeg", "image/png", "image/heic", "image/heif"]);
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const archivo = formData.get("imagen");
  const forzar = formData.get("forzar") === "true";

  if (!(archivo instanceof File)) {
    return NextResponse.json({ error: "Falta el archivo 'imagen'." }, { status: 400 });
  }
  if (archivo.size > MAX_BYTES) {
    return NextResponse.json({ error: "La imagen supera los 10 MB." }, { status: 400 });
  }
  if (!TIPOS_ACEPTADOS.has(archivo.type) && !/\.(heic|heif)$/i.test(archivo.name)) {
    return NextResponse.json(
      { error: `Tipo de archivo no soportado: ${archivo.type || "desconocido"}. Usa JPG, PNG o HEIC.` },
      { status: 400 },
    );
  }

  const buffer = Buffer.from(await archivo.arrayBuffer());
  const hash = hashImagen(buffer);

  if (!forzar) {
    try {
      const previo = await buscarPorHash(hash);
      if (previo) {
        return NextResponse.json({
          duplicado: true,
          hash,
          registroPrevio: {
            fecha: previo.fecha,
            encuestadora: previo.encuestadora,
            destino: previo.destino,
            sheetLink: previo.sheet_link,
            creadoEn: previo.creado_en,
          },
        });
      }
    } catch (err) {
      // La verificación de duplicados es best-effort: si Supabase falla no
      // debe bloquear el escaneo normal.
      console.error("No se pudo verificar duplicados en Supabase:", err);
    }
  }

  try {
    const resultado = await escanearEncuesta(buffer, archivo.type, archivo.name);
    return NextResponse.json({ ...resultado, hash });
  } catch (err) {
    if (err instanceof ErrorEscaneo) {
      const status = err.codigo === "rate_limit" ? 429 : err.codigo === "timeout" ? 504 : 502;
      return NextResponse.json({ error: err.message, codigo: err.codigo }, { status });
    }
    console.error(err);
    return NextResponse.json({ error: "Error inesperado al escanear la imagen." }, { status: 500 });
  }
}
