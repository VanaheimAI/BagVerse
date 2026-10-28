// api/tag.js rules against the in-memory admin client: X identity required, level gate, reach, lock, cooldown,
// touch-up, max held, fade, overwrite log, reports -> hidden, remove_mine.   node tools/tag_api_test.mjs
import handler from '../api/tag.js';
import { fakeAdmin } from './fake-admin.mjs';
import { TAG_SPOTS, TAG_RULES as R } from '../src/tagspots.js';

const sb = fakeAdmin(); let now = Date.parse('2026-11-01T12:00:00Z');
const xid = (h) => ({ provider: 'x', provider_id: 'x-' + h, identity_data: { user_name: h, avatar_url: `https://pbs.twimg.com/profile_images/1/${h}_normal.jpg` } });
sb.db.__xusers = { alice: xid('alice'), bob: xid('bob'), carol: xid('carol'), dave: xid('dave') };
sb.db.saves = [{ user_id: 'alice', level: 9 }, { user_id: 'bob', level: 12 }, { user_id: 'carol', level: 3 }, { user_id: 'dave', level: 30 }, { user_id: 'guest', level: 40 }];
const call = async (uid, body) => {
  let out = {}; const res = { statusCode: 0, setHeader() {}, end(s) { out = JSON.parse(s); } };
  await handler({ method: 'POST', headers: { authorization: 'Bearer tok-' + uid }, body }, res, { sb, now });
  return { status: res.statusCode, ...out };
};
const at = (s) => ({ x: s.x + s.nx * 3, z: s.z + s.nz * 3 });
const [A, B, C, D, E] = TAG_SPOTS;
let fails = 0; const check = (name, cond, got) => { console.log(cond ? 'ok  ' : 'FAIL', name, cond ? '' : JSON.stringify(got)); if (!cond) fails++; };
const min = 60e3, hr = 3600e3;

let r = await call('guest', { op: 'spray', spot: A.id, pos: at(A) }); check('guest (no X) refused', r.status === 403, r);
r = await call('carol', { op: 'spray', spot: A.id, pos: at(A) }); check('level 3 refused', r.status === 403 && /level 5/.test(r.error), r);
r = await call('alice', { op: 'spray', spot: A.id, pos: { x: A.x + 30, z: A.z } }); check('too far refused', r.status === 400, r);
r = await call('alice', { op: 'spray', spot: 'nope', pos: at(A) }); check('unknown spot 404', r.status === 404, r);
r = await call('alice', { op: 'spray', spot: A.id, pos: at(A), style: { f: 'block', c: 2 } }); check('alice tags A', r.status === 200 && r.tag.handle === 'alice' && r.tag.style.f === 'block', r);
check('avatar upgraded to 400x400', /_400x400\.jpg$/.test(r.tag?.avatar || ''), r.tag);
r = await call('alice', { op: 'spray', spot: B.id, pos: at(B) }); check('cooldown between sprays', r.status === 429, r);
now += 3 * min;
r = await call('bob', { op: 'spray', spot: A.id, pos: at(A) }); check('fresh tag locked for others', r.status === 429 && /locked/.test(r.error), r);
now += 8 * min;
r = await call('bob', { op: 'spray', spot: A.id, pos: at(A) }); check('bob sprays over alice after lock', r.status === 200 && r.overwrote === 'alice', r);
check('overwrite logged for alice inbox', sb.db.tag_log.some((l) => l.prev_owner === 'alice' && l.handle === 'bob'), sb.db.tag_log);
r = await call('alice', { op: 'spray', spot: B.id, pos: at(B) }); check('alice tags B', r.status === 200, r);
r = await call('alice', { op: 'spray', spot: B.id, pos: at(B) }); check('touch-up only once a day', r.status === 429, r);
now += 6 * min; await call('alice', { op: 'spray', spot: C.id, pos: at(C) });
now += 6 * min; await call('alice', { op: 'spray', spot: D.id, pos: at(D) });
now += 6 * min; r = await call('alice', { op: 'spray', spot: E.id, pos: at(E) }); check(`max ${R.maxHeld} walls held`, r.status === 409, r);
now += 25 * hr; r = await call('alice', { op: 'spray', spot: B.id, pos: at(B), style: { f: 'drip', c: 5 } }); check('touch-up after a day', r.status === 200 && r.touched, r);
// fade: C and D (sprayed ~25 h ago) still live; after 72 h untouched they're free
now += 48 * hr; r = await call('dave', { op: 'spray', spot: C.id, pos: at(C) }); check('faded wall is free (no overwrite)', r.status === 200 && !r.overwrote, r);
// reports
now += 11 * min;
for (const u of ['alice', 'bob', 'carol']) r = await call(u, { op: 'report', spot: C.id });
check('3 reports hide a tag', r.hidden === true, r);
r = await call('dave', { op: 'report', spot: C.id }); check('own tag cannot be reported', r.status === 400 || r.reports === 0, r);
r = await call('bob', { op: 'remove_mine' }); check('remove_mine', r.removed === 1 && !sb.db.tags.some((t) => t.owner === 'bob'), r);
console.log(fails ? `${fails} FAILED` : 'all passed'); process.exit(fails ? 1 : 0);
