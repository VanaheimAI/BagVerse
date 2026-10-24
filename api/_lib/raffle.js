// Raffle draws that anyone can check: the winner comes from the hash of the first Solana block at or after the
// draw time, so it doesn't matter who triggers the draw or when (entries close at draws_at).
//   pick = sha256(blockhash + ':' + raffle_id) mod tickets, over entries sorted by (created_at, user_id)
import crypto from 'node:crypto';

export async function rpc(url, method, params, fetchFn = fetch) {
  const r = await fetchFn(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
  const j = await r.json(); if (j.error) throw Object.assign(new Error(j.error.message), { code: j.error.code }); return j.result;
}

/** first confirmed block with blockTime >= t (unix seconds): { slot, blockhash, time } */
export async function blockAt(url, t, fetchFn = fetch) {
  const call = (m, p) => rpc(url, m, p, fetchFn);
  const timeOf = async (slot, dir = 1) => { for (let k = 0; k < 8; k++) { const s = slot + k * dir; try { const bt = await call('getBlockTime', [s]); if (bt != null) return { slot: s, bt }; } catch (_) { /* skipped slot */ } } return null; };
  let hi = await call('getSlot', [{ commitment: 'finalized' }]);
  const top = await timeOf(hi, -1); if (!top || top.bt < t) return null; hi = top.slot;          // not final yet
  let lo = Math.max(0, hi - Math.ceil((top.bt - t) * 3.2) - 400);             // ~2.5 slots/s, with margin
  for (let guard = 0; (await timeOf(lo))?.bt >= t && guard < 20; guard++) lo = Math.max(0, lo - 5000);
  while (hi - lo > 1) { const mid = Math.floor((lo + hi) / 2), m = await timeOf(mid); if (!m || m.bt >= t) hi = m ? Math.min(hi, mid) : mid; else lo = mid; }
  const first = await timeOf(hi);
  const b = await call('getBlock', [first.slot, { transactionDetails: 'none', rewards: false, maxSupportedTransactionVersion: 0, commitment: 'finalized' }]);
  return { slot: first.slot, blockhash: b.blockhash, time: first.bt };
}

export function pickIndex(seed, raffleId, n) {
  const h = crypto.createHash('sha256').update(seed + ':' + raffleId).digest();
  let v = 0n; for (const x of h) v = (v << 8n) | BigInt(x);
  return Number(v % BigInt(n));
}
