"use client";

import { useEffect, useRef, useState } from "react";

export function Selector({
  etiqueta,
  valor,
  opciones,
  onCambio,
  vacio,
}: {
  etiqueta: string;
  valor: string;
  opciones: { valor: string; texto: string }[];
  onCambio: (v: string) => void;
  vacio?: string;
}) {
  return (
    <label className="db-campo">
      <span>{etiqueta}</span>
      <select value={valor} onChange={(e) => onCambio(e.target.value)}>
        {vacio !== undefined && <option value="">{vacio}</option>}
        {opciones.map((o) => (
          <option key={o.valor} value={o.valor}>
            {o.texto}
          </option>
        ))}
      </select>
    </label>
  );
}

export function Segmentos<T extends string>({
  etiqueta,
  valor,
  opciones,
  onCambio,
}: {
  etiqueta: string;
  valor: T;
  opciones: { valor: T; texto: string; deshabilitado?: boolean }[];
  onCambio: (v: T) => void;
}) {
  return (
    <div className="db-campo db-campo-ancho">
      <span>{etiqueta}</span>
      <div className="db-segmentos" role="group" aria-label={etiqueta}>
        {opciones.map((o) => (
          <button
            key={o.valor}
            type="button"
            className={o.valor === valor ? "activo" : ""}
            disabled={o.deshabilitado}
            onClick={() => onCambio(o.valor)}
          >
            {o.texto}
          </button>
        ))}
      </div>
    </div>
  );
}

export function MultiSelector({
  etiqueta,
  seleccion,
  opciones,
  onCambio,
  todos = "Todas",
}: {
  etiqueta: string;
  seleccion: string[];
  opciones: { valor: string; texto: string }[];
  onCambio: (v: string[]) => void;
  todos?: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!abierto) return;
    const cerrar = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setAbierto(false);
    };
    document.addEventListener("mousedown", cerrar);
    return () => document.removeEventListener("mousedown", cerrar);
  }, [abierto]);

  const resumen =
    seleccion.length === 0
      ? todos
      : seleccion.length === 1
        ? opciones.find((o) => o.valor === seleccion[0])?.texto ?? seleccion[0]
        : `${seleccion.length} seleccionadas`;

  return (
    <div className="db-campo" ref={ref}>
      <span>{etiqueta}</span>
      <button type="button" className="db-multi-boton" onClick={() => setAbierto((a) => !a)} aria-expanded={abierto}>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{resumen}</span>
        <span aria-hidden>▾</span>
      </button>
      {abierto && (
        <div className="db-multi-panel">
          <div className="db-multi-acciones">
            <button type="button" className="db-link" onClick={() => onCambio([])}>
              {todos}
            </button>
            <button type="button" className="db-link" onClick={() => setAbierto(false)}>
              Listo
            </button>
          </div>
          {opciones.map((o) => (
            <label key={o.valor}>
              <input
                type="checkbox"
                checked={seleccion.includes(o.valor)}
                onChange={(e) =>
                  onCambio(e.target.checked ? [...seleccion, o.valor] : seleccion.filter((x) => x !== o.valor))
                }
              />
              {o.texto}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
