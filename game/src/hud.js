'use strict';
// The painted HUD for the main game (same art as the action fork): forged-iron globes for life and mana, the ossuary slab
// with iron sockets for the potions and skills, riveted plaques, a thorned frame for a foe's health, Cinzel / IM Fell type.
// Art from bake/models/kit_hud.js painted by bake/hud_paint.py; fonts in assets/ (OFL).
function initPaintedHUD() {
  if (UI._painted) return; UI._painted = true;
  const A = ASSET_BASE, css = document.createElement('style');
  css.textContent = `
@font-face{font-family:"Cinzel";src:url(${A}cinzel.woff) format("woff");font-weight:400 900;font-display:swap}
@font-face{font-family:"IM Fell English";src:url(${A}fell.woff) format("woff");font-style:normal;font-display:swap}
@font-face{font-family:"IM Fell English";src:url(${A}fell_it.woff) format("woff");font-style:italic;font-display:swap}
:root{--serif:"IM Fell English","EB Garamond",Palatino,Georgia,serif;--display:"Cinzel","Trajan Pro",Palatino,Georgia,serif}
.horb{position:absolute;bottom:0;width:241px;height:273px;pointer-events:none}
.horb.l{left:4px}.horb.r{right:4px}
.horb .hframe{position:absolute;left:0;top:0;width:241px;height:273px;z-index:2;filter:drop-shadow(0 6px 10px rgba(0,0,0,.85))}
.horb .hglobe{position:absolute;left:58px;top:96px;width:124px;height:124px;z-index:1;border-radius:50%;filter:none}
.horb .hhp{position:absolute;left:0;right:auto;bottom:auto;width:241px;top:148px;text-align:center;z-index:3;font:600 15px var(--display);letter-spacing:.06em;color:#f6e6c8;opacity:1;text-shadow:0 0 4px #000,0 1px 2px #000,0 0 10px rgba(0,0,0,.8)}
.horb.low .hframe{animation:hlow 1.1s ease-in-out infinite}
@keyframes hlow{0%,100%{filter:drop-shadow(0 6px 10px rgba(0,0,0,.85))}50%{filter:drop-shadow(0 0 14px rgba(220,30,10,.9))}}
.skillbar{bottom:10px!important;width:606px;height:94px;padding:0!important;gap:6px!important;align-items:center!important;justify-content:center;background:url(${A}hud_bar.webp) center/100% 100% no-repeat!important;border:0!important;border-radius:0!important;box-shadow:none!important;filter:drop-shadow(0 4px 10px rgba(0,0,0,.85))}
.skillbar .slot,.skillbar .pot{width:70px!important;height:70px!important;background:#070504 content-box!important;padding:9px;box-sizing:border-box;border:0!important;box-shadow:none!important;position:relative;flex:none}
.skillbar .slot::after,.skillbar .pot::after{content:'';position:absolute;inset:0;background:url(${A}hud_slot.webp) center/100% 100% no-repeat;filter:brightness(1.25) contrast(1.1) drop-shadow(0 1px 2px #000);pointer-events:none;z-index:2}
.skillbar .slot img{position:absolute;left:3px;top:3px;width:64px;height:64px;clip-path:inset(6px)}
.skillbar .slot .sk,.skillbar .pot .gl{position:absolute;left:-6px;top:-8px;z-index:4}
.skillbar .slot .rk{position:absolute;right:8px;bottom:6px;z-index:4;font:700 13px var(--display);color:#f2e2c2}
.skillbar .pot{display:block!important}
.skillbar .pot .flask{position:absolute;left:5px;top:5px;width:60px;height:60px;border-radius:0;box-shadow:none;background:center/contain no-repeat!important}
.skillbar .pot .flask::before{display:none}
.skillbar .pot b{position:absolute;right:8px;bottom:6px;z-index:4;font:700 14px var(--display);color:#f2e2c2;text-shadow:0 0 3px #000,0 1px 2px #000}
.xpbar{bottom:3px!important;width:470px!important;height:5px!important;background:#0a0604!important;border:1px solid #2a1c10!important;box-shadow:0 0 0 1px #000}
.xpfill{background:linear-gradient(90deg,#7a2a08,#e08a30)!important;box-shadow:0 0 6px #c06020!important}
.lvlup{bottom:118px!important;font-family:var(--display)}
.tbtn{background:none!important;border-style:solid!important;border-width:8px 14px!important;border-image:url(${A}hud_plaque.webp) 22 40 fill/8px 14px stretch!important;height:36px!important;padding:0 6px!important;font:600 12px var(--display)!important;letter-spacing:.12em;color:#d8c092!important;box-shadow:none!important;text-transform:uppercase}
.tbtn:hover{color:#ffe0a0!important;filter:brightness(1.15)}
.target .tname{font-family:var(--display)!important;color:#e8d4b0}
.target .thp{height:8px!important;margin-top:6px!important;background:#120302!important;background-clip:padding-box!important;border:0;border-style:solid!important;border-width:7px 24px!important;border-image:url(${A}hud_tframe.webp) 16 50 fill/7px 24px stretch!important;box-shadow:none!important}
.target .tfill{background:linear-gradient(#e0402a,#8a0c05 55%,#3c0201)!important;box-shadow:inset 0 1px 0 rgba(255,190,150,.35)}
.target.boss .thp{height:12px!important}
.death .dt,.ptitle,.zoneTitle .zt{font-family:var(--display)}
.buffs{left:22px!important;bottom:282px!important}
.buff{font-family:var(--serif);border-style:solid!important;border-width:5px 10px!important;border-image:url(${A}hud_plaque.webp) 22 40 fill/5px 10px stretch!important;background:none!important}
`;
  document.head.appendChild(css);
  // life and mana: the liquid canvases go inside the forged rings
  for (const [cv, tx, side] of [[UI.orbL, UI.orbLText, 'l'], [UI.orbR, UI.orbRText, 'r']]) {
    const o = document.createElement('div'); o.className = 'horb ' + side; UI.hud.appendChild(o);
    const fr = document.createElement('img'); fr.className = 'hframe'; fr.src = A + 'hud_orb.webp'; o.appendChild(fr);
    cv.className = 'hglobe'; cv.width = cv.height = 248; o.appendChild(cv);
    tx.className = 'hhp'; o.appendChild(tx);
    if (side === 'l') UI.orbLWrap = o;
  }
  // painted draughts in the potion sockets
  try { UI.potPics = { red: itemIcon(makeItem('potHeal')), blue: itemIcon(makeItem('potMana')) }; } catch (e) { UI.potPics = null; }
  if (UI.potPics) { const s2 = document.createElement('style'); s2.textContent = `.skillbar .pot .flask.red{background-image:url(${UI.potPics.red})!important}.skillbar .pot .flask.blue{background-image:url(${UI.potPics.blue})!important}`; document.head.appendChild(s2); }
}
// the globes: dark glass, a sloshing meniscus, slow motes rising, a curved highlight
drawOrb = function (c, frac, col, t) {
  if (col[0] === '#ff5040') col = ['#d23a22', '#7c0b06', '#240101'];   // darker, oilier blood than the classic orb
  else if (col[0] === '#6080ff') col = ['#4a68e0', '#16248a', '#03061c'];  // deep lantern-smoke blue for mana
  const x = c.getContext('2d'), S = c.width, R = S / 2, cx = R, cy = R;
  x.clearRect(0, 0, S, S);
  x.save(); x.beginPath(); x.arc(cx, cy, R, 0, TAU); x.clip();
  const bg = x.createRadialGradient(cx, cy * 0.8, R * 0.1, cx, cy, R); bg.addColorStop(0, '#140908'); bg.addColorStop(1, '#030101');
  x.fillStyle = bg; x.fillRect(0, 0, S, S);
  const level = cy + R - frac * 2 * R;
  const wave = px => level + Math.sin(px * 0.045 + t * 2.0) * 3.2 + Math.sin(px * 0.09 - t * 1.3) * 1.8;
  const lg = x.createLinearGradient(0, level - 6, 0, S);
  lg.addColorStop(0, col[0]); lg.addColorStop(0.35, col[1]); lg.addColorStop(1, col[2]);
  x.fillStyle = lg; x.beginPath(); x.moveTo(0, S);
  for (let px = 0; px <= S; px += 4) x.lineTo(px, wave(px));
  x.lineTo(S, S); x.closePath(); x.fill();
  const sg = x.createRadialGradient(cx - R * 0.3, level + R * 0.25, R * 0.05, cx, level + R * 0.4, R * 1.3);
  sg.addColorStop(0, 'rgba(255,120,80,0.18)'); sg.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = sg; x.fillRect(0, level - 4, S, S);
  // motes drifting up through the blood
  x.save(); x.clip();
  for (let i = 0; i < 9; i++) {
    const ph = (t * (0.05 + (i % 3) * 0.02) + i * 0.137) % 1, px = cx + Math.sin(i * 2.3 + t * 0.6) * R * 0.6, py = S - ph * S * 1.05;
    x.globalAlpha = 0.28 * Math.sin(ph * Math.PI); x.fillStyle = col[0];
    x.beginPath(); x.arc(px, py, 2 + (i % 3), 0, TAU); x.fill();
  }
  x.restore(); x.globalAlpha = 1;
  // meniscus
  if (frac > 0.01 && frac < 0.995) {
    x.strokeStyle = 'rgba(255,170,140,0.55)'; x.lineWidth = 2.2; x.beginPath();
    for (let px = 0; px <= S; px += 4) px ? x.lineTo(px, wave(px)) : x.moveTo(px, wave(px));
    x.stroke();
  }
  // spherical shading and a cold curved highlight on the glass
  const sh = x.createRadialGradient(cx - R * 0.15, cy - R * 0.2, R * 0.2, cx, cy, R * 1.02);
  sh.addColorStop(0, 'rgba(0,0,0,0)'); sh.addColorStop(0.7, 'rgba(0,0,0,0.25)'); sh.addColorStop(1, 'rgba(0,0,0,0.85)');
  x.fillStyle = sh; x.fillRect(0, 0, S, S);
  x.globalCompositeOperation = 'lighter';
  x.strokeStyle = 'rgba(200,215,255,0.22)'; x.lineWidth = S * 0.05; x.lineCap = 'round';
  x.beginPath(); x.arc(cx, cy, R * 0.78, Math.PI * 1.08, Math.PI * 1.42); x.stroke();
  x.fillStyle = 'rgba(255,240,220,0.35)'; x.beginPath(); x.ellipse(cx - R * 0.42, cy - R * 0.5, R * 0.07, R * 0.045, -0.6, 0, TAU); x.fill();
  x.globalCompositeOperation = 'source-over';
  x.restore();
};

{
  const _uh = updateHUD;
  updateHUD = function (dt) {
    if (UI.hud && !UI._painted) initPaintedHUD();
    _uh(dt);
    const H = WORLD.hero; if (H && UI.orbLWrap) UI.orbLWrap.classList.toggle('low', H.alive && H.hp < H.maxHp * 0.3);
  };
}
