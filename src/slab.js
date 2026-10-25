// Graded-slab look for the Collection screen: a clear acrylic case with a grading label on top and the card art
// below, built in 3D for the stand and as a canvas label for the grid cards.
// Skins are graded by BVG (BagVerse Grading, our own in-game scale); real vaulted cards keep their real grader
// and are shown from the photo of the actual slab.
import * as THREE from 'three';

export const SKIN_GRADE = {
  legendary: { n: '10', word: 'GEM MINT' },
  epic: { n: '10', word: 'PRISTINE' },
  holiday: { n: '9.5', word: 'MINT+' },
  rare: { n: '9', word: 'MINT' },
  common: { n: '8.5', word: 'NM-MT+' },
};

const tex = (w, h, draw) => {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
};
const fit = (g, text, max, size, weight = 700, font = 'Rajdhani, sans-serif') => {
  let s = size; g.font = `${weight} ${s}px ${font}`; while (g.measureText(text).width > max && s > 10) { s -= 1; g.font = `${weight} ${s}px ${font}`; } return s;
};

/** grading label: BVG = black with a gold rim (ours); others = white with a red rim */
export function labelCanvas(item, w = 600, h = 190) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
  const bvg = item.grade.co === 'BVG';
  g.fillStyle = bvg ? '#0d0f14' : '#ffffff'; g.fillRect(0, 0, w, h);
  g.strokeStyle = bvg ? '#d8b04a' : '#c62828'; g.lineWidth = 10; g.strokeRect(8, 8, w - 16, h - 16);
  const ink = bvg ? '#f3f5f8' : '#16161c', sub = bvg ? '#d8b04a' : '#c62828';
  g.textBaseline = 'top';
  // left: company, item, set line
  g.fillStyle = sub; g.font = '800 24px Rajdhani, sans-serif'; g.fillText(bvg ? 'BVG · BAGVERSE GRADED' : `${item.grade.co} · CERTIFIED`, 28, 24);
  g.fillStyle = ink; fit(g, item.name, w - 230, 40); g.fillText(item.name, 28, 56);
  g.fillStyle = bvg ? '#9aa6b8' : '#4a4a55'; fit(g, item.sub || '', w - 230, 26, 600); g.fillText(item.sub || '', 28, 104);
  g.font = '600 20px "Courier New", monospace'; g.fillText(item.cert || '', 28, 142);
  // right: grade box
  g.fillStyle = bvg ? '#d8b04a' : '#16161c'; g.fillRect(w - 180, 26, 152, h - 52);
  g.fillStyle = bvg ? '#0d0f14' : '#ffffff'; g.textAlign = 'center';
  g.font = '700 18px Rajdhani, sans-serif'; g.fillText(item.grade.word, w - 104, 36);
  fit(g, item.grade.n, 136, 88, 800); g.fillText(item.grade.n, w - 104, 62);
  return c;
}

