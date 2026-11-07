'use strict';
// Class skills, basic attacks and aiming.

const CLASS_SKILLS = {
  penitent: ['bash', 'firebolt', 'cleave', 'warcry', 'fireball', 'whirlwind', 'firewall', 'meteor'],
};

// ---- aiming ----
// returns {angle, target, x, z, dist}
function heroAim(H, range = 9, cone = 0.9) {
  // right stick explicit aim
  const rx = IN.axes.rx, ry = IN.axes.ry;
  if (Math.hypot(rx, ry) > 0.35) {
    const [wx, wz] = stickToWorld(rx, ry);
    const a = Math.atan2(wx, wz);
    const t = bestTargetInCone(H, a, range, 0.35);
    return { angle: t ? Math.atan2(t.x - H.x, t.z - H.z) : a, target: t, x: t ? t.x : H.x + wx * 6, z: t ? t.z : H.z + wz * 6 };
  }
  if (IN.lastDevice === 'mouse' || IN.lastDevice === 'touch' || (IN.lastDevice === 'kb' && IN.mouse.moved)) {   // keys aim with the mouse too
    const hov = Game.hoverMonster;
    if (hov && hov.alive) return { angle: Math.atan2(hov.x - H.x, hov.z - H.z), target: hov, x: hov.x, z: hov.z };
    const g = Game.cursorGround;
    if (g) return { angle: Math.atan2(g.x - H.x, g.z - H.z), target: null, x: g.x, z: g.z };
  }
  // auto-aim: nearest monster in facing cone, else nearest in range
  let t = bestTargetInCone(H, H.rot, range, cone);
  if (!t) t = bestTargetInCone(H, H.rot, Math.min(range, 4.5), Math.PI);
  if (t) return { angle: Math.atan2(t.x - H.x, t.z - H.z), target: t, x: t.x, z: t.z };
  return { angle: H.rot, target: null, x: H.x + Math.sin(H.rot) * 5, z: H.z + Math.cos(H.rot) * 5 };
}
function bestTargetInCone(H, angle, range, cone) {
  let best = null, bs = 1e9;
  for (const m of WORLD.monsters) {
    if (!m.alive || !m.vis || !m.vis.obj.visible) continue;
    const dx = m.x - H.x, dz = m.z - H.z, d = Math.hypot(dx, dz);
    if (d > range) continue;
    const da = Math.abs(angDiff(angle, Math.atan2(dx, dz)));
    if (da > cone) continue;
    if (!hasLOS(WORLD.level, H.x, H.z, m.x, m.z)) continue;
    const score = d + da * 2.5;
    if (score < bs) { bs = score; best = m; }
  }
  return best;
}

// ---- basic attack ----
function heroBasicAttack(H, aim) {
  if (H.busy() || H.stun > 0) return false;
  H.rot = aim.angle;
  const dur = 0.66 / H.atkSpeed;
  if (false) {
    H.startAction('attack', dur * 1.1, () => {
      const a = H.rot + rand.range(-0.03, 0.03);
      spawnProjectile('arrow', H, H.x + Math.sin(a) * 0.4, H.z + Math.cos(a) * 0.4, a, null, { weapon: true });
    }, 0.58);
    return true;
  }
  if (H.caster && aim.target && aim.target.dist(H) > 2.2) {
    // staves shoot a weak magic bolt at range (mana free)
    H.startAction('cast', dur, () => {
      const m = H.attr('mag');
      spawnProjectile('frost', H, H.x + Math.sin(H.rot) * 0.4, H.z + Math.cos(H.rot) * 0.4, H.rot, { cold: [Math.max(1, Math.round(H.dmg[0] + m / 14)), Math.round(H.dmg[1] + m / 9)] }, {});
    }, 0.5);
    return true;
  }
  if (Math.random() < 0.3) SFX.play(H.voice + 'Attack', { vol: 0.6, minGap: 1.4 });
  H.startAction('attack', dur, () => {
    const w = H.equip.main && BASES[H.equip.main.base];
    SFX.play(w && w.hands === 2 ? 'swingHeavy' : 'swing', { x: H.x, z: H.z, vol: 0.7 });
    const t = meleeTargetAt(H, H.rot, 1.35, 0.9);
    if (t) heroHits(H, t, {});
  }, 0.5);
  return true;
}
function meleeTargetAt(H, angle, reach, cone) {
  let best = null, bd = 1e9;
  for (const m of WORLD.monsters) {
    if (!m.alive) continue;
    const dx = m.x - H.x, dz = m.z - H.z, d = Math.hypot(dx, dz) - m.radius;
    if (d > reach) continue;
    if (Math.abs(angDiff(angle, Math.atan2(dx, dz))) > cone) continue;
    if (d < bd) { bd = d; best = m; }
  }
  return best;
}
function meleeTargetsArc(H, angle, reach, cone) {
  return WORLD.monsters.filter(m => { if (!m.alive) return false; const dx = m.x - H.x, dz = m.z - H.z; return Math.hypot(dx, dz) - m.radius < reach && Math.abs(angDiff(angle, Math.atan2(dx, dz))) < cone; });
}

