// Polygon wallet links (Sign-In with Ethereum, EIP-4361). Only needed by raffle winners whose prize is a Polygon slab
// (Courtyard). Plain wallets are checked offline; smart-contract wallets (ERC-1271 / 6492) need POLYGON_RPC_URL
// (or ALCHEMY_API_KEY).
import { verifyMessage, getAddress, isAddress, createPublicClient, http } from 'viem';
import { polygon } from 'viem/chains';

export function parseSiwe(msg) {
  if (typeof msg !== 'string' || msg.length > 1500) return null;
  const lines = msg.split('\n');
  const m = /^(\S+) wants you to sign in with your Ethereum account:$/.exec(lines[0] || ''); if (!m) return null;
  const f = { domain: m[1], address: (lines[1] || '').trim() };
  for (const l of lines.slice(2)) { const k = /^([A-Za-z ]+): (.*)$/.exec(l); if (k) f[k[1].trim()] = k[2].trim(); }
  return f;
}
export const polygonRpc = () => process.env.POLYGON_RPC_URL || (process.env.ALCHEMY_API_KEY ? `https://polygon-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}` : '');

export async function checkEvmLink({ address, message, signature }, { host, uid, now = Date.now(), rpcUrl = polygonRpc() }) {
  if (!isAddress(String(address || ''))) return { ok: false, status: 400, error: 'Not an Ethereum / Polygon address.' };
  const f = parseSiwe(message);
  if (!f) return { ok: false, status: 400, error: 'Not a sign-in message.' };
  if (f.address.toLowerCase() !== address.toLowerCase()) return { ok: false, status: 400, error: 'The message is for a different address.' };
  if (f.domain !== host) return { ok: false, status: 400, error: `Signed for ${f.domain}, not ${host}.` };
  if (f['Request ID'] !== uid) return { ok: false, status: 400, error: 'Signed for a different player.' };
  if (f['Chain ID'] !== '137') return { ok: false, status: 400, error: 'Sign for Polygon (chain 137).' };
  const t = Date.parse(f['Issued At'] || '');
  if (!isFinite(t) || now - t > 10 * 60e3 || t - now > 2 * 60e3) return { ok: false, status: 400, error: 'Sign-in expired. Try again.' };
  let valid = false;
  try { valid = await verifyMessage({ address, message, signature }); } catch (_) { valid = false; }
  if (!valid && rpcUrl) { try { valid = await createPublicClient({ chain: polygon, transport: http(rpcUrl) }).verifyMessage({ address, message, signature }); } catch (_) { valid = false; } }   // smart-contract wallets
  if (!valid) return { ok: false, status: 401, error: 'Signature does not match the wallet.' };
  return { ok: true, address: getAddress(address), nonce: f.Nonce || '' };
}

/** Courtyard (or any ERC-721) tokens a Polygon address holds in the given contracts, via Alchemy's NFT API */
export async function polygonNfts(owner, contracts, { key = process.env.ALCHEMY_API_KEY, fetchFn = fetch } = {}) {
  if (!key || !contracts.length) return null;
  const u = new URL(`https://polygon-mainnet.g.alchemy.com/nft/v3/${key}/getNFTsForOwner`);
  u.searchParams.set('owner', owner); for (const c of contracts) u.searchParams.append('contractAddresses[]', c); u.searchParams.set('withMetadata', 'true'); u.searchParams.set('pageSize', '100');
  try { const r = await fetchFn(u); const j = await r.json(); return (j.ownedNfts || []).map((n) => ({ chain: 'polygon', contract: n.contract?.address, tokenId: n.tokenId, name: n.name || n.raw?.metadata?.name, image: n.image?.cachedUrl || n.image?.originalUrl })); }
  catch (_) { return null; }
}
