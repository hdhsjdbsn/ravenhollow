'use strict';
// World state, actors (hero + monsters), combat, projectiles, loot and interactables.

const WORLD = {
  level: null, hero: null, monsters: [], projectiles: [], drops: [], objects: [], npcs: [], effects: [],
  flow: null, flowCell: -1, flowT: 0, depth: 0, portal: null, townPortal: null, time: 0,
};

// ----------------------------------------------------------------
// Movement helpers
// ----------------------------------------------------------------
function canStand(x, z, r) {
  const L = WORLD.level; if (!L) return true;
  if (!L.walkable(x, z)) return false;
  const k = r * 0.75;
  return L.walkable(x + r, z) && L.walkable(x - r, z) && L.walkable(x, z + r) && L.walkable(x, z - r) &&
    L.walkable(x + k, z + k) && L.walkable(x - k, z + k) && L.walkable(x + k, z - k) && L.walkable(x - k, z - k);
}
function moveWithCollision(a, dx, dz) {
  const r = a.radius, x0 = a.x, z0 = a.z;
  if (canStand(a.x + dx, a.z, r)) a.x += dx;
  else if (canStand(a.x + dx * 0.3, a.z, r)) a.x += dx * 0.3;
  if (canStand(a.x, a.z + dz, r)) a.z += dz;
  else if (canStand(a.x, a.z + dz * 0.3, r)) a.z += dz * 0.3;
  // fully blocked: try to slip around the corner at 45 degrees instead of pressing into the wall
  const l = Math.hypot(dx, dz);
  if (a.x === x0 && a.z === z0 && l > 1e-5) {
    for (const s of [1, -1]) {
      const c = Math.SQRT1_2, ex = (dx * c - dz * s * c) * 0.7, ez = (dz * c + dx * s * c) * 0.7;
      if (canStand(a.x + ex, a.z + ez, r)) { a.x += ex; a.z += ez; break; }
    }
  }
  a._moved = (a._moved || 0) + Math.hypot(a.x - x0, a.z - z0);
}
// how fast an actor really moved this frame (walls stop the feet, so they also stop the walk cycle)
// Measured as the smoothed velocity *vector*: shoving back and forth in a crowd or against a corner cancels out,
// so a foe that is not actually getting anywhere stands (idle) instead of walking on the spot.
function realSpeed(a, dt) {
  a._moved = 0;
  if (a._px === undefined || dt <= 0) { a._px = a.x; a._pz = a.z; a._vx = a._vz = 0; a._vs = 0; return 0; }
  if (Math.hypot(a.x - a._px, a.z - a._pz) > 1.5) { a._px = a.x; a._pz = a.z; a._vx = a._vz = 0; }   // placed / teleported
  const vx = (a.x - a._px) / dt, vz = (a.z - a._pz) / dt; a._px = a.x; a._pz = a.z;
  const k = Math.min(1, dt * 7);
  a._vx += (vx - a._vx) * k; a._vz += (vz - a._vz) * k;
  a._vs = Math.hypot(a._vx, a._vz);
  return a.moveSpeedNow > 0 ? Math.min(a.moveSpeedNow, a._vs) : 0;
}
function faceAngle(dx, dz) { return Math.atan2(dx, dz); }
function turnToward(a, target, dt, speed = 12) {
  const d = angDiff(a.rot, target);
  a.rot += clamp(d, -speed * dt, speed * dt);
}

// ----------------------------------------------------------------
// Actor
// ----------------------------------------------------------------
class Actor {
  constructor() {
    this.x = 0; this.z = 0; this.y = 0; this.rot = 0; this.radius = 0.32;
    this.alive = true; this.hp = 1; this.maxHp = 1;
    this.action = null; this.actT = 0; this.actDur = 0; this.actFired = false;
    this.stun = 0; this.slow = 0; this.freeze = 0; this.poison = 0; this.poisonDps = 0; this.burn = 0; this.burnDps = 0;
    this.vis = null; this.moveSpeedNow = 0;
  }
  get pos() { return [this.x, this.z]; }
  setVisual(v) { this.vis = v; (WORLD.root || R3.scene).add(v.obj); this.syncVisual(); }
  syncVisual() { if (!this.vis) return; this.vis.obj.position.set(this.x, this.y, this.z); this.vis.obj.rotation.y = this.rot; }
  removeVisual() { if (this.vis) { if (this.vis.obj.parent) this.vis.obj.parent.remove(this.vis.obj); this.vis.dispose && this.vis.dispose(); this.vis = null; } }
  dist(o) { return Math.hypot(this.x - o.x, this.z - o.z); }
  busy() { return this.action && this.actT < this.actDur; }
  speedMul() { return (this.freeze > 0 ? 0.25 : this.slow > 0 ? 0.6 : 1); }
  tickStatus(dt) {
    if (this.stun > 0) this.stun -= dt;
    if (this.slow > 0) this.slow -= dt;
    if (this.freeze > 0) this.freeze -= dt;
    if (this.poison > 0) { this.poison -= dt; this.applyDot(this.poisonDps * dt, 'poison'); }
    if (this.burn > 0) { this.burn -= dt; this.applyDot(this.burnDps * dt, 'fire'); if ((this === WORLD.hero || typeof FIRE === 'undefined') && Math.random() < dt * 10) fxTrail(this.x, 0.5 + Math.random() * 0.8, this.z, [1, 0.5, 0.1], 0.12, 0.4); }   // foes burn with real tongues (fire.js)
    if (this.vis) {
      const m = this.vis.mat.userData.glow.value;
      if (this.freeze > 0 || this.slow > 0) m.set(0.02, 0.05, 0.12);
      else if (this.poison > 0) m.set(0.02, 0.08, 0.0);
      else if (this.baseGlow) m.set(...this.baseGlow);
      else m.set(0, 0, 0);
    }
  }
  applyDot(n, kind) {
    if (!this.alive) return;
    this.hp -= n;
    if (this.hp <= 0) this.die(null, kind);
  }
}

// ----------------------------------------------------------------
// HERO
// ----------------------------------------------------------------
const CLASSES = {
  penitent: { name: 'Penitent', voice: 'warrior', base: { str: 28, dex: 20, mag: 20, vit: 25 }, lifePerVit: 2, lifePerLvl: 2, manaPerMag: 1.3, manaPerLvl: 1.2, baseLife: 18, baseMana: 4, start: ['shortSword', 'tallowLantern', 'rags'], desc: 'A hooded wanderer who carries the last lit lantern of the abbey. Steel for the flesh, fire for what lies beneath it.' },
};
function xpForLevel(l) { return l <= 1 ? 0 : Math.round(95 * Math.pow(l - 1, 2.35) + 160 * (l - 1)); }
const MAX_LEVEL = 40;

