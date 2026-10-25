// Who controls BagVerse money and admin tools (shared by the game and the server functions in api/).
//   ADMIN_WALLET  signs in to /admin (raffles, players, winners, ads). The server can override it with ADMIN_WALLET.
//   TREASURY      receives billboard ad payments (Solana Pay, USDC).
export const ADMIN_WALLET = 'APxghrmorSFNhnRUbgL11x5DUPnagYUDbK9be2b5ZCQV';
export const TREASURY = 'APxghrmorSFNhnRUbgL11x5DUPnagYUDbK9be2b5ZCQV';
export const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';   // USDC on Solana mainnet (6 decimals)
export const AD_DAYS = 7;
const AD_PRICES = { canyon: 250, gantry: 250, totem: 120, tower: 400, spire: 300, podium: 300 };   // USDC per 7 days, by screen tier
export const adPrice = (tier) => AD_PRICES[tier] ?? 250;
