// Graphics backend, WebGPU build (`vite build --mode webgpu`, page /webgpu): three's WebGPURenderer + TSL.
// Same interface as gfx.js. Browsers without WebGPU (or ?gl2) run the same node materials on the renderer's
// WebGL2 backend.
import * as THREE from 'three';
import { Look, PRESETS, ORDER } from './look.webgpu.js';

export { PRESETS, ORDER };
export const BACKEND = 'webgpu';

export async function createGfx(scene, camera, { canvas, quality, pixelRatio, look: lookOpts, onLost, params }) {
  const forceWebGL = !!params?.has('gl2') || !navigator.gpu;
  const renderer = new THREE.WebGPURenderer({ canvas, antialias: false, powerPreference: 'high-performance', forceWebGL });
  await renderer.init();
  renderer.setPixelRatio(pixelRatio());
  renderer.setSize(innerWidth, innerHeight);
  renderer.onDeviceLost = (info) => { console.warn('GPU device lost', info?.message || info); onLost?.(); };
  // the bits of the WebGLRenderer API the game reads
  if (!renderer.capabilities) renderer.capabilities = {};
  renderer.capabilities.isWebGL2 = true;
  if (!renderer.capabilities.getMaxAnisotropy) renderer.capabilities.getMaxAnisotropy = () => (renderer.getMaxAnisotropy ? renderer.getMaxAnisotropy() : 8);
  const look = new Look(renderer, scene, camera, lookOpts);
  const composer = look.buildPipeline({ high: quality === 'high' });
  const backend = renderer.backend?.isWebGPUBackend ? 'webgpu' : 'webgpu-gl2';
  console.log('graphics:', backend);
  return { renderer, look, composer, backend };
}
