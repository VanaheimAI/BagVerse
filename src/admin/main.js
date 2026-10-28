// BagVerse admin dashboard (/admin): sign in with the admin wallet, then manage raffles, pick winners, browse
// players and handle billboard ad bookings. Talks only to /api/admin (server checks the admin token on every call).
import '@fontsource/rajdhani/latin-500.css';
import '@fontsource/rajdhani/latin-600.css';
import '@fontsource/rajdhani/latin-700.css';
import '@fontsource/permanent-marker/latin-400.css';
import './admin.css';
import { getWallets } from '@wallet-standard/app';
import { ADMIN_WALLET, TREASURY } from '../treasury.js';
import { buildRefundTx } from './refund-tx.js';
import { ISSUERS } from '../chains.js';

const $ = (s, el = document) => el.querySelector(s);
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const short = (a) => (a ? a.slice(0, 4) + '…' + a.slice(-4) : '—');
const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const b58 = (bytes) => { let z = 0; while (z < bytes.length && !bytes[z]) z++; const d = []; for (const x of bytes) { let c = x; for (let i = 0; i < d.length; i++) { c += d[i] * 256; d[i] = c % 58; c = (c / 58) | 0; } while (c) { d.push(c % 58); c = (c / 58) | 0; } } return '1'.repeat(z) + d.reverse().map((x) => B58[x]).join(''); };
const fmt = (iso) => (iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—');
const utc = (iso) => (iso ? new Date(iso).toUTCString().slice(5, 22) + ' UTC' : '');
const ago = (iso) => { if (!iso) return '—'; const s = (Date.now() - Date.parse(iso)) / 1000; return s < 60 ? 'just now' : s < 3600 ? `${Math.floor(s / 60)} min ago` : s < 86400 ? `${Math.floor(s / 3600)} h ago` : `${Math.floor(s / 86400)} d ago`; };
const toLocalInput = (d) => { const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };
const nextSunday20 = () => { const d = new Date(); d.setUTCHours(20, 0, 0, 0); d.setUTCDate(d.getUTCDate() + ((7 - d.getUTCDay()) % 7)); if (d <= new Date()) d.setUTCDate(d.getUTCDate() + 7); return d; };
const app = $('#app');
let token = sessionStorage.getItem('bv_admin') || '';
let who = sessionStorage.getItem('bv_admin_who') || '';

function toast(msg, bad = false) {
  let t = $('.toast'); if (!t) { t = document.createElement('div'); t.className = 'toast'; document.body.appendChild(t); }
  t.textContent = msg; t.style.borderColor = bad ? 'var(--red)' : 'var(--lime)'; t.classList.add('show'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 2600);
}
async function api(op, body = null) {
  const r = await fetch('/api/admin?op=' + op, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({ error: 'Server error (' + r.status + ')' }));
  if (r.status === 401 && op !== 'login') { signOut(); throw new Error('Session expired. Sign in again.'); }
  if (!r.ok && r.status !== 202) throw new Error(j.error || 'Request failed');
  return j;
}
function signOut() { token = ''; who = ''; sessionStorage.removeItem('bv_admin'); sessionStorage.removeItem('bv_admin_who'); renderLogin(); }

// ------------------------------------------------------------------ sign-in
function renderLogin(err = '') {
  const ws = getWallets().get().filter((w) => w.chains?.some((c) => c.startsWith('solana:')) && w.features?.['standard:connect'] && w.features?.['solana:signMessage']);
  app.innerHTML = `<div class="login"><div class="card">
    <div class="logo">BAGVERSE</div><h2 style="margin-top:8px">ADMIN</h2>
    <p class="hint">Sign in with the admin wallet <span class="mono">${short(ADMIN_WALLET)}</span>. You'll sign a free message (no transaction).</p>
    <div class="wlist">${ws.length ? ws.map((w, i) => `<button class="wbtn" data-i="${i}"><img src="${esc(w.icon)}" alt="">${esc(w.name)}</button>`).join('') : '<p class="hint">No Solana wallet found in this browser. Install Phantom, Solflare or Backpack, then reload.</p>'}</div>
    <p class="err">${esc(err)}</p></div></div>`;
  app.querySelectorAll('[data-i]').forEach((b) => (b.onclick = () => signIn(ws[+b.dataset.i])));
}
getWallets().on('register', () => { if (!token) renderLogin(); });
async function signIn(w) {
  try {
    const { accounts } = await w.features['standard:connect'].connect(); const acc = accounts?.[0];
    if (!acc) throw new Error('The wallet returned no account.');
    if (acc.address !== ADMIN_WALLET) throw new Error(`That's ${short(acc.address)}. Switch your wallet to the admin account ${short(ADMIN_WALLET)}.`);
    const message = `BagVerse admin sign-in\nDomain: ${location.host}\nWallet: ${acc.address}\nIssued At: ${new Date().toISOString()}\nNonce: ${b58(crypto.getRandomValues(new Uint8Array(12)))}`;
    const [res] = await w.features['solana:signMessage'].signMessage({ account: acc, message: new TextEncoder().encode(message) });
    token = ''; const j = await api('login', { address: acc.address, message, signature: b58(res.signature) });
    token = j.token; who = acc.address; sessionStorage.setItem('bv_admin', token); sessionStorage.setItem('bv_admin_who', who);
    renderShell();
  } catch (e) { renderLogin(/reject|cancel|denied/i.test(e.message) ? 'Request cancelled in the wallet.' : e.message); }
}

// ------------------------------------------------------------------ shell
let tab = 'raffles', cache = { raffles: [], players: [], ads: [] };
async function renderShell() {
  app.innerHTML = `<div class="wrap">
    <header class="top"><div class="logo">BAGVERSE</div><h1>ADMIN</h1><div class="chips" id="chips"></div><span class="sp"></span>
      <span class="who">${short(who)}</span><a class="btn sm" href="/" target="_blank">OPEN GAME ↗</a><button class="btn sm" id="out">SIGN OUT</button></header>
    <div id="banner"></div>
    <nav class="tabs">${[['raffles', 'RAFFLES'], ['entries', 'ENTRIES & WINNERS'], ['players', 'PLAYERS'], ['ads', 'ADS'], ['tags', 'TAGS']].map(([k, l]) => `<button data-t="${k}" class="${tab === k ? 'on' : ''}">${l}</button>`).join('')}</nav>
    <main id="main"></main></div>`;
  $('#out').onclick = signOut;
  app.querySelectorAll('[data-t]').forEach((b) => (b.onclick = () => { tab = b.dataset.t; app.querySelectorAll('[data-t]').forEach((x) => x.classList.toggle('on', x === b)); show(); }));
  overview(); show();
}
async function overview() {
  try {
    const o = await api('overview');
    $('#chips').innerHTML = [['RAFFLES', o.raffles], ['ENTRIES', o.entries], ['PLAYERS', o.players], ['WALLETS', o.wallets], ['ADS', o.ads]].map(([k, v]) => `<span class="chip">${k}<b>${v ?? '–'}</b></span>`).join('');
    $('#banner').innerHTML = o.missing ? `<div class="banner"><b>Database tables missing.</b> Run the "vault raffles + ad bookings" block of <span class="mono">supabase/schema.sql</span> in Supabase (SQL Editor → New query → Run), then reload.</div>` : '';
  } catch (e) { toast(e.message, true); }
}
function show() { ({ raffles: showRaffles, entries: showEntries, players: showPlayers, ads: showAds, tags: showTags })[tab](); }

// ------------------------------------------------------------------ Spray Spots (X-handle tags on walls)
async function showTags() {
  const main = $('#main');
  main.innerHTML = `<section class="card"><h2>TAGS</h2><p class="hint">Players' X handles sprayed on walls. 3 reports hide a tag automatically; restore it if it's fine, or clear the wall.</p><div id="tbody"><p class="empty">Loading…</p></div></section>
    <section class="card"><h2>RECENT</h2><div id="tlog"></div></section>`;
  let d; try { d = await api('tags'); } catch (e) { $('#tbody').innerHTML = `<p class="err">${esc(e.message)}</p>`; return; }
  $('#tbody').innerHTML = `<div class="tablewrap"><table><thead><tr><th>WALL</th><th>TAG</th><th>SPRAYED</th><th>REPORTS</th><th>STATUS</th><th></th></tr></thead><tbody>
    ${d.tags.map((t) => `<tr><td class="mono">${esc(t.spot)}</td><td>${t.avatar ? `<img src="${esc(t.avatar)}" referrerpolicy="no-referrer" style="width:28px;height:28px;border-radius:50%;vertical-align:middle;margin-right:8px">` : ''}<a href="https://x.com/${esc(t.handle)}" target="_blank" rel="noopener">@${esc(t.handle)}</a></td>
      <td>${ago(t.sprayed_at)}</td><td>${t.reports ? `<b style="color:var(--red)">${t.reports}</b>` : 0}</td><td>${t.hidden ? '<b style="color:var(--red)">HIDDEN</b>' : 'live'}</td>
      <td class="split"><button class="btn sm" data-hide="${esc(t.spot)}" data-v="${t.hidden ? '' : '1'}">${t.hidden ? 'RESTORE' : 'HIDE'}</button><button class="btn sm" data-clear="${esc(t.spot)}">CLEAR WALL</button></td></tr>`).join('') || '<tr><td colspan="6" class="empty">No tags yet.</td></tr>'}</tbody></table></div>`;
  $('#tlog').innerHTML = (d.log || []).map((l) => `<p class="hint">${ago(l.at)} · <b>@${esc(l.handle || '?')}</b> ${esc(l.kind)} <span class="mono">${esc(l.spot)}</span>${l.prev_handle ? ` over @${esc(l.prev_handle)}` : ''}</p>`).join('') || '<p class="empty">Nothing yet.</p>';
  main.querySelectorAll('[data-hide]').forEach((b) => (b.onclick = async () => { try { await api('tag_hide', { spot: b.dataset.hide, hidden: !!b.dataset.v }); toast('Saved'); showTags(); } catch (e) { toast(e.message, true); } }));
  main.querySelectorAll('[data-clear]').forEach((b) => (b.onclick = async () => { if (!confirm(`Clear the wall ${b.dataset.clear}?`)) return; try { await api('tag_clear', { spot: b.dataset.clear }); toast('Wall cleared'); showTags(); } catch (e) { toast(e.message, true); } }));
}

// ------------------------------------------------------------------ raffles
let editing = null;
async function showRaffles() {
  const main = $('#main');
  main.innerHTML = `<div class="grid2"><section class="card"><div class="split" style="justify-content:space-between"><h2>RAFFLES</h2><button class="btn sm" id="rnew">+ NEW RAFFLE</button></div><div id="rlist"><p class="empty">Loading…</p></div></section>
    <section class="card" id="rform"></section></div>`;
  $('#rnew').onclick = () => { editing = null; form(); };
  form();
  try { cache.raffles = (await api('raffles')).raffles; } catch (e) { $('#rlist').innerHTML = `<p class="err">${esc(e.message)}</p>`; return; }
  listRaffles();
}
function listRaffles() {
  const el = $('#rlist'); if (!el) return;
  if (!cache.raffles.length) { el.innerHTML = '<p class="empty">No raffles yet. Create the first one on the right.</p>'; return; }
  el.innerHTML = cache.raffles.map((r) => { const p = r.prize || {};
    return `<div class="rf">${p.image ? `<img src="${esc(p.image)}" alt="">` : '<div class="ph">?</div>'}
      <div><div><span class="vt ${r.vault}">${r.vault.toUpperCase()}</span> <span class="st ${r.status}">${r.status.toUpperCase()}</span>${p.chain === 'polygon' ? ' <span class="st paid">COURTYARD · POLYGON</span>' : p.mint ? ' <span class="st ended">COLLECTOR CRYPT · SOLANA</span>' : ''}</div>
        <div class="t">${esc(p.name)}${p.grade ? ` · ${esc(p.grader || '')} ${esc(p.grade)}` : ''}${p.model ? ' <span class="st paid">3D</span>' : ''}${p.slot ? ` <span class="st ended">SPOT ${p.slot}</span>` : ''}</div>
        <div class="m">Draw ${fmt(r.draws_at)} <span class="mono">(${utc(r.draws_at)})</span> · ${r.entries | 0} entries · LV ${r.min_level}+</div>
        ${r.winner_name ? `<div class="m">Winner: <b style="color:var(--gold)">${esc(r.winner_name)}</b> · <span class="mono">${short(r.winner_address)}</span> · ${esc(r.proof?.method || '')}</div>` : ''}</div>
      <div class="acts">${r.status === 'open' ? `<button class="btn sm" data-edit="${r.id}">EDIT</button>` : ''}<button class="btn sm" data-ent="${r.id}">ENTRIES</button>
        ${r.status === 'open' ? `<button class="btn sm warn" data-cancel="${r.id}">CANCEL</button>` : `<button class="btn sm" data-reopen="${r.id}">REOPEN</button>`}</div></div>`; }).join('');
  el.querySelectorAll('[data-edit]').forEach((b) => (b.onclick = () => { editing = cache.raffles.find((r) => r.id === b.dataset.edit); form(); }));
  el.querySelectorAll('[data-ent]').forEach((b) => (b.onclick = () => { entriesFor = b.dataset.ent; tab = 'entries'; app.querySelectorAll('[data-t]').forEach((x) => x.classList.toggle('on', x.dataset.t === 'entries')); show(); }));
  el.querySelectorAll('[data-cancel]').forEach((b) => (b.onclick = async () => { if (!confirm('Cancel this raffle? Players can no longer enter.')) return; try { await api('cancel_raffle', { id: b.dataset.cancel }); toast('Raffle cancelled'); showRaffles(); } catch (e) { toast(e.message, true); } }));
  el.querySelectorAll('[data-reopen]').forEach((b) => (b.onclick = () => reopen(b.dataset.reopen)));
}
async function reopen(id) {
  const when = prompt('Reopen with a new draw time (your local time, YYYY-MM-DD HH:MM). This clears the winner.', toLocalInput(nextSunday20()).replace('T', ' '));
  if (!when) return;
  try { await api('reopen', { raffle_id: id, draws_at: new Date(when.replace(' ', 'T')).toISOString() }); toast('Raffle reopened'); show(); } catch (e) { toast(e.message, true); }
}
function form() {
  const r = editing, p = r?.prize || {}, el = $('#rform');
  el.innerHTML = `<h2>${r ? 'EDIT RAFFLE' : 'NEW RAFFLE'}</h2>
    <div class="row2"><label class="f"><span>VAULT</span><select id="fv"><option value="wano">Wano Vault · One Piece</option><option value="kanto">Kanto Vault · Pokémon</option></select></label>
      <label class="f"><span>MIN LEVEL</span><input id="fl" type="number" min="0" max="999"></label></div>
    <label class="f"><span>PRIZE NAME *</span><input id="fn" placeholder="e.g. Monkey D. Luffy" maxlength="120"></label>
    <label class="f"><span>SET / NUMBER</span><input id="fs" placeholder="e.g. One Piece OP13 · Carrying on His Will #118"></label>
    <div class="row3"><label class="f"><span>GRADER</span><select id="fg">${['PSA', 'CGC', 'BGS', 'TAG', 'SGC', ''].map((g) => `<option value="${g}">${g || 'Ungraded'}</option>`).join('')}</select></label>
      <label class="f"><span>GRADE</span><input id="fgr" placeholder="10"></label><label class="f"><span>VARIANT</span><input id="fva" placeholder="Alternate Art"></label></div>
    <label class="f"><span>WHERE THE SLAB LIVES</span><select id="fch"><option value="solana">Collector Crypt · Solana</option><option value="polygon">Courtyard · Polygon</option><option value="none">Not tokenized / other</option></select></label>
    <div class="row2" id="fsol"><label class="f"><span>CERT #</span><input id="fc"></label><label class="f"><span>MINT (SOLANA)</span><input id="fm" class="mono" placeholder="Solana mint address"></label></div>
    <div id="fpoly" hidden><div class="row2"><label class="f"><span>CERT #</span><input id="fc2"></label><label class="f"><span>TOKEN ID (POLYGON)</span><input id="ft" class="mono" placeholder="e.g. 58251309559212678585…"></label></div>
      <label class="f"><span>CONTRACT (POLYGON)</span><input id="fct" class="mono"></label><p class="hint">Only the winner is asked to link a Polygon wallet, to receive the slab.</p></div>
    <label class="f"><span>CARD LINK</span><input id="fu" placeholder="https://collectorcrypt.com/… or https://courtyard.io/…"></label>
    <label class="f"><span>IMAGE</span><div class="split"><input id="fi" placeholder="https://… or upload" style="flex:1"><label class="btn sm" style="margin:0">UPLOAD<input id="ff" type="file" accept="image/*" hidden></label></div>
      <div class="preview" id="fp"></div></label>
    <div class="row2"><label class="f"><span>3D MODEL (GLB) · SHOWN FLOATING AT THE VAULT</span><div class="split"><input id="fglb" placeholder="https://….glb or upload" style="flex:1"><label class="btn sm" style="margin:0">UPLOAD GLB<input id="fgf" type="file" accept=".glb,model/gltf-binary" hidden></label></div>
        <span class="hint" id="fglbh">Empty = a placeholder booster pack.</span></label>
      <label class="f"><span>SHOWCASE SPOT</span><select id="fslot"><option value="">Auto</option><option value="1">1 · left</option><option value="2">2 · middle</option><option value="3">3 · right</option></select></label></div>
    <label class="f"><span>DRAW TIME (YOUR LOCAL TIME)</span><input id="fd" type="datetime-local"><span class="hint" id="fdu"></span></label>
    <div class="split" style="margin-top:12px"><button class="btn go" id="fsave">${r ? 'SAVE CHANGES' : 'CREATE RAFFLE'}</button>${r ? '<button class="btn" id="fclear">NEW INSTEAD</button>' : ''}<span id="fmsg"></span></div>`;
  $('#fv').value = r?.vault || 'wano'; $('#fl').value = r ? r.min_level : 25; $('#fn').value = p.name || ''; $('#fs').value = p.set || ''; $('#fg').value = p.grader ?? 'PSA';
  $('#fgr').value = p.grade || ''; $('#fva').value = p.variant || ''; $('#fc').value = $('#fc2').value = p.cert || ''; $('#fm').value = p.mint || ''; $('#fu').value = p.url || ''; $('#fi').value = p.image || '';
  $('#fch').value = p.chain === 'polygon' ? 'polygon' : r && !p.mint && p.chain !== 'solana' ? 'none' : 'solana'; $('#ft').value = p.token_id || ''; $('#fct').value = p.contract || ISSUERS.courtyard.contract;
  const chainUi = () => { const c = $('#fch').value; $('#fsol').hidden = c === 'polygon'; $('#fpoly').hidden = c !== 'polygon'; $('#fm').closest('label').hidden = c !== 'solana'; };
  $('#fch').onchange = chainUi; chainUi();
  $('#fd').value = toLocalInput(r ? new Date(r.draws_at) : nextSunday20());
  $('#fglb').value = p.model || ''; $('#fslot').value = p.slot ? String(p.slot) : '';
  const glbHint = () => { const u = $('#fglb').value.trim(); $('#fglbh').innerHTML = /^https:\/\/.+/.test(u) ? `3D model set · <a href="${esc(u)}" target="_blank" rel="noopener">download</a>` : 'Empty = a placeholder booster pack.'; };
  $('#fglb').oninput = glbHint; glbHint();
  $('#fgf').onchange = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    if (file.size > 3e6) { $('#fmsg').innerHTML = '<span class="err">The GLB must be under 3 MB.</span>'; return; }
    $('#fmsg').innerHTML = '<span class="hint">Uploading model…</span>';
    try { const data = await new Promise((ok, bad) => { const fr = new FileReader(); fr.onload = () => ok(String(fr.result).split(',')[1]); fr.onerror = () => bad(new Error('Could not read the file.')); fr.readAsDataURL(file); });
      const j = await api('upload', { name: file.name, type: 'model/gltf-binary', data }); $('#fglb').value = j.url; glbHint(); $('#fmsg').innerHTML = '<span class="ok">3D model uploaded</span>'; }
    catch (err) { $('#fmsg').innerHTML = `<span class="err">${esc(err.message)}</span>`; }
  };
  const showUtc = () => { const d = new Date($('#fd').value); $('#fdu').textContent = isFinite(d) ? `= ${d.toUTCString().slice(0, 22)} UTC · players see a countdown` : ''; };
  const showImg = () => { const u = $('#fi').value.trim(); $('#fp').innerHTML = /^https:\/\//.test(u) ? `<img src="${esc(u)}" alt=""><span class="hint">Preview</span>` : ''; };
  $('#fd').oninput = showUtc; $('#fi').oninput = showImg; showUtc(); showImg();
  $('#fv').onchange = () => { if (!r) $('#fl').value = $('#fv').value === 'kanto' ? 100 : 25; };
  if ($('#fclear')) $('#fclear').onclick = () => { editing = null; form(); };
  $('#ff').onchange = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    $('#fmsg').innerHTML = '<span class="hint">Uploading…</span>';
    try { const { data, type } = await shrink(file); const j = await api('upload', { name: file.name, type, data }); $('#fi').value = j.url; showImg(); $('#fmsg').innerHTML = '<span class="ok">Image uploaded</span>'; }
    catch (err) { $('#fmsg').innerHTML = `<span class="err">${esc(err.message)}</span>`; }
  };
  $('#fsave').onclick = async () => {
    const body = { id: r?.id, vault: $('#fv').value, min_level: +$('#fl').value || 0, draws_at: new Date($('#fd').value).toISOString(),
      prize: { name: $('#fn').value, set: $('#fs').value, grader: $('#fg').value, grade: $('#fgr').value, variant: $('#fva').value, url: $('#fu').value.trim(), image: $('#fi').value.trim(), model: $('#fglb').value.trim(), slot: $('#fslot').value,
        ...($('#fch').value === 'polygon' ? { chain: 'polygon', issuer: 'courtyard', cert: $('#fc2').value, contract: $('#fct').value.trim(), token_id: $('#ft').value.trim() }
          : { chain: 'solana', cert: $('#fc').value, mint: $('#fch').value === 'solana' ? $('#fm').value.trim() : '', ...($('#fch').value === 'solana' && $('#fm').value.trim() ? { issuer: 'collector_crypt' } : {}) }) } };
    try { $('#fsave').disabled = true; await api('save_raffle', body); toast(r ? 'Raffle saved' : 'Raffle created'); editing = null; showRaffles(); overview(); }
    catch (err) { $('#fmsg').innerHTML = `<span class="err">${esc(err.message)}</span>`; $('#fsave').disabled = false; }
  };
}
/** resize an image to at most 1200 px and WebP, as base64 */
function shrink(file) {
  return new Promise((res, rej) => {
    const img = new Image(); img.onerror = () => rej(new Error('Not an image.'));
    img.onload = () => { const k = Math.min(1, 1200 / Math.max(img.width, img.height)), c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); const url = c.toDataURL('image/webp', 0.88); res({ type: 'image/webp', data: url.split(',')[1] }); URL.revokeObjectURL(img.src); };
    img.src = URL.createObjectURL(file);
  });
}

