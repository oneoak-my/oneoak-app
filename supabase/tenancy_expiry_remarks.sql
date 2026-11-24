create table if not exists public.tenancy_expiry_remarks (
  source_key text primary key,
  remark text,
  updated_at timestamptz not null default now()
);

alter table public.tenancy_expiry_remarks enable row level security;

drop policy if exists "tenancy_expiry_remarks_select" on public.tenancy_expiry_remarks;
drop policy if exists "tenancy_expiry_remarks_insert" on public.tenancy_expiry_remarks;
drop policy if exists "tenancy_expiry_remarks_update" on public.tenancy_expiry_remarks;
drop policy if exists "tenancy_expiry_remarks_delete" on public.tenancy_expiry_remarks;

create policy "tenancy_expiry_remarks_select" on public.tenancy_expiry_remarks for select to authenticated using (true);
create policy "tenancy_expiry_remarks_insert" on public.tenancy_expiry_remarks for insert to authenticated with check (true);
create policy "tenancy_expiry_remarks_update" on public.tenancy_expiry_remarks for update to authenticated using (true) with check (true);
create policy "tenancy_expiry_remarks_delete" on public.tenancy_expiry_remarks for delete to authenticated using (true);

notify pgrst, 'reload schema';
