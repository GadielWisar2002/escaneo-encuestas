import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // sharp, heic-convert, pdfjs-dist y @napi-rs/canvas solo deben correr en
  // el servidor (API route), nunca empaquetarse para el cliente.
  serverExternalPackages: ["sharp", "heic-convert", "pdfjs-dist", "@napi-rs/canvas"],
  // Estos archivos se leen con fs en runtime (no se importan), así que el
  // tracer de Vercel no los detecta solo: hay que declararlos a mano o el
  // deploy funciona local pero falla en producción con ENOENT.
  outputFileTracingIncludes: {
    "/api/scan": ["./extraction-prompt.md"],
    "/api/catalogs": ["./catalogs/**/*"],
    // pdf.js importa su "worker" dinámicamente por ruta calculada en
    // runtime; el tracer de Vercel no lo detecta solo (igual que con
    // extraction-prompt.md arriba) y sin este archivo falla con
    // "Setting up fake worker failed: Cannot find module...".
    "/api/pdf/paginas": ["./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs"],
  },
};

export default nextConfig;