// ------------------------------------------------------------------ entries & winners
let entriesFor = null;
async function showEntries() {
  const main = $('#main');
  main.innerHTML = `<section class="card"><div class="split"><h2 style="margin:0">ENTRIES & WINNERS</h2><select id="esel" style="max-width:520px"></select></div><div id="ebody"><p class="empty">Loading…</p></div></section>`;
  try { cache.raffles = (await api('raffles')).raffles; } catch (e) { $('#ebody').innerHTML = `<p class="err">${esc(e.message)}</p>`; return; }
  if (!cache.raffles.length) { $('#ebody').innerHTML = '<p class="empty">No raffles yet.</p>'; return; }
  entriesFor = cache.raffles.some((r) => r.id === entriesFor) ? entriesFor : cache.raffles[0].id;
  $('#esel').innerHTML = cache.raffles.map((r) => `<option value="${r.id}">${r.vault.toUpperCase()} · ${esc(r.prize?.name)} · ${r.status} · ${fmt(r.draws_at)}</option>`).join('');
  $('#esel').value = entriesFor; $('#esel').onchange = () => { entriesFor = $('#esel').value; loadEntries(); };
  loadEntries();
}
async function loadEntries() {
  const r = cache.raffles.find((x) => x.id === entriesFor), el = $('#ebody'); if (!r) return;
  el.innerHTML = '<p class="empty">Loading…</p>';
  let es; try { es = (await api('entries', { raffle_id: r.id })).entries; } catch (e) { el.innerHTML = `<p class="err">${esc(e.message)}</p>`; return; }
  const proof = r.proof?.blockhash ? `Drawn from <a href="https://solscan.io/block/${r.proof.slot}" target="_blank" rel="noopener">Solana block #${r.proof.slot}</a> · pick ${r.proof.pick + 1} of ${r.proof.tickets}` : r.proof?.method === 'manual' ? `Picked by admin ${short(r.proof.by)} · ${fmt(r.proof.at)}` : r.proof?.method ? r.proof.method : '';
  el.innerHTML = `<div class="split" style="margin:12px 0">
      <span class="vt ${r.vault}">${r.vault.toUpperCase()}</span><span class="st ${r.status}">${r.status.toUpperCase()}</span>
      <b>${esc(r.prize?.name)}</b><span class="hint">Draw ${fmt(r.draws_at)} · ${es.length} entries</span><span style="flex:1"></span>
      ${r.status === 'open' ? `<button class="btn" id="edraw" ${es.length ? '' : 'disabled'}>FAIR DRAW NOW</button>` : `<button class="btn" id="ereopen">REOPEN</button>`}</div>
    ${r.winner_name ? (() => { const poly = r.prize?.chain === 'polygon', pw = poly ? es.find((e) => e.user_id === r.winner_user)?.polygon : null;
      return `<div class="banner">🏆 Winner: <b>${esc(r.winner_name)}</b> · Solana <a class="mono" href="https://solscan.io/account/${esc(r.winner_address)}" target="_blank" rel="noopener">${esc(r.winner_address)}</a>
        ${poly ? `<br>Polygon wallet: ${pw ? `<a class="mono" href="https://polygonscan.com/address/${esc(pw)}" target="_blank" rel="noopener">${esc(pw)}</a> ← <b>send the Courtyard slab here</b>` : '<b style="color:var(--gold)">waiting for the winner to link one</b> (they are asked in the game)'}` : ''}
        <br><span class="hint">${proof}.${poly ? '' : ' Send the prize to this wallet.'}</span></div>`; })() : ''}
    <div class="tablewrap"><table><thead><tr><th>#</th><th>PLAYER</th><th>WALLET</th>${r.prize?.chain === 'polygon' ? '<th>POLYGON</th>' : ''}<th>LEVEL</th><th>ENTERED</th><th></th></tr></thead><tbody>
    ${es.map((e, i) => `<tr><td>${i + 1}</td><td><b>${esc(e.name || 'Player')}</b>${e.user_id === r.winner_user ? ' 🏆' : ''}</td>
      <td class="mono"><a href="https://solscan.io/account/${esc(e.address)}" target="_blank" rel="noopener">${short(e.address)}</a></td>${r.prize?.chain === 'polygon' ? `<td class="mono">${e.polygon ? `<a href="https://polygonscan.com/address/${esc(e.polygon)}" target="_blank" rel="noopener">${short(e.polygon)}</a>` : '—'}</td>` : ''}<td>${e.level ?? '—'}</td><td>${fmt(e.created_at)}</td>
      <td>${e.user_id === r.winner_user ? '<span class="ok">WINNER</span>' : `<button class="btn sm" data-win="${esc(e.user_id)}" data-name="${esc(e.name || 'Player')}">MAKE WINNER</button>`}</td></tr>`).join('') || '<tr><td colspan="6" class="empty">No entries yet.</td></tr>'}
    </tbody></table></div>`;
  el.querySelectorAll('[data-win]').forEach((b) => (b.onclick = async () => {
    if (!confirm(`Make ${b.dataset.name} the winner of "${r.prize?.name}"? This closes the raffle and shows them the win.`)) return;
    try { await api('set_winner', { raffle_id: r.id, user_id: b.dataset.win }); toast('Winner set'); showEntries(); overview(); } catch (e) { toast(e.message, true); }
  }));
  if ($('#edraw')) $('#edraw').onclick = async () => {
    if (!confirm('Draw now? The winner comes from the next Solana block hash, the same way as a scheduled draw.')) return;
    $('#edraw').disabled = true; $('#edraw').textContent = 'DRAWING…';
    for (let k = 0; k < 6; k++) {
      try { const j = await api('draw_now', { raffle_id: r.id }); if (!j.waiting) { toast('Drawn: ' + (j.raffle?.winner_name || 'no entries')); break; } } catch (e) { toast(e.message, true); break; }
      await new Promise((ok) => setTimeout(ok, 8000));
    }
    showEntries(); overview();
  };
  if ($('#ereopen')) $('#ereopen').onclick = () => reopen(r.id);
}

