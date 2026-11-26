import Link from "next/link";
import { cargarDatosDashboard } from "@/lib/dashboard-data";
import DashboardApp from "@/components/dashboard/DashboardApp";

// Sin esto, Next.js prerenderiza la página en el build y las encuestas
// quedan congeladas desde ese momento — cada visita debe traer datos
// frescos de Supabase.
export const dynamic = "force-dynamic";

// Server component: lee Supabase con la service_role key en el servidor
// (igual que /api/scan), normaliza los datos y le pasa al cliente solo lo
// necesario para las gráficas. La key nunca llega al navegador.
export default async function DashboardPage() {
  const datos = await cargarDatosDashboard();

  return (
    <div className="contenedor" style={{ maxWidth: 1280 }}>
      <div className="encabezado-dashboard">
        <h1 style={{ margin: 0 }}>Monitoreo de Encuestas</h1>
        <Link href="/" className="btn-secundario">
          ← Escanear
        </Link>
      </div>
      <DashboardApp datos={datos} />
    </div>
  );
}
