'use strict';
// Two optional layers on top of the classic game, each with its own switch in Options:
//
//  THE LANTERN OF THE PENITENT  (G.settings.lantern)
//   Mana becomes the lantern's fire. It burns down slowly in the dungeon and every spell spends it, and the
//   light around the Penitent follows it. The darker it gets, the harder the dead hit and the faster they move,
//   but loot improves and blows find their mark more often (Radiant / Dim / Dark / Guttering). Fire is won back
//   from the dead (more from those that die burning), from votive candles on every level, and from lamp oil.
//   The lantern can be shuttered (L3 / L) to walk in the dark on purpose. In the dark, things come for you.
//
//  COMBAT RHYTHM  (G.settings.rhythm)
//   Melee blows are announced on the floor before they land; a slide (LT / Shift) slips out of them, and a
//   slide at the last moment is a perfect dodge (the world slows, the next blow is a critical). Life lost to a
//   blow can be won back by striking within a few seconds (penance). Battering a foe breaks its guard: a
//   staggered foe can be executed for fire and life. Heavy blows and kills land with a short hit-stop.
const VIG = {
  wisps: [], tele: [], ghosts: [], dash: { t: 0, cd: 0, dx: 0, dz: 1 }, iframes: 0, rally: 0, rallyT: 0, critNext: false,
  shut: false, tier: 0, ambushT: 40, now: 0, lastGhost: 0,
};
const vLantern = () => G.settings.lantern !== false;
const vRhythm = () => G.settings.rhythm !== false;
const vRand = (a, b) => a + Math.random() * (b - a);
const TIERS = [
  { name: 'Radiant', col: '#f4d08a', dmg: 1.0, speed: 1.0, crit: 0, mf: 0 },
  { name: 'Dim', col: '#d89a50', dmg: 1.1, speed: 1.0, crit: 0.03, mf: 15 },
  { name: 'Dark', col: '#c0603a', dmg: 1.25, speed: 1.12, crit: 0.08, mf: 40 },
  { name: 'Guttering', col: '#a03828', dmg: 1.4, speed: 1.2, crit: 0.12, mf: 60 },
];
function vTier() {
  const H = WORLD.hero;
  if (!vLantern() || !H || WORLD.depth === 0) return 0;
  const f = H.mana / Math.max(1, H.maxMana);
  let t = f > 0.66 ? 0 : f > 0.33 ? 1 : f > 0.04 ? 2 : 3;
  if (VIG.shut) t = Math.max(t, 2);
  return t;
}

// ------------------------------------------------------------------ settings, names, keys
function applyVigilSettings() {
  const on = vLantern();
  if (!VIG._names) VIG._names = { potMana: BASES.potMana.name, potFullMana: BASES.potFullMana.name };
  BASES.potMana.name = on ? 'Lamp Oil' : VIG._names.potMana;
  BASES.potFullMana.name = on ? 'Flask of Holy Oil' : VIG._names.potFullMana;
  if (!on) VIG.shut = false;
  // keyboard: Shift slides when combat rhythm is on (otherwise it is "attack in place"), L shutters the lantern
  if (vRhythm()) { delete KEY_MAP.ShiftLeft; delete KEY_MAP.ShiftRight; } else { KEY_MAP.ShiftLeft = 'a'; KEY_MAP.ShiftRight = 'a'; }
  delete KEY_ROLE.Space;
  KEY_MAP.KeyL = 'shutter';
  UI._ps = null;
}

