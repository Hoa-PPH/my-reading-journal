-- Bước 1/2: tạo bảng. Chạy riêng file này trước.
create table if not exists public.sources (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  type text not null default 'book' check (type in ('book','article','podcast','other')),
  title text not null check (length(trim(title)) > 0),
  author text,
  status text not null default 'want' check (status in ('want','reading','done')),
  purpose text,
  started_at date,
  finished_at date,
  current_page int,
  total_pages int,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  synced_at timestamptz not null default now()
);

create table if not exists public.notes (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  source_id uuid references public.sources(id) on delete set null,
  kind text not null default 'insight' check (kind in ('insight','question','rebuttal','lesson')),
  reflection text not null check (length(trim(reflection)) > 0),
  quote text,
  page int,
  prompt_key text,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  synced_at timestamptz not null default now()
);

create index if not exists sources_sync on public.sources (user_id, synced_at);
create index if not exists notes_sync on public.notes (user_id, synced_at);
create index if not exists notes_source on public.notes (source_id);
