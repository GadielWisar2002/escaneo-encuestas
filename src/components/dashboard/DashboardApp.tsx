"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import type { DatosDashboard, Modulo, Tipo } from "@/lib/dashboard-types";
import * as C from "@/lib/dashboard-calc";
import { CATEGORICA, colorPartido, GRIS_SENTINELA } from "@/lib/colores";
import { BarrasPorCasa, BarrasPromedio, LineaTendencia, type Colorear } from "./Graficas";
import { MultiSelector, Segmentos, Selector } from "./Controles";
import PorEncuesta from "./PorEncuesta";

const Mapa = dynamic(() => import("./Mapa"), {
  ssr: false,
  loading: () => <div className="db-mapa db-vacio">Cargando mapa…</div>,
});

type Pestana = Modulo | "ENC";

const TIPOS_TEXTO: Record<Tipo, string> = {
  Multipartidista: "Por partido",
  Careos: "Careos",
  Interna: "Internas",
  Aspirante: "Un aspirante",
  Otro: "Otros",
};

const contarPor = (xs: string[]) => {
  const m = new Map<string, number>();
  for (const x of xs) m.set(x, (m.get(x) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
};

export default function DashboardApp({ datos }: { datos: DatosDashboard }) {
  const [pestana, setPestana] = useState<Pestana>("GUB");
  const [estado, setEstado] = useState("");
  const [municipio, setMunicipio] = useState("");
  const [tipoElegido, setTipo] = useState<Tipo | "">("");
  const [internaElegida, setInterna] = useState("");
  const [casas, setCasas] = useState<string[]>([]);
  const [meses, setMeses] = useState<string[]>([]);
  const [sujetos, setSujetos] = useState<string[]>([]);
  const [base, setBase] = useState<C.Base>("efectiva");

  const modulo: Modulo = pestana === "ALC" ? "ALC" : "GUB";

  const reiniciarDesde = (nivel: "modulo" | "estado" | "municipio" | "tipo") => {
    if (nivel === "modulo") setEstado("");
    if (nivel === "modulo" || nivel === "estado") setMunicipio("");
    setTipo("");
    setInterna("");
    setCasas([]);
    setMeses([]);
    setSujetos([]);
    if (nivel === "tipo") return;
  };

  // ---------- Opciones en cascada ----------
  const estados = useMemo(
    () => contarPor(datos.encuestas.filter((e) => e.modulo === modulo).map((e) => e.estado)),
    [datos, modulo],
  );
  const municipios = useMemo(
    () =>
      contarPor(
        datos.encuestas.filter((e) => e.modulo === "ALC" && (!estado || e.estado === estado)).map((e) => e.municipio),
      ),
    [datos, estado],
  );
  const listo = modulo === "GUB" ? !!estado : !!municipio;

  const ubIdx = useMemo(
    () => (listo ? C.escenariosDeUbicacion(datos, { modulo, estado, municipio }) : []),
    [datos, listo, modulo, estado, municipio],
  );
  const tipos = useMemo(() => C.tiposDisponibles(datos, ubIdx), [datos, ubIdx]);
  const tipo: Tipo | "" = tipoElegido && tipos.includes(tipoElegido) ? tipoElegido : (tipos[0] ?? "");
  const conPartido = tipo === "Interna" || tipo === "Aspirante";
  const internas = useMemo(() => C.internasDisponibles(datos, ubIdx, tipo), [datos, ubIdx, tipo]);
  const interna = conPartido ? (internas.includes(internaElegida) ? internaElegida : (internas[0] ?? "")) : "";

  const tipoIdx = useMemo(() => C.porTipo(datos, ubIdx, { tipo, interna }), [datos, ubIdx, tipo, interna]);
  const porBloque = tipo === "Multipartidista";
  const leerPuntos = (idx: number[]) =>
    porBloque ? C.puntosPorBloque(datos, idx, base) : C.puntos(datos, idx, base);

  const casasOpciones = useMemo(
    () => contarPor(tipoIdx.map((i) => datos.encuestas[datos.escenarios[i].e].encuestadora)),
    [datos, tipoIdx],
  );
  const mesesOpciones = useMemo(
    () => C.unicos(tipoIdx.map((i) => datos.encuestas[datos.escenarios[i].e].mes)).sort().reverse(),
    [datos, tipoIdx],
  );
  const finIdx = useMemo(() => C.porCasaYMes(datos, tipoIdx, { casas, meses }), [datos, tipoIdx, casas, meses]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const ps = useMemo(() => leerPuntos(finIdx), [datos, finIdx, porBloque, base]);
  const proms = useMemo(() => C.promedios(ps), [ps]);

  // El color de cada candidato se fija antes de filtrar por casa o mes, para que no cambie al filtrar.
  const rangoEstable = useMemo(() => {
    const base = C.promedios(leerPuntos(tipoIdx)).filter((p) => !p.sent);
    return new Map(base.map((p, i) => [p.sujeto, i]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datos, tipoIdx, porBloque, base]);

  const colorear: Colorear = (sujeto, partido, sent) => {
    if (sent) return GRIS_SENTINELA;
    if (tipo === "Interna" || tipo === "Aspirante") {
      const r = rangoEstable.get(sujeto);
      return r !== undefined && r < CATEGORICA.length ? CATEGORICA[r] : "#78776f";
    }
    return colorPartido(porBloque ? sujeto : partido);
  };
  const partidoDe = (s: string) => proms.find((p) => p.sujeto === s)?.partido ?? "";

  const sujetosOpciones = proms.filter((p) => !p.sent).map((p) => p.sujeto);
  const seleccion = sujetos.filter((s) => sujetosOpciones.includes(s));
  const series = seleccion.length ? seleccion : C.principales(proms, tipo === "Interna" ? 6 : 5);
  const datosTendencia = useMemo(() => C.tendencia(ps, series), [ps, series.join("|")]); // eslint-disable-line react-hooks/exhaustive-deps
  const datosCasas = useMemo(() => C.ultimaPorCasa(ps, series.slice(0, 5)), [ps, series.join("|")]); // eslint-disable-line react-hooks/exhaustive-deps
  const promsVisibles = seleccion.length ? proms.filter((p) => p.sent || seleccion.includes(p.sujeto)) : proms;

  // ---------- Indicadores ----------
  const encuestasFin = C.unicos(finIdx.map((i) => datos.escenarios[i].e));
  const ultima =
    encuestasFin
      .filter((e) => !datos.encuestas[e].sinFecha)
      .map((e) => datos.encuestas[e].fecha)
      .sort()
      .at(-1) ?? "";
  const reales = proms.filter((p) => !p.sent);
  const ventaja = reales.length > 1 ? reales[0].promedio - reales[1].promedio : null;

  const lideres = useMemo(() => C.lideresPorUbicacion(datos, "GUB"), [datos]);
  const lideresMun = useMemo(() => C.lideresPorUbicacion(datos, "ALC", estado), [datos, estado]);
  const ubicacionTexto = modulo === "GUB" ? estado : `${municipio}, ${estado || datos.encuestas.find((e) => e.municipio === municipio)?.estado}`;

  const que = tipo === "Interna" ? `interna de ${interna}` : tipo === "Aspirante" ? `aspirantes de ${interna} medidos solos` : tipo === "Careos" ? "careos" : "preferencia por partido";
  const subjetoTexto = porBloque ? "partido" : "candidato";

  return (
    <>
      <div className="db-tabs" role="tablist">
        {(
          [
            ["GUB", "Gubernaturas"],
            ["ALC", "Alcaldías"],
            ["ENC", "Por encuesta"],
          ] as [Pestana, string][]
        ).map(([p, t]) => (
          <button
            key={p}
            role="tab"
            aria-selected={pestana === p}
            className={`db-tab ${pestana === p ? "activo" : ""}`}
            onClick={() => {
              if (p !== pestana) {
                setPestana(p);
                reiniciarDesde("modulo");
              }
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {pestana === "ENC" ? (
        <PorEncuesta datos={datos} />
      ) : (
        <>
          <div className="db-filtros">
            <Selector
              etiqueta={modulo === "GUB" ? "Estado" : "Estado"}
              valor={estado}
              vacio={modulo === "GUB" ? "Elige un estado…" : "Todos los estados"}
              opciones={estados.map(([e, n]) => ({ valor: e, texto: `${e} (${n})` }))}
              onCambio={(v) => {
                setEstado(v);
                reiniciarDesde("estado");
              }}
            />
            {modulo === "ALC" && (
              <Selector
                etiqueta="Municipio"
                valor={municipio}
                vacio="Elige un municipio…"
                opciones={municipios.map(([m, n]) => ({ valor: m, texto: `${m} (${n})` }))}
                onCambio={(v) => {
                  setMunicipio(v);
                  if (!estado) setEstado(datos.encuestas.find((e) => e.modulo === "ALC" && e.municipio === v)?.estado ?? "");
                  reiniciarDesde("municipio");
                }}
              />
            )}
            {listo && tipos.length > 0 && (
              <Segmentos<Tipo>
                etiqueta="Escenario"
                valor={tipo as Tipo}
                opciones={tipos.map((t) => ({ valor: t, texto: TIPOS_TEXTO[t] }))}
                onCambio={(v) => {
                  setTipo(v);
                  setInterna("");
                  setSujetos([]);
                }}
              />
            )}
            {listo && conPartido && (
              <Selector
                etiqueta="Partido"
                valor={interna}
                opciones={internas.map((p) => ({ valor: p, texto: p }))}
                onCambio={(v) => {
                  setInterna(v);
                  setSujetos([]);
                }}
              />
            )}
            {listo && (
              <>
                <MultiSelector
                  etiqueta="Encuestadora"
                  seleccion={casas.filter((c) => casasOpciones.some(([x]) => x === c))}
                  opciones={casasOpciones.map(([c, n]) => ({ valor: c, texto: `${c} (${n})` }))}
                  onCambio={setCasas}
                />
                <MultiSelector
                  etiqueta="Mes"
                  todos="Todos"
                  seleccion={meses.filter((m) => mesesOpciones.includes(m))}
                  opciones={mesesOpciones.map((m) => ({ valor: m, texto: C.nombreMes(m) }))}
                  onCambio={setMeses}
                />
                <Segmentos<C.Base>
                  etiqueta="Base de los porcentajes"
                  valor={base}
                  opciones={[
                    { valor: "efectiva", texto: "Comparable" },
                    { valor: "publicada", texto: "Como la publica cada casa" },
                  ]}
                  onCambio={setBase}
                />
                <MultiSelector
                  etiqueta={porBloque ? "Partidos" : "Candidatos"}
                  todos={`Principales (${series.length})`}
                  seleccion={seleccion}
                  opciones={sujetosOpciones.map((s) => ({ valor: s, texto: s }))}
                  onCambio={setSujetos}
                />
              </>
            )}
          </div>

          {!listo ? (
            modulo === "GUB" ? (
              <Panorama lideres={lideres} onElegir={(e) => { setEstado(e); reiniciarDesde("estado"); }} />
            ) : (
              <PanoramaMunicipios
                lideres={lideresMun}
                estadoDe={(m) => datos.encuestas.find((e) => e.modulo === "ALC" && e.municipio === m)?.estado ?? ""}
                onElegir={(m, e) => {
                  setEstado(e);
                  setMunicipio(m);
                  reiniciarDesde("municipio");
                }}
              />
            )
          ) : !tipoIdx.length ? (
            <p className="db-vacio">No hay escenarios para {ubicacionTexto}.</p>
          ) : (
            <>
              <div className="db-kpis">
                <Kpi etiqueta="Encuestas" valor={String(encuestasFin.length)} nota={`${ps.length} mediciones`} />
                <Kpi etiqueta="Encuestadoras" valor={String(C.unicos(encuestasFin.map((e) => datos.encuestas[e].encuestadora)).length)} />
                <Kpi etiqueta="Última medición" valor={C.fechaCorta(ultima)} chico />
                <Kpi
                  etiqueta={`Va arriba (promedio)`}
                  valor={reales[0]?.sujeto ?? "—"}
                  nota={reales[0] ? `${reales[0].promedio.toFixed(1)}%` : undefined}
                  chico
                />
                <Kpi
                  etiqueta="Ventaja sobre el 2º"
                  valor={ventaja === null ? "—" : `${ventaja.toFixed(1)} pts`}
                  nota={reales[1] ? `vs ${reales[1].sujeto}` : undefined}
                />
              </div>

              <div className="db-rejilla dos">
                <section className="db-tarjeta">
                  <h2>Promedio por {subjetoTexto}</h2>
                  <p className="db-tarjeta-sub">
                    {ubicacionTexto} · {que} · promedio de casas (cada encuestadora pesa igual)
                    {base === "efectiva"
                      ? "; porcentaje entre quienes eligen una opción (sin “ninguno” ni “no sabe”), para comparar casas que publican sobre bases distintas"
                      : "; cifras tal como las publicó cada casa"}
                    {porBloque ? "; cada coalición cuenta para el partido que la encabeza" : ""}
                  </p>
                  <BarrasPromedio datos={promsVisibles} colorear={colorear} />
                </section>
                <section className="db-tarjeta">
                  <h2>Última medición de cada encuestadora</h2>
                  <p className="db-tarjeta-sub">Compara las casas con su levantamiento más reciente (fecha bajo cada nombre)</p>
                  <BarrasPorCasa datos={datosCasas} series={series.slice(0, 5)} partidoDe={partidoDe} colorear={colorear} />
                </section>
              </div>

              <section className="db-tarjeta" style={{ marginBottom: 16 }}>
                <h2>Tendencia en el tiempo</h2>
                <p className="db-tarjeta-sub">
                  Cada punto es el promedio de las mediciones de ese día; sin “ninguno” ni “no sabe”
                </p>
                <LineaTendencia datos={datosTendencia} series={series} partidoDe={partidoDe} colorear={colorear} />
              </section>

              <TablaMediciones datos={datos} idx={finIdx} />
            </>
          )}
        </>
      )}
    </>
  );
}

function Kpi({ etiqueta, valor, nota, chico }: { etiqueta: string; valor: string; nota?: string; chico?: boolean }) {
  return (
    <div className="db-kpi">
      <div className="db-kpi-etiqueta">{etiqueta}</div>
      <div className={`db-kpi-valor ${chico ? "chico" : ""}`}>{valor}</div>
      {nota && <div className="db-kpi-nota">{nota}</div>}
    </div>
  );
}

function Chip({ partido }: { partido: string }) {
  if (!partido) return <span className="db-tenue">—</span>;
  return (
    <span className="db-chip">
      <i className="db-punto" style={{ background: colorPartido(partido) }} />
      {partido}
    </span>
  );
}

function Panorama({ lideres, onElegir }: { lideres: C.Lider[]; onElegir: (estado: string) => void }) {
  const partidos = C.unicos(lideres.map((l) => l.lider).filter(Boolean));
  return (
    <>
      <div className="db-ayuda">Elige un estado arriba, o haz clic en el mapa o en la tabla, para ver sus gráficas.</div>
      <div className="db-rejilla dos">
        <section className="db-tarjeta">
          <h2>Quién va arriba en cada estado</h2>
          <p className="db-tarjeta-sub">
            Cada estado se pinta del partido con mayor promedio en el mes más reciente con mediciones generales; en gris, sin encuestas
          </p>
          <div className="db-leyenda">
            {partidos.map((p) => (
              <span key={p}>
                <i className="db-punto" style={{ background: colorPartido(p) }} />
                {p}
              </span>
            ))}
            <span>
              <i className="db-punto" style={{ background: "#e3e7ed" }} />
              Sin encuestas
            </span>
          </div>
          <Mapa lideres={lideres} onElegir={onElegir} />
        </section>
        <section className="db-tarjeta">
          <h2>Resumen por estado</h2>
          <p className="db-tarjeta-sub">Mes más reciente con mediciones por partido o careos</p>
          <TablaLideres lideres={lideres} columna="Estado" onElegir={(l) => onElegir(l.ubicacion)} />
        </section>
      </div>
    </>
  );
}

function PanoramaMunicipios({
  lideres,
  estadoDe,
  onElegir,
}: {
  lideres: C.Lider[];
  estadoDe: (m: string) => string;
  onElegir: (municipio: string, estado: string) => void;
}) {
  return (
    <>
      <div className="db-ayuda">Elige un municipio arriba, o haz clic en la tabla, para ver sus gráficas.</div>
      <section className="db-tarjeta">
        <h2>Resumen por municipio</h2>
        <p className="db-tarjeta-sub">Partido con mayor promedio en el mes más reciente con mediciones por partido o careos</p>
        <TablaLideres
          lideres={lideres}
          columna="Municipio"
          estadoDe={estadoDe}
          onElegir={(l) => onElegir(l.ubicacion, estadoDe(l.ubicacion))}
        />
      </section>
    </>
  );
}

function TablaLideres({
  lideres,
  columna,
  estadoDe,
  onElegir,
}: {
  lideres: C.Lider[];
  columna: string;
  estadoDe?: (m: string) => string;
  onElegir: (l: C.Lider) => void;
}) {
  return (
    <div className="db-tabla-envoltura">
      <table className="db-tabla">
        <thead>
          <tr>
            <th>{columna}</th>
            <th>Va arriba</th>
            <th className="num">Ventaja</th>
            <th>Mes</th>
            <th className="num">Encuestas</th>
          </tr>
        </thead>
        <tbody>
          {lideres.map((l) => (
            <tr key={l.ubicacion} className="clic" onClick={() => onElegir(l)}>
              <td>
                {l.ubicacion}
                {estadoDe && <div className="db-tenue" style={{ fontSize: "0.78rem" }}>{estadoDe(l.ubicacion)}</div>}
              </td>
              <td>
                {l.lider ? (
                  <>
                    <Chip partido={l.lider} /> <span className="db-tenue">{l.liderPct.toFixed(1)}%</span>
                  </>
                ) : (
                  <span className="db-tenue">Solo internas</span>
                )}
              </td>
              <td className="num">
                {l.segundo ? (
                  <>
                    +{(l.liderPct - l.segundoPct).toFixed(1)}
                    <div className="db-tenue" style={{ fontSize: "0.78rem" }}>vs {l.segundo}</div>
                  </>
                ) : (
                  "—"
                )}
              </td>
              <td style={{ whiteSpace: "nowrap" }}>{C.nombreMes(l.mes)}</td>
              <td className="num">{l.encuestas}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TablaMediciones({ datos, idx }: { datos: DatosDashboard; idx: number[] }) {
  const [limite, setLimite] = useState(20);
  const filas = useMemo(() => {
    return idx
      .map((s) => {
        const esc = datos.escenarios[s];
        const e = datos.encuestas[esc.e];
        const res = datos.resultados.filter((r) => r.s === s && !r.sent && r.v !== null).sort((a, b) => b.v! - a.v!);
        const nombre = (r: (typeof res)[number]) => (esc.sujeto === "candidato" ? r.c : r.p) || r.p;
        return { s, e, esc, primero: res[0], segundo: res[1], nombre };
      })
      .sort((a, b) => Number(a.e.sinFecha) - Number(b.e.sinFecha) || b.e.fecha.localeCompare(a.e.fecha));
  }, [datos, idx]);

  return (
    <section className="db-tarjeta">
      <h2>Mediciones</h2>
      <p className="db-tarjeta-sub">{filas.length} escenarios con estos filtros, del más reciente al más antiguo</p>
      <div className="db-tabla-envoltura">
        <table className="db-tabla">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Encuestadora</th>
              <th>Escenario</th>
              <th>Primer lugar</th>
              <th className="num">%</th>
              <th>Segundo</th>
              <th className="num">%</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filas.slice(0, limite).map(({ s, e, esc, primero, segundo, nombre }) => (
              <tr key={s}>
                <td style={{ whiteSpace: "nowrap" }}>
                  {C.textoFecha(e)}
                </td>
                <td>{e.encuestadora}</td>
                <td>{esc.etiqueta || "—"}</td>
                <td>
                  {primero ? (
                    <span className="db-chip">
                      <i className="db-punto" style={{ background: colorPartido(primero.p) }} />
                      {nombre(primero)}
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="num">{primero ? `${primero.v!.toFixed(1)}` : ""}</td>
                <td>{segundo ? nombre(segundo) : "—"}</td>
                <td className="num">{segundo ? `${segundo.v!.toFixed(1)}` : ""}</td>
                <td>
                  {e.sheetLink && (
                    <a href={e.sheetLink} target="_blank" rel="noreferrer">
                      Hoja ↗
                    </a>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {filas.length > limite && (
        <button type="button" className="btn-secundario db-mas" onClick={() => setLimite((l) => l + 40)}>
          Ver más ({filas.length - limite} restantes)
        </button>
      )}
    </section>
  );
}