// ---- skills ----
const SK = (o) => o;
const SKILLS = {
  bash: SK({
    cls: 'penitent', name: 'Smite', reqLevel: 1, mana: r => 2, desc: (r) => `A two-handed overhead blow for +${60 + r * 15}% damage that hurls the enemy back and stuns it.`,
    cast(H, aim, r) {
      H.rot = aim.angle;
      if (Math.random() < 0.6) SFX.play(H.voice + 'Attack', { vol: 0.7, minGap: 1.0 });
      H.startAction('attack3', 0.78 / H.atkSpeed, () => {
        const t = meleeTargetAt(H, H.rot, 1.45, 0.9);
        SFX.play('swingHeavy', { x: H.x, z: H.z });
        if (t && heroHits(H, t, { mul: 1.6 + r * 0.15, knock: 1.2, stun: 0.6 + r * 0.05, tohit: 20 })) { R3.camShake = 0.3; fxSparks(t.x, 1, t.z, 14); SFX.play('bash', { x: t.x, z: t.z }); }
      }, 0.55);
    }, icon: 'bash',
  }),
  firebolt: SK({
    cls: 'penitent', name: 'Ember', reqLevel: 1, mana: r => 3 + Math.floor(r / 4), desc: (r, H) => `Fling a coal from the lantern for ${spellDmg(4, 8, r, H, 3, 4).join('-')} fire damage.`,
    cast(H, aim, r) {
      H.rot = aim.angle;
      H.startAction('cast', 0.55 / H.castSpeed, () => { lanternFlare(H); spawnProjectile('firebolt', H, H.x + Math.sin(H.rot) * 0.5, H.z + Math.cos(H.rot) * 0.5, H.rot, { fire: spellDmg(4, 8, r, H, 3, 4) }, { y: 1.15 }); }, 0.5);
    }, icon: 'firebolt',
  }),
  cleave: SK({
    cls: 'penitent', name: 'Reaping Arc', reqLevel: 4, mana: r => 5, desc: (r) => `A wide sweep that strikes all enemies in front of you for ${100 + r * 12}% damage.`,
    cast(H, aim, r) {
      H.rot = aim.angle;
      if (Math.random() < 0.45) SFX.play(H.voice + 'Attack', { vol: 0.65, minGap: 1.0 });
      H.startAction('attack2', 0.74 / H.atkSpeed, () => {
        SFX.play('swingHeavy', { x: H.x, z: H.z });
        const ts = meleeTargetsArc(H, H.rot, 1.75, 1.3);
        for (const t of ts) heroHits(H, t, { mul: 1.0 + r * 0.12, knock: 0.4 });
      }, 0.5);
    }, icon: 'cleave',
  }),
  warcry: SK({
    cls: 'penitent', name: 'Lantern Flare', reqLevel: 7, mana: r => 8, desc: (r) => `The lantern blazes. Nearby foes are stunned and burned for ${8 + r * 4} fire damage; for 30 seconds you deal +${20 + r * 8}% damage and gain +${10 + r * 4} armor.`,
    cast(H, aim, r) {
      H.startAction('cast', 0.6, () => {
        H.addBuff('warcry', 30, { dmgBuff: 20 + r * 8, armorBuff: 10 + r * 4 });
        SFX.play('warcry'); fxRing(H.x, H.z, [1, 0.55, 0.18], 3.5, 80, 0.8); R3.camShake = 0.4;
        const L = addLight({ x: H.x, y: 1.6, z: H.z, color: 0xffb050, intensity: 16, radius: 8, priority: 4, transient: true }); WORLD.effects.push({ kind: 'flash', x: H.x, z: H.z, t: 0, dur: 0.6, light: L, i0: 16, o: {} });
        for (const m of WORLD.monsters) if (m.alive && m.dist(H) < 4) { applyDamage(m, { fire: 8 + r * 4 }, H, {}); if (!m.boss) { m.stun = Math.max(m.stun, 1 + r * 0.2); if (m.vis) m.vis.play('hit', 0.4, true); } }
      }, 0.45);
    }, icon: 'warcry',
  }),
  fireball: SK({
    cls: 'penitent', name: 'Pyre', reqLevel: 11, mana: r => 12 + r, desc: (r, H) => `A ball of lantern-fire that bursts for ${spellDmg(14, 24, r, H, 6, 9).join('-')} fire damage in an area.`,
    cast(H, aim, r) {
      H.rot = aim.angle;
      H.startAction('cast', 0.7 / H.castSpeed, () => lanternFlare(H, 1.6) || spawnProjectile('fireball', H, H.x + Math.sin(H.rot) * 0.5, H.z + Math.cos(H.rot) * 0.5, H.rot, { fire: spellDmg(14, 24, r, H, 6, 9) }, { radiusMul: 1 + r * 0.04, y: 1.15 }), 0.5);
    }, icon: 'fireball',
  }),
  whirlwind: SK({
    cls: 'penitent', name: 'Flagellant\'s Wheel', reqLevel: 15, mana: r => 16, desc: (r) => `Spin through your foes for 1.6 seconds, striking everything around you repeatedly for ${70 + r * 8}% damage.`,
    cast(H, aim, r) {
      H.whirl = { t: 1.6, tick: 0, r, a: aim.angle };
      H.startAction('attack2', 1.6, null, 2);
      SFX.play('whirl', { x: H.x, z: H.z });
    }, icon: 'whirlwind',
  }),
  firewall: SK({
    cls: 'penitent', name: 'Wall of Cinders', reqLevel: 18, mana: r => 18 + r, desc: (r, H) => `Raise a wall of flame for 5 seconds that burns enemies for ${spellDmg(20, 30, r, H, 8, 10).join('-')} fire damage per second.`,
    cast(H, aim, r) {
      H.rot = aim.angle;
      H.startAction('cast', 0.7 / H.castSpeed, () => {
        const cx = aim.target ? aim.target.x : H.x + Math.sin(H.rot) * 3.5, cz = aim.target ? aim.target.z : H.z + Math.cos(H.rot) * 3.5;
        const px = Math.cos(H.rot), pz = -Math.sin(H.rot); const pts = [];
        for (let i = -4; i <= 4; i++) { const x = cx + px * i * 0.5, z = cz + pz * i * 0.5; if (WORLD.level.walkable(x, z)) pts.push([x, z]); }
        if (pts.length) spawnEffect('firewall', cx, cz, { points: pts, dmg: spellDmg(20, 30, r, H, 8, 10), dur: 5 });
      }, 0.5);
    }, icon: 'firewall',
  }),
  meteor: SK({
    cls: 'penitent', name: 'Judgement', reqLevel: 22, mana: r => 25 + r, desc: (r, H) => `Call down a burning star that deals ${spellDmg(40, 60, r, H, 12, 16).join('-')} fire damage and leaves the ground aflame.`,
    cast(H, aim, r) {
      H.rot = aim.angle;
      const tx = aim.target ? aim.target.x : H.x + Math.sin(H.rot) * 5, tz = aim.target ? aim.target.z : H.z + Math.cos(H.rot) * 5;
      H.startAction('cast', 0.8 / H.castSpeed, () => spawnEffect('meteor', tx, tz, { team: 'hero', owner: H, dmg: { fire: spellDmg(40, 60, r, H, 12, 16) }, r: 2.4, burn: spellDmg(10, 16, r, H, 3, 4), delay: 1.1 }), 0.5);
    }, icon: 'meteor',
  }),
};
for (const id in SKILLS) SKILLS[id].id = id;

