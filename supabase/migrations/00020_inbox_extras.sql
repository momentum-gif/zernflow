-- Inbox like ManyChat: notes, reminders ("Recuérdamelo en"), saved replies
-- ("Respuestas predefinidas") and system events shown inside the chat.

alter table conversations add column if not exists remind_at timestamptz;

create table if not exists inbox_notes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  conversation_id uuid not null references conversations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  text text not null default '',
  attachment_url text,
  attachment_type text,
  created_at timestamptz not null default now()
);
create index if not exists idx_inbox_notes_conv on inbox_notes(conversation_id, created_at);

create table if not exists inbox_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  conversation_id uuid not null references conversations(id) on delete cascade,
  text text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_inbox_events_conv on inbox_events(conversation_id, created_at);

create table if not exists saved_replies (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  title text not null,
  text text not null,
  created_at timestamptz not null default now()
);

alter table inbox_notes enable row level security;
alter table inbox_events enable row level security;
alter table saved_replies enable row level security;

drop policy if exists "members manage inbox notes" on inbox_notes;
create policy "members manage inbox notes" on inbox_notes for all
  using (is_workspace_member(workspace_id)) with check (is_workspace_member(workspace_id));
drop policy if exists "members manage inbox events" on inbox_events;
create policy "members manage inbox events" on inbox_events for all
  using (is_workspace_member(workspace_id)) with check (is_workspace_member(workspace_id));
drop policy if exists "members manage saved replies" on saved_replies;
create policy "members manage saved replies" on saved_replies for all
  using (is_workspace_member(workspace_id)) with check (is_workspace_member(workspace_id));
