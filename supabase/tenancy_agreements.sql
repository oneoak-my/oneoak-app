create table if not exists public.tenancy_agreements (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid null references public.units(id) on delete set null,
  template_id text not null default 'standard-forfeit-2-months',
  title text,
  data jsonb not null default '{}'::jsonb,
  created_by uuid default auth.uid(),
  updated_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.tenancy_agreements enable row level security;

drop policy if exists "tenancy_agreements_select" on public.tenancy_agreements;
drop policy if exists "tenancy_agreements_insert" on public.tenancy_agreements;
drop policy if exists "tenancy_agreements_update" on public.tenancy_agreements;
drop policy if exists "tenancy_agreements_delete" on public.tenancy_agreements;

create policy "tenancy_agreements_select" on public.tenancy_agreements for select to authenticated using (true);
create policy "tenancy_agreements_insert" on public.tenancy_agreements for insert to authenticated with check (true);
create policy "tenancy_agreements_update" on public.tenancy_agreements for update to authenticated using (true) with check (true);
create policy "tenancy_agreements_delete" on public.tenancy_agreements for delete to authenticated using (true);

notify pgrst, 'reload schema';
