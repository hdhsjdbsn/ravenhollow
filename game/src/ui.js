'use strict';
// User interface: HUD, panels with controller focus navigation, tooltips, automap.

const UI = {
  root: null, stack: [], target: null, targetFade: 0, msgs: [], floats: [], labelsOn: false, mapMode: 0,
  identifyMode: -1, hud: null,
};
const $ = (tag, cls, parent, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; if (parent) parent.appendChild(e); return e; };
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

// controller / keyboard glyphs
function glyph(a) {
  const pad = IN.lastDevice === 'pad';
  const P = { a: 'A', b: 'B', x: 'X', y: 'Y', lb: 'LB', rb: 'RB', lt: 'LT', rt: 'RT', view: '⧉', menu: '≡', up: '▲', down: '▼', ls: 'LS', rs: 'RS' };
  const K = { a: 'Space', b: 'Bksp', x: '1', y: '2', b_skill: '3', rt: '4', lb: 'Q', rb: 'F', lt: 'T', view: 'I', menu: 'Esc', up: 'Tab', down: 'Alt', ls: 'Shift', rs: 'R', char: 'C', skills: 'K' };
  if (pad) return `<span class="gl gl-${a}">${P[a] || a}</span>`;
  return `<span class="gl gl-key">${K[a] || a}</span>`;
}

function initUI() {
  UI.root = document.getElementById('ui');
  // HUD
  const hud = $('div', 'hud', UI.root);
  UI.hud = hud;
  UI.orbL = $('canvas', 'orb orbL', hud); UI.orbR = $('canvas', 'orb orbR', hud);
  for (const c of [UI.orbL, UI.orbR]) { c.width = 180; c.height = 180; }
  UI.orbLText = $('div', 'orbText orbLText', hud); UI.orbRText = $('div', 'orbText orbRText', hud);
  const bar = $('div', 'skillbar', hud);
  UI.potL = $('div', 'pot potL', bar); UI.slotEls = [];
  for (let i = 0; i < 4; i++) { const s = $('div', 'slot pe', bar); s.dataset.i = i; s.onclick = () => { if (Game.state === 'play') heroCastSkill(WORLD.hero, WORLD.hero.slots[i]); }; UI.slotEls.push(s); }
  UI.potR = $('div', 'pot potR', bar);
  UI.potL.classList.add('pe'); UI.potR.classList.add('pe');
  UI.potL.onclick = () => { if (Game.state === 'play' && !topPanel() && WORLD.hero.alive) WORLD.hero.quickPotion('heal'); };
  UI.potR.onclick = () => { if (Game.state === 'play' && !topPanel() && WORLD.hero.alive) WORLD.hero.quickPotion('mana'); };
  // touch / mouse buttons (Diablo-style plaques), top left
  const tb = $('div', 'tbar', hud);
  const tbtn = (label, title, fn) => { const b = $('div', 'tbtn pe', tb, label); b.title = title; b.addEventListener('pointerdown', e => e.stopPropagation()); b.onclick = e => { e.stopPropagation(); if (Game.state !== 'play' || topPanel()) return; SFX.play('click'); fn(); }; return b; };
  tbtn('<span class="tic">☰</span>Menu', 'Pause menu (Esc)', () => openPause());
  tbtn('Hero', 'Inventory & character (I)', () => openHeroScreen());
  if (!window.ACTION) tbtn('Skills', 'Skills (K)', () => openSkills());
  if (!window.ACTION) tbtn('Map', 'Automap (Tab)', () => cycleMap());
  if (!window.ACTION) tbtn('Portal', 'Town Portal (T)', () => { const H = WORLD.hero; const i = H.inv.findIndex(o => o && o.base === 'scrollTP'); if (i >= 0) H.useItem(i); else { UI.msg('You have no Town Portal scrolls.', '#c06040'); SFX.play('error'); heroBark('noportal', 4); } });
  UI.xpBar = $('div', 'xpbar', hud); UI.xpFill = $('div', 'xpfill', UI.xpBar);
  UI.lvlUp = $('div', 'lvlup pe', hud); UI.lvlUp.onclick = () => openHeroScreen();
  UI.msgBox = $('div', 'msgs', UI.root);
  UI.targetBar = $('div', 'target', UI.root); UI.targetName = $('div', 'tname', UI.targetBar); UI.targetHp = $('div', 'thp', UI.targetBar); UI.targetFill = $('div', 'tfill', UI.targetHp); UI.targetMods = $('div', 'tmods', UI.targetBar);
  UI.zoneTitle = $('div', 'zoneTitle', UI.root);
  UI.prompt = $('div', 'prompt', UI.root);
  UI.labels = $('div', 'labels', UI.root);
  UI.floatLayer = $('div', 'floats', UI.root);
  UI.map = $('canvas', 'automap', document.body);
  UI.tip = $('div', 'tooltip', UI.root); UI.tip2 = $('div', 'tooltip tip2', UI.root);
  UI.panelLayer = $('div', 'panels', UI.root);
  UI.fade = $('div', 'fade', document.body);
  UI.buffs = $('div', 'buffs', UI.root);
  UI.hint = $('div', 'hint', UI.root);
  const onResize = () => { UI.map.width = window.innerWidth; UI.map.height = window.innerHeight; UI.zs = clamp(window.innerHeight / 800, 0.75, 1.8); UI.root.style.zoom = UI.zs; };
  window.addEventListener('resize', onResize); onResize();
}

// ---------------- messages / target ----------------
UI.msg = function (text, color, big, item) {
  const e = $('div', 'msg' + (big ? ' big' : ''), UI.msgBox, esc(text));
  if (color) e.style.color = color; else if (item) e.style.color = itemColor(item);
  UI.msgs.push({ e, t: big ? 6 : 4 });
  while (UI.msgs.length > 6) { const m = UI.msgs.shift(); m.e.remove(); }
};
UI.setTarget = function (m) { UI.target = m; UI.targetFade = 3; };
UI.floatText = function (x, y, z, text, color) {
  const e = $('div', 'float', UI.floatLayer, esc(text)); e.style.color = color || '#fff';
  UI.floats.push({ e, x, y, z, t: 0 });
};
UI.zone = function (title, sub) {
  UI.zoneTitle.innerHTML = `<div class="zt">${esc(title)}</div>${sub ? `<div class="zs">${esc(sub)}</div>` : ''}`;
  UI.zoneTitle.classList.remove('show'); void UI.zoneTitle.offsetWidth; UI.zoneTitle.classList.add('show');
};
UI.fadeTo = function (v, ms = 600) { UI.fade.style.transition = `opacity ${ms}ms`; UI.fade.style.opacity = v; return new Promise(r => setTimeout(r, ms)); };

