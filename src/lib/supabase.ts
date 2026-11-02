import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let clienteCache: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (clienteCache) return clienteCache;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en .env.");
  }
  clienteCache = createClient(url, key, { auth: { persistSession: false } });
  return clienteCache;
}

export type RegistroPrevio = {
  fecha: string | null;
  encuestadora: string | null;
  destino: string;
  sheet_tab: string;
  sheet_link: string | null;
  creado_en: string;
};

// Devuelve el registro ya guardado con ese hash de imagen, o null si no existe.
export async function buscarPorHash(hash: string): Promise<RegistroPrevio | null> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("encuestas")
    .select("fecha, encuestadora, destino, sheet_tab, sheet_link, creado_en")
    .eq("hash_imagen", hash)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export type NuevoRegistro = {
  hash_imagen: string;
  destino: "GUBERNATURA" | "ALCALDES" | "ALCALDES_OTROS_ESTADOS";
  sheet_tab: string;
  fecha: string;
  encuestadora: string;
  metodologia: string;
  ubicacion: string;
  columnas: string[];
  filas: string[][];
  sheet_link: string;
};

// Se llama solo después de que la escritura a Google Sheets ya tuvo éxito,
// para que Supabase quede como copia/espejo de lo realmente subido.
export async function registrarEncuesta(registro: NuevoRegistro): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase.from("encuestas").insert(registro);
  if (error) throw error;
}