// the lantern flares whenever the Penitent draws fire from it
function lanternFlare(H, k = 1) {
  const p = (H.vis && H.vis.lanternAt()) || [H.x, 1.0, H.z];
  fxBurst(p[0], p[1] + 0.1, p[2], [1, 0.5, 0.14], Math.round(16 * k), 1.4 * k, 0.09, 0.4);
  const L = addLight({ x: p[0], y: p[1] + 0.3, z: p[2], color: 0xff9040, intensity: 9 * k, radius: 5, priority: 3, transient: true, noShadow: true });
  WORLD.effects.push({ kind: 'flash', x: p[0], z: p[2], t: 0, dur: 0.3, light: L, i0: 9 * k, o: {} });
}
function spellDmg(a, b, r, H, pa, pb) {
  const m = (1 + (H ? H.attr('mag') : 0) / 120) * (H && H.spellMul ? H.spellMul : 1);
  return [Math.round((a + pa * (r - 1)) * m), Math.round((b + pb * (r - 1)) * m)];
}

function heroCastSkill(H, id) {
  if (!id || H.busy() || H.stun > 0 || !H.alive) return false;
  const S = SKILLS[id], r = H.skillLevel(id);
  if (!S || r <= 0) return false;
  if (WORLD.depth === 0) { UI.msg('That would be unwise in town.', '#a09080'); return false; }
  const cost = S.mana(r);
  if (H.mana < cost) { UI.msg('Not enough mana.', '#6080ff'); SFX.play('noMana'); heroBark('nomana', 5); return false; }
  H.mana -= cost;
  const aim = heroAim(H, 10);
  S.cast(H, aim, r);
  return true;
}

