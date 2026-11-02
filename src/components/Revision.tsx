"use client";

import { useEffect, useMemo, useState } from "react";
import type { ResultadoApi } from "@/lib/api-types";
import type { RevisionEstado, DestinoId, FilaCandidato, NotaNormalizacion } from "@/lib/revision-types";
import type { Catalogos } from "@/lib/catalogs-types";
import type { Confianza } from "@/lib/schema";
import { estadoInicialDesdeExtraccion, nuevaFilaCandidato } from "@/lib/estado-inicial";
import { normalizarEstado } from "@/lib/normalize";
import { ganador, escenarioCandidatoLista, sumaPorcentajes, mesDeFecha, type FormatoPorcentaje } from "@/lib/calculos";
import { construirFilas, destinoLabel, locationFieldDe } from "@/lib/filas";

function claseConfianza(c: Confianza): string {
  if (c === "media") return "conf-media";
  if (c === "baja") return "conf-baja";
  return "";
}

export default function Revision({ resultado, onSubido }: { resultado: ResultadoApi; onSubido?: () => void }) {
  const [estado, setEstado] = useState<RevisionEstado>(() => estadoInicialDesdeExtraccion(resultado.datos));
  const [catalogos, setCatalogos] = useState<Catalogos | null>(null);
  const [errorCatalogos, setErrorCatalogos] = useState<string | null>(null);
  const [verJson, setVerJson] = useState(false);
  const [subiendo, setSubiendo] = useState(false);
  const [errorSubida, setErrorSubida] = useState<string | null>(null);
  const [subidoInfo, setSubidoInfo] = useState<{ link: string; updatedRows: number; sheetTab: string } | null>(null);
  const [avisoSupabase, setAvisoSupabase] = useState<string | null>(null);

  // Nueva imagen escaneada -> reinicia el estado editable.
  useEffect(() => {
    setEstado(estadoInicialDesdeExtraccion(resultado.datos));
    setSubidoInfo(null);
    setErrorSubida(null);
  }, [resultado]);

  // Carga catalogs.json una vez.
  useEffect(() => {
    fetch("/api/catalogs")
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((data: Catalogos) => setCatalogos(data))
      .catch(() => setErrorCatalogos("No se pudieron cargar los catálogos (¿corriste `npm run catalogs`?)."));
  }, []);

  // Normalización automática en cuanto tenemos datos + catálogos.
  useEffect(() => {
    if (!catalogos) return;
    setEstado((prev) => normalizarEstado(prev, catalogos));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalogos, resultado]);

  function cambiarDestino(destino: DestinoId) {
    setEstado((prev) => {
      const next = { ...prev, destino };
      return catalogos ? normalizarEstado(next, catalogos) : next;
    });
  }

  function renormalizar() {
    if (catalogos) setEstado((prev) => normalizarEstado(prev, catalogos));
  }

  function actualizarGeneral<K extends keyof RevisionEstado>(campo: K, valor: RevisionEstado[K]) {
    setEstado((prev) => ({ ...prev, [campo]: valor }));
  }

  function actualizarEscenario(escId: string, patch: Partial<{ tipoEscenario: string; escenarioPartidos: string }>) {
    setEstado((prev) => ({
      ...prev,
      escenarios: prev.escenarios.map((e) => (e.id === escId ? { ...e, ...patch } : e)),
    }));
  }

  function actualizarFila(escId: string, filaId: string, patch: Partial<FilaCandidato>) {
    setEstado((prev) => ({
      ...prev,
      escenarios: prev.escenarios.map((e) =>
        e.id !== escId
          ? e
          : { ...e, candidatos: e.candidatos.map((f) => (f.id === filaId ? { ...f, ...patch } : f)) },
      ),
    }));
  }

  function agregarFila(escId: string) {
    setEstado((prev) => ({
      ...prev,
      escenarios: prev.escenarios.map((e) =>
        e.id === escId ? { ...e, candidatos: [...e.candidatos, nuevaFilaCandidato()] } : e,
      ),
    }));
  }

  function eliminarFila(escId: string, filaId: string) {
    setEstado((prev) => ({
      ...prev,
      escenarios: prev.escenarios.map((e) =>
        e.id === escId ? { ...e, candidatos: e.candidatos.filter((f) => f.id !== filaId) } : e,
      ),
    }));
  }

  const formatoPorcentaje: FormatoPorcentaje = useMemo(() => {
    if (!catalogos || !estado.destino) return "NN.N%";
    return estado.destino === "GUBERNATURA"
      ? catalogos.gubernatura.formatoPorcentaje.dominante
      : catalogos.alcaldes.formatoPorcentaje.dominante;
  }, [catalogos, estado.destino]);

  const filasConstruidas = useMemo(
    () => construirFilas(estado, estado.encuestadora, formatoPorcentaje),
    [estado, formatoPorcentaje],
  );

  const pendientesConfirmacion = useMemo(() => {
    let n = 0;
    if (estado.notaEncuestadora?.tipo === "nuevo" && !estado.encuestadoraConfirmada) n++;
    if (estado.notaUbicacion?.tipo === "nuevo" && !estado.ubicacionConfirmada) n++;
    if (estado.notaEstadoUbicacion?.tipo === "nuevo" && !estado.estadoUbicacionConfirmada) n++;
    for (const esc of estado.escenarios) {
      for (const f of esc.candidatos) {
        if (f.nota?.tipo === "nuevo" && !f.confirmadoNuevo) n++;
      }
    }
    return n;
  }, [estado]);

  const faltaEstado = estado.destino === "ALCALDES_OTROS_ESTADOS" && estado.estadoUbicacion.trim() === "";

  const puedeSubir =
    estado.destino !== null &&
    !faltaEstado &&
    pendientesConfirmacion === 0 &&
    !!filasConstruidas &&
    filasConstruidas.matriz.length > 0 &&
    !subiendo &&
    !subidoInfo;

  async function confirmarYSubir() {
    if (!filasConstruidas || !estado.destino) return;
    const confirmado = window.confirm(
      `Se agregarán ${filasConstruidas.matriz.length} filas a la hoja ${destinoLabel(estado.destino)}. ¿Confirmas?`,
    );
    if (!confirmado) return;
    setSubiendo(true);
    setErrorSubida(null);
    setAvisoSupabase(null);
    try {
      const res = await fetch("/api/sheets/append", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          destino: estado.destino,
          columnas: filasConstruidas.columnas,
          matriz: filasConstruidas.matriz,
          hash: resultado.hash,
          fecha: estado.fecha,
          encuestadora: estado.encuestadora,
          metodologia: estado.metodologia,
          ubicacion: estado.ubicacion,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `Error ${res.status}`);
      setSubidoInfo({ link: json.link, updatedRows: json.updatedRows, sheetTab: json.sheetTab });
      if (json.avisoSupabase) setAvisoSupabase(json.avisoSupabase);
    } catch (err) {
      setErrorSubida(err instanceof Error ? err.message : "Error desconocido al subir.");
    } finally {
      setSubiendo(false);
    }
  }

  const mes = mesDeFecha(estado.fecha);
  const ubicacionLabel = estado.destino ? locationFieldDe(estado.destino) : "Entidad / Municipio";

  return (
    <div>
      {!resultado.datos.esEncuestaValida && (
        <div className="alerta">Claude marcó esta imagen como no válida / no legible como encuesta.</div>
      )}
      {resultado.datos.advertencias.length > 0 && (
        <div className="alerta">
          {resultado.datos.advertencias.map((a, i) => (
            <div key={i}>⚠ {a}</div>
          ))}
        </div>
      )}
      {errorCatalogos && <div className="alerta">{errorCatalogos}</div>}

      <h3>Datos generales</h3>
      <div className="grid-campos">
        <Campo etiqueta="Fecha" confianza={resultado.datos.general.fecha.confianza}>
          <input
            className={claseConfianza(resultado.datos.general.fecha.confianza)}
            value={estado.fecha}
            onChange={(e) => actualizarGeneral("fecha", e.target.value)}
          />
          <span className="campo-ayuda">MES calculado: {mes || "—"}</span>
        </Campo>

        <Campo etiqueta="Encuestadora" confianza={resultado.datos.general.encuestadora.confianza}>
          <input
            className={claseConfianza(resultado.datos.general.encuestadora.confianza)}
            value={estado.encuestadora}
            onChange={(e) => actualizarGeneral("encuestadora", e.target.value)}
          />
          <NotaCampo
            nota={estado.notaEncuestadora}
            confirmada={!!estado.encuestadoraConfirmada}
            onConfirmar={() => actualizarGeneral("encuestadoraConfirmada", true)}
          />
        </Campo>

        {estado.destino === "ALCALDES_OTROS_ESTADOS" && (
          <Campo etiqueta="Estado" confianza="alta">
            <input
              className={estado.estadoUbicacion.trim() === "" ? "conf-baja" : ""}
              value={estado.estadoUbicacion}
              onChange={(e) => actualizarGeneral("estadoUbicacion", e.target.value)}
              placeholder="La imagen no suele traer el estado — escríbelo tú"
            />
            <NotaCampo
              nota={estado.notaEstadoUbicacion}
              confirmada={!!estado.estadoUbicacionConfirmada}
              onConfirmar={() => actualizarGeneral("estadoUbicacionConfirmada", true)}
            />
          </Campo>
        )}

        <Campo etiqueta={ubicacionLabel} confianza={resultado.datos.general.ubicacionValor.confianza}>
          <input
            className={claseConfianza(resultado.datos.general.ubicacionValor.confianza)}
            value={estado.ubicacion}
            onChange={(e) => actualizarGeneral("ubicacion", e.target.value)}
          />
          <NotaCampo
            nota={estado.notaUbicacion}
            confirmada={!!estado.ubicacionConfirmada}
            onConfirmar={() => actualizarGeneral("ubicacionConfirmada", true)}
          />
        </Campo>

        <Campo etiqueta="Metodología" confianza={resultado.datos.general.metodologia.confianza} ancho>
          <textarea
            className={claseConfianza(resultado.datos.general.metodologia.confianza)}
            value={estado.metodologia}
            onChange={(e) => actualizarGeneral("metodologia", e.target.value)}
            rows={2}
          />
        </Campo>
      </div>

      <div className="destino-grupo">
        <strong style={{ fontSize: "0.86rem" }}>Destino:</strong>
        <label className={`destino-opcion${estado.destino === "GUBERNATURA" ? " activo" : ""}`}>
          <input
            type="radio"
            name="destino"
            checked={estado.destino === "GUBERNATURA"}
            onChange={() => cambiarDestino("GUBERNATURA")}
          />
          Gubernatura
        </label>
        <label className={`destino-opcion${estado.destino === "ALCALDES" ? " activo" : ""}`}>
          <input
            type="radio"
            name="destino"
            checked={estado.destino === "ALCALDES"}
            onChange={() => cambiarDestino("ALCALDES")}
          />
          Alcaldes (NL)
        </label>
        <label className={`destino-opcion${estado.destino === "ALCALDES_OTROS_ESTADOS" ? " activo" : ""}`}>
          <input
            type="radio"
            name="destino"
            checked={estado.destino === "ALCALDES_OTROS_ESTADOS"}
            onChange={() => cambiarDestino("ALCALDES_OTROS_ESTADOS")}
          />
          Alcaldes (otros estados)
        </label>
        {!estado.destino && <span className="destino-falta">Selecciona un destino para continuar</span>}
        <button type="button" className="btn-secundario" onClick={renormalizar} style={{ marginLeft: "auto" }}>
          Normalizar de nuevo
        </button>
      </div>

      {estado.escenarios.map((esc) => {
        const g = ganador(esc.candidatos);
        const candidatoLista = escenarioCandidatoLista(esc.candidatos);
        const suma = sumaPorcentajes(esc.candidatos);
        return (
          <div key={esc.id} className="escenario">
            <div className="escenario-encabezado">
              <input
                value={esc.tipoEscenario}
                onChange={(e) => actualizarEscenario(esc.id, { tipoEscenario: e.target.value })}
              />
              <input
                value={esc.escenarioPartidos}
                onChange={(e) => actualizarEscenario(esc.id, { escenarioPartidos: e.target.value })}
                placeholder="Partidos del escenario (separados por coma)"
              />
            </div>
            <div className="tabla-scroll">
              <table className="candidatos">
                <colgroup>
                  <col className="col-partido" />
                  <col className="col-candidato" />
                  <col className="col-pct" />
                  <col className="col-accion" />
                </colgroup>
                <thead>
                  <tr>
                    <th>Partido</th>
                    <th>Candidato</th>
                    <th>%</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {esc.candidatos.map((f) => (
                    <tr key={f.id}>
                      <td>
                        <input
                          className={claseConfianza(f.confianzaPartido)}
                          value={f.partido}
                          onChange={(e) => actualizarFila(esc.id, f.id, { partido: e.target.value })}
                        />
                        {f.nota?.campo === "partido" && (
                          <NotaCelda
                            nota={f.nota}
                            confirmada={!!f.confirmadoNuevo}
                            onConfirmar={() => actualizarFila(esc.id, f.id, { confirmadoNuevo: true })}
                          />
                        )}
                      </td>
                      <td>
                        <input
                          className={claseConfianza(f.confianzaCandidato)}
                          value={f.candidato}
                          onChange={(e) => actualizarFila(esc.id, f.id, { candidato: e.target.value })}
                        />
                        {f.nota?.campo === "candidato" && (
                          <NotaCelda
                            nota={f.nota}
                            confirmada={!!f.confirmadoNuevo}
                            onConfirmar={() => actualizarFila(esc.id, f.id, { confirmadoNuevo: true })}
                          />
                        )}
                      </td>
                      <td>
                        <input
                          className={claseConfianza(f.confianzaPorcentaje)}
                          value={f.porcentaje}
                          onChange={(e) => actualizarFila(esc.id, f.id, { porcentaje: e.target.value })}
                        />
                      </td>
                      <td>
                        <button
                          type="button"
                          className="btn-icono"
                          onClick={() => eliminarFila(esc.id, f.id)}
                          title="Eliminar fila"
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button type="button" className="btn-secundario" onClick={() => agregarFila(esc.id)} style={{ marginTop: 8 }}>
              + Agregar candidato
            </button>
            <div className="escenario-resumen">
              Ganador: <strong>{g.partido || "—"}</strong> / <strong>{g.candidato || "—"}</strong>
              <br />
              Escenario Candidato: {candidatoLista || "—"}
              <br />
              Suma %:{" "}
              <span style={{ color: suma > 100.5 ? "var(--baja-border)" : undefined, fontWeight: 600 }}>
                {suma.toFixed(1)}%
              </span>
              {suma > 100.5 && " (revisa, supera 100%)"}
            </div>
          </div>
        );
      })}

      {pendientesConfirmacion > 0 && (
        <div className="alerta">
          Hay {pendientesConfirmacion} valor(es) nuevo(s) sin confirmar (no están en el catálogo histórico).
        </div>
      )}

      <h3>Vista previa de filas ({estado.destino ? destinoLabel(estado.destino) : "elige destino"})</h3>
      {filasConstruidas ? (
        <div className="tabla-scroll">
          <table className="vista-previa">
            <thead>
              <tr>
                {filasConstruidas.columnas.map((c) => (
                  <th key={c}>{c.trim()}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filasConstruidas.matriz.map((fila, i) => (
                <tr key={i}>
                  {fila.map((v, j) => (
                    <td key={j}>{v || "—"}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p style={{ color: "var(--text-muted)" }}>Selecciona un destino para ver las filas.</p>
      )}

      {errorSubida && <div className="alerta">{errorSubida}</div>}

      {subidoInfo ? (
        <div style={{ marginTop: 16 }}>
          <div className="alerta-ok">
            ✓ {subidoInfo.updatedRows} filas agregadas a {subidoInfo.sheetTab}.
          </div>
          {avisoSupabase && <div className="alerta">{avisoSupabase}</div>}
          <div className="fila">
            <a href={subidoInfo.link} target="_blank" rel="noreferrer">
              Ver en Google Sheets
            </a>
            {onSubido && (
              <button className="btn-primario" onClick={onSubido}>
                Siguiente imagen
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="fila" style={{ marginTop: 16 }}>
          <button
            className="btn-primario"
            disabled={!puedeSubir}
            title={
              !estado.destino
                ? "Selecciona un destino"
                : faltaEstado
                  ? "Escribe el estado"
                  : pendientesConfirmacion > 0
                    ? "Confirma los valores nuevos"
                    : undefined
            }
            onClick={confirmarYSubir}
          >
            {subiendo ? "Subiendo…" : `Confirmar y subir (${filasConstruidas?.matriz.length ?? 0} filas)`}
          </button>
        </div>
      )}

      <div className="meta-escaneo">
        Modelo: {resultado.modelo} · Tokens entrada/salida: {resultado.tokensEntrada}/{resultado.tokensSalida}
        {resultado.costoUsd !== null && <> · Costo estimado: ${resultado.costoUsd.toFixed(4)} USD</>}
      </div>

      <div className="json-crudo">
        <button className="btn-secundario" onClick={() => setVerJson((v) => !v)}>
          {verJson ? "Ocultar JSON crudo (debug)" : "Ver JSON crudo (debug)"}
        </button>
        {verJson && <pre>{JSON.stringify(resultado.datos, null, 2)}</pre>}
      </div>
    </div>
  );
}

function Campo({
  etiqueta,
  children,
  ancho,
}: {
  etiqueta: string;
  confianza: Confianza;
  children: React.ReactNode;
  ancho?: boolean;
}) {
  return (
    <div className={`campo${ancho ? " ancho" : ""}`}>
      <label>{etiqueta}</label>
      {children}
    </div>
  );
}

function NotaCampo({
  nota,
  confirmada,
  onConfirmar,
}: {
  nota?: NotaNormalizacion;
  confirmada: boolean;
  onConfirmar: () => void;
}) {
  if (!nota) return null;
  if (nota.tipo === "auto") {
    return <span className="badge-nota">↳ normalizado desde &quot;{nota.original}&quot;</span>;
  }
  return (
    <span className="badge-nota nueva">
      nuevo, no está en el catálogo
      <label>
        <input type="checkbox" checked={confirmada} onChange={onConfirmar} /> confirmar
      </label>
    </span>
  );
}

function NotaCelda({
  nota,
  confirmada,
  onConfirmar,
}: {
  nota: NotaNormalizacion;
  confirmada: boolean;
  onConfirmar: () => void;
}) {
  if (nota.tipo === "auto") {
    return <div className="badge-nota">↳ de &quot;{nota.original}&quot;</div>;
  }
  return (
    <div className="badge-nota nueva">
      nuevo
      <label>
        <input type="checkbox" checked={confirmada} onChange={onConfirmar} /> confirmar
      </label>
    </div>
  );
}
