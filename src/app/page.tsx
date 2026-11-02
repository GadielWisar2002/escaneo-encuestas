"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { RespuestaScan, ResultadoApi } from "@/lib/api-types";
import { esDuplicado } from "@/lib/api-types";
import Revision from "@/components/Revision";

type ItemCola = {
  id: string;
  archivo: File;
  previewUrl: string;
};

type DuplicadoInfo = Extract<RespuestaScan, { duplicado: true }>;

export default function Home() {
  const [cola, setCola] = useState<ItemCola[]>([]);
  const [activoId, setActivoId] = useState<string | null>(null);
  const [sobreDropzone, setSobreDropzone] = useState(false);
  const [zoom, setZoom] = useState(false);

  // Resultados cacheados por imagen (id de ItemCola), para que el escaneo
  // masivo pueda procesar varias y el usuario las revise una por una después.
  const [resultados, setResultados] = useState<Record<string, ResultadoApi>>({});
  const [duplicados, setDuplicados] = useState<Record<string, DuplicadoInfo>>({});
  const [erroresPorItem, setErroresPorItem] = useState<Record<string, string>>({});
  const [escaneandoIds, setEscaneandoIds] = useState<string[]>([]);
  const [escaneandoTodo, setEscaneandoTodo] = useState(false);
  const [progresoLote, setProgresoLote] = useState<{ hecho: number; total: number } | null>(null);
  const [convirtiendoPdfs, setConvirtiendoPdfs] = useState(0);
  const [errorPdf, setErrorPdf] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);

  const activo = cola.find((i) => i.id === activoId) ?? null;
  const resultadoActivo = activo ? (resultados[activo.id] ?? null) : null;
  const duplicadoActivo = activo ? (duplicados[activo.id] ?? null) : null;
  const errorActivo = activo ? (erroresPorItem[activo.id] ?? null) : null;
  const escaneandoActivo = activo ? escaneandoIds.includes(activo.id) : false;
  const pendientesDeEscanear = cola.filter((i) => !resultados[i.id] && !duplicados[i.id]);

  function itemDeArchivo(archivo: File): ItemCola {
    return {
      id: `${archivo.name}-${archivo.size}-${Math.random().toString(36).slice(2)}`,
      archivo,
      previewUrl: URL.createObjectURL(archivo),
    };
  }

  function agregarItems(nuevos: ItemCola[]) {
    if (nuevos.length === 0) return;
    setCola((prev) => [...prev, ...nuevos]);
    setActivoId((prev) => prev ?? nuevos[0].id);
  }

  function esPdf(archivo: File): boolean {
    return archivo.type === "application/pdf" || /\.pdf$/i.test(archivo.name);
  }

  // Convierte un PDF a una imagen PNG por página en el servidor (pdf.js no
  // corre bien del lado del cliente para esto) y agrega cada página a la
  // cola como si fuera una imagen suelta más: todo lo demás (escaneo,
  // duplicados, revisión) ya funciona igual sin cambios.
  async function agregarPdf(pdf: File) {
    setConvirtiendoPdfs((n) => n + 1);
    try {
      const formData = new FormData();
      formData.append("pdf", pdf);
      const res = await fetch("/api/pdf/paginas", { method: "POST", body: formData });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `Error ${res.status}`);
      const paginas: string[] = json.paginas;
      const base = pdf.name.replace(/\.pdf$/i, "");
      const nuevos = paginas.map((b64, i) => {
        const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
        const nombre = paginas.length > 1 ? `${base}-pagina-${i + 1}.png` : `${base}.png`;
        return itemDeArchivo(new File([bytes], nombre, { type: "image/png" }));
      });
      agregarItems(nuevos);
    } catch (err) {
      setErrorPdf(
        `No se pudo convertir "${pdf.name}": ${err instanceof Error ? err.message : "error desconocido"}.`,
      );
    } finally {
      setConvirtiendoPdfs((n) => n - 1);
    }
  }

  const agregarArchivos = useCallback((files: FileList | File[]) => {
    const lista = Array.from(files);
    const pdfs = lista.filter(esPdf);
    const imagenes = lista.filter((f) => !esPdf(f));

    agregarItems(imagenes.map(itemDeArchivo));
    for (const pdf of pdfs) {
      setErrorPdf(null);
      void agregarPdf(pdf);
    }
  }, []);

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.items ?? [])
        .filter((it) => it.kind === "file")
        .map((it) => it.getAsFile())
        .filter((f): f is File => f !== null);
      if (files.length > 0) agregarArchivos(files);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [agregarArchivos]);

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setSobreDropzone(false);
    if (e.dataTransfer.files.length > 0) agregarArchivos(e.dataTransfer.files);
  }

  function seleccionar(id: string) {
    setActivoId(id);
    setZoom(false);
  }

  function limpiarItem(id: string) {
    setResultados((prev) => {
      const n = { ...prev };
      delete n[id];
      return n;
    });
    setDuplicados((prev) => {
      const n = { ...prev };
      delete n[id];
      return n;
    });
    setErroresPorItem((prev) => {
      const n = { ...prev };
      delete n[id];
      return n;
    });
  }

  function siguienteEnCola() {
    setCola((prevCola) => {
      const idx = prevCola.findIndex((i) => i.id === activoId);
      const procesado = prevCola[idx];
      const restante = prevCola.filter((i) => i.id !== activoId);
      if (procesado) {
        URL.revokeObjectURL(procesado.previewUrl);
        limpiarItem(procesado.id);
      }
      const siguiente = restante[idx] ?? restante[idx - 1] ?? null;
      setActivoId(siguiente?.id ?? null);
      setZoom(false);
      return restante;
    });
  }

  // Escanea una sola imagen de la cola. No toca el estado de las demás, así
  // que es seguro llamarla en bucle para el escaneo masivo.
  async function escanearItem(item: ItemCola, forzar = false) {
    setEscaneandoIds((prev) => [...prev, item.id]);
    setErroresPorItem((prev) => {
      const n = { ...prev };
      delete n[item.id];
      return n;
    });
    try {
      const formData = new FormData();
      formData.append("imagen", item.archivo);
      if (forzar) formData.append("forzar", "true");
      const res = await fetch("/api/scan", { method: "POST", body: formData });
      const json = (await res.json()) as RespuestaScan | { error: string };
      if (!res.ok || "error" in json) {
        throw new Error("error" in json ? json.error : `Error ${res.status}`);
      }
      if (esDuplicado(json)) {
        setDuplicados((prev) => ({ ...prev, [item.id]: json }));
        setResultados((prev) => {
          const n = { ...prev };
          delete n[item.id];
          return n;
        });
      } else {
        setResultados((prev) => ({ ...prev, [item.id]: json }));
        setDuplicados((prev) => {
          const n = { ...prev };
          delete n[item.id];
          return n;
        });
      }
    } catch (err) {
      setErroresPorItem((prev) => ({
        ...prev,
        [item.id]: err instanceof Error ? err.message : "Error desconocido.",
      }));
    } finally {
      setEscaneandoIds((prev) => prev.filter((id) => id !== item.id));
    }
  }

  // Escanea en orden, una por una, todas las imágenes de la cola que todavía
  // no tengan resultado (ni estén marcadas como duplicado). Secuencial a
  // propósito: evita saturar la API de Claude y deja un progreso predecible.
  async function escanearTodo() {
    const pendientes = cola.filter((i) => !resultados[i.id] && !duplicados[i.id]);
    if (pendientes.length === 0 || escaneandoTodo) return;
    setEscaneandoTodo(true);
    setProgresoLote({ hecho: 0, total: pendientes.length });
    try {
      for (let i = 0; i < pendientes.length; i++) {
        await escanearItem(pendientes[i]);
        setProgresoLote({ hecho: i + 1, total: pendientes.length });
      }
    } finally {
      setEscaneandoTodo(false);
      setProgresoLote(null);
    }
  }

  return (
    <div className="contenedor">
      <div className="encabezado-dashboard">
        <h1 style={{ margin: 0 }}>Escaneo de Encuestas</h1>
        <Link href="/dashboard" className="btn-secundario">
          Ver dashboard →
        </Link>
      </div>

      <div className="columnas">
        <div className="panel">
          <div
            className={`dropzone${sobreDropzone ? " sobre" : ""}`}
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setSobreDropzone(true);
            }}
            onDragLeave={() => setSobreDropzone(false)}
            onDrop={onDrop}
          >
            Arrastra una imagen o PDF aquí, haz clic para elegirlo, o pega con Ctrl/Cmd+V
            <br />
            <small>JPG, PNG, HEIC, PDF — máx. 10 MB (imagen) / 20 MB (PDF)</small>
            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png,image/heic,image/heif,application/pdf,.pdf"
              multiple
              style={{ display: "none" }}
              onChange={(e) => {
                if (e.target.files) agregarArchivos(e.target.files);
                e.target.value = "";
              }}
            />
          </div>

          {errorPdf && <div className="alerta" style={{ marginTop: 12 }}>{errorPdf}</div>}
          {convirtiendoPdfs > 0 && (
            <p style={{ marginTop: 12, color: "#5b6472", fontSize: "0.85rem" }}>
              Convirtiendo {convirtiendoPdfs} PDF{convirtiendoPdfs > 1 ? "s" : ""} a imágenes…
            </p>
          )}

          {cola.length > 0 && (
            <>
              <div className="cola">
                {cola.map((item) => {
                  const estado = escaneandoIds.includes(item.id)
                    ? "escaneando"
                    : resultados[item.id]
                      ? "lista"
                      : duplicados[item.id]
                        ? "duplicada"
                        : erroresPorItem[item.id]
                          ? "con-error"
                          : null;
                  return (
                    <div
                      key={item.id}
                      className={`cola-item${item.id === activoId ? " activo" : ""}${estado ? ` ${estado}` : ""}`}
                      onClick={() => seleccionar(item.id)}
                      title={item.archivo.name}
                    >
                      <img src={item.previewUrl} alt={item.archivo.name} />
                      {estado === "escaneando" && <span className="cola-item-badge">…</span>}
                      {estado === "lista" && <span className="cola-item-badge">✓</span>}
                      {estado === "duplicada" && <span className="cola-item-badge">!</span>}
                      {estado === "con-error" && <span className="cola-item-badge">✕</span>}
                    </div>
                  );
                })}
              </div>

              <div className="fila" style={{ marginTop: 10 }}>
                <button
                  type="button"
                  className="btn-secundario"
                  onClick={escanearTodo}
                  disabled={escaneandoTodo || pendientesDeEscanear.length === 0}
                >
                  {escaneandoTodo
                    ? `Escaneando ${progresoLote?.hecho ?? 0}/${progresoLote?.total ?? 0}…`
                    : `Escanear todas (${pendientesDeEscanear.length})`}
                </button>
              </div>
            </>
          )}

          {activo && (
            <>
              <div className="preview-wrap" style={{ marginTop: 12 }}>
                <img
                  src={activo.previewUrl}
                  alt={activo.archivo.name}
                  className={zoom ? "zoom" : ""}
                  onClick={() => setZoom((z) => !z)}
                />
              </div>
              <div className="fila">
                <button
                  className="btn-primario"
                  onClick={() => escanearItem(activo)}
                  disabled={escaneandoActivo || escaneandoTodo}
                >
                  {escaneandoActivo ? "Escaneando…" : "Escanear"}
                </button>
                <span style={{ fontSize: "0.85rem", color: "#5b6472" }}>{activo.archivo.name}</span>
              </div>
            </>
          )}
        </div>

        <div className="panel">
          {errorActivo && <div className="alerta">{errorActivo}</div>}

          {duplicadoActivo && (
            <div className="alerta">
              Esta imagen ya se escaneó antes
              {duplicadoActivo.registroPrevio.fecha ? ` (fecha: ${duplicadoActivo.registroPrevio.fecha})` : ""}
              {duplicadoActivo.registroPrevio.encuestadora
                ? `, encuestadora: ${duplicadoActivo.registroPrevio.encuestadora}`
                : ""}
              . Se subió a{" "}
              {duplicadoActivo.registroPrevio.destino === "GUBERNATURA"
                ? "Gubernatura"
                : duplicadoActivo.registroPrevio.destino === "ALCALDES_OTROS_ESTADOS"
                  ? "Alcaldes (otros estados)"
                  : "Alcaldes (NL)"}
              .
              {duplicadoActivo.registroPrevio.sheetLink && (
                <>
                  {" "}
                  <a href={duplicadoActivo.registroPrevio.sheetLink} target="_blank" rel="noreferrer">
                    Ver en Google Sheets
                  </a>
                  .
                </>
              )}
              <div className="fila" style={{ marginTop: 8 }}>
                <button
                  className="btn-secundario"
                  onClick={() => activo && escanearItem(activo, true)}
                  disabled={escaneandoActivo || escaneandoTodo}
                >
                  Escanear de todas formas
                </button>
              </div>
            </div>
          )}

          {!resultadoActivo && !errorActivo && !duplicadoActivo && (
            <p style={{ color: "#5b6472" }}>
              Sube o pega una o varias imágenes. Usa &quot;Escanear todas&quot; para procesarlas en lote, o
              selecciona una y presiona &quot;Escanear&quot; para revisar y corregir los datos aquí.
            </p>
          )}

          {resultadoActivo && <Revision resultado={resultadoActivo} onSubido={siguienteEnCola} />}
        </div>
      </div>
    </div>
  );
}