// ---------------- orbs ----------------
function drawOrb(c, frac, col, t, glowCol) {
  const x = c.getContext('2d'), S = c.width, R = S * 0.4, cx = S / 2, cy = S / 2;
  x.clearRect(0, 0, S, S);
  // frame
  const fg = x.createRadialGradient(cx, cy, R * 0.9, cx, cy, R * 1.22);
  fg.addColorStop(0, '#000'); fg.addColorStop(0.15, '#5a4630'); fg.addColorStop(0.5, '#2a1f14'); fg.addColorStop(0.85, '#6a5232'); fg.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = fg; x.beginPath(); x.arc(cx, cy, R * 1.22, 0, TAU); x.fill();
  x.save(); x.beginPath(); x.arc(cx, cy, R, 0, TAU); x.clip();
  x.fillStyle = '#060404'; x.fillRect(0, 0, S, S);
  // liquid
  const level = cy + R - frac * 2 * R;
  const lg = x.createRadialGradient(cx - R * 0.3, cy - R * 0.2, R * 0.1, cx, cy, R * 1.1);
  lg.addColorStop(0, col[0]); lg.addColorStop(0.6, col[1]); lg.addColorStop(1, col[2]);
  x.fillStyle = lg; x.beginPath(); x.moveTo(0, S);
  for (let px = 0; px <= S; px += 4) x.lineTo(px, level + Math.sin(px * 0.06 + t * 2.2) * 3 + Math.sin(px * 0.11 - t * 1.4) * 2);
  x.lineTo(S, S); x.closePath(); x.fill();
  // swirls
  x.globalAlpha = 0.18; x.strokeStyle = '#fff'; x.lineWidth = 2;
  for (let i = 0; i < 3; i++) { x.beginPath(); x.arc(cx + Math.sin(t * 0.5 + i * 2) * R * 0.3, cy + R * 0.3 + Math.cos(t * 0.4 + i) * R * 0.2, R * (0.2 + i * 0.12), t + i, t + i + 1.6); x.stroke(); }
  x.globalAlpha = 1; x.restore();
  // glass highlight
  const hg = x.createRadialGradient(cx - R * 0.35, cy - R * 0.45, 2, cx - R * 0.3, cy - R * 0.4, R * 0.7);
  hg.addColorStop(0, 'rgba(255,255,255,0.45)'); hg.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = hg; x.beginPath(); x.arc(cx, cy, R, 0, TAU); x.fill();
  x.strokeStyle = 'rgba(0,0,0,0.9)'; x.lineWidth = 3; x.beginPath(); x.arc(cx, cy, R, 0, TAU); x.stroke();
  x.strokeStyle = glowCol; x.lineWidth = 1; x.beginPath(); x.arc(cx, cy, R * 1.12, 0, TAU); x.stroke();
}

