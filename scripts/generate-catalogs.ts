// Lee los CSV históricos y genera catálogos + formatos dominantes.
// No carga los CSV completos a un LLM: solo agrega conteos y listas únicas.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { parse } from "csv-parse/sync";

const GUBERNATURA_CSV = "data/Encuestas - GUBERNATURA.csv";
const ALCALDES_CSV = "data/Encuestas - ALCALDES FINAL.csv";

const SENTINEL_CANDIDATOS = new Set(["", "ninguno", "aún no decide", "aun no decide"]);

type Row = Record<string, string>;

function readCsv(path: string): Row[] {
  const raw = readFileSync(path, "utf-8").replace(/^﻿/, "");
  return parse(raw, { columns: true, skip_empty_lines: true, relax_column_count: true }) as Row[];
}

function norm(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

// Distancia de Levenshtein simple, suficiente para catálogos de tamaño moderado.
function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

function countBy(rows: Row[], field: string, exclude: Set<string> = new Set()): Map<string, number> {
  const map = new Map<string, number>();
  for (const row of rows) {
    const v = (row[field] ?? "").trim();
    if (!v || exclude.has(norm(v))) continue;
    map.set(v, (map.get(v) ?? 0) + 1);
  }
  return map;
}

function toSortedList(map: Map<string, number>): { valor: string; conteo: number }[] {
  return [...map.entries()]
    .map(([valor, conteo]) => ({ valor, conteo }))
    .sort((a, b) => b.conteo - a.conteo);
}

// Marca pares de valores muy parecidos (posibles typos) dentro del mismo catálogo.
function flagPosiblesDuplicados(items: { valor: string; conteo: number }[]): { a: string; b: string; distancia: number }[] {
  const flags: { a: string; b: string; distancia: number }[] = [];
  const normalized = items.map((it) => ({ ...it, n: norm(it.valor) }));
  for (let i = 0; i < normalized.length; i++) {
    for (let j = i + 1; j < normalized.length; j++) {
      const a = normalized[i], b = normalized[j];
      const maxLen = Math.max(a.n.length, b.n.length);
      if (maxLen === 0) continue;
      if (a.n === b.n) {
        // mismo texto salvo mayúsculas/acentos/espacios: duplicado casi seguro
        flags.push({ a: a.valor, b: b.valor, distancia: 0 });
        continue;
      }
      const dist = levenshtein(a.n, b.n);
      // umbral relativo: tolera más distancia en strings largos, pero exige similitud alta
      if (dist > 0 && dist <= Math.max(2, Math.floor(maxLen * 0.15)) && maxLen > 3) {
        flags.push({ a: a.valor, b: b.valor, distancia: dist });
      }
    }
  }
  return flags.sort((a, b) => a.distancia - b.distancia);
}

function detectDateFormat(rows: Row[], field = "Fecha"): { dominante: string; muestras: string[] } {
  const patterns: Record<string, RegExp> = {
    "d/m/yyyy": /^\d{1,2}\/\d{1,2}\/\d{4}$/,
    "dd/mm/yyyy": /^\d{2}\/\d{2}\/\d{4}$/,
    "yyyy-mm-dd": /^\d{4}-\d{2}-\d{2}$/,
    "d-m-yyyy": /^\d{1,2}-\d{1,2}-\d{4}$/,
  };
  const counts: Record<string, number> = {};
  const samples: Record<string, string[]> = {};
  for (const row of rows) {
    const v = (row[field] ?? "").trim();
    if (!v) continue;
    for (const [name, re] of Object.entries(patterns)) {
      if (re.test(v)) {
        counts[name] = (counts[name] ?? 0) + 1;
        (samples[name] ??= []).push(v);
        break;
      }
    }
  }
  const dominante = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "desconocido";
  return { dominante, muestras: (samples[dominante] ?? []).slice(0, 5) };
}

function detectPercentFormat(rows: Row[], field = "%Confianza"): { dominante: string; muestras: string[] } {
  const patterns: Record<string, RegExp> = {
    "NN%": /^\d{1,3}%$/,
    "NN.N%": /^\d{1,3}\.\d%$/,
    "NN.NN%": /^\d{1,3}\.\d{2}%$/,
  };
  const counts: Record<string, number> = {};
  const samples: Record<string, string[]> = {};
  for (const row of rows) {
    const v = (row[field] ?? "").trim();
    if (!v) continue;
    for (const [name, re] of Object.entries(patterns)) {
      if (re.test(v)) {
        counts[name] = (counts[name] ?? 0) + 1;
        (samples[name] ??= []).push(v);
        break;
      }
    }
  }
  const dominante = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "desconocido";
  return { dominante, muestras: (samples[dominante] ?? []).slice(0, 5) };
}

// Deriva el nombre corto de encuestadora a partir de "Encuestadora + Fecha" ("Rubrum - Enero") y "MES".
function buildEncuestadoraCatalog(rows: Row[]): { valor: string; corto: string; conteo: number }[] {
  const perFull = new Map<string, Map<string, number>>(); // full -> (short -> count)
  for (const row of rows) {
    const full = (row["Encuestadora"] ?? "").trim();
    const combo = (row["Encuestadora + Fecha "] ?? row["Encuestadora + Fecha"] ?? "").trim();
    const mes = (row["MES"] ?? "").trim();
    if (!full || !combo) continue;
    let short = combo;
    if (mes && combo.endsWith(mes)) {
      short = combo.slice(0, combo.length - mes.length).replace(/-\s*$/, "").trim();
    }
    if (!short) continue;
    if (!perFull.has(full)) perFull.set(full, new Map());
    const m = perFull.get(full)!;
    m.set(short, (m.get(short) ?? 0) + 1);
  }
  const result: { valor: string; corto: string; conteo: number }[] = [];
  for (const [full, shorts] of perFull) {
    const [corto, conteo] = [...shorts.entries()].sort((a, b) => b[1] - a[1])[0];
    const total = [...shorts.values()].reduce((a, b) => a + b, 0);
    result.push({ valor: full, corto, conteo: total });
  }
  return result.sort((a, b) => b.conteo - a.conteo);
}

function main() {
  const gub = readCsv(GUBERNATURA_CSV);
  const alc = readCsv(ALCALDES_CSV);

  const encuestadoras = buildEncuestadoraCatalog([...gub, ...alc]);
  const entidades = toSortedList(countBy(gub, "Entidad"));
  const municipios = toSortedList(countBy(alc, "Municipio"));
  const partidos = toSortedList(countBy([...gub, ...alc], "Alianza/Partido", new Set(["ninguno"])));
  const tiposEscenario = toSortedList(countBy([...gub, ...alc], "Tipo de escenario"));
  const candidatos = toSortedList(countBy([...gub, ...alc], "Candidato", SENTINEL_CANDIDATOS));

  const catalogs = {
    generadoEn: new Date().toISOString(),
    gubernatura: {
      filas: gub.length,
      formatoFecha: detectDateFormat(gub),
      formatoPorcentaje: detectPercentFormat(gub),
    },
    alcaldes: {
      filas: alc.length,
      formatoFecha: detectDateFormat(alc),
      formatoPorcentaje: detectPercentFormat(alc),
    },
    encuestadoras,
    entidades,
    municipios,
    partidos,
    tiposEscenario,
    candidatos,
    posiblesDuplicados: {
      candidatos: flagPosiblesDuplicados(candidatos),
      partidos: flagPosiblesDuplicados(partidos),
      encuestadoras: flagPosiblesDuplicados(encuestadoras.map((e) => ({ valor: e.valor, conteo: e.conteo }))),
      municipios: flagPosiblesDuplicados(municipios),
      entidades: flagPosiblesDuplicados(entidades),
    },
  };

  mkdirSync("catalogs", { recursive: true });
  writeFileSync("catalogs/catalogs.json", JSON.stringify(catalogs, null, 2), "utf-8");

  const md: string[] = [];
  md.push(`# Catálogos generados — ${catalogs.generadoEn}`);
  md.push("");
  md.push(`## Gubernatura (${catalogs.gubernatura.filas} filas)`);
  md.push(`- Formato de fecha dominante: **${catalogs.gubernatura.formatoFecha.dominante}** (ej. ${catalogs.gubernatura.formatoFecha.muestras.join(", ")})`);
  md.push(`- Formato de %Confianza dominante: **${catalogs.gubernatura.formatoPorcentaje.dominante}** (ej. ${catalogs.gubernatura.formatoPorcentaje.muestras.join(", ")})`);
  md.push("");
  md.push(`## Alcaldes (${catalogs.alcaldes.filas} filas)`);
  md.push(`- Formato de fecha dominante: **${catalogs.alcaldes.formatoFecha.dominante}** (ej. ${catalogs.alcaldes.formatoFecha.muestras.join(", ")})`);
  md.push(`- Formato de %Confianza dominante: **${catalogs.alcaldes.formatoPorcentaje.dominante}** (ej. ${catalogs.alcaldes.formatoPorcentaje.muestras.join(", ")})`);
  md.push("");
  md.push(`## Encuestadoras (${encuestadoras.length})`);
  for (const e of encuestadoras) md.push(`- ${e.valor} → corto: "${e.corto}" (${e.conteo})`);
  md.push("");
  md.push(`## Entidades (${entidades.length})`);
  for (const e of entidades) md.push(`- ${e.valor} (${e.conteo})`);
  md.push("");
  md.push(`## Municipios (${municipios.length})`);
  for (const m of municipios) md.push(`- ${m.valor} (${m.conteo})`);
  md.push("");
  md.push(`## Partidos/Alianzas (${partidos.length})`);
  for (const p of partidos) md.push(`- ${p.valor} (${p.conteo})`);
  md.push("");
  md.push(`## Tipos de escenario (${tiposEscenario.length})`);
  for (const t of tiposEscenario) md.push(`- ${t.valor} (${t.conteo})`);
  md.push("");
  md.push(`## Candidatos (${candidatos.length} únicos)`);
  md.push("_(lista completa en catalogs.json; aquí solo posibles duplicados)_");
  md.push("");
  md.push(`## ⚠️ Posibles duplicados / typos a revisar`);
  for (const [cat, flags] of Object.entries(catalogs.posiblesDuplicados)) {
    if (flags.length === 0) continue;
    md.push(`### ${cat} (${flags.length})`);
    for (const f of flags) md.push(`- "${f.a}" ↔ "${f.b}" (distancia ${f.distancia})`);
  }

  writeFileSync("catalogs/catalogs.review.md", md.join("\n"), "utf-8");

  console.log(`OK: catalogs/catalogs.json y catalogs/catalogs.review.md generados.`);
  console.log(`Encuestadoras: ${encuestadoras.length}, Entidades: ${entidades.length}, Municipios: ${municipios.length}, Partidos: ${partidos.length}, Candidatos: ${candidatos.length}`);
}

main();