class Hero extends Actor {
  constructor(cls, name) {
    super();
    if (!CLASSES[cls]) cls = 'penitent';
    this.cls = cls; this.voice = CLASSES[cls].voice; this.name = name || CLASSES[cls].name;
    this.lvl = 1; this.xp = 0; this.base = Object.assign({}, CLASSES[cls].base);
    this.statPts = 0; this.skillPts = 1; this.skills = {}; this.slots = [null, null, null, null];
    this.inv = new Array(40).fill(null); this.equip = {}; this.gold = 100;
    this.quests = {}; this.maxDepth = 0; this.waystones = { 1: true };
    this.radius = 0.3; this.potCD = 0; this.regenAcc = 0; this.buffs = [];
    this.team = 'hero'; this.lastHitBy = null; this.stepT = 0;
    this.d = {};
    for (const s of CLASS_SKILLS[cls]) if (SKILLS[s].reqLevel <= 1) { this.skills[s] = 1; }
    this.skillPts = 0;
    this.autoSlot();
  }
  attr(k) { return Math.max(0, (this.base[k] || 0) + (this.d['add_' + k] || 0)); }
  stat(k) { return this.d[k] || 0; }
  skillLevel(id) { const r = this.skills[id] || 0; return r > 0 ? r + (this.d.skills || 0) : 0; }
  autoSlot() {
    const learned = CLASS_SKILLS[this.cls].filter(s => this.skills[s]);
    for (const s of learned) if (!this.slots.includes(s)) { const i = this.slots.indexOf(null); if (i >= 0) this.slots[i] = s; }
  }
  recalc() {
    const d = { add_str: 0, add_dex: 0, add_mag: 0, add_vit: 0 };
    let armor = 0, block = 0;
    const add = (k, v) => d[k] = (d[k] || 0) + v;
    for (const s of SLOTS) {
      const it = this.equip[s]; if (!it) continue;
      const B = BASES[it.base];
      const st = it.stats || {};
      if (it.armor) armor += Math.round(it.armor * (1 + (st.earmor || 0) / 100));
      if (B.block) block += B.block;
      for (const k in st) {
        const v = st[k];
        if (k === 'str' || k === 'dex' || k === 'mag' || k === 'vit') add('add_' + k, v);
        else if (k === 'allStats') { add('add_str', v); add('add_dex', v); add('add_mag', v); add('add_vit', v); }
        else if (k === 'resAll') { add('resFire', v); add('resCold', v); add('resLight', v); }
        else if (k === 'earmor' || k === 'edmg') { if (k === 'edmg' && s === 'main') add('edmg', v); else if (k === 'edmg') add('edmg', v); }
        else add(k, v);
      }
    }
    for (const b of this.buffs) for (const k in (b.mods || {})) add(k, b.mods[k]);
    this.d = d;
    const C = CLASSES[this.cls];
    const vit = this.attr('vit'), mag = this.attr('mag'), dex = this.attr('dex'), str = this.attr('str');
    const oldMax = this.maxHp || 1, oldMaxM = this.maxMana || 1;
    this.maxHp = Math.round(C.baseLife + vit * C.lifePerVit + this.lvl * C.lifePerLvl + (d.life || 0));
    this.maxMana = Math.round(C.baseMana + mag * C.manaPerMag + this.lvl * C.manaPerLvl + (d.mana || 0));
    if (this.hp === undefined || this.hp > this.maxHp) this.hp = Math.min(this.hp ?? this.maxHp, this.maxHp);
    if (this.mana === undefined) this.mana = this.maxMana; else this.mana = Math.min(this.mana, this.maxMana);
    this.armor = Math.round(armor + dex / 5 + (d.armorFlat || 0)) + (d.armorBuff || 0);
    this.block = this.equip.off ? clamp(block + (d.block || 0) + dex / 5, 0, 50) : 0;
    this.tohit = Math.round(50 + dex / 2 + this.lvl * 1.5 + (d.tohit || 0) + 12);
    const lant = this.equip.off ? BASES[this.equip.off.base] : null;
    this.spellMul = 1 + ((lant ? lant.spell || 0 : 0) + (d.spell || 0)) / 100;
    const w = this.equip.main;
    const B = w ? BASES[w.base] : null;
    let dmin = 1, dmax = 3, spd = 1;
    if (w) { dmin = w.dmg[0]; dmax = w.dmg[1]; spd = B.spd; }
    const ed = 1 + (d.edmg || 0) / 100 + (d.dmgBuff || 0) / 100;
    const ranged = false;
    const sbon = str * this.lvl / 100 + str / 25;
    this.dmg = [Math.max(1, Math.round(dmin * ed + sbon * 0.5 + (d.dmgFlat || 0))), Math.max(1, Math.round(dmax * ed + sbon + (d.dmgFlat || 0)))];
    this.ranged = false; this.caster = false;
    this.atkSpeed = spd * (1 + (d.ias || 0) / 100);
    this.castSpeed = 1 + (d.fcr || 0) / 100;
    this.res = { fire: clamp((d.resFire || 0), -100, 75), cold: clamp((d.resCold || 0), -100, 75), light: clamp((d.resLight || 0), -100, 75), poison: clamp((d.resAll || 0) / 2, 0, 75) };
    this.moveSpeed = 3.1 * (1 + (d.speed || 0) / 100);
    this.lightMul = clamp(1 + ((d.light || 0) + (lant ? lant.light || 0 : 0)) / 100, 0.5, 2);
    this.elem = { fire: d.fireDmg || 0, cold: d.coldDmg || 0, light: d.lightDmg || 0 };
    if (this.hp > this.maxHp) this.hp = this.maxHp;
    if (this.mana > this.maxMana) this.mana = this.maxMana;
  }
  rebuildVisual() {
    const old = this.vis;
    if (old) { if (old.obj.parent) old.obj.parent.remove(old.obj); old.dispose(); }
    this.vis = null; this.setVisual(new SpriteVis(HSET + '_body', { hero: true, stride: 1.6 }));
    this.refreshGear();
  }
  footstep() {
    const z = AMB.zone, gravel = z === 'caves' || z === 'abyss';
    SFX.play(gravel ? 'stepGravel' : 'step', { x: this.x, z: this.z, vol: 0.4, minGap: 0.12 });
    const B = this.equip.body && BASES[this.equip.body.base];
    if (B && (B.model === 'chain' || B.model === 'plate')) SFX.play('stepMail', { x: this.x, z: this.z, vol: B.model === 'plate' ? 0.35 : 0.5, minGap: 0.12 });
  }
  // which paper-doll layers show the equipped helm, armour, weapon and lantern
  gearLayers() { return heroGearLayers(this.equip); }
  refreshGear() {
    const L = this.gearLayers();
    for (const l of L) if (!SETS[l.set]) loadSet(l.set).catch(() => { });
    if (this.vis) this.vis.setLayers(L);
  }
  gainXp(n) {
    if (this.lvl >= MAX_LEVEL) return;
    this.xp += Math.round(n);
    while (this.lvl < MAX_LEVEL && this.xp >= xpForLevel(this.lvl + 1)) this.levelUp();
  }
  levelUp() {
    this.lvl++; this.statPts += 5; this.skillPts += 1;
    this.recalc(); this.hp = this.maxHp; this.mana = this.maxMana;
    UI.msg(`You have reached level ${this.lvl}!`, '#f0d290', true);
    SFX.play('levelup'); setTimeout(() => heroBark('levelup', 0), 1600);
    fxBurst(this.x, 1, this.z, [1, 0.85, 0.4], 60, 3, 0.15, 1.2);
    fxRing(this.x, this.z, [1, 0.8, 0.4], 1.2, 50, 0.1);
    // newly unlocked skills
    for (const s of CLASS_SKILLS[this.cls]) if (SKILLS[s].reqLevel === this.lvl) UI.msg(`New skill available: ${SKILLS[s].name}`, '#e09040');
  }
  // inventory
  addItem(it, silent) {
    if (it.kind === 'gold') { this.gold += it.qty; return true; }
    const B = BASES[it.base];
    if (B.stack) {
      for (const o of this.inv) if (o && o.base === it.base && o.qty < B.stack) {
        const n = Math.min(B.stack - o.qty, it.qty); o.qty += n; it.qty -= n;
        if (it.qty <= 0) return true;
      }
    }
    const i = this.inv.indexOf(null);
    if (i < 0) { if (!silent) { UI.msg('Your inventory is full.', '#c06040'); SFX.play('error'); heroBark('invfull', 4); } return false; }
    this.inv[i] = it; return true;
  }
  countItem(base) { let n = 0; for (const o of this.inv) if (o && o.base === base) n += o.qty || 1; return n; }
  consumeItem(base) { for (let i = 0; i < this.inv.length; i++) { const o = this.inv[i]; if (o && o.base === base) { o.qty = (o.qty || 1) - 1; if (o.qty <= 0) this.inv[i] = null; return true; } } return false; }
  equipFromInv(i, slotPref) {
    const it = this.inv[i]; if (!it) return false;
    const slots = slotsFor(it); if (!slots.length) return false;
    if (!canEquip(this, it)) { UI.msg('You lack the attributes to use that.', '#c06040'); SFX.play('error'); heroBark('cantuse', 3); return false; }
    let slot = slotPref && slots.includes(slotPref) ? slotPref : slots[0];
    if (slots.length > 1 && !slotPref) { const free = slots.find(s => !this.equip[s]); slot = free || slots[0]; }
    const B = BASES[it.base];
    this.inv[i] = this.equip[slot] || null;
    this.equip[slot] = it;
    // two-handers free the off hand
    SFX.play(it.kind === 'weapon' ? 'equipWeapon' : 'equipArmor');
    this.recalc(); this.refreshGear();
    return true;
  }
  unequip(slot) {
    const it = this.equip[slot]; if (!it) return false;
    if (!this.addItem(it)) return false;
    delete this.equip[slot]; this.recalc(); this.refreshGear();
    SFX.play('equipArmor');
    return true;
  }
  useItem(i) {
    const it = this.inv[i]; if (!it) return;
    const B = BASES[it.base];
    if (B.kind === 'potion') { this.drinkPotion(it); it.qty--; if (it.qty <= 0) this.inv[i] = null; return; }
    if (B.kind === 'scroll') {
      if (B.effect === 'portal') { if (castTownPortal()) { it.qty--; if (it.qty <= 0) this.inv[i] = null; } }
      else if (B.effect === 'identify') { UI.beginIdentify(i); }
      return;
    }
    if (B.kind === 'tome') {
      const sk = SKILLS[it.skill];
      if (!sk || sk.cls !== this.cls) { UI.msg('The words in this tome mean nothing to you.', '#c06040'); return; }
      if (this.lvl < sk.reqLevel) { UI.msg(`You must be level ${sk.reqLevel} to learn this.`, '#c06040'); return; }
      this.skills[it.skill] = (this.skills[it.skill] || 0) + 1; this.autoSlot();
      UI.msg(`${sk.name} is now rank ${this.skills[it.skill]}.`, '#e09040'); SFX.play('levelup');
      this.inv[i] = null; return;
    }
    if (slotsFor(it).length) this.equipFromInv(i);
  }
  drinkPotion(it) {
    const B = BASES[it.base];
    if (B.effect === 'heal' || B.effect === 'both') { this.hp = Math.min(this.maxHp, this.hp + this.maxHp * B.amount); fxBurst(this.x, 1, this.z, [1, 0.2, 0.15], 18, 1.5, 0.1, 0.7); }
    if (B.effect === 'mana' || B.effect === 'both') { this.mana = Math.min(this.maxMana, this.mana + this.maxMana * B.amount); fxBurst(this.x, 1, this.z, [0.3, 0.4, 1], 18, 1.5, 0.1, 0.7); }
    if (['str', 'dex', 'mag', 'vit'].includes(B.effect)) { this.base[B.effect]++; this.recalc(); UI.msg(`You feel ${({ str: 'stronger', dex: 'more agile', mag: 'wiser', vit: 'more vigorous' })[B.effect]}.`, '#f0d290'); }
    SFX.play('drink');
  }
  quickPotion(kind) {
    if (this.potCD > 0) return;
    const order = kind === 'heal' ? ['potHeal', 'potRejuv', 'potFullHeal'] : ['potMana', 'potRejuv', 'potFullMana'];
    for (const b of order) {
      const i = this.inv.findIndex(o => o && o.base === b);
      if (i >= 0) { this.useItem(i); this.potCD = 0.4; return; }
    }
    UI.msg(kind === 'heal' ? 'No healing potions.' : G.settings.lantern !== false ? 'No lamp oil.' : 'No mana potions.', '#c06040'); SFX.play('error');
  }
  addBuff(id, dur, mods, fx) {
    const b = this.buffs.find(b => b.id === id);
    if (b) { b.t = dur; b.mods = mods; } else this.buffs.push({ id, t: dur, mods, fx });
    this.recalc();
  }
  update(dt) {
    if (!this.alive) { if (this.vis) this.vis.update(dt, 0); return; }
    this.tickStatus(dt);
    this.potCD = Math.max(0, this.potCD - dt);
    // buffs
    let changed = false;
    for (let i = this.buffs.length - 1; i >= 0; i--) { const b = this.buffs[i]; b.t -= dt; if (b.t <= 0) { this.buffs.splice(i, 1); changed = true; } }
    if (changed) this.recalc();
    // regen
    const regen = (this.d.regen || 0) + (WORLD.depth === 0 ? this.maxHp * 0.03 : 0);
    if (regen > 0) this.hp = Math.min(this.maxHp, this.hp + regen * dt);
    this.mana = Math.min(this.maxMana, this.mana + (this.maxMana * 0.014 + 0.35) * dt);
    // actions
    if (this.action) {
      this.actT += dt;
      const fireAt = this.actFireAt ?? 0.45;
      if (!this.actFired && this.actT >= this.actDur * fireAt) { this.actFired = true; this.action.fire && this.action.fire(); }
      if (this.actT >= this.actDur) { this.action = null; }
    }
    const vs = realSpeed(this, dt);
    if (this.vis) {
      const moving = vs > 0.35;
      if (!this.action && this.stun <= 0) this.vis.play(moving ? 'walk' : 'idle');
      this.vis.update(dt, vs);
      if (moving) { this.stepT += dt * vs / 0.625; if (this.stepT > 1) { this.stepT -= 1; this.footstep(); } }
    }
    this.syncVisual();
  }
  startAction(anim, dur, fire, fireAt = 0.45) {
    this.action = { anim, fire }; this.actT = 0; this.actDur = dur; this.actFired = false; this.actFireAt = fireAt;
    if (this.vis) this.vis.play(anim, dur, true);
  }
  die(src) {
    if (!this.alive) return;
    this.alive = false; this.hp = 0;
    if (this.vis) this.vis.play('death', 1);
    SFX.play('heroDie'); SFX.play(this.voice + 'Die'); stopVoice(); vibrate(1, 1, 500);
    fxBlood(this.x, 1, this.z, 30);
    Game.onHeroDeath();
  }
  serialize() {
    return { cls: this.cls, name: this.name, lvl: this.lvl, xp: this.xp, base: this.base, statPts: this.statPts, skillPts: this.skillPts, skills: this.skills, slots: this.slots, inv: this.inv, equip: this.equip, gold: this.gold, quests: this.quests, maxDepth: this.maxDepth, waystones: this.waystones, hp: this.hp, mana: this.mana };
  }
  static load(o) {
    const h = new Hero(o.cls, o.name);
    Object.assign(h, { lvl: o.lvl, xp: o.xp, base: o.base, statPts: o.statPts, skillPts: o.skillPts, skills: o.skills, slots: o.slots, inv: o.inv, equip: o.equip, gold: o.gold, quests: o.quests || {}, maxDepth: o.maxDepth || 0, waystones: o.waystones || { 1: true } });
    for (const it of [...h.inv, ...Object.values(h.equip)]) if (it && it.id >= ITEM_ID) ITEM_ID = it.id + 1;
    h.recalc(); h.hp = Math.min(h.maxHp, o.hp || h.maxHp); h.mana = Math.min(h.maxMana, o.mana ?? h.maxMana);
    return h;
  }
}

