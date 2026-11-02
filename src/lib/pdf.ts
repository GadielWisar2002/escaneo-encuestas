import { createCanvas } from "@napi-rs/canvas";

const ESCALA = 2.5; // las gráficas de encuestas suelen tener texto pequeño

// Convierte cada página de un PDF a un PNG. Se usa para que las encuestas
// mandadas en PDF entren por el mismo camino que las imágenes sueltas: cada
// página termina siendo un archivo más en la cola de escaneo.
//
// pdfjs-dist (build "legacy", para Node) ya trae su propia NodeCanvasFactory
// basada en @napi-rs/canvas y la usa sola al detectar que corre en Node — no
// hace falta implementarla a mano. Para obtener el PNG de cada página, igual
// creamos nuestro propio canvas con @napi-rs/canvas y se lo pasamos a
// render() vía canvasContext, que es lo que nos deja llamar a toBuffer().
//
// No se configuran cMapUrl/standardFontDataUrl (rutas a node_modules vía
// require.resolve): eso se rompe en el bundle serverless de Vercel. Los PDFs
// de reportes de encuestadoras casi siempre traen las fuentes embebidas, así
// que no deberían necesitarse.
export async function pdfAPaginasPng(buffer: Buffer): Promise<Buffer[]> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");

  const tarea = pdfjs.getDocument({
    data: new Uint8Array(buffer),
  });

  const paginas: Buffer[] = [];

  try {
    const doc = await tarea.promise;
    for (let i = 1; i <= doc.numPages; i++) {
      const pagina = await doc.getPage(i);
      const viewport = pagina.getViewport({ scale: ESCALA });
      const canvas = createCanvas(viewport.width, viewport.height);
      const context = canvas.getContext("2d");
      await pagina.render({
        canvas: null,
        canvasContext: context as unknown as CanvasRenderingContext2D,
        viewport,
      }).promise;
      paginas.push(canvas.toBuffer("image/png"));
      pagina.cleanup();
    }
  } finally {
    await tarea.destroy();
  }

  return paginas;
}
