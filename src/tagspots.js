// Spray Spots: the walls players can tag with their X handle, and the rules (shared by the game and api/tag.js, so
// the server enforces exactly what the game shows). Spot walls were found by tools/find_tag_spots.mjs:
// a flat collider wall facing open, walkable ground, away from doors, portals, kiosks and rentable screens.
// x/y/z = centre of the tag on the wall, nx/nz = the wall's outward normal. Never renumber an id: tags are stored by id.
export const TAG_SPOTS = [
  { id: 'bag_square_1', zone: 'bag_square', x: -2.2, y: 2.36, z: 7.58, nx: 0.905, nz: 0.425 },
  { id: 'ad_canyon_1', zone: 'ad_canyon', x: -54, y: 1.91, z: -20.37, nx: -1, nz: 0 },
  { id: 'arcade_1', zone: 'arcade', x: -150.14, y: 1.91, z: 21, nx: 0, nz: -1 },
  { id: 'arcade_2', zone: 'arcade', x: -149.56, y: 1.91, z: -21.29, nx: 0, nz: 1 },
  { id: 'gm_gate_1', zone: 'gm_gate', x: 0.3, y: 2.51, z: 149.02, nx: 0, nz: -1 },
  { id: 'gm_gate_2', zone: 'gm_gate', x: 23.84, y: 1.91, z: 140.81, nx: -1, nz: 0 },
  { id: 'copium_1', zone: 'copium', x: 149.95, y: 1.91, z: 20, nx: 0, nz: -1 },
  { id: 'copium_2', zone: 'copium', x: 151.57, y: 1.91, z: -19.99, nx: 0, nz: 1 },
  { id: 'hodl_heights_1', zone: 'hodl_heights', x: 15.99, y: 1.91, z: -144.47, nx: -1, nz: 0 },
  { id: 'hodl_heights_2', zone: 'hodl_heights', x: -16, y: 1.91, z: -156.54, nx: 1, nz: 0 },
  { id: 'rekt_1', zone: 'rekt', x: 145.84, y: 1.91, z: -151.82, nx: 0.725, nz: -0.688 },
  { id: 'rekt_2', zone: 'rekt', x: 131.73, y: 1.91, z: -163.53, nx: -0.617, nz: 0.787 },
  { id: 'bull_run_2', zone: 'bull_run', x: 131.81, y: 1.91, z: 160.64, nx: -0.606, nz: -0.796 },
  { id: 'doge_park_1', zone: 'doge_park', x: -137.41, y: 1.91, z: -158.85, nx: 0.622, nz: 0.783 },
  { id: 'doge_park_2', zone: 'doge_park', x: -162.99, y: 1.91, z: -137.84, nx: 0.593, nz: -0.805 },
  { id: 'swamp_1', zone: 'swamp', x: -124.85, y: 1.91, z: 92.99, nx: 0, nz: 1 },
  { id: 'swamp_2', zone: 'swamp', x: -148.31, y: 1.91, z: 149.4, nx: 0.692, nz: -0.722 },
];
export const spotById = (id) => TAG_SPOTS.find((s) => s.id === id) || null;

export const TAG_RULES = {
  minLevel: 5,          // tagging opens at level 5 (and needs Sign in with X)
  fadeH: 72,            // a tag fades out 72 h after it was sprayed or last touched up; then the wall is free
  lockMin: 10,          // a fresh tag can't be sprayed over for 10 minutes
  cooldownMin: 5,       // one spray per player every 5 minutes
  maxHeld: 3,           // a player holds at most 3 walls at a time
  touchH: 24,           // the owner can touch up (reset the fade) once every 24 h, in person
  hideAt: 3,            // 3 reports from different players hide a tag until an admin looks at it
  reach: 7,             // metres from the wall you must stand to spray
};

// tag styles: presets only (no free text). f = font, c = colour
export const TAG_FONTS = [
  { id: 'hand', name: 'Handstyle', family: 'Sedgwick Ave Display' },
  { id: 'marker', name: 'Marker', family: 'Permanent Marker' },
  { id: 'block', name: 'Block', family: 'Bungee' },
  { id: 'drip', name: 'Drip', family: 'Rubik Wet Paint' },
];
export const TAG_COLORS = ['#7cff3d', '#ff3dd2', '#3de8ff', '#ffc83d', '#ff5a3d', '#b84dff', '#ffffff', '#111111'];
export const cleanStyle = (s) => ({ f: TAG_FONTS.some((x) => x.id === s?.f) ? s.f : 'hand', c: Math.max(0, Math.min(TAG_COLORS.length - 1, s?.c | 0)) });

/** a stored tag's state at time `now`: { live, fade (1 fresh -> 0 gone), locked, lockLeftMs } */
export function tagState(t, now = Date.now()) {
  if (!t || t.hidden) return { live: false, fade: 0, locked: false, lockLeftMs: 0 };
  const age = now - Date.parse(t.touched_at), left = TAG_RULES.fadeH * 3600e3 - age;
  if (!(left > 0)) return { live: false, fade: 0, locked: false, lockLeftMs: 0 };
  const lockLeftMs = Math.max(0, TAG_RULES.lockMin * 60e3 - (now - Date.parse(t.sprayed_at)));
  return { live: true, fade: Math.min(1, left / (TAG_RULES.fadeH * 3600e3)), locked: lockLeftMs > 0, lockLeftMs };
}
