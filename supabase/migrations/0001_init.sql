-- =====================================================================
-- MasterFlow: initial schema, RLS policies, triggers and realtime setup
-- Run once in the Supabase SQL editor (or with `supabase db push`).
-- =====================================================================

-- ---------- helpers ----------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------- tables ----------
create table public.projects (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 60),
  summary     text not null default '' check (char_length(summary) <= 140),
  goal        text not null default '' check (char_length(goal) <= 500),
  focus       text not null default '' check (char_length(focus) <= 500),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index projects_user_idx on public.projects (user_id, created_at);

create table public.tasks (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users(id) on delete cascade,
  project_id     uuid references public.projects(id) on delete set null,
  title          text not null check (char_length(title) between 1 and 200),
  type           text not null default 'short' check (type in ('urgent','deep','short')),
  note           text not null default '' check (char_length(note) <= 300),
  planned_date   date,                       -- null = long term
  status         text not null default 'todo' check (status in ('todo','doing','done')),
  minutes        integer not null default 0 check (minutes >= 0),
  started_at     timestamptz,                -- set while a timer is running
  completed_at   timestamptz,
  last_worked    date,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index tasks_user_date_idx    on public.tasks (user_id, planned_date);
create index tasks_user_project_idx on public.tasks (user_id, project_id);
create index tasks_user_status_idx  on public.tasks (user_id, status);

create table public.user_settings (
  user_id         uuid primary key references auth.users(id) on delete cascade,
  assistant_name  text not null default 'Flow' check (char_length(assistant_name) between 1 and 30),
  tone            text not null default 'direct' check (char_length(tone) <= 200),
  methodology     text not null default 'One must-win task per day, done first' check (char_length(methodology) <= 500),
  rules           text not null default '' check (char_length(rules) <= 2000),
  voice           boolean not null default false,
  morning         text not null default '09:00' check (morning  ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  midday          text not null default '13:00' check (midday   ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  evening         text not null default '18:00' check (evening  ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  nudge           integer not null default 0 check (nudge between 0 and 240),
  onboarded       boolean not null default false,
  active_project  uuid references public.projects(id) on delete set null,
  timezone        text not null default 'UTC' check (char_length(timezone) <= 64),
  model           text not null default '' check (char_length(model) <= 100),
  -- Maintained only by the server (Netlify function). Clients cannot write these.
  key_provider    text check (key_provider in ('anthropic','openai')),
  key_last4       text,
  has_key         boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table public.day_summaries (
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  day         date not null,
  results     text not null default '' check (char_length(results) <= 500),
  suggestion  text not null default '' check (char_length(suggestion) <= 500),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (user_id, day)
);

-- One chat thread per user per day. Older messages are folded into rolling_summary,
-- so the model never needs the full history.
create table public.chat_threads (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users(id) on delete cascade,
  thread_date      date not null,
  rolling_summary  text not null default '' check (char_length(rolling_summary) <= 3000),
  summarized_count integer not null default 0 check (summarized_count >= 0),
  created_at       timestamptz not null default now(),
  unique (user_id, thread_date)
);

create table public.chat_messages (
  id          uuid primary key default gen_random_uuid(),
  thread_id   uuid not null references public.chat_threads(id) on delete cascade,
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  role        text not null check (role in ('user','assistant')),
  content     text not null check (char_length(content) between 1 and 8000),
  created_at  timestamptz not null default now()
);
create index chat_messages_thread_idx on public.chat_messages (thread_id, created_at);

-- Short durable facts the agent learns about the user (editable by them).
create table public.agent_notes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  note        text not null check (char_length(note) between 1 and 300),
  created_at  timestamptz not null default now()
);
create index agent_notes_user_idx on public.agent_notes (user_id, created_at);

-- Encrypted provider API keys. No client access at all: only the service role
-- (used by the Netlify functions) can read or write this table.
create table public.user_secrets (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  provider    text not null check (provider in ('anthropic','openai')),
  ciphertext  text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---------- updated_at triggers ----------
create trigger projects_updated_at       before update on public.projects       for each row execute function public.set_updated_at();
create trigger tasks_updated_at          before update on public.tasks          for each row execute function public.set_updated_at();
create trigger user_settings_updated_at  before update on public.user_settings  for each row execute function public.set_updated_at();
create trigger day_summaries_updated_at  before update on public.day_summaries  for each row execute function public.set_updated_at();
create trigger user_secrets_updated_at   before update on public.user_secrets   for each row execute function public.set_updated_at();

-- ---------- create a settings row for every new user ----------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.user_settings (user_id) values (new.id) on conflict do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill for any users that already exist
insert into public.user_settings (user_id)
select id from auth.users
on conflict do nothing;

-- =====================================================================
-- Row Level Security: every row is private to its owner.
-- =====================================================================
alter table public.projects       enable row level security;
alter table public.tasks          enable row level security;
alter table public.user_settings  enable row level security;
alter table public.day_summaries  enable row level security;
alter table public.chat_threads   enable row level security;
alter table public.chat_messages  enable row level security;
alter table public.agent_notes    enable row level security;
alter table public.user_secrets   enable row level security;   -- and no policies: deny all

-- projects
create policy projects_select on public.projects for select to authenticated
  using (user_id = (select auth.uid()));
create policy projects_insert on public.projects for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy projects_update on public.projects for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy projects_delete on public.projects for delete to authenticated
  using (user_id = (select auth.uid()));

-- tasks (a task may only point at one of the owner's own projects)
create policy tasks_select on public.tasks for select to authenticated
  using (user_id = (select auth.uid()));
create policy tasks_insert on public.tasks for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (project_id is null or exists (
      select 1 from public.projects p where p.id = project_id and p.user_id = (select auth.uid())))
  );
create policy tasks_update on public.tasks for update to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and (project_id is null or exists (
      select 1 from public.projects p where p.id = project_id and p.user_id = (select auth.uid())))
  );
create policy tasks_delete on public.tasks for delete to authenticated
  using (user_id = (select auth.uid()));

-- user_settings (row is created by the trigger; users can read and update, not insert/delete)
create policy user_settings_select on public.user_settings for select to authenticated
  using (user_id = (select auth.uid()));
create policy user_settings_update on public.user_settings for update to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and (active_project is null or exists (
      select 1 from public.projects p where p.id = active_project and p.user_id = (select auth.uid())))
  );

-- day_summaries
create policy day_summaries_select on public.day_summaries for select to authenticated
  using (user_id = (select auth.uid()));
create policy day_summaries_insert on public.day_summaries for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy day_summaries_update on public.day_summaries for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy day_summaries_delete on public.day_summaries for delete to authenticated
  using (user_id = (select auth.uid()));

-- chat_threads
create policy chat_threads_select on public.chat_threads for select to authenticated
  using (user_id = (select auth.uid()));
create policy chat_threads_insert on public.chat_threads for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy chat_threads_update on public.chat_threads for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy chat_threads_delete on public.chat_threads for delete to authenticated
  using (user_id = (select auth.uid()));

-- chat_messages (a message may only be added to one of the owner's own threads)
create policy chat_messages_select on public.chat_messages for select to authenticated
  using (user_id = (select auth.uid()));
create policy chat_messages_insert on public.chat_messages for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.chat_threads t where t.id = thread_id and t.user_id = (select auth.uid()))
  );
create policy chat_messages_delete on public.chat_messages for delete to authenticated
  using (user_id = (select auth.uid()));

-- agent_notes
create policy agent_notes_select on public.agent_notes for select to authenticated
  using (user_id = (select auth.uid()));
create policy agent_notes_insert on public.agent_notes for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy agent_notes_delete on public.agent_notes for delete to authenticated
  using (user_id = (select auth.uid()));

-- =====================================================================
-- Privileges (defence in depth on top of RLS)
-- =====================================================================
revoke all on public.projects, public.tasks, public.user_settings, public.day_summaries,
              public.chat_threads, public.chat_messages, public.agent_notes, public.user_secrets
  from anon;

revoke all on public.user_secrets from authenticated;

-- Settings: clients can read everything but only update the columns they own.
-- key_provider / key_last4 / has_key are written only by the server.
revoke insert, update, delete on public.user_settings from authenticated;
grant select on public.user_settings to authenticated;
grant update (assistant_name, tone, methodology, rules, voice, morning, midday, evening,
              nudge, onboarded, active_project, timezone, model)
  on public.user_settings to authenticated;

-- Chat messages are immutable once written
revoke update on public.chat_messages from authenticated;
-- Only the summary fields of a thread can change
revoke update on public.chat_threads from authenticated;
grant update (rolling_summary, summarized_count) on public.chat_threads to authenticated;

-- =====================================================================
-- Realtime (keeps several open tabs / devices in sync)
-- =====================================================================
alter table public.projects       replica identity full;
alter table public.tasks          replica identity full;
alter table public.user_settings  replica identity full;
alter table public.day_summaries  replica identity full;
alter table public.chat_threads   replica identity full;
alter table public.chat_messages  replica identity full;
alter table public.agent_notes    replica identity full;

alter publication supabase_realtime add table
  public.projects, public.tasks, public.user_settings, public.day_summaries,
  public.chat_threads, public.chat_messages, public.agent_notes;
