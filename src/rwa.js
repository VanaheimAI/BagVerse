// Real-world assets shown in the RWA Vault. Each entry is a tokenized, vaulted collectible on Solana.
// `photo` is a bundled photo of the whole graded slab (inlined by Vite, so it works on any host and needs
// no CORS); it is shown full-bleed. Without one, the card art is fetched from the issuer's CDN and framed
// under a drawn grading label; if that can't be used as a WebGL texture (CORS / CSP), a text-only face is kept.
import * as THREE from 'three';
import LUFFY_SLAB from './assets/rwa/inuRTqXX15NQAS48xZaHgFT4tCV4kdwrHisUhBkTZdD.js';

export const RWA_ASSETS = [
  {
    mint: 'inuRTqXX15NQAS48xZaHgFT4tCV4kdwrHisUhBkTZdD',
    chain: 'solana',
    name: 'Monkey D. Luffy',
    set: 'One Piece OP13 · Carrying on His Will',
    number: '118',
    year: 2025,
    grader: 'PSA',
    grade: '10',
    variant: 'Alternate Art',
    cert: '146575703',
    photo: LUFFY_SLAB, aspect: 332 / 550,    // photo of the full PSA slab (supplied by the owner)
    issuer: 'Collector Crypt',
    url: 'https://collectorcrypt.com/assets/solana/inuRTqXX15NQAS48xZaHgFT4tCV4kdwrHisUhBkTZdD',
    image: 'https://d1xpxki1g4htqu.cloudfront.net/nPLNBrU1RomaSOpwgEDBO7yarmf92xLcHdmGsUtjxCU',
    unlock: 'LV 25+',
  },
];

export const shortMint = (m) => m.slice(0, 4) + '…' + m.slice(-4);

const W = 512, H = 800;   // slab insert: grading label on top, card window below

function drawSlab(a, img) {
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  // insert background
  g.fillStyle = '#eef1f6'; g.fillRect(0, 0, W, H);
  // grading label
  g.fillStyle = '#ffffff'; g.fillRect(18, 16, W - 36, 118);
  g.strokeStyle = '#c62828'; g.lineWidth = 6; g.strokeRect(21, 19, W - 42, 112);
  g.fillStyle = '#1b1b22'; g.textBaseline = 'middle';
  g.font = '700 26px Rajdhani, sans-serif'; g.textAlign = 'left';
  g.fillText(`${a.year} ONE PIECE · OP13`, 40, 46, W - 220);
  g.fillText(`#${a.number} ${a.name.toUpperCase()}`, 40, 78, W - 220);
  g.font = '600 20px Rajdhani, sans-serif'; g.fillStyle = '#5b5f6b';
  g.fillText(`${a.issuer.toUpperCase()} · ${shortMint(a.mint)}`, 40, 108, W - 220);
  g.textAlign = 'right'; g.fillStyle = '#c62828';
  g.font = '700 22px Rajdhani, sans-serif'; g.fillText(`${a.grader} GEM MT`, W - 40, 50);
  g.font = '700 54px Rajdhani, sans-serif'; g.fillText(a.grade, W - 40, 96);
  // card window
  const x = 40, y = 156, w = W - 80, h = H - 156 - 24;
  g.fillStyle = '#0d0f17'; g.fillRect(x - 4, y - 4, w + 8, h + 8);
  if (img) {
    // the photo may be the whole slab or just the card: fit by cover, centred
    const s = Math.max(w / img.width, h / img.height);
    const iw = img.width * s, ih = img.height * s;
    g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
    g.drawImage(img, x + (w - iw) / 2, y + (h - ih) / 2, iw, ih); g.restore();
  } else {
    const gr = g.createLinearGradient(x, y, x + w, y + h);
    gr.addColorStop(0, '#1d2a6b'); gr.addColorStop(0.5, '#7b1fa2'); gr.addColorStop(1, '#c62828');
    g.fillStyle = gr; g.fillRect(x, y, w, h);
    g.fillStyle = 'rgba(255,255,255,0.08)';
    for (let i = -h; i < w; i += 28) { g.beginPath(); g.moveTo(x + i, y + h); g.lineTo(x + i + h, y); g.lineTo(x + i + h + 12, y); g.lineTo(x + i + 12, y + h); g.fill(); }
    g.textAlign = 'center'; g.fillStyle = '#fff';
    g.font = '700 46px Rajdhani, sans-serif'; g.fillText(a.name.toUpperCase(), W / 2, y + h * 0.42);
    g.font = '600 30px Rajdhani, sans-serif'; g.fillStyle = '#ffd27a'; g.fillText(`OP13 · #${a.number}`, W / 2, y + h * 0.52);
    g.font = '600 22px Rajdhani, sans-serif'; g.fillStyle = 'rgba(255,255,255,.75)'; g.fillText('VAULTED · TOKENIZED ON SOLANA', W / 2, y + h * 0.88);
  }
  return c;
}

/** the photo already shows the whole slab: use it as-is */
function drawPhoto(img) {
  const w = 512, h = Math.round(512 * img.height / img.width);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); g.imageSmoothingQuality = 'high';
  g.drawImage(img, 0, 0, w, h);
  return c;
}

function loadImage(src) {
  return new Promise((res, rej) => {
    const im = new Image(); im.crossOrigin = 'anonymous'; im.decoding = 'async';
    im.onload = () => res(im); im.onerror = rej; im.src = src;
  });
}

/** canvas texture for the slab insert; upgrades itself to the real photo when it can */
export function rwaSlabTexture(a, renderer) {
  const tex = new THREE.CanvasTexture(drawSlab(a, null));
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = renderer ? Math.min(8, renderer.capabilities.getMaxAnisotropy()) : 4;
  const tryAll = async () => {
    for (const src of [a.photo, a.image].filter(Boolean)) {
      try {
        const im = await loadImage(src);
        const cv = src === a.photo ? drawPhoto(im) : drawSlab(a, im);
        cv.getContext('2d').getImageData(0, 0, 1, 1);   // throws if the image tainted the canvas (no CORS)
        tex.image = cv; tex.needsUpdate = true; a.loaded = src;
        return;
      } catch (e) { /* next source */ }
    }
  };
  tryAll();
  return tex;
}
