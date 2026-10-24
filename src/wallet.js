// Solana wallet connect (Wallet Standard: Phantom, Solflare, Backpack, Glow, ... plus Mobile Wallet Adapter on Android Chrome).
// Flow: pick a wallet -> connect -> sign a free, off-chain "sign in" message (no transaction, no fee) -> the address is
// linked to this player. The address and the signed message are kept in this browser and on the player's own
// leaderboard row, so a server can verify ownership later (prizes, skin ownership). Nothing here moves funds.
import { getWallets } from '@wallet-standard/app';

const KEY = 'bv_wallet';
const CHAIN = 'solana:mainnet';
const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
export function b58(bytes) {
  let zeros = 0; while (zeros < bytes.length && bytes[zeros] === 0) zeros++;
  const d = [];
  for (const b of bytes) { let c = b; for (let i = 0; i < d.length; i++) { c += d[i] * 256; d[i] = c % 58; c = (c / 58) | 0; } while (c) { d.push(c % 58); c = (c / 58) | 0; } }
  return '1'.repeat(zeros) + d.reverse().map((x) => B58[x]).join('');
}
export const short = (a) => (a ? a.slice(0, 4) + '…' + a.slice(-4) : '');
const isSolana = (w) => w.chains?.some((c) => c.startsWith('solana:')) && w.features?.['standard:connect'];
const load = () => { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (_) { return null; } };
const store = (v) => { try { v ? localStorage.setItem(KEY, JSON.stringify(v)) : localStorage.removeItem(KEY); } catch (_) {} };
const ANDROID = /android/i.test(navigator.userAgent), IOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const MOBILE = ANDROID || IOS;

export class Wallet {
  constructor() {
    this.linked = load();            // { address, wallet, message, signature, at } once signed in
    this.wallet = null; this.account = null; this.listeners = new Set();
    this.api = getWallets();
    this.api.on('register', () => { this.changed(); this.reconnect(); });
    if (ANDROID) this.mwa();
    setTimeout(() => this.reconnect(), 600);   // extensions register a moment after load
  }
  /** Android Chrome: Mobile Wallet Adapter shows up as one more wallet (opens the installed wallet app) */
  async mwa() {
    try {
      const m = await import('@solana-mobile/wallet-standard-mobile');
      m.registerMwa({ appIdentity: { name: 'BagVerse', uri: location.origin, icon: 'favicon.ico' }, authorizationCache: m.createDefaultAuthorizationCache(),
        chains: [CHAIN], chainSelector: m.createDefaultChainSelector(), onWalletNotFound: m.createDefaultWalletNotFoundHandler() });
    } catch (e) { console.warn('wallet: mobile wallet adapter unavailable', e?.message); }
  }
  list() {
    const seen = new Set();
    return this.api.get().filter(isSolana).filter((w) => !seen.has(w.name) && seen.add(w.name));
  }
  get address() { return this.linked?.address || null; }
  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  changed() { for (const f of this.listeners) f(this); }

  /** after a reload: quietly re-attach to the wallet that was linked (no pop-up) */
  async reconnect() {
    if (!this.linked || this.wallet) return;
    const w = this.list().find((x) => x.name === this.linked.wallet); if (!w) return;
    try {
      const { accounts } = await w.features['standard:connect'].connect({ silent: true });
      const acc = accounts?.find((a) => a.address === this.linked.address) || w.accounts.find((a) => a.address === this.linked.address);
      if (acc) this.attach(w, acc);
    } catch (_) { /* the link stays; the wallet just isn't open right now */ }
  }
  attach(w, acc) {
    this.wallet = w; this.account = acc;
    this.offEvents?.(); this.offEvents = w.features['standard:events']?.on('change', ({ accounts }) => {
      if (!accounts) return;
      if (!accounts.length) return this.disconnect(false);
      if (accounts[0].address !== this.linked?.address) { this.account = null; this.unlink(); this.toast?.('Wallet account changed. Connect again to link the new one.'); }
    });
    this.changed();
  }

  /** connect + sign in. Returns the linked record, or throws an Error with a readable message */
  async connect(w, playerName = 'Player') {
    const nonce = b58(crypto.getRandomValues(new Uint8Array(12)));
    const issuedAt = new Date().toISOString();
    const statement = `Link this wallet to BagVerse player ${playerName}. Signing is free and sends no transaction.`;
    let address, message, signature;
    try {
      const signIn = w.features['solana:signIn'];
      if (signIn) {
        const [out] = await signIn.signIn({ domain: location.host, statement, uri: location.origin, version: '1', nonce, issuedAt, chainId: 'mainnet' });
        address = out.account.address; message = new TextDecoder().decode(out.signedMessage); signature = b58(out.signature);
        this.attach(w, out.account);
      } else {
        const { accounts } = await w.features['standard:connect'].connect();
        const acc = accounts?.[0]; if (!acc) throw new Error('The wallet returned no account.');
        address = acc.address;
        const sm = w.features['solana:signMessage'];
        if (!sm) throw new Error(`${w.name} can't sign messages, so the link can't be verified. Try another wallet.`);
        message = `${location.host} wants you to sign in with your Solana account:\n${address}\n\n${statement}\n\nURI: ${location.origin}\nVersion: 1\nChain ID: mainnet\nNonce: ${nonce}\nIssued At: ${issuedAt}`;
        const [res] = await sm.signMessage({ account: acc, message: new TextEncoder().encode(message) });
        signature = b58(res.signature);
        this.attach(w, acc);
      }
    } catch (e) {
      const msg = String(e?.message || e);
      if (/reject|denied|cancel|declin|closed/i.test(msg) || e?.code === 4001) throw new Error('Request cancelled in the wallet.');
      throw new Error(msg.slice(0, 160));
    }
    this.linked = { address, wallet: w.name, message, signature, at: Date.now() };
    store(this.linked); this.changed();
    return this.linked;
  }
  unlink() { this.linked = null; store(null); this.changed(); }
  async disconnect(callWallet = true) {
    const w = this.wallet; this.offEvents?.(); this.offEvents = null; this.wallet = null; this.account = null;
    if (callWallet) try { await w?.features['standard:disconnect']?.disconnect(); } catch (_) {}
    this.unlink();
  }

  /** "open this page inside the wallet app" links for phones with no wallet in the browser */
  static deepLinks(url = location.href) {
    const u = encodeURIComponent(url), r = encodeURIComponent(location.origin);
    return [
      { name: 'Phantom', href: `https://phantom.app/ul/browse/${u}?ref=${r}` },
      { name: 'Solflare', href: `https://solflare.com/ul/v1/browse/${u}?ref=${r}` },
      { name: 'Backpack', href: `https://backpack.app/ul/v1/browse/${u}?ref=${r}` },
    ];
  }
  static installLinks() {
    return [{ name: 'Phantom', href: 'https://phantom.com/download' }, { name: 'Solflare', href: 'https://solflare.com/download' }, { name: 'Backpack', href: 'https://backpack.app/downloads' }];
  }
}