// ---------------- HUD update ----------------
function updateHUD(dt) {
  const H = WORLD.hero; if (!H) return;
  const t = G.time;
  const poisoned = H.poison > 0;
  drawOrb(UI.orbL, clamp(H.hp / H.maxHp, 0, 1), poisoned ? ['#80ff60', '#2a8010', '#082004'] : ['#ff5040', '#a00c08', '#300202'], t, '#8a2a1a');
  drawOrb(UI.orbR, clamp(H.mana / H.maxMana, 0, 1), ['#6080ff', '#1428a0', '#040a30'], t + 1, '#2a3a8a');
  UI.orbLText.textContent = `${Math.ceil(H.hp)} / ${H.maxHp}`; UI.orbRText.textContent = `${Math.floor(H.mana)} / ${H.maxMana}`;
  // skill slots
  const keys = ['x', 'y', 'b_skill', 'rt'], padKeys = ['x', 'y', 'b', 'rt'];
  for (let i = 0; i < 4; i++) {
    const id = H.slots[i], el = UI.slotEls[i];
    const k = IN.lastDevice === 'pad' ? padKeys[i] : keys[i];
    const sig = (id || '-') + k + IN.lastDevice + (id ? H.skillLevel(id) : '') + (id && H.mana < SKILLS[id].mana(H.skillLevel(id)) ? 'n' : '');
    if (el._sig !== sig) {
      el._sig = sig;
      el.innerHTML = id ? `<img src="${skillIcon(id, 64)}"><div class="sk">${glyph(k)}</div><div class="rk">${H.skillLevel(id)}</div>` : `<div class="sk">${glyph(k)}</div>`;
      el.classList.toggle('nomana', !!(id && H.mana < SKILLS[id].mana(H.skillLevel(id))));
    }
  }
  const hp = H.countItem('potHeal') + H.countItem('potRejuv') + H.countItem('potFullHeal'), mp = H.countItem('potMana') + H.countItem('potRejuv') + H.countItem('potFullMana');
  const ps = `${hp}|${mp}|${IN.lastDevice}`;
  if (UI._ps !== ps) { UI._ps = ps; UI.potL.innerHTML = `<div class="flask red"></div><b>${hp}</b>${glyph('lb')}`; UI.potR.innerHTML = `<div class="flask blue"></div><b>${mp}</b>${glyph('rb')}`; }
  const x0 = xpForLevel(H.lvl), x1 = xpForLevel(H.lvl + 1);
  UI.xpFill.style.width = (H.lvl >= MAX_LEVEL ? 100 : clamp((H.xp - x0) / (x1 - x0) * 100, 0, 100)) + '%';
  const pts = H.statPts > 0 || H.skillPts > 0;
  UI.lvlUp.style.display = pts ? 'block' : 'none';
  if (pts) UI.lvlUp.innerHTML = `${glyph('view')} ${H.statPts ? H.statPts + ' attribute ' : ''}${H.skillPts ? H.skillPts + ' skill ' : ''}point${(H.statPts + H.skillPts) > 1 ? 's' : ''}`;
  // buffs
  const bs = H.buffs.map(b => `${b.id}:${Math.ceil(b.t)}`).join(',');
  if (UI._bs !== bs) { UI._bs = bs; UI.buffs.innerHTML = H.buffs.map(b => `<div class="buff">${esc(BUFF_NAMES[b.id] || b.id)} <span>${Math.ceil(b.t)}s</span></div>`).join(''); }
  // target bar
  let tg = UI.target;
  if (Game.hoverMonster && Game.hoverMonster.alive) { tg = Game.hoverMonster; }
  UI.targetFade -= dt;
  const boss = WORLD.monsters.find(m => m.alive && m.boss && m.aggro && m.dist(H) < 16);
  if (boss) tg = boss;
  if (tg && (tg.alive || UI.targetFade > 0) && (UI.targetFade > 0 || tg === Game.hoverMonster || tg === boss)) {
    UI.targetBar.style.opacity = 1;
    UI.targetBar.classList.toggle('boss', !!tg.boss);
    UI.targetName.textContent = tg.name; UI.targetName.style.color = tg.boss ? '#e0b050' : tg.champion ? '#7090ff' : '#e0d0b0';
    UI.targetFill.style.width = clamp(tg.hp / tg.maxHp * 100, 0, 100) + '%';
    UI.targetMods.textContent = tg.champion ? tg.champion.mods.map(m => CHAMPION_MODS[m].label).join(', ') : tg.minion ? 'Minion' : (tg.T.undead ? 'Undead' : tg.T.demon ? 'Demon' : 'Beast');
  } else UI.targetBar.style.opacity = 0;
  // messages
  for (let i = UI.msgs.length - 1; i >= 0; i--) { const m = UI.msgs[i]; m.t -= dt; if (m.t < 1) m.e.style.opacity = Math.max(0, m.t); if (m.t <= 0) { m.e.remove(); UI.msgs.splice(i, 1); } }
  // floating texts
  const sp = {};
  for (let i = UI.floats.length - 1; i >= 0; i--) {
    const f = UI.floats[i]; f.t += dt;
    worldToScreen(f.x, f.y + f.t * 0.8, f.z, sp);
    f.e.style.transform = `translate(${sp.x / UI.zs}px, ${sp.y / UI.zs}px) translate(-50%, -50%)`; f.e.style.opacity = 1 - f.t / 1.1;
    if (f.t > 1.1) { f.e.remove(); UI.floats.splice(i, 1); }
  }
  updateLabels();
  updatePrompt();
  // the automap lies over the game while you play; under an open window it is hidden (except the Map tab itself)
  if (UI.mapMode && (!UI.stack.length || UI.stack.some(q => q.kind === 'map'))) drawAutomap(); else if (UI._mapDrawn) { UI.map.getContext('2d').clearRect(0, 0, UI.map.width, UI.map.height); UI._mapDrawn = false; }
}
const BUFF_NAMES = { warcry: 'Lantern Flare', shrineDmg: 'Hidden Shrine', shrineArmor: 'Stone Shrine', shrineLight: 'Eerie Shrine' };

// ground item labels (shown when near or when labels toggled)
function updateLabels() {
  const H = WORLD.hero; const sp = {};
  const show = UI.labelsOn || held('labels');
  for (const d of WORLD.drops) {
    const near = H && Math.hypot(H.x - d.x, H.z - d.z) < 3.2;
    const focus = Game.interactTarget === d;
    if ((show || near || focus) && d.t >= 1) {
      if (d.label && !d.label.isConnected) d.label = null;
      if (!d.label) { d.label = $('div', 'glabel pe', UI.labels, esc(itemName(d.it))); d.label.style.color = itemColor(d.it); d.label.onclick = () => { Game.walkTo = { drop: d }; }; }
      worldToScreen(d.x, 0.35, d.z, sp);
      d.label.style.transform = `translate(${sp.x / UI.zs}px, ${sp.y / UI.zs}px) translate(-50%, -100%)`;
      d.label.classList.toggle('focus', focus);
      d.label.style.display = 'block';
    } else if (d.label) d.label.style.display = 'none';
  }
  // sweep: a label whose item is no longer on this floor goes
  if (UI.labels.childElementCount > WORLD.drops.length) {
    const own = new Set(WORLD.drops.map(d => d.label));
    for (const e of [...UI.labels.children]) if (!own.has(e)) e.remove();
  }
}
function updatePrompt() {
  const t = Game.interactTarget;
  if (Game.state !== 'play' || !t || UI.stack.length) { UI.prompt.style.opacity = 0; return; }
  let label = '';
  if (t.it) label = `Pick up`;
  else if (t.vis && t.title) label = `Talk to ${t.name}`;
  else if (t.kind === 'stairsDown') label = WORLD.depth === 0 ? 'Enter the Sunken Abbey' : `Descend to level ${WORLD.depth + 1}`;
  else if (t.kind === 'stairsUp') label = WORLD.depth === 1 ? 'Return to Ravenhollow' : `Ascend to level ${WORLD.depth - 1}`;
  else if (t.kind === 'portal') label = WORLD.depth === 0 ? `Enter portal (level ${WORLD.townPortal ? WORLD.townPortal.depth : '?'})` : 'Enter portal to Ravenhollow';
  else if (t.kind === 'waystone') label = 'Use the Waystone';
  else if (t.type) label = { barrel: 'Break', crate: 'Break', chest: 'Open', sarcophagus: 'Open', coffin: 'Open', shrine: 'Touch', lectern: 'Read', votive: 'Kindle' }[t.type] + ' ' + (t.name || '');
  const key = label + IN.lastDevice;
  if (UI._pk !== key) { UI._pk = key; UI.prompt.innerHTML = `${glyph('a')} ${esc(label)}`; }
  UI.prompt.style.opacity = 1;
}

