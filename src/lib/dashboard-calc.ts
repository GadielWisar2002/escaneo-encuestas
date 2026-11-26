import type { DatosDashboard, Modulo, Tipo } from "./dashboard-types";
import { bloque } from "./dashboard-normalize";

export type Filtros = {
  modulo: Modulo;
  estado: string;
  municipio: string;
  tipo: Tipo | "";
  interna: string;
  casas: string[];
  meses: string[];
};

export type Punto = {
  s: number;
  fecha: string;
  casa: string;
  sujeto: string;
  partido: string;
  v: number;
  sent: boolean;
  sinFecha: boolean;
};

const ORDEN_TIPOS: Tipo[] = ["Multipartidista", "Careos", "Interna", "Aspirante", "Otro"];
const CON_PARTIDO: Tipo[] = ["Interna", "Aspirante"];

export const unicos = <T,>(xs: T[]) => [...new Set(xs)];

// Escenarios del módulo/estado/municipio elegidos, antes de los filtros finos.
export function escenariosDeUbicacion(d: DatosDashboard, f: Pick<Filtros, "modulo" | "estado" | "municipio">): number[] {
  const out: number[] = [];
  d.escenarios.forEach((esc, i) => {
    const e = d.encuestas[esc.e];
    if (e.modulo !== f.modulo) return;
    if (f.estado && e.estado !== f.estado) return;
    if (f.modulo === "ALC" && f.municipio && e.municipio !== f.municipio) return;
    out.push(i);
  });
  return out;
}

export function tiposDisponibles(d: DatosDashboard, idx: number[]): Tipo[] {
  const t = new Set(idx.map((i) => d.escenarios[i].tipo));
  return ORDEN_TIPOS.filter((x) => t.has(x));
}

export function internasDisponibles(d: DatosDashboard, idx: number[], tipo: Tipo | "" = "Interna"): string[] {
  const conteo = new Map<string, number>();
  for (const i of idx) {
    const esc = d.escenarios[i];
    if (esc.tipo === tipo && esc.partidoInterna) conteo.set(esc.partidoInterna, (conteo.get(esc.partidoInterna) ?? 0) + 1);
  }
  return [...conteo.entries()].sort((a, b) => b[1] - a[1]).map(([p]) => p);
}

export function porTipo(d: DatosDashboard, idx: number[], f: Pick<Filtros, "tipo" | "interna">): number[] {
  return idx.filter((i) => {
    const esc = d.escenarios[i];
    if (f.tipo && esc.tipo !== f.tipo) return false;
    if (f.tipo && CON_PARTIDO.includes(f.tipo) && f.interna && esc.partidoInterna !== f.interna) return false;
    return true;
  });
}

export function porCasaYMes(d: DatosDashboard, idx: number[], f: Pick<Filtros, "casas" | "meses">): number[] {
  return idx.filter((i) => {
    const e = d.encuestas[d.escenarios[i].e];
    if (f.casas.length && !f.casas.includes(e.encuestadora)) return false;
    if (f.meses.length && !f.meses.includes(e.mes)) return false;
    return true;
  });
}

// "efectiva": porcentaje entre quienes sí eligen una opción (sin "ninguno" ni "no sabe"). Así se
// comparan casas que publican sobre bases distintas: unas reparten el 100% solo entre aspirantes
// y otras incluyen a los indecisos. "publicada": la cifra tal como la dio cada casa.
export type Base = "efectiva" | "publicada";

const sinAcentos = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
export const esIndeciso = (r: { p: string; c: string; sent: boolean }) => {
  if (!r.sent) return false;
  const t = sinAcentos(`${r.p} ${r.c}`);
  return t.includes("ningun") || t.includes("no decide") || t.includes("no sabe") || t.includes("ns/nc");
};

export function puntos(d: DatosDashboard, idx: number[], base: Base = "efectiva"): Punto[] {
  const set = new Set(idx);
  const denominador = new Map<number, number>();
  if (base === "efectiva")
    for (const r of d.resultados)
      if (set.has(r.s) && r.v !== null && !esIndeciso(r)) denominador.set(r.s, (denominador.get(r.s) ?? 0) + r.v);
  const out: Punto[] = [];
  for (const r of d.resultados) {
    if (!set.has(r.s) || r.v === null) continue;
    let v = r.v;
    if (base === "efectiva") {
      const den = denominador.get(r.s) ?? 0;
      if (esIndeciso(r) || den <= 0) continue;
      v = Math.round((r.v / den) * 1000) / 10;
    }
    const esc = d.escenarios[r.s];
    const e = d.encuestas[esc.e];
    const sujeto = r.sent ? r.c || r.p : esc.sujeto === "candidato" ? r.c : r.p;
    if (!sujeto) continue;
    out.push({ s: r.s, fecha: e.fecha, casa: e.encuestadora, sujeto, partido: r.p, v, sent: r.sent, sinFecha: e.sinFecha });
  }
  return out;
}

