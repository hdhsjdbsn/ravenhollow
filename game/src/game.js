'use strict';
// Main game controller: boot, states, levels, hero control, NPCs, quests, saving.

const Game = {
  state: 'boot', walkTo: null, path: null, pathT: 0, interactTarget: null, hoverMonster: null, cursorGround: null,
  seeds: {}, cache: {}, saveT: 0, deathT: 0, stock: {}, victory: false,
};
const SAVE_KEY = 'ravenhollow.save.v2', SET_KEY = 'ravenhollow.settings.v2';
WORLD.special = [];
const setCameraTarget = (x, y, z) => R3.camTarget.set(x, 0, z);

// ---------------------------------------------------------------- boot
function fitCanvas() {
  const cv = document.getElementById('gl'), d = Math.min(2, window.devicePixelRatio || 1);
  const w = Math.round(window.innerWidth * d), h = Math.round(window.innerHeight * d);
  if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
}
async function boot() {
  try { const s = JSON.parse(localStorage.getItem(SET_KEY) || 'null'); if (s) Object.assign(G.settings, s); } catch (e) { }
  const canvas = document.getElementById('gl');
  fitCanvas(); window.addEventListener('resize', fitCanvas);
  GFX.init(canvas);
  initInput();
  initAudio();
  const lf = document.getElementById('lfill'), lt = document.getElementById('ltext');
  const prog = (f, l) => { lf.style.width = (f * 100) + '%'; if (l) lt.textContent = l; };
  prog(0.05, 'Kindling the candles…');
  await loadScript(ASSET_BASE + 'icons.js').then(loadIcons).catch(e => console.warn(e));
  await loadScript(ASSET_BASE + 'skills.js').then(loadSkillIcons).catch(e => console.warn(e));
  const T = window.TEST_ROOM === 'ossuary';
  const first = [...ALWAYS_SETS, ...['h_hood', 'a_rags', 'w_sword', 'l_1'].map(n => HSET + '_' + n), ...setsForDepth(T ? 4 : 0)];
  await loadSetsSafe(first, f => prog(0.05 + f * 0.9, f < 0.5 ? 'Waking the village…' : 'Lighting the lanterns…'));
  initFX();
  initUI();
  initTheme();
  initVigil();
  initMusic();
  prog(1, 'Ready');
  applySettings();
  Game.lastT = performance.now();
  requestAnimationFrame(frame);
  if (T) { await startTestRoom(); document.getElementById('loading').classList.add('hide'); window.__ready = true; return; }
  await showTitle();
  document.getElementById('loading').classList.add('hide');
  window.__ready = true;
}
// test page: straight into the first Ossuary level with a fresh level-8 Penitent (no town, no title)
async function startTestRoom() {
  const h = new Hero('penitent', 'Penitent'); giveStartingGear(h);
  h.lvl = 8; h.xp = xpForLevel(8); h.base.str += 20; h.base.vit += 15; h.gold = 500;
  WORLD.hero = h; h.recalc(); h.hp = h.maxHp; h.mana = h.maxMana;
  UI.hud.style.display = ''; Game.state = 'play';
  h.rebuildVisual();
  Game.showcase = true; for (const k in Game.cache) delete Game.cache[k];
  await enterLevel(4, 'up');
  setTimeout(() => UI.msg('Graphics test room: the Ashen Ossuary', '#c8a45a', true), 1200);
}
// the same room from the title menu (the save game is left alone while Game.showcase is set)
function startShowcase() {
  closeAllPanels(); stopVoice();
  if (Game.titleEl) { Game.titleEl.remove(); Game.titleEl = null; }
  Game.camGoal = null; WORLD.portalObj = null;
  UI.fadeTo(1, 10).then(async () => { stashLevel(); await startTestRoom(); UI.fadeTo(0, 1200); });
  UI.hint.style.transition = 'none'; UI.hint.style.opacity = 1;
}
function applySettings() {
  applyVolumes();
  GFX.S.grain = G.settings.grain ? 0.05 : 0.0;
  if (WORLD.level) applyLook(WORLD.depth === 0 ? 'town' : WORLD.level.zoneName);
  try { localStorage.setItem(SET_KEY, JSON.stringify(G.settings)); } catch (e) { }
}

// sprite sets a dungeon level needs: its tile kit, the shared props, and every monster that can appear
function setsForDepth(depth) {
  const zone = zoneForDepth(depth);
  const out = new Set(ZONE_SETS[zone].slice(0, 2));
  if (depth === 0) return ZONE_SETS.town.slice();
  const ids = monsterTable(depth).map(t => t.type);
  const b = BOSS_FOR_DEPTH[depth]; if (b) ids.push(b[0]);
  ids.push(depth >= 4 ? 'cryptGuard' : 'thrall');
  if (b && b[0] === 'hollowKing') ids.push('risen', 'cryptGuard');
  if (b && b[0] === 'webMother') ids.push('spiderling');
  if (b && b[0] === 'vaelzhor') ids.push('hellspawn', 'abyssKnight');
  for (const id of ids) if (MONSTER_SPRITES[id]) out.add(MONSTER_SPRITES[id].set);
  return [...out];
}
async function loadSetsSafe(names, prog) {
  let n = 0;
  await Promise.all(names.map(nm => loadSet(nm).catch(e => console.warn('sprite set', nm, e.message)).then(() => { n++; if (prog) prog(n / names.length); })));
}

// ---------------------------------------------------------------- main loop
let fpsAcc = 0, fpsN = 0;
function frame(now) {
  requestAnimationFrame(frame);
  if (window.__pauseLoop) { Game.lastT = now; return; }
  let dt = (now - Game.lastT) / 1000; Game.lastT = now;
  fpsAcc += dt; fpsN++; if (fpsAcc > 1) { window.__fps = Math.round(fpsN / fpsAcc); fpsAcc = 0; fpsN = 0; }
  dt = clamp(dt, 0, 0.05);
  G.dt = dt; G.time += dt; G.frame++;
  pollInput();
  try { update(dt); } catch (e) { console.error(e); }
  try { renderWorld(); } catch (e) { console.error(e); }
}