// ---------------- automap ----------------
function cycleMap() { UI.mapMode = (UI.mapMode + 1) % 3; SFX.play('menuMove'); }
function drawAutomap() {
  const c = UI.map, x = c.getContext('2d'), L = WORLD.level, H = WORLD.hero; if (!L || !H) return;
  UI._mapDrawn = true;
  x.clearRect(0, 0, c.width, c.height);
  const full = UI.mapMode === 1;
  const sc = full ? Math.min(c.width, c.height) / 70 : 4.2;
  const ox = full ? c.width / 2 : c.width - 150, oy = full ? c.height / 2 : 140;
  if (!full) { x.fillStyle = 'rgba(0,0,0,0.55)'; x.beginPath(); x.arc(ox, oy, 120, 0, TAU); x.fill(); x.save(); x.beginPath(); x.arc(ox, oy, 118, 0, TAU); x.clip(); }
  // iso projection: world (x,z) -> screen
  const P = (wx, wz) => [ox + (wx - H.x - (wz - H.z)) * sc * 0.7071 * 1.4, oy + (wx - H.x + (wz - H.z)) * sc * 0.7071 * 0.7];
  x.strokeStyle = 'rgba(200,170,110,0.75)'; x.lineWidth = full ? 1.5 : 1.2; x.beginPath();
  const R = full ? 60 : 30;
  for (let z = Math.max(0, Math.floor(H.z - R)); z < Math.min(L.h, H.z + R); z++) for (let xx = Math.max(0, Math.floor(H.x - R)); xx < Math.min(L.w, H.x + R); xx++) {
    if (!L.explored[z * L.w + xx] || L.get(xx, z) !== T_FLOOR) continue;
    const w = (a, b) => L.get(a, b) === T_WALL || L.get(a, b) === T_VOID;
    if (w(xx, z - 1)) { const [a, b] = P(xx, z), [c2, d] = P(xx + 1, z); x.moveTo(a, b); x.lineTo(c2, d); }
    if (w(xx, z + 1)) { const [a, b] = P(xx, z + 1), [c2, d] = P(xx + 1, z + 1); x.moveTo(a, b); x.lineTo(c2, d); }
    if (w(xx - 1, z)) { const [a, b] = P(xx, z), [c2, d] = P(xx, z + 1); x.moveTo(a, b); x.lineTo(c2, d); }
    if (w(xx + 1, z)) { const [a, b] = P(xx + 1, z), [c2, d] = P(xx + 1, z + 1); x.moveTo(a, b); x.lineTo(c2, d); }
  }
  x.stroke();
  const dot = (wx, wz, col, r) => { const [a, b] = P(wx, wz); x.fillStyle = col; x.beginPath(); x.arc(a, b, r, 0, TAU); x.fill(); };
  if (L.stairsDown && L.explored[L.idx(L.stairsDown[0], L.stairsDown[1])]) dot(L.stairsDown[0] + 1, L.stairsDown[1] + 1, '#ff4030', 4);
  if (L.stairsUp && L.explored[L.idx(L.stairsUp[0], L.stairsUp[1])]) dot(L.stairsUp[0] + 1, L.stairsUp[1] + 1, '#40ff60', 4);
  for (const n of WORLD.npcs) dot(n.x, n.z, '#f0d060', 3);
  if (WORLD.portalObj) dot(WORLD.portalObj.x, WORLD.portalObj.z, '#6080ff', 4);
  dot(H.x, H.z, '#ffffff', 3.5);
  if (!full) x.restore();
}
function updateExplored() {
  const L = WORLD.level, H = WORLD.hero; if (!L || !H) return;
  const r = Math.round(7 * H.lightMul);
  for (let z = Math.floor(H.z) - r; z <= Math.floor(H.z) + r; z++) for (let xx = Math.floor(H.x) - r; xx <= Math.floor(H.x) + r; xx++) {
    if (xx < 0 || z < 0 || xx >= L.w || z >= L.h) continue;
    const i = z * L.w + xx; if (L.explored[i]) continue;
    if ((xx - H.x) ** 2 + (z - H.z) ** 2 > r * r) continue;
    if (L.get(xx, z) === T_FLOOR && hasLOS(L, H.x, H.z, xx + 0.5, z + 0.5)) L.explored[i] = 1;
  }
}

// ---------------- panels / focus navigation ----------------
class Panel {
  constructor(cls, opts = {}) {
    this.el = $('div', 'panel ' + cls + ' pe', UI.panelLayer);
    this.items = []; this.focus = 0; this.opts = opts;
  }
  add(el, h) { const it = Object.assign({ el }, h); this.items.push(it); el.classList.add('fi'); el.addEventListener('mouseenter', () => { if (IN.lastDevice !== 'pad') this.setFocus(this.items.indexOf(it)); }); el.addEventListener('click', e => { this.setFocus(this.items.indexOf(it)); it.a && it.a(); SFX.play('click'); e.stopPropagation(); }); el.addEventListener('contextmenu', e => { e.preventDefault(); this.setFocus(this.items.indexOf(it)); it.x && it.x(); }); return it; }
  setFocus(i) {
    if (i < 0 || i >= this.items.length) return;
    const old = this.items[this.focus]; if (old) old.el.classList.remove('focused');
    this.focus = i; const it = this.items[i]; it.el.classList.add('focused');
    if (it.el.scrollIntoView && it.scroll) it.el.scrollIntoView({ block: 'nearest' });
    showTip(it);
  }
  move(dx, dy) {
    const cur = this.items[this.focus]; if (!cur) return;
    const r0 = cur.el.getBoundingClientRect(), cx = r0.left + r0.width / 2, cy = r0.top + r0.height / 2;
    let best = -1, bs = 1e9;
    this.items.forEach((it, i) => {
      if (i === this.focus || it.el.offsetParent === null) return;
      const r = it.el.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
      const ddx = x - cx, ddy = y - cy;
      const along = dx ? ddx * dx : ddy * dy; if (along <= 4) return;
      const across = dx ? Math.abs(ddy) : Math.abs(ddx);
      const s = along + across * 2.2;
      if (s < bs) { bs = s; best = i; }
    });
    if (best >= 0) { this.setFocus(best); SFX.play('menuMove'); }
  }
  close() { this.el.remove(); hideTip(); }
}
function pushPanel(p) { UI.stack.push(p); if (p.items.length) p.setFocus(Math.min(p.focus, p.items.length - 1)); if (!UI._quietOpen) SFX.play('menuOpen'); return p; }
function popPanel() { const p = UI.stack.pop(); if (p) { p.close(); p.opts.onClose && p.opts.onClose(); } hideTip(); const top = UI.stack[UI.stack.length - 1]; if (top && top.items[top.focus]) showTip(top.items[top.focus]); }
function closeAllPanels() { while (UI.stack.length) popPanel(); }
function topPanel() { return UI.stack[UI.stack.length - 1]; }
function ensureCloseButton(p) {
  if (p.opts.noX || (p._x && p._x.parentNode === p.el)) return;
  p._x = $('div', 'pclose', p.el, '✕'); p._x.title = 'Close';
  p._x.addEventListener('pointerdown', e => e.stopPropagation());
  p._x.onclick = e => { e.stopPropagation(); SFX.play('click'); if (topPanel() !== p) return; if (p.opts.onB) p.opts.onB(); else popPanel(); };
}
function updatePanels(dt) {
  const p = topPanel(); if (!p) return false;
  ensureCloseButton(p);
  const [dx, dy] = navDir(dt);
  if (dx) p.move(dx, 0); else if (dy) p.move(0, dy);
  const it = p.items[p.focus];
  if (pressed('a') && it && it.a) { it.a(); SFX.play('click'); }
  else if (pressed('x') && it && it.x) it.x();
  else if (pressed('y') && it && it.y) it.y();
  else if (pressed('b') || (pressed('menu') && p.opts.menuCloses !== false)) { if (p.opts.onB) p.opts.onB(); else popPanel(); }
  else if (pressed('view') && p.opts.viewCloses) popPanel();
  else if ((pressed('lb') || pressed('rb')) && p.opts.tabs) p.opts.tabs(pressed('rb') ? 1 : -1);
  if (p.opts.update) p.opts.update(dt);
  return true;
}

