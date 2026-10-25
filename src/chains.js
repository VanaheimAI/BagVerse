// Chains and slab issuers BagVerse knows about. Solana is the home chain ($VERSE, Collector Crypt slabs, wallet
// sign-in, raffle draws, ad payments). Polygon is added for Courtyard slabs: raffle prizes can live there, and a
// winner links a Polygon wallet to receive one. Everything chain-specific reads from here.
export const CHAINS = {
  solana: { name: 'Solana', explorer: { account: (a) => `https://solscan.io/account/${a}`, token: (mint) => `https://solscan.io/token/${mint}` } },
  polygon: { name: 'Polygon', chainId: 137, explorer: { account: (a) => `https://polygonscan.com/address/${a}`, token: (c, id) => `https://polygonscan.com/nft/${c}/${id}` } },
};
export const ISSUERS = {
  collector_crypt: { name: 'Collector Crypt', chain: 'solana' },
  courtyard: { name: 'Courtyard', chain: 'polygon', contract: '0x251be3a17af4892035c37ebf5890f4a4d889dcad' },   // Courtyard's Polygon NFT contract (check on Polygonscan)
};
/** which chain a raffle prize lives on (prizes saved before Polygon support are Solana) */
export const prizeChain = (prize) => (prize && prize.chain === 'polygon' ? 'polygon' : 'solana');
export const prizeIssuer = (prize) => ISSUERS[prize?.issuer] || (prizeChain(prize) === 'polygon' ? ISSUERS.courtyard : prize?.mint ? ISSUERS.collector_crypt : null);
