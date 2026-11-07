'use strict';
// Monster templates. Stats are given for the first dungeon level the monster appears on
// and scale with depth.

const MONSTERS = {
  // ---------------- The Sunken Abbey (1-3) ----------------
  risen: { name: 'The Risen', model: 'zombie', mopts: { vestments: 'clothCrimson', hair: 'hairGrey' }, style: { zombie: true, hunch: 0.35, stride: 1.1 }, hp: 13, dmg: [2, 5], armor: 5, tohit: 40, speed: 0.95, atk: 1.25, xp: 16, ai: 'melee', undead: true, sound: 'zombie', depth: [1, 4], w: 10, pack: [2, 4] },
  thrall: { name: 'Bone Thrall', model: 'skeleton', mopts: { weapon: 'sword', shield: 'buckler' }, style: { weapon: '1h', shield: true, crumble: true }, hp: 9, dmg: [2, 6], armor: 14, tohit: 50, speed: 1.75, atk: 0.9, xp: 20, ai: 'melee', undead: true, sound: 'skeleton', depth: [1, 4], w: 10, pack: [2, 4] },
  bat: { name: 'Carrion Bat', model: 'bat', kind: 'bat', mopts: {}, style: {}, hp: 5, dmg: [1, 3], armor: 2, tohit: 55, speed: 3.4, atk: 0.7, xp: 8, ai: 'flyer', sound: 'bat', depth: [1, 3], w: 5, pack: [3, 6], radius: 0.25, flying: true },
  acolyte: { name: 'Hollow Acolyte', model: 'cultist', mopts: {}, style: { caster: true, robe: true }, hp: 11, dmg: [3, 6], armor: 6, tohit: 60, speed: 1.6, atk: 1.2, xp: 30, ai: 'caster', proj: 'darkbolt', sound: 'cultist', depth: [2, 4], w: 5, pack: [1, 2] },
  boneArcher: { name: 'Hollow Archer', model: 'skeleton', mopts: { weapon: 'bow', hood: 'sackcloth', bone: 'boneDark' }, style: { weapon: 'bow', crumble: true }, hp: 9, dmg: [2, 5], armor: 10, tohit: 55, speed: 1.7, atk: 1.2, xp: 24, ai: 'ranged', proj: 'arrow', undead: true, sound: 'skeleton', depth: [2, 6], w: 6, pack: [1, 3] },
  // ---------------- The Ossuary (4-6) ----------------
  cryptGuard: { name: 'Crypt Guard', model: 'skeleton', mopts: { bone: 'boneDark', weapon: 'axe', shield: 'round', armor: true, helm: 'helm' }, style: { weapon: '1h', shield: true, crumble: true }, hp: 30, dmg: [5, 10], armor: 28, tohit: 70, speed: 1.85, atk: 0.9, xp: 60, ai: 'melee', undead: true, sound: 'skeleton', depth: [4, 7], w: 10, pack: [2, 4] },
  graveHound: { name: 'Grave Hound', model: 'hound', kind: 'hound', mopts: {}, style: {}, hp: 26, dmg: [4, 9], armor: 12, tohit: 70, speed: 3.3, atk: 0.8, xp: 55, ai: 'melee', undead: true, sound: 'hound', depth: [4, 8], w: 8, pack: [3, 5], radius: 0.42 },
  ghoul: { name: 'Grave Ghoul', model: 'ghoul', mopts: {}, style: { weapon: 'claw', hunch: 0.6, stride: 1.6 }, hp: 34, dmg: [5, 11], armor: 15, tohit: 70, speed: 2.7, atk: 0.75, xp: 66, ai: 'melee', undead: true, sound: 'ghoul', depth: [4, 7], w: 9, pack: [2, 5] },
  wraith: { name: 'Wraith', model: 'wraith', mopts: {}, style: { float: true }, hp: 40, dmg: [6, 12], armor: 20, tohit: 75, speed: 1.9, atk: 1.0, xp: 80, ai: 'melee', undead: true, sound: 'wraith', depth: [4, 8], w: 6, pack: [1, 3], elem: { cold: [2, 5] }, drain: 0.5, res: { cold: 50 } },
  plague: { name: 'Plague Bearer', model: 'zombie', mopts: { belly: 1.6, bulk: 1.15, skin: 'rotten', hair: false }, style: { zombie: true, hunch: 0.2, stride: 0.9 }, hp: 52, dmg: [6, 12], armor: 10, tohit: 55, speed: 0.9, atk: 1.3, xp: 75, ai: 'melee', undead: true, sound: 'zombie', depth: [4, 7], w: 5, pack: [1, 3], onDeath: 'poisonCloud', tint: 0xb0d090 },
  // ---------------- The Hollow Deep (7-9) ----------------
  lurker: { name: 'Cave Lurker', model: 'spider', kind: 'spider', mopts: {}, style: {}, hp: 70, dmg: [8, 16], armor: 30, tohit: 85, speed: 3.0, atk: 0.8, xp: 125, ai: 'melee', sound: 'spider', depth: [7, 10], w: 9, pack: [2, 4], elem: { poison: [3, 6] }, radius: 0.5 },
  pitImp: { name: 'Pit Imp', model: 'imp', mopts: {}, style: { weapon: 'claw', hunch: 0.3, stride: 1.9 }, hp: 45, dmg: [7, 14], armor: 22, tohit: 80, speed: 2.9, atk: 0.7, xp: 95, ai: 'melee', cowardly: true, demon: true, sound: 'imp', depth: [7, 10], w: 10, pack: [4, 7], radius: 0.28 },
  impShaman: { name: 'Imp Shaman', model: 'imp', mopts: { skin: 'demonDark', weapon: 'wand' }, style: { weapon: 'staff', hunch: 0.3 }, hp: 60, dmg: [8, 16], armor: 20, tohit: 85, speed: 2.4, atk: 1.2, xp: 170, ai: 'caster', proj: 'firebolt', demon: true, resurrect: true, sound: 'imp', depth: [7, 10], w: 4, pack: [1, 1], radius: 0.28 },
  brute: { name: 'Stone Brute', model: 'golem', mopts: {}, style: { weapon: 'claw', stride: 0.9 }, hp: 220, dmg: [16, 30], armor: 55, tohit: 80, speed: 1.3, atk: 1.5, xp: 270, ai: 'melee', heavy: true, sound: 'golem', depth: [7, 10], w: 4, pack: [1, 2], radius: 0.5, res: { fire: 30, cold: 30, light: 30 } },
  bloodBat: { name: 'Blood Bat', model: 'bat', kind: 'bat', mopts: { fur: 'flesh', scale: 1.3 }, style: {}, hp: 38, dmg: [6, 12], armor: 15, tohit: 80, speed: 3.6, atk: 0.6, xp: 70, ai: 'flyer', sound: 'bat', depth: [7, 10], w: 5, pack: [3, 6], radius: 0.28, flying: true, drain: 0.3 },
  // ---------------- The Burning Abyss (10-12) ----------------
  hellspawn: { name: 'Hellspawn', model: 'demon', mopts: { weapon: 'axe' }, style: { weapon: '1h', stride: 1.4 }, hp: 260, dmg: [22, 40], armor: 70, tohit: 100, speed: 2.4, atk: 0.9, xp: 430, ai: 'melee', demon: true, sound: 'demon', depth: [10, 12], w: 10, pack: [2, 4], elem: { fire: [5, 10] }, res: { fire: 50 } },
  flameWitch: { name: 'Flame Witch', model: 'cultist', mopts: { robe: 'clothRed', trim: 'gold', eye: 'eyeRed', skin: 'demon' }, style: { caster: true, robe: true }, hp: 180, dmg: [20, 34], armor: 40, tohit: 100, speed: 1.9, atk: 1.2, xp: 410, ai: 'caster', proj: 'fireball', demon: true, sound: 'cultist', depth: [10, 12], w: 6, pack: [1, 3], res: { fire: 75 } },
  abyssKnight: { name: 'Abyssal Knight', model: 'demon', mopts: { skin: 'demonDark', armor: true, weapon: 'sword', weaponMat: 'crimsonSteel', horns: 0.2 }, style: { weapon: '1h', stride: 1.2 }, hp: 420, dmg: [30, 55], armor: 110, tohit: 110, speed: 1.9, atk: 1.0, xp: 660, ai: 'melee', demon: true, sound: 'demon', depth: [10, 12], w: 6, pack: [1, 3], res: { fire: 50, cold: 30, light: 30 } },
  emberImp: { name: 'Ember Imp', model: 'imp', mopts: { skin: 'glowRed' }, style: { weapon: 'claw', hunch: 0.3, stride: 1.9 }, hp: 120, dmg: [16, 28], armor: 40, tohit: 100, speed: 3.0, atk: 0.7, xp: 260, ai: 'melee', cowardly: true, demon: true, sound: 'imp', depth: [10, 12], w: 7, pack: [4, 7], elem: { fire: [4, 8] }, radius: 0.28, res: { fire: 75 }, tint: 0xff8060 },
  magmaBrute: { name: 'Magma Brute', model: 'golem', mopts: { stone: 'demonDark', core: 'glowFire', key2: 'magma' }, style: { weapon: 'claw', stride: 0.9 }, hp: 520, dmg: [34, 60], armor: 120, tohit: 100, speed: 1.4, atk: 1.5, xp: 720, ai: 'melee', heavy: true, sound: 'golem', depth: [10, 12], w: 3, pack: [1, 2], radius: 0.5, elem: { fire: [8, 16] }, res: { fire: 90 } },
  tormented: { name: 'Tormented Soul', model: 'wraith', mopts: { eye: 'glowRed' }, style: { float: true }, hp: 220, dmg: [20, 36], armor: 50, tohit: 100, speed: 2.2, atk: 1.0, xp: 420, ai: 'melee', undead: true, sound: 'wraith', depth: [10, 12], w: 4, pack: [2, 3], drain: 0.5, tint: 0xff9080, elem: { fire: [5, 10] } },
  // ---------------- summons ----------------
  spiderling: { name: 'Spiderling', model: 'spider', kind: 'spider', mopts: { scale: 0.55 }, style: {}, hp: 30, dmg: [5, 10], armor: 10, tohit: 80, speed: 3.4, atk: 0.6, xp: 15, ai: 'melee', sound: 'spider', depth: [9, 9], w: 0, pack: [1, 1], radius: 0.3, elem: { poison: [2, 4] } },
  // ---------------- bosses ----------------
  flayer: { name: 'Brother Malric, the Flayer', model: 'zombie', mopts: { scale: 1.4, apron: true, hood: true, cleaver: true, skin: 'skin', bulk: 1.35, belly: 1.2, gaunt: 1.1, hair: false }, style: { weapon: '1h', hunch: 0.15, stride: 1.2 }, hp: 300, dmg: [9, 18], armor: 25, tohit: 90, speed: 2.1, atk: 1.0, xp: 1200, ai: 'boss', boss: 'flayer', sound: 'butcher', depth: [3, 3], w: 0, pack: [1, 1], radius: 0.5, quest: 'q1' },
  hollowKing: { name: 'Aldwyn, the Buried Bishop', model: 'bishop', mopts: { scale: 2.1 }, style: { weapon: 'staff', robe: true, stride: 0.8 }, hp: 1200, dmg: [16, 32], armor: 60, tohit: 100, speed: 1.9, atk: 1.15, xp: 4000, ai: 'boss', boss: 'king', undead: true, sound: 'king', depth: [6, 6], w: 0, pack: [1, 1], radius: 0.7, quest: 'q2', res: { cold: 40, fire: 30 } },
  webMother: { name: 'Mother of Webs', model: 'spider', kind: 'spider', mopts: { scale: 2.5, mark: 'glowRed', chitin: 'chitin' }, style: {}, hp: 3400, dmg: [24, 44], armor: 80, tohit: 110, speed: 2.4, atk: 1.0, xp: 10000, ai: 'boss', boss: 'mother', sound: 'spiderBoss', depth: [9, 9], w: 0, pack: [1, 1], radius: 1.1, elem: { poison: [10, 20] }, quest: 'q3', res: { poison: 75 } },
  vaelzhor: { name: "Vael'Zhor, the Drowned Saint", model: 'demon', mopts: { scale: 2.2, wings: true, horns: 0.42, weapon: 'scythe', skin: 'demon', bulk: 1.3 }, style: { weapon: '2h', stride: 0.9 }, hp: 16000, dmg: [45, 85], armor: 150, tohit: 130, speed: 2.0, atk: 1.2, xp: 50000, ai: 'boss', boss: 'final', demon: true, sound: 'final', depth: [12, 12], w: 0, pack: [1, 1], radius: 0.95, elem: { fire: [15, 30] }, quest: 'q4', res: { fire: 60, cold: 30, light: 30 } },
};

