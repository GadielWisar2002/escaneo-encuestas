import type { ExtraccionEncuesta } from "./schema";

export type ResultadoApi = {
  datos: ExtraccionEncuesta;
  tokensEntrada: number;
  tokensSalida: number;
  costoUsd: number | null;
  modelo: string;
  hash: string;
};

export type RespuestaDuplicado = {
  duplicado: true;
  hash: string;
  registroPrevio: {
    fecha: string | null;
    encuestadora: string | null;
    destino: string;
    sheetLink: string | null;
    creadoEn: string;
  };
};

export type RespuestaScan = ResultadoApi | RespuestaDuplicado;

export function esDuplicado(r: RespuestaScan): r is RespuestaDuplicado {
  return (r as RespuestaDuplicado).duplicado === true;
}