// equipment -> hero sprite layers (tints set metal colour variants apart)
const GEAR_LAYER = {
  helm: { cap: 'h_cap', coif: 'h_coif', helm: 'h_helm', greathelm: 'h_great', horned: 'h_horned', circlet: 'h_crown', crown: 'h_crown' },
  armor: { tunic: 'a_rags', leather: 'a_leather', chain: 'a_chain', plate: 'a_plate', robe: 'a_robe' },
  weapon: { dagger: 'w_sword', sword: 'w_sword', club: 'w_mace', axe: 'w_axe', mace: 'w_mace', greatsword: 'w_great', battleaxe: 'w_baxe', maul: 'w_maul' },
  lantern: { lantern1: 'l_1', lantern2: 'l_2', lantern3: 'l_3', lantern4: 'l_4' },
};
const MAT_TINT = { blackSteel: [0.5, 0.5, 0.56], silver: [1.15, 1.15, 1.2], crimsonSteel: [1.15, 0.6, 0.55], iron: null, steel: null };
function heroGearLayers(E) {
  const B = it => it ? BASES[it.base] : null;
  const out = [];
  const has = n => !window.SET_LIST || window.SET_LIST.includes(HSET + '_' + n);
  const or = (n, d) => n && has(n) ? n : d;
  const head = B(E.head), body = B(E.body), w = B(E.main), l = B(E.off);
  // polished plate reads too pale under the warm lights: plain steel pieces get a darker, cooler tint
  const STEEL = [0.6, 0.6, 0.65];
  out.push({ set: HSET + '_' + or(body && GEAR_LAYER.armor[body.model], 'a_rags'), tint: body && body.metal ? MAT_TINT[body.metal] : (body && body.model === 'plate' ? STEEL : (body && body.robeCol === 'clothPurple' ? [0.8, 0.6, 1.1] : null)) });
  out.push({ set: HSET + '_' + or(head && GEAR_LAYER.helm[head.model], 'h_hood'), tint: head && ['greathelm', 'helm', 'horned'].includes(head.model) ? STEEL : null });
  if (w && GEAR_LAYER.weapon[w.model]) out.push({ set: HSET + '_' + or(GEAR_LAYER.weapon[w.model], 'w_sword'), tint: MAT_TINT[w.mat] || [0.78, 0.78, 0.82] });
  if (l && GEAR_LAYER.lantern[l.model]) out.push({ set: HSET + '_' + or(GEAR_LAYER.lantern[l.model], 'l_1') });
  return out;
}