// ---------------- tooltip ----------------
function showTip(it) {
  if (!it || !it.tip) { hideTip(); return; }
  const lines = typeof it.tip === 'function' ? it.tip() : it.tip;
  if (!lines) { hideTip(); return; }
  UI.tip.innerHTML = lines.map(l => `<div style="${l.color ? 'color:' + l.color + ';' : ''}${l.big ? 'font-size:1.15em;' : ''}${l.italic ? 'font-style:italic;' : ''}">${esc(l.text)}</div>`).join('') + (it.hint ? `<div class="tiphint">${it.hint()}</div>` : '');
  UI.tip.style.display = 'block';
  const zs = UI.zs || 1;
  const r = it.el.getBoundingClientRect(), tw = UI.tip.offsetWidth * zs, th = UI.tip.offsetHeight * zs;
  let x = r.left + r.width / 2 - tw / 2, y = r.top - th - 8;
  if (y < 6) y = r.bottom + 8;
  x = clamp(x, 6, window.innerWidth - tw - 6); y = clamp(y, 6, window.innerHeight - th - 6);
  UI.tip.style.left = x / zs + 'px'; UI.tip.style.top = y / zs + 'px';
  // comparison with equipped item
  if (it.compare) {
    const lines2 = it.compare();
    if (lines2) {
      UI.tip2.innerHTML = '<div class="eqhdr">Equipped</div>' + lines2.map(l => `<div style="${l.color ? 'color:' + l.color + ';' : ''}">${esc(l.text)}</div>`).join('');
      UI.tip2.style.display = 'block';
      const t2w = UI.tip2.offsetWidth * zs;
      let x2 = x - t2w - 8; if (x2 < 6) x2 = x + tw + 8;
      UI.tip2.style.left = x2 / zs + 'px'; UI.tip2.style.top = y / zs + 'px';
    } else UI.tip2.style.display = 'none';
  } else UI.tip2.style.display = 'none';
}
function hideTip() { UI.tip.style.display = 'none'; UI.tip2.style.display = 'none'; }

// ---------------- item slot element ----------------
const DOLL_SVG = `<svg class="doll" viewBox="0 0 440 470" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="dg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4a443e"/><stop offset="1" stop-color="#24211e"/></linearGradient><radialGradient id="dh" cx="50%" cy="42%" r="55%"><stop offset="0" stop-color="rgba(170,120,70,.26)"/><stop offset="1" stop-color="rgba(0,0,0,0)"/></radialGradient></defs><rect width="440" height="470" fill="url(#dh)"/><path d="M220 8 C196 8 182 30 182 56 C182 70 186 82 192 90 L160 100 C140 104 128 116 124 134 L100 250 C96 264 98 280 106 286 C116 290 124 284 128 272 L150 170 L158 240 L134 392 L196 396 L194 440 L180 452 L180 460 L214 460 L216 398 L220 396 L224 398 L226 460 L260 460 L260 452 L246 440 L244 396 L306 392 L282 240 L290 170 L312 272 C316 284 324 290 334 286 C342 280 344 264 340 250 L316 134 C312 116 300 104 280 100 L248 90 C254 82 258 70 258 56 C258 30 244 8 220 8 Z" fill="url(#dg)" stroke="rgba(205,182,144,.6)" stroke-width="1.6" stroke-linejoin="round"/><ellipse cx="220" cy="58" rx="17" ry="22" fill="#060606"/><path d="M160 238 Q220 252 280 238" fill="none" stroke="rgba(190,168,132,.22)" stroke-width="3"/><path d="M220 100 L220 392 M192 250 L176 390 M248 250 L264 390" fill="none" stroke="rgba(0,0,0,.45)" stroke-width="2"/></svg>`;
function itemCell(it, cls = 'cell') {
  const e = $('div', cls);
  if (it) {
    e.innerHTML = `<img src="${itemIcon(it)}">` + (it.qty > 1 && it.kind !== 'gold' ? `<span class="qty">${it.qty}</span>` : '');
    if (it.rarity === 3) e.classList.add('unique'); else if (it.rarity === 1) e.classList.add('magic');
    if (!it.identified) e.classList.add('unid');
    if (WORLD.hero && slotsFor(it).length && !canEquip(WORLD.hero, it)) e.classList.add('cant');
  }
  return e;
}
function equippedFor(it) { const H = WORLD.hero; const s = slotsFor(it); if (!s.length) return null; return H.equip[s[0]] || (s[1] && H.equip[s[1]]) || null; }

