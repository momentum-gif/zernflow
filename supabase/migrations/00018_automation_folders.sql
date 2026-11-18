-- ManyChat-style folders for "Mis automatizaciones".
create table if not exists automation_folders (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

alter table automation_folders enable row level security;

drop policy if exists "Members manage automation folders" on automation_folders;
create policy "Members manage automation folders"
  on automation_folders for all
  using (is_workspace_member(workspace_id))
  with check (is_workspace_member(workspace_id));

alter table flows add column if not exists folder_id uuid references automation_folders(id) on delete set null;
create index if not exists flows_folder_id_idx on flows(folder_id);