// ----------------------------------------------------------------
// MONSTERS
// ----------------------------------------------------------------
class Monster extends Actor {
  constructor(id, depth, opts = {}) {
    super();
    const T = MONSTERS[id]; this.id = id; this.T = T;
    const S = monsterStats(id, depth);
    this.name = T.name; this.depth = depth;
    this.maxHp = S.hp; this.dmg = S.dmg; this.armor = S.armor; this.tohit = S.tohit; this.xpVal = S.xp; this.mlvl = S.mlvl;
    this.speed = T.speed; this.atkDur = T.atk; this.radius = T.radius || 0.32;
    this.res = Object.assign({ fire: 0, cold: 0, light: 0, poison: 0 }, T.res || {});
    this.elem = T.elem ? JSON.parse(JSON.stringify(T.elem)) : {};
    this.team = 'monster'; this.state = 'idle'; this.target = null; this.cd = rand.range(0.2, 1.2); this.thinkT = rand() * 0.3;
    this.wanderT = rand.range(1, 4); this.home = null; this.aggro = false; this.special = 0; this.special2 = rand.range(4, 8);
    this.champion = opts.champion || null; this.minion = !!opts.minion; this.boss = !!T.boss;
    let tint = T.tint, glow = null;
    if (this.champion) {
      const c = this.champion;
      this.name = c.name; this.maxHp = Math.round(this.maxHp * 3 * (c.mods.includes('stone') ? 1.3 : 1));
      if (c.mods.includes('strong')) { this.dmg = this.dmg.map(v => Math.round(v * 1.7)); }
      if (c.mods.includes('fast')) { this.speed *= 1.45; this.atkDur *= 0.7; }
      if (c.mods.includes('stone')) this.armor = Math.round(this.armor * 2.2);
      for (const m of c.mods) if (CHAMPION_MODS[m].elem) { const e = CHAMPION_MODS[m].elem; this.elem[e] = [Math.round(this.dmg[0] * 0.5), Math.round(this.dmg[1] * 0.6)]; this.res[e] = 75; }
      this.xpVal *= 4; glow = c.glow || [0.06, 0.04, 0.0];
    }
    if (this.minion) { this.maxHp = Math.round(this.maxHp * 1.6); this.xpVal *= 1.6; glow = [0.03, 0.02, 0.0]; }
    this.hp = this.maxHp; this.baseGlow = glow;
    const SP = MONSTER_SPRITES[id] || { set: 'risen' };
    this.setVisual(new SpriteVis(SP.set, { tint: SP.tint, scale: SP.scale, glow: SP.glow, stride: SP.stride }));
    if (glow) this.vis.glowAdd += 0.2;
    if (T.flying) this.y = 0;
  }
  get title() { return this.name; }
  update(dt) {
    const H = WORLD.hero;
    if (!this.alive) {
      this.deadT += dt;
      if (this.vis) { this.vis.update(dt, 0); if (this.deadT > 14) this.vis.alpha = Math.max(0, 1 - (this.deadT - 14) / 3); if (this.deadT > 17) { this.removeVisual(); } }
      return;
    }
    this.tickStatus(dt);
    const near = H && this.dist(H) < 22;
    if (!near && !this.aggro) { if (this.vis) this.vis.obj.visible = false; return; }
    if (this.vis) this.vis.obj.visible = true;
    if (this.stun > 0 || this.freeze > 0 && this.freeze > 2) { this.moveSpeedNow = 0; this.vis.update(dt, 0); this.syncVisual(); return; }
    // ongoing action (attack/cast)
    if (this.action) {
      this.actT += dt * (this.freeze > 0 ? 0.3 : 1);
      if (!this.actFired && this.actT >= this.actDur * (this.actFireAt || 0.5)) { this.actFired = true; this.action.fire && this.action.fire(); }
      if (this.actT >= this.actDur) this.action = null;
      if (this.action && this.action.face && H) turnToward(this, faceAngle(H.x - this.x, H.z - this.z), dt, 6);
      this.moveSpeedNow = 0;
    } else {
      this.think(dt);
    }
    this.cd -= dt;
    const vs = realSpeed(this, dt);
    // pressing into a wall: step sideways for a moment instead of walking on the spot
    if (this.moveSpeedNow > 0.3 && vs < this.moveSpeedNow * 0.3) { this.stuckT = (this.stuckT || 0) + dt; if (this.stuckT > 0.35 && !this.detour) { this.detour = { a: this.rot + (Math.random() < 0.5 ? 1 : -1) * (1.2 + Math.random() * 0.6), t: 0.5 + Math.random() * 0.4 }; this.stuckT = 0; } }
    else this.stuckT = 0;
    if (this.vis) {
      if (!this.action) this.vis.play(vs > 0.25 ? 'walk' : 'idle');
      this.vis.update(dt * (this.freeze > 0 ? 0.35 : 1), vs);
    }
    this.syncVisual();
  }
  startAction(anim, dur, fire, fireAt = 0.5, face = true) {
    this.action = { anim, fire, face }; this.actT = 0; this.actDur = dur; this.actFired = false; this.actFireAt = fireAt;
    if (this.vis) this.vis.play(anim, dur, true);
  }
  canSee(H) { return hasLOS(WORLD.level, this.x, this.z, H.x, H.z); }
  think(dt) {
    const H = WORLD.hero, T = this.T;
    this.moveSpeedNow = 0;
    if (!H || !H.alive) { this.wander(dt); return; }
    const d = this.dist(H);
    if (!this.aggro) {
      if ((d < 9 && this.canSee(H)) || d < 3.5) { this.aggro = true; this.growl(); alertPack(this); }
      else { this.wander(dt); return; }
    }
    if (d > 30) { this.aggro = false; return; }
    // flee behaviour (cowardly imps after an ally died nearby)
    if (this.fleeT > 0) { this.fleeT -= dt; this.moveAway(H, dt); return; }
    if (T.boss) { if (bossThink(this, H, d, dt)) return; }
    const meleeRange = this.radius + H.radius + 0.55;
    switch (T.ai) {
      case 'ranged': case 'caster': {
        if (T.resurrect && this.cd <= 0 && this.tryResurrect()) return;
        const los = this.canSee(H);
        if (d < 3 && Math.random() < dt * 2) { this.moveAway(H, dt); return; }
        if (d < 10 && los && this.cd <= 0) {
          this.rot = faceAngle(H.x - this.x, H.z - this.z);
          this.startAction(T.ai === 'caster' ? 'cast' : 'attack', this.atkDur, () => this.shoot(H), T.ai === 'caster' ? 0.5 : 0.55);
          this.cd = this.atkDur + rand.range(0.8, 2.0);
          return;
        }
        if (!los || d > 8) this.chase(H, dt); else if (d < 5) this.moveAway(H, dt * 0.5);
        return;
      }
      case 'flyer': {
        // erratic swooping
        this.swoop = (this.swoop || 0) + dt * 3;
        if (d < meleeRange + 0.2 && this.cd <= 0) { this.attackMelee(H); return; }
        const a = Math.atan2(H.z - this.z, H.x - this.x) + Math.sin(this.swoop + this.x) * 1.1;
        const sp = this.speed * this.speedMul();
        const vx = Math.cos(a) * sp * dt, vz = Math.sin(a) * sp * dt;
        moveWithCollision(this, vx, vz); this.rot = faceAngle(vx, vz); this.moveSpeedNow = sp;
        if (d < 1.5 && this.cd > 0) moveWithCollision(this, -Math.cos(a) * sp * dt * 1.5, -Math.sin(a) * sp * dt * 1.5);
        return;
      }
      default: {
        if (d < meleeRange && this.cd <= 0) { this.attackMelee(H); return; }
        if (d < meleeRange) { turnToward(this, faceAngle(H.x - this.x, H.z - this.z), dt, 8); return; }
        this.chase(H, dt);
      }
    }
  }
  growl() {
    SFX.play(this.T.sound + 'Aggro', { x: this.x, z: this.z, vol: 0.6 });
    const bv = BOSS_VOICE[this.T.boss];
    if (bv && !this.spoke) { this.spoke = true; setTimeout(() => { if (this.alive) playVoice(bv + '_aggro', { duck: 0.55, verb: 0.35 }); }, 700); }
  }
  wander(dt) {
    this.wanderT -= dt;
    if (this.wanderT < 0) { this.wanderT = rand.range(2, 6); this.wanderDir = rand() < 0.5 ? null : rand() * TAU; }
    if (this.wanderDir != null && this.wanderT > 1) {
      const sp = this.speed * 0.35;
      const vx = Math.sin(this.wanderDir) * sp * dt, vz = Math.cos(this.wanderDir) * sp * dt;
      const ox = this.x, oz = this.z; moveWithCollision(this, vx, vz);
      if (Math.abs(this.x - ox) + Math.abs(this.z - oz) < 1e-4) this.wanderDir = rand() * TAU;
      this.rot = this.wanderDir; this.moveSpeedNow = sp;
    }
  }
  chase(H, dt) {
    if (this.detour) {
      const D = this.detour; D.t -= dt; if (D.t <= 0) this.detour = null;
      const sp = this.speed * this.speedMul();
      moveWithCollision(this, Math.sin(D.a) * sp * dt, Math.cos(D.a) * sp * dt);
      turnToward(this, D.a, dt, 10); this.moveSpeedNow = sp;
      return;
    }
    const L = WORLD.level, F = WORLD.flow;
    let tx = H.x, tz = H.z;
    if (F) {
      const ix = Math.floor(this.x), iz = Math.floor(this.z);
      const here = F[iz * L.w + ix];
      if (here < 1e8 && here > 1) {
        let best = here, bx = 0, bz = 0;
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
          const v = F[(iz + dz) * L.w + ix + dx];
          if (dx && dz && (!L.cellFree(ix + dx, iz) || !L.cellFree(ix, iz + dz))) continue;
          if (v < best) { best = v; bx = dx; bz = dz; }
        }
        if (bx || bz) { tx = ix + bx + 0.5; tz = iz + bz + 0.5; }
      }
    }
    let dx = tx - this.x, dz = tz - this.z; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    // separation from other monsters
    let sx = 0, sz = 0;
    for (const m of WORLD.monsters) {
      if (m === this || !m.alive) continue;
      const ex = this.x - m.x, ez = this.z - m.z, dd = ex * ex + ez * ez, rr = (this.radius + m.radius) * 1.15;
      if (dd < rr * rr && dd > 1e-6) { const k = (rr - Math.sqrt(dd)) / rr; sx += ex * k * 2.5; sz += ez * k * 2.5; }
    }
    dx += sx; dz += sz;
    const l2 = Math.hypot(dx, dz) || 1;
    const sp = this.speed * this.speedMul();
    moveWithCollision(this, dx / l2 * sp * dt, dz / l2 * sp * dt);
    turnToward(this, faceAngle(dx, dz), dt, 10);
    this.moveSpeedNow = sp;
  }
  moveAway(H, dt) {
    let dx = this.x - H.x, dz = this.z - H.z; const l = Math.hypot(dx, dz) || 1;
    const sp = this.speed * this.speedMul();
    moveWithCollision(this, dx / l * sp * dt, dz / l * sp * dt);
    turnToward(this, faceAngle(dx, dz), dt, 10); this.moveSpeedNow = sp;
  }
  attackMelee(H) {
    this.rot = faceAngle(H.x - this.x, H.z - this.z);
    const dur = this.atkDur;
    this.startAction('attack', dur, () => {
      if (!H.alive) return;
      const reach = this.radius + H.radius + 0.9;
      if (this.dist(H) > reach) { SFX.play('swing', { x: this.x, z: this.z, vol: 0.4 }); return; }
      monsterHits(this, H);
    }, 0.5);
    this.cd = dur + rand.range(0.25, 0.8) * (this.T.heavy ? 1.6 : 1);
    SFX.play(this.T.sound + 'Attack', { x: this.x, z: this.z, vol: 0.5 });
  }
  shoot(H) {
    if (!H.alive) return;
    const kind = this.T.proj;
    const sx = this.x + Math.sin(this.rot) * 0.4, sz = this.z + Math.cos(this.rot) * 0.4;
    const spread = this.T.ai === 'caster' ? 0 : rand.range(-0.06, 0.06);
    const a = Math.atan2(H.x - sx, H.z - sz) + spread;
    const dmg = { min: this.dmg[0], max: this.dmg[1] };
    if (kind === 'firebolt' || kind === 'fireball') { dmg.fire = [this.dmg[0], this.dmg[1]]; dmg.min = 0; dmg.max = 0; }
    spawnProjectile(kind, this, sx, sz, a, dmg);
  }
  tryResurrect() {
    for (const m of WORLD.monsters) {
      if (m.alive || m === this || m.T.boss || m.T.model !== 'imp' || m.deadT > 8 || m.resurrected) continue;
      if (this.dist(m) > 7) continue;
      this.startAction('cast', 1.2, () => {
        m.alive = true; m.hp = m.maxHp * 0.6; m.resurrected = true; m.deadT = 0; m.action = null;
        if (!m.vis) return;
        m.vis.play('idle', 1, true); m.vis.obj.position.y = 0;
        fxBurst(m.x, 0.6, m.z, [1, 0.4, 0.1], 30, 2, 0.14, 0.8);
        SFX.play('resurrect', { x: m.x, z: m.z });
      }, 0.7);
      this.cd = 4; return true;
    }
    return false;
  }
  die(src, kind) {
    if (!this.alive) return;
    this.alive = false; this.hp = 0; this.deadT = 0; this.action = null;
    if (this.vis) this.vis.play('death', this.T.boss ? 2.4 : 1.1, true);
    SFX.play(this.T.sound + 'Die', { x: this.x, z: this.z, vol: 0.8 });
    const H = WORLD.hero;
    if (src === H && !this.T.boss && (this.champion ? Math.random() < 0.6 : Math.random() < 0.12)) setTimeout(() => heroBark('kill', 25), 500);
    if (this.T.undead && this.T.model === 'skeleton') fxBoneChips(this.x, 0.8, this.z, 16); else if (this.T.model !== 'wraith') fxBlood(this.x, 0.9, this.z, 22);
    if (this.T.model !== 'skeleton' && this.T.model !== 'wraith' && this.T.model !== 'golem') fxDecal('blood', this.x, this.z, rand.range(0.9, 1.6) * (this.T.boss ? 2 : 1));
    if (this.T.model === 'wraith') fxBurst(this.x, 1, this.z, [0.4, 0.6, 1], 40, 2, 0.18, 1.2);
    if (H) H.gainXp(this.xpVal * (1 + Math.max(0, (this.mlvl - H.lvl)) * 0.05) * (H.lvl > this.mlvl + 10 ? 0.2 : 1));
    dropLoot(this);
    if (this.T.onDeath === 'poisonCloud') spawnEffect('poisonCloud', this.x, this.z, { dmg: this.dmg[1] * 0.5, owner: this });
    if (this.champion && this.champion.mods.includes('fire')) spawnEffect('explode', this.x, this.z, { dmg: this.dmg[1], owner: this, col: [1, 0.5, 0.1] });
    // cowardly allies flee
    for (const m of WORLD.monsters) if (m.alive && m.T.cowardly && m.dist(this) < 6 && !m.champion && Math.random() < 0.7) m.fleeT = rand.range(1.5, 3);
    if (this.T.quest) Game.onBossKilled(this);
    const bv = BOSS_VOICE[this.T.boss];
    if (bv) { playVoice(bv + '_death', { duck: 0.5, verb: 0.35 }); setTimeout(() => heroBark('bosskill', 0), 5200); }
    if (UI.target === this) UI.targetFade = 1.5;
  }
}
function alertPack(m) { for (const o of WORLD.monsters) if (o.alive && !o.aggro && o.dist(m) < 6) { o.aggro = true; } }

