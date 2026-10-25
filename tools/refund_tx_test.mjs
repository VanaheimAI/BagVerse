// The admin refund transaction: decodes back to a USDC TransferChecked from the treasury account to the payer's account.
import { buildRefundTx } from '../src/admin/refund-tx.js';
import { Transaction } from '@solana/web3.js';
const p = { from_owner: 'APxghrmorSFNhnRUbgL11x5DUPnagYUDbK9be2b5ZCQV', from: '9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin', to: '7SW11q8XkHtim92uBuh1VDjUW5SELMUqwuLdWyaRbt82',
  mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', decimals: 6, amount: 120, blockhash: 'GHtXQBsoZHVnNFa9YevAzFr17DJjgHXk3ycTKD5xD3Zi' };
const bytes = await buildRefundTx(p, 'BagVerse refund ad-1');
const tx = Transaction.from(bytes), ix = tx.instructions[0], d = ix.data;
const ok = (c, m) => console.log((c ? 'PASS ' : 'FAIL ') + m);
ok(tx.feePayer.toBase58() === p.from_owner && tx.recentBlockhash === p.blockhash, 'fee payer = treasury, blockhash set');
ok(ix.programId.toBase58() === 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA' && d[0] === 12 && d.readBigUInt64LE(1) === 120000000n && d[9] === 6, 'TransferChecked 120.000000 USDC (6 decimals)');
ok(ix.keys.map((k) => k.pubkey.toBase58()).join() === [p.from, p.mint, p.to, p.from_owner].join() && ix.keys[3].isSigner && ix.keys[0].isWritable && ix.keys[2].isWritable, 'accounts: treasury USDC -> payer USDC, signed by the treasury');
ok(tx.instructions[1].data.toString() === 'BagVerse refund ad-1', 'memo names the booking');