// ---------------- menu tabs: LB / RB (Q / E) walk between Hero, Skills and Map ----------------
const MENU_TABS = [['hero', 'Hero'], ['skills', 'Skills'], ['map', 'Map']];
function openMenuTab(kind) { if (kind === 'hero') openHeroScreen(); else if (kind === 'skills') openSkills(); else openMapPanel(); }
function switchMenuTab(cur, dir) {
  const i = MENU_TABS.findIndex(t => t[0] === cur), next = MENU_TABS[(i + dir + MENU_TABS.length) % MENU_TABS.length][0];
  while (UI.stack.length && ['hero', 'skills', 'map'].includes(topPanel().kind)) { const q = UI.stack.pop(); q.close(); q.opts.onClose && q.opts.onClose(); }
  hideTip(); UI._quietOpen = true; openMenuTab(next); UI._quietOpen = false; SFX.play('menuMove');
}
function tabStrip(p, kind) {
  p.kind = kind; p.opts.tabs = d => switchMenuTab(kind, d);
  const t = $('div', 'ptabs', p.el);
  $('span', 'ptab-g', t, glyph('lb'));
  for (const [k, label] of MENU_TABS) {
    const e = $('span', 'ptab' + (k === kind ? ' on' : ''), t, label);
    if (k !== kind) e.onclick = ev => { ev.stopPropagation(); SFX.play('click'); switchMenuTab(kind, MENU_TABS.findIndex(x => x[0] === k) - MENU_TABS.findIndex(x => x[0] === kind)); };
  }
  $('span', 'ptab-g', t, glyph('rb'));
  return t;
}
function openMapPanel() {
  const prev = UI.mapMode;
  const p = new Panel('mappanel', { viewCloses: true, onClose: () => { UI.mapMode = prev === 1 ? 0 : prev; } });
  UI.mapMode = 1;
  tabStrip(p, 'map');
  $('div', 'mapkey', p.el, `<span><i style="background:#fff"></i>You</span><span><i style="background:#f0d060"></i>Villagers</span><span><i style="background:#ff4030"></i>Way down</span><span><i style="background:#40ff60"></i>Way up</span><span><i style="background:#6080ff"></i>Portal</span>`);
  $('div', 'phelp', p.el, `${glyph('lb')} ${glyph('rb')} Switch &nbsp; ${glyph('b')} Close`);
  pushPanel(p);
}