// ------------------------------------------------------------------ the lantern
{
  const _hu = Hero.prototype.update;
  Hero.prototype.update = function (dt) {
    const m0 = this.mana;
    _hu.call(this, dt);
    if (this !== WORLD.hero || !vLantern()) return;
    const gain = this.mana - m0;
    if (WORLD.depth === 0) { this.mana = Math.min(this.maxMana, this.mana + this.maxMana * 0.08 * dt); return; }   // relit at the chapel
    // below the earth the flame only feeds itself to a glow (30%); above that it burns down unless shuttered
    if (gain > 0) this.mana = m0 + gain * (m0 / this.maxMana < 0.3 ? 0.5 : 0);
    if (!VIG.shut && this.alive) this.mana = Math.max(0, this.mana - this.maxMana * 0.0016 * dt);
  };
  // with the lantern system on, the dungeon's own lights are weaker and the air darker: the lantern carries you
  const _al = applyLook;
  applyLook = function (name) {
    _al(name);
    if (!vLantern() || name === 'town' || (LOOK[name] && LOOK[name].v2)) return;
    const S = GFX.S; S.amb = S.amb.map(v => v * 0.3); S.lift = S.lift.map(v => v * 0.25); S.expo *= 0.92;
  };
  const _ul = updateLantern;
  updateLantern = function (H) {
    if (!vLantern() || WORLD.depth === 0) { _ul(H); return; }
    const f = clamp(H.mana / Math.max(1, H.maxMana), 0, 1);
    const k = VIG.shut ? 0.2 : 0.26 + 0.74 * Math.pow(f, 0.7);
    const lm = H.lightMul; H.lightMul = (lm || 1) * k;
    _ul(H);
    H.lightMul = lm;
    if (Game.lantern) Game.lantern.intensity *= VIG.shut ? 0.35 : 0.4 + 0.6 * k;
    const fl = FX.extraFlames && FX.extraFlames[0];
    if (fl) { fl.w *= VIG.shut ? 0.4 : 0.5 + 0.6 * k; fl.h *= VIG.shut ? 0.4 : 0.5 + 0.6 * k; fl.glow *= VIG.shut ? 0.2 : k; }
  };
  // the dark: harder, faster foes; better spoils
  const _sm = Monster.prototype.speedMul;
  Monster.prototype.speedMul = function () { return _sm.call(this) * TIERS[VIG.tier].speed; };
  const _dl = dropLoot;
  dropLoot = function (m) {
    const H = WORLD.hero, b = TIERS[VIG.tier].mf;
    if (!H || !b) return _dl(m);
    H.d.magicFind = (H.d.magicFind || 0) + b;
    try { return _dl(m); } finally { H.d.magicFind -= b; }
  };
}
// fire flies home: small embers rise from the dead and stream into the lantern
function vWisps(x, z, n, amount) {
  for (let i = 0; i < n; i++) VIG.wisps.push({ x: x + vRand(-0.3, 0.3), y: vRand(0.5, 1.2), z: z + vRand(-0.3, 0.3), t: -i * 0.06, dur: vRand(0.5, 0.8), amt: amount / n, sx: 0, sy: 0, sz: 0, wob: Math.random() * 6 });
}
function vLevelLight(s, depth) {
  if (!vLantern() || !depth) return s;
  return Object.assign({}, s, { intensity: s.intensity * 0.36, radius: s.radius * 0.62 });
}
function vHarvest(m, src) {
  if (!vLantern() || WORLD.depth === 0) return;
  const H = WORLD.hero; if (!H) return;
  const burning = m.burn > 0;
  if (src !== H && !burning) return;
  let k = 0.03 + (burning ? 0.06 : 0) + (m.champion ? 0.06 : 0) + (m.T.boss ? 0.3 : 0);
  vWisps(m.x, m.z, burning ? 6 : 3, H.maxMana * k);
}
// votive candles: two or three on every level, each relights the lantern once
{
  const _so = spawnObjects;
  spawnObjects = function (L) {
    _so(L);
    if (!vLantern() || !WORLD.depth) return;
    const want = 2 + (Math.random() < 0.5 ? 1 : 0), placed = [];
    const st = L.stairsUp || L.start || [L.w / 2, L.h / 2];
    for (let tries = 0; tries < 600 && placed.length < want; tries++) {
      const x = 2 + Math.floor(Math.random() * (L.w - 4)), z = 2 + Math.floor(Math.random() * (L.h - 4));
      if (!L.cellFree(x, z) || !L.isFloor(x, z)) continue;
      let walls = 0; for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (!L.isFloor(x + dx, z + dz)) walls++;
      if (walls !== 1) continue;                                                     // against a wall, not in a corridor
      if (Math.hypot(x - st[0], z - st[1]) < 12) continue;
      if (placed.some(p => Math.hypot(p[0] - x, p[1] - z) < 16)) continue;
      if (WORLD.objects.some(o => Math.hypot(o.x - x, o.z - z) < 2)) continue;
      placed.push([x, z]);
      const o = { type: 'votive', name: 'Votive Candles', x: x + 0.5, z: z + 0.5, r: 0.7, used: false };
      o.light = addLight({ x: o.x, y: 0.7, z: o.z, color: 0xffa050, intensity: 2.4, radius: 3.4, flicker: 0.3 });
      const n = new Node();
      n.draw = () => {
        const sh = SETS.crypt_common; if (!sh) return;
        const hov = Game.hoverInteract === o || (Game.interactTarget === o && IN.lastDevice === 'pad');
        GFX.sprite(sh, 'candles_b', 0, 0, o.x, 0, o.z, o.used ? VOTIVE_OUT : hov ? HOVER_OPT : null);
      };
      o.mesh = n; WORLD.root.add(n);
      WORLD.objects.push(o);
    }
  };
  const _uo = useObject;
  useObject = function (o) {
    if (o.type !== 'votive') return _uo(o);
    if (o.used) return;
    const H = WORLD.hero; o.used = true;
    if (o.light) o.light.intensity = 0;
    SFX.play('shrine', { x: o.x, z: o.z }); vibrate(0.25, 0.4, 120);
    vWisps(o.x, o.z, 10, H.maxMana);   // the whole flame, carried over in embers
    if (VIG.shut) VIG.shut = false;
    UI.msg('You kindle the lantern at the votive candles.', '#f0c070', true);
  };
}
const VOTIVE_OUT = { tint: [0.3, 0.3, 0.34], emis: 0 };
// in the dark, the dark answers: now and then a few of the dead step out of it
function vAmbush(dt) {
  const H = WORLD.hero;
  if (!vLantern() || !WORLD.depth || !H || !H.alive || VIG.tier < 2) { VIG.ambushT = Math.max(VIG.ambushT, 20); return; }
  VIG.ambushT -= dt * (VIG.tier === 3 ? 1.5 : 1);
  if (VIG.ambushT > 0) return;
  VIG.ambushT = vRand(35, 55);
  let near = 0; for (const m of WORLD.monsters) if (m.alive && m.aggro && m.dist(H) < 12) near++;
  if (near >= 3) { VIG.ambushT = 12; return; }
  const table = monsterTable(WORLD.depth); if (!table.length) return;
  const n = 2 + (Math.random() < 0.4 ? 1 : 0); let made = 0;
  for (let tries = 0; tries < 60 && made < n; tries++) {
    const a = Math.random() * TAU, d = vRand(5.5, 7.5), x = H.x + Math.sin(a) * d, z = H.z + Math.cos(a) * d;
    if (!canStand(x, z, 0.4) || !hasLOS(WORLD.level, H.x, H.z, x, z)) continue;
    const m = new Monster(table[(Math.random() * table.length) | 0].type, WORLD.depth);
    m.x = x; m.z = z; m.aggro = true; WORLD.monsters.push(m); made++;
    fxSmoke(x, 0.3, z, 5, [0.05, 0.05, 0.06]);
  }
  if (made) { UI.msg('Something stirs in the dark…', '#b07060'); SFX.play('skeletonAggro', { vol: 0.6 }); }
}

