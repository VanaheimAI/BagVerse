// Solana Pay checks for ad bookings: find the transaction that carries the booking's reference key and confirm it
// moved at least the price in USDC into the treasury.
import { rpc } from './raffle.js';

export async function findPayment(url, { reference, treasury, mint, amount }, fetchFn = fetch) {
  const sigs = await rpc(url, 'getSignaturesForAddress', [reference, { limit: 10, commitment: 'confirmed' }], fetchFn);
  for (const s of sigs || []) {
    if (s.err) continue;
    const tx = await rpc(url, 'getTransaction', [s.signature, { maxSupportedTransactionVersion: 0, commitment: 'confirmed', encoding: 'jsonParsed' }], fetchFn);
    if (!tx || tx.meta?.err) continue;
    const bal = (list) => (list || []).filter((b) => b.owner === treasury && b.mint === mint).reduce((a, b) => a + Number(b.uiTokenAmount?.amount || 0), 0);
    const got = (bal(tx.meta.postTokenBalances) - bal(tx.meta.preTokenBalances)) / 1e6;
    if (got + 1e-9 >= amount) return { signature: s.signature, amount: got, slot: tx.slot, time: tx.blockTime };
  }
  return null;
}
