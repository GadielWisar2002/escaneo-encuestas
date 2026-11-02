import { NextRequest, NextResponse } from "next/server";
import { pdfAPaginasPng } from "@/lib/pdf";

const MAX_BYTES = 20 * 1024 * 1024; // 20 MB
const MAX_PAGINAS = 20;

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const archivo = formData.get("pdf");

  if (!(archivo instanceof File)) {
    return NextResponse.json({ error: "Falta el archivo 'pdf'." }, { status: 400 });
  }
  if (archivo.size > MAX_BYTES) {
    return NextResponse.json({ error: "El PDF supera los 20 MB." }, { status: 400 });
  }
  if (archivo.type !== "application/pdf" && !/\.pdf$/i.test(archivo.name)) {
    return NextResponse.json({ error: `Tipo de archivo no soportado: ${archivo.type || "desconocido"}.` }, { status: 400 });
  }

  const buffer = Buffer.from(await archivo.arrayBuffer());

  try {
    const paginas = await pdfAPaginasPng(buffer);
    if (paginas.length === 0) {
      return NextResponse.json({ error: "El PDF no tiene páginas." }, { status: 400 });
    }
    if (paginas.length > MAX_PAGINAS) {
      return NextResponse.json(
        { error: `El PDF tiene ${paginas.length} páginas; el máximo soportado es ${MAX_PAGINAS}.` },
        { status: 400 },
      );
    }
    return NextResponse.json({
      paginas: paginas.map((p) => p.toString("base64")),
    });
  } catch (err) {
    console.error("Error al convertir PDF a imágenes:", err);
    return NextResponse.json({ error: "No se pudo leer el PDF (¿está dañado o protegido con contraseña?)." }, { status: 502 });
  }
}
