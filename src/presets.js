// Look presets (day / sunset / night): shared by the WebGL look (look.js) and the WebGPU look (look.webgpu.js).
export const PRESETS = {
  // Fortnite-style: high-key, saturated colour in the *materials*, but clean, near-neutral light (warm sun, neutral fill)
  // giChroma: how much colour the captured bounce light keeps (0 = grey bounce, 1 = full neon/grass tint)
  day: { noGI: true,   // captured bounce light tints the white city mint (plaza neon): daylight uses the neutral studio env
    char: [0.1, 0.12, '#fff6ea', '#ffffff'], wet: 0.0, giEnv: 0.6, giChroma: 0.12, surf: 0.12, stylize: 0.2, lift: [0.03, 0.028, 0.026],
    label: 'DAY', top: '#2a6fe0', horizon: '#9cc8ff', ground: '#9fb9d4',
    sun: '#fff0d2', sunI: 4.4, sunElev: 55, sunAz: 35,   /* 3/4 key light over the default camera's shoulder: lit faces + side shadows */ rim: '#fff3e2', rimI: 0.6,
    hemiSky: '#f1f4f7', hemiGround: '#dccfbf', hemiI: 1.05, env: 0.75,
    fog: '#b4d2f2', fogD: 0.0008, exposure: 0.94,
    emissive: 0.22, facade: 0.0, screens: 0.95, lamps: 0.0, gi: 0.8,
    bloom: [0.12, 0.35, 1.25], clouds: 0.9, cloudTint: '#ffffff', stars: 0.0, sat: 1.14, contrast: 1.06, vignette: 0.1, warm: 0.025, ao: 0.5,
  },
  sunset: { char: [0.35, 0.4, '#ffe2c4', '#ffb27a'], wet: 0.15, giEnv: 0.7, giChroma: 0.3, surf: 0.32, stylize: 0.4, lift: [0.045, 0.032, 0.035],
    label: 'SUNSET', top: '#4a4ad0', horizon: '#ffae7a', ground: '#c98aa8',
    sun: '#ffa45e', sunI: 4.4, sunElev: 18, sunAz: -55, rim: '#ffd6c4', rimI: 0.8,
    hemiSky: '#c9bfe0', hemiGround: '#f2c4a6', hemiI: 0.9, env: 0.6,
    fog: '#f5b39c', fogD: 0.0019, exposure: 0.98,
    emissive: 0.5, facade: 0.45, screens: 1.0, lamps: 0.35, gi: 0.7,
    bloom: [0.22, 0.4, 1.1], clouds: 0.9, cloudTint: '#ffcdb8', stars: 0.1, sat: 1.16, contrast: 1.05, vignette: 0.14, warm: 0.04, ao: 0.55,
  },
  night: { char: [0.75, 0.55, '#ffe6cc', '#9fc4ff'], wet: 0.85, giEnv: 0.7, giChroma: 0.3, surf: 0.6, stylize: 0.1, lift: [0.0, 0.012, 0.03],
    label: 'NIGHT', top: '#04060d', horizon: '#1a2032', ground: '#0a0d15',
    sun: '#b9c6e8', sunI: 0.55, sunElev: 42, sunAz: 30, rim: '#9fb4e0', rimI: 0.35,     /* cool moonlight */
    hemiSky: '#2c3854', hemiGround: '#14131a', hemiI: 0.22, env: 0.3,
    fog: '#0c111d', fogD: 0.0021, exposure: 1.05,
    emissive: 0.9, facade: 1.0, screens: 1.0, lamps: 1.0, gi: 0.45,
    bloom: [0.42, 0.5, 0.82], clouds: 0.95, cloudTint: '#56607c', stars: 0.75, sat: 1.06, contrast: 1.12, vignette: 0.32, warm: 0.035, ao: 0.7,
  },

};
export const ORDER = ['day', 'sunset', 'night'];