// whirlwind + leap updates (called from hero update in game loop)
function updateHeroSkills(H, dt) {
  if (H.leap) {
    const L = H.leap; L.t = Math.min(1, H.actT / (H.actDur * 0.8));
    H.x = lerp(L.sx, L.tx, L.t); H.z = lerp(L.sz, L.tz, L.t); H.y = Math.sin(L.t * Math.PI) * 1.2;
  }
  if (H.whirl) {
    const W = H.whirl; W.t -= dt; W.tick -= dt;
    H.rot += dt * 18;
    const mx = IN.axes.lx, my = IN.axes.ly;
    let dx = Math.sin(W.a), dz = Math.cos(W.a);
    if (Math.hypot(mx, my) > 0.3) { [dx, dz] = stickToWorld(mx, my); const l = Math.hypot(dx, dz); dx /= l; dz /= l; }
    moveWithCollision(H, dx * H.moveSpeed * 0.8 * dt, dz * H.moveSpeed * 0.8 * dt);
    if (W.tick <= 0) { W.tick = 0.3; for (const m of WORLD.monsters) if (m.alive && m.dist(H) < 1.5 + m.radius) heroHits(H, m, { mul: 0.7 + W.r * 0.08, noImpact: true }); SFX.play('swing', { x: H.x, z: H.z, vol: 0.6 }); }
    if (H.vis) { H.vis.cur = H.rot; if (H.vis.t > H.vis.dur * 0.7) H.vis.t = H.vis.dur * 0.35; }
    const tr = []; for (let i = 0; i < 7; i++) { const a = H.rot - i * 0.2; tr.push([H.x + Math.sin(a) * 0.35, 1.0, H.z + Math.cos(a) * 0.35, H.x + Math.sin(a) * 1.25, 1.05, H.z + Math.cos(a) * 1.25, (1 - i / 7) * 0.6]); }
    GFX.S.trails.push({ pts: tr.reverse(), col: [1.0, 0.85, 0.65] });
    if (W.t <= 0) { H.whirl = null; H.action = null; }
  }
}
function updateLightning() { }