function update(dt) {
  G.dt = dt;
  const H = WORLD.hero;
  if (Game.state === 'title') {
    updatePanels(dt);
    updateTitleScene(dt);
    updateFX(dt); updateAmbience(dt);
    return;
  }
  if (Game.state !== 'play' && Game.state !== 'dead') return;
  const uiOpen = updatePanels(dt);
  const paused = uiOpen && topPanel() && topPanel().pauses;
  if (Game.state === 'dead') {
    Game.deathT += dt;
    if (Game.deathT > 2 && (pressed('a') || pressed('menu') || IN.mouse.leftClick)) respawnInTown();
  }
  // hit-stop: the world holds its breath for a few frames when a heavy blow lands
  let sdt = dt;
  if (FX.freeze > 0) { FX.freeze -= dt; sdt = dt * 0.08; }
  if (!paused) {
    if (Game.state === 'play' && H.alive && !uiOpen) controlHero(sdt);
    else if (H) H.moveSpeedNow = 0;
    if (H) { H.update(sdt); updateHeroSkills(H, sdt); separateHero(H); }
    for (const m of WORLD.monsters) m.update(sdt);
    if (G.frame % 120 === 0) WORLD.monsters = WORLD.monsters.filter(m => m.alive || m.vis);
    for (const n of WORLD.npcs) n.vis.update(dt, 0);
    updateNPCFacing(dt);
    updateProjectiles(sdt); updateEffects(sdt); updateDrops(dt); updateFlow(dt);
    updatePortals(dt);
  }
  if (H) {
    // zones with a far view (the village) look past the hero toward the horizon: he stands lower on the screen
    { const L = WORLD.level, cb = L && !L.showcase && LOOK[L.zoneName] && LOOK[L.zoneName].camBack || 0; Game.camBack = (Game.camBack ?? cb) + (cb - (Game.camBack ?? cb)) * 0.05;
      setCameraTarget(H.x - Game.camBack * 0.7071, 0, H.z - Game.camBack * 0.7071); }
    updateLantern(H);
    if (G.frame % 15 === 0) updateExplored();
    if (WORLD.depth === 0 && Math.random() < dt * 4) FX.soft.emit({ x: H.x + rand.range(-13, 13), y: 0.18, z: H.z + rand.range(-13, 13), vx: 0.18, vy: 0.01, vz: 0.06, c: [0.46, 0.44, 0.5], life: 8, s: 1.8, s2: 3.2, a: 0.08 });
    else if (WORLD.depth > 0 && Math.random() < dt * 2.2) {
      const mx = H.x + rand.range(-9, 9), mz = H.z + rand.range(-9, 9);
      if (WORLD.level && WORLD.level.isFloor(Math.floor(mx), Math.floor(mz))) FX.soft.emit({ x: mx, y: 0.22, z: mz, vx: rand.range(-0.08, 0.08), vy: 0.005, vz: rand.range(-0.08, 0.08), c: WORLD.level.zoneName === 'abyss' ? [0.35, 0.16, 0.1] : [0.3, 0.27, 0.24], life: 9, s: 1.6, s2: 3.0, a: 0.06 });
    }
    // music intensity
    let n = 0, bossNear = null;
    for (const m of WORLD.monsters) if (m.alive && m.aggro && m.dist(H) < 12) { n++; if (m.boss) bossNear = m; }
    MUS.target = Math.min(1, n / 3);
    if (bossNear && MUS.pieceName !== 'boss') setMusic('boss');
    else if (!bossNear && MUS.pieceName === 'boss') setMusic(WORLD.level.zone.music);
    Game.saveT += dt; if (Game.saveT > 45 && Game.state === 'play') { Game.saveT = 0; saveGame(); }
  }
  updateFX(dt); updateAmbience(dt);
  updateHUD(dt);
  if (!uiOpen && Game.state === 'play') {
    if (pressed('view') || pressed('char')) openHeroScreen();
    else if (!window.ACTION && (pressed('skills') || pressed('left'))) openSkills();   // the action fork has no skill tree: the d-pad does nothing in play
    else if (pressed('menu') && !(typeof ACT !== 'undefined' && ACT.setup) && !(typeof PADT !== 'undefined' && PADT.setup)) openPause();
    else if (!window.ACTION && (pressed('up') || pressed('map'))) { UI.mapMode = (UI.mapMode + 1) % 3; SFX.play('menuMove'); }
    else if (!window.ACTION && pressed('down')) { UI.labelsOn = !UI.labelsOn; }
  }
}
// the Penitent's lantern: the main light in the dungeon, carried in the left hand
function updateLantern(H) {
  if (!WORLD.level) return;
  const look = LOOK[WORLD.depth === 0 ? 'town' : WORLD.level.zoneName] || LOOK.abbey;
  const la = look.lantern;
  if (!Game.lantern) Game.lantern = { x: 0, y: 1, z: 0, color: [1, 0.7, 0.4], intensity: 0, radius: 6, flicker: 0.12, priority: 10 };
  const L = Game.lantern;
  let p = H.vis && H.vis.lanternAt();
  if (!p) p = [H.x + Math.sin(H.rot + 1.2) * 0.3, 1.05, H.z + Math.cos(H.rot + 1.2) * 0.3];
  // light the hero from the lantern side and a little toward the camera, so the figure reads against the floor
  L.x = H.x + (p[0] - H.x) * 0.5 + 0.45; L.y = 1.55 + H.y; L.z = H.z + (p[2] - H.z) * 0.5 + 0.45;
  L.color = [la[0], la[1], la[2]]; L._c = null;
  L.intensity = la[3] * 0.8 * (H.alive ? 1 : 0.5); L.radius = la[4] * (H.lightMul || 1);
  if (!R3.lightSources.has(L)) addLight(L);
  GFX.S.fill = [H.x, 1.0, H.z, 7.5 * (H.lightMul || 1)]; GFX.S.fillC = [la[0] * 0.22, la[1] * 0.2, la[2] * 0.2];
  // a soft fill so the hero never drowns in black
  FX.extraFlames = [{ x: p[0], y: p[1], z: p[2], w: 3, h: 5, g: 1.2, glow: GFX.S.v2 ? 1.5 : 0.45, seed: 7 }];   // v2: the lantern wears a halo, as on the concept sheet
}

