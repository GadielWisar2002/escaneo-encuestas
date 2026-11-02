import Link from "next/link";
import { listarEncuestas } from "@/lib/dashboard-data";
import DashboardClient from "@/components/DashboardClient";

// Sin esto, Next.js prerenderiza la página en el build y las encuestas
// quedan congeladas desde ese momento — cada visita debe traer datos
// frescos de Supabase.
export const dynamic = "force-dynamic";

// Server component: lee Supabase con la service_role key en el servidor
// (igual que /api/scan) y le pasa los datos ya listos al cliente. La key
// nunca llega al navegador.
export default async function DashboardPage() {
  const encuestas = await listarEncuestas();

  return (
    <div className="contenedor">
      <div className="encabezado-dashboard">
        <h1 style={{ margin: 0 }}>Dashboard de Encuestas</h1>
        <Link href="/" className="btn-secundario">
          ← Escanear
        </Link>
      </div>
      <DashboardClient encuestas={encuestas} />
    </div>
  );
}
