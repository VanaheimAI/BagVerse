// Build-time LYGIA resolver: `import src from './x.glsl'` returns the shader as a string with every
// `#include "lygia/..."` (and relative include) inlined from node_modules/lygia, each file once.
// Same include syntax as https://lygia.xyz/resolve.esm.js, but it needs no network at runtime,
// so it also works on hosts that block third-party fetches (e.g. claude.ai artifacts).
import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const LYGIA = resolve(dirname(fileURLToPath(import.meta.url)), '../node_modules/lygia');
const NOTICE = '// LYGIA Shader Library - Contributor: Patricio Gonzalez Vivo - Source: https://github.com/patriciogonzalezvivo/lygia\n// Licensed under the Prosperity Public License 3.0.0 or the LYGIA Patron License (see LICENSES/lygia.md)\n';
const INCLUDE = /^[ \t]*#include[ \t]+"([^"]+)"[ \t]*;?[^\n]*$/gm;   // quoted only: three's <chunks> are left alone

function inline(file, seen, deps) {
  if (seen.has(file)) return '';
  seen.add(file); deps.add(file);
  const src = readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')   // strip the license/doc headers (kept in node_modules/lygia/LICENSE.md)
    .replace(/\/\/.*$/gm, '');
  return src.replace(INCLUDE, (line, path) => {
    if (path.startsWith('lygia/')) return inline(resolve(LYGIA, path.slice(6)), seen, deps);
    return inline(resolve(dirname(file), path), seen, deps);
  }).replace(/\n\s*\n+/g, '\n');
}

export function lygia() {
  return {
    name: 'lygia-resolve',
    enforce: 'pre',
    load(id) {
      if (!/\.(glsl|vert|frag)$/.test(id.split('?')[0])) return null;
      const deps = new Set();
      let code = inline(id.split('?')[0], new Set(), deps);
      // license notice travels with the shader (Prosperity 3.0.0 / Patron, see LICENSES/lygia.md)
      if ([...deps].some((d) => d.startsWith(LYGIA))) code = NOTICE + code;
      for (const d of deps) this.addWatchFile(d);
      return `export default ${JSON.stringify(code)};`;
    },
  };
}