// ---------------- HERO SCREEN (inventory + character) ----------------
function openHeroScreen(focusInv) {
  const H = WORLD.hero;
  if (topPanel() && topPanel().kind === 'hero') { popPanel(); return; }
  const p = new Panel('hero', { viewCloses: true, onClose: () => { } });
  p.kind = 'hero';
  const build = () => {
    const keepFocus = p.focus;
    p.items = []; p.el.innerHTML = '';
    tabStrip(p, 'hero');
    const charCol = $('div', 'charcol', p.el), invCol = $('div', 'invcol', p.el);
    // --- character sheet ---
    $('div', 'ptitle', charCol, `${esc(H.name)}`);
    $('div', 'psub', charCol, `Level ${H.lvl} ${CLASSES[H.cls].name}`);
    const xpn = xpForLevel(H.lvl + 1);
    $('div', 'xpline', charCol, `Experience <b>${fmtNum(H.xp)}</b>` + (H.lvl < MAX_LEVEL ? ` &nbsp;·&nbsp; Next <b>${fmtNum(xpn)}</b>` : ''));
    const attrs = $('div', 'attrs', charCol);
    for (const [k, label] of [['str', 'Strength'], ['dex', 'Dexterity'], ['mag', 'Magic'], ['vit', 'Vitality']]) {
      const row = $('div', 'arow', attrs);
      $('span', 'alabel', row, label);
      const v = H.attr(k), b = H.base[k];
      $('span', 'aval' + (v > b ? ' boosted' : ''), row, `${v}`);
      if (H.statPts > 0) {
        const plus = $('div', 'plus', row, '+');
        p.add(plus, { a: () => { H.base[k]++; H.statPts--; H.recalc(); SFX.play('click'); build(); }, tip: [{ text: `Add a point to ${label}` }, { text: { str: 'Increases melee damage and lets you wield heavy arms.', dex: 'Increases chance to hit, armor and bow damage.', mag: 'Increases mana and spell damage.', vit: 'Increases life.' }[k], color: 'var(--muted)' }] });
      }
    }
    if (H.statPts > 0) $('div', 'ptsleft', charCol, `${H.statPts} attribute point${H.statPts > 1 ? 's' : ''} to spend`);
    const st = $('div', 'stats', charCol);
    const row = (a, b, c) => $('div', 'srow', st, `<span>${a}</span><b${c ? ` style="color:${c}"` : ''}>${b}</b>`);
    row('Life', `${Math.ceil(H.hp)} / ${H.maxHp}`); row(G.settings.lantern !== false ? 'Lantern fire' : 'Mana', `${Math.floor(H.mana)} / ${H.maxMana}`);
    row('Damage', `${H.dmg[0]} - ${H.dmg[1]}`); row('Chance to hit', `${H.tohit}`); row('Armor', `${H.armor}`);
    if (H.block) row('Block chance', `${Math.round(H.block)}%`);
    row('Fire resist', `${H.res.fire}%`, H.res.fire > 0 ? '#ff9060' : null); row('Cold resist', `${H.res.cold}%`, H.res.cold > 0 ? '#80c0ff' : null); row('Lightning resist', `${H.res.light}%`, H.res.light > 0 ? '#ffe060' : null);
    row('Gold', fmtNum(H.gold), '#e8c860');
    const sk = $('div', 'pbtn', charCol, `Skills${H.skillPts ? ` <span class="badge">${H.skillPts}</span>` : ''}`);
    p.add(sk, { a: () => openSkills() });
    // --- equipment ---
    const eq = $('div', 'equip', invCol);
    // paper doll: the slots sit on a silhouette of the Penitent (left/top of each 52 px slot inside the 326 x 348 figure)
    eq.innerHTML = DOLL_SVG;
    const pos = { head: [137, 11], neck: [196, 26], body: [137, 96], hands: [69, 138], ring1: [205, 138], ring2: [259, 138], main: [33, 203], off: [240, 203], feet: [137, 288] };
    for (const s of SLOTS) {
      const it = H.equip[s];
      const c = itemCell(it, 'cell eslot' + (it ? '' : ' empty')); c.style.left = pos[s][0] + 'px'; c.style.top = pos[s][1] + 'px';
      if (!it) c.innerHTML = `<span class="slabel">${SLOT_NAMES[s]}</span>`;
      eq.appendChild(c);
      p.add(c, { a: () => { if (it) { H.unequip(s); build(); } }, x: () => { if (it && H.unequip(s)) build(); }, tip: it ? () => itemTooltip(it, H) : [{ text: SLOT_NAMES[s] }, { text: 'Empty', color: 'var(--muted)' }], hint: () => it ? `${glyph('a')} Unequip` : '' });
    }
    // --- inventory grid ---
    const grid = $('div', 'grid', invCol);
    H.inv.forEach((it, i) => {
      const c = itemCell(it); grid.appendChild(c);
      if (UI.identifyMode >= 0 && it && !it.identified) c.classList.add('idtarget');
      p.add(c, {
        a: () => {
          if (!it) return;
          if (UI.identifyMode >= 0) { if (!it.identified) { it.identified = true; const sc = H.inv[UI.identifyMode]; if (sc) { sc.qty--; if (sc.qty <= 0) H.inv[UI.identifyMode] = null; } UI.identifyMode = -1; SFX.play('shrine'); UI.msg(`Identified: ${itemName(it)}`, null, false, it); } build(); return; }
          H.useItem(i); build();
        },
        x: () => { if (!it) return; H.inv[i] = null; spawnDrop(it, H.x, H.z, true); build(); },
        y: () => { if (it && it.kind === 'ring') { H.equipFromInv(i, 'ring2'); build(); } },
        tip: it ? () => itemTooltip(it, H) : null,
        compare: it && slotsFor(it).length ? () => { const e = equippedFor(it); return e ? itemTooltip(e, H) : null; } : null,
        hint: () => it ? `${glyph('a')} ${slotsFor(it).length ? 'Equip' : it.kind === 'potion' ? 'Drink' : it.kind === 'tome' ? 'Read' : it.kind === 'scroll' ? 'Read' : 'Use'} &nbsp; ${glyph('x')} Drop${it.kind === 'ring' ? ` &nbsp; ${glyph('y')} Equip right` : ''}` : '',
      });
    });
    $('div', 'goldline', invCol, `<span class="coin"></span> ${fmtNum(H.gold)} gold`);
    $('div', 'phelp', p.el, `${glyph('lb')} ${glyph('rb')} Switch &nbsp; ${glyph('b')} Close`);
    p.setFocus(clamp(keepFocus, 0, p.items.length - 1));
  };
  p.rebuild = build;
  build();
  // default focus: first inventory cell
  if (focusInv !== false) p.setFocus(p.items.findIndex(it => it.el.parentElement && it.el.parentElement.classList.contains('grid')));
  pushPanel(p);
}
UI.beginIdentify = function (scrollIdx) { UI.identifyMode = scrollIdx; UI.msg('Choose an item to identify.', '#a0c0ff'); const t = topPanel(); if (t && t.rebuild) t.rebuild(); };

// ---------------- SKILLS ----------------
function openSkills() {
  const H = WORLD.hero;
  const p = new Panel('skills', {});
  let assign = -1;
  const build = () => {
    const keepFocus = p.focus; p.items = []; p.el.innerHTML = '';
    tabStrip(p, 'skills');
    $('div', 'ptitle', p.el, 'Skills');
    $('div', 'psub', p.el, H.skillPts ? `${H.skillPts} skill point${H.skillPts > 1 ? 's' : ''} available` : 'Earn skill points by gaining levels, or read tomes.');
    const slotsRow = $('div', 'aslots', p.el);
    const keys = IN.lastDevice === 'pad' ? ['x', 'y', 'b', 'rt'] : ['x', 'y', 'b_skill', 'rt'];
    for (let i = 0; i < 4; i++) {
      const id = H.slots[i];
      const c = $('div', 'aslot' + (assign === i ? ' assigning' : ''), slotsRow, (id ? `<img src="${skillIcon(id, 64)}">` : '') + `<div class="sk">${glyph(keys[i])}</div>`);
      p.add(c, { a: () => { assign = i; build(); }, tip: [{ text: id ? SKILLS[id].name : 'Empty slot', big: true }, { text: 'Select, then choose a skill to place here.', color: 'var(--muted)' }] });
    }
    const list = $('div', 'sklist', p.el);
    for (const id of CLASS_SKILLS[H.cls]) {
      const S = SKILLS[id], r = H.skills[id] || 0, locked = H.lvl < S.reqLevel;
      const row = $('div', 'skrow' + (locked ? ' locked' : ''), list);
      row.innerHTML = `<img src="${skillIcon(id, 64)}"><div class="skinfo"><div class="skname">${S.name} ${r ? `<span class="rank">Rank ${r}${H.d.skills ? ` (+${H.d.skills})` : ''}</span>` : ''}</div><div class="skdesc">${S.desc(Math.max(1, H.skillLevel(id) || 1), H)}</div><div class="skreq">${locked ? `Requires level ${S.reqLevel}` : `Mana cost: ${S.mana(Math.max(1, r))}`}</div></div>`;
      p.add(row, {
        a: () => {
          if (assign >= 0 && r > 0) { const j = H.slots.indexOf(id); if (j >= 0) H.slots[j] = H.slots[assign]; H.slots[assign] = id; assign = -1; SFX.play('click'); build(); return; }
          if (!locked && H.skillPts > 0) { H.skills[id] = r + 1; H.skillPts--; H.autoSlot(); SFX.play('levelup'); build(); }
          else if (r > 0) { assign = H.slots.indexOf(null) >= 0 ? H.slots.indexOf(null) : 0; build(); }
        },
        hint: () => assign >= 0 ? `${glyph('a')} Place in slot` : (!locked && H.skillPts > 0 ? `${glyph('a')} Learn / improve` : r ? `${glyph('a')} Assign to a button` : ''),
        tip: null,
      });
    }
    $('div', 'phelp', p.el, `${glyph('lb')} ${glyph('rb')} Switch &nbsp; ${glyph('b')} Back`);
    p.setFocus(clamp(keepFocus, 0, p.items.length - 1));
  };
  build(); p.focus = 4; pushPanel(p); p.setFocus(4);
}