// ----------------------------------------------------------------
// COMBAT
// ----------------------------------------------------------------
function rollDmg(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }
function hitChance(atk, def) { return clamp(0.78 + (atk - def) / 250, 0.15, 0.97); }

// hero -> monster
function heroHits(H, m, opts = {}) {
  if (!m.alive) return false;
  if (!opts.noMiss && Math.random() > hitChance(H.tohit + (opts.tohit || 0), m.armor * (H.d.pierce ? 0.5 : 1))) { floatText(m, 'Miss', '#a09080'); SFX.play('swing', { x: m.x, z: m.z, vol: 0.5 }); return false; }
  let phys = opts.noWeapon ? 0 : rollDmg(H.dmg[0], H.dmg[1]) * (opts.mul || 1);
  if (m.T.undead && H.d.dmgUndead) phys *= 1 + H.d.dmgUndead / 100;
  if (m.T.demon && H.d.dmgDemons) phys *= 1 + H.d.dmgDemons / 100;
  let crit = false;
  const critChance = 0.05 + H.lvl * 0.003 + H.attr('dex') * 0.0005;
  if (Math.random() < critChance) { phys *= 2; crit = true; }
  const dmg = { phys, fire: 0, cold: 0, light: 0 };
  if (!opts.noWeapon) {
    if (H.elem.fire) dmg.fire += rollDmg(H.elem.fire, H.elem.fire * 2);
    if (H.elem.cold) dmg.cold += rollDmg(H.elem.cold, Math.round(H.elem.cold * 1.6));
    if (H.elem.light) dmg.light += rollDmg(1, H.elem.light * 2);
  }
  if (opts.fire) dmg.fire += opts.fire; if (opts.cold) dmg.cold += opts.cold; if (opts.light) dmg.light += opts.light;
  const total = applyDamage(m, dmg, H, { crit, knock: opts.knock, stun: opts.stun, src: H });
  if (total > 0 && !opts.noImpact) { const a = Math.atan2(m.x - H.x, m.z - H.z); fxImpact(m.x - Math.sin(a) * m.radius * 0.6, 1.0 * (m.vis ? m.vis.scale : 1), m.z - Math.cos(a) * m.radius * 0.6, crit || opts.mul > 1.3); }
  if (H.d.crit && Math.random() < H.d.crit / 100 && !m.boss) { m.hp -= m.hp * 0.25; }
  if (H.d.lifeSteal) H.hp = Math.min(H.maxHp, H.hp + total * H.d.lifeSteal / 100);
  if (H.d.manaSteal) H.mana = Math.min(H.maxMana, H.mana + total * H.d.manaSteal / 100);
  if (H.d.bloodlust) H.hp = Math.min(H.maxHp, H.hp + total * H.d.bloodlust / 100);
  if (opts.coldSlow || dmg.cold > 0) m.slow = Math.max(m.slow, 2);
  return true;
}
// generic damage application to any actor; returns total damage dealt
function applyDamage(t, dmg, src, opts = {}) {
  if (!t.alive) return 0;
  const res = t.res || { fire: 0, cold: 0, light: 0, poison: 0 };
  let total = 0;
  let phys = dmg.phys || 0;
  if (t === WORLD.hero && phys > 0) phys = Math.max(1, phys * (1 - Math.min(0.5, t.armor / (t.armor + 120))));
  total += phys;
  total += (dmg.fire || 0) * (1 - res.fire / 100);
  total += (dmg.cold || 0) * (1 - res.cold / 100);
  total += (dmg.light || 0) * (1 - res.light / 100);
  if (dmg.poison) { t.poison = 3; t.poisonDps = Math.max(t.poisonDps * 0.5, dmg.poison * (1 - (res.poison || 0) / 100) / 3); }
  if (dmg.burn) { t.burn = 2; t.burnDps = dmg.burn; }
  if (dmg.cold) t.slow = Math.max(t.slow, 1.5);
  if (opts.freeze) t.freeze = Math.max(t.freeze, opts.freeze);
  total = Math.max(0, Math.round(total));
  t.hp -= total;
  if (t.vis) t.vis.flash = Math.min(1, 0.6 + (opts.crit ? 0.4 : 0));
  // effects
  const isHero = t === WORLD.hero;
  if (total > 0) {
    if (t.T && t.T.undead && t.T.model === 'skeleton') { fxBoneChips(t.x, 1.0, t.z, 5); SFX.play('hitBone', { x: t.x, z: t.z }); }
    else if (t.T && t.T.model === 'golem') { fxSparks(t.x, 1, t.z, 8, [0.8, 0.7, 0.6]); SFX.play('hitStone', { x: t.x, z: t.z }); }
    else if (t.T && t.T.model === 'wraith') { fxBurst(t.x, 1, t.z, [0.4, 0.6, 1], 8, 1.5, 0.1, 0.5); SFX.play('hitFlesh', { x: t.x, z: t.z, vol: 0.5 }); }
    else { const dir = src ? [t.x - src.x, t.z - src.z] : null; if (dir) { const l = Math.hypot(...dir) || 1; dir[0] /= l; dir[1] /= l; } fxBlood(t.x, 1.0, t.z, opts.crit ? 20 : 9, dir); SFX.play(isHero ? 'heroHit' : 'hitFlesh', { x: t.x, z: t.z }); if (isHero && Math.random() < 0.6) SFX.play(t.voice + 'Hurt', { minGap: 0.9, vol: 0.8 }); }
    if (dmg.fire > 0) fxBurst(t.x, 1, t.z, [1, 0.5, 0.1], 10, 1.5, 0.12, 0.4);
    if (dmg.cold > 0) fxBurst(t.x, 1, t.z, [0.5, 0.7, 1], 10, 1.5, 0.12, 0.4);
    if (dmg.light > 0) fxSparks(t.x, 1, t.z, 10, [0.7, 0.8, 1]);
    if (G.settings.showDamage || opts.crit) floatText(t, (opts.crit ? 'Critical ' : '') + total, isHero ? '#ff6050' : opts.crit ? '#ffd040' : '#f0e0c0');
  }
  if (isHero) { R3.camShake = Math.max(R3.camShake, clamp(total / t.maxHp * 4, 0.1, 0.8)); vibrate(0.4 + clamp(total / t.maxHp, 0, 0.6), 0.3, 140); }
  // hit recovery / stun
  if (t.hp > 0 && (total >= t.maxHp / (isHero ? 10 : 8) || opts.stun) && !t.boss) {
    if (!(t.T && t.T.heavy) || opts.stun) {
      t.stun = Math.max(t.stun, opts.stun || 0.25);
      if (t.action && !isHero) t.action = null;
      if (t.vis && (!isHero || !t.action)) t.vis.play('hit', 0.28, true);
    }
  }
  if (opts.knock && t.hp > 0 && src && !t.boss) {
    const dx = t.x - src.x, dz = t.z - src.z, l = Math.hypot(dx, dz) || 1;
    for (let i = 0; i < 6; i++) moveWithCollision(t, dx / l * opts.knock / 6, dz / l * opts.knock / 6);
  }
  if (!isHero && src === WORLD.hero) { UI.setTarget(t); t.aggro = true; }
  if (t.hp <= 0) t.die(src);
  return total;
}
// monster -> hero (melee)
function monsterHits(m, H) {
  if (Math.random() > hitChance(m.tohit, H.armor)) { SFX.play('swing', { x: m.x, z: m.z, vol: 0.5 }); return; }
  if (H.block > 0 && !H.action && Math.random() < H.block / 100) {
    if (H.vis) H.vis.play('hit', 0.2, true);
    SFX.play('block', { x: H.x, z: H.z }); fxSparks(H.x + Math.sin(H.rot) * 0.3, 1.0, H.z + Math.cos(H.rot) * 0.3, 10);
    return;
  }
  const dmg = { phys: rollDmg(m.dmg[0], m.dmg[1]) };
  const E = m.elem || {};
  if (E.fire) dmg.fire = rollDmg(E.fire[0], E.fire[1]);
  if (E.cold) dmg.cold = rollDmg(E.cold[0], E.cold[1]);
  if (E.light) dmg.light = rollDmg(E.light[0], E.light[1]);
  if (E.poison) dmg.poison = rollDmg(E.poison[0], E.poison[1]);
  const total = applyDamage(H, dmg, m, { stun: m.T.heavy ? 0.4 : 0 });
  if (H.alive && H.hp < H.maxHp * 0.25) heroBark('lowhp', 30);
  if (m.T.drain) m.hp = Math.min(m.maxHp, m.hp + total * m.T.drain);
  if (H.d.thorns) applyDamage(m, { phys: H.d.thorns }, H, {});
}

