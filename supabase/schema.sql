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

-- ---------------------------------------------------------------- vault raffles + ad bookings (run this block once)
-- Raffles: Wano (graded One Piece) / Kanto (graded Pokémon). Free entry, one per player and per verified wallet,
-- written only by the server (api/raffle/enter). Draws: api/raffle/draw (Vercel cron + the game when due) picks the
-- winner from the first Solana block at/after draws_at; the /admin dashboard can also draw now or pick a winner.
-- Create and edit raffles in /admin (or the Table Editor).
create table if not exists public.raffles (
  id              text primary key,
  vault           text not null check (vault in ('wano', 'kanto')),
  prize           jsonb not null default '{}',     -- name, set, grader, grade, variant, cert, mint, url, image
  min_level       integer not null default 0,
  draws_at        timestamptz not null,
  status          text not null default 'open' check (status in ('open', 'drawn', 'cancelled')),
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
-- Billboard rentals paid with Solana Pay (USDC to the treasury wallet in src/treasury.js)
create table if not exists public.ad_bookings (
  id            text primary key,
  slot          text not null,
  tier          text,
  days          integer not null default 7,
  amount        numeric not null,
  currency      text not null default 'USDC',
  reference     text not null unique,              -- Solana Pay reference key (finds the payment on-chain)
  status        text not null default 'pending',   -- pending -> paid -> live (payer uploads) | pulled (admin veto) | refunded | ended | cancelled
  key_hash      text,                              -- sha256 of the secret the booking browser holds (lets it upload the creative)
  payer_user    text,
  payer_name    text,
  payer_address text,                              -- wallet that paid (from the payment transaction)
  payer_token_account text,                        -- its USDC account: refunds go back here
  signature     text,
  paid_amount   numeric,
  creative_url  text,
  pulled_reason text,
  refund_signature text,
  starts_at     timestamptz,
  ends_at       timestamptz,
  created_at    timestamptz not null default now()
);
-- (safe to run again on an older version of these tables)
alter table public.ad_bookings add column if not exists key_hash text;
alter table public.ad_bookings add column if not exists payer_address text;
alter table public.ad_bookings add column if not exists payer_token_account text;
alter table public.ad_bookings add column if not exists pulled_reason text;
alter table public.ad_bookings add column if not exists refund_signature text;
alter table public.ad_bookings drop constraint if exists ad_bookings_status_check;
alter table public.ad_bookings add constraint ad_bookings_status_check check (status in ('pending', 'paid', 'live', 'pulled', 'refunded', 'ended', 'cancelled'));
alter table public.raffles enable row level security;
alter table public.raffle_entries enable row level security;
alter table public.ad_bookings enable row level security;
drop policy if exists "raffles read" on public.raffles;
create policy "raffles read" on public.raffles for select using (true);
drop policy if exists "raffle entries read" on public.raffle_entries;
create policy "raffle entries read" on public.raffle_entries for select using (true);
-- ad bookings: no public policies (the game reads live ads through /api/ads); only the server writes anything

-- ---------------------------------------------------------------- linked wallets on other chains (Polygon)
-- Polygon wallets for Courtyard slab prizes: a raffle winner whose prize is on Polygon links one to receive it.
-- Written only by the server (api/wallet/evm) after a Sign-In with Ethereum check. The Solana wallet stays in
-- public.wallets, untouched.
create table if not exists public.linked_wallets (
  user_id      text not null,
  chain        text not null check (chain in ('polygon')),
  address      text not null,
  verified_at  timestamptz not null default now(),
  message      text,
  signature    text,
  nonce        text,
  primary key (user_id, chain),
  unique (chain, address)
);
alter table public.linked_wallets enable row level security;
drop policy if exists "linked wallets read" on public.linked_wallets;
create policy "linked wallets read" on public.linked_wallets for select using (true);
drop policy if exists "linked wallets delete own" on public.linked_wallets;
create policy "linked wallets delete own" on public.linked_wallets for delete to authenticated using (user_id = auth.uid()::text);

-- ---------------------------------------------------------------- cloud saves (Oct 27)
-- One row per account: the player's progress, equipped skin and favourites, so signing in with X on another device
-- brings the same progress back (src/account.js). Each player reads and writes only their own row.
create table if not exists public.saves (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  level int not null default 1,
  updated_at timestamptz not null default now()
);
alter table public.saves enable row level security;
drop policy if exists "saves: own row read" on public.saves;
drop policy if exists "saves: own row insert" on public.saves;
drop policy if exists "saves: own row update" on public.saves;
create policy "saves: own row read" on public.saves for select using (auth.uid() = user_id);
create policy "saves: own row insert" on public.saves for insert with check (auth.uid() = user_id);
create policy "saves: own row update" on public.saves for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------------------------------------------------------------- Spray Spots (X-handle graffiti tags on walls)
-- One row per wall (spot ids: src/tagspots.js). Everyone can read; only the server (api/tag.js, service role) writes,
-- after checking the player's X identity, level, cooldowns and locks. A tag "fades" 72 h after touched_at.
create table if not exists public.tags (
  spot text primary key,
  owner uuid not null references auth.users (id) on delete cascade,
  x_id text,
  handle text not null,
  avatar text,
  style jsonb not null default '{}'::jsonb,
  sprayed_at timestamptz not null default now(),
  touched_at timestamptz not null default now(),
  reports int not null default 0,
  hidden boolean not null default false
);
create index if not exists tags_owner on public.tags (owner);
alter table public.tags enable row level security;
drop policy if exists "tags read" on public.tags;
create policy "tags read" on public.tags for select using (true);

-- history (overwrites power the "you got sprayed over" inbox; also the admin's undo trail)
create table if not exists public.tag_log (
  id bigint generated always as identity primary key,
  spot text not null,
  owner uuid references auth.users (id) on delete set null,
  handle text,
  kind text not null default 'spray',           -- spray | touch | removed | cleared
  style jsonb,
  prev_owner uuid references auth.users (id) on delete set null,
  prev_handle text,
  at timestamptz not null default now()
);
create index if not exists tag_log_prev on public.tag_log (prev_owner, at desc);
create index if not exists tag_log_owner on public.tag_log (owner, at desc);
alter table public.tag_log enable row level security;
drop policy if exists "tag log read" on public.tag_log;
create policy "tag log read" on public.tag_log for select using (true);

-- reports (server only: no read policy, so players can't see who reported whom)
create table if not exists public.tag_reports (
  spot text not null,
  sprayed_at timestamptz not null,
  reporter uuid not null references auth.users (id) on delete cascade,
  at timestamptz not null default now(),
  primary key (spot, sprayed_at, reporter)
);
alter table public.tag_reports enable row level security;

-- refresh the API's table list so new tables work straight away (fixes "Could not find the table ... in the schema cache")
notify pgrst, 'reload schema';