// ---------------- DIALOG ----------------
function openDialog(title, text, options, opts = {}) {
  const p = new Panel('dialog', { onClose: () => { if (opts.voice) stopVoice(); if (opts.onClose) opts.onClose(); } });
  if (opts.voice) playVoice(opts.voice, { verb: opts.verb ?? 0.1, vol: opts.vol ?? 1.35, duck: 0.3, duckAmb: 0.45 });   // conversations: louder, music and ambience step back
  $('div', 'ptitle', p.el, esc(title));
  if (opts.subtitle) $('div', 'psub', p.el, esc(opts.subtitle));
  $('div', 'dtext', p.el, text);
  const ol = $('div', 'dopts', p.el);
  for (const o of options) { const e = $('div', 'dopt', ol, esc(o.label)); p.add(e, { a: o.fn }); }
  pushPanel(p);
  return p;
}

// ---------------- SHOP ----------------
function openShop(vendor) {
  const H = WORLD.hero;
  const p = new Panel('shop', {});
  const build = () => {
    const keepFocus = p.focus; p.items = []; p.el.innerHTML = '';
    const left = $('div', 'shopcol', p.el), right = $('div', 'shopcol', p.el);
    $('div', 'ptitle', left, esc(vendor.name)); $('div', 'psub', left, esc(vendor.blurb || ''));
    const vg = $('div', 'grid vgrid', left);
    vendor.stock.forEach((it, i) => {
      const c = itemCell(it); vg.appendChild(c);
      const price = vendor.price(it);
      $('span', 'price' + (H.gold < price ? ' poor' : ''), c, fmtNum(price));
      p.add(c, {
        a: () => {
          if (H.gold < price) { UI.msg('You cannot afford that.', '#c06040'); SFX.play('error'); return; }
          const copy = vendor.infinite ? Object.assign({}, it, { id: ITEM_ID++, stats: Object.assign({}, it.stats) }) : it;
          if (!H.addItem(copy)) return;
          H.gold -= price; if (!vendor.infinite) vendor.stock.splice(i, 1);
          SFX.play('gold'); build();
        },
        tip: () => itemTooltip(it, H).concat([{ text: `Price: ${fmtNum(price)} gold`, color: H.gold >= price ? '#e8c860' : '#e04030' }]),
        compare: slotsFor(it).length ? () => { const e = equippedFor(it); return e ? itemTooltip(e, H) : null; } : null,
        hint: () => `${glyph('a')} Buy`,
      });
    });
    $('div', 'ptitle small', right, 'Your belongings');
    const ig = $('div', 'grid', right);
    H.inv.forEach((it, i) => {
      const c = itemCell(it); ig.appendChild(c);
      p.add(c, {
        a: () => { if (!it) return; const v = sellValue(it); H.gold += v; H.inv[i] = null; SFX.play('gold'); UI.msg(`Sold ${itemName(it)} for ${fmtNum(v)} gold`, '#e8c860'); build(); },
        tip: it ? () => itemTooltip(it, H).concat([{ text: `Sells for ${fmtNum(sellValue(it))} gold`, color: '#e8c860' }]) : null,
        hint: () => it ? `${glyph('a')} Sell` : '',
      });
    });
    $('div', 'goldline', right, `<span class="coin"></span> ${fmtNum(H.gold)} gold`);
    $('div', 'phelp', p.el, `${glyph('b')} Leave`);
    p.setFocus(clamp(keepFocus, 0, p.items.length - 1));
  };
  build(); pushPanel(p);
}

// ---------------- generic menu list ----------------
function openMenu(title, entries, opts = {}) {
  const p = new Panel('menu ' + (opts.cls || ''), opts);
  $('div', 'ptitle', p.el, esc(title));
  if (opts.subtitle) $('div', 'psub', p.el, opts.subtitle);
  for (const e of entries) {
    if (e.slider) {
      const row = $('div', 'mslider', p.el);
      const render = () => { row.innerHTML = `<span>${esc(e.label)}</span><span class="sv">${'■'.repeat(Math.round(e.get() * 10))}${'□'.repeat(10 - Math.round(e.get() * 10))}</span>`; };
      render();
      p.add(row, { a: () => { e.set(clamp(e.get() + 0.1, 0, 1)); render(); }, x: () => { e.set(clamp(e.get() - 0.1, 0, 1)); render(); }, hint: () => `${glyph('a')} / ${glyph('x')} adjust`, slider: { dec: () => { e.set(clamp(e.get() - 0.1, 0, 1)); render(); }, inc: () => { e.set(clamp(e.get() + 0.1, 0, 1)); render(); } } });
    } else if (e.toggle) {
      const row = $('div', 'mopt', p.el);
      const render = () => { row.innerHTML = `${esc(e.label)}: <b>${esc(e.get())}</b>`; };
      render();
      p.add(row, { a: () => { e.toggle(); render(); } });
    } else {
      const row = $('div', 'mopt' + (e.disabled ? ' disabled' : ''), p.el, e.html || esc(e.label));
      p.add(row, { a: () => { if (!e.disabled) e.fn(); }, tip: e.tip });
    }
  }
  if (opts.footer) $('div', 'phelp', p.el, opts.footer);
  pushPanel(p);
  // sliders respond to left/right
  const origMove = p.move.bind(p);
  p.move = (dx, dy) => { const it = p.items[p.focus]; if (dx && it && it.slider) { (dx < 0 ? it.slider.dec : it.slider.inc)(); SFX.play('menuMove'); } else origMove(dx, dy); };
  return p;
}