// ----------------------------------------------------------------
// PROJECTILES
// ----------------------------------------------------------------
const PROJ_DEF = {
  arrow: { speed: 15, life: 1.4, radius: 0.18, col: null },
  darkbolt: { speed: 7, life: 2.2, radius: 0.22, col: [0.6, 0.2, 1], light: 0x8040ff, size: 0.16 },
  firebolt: { speed: 9.5, life: 1.8, radius: 0.22, col: [1, 0.5, 0.1], light: 0xff7020, size: 0.18 },
  fireball: { speed: 8.5, life: 1.8, radius: 0.3, col: [1, 0.45, 0.08], light: 0xff6010, size: 0.3, explode: 1.7 },
  frost: { speed: 11, life: 1.5, radius: 0.2, col: [0.5, 0.75, 1], light: 0x60a0ff, size: 0.16 },
  spit: { speed: 7, life: 2, radius: 0.25, col: [0.4, 1, 0.2], light: 0x60ff30, size: 0.2, arc: true },
  web: { speed: 8, life: 1.6, radius: 0.3, col: [0.9, 0.9, 0.9], size: 0.25 },
  firearrow: { speed: 15, life: 1.4, radius: 0.2, col: [1, 0.55, 0.15], light: 0xff7020, size: 0.1, explode: 1.3 },
  frostarrow: { speed: 15, life: 1.4, radius: 0.2, col: [0.5, 0.8, 1], light: 0x80b0ff, size: 0.1 },
};
function spawnProjectile(kind, owner, x, z, angle, dmg, opts = {}) {
  const D = PROJ_DEF[kind];
  const p = { kind, owner, team: owner.team, x, z, y: opts.y || 1.05, vx: Math.sin(angle) * D.speed * (opts.speedMul || 1), vz: Math.cos(angle) * D.speed * (opts.speedMul || 1), life: D.life * (opts.lifeMul || 1), dmg, radius: D.radius, pierce: opts.pierce || 0, hit: new Set(), D, opts, t: 0 };
  if (D.light) p.light = addLight({ x, y: p.y, z, color: D.light, intensity: 4, radius: 4, priority: 2, transient: true });
  WORLD.projectiles.push(p);
  SFX.play(kind === 'arrow' || kind.endsWith('arrow') ? 'bow' : kind === 'frost' ? 'frostCast' : kind === 'darkbolt' ? 'darkCast' : kind === 'spit' || kind === 'web' ? 'spit' : 'fireCast', { x, z, vol: 0.6 });
  return p;
}
function updateProjectiles(dt) {
  const P = WORLD.projectiles, L = WORLD.level;
  for (let i = P.length - 1; i >= 0; i--) {
    const p = P[i]; p.t += dt; p.life -= dt;
    // homing for some spells
    if (p.opts.homing && p.team === 'hero') {
      let best = null, bd = 6;
      for (const m of WORLD.monsters) if (m.alive && !p.hit.has(m)) { const d = Math.hypot(m.x - p.x, m.z - p.z); if (d < bd) { bd = d; best = m; } }
      if (best) { const sp = Math.hypot(p.vx, p.vz); const a = Math.atan2(p.vx, p.vz); const t = Math.atan2(best.x - p.x, best.z - p.z); const na = a + clamp(angDiff(a, t), -4 * dt, 4 * dt); p.vx = Math.sin(na) * sp; p.vz = Math.cos(na) * sp; }
    }
    const steps = 3;
    let dead = false;
    for (let s = 0; s < steps && !dead; s++) {
      p.x += p.vx * dt / steps; p.z += p.vz * dt / steps;
      if (L && L.blocksSight(Math.floor(p.x), Math.floor(p.z))) { dead = true; projImpact(p, null); break; }
      if (p.team === 'hero') {
        for (const m of WORLD.monsters) {
          if (!m.alive || p.hit.has(m)) continue;
          if (Math.hypot(m.x - p.x, m.z - p.z) < m.radius + p.radius) {
            p.hit.add(m); projHit(p, m);
            if (p.pierce-- <= 0) { dead = true; projImpact(p, m); break; }
          }
        }
      } else {
        const H = WORLD.hero;
        if (H && H.alive && Math.hypot(H.x - p.x, H.z - p.z) < H.radius + p.radius) { projHit(p, H); dead = true; projImpact(p, H); }
      }
    }
    if (p.life <= 0 && !dead) { dead = true; projImpact(p, null); }
    // visuals
    const D = p.D;
    if (p.opts.vis) p.opts.vis(p, dt, dead);
    else if (D.col) { for (let k = 0; k < (D.size > 0.2 ? 3 : 2); k++) fxTrail(p.x - p.vx * dt * k / 3, p.y, p.z - p.vz * dt * k / 3, D.col, D.size || 0.12, 0.3); if (p.kind === 'fireball' && Math.random() < 0.5) fxSmoke(p.x, p.y, p.z, 1, [0.1, 0.08, 0.07]); }
    if (!D.col && !dead) { const k = 0.045, w = 0.012; GFX.S.trails.push({ pts: [[p.x - p.vx * k, p.y - w, p.z - p.vz * k, p.x - p.vx * k, p.y + w, p.z - p.vz * k, 0.0], [p.x, p.y - w, p.z, p.x, p.y + w, p.z, 0.9]], col: [0.55, 0.45, 0.3] }); }
    if (p.light) { p.light.x = p.x; p.light.z = p.z; }
    if (dead) { if (p.light) removeLight(p.light); P.splice(i, 1); }
  }
}
function projHit(p, t) {
  const d = p.dmg || {};
  if (p.team === 'hero') {
    const H = WORLD.hero;
    if (p.opts.weapon) heroHits(H, t, { noMiss: false, mul: p.opts.mul || 1, fire: d.fire ? rollDmg(d.fire[0], d.fire[1]) : 0, cold: d.cold ? rollDmg(d.cold[0], d.cold[1]) : 0, knock: p.opts.knock });
    else applyDamage(t, { phys: d.min ? rollDmg(d.min, d.max) : 0, fire: d.fire ? rollDmg(d.fire[0], d.fire[1]) : 0, cold: d.cold ? rollDmg(d.cold[0], d.cold[1]) : 0, light: d.light ? rollDmg(d.light[0], d.light[1]) : 0, burn: d.burn }, H, { freeze: p.opts.freeze });
    if (p.kind === 'frostarrow') t.slow = Math.max(t.slow, 3);
  } else {
    const H = WORLD.hero;
    if (p.kind === 'arrow' && H.block > 0 && Math.random() < H.block / 100 * 0.8) { SFX.play('block', { x: H.x, z: H.z }); fxSparks(H.x, 1, H.z, 8); return; }
    if (Math.random() > hitChance(p.owner.tohit || 80, H.armor * 0.6)) return;
    const dm = { phys: d.min ? rollDmg(d.min, d.max) : 0, fire: d.fire ? rollDmg(d.fire[0], d.fire[1]) : 0, cold: d.cold ? rollDmg(d.cold[0], d.cold[1]) : 0 };
    if (p.kind === 'spit') dm.poison = rollDmg(p.owner.dmg[0], p.owner.dmg[1]) * 0.6;
    if (p.kind === 'web') { H.slow = 3; }
    if (p.kind === 'darkbolt') { dm.cold = dm.phys * 0.3; }
    applyDamage(H, dm, p.owner, {});
  }
}
function projImpact(p, t) {
  const D = p.D;
  if (p.opts.impact) p.opts.impact(p, t);
  else if (D.explode) {
    spawnEffect('explode', p.x, p.z, { dmg: p.dmg, owner: p.owner, team: p.team, r: D.explode * (p.opts.radiusMul || 1), col: D.col, exclude: t });
  } else if (D.col) fxBurst(p.x, p.y, p.z, D.col, 14, 2, 0.12, 0.4);
  else if (!t) { fxSparks(p.x, p.y, p.z, 4, [0.7, 0.6, 0.4]); SFX.play('arrowHit', { x: p.x, z: p.z, vol: 0.4 }); }
}

