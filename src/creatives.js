// Canvas-drawn placeholder ad creatives, tickers and labels. All original artwork.
// When the billboard contract ships, rented slots swap these for the advertiser's image/video URL.
import * as THREE from 'three';

const C = { lime: '#7cff3d', cyan: '#22e8ff', magenta: '#ff2bd6', purple: '#8b3dff', gold: '#ffc83d', red: '#ff3b3b', bg: '#0b0618' };

function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

function glowText(g, txt, x, y, size, color, font = 'Rajdhani', weight = 700, blur = 24) {
  g.font = `${weight} ${size}px ${font}, sans-serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.shadowColor = color; g.shadowBlur = blur; g.fillStyle = color; g.fillText(txt, x, y);
  g.shadowBlur = 0; g.fillStyle = '#ffffff'; g.globalAlpha = 0.85; g.fillText(txt, x, y); g.globalAlpha = 1;
}

function bgGrad(g, w, h, c1, c2) {
  const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, c1); gr.addColorStop(1, c2);
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
  g.globalAlpha = 0.12; g.fillStyle = '#000';
  for (let y = 0; y < h; y += 6) g.fillRect(0, y, w, 2);       // LED scanlines
  g.globalAlpha = 1;
}

function rocket(g, x, y, s, rot = -0.6) {
  g.save(); g.translate(x, y); g.rotate(rot); g.scale(s, s);
  g.fillStyle = '#f2f2f7'; g.beginPath(); g.moveTo(0, -60); g.quadraticCurveTo(26, -20, 18, 40); g.lineTo(-18, 40); g.quadraticCurveTo(-26, -20, 0, -60); g.fill();
  g.fillStyle = C.red; g.beginPath(); g.moveTo(-18, 20); g.lineTo(-34, 52); g.lineTo(-14, 40); g.fill();
  g.beginPath(); g.moveTo(18, 20); g.lineTo(34, 52); g.lineTo(14, 40); g.fill();
  g.fillStyle = C.cyan; g.beginPath(); g.arc(0, -12, 9, 0, Math.PI * 2); g.fill();
  const fl = g.createLinearGradient(0, 40, 0, 110); fl.addColorStop(0, '#fff6a0'); fl.addColorStop(0.4, C.gold); fl.addColorStop(1, 'rgba(255,80,0,0)');
  g.fillStyle = fl; g.beginPath(); g.moveTo(-14, 42); g.quadraticCurveTo(0, 130, 14, 42); g.fill();
  g.restore();
}

// ---- creative library: each returns a canvas. vertical=true -> 9:16
const LIB = [
  (w, h, v) => { const c = canvas(w, h), g = c.getContext('2d'); bgGrad(g, w, h, '#14072b', '#000'); g.strokeStyle = '#fff'; g.lineWidth = 6; g.strokeRect(20, 20, w - 40, h - 40);
    glowText(g, 'AD SPACE', w / 2, h * 0.38, v ? 110 : 130, '#ffffff', 'Rajdhani', 700, 10);
    glowText(g, '$250 / 7 DAYS (USDC)', w / 2, h * 0.58, v ? 52 : 64, C.lime, 'Rajdhani', 700, 14);
    glowText(g, 'WALK UP + PRESS E TO RENT', w / 2, h * 0.76, v ? 32 : 36, C.cyan, 'Rajdhani', 600, 8); return c; },
  (w, h, v) => { const c = canvas(w, h), g = c.getContext('2d'); bgGrad(g, w, h, '#1d0a4a', '#05020f');
    for (let i = 0; i < 90; i++) { g.fillStyle = `rgba(255,255,255,${Math.random()})`; g.fillRect(Math.random() * w, Math.random() * h, 3, 3); }
    rocket(g, w * (v ? 0.5 : 0.72), h * (v ? 0.62 : 0.55), v ? 3.2 : 2.6);
    glowText(g, 'TO THE', v ? w / 2 : w * 0.32, h * (v ? 0.16 : 0.38), v ? 90 : 110, C.cyan);
    glowText(g, 'MOON', v ? w / 2 : w * 0.32, h * (v ? 0.27 : 0.62), v ? 130 : 160, C.cyan); return c; },
  (w, h, v) => { const c = canvas(w, h), g = c.getContext('2d'); bgGrad(g, w, h, '#2a1700', '#0a0500');
    g.fillStyle = C.gold; g.beginPath(); const cx = w / 2, cy = h * 0.34, s = v ? 120 : 90;
    g.moveTo(cx - s, cy + s * 0.4); g.lineTo(cx - s * 0.8, cy - s * 0.5); g.lineTo(cx - s * 0.35, cy); g.lineTo(cx, cy - s * 0.7); g.lineTo(cx + s * 0.35, cy); g.lineTo(cx + s * 0.8, cy - s * 0.5); g.lineTo(cx + s, cy + s * 0.4); g.fill();
    glowText(g, 'HOLD', w / 2, h * 0.62, v ? 120 : 110, C.gold); glowText(g, 'THE LINE', w / 2, h * 0.82, v ? 90 : 80, C.gold); return c; },
  (w, h, v) => { const c = canvas(w, h), g = c.getContext('2d'); bgGrad(g, w, h, '#ff7a00', '#ff2bd6');
    glowText(g, 'GM', w / 2, h * 0.46, v ? 300 : 300, '#ffffff', 'Permanent Marker', 400, 30);
    glowText(g, 'GOOD MORNING, BAG SQUARE', w / 2, h * 0.8, v ? 36 : 44, '#ffffff', 'Rajdhani', 700, 6); return c; },
  (w, h, v) => { const c = canvas(w, h), g = c.getContext('2d'); bgGrad(g, w, h, '#002a3a', '#060010');
    glowText(g, 'WHALE', w / 2, h * 0.36, v ? 140 : 150, C.cyan); glowText(g, 'LOUNGE', w / 2, h * 0.6, v ? 110 : 110, C.magenta);
    glowText(g, 'LV 50+ SKINS ONLY', w / 2, h * 0.82, 42, '#ffffff', 'Rajdhani', 600, 6); return c; },
  (w, h, v) => { const c = canvas(w, h), g = c.getContext('2d'); bgGrad(g, w, h, '#0a2a06', '#000');
    g.strokeStyle = C.lime; g.lineWidth = 8; g.beginPath(); for (let i = 0; i <= 12; i++) { const x = 60 + (w - 120) * i / 12, y = h * 0.75 - (i * i * 3.2) * (v ? 2 : 1) * (0.7 + Math.random() * 0.5); i ? g.lineTo(x, y) : g.moveTo(x, y); } g.shadowColor = C.lime; g.shadowBlur = 20; g.stroke(); g.shadowBlur = 0;
    glowText(g, 'SKIN XP', w / 2, h * 0.2, v ? 100 : 110, C.lime); glowText(g, 'MARKETPLACE', w / 2, h * 0.36, v ? 64 : 70, '#ffffff', 'Rajdhani', 700, 6); return c; },
  (w, h, v) => { const c = canvas(w, h), g = c.getContext('2d'); bgGrad(g, w, h, '#20004a', '#000');
    glowText(g, 'BAG RUN', w / 2, h * 0.36, v ? 130 : 150, C.lime, 'Permanent Marker', 400);
    glowText(g, 'OBSTACLE COURSE · 3 MIN', w / 2, h * 0.6, 44, '#ffffff', 'Rajdhani', 700, 6);
    glowText(g, 'ENTER THE GREEN PORTAL', w / 2, h * 0.76, 40, C.lime, 'Rajdhani', 700, 8); return c; },
  (w, h, v) => { const c = canvas(w, h), g = c.getContext('2d'); bgGrad(g, w, h, '#1a1200', '#000');
    glowText(g, "THIS WEEK'S", w / 2, h * 0.2, 56, '#ffffff', 'Rajdhani', 700, 6);
    glowText(g, 'RWA PRIZE', w / 2, h * 0.38, v ? 120 : 130, C.gold);
    glowText(g, 'GOLD WATCH · GRADED CARD', w / 2, h * 0.6, v ? 40 : 48, '#ffffff', 'Rajdhani', 700, 6);
    glowText(g, 'LV 25+ TOURNAMENT', w / 2, h * 0.78, 44, C.cyan, 'Rajdhani', 700, 8); return c; },
  (w, h, v) => { const c = canvas(w, h), g = c.getContext('2d'); bgGrad(g, w, h, '#3a0016', '#000');
    glowText(g, 'THE', w / 2, h * 0.3, 70, '#ffffff', 'Rajdhani', 700, 6); glowText(g, 'TRENCHES', w / 2, h * 0.5, v ? 120 : 150, C.red);
    glowText(g, 'ONLY THE STRONG HOLD', w / 2, h * 0.74, 44, '#ffffff', 'Rajdhani', 600, 6); return c; },
  (w, h, v) => { const c = canvas(w, h), g = c.getContext('2d'); bgGrad(g, w, h, '#002b16', '#00110a');
    glowText(g, 'WAGMI', w / 2, h * 0.44, v ? 170 : 200, C.lime, 'Permanent Marker', 400, 30);
    glowText(g, 'WE ARE ALL GONNA MAKE IT', w / 2, h * 0.74, v ? 36 : 44, '#ffffff', 'Rajdhani', 700, 6); return c; },
  (w, h, v) => { const c = canvas(w, h), g = c.getContext('2d'); bgGrad(g, w, h, '#2b0040', '#050010');
    glowText(g, 'VAULT', w / 2, h * 0.33, v ? 140 : 150, C.gold); glowText(g, 'HEIST', w / 2, h * 0.56, v ? 140 : 150, C.magenta);
    glowText(g, 'ARENA SHOOTER · SOON', w / 2, h * 0.8, 42, '#ffffff', 'Rajdhani', 700, 6); return c; },
];

/** two-ish creatives per screen, rotated by the world. */
export function billboardCreatives(slot, vertical) {
  const w = vertical ? 576 : 1024, h = vertical ? 1024 : 576;
  const picks = [LIB[slot % LIB.length], LIB[(slot * 7 + 3) % LIB.length]];
  if (slot % 4 === 0) picks.unshift(LIB[0]);   // a quarter of the screens advertise themselves as open
  return picks.map((f) => {
    const tex = new THREE.CanvasTexture(f(w, h, vertical));
    tex.colorSpace = THREE.SRGBColorSpace; tex.flipY = false; tex.anisotropy = 4;
    return tex;
  });
}

export const isOpenSlot = (slot) => slot % 4 === 0;

/** scrolling trading-floor ticker strip */
export function tickerTexture(seed) {
  const items = [
    ['GENESIS SKIN #0420 · LV 54', '12.5 SOL', 1], ['CHROME SKIN #1337 · LV 27', '3.1 SOL', 1], ['HOLO SKIN #0077 · LV 61', '22.0 SOL', -1],
    ['GRADED CARD TOKEN · GEM MINT', '1,250 USDC', 1], ['GOLD WATCH TOKEN', '9,800 USDC', -1], ['1 OZ GOLD TOKEN', '2,410 USDC', 1],
    ['APEX SKIN #0001 · LV 100', '180 SOL', 1], ['BASE SKIN #8812 · LV 3', '0.2 SOL', -1], ['SNEAKER TOKEN · DS', '640 USDC', 1],
  ];
  const c = canvas(2048, 256), g = c.getContext('2d');
  g.fillStyle = '#04030a'; g.fillRect(0, 0, 2048, 256);
  let x = 30; const rot = seed % items.length;
  g.font = '700 64px Rajdhani, sans-serif'; g.textBaseline = 'middle';
  for (let i = 0; i < items.length && x < 2000; i++) {
    const [n, p, d] = items[(i + rot) % items.length];
    g.fillStyle = '#ffffff'; g.fillText(n, x, 90); const w1 = g.measureText(n).width;
    g.fillStyle = d > 0 ? C.lime : C.red; g.fillText(`${p} ${d > 0 ? '▲' : '▼'}`, x, 180);
    x += Math.max(w1, 300) + 80;
  }
  g.fillStyle = C.lime; g.fillRect(0, 0, 2048, 6); g.fillRect(0, 250, 2048, 6);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace; tex.flipY = false; tex.wrapS = THREE.RepeatWrapping; tex.repeat.x = 0.5;
  return tex;
}

/** nameplate sprite texture */
export function nameplate(tag, name, level, color = C.lime) {
  const c = canvas(512, 128), g = c.getContext('2d');
  g.fillStyle = 'rgba(10,8,24,0.78)'; const r = 30;
  g.beginPath(); g.roundRect(8, 24, 496, 84, r); g.fill();
  g.strokeStyle = color; g.lineWidth = 4; g.stroke();
  const txt = `[${tag}] ${name}`;
  let fs = 44; g.textBaseline = 'middle';
  do { g.font = `700 ${fs}px Rajdhani, sans-serif`; fs -= 2; } while (g.measureText(txt).width > 360 && fs > 20);
  g.textAlign = 'left'; g.fillStyle = color; g.fillText(txt, 34, 68);
  g.fillStyle = color; g.beginPath(); g.roundRect(410, 44, 80, 48, 16); g.fill();
  g.fillStyle = '#0b0618'; g.font = '700 30px Rajdhani, sans-serif'; g.textAlign = 'center'; g.fillText(`Lv${level}`, 450, 69);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function bubble(text) {
  const c = canvas(512, 128), g = c.getContext('2d');
  g.font = '700 46px Rajdhani, sans-serif';
  const w = Math.min(490, g.measureText(text).width + 50);
  g.fillStyle = 'rgba(255,255,255,0.95)'; g.beginPath(); g.roundRect(256 - w / 2, 10, w, 86, 26); g.fill();
  g.beginPath(); g.moveTo(240, 94); g.lineTo(256, 120); g.lineTo(272, 94); g.fill();
  g.fillStyle = '#120a24'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text.slice(0, 22), 256, 54);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; return tex;
}

/** graded-card hologram face (original abstract art) */
export function cardTexture() {
  const c = canvas(256, 384), g = c.getContext('2d');
  g.fillStyle = '#d9dde8'; g.fillRect(0, 0, 256, 384);
  g.fillStyle = '#c62828'; g.fillRect(14, 12, 228, 56);
  g.fillStyle = '#fff'; g.font = '700 22px Rajdhani'; g.textAlign = 'center'; g.fillText('BAGVERSE GRADING', 128, 34); g.fillText('GEM MINT 10', 128, 58);
  const gr = g.createLinearGradient(0, 80, 256, 370); gr.addColorStop(0, '#ffb300'); gr.addColorStop(0.5, '#ff2bd6'); gr.addColorStop(1, '#22e8ff');
  g.fillStyle = gr; g.fillRect(24, 82, 208, 286);
  g.fillStyle = 'rgba(255,255,255,.85)'; g.beginPath(); g.arc(128, 200, 60, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#7a00ff'; g.beginPath(); for (let i = 0; i < 10; i++) { const a = i * Math.PI / 5, r = i % 2 ? 26 : 56; g.lineTo(128 + Math.cos(a) * r, 200 + Math.sin(a) * r); } g.fill();
  g.fillStyle = '#fff'; g.font = '700 26px Rajdhani'; g.fillText('BAGMON #001', 128, 330);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; return tex;
}

export function labelTexture(lines, color = C.gold) {
  const c = canvas(512, 160), g = c.getContext('2d');
  g.fillStyle = 'rgba(8,6,20,.7)'; g.beginPath(); g.roundRect(6, 6, 500, 148, 22); g.fill();
  g.strokeStyle = color; g.lineWidth = 3; g.stroke();
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = color; g.font = '700 44px Rajdhani'; g.fillText(lines[0], 256, 52);
  g.fillStyle = '#fff'; g.font = '600 34px Rajdhani'; g.fillText(lines[1] || '', 256, 110);
  return c;
}
