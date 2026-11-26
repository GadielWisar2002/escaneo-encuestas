import { getSupabaseClient } from "./supabase";
import { aliasCandidato } from "./alias-candidatos";
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
  SENTINELAS,
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
  const filas = juntarCapturasPartidas(await leerTodo());

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
    if (ic >= 0) for (const f of r.filas ?? []) contar(aliasCandidato(candidatoCanon(f[ic] ?? "")));
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
      // La pestaña "Alcaldes" nació para Nuevo León: sin otra pista, el estado es Nuevo León.
      estado = ub.estado === "Sin estado" && r.destino === "ALCALDES" ? "Nuevo León" : ub.estado;
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

    const firmas = new Set<string>();
    const grupos = segmentarEscenarios(datos, { iTipo, iEscP, iEscC, iPart, iCand });

    for (const indices of grupos.values()) {
      const f0 = datos[indices[0]];
      let tipo = tipoCanon(iTipo >= 0 ? f0[iTipo] ?? "" : "");
      // Las proporciones (0.76 en vez de 76%) se detectan por escenario: una misma encuesta puede
      // traer un escenario en porcentaje y otro en proporción.
      const pctsEsc = porcentajes(indices.map((i) => (iPct >= 0 ? datos[i][iPct] : "")));
      const crudoCand = (i: number) => (iCand >= 0 ? datos[i][iCand] ?? "" : "").trim();
      const crudoEscC = (i: number) => (iEscC >= 0 ? datos[i][iEscC] ?? "" : "").trim();
      // Capturas donde el nombre real quedó en "Escenario Candidato" (uno por fila) y la columna
      // "Candidato" viene vacía o repite el mismo nombre en todas las filas.
      const escCPorFila =
        tipo !== "Interna" &&
        indices.length >= 3 &&
        indices.every((i) => !/,|\sy\s/.test(crudoEscC(i))) &&
        new Set(indices.map(crudoEscC).filter(Boolean)).size >= indices.length - 1 &&
        new Set(indices.map(crudoCand).filter(Boolean)).size <= 1;
      let filasEsc = indices.map((i, j) => {
        let p = partidoCanon(iPart >= 0 ? datos[i][iPart] ?? "" : "");
        let cc = aliasCandidato(candidatoCanon(escCPorFila ? crudoEscC(i) : crudoCand(i)));
        // Un partido escrito en la columna de candidato ("PAN", "MC", "Ninguno").
        if (cc && !p && partidoDeFila("", cc, iEscP >= 0 ? datos[i][iEscP] ?? "" : "")) {
          p = partidoDeFila("", cc, iEscP >= 0 ? datos[i][iEscP] ?? "" : "");
          cc = "";
        }
        if (/^candidato$/i.test(cc)) cc = ""; // "Candidato" genérico sin nombre
        const c = cc ? formaCandidato.get(clave(cc)) ?? cc : "";
        return { p, c, v: pctsEsc[j], sent: esSentinela(p, c) };
      });
      // Fuera de las internas, el mismo candidato (o partido) en varias filas del escenario se suma:
      // en un careo Clara Luz por Morena, PVEM y PT es una sola candidatura con la suma de los tres.
      if (tipo !== "Interna") filasEsc = sumarRepetidos(filasEsc);
      // Una fila con 100% dentro de un escenario con más aspirantes es un error de captura (otra
      // medición pegada en el mismo bloque): se descarta para no inflar ni sumar 200%.
      if (tipo === "Interna" && filasEsc.filter((x) => !x.sent).length > 2)
        filasEsc = filasEsc.filter((x) => x.sent || x.v === null || x.v < 99.5);
      // Una interna que suma más de 105% trae un dato colado de otra medición (p. ej. el "Ninguno"
      // de otra casa). Si tiene "Ninguno"/"No sabe", ese renglón se recalcula como lo que falta
      // para llegar a 100%; si no, todo se reescala a 100%.
      if (tipo === "Interna") filasEsc = ajustarA100(filasEsc);
      const reales = filasEsc.filter((x) => !x.sent);
      const conCandidato = reales.filter((x) => x.c).length;
      const sujeto: Escenario["sujeto"] = conCandidato > reales.length / 2 ? "candidato" : "partido";
      // Hay casas que etiquetan "Multipartidista" un escenario con candidatos (en realidad un careo)
      // y "Careos" uno solo de partidos: se clasifica por lo que de verdad mide.
      if (tipo === "Multipartidista" && sujeto === "candidato") tipo = "Careos";
      else if (tipo === "Careos" && sujeto === "partido") tipo = "Multipartidista";
      // Tipo ilegible ("agosto 2026"): se clasifica por lo que mide.
      else if (tipo === "Otro" && reales.length >= 2) tipo = sujeto === "candidato" ? "Careos" : "Multipartidista";
      // Un careo o una medición por partido con una sola opción no compara nada: si es un candidato
      // se trata como medición de un aspirante; si no, queda fuera de las gráficas (tipo "Otro").
      if ((tipo === "Careos" || tipo === "Multipartidista") && reales.length < 2) tipo = reales[0]?.c ? "Aspirante" : "Otro";

      let partidoInterna = tipo === "Aspirante" ? bloque(reales[0]?.p ?? "") : "";
      if (tipo === "Interna") {
        partidoInterna = partidoCanon(iEscP >= 0 ? f0[iEscP] ?? "" : "");
        const conteo = new Map<string, number>();
        for (const x of reales) if (x.p) conteo.set(x.p, (conteo.get(x.p) ?? 0) + 1);
        const [masComun, veces] = [...conteo.entries()].sort((a, b) => b[1] - a[1])[0] ?? ["", 0];
        // Si el escenario no dice el partido, o todos los aspirantes son de otro partido distinto
        // al que dice el escenario (p. ej. "PES" con aspirantes del PVEM), manda el de los aspirantes.
        const coincide = (a: string, b: string) => a === b || a.split("-").includes(b) || b.split("-").includes(a);
        if (!partidoInterna || partidoInterna.includes(",")) partidoInterna = masComun;
        else if (masComun && veces >= 2 && veces === reales.length && !coincide(masComun, partidoInterna))
          partidoInterna = masComun;
        // Con un solo aspirante (contra "otro" o "no sabe") no es una interna: es la medición de
        // ese aspirante y se muestra aparte.
        if (reales.length < 2) tipo = "Aspirante";
        // Morena con sus aliados (PT, PVEM) postula a gente de Morena: es la misma interna. Una
        // alianza como PAN-PRI, en cambio, mezcla aspirantes de ambos partidos y es otra contienda.
        if (bloque(partidoInterna) === "Morena") partidoInterna = "Morena";
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

      // Una misma medición capturada dos veces dentro de la encuesta se cuenta una sola vez.
      const firma = `${tipo}|${filasEsc.map((x) => `${x.c}:${x.p}:${x.v}`).sort().join(";")}`;
      if (firmas.has(firma)) continue;
      firmas.add(firma);

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
  completarPartidoInterna(encuestas, escenarios, resultados);
  corregirPartidoEnCareos(encuestas, escenarios, resultados);
  return { encuestas, escenarios, resultados };
}

const PARTIDOS_CONOCIDOS = new Set(["Morena", "PAN", "PRI", "PRD", "MC", "PT", "PVEM", "Morena-PT-PVEM", "PAN-PRI", "PAN-PRI-PRD"]);

// Partido de una fila: la columna de partido, o la de candidato cuando ahí viene un partido
// (un partido conocido, o el mismo que dice el "Escenario Partido").
function partidoDeFila(partido: string, candidato: string, escenarioPartido: string): string {
  const p = partidoCanon(partido);
  if (p) return p;
  const c = partidoCanon(candidato);
  if (c && (PARTIDOS_CONOCIDOS.has(c) || SENTINELAS.includes(c) || c === partidoCanon(escenarioPartido))) return c;
  return "";
}

type Cols = { iTipo: number; iEscP: number; iEscC: number; iPart: number; iCand: number };

// Arma los escenarios de una encuesta. Las internas se agrupan por partido y lista de aspirantes.
// En el resto, si cada fila trae como "Escenario Partido" su propio partido (capturas viejas o
// varios careos seguidos), ese campo no sirve para agrupar: los escenarios se separan en orden,
// empezando uno nuevo cuando se repite un partido que ya apareció en el escenario en curso.
function segmentarEscenarios(datos: string[][], k: Cols): number[][] {
  const val = (i: number, j: number) => (j >= 0 ? datos[i][j] ?? "" : "").trim();
  const porTipo = new Map<string, number[]>();
  datos.forEach((_, i) => {
    const t = tipoCanon(val(i, k.iTipo));
    porTipo.set(t, [...(porTipo.get(t) ?? []), i]);
  });
  const grupos: number[][] = [];
  for (const [tipo, filas] of porTipo) {
    const filaPorFila =
      tipo !== "Interna" &&
      filas.filter((i) => {
        const esc = partidoCanon(val(i, k.iEscP));
        const propio = partidoDeFila(val(i, k.iPart), val(i, k.iCand), val(i, k.iEscP));
        return !esc || esc === propio || propio.split("-").includes(esc) || esc.split("-").includes(propio);
      }).length >=
        filas.length * 0.8;
    if (!filaPorFila) {
      const m = new Map<string, number[]>();
      for (const i of filas) {
        const key = `${val(i, k.iEscP)}|${val(i, k.iEscC)}`;
        m.set(key, [...(m.get(key) ?? []), i]);
      }
      grupos.push(...m.values());
      continue;
    }
    let actual: number[] = [];
    let vistos = new Set<string>();
    for (const i of filas) {
      const p = partidoDeFila(val(i, k.iPart), val(i, k.iCand), val(i, k.iEscP)) || val(i, k.iPart);
      if (vistos.has(p) && actual.length) {
        grupos.push(actual);
        actual = [];
        vistos = new Set();
      }
      actual.push(i);
      vistos.add(p);
    }
    if (actual.length) grupos.push(actual);
  }
  return grupos;
}

function sumarRepetidos<T extends { p: string; c: string; v: number | null; sent: boolean }>(filas: T[]): T[] {
  const conCandidato = filas.filter((x) => !x.sent && x.c).length > filas.filter((x) => !x.sent).length / 2;
  const out = new Map<string, T>();
  for (const x of filas) {
    const key = x.sent ? `s:${x.c || x.p}` : conCandidato && x.c ? `c:${x.c}` : `p:${x.p}`;
    const previo = out.get(key);
    if (!previo) out.set(key, { ...x });
    else {
      previo.v = previo.v === null && x.v === null ? null : Math.round(((previo.v ?? 0) + (x.v ?? 0)) * 10) / 10;
      if (x.p && previo.p !== x.p) previo.p = partidoCanon(`${previo.p}-${x.p}`) || previo.p;
    }
  }
  return [...out.values()];
}

// Una interna capturada fila por fila en "encuestas" separadas con fechas consecutivas (misma casa,
// mismo lugar, misma lista de aspirantes) se vuelve a juntar en una sola encuesta.
function juntarCapturasPartidas(filas: Fila[]): Fila[] {
  const out: Fila[] = [];
  const abiertas = new Map<string, { fila: Fila; dia: number }>();
  const ordenadas = [...filas].sort((a, b) => a.creado_en.localeCompare(b.creado_en));
  for (const r of ordenadas) {
    const cols = (r.columnas ?? []).map((c) => c.trim());
    const iEscC = cols.indexOf("Escenario Candidato");
    const iTipo = cols.findIndex((c) => c === "Sub-tipo" || c === "Tipo de escenario");
    const unaFila = (r.filas ?? []).length === 1;
    const lista = iEscC >= 0 && unaFila ? (r.filas[0][iEscC] ?? "").trim() : "";
    if (!unaFila || !/,/.test(lista)) {
      out.push(r);
      continue;
    }
    const key = [r.destino, r.ubicacion ?? "", encuestadoraCanon(r.encuestadora ?? ""), tipoCanon(r.filas[0][iTipo] ?? ""), clave(lista)].join("|");
    const dia = Date.parse(fechaCanon(r.fecha ?? "", "", r.creado_en).fecha) / 86400000;
    const abierta = abiertas.get(key);
    if (abierta && Math.abs(dia - abierta.dia) <= 7 && sameCols(abierta.fila.columnas, r.columnas)) {
      abierta.fila.filas = [...abierta.fila.filas, ...r.filas];
      abierta.dia = dia;
      continue;
    }
    const copia = { ...r, filas: [...r.filas] };
    abiertas.set(key, { fila: copia, dia });
    out.push(copia);
  }
  return out;
}
const sameCols = (a: string[], b: string[]) => a.length === b.length && a.every((c, i) => c.trim() === (b[i] ?? "").trim());

function ajustarA100<T extends { p: string; c: string; v: number | null; sent: boolean }>(filas: T[]): T[] {
  const suma = filas.reduce((a, x) => a + (x.v ?? 0), 0);
  if (suma <= 105) return filas;
  const indeciso = (x: T) => x.sent && /ningun|no decide|no sabe/i.test(`${x.p} ${x.c}`);
  const resto = filas.filter((x) => !indeciso(x)).reduce((a, x) => a + (x.v ?? 0), 0);
  const nIndecisos = filas.filter(indeciso).length;
  if (nIndecisos === 1 && resto <= 100)
    return filas.map((x) => (indeciso(x) ? { ...x, v: Math.round((100 - resto) * 10) / 10 } : x));
  return filas.map((x) => (x.v === null ? x : { ...x, v: Math.round((x.v / suma) * 1000) / 10 }));
}

// Bando de un partido o coalición: Morena con PT y PVEM, PAN con PRI y PRD, MC, o el propio partido.
const campo = (p: string) => {
  const t = p.split("-");
  if (t.some((x) => ["Morena", "PT", "PVEM"].includes(x))) return "Morena y aliados";
  if (t.some((x) => ["PAN", "PRI", "PRD"].includes(x))) return "PAN-PRI-PRD";
  return p;
};

// En careos, si un candidato aparece con un partido distinto al que le dan casi todas las demás
// mediciones del mismo lugar (p. ej. Adrián de la Garza "por Morena"), es un error de captura y se
// usa su partido habitual. Requiere al menos 3 mediciones y 75% de coincidencia.
function corregirPartidoEnCareos(encuestas: EncuestaMeta[], escenarios: Escenario[], resultados: Resultado[]) {
  const lugar = (s: number) => {
    const e = encuestas[escenarios[s].e];
    return `${e.modulo}|${e.estado}|${e.municipio}`;
  };
  const conteo = new Map<string, Map<string, number>>();
  for (const r of resultados) {
    if (r.sent || !r.c || !r.p || escenarios[r.s].tipo !== "Careos") continue;
    const k = `${lugar(r.s)}|${r.c}`;
    const m = conteo.get(k) ?? new Map<string, number>();
    m.set(campo(r.p), (m.get(campo(r.p)) ?? 0) + 1);
    conteo.set(k, m);
  }
  const habitual = new Map<string, string>();
  for (const [k, m] of conteo) {
    const total = [...m.values()].reduce((a, b) => a + b, 0);
    const [b, n] = [...m].sort((x, y) => y[1] - x[1])[0];
    if (total >= 3 && n / total >= 0.75) habitual.set(k, b);
  }
  // Partido completo más usado para ese bloque (p. ej. "PAN-PRI" para PAN).
  const formaDe = new Map<string, Map<string, number>>();
  for (const r of resultados) {
    if (r.sent || !r.c || !r.p || escenarios[r.s].tipo !== "Careos") continue;
    const k = `${lugar(r.s)}|${r.c}|${campo(r.p)}`;
    const m = formaDe.get(k) ?? new Map<string, number>();
    m.set(r.p, (m.get(r.p) ?? 0) + 1);
    formaDe.set(k, m);
  }
  for (const r of resultados) {
    if (r.sent || !r.c || !r.p || escenarios[r.s].tipo !== "Careos") continue;
    const k = `${lugar(r.s)}|${r.c}`;
    const b = habitual.get(k);
    if (b && campo(r.p) !== b) r.p = [...(formaDe.get(`${k}|${b}`) ?? new Map([[b, 1]]))].sort((x, y) => y[1] - x[1])[0][0];
  }
}

// Internas sin partido en la captura: se deduce de otras internas del mismo lugar donde aparecen
// esos mismos aspirantes.
function completarPartidoInterna(encuestas: EncuestaMeta[], escenarios: Escenario[], resultados: Resultado[]) {
  const lugar = (s: number) => {
    const e = encuestas[escenarios[s].e];
    return `${e.modulo}|${e.estado}|${e.municipio}`;
  };
  const conPartido = (t: string) => t === "Interna" || t === "Aspirante";
  const partidosDe = new Map<string, Map<string, number>>(); // "lugar|aspirante" -> partido -> veces
  const porEsc = new Map<number, Resultado[]>();
  for (const r of resultados) porEsc.set(r.s, [...(porEsc.get(r.s) ?? []), r]);
  escenarios.forEach((esc, s) => {
    if (!conPartido(esc.tipo) || !esc.partidoInterna) return;
    for (const r of porEsc.get(s) ?? []) {
      if (r.sent || !r.c) continue;
      const k = `${lugar(s)}|${r.c}`;
      const m = partidosDe.get(k) ?? new Map<string, number>();
      m.set(esc.partidoInterna, (m.get(esc.partidoInterna) ?? 0) + 1);
      partidosDe.set(k, m);
    }
  });
  escenarios.forEach((esc, s) => {
    if (!conPartido(esc.tipo) || esc.partidoInterna) return;
    const votos = new Map<string, number>();
    for (const r of porEsc.get(s) ?? [])
      for (const [p, n] of partidosDe.get(`${lugar(s)}|${r.c}`) ?? []) votos.set(p, (votos.get(p) ?? 0) + n);
    esc.partidoInterna = [...votos].sort((x, y) => y[1] - x[1])[0]?.[0] ?? "Sin partido";
  });
}

// Diminutivos frecuentes: "Toño Astiazarán" es "Antonio Astiazarán".
const DIMINUTIVOS: Record<string, string> = {
  tono: "antonio", tony: "antonio", paty: "patricia", pati: "patricia", ma: "maria", pancho: "francisco",
  paco: "francisco", pepe: "jose", chuy: "jesus", lalo: "eduardo", memo: "guillermo", nacho: "ignacio",
  quique: "enrique", lupe: "guadalupe",
};
// "de la Torre", "de Hoyos": las partículas no cuentan como palabras del nombre.
const PARTICULAS = new Set(["de", "la", "del", "los", "las", "y", "el"]);
const sinAcentos = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const tokens = (nombre: string) =>
  sinAcentos(nombre)
    .replace(/["'“”‘’()]/g, " ")
    .split(/[^a-z]+/)
    .filter((t) => t && !PARTICULAS.has(t))
    .map((t) => DIMINUTIVOS[t] ?? t);
// Palabras entre comillas: el apodo ("Pato", "Fito", "El Abuelo").
const apodos = (nombre: string) =>
  [...sinAcentos(nombre).matchAll(/["“”']([^"“”']+)["“”']/g)].flatMap((m) => m[1].split(/[^a-z]+/).filter(Boolean));

// Dos palabras se consideran la misma si son iguales o, en palabras largas, difieren en una
// sola letra (errores de captura como "Benelly"/"Bennelly" o "Villagranal"/"Villagrana").
function parecidas(a: string, b: string): boolean {
  if (a === b) return true;
  // Una inicial ("López C.") equivale a la palabra que empieza con esa letra.
  if (a.length === 1 || b.length === 1) return a[0] === b[0];
  if (Math.min(a.length, b.length) < 5 || Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && a[i] === b[i]) i++;
  const [x, y] = a.length >= b.length ? [a, b] : [b, a];
  return x.slice(i + 1) === y.slice(i + (x.length === y.length ? 1 : 0));
}
// ¿Están todas las palabras de "corto" en "largo"? Cada palabra de "largo" se usa una sola vez,
// para que "Garza Garza" no quepa en "Garza Ochoa".
function contiene(largo: string[], corto: string[]): boolean {
  const libres = [...largo];
  for (const t of corto) {
    const i = libres.findIndex((u) => parecidas(u, t));
    if (i < 0) return false;
    libres.splice(i, 1);
  }
  return true;
}

// Registro de las unificaciones hechas en la última carga, para auditarlas.
export let unificaciones: { ubicacion: string; de: string; a: string }[] = [];

// Dentro de un mismo estado/municipio, una persona aparece con distintas versiones de su nombre
// según la casa: "Fernando Margáin", "Fernando Margáin Sada", "Fernando Margáin Berlanga".
// Si un nombre está contenido en otro más completo se consideran la misma persona; las versiones
// que quedan conectadas así se unifican a la forma que más se usa.
function unificarNombres(encuestas: EncuestaMeta[], escenarios: Escenario[], resultados: Resultado[]) {
  const ubicacionDe = (s: number) => {
    const e = encuestas[escenarios[s].e];
    return `${e.modulo}|${e.estado}|${e.municipio}`;
  };
  const conteos = new Map<string, Map<string, number>>();
  for (const r of resultados) {
    if (!r.c || r.sent) continue;
    const k = ubicacionDe(r.s);
    const m = conteos.get(k) ?? new Map<string, number>();
    m.set(r.c, (m.get(r.c) ?? 0) + 1);
    conteos.set(k, m);
  }

  const mapa = new Map<string, string>(); // "ubicación|nombre" -> nombre unificado
  for (const [ub, m] of conteos) {
    const nombres = [...m.keys()].map((n) => {
      const t = tokens(n);
      const ap = apodos(n);
      const sinApodo = t.filter((x) => !ap.includes(x));
      // Nombres de pila: todo menos los dos apellidos (o el único apellido), más el apodo.
      const pila = [...sinApodo.slice(0, Math.max(1, sinApodo.length - 2)), ...ap];
      const apellidos = sinApodo.slice(Math.max(1, sinApodo.length - 2));
      return { n, t, pila, apellidos };
    });
    const padre = new Map(nombres.map((x) => [x.n, x.n]));
    const raiz = (n: string): string => (padre.get(n) === n ? n : raiz(padre.get(n)!));
    const abarca = (a: (typeof nombres)[number], b: (typeof nombres)[number]) => {
      if (a === b) return false;
      // Misma longitud y cada palabra igual salvo una letra: error de captura ("Fregoso"/"Fregozo").
      if (b.t.length === a.t.length) return a.t.every((x, i) => parecidas(x, b.t[i]));
      if (b.t.length < a.t.length || !contiene(b.t, a.t)) return false;
      // Con solo nombre y apellido ("Pato Zambrano", "Cristina Lupién") se exige que el primero sea
      // un nombre de pila o el apodo del otro, y el último uno de sus apellidos. Con tres palabras
      // o más basta que todas estén ("Martín López Cisneros" ⊂ "José Martín López Cisneros").
      if (a.t.length < 3) {
        if (!b.pila.some((x) => parecidas(x, a.t[0]))) return false;
        if (!b.t.slice(1).some((x) => parecidas(x, a.t[a.t.length - 1]))) return false;
      }
      return true;
    };
    // Dos versiones largas pueden ser la misma persona si una contiene a la otra, o si empiezan con
    // el mismo nombre y comparten algún apellido ("Paola Iveth Gárate" / "Paola Gárate Valenzuela",
    // "Margáin Sada" / "Margáin Berlanga"). "Juan Alberto Valdivia Alvarado" y "Jesús Alberto
    // Alvarado Aragón" no: empiezan distinto.
    const compatibles = (x: (typeof nombres)[number], y: (typeof nombres)[number]) =>
      abarca(x, y) ||
      abarca(y, x) ||
      (parecidas(x.t[0], y.t[0]) && x.t.slice(1).some((w) => y.t.slice(1).some((z) => parecidas(w, z))));
    for (const a of nombres) {
      if (a.t.length < 2) continue;
      const mayores = nombres.filter((b) => abarca(a, b));
      if (!mayores.length) continue;
      // Si el nombre corto encaja en personas distintas ("Alberto Alvarado" en "Juan Alberto Valdivia
      // Alvarado" y en "Jesús Alberto Alvarado Aragón") es ambiguo y no se une.
      if (!mayores.every((x) => mayores.every((y) => x === y || compatibles(x, y)))) continue;
      for (const b of mayores) padre.set(raiz(a.n), raiz(b.n));
    }
    const grupos = new Map<string, string[]>();
    for (const x of nombres) grupos.set(raiz(x.n), [...(grupos.get(raiz(x.n)) ?? []), x.n]);
    for (const g of grupos.values()) {
      if (g.length < 2) continue;
      const elegido = [...g].sort((x, y) => tokens(y).length - tokens(x).length || m.get(y)! - m.get(x)!)[0];
      for (const n of g) if (n !== elegido) mapa.set(`${ub}|${n}`, elegido);
    }
  }
  unificaciones = [...mapa].map(([k, a]) => {
    const [, estado, municipio, de] = k.split("|");
    return { ubicacion: municipio ? `${municipio}, ${estado}` : estado, de, a };
  });
  if (!mapa.size) return;
  const resolver = (ub: string, n: string) => mapa.get(`${ub}|${n}`) ?? n;
  for (const r of resultados) if (r.c && !r.sent) r.c = resolver(ubicacionDe(r.s), r.c);
  escenarios.forEach((esc, s) => {
    if (esc.ganador && esc.sujeto === "candidato") esc.ganador = resolver(ubicacionDe(s), esc.ganador);
  });
}
