// Who controls BagVerse money and admin tools (shared by the game and the server functions in api/).
//   ADMIN_WALLET  signs in to /admin (raffles, players, winners, ads). The server can override it with ADMIN_WALLET.
//   TREASURY      receives billboard ad payments (Solana Pay, USDC).
export const ADMIN_WALLET = 'APxghrmorSFNhnRUbgL11x5DUPnagYUDbK9be2b5ZCQV';
export const TREASURY = 'APxghrmorSFNhnRUbgL11x5DUPnagYUDbK9be2b5ZCQV';
export const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';   // USDC on Solana mainnet (6 decimals)
export const AD_DAYS = 7;
const AD_PRICES = { canyon: 125, gantry: 125, totem: 60, tower: 200, spire: 150, podium: 150 };   // USDC per 7 days, by screen tier (halved Oct 26)
export const adPrice = (tier) => AD_PRICES[tier] ?? 125;

// The BagVerse token ($VERSE, formerly $BAG) lives on Solana. `mint` is filled in once the token exists; until then
// balances in the HUD are the in-game counter and nothing reads the chain.
export const VERSE = { symbol: 'VERSE', chain: 'solana', mint: null, decimals: 6 };