// ---------------------------------------------------------------- hero control
function controlHero(dt) {
  const H = WORLD.hero;
  updateCursorTargets();
  findInteractTarget();
  if (H.stun > 0) { H.moveSpeedNow = 0; return; }
  if (pressed('x')) heroCastSkill(H, H.slots[0]);
  if (pressed('y')) heroCastSkill(H, H.slots[1]);
  if (pressed('b') || pressed('b_skill')) heroCastSkill(H, H.slots[2]);
  if (pressed('rt')) heroCastSkill(H, H.slots[3]);
  if (pressed('lb')) H.quickPotion('heal');
  if (pressed('rb')) H.quickPotion('mana');
  if (pressed('lt')) { const i = H.inv.findIndex(o => o && o.base === 'scrollTP'); if (i >= 0) H.useItem(i); else { UI.msg('You have no Town Portal scrolls.', '#c06040'); SFX.play('error'); heroBark('noportal', 4); } }
  if (IN.mouse.rightClick && !H.busy()) heroCastSkill(H, H.slots[0]);
  const mx = IN.axes.lx, my = IN.axes.ly;
  const moving = Math.hypot(mx, my) > 0.12;
  H.moveSpeedNow = 0;
  if (moving) Game.walkTo = null;
  if (IN.mouse.leftClick && !moving) {
    const hm = Game.hoverMonster, hi = Game.hoverInteract, hd = Game.hoverDrop;
    if (hm) Game.walkTo = { monster: hm };
    else if (hd) Game.walkTo = { drop: hd };
    else if (hi) Game.walkTo = { target: hi };
    else if (Game.cursorGround) Game.walkTo = { x: Game.cursorGround.x, z: Game.cursorGround.z };
    Game.path = null;
  } else if (IN.mouse.left && !moving && Game.walkTo && Game.walkTo.x !== undefined && Game.cursorGround) {
    Game.walkTo = { x: Game.cursorGround.x, z: Game.cursorGround.z, hold: true };
  }
  if (H.whirl) return;
  if (H.busy()) return;
  if (moving) {
    const [wx, wz] = stickToWorld(mx, my);
    const mag = Math.min(1, Math.hypot(mx, my));
    const sp = H.moveSpeed * H.speedMul() * (mag < 0.6 ? 0.55 : 1);
    const l = Math.hypot(wx, wz) || 1;
    moveWithCollision(H, wx / l * sp * dt, wz / l * sp * dt);
    turnToward(H, Math.atan2(wx, wz), dt, 16);
    H.moveSpeedNow = sp;
  } else if (Game.walkTo) {
    walkToward(H, dt);
  }
  if (held('a') && !H.busy()) {
    const t = Game.interactTarget;
    const aim = heroAim(H, 2.6, 0.9);
    const meleeT = meleeTargetAt(H, aim.target ? Math.atan2(aim.target.x - H.x, aim.target.z - H.z) : H.rot, 1.4, 1.0);
    if (meleeT) {
      aim.angle = Math.atan2(meleeT.x - H.x, meleeT.z - H.z);
      heroBasicAttack(H, aim);
    } else if (pressed('a') && t) interact(t);
    else if (aim.target && aim.target.dist(H) < 3.2) {
      const dx = aim.target.x - H.x, dz = aim.target.z - H.z, l = Math.hypot(dx, dz);
      moveWithCollision(H, dx / l * H.moveSpeed * dt, dz / l * H.moveSpeed * dt); H.rot = Math.atan2(dx, dz); H.moveSpeedNow = H.moveSpeed;
    } else if (pressed('a') && WORLD.depth > 0) heroBasicAttack(H, aim);
  }
}
function walkToward(H, dt) {
  const W = Game.walkTo;
  let tx, tz;
  if (W.monster) {
    if (!W.monster.alive) { Game.walkTo = null; return; }
    tx = W.monster.x; tz = W.monster.z;
    const range = 1.3 + W.monster.radius;
    if (H.dist(W.monster) <= range) {
      if (!H.busy()) heroBasicAttack(H, { angle: Math.atan2(tx - H.x, tz - H.z), target: W.monster });
      if (!IN.mouse.left) Game.walkTo = null;
      return;
    }
  } else if (W.target) {
    const T = W.target; tx = T.x; tz = T.z;
    if (Math.hypot(tx - H.x, tz - H.z) < (T.r || 1.2) + 0.4) { interact(T); Game.walkTo = null; return; }
  } else if (W.drop) {
    tx = W.drop.x; tz = W.drop.z;
    if (Math.hypot(tx - H.x, tz - H.z) < 1.0) { pickupDrop(W.drop); Game.walkTo = null; return; }
  } else { tx = W.x; tz = W.z; if (Math.hypot(tx - H.x, tz - H.z) < 0.15) { Game.walkTo = null; return; } }
  Game.pathT -= dt;
  const goal = `${Math.floor(tx)},${Math.floor(tz)}`;
  if (!Game.path || Game.pathT <= 0 || Game.pathGoal !== goal) { Game.path = findPath(H.x, H.z, tx, tz); Game.pathT = 0.4; Game.pathGoal = goal; }
  let nx = tx, nz = tz;
  if (Game.path && Game.path.length) {
    while (Game.path.length > 1 && Math.hypot(Game.path[0][0] - H.x, Game.path[0][1] - H.z) < 0.45) Game.path.shift();
    [nx, nz] = Game.path[0];
    if (Game.path.length === 1) { nx = tx; nz = tz; }
  }
  const dx = nx - H.x, dz = nz - H.z, l = Math.hypot(dx, dz);
  if (l < 0.05) { if (W.x !== undefined) Game.walkTo = null; return; }
  const sp = H.moveSpeed * H.speedMul();
  const ox = H.x, oz = H.z;
  moveWithCollision(H, dx / l * Math.min(sp * dt, l), dz / l * Math.min(sp * dt, l));
  turnToward(H, Math.atan2(dx, dz), dt, 16);
  H.moveSpeedNow = sp;
  if (Math.hypot(H.x - ox, H.z - oz) < 1e-4 && !W.hold) Game.walkTo = null;
}
// A* on the tile grid (8-directional)
function findPath(sx, sz, tx, tz) {
  const L = WORLD.level; if (!L) return null;
  const W = L.w, s = Math.floor(sz) * W + Math.floor(sx);
  let gx = Math.floor(tx), gz = Math.floor(tz);
  if (!L.cellFree(gx, gz)) {
    let best = null, bd = 1e9;
    for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) { if (!L.cellFree(gx + dx, gz + dz)) continue; const d = Math.hypot(gx + dx + 0.5 - sx, gz + dz + 0.5 - sz) * 0.2 + Math.hypot(dx, dz); if (d < bd) { bd = d; best = [gx + dx, gz + dz]; } }
    if (!best) return [[tx, tz]];
    [gx, gz] = best;
  }
  const t = gz * W + gx;
  const g = new Map([[s, 0]]), came = new Map(), closed = new Set();
  const h = i => Math.hypot(i % W - gx, Math.floor(i / W) - gz);
  const heap = [[h(s), s]];
  const push = e => { heap.push(e); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = i * 2 + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
  let n = 0;
  while (heap.length && n++ < 40000) {
    const cur = pop()[1];
    if (cur === t) break;
    if (closed.has(cur)) continue; closed.add(cur);
    const cx = cur % W, cz = Math.floor(cur / W);
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const x = cx + dx, z = cz + dz;
      if (!L.cellFree(x, z)) continue;
      if (dx && dz && (!L.cellFree(cx + dx, cz) || !L.cellFree(cx, cz + dz))) continue;
      const ni = z * W + x, ng = g.get(cur) + (dx && dz ? 1.414 : 1);
      if (ng < (g.get(ni) ?? 1e9)) { g.set(ni, ng); came.set(ni, cur); push([ng + h(ni), ni]); }
    }
  }
  if (!came.has(t)) {
    const prev = new Int32Array(L.t.length).fill(-1); const q = [s]; prev[s] = s; let found = false;
    for (let qi = 0; qi < q.length; qi++) {
      const cur = q[qi]; if (cur === t) { found = true; break; }
      const cx = cur % W, cz = Math.floor(cur / W);
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const x = cx + dx, z = cz + dz, ni = z * W + x; if (prev[ni] >= 0 || !L.cellFree(x, z)) continue; prev[ni] = cur; q.push(ni); }
    }
    if (!found) return [[tx, tz]];
    const path = []; let c = t; while (c !== s) { path.push([c % W + 0.5, Math.floor(c / W) + 0.5]); c = prev[c]; }
    path.reverse(); path[path.length - 1] = [tx, tz]; return path;
  }
  const path = []; let c = t;
  while (c !== s && c !== undefined) { path.push([c % W + 0.5, Math.floor(c / W) + 0.5]); c = came.get(c); }
  path.reverse();
  if (path.length) path[path.length - 1] = [tx, tz];
  return path;
}
function separateHero(H) {
  for (const m of WORLD.monsters) {
    if (!m.alive) continue;
    const dx = H.x - m.x, dz = H.z - m.z, d = Math.hypot(dx, dz), r = H.radius + m.radius;
    if (d < r && d > 1e-4) { const push = (r - d); moveWithCollision(H, dx / d * push * 0.7, dz / d * push * 0.7); moveWithCollision(m, -dx / d * push * 0.3, -dz / d * push * 0.3); }
  }
  for (const n of WORLD.npcs) { const dx = H.x - n.x, dz = H.z - n.z, d = Math.hypot(dx, dz); if (d < 0.6 && d > 1e-4) moveWithCollision(H, dx / d * (0.6 - d), dz / d * (0.6 - d)); }
}
function updateNPCFacing(dt) {
  const H = WORLD.hero; if (!H) return;
  for (const n of WORLD.npcs) {
    const d = Math.hypot(H.x - n.x, H.z - n.z);
    const target = d < 5 ? Math.atan2(H.x - n.x, H.z - n.z) : TOWN_NPCS[n.id].rot;
    n.rot += clamp(angDiff(n.rot, target), -3 * dt, 3 * dt); n.vis.obj.rotation.y = n.rot;
    // villagers speak with their hands while the dialogue window is open
    const talking = Game.talkingTo === n && !!topPanel();
    if (talking && n.vis.anim !== 'talk') n.vis.play('talk', 3.2, true); else if (!talking && n.vis.anim === 'talk') n.vis.play('idle', 1, true);
  }
}

// cursor picking (mouse / touch)
function updateCursorTargets() {
  Game.hoverMonster = null; Game.hoverInteract = null; Game.hoverDrop = null; Game.cursorGround = null;
  const cv = document.getElementById('gl');
  // mouse + keyboard: a key press used to switch the cursor off, so skills fired from the keyboard ignored the mouse
  if (IN.lastDevice !== 'mouse' && IN.lastDevice !== 'touch' && !(IN.lastDevice === 'kb' && IN.mouse.moved)) { cv.style.cursor = 'default'; return; }
  Game.cursorGround = screenToGround(IN.mouse.x, IN.mouse.y);
  const sp = {}; let best = 46;
  for (const m of WORLD.monsters) {
    if (!m.alive || !m.vis || !m.vis.obj.visible) continue;
    worldToScreen(m.x, 0.9 * (m.T.boss ? 1.8 : 1) * (m.vis.scale || 1), m.z, sp);
    const d = Math.hypot(sp.x - IN.mouse.x, (sp.y - IN.mouse.y) * 0.7);
    if (d < best) { best = d; Game.hoverMonster = m; }
  }
  if (!Game.hoverMonster) {
    let bd = 0.55;
    for (const d of WORLD.drops) if (d.t >= 1) { const e = Math.hypot(d.x - Game.cursorGround.x, d.z - Game.cursorGround.z); if (e < bd) { bd = e; Game.hoverDrop = d; } }
    if (!Game.hoverDrop) {
      let bi = 0.9;
      for (const t of interactables()) { const d = Math.hypot(t.x - Game.cursorGround.x, t.z - Game.cursorGround.z); if (d < bi) { bi = d; Game.hoverInteract = t; } }
    }
  }
  cv.style.cursor = Game.hoverMonster ? 'crosshair' : (Game.hoverInteract || Game.hoverDrop) ? 'pointer' : 'default';
}
function interactables() {
  const list = [];
  for (const o of WORLD.objects) if (!o.used) list.push(o);
  for (const n of WORLD.npcs) list.push(n);
  for (const s of WORLD.special) list.push(s);
  return list;
}
function findInteractTarget() {
  const H = WORLD.hero; let best = null, bs = 1e9;
  const consider = (t, reach) => {
    const d = Math.hypot(t.x - H.x, t.z - H.z); if (d > reach) return;
    const da = Math.abs(angDiff(H.rot, Math.atan2(t.x - H.x, t.z - H.z)));
    const s = d + da * 0.6;
    if (s < bs) { bs = s; best = t; }
  };
  for (const d of WORLD.drops) if (d.t >= 1) consider(d, 1.3);
  for (const t of interactables()) consider(t, (t.r || 1) + 0.9);
  Game.interactTarget = best;
}
function interact(t) {
  const H = WORLD.hero;
  if (t.it) { pickupDrop(t); return; }
  H.rot = Math.atan2(t.x - H.x, t.z - H.z);
  if (t.vis && t.title) { talkTo(t); return; }
  if (t.kind === 'stairsDown') { SFX.play('stairs'); changeLevel(WORLD.depth + 1, 'up'); return; }
  if (t.kind === 'stairsUp') { SFX.play('stairs'); changeLevel(WORLD.depth - 1, WORLD.depth === 1 ? 'abbey' : 'down'); return; }
  if (t.kind === 'portal') { usePortal(); return; }
  if (t.kind === 'waystone') { openWaystone(); return; }
  if (t.type) { useObject(t); return; }
}

