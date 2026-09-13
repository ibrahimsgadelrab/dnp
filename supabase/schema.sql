create extension if not exists "uuid-ossp";

create type app_role as enum ('admin', 'supervisor');
create type branch_density as enum ('high', 'low');
create type employee_role as enum ('nutrition_specialist', 'supplement_specialist', 'supplement_consultant');

create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role app_role not null default 'supervisor',
  region text,
  created_at timestamptz not null default now()
);

create table public.evaluation_cycles (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  starts_at date not null,
  ends_at date not null,
  working_days integer not null,
  created_by uuid references public.users(id),
  created_at timestamptz not null default now()
);

create table public.branches (
  id uuid primary key default uuid_generate_v4(),
  name text not null unique,
  region text,
  density_override branch_density,
  target_revenue numeric not null default 0,
  created_at timestamptz not null default now()
);

create table public.employees (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  staff_id text,
  role employee_role not null,
  branch_id uuid references public.branches(id),
  current_target numeric not null default 1,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.employee_assignments (
  id uuid primary key default uuid_generate_v4(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  branch_id uuid not null references public.branches(id),
  starts_at date not null,
  ends_at date,
  working_days integer not null default 0,
  transfer_factor numeric,
  annual_leave_days integer not null default 0
);

create table public.settings_snapshots (
  id uuid primary key default uuid_generate_v4(),
  cycle_id uuid not null references public.evaluation_cycles(id) on delete cascade,
  settings jsonb not null,
  created_by uuid references public.users(id),
  created_at timestamptz not null default now()
);

create table public.imports (
  id uuid primary key default uuid_generate_v4(),
  cycle_id uuid not null references public.evaluation_cycles(id) on delete cascade,
  source_file text not null,
  mapping jsonb not null,
  report jsonb not null,
  status text not null default 'pending',
  created_by uuid references public.users(id),
  created_at timestamptz not null default now()
);

create table public.visits (
  id uuid primary key default uuid_generate_v4(),
  import_id uuid references public.imports(id) on delete set null,
  cycle_id uuid references public.evaluation_cycles(id) on delete cascade,
  client_name text,
  client_id text not null,
  normalized_client_id text not null,
  visit_date date not null,
  visit_time time,
  weight numeric,
  height numeric,
  bmi numeric,
  specialist text,
  sales_employee text,
  branch text,
  customer_goal text not null default 'loss',
  visit_type text,
  free_month boolean not null default false,
  program text,
  products text,
  notes text,
  valid_visit boolean not null default false,
  excluded boolean not null default false,
  duplicate_same_day boolean not null default false,
  invalid_reason text,
  created_at timestamptz not null default now()
);

create table public.client_profiles (
  id uuid primary key default uuid_generate_v4(),
  cycle_id uuid not null references public.evaluation_cycles(id) on delete cascade,
  normalized_client_id text not null,
  name text,
  height numeric,
  goal text,
  first_weight numeric,
  last_weight numeric,
  min_weight numeric,
  progress numeric not null default 0,
  bmi numeric,
  reviewer boolean not null default false,
  free_month_client boolean not null default false,
  free_month_eligible boolean not null default false,
  ideal_weight boolean not null default false,
  maintenance boolean not null default false,
  excluded boolean not null default false,
  unique (cycle_id, normalized_client_id)
);

create table public.evaluation_results (
  id uuid primary key default uuid_generate_v4(),
  cycle_id uuid not null references public.evaluation_cycles(id) on delete cascade,
  employee_id uuid references public.employees(id),
  branch_id uuid references public.branches(id),
  path text not null,
  score numeric not null,
  achievement_pct numeric not null,
  target_delta numeric not null,
  old_target numeric not null,
  new_target numeric not null,
  rows jsonb not null,
  created_at timestamptz not null default now()
);

create table public.audit_logs (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references public.users(id),
  cycle_id uuid references public.evaluation_cycles(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text,
  before_value jsonb,
  after_value jsonb,
  created_at timestamptz not null default now()
);

alter table public.users enable row level security;
alter table public.evaluation_cycles enable row level security;
alter table public.branches enable row level security;
alter table public.employees enable row level security;
alter table public.employee_assignments enable row level security;
alter table public.settings_snapshots enable row level security;
alter table public.imports enable row level security;
alter table public.visits enable row level security;
alter table public.client_profiles enable row level security;
alter table public.evaluation_results enable row level security;
alter table public.audit_logs enable row level security;

create policy "authenticated read" on public.evaluation_cycles for select to authenticated using (true);
create policy "authenticated read branches" on public.branches for select to authenticated using (true);
create policy "authenticated read employees" on public.employees for select to authenticated using (true);
create policy "authenticated read visits" on public.visits for select to authenticated using (true);
create policy "authenticated write imports" on public.imports for insert to authenticated with check (true);
create policy "authenticated write visits" on public.visits for insert to authenticated with check (true);
create policy "admin all audit" on public.audit_logs for all to authenticated using (
  exists (select 1 from public.users where users.id = auth.uid() and users.role = 'admin')
) with check (
  exists (select 1 from public.users where users.id = auth.uid() and users.role = 'admin')
);