// ------------------------------------------------------------------ combat rhythm
const vInCone = (ox, oz, rot, r, half, x, z, pad) => { const dx = x - ox, dz = z - oz, d = Math.hypot(dx, dz); if (d > r + pad) return false; return d < 0.4 || Math.abs(angDiff(rot, Math.atan2(dx, dz))) < half + pad / Math.max(d, 0.5); };
function vMeleeShape(m) {
  const T = m.T, big = T.heavy || T.boss || m.champion;
  if (T.model === 'wraith') return { circle: true, r: m.radius + 1.3, windup: 0.85 };
  return { r: m.radius + (big ? 1.3 : 1.05), half: big ? 1.15 : 0.75, windup: big ? 0.8 : 0.6 };
}
{
  const _am = Monster.prototype.attackMelee;
  Monster.prototype.attackMelee = function (H) {
    if (!vRhythm()) return _am.call(this, H);
    const m = this, K = vMeleeShape(this);
    this.rot = faceAngle(H.x - this.x, H.z - this.z);
    const windup = Math.max(K.windup, this.atkDur * 0.5), dur = windup + 0.4;
    const T = { owner: this, x: this.x, z: this.z, rot: this.rot, r: K.r, half: K.circle ? Math.PI : K.half, t: 0, dur: windup, track: windup * 0.45 };
    VIG.tele.push(T);
    this.startAction('attack', dur, () => {
      T.done = true;
      if (!H.alive) return;
      const inside = vInCone(T.x, T.z, T.rot, T.r, T.half, H.x, H.z, H.radius * 0.6);
      if (T.dodged) { vPerfect(); return; }
      if (!inside || VIG.iframes > 0) { SFX.play('swing', { x: m.x, z: m.z, vol: 0.4 }); return; }
      monsterHits(m, H);
    }, windup / dur, false);
    T.action = this.action;
    this.cd = dur + vRand(0.3, 0.9) * (this.T.heavy ? 1.5 : 1);
    SFX.play(this.T.sound + 'Attack', { x: this.x, z: this.z, vol: 0.5 });
  };
}
function vPerfect() {
  const H = WORLD.hero;
  VIG.critNext = true; FX.freeze = Math.max(FX.freeze || 0, 0.22);
  UI.floatText(H.x, 2.2, H.z, 'Perfect dodge', '#a8d8ff'); SFX.play('shadowstep', { vol: 0.7 }); vibrate(0.2, 0.6, 90);
  if (vLantern()) vWisps(H.x, H.z, 2, H.maxMana * 0.04);
}
function vStartDash(H) {
  const D = VIG.dash;
  if (D.cd > 0 || D.t > 0 || H.stun > 0 || !H.alive) return false;
  let [wx, wz] = stickToWorld(IN.axes.lx, IN.axes.ly);
  if (Math.hypot(wx, wz) < 0.2) { const a = (typeof cursorAngle === 'function' && IN.lastDevice !== 'pad' ? cursorAngle(H) : null) ?? H.rot; wx = Math.sin(a); wz = Math.cos(a); }
  const l = Math.hypot(wx, wz); D.dx = wx / l; D.dz = wz / l;
  D.t = 0.22; D.cd = 0.85; VIG.iframes = 0.28; D.start = VIG.now;
  for (const T of VIG.tele) if (!T.done && T.dur - T.t < 0.4 && vInCone(T.x, T.z, T.rot, T.r, T.half, H.x, H.z, H.radius * 0.6)) T.dodged = true;
  H.action = null; Game.walkTo = null;
  H.rot = Math.atan2(D.dx, D.dz);
  H.startAction('dodge', 0.29, null, 1);
  SFX.play('swingHeavy', { x: H.x, z: H.z, vol: 0.3, rate: 0.75 }); SFX.play('stepGravel', { x: H.x, z: H.z, vol: 0.7, rate: 0.8 });
  fxSmoke(H.x, 0.08, H.z, 2, [0.2, 0.18, 0.15]);
  return true;
}
function vGhost(H) {
  if (!H.vis || VIG.ghosts.length > 5 || VIG.now - VIG.lastGhost < 0.04) return;
  VIG.lastGhost = VIG.now;
  const v = new SpriteVis(H.vis.set, { hero: true, stride: H.vis.stride });
  v.setLayers(H.vis.layers); v.anim = H.vis.anim; v.t = H.vis.t; v.dur = H.vis.dur; v.speed = H.vis.speed; v.cur = H.vis.cur; v.req = H.vis.req;
  v.tint = [0.5, 0.52, 0.62]; v.glowAdd = 0.05; v.alpha = 0.26;
  v.obj.position.set(H.x, H.y, H.z); v.obj.rotation.y = H.rot;
  (WORLD.root || R3.scene).add(v.obj);
  VIG.ghosts.push({ vis: v, life: 0.22, max: 0.22 });
}
// one place for every blow: penance, guard, executions, the dark's bite, perfect-dodge crits
{
  const _ad = applyDamage;
  applyDamage = function (t, dmg, src, opts = {}) {
    const H = WORLD.hero;
    if (!t.alive) return 0;
    const heroHit = t === H, foeHit = !heroHit && H && src === H;
    if (heroHit && VIG.iframes > 0 && src && src !== H) return 0;
    let mul = 1, execute = false;
    if (heroHit && src instanceof Monster) mul *= TIERS[VIG.tier].dmg;
    if (foeHit) {
      const crit = TIERS[VIG.tier].crit;
      if ((crit && Math.random() < crit) || VIG.critNext) { if (!opts.crit) { mul *= 2; opts = Object.assign({}, opts, { crit: true }); } VIG.critNext = false; }
      if (vRhythm() && t.vigStag > 0) {
        t.vigStag = 0; t.stun = 0;
        if (!t.T.boss && !t.champion) execute = true; else mul *= t.T.boss ? 1.8 : 3;
        vExecuteFx(t, execute);
      }
    }
    if (mul !== 1) { dmg = Object.assign({}, dmg); for (const k of ['phys', 'fire', 'cold', 'light', 'poison']) if (dmg[k]) dmg[k] *= mul; }
    if (execute) dmg = Object.assign({}, dmg, { phys: t.hp * 4 + 999 });
    const hp0 = t.hp, total = _ad(t, dmg, src, opts);
    if (!vRhythm() || !H) return total;
    if (heroHit && total > 0 && src instanceof Monster) {
      VIG.rally = Math.min(H.maxHp * 0.5, VIG.rally + total * 0.75); VIG.rallyT = 2.4;
    }
    if (foeHit && total > 0) {
      VIG.hits = (VIG.hits || 0) + 1;
      if (VIG.rally > 0 && H.alive) {
        const back = Math.min(VIG.rally, total * 0.6 + H.maxHp * 0.02);
        H.hp = Math.min(H.maxHp, H.hp + back); VIG.rally -= back;
        if (back > H.maxHp * 0.02) FX.soft.emit({ x: H.x, y: 1.1, z: H.z, vx: 0, vy: 0.8, vz: 0, c: [1, 0.3, 0.2], life: 0.4, s: 0.25, s2: 0.6, a: 0.5 });
      }
      // guard: blows wear it down; it comes back after a few quiet seconds
      if (t.alive && !execute) {
        const max = t.T.boss ? 24 : (t.T.heavy ? 6 : 3) * (t.champion ? 1.6 : 1);
        if (t.vigPoise === undefined || VIG.now - (t.vigPoiseT || 0) > 3) t.vigPoise = max;
        t.vigPoiseT = VIG.now;
        t.vigPoise -= (opts.crit ? 2 : 1) + (opts.stun ? 1 : 0) + (total > t.maxHp * 0.15 ? 1 : 0);
        if (t.vigPoise <= 0) {
          t.vigPoise = max; t.vigStag = t.T.boss ? 1.1 : 1.7; t.stun = Math.max(t.stun, t.vigStag); t.action = null;
          if (t.vis) t.vis.play('hit', 0.5, true);
          UI.floatText(t.x, 2.0 + (t.T.boss ? 1 : 0), t.z, 'Staggered', '#f0c060'); SFX.play('block', { x: t.x, z: t.z, vol: 0.8, rate: 0.7 });
        }
      }
      if (opts.crit || total > hp0 * 0.5) FX.freeze = Math.max(FX.freeze || 0, 0.035);
    }
    return total;
  };
}
function vExecuteFx(t, kill) {
  const H = WORLD.hero;
  FX.freeze = Math.max(FX.freeze || 0, 0.11); R3.camShake = Math.max(R3.camShake, 0.5); vibrate(0.6, 0.8, 160);
  UI.floatText(t.x, 2.2 + (t.T.boss ? 1 : 0), t.z, kill ? 'Executed' : 'Broken', '#ffd070');
  SFX.play('smite', { x: t.x, z: t.z, vol: 0.9 });
  fxBurst(t.x, 1.0, t.z, [1, 0.75, 0.3], 30, 2.4, 0.12, 0.8);
  H.hp = Math.min(H.maxHp, H.hp + H.maxHp * 0.05);
  if (vLantern()) vWisps(t.x, t.z, 4, H.maxMana * 0.07);
}
{
  const _die = Monster.prototype.die;
  Monster.prototype.die = function (src, kind) {
    const was = this.alive;
    _die.call(this, src, kind);
    if (!was) return;
    vHarvest(this, src);
    if (vRhythm() && src === WORLD.hero) FX.freeze = Math.max(FX.freeze || 0, this.T.boss ? 0.2 : 0.045);
    this.vigStag = 0;
  };
}