// ---------------------------------------------------------------- levels
function levelSeed(depth) { if (!Game.seeds[depth]) Game.seeds[depth] = (Math.random() * 1e9) | 0; return Game.seeds[depth]; }
function stashLevel() {
  if (!WORLD.root) return;
  R3.scene.remove(WORLD.root);
  const lights = [...R3.lightSources].filter(l => !l.transient && l !== Game.lantern);
  Game.cache[WORLD.depth] = { level: WORLD.level, root: WORLD.root, monsters: WORLD.monsters, drops: WORLD.drops, objects: WORLD.objects, npcs: WORLD.npcs, special: WORLD.special, lights, decals: FX.decals };
  const keys = Object.keys(Game.cache).map(Number).filter(d => d > 0 && d !== WORLD.depth);
  if (keys.length > 3) { const old = keys.sort((a, b) => Math.abs(b - WORLD.depth) - Math.abs(a - WORLD.depth))[0]; delete Game.cache[old]; }
  WORLD.projectiles = []; WORLD.effects = [];
  clearLights(); FX.add.clear(); FX.soft.clear(); FX.decals = [];
  for (const d of WORLD.drops) if (d.label) { d.label.remove(); d.label = null; }
  WORLD.drops = [];   // the stashed level keeps its own list; nothing may label it while the next level loads
  WORLD.root = null;
}
function restoreOrBuild(depth) {
  const c = Game.cache[depth];
  if (c) {
    Object.assign(WORLD, { level: c.level, root: c.root, monsters: c.monsters, drops: c.drops, objects: c.objects, npcs: c.npcs, special: c.special });
    R3.scene.add(c.root); for (const l of c.lights) addLight(l); FX.decals = c.decals; FX.fires = c.level.fires || [];
    delete Game.cache[depth];
    return;
  }
  WORLD.root = new Node(); R3.scene.add(WORLD.root);
  WORLD.monsters = []; WORLD.drops = []; WORLD.objects = []; WORLD.npcs = []; WORLD.special = [];
  let L;
  if (depth === 0) { L = buildTown(); }
  else if (Game.showcase && depth === 4) { L = buildShowcaseLevel(); }
  else { L = new Level(depth, levelSeed(depth)); L.generate(); L.buildTiles(); L.decorate(); L.planSpawns(monsterTable(depth)); }
  WORLD.level = L;
  { const lk = !L.showcase && LOOK[L.zoneName] && LOOK[L.zoneName].lightK || 1;
    for (const s0 of L.lightSrc) { const s = lk === 1 ? s0 : Object.assign({}, s0, { intensity: s0.intensity * lk }); addLight(typeof vLevelLight === 'function' && !L.showcase ? vLevelLight(s, depth) : s); } }
  FX.fires = L.fires || [];
  FX.decals = [];
  for (const d of L.decals) FX.decals.push({ type: d.type, x: d.x, z: d.z, s: d.s, rot: d.rot });
  if (depth === 0) {
    spawnTownNPCs();
    WORLD.special.push({ kind: 'stairsDown', x: 23, z: 6.2, r: 1.2, name: 'The Sunken Abbey' });
    WORLD.special.push({ kind: 'waystone', x: L.waystone.x, z: L.waystone.z + 0.4, r: 1.3 });
  } else {
    spawnObjects(L);
    if (L.stairsUp) WORLD.special.push({ kind: 'stairsUp', x: L.stairsUp[0] + 1, z: L.stairsUp[1] + 1.2, r: 1.1 });
    if (L.stairsDown) WORLD.special.push({ kind: 'stairsDown', x: L.stairsDown[0] + 1, z: L.stairsDown[1] + 1, r: 1.3 });
    const R = RNG(L.seed + 5);
    for (const sp of L.spawns) {
      const T = MONSTERS[sp.type];
      let champ = null;
      if (R() < 0.06 && !T.flying) {
        const nm = R.pick(CHAMPION_NAMES[0]) + R.pick(CHAMPION_NAMES[1]) + ' ' + R.pick(CHAMPION_NAMES[2]);
        const mods = R.shuffle(Object.keys(CHAMPION_MODS)).slice(0, 1 + (depth > 4 ? 1 : 0) + (depth > 8 ? 1 : 0));
        champ = { name: nm, mods, glow: mods.includes('fire') ? [0.12, 0.04, 0] : mods.includes('cold') ? [0.02, 0.05, 0.12] : mods.includes('thunder') ? [0.08, 0.08, 0.12] : [0.07, 0.05, 0.0] };
      }
      const m = new Monster(sp.type, depth, { champion: champ });
      m.x = sp.x; m.z = sp.z; m.rot = R() * TAU; m.syncVisual(); m.vis.cur = m.rot;
      WORLD.monsters.push(m);
      if (champ) {
        for (let i = 0; i < WORLD.monsters.length; i++) {
          const o = WORLD.monsters[i];
          if (o !== m && o.alive && o.id === m.id && o.dist(m) < 3 && !o.champion && !o.minion) { o.removeVisual(); const mm = new Monster(o.id, depth, { minion: true }); mm.x = o.x; mm.z = o.z; mm.syncVisual(); WORLD.monsters[i] = mm; }
        }
      }
    }
    if (typeof vExtraSpawns === 'function') vExtraSpawns(L, depth, R);
    spawnBoss(depth);
  }
}
const BOSS_FOR_DEPTH = { 3: ['flayer', 'q1'], 6: ['hollowKing', 'q2'], 9: ['webMother', 'q3'], 12: ['vaelzhor', 'q4'] };
function spawnBoss(depth) {
  const b = BOSS_FOR_DEPTH[depth]; if (!b) return;
  const H = WORLD.hero; if (!H || H.quests[b[1]] >= 2) return;
  const L = WORLD.level, r = L.endRoom;
  let x = r.cx, z = r.cz;
  if (L.stairsDown) { x = L.stairsDown[0] + 1; z = L.stairsDown[1] - 1.5; }
  for (let k = 0; k < 40 && !canStand(x, z, 0.6); k++) { x = r.cx + rand.range(-2.5, 2.5); z = r.cz + rand.range(-2.5, 2.5); }
  const m = new Monster(b[0], depth); m.x = x; m.z = z; m.rot = rand() * TAU; m.syncVisual();
  for (const o of WORLD.monsters) if (o.dist(m) < 4) { o.removeVisual(); o.alive = false; o.deadT = 99; }
  WORLD.monsters.push(m);
  if (b[0] === 'vaelzhor') { for (let i = 0; i < 6; i++) addLight({ x: x + Math.cos(i) * 4, y: 0.5, z: z + Math.sin(i) * 4, color: 0xff3010, intensity: 6, radius: 6, flicker: 0.4 }); fxDecal('rune', x, z, 6, 0, WORLD.root); }
  if (b[0] === 'hollowKing') { fxDecal('rune', x, z, 5, 0, WORLD.root); addLight({ x, y: 2.5, z, color: 0x80a0ff, intensity: 4, radius: 7, flicker: 0.2 }); }
}
async function changeLevel(depth, arrival) {
  if (Game.transitioning) return;
  Game.transitioning = true;
  closeAllPanels();
  await UI.fadeTo(1, 450);
  try { await enterLevel(depth, arrival); } catch (e) { console.error(e); }
  if (depth > 0 && arrival === 'down') setTimeout(() => heroBark('descend', 40), 1800);
  await new Promise(r => setTimeout(r, 60));
  UI.fadeTo(0, 700);
  Game.transitioning = false;
}
async function enterLevel(depth, arrival) {
  const H = WORLD.hero;
  const portalBack = arrival === 'portalBack' ? Game.portalReturn : null;
  stashLevel();
  WORLD.depth = depth;
  // make sure every sprite this level needs is in memory (and drop what the other zones used)
  const need = [...ALWAYS_SETS, ...setsForDepth(depth), ...(Game.showcase && depth === 4 ? ZONE_SETS.ashen : []), ...(H ? H.gearLayers().map(l => l.set) : [])];
  if (need.some(n => !SETS[n])) UI.zone('', 'Descending…');
  await loadSetsSafe(need);
  unloadSetsExcept(need);
  restoreOrBuild(depth);
  const L = WORLD.level, Z = L.zone;
  let p = null;
  if (portalBack) { p = [portalBack.x, portalBack.z]; Game.portalReturn = null; }
  else if (arrival === 'portal' && depth === 0) p = [25.6, 26.4];
  else if (depth === 0) p = arrival === 'abbey' ? [23.5, 8.0] : L.townSpawn;
  else if (arrival === 'down' && L.stairsDown) p = [L.stairsDown[0] + 1, L.stairsDown[1] + 2.6];
  else if (L.stairsUp) p = [L.stairsUp[0] + 1, L.stairsUp[1] + 2.4];
  if (L.showcase) p = [10.5, 12.6];
  if (!p) p = [L.startRoom.cx, L.startRoom.cz];
  H.x = p[0]; H.z = p[1];
  for (let k = 0; k < 60 && !canStand(H.x, H.z, H.radius); k++) { H.x = p[0] + rand.range(-1.5, 1.5); H.z = p[1] + rand.range(-1.5, 1.5); }
  H.rot = Math.PI / 4; H.action = null; H.leap = null; H.whirl = null; H.y = 0;
  if (!H.vis) H.rebuildVisual();
  WORLD.root.add(H.vis.obj);
  H.syncVisual(); H.vis.cur = H.rot;
  Game.walkTo = null; Game.path = null; WORLD.flowCell = -1;
  prepareLevelGfx(L);
  setCameraTarget(H.x, 0, H.z);
  setMusic(Z.music); setAmbience(depth === 0 ? 'town' : L.showcase ? 'catacombs' : L.zoneName);
  if (depth > 0) {
    H.maxDepth = Math.max(H.maxDepth, depth);
    if (!window.ACTION && [1, 4, 7, 10].includes(depth) && !H.waystones[depth]) { H.waystones[depth] = true; setTimeout(() => UI.msg('A waystone in Ravenhollow now leads here.', '#80a0ff'), 3000); }
  }
  rebuildPortalVisual();
  UI.target = null; UI.targetFade = 0;
  UI.zone(depth === 0 ? 'Ravenhollow' : Z.name, depth === 0 ? 'Night falls on the village' : `Level ${depth}`);
  if (depth === 0) { refreshStock(); H.hp = H.maxHp; }
  saveGame();
}
// renderer state for a level: grade, occluder heights, floor decals
function prepareLevelGfx(L) {
  applyLook(L.depth === 0 ? 'town' : L.zoneName);
  GFX.setOccluders(L.w, L.h, 4, L.occ);
  GFX.clearDecals(0, 0, Math.max(L.w, L.h));
  repaintDecals();
}
function respawnInTown() {
  const H = WORLD.hero;
  document.querySelectorAll('.death').forEach(e => e.remove());
  const lost = Math.floor(H.gold * 0.2); H.gold -= lost;
  H.alive = true; H.hp = H.maxHp; H.mana = H.maxMana; H.poison = 0; H.burn = 0; H.slow = 0; H.stun = 0; H.freeze = 0;
  if (H.vis) { if (H.vis.obj.parent) H.vis.obj.parent.remove(H.vis.obj); H.vis.dispose(); H.vis = null; }
  Game.state = 'play';
  GFX.S.sat = (LOOK.town || {}).sat || 0.7;
  changeLevel(0, 'portal');
  setTimeout(() => UI.msg(lost ? `You awaken in Ravenhollow, ${fmtNum(lost)} gold poorer.` : 'You awaken in Ravenhollow.', '#c06040', true), 1500);
}
Game.onHeroDeath = function () {
  Game.state = 'dead'; Game.deathT = 0;
  setTimeout(() => {
    if (Game.state !== 'dead') return;
    const d = $('div', 'death', document.body, `<div class="dt">You have died</div><div class="ds">The lantern gutters. The dark comes in…</div><div class="dp">${glyph('a')} ${window.ACTION ? 'Rise and try the chamber again' : 'Return to Ravenhollow'}</div>`);
    d.onclick = () => respawnInTown();
  }, 1600);
  const s0 = GFX.S.sat; GFX.S.sat = 0.15;
  setTimeout(() => { if (Game.state === 'dead') GFX.S.sat = s0 * 0.6; }, 4000);
};
Game.onBossKilled = function (m) {
  const H = WORLD.hero, q = m.T.quest;
  H.quests[q] = 2;
  SFX.play('questDone');
  const txt = { q1: 'Brother Malric is slain. His hunger is ended.', q2: 'The Buried Bishop is silenced. The ossuary falls quiet.', q3: 'The Mother of Webs is dead. The deep caves are still.', q4: "Vael'Zhor is vanquished. The Sunken Abbey sleeps at last." }[q];
  UI.msg(txt, '#f0d290', true);
  setTimeout(() => UI.msg('Return to Father Osric.', '#c8a45a'), 3000);
  if (q === 'q4') setTimeout(() => showVictory(), 3500);
  saveGame();
};

