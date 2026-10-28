// POST /api/tag  (Authorization: Bearer <player's Supabase token>)  — Spray Spots, enforced server-side:
//   { op: 'spray',  spot, style: { f, c }, pos: { x, z } }  tag a wall (or touch up your own) with your X handle
//   { op: 'report', spot }                                    report the tag on a wall (3 reports hide it)
//   { op: 'remove_mine' }                                     take all my tags down (privacy: one click)
// Who you are comes from the auth server (the X identity on your account), never from anything the game sends,
// so nobody can spray someone else's handle. Rules: src/tagspots.js TAG_RULES (level from your cloud save).
import { admin, readBody, send } from './_lib/wallet.js';
import { TAG_RULES as R, spotById, cleanStyle, tagState } from '../src/tagspots.js';

const xIdentity = (u) => (u?.identities || []).find((i) => i.provider === 'x' || i.provider === 'twitter') || null;

export default async function handler(req, res, deps = {}) {
  if (req.method !== 'POST') return send(res, 405, { error: 'POST only' });
  const sb = deps.sb || admin();
  if (!sb) return send(res, 503, { error: 'Tagging is not set up on this server yet.' });
  const tok = /^Bearer (.+)$/.exec(req.headers?.authorization || '')?.[1];
  const { data: ud } = tok ? await sb.auth.getUser(tok) : { data: null };
  const user = ud?.user; if (!user?.id) return send(res, 401, { error: 'Sign in first (reload the game).' });
  const uid = user.id, now = deps.now || Date.now(), iso = (t) => new Date(t).toISOString();
  const body = await readBody(req), op = String(body.op || '');
  const q = async (p) => { const r = await p; if (r.error) throw new Error(r.error.message); return r.data; };
  try {
    if (op === 'remove_mine') {
      const mine = await q(sb.from('tags').select('spot').eq('owner', uid));
      for (const t of mine || []) { await q(sb.from('tags').delete().eq('spot', t.spot).eq('owner', uid)); await sb.from('tag_log').insert({ spot: t.spot, owner: uid, kind: 'removed', at: iso(now) }); }
      return send(res, 200, { removed: (mine || []).length });
    }
    const spot = spotById(String(body.spot || ''));
    if (!spot) return send(res, 404, { error: 'No such tag spot.' });
    const cur = await q(sb.from('tags').select('*').eq('spot', spot.id).maybeSingle());

    if (op === 'report') {
      if (!cur || cur.hidden) return send(res, 200, { reports: 0 });
      if (cur.owner === uid) return send(res, 400, { error: "That's your own tag." });
      await sb.from('tag_reports').upsert({ spot: spot.id, sprayed_at: cur.sprayed_at, reporter: uid, at: iso(now) }, { onConflict: 'spot,sprayed_at,reporter', ignoreDuplicates: true });
      const { count } = await sb.from('tag_reports').select('reporter', { count: 'exact', head: true }).eq('spot', spot.id).eq('sprayed_at', cur.sprayed_at);
      const n = count ?? 0, hidden = n >= R.hideAt;
      await q(sb.from('tags').update({ reports: n, hidden }).eq('spot', spot.id).eq('sprayed_at', cur.sprayed_at));
      return send(res, 200, { reports: n, hidden });
    }
    if (op !== 'spray') return send(res, 400, { error: 'Unknown op.' });

    // who: the X account linked to this player (identity data is written by the auth server, not the player)
    const x = xIdentity(user);
    if (!x) return send(res, 403, { error: 'Sign in with X to tag walls.' });
    const d = x.identity_data || {};
    const handle = String(d.user_name || d.preferred_username || d.screen_name || '').replace(/[^\w]/g, '').slice(0, 15);
    if (!handle) return send(res, 403, { error: "Couldn't read your X handle. Sign in with X again." });
    const xid = String(x.provider_id || d.provider_id || d.sub || x.id || '').slice(0, 40);
    const avatarRaw = String(d.avatar_url || d.picture || '');
    const avatar = /^https:\/\/pbs\.twimg\.com\//.test(avatarRaw) ? avatarRaw.replace(/_normal(\.\w+)$/, '_400x400$1').slice(0, 300) : null;

    // level: from the player's cloud save (signed-in players' progress is saved there)
    const save = await q(sb.from('saves').select('level').eq('user_id', uid).maybeSingle());
    if ((save?.level | 0) < R.minLevel) return send(res, 403, { error: `Tagging opens at level ${R.minLevel}.` });

    // in person: you have to be standing at the wall (the game reports where you are)
    const px = +body.pos?.x, pz = +body.pos?.z;
    if (!isFinite(px) || !isFinite(pz) || Math.hypot(px - spot.x, pz - spot.z) > R.reach) return send(res, 400, { error: 'Walk up to the wall to tag it.' });

    const st = tagState(cur, now), mineNow = st.live && cur.owner === uid;
    if (mineNow) {   // touch-up: resets the fade, once a day (and lets you restyle)
      if (now - Date.parse(cur.touched_at) < R.touchH * 3600e3) return send(res, 429, { error: 'Already fresh. You can touch up your tag once a day.', retryMs: R.touchH * 3600e3 - (now - Date.parse(cur.touched_at)) });
    } else if (st.locked) return send(res, 429, { error: 'Fresh paint. This tag is locked for a few more minutes.', retryMs: st.lockLeftMs });

    const last = (await q(sb.from('tag_log').select('at').eq('owner', uid).eq('kind', 'spray').order('at', { ascending: false }).limit(1)))?.[0];
    if (last && now - Date.parse(last.at) < R.cooldownMin * 60e3) return send(res, 429, { error: 'Your can needs a shake. Wait a few minutes between sprays.', retryMs: R.cooldownMin * 60e3 - (now - Date.parse(last.at)) });
    if (!mineNow) {
      const held = (await q(sb.from('tags').select('spot, touched_at, hidden').eq('owner', uid))) || [];
      if (held.filter((t) => t.spot !== spot.id && tagState({ ...t, sprayed_at: t.touched_at }, now).live).length >= R.maxHeld) return send(res, 409, { error: `You already hold ${R.maxHeld} walls. Let one fade (or touch them up) before taking another.` });
    }
    const style = cleanStyle(body.style);
    const row = mineNow
      ? { ...cur, handle, x_id: xid, avatar, style, touched_at: iso(now) }
      : { spot: spot.id, owner: uid, x_id: xid, handle, avatar, style, sprayed_at: iso(now), touched_at: iso(now), reports: 0, hidden: false };
    const prev = !mineNow && st.live ? { prev_owner: cur.owner, prev_handle: cur.handle } : {};
    await q(sb.from('tags').upsert(row, { onConflict: 'spot' }));
    await sb.from('tag_log').insert({ spot: spot.id, owner: uid, handle, kind: mineNow ? 'touch' : 'spray', style, at: iso(now), ...prev });
    return send(res, 200, { tag: row, overwrote: prev.prev_handle || null, touched: mineNow });
  } catch (e) { return send(res, 500, { error: 'Could not tag: ' + e.message }); }
}
