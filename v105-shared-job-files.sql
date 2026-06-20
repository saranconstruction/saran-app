-- V10.5 - Photos, notes et documents de chantier partagés
-- À exécuter une seule fois dans Supabase SQL Editor.

-- 1) Bucket Supabase Storage pour les fichiers de chantier
insert into storage.buckets (id, name, public)
values ('job-files', 'job-files', true)
on conflict (id) do update set public = true;

-- 2) Tables partagées
create table if not exists public.job_photos (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  file_path text not null,
  public_url text not null,
  original_name text,
  mime_type text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.job_documents (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  file_path text not null,
  public_url text not null,
  original_name text,
  mime_type text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.job_notes (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  note text not null,
  author_name text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- 3) Index pour vitesse
create index if not exists job_photos_job_id_created_at_idx on public.job_photos(job_id, created_at desc);
create index if not exists job_documents_job_id_created_at_idx on public.job_documents(job_id, created_at desc);
create index if not exists job_notes_job_id_created_at_idx on public.job_notes(job_id, created_at desc);

-- 4) RLS
alter table public.job_photos enable row level security;
alter table public.job_documents enable row level security;
alter table public.job_notes enable row level security;

drop policy if exists "job_photos_select_authenticated" on public.job_photos;
create policy "job_photos_select_authenticated" on public.job_photos
for select to authenticated using (true);

drop policy if exists "job_photos_insert_authenticated" on public.job_photos;
create policy "job_photos_insert_authenticated" on public.job_photos
for insert to authenticated with check (auth.uid() = created_by);

drop policy if exists "job_photos_delete_own_or_admin" on public.job_photos;
create policy "job_photos_delete_own_or_admin" on public.job_photos
for delete to authenticated using (
  auth.uid() = created_by or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
);

drop policy if exists "job_documents_select_authenticated" on public.job_documents;
create policy "job_documents_select_authenticated" on public.job_documents
for select to authenticated using (true);

drop policy if exists "job_documents_insert_authenticated" on public.job_documents;
create policy "job_documents_insert_authenticated" on public.job_documents
for insert to authenticated with check (auth.uid() = created_by);

drop policy if exists "job_documents_delete_own_or_admin" on public.job_documents;
create policy "job_documents_delete_own_or_admin" on public.job_documents
for delete to authenticated using (
  auth.uid() = created_by or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
);

drop policy if exists "job_notes_select_authenticated" on public.job_notes;
create policy "job_notes_select_authenticated" on public.job_notes
for select to authenticated using (true);

drop policy if exists "job_notes_insert_authenticated" on public.job_notes;
create policy "job_notes_insert_authenticated" on public.job_notes
for insert to authenticated with check (auth.uid() = created_by);

drop policy if exists "job_notes_delete_own_or_admin" on public.job_notes;
create policy "job_notes_delete_own_or_admin" on public.job_notes
for delete to authenticated using (
  auth.uid() = created_by or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
);

-- 5) Politiques Storage pour le bucket job-files
-- Les fichiers sont publics en lecture via public_url, mais seuls les users connectés peuvent uploader.
drop policy if exists "job_files_read_public" on storage.objects;
create policy "job_files_read_public" on storage.objects
for select using (bucket_id = 'job-files');

drop policy if exists "job_files_insert_authenticated" on storage.objects;
create policy "job_files_insert_authenticated" on storage.objects
for insert to authenticated with check (bucket_id = 'job-files');

drop policy if exists "job_files_delete_authenticated" on storage.objects;
create policy "job_files_delete_authenticated" on storage.objects
for delete to authenticated using (bucket_id = 'job-files');
