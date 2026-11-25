"use client";

import { useMemo, useState } from "react";
import type { DatosDashboard } from "@/lib/dashboard-types";
import { fechaCorta, nombreMes, textoFecha, unicos } from "@/lib/dashboard-calc";
import { colorPartido, GRIS_SENTINELA } from "@/lib/colores";
import { Selector } from "./Controles";

const TIPO_TEXTO = { Multipartidista: "Por partido", Careos: "Careo", Interna: "Interna", Otro: "Otro" } as const;

export default function PorEncuesta({ datos }: { datos: DatosDashboard }) {
  const [modulo, setModulo] = useState("");
  const [estado, setEstado] = useState("");
  const [casa, setCasa] = useState("");
  const [elegida, setElegida] = useState<number | null>(null);
  const [limite, setLimite] = useState(60);

  const escPorEncuesta = useMemo(() => {
    const m = new Map<number, number[]>();
    datos.escenarios.forEach((esc, i) => m.set(esc.e, [...(m.get(esc.e) ?? []), i]));
    return m;
  }, [datos]);
  const resPorEsc = useMemo(() => {
    const m = new Map<number, DatosDashboard["resultados"]>();
    for (const r of datos.resultados) m.set(r.s, [...(m.get(r.s) ?? []), r]);
    return m;
  }, [datos]);

  const lista = useMemo(
    () =>
      datos.encuestas
        .map((e, i) => ({ e, i }))
        .filter(({ e }) => (!modulo || e.modulo === modulo) && (!estado || e.estado === estado) && (!casa || e.encuestadora === casa))
        .sort((a, b) => Number(a.e.sinFecha) - Number(b.e.sinFecha) || b.e.fecha.localeCompare(a.e.fecha)),
    [datos, modulo, estado, casa],
  );
  const estados = unicos(datos.encuestas.filter((e) => !modulo || e.modulo === modulo).map((e) => e.estado)).sort();
  const casas = unicos(datos.encuestas.map((e) => e.encuestadora)).sort();
  const actual = elegida !== null && lista.some((x) => x.i === elegida) ? elegida : (lista[0]?.i ?? null);
  const enc = actual !== null ? datos.encuestas[actual] : null;

  return (
    <>
      <div className="db-filtros">
        <Selector
          etiqueta="Tipo de elección"
          valor={modulo}
          vacio="Todas"
          opciones={[
            { valor: "GUB", texto: "Gubernatura" },
            { valor: "ALC", texto: "Alcaldía" },
          ]}
          onCambio={(v) => {
            setModulo(v);
            setEstado("");
          }}
        />
        <Selector etiqueta="Estado" valor={estado} vacio="Todos" opciones={estados.map((e) => ({ valor: e, texto: e }))} onCambio={setEstado} />
        <Selector etiqueta="Encuestadora" valor={casa} vacio="Todas" opciones={casas.map((c) => ({ valor: c, texto: c }))} onCambio={setCasa} />
      </div>

      <div className="db-columnas">
        <section className="db-tarjeta" style={{ padding: 0 }}>
          <div className="db-lista">
            {lista.slice(0, limite).map(({ e, i }) => (
              <button key={e.id} type="button" className={`db-item ${i === actual ? "activo" : ""}`} onClick={() => setElegida(i)}>
                <div className="db-item-titulo">{e.modulo === "GUB" ? e.estado : `${e.municipio}, ${e.estado}`}</div>
                <div className="db-item-fila">
                  <span>{e.encuestadora}</span>
                  <span>{textoFecha(e)}</span>
                </div>
              </button>
            ))}
            {lista.length > limite && (
              <button type="button" className="btn-secundario db-mas" style={{ margin: 12 }} onClick={() => setLimite((l) => l + 100)}>
                Ver más ({lista.length - limite})
              </button>
            )}
            {!lista.length && <p className="db-vacio">Sin encuestas con estos filtros.</p>}
          </div>
        </section>

        <section className="db-tarjeta">
          {enc && actual !== null ? (
            <>
              <h2>
                {enc.encuestadora} · {enc.modulo === "GUB" ? `Gubernatura ${enc.estado}` : `Alcaldía ${enc.municipio}, ${enc.estado}`}
              </h2>
              <p className="db-tarjeta-sub">
                {enc.sinFecha
                  ? `Sin fecha de levantamiento (capturada el ${fechaCorta(enc.fecha)})`
                  : enc.fechaAprox
                    ? `Fecha aproximada: ${nombreMes(enc.mes)}`
                    : fechaCorta(enc.fecha)}
                {enc.fechaTexto && enc.fechaAprox ? ` (capturada como “${enc.fechaTexto}”)` : ""}
                {enc.metodologia ? ` · ${enc.metodologia}` : ""}
                {enc.sheetLink && (
                  <>
                    {" · "}
                    <a href={enc.sheetLink} target="_blank" rel="noreferrer">
                      Ver en la hoja ↗
                    </a>
                  </>
                )}
              </p>
              {(escPorEncuesta.get(actual) ?? []).map((s) => {
                const esc = datos.escenarios[s];
                const res = [...(resPorEsc.get(s) ?? [])].sort(
                  (a, b) => Number(a.sent) - Number(b.sent) || (b.v ?? -1) - (a.v ?? -1),
                );
                const max = Math.max(1, ...res.map((r) => r.v ?? 0));
                return (
                  <div key={s} className="db-escenario">
                    <h3>
                      {TIPO_TEXTO[esc.tipo]}
                      {esc.etiqueta ? ` · ${esc.etiqueta}` : ""}
                    </h3>
                    {res.map((r, j) => (
                      <div key={j} className="db-fila-barra">
                        <div className="nombre">
                          {esc.sujeto === "candidato" && r.c ? r.c : r.p || r.c || "—"}
                          {esc.sujeto === "candidato" && r.c && r.p && <small>{r.p}</small>}
                        </div>
                        <div className="pista">
                          <div
                            className="relleno"
                            style={{
                              width: `${((r.v ?? 0) / max) * 100}%`,
                              background: r.sent ? GRIS_SENTINELA : colorPartido(r.p),
                            }}
                          />
                        </div>
                        <div className="valor">{r.v === null ? "—" : `${r.v.toFixed(1)}%`}</div>
                      </div>
                    ))}
                  </div>
                );
              })}
            </>
          ) : (
            <p className="db-vacio">Elige una encuesta de la lista.</p>
          )}
        </section>
      </div>
    </>
  );
}