export type Promedio = {
  sujeto: string;
  partido: string;
  promedio: number;
  n: number;
  casas: number;
  sent: boolean;
  detalle?: string; // texto extra junto al valor (p. ej. el puntero de una interna)
};

// Promedio equilibrado por casa: primero se promedia cada encuestadora y luego se promedian las
// casas entre sí, para que una casa que publica cada semana no pese más que una que publica al mes.
export function promedios(ps: Punto[]): Promedio[] {
  const acc = new Map<string, { casas: Map<string, number[]>; n: number; sent: boolean; partidos: Map<string, number> }>();
  for (const p of ps) {
    const a = acc.get(p.sujeto) ?? { casas: new Map(), n: 0, sent: p.sent, partidos: new Map() };
    a.casas.set(p.casa, [...(a.casas.get(p.casa) ?? []), p.v]);
    a.n += 1;
    if (p.partido) a.partidos.set(p.partido, (a.partidos.get(p.partido) ?? 0) + 1);
    acc.set(p.sujeto, a);
  }
  const media = (xs: number[]) => xs.reduce((x, y) => x + y, 0) / xs.length;
  return [...acc.entries()]
    .map(([sujeto, a]) => ({
      sujeto,
      partido: [...a.partidos.entries()].sort((x, y) => y[1] - x[1])[0]?.[0] ?? "",
      promedio: Math.round(media([...a.casas.values()].map(media)) * 10) / 10,
      n: a.n,
      casas: a.casas.size,
      sent: a.sent,
    }))
    .sort((x, y) => Number(x.sent) - Number(y.sent) || y.promedio - x.promedio);
}

// Una barra por partido: el aspirante que encabeza la interna de cada partido en ese lugar, con su
// promedio. Respeta los filtros de encuestadora, mes y base.
export function punteroPorPartido(
  d: DatosDashboard,
  ubIdx: number[],
  f: Pick<Filtros, "casas" | "meses">,
  base: Base,
): Promedio[] {
  const out: Promedio[] = [];
  for (const partido of internasDisponibles(d, ubIdx, "Interna")) {
    const idx = porCasaYMes(d, porTipo(d, ubIdx, { tipo: "Interna", interna: partido }), f);
    const top = promedios(puntos(d, idx, base)).find((p) => !p.sent);
    if (top) out.push({ ...top, sujeto: partido, partido, detalle: `${top.sujeto} · ${top.casas} ${top.casas === 1 ? "casa" : "casas"}` });
  }
  return out.sort((a, b) => b.promedio - a.promedio);
}

export function principales(proms: Promedio[], max: number): string[] {
  return proms.filter((p) => !p.sent).slice(0, max).map((p) => p.sujeto);
}

// Una fila por fecha; si hay varias mediciones del mismo sujeto ese día se promedian.
export function tendencia(ps: Punto[], sujetos: string[]) {
  const porFecha = new Map<string, Map<string, number[]>>();
  for (const p of ps) {
    if (!sujetos.includes(p.sujeto) || p.sinFecha) continue;
    const m = porFecha.get(p.fecha) ?? new Map<string, number[]>();
    const arr = m.get(p.sujeto) ?? [];
    arr.push(p.v);
    m.set(p.sujeto, arr);
    porFecha.set(p.fecha, m);
  }
  return [...porFecha.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([fecha, m]) => {
      const fila: Record<string, number | string> = { fecha, t: Date.parse(fecha + "T12:00:00Z") };
      for (const [s, vs] of m) fila[s] = Math.round((vs.reduce((x, y) => x + y, 0) / vs.length) * 10) / 10;
      return fila;
    });
}

