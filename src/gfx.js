// Graphics backend: renderer + look (sky, lights, shadows, GI) + post stack.
// This is the WebGL build. The WebGPU build (`vite build --mode webgpu`, page /webgpu) swaps this module for
// gfx.webgpu.js, which exposes the same interface on three's WebGPURenderer + TSL.
import * as THREE from 'three';
import { EffectComposer } from 'postprocessing';
import { Look, PRESETS, ORDER } from './look.js';

export { PRESETS, ORDER };
export const BACKEND = 'webgl';

/**
 * opts: { canvas, quality, LOW, aa, pixelRatio(), look: { low, ao, csm, gi }, onLost() }
 * returns { renderer, look, composer } where composer has render(dt) and setSize(w, h)
 */
export async function createGfx(scene, camera, { canvas, quality, LOW, aa, pixelRatio, look: lookOpts, onLost }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: aa, powerPreference: 'high-performance' });
  // cap the internal resolution by total pixels: the post stack (AO, bloom mips, composer targets) scales with it
  renderer.setPixelRatio(pixelRatio());
  renderer.setSize(innerWidth, innerHeight);
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); onLost?.(); });
  const look = new Look(renderer, scene, camera, { smaa: LOW || !renderer.capabilities.isWebGL2, ...lookOpts });
  // HIGH / MEDIUM: render the post stack into a 4x MSAA half-float target (clean edges; post-processing otherwise
  // disables the canvas' own antialiasing). LOW / WebGL1: SMAA pass at the end instead.
  const MSAA = !LOW && renderer.capabilities.isWebGL2;
  const composer = new EffectComposer(renderer, { frameBufferType: THREE.HalfFloatType, multisampling: MSAA ? 4 : 0 });
  look.buildComposer(composer, { high: quality === 'high' });
  return { renderer, look, composer, backend: BACKEND };
}
