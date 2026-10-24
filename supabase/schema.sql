-- BagVerse online services on Supabase (used when the game is hosted on its own, e.g. Vercel; see src/net.js)
-- Run once in the Supabase dashboard: SQL Editor -> New query -> paste -> Run.
-- Also enable: Authentication -> Sign In / Providers -> "Allow anonymous sign-ins" (each browser gets its own
-- anonymous account, which is what lets a player write only their own leaderboard row).
-- Multiplayer uses Realtime presence + broadcast on the channel "bagverse-world" and needs no table.

create table if not exists public.lb (
  id          text primary key,                 -- the player's auth user id
  doc         jsonb not null default '{}',      -- name, skin, level, bests, runs, wins (see src/leaderboard.js)
  week        text,                              -- ISO week the weekly best belongs to (e.g. 2026-10-19)
  day         text,                              -- day the daily best belongs to
  wbest       integer not null default 0,
  dbest       integer not null default 0,
  wins        integer not null default 0,
  updated_at  timestamptz not null default now()
);
create index if not exists lb_week_idx on public.lb (week, wbest desc);
create index if not exists lb_day_idx  on public.lb (day, dbest desc);
create index if not exists lb_wins_idx on public.lb (wins desc);

alter table public.lb enable row level security;

-- everyone (signed in or not) can read the board
drop policy if exists "lb read" on public.lb;
create policy "lb read" on public.lb for select using (true);

-- each player can create and update only their own row
drop policy if exists "lb insert own" on public.lb;
create policy "lb insert own" on public.lb for insert to authenticated with check (id = auth.uid()::text);
drop policy if exists "lb update own" on public.lb;
create policy "lb update own" on public.lb for update to authenticated using (id = auth.uid()::text) with check (id = auth.uid()::text);

-- light sanity limits on what a client can claim (scores are still self-reported)
alter table public.lb drop constraint if exists lb_sane;
alter table public.lb add constraint lb_sane check (wbest between 0 and 100000 and dbest between 0 and 100000 and wins between 0 and 100000 and pg_column_size(doc) < 4096);
