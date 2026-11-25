import { getSupabaseClient } from "./supabase";
import type { DatosDashboard, EncuestaMeta, Escenario, Resultado } from "./dashboard-types";
import {
  bloque,
  candidatoCanon,
  clave,
  encuestadoraCanon,
  esSentinela,
  estadoCanon,
  fechaCanon,
  municipioYEstado,
  partidoCanon,
  porcentajes,
  tipoCanon,
} from "./dashboard-normalize";

type Fila = {
  id: string;
  destino: string;
  ubicacion: string | null;
  fecha: string | null;
  encuestadora: string | null;
  metodologia: string | null;
  columnas: string[];
  filas: string[][];
  sheet_link: string | null;
  creado_en: string;
};

// PostgREST corta cada respuesta en 1,000 filas, así que se pagina.
async function leerTodo(): Promise<Fila[]> {
  const supabase = getSupabaseClient();
  const todas: Fila[] = [];
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await supabase
      .from("encuestas")
      .select("id, destino, ubicacion, fecha, encuestadora, metodologia, columnas, filas, sheet_link, creado_en")
      .order("creado_en", { ascending: true })
      .range(desde, desde + 999);
    if (error) throw error;
    todas.push(...((data ?? []) as Fila[]));
    if (!data || data.length < 1000) return todas;
  }
}

