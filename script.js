-- Saran Construction App V5 - Supabase setup
-- Run this in Supabase: SQL Editor -> New query -> paste -> Run

create extension if not exists "pgcrypto";

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique,
  full_name text,
  role text default 'employee' check (role in ('admin','employee')),
  created_at timestamptz default now()
);

create table if not exists jobs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  phone text,
  notes text,
  color text default '#9ca3af',
  status text default 'active',
  created_by uuid references auth.users(id),
  created_at timestamptz default now()
);

create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references jobs(id) on delete set null,
  title text not null,
  event_date date not null,
  start_time text default '07:00',
  end_time text,
  type text default 'chantier',
  notes text,
  color text default '#9ca3af',
  series_id text,
  created_by uuid references auth.users(id),
  created_at timestamptz default now()
);

create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references events(id) on delete cascade,
  job_id uuid references jobs(id) on delete set null,
  task_date date,
  title text not null,
  done boolean default false,
  created_by uuid references auth.users(id),
  created_at timestamptz default now()
);

create table if not exists time_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  job_id uuid references jobs(id) on delete set null,
  punch_in timestamptz not null,
  punch_out timestamptz,
  lunch_minutes integer default 30,
  paid_minutes integer,
  note text,
  created_at timestamptz default now()
);

create table if not exists expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  job_id uuid references jobs(id) on delete set null,
  supplier text,
  amount numeric(10,2) default 0,
  description text,
  category text default 'matériaux',
  receipt_data text,
  expense_date date default current_date,
  created_at timestamptz default now()
);

-- For now, RLS is intentionally disabled so your simple Vercel static app can work quickly.
-- Later, when the app is stable, enable RLS and add policies for Jesse/Admin and Karl/Employee.
