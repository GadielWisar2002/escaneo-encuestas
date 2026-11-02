import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Escaneo de Encuestas",
  description: "Extrae datos de encuestas electorales desde una imagen con Claude.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