// ---- skill icons (canvas drawn) ----
const SKILL_ICON_CACHE = {};
let SKILL_IMG = null;
function loadSkillIcons() { return new Promise(res => { const im = new Image(); im.onload = () => { SKILL_IMG = im; res(); }; im.onerror = () => res(); im.src = ASSET_BASE + 'skills.webp'; }); }
function skillIcon(id, size = 64) {
  const key = id + size; if (SKILL_ICON_CACHE[key]) return SKILL_ICON_CACHE[key];
  // painted icons from the atlas when present
  const R = window.SKILL_ICONS && SKILL_IMG && SKILL_ICONS[id];
  if (R) { const c = document.createElement('canvas'); c.width = c.height = size; const x = c.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(SKILL_IMG, R[0], R[1], R[2], R[3], 0, 0, size, size); return (SKILL_ICON_CACHE[key] = c.toDataURL()); }
  const c = document.createElement('canvas'); c.width = c.height = size; const x = c.getContext('2d');
  const s = size, h = s / 2;
  const bg = (c1, c2) => { const g = x.createRadialGradient(h, h * 0.8, 2, h, h, s * 0.75); g.addColorStop(0, c1); g.addColorStop(1, c2); x.fillStyle = g; x.fillRect(0, 0, s, s); };
  const glow = (col, blur = 10) => { x.shadowColor = col; x.shadowBlur = blur; };
  x.lineCap = 'round'; x.lineJoin = 'round';
  const blade = (ang, len, w, col) => { x.save(); x.translate(h, h); x.rotate(ang); x.fillStyle = col; x.beginPath(); x.moveTo(-w, len * 0.35); x.lineTo(0, -len * 0.6); x.lineTo(w, len * 0.35); x.closePath(); x.fill(); x.fillStyle = '#5a4020'; x.fillRect(-w * 2.2, len * 0.35, w * 4.4, w * 0.8); x.fillRect(-w * 0.5, len * 0.4, w, len * 0.2); x.restore(); };
  const flame = (cx, cy, sc, c1, c2) => { const g = x.createLinearGradient(cx, cy + sc, cx, cy - sc); g.addColorStop(0, c2); g.addColorStop(1, c1); x.fillStyle = g; x.beginPath(); x.moveTo(cx, cy - sc); x.bezierCurveTo(cx + sc * 0.9, cy - sc * 0.2, cx + sc * 0.7, cy + sc * 0.9, cx, cy + sc * 0.9); x.bezierCurveTo(cx - sc * 0.7, cy + sc * 0.9, cx - sc * 0.9, cy - sc * 0.2, cx, cy - sc); x.fill(); };
  const arrow = (ang, len, col, cx = h, cy = h) => { x.save(); x.translate(cx, cy); x.rotate(ang); x.strokeStyle = col; x.lineWidth = s * 0.05; x.beginPath(); x.moveTo(0, len * 0.5); x.lineTo(0, -len * 0.5); x.stroke(); x.fillStyle = col; x.beginPath(); x.moveTo(-s * 0.07, -len * 0.38); x.lineTo(0, -len * 0.58); x.lineTo(s * 0.07, -len * 0.38); x.fill(); x.restore(); };
  switch (id) {
    case 'bash': bg('#6a4a30', '#1a0d08'); glow('#ffcc80'); blade(-0.7, s * 0.8, s * 0.06, '#d8d8e0'); x.fillStyle = '#ffd080'; for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; x.fillRect(h + Math.cos(a) * s * 0.3 + s * 0.15, h + Math.sin(a) * s * 0.3 - s * 0.15, 3, 3); } break;
    case 'warcry': bg('#802010', '#200505'); glow('#ff5020', 14); x.strokeStyle = '#ffb080'; x.lineWidth = s * 0.05; for (let i = 1; i <= 3; i++) { x.beginPath(); x.arc(h * 0.6, h, s * 0.13 * i, -0.8, 0.8); x.stroke(); } x.fillStyle = '#ffd0a0'; x.beginPath(); x.arc(h * 0.45, h, s * 0.1, 0, TAU); x.fill(); break;
    case 'cleave': bg('#504060', '#100818'); glow('#c0c0ff'); x.strokeStyle = '#e0e0ff'; x.lineWidth = s * 0.08; x.beginPath(); x.arc(h, h * 1.3, s * 0.38, -2.6, -0.5); x.stroke(); blade(0.9, s * 0.6, s * 0.05, '#e8e8f0'); break;
    case 'leap': bg('#605030', '#181008'); glow('#ffe0a0'); x.fillStyle = '#e0c890'; x.beginPath(); x.moveTo(h * 0.4, s * 0.85); x.quadraticCurveTo(h, -s * 0.1, h * 1.6, s * 0.85); x.lineTo(h * 1.45, s * 0.85); x.quadraticCurveTo(h, s * 0.15, h * 0.55, s * 0.85); x.fill(); x.fillRect(s * 0.15, s * 0.85, s * 0.7, s * 0.05); break;
    case 'whirlwind': bg('#405060', '#081018'); glow('#c0e0ff'); x.strokeStyle = '#d0e8ff'; x.lineWidth = s * 0.05; for (let i = 0; i < 3; i++) { x.beginPath(); x.arc(h, h, s * (0.15 + i * 0.1), i * 2, i * 2 + 3.5); x.stroke(); } break;
    case 'bloodlust': bg('#701010', '#150202'); glow('#ff2020', 16); x.fillStyle = '#ff3030'; x.beginPath(); x.moveTo(h, s * 0.2); x.bezierCurveTo(s * 0.85, s * 0.6, s * 0.65, s * 0.85, h, s * 0.85); x.bezierCurveTo(s * 0.35, s * 0.85, s * 0.15, s * 0.6, h, s * 0.2); x.fill(); break;
    case 'multishot': bg('#405030', '#0a1006'); glow('#e0ffc0'); for (let i = -2; i <= 2; i++) arrow(i * 0.3, s * 0.7, '#e8e0c0'); break;
    case 'firearrow': bg('#703010', '#180600'); glow('#ff8020', 14); flame(h, h * 0.75, s * 0.28, '#ffe080', '#ff3000'); arrow(0.6, s * 0.75, '#f0d0a0'); break;
    case 'evade': bg('#303040', '#05050a'); glow('#a0a0ff'); x.fillStyle = 'rgba(160,160,255,0.35)'; for (let i = 0; i < 3; i++) { x.beginPath(); x.ellipse(h * 0.6 + i * s * 0.15, h, s * 0.08, s * 0.25, 0, 0, TAU); x.fill(); } x.fillStyle = '#d0d0ff'; x.beginPath(); x.ellipse(h * 1.4, h, s * 0.09, s * 0.27, 0, 0, TAU); x.fill(); break;
    case 'frostarrow': bg('#204060', '#020810'); glow('#80d0ff', 14); arrow(0.7, s * 0.8, '#c0f0ff'); x.fillStyle = '#e0ffff'; for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; x.fillRect(h * 0.6 + Math.cos(a) * s * 0.12, h * 0.6 + Math.sin(a) * s * 0.12, 3, 3); } break;
    case 'rain': bg('#3a4030', '#080a06'); glow('#ffffd0'); for (let i = 0; i < 7; i++) arrow(Math.PI + 0.1, s * 0.3, '#e0d8b0', s * (0.15 + i * 0.12), s * (0.3 + (i % 3) * 0.2)); break;
    case 'phantom': bg('#203048', '#02040a'); glow('#80b0ff', 14); for (let i = 0; i < 8; i++) arrow(i / 8 * TAU, s * 0.35, '#b0d0ff', h + Math.sin(i / 8 * TAU) * s * 0.22, h - Math.cos(i / 8 * TAU) * s * 0.22); break;
    case 'firebolt': bg('#702808', '#140400'); glow('#ff9030', 16); flame(h, h, s * 0.33, '#fff0a0', '#ff2000'); break;
    case 'frostnova': bg('#204868', '#020810'); glow('#a0e8ff', 14); x.strokeStyle = '#d0f8ff'; x.lineWidth = s * 0.04; for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; x.beginPath(); x.moveTo(h, h); x.lineTo(h + Math.cos(a) * s * 0.38, h + Math.sin(a) * s * 0.38); x.stroke(); } x.beginPath(); x.arc(h, h, s * 0.2, 0, TAU); x.stroke(); break;
    case 'chainlight': bg('#303868', '#04040e'); glow('#c0d0ff', 16); x.strokeStyle = '#e8f0ff'; x.lineWidth = s * 0.05; x.beginPath(); x.moveTo(s * 0.2, s * 0.15); x.lineTo(s * 0.45, s * 0.45); x.lineTo(s * 0.35, s * 0.5); x.lineTo(s * 0.62, s * 0.85); x.lineTo(s * 0.55, s * 0.55); x.lineTo(s * 0.65, s * 0.5); x.lineTo(s * 0.5, s * 0.15); x.stroke(); break;
    case 'fireball': bg('#702000', '#100200'); glow('#ff6010', 18); { const g = x.createRadialGradient(h * 1.1, h * 0.9, 1, h, h, s * 0.3); g.addColorStop(0, '#fff8c0'); g.addColorStop(0.5, '#ff8020'); g.addColorStop(1, 'rgba(160,20,0,0)'); x.fillStyle = g; x.beginPath(); x.arc(h, h, s * 0.32, 0, TAU); x.fill(); } break;
    case 'firewall': bg('#601800', '#100200'); glow('#ff7020', 14); for (let i = 0; i < 4; i++) flame(s * (0.2 + i * 0.2), s * 0.6 - (i % 2) * s * 0.08, s * 0.2, '#ffe080', '#ff2000'); break;
    case 'meteor': bg('#502010', '#0c0200'); glow('#ffa040', 18); x.strokeStyle = 'rgba(255,160,60,0.7)'; x.lineWidth = s * 0.12; x.beginPath(); x.moveTo(s * 0.1, s * 0.1); x.lineTo(h * 1.1, h * 1.1); x.stroke(); x.fillStyle = '#ffe0a0'; x.beginPath(); x.arc(h * 1.15, h * 1.15, s * 0.14, 0, TAU); x.fill(); break;
    default: bg('#404040', '#101010');
  }
  x.shadowBlur = 0;
  // bevel frame
  x.strokeStyle = 'rgba(0,0,0,0.8)'; x.lineWidth = 3; x.strokeRect(1.5, 1.5, s - 3, s - 3);
  x.strokeStyle = 'rgba(255,220,160,0.25)'; x.lineWidth = 1; x.strokeRect(3.5, 3.5, s - 7, s - 7);
  return (SKILL_ICON_CACHE[key] = c.toDataURL());
}

