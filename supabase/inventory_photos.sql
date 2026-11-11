-- Inventory photos: run each block in the Supabase SQL editor.

create table if not exists inventory_photo_sections (
  id uuid primary key default gen_random_uuid(),
  inventory_id uuid not null references inventories(id) on delete cascade,
  name text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists inventory_photos (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references inventory_photo_sections(id) on delete cascade,
  inventory_id uuid not null references inventories(id) on delete cascade,
  storage_path text not null,
  width int,
  height int,
  size_bytes int,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists inventory_photo_sections_inventory_idx on inventory_photo_sections(inventory_id, sort_order);
create index if not exists inventory_photos_section_idx on inventory_photos(section_id, sort_order);
create index if not exists inventory_photos_inventory_idx on inventory_photos(inventory_id);

alter table inventory_photo_sections enable row level security;
alter table inventory_photos enable row level security;
create policy allow_all on inventory_photo_sections for all using (true) with check (true);
create policy allow_all on inventory_photos for all using (true) with check (true);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('inventory-photos', 'inventory-photos', false, 10485760, array['image/jpeg'])
on conflict (id) do nothing;

create policy "inventory_photos_select" on storage.objects for select to authenticated using (bucket_id = 'inventory-photos');
create policy "inventory_photos_insert" on storage.objects for insert to authenticated with check (bucket_id = 'inventory-photos');
create policy "inventory_photos_update" on storage.objects for update to authenticated using (bucket_id = 'inventory-photos') with check (bucket_id = 'inventory-photos');
create policy "inventory_photos_delete" on storage.objects for delete to authenticated using (bucket_id = 'inventory-photos');
