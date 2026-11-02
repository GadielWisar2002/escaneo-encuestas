-- Escaneo de Encuestas — tabla de respaldo + detección de duplicados por hash
-- de imagen. Corre esto UNA VEZ en el SQL Editor de tu proyecto Supabase:
-- https://supabase.com/dashboard/project/wzgzvxozgnazzykgfqfk/sql/new

create table if not exists public.encuestas (
  id uuid primary key default gen_random_uuid(),
  hash_imagen text not null unique,
  destino text not null check (destino in ('GUBERNATURA', 'ALCALDES', 'ALCALDES_OTROS_ESTADOS')),
  sheet_tab text not null,
  fecha text,
  encuestadora text,
  metodologia text,
  ubicacion text,
  columnas jsonb not null,
  filas jsonb not null,
  sheet_link text,
  creado_en timestamptz not null default now()
);

-- RLS activado y sin policies: solo la service_role key (usada por el
-- servidor) puede leer/escribir. La publishable key del navegador nunca
-- toca esta tabla directamente.
alter table public.encuestas enable row level security;
