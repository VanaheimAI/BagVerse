// Player accounts on the website (Supabase backend):
//   - everyone starts as an anonymous guest (net.js); "Sign in with X" LINKS X to that guest account, so the same
//     account (level, wallet, raffle entries, ads) just gains a login. If that X account already belongs to another
//     BagVerse account (signed in on another device before), we sign in to that account instead.
//   - cloud save (public.saves, one row per account, RLS: own row only): the progress record, equipped skin and
//     favourites, so signing in with X on another device brings the same progress back.
// Off Supabase (claude.ai artifact, local builds) none of this applies: the platform has its own identity.
import { backend, client } from './net.js';

const FLOW = 'bv_xflow';            // sessionStorage: which OAuth step we are in ('link' | 'signin')
const SAVE_KEYS = ['bagverse.skin', 'bagverse.char', 'bagverse.favs'];
const ls = { get: (k) => { try { return localStorage.getItem(k); } catch (_) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (_) {} } };
const ss = { get: (k) => { try { return sessionStorage.getItem(k); } catch (_) { return null; } }, set: (k, v) => { try { v == null ? sessionStorage.removeItem(k) : sessionStorage.setItem(k, v); } catch (_) {} } };
const redirectTo = () => location.origin + location.pathname;

export const accountsOn = () => backend() === 'supabase';

/** { uid, linked, handle, name, avatar } for the current account, or null off Supabase */
export async function xAccount() {
  const c = await client(); if (!c) return null;
  try {
    const { data } = await c.auth.getUser(); const u = data?.user; if (!u) return null;
    const id = (u.identities || []).find((i) => i.provider === 'x' || i.provider === 'twitter');
    const m = { ...(u.user_metadata || {}), ...(id?.identity_data || {}) };
    const handle = m.user_name || m.preferred_username || m.screen_name || m.username || null;
    return { uid: u.id, linked: !!id, handle, name: m.full_name || m.name || handle, avatar: m.avatar_url || m.picture || null };
  } catch (_) { return null; }
}

/** start "Sign in with X" (leaves the page for X, comes back to this page) */
export async function signInWithX() {
  const c = await client(); if (!c) throw new Error('Sign-in works on the BagVerse website.');
  const opts = { redirectTo: redirectTo() };
  const { data } = await c.auth.getUser();
  if (data?.user && !data.user.identities?.some((i) => i.provider === 'x')) {   // guest: keep this account, add X to it
    ss.set(FLOW, 'link');
    const { error } = await c.auth.linkIdentity({ provider: 'x', options: opts });
    if (!error) return;
    console.warn('X link failed, signing in instead:', error.message);
  }
  ss.set(FLOW, 'signin');
  const { error } = await c.auth.signInWithOAuth({ provider: 'x', options: opts });
  if (error) { ss.set(FLOW, null); throw new Error(error.message || 'Could not reach X.'); }
}

/**
 * call once at startup: finishes a return from X. Returns { status: 'ok' | 'error' | 'redirecting' | null, message }
 * An X account that is already linked to another BagVerse account comes back with identity_already_exists:
 * then we sign in to that account (its cloud save takes over on this device).
 */
export async function finishXReturn() {
  const flow = ss.get(FLOW); if (!flow) return { status: null };
  const q = new URLSearchParams(location.search), h = new URLSearchParams(location.hash.replace(/^#/, ''));
  const code = q.get('error_code') || h.get('error_code'), err = q.get('error') || h.get('error');
  const desc = (q.get('error_description') || h.get('error_description') || '').replace(/\+/g, ' ');
  if (err || code) history.replaceState(null, '', location.pathname + location.search.replace(/[?&](error|error_code|error_description)=[^&]*/g, '').replace(/^&/, '?'));
  ss.set(FLOW, null);
  if (code === 'identity_already_exists' || /already (been )?linked|already exists/i.test(desc)) {
    if (flow === 'link') { ss.set(FLOW, 'signin'); const c = await client(); await c.auth.signInWithOAuth({ provider: 'x', options: { redirectTo: redirectTo() } }); return { status: 'redirecting' }; }
  }
  if (err || code) return { status: 'error', message: desc || err || code };
  const a = await xAccount();
  return a?.linked ? { status: 'ok', account: a } : { status: 'error', message: 'X sign-in did not complete.' };
}

/** sign out of X on this device: back to a fresh guest (this device keeps its local progress copy) */
export async function signOutX() {
  const c = await client(); if (!c) return;
  await c.auth.signOut();
  try { await c.auth.signInAnonymously(); } catch (_) {}
}

// ---- cloud save
const sizeOf = (s) => { try { const p = JSON.parse(s || 'null'); return p ? [p.level | 0, p.totalXp | 0] : [0, 0]; } catch (_) { return [0, 0]; } };
const ahead = (a, b) => a[0] > b[0] || (a[0] === b[0] && a[1] > b[1]);

/**
 * signed-in (X) accounts only: if the cloud copy is further along than this device's, adopt it and return true
 * (the caller reloads so every system starts from it); otherwise push this device's copy up.
 */
export async function syncCloud() {
  const a = await xAccount(); if (!a?.linked) return false;
  const c = await client();
  const { data, error } = await c.from('saves').select('data').eq('user_id', a.uid).maybeSingle();
  if (error) { console.warn('cloud save:', error.message); return false; }
  const cloud = data?.data || null;
  if (cloud && ahead(sizeOf(cloud['bagverse.skin']), sizeOf(ls.get('bagverse.skin')))) {
    for (const k of SAVE_KEYS) if (typeof cloud[k] === 'string') ls.set(k, cloud[k]);
    return true;
  }
  await pushCloud();
  return false;
}

let lastPush = 0;
/** upload this device's progress (throttled; force on pagehide) */
export async function pushCloud(force = false) {
  if (!force && Date.now() - lastPush < 45e3) return;
  const a = await xAccount(); if (!a?.linked) return;
  lastPush = Date.now();
  const body = {}; for (const k of SAVE_KEYS) { const v = ls.get(k); if (v != null) body[k] = v; }
  const [level] = sizeOf(body['bagverse.skin']);
  const c = await client();
  const { error } = await c.from('saves').upsert({ user_id: a.uid, data: body, level, updated_at: new Date().toISOString() });
  if (error) console.warn('cloud save:', error.message);
}