// ---------------------------------------------------------------- portals
function castTownPortal() {
  const H = WORLD.hero;
  if (WORLD.depth === 0) { UI.msg('You are already in Ravenhollow.', '#a09080'); return false; }
  const a = H.rot;
  let px = H.x, pz = H.z;
  for (const da of [0, 0.6, -0.6, 1.2, -1.2, 1.8, -1.8, 2.4, -2.4, Math.PI]) { const x = H.x + Math.sin(a + da) * 1.5, z = H.z + Math.cos(a + da) * 1.5; if (canStand(x, z, 0.45) && hasLOS(WORLD.level, H.x, H.z, x, z)) { px = x; pz = z; break; } }
  WORLD.portalObj = { depth: WORLD.depth, x: px, z: pz };
  rebuildPortalVisual(); SFX.play('portal', { x: px, z: pz });
  UI.msg('A portal to Ravenhollow opens.', '#80a0ff');
  return true;
}
let PORTAL_VIS = null;
function rebuildPortalVisual() {
  if (PORTAL_VIS) { if (PORTAL_VIS.mesh.parent) PORTAL_VIS.mesh.parent.remove(PORTAL_VIS.mesh); removeLight(PORTAL_VIS.light); const i = WORLD.special.indexOf(PORTAL_VIS.spec); if (i >= 0) WORLD.special.splice(i, 1); PORTAL_VIS = null; }
  const P = WORLD.portalObj; if (!P || !WORLD.root) return;
  let x, z;
  if (WORLD.depth === P.depth) { x = P.x; z = P.z; } else if (WORLD.depth === 0) { x = 25.6; z = 27.6; } else return;
  // a standing oval of blue fire: a glow sprite plus a ring of rising sparks
  const mesh = new Node();
  mesh.draw = () => {
    GFX.S.glows.push({ x, y: 1.05, z, w: 80, h: 130, g: 0.6 + Math.sin(G.time * 3) * 0.08, c: [0.3, 0.45, 1.0] });
    (FX.extraFlames = FX.extraFlames || []).push({ x, y: 0.05, z, w: 30, h: 92, g: 1.3, glow: 0.7, seed: 3.3, speed: 0.8, tintA: [0.35, 0.6, 1.5], tintB: [0.06, 0.1, 0.6] });
  };
  WORLD.root.add(mesh);
  const light = addLight({ x, y: 1.2, z: z + 0.3, color: 0x5a7aff, intensity: 6, radius: 6, flicker: 0.1, priority: 2, transient: true });
  const spec = { kind: 'portal', x, z, r: 1.0 };
  WORLD.special.push(spec);
  PORTAL_VIS = { mesh, light, spec, x, z };
}
function updatePortals(dt) {
  if (!PORTAL_VIS) return;
  const { x, z } = PORTAL_VIS;
  const n = Math.floor(dt * 70 + Math.random());
  for (let i = 0; i < n; i++) {
    const a = Math.random() * TAU, rx = 0.42, ry = 0.8;
    // the ring stands upright, facing the camera (its plane is spanned by the screen-right axis and up)
    const u = Math.cos(a) * rx, v = Math.sin(a) * ry;
    FX.add.emit({ x: x + u * GFX.CR[0], y: 1.05 + v, z: z + u * GFX.CR[2], vx: 0, vy: 0.25, vz: 0, c: [0.35, 0.55, 1.4], c2: [0.15, 0.2, 1.0], life: 0.7, s: 0.05, drag: 1 });
  }
}
function usePortal() {
  const P = WORLD.portalObj; if (!P) return;
  SFX.play('portal');
  if (WORLD.depth === 0) { Game.portalReturn = P; WORLD.portalObj = null; changeLevel(P.depth, 'portalBack'); }
  else changeLevel(0, 'portal');
}

