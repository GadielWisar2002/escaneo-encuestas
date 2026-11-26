"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useMemo, useState } from "react";
import type { Feature, FeatureCollection } from "geojson";
import type { Layer, PathOptions } from "leaflet";
import { GeoJSON, MapContainer, TileLayer } from "react-leaflet";
import type { Lider } from "@/lib/dashboard-calc";
import { nombreMes } from "@/lib/dashboard-calc";
import { colorPartido } from "@/lib/colores";
import { estadoCanon } from "@/lib/dashboard-normalize";

// Contornos de los 32 estados (GeoJSON público, servido desde /public).
const URL_ESTADOS = "/geo/mexico-estados.json";
const SIN_DATOS = "#e3e7ed";

const escapar = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function textoTooltip(estado: string, l: Lider | undefined) {
  if (!l) return `<strong>${escapar(estado)}</strong><br/>Sin encuestas`;
  const partes = [`<strong>${escapar(estado)}</strong>`];
  if (l.lider) {
    partes.push(`Va arriba: <strong>${escapar(l.lider)}</strong> ${l.liderPct.toFixed(1)}%`);
    if (l.segundo) partes.push(`Segundo: ${escapar(l.segundo)} ${l.segundoPct.toFixed(1)}%`);
    partes.push(`${nombreMes(l.mes)} · ${l.casas} ${l.casas === 1 ? "casa" : "casas"}`);
  } else partes.push("Solo hay internas");
  partes.push(`${l.encuestas} encuestas · clic para ver detalle`);
  return partes.join("<br/>");
}

export default function Mapa({ lideres, onElegir }: { lideres: Lider[]; onElegir: (estado: string) => void }) {
  const [geo, setGeo] = useState<FeatureCollection | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    fetch(URL_ESTADOS)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then(setGeo)
      .catch(() => setError(true));
  }, []);

  const porEstado = useMemo(() => new Map(lideres.map((l) => [l.ubicacion, l])), [lideres]);
  const nombre = (f?: Feature) => estadoCanon(String(f?.properties?.name ?? ""));

  const estilo = (f?: Feature): PathOptions => {
    const l = porEstado.get(nombre(f));
    return {
      fillColor: l?.lider ? colorPartido(l.lider) : SIN_DATOS,
      fillOpacity: l?.lider ? 0.85 : 0.6,
      color: "#ffffff",
      weight: 1.5,
    };
  };

  const alCrear = (f: Feature, capa: Layer) => {
    const estado = nombre(f);
    const l = porEstado.get(estado);
    capa.bindTooltip(textoTooltip(estado, l), { sticky: true, direction: "top" });
    if (!l) return;
    capa.on({
      click: () => onElegir(estado),
      mouseover: (e) => e.target.setStyle({ weight: 3, color: "#1a2030" }),
      mouseout: (e) => e.target.setStyle({ weight: 1.5, color: "#ffffff" }),
    });
  };

  return (
    <div className="db-mapa">
      {error ? (
        <p className="db-vacio">No se pudo cargar el mapa de estados.</p>
      ) : (
        <MapContainer
          bounds={[
            [15.5, -116.5],
            [32.0, -87.5],
          ]}
          zoomSnap={0.25}
          minZoom={4}
          scrollWheelZoom={false}
          style={{ height: "100%", width: "100%", background: "#f3f5f8" }}
        >
          <TileLayer
            url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}"
            attribution="Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ"
            maxZoom={16}
          />
          {geo && (
            <GeoJSON
              key={lideres.map((l) => `${l.ubicacion}:${l.lider}`).join("|")}
              data={geo}
              style={estilo}
              onEachFeature={alCrear}
            />
          )}
        </MapContainer>
      )}
    </div>
  );
}