// ------------------------------------------------------------------ players
let psort = 'lastSeen', pdir = -1, pq = '';
async function showPlayers() {
  const main = $('#main');
  main.innerHTML = `<section class="card"><div class="split" style="justify-content:space-between"><h2 style="margin:0">PLAYERS</h2>
    <div class="split"><input id="pq" placeholder="Search name or wallet" style="width:260px"><button class="btn sm" id="pcsv">EXPORT CSV</button></div></div><div id="pbody"><p class="empty">Loading…</p></div></section>`;
  $('#pq').value = pq; $('#pq').oninput = () => { pq = $('#pq').value.toLowerCase(); tablePlayers(); };
  $('#pcsv').onclick = csv;
  try { cache.players = (await api('players')).players; } catch (e) { $('#pbody').innerHTML = `<p class="err">${esc(e.message)}</p>`; return; }
  tablePlayers();
}
const PCOLS = [['name', 'NAME'], ['level', 'LV'], ['skin', 'SKIN'], ['wallet', 'SOLANA'], ['polygon', 'POLYGON'], ['entries', 'RAFFLE ENTRIES'], ['wins', 'RAFFLE WINS'], ['bagrunBest', 'BAG RUN BEST'], ['raceWins', 'RACE WINS'], ['lastSeen', 'LAST ACTIVE']];
function tablePlayers() {
  const el = $('#pbody'); if (!el) return;
  const rows = cache.players.filter((p) => !pq || (p.name || '').toLowerCase().includes(pq) || (p.wallet || '').toLowerCase().includes(pq))
    .sort((a, b) => { const x = a[psort] ?? '', y = b[psort] ?? ''; return (typeof x === 'number' && typeof y === 'number' ? x - y : psort === 'lastSeen' ? Date.parse(x || 0) - Date.parse(y || 0) : String(x).localeCompare(String(y))) * pdir; });
  el.innerHTML = `<p class="hint">${rows.length} of ${cache.players.length} players · click a column to sort</p><div class="tablewrap"><table><thead><tr>${PCOLS.map(([k, l]) => `<th data-s="${k}">${l}${psort === k ? (pdir > 0 ? ' ▲' : ' ▼') : ''}</th>`).join('')}</tr></thead><tbody>
    ${rows.map((p) => `<tr><td><b>${esc(p.name || '(no name yet)')}</b></td><td>${p.level ?? '—'}</td><td>${esc(p.skin || '—')}</td>
      <td class="mono">${p.wallet ? `<a href="https://solscan.io/account/${esc(p.wallet)}" target="_blank" rel="noopener">${short(p.wallet)}</a> ✓` : '—'}</td>
      <td class="mono">${p.polygon ? `<a href="https://polygonscan.com/address/${esc(p.polygon)}" target="_blank" rel="noopener">${short(p.polygon)}</a>` : '—'}</td>
      <td>${p.entries}</td><td>${p.wins ? `<b style="color:var(--gold)">${p.wins}</b>` : 0}</td><td>${(p.bagrunBest || 0).toLocaleString()}</td><td>${p.raceWins || 0}</td><td title="${esc(p.lastSeen || '')}">${ago(p.lastSeen)}</td></tr>`).join('') || '<tr><td colspan="10" class="empty">No players yet.</td></tr>'}
    </tbody></table></div>`;
  el.querySelectorAll('[data-s]').forEach((th) => (th.onclick = () => { if (psort === th.dataset.s) pdir = -pdir; else { psort = th.dataset.s; pdir = -1; } tablePlayers(); }));
}
function csv() {
  const head = ['id', 'name', 'level', 'skin', 'wallet', 'polygon', 'entries', 'wins', 'bagrunBest', 'raceWins', 'lastSeen'];
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const txt = [head.join(',')].concat(cache.players.map((p) => head.map((k) => q(p[k])).join(','))).join('\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([txt], { type: 'text/csv' })); a.download = `bagverse-players-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
}

// ------------------------------------------------------------------ ads
// Players pay (Solana Pay, USDC to the treasury) and upload their own image; it goes live at once. The admin can
// pull any ad (veto), reinstate it, and refund the payment from the treasury wallet back to the account that paid.
async function showAds() {
  const main = $('#main');
  main.innerHTML = `<section class="card"><h2>BILLBOARD ADS</h2>
    <p class="hint">Players rent screens in the game: they pay with Solana Pay (USDC to the treasury <a class="mono" href="https://solscan.io/account/${TREASURY}" target="_blank" rel="noopener">${short(TREASURY)}</a>), then upload their own image, which goes live for 7 days.
    You can <b>pull</b> any ad, put it back, or <b>refund</b> the payment from this wallet.</p><div id="abody"><p class="empty">Loading…</p></div></section>`;
  try { cache.ads = (await api('ads')).ads; } catch (e) { $('#abody').innerHTML = `<p class="err">${esc(e.message)}</p>`; return; }
  const el = $('#abody'), expired = (a) => a.status === 'live' && a.ends_at && Date.parse(a.ends_at) < Date.now();
  el.innerHTML = `<div class="tablewrap"><table><thead><tr><th>CREATIVE</th><th>SCREEN</th><th>PRICE</th><th>STATUS</th><th>BY</th><th>BOOKED</th><th>PAYMENT</th><th></th></tr></thead><tbody>
    ${cache.ads.map((a) => `<tr>
      <td>${a.creative_url ? `<a href="${esc(a.creative_url)}" target="_blank" rel="noopener"><img src="${esc(a.creative_url)}" alt="" style="width:96px;height:54px;object-fit:cover;border-radius:5px;border:1px solid var(--edge)"></a>` : '<span class="hint">no image yet</span>'}</td>
      <td><b>${esc(a.slot)}</b> <span class="hint">${esc(a.tier || '')}</span><br><span class="mono hint">${esc(a.id)}</span></td><td>${a.paid_amount ?? a.amount} ${esc(a.currency)}</td>
      <td><span class="st ${expired(a) ? 'ended' : a.status}">${expired(a) ? 'ENDED' : a.status.toUpperCase()}</span>${a.status === 'live' && !expired(a) ? `<br><span class="hint">until ${fmt(a.ends_at)}</span>` : ''}${a.pulled_reason ? `<br><span class="hint">${esc(a.pulled_reason)}</span>` : ''}</td>
      <td>${esc(a.payer_name || '—')}${a.payer_address ? `<br><a class="mono" href="https://solscan.io/account/${esc(a.payer_address)}" target="_blank" rel="noopener">${short(a.payer_address)}</a>` : ''}</td><td>${fmt(a.created_at)}</td>
      <td class="mono">${a.signature ? `<a href="https://solscan.io/tx/${esc(a.signature)}" target="_blank" rel="noopener">paid ${short(a.signature)}</a>` : a.status === 'pending' ? `<button class="btn sm" data-check="${a.id}">CHECK</button>` : '—'}
        ${a.refund_signature ? `<br><a href="https://solscan.io/tx/${esc(a.refund_signature)}" target="_blank" rel="noopener">refund ${short(a.refund_signature)}</a>` : ''}</td>
      <td><div class="split">${['paid', 'live'].includes(a.status) && !expired(a) ? `<button class="btn sm warn" data-pull="${a.id}">PULL</button>` : ''}${a.status === 'pulled' ? `<button class="btn sm" data-back="${a.id}">REINSTATE</button>` : ''}
        ${a.payer_token_account && !['refunded', 'pending'].includes(a.status) ? `<button class="btn sm" data-refund="${a.id}">REFUND</button>` : ''}</div></td></tr>`).join('') || '<tr><td colspan="8" class="empty">No bookings yet. Players book from a screen in the game (E near a billboard).</td></tr>'}
    </tbody></table></div><div id="refundbox"></div>`;
  const act = (sel, fn) => el.querySelectorAll(sel).forEach((b) => (b.onclick = async () => { try { if (await fn(b) !== false) showAds(); } catch (e) { toast(e.message, true); } }));
  act('[data-check]', async (b) => { const j = await api('ad_check', { id: b.dataset.check }); toast(j.paid ? `Paid: ${j.amount} USDC` : 'No payment found yet', !j.paid); });
  act('[data-pull]', async (b) => { const reason = prompt('Pull this ad off the screen now? Reason (shown to the advertiser):', 'Breaks the ad rules'); if (reason === null) return false; await api('ad_pull', { id: b.dataset.pull, reason }); toast('Ad pulled'); });
  act('[data-back]', async (b) => { await api('ad_reinstate', { id: b.dataset.back }); toast('Ad reinstated'); });
  act('[data-refund]', async (b) => { await refund(cache.ads.find((x) => x.id === b.dataset.refund)); return false; });
}
/** send the USDC back from the treasury wallet to the token account that paid, then confirm it on-chain */
async function refund(a) {
  const box = $('#refundbox');
  const p = await api('refund_prepare', { id: a.id });
  if (!confirm(`Refund ${p.amount} USDC to ${short(p.to_owner)} for booking ${a.id}? Your wallet will ask you to approve the transfer.`)) return;
  box.innerHTML = `<div class="banner">Refunding ${p.amount} USDC… approve it in your wallet.</div>`;
  let sig = null;
  try {
    const w = getWallets().get().find((x) => x.features?.['solana:signAndSendTransaction'] && x.features?.['standard:connect']);
    if (!w) throw new Error('no-sign');
    const { accounts } = await w.features['standard:connect'].connect(); const acc = accounts.find((x) => x.address === p.from_owner);
    if (!acc) throw new Error(`Switch your wallet to the treasury account ${short(p.from_owner)}.`);
    const bytes = await buildRefundTx(p, `BagVerse refund ${a.id}`);
    const [out] = await w.features['solana:signAndSendTransaction'].signAndSendTransaction({ account: acc, chain: 'solana:mainnet', transaction: bytes });
    sig = b58(out.signature);
  } catch (e) {
    if (e.message !== 'no-sign' && !/reject|cancel|denied/i.test(e.message)) { box.innerHTML = `<div class="banner err">${esc(e.message)}</div>`; return; }
    if (/reject|cancel|denied/i.test(e.message)) { box.innerHTML = '<div class="banner">Refund cancelled in the wallet.</div>'; return; }
    // this wallet can't send transactions from the page: pay with Solana Pay and paste the signature
    box.innerHTML = `<div class="banner">Send <b>${p.amount} USDC</b> to <span class="mono">${esc(p.to_owner)}</span> from the treasury wallet${p.pay_url ? ` (<a href="${esc(p.pay_url)}">open in wallet</a>)` : ''}, then paste the transaction signature:
      <div class="split" style="margin-top:8px"><input id="rsig" class="mono" placeholder="Transaction signature" style="flex:1"><button class="btn" id="rgo">CONFIRM</button></div></div>`;
    $('#rgo').onclick = () => { sig = $('#rsig').value.trim(); if (sig) confirmRefund(a, sig); };
    return;
  }
  confirmRefund(a, sig);
}
async function confirmRefund(a, sig) {
  const box = $('#refundbox');
  for (let k = 0; k < 8; k++) {
    box.innerHTML = `<div class="banner">Refund sent (<a class="mono" href="https://solscan.io/tx/${esc(sig)}" target="_blank" rel="noopener">${short(sig)}</a>). Confirming on-chain…</div>`;
    try { const j = await api('refund_done', { id: a.id, signature: sig }); if (j.confirmed) { toast('Refund confirmed'); showAds(); return; } } catch (e) { box.innerHTML = `<div class="banner err">${esc(e.message)}</div>`; return; }
    await new Promise((r) => setTimeout(r, 5000));
  }
  box.innerHTML = `<div class="banner">Not confirmed yet. Check <a href="https://solscan.io/tx/${esc(sig)}" target="_blank" rel="noopener">the transaction</a>, then press REFUND again or paste the signature.</div>`;
}

if (token) renderShell(); else renderLogin();
