// Polygon wallet linking for raffle winners whose prize is a Courtyard slab on Polygon.
// Finds browser wallets with EIP-6963 (MetaMask, Rabby, Coinbase Wallet, ...; falls back to window.ethereum),
// signs a Sign-In with Ethereum message (free, no transaction) and has the server check it (api/wallet/evm).
// Phones without a wallet browser get a link that opens BagVerse inside MetaMask.
import { session, tables } from './net.js';

const providers = new Map();   // rdns -> { info: { name, icon, rdns }, provider }
if (typeof window !== 'undefined') {
  window.addEventListener('eip6963:announceProvider', (e) => { const d = e.detail; if (d?.info?.rdns && d.provider) providers.set(d.info.rdns, d); });
  window.dispatchEvent(new Event('eip6963:requestProvider'));
}
export function evmWallets() {
  const list = [...providers.values()];
  if (!list.length && window.ethereum) list.push({ info: { name: window.ethereum.isMetaMask ? 'MetaMask' : 'Browser wallet', icon: '', rdns: 'injected' }, provider: window.ethereum });
  return list;
}
export const metamaskLink = () => `https://metamask.app.link/dapp/${location.host}${location.pathname}`;
const hex = (s) => '0x' + [...new TextEncoder().encode(s)].map((b) => b.toString(16).padStart(2, '0')).join('');
const nonce = () => [...crypto.getRandomValues(new Uint8Array(9))].map((b) => b.toString(36)).join('').slice(0, 16);

/** the Polygon wallet this player has linked, or null */
export async function linkedPolygon() {
  const ses = await session(); if (!ses) return null;
  try { const t = await tables(); const { data } = await t.from('linked_wallets').select('address, verified_at').eq('user_id', ses.uid).eq('chain', 'polygon').maybeSingle(); return data || null; } catch (_) { return null; }
}

/** connect + sign + server check. Returns the linked address or throws an Error with a readable message */
export async function linkPolygon(w, playerName = 'Player') {
  const ses = await session(); if (!ses) throw new Error('Wallet linking works on the BagVerse website.');
  let address;
  try { [address] = await w.provider.request({ method: 'eth_requestAccounts' }); } catch (e) { throw new Error(e?.code === 4001 ? 'Request cancelled in the wallet.' : 'Could not connect the wallet.'); }
  if (!address) throw new Error('The wallet returned no account.');
  const message = `${location.host} wants you to sign in with your Ethereum account:\n${address}\n\nLink this Polygon wallet to BagVerse player ${playerName} to receive raffle prizes. Signing is free and sends no transaction.\n\nURI: ${location.origin}\nVersion: 1\nChain ID: 137\nNonce: ${nonce()}\nIssued At: ${new Date().toISOString()}\nRequest ID: ${ses.uid}`;
  let signature;
  try { signature = await w.provider.request({ method: 'personal_sign', params: [hex(message), address] }); } catch (e) { throw new Error(e?.code === 4001 ? 'Request cancelled in the wallet.' : 'The wallet could not sign.'); }
  const r = await fetch('/api/wallet/evm', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + ses.token }, body: JSON.stringify({ address, message, signature }) });
  const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'Could not link the wallet.');
  return j.address;
}
