// Fake Wallet Standard wallets for browser tests (page.addInitScript(FAKE)): real Ed25519 keys via WebCrypto.
// window.__fakeWallets[i].reject = true makes the next request fail like a user cancelling.
export const FAKE = () => {
  const A = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  const b58 = (bytes) => { let z = 0; while (z < bytes.length && !bytes[z]) z++; const d = []; for (const x of bytes) { let c = x; for (let i = 0; i < d.length; i++) { c += d[i] * 256; d[i] = c % 58; c = (c / 58) | 0; } while (c) { d.push(c % 58); c = (c / 58) | 0; } } return '1'.repeat(z) + d.reverse().map((x) => A[x]).join(''); };
  const icon = 'data:image/svg+xml;base64,' + btoa('<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" rx="6" fill="#ab9ff2"/></svg>');
  window.__fakeLog = [];
  const make = async (name, withSignIn) => {
    const kp = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
    const pub = new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey));
    const account = { address: b58(pub), publicKey: pub, chains: ['solana:mainnet'], features: ['solana:signMessage'] };
    const w = { version: '1.0.0', name, icon, chains: ['solana:mainnet'], accounts: [], approved: false, reject: false,
      features: {
        'standard:connect': { version: '1.0.0', connect: async ({ silent } = {}) => { window.__fakeLog.push(name + ':connect' + (silent ? ':silent' : '')); if (silent && !w.approved) return { accounts: [] }; if (w.reject) throw Object.assign(new Error('User rejected the request.'), { code: 4001 }); w.approved = true; w.accounts = [account]; return { accounts: w.accounts }; } },
        'standard:disconnect': { version: '1.0.0', disconnect: async () => { window.__fakeLog.push(name + ':disconnect'); w.accounts = []; } },
        'standard:events': { version: '1.0.0', on: () => () => {} },
        'solana:signMessage': { version: '1.0.0', signMessage: async (...ins) => { window.__fakeLog.push(name + ':signMessage'); if (w.reject) throw new Error('User rejected'); return Promise.all(ins.map(async (i) => ({ signedMessage: i.message, signature: new Uint8Array(await crypto.subtle.sign('Ed25519', kp.privateKey, i.message)) }))); } },
      } };
    if (withSignIn) w.features['solana:signIn'] = { version: '1.0.0', signIn: async (...ins) => { window.__fakeLog.push(name + ':signIn'); w.approved = true; w.accounts = [account];
      return Promise.all(ins.map(async (i) => { const msg = new TextEncoder().encode(`${i.domain} wants you to sign in with your Solana account:\n${account.address}\n\n${i.statement}\n\nURI: ${i.uri}\nVersion: 1\nChain ID: ${i.chainId}\nNonce: ${i.nonce}\nIssued At: ${i.issuedAt}${i.requestId ? `\nRequest ID: ${i.requestId}` : ''}`);
        return { account, signedMessage: msg, signature: new Uint8Array(await crypto.subtle.sign('Ed25519', kp.privateKey, msg)), signatureType: 'ed25519' }; })); } };
    w.verify = async (message, sigB58) => { const s = [...sigB58].reduce((n, ch) => n * 58n + BigInt(A.indexOf(ch)), 0n); const bytes = new Uint8Array(64); let v = s; for (let i = 63; i >= 0; i--) { bytes[i] = Number(v & 255n); v >>= 8n; } return crypto.subtle.verify('Ed25519', kp.publicKey, bytes, new TextEncoder().encode(message)); };
    return w;
  };
  // the same names and keys survive a reload only within this page's life, so keep keys per tab in sessionStorage is overkill: tests re-approve
  (async () => {
    const ws = [await make('Phantom Test', false), await make('SignIn Test', true)]; window.__fakeWallets = ws;
    for (const w of ws) {
      const cb = ({ register }) => register(w);
      window.dispatchEvent(new CustomEvent('wallet-standard:register-wallet', { detail: cb }));
      window.addEventListener('wallet-standard:app-ready', ({ detail }) => cb(detail));
    }
  })();
};

