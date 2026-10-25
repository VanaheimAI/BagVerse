// Solana Pay checks for ad bookings.
//   findPayment: the transaction carrying the booking's reference key that moved >= the price in USDC into the
//                treasury; also who paid (wallet + the USDC token account it came from, where a refund goes back to).
//   checkRefund: a transaction that moved >= amount of USDC into the payer's token account.
import { rpc } from './raffle.js';

const keyOf = (tx, i) => { const k = tx.transaction?.message?.accountKeys?.[i]; return typeof k === 'string' ? k : k?.pubkey || null; };
const delta = (tx, pick) => {
  const sum = (list) => (list || []).filter(pick).reduce((a, b) => a + Number(b.uiTokenAmount?.amount || 0), 0);
  return (sum(tx.meta.postTokenBalances) - sum(tx.meta.preTokenBalances)) / 1e6;
};

export async function findPayment(url, { reference, treasury, mint, amount }, fetchFn = fetch) {
  const sigs = await rpc(url, 'getSignaturesForAddress', [reference, { limit: 10, commitment: 'confirmed' }], fetchFn);
  for (const s of sigs || []) {
    if (s.err) continue;
    const tx = await rpc(url, 'getTransaction', [s.signature, { maxSupportedTransactionVersion: 0, commitment: 'confirmed', encoding: 'jsonParsed' }], fetchFn);
    if (!tx || tx.meta?.err) continue;
    const got = delta(tx, (b) => b.owner === treasury && b.mint === mint);
    if (got + 1e-9 < amount) continue;
    // the payer: the USDC account (not the treasury's) whose balance went down
    let payer = null, from = null;
    for (const pre of tx.meta.preTokenBalances || []) {
      if (pre.mint !== mint || pre.owner === treasury) continue;
      const post = (tx.meta.postTokenBalances || []).find((p) => p.accountIndex === pre.accountIndex);
      if (Number(post?.uiTokenAmount?.amount || 0) < Number(pre.uiTokenAmount?.amount || 0)) { payer = pre.owner; from = keyOf(tx, pre.accountIndex); break; }
    }
    return { signature: s.signature, amount: got, slot: tx.slot, time: tx.blockTime, payer, from };
  }
  return null;
}

export async function checkRefund(url, { signature, to, mint, amount }, fetchFn = fetch) {
  const tx = await rpc(url, 'getTransaction', [signature, { maxSupportedTransactionVersion: 0, commitment: 'confirmed', encoding: 'jsonParsed' }], fetchFn);
  if (!tx || tx.meta?.err) return false;
  const idx = (tx.transaction?.message?.accountKeys || []).findIndex((k) => (typeof k === 'string' ? k : k.pubkey) === to);
  if (idx < 0) return false;
  return delta(tx, (b) => b.accountIndex === idx && b.mint === mint) + 1e-9 >= amount;
}