// ---------------------------------------------------------------- waystone
function openWaystone() {
  const H = WORLD.hero;
  const names = { 1: 'The Sunken Abbey — Level 1', 4: 'The Ossuary — Level 4', 7: 'The Hollow Deep — Level 7', 10: 'The Burning Abyss — Level 10' };
  const entries = [1, 4, 7, 10].map(d => ({ label: (H.waystones[d] ? '' : '✕ ') + names[d], disabled: !H.waystones[d], fn: () => { closeAllPanels(); SFX.play('portal'); changeLevel(d, 'up'); } }));
  entries.push({ label: 'Close', fn: () => popPanel() });
  openMenu('The Waystone', entries, { subtitle: 'Ancient runes hum beneath your fingers.' });
}

// ---------------------------------------------------------------- NPCs
function refreshStock() {
  const H = WORLD.hero, lv = Math.max(1, H.lvl), R = rand;
  const greta = [];
  for (let i = 0; i < 14; i++) {
    let it = null;
    for (let k = 0; k < 20 && !it; k++) { const c = randomItem(lv + R.int(0, 3), R, { equipOnly: true }); if (c.rarity !== 3 && ['weapon', 'armor', 'helm', 'lantern', 'gloves', 'boots'].includes(c.kind)) it = c; }
    if (!it) continue;
    it.identified = true; greta.push(it);
  }
  for (const b of ['shortSword', 'ironLantern', 'leatherArmor', 'cap']) if (BASES[b].lvl <= lv + 3) greta.push(makeItem(b));
  Game.stock.greta = greta.slice(0, 18);
  const ys = ['potHeal', 'potMana', 'potRejuv', 'scrollTP', 'scrollID']; if (lv >= 6) ys.push('potFullHeal', 'potFullMana');
  Game.stock.ysolde = ys.map(b => makeItem(b));
  const tam = [];
  for (let i = 0; i < 12; i++) {
    const it = randomItem(lv + 3, R, { equipOnly: true, magicFind: 120 });
    if (it.rarity === 0) { it.rarity = 1; const suf = pickAffix(SUFFIXES, it.kind, lv + 3, R); if (suf) { it.suffix = suf[0]; it.stats[suf[1]] = rollRange(R, suf[2], suf[3]); } }
    it.identified = false; tam.push(it);
  }
  Game.stock.tam = tam;
}
const LINE = id => DIALOGUE.lines[id][1];
const QUOTE = id => '"' + LINE(id) + '"';
const linesOf = prefix => Object.keys(DIALOGUE.lines).filter(k => k.startsWith(prefix));
Game.lastLine = {};
function pickLine(prefix) {
  const L = linesOf(prefix); let id = rand.pick(L);
  if (L.length > 1 && id === Game.lastLine[prefix]) id = L[(L.indexOf(id) + 1) % L.length];
  Game.lastLine[prefix] = id; return id;
}
function talkTo(n) {
  const H = WORLD.hero;
  SFX.play('menuOpen');
  Game.talkingTo = n;
  if (n.id === 'osric') return talkOsric();
  if (n.id === 'ysolde') { const healed = H.hp < H.maxHp || H.poison > 0; H.hp = H.maxHp; H.mana = H.maxMana; H.poison = 0; if (healed) SFX.play('shrine'); }
  const desc = { greta: 'The forge glows red behind her. She wipes soot from her brow.', ysolde: 'She lays a cool hand on your forehead. Your wounds close.', tam: 'He grins with too many teeth and pats a lumpy sack.' }[n.id];
  const greet = pickLine(n.id + '_greet');
  const opts = [];
  if (n.id === 'greta') opts.push({ label: 'Trade', fn: () => { popPanel(); openShop({ name: 'Greta\'s Forge', blurb: 'Arms, armour and lanterns', stock: Game.stock.greta, price: it => itemValue(it) }); } });
  if (n.id === 'ysolde') opts.push({ label: 'Buy remedies', fn: () => { popPanel(); openShop({ name: 'Mother Ysolde', blurb: 'Potions and scrolls', stock: Game.stock.ysolde, infinite: true, price: it => itemValue(it) }); } });
  if (n.id === 'tam') opts.push({ label: 'Gamble', fn: () => { popPanel(); openShop({ name: 'Tam\'s Curiosities', blurb: 'Unidentified wares — pay your coin, take your chance', stock: Game.stock.tam, price: it => Math.round(400 + it.ilvl * 120 + BASES[it.base].price * 0.5) }); } });
  opts.push({ label: 'Talk', fn: () => { popPanel(); const id = pickLine(n.id + '_talk'); openDialog(n.name, QUOTE(id), [{ label: 'Farewell', fn: () => popPanel() }], { subtitle: n.title, voice: id, onClose: endTalk }); } });
  opts.push({ label: 'Farewell', fn: () => popPanel() });
  openDialog(n.name, `<i>${desc}</i>\n\n${QUOTE(greet)}`, opts, { subtitle: n.title, voice: greet, onClose: endTalk });
}
function endTalk() { setTimeout(() => { if (!topPanel()) Game.talkingTo = null; }, 50); }
function talkOsric() {
  const H = WORLD.hero, Q = H.quests;
  let id;
  const rewards = { q1: ['potRejuv', 500], q2: ['potFullHeal', 2000], q3: ['potFullMana', 5000], q4: ['potRejuv', 10000] };
  const order = ['q1', 'q2', 'q3', 'q4'];
  let payout = null;
  for (const q of order) if (Q[q] === 2) { Q[q] = 3; payout = q; break; }
  if (payout) {
    id = `osric_${payout}done`;
    const r = rewards[payout];
    H.gold += r[1]; for (let i = 0; i < 3; i++) H.addItem(makeItem(r[0]), true);
    UI.msg(`Received ${fmtNum(r[1])} gold.`, '#e8c860');
    const nq = order[order.indexOf(payout) + 1]; if (nq && !Q[nq]) Q[nq] = 1;
    SFX.play('questDone'); saveGame();
  } else if (!Q.q1) { Q.q1 = 1; id = 'osric_intro'; }
  else { const cur = order.find(q => (Q[q] || 0) < 2); id = cur ? `osric_${cur}active` : 'osric_q4done'; }
  const unid = H.inv.filter(it => it && !it.identified).length;
  const opts = [];
  if (unid) opts.push({
    label: `Identify items (${unid} × 100 gold)`, fn: () => {
      let n = 0; for (const it of H.inv) if (it && !it.identified && H.gold >= 100) { it.identified = true; H.gold -= 100; n++; }
      popPanel();
      if (n) { SFX.play('shrine'); openDialog('Father Osric', `${QUOTE('osric_identify')}\n\n${n} item${n > 1 ? 's' : ''} identified.`, [{ label: 'Thank you', fn: () => popPanel() }], { voice: 'osric_identify', onClose: endTalk }); }
      else openDialog('Father Osric', QUOTE('osric_nogold'), [{ label: 'Farewell', fn: () => popPanel() }], { voice: 'osric_nogold', onClose: endTalk });
    }
  });
  opts.push({ label: 'Talk', fn: () => { popPanel(); const t = pickLine('osric_talk'); openDialog('Father Osric', QUOTE(t), [{ label: 'Farewell', fn: () => popPanel() }], { subtitle: 'Elder of Ravenhollow', voice: t, onClose: endTalk }); } });
  opts.push({ label: 'Farewell', fn: () => popPanel() });
  openDialog('Father Osric', QUOTE(id), opts, { subtitle: 'Elder of Ravenhollow', voice: id, onClose: endTalk });
}

