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

-- ---------------------------------------------------------------- linked Solana wallets (Oct 24)
-- Written only by the server (Vercel functions in api/wallet/, using the service_role key) after it checks the
-- wallet's signature, so a row here means "this player proved they own this wallet". skins = gated skins the wallet
-- unlocks (see src/nft-gates.js). One player per wallet: verifying it from another account moves it.
create table if not exists public.wallets (
  user_id      text primary key,               -- the player's auth user id
  address      text not null unique,           -- base58 Solana address
  verified_at  timestamptz not null default now(),
  message      text,                           -- the signed sign-in message
  signature    text,                           -- base58 Ed25519 signature
  nonce        text,
  skins        text[] not null default '{}',
  holdings_at  timestamptz
);
alter table public.wallets enable row level security;
drop policy if exists "wallets read" on public.wallets;
create policy "wallets read" on public.wallets for select using (true);
-- players can unlink (delete their own row); creating or changing rows is server-only (no insert/update policy)
drop policy if exists "wallets delete own" on public.wallets;
create policy "wallets delete own" on public.wallets for delete to authenticated using (user_id = auth.uid()::text);

-- ---------------------------------------------------------------- vault raffles (Oct 24)
-- Wano (graded One Piece) and Kanto (graded Pokémon) raffles. Free entry, one per player and per verified wallet,
-- written only by the server (api/raffle/enter). The draw (api/raffle/draw, Vercel cron Sundays 20:05 UTC) picks
-- the winner from the first Solana block at/after draws_at: sha256(blockhash + ':' + id) mod entries.
-- Add raffles in the Table Editor: id, vault ('wano' | 'kanto'), prize (json: name, set, grader, grade, cert, image,
-- url, mint), min_level, draws_at.
create table if not exists public.raffles (
  id              text primary key,
  vault           text not null check (vault in ('wano', 'kanto')),
  prize           jsonb not null default '{}',
  min_level       integer not null default 0,
  draws_at        timestamptz not null,
  status          text not null default 'open' check (status in ('open', 'drawn')),
  entries         integer not null default 0,
  winner_user     text,
  winner_address  text,
  winner_name     text,
  proof           jsonb,
  created_at      timestamptz not null default now()
);
create table if not exists public.raffle_entries (
  raffle_id   text not null references public.raffles(id) on delete cascade,
  user_id     text not null,
  address     text not null,
  name        text,
  created_at  timestamptz not null default now(),
  primary key (raffle_id, user_id),
  unique (raffle_id, address)
);
alter table public.raffles enable row level security;
alter table public.raffle_entries enable row level security;
drop policy if exists "raffles read" on public.raffles;
create policy "raffles read" on public.raffles for select using (true);
drop policy if exists "raffle entries read" on public.raffle_entries;
create policy "raffle entries read" on public.raffle_entries for select using (true);
-- no insert/update/delete policies: only the server writes

-- first two raffles, drawn this coming Sunday 20:00 UTC
insert into public.raffles (id, vault, prize, min_level, draws_at) values
  ('wano-1', 'wano', '{"name":"Monkey D. Luffy","set":"One Piece OP13 · Carrying on His Will #118","grader":"PSA","grade":"10","variant":"Alternate Art","cert":"146575703","mint":"inuRTqXX15NQAS48xZaHgFT4tCV4kdwrHisUhBkTZdD","url":"https://collectorcrypt.com/assets/solana/inuRTqXX15NQAS48xZaHgFT4tCV4kdwrHisUhBkTZdD"}', 25,
    date_trunc('week', now()) + interval '6 days 20 hours' + case when now() > date_trunc('week', now()) + interval '6 days 20 hours' then interval '7 days' else interval '0' end),
  ('kanto-1', 'kanto', '{"name":"Graded Pokémon card · TBA"}', 100,
    date_trunc('week', now()) + interval '6 days 20 hours' + case when now() > date_trunc('week', now()) + interval '6 days 20 hours' then interval '7 days' else interval '0' end)
on conflict (id) do nothing;
