// The USDC refund transaction (SPL Token TransferChecked + a memo), built for the admin wallet to sign and send.
export async function buildRefundTx(p, memo) {
  const [{ PublicKey, Transaction, TransactionInstruction }, { Buffer }] = await Promise.all([import('@solana/web3.js'), import('buffer')]);
  const data = new Uint8Array(10); data[0] = 12; new DataView(data.buffer).setBigUint64(1, BigInt(Math.round(p.amount * 10 ** p.decimals)), true); data[9] = p.decimals;
  const owner = new PublicKey(p.from_owner);
  const tx = new Transaction({ feePayer: owner, recentBlockhash: p.blockhash }).add(
    new TransactionInstruction({ programId: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'), data: Buffer.from(data), keys: [
      { pubkey: new PublicKey(p.from), isSigner: false, isWritable: true }, { pubkey: new PublicKey(p.mint), isSigner: false, isWritable: false },
      { pubkey: new PublicKey(p.to), isSigner: false, isWritable: true }, { pubkey: owner, isSigner: true, isWritable: false }] }),
    new TransactionInstruction({ programId: new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr'), data: Buffer.from(memo), keys: [] }));
  return tx.serialize({ requireAllSignatures: false, verifySignatures: false });
}