// ----------------------------------------------------------------
// EFFECTS (explosions, clouds, walls of fire, novas...)
// ----------------------------------------------------------------
function spawnEffect(kind, x, z, o = {}) {
  const e = { kind, x, z, t: 0, o };
  if (kind === 'explode') {
    const r = o.r || 1.6;
    fxBurst(x, 0.6, z, o.col || [1, 0.5, 0.1], 70, r * 3, 0.25, 0.7); fxSmoke(x, 0.4, z, 10); fxRing(x, z, o.col || [1, 0.5, 0.1], r, 40, 0.2);
    const L = addLight({ x, y: 1, z, color: 0xff7020, intensity: 14, radius: 6, priority: 3, transient: true }); e.light = L; e.dur = 0.35;
    SFX.play('explode', { x, z }); R3.camShake = Math.max(R3.camShake, 0.35);
    areaDamage(x, z, r, o.team || o.owner.team, o.dmg, o.owner, { exclude: o.exclude });
  } else if (kind === 'poisonCloud') {
    e.dur = 4; e.tick = 0; SFX.play('poison', { x, z });
  } else if (kind === 'firewall') {
    e.dur = o.dur || 4; e.tick = 0; SFX.play('fireCast', { x, z });
  } else if (kind === 'nova') {
    e.dur = 0.5; fxRing(x, z, o.col, o.r || 3, 80, 0.4); SFX.play(o.sound || 'frostNova', { x, z });
    areaDamage(x, z, o.r || 3, o.team, o.dmg, o.owner, { freeze: o.freeze });
  } else if (kind === 'meteor') {
    e.dur = o.delay || 1.1; SFX.play('meteorFall', { x, z });
  } else if (kind === 'portalOpen') { e.dur = 0.8; }
  WORLD.effects.push(e);
  return e;
}
function areaDamage(x, z, r, team, dmg, owner, opts = {}) {
  const targets = team === 'hero' ? WORLD.monsters : [WORLD.hero];
  for (const t of targets) {
    if (!t || !t.alive || t === opts.exclude) continue;
    const d = Math.hypot(t.x - x, t.z - z);
    if (d > r + t.radius) continue;
    const dm = {};
    if (dmg.min) dm.phys = rollDmg(dmg.min, dmg.max);
    if (dmg.fire) dm.fire = rollDmg(dmg.fire[0], dmg.fire[1]);
    if (dmg.cold) dm.cold = rollDmg(dmg.cold[0], dmg.cold[1]);
    if (dmg.light) dm.light = rollDmg(dmg.light[0], dmg.light[1]);
    if (dmg.poison) dm.poison = dmg.poison;
    if (dmg.phys) dm.phys = dmg.phys;
    applyDamage(t, dm, owner, { freeze: opts.freeze, knock: opts.knock });
  }
}
function updateEffects(dt) {
  const E = WORLD.effects;
  for (let i = E.length - 1; i >= 0; i--) {
    const e = E[i]; e.t += dt;
    if (e.kind === 'explode' && e.light) e.light.intensity = 14 * (1 - e.t / e.dur);
    if (e.kind === 'flash' && e.light) e.light.intensity = e.i0 * Math.max(0, 1 - e.t / e.dur);
    if (e.kind === 'rain') updateRain(e, dt);
    if (e.kind === 'poisonCloud') {
      if (Math.random() < dt * 25) FX.soft.emit({ x: e.x + (Math.random() - 0.5) * 2.5, y: 0.2 + Math.random() * 0.6, z: e.z + (Math.random() - 0.5) * 2.5, vx: (Math.random() - 0.5) * 0.3, vy: 0.15, vz: (Math.random() - 0.5) * 0.3, c: [0.25, 0.45, 0.08], life: 1.6, s: 0.6, s2: 1.4, a: 0.45 });
      e.tick -= dt; if (e.tick <= 0) { e.tick = 0.5; const H = WORLD.hero; if (H && H.alive && Math.hypot(H.x - e.x, H.z - e.z) < 1.6) applyDamage(H, { poison: e.o.dmg }, e.o.owner, {}); }
    }
    if (e.kind === 'firewall') {
      for (const pt of e.o.points) if (Math.random() < dt * 14) FX.add.emit({ x: pt[0] + (Math.random() - 0.5) * 0.4, y: 0.1, z: pt[1] + (Math.random() - 0.5) * 0.4, vx: 0, vy: 1.4 + Math.random(), vz: 0, c: [1, 0.6, 0.2], c2: [0.6, 0.05, 0], life: 0.6, s: 0.3, s2: 0.06, a: 0.9 });
      e.tick -= dt;
      if (e.tick <= 0) {
        e.tick = 0.25;
        const victims = e.o.team === 'monster' ? [WORLD.hero] : WORLD.monsters;
        for (const m of victims) if (m && m.alive) for (const pt of e.o.points) if (Math.hypot(m.x - pt[0], m.z - pt[1]) < 0.6 + m.radius) { applyDamage(m, { fire: rollDmg(e.o.dmg[0], e.o.dmg[1]) * 0.25 }, e.o.team === 'monster' ? null : WORLD.hero, {}); break; }
      }
      if (!e.light) e.light = addLight({ x: e.o.points[Math.floor(e.o.points.length / 2)][0], y: 0.8, z: e.o.points[Math.floor(e.o.points.length / 2)][1], color: 0xff6010, intensity: 8, radius: 6, flicker: 0.3, priority: 2, transient: true });
    }
    if (e.kind === 'meteor' && !e.landed && Math.random() < dt * 40) { const a = Math.random() * TAU, r = (e.o.r || 2) * (0.9 + Math.random() * 0.15); FX.add.emit({ x: e.x + Math.cos(a) * r, y: 0.05, z: e.z + Math.sin(a) * r, vy: 0.3, life: 0.5, s: 0.06, c: [2.4, 0.6, 0.12], drag: 1 }); }
    if (e.kind === 'meteor' && !e.landed && e.t > e.dur - 0.25) {
      // meteor streak
      const k = (e.t - (e.dur - 0.25)) / 0.25;
      fxTrail(e.x - 3 * (1 - k), 6 * (1 - k), e.z - 3 * (1 - k), [1, 0.6, 0.2], 0.5, 0.4);
    }
    if (e.kind === 'meteor' && !e.landed && e.t >= e.dur) {
      e.landed = true;
      spawnEffect('explode', e.x, e.z, { dmg: e.o.dmg, owner: e.o.owner, team: e.o.team, r: e.o.r || 2.2, col: [1, 0.45, 0.1] });
      spawnEffect('firewall', e.x, e.z, { points: [[e.x, e.z], [e.x + 0.6, e.z], [e.x - 0.6, e.z], [e.x, e.z + 0.6], [e.x, e.z - 0.6]], dmg: e.o.burn || [5, 10], dur: 3, team: e.o.team });
      e.dur = e.t;
    }
    if (e.t >= e.dur) { if (e.light) removeLight(e.light); E.splice(i, 1); }
  }
}

// ----------------------------------------------------------------
// FLOW FIELD (monster pathing toward the hero)
// ----------------------------------------------------------------
function updateFlow(dt) {
  const H = WORLD.hero, L = WORLD.level; if (!H || !L) return;
  const cell = Math.floor(H.z) * L.w + Math.floor(H.x);
  WORLD.flowT -= dt;
  if (cell !== WORLD.flowCell || WORLD.flowT <= 0) {
    WORLD.flowCell = cell; WORLD.flowT = 0.5;
    WORLD.flow = L.bfs(Math.floor(H.x), Math.floor(H.z), 30);
  }
}

// ----------------------------------------------------------------
// LOOT
// ----------------------------------------------------------------
function dropLoot(m) {
  const H = WORLD.hero, depth = WORLD.depth;
  const T = m.T;
  const mf = H ? (H.d.magicFind || 0) : 0;
  let n = 0;
  if (T.boss) n = { flayer: 3, king: 5, mother: 6, final: 9 }[T.boss] || 3;
  else if (m.champion) n = rand.int(2, 3);
  else n = rand() < 0.42 ? 1 : 0;
  for (let i = 0; i < n; i++) {
    const it = randomItem(m.mlvl + (T.boss ? 2 : 0), rand, { magicFind: mf, boss: !!T.boss, champion: !!m.champion, equipOnly: T.boss && i < 2 });
    spawnDrop(it, m.x, m.z, true);
  }
  // guaranteed unique from quest bosses
  if (T.boss) {
    const pool = { flayer: ['flayersCleaver', 'abbotsHood', 'thornheart', 'gravecaller'], king: ['kingsCirclet', 'boneweave', 'ashenwand', 'nightstride'], mother: ['widowsKiss', 'marrowmaul', 'ravenmark', 'emberRing', 'gripOfTheDeep'], final: ['oathkeeper', 'hellforged', 'starfall', 'saintsMantle'] }[T.boss];
    const u = UNIQUES.find(u => u.id === rand.pick(pool)); if (u) spawnDrop(makeUnique(u, m.mlvl), m.x, m.z, true);
    // a tome for the hero's class
    const sk = rand.pick(CLASS_SKILLS[H.cls]); spawnDrop(makeItem('tome', { skill: sk }), m.x, m.z, true);
  } else if (rand() < 0.012 + (m.champion ? 0.05 : 0)) {
    const sk = rand.pick(CLASS_SKILLS[H.cls].filter(s => SKILLS[s].reqLevel <= m.mlvl + 2)); if (sk) spawnDrop(makeItem('tome', { skill: sk }), m.x, m.z, true);
  }
  // gold
  if (rand() < 0.45 || T.boss || m.champion) {
    const g = Math.round(rand.range(3, 9) * (1 + depth * 1.6) * (T.boss ? 12 : m.champion ? 3 : 1) * (1 + (H ? (H.d.gold || 0) : 0) / 100));
    spawnDrop(makeItem('gold', { qty: g }), m.x, m.z, true);
  }
}
function spawnDrop(it, x, z, fling) {
  // find a free spot near x,z
  let tx = x, tz = z;
  for (let k = 0; k < 20; k++) {
    const a = rand() * TAU, r = fling ? rand.range(0.3, 1.4) : 0;
    const cx = x + Math.cos(a) * r, cz = z + Math.sin(a) * r;
    if (WORLD.level ? WORLD.level.walkable(cx, cz) : true) { if (!WORLD.drops.some(d => Math.hypot(d.x - cx, d.z - cz) < 0.35)) { tx = cx; tz = cz; break; } }
  }
  const B = BASES[it.base];
  const mesh = new Node();
  mesh.draw = () => { const sh = SETS.items_g; if (sh) GFX.sprite(sh, itemView(it), 0, 0, mesh.position.x, mesh.position.y, mesh.position.z, it.rarity === 3 ? DROP_U : it.rarity === 1 ? DROP_M : DROP_N); };
  (WORLD.root || R3.scene).add(mesh);
  mesh.position.set(tx, 0, tz);
  const d = { it, x: tx, z: tz, sx: x, sz: z, mesh, t: fling ? 0 : 1, flat: false, label: null, light: null };
  if (it.rarity === 3) d.light = addLight({ x: tx, y: 0.6, z: tz, color: 0xffb040, intensity: 2.5, radius: 2.5, priority: 1 });
  WORLD.drops.push(d);
  if (fling) SFX.play(B.kind === 'gold' ? 'goldDrop' : it.rarity === 3 ? 'uniqueDrop' : B.kind === 'potion' ? 'potionDrop' : 'itemDrop', { x: tx, z: tz, vol: 0.7, delay: 0.45 });
  return d;
}
function updateDrops(dt) {
  const H = WORLD.hero;
  for (let i = WORLD.drops.length - 1; i >= 0; i--) {
    const d = WORLD.drops[i];
    if (d.t < 1) {
      d.t = Math.min(1, d.t + dt * 2.2);
      const k = d.t;
      d.mesh.position.set(lerp(d.sx, d.x, k), Math.sin(k * Math.PI) * 1.1, lerp(d.sz, d.z, k));
    } else d.mesh.position.set(d.x, 0, d.z);
    // auto pickup gold
    if (H && H.alive && d.it.kind === 'gold' && d.t >= 1 && Math.hypot(H.x - d.x, H.z - d.z) < 0.7) { pickupDrop(d); continue; }
  }
}
function pickupDrop(d) {
  const H = WORLD.hero;
  const it = d.it;
  if (!H.addItem(it)) return false;
  if (it.kind === 'gold') { SFX.play('gold'); UI.msg(`+${fmtNum(it.qty)} gold`, '#e8c860'); }
  else { SFX.play('pickup'); UI.msg(itemName(it), itemColor(it).startsWith('var') ? null : itemColor(it), false, it); }
  removeDrop(d);
  return true;
}
function removeDrop(d) {
  if (d.mesh.parent) d.mesh.parent.remove(d.mesh); if (d.light) removeLight(d.light); if (d.label) d.label.remove();
  const i = WORLD.drops.indexOf(d); if (i >= 0) WORLD.drops.splice(i, 1);
}