// La medición más reciente de cada casa, para comparar casas en igualdad de condiciones.
export function ultimaPorCasa(todos: Punto[], sujetos: string[]) {
  const ps = todos.filter((p) => !p.sinFecha);
  const ultima = new Map<string, string>();
  for (const p of ps) if ((ultima.get(p.casa) ?? "") < p.fecha) ultima.set(p.casa, p.fecha);
  const filas = new Map<string, Record<string, number | string>>();
  const cuenta = new Map<string, Map<string, number>>();
  for (const p of ps) {
    if (p.fecha !== ultima.get(p.casa) || !sujetos.includes(p.sujeto)) continue;
    const fila = filas.get(p.casa) ?? { casa: p.casa, fecha: p.fecha };
    const c = cuenta.get(p.casa) ?? new Map<string, number>();
    const n = (c.get(p.sujeto) ?? 0) + 1;
    const previo = typeof fila[p.sujeto] === "number" ? (fila[p.sujeto] as number) : 0;
    fila[p.sujeto] = Math.round(((previo * (n - 1) + p.v) / n) * 10) / 10;
    c.set(p.sujeto, n);
    cuenta.set(p.casa, c);
    filas.set(p.casa, fila);
  }
  return [...filas.values()].sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
}

// Comparación por bloque: en careos se toma el partido del candidato y una coalición cuenta para
// el partido que la encabeza. Si un escenario trae al partido y a su coalición, se toma un solo
// valor (el mayor) para no contar doble.
export function puntosPorBloque(d: DatosDashboard, idx: number[], base: Base = "efectiva"): Punto[] {
  const porEsc = new Map<string, Punto>();
  for (const p of puntos(d, idx, base)) {
    const b = p.sent ? p.sujeto : bloque(p.partido);
    if (!b) continue;
    const k = `${p.s}|${b}`;
    const previo = porEsc.get(k);
    if (!previo || p.v > previo.v) porEsc.set(k, { ...p, sujeto: b, partido: p.sent ? p.partido : b });
  }
  return [...porEsc.values()];
}

export type Lider = {
  ubicacion: string;
  mes: string;
  lider: string;
  liderPct: number;
  segundo: string;
  segundoPct: number;
  casas: number;
  encuestas: number;
};

// Panorama: con las mediciones de preferencia por partido del mes más reciente con datos,
// qué partido va arriba en cada estado (o municipio).
export function lideresPorUbicacion(d: DatosDashboard, modulo: Modulo, estado = ""): Lider[] {
  const grupos = new Map<string, number[]>();
  d.escenarios.forEach((esc, i) => {
    const e = d.encuestas[esc.e];
    if (e.modulo !== modulo || (estado && e.estado !== estado)) return;
    const ub = modulo === "GUB" ? e.estado : e.municipio;
    const g = grupos.get(ub) ?? [];
    g.push(i);
    grupos.set(ub, g);
  });

  const out: Lider[] = [];
  for (const [ub, idx] of grupos) {
    const totalEncuestas = unicos(idx.map((i) => d.escenarios[i].e)).length;
    const generales = idx.filter(
      (i) => ["Multipartidista", "Careos"].includes(d.escenarios[i].tipo) && !d.encuestas[d.escenarios[i].e].sinFecha,
    );
    if (!generales.length) {
      out.push({ ubicacion: ub, mes: "", lider: "", liderPct: 0, segundo: "", segundoPct: 0, casas: 0, encuestas: totalEncuestas });
      continue;
    }
    const mes = generales.map((i) => d.encuestas[d.escenarios[i].e].mes).sort().at(-1)!;
    const delMes = generales.filter((i) => d.encuestas[d.escenarios[i].e].mes === mes);
    const proms = promedios(puntosPorBloque(d, delMes).filter((p) => !p.sent));
    out.push({
      ubicacion: ub,
      mes,
      lider: proms[0]?.sujeto ?? "",
      liderPct: proms[0]?.promedio ?? 0,
      segundo: proms[1]?.sujeto ?? "",
      segundoPct: proms[1]?.promedio ?? 0,
      casas: unicos(delMes.map((i) => d.encuestas[d.escenarios[i].e].encuestadora)).length,
      encuestas: totalEncuestas,
    });
  }
  return out.sort((a, b) => b.encuestas - a.encuestas);
}

const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
export const nombreMes = (ym: string) => (ym ? `${MESES_CORTOS[+ym.slice(5, 7) - 1]} ${ym.slice(0, 4)}` : "—");
export const fechaCorta = (iso: string) =>
  iso ? `${+iso.slice(8, 10)} ${MESES_CORTOS[+iso.slice(5, 7) - 1]} ${iso.slice(0, 4)}` : "—";
export const textoFecha = (e: { fecha: string; mes: string; fechaAprox: boolean; sinFecha: boolean }) =>
  e.sinFecha ? "Sin fecha" : e.fechaAprox ? `~ ${nombreMes(e.mes)}` : fechaCorta(e.fecha);