// Server-only: usa la service_role key, nunca se expone al navegador.
export async function cargarDatosDashboard(): Promise<DatosDashboard> {
  const filas = await leerTodo();

  const encuestas: EncuestaMeta[] = [];
  const escenarios: Escenario[] = [];
  const resultados: Resultado[] = [];

  // El mismo candidato aparece con distinta capitalización según la casa: se unifica a la forma más usada.
  const formas = new Map<string, Map<string, number>>();
  const contar = (c: string) => {
    if (!c) return;
    const k = clave(c);
    const m = formas.get(k) ?? new Map<string, number>();
    m.set(c, (m.get(c) ?? 0) + 1);
    formas.set(k, m);
  };
  for (const r of filas) {
    const ic = (r.columnas ?? []).findIndex((c) => c.trim() === "Candidato");
    if (ic >= 0) for (const f of r.filas ?? []) contar(candidatoCanon(f[ic] ?? ""));
  }
  const formaCandidato = new Map<string, string>();
  for (const [k, m] of formas) formaCandidato.set(k, [...m.entries()].sort((a, b) => b[1] - a[1])[0][0]);

  for (const r of filas) {
    const cols = (r.columnas ?? []).map((c) => c.trim());
    const idx = (...nombres: string[]) => cols.findIndex((c) => nombres.includes(c));
    const iTipo = idx("Sub-tipo", "Tipo de escenario");
    const iEscP = idx("Escenario Partido");
    const iEscC = idx("Escenario Candidato");
    const iPart = idx("Alianza/Partido");
    const iCand = idx("Candidato");
    const iPct = idx("%Confianza");
    const iMes = idx("MES");
    const iEstado = idx("Estado");
    const iEntidad = idx("Entidad");
    const datos = r.filas ?? [];
    if (!datos.length) continue;

    const modulo = r.destino === "GUBERNATURA" ? "GUB" : "ALC";
    let estado: string;
    let municipio = "";
    if (modulo === "GUB") {
      // Las filas históricas de Gobernador no traen Entidad: esa pestaña era solo de Nuevo León.
      estado = estadoCanon(r.ubicacion || (iEntidad >= 0 ? datos[0][iEntidad] : "")) || "Nuevo León";
    } else {
      const ub = municipioYEstado(r.ubicacion ?? "", iEstado >= 0 ? datos[0][iEstado] ?? "" : "");
      estado = ub.estado;
      municipio = ub.municipio;
    }
    const { fecha, aprox, sinFecha } = fechaCanon(r.fecha ?? "", iMes >= 0 ? datos[0][iMes] ?? "" : "", r.creado_en);
    const pcts = porcentajes(datos.map((f) => (iPct >= 0 ? f[iPct] : "")));
    if (!pcts.some((v) => v !== null && v > 0)) continue; // captura vacía, sin ningún porcentaje

    const e = encuestas.length;
    encuestas.push({
      id: r.id,
      modulo,
      estado,
      municipio,
      fecha,
      mes: fecha.slice(0, 7),
      fechaAprox: aprox,
      sinFecha: !!sinFecha,
      fechaTexto: (r.fecha ?? "").trim(),
      encuestadora: encuestadoraCanon(r.encuestadora ?? ""),
      metodologia: (r.metodologia ?? "").trim(),
      sheetLink: r.sheet_link,
    });

    const grupos = new Map<string, number[]>();
    datos.forEach((f, i) => {
      const k = [iTipo >= 0 ? f[iTipo] : "", iEscP >= 0 ? f[iEscP] : "", iEscC >= 0 ? f[iEscC] : ""].join("|");
      const g = grupos.get(k) ?? [];
      g.push(i);
      grupos.set(k, g);
    });
    // En capturas viejas cada partido trae su propio "Escenario Partido" (Morena, PAN, …), así que
    // una sola medición queda partida en grupos de una fila. Esas filas sueltas del mismo tipo se
    // juntan en un solo escenario.
    const sueltas = new Map<string, number[]>();
    for (const [k, g] of grupos) {
      const tipoG = tipoCanon(iTipo >= 0 ? datos[g[0]][iTipo] ?? "" : "");
      if (g.length === 1 && tipoG !== "Interna") {
        const ks = `${tipoG}|${iEscC >= 0 ? datos[g[0]][iEscC] ?? "" : ""}`;
        sueltas.set(ks, [...(sueltas.get(ks) ?? []), ...g]);
        grupos.delete(k);
      }
    }
    for (const [ks, g] of sueltas) grupos.set(`suelta:${ks}`, g);

    for (const indices of grupos.values()) {
      const f0 = datos[indices[0]];
      let tipo = tipoCanon(iTipo >= 0 ? f0[iTipo] ?? "" : "");
      const filasEsc = indices.map((i) => {
        const p = partidoCanon(iPart >= 0 ? datos[i][iPart] ?? "" : "");
        const cc = candidatoCanon(iCand >= 0 ? datos[i][iCand] ?? "" : "");
        const c = cc ? formaCandidato.get(clave(cc)) ?? cc : "";
        return { p, c, v: pcts[i], sent: esSentinela(p, c) };
      });
      const reales = filasEsc.filter((x) => !x.sent);
      const conCandidato = reales.filter((x) => x.c).length;
      const sujeto: Escenario["sujeto"] = conCandidato > reales.length / 2 ? "candidato" : "partido";
      // Hay casas que etiquetan "Multipartidista" un escenario con candidatos (en realidad un careo)
      // y "Careos" uno solo de partidos: se clasifica por lo que de verdad mide.
      if (tipo === "Multipartidista" && sujeto === "candidato") tipo = "Careos";
      else if (tipo === "Careos" && sujeto === "partido") tipo = "Multipartidista";

      let partidoInterna = "";
      if (tipo === "Interna") {
        partidoInterna = partidoCanon(iEscP >= 0 ? f0[iEscP] ?? "" : "");
        if (!partidoInterna || partidoInterna.includes(",")) {
          const conteo = new Map<string, number>();
          for (const x of reales) if (x.p) conteo.set(x.p, (conteo.get(x.p) ?? 0) + 1);
          partidoInterna = [...conteo.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
        }
        partidoInterna = bloque(partidoInterna);
      }

      let ganador: string | null = null;
      let mejor = -1;
      for (const x of reales) {
        const nombre = sujeto === "candidato" ? x.c : x.p;
        if (nombre && x.v !== null && x.v > mejor) {
          mejor = x.v;
          ganador = nombre;
        }
      }

      const s = escenarios.length;
      escenarios.push({
        e,
        tipo,
        partidoInterna,
        etiqueta:
          indices.length > 1 && indices.some((i) => datos[i][iEscP] !== f0[iEscP])
            ? ""
            : ((iEscP >= 0 ? f0[iEscP] : "") || "").replace(/\s+/g, " ").trim(),
        sujeto,
        ganador,
      });
      for (const x of filasEsc) resultados.push({ s, ...x });
    }
  }

  unificarNombres(encuestas, escenarios, resultados);
  return { encuestas, escenarios, resultados };
}

const tokens = (nombre: string) =>
  nombre
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/["'“”‘’()]/g, " ")
    .split(/[^a-z]+/)
    .filter(Boolean);

// Dos palabras se consideran la misma si son iguales o, en palabras largas, difieren en una
// sola letra (errores de captura como "Benelly"/"Bennelly" o "Villagranal"/"Villagrana").
function parecidas(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.min(a.length, b.length) < 5 || Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && a[i] === b[i]) i++;
  const [x, y] = a.length >= b.length ? [a, b] : [b, a];
  return x.slice(i + 1) === y.slice(i + (x.length === y.length ? 1 : 0));
}
const contiene = (largo: string[], corto: string[]) => corto.every((t) => largo.some((u) => parecidas(u, t)));

// Dentro de un mismo estado/municipio, "Verónica Díaz" y "Verónica Díaz Robles" son la misma persona:
// si las palabras de un nombre están todas contenidas en otro más completo (y solo en uno), se
// unifican al nombre completo.
function unificarNombres(encuestas: EncuestaMeta[], escenarios: Escenario[], resultados: Resultado[]) {
  const ubicacionDe = (s: number) => {
    const e = encuestas[escenarios[s].e];
    return `${e.modulo}|${e.estado}|${e.municipio}`;
  };
  const nombresPorUbicacion = new Map<string, Set<string>>();
  for (const r of resultados) {
    if (!r.c || r.sent) continue;
    const k = ubicacionDe(r.s);
    const set = nombresPorUbicacion.get(k) ?? new Set<string>();
    set.add(r.c);
    nombresPorUbicacion.set(k, set);
  }

  const mapa = new Map<string, string>(); // "ubicación|nombre" -> nombre completo
  for (const [ub, set] of nombresPorUbicacion) {
    const nombres = [...set].map((n) => ({ n, t: tokens(n) }));
    for (const a of nombres) {
      if (a.t.length < 2) continue;
      const contienen = nombres.filter(
        (b) => b.t.length > a.t.length && parecidas(b.t[0], a.t[0]) && contiene(b.t, a.t),
      );
      if (!contienen.length) continue;
      // Si hay varias versiones más largas, solo se unifica cuando todas son la misma persona,
      // es decir, la más completa contiene a las demás.
      const masLarga = contienen.reduce((x, y) => (y.t.length > x.t.length ? y : x));
      if (contienen.every((b) => contiene(masLarga.t, b.t))) mapa.set(`${ub}|${a.n}`, masLarga.n);
    }
  }
  if (!mapa.size) return;
  // Resolver cadenas (A -> B -> C) al nombre final.
  const resolver = (ub: string, n: string) => {
    let actual = n;
    for (let i = 0; i < 5 && mapa.has(`${ub}|${actual}`); i++) actual = mapa.get(`${ub}|${actual}`)!;
    return actual;
  };
  for (const r of resultados) if (r.c && !r.sent) r.c = resolver(ubicacionDe(r.s), r.c);
  escenarios.forEach((esc, s) => {
    if (esc.ganador && esc.sujeto === "candidato") esc.ganador = resolver(ubicacionDe(s), esc.ganador);
  });
}
