import sharp from "sharp";
import heicConvert from "heic-convert";

const LADO_LARGO_MAX = 1568; // recomendado por Anthropic para visión

export type ImagenPreparada = {
  base64: string;
  mediaType: "image/jpeg";
};

function esHeic(mime: string, nombreArchivo: string): boolean {
  return (
    mime === "image/heic" ||
    mime === "image/heif" ||
    /\.(heic|heif)$/i.test(nombreArchivo)
  );
}

// Redimensiona al lado largo máximo y convierte todo a JPEG (incluye HEIC→JPEG).
export async function prepararImagen(
  buffer: Buffer,
  mime: string,
  nombreArchivo: string,
): Promise<ImagenPreparada> {
  let entrada: Buffer = buffer;

  if (esHeic(mime, nombreArchivo)) {
    const jpegArrayBuffer = await heicConvert({
      buffer,
      format: "JPEG",
      quality: 0.92,
    });
    entrada = Buffer.from(jpegArrayBuffer);
  }

  const salida = await sharp(entrada)
    .rotate() // respeta orientación EXIF antes de medir/recortar
    .resize({
      width: LADO_LARGO_MAX,
      height: LADO_LARGO_MAX,
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: 90 })
    .toBuffer();

  return { base64: salida.toString("base64"), mediaType: "image/jpeg" };
}
