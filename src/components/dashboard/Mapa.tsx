"use client";

import "leaflet/dist/leaflet.css";
import { CircleMarker, MapContainer, TileLayer, Tooltip } from "react-leaflet";
import type { Lider } from "@/lib/dashboard-calc";
import { nombreMes } from "@/lib/dashboard-calc";
import { colorPartido } from "@/lib/colores";

const COORDENADAS: Record<string, [number, number]> = {
  Aguascalientes: [21.88, -102.3],
  "Baja California": [30.84, -116.6],
  "Baja California Sur": [26.04, -111.67],
  Campeche: [19.83, -90.53],
  Chiapas: [16.75, -93.11],
  Chihuahua: [28.63, -106.07],
  "Ciudad de México": [19.43, -99.13],
  Coahuila: [27.06, -101.7],
  Colima: [19.24, -103.72],
  Durango: [24.02, -104.66],
  Guanajuato: [21.02, -101.26],
  Guerrero: [17.55, -100.36],
  Hidalgo: [20.12, -98.74],
  Jalisco: [20.66, -103.35],
  "Estado de México": [19.36, -99.89],
  Michoacán: [19.57, -101.97],
  Morelos: [18.68, -99.1],
  Nayarit: [21.75, -104.85],
  "Nuevo León": [25.69, -100.32],
  Oaxaca: [17.07, -96.73],
  Puebla: [18.87, -98.2],
  Querétaro: [20.59, -100.39],
  "Quintana Roo": [19.18, -88.5],
  "San Luis Potosí": [22.16, -100.98],
  Sinaloa: [24.81, -107.39],
  Sonora: [29.07, -110.96],
  Tabasco: [17.99, -92.92],
  Tamaulipas: [24.27, -98.83],
  Tlaxcala: [19.31, -98.24],
  Veracruz: [19.18, -96.16],
  Yucatán: [20.97, -89.62],
  Zacatecas: [22.77, -102.56],
};

export default function Mapa({ lideres, onElegir }: { lideres: Lider[]; onElegir: (estado: string) => void }) {
  const max = Math.max(1, ...lideres.map((l) => l.encuestas));
  return (
    <div className="db-mapa">
      <MapContainer bounds={[[15.5, -116.5], [32.0, -87.5]]} zoomSnap={0.25} minZoom={4} scrollWheelZoom={false} style={{ height: "100%", width: "100%" }}>
        <TileLayer
          url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}"
          attribution="Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ"
          maxZoom={16}
        />
        {lideres
          .filter((l) => COORDENADAS[l.ubicacion])
          .map((l) => (
            <CircleMarker
              key={l.ubicacion}
              center={COORDENADAS[l.ubicacion]}
              radius={9 + 13 * Math.sqrt(l.encuestas / max)}
              pathOptions={{ color: "#fff", weight: 2, fillColor: colorPartido(l.lider), fillOpacity: 0.9 }}
              eventHandlers={{ click: () => onElegir(l.ubicacion) }}
            >
              <Tooltip direction="top" offset={[0, -6]}>
                <strong>{l.ubicacion}</strong>
                <br />
                {l.lider ? (
                  <>
                    Va arriba: <strong>{l.lider}</strong> {l.liderPct.toFixed(1)}%
                    {l.segundo && (
                      <>
                        <br />
                        Segundo: {l.segundo} {l.segundoPct.toFixed(1)}%
                      </>
                    )}
                    <br />
                    {nombreMes(l.mes)} · {l.casas} {l.casas === 1 ? "casa" : "casas"}
                  </>
                ) : (
                  "Solo hay internas"
                )}
                <br />
                {l.encuestas} encuestas · clic para ver detalle
              </Tooltip>
            </CircleMarker>
          ))}
      </MapContainer>
    </div>
  );
}