// ---------------------------------------------------------------- save / load
function saveGame() {
  const H = WORLD.hero; if (!H || Game.state === 'title' || Game.showcase) return;
  try { localStorage.setItem(SAVE_KEY, JSON.stringify({ v: 2, hero: H.serialize(), seeds: Game.seeds, time: Date.now() })); } catch (e) { console.warn('save failed', e); }
}
function loadSave() { try { const s = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); return s && s.hero && CLASSES[s.hero.cls] ? s : null; } catch (e) { return null; } }

// ---------------------------------------------------------------- title
async function showTitle() {
  Game.state = 'title'; Game.showcase = false;
  WORLD.hero = null;
  stashLevel(); for (const k in Game.cache) delete Game.cache[k];
  WORLD.depth = 0;
  await loadSetsSafe(setsForDepth(0));
  restoreOrBuild(0);
  prepareLevelGfx(WORLD.level);
  Game.titleCam = { x: 23, z: 10 };
  setCameraTarget(23, 0, 10);
  if (Game.lantern) removeLight(Game.lantern);
  GFX.S.fill = null;
  FX.extraFlames = [];
  setMusic('town'); setAmbience('town');
  if (Game.titleEl) Game.titleEl.remove();
  Game.titleEl = $('div', 'title', UI.root, `<div class="tt">Ravenhollow</div><div class="ts">Beneath the Ashen Chapel</div><div class="tsound"></div>`);
  const snd = Game.titleEl.querySelector('.tsound');
  const chk = () => {
    if (!Game.titleEl) return;
    const running = Audio2.ctx && Audio2.ctx.state === 'running';
    snd.textContent = running ? '' : 'Click, tap or press any key to awaken the sound';
    if (running && Audio2.loaded && !Game.titleSpoken) { Game.titleSpoken = true; setTimeout(() => { if (Game.state === 'title') playVoice('title', { duck: 0.55, verb: 0.35 }); }, 1800); }
    setTimeout(chk, 500);
  }; chk();
  UI.hud.style.display = 'none'; UI.hint.style.opacity = 0;
  titleMenu();
}
function titleMenu() {
  const save = loadSave();
  const entries = [];
  if (save) entries.push({ html: `Continue <span style="color:var(--muted);font-size:14px">— ${esc(save.hero.name)}, level ${save.hero.lvl} Penitent</span>`, fn: () => startGame(save) });
  entries.push({
    label: 'New Game', fn: () => {
      if (save) { popPanel(); openMenu('Begin anew?', [{ label: 'Yes — abandon my current hero', fn: () => { closeAllPanels(); newHero(); } }, { label: 'No', fn: () => { popPanel(); titleMenu(); } }], { onB: () => { popPanel(); titleMenu(); } }); }
      else { popPanel(); newHero(); }
    }
  });
  entries.push({ label: 'Graphics test room', fn: () => startShowcase() });
  entries.push({ label: 'Options', fn: () => openOptions() });
  entries.push({ label: 'Controls', fn: () => openControls() });
  entries.push({ label: 'Credits', fn: () => openCredits() });
  entries.push({ label: 'Exit game', fn: () => quitApp() });
  openMenu('', entries, { cls: 'titlemenu', noX: true, onB: () => { }, menuCloses: false, footer: `<span style="font-size:13px">${glyph('a')} Select</span>` });
}
const HERO_NAMES = ['Aldric', 'Bertram', 'Corwin', 'Edric', 'Garrick', 'Osmund', 'Roderic', 'Wulfric', 'Anselm', 'Cuthbert', 'Leofric', 'Tobias'];
function giveStartingGear(h) {
  for (const b of CLASSES[h.cls].start) { const it = makeItem(b); const s = slotsFor(it)[0]; h.equip[s] = it; }
  for (let i = 0; i < 3; i++) h.addItem(makeItem('potHeal'), true);
  for (let i = 0; i < 2; i++) h.addItem(makeItem('potMana'), true);
  h.addItem(makeItem('scrollTP'), true); h.addItem(makeItem('scrollTP'), true);
  h.recalc(); h.hp = h.maxHp; h.mana = h.maxMana;
}
// a new Penitent: only the name is chosen
function newHero() {
  let name = rand.pick(HERO_NAMES);
  if (Game.titleEl) Game.titleEl.style.display = 'none';
  Game.camGoal = [23.5, 0, 22.5];
  const back = () => { popPanel(); Game.camGoal = null; Game.titleEl.style.display = ''; titleMenu(); };
  const p = new Panel('menu wide', { onB: back, menuCloses: false });
  p.el.style.top = 'auto'; p.el.style.bottom = '4vh'; p.el.style.transform = 'translateX(-50%)';
  const C = CLASSES.penitent;
  const render = () => {
    const f = p.focus || 0;
    p.items = []; p.el.innerHTML = '';
    $('div', 'ptitle', p.el, 'The Penitent');
    $('div', 'cd', p.el, `<div style="max-width:560px;margin:0 auto 10px;text-align:center;color:var(--text);font-size:17px;line-height:1.35">${C.desc}</div><div style="text-align:center;color:var(--muted);font-size:14px;margin-bottom:8px">Str ${C.base.str} · Dex ${C.base.dex} · Mag ${C.base.mag} · Vit ${C.base.vit}</div>`);
    const nm = $('div', 'mopt', p.el, `Name: <b>${esc(name)}</b> <span style="color:var(--muted);font-size:14px">(${glyph('a')} change)</span>`);
    p.add(nm, { a: () => { name = rand.pick(HERO_NAMES.filter(n => n !== name)); render(); p.setFocus(0); } });
    const go = $('div', 'mopt', p.el, `<b style="color:var(--gold)">Take up the lantern</b>`);
    p.add(go, { a: () => begin() });
    $('div', 'phelp', p.el, `${glyph('a')} Select &nbsp; ${glyph('b')} Back`);
    p.setFocus(Math.min(f, p.items.length - 1));
  };
  const begin = () => {
    const h = new Hero('penitent', name); giveStartingGear(h);
    Game.seeds = {};
    try { localStorage.removeItem(SAVE_KEY); } catch (e) { }
    startGame(null, h);
  };
  render(); pushPanel(p); p.setFocus(1);
}
function updateTitleScene(dt) {
  const t = G.time;
  const goal = Game.camGoal || [23 + Math.sin(t * 0.05) * 4, 0, 12 + Math.cos(t * 0.04) * 3];
  R3.camTarget.x += (goal[0] - R3.camTarget.x) * Math.min(1, dt * 1.2);
  R3.camTarget.z += (goal[2] - R3.camTarget.z) * Math.min(1, dt * 1.2);
  for (const n of WORLD.npcs) n.vis.update(dt, 0);
  if (Math.random() < dt * 3) FX.soft.emit({ x: R3.camTarget.x + rand.range(-12, 12), y: 0.15, z: R3.camTarget.z + rand.range(-12, 12), vx: 0.15, vy: 0.01, vz: 0.05, c: [0.42, 0.46, 0.55], life: 7, s: 1.6, s2: 2.6, a: 0.07 });
}
function startGame(save, hero) {
  closeAllPanels(); stopVoice();
  if (Game.titleEl) { Game.titleEl.remove(); Game.titleEl = null; }
  Game.camGoal = null;
  let H = hero;
  if (save) { H = Hero.load(save.hero); Game.seeds = save.seeds || {}; }
  WORLD.hero = H;
  H.recalc();
  WORLD.portalObj = null;
  UI.hud.style.display = '';
  Game.state = 'play';
  UI.fadeTo(1, 10).then(async () => { stashLevel(); for (const k in Game.cache) delete Game.cache[k]; H.rebuildVisual(); await enterLevel(0, 'start'); UI.fadeTo(0, 1200); });
  if (!save) setTimeout(() => UI.msg('Speak with Father Osric in the village square.', '#c8a45a', true), 2500);
  UI.hint.style.transition = 'none'; UI.hint.style.opacity = 1;
  UI.hint.innerHTML = IN.lastDevice === 'pad' ? `${glyph('view')} Inventory &nbsp; ${glyph('menu')} Menu &nbsp; ${glyph('up')} Map` : `I Inventory · K Skills · Tab Map · Esc Menu`;
  setTimeout(() => { UI.hint.style.transition = 'opacity 2s'; UI.hint.style.opacity = 0; }, 20000);
}
function showVictory() {
  openDialog('Victory', `${LINE('victory')}\n\n<i>${esc(WORLD.hero.name)} the Penitent may walk the dark as long as the lantern burns.</i>`, [{ label: 'Continue', fn: () => popPanel() }], { voice: 'victory', verb: 0.3 });
}

