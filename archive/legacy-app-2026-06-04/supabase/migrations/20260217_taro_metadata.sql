-- Schema base para metadados de capturas do app Taro.
-- Execute no SQL Editor do Supabase (ambiente de produção) uma única vez.

create extension if not exists pgcrypto;

create table if not exists public.taro_metadata (
  id uuid primary key default gen_random_uuid(),
  queue_id text not null,
  card_id integer not null,
  orientation text not null,
  captured_at timestamptz not null,
  byte_size integer not null,
  mime_type text not null,
  storage_path text not null,
  uploaded_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.taro_metadata add column if not exists queue_id text;
alter table public.taro_metadata add column if not exists card_id integer;
alter table public.taro_metadata add column if not exists orientation text;
alter table public.taro_metadata add column if not exists captured_at timestamptz;
alter table public.taro_metadata add column if not exists byte_size integer;
alter table public.taro_metadata add column if not exists mime_type text;
alter table public.taro_metadata add column if not exists storage_path text;
alter table public.taro_metadata add column if not exists uploaded_at timestamptz;
alter table public.taro_metadata add column if not exists created_at timestamptz;

alter table public.taro_metadata
  alter column queue_id set not null,
  alter column card_id set not null,
  alter column orientation set not null,
  alter column captured_at set not null,
  alter column byte_size set not null,
  alter column mime_type set not null,
  alter column storage_path set not null,
  alter column uploaded_at set not null;

alter table public.taro_metadata
  alter column uploaded_at set default now(),
  alter column created_at set default now();

create unique index if not exists taro_metadata_queue_id_key
  on public.taro_metadata (queue_id);

create index if not exists taro_metadata_card_orientation_idx
  on public.taro_metadata (card_id, orientation);

create index if not exists taro_metadata_uploaded_at_idx
  on public.taro_metadata (uploaded_at desc);

alter table public.taro_metadata enable row level security;

grant select, insert, update on public.taro_metadata to anon, authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'taro_metadata'
      and policyname = 'taro_metadata_select_public'
  ) then
    create policy taro_metadata_select_public
      on public.taro_metadata
      for select
      to anon, authenticated
      using (true);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'taro_metadata'
      and policyname = 'taro_metadata_insert_public'
  ) then
    create policy taro_metadata_insert_public
      on public.taro_metadata
      for insert
      to anon, authenticated
      with check (true);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'taro_metadata'
      and policyname = 'taro_metadata_update_public'
  ) then
    create policy taro_metadata_update_public
      on public.taro_metadata
      for update
      to anon, authenticated
      using (true)
      with check (true);
  end if;
end
$$;
