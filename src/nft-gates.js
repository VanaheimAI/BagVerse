// Skins unlocked by what a verified wallet holds. Shared by the game (shows the lock) and the server
// (api/wallet/holdings.js decides who has it), so a player can't unlock a gated skin by editing their browser.
// Each gate needs ONE of:
//   collection: '<collection address>'      Metaplex certified collection (most NFT collections; check it on Magic Eden / Tensor / Solscan)
//   creator:    '<verified creator address>' older collections with no certified collection
//   mint: '<token mint>', min: <amount>     a fungible token balance (e.g. hold 10,000 $BAG once the token exists)
// label: what the locked card says. A skin listed here is locked for everyone without the holding.
export const NFT_GATES = [
  // { skin: 'kaizokuguy', collection: 'ABC...xyz', label: 'Hold a Kaizoku NFT' },
];
// tests only: extra gates as JSON in VITE_TEST_GATES (game build) / TEST_GATES (server)
try { const t = import.meta.env?.VITE_TEST_GATES || (typeof process !== 'undefined' ? process.env?.TEST_GATES : ''); if (t) NFT_GATES.push(...JSON.parse(t)); } catch (_) {}
export const gateFor = (skinId) => NFT_GATES.find((g) => g.skin === skinId) || null;

/** which gated skins a list of DAS assets (getAssetsByOwner items) unlocks */
export function skinsFromAssets(items, gates = NFT_GATES) {
  const out = new Set();
  for (const g of gates) {
    const hit = items.some((a) => {
      if (g.collection) return (a.grouping || []).some((x) => x.group_key === 'collection' && x.group_value === g.collection);
      if (g.creator) return (a.creators || []).some((c) => c.verified && c.address === g.creator);
      if (g.mint) { if (a.id !== g.mint) return false; const t = a.token_info || {}; const amt = Number(t.balance || 0) / 10 ** (t.decimals || 0); return amt >= (g.min ?? 1); }
      return false;
    });
    if (hit) out.add(g.skin);
  }
  return [...out];
}