const CHAMPION_NAMES = [['Gore', 'Bile', 'Grim', 'Rot', 'Doom', 'Blight', 'Ash', 'Gloom', 'Rust', 'Mold', 'Dread', 'Scab', 'Wither', 'Hollow', 'Gnash'], ['maw', 'fang', 'skull', 'gut', 'claw', 'tooth', 'hide', 'spine', 'heart', 'eye', 'ripper', 'monger'], ['the Hungry', 'the Unclean', 'the Cold', 'the Wretched', 'the Mad', 'the Defiler', 'the Butcher', 'the Pale', 'the Damned', 'the Sly', 'Bonebreaker', 'the Grim']];
const CHAMPION_MODS = {
  strong: { label: 'Extra Strong', dmg: 1.7 },
  fast: { label: 'Extra Fast', speed: 1.45, atk: 0.7 },
  stone: { label: 'Stone Skin', armor: 2.2, hp: 1.3 },
  fire: { label: 'Fire Enchanted', elem: 'fire' },
  cold: { label: 'Cold Enchanted', elem: 'cold' },
  thunder: { label: 'Lightning Enchanted', elem: 'light' },
};

function monsterTable(depth) {
  const t = [];
  for (const id in MONSTERS) { const m = MONSTERS[id]; if (m.w > 0 && depth >= m.depth[0] && depth <= m.depth[1]) t.push({ type: id, w: m.w, pack: m.pack }); }
  return t;
}
// scaled stats for a template at a dungeon level
function monsterStats(id, depth) {
  const T = MONSTERS[id];
  const d = Math.max(0, depth - T.depth[0]);
  return {
    hp: Math.round(T.hp * (1 + 0.3 * d)), dmg: [Math.round(T.dmg[0] * (1 + 0.22 * d)), Math.round(T.dmg[1] * (1 + 0.22 * d))],
    armor: Math.round(T.armor + 4 * d), tohit: T.tohit + 6 * d, xp: Math.round(T.xp * (1 + 0.35 * d)), mlvl: depth * 2 + 1,
  };
}

