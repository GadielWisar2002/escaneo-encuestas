import type { Tipo } from "./dashboard-types";

export const clave = (s: string) =>
  (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "");

const limpiar = (s: string) => (s || "").replace(/[“”]/g, '"').replace(/\s+/g, " ").trim();

// ---------- Encuestadoras ----------

const ENCUESTADORAS: Record<string, string> = {
  rubrum: "Rubrum",
  laencuestamx: "La Encuesta MX",
  demoscopia: "Demoscopia",
  demoscopiadigital: "Demoscopia",
  territorial: "Territorial",
  gobernarte: "GobernArte",
  ceresearch: "C&E Research",
  massivecaller: "Massive Caller",
  enkoll: "Enkoll",
};

export function encuestadoraCanon(raw: string): string {
  const t = limpiar(raw);
  if (!t) return "Sin encuestadora";
  return ENCUESTADORAS[clave(t)] ?? t;
}

// ---------- Partidos ----------

const ORDEN = ["MORENA", "PAN", "PRI", "PRD", "MC", "PT", "PVEM"];
const NOMBRE: Record<string, string> = { MORENA: "Morena", PAN: "PAN", PRI: "PRI", PRD: "PRD", MC: "MC", PT: "PT", PVEM: "PVEM" };

function tokenPartido(t: string): string | null {
  const x = t.trim();
  if (ORDEN.includes(x)) return x;
  if (x === "MOVIMIENTO CIUDADANO") return "MC";
  if (x === "VERDE" || x === "PARTIDO VERDE") return "PVEM";
  if (x === "PARTIDO DEL TRABAJO") return "PT";
  return null;
}

export const SENTINELAS = ["Ninguno", "Aún no decide", "Otro"];

export function partidoCanon(raw: string): string {
  const original = limpiar(raw).replace(/\s*\((hombre|mujer)\)\s*$/i, "");
  if (!original || original === "-") return "";
  const u = original.toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

  if (u.includes("NINGUNO")) return "Ninguno";
  if (u.includes("NO DECIDE") || u.includes("NO SABE") || u === "NS/NC") return "Aún no decide";
  if (u === "OTRO" || u === "OTROS" || u.startsWith("OTRAS OPCIONES")) return "Otro";
  if (u.includes("INDEPENDIENTE")) return "Independiente";
  if (u === "PARTIDOS LOCALES") return "Partidos locales";
  if (u.startsWith("SOMOS")) return "Somos México";
  if (u === "VIDA") return "VIDA";
  if (u.startsWith("MORENA ENCABEZA")) return "Morena";

  const tokens = u.split(/\s*(?:-|,|\/|\sY\s)\s*/).filter(Boolean);
  const partes = tokens.map(tokenPartido);
  if (partes.length && partes.every(Boolean)) {
    const unicos = [...new Set(partes as string[])].sort((a, b) => ORDEN.indexOf(a) - ORDEN.indexOf(b));
    return unicos.map((p) => NOMBRE[p]).join("-");
  }
  return original;
}

export function esSentinela(partido: string, candidato: string): boolean {
  if (SENTINELAS.includes(partido)) return true;
  const c = clave(candidato);
  return (
    c.startsWith("ninguno") ||
    c.includes("nodecide") ||
    c.includes("nosabe") ||
    c === "nsnc" ||
    /^otr[oa]s?(perfil|uotra|candidat|opcion|aspirante)?/.test(c) && c.length <= 16 ||
    c.startsWith("cualquier")
  );
}

// Una coalición se agrupa con el partido que la encabeza (Morena-PT-PVEM -> Morena).
export const bloque = (partido: string) => {
  const lider = partido.split("-")[0];
  return ["Morena", "PAN", "PRI", "MC"].includes(lider) ? lider : partido;
};

export function candidatoCanon(raw: string): string {
  const t = limpiar(raw);
  if (!t || t === "-") return "";
  const c = clave(t);
  if (c === "aunnodecide" || c === "nodecide" || c === "nosabe" || c === "nsnc") return "Aún no decide";
  if (c === "otro" || c === "otroa" || c === "otros") return "Otro";
  if (c === "ninguno") return "Ninguno";
  return t;
}

// ---------- Tipo de escenario ----------

export function tipoCanon(raw: string): Tipo {
  const c = clave(raw);
  if (c.startsWith("interna")) return "Interna";
  if (c.startsWith("multipartid")) return "Multipartidista";
  if (c.startsWith("careo")) return "Careos";
  return "Otro";
}

// ---------- Estados y municipios ----------

const ESTADOS = [
  "Aguascalientes", "Baja California", "Baja California Sur", "Campeche", "Chiapas", "Chihuahua",
  "Ciudad de México", "Coahuila", "Colima", "Durango", "Estado de México", "Guanajuato", "Guerrero",
  "Hidalgo", "Jalisco", "Michoacán", "Morelos", "Nayarit", "Nuevo León", "Oaxaca", "Puebla", "Querétaro",
  "Quintana Roo", "San Luis Potosí", "Sinaloa", "Sonora", "Tabasco", "Tamaulipas", "Tlaxcala", "Veracruz",
  "Yucatán", "Zacatecas",
];
const ESTADO_POR_CLAVE = Object.fromEntries(ESTADOS.map((e) => [clave(e), e]));
ESTADO_POR_CLAVE["guadalajara"] = "Jalisco";
ESTADO_POR_CLAVE["mexico"] = "Estado de México";
ESTADO_POR_CLAVE["cdmx"] = "Ciudad de México";

export function estadoCanon(raw: string): string {
  const t = limpiar(raw);
  if (!t) return "";
  return ESTADO_POR_CLAVE[clave(t)] ?? t;
}