// ---------------------------------------------------------------- menus
function quitApp() {
  try { window.close(); } catch (e) { }
  setTimeout(() => UI.msg('Your progress is saved. Close this window, or press the Steam button and choose Exit Game.', '#a09080', true), 400);
}
function openPause() {
  const p = openMenu('Paused', [
    { label: 'Resume', fn: () => popPanel() },
    { label: 'Inventory & Character', fn: () => { popPanel(); openHeroScreen(); } },
    { label: 'Skills', fn: () => { popPanel(); openSkills(); } },
    { label: 'Options', fn: () => openOptions() },
    { label: 'Controls', fn: () => openControls() },
    ...(window.ACTION ? [{ label: 'Controller setup (choose your buttons)', fn: () => { popPanel(); ACT.padSetup(); } },
      { label: 'Controller test (F2)', fn: () => { popPanel(); ACT.padTest(true); } },
      { label: 'Controller: default buttons', fn: () => { popPanel(); ACT.padReset(); } }] : typeof PADT !== 'undefined' ? [
      { label: 'Controller setup (choose your buttons)', fn: () => { popPanel(); PADT.start(); } },
      { label: 'Controller test (F2)', fn: () => { popPanel(); PADT.test(true); } },
      { label: 'Controller: default buttons', fn: () => { popPanel(); PADT.reset(); } }] : []),
    { label: 'Save and quit to title', fn: () => { saveGame(); closeAllPanels(); quitToTitle(); } },
    { label: 'Save and exit game', fn: () => { saveGame(); quitApp(); } },
  ]);
  p.pauses = true;
}
async function quitToTitle() {
  await UI.fadeTo(1, 500);
  const H = WORLD.hero; if (H && H.vis && H.vis.obj.parent) H.vis.obj.parent.remove(H.vis.obj);
  WORLD.portalObj = null; rebuildPortalVisual();
  document.querySelectorAll('.death').forEach(e => e.remove());
  await showTitle();
  UI.fadeTo(0, 800);
}
function openOptions() {
  const S = G.settings;
  openMenu('Options', [
    { slider: true, label: 'Music volume', get: () => S.musicVol, set: v => { S.musicVol = v; applySettings(); } },
    { slider: true, label: 'Sound volume', get: () => S.sfxVol, set: v => { S.sfxVol = v; applySettings(); } },
    { slider: true, label: 'Voice volume', get: () => S.voiceVol ?? 0.9, set: v => { S.voiceVol = v; applySettings(); } },
    { slider: true, label: 'Brightness', get: () => (S.brightness - 0.6) / 1.0, set: v => { S.brightness = 0.6 + v * 1.0; applySettings(); } },
    { toggle: () => { S.grain = !S.grain; applySettings(); }, label: 'Film grain', get: () => S.grain ? 'On' : 'Off' },
    { toggle: () => { S.showDamage = !S.showDamage; applySettings(); }, label: 'Damage numbers', get: () => S.showDamage ? 'On' : 'Off' },
    { toggle: () => { try { localStorage.setItem('rh_cam', CAM_CLOSE ? 'far' : 'close'); } catch (e) { } saveGame(); location.reload(); }, label: 'Camera (restarts the game)', get: () => CAM_CLOSE ? 'Close' : 'Far' },
    { toggle: () => { const o = ['pilgrim', 'penitent', 'martyr'], i = o.indexOf(S.difficulty || 'penitent'); S.difficulty = o[(i + 1) % 3]; applySettings(); }, label: 'Difficulty (new levels)', get: () => ({ pilgrim: 'Pilgrim', penitent: 'Penitent', martyr: 'Martyr' })[S.difficulty || 'penitent'] },
    { toggle: () => { S.lantern = S.lantern === false; applySettings(); applyVigilSettings(); }, label: 'Lantern of the Penitent', get: () => S.lantern !== false ? 'On' : 'Off' },
    { toggle: () => { S.rhythm = S.rhythm === false; applySettings(); applyVigilSettings(); }, label: 'Combat rhythm', get: () => S.rhythm !== false ? 'On' : 'Off' },
    { toggle: () => { const fs = document.fullscreenElement; if (fs) document.exitFullscreen(); else if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => { }); }, label: 'Fullscreen', get: () => document.fullscreenElement ? 'On' : 'Off' },
    { label: 'Back', fn: () => popPanel() },
  ], { footer: `${glyph('a')} change &nbsp; ${glyph('b')} back` });
}
function openControls() {
  const rows = [
    ['Move', 'Left stick', 'WASD / click'], ['Attack · interact · pick up', 'A', 'Space / left click'], ['Skills', 'X · Y · B · RT', '1 · 2 · 3 · 4 / right click'],
    ['Healing potion', 'LB', 'Q'], [G.settings.lantern !== false ? 'Lamp oil' : 'Mana potion', 'RB', 'F'],
    ...(G.settings.rhythm !== false ? [['Slide (dodge)', 'LT', 'Shift'], ['Town Portal', 'D-pad right', 'T']] : [['Town Portal', 'LT · D-pad right', 'T']]),
    ...(G.settings.lantern !== false ? [['Shutter the lantern', 'Left stick click', 'L']] : []), ['Aim (optional)', 'Right stick', 'Mouse'],
    ['Inventory & character', 'View', 'I / C'], ['Skills panel', 'D-pad left', 'K'], ['Map', 'D-pad up', 'Tab'], ['Item labels', 'D-pad down', 'Alt (hold)'], ['Menu', 'Menu', 'Esc'],
  ];
  const html = `<table style="width:100%;font-size:15px;border-collapse:collapse">${rows.map(r => `<tr><td style="padding:3px 6px;color:var(--gold)">${r[0]}</td><td style="padding:3px 6px">${r[1]}</td><td style="padding:3px 6px;color:var(--muted)">${r[2]}</td></tr>`).join('')}</table>`;
  const pads = connectedPads();
  const status = pads.length
    ? `<div style="margin-top:12px;color:#7cc070">Controller detected: ${esc(pads[0].id.slice(0, 60))}</div>`
    : `<div style="margin-top:12px;color:#c08050">No controller detected yet. Press any button on the controller. If nothing happens, see the controller section in LEESMIJ.txt.</div>`;
  openDialog('Controls', html + status + `<div style="margin-top:6px;color:var(--muted);font-size:14px">Touch: tap to walk and attack, use the buttons at the top left, ✕ closes a window.</div>`, [{ label: 'Back', fn: () => popPanel() }]);
}
function openCredits() {
  openDialog('Credits', `<div class="credits">Ravenhollow — Beneath the Ashen Chapel<br>A love letter to the dark, gothic action-RPGs of the late nineties.<br><br>Every character, monster, wall and candle was modelled as signed-distance shapes in code and pre-rendered from sixteen directions, then lit again in real time.<br><br>The music is composed generatively and performed on recordings from the Versilian Community Sample Library and VSCO 2 Community Edition (CC0). Sound effects are designed from those recordings and from synthesis.<br><br>Voices: Kokoro-82M neural speech (Apache 2.0)<br>Design, code, art, sound and music: made with Claude</div>`, [{ label: 'Back', fn: () => popPanel() }]);
}

window.addEventListener('load', () => boot().catch(e => { console.error(e); const lt = document.getElementById('ltext'); if (lt) lt.textContent = 'Error: ' + e.message; }));