// ---------------- boss behaviours ----------------
// returns true when the boss performed a special action this frame
function bossThink(m, H, d, dt) {
  m.special -= dt; m.special2 -= dt;
  const T = m.T, frac = m.hp / m.maxHp;
  const minionsAlive = () => WORLD.monsters.filter(o => o.alive && o.summoner === m).length;
  const summon = (id, n, r = 2) => {
    for (let i = 0; i < n; i++) {
      const a = rand() * TAU; let x = m.x + Math.cos(a) * r, z = m.z + Math.sin(a) * r;
      if (!canStand(x, z, 0.35)) { x = m.x; z = m.z; }
      const s = new Monster(id, WORLD.depth); s.x = x; s.z = z; s.aggro = true; s.summoner = m; s.xpVal = Math.round(s.xpVal * 0.3);
      WORLD.monsters.push(s); fxBurst(x, 0.5, z, [0.5, 0.3, 1], 25, 2, 0.15, 0.7);
    }
  };
  switch (T.boss) {
    case 'flayer': {
      if (frac < 0.4 && !m.enraged) { m.enraged = true; m.speed *= 1.35; m.atkDur *= 0.75; SFX.play('butcherAggro', { x: m.x, z: m.z }); UI.msg('Brother Malric flies into a rage!', '#d04030'); }
      if (m.charge) {
        m.charge.t -= dt;
        const sp = m.speed * 2.6;
        const vx = Math.sin(m.rot) * sp * dt, vz = Math.cos(m.rot) * sp * dt; const ox = m.x, oz = m.z;
        moveWithCollision(m, vx, vz); m.moveSpeedNow = sp;
        if (Math.random() < dt * 20) fxSmoke(m.x, 0.1, m.z, 1, [0.2, 0.18, 0.15]);
        if (m.dist(H) < m.radius + H.radius + 0.4) { monsterHits(m, H); applyDamage(H, { phys: rollDmg(m.dmg[0], m.dmg[1]) }, m, { knock: 1.5, stun: 0.5 }); m.charge = null; m.cd = 1; return true; }
        if (m.charge.t <= 0 || Math.hypot(m.x - ox, m.z - oz) < 1e-3) { m.charge = null; m.stun = 0.6; }
        return true;
      }
      if (d > 3 && d < 9 && m.special <= 0 && m.canSee(H)) { m.special = 6; m.rot = faceAngle(H.x - m.x, H.z - m.z); m.charge = { t: 1.3 }; SFX.play('butcherAggro', { x: m.x, z: m.z }); return true; }
      return false;
    }
    case 'king': {
      if (m.special <= 0 && minionsAlive() < 5) {
        m.special = 11;
        m.startAction('cast', 1.2, () => {
          summon(frac < 0.5 ? 'cryptGuard' : 'risen', frac < 0.5 ? 2 : 3); SFX.play('kingSummon', { x: m.x, z: m.z });
          if (!m.sermonT || G.time - m.sermonT > 25) { m.sermonT = G.time; playVoice('bishop_summon', { duck: 0.55, verb: 0.35 }); }
        }, 0.6);
        return true;
      }
      if (d < 3 && m.special2 <= 0) {
        m.special2 = 7;
        m.startAction('attack', 1.1, () => { spawnEffect('nova', m.x, m.z, { team: 'monster', owner: m, r: 3.4, col: [1, 0.5, 0.18], dmg: { fire: [m.dmg[0], m.dmg[1]] }, sound: 'kingAttack' }); fxSmoke(m.x, 1.2, m.z, 14, [0.25, 0.22, 0.2]); R3.camShake = 0.6; }, 0.55);
        return true;
      }
      return false;
    }
    case 'mother': {
      if (m.special <= 0 && minionsAlive() < 8) { m.special = 9; m.startAction('cast', 1.0, () => { summon('spiderling', 4, 1.8); SFX.play('spiderBossAggro', { x: m.x, z: m.z }); }, 0.5); return true; }
      if (d > 3 && d < 11 && m.special2 <= 0 && m.canSee(H)) {
        m.special2 = 3.5; m.rot = faceAngle(H.x - m.x, H.z - m.z);
        m.startAction('attack', 0.9, () => {
          const base = Math.atan2(H.x - m.x, H.z - m.z);
          for (let i = -2; i <= 2; i++) spawnProjectile(i === 0 ? 'web' : 'spit', m, m.x + Math.sin(base) * 1.2, m.z + Math.cos(base) * 1.2, base + i * 0.18, { min: Math.round(m.dmg[0] * 0.5), max: Math.round(m.dmg[1] * 0.5) }, { y: 0.8 });
        }, 0.5);
        return true;
      }
      return false;
    }
    case 'final': {
      if (!m.phase) m.phase = 1;
      if (frac < 0.66 && m.phase === 1) { m.phase = 2; summon('hellspawn', 3, 3); UI.msg('"Kneel, little candle. The water is rising."', '#d04030', true); SFX.play('finalAggro', { x: m.x, z: m.z }); }
      if (frac < 0.33 && m.phase === 2) { m.phase = 3; summon('abyssKnight', 2, 3); m.speed *= 1.25; UI.msg('"I have drowned a saint. I will drown you."', '#d04030', true); SFX.play('finalAggro', { x: m.x, z: m.z }); }
      if (d < 4.5 && m.special <= 0) {
        m.special = m.phase === 3 ? 5 : 7;
        m.startAction('cast', 1.2, () => { spawnEffect('nova', m.x, m.z, { team: 'monster', owner: m, r: 5, col: [1, 0.4, 0.1], dmg: { fire: [m.dmg[0], m.dmg[1]] }, sound: 'explode' }); R3.camShake = 0.8; }, 0.6);
        return true;
      }
      if (d > 3 && m.special2 <= 0 && m.canSee(H)) {
        m.special2 = m.phase === 3 ? 3.5 : 5; m.rot = faceAngle(H.x - m.x, H.z - m.z);
        m.startAction('cast', 1.0, () => {
          const base = Math.atan2(H.x - m.x, H.z - m.z), n = m.phase === 1 ? 3 : 5;
          for (let i = 0; i < n; i++) spawnProjectile('fireball', m, m.x + Math.sin(base) * 1.4, m.z + Math.cos(base) * 1.4, base + (i - (n - 1) / 2) * 0.22, { fire: [Math.round(m.dmg[0] * 0.6), Math.round(m.dmg[1] * 0.6)] }, { y: 1.6 });
        }, 0.5);
        return true;
      }
      if (m.phase >= 2 && m.special3 === undefined) m.special3 = 6;
      if (m.phase >= 2) { m.special3 -= dt; if (m.special3 <= 0) { m.special3 = 9; for (let i = 0; i < 3; i++) spawnEffect('meteor', H.x + rand.range(-2.5, 2.5), H.z + rand.range(-2.5, 2.5), { team: 'monster', owner: m, dmg: { fire: [Math.round(m.dmg[0] * 0.7), Math.round(m.dmg[1] * 0.7)] }, r: 1.8, burn: [5, 10], delay: 1.4 + i * 0.3 }); } }
      return false;
    }
  }
  return false;
}