/** the 3D slab for the stand (~1.0 x 1.62 m), centred on its middle */
export function makeSlab(item, img) {
  const g = new THREE.Group();
  const W = 1.0, H = 1.62, D = 0.1;
  // acrylic shell + bright edges
  const shell = new THREE.Mesh(new THREE.BoxGeometry(W, H, D), new THREE.MeshPhysicalMaterial({
    color: '#eef6ff', transparent: true, opacity: 0.16, roughness: 0.04, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 2.2, depthWrite: false }));
  shell.renderOrder = 2; g.add(shell);
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(shell.geometry), new THREE.LineBasicMaterial({ color: '#dff6ff', transparent: true, opacity: 0.55, toneMapped: false }));
  g.add(edges);
  const inner = new THREE.Mesh(new THREE.PlaneGeometry(W * 0.94, H * 0.96), new THREE.MeshStandardMaterial({ color: '#1a2230', roughness: 0.6, metalness: 0.2 }));
  inner.position.z = -0.012; g.add(inner);
  const map = new THREE.Texture(img); map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 4; map.needsUpdate = true;
  const mat = (m) => new THREE.MeshStandardMaterial({ map: m, roughness: 0.38, metalness: 0.05, envMapIntensity: 0.6, emissive: '#ffffff', emissiveMap: m, emissiveIntensity: 0.18 });
  if (item.slabPhoto) {   // the real slab's photo fills the case
    const a = img.width / img.height, h = H * 0.95, w = Math.min(W * 0.95, h * a);
    const p = new THREE.Mesh(new THREE.PlaneGeometry(w, w / a), mat(map)); p.position.z = 0.002; g.add(p);
  } else {
    const lbl = new THREE.CanvasTexture(labelCanvas(item)); lbl.colorSpace = THREE.SRGBColorSpace; lbl.anisotropy = 4;
    const L = new THREE.Mesh(new THREE.PlaneGeometry(W * 0.88, W * 0.88 * 190 / 600), mat(lbl)); L.position.set(0, H / 2 - 0.2, 0.002); g.add(L);
    const cw = W * 0.8, ch = cw * 4 / 3;
    const frame = new THREE.Mesh(new THREE.PlaneGeometry(cw + 0.04, ch + 0.04), new THREE.MeshStandardMaterial({ color: item.color || '#c9d3e0', roughness: 0.3, metalness: 0.6, emissive: item.color || '#000', emissiveIntensity: 0.25 }));
    frame.position.set(0, -0.2, 0.001); g.add(frame);
    const card = new THREE.Mesh(new THREE.PlaneGeometry(cw, ch), mat(map)); card.position.set(0, -0.2, 0.003); g.add(card);
  }
  // back: vault seal
  const back = new THREE.Mesh(new THREE.PlaneGeometry(W * 0.92, H * 0.94), new THREE.MeshStandardMaterial({ map: tex(256, 416, (q, w, h) => {
    q.fillStyle = '#121822'; q.fillRect(0, 0, w, h); q.strokeStyle = '#7cff3d'; q.lineWidth = 4; q.strokeRect(14, 14, w - 28, h - 28);
    q.fillStyle = '#7cff3d'; q.textAlign = 'center'; q.font = '800 34px Rajdhani, sans-serif'; q.fillText('BAGVERSE', w / 2, h / 2 - 10);
    q.fillStyle = '#9aa6b8'; q.font = '600 18px Rajdhani, sans-serif'; q.fillText('VAULTED COLLECTIBLE', w / 2, h / 2 + 20);
    q.font = '600 14px "Courier New", monospace'; q.fillText(item.cert || '', w / 2, h - 40);
  }), roughness: 0.5 }));
  back.rotation.y = Math.PI; back.position.z = -0.03; g.add(back);
  g.userData.dispose = () => g.traverse((o) => { o.geometry?.dispose(); const m = o.material; if (m) { m.map?.dispose(); m.dispose(); } });
  return g;
}

/** load an image (data URL / bundled URL) once */
const cache = new Map();
export function loadImage(src) {
  if (!cache.has(src)) cache.set(src, new Promise((res, rej) => { const i = new Image(); if (/^https?:/.test(src)) i.crossOrigin = 'anonymous'; i.onload = () => res(i); i.onerror = rej; i.src = src; }));
  return cache.get(src);
}

/** plain card art when the real image can't be loaded */
export function placeholderArt(name = '') {
  const c = document.createElement('canvas'); c.width = 300; c.height = 400; const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 300, 400); gr.addColorStop(0, '#3b1a5e'); gr.addColorStop(1, '#0c1420'); g.fillStyle = gr; g.fillRect(0, 0, 300, 400);
  g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 6; g.strokeRect(18, 18, 264, 364);
  g.fillStyle = '#fff'; g.textAlign = 'center'; g.font = '700 28px Rajdhani, sans-serif'; g.fillText(String(name).slice(0, 18).toUpperCase(), 150, 210);
  return c.toDataURL('image/png');
}