const CAPITALES_HOMONIMAS = new Set(
  ["Aguascalientes", "Campeche", "Chihuahua", "Colima", "Durango", "Guanajuato", "Oaxaca", "Puebla",
    "Querétaro", "San Luis Potosí", "Tlaxcala", "Zacatecas"].map(clave),
);

const MUNICIPIO_ALIAS: Record<string, string> = {
  ciudadguadalupe: "Guadalupe",
  escobedo: "General Escobedo",
};

const NUEVO_LEON = [
  "Monterrey", "Apodaca", "Cadereyta Jiménez", "Guadalupe", "General Escobedo", "García", "Juárez",
  "Linares", "Montemorelos", "Pesquería", "San Nicolás de los Garza", "San Pedro Garza García",
  "Santa Catarina", "Santiago", "Allende",
];
const ESTADO_DE_MUNICIPIO: Record<string, string> = {
  ...Object.fromEntries(NUEVO_LEON.map((m) => [clave(m), "Nuevo León"])),
  aguascalientes: "Aguascalientes",
  hermosillo: "Sonora",
  lapaz: "Baja California Sur",
  loscabos: "Baja California Sur",
  mexicali: "Baja California",
  reynosa: "Tamaulipas",
};

export function municipioYEstado(rawMunicipio: string, rawEstado: string): { municipio: string; estado: string } {
  const t = limpiar(rawMunicipio);
  const sufijoNL = /,\s*(nl|n\.l\.|nuevo le[oó]n)\s*$/i.test(t);
  let municipio = t.replace(/,.*$/, "").trim();
  municipio = MUNICIPIO_ALIAS[clave(municipio)] ?? municipio;
  // Un "municipio" que en realidad es el nombre de un estado no es un municipio,
  // salvo las capitales que se llaman igual que su estado.
  if (ESTADO_POR_CLAVE[clave(municipio)] && !CAPITALES_HOMONIMAS.has(clave(municipio))) municipio = "";

  const estado =
    estadoCanon(rawEstado) || ESTADO_DE_MUNICIPIO[clave(municipio)] || (sufijoNL ? "Nuevo León" : "") || "Sin estado";
  return { municipio: municipio || "Sin municipio", estado };
}

// ---------- Fechas ----------

const MESES: Record<string, number> = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7, agosto: 8,
  septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
};

const iso = (y: number, m: number, d: number) =>
  `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const valida = (y: number, m: number, d: number) => y >= 2020 && y <= 2035 && m >= 1 && m <= 12 && d >= 1 && d <= 31;

// Devuelve la fecha del levantamiento; si el texto no trae día exacto, se marca como aproximada.
export function fechaCanon(
  raw: string,
  mesColumna: string,
  creadoEn: string,
): { fecha: string; aprox: boolean; sinFecha?: boolean } {
  const t = (raw || "").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const anioCreado = new Date(creadoEn).getUTCFullYear() || 2026;

  if (/^\d{5}$/.test(t)) {
    const d = new Date(Date.UTC(1899, 11, 30) + parseInt(t, 10) * 86400000);
    return { fecha: iso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()), aprox: false };
  }
  let m = t.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (m) {
    const y = m[3].length === 2 ? 2000 + parseInt(m[3], 10) : parseInt(m[3], 10);
    if (valida(y, +m[2], +m[1])) return { fecha: iso(y, +m[2], +m[1]), aprox: false };
  }
  m = t.match(/(\d{1,2})\s+al\s+(\d{1,2})\s+de\s+([a-z]+)\s+(?:de\s+)?(\d{4})/);
  if (m && MESES[m[3]] && valida(+m[4], MESES[m[3]], +m[2])) return { fecha: iso(+m[4], MESES[m[3]], +m[2]), aprox: false };
  m = t.match(/^(\d{1,2})\s+(?:de\s+)?([a-z]+)\s+(?:de\s+)?(\d{4})$/);
  if (m && MESES[m[2]] && valida(+m[3], MESES[m[2]], +m[1])) return { fecha: iso(+m[3], MESES[m[2]], +m[1]), aprox: false };
  m = t.match(/^([a-z]+)\s+(?:de\s+)?(\d{4})$/);
  if (m && MESES[m[1]]) return { fecha: iso(+m[2], MESES[m[1]], 15), aprox: true };
  m = t.match(/^(\d{1,2})\/(\d{4})$/);
  if (m && valida(+m[2], +m[1], 15)) return { fecha: iso(+m[2], +m[1], 15), aprox: true };
  if (MESES[t]) return { fecha: iso(anioCreado, MESES[t], 15), aprox: true };

  const mesCol = MESES[(mesColumna || "").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")];
  if (mesCol) return { fecha: iso(anioCreado, mesCol, 15), aprox: true };
  // Sin ninguna pista de fecha: se usa el día en que se capturó, pero se marca para no
  // ubicarla en la línea de tiempo como si fuera reciente.
  const c = new Date(creadoEn);
  return { fecha: iso(c.getUTCFullYear(), c.getUTCMonth() + 1, c.getUTCDate()), aprox: true, sinFecha: true };
}

// ---------- Porcentajes ----------

export function porcentajes(valores: string[]): (number | null)[] {
  const crudos = valores.map((v) => String(v ?? "").trim());
  const nums = crudos.map((v) => {
    const n = parseFloat(v.replace("%", "").replace(",", "."));
    return Number.isNaN(n) ? null : n;
  });
  const validos = nums.filter((n): n is number => n !== null);
  // Algunas encuestas guardaron proporciones (0.33) en lugar de porcentajes (33%).
  const sonFracciones = !crudos.some((v) => v.includes("%")) && validos.length > 0 && Math.max(...validos) <= 1;
  return nums.map((n) => (n === null ? null : sonFracciones ? Math.round(n * 1000) / 10 : n));
}
