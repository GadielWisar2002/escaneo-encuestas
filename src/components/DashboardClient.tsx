"use client";

import { useMemo, useState } from "react";
import type { EncuestaResumen } from "@/lib/dashboard-data";

type Props = {
  encuestas: EncuestaResumen[];
};

const TODOS = "__todos__";

function formatearFechaCorta(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" });
}

export default function DashboardClient({ encuestas }: Props) {
  const [destino, setDestino] = useState<string>(TODOS);
  const [ubicacion, setUbicacion] = useState<string>(TODOS);
  const [encuestadora, setEncuestadora] = useState<string>(TODOS);
  const [seleccionadaId, setSeleccionadaId] = useState<string | null>(encuestas[0]?.id ?? null);

  const ubicaciones = useMemo(
    () => [...new Set(encuestas.map((e) => e.ubicacion).filter(Boolean))].sort(),
    [encuestas],
  );
  const encuestadoras = useMemo(
    () => [...new Set(encuestas.map((e) => e.encuestadora).filter(Boolean))].sort(),
    [encuestas],
  );

  const filtradas = useMemo(() => {
    return encuestas.filter((e) => {
      if (destino !== TODOS && e.destino !== destino) return false;
      if (ubicacion !== TODOS && e.ubicacion !== ubicacion) return false;
      if (encuestadora !== TODOS && e.encuestadora !== encuestadora) return false;
      return true;
    });
  }, [encuestas, destino, ubicacion, encuestadora]);

  const totalCandidatos = useMemo(
    () => new Set(filtradas.flatMap((e) => e.escenarios.flatMap((es) => es.candidatos.map((c) => c.candidato)))).size,
    [filtradas],
  );

  const seleccionada = filtradas.find((e) => e.id === seleccionadaId) ?? filtradas[0] ?? null;

  if (encuestas.length === 0) {
    return (
      <div className="panel">
        <p style={{ color: "var(--text-muted)" }}>
          Todavía no hay encuestas guardadas.{" "}
          <a href="/">Escanea la primera</a>.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="tarjetas-resumen">
        <div className="tarjeta-resumen">
          <span className="tarjeta-numero">{filtradas.length}</span>
          <span className="tarjeta-etiqueta">Encuestas</span>
        </div>
        <div className="tarjeta-resumen">
          <span className="tarjeta-numero">{ubicaciones.length}</span>
          <span className="tarjeta-etiqueta">Ubicaciones</span>
        </div>
        <div className="tarjeta-resumen">
          <span className="tarjeta-numero">{encuestadoras.length}</span>
          <span className="tarjeta-etiqueta">Encuestadoras</span>
        </div>
        <div className="tarjeta-resumen">
          <span className="tarjeta-numero">{totalCandidatos}</span>
          <span className="tarjeta-etiqueta">Candidatos distintos</span>
        </div>
      </div>

      <div className="barra-filtros">
        <div className="campo">
          <label>Destino</label>
          <select value={destino} onChange={(e) => setDestino(e.target.value)}>
            <option value={TODOS}>Todos</option>
            <option value="GUBERNATURA">Gubernatura</option>
            <option value="ALCALDES">Alcaldes</option>
          </select>
        </div>
        <div className="campo">
          <label>Ubicación</label>
          <select value={ubicacion} onChange={(e) => setUbicacion(e.target.value)}>
            <option value={TODOS}>Todas</option>
            {ubicaciones.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </div>
        <div className="campo">
          <label>Encuestadora</label>
          <select value={encuestadora} onChange={(e) => setEncuestadora(e.target.value)}>
            <option value={TODOS}>Todas</option>
            {encuestadoras.map((e) => (
              <option key={e} value={e}>
                {e}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="columnas">
        <div className="panel" style={{ padding: 0 }}>
          <div className="lista-encuestas">
            {filtradas.length === 0 && (
              <p style={{ color: "var(--text-muted)", padding: 16 }}>Nada coincide con estos filtros.</p>
            )}
            {filtradas.map((e) => (
              <button
                key={e.id}
                type="button"
                className={`item-encuesta${e.id === seleccionada?.id ? " activo" : ""}`}
                onClick={() => setSeleccionadaId(e.id)}
              >
                <div className="item-encuesta-fila1">
                  <span className={`chip-destino ${e.destino === "GUBERNATURA" ? "gub" : "alc"}`}>
                    {e.destino === "GUBERNATURA" ? "Gubernatura" : "Alcaldes"}
                  </span>
                  <span className="item-encuesta-ubicacion">{e.ubicacion || "—"}</span>
                </div>
                <div className="item-encuesta-fila2">
                  <span>{e.encuestadora || "—"}</span>
                  <span>{e.fecha || formatearFechaCorta(e.creadoEn)}</span>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="panel">
          {!seleccionada ? (
            <p style={{ color: "var(--text-muted)" }}>Selecciona una encuesta de la lista.</p>
          ) : (
            <DetalleEncuesta encuesta={seleccionada} />
          )}
        </div>
      </div>
    </>
  );
}

function DetalleEncuesta({ encuesta }: { encuesta: EncuestaResumen }) {
  return (
    <div>
      <div className="detalle-encabezado">
        <h2 style={{ margin: 0, fontSize: "1.05rem" }}>
          {encuesta.ubicacion || "Sin ubicación"} — {encuesta.encuestadora || "Sin encuestadora"}
        </h2>
        <span className="detalle-fecha">{encuesta.fecha}</span>
      </div>
      {encuesta.metodologia && <p className="detalle-metodologia">{encuesta.metodologia}</p>}
      {encuesta.sheetLink && (
        <p>
          <a href={encuesta.sheetLink} target="_blank" rel="noreferrer">
            Ver fuente en Google Sheets
          </a>
        </p>
      )}

      {encuesta.escenarios.map((esc, i) => (
        <div key={i} className="escenario">
          <div className="escenario-encabezado" style={{ marginBottom: 12 }}>
            <strong>{esc.tipoEscenario || "Escenario"}</strong>
            {esc.escenarioPartidos && (
              <span style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>{esc.escenarioPartidos}</span>
            )}
          </div>
          <div className="barras-candidatos">
            {esc.candidatos.map((c, j) => {
              const pct = c.porcentaje ?? 0;
              const esGanador = j === 0 && c.porcentaje !== null;
              return (
                <div key={j} className="fila-barra">
                  <div className="fila-barra-etiqueta">
                    <span className="fila-barra-candidato">
                      {c.candidato || "—"}
                      {esGanador && <span className="badge-ganador">1º</span>}
                    </span>
                    <span className="fila-barra-partido">{c.partido}</span>
                  </div>
                  <div className="fila-barra-pista">
                    <div
                      className={`fila-barra-relleno${esGanador ? " ganador" : ""}`}
                      style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
                    />
                  </div>
                  <span className="fila-barra-valor">{c.porcentajeTexto || "—"}</span>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