// ----------------------------------------------------------------
// INTERACTABLE OBJECTS
// ----------------------------------------------------------------
const DROP_N = { scale: 1.6 }, DROP_U = { scale: 1.6, emis: 0.35, tint: [1.25, 1.1, 0.8] }, DROP_M = { scale: 1.6, emis: 0.12, tint: [0.95, 1.0, 1.2] };
const SHRINE_EFFECTS = [
  { name: 'Mysterious', msg: 'You feel more experienced.', fn: H => { const a = rand.pick(['str', 'dex', 'mag', 'vit']); H.base[a] += 2; H.recalc(); return `+2 ${({ str: 'Strength', dex: 'Dexterity', mag: 'Magic', vit: 'Vitality' })[a]}`; } },
  { name: 'Hidden', msg: 'New strength is forged through destruction.', fn: H => { H.addBuff('shrineDmg', 90, { dmgBuff: 40 }); return '+40% damage for a while'; } },
  { name: 'Glimmering', msg: 'Knowledge is power.', fn: H => { let n = 0; for (const it of H.inv) if (it && !it.identified) { it.identified = true; n++; } return n ? `${n} items identified` : 'Nothing happens.'; } },
  { name: 'Sacred', msg: 'Energy is focused.', fn: H => { H.hp = H.maxHp; H.mana = H.maxMana; return 'Life and mana restored'; } },
  { name: 'Spiritual', msg: 'Riches abound.', fn: H => { const g = Math.round(100 + WORLD.depth * 120); H.gold += g; return `+${g} gold`; } },
  { name: 'Stone', msg: 'The flesh hardens.', fn: H => { H.addBuff('shrineArmor', 120, { armorBuff: 30 + WORLD.depth * 5 }); return 'Armor greatly increased'; } },
  { name: 'Eerie', msg: 'The darkness recedes.', fn: H => { H.addBuff('shrineLight', 120, { light: 60 }); return 'Light radius increased'; } },
  { name: 'Fascinating', msg: 'Your mind expands, your body withers.', fn: H => { H.base.mag += 3; H.base.vit = Math.max(1, H.base.vit - 1); H.recalc(); return '+3 Magic, -1 Vitality'; } },
];

// interactive objects are drawn from the shared crypt kit; their state picks the frame (closed/open) or piece (broken)
const OBJ_PIECE = { barrel: 'barrel', crate: 'crate', chest: 'chest', sarcophagus: 'sarcophagus', coffin: 'coffin', shrine: 'shrine' };
function pieceDir(set, p, d) { const sh = SETS[set], A = sh && sh.meta.anims[p]; if (!A) return 0; return A.dirs ? Math.max(0, A.dirs.indexOf(d % 4)) : d % A.frames.length; }
function makeObjectMesh(o) {
  if (o.type === 'shrine' && o.kind === 'altar') return null;
  if (!OBJ_PIECE[o.type]) return null;
  const n = new Node();
  n.draw = () => {
    const sh = SETS.crypt_common; if (!sh) return;
    const p = o.broken ? 'rubble' : OBJ_PIECE[o.type];
    const f = o.used && (o.type === 'chest' || o.type === 'sarcophagus' || o.type === 'coffin') ? 1 : 0;
    const hov = Game.hoverInteract === o || (Game.interactTarget === o && IN.lastDevice === 'pad');
    GFX.sprite(sh, p, pieceDir('crypt_common', p, o.rot || 0), f, o.x, 0, o.z, hov && !o.used ? HOVER_OPT : null);
  };
  return n;
}
const HOVER_OPT = { emis: 0.25, tint: [1.15, 1.05, 0.9] };
function spawnObjects(L) {
  for (const src of L.objects) {
    const o = Object.assign({ used: false }, src);
    o.mesh = makeObjectMesh(o);
    if (o.mesh) WORLD.root.add(o.mesh);
    if (['barrel', 'crate', 'chest', 'coffin'].includes(o.type)) L.block[L.idx(Math.floor(o.x), Math.floor(o.z))] = 1;
    o.name = { barrel: 'Barrel', crate: 'Crate', chest: 'Chest', sarcophagus: 'Sarcophagus', coffin: 'Coffin', shrine: o.kind === 'altar' ? 'Blood Altar' : 'Shrine', lectern: 'Ancient Tome' }[o.type];
    if (o.type === 'shrine' && o.kind === 'shrine') { o.effect = rand.pick(SHRINE_EFFECTS); o.name = o.effect.name + ' Shrine'; o.light = addLight({ x: o.x, y: 1.3, z: o.z, color: 0x6090ff, intensity: 3, radius: 3.5, flicker: 0.1 }); }
    if (o.type === 'barrel' && WORLD.depth >= 4 && rand() < 0.12) o.explosive = true;
    o.r = o.type === 'sarcophagus' ? 0.9 : 0.6;
    WORLD.objects.push(o);
  }
}
function useObject(o) {
  const H = WORLD.hero; if (o.used) return;
  const L = WORLD.level;
  const free = () => { if (L) L.block[L.idx(Math.floor(o.x), Math.floor(o.z))] = 0; };
  switch (o.type) {
    case 'barrel': case 'crate': {
      o.used = true; free();
      o.broken = true;
      SFX.play('barrelBreak', { x: o.x, z: o.z }); fxSmoke(o.x, 0.3, o.z, 4, [0.25, 0.2, 0.15]);
      for (let i = 0; i < 12; i++) FX.soft.emit({ x: o.x, y: 0.4, z: o.z, vx: (Math.random() - 0.5) * 3, vy: 2 + Math.random() * 2, vz: (Math.random() - 0.5) * 3, g: 9, c: [0.35, 0.22, 0.12], life: 0.8, s: 0.06, a: 1 });
      if (o.explosive) { const fd = { fire: [8 + WORLD.depth * 3, 16 + WORLD.depth * 6] }; spawnEffect('explode', o.x, o.z, { dmg: fd, owner: { team: 'monster', tohit: 100, x: o.x, z: o.z }, team: 'monster', r: 1.8 }); areaDamage(o.x, o.z, 1.8, 'hero', fd, WORLD.hero); }
      else if (rand() < 0.35) { const r = rand(); if (r < 0.55) spawnDrop(makeItem('gold', { qty: Math.round(rand.range(2, 8) * (1 + WORLD.depth)) }), o.x, o.z, true); else spawnDrop(randomItem(WORLD.depth * 2 + 1, rand), o.x, o.z, true); }
      else if (rand() < 0.08 && WORLD.depth > 0) { const t = monsterTable(WORLD.depth); if (t.length) { const m = new Monster(rand.pick(t).type, WORLD.depth); m.x = o.x; m.z = o.z; m.aggro = true; WORLD.monsters.push(m); } }
      return;
    }
    case 'chest': {
      o.used = true;
      SFX.play('chestOpen', { x: o.x, z: o.z });
      const n = rand.int(1, 3);
      for (let i = 0; i < n; i++) spawnDrop(rand() < 0.4 ? makeItem('gold', { qty: Math.round(rand.range(10, 30) * (1 + WORLD.depth)) }) : randomItem(WORLD.depth * 2 + 2, rand, { magicFind: 25 }), o.x, o.z, true);
      return;
    }
    case 'sarcophagus': case 'coffin': {
      o.used = true;
      SFX.play('stoneSlide', { x: o.x, z: o.z });
      if (rand() < 0.3 && WORLD.depth > 0) {
        const id = WORLD.depth >= 4 ? 'cryptGuard' : 'thrall';
        const m = new Monster(id, WORLD.depth); m.x = o.x + 0.8; m.z = o.z + 0.8; if (!canStand(m.x, m.z, 0.3)) { m.x = H.x + 1; m.z = H.z; }
        m.aggro = true; WORLD.monsters.push(m); SFX.play('skeletonAggro', { x: m.x, z: m.z });
      } else if (rand() < 0.7) spawnDrop(rand() < 0.5 ? makeItem('gold', { qty: Math.round(rand.range(8, 24) * (1 + WORLD.depth)) }) : randomItem(WORLD.depth * 2 + 2, rand), o.x, o.z + 0.8, true);
      return;
    }
    case 'shrine': {
      o.used = true;
      if (o.kind === 'altar') {
        // blood altar: trade life for a random blessing
        H.hp = Math.max(1, H.hp - H.maxHp * 0.25);
        const e = rand.pick(SHRINE_EFFECTS.filter(e => e.name !== 'Fascinating'));
        const r = e.fn(H); UI.msg('The altar drinks your blood…', '#c04030'); UI.msg(r, '#f0d290');
        SFX.play('shrine'); fxBurst(o.x, 1, o.z, [0.8, 0.05, 0.05], 40, 2, 0.12, 1);
      } else {
        const r = o.effect.fn(H); UI.msg(`${o.effect.name} Shrine: ${o.effect.msg}`, '#a0c0ff', true); UI.msg(r, '#f0d290');
        SFX.play('shrine'); fxBurst(o.x, 1.3, o.z, [0.4, 0.6, 1], 50, 2, 0.14, 1.2); if (o.light) o.light.intensity = 0.5;
      }
      return;
    }
    case 'lectern': {
      o.used = true; SFX.play('pageTurn');
      const tomes = CLASS_SKILLS[H.cls].filter(s => SKILLS[s].reqLevel <= H.lvl + 3);
      if (rand() < 0.45 && tomes.length) spawnDrop(makeItem('tome', { skill: rand.pick(tomes) }), o.x, o.z, true);
      else spawnDrop(makeItem(rand() < 0.5 ? 'scrollTP' : 'scrollID'), o.x, o.z, true);
      const lid = rand.pick(LORE_IDS); UI.msg('"' + DIALOGUE.lines[lid][1] + '"', '#c0a880', true); setTimeout(() => playVoice(lid, { verb: 0.3, duck: 0.45 }), 400);
      return;
    }
  }
}
const LORE_IDS = Object.keys(DIALOGUE.lines).filter(k => /^lore\d+$/.test(k));
const BOSS_VOICE = { flayer: 'malric', king: 'bishop', mother: 'webmother', final: 'vaelzhor' };

// ----------------------------------------------------------------
// floating text (DOM)
// ----------------------------------------------------------------
function floatText(t, text, color) { UI.floatText(t.x, 1.9 + (t.T && t.T.boss ? 1 : 0), t.z, text, color); }