// ------------------------------------------------------------------ per-frame
{
  const _ch = controlHero;
  controlHero = function (dt) {
    const H = WORLD.hero;
    if (vRhythm()) {
      const padLT = pressed('lt') && IN.lastDevice === 'pad', key = pressed('dash') && IN.lastDevice !== 'pad';
      if (padLT || key) { IN.cur.lt = false; vStartDash(H); }
    }
    if (pressed('right') && IN.lastDevice === 'pad') { const i = H.inv.findIndex(o => o && o.base === 'scrollTP'); if (i >= 0) H.useItem(i); else { UI.msg('You have no Town Portal scrolls.', '#c06040'); SFX.play('error'); } }
    if (vLantern() && WORLD.depth > 0 && (pressed('ls') || pressed('shutter'))) {
      VIG.shut = !VIG.shut; SFX.play(VIG.shut ? 'stoneSlide' : 'shrine', { vol: 0.35, rate: 1.6 });
      UI.msg(VIG.shut ? 'You shutter the lantern. The dark draws close.' : 'You open the lantern.', VIG.shut ? '#a07060' : '#f0c070');
    }
    _ch(dt);
  };
  const _up = update;
  update = function (dt) {
    _up(dt);
    if (Game.state !== 'play' || !WORLD.hero) return;
    const H = WORLD.hero, sdt = (FX.freeze || 0) > 0 ? dt * 0.08 : dt;
    VIG.now += dt;
    VIG.tier = vTier();
    if (WORLD.depth === 0) VIG.shut = false;
    // the slide
    const D = VIG.dash;
    if (D.cd > 0) D.cd -= dt;
    if (VIG.iframes > 0) VIG.iframes -= sdt;
    if (D.t > 0) {
      const st = Math.min(D.t, sdt); D.t -= sdt;
      const sp = 11 * (0.55 + 0.45 * D.t / 0.22);
      moveWithCollision(H, D.dx * sp * st, D.dz * sp * st); H.moveSpeedNow = 0;
      vGhost(H);
    }
    for (let i = VIG.ghosts.length - 1; i >= 0; i--) { const g = VIG.ghosts[i]; g.life -= dt; g.vis.alpha = Math.max(0, g.life / g.max) * 0.4; if (g.life <= 0) { if (g.vis.obj.parent) g.vis.obj.parent.remove(g.vis.obj); VIG.ghosts.splice(i, 1); } }
    // penance fades if not answered
    if (VIG.rallyT > 0) VIG.rallyT -= sdt; else if (VIG.rally > 0) VIG.rally = Math.max(0, VIG.rally - H.maxHp * 0.6 * sdt);
    if (!H.alive) VIG.rally = 0;
    // telegraphs follow their owner through the first part of the wind-up
    for (let i = VIG.tele.length - 1; i >= 0; i--) {
      const T = VIG.tele[i]; T.t += sdt; const o = T.owner;
      if (!o.alive || (o.action !== T.action && !T.done) || (o.stun > 0 && !T.done)) { VIG.tele.splice(i, 1); continue; }
      if (!T.done) { if (T.t < T.track) turnToward(o, faceAngle(H.x - o.x, H.z - o.z), sdt, 4.5); T.x = o.x; T.z = o.z; T.rot = o.rot; }
      if (T.done || T.t > T.dur + 0.3) { T.fade = (T.fade || 0) + dt; if (T.fade > 0.15) VIG.tele.splice(i, 1); }
    }
    for (const m of WORLD.monsters) if (m.vigStag > 0) { m.vigStag -= sdt; if (!m.alive) m.vigStag = 0; }
    // embers in flight to the lantern
    const L = Game.lantern || { x: H.x, y: 1.2, z: H.z };
    for (let i = VIG.wisps.length - 1; i >= 0; i--) {
      const w = VIG.wisps[i]; w.t += dt;
      if (w.t < 0) continue;
      const k = Math.min(1, w.t / w.dur), e = k * k * (3 - 2 * k);
      if (!w.sx) { w.sx = w.x; w.sy = w.y; w.sz = w.z; }
      w.x = w.sx + (L.x - w.sx) * e + Math.sin(w.wob + k * 9) * 0.25 * (1 - k);
      w.z = w.sz + (L.z - w.sz) * e + Math.cos(w.wob + k * 7) * 0.25 * (1 - k);
      w.y = w.sy + (L.y - w.sy) * e + Math.sin(k * Math.PI) * 0.9;
      if (k >= 1) { H.mana = Math.min(H.maxMana, H.mana + w.amt); VIG.wisps.splice(i, 1); }
    }
    vAmbush(dt);
    // first time below: say what the two systems ask of you
    if (WORLD.depth > 0 && !G.settings.vigHints && (vLantern() || vRhythm())) {
      G.settings.vigHints = 1; applySettings();
      const pad = IN.lastDevice === 'pad', lines = [];
      if (vLantern()) lines.push(`The lantern burns on your fire (right globe). Kindle it at votive candles. The dark hides better spoils, and worse things. ${pad ? 'Click the left stick' : 'Press L'} to shutter it.`);
      if (vRhythm()) lines.push(`Red on the floor: a blow is coming. ${pad ? 'LT' : 'Shift'} slides out of it. Strike back quickly to win back lost life; batter a foe until it staggers, then execute it.`);
      lines.forEach((l, i) => setTimeout(() => UI.msg(l, '#e0c090', true), 2500 + i * 6500));
    }
  };
}
// floor marks for the blows, glows for the staggered and for embers in flight
{
  const _pr = FX.preRender;
  FX.preRender = function () {
    _pr();
    const S = GFX.S, y = 0.04;
    for (const T of VIG.tele) {
      const k = clamp(T.t / T.dur, 0, 1), fade = T.fade ? 1 - T.fade / 0.15 : 1;
      const col = [1.6, 0.1, 0.04], base = (0.35 + 0.35 * k) * fade, front = (1.0 + 1.2 * k) * fade * (T.done ? 1.5 : 1);
      const n = T.half >= Math.PI ? 40 : Math.max(8, Math.round(T.half * 12)), area = [], prog = [];
      for (let i = 0; i <= n; i++) {
        const a = T.rot - T.half + 2 * T.half * i / n, sx = Math.sin(a), sz = Math.cos(a);
        area.push([T.x, y, T.z, T.x + sx * T.r, y, T.z + sz * T.r, base]);
        const pr = T.r * (0.15 + 0.85 * k);
        prog.push([T.x + sx * pr * 0.6, y, T.z + sz * pr * 0.6, T.x + sx * pr, y, T.z + sz * pr, front * 0.5]);
      }
      S.trails.push({ pts: area, col }); S.trails.push({ pts: prog, col });
    }
    for (const m of WORLD.monsters) if (m.alive && m.vigStag > 0) {
      const p = 0.6 + 0.4 * Math.sin(VIG.now * 14);
      S.glows.push({ x: m.x, y: 0.15, z: m.z, w: 90, h: 40, g: 0.55 * p, c: [1.0, 0.7, 0.25] });
      S.glows.push({ x: m.x, y: 1.8 + (m.T.boss ? 1 : 0), z: m.z, w: 26, h: 26, g: 0.9 * p, c: [1.0, 0.8, 0.4] });
    }
    for (const w of VIG.wisps) if (w.t >= 0) S.glows.push({ x: w.x, y: w.y, z: w.z, w: 22, h: 22, g: 0.85, c: [1.0, 0.55, 0.18] });
    for (const o of WORLD.objects) if (o.type === 'votive' && !o.used) S.glows.push({ x: o.x, y: 0.55, z: o.z, w: 70, h: 60, g: 0.3 + 0.08 * Math.sin(VIG.now * 7 + o.x), c: [1.0, 0.6, 0.25] });
  };
}
// HUD: the right globe holds fire, a word under it names the dark; penance shows on the life globe
{
  const _do = drawOrb;
  drawOrb = function (c, frac, col, t, g) {
    if (c === UI.orbR && vLantern() && col[0] === '#6080ff') col = VIG.shut ? ['#8a6040', '#4a2410', '#100402'] : ['#ffb860', '#c44c12', '#2a0802'];
    _do(c, frac, col, t, g);
    if (c === UI.orbL && vRhythm() && VIG.rally > 0 && WORLD.hero) {
      const H = WORLD.hero, x = c.getContext('2d'), S = c.width, R = S / 2;
      const f0 = clamp(H.hp / H.maxHp, 0, 1), f1 = clamp((H.hp + VIG.rally) / H.maxHp, 0, 1);
      const y0 = S - f0 * S, y1 = S - f1 * S;
      x.save(); x.beginPath(); x.arc(R, R, R * 0.92, 0, TAU); x.clip();
      x.fillStyle = `rgba(215,60,34,${0.42 + 0.18 * Math.sin(t * 9)})`; x.fillRect(0, y1, S, y0 - y1);
      x.strokeStyle = 'rgba(255,190,140,0.18)'; x.lineWidth = 3; for (let k = -S; k < S; k += 14) { x.beginPath(); x.moveTo(k, y0); x.lineTo(k + (y0 - y1), y1); x.stroke(); }
      x.fillStyle = 'rgba(255,210,160,0.85)'; x.fillRect(0, y1, S, 3);
      x.restore();
    }
  };
  const _uh = updateHUD;
  updateHUD = function (dt) {
    _uh(dt);
    const H = WORLD.hero; if (!H || !UI.orbRText) return;
    if (!UI.vTier) { UI.vTier = document.createElement('div'); UI.vTier.className = 'vtier'; (UI.orbRText.parentNode || UI.hud).appendChild(UI.vTier); }
    const show = vLantern() && WORLD.depth > 0;
    const sig = show ? VIG.tier + '|' + VIG.shut : '';
    if (UI.vTier._s !== sig) {
      UI.vTier._s = sig;
      const T = TIERS[VIG.tier];
      UI.vTier.style.display = show ? '' : 'none';
      UI.vTier.innerHTML = show ? `<span style="color:${T.col}">${VIG.shut ? 'Shuttered · ' : ''}${T.name}</span>` : '';
      UI.vTier.title = show ? `Foes deal ${Math.round((T.dmg - 1) * 100)}% more damage · +${Math.round(T.crit * 100)}% critical blows · +${T.mf}% magic finds` : '';
    }
  };
}
// ------------------------------------------------------------------ difficulty (Options): Pilgrim = the old balance
const DIFF = {
  pilgrim:  { name: 'Pilgrim',  dmg: [1, 1], hp: 1, tohit: 0, cd: 1, extra: 0 },
  penitent: { name: 'Penitent', dmg: [1.6, 1.35], hp: 1.2, tohit: 10, cd: 1.2, extra: 0.25 },
  martyr:   { name: 'Martyr',   dmg: [2.2, 1.8], hp: 1.45, tohit: 18, cd: 1.35, extra: 0.45 },
};
const vDiff = () => DIFF[G.settings.difficulty] || DIFF.penitent;
{
  const _ms = monsterStats;
  monsterStats = function (id, depth) {
    const s = _ms(id, depth), D = vDiff();
    const k = clamp((depth - 6) / 6, 0, 1), dm = D.dmg[0] + (D.dmg[1] - D.dmg[0]) * k;   // hardest early, eases toward depth 12
    s.dmg = [Math.max(1, Math.round(s.dmg[0] * dm)), Math.max(1, Math.round(s.dmg[1] * dm))];
    s.hp = Math.round(s.hp * D.hp); s.tohit += D.tohit;
    return s;
  };
  const _mu = Monster.prototype.update;
  Monster.prototype.update = function (dt) {
    _mu.call(this, dt);
    const r = vDiff().cd; if (r !== 1 && this.cd > 0 && this.aggro) this.cd -= dt * (r - 1);   // they recover from a swing sooner
  };
}
// bigger packs: a share of the level's foes brings a companion of its kind (seeded, so a level is the same each time)
function vExtraSpawns(L, depth, R) {
  const D = vDiff(); if (!D.extra) return;
  const base = WORLD.monsters.slice();
  for (const m of base) {
    if (m.T.boss || m.champion || m.minion || R() > D.extra) continue;
    for (let t = 0; t < 6; t++) {
      const a = R() * TAU, x = m.x + Math.sin(a) * 0.9, z = m.z + Math.cos(a) * 0.9;
      if (!canStand(x, z, 0.35)) continue;
      const c = new Monster(m.id, depth); c.x = x; c.z = z; c.rot = R() * TAU; c.syncVisual(); c.vis.cur = c.rot;
      WORLD.monsters.push(c); break;
    }
  }
}

function initVigil() {
  applyVigilSettings();
  const css = document.createElement('style');
  css.textContent = `.vtier{position:absolute;right:100%;width:170px;margin-right:-38px;top:206px;z-index:3;text-align:right;white-space:nowrap;font:600 12px var(--display,serif);letter-spacing:.18em;text-transform:uppercase;text-shadow:0 1px 0 #000,0 0 8px #000;pointer-events:auto}`;
  document.head.appendChild(css);
}
