// Spray Spots: the walls players can tag with their X handle, and the rules (shared by the game and api/tag.js, so
// the server enforces exactly what the game shows). Spot walls were found by tools/find_tag_spots.mjs:
// a flat collider wall (that is also visible geometry) facing open, walkable ground, away from doors, portals, kiosks
// and rentable screens.
// x/y/z = centre of the tag on the wall, nx/nz = the wall's outward normal. Never renumber an id: tags are stored by id.
export const TAG_SPOTS = [
  { id: 'ad_canyon_1', zone: 'ad_canyon', x: -54, y: 1.91, z: -19.96, nx: -1, nz: 0 },
  { id: 'arcade_1', zone: 'arcade', x: -150.14, y: 1.91, z: 21, nx: 0, nz: -1 },
  { id: 'arcade_2', zone: 'arcade', x: -166.48, y: 1.91, z: 21.3, nx: 0, nz: -1 },
  { id: 'arcade_3', zone: 'arcade', x: -133.5, y: 1.91, z: 21.3, nx: 0, nz: -1 },
  { id: 'gm_gate_2', zone: 'gm_gate', x: 22, y: 1.91, z: 162.1, nx: -1, nz: 0 },
  { id: 'gm_gate_3', zone: 'gm_gate', x: 16.87, y: 1.91, z: 104.14, nx: -1, nz: 0 },
  { id: 'copium_1', zone: 'copium', x: 149.95, y: 1.91, z: 20, nx: 0, nz: -1 },
  { id: 'copium_2', zone: 'copium', x: 151.57, y: 1.91, z: -19.99, nx: 0, nz: 1 },
  { id: 'copium_3', zone: 'copium', x: 135.24, y: 1.91, z: -19.99, nx: 0, nz: 1 },
  { id: 'hodl_heights_1', zone: 'hodl_heights', x: 15.99, y: 1.91, z: -144.47, nx: -1, nz: 0 },
  { id: 'hodl_heights_2', zone: 'hodl_heights', x: -16, y: 1.91, z: -156.54, nx: 1, nz: 0 },
  { id: 'hodl_heights_3', zone: 'hodl_heights', x: -16, y: 1.91, z: -140.02, nx: 1, nz: 0 },
  { id: 'rekt_1', zone: 'rekt', x: 138.03, y: 1.91, z: -158.59, nx: -0.617, nz: 0.787 },
  { id: 'rekt_2', zone: 'rekt', x: 150.02, y: 1.91, z: -147.43, nx: -0.725, nz: 0.688 },
  { id: 'rekt_3', zone: 'rekt', x: 158.94, y: 1.91, z: -130.95, nx: -0.791, nz: 0.611 },
  { id: 'doge_park_1', zone: 'doge_park', x: -137.07, y: 1.91, z: -159.12, nx: 0.622, nz: 0.783 },
  { id: 'doge_park_2', zone: 'doge_park', x: -163.42, y: 1.91, z: -138.16, nx: 0.593, nz: -0.805 },
  { id: 'doge_park_3', zone: 'doge_park', x: -154.32, y: 1.91, z: -154.68, nx: 0.702, nz: 0.713 },
  { id: 'swamp_1', zone: 'swamp', x: -124.85, y: 1.91, z: 92.99, nx: 0, nz: 1 },
  { id: 'swamp_2', zone: 'swamp', x: -148.31, y: 1.91, z: 149.4, nx: 0.692, nz: -0.722 },
  { id: 'swamp_3', zone: 'swamp', x: -162.26, y: 1.91, z: 127.7, nx: 0.806, nz: -0.592 },
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
