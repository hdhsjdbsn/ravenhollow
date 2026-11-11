'use strict';
// Unified input: gamepad (Legion Go S / Steam Input), keyboard, mouse and touch.

const IN = {
  cur: {}, prev: {}, axes: { lx: 0, ly: 0, rx: 0, ry: 0 },
  mouse: { x: 0, y: 0, left: false, right: false, leftPressed: false, rightPressed: false, moved: false, over: false },
  keys: {}, taps: {}, keyT: {}, keyBlock: {}, padEdgeT: -1e9, padActT: -1e9, activePad: -1, padPrev: {}, axSeen: {}, log: [], custom: null, lastDevice: 'pad', padIndex: -1, repeatT: {}, padName: '',
  touch: false,
};
const PAD_MAP = { 0: 'a', 1: 'b', 2: 'x', 3: 'y', 4: 'lb', 5: 'rb', 6: 'lt', 7: 'rt', 8: 'view', 9: 'menu', 10: 'ls', 11: 'rs', 12: 'up', 13: 'down', 14: 'left', 15: 'right' };
const KEY_MAP = {
  Space: 'a', Enter: 'a', NumpadEnter: 'a', Escape: 'menu', Backspace: 'b', KeyI: 'view', KeyB: 'view', KeyC: 'char', KeyK: 'skills', KeyS: 'skills_k', Tab: 'map', KeyM: 'map',
  Digit1: 'x', Digit2: 'y', Digit3: 'b', Digit4: 'rt', KeyQ: 'lb', KeyE: 'b', KeyT: 'lt', AltLeft: 'labels', AltRight: 'labels', KeyF: 'rb', KeyR: 'rs', ShiftLeft: 'a', ShiftRight: 'a',
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
};
const KEY_ROLE = { Space: 'dash', ShiftLeft: 'dash', ShiftRight: 'dash', KeyE: 'ember', Digit3: 'ember' };
const MOVE_KEYS = { KeyW: [0, -1], KeyA: [-1, 0], KeyS: [0, 1], KeyD: [1, 0] };

function initInput() {
  // keyboard and mouse events are time-stamped, not applied at once: Steam's desktop controller layout (active whenever a
  // browser has focus) types keys and clicks for pad buttons -- A = Enter, B = Escape, triggers = mouse clicks, stick =
  // arrows -- on top of the pad itself, which made buttons fire twice (and B open the pause menu). pollInput drops any key
  // or click that lands within a few frames of a pad button going down.
  const now = () => performance.now();
  window.addEventListener('keydown', e => {
    if (e.repeat) return;
    if (['Tab', 'Space', 'AltLeft', 'AltRight', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Backspace', 'Enter', 'Escape', 'F2'].includes(e.code)) e.preventDefault();
    IN.keys[e.code] = true; IN.taps[e.code] = true; IN.keyT[e.code] = now(); IN.keyBlock[e.code] = false;
    if (!IN.padRecent()) IN.lastDevice = 'kb';
    Audio2 && Audio2.unlock && Audio2.unlock();
  });
  window.addEventListener('keyup', e => { IN.keys[e.code] = false; IN.keyBlock[e.code] = false; });
  window.addEventListener('blur', () => { IN.keys = {}; IN.taps = {}; IN.mouse.left = IN.mouse.right = false; });
  const cv = document.getElementById('gl');
  const setMouse = (e) => { IN.mouse.x = e.clientX; IN.mouse.y = e.clientY; IN.mouse.moved = true; };
  window.addEventListener('pointermove', e => { setMouse(e); if (e.pointerType === 'mouse' && !IN.padRecent()) IN.lastDevice = 'mouse'; });
  cv.addEventListener('pointerdown', e => {
    setMouse(e);
    if (!IN.padRecent()) IN.lastDevice = e.pointerType === 'touch' ? 'touch' : 'mouse';
    IN.touch = e.pointerType === 'touch';
    const t = now();
    if (e.button === 2) { IN.mouse.right = true; IN.mouse.rightPressed = true; IN.mouse.rightT = t; }
    else { IN.mouse.left = true; IN.mouse.leftPressed = true; IN.mouse.leftT = t; }
    Audio2 && Audio2.unlock && Audio2.unlock();
  });
  window.addEventListener('pointerup', e => { if (e.button === 2) IN.mouse.right = false; else IN.mouse.left = false; });
  window.addEventListener('pointercancel', () => { IN.mouse.left = IN.mouse.right = false; });
  window.addEventListener('pointermove', e => { if (e.pointerType === 'mouse' && !(e.buttons & 1)) IN.mouse.left = false; if (e.pointerType === 'mouse' && !(e.buttons & 2)) IN.mouse.right = false; });
  window.addEventListener('contextmenu', e => e.preventDefault());
  window.addEventListener('gamepadconnected', e => {
    IN.padIndex = e.gamepad.index; IN.lastDevice = 'pad'; IN.padName = e.gamepad.id;
    if (typeof UI !== 'undefined' && UI.msg) UI.msg('Controller connected', '#a09080');
  });
  window.addEventListener('gamepaddisconnected', () => { if (!connectedPads().length) IN.padName = ''; });
}
function connectedPads() {
  let pads = [];
  try { pads = navigator.getGamepads ? Array.from(navigator.getGamepads()) : []; } catch (e) { }
  return pads.filter(p => p && p.connected);
}
// Linux evdev layout used by Chrome for pads it does not recognise (xpad order)
const PAD_MAP_LINUX = { 0: 'a', 1: 'b', 2: 'x', 3: 'y', 4: 'lb', 5: 'rb', 6: 'view', 7: 'menu', 9: 'ls', 10: 'rs' };
// generic HID / DirectInput order (Windows, and Linux hid-generic): A B C X Y Z L1 R1 L2 R2 Select Start Mode L3 R3 --
// slot 2 (C) and 5 (Z) are empty, so read with the xpad order above X came out as Y and Y as LB.
const PAD_MAP_HID = { 0: 'a', 1: 'b', 3: 'x', 4: 'y', 6: 'lb', 7: 'rb', 8: 'lt', 9: 'rt', 10: 'view', 11: 'menu', 13: 'ls', 14: 'rs' };
// How to read a pad. 'standard' (the browser already remapped it to the Xbox layout) is trusted; anything else is
// looked up by vendor/product id in SDL's GameControllerDB (paddb.js) -- the same database Steam and most PC games use --
// so the raw buttons mean what they mean in Windows/Steam. A pad that claims 'standard' but reports more than the four
// standard axes is treated as raw too. Unknown raw pads fall back to the xpad order (Linux) or the generic HID order.
const SDL_ACT = { a: 'a', b: 'b', x: 'x', y: 'y', leftshoulder: 'lb', rightshoulder: 'rb', lefttrigger: 'lt', righttrigger: 'rt', back: 'view', start: 'menu',
  leftstick: 'ls', rightstick: 'rs', dpup: 'up', dpdown: 'down', dpleft: 'left', dpright: 'right' };
const _layCache = {};
function padIds(pad) {
  const m = pad.id.match(/Vendor:\s*([0-9a-f]{1,4})\s*Product:\s*([0-9a-f]{1,4})/i) || pad.id.match(/^([0-9a-f]{1,4})-([0-9a-f]{1,4})-/i);
  return m ? m[1].toLowerCase().padStart(4, '0') + ':' + m[2].toLowerCase().padStart(4, '0') : null;
}
// Pads checked by hand in a browser, raw (unmapped) button order -> action. The browser numbers raw buttons by HID usage,
// gaps included; SDL's Windows entries number DirectInput objects with the gaps squeezed out, so they can be off by one or two.
//   18d1:9400 Google Stadia (Firefox on Windows reports it unmapped as '18d1-9400-Unknown Gamepad'): Android HID order,
//   A B _ X Y _ L1 R1 L3 R3 Select Start Stadia R2 L2 -- confirmed by the player (X arrived as 3, Y as 4).
const BROWSER_RAW = {
  '18d1:9400': { name: 'Google Stadia', map: { 0: 'a', 1: 'b', 3: 'x', 4: 'y', 6: 'lb', 7: 'rb', 8: 'ls', 9: 'rs', 10: 'view', 11: 'menu', 13: 'rt', 14: 'lt' }, right: [2, 3] },
};
function padLayout(pad) {
  const ck = pad.id + '|' + pad.mapping + '|' + pad.axes.length; if (_layCache[ck]) return _layCache[ck];
  const ua = navigator.userAgent, plat = /Windows/.test(ua) ? 'W' : /Mac OS X|Macintosh/.test(ua) ? 'M' : 'L';
  const ids = padIds(pad), DB = window.PAD_DB;
  const sdl = ids && DB && (DB[plat][ids] || DB.W[ids] || DB.L[ids] || DB.M[ids]);
  const known = ids && BROWSER_RAW[ids], chromeStd = /STANDARD GAMEPAD/i.test(pad.id);
  let L;
  if (known && !chromeStd) L = { name: known.name + ' (' + ids + ')', map: known.map, right: known.right };
  else if (pad.mapping === 'standard' && (pad.axes.length <= 4 || !sdl)) L = { name: 'standard', map: PAD_MAP, std: true };
  else if (sdl) {
    L = { name: 'SDL database (' + ids + ')', map: {}, axBtn: [], hat: {}, sticks: {}, plat };
    for (const f of sdl.split(',')) {
      const [k, v] = f.split(':'); if (!v) continue;
      let m;
      if (k in SDL_ACT) {
        if ((m = v.match(/^b(\d+)$/))) L.map[+m[1]] = SDL_ACT[k];
        else if ((m = v.match(/^([+-~]?)a(\d+)~?$/))) L.axBtn.push({ ax: +m[2], sign: m[1] === '-' ? -1 : 1, half: m[1] === '+' || m[1] === '-', act: SDL_ACT[k] });
        else if ((m = v.match(/^h0\.(\d+)$/))) L.hat[+m[1]] = SDL_ACT[k];
      } else if ((m = v.match(/^([+-]?)a(\d+)(~?)$/))) L.sticks[k] = { ax: +m[2], inv: m[3] === '~' ? -1 : 1 };
    }
    // Windows: SDL squeezes out empty HID button slots, the browser keeps them. If the pad reports two or more buttons
    // more than SDL knows, assume the Android HID gaps (slot 2 'C' and slot 5 'Z') and shift the indices back
    const top = Math.max(-1, ...Object.keys(L.map).map(Number));
    if (plat === 'W' && pad.buttons.length - (top + 1) >= 2) {
      const m2 = {}; for (const k in L.map) { const n = +k; m2[n + (n >= 2 ? 1 : 0) + (n >= 4 ? 1 : 0)] = L.map[k]; }
      L.map = m2; L.name += ' + HID gaps';
    }
  } else if (plat === 'L' && pad.buttons.length <= 11) L = { name: 'xpad (Linux)', map: PAD_MAP_LINUX, xpad: true };
  else L = { name: 'generic HID', map: PAD_MAP_HID };
  return (_layCache[ck] = L);
}
// Windows reports raw axes by HID usage (X=0 Y=1 Z=2 Rx=3 Ry=4 Rz=5 ...), SDL numbers only the axes a pad has: map
// SDL's n-th axis onto the n-th axis that has shown any life (left stick is always 0/1)
function sdlAxis(pad, L, n) {
  if (L.plat !== 'W' || n < 2) return n;
  const seen = IN.axSeen[pad.index] || (IN.axSeen[pad.index] = new Set([0, 1]));
  const list = [...seen].sort((a, b) => a - b);
  return list.length > n ? list[n] : n;
}
// d-pad hat: Chrome on Windows/Mac gives one axis (index 9) stepping through 8 directions (>1 = centred); Linux gives two axes
function hatBits(pad, L) {
  const ax = pad.axes;
  if (L.plat === 'L') { const hx = ax[ax.length - 2] || 0, hy = ax[ax.length - 1] || 0; return (hy < -0.5 ? 1 : 0) | (hx > 0.5 ? 2 : 0) | (hy > 0.5 ? 4 : 0) | (hx < -0.5 ? 8 : 0); }
  const v = ax.length > 9 ? ax[9] : ax[ax.length - 1];
  if (v === undefined || Math.abs(v) > 1.05) return 0;
  const d = Math.round((v + 1) * 3.5) % 8;   // 0 up, 1 up-right, 2 right ... 7 up-left
  return ([7, 0, 1].includes(d) ? 1 : 0) | ([1, 2, 3].includes(d) ? 2 : 0) | ([3, 4, 5].includes(d) ? 4 : 0) | ([5, 6, 7].includes(d) ? 8 : 0);
}

function pollInput() {
  IN.prev = IN.cur; IN.cur = {}; IN.padCur = {};
  let lx = 0, ly = 0, rx = 0, ry = 0, best = 0;
  const dz = (v) => Math.abs(v) < 0.18 ? 0 : (v - Math.sign(v) * 0.18) / 0.82;
  // Read ONE controller. Steam and Windows often expose the same device two or three times (Steam's virtual Xbox pad,
  // the system's own XInput pad, the raw HID device), sometimes with different button orders; merging them made one
  // press fire two actions and left others dead. The pad that was used last is followed; a standard-mapped pad is
  // preferred over raw ones; a raw pad's axes are trusted for triggers and d-pad on Linux only (xpad order).
  const t = performance.now();
  const pads = connectedPads(), anyStd = pads.some(p => padLayout(p).std);
  const linux = /Linux/.test(navigator.userAgent) && !/Android|Windows/.test(navigator.userAgent);
  const live = p => p.buttons.some(b => b.pressed || b.value > 0.5) || p.axes.slice(0, 4).some(v => Math.abs(v) > 0.45);
  const eligible = pads.filter(p => !anyStd || padLayout(p).std);
  let pad = eligible.find(p => p.index === IN.activePad);
  const other = eligible.find(p => p !== pad && live(p));
  if (other && (!pad || (!live(pad) && t - IN.padActT > 600))) pad = other;
  if (!pad) pad = eligible[0];
  IN.activePad = pad ? pad.index : -1;
  IN.padDiag = pads.map(p => ({ id: p.id, index: p.index, mapping: p.mapping || '(none)', used: p === pad, b: p.buttons.map((b, i) => (b.pressed || b.value > 0.5) ? i : -1).filter(i => i >= 0), ax: Array.from(p.axes, v => Math.round(v * 100) / 100) }));
  if (pad) {
    if (!IN.padName) IN.padName = pad.id;
    const lay = padLayout(pad), std = !!lay.std;
    const base = lay.map, map = IN.custom ? Object.assign({}, base, IN.custom) : base;   // IN.custom: the player's own layout (Controller setup)
    IN.padLayoutName = IN.custom ? lay.name + ' + your own buttons' : lay.name;
    if (!std && !lay.axBtn && !lay.right && !IN.custom && !IN.warnedRaw && typeof UI !== 'undefined' && UI.msg) { IN.warnedRaw = true; setTimeout(() => UI.msg('This controller is not in the controller database. If buttons are mixed up: Pause > Controller setup.', '#c8b080', true), 1500); }
    let any = false;
    pad.buttons.forEach((b, i) => {
      const down = b.pressed || b.value > 0.5, key = pad.index + ':' + i;
      if (down && !IN.padPrev[key]) { IN.padEdgeT = t; IN.logIn('pad button ' + i + ' -> ' + (map[i] || 'nothing')); }
      IN.padPrev[key] = down;
      const a = map[i]; if (a && down) { IN.cur[a] = true; IN.padCur[a] = true; any = true; }
    });
    const ax = pad.axes;
    let a0 = dz(ax[0] || 0), a1 = dz(ax[1] || 0), a2 = 0, a3 = 0;
    if (std) { a2 = dz(ax[2] || 0); a3 = dz(ax[3] || 0); }
    else if (lay.axBtn) {
      // database layout: sticks, axis triggers and the hat as the database describes them
      const seen = IN.axSeen[pad.index] || (IN.axSeen[pad.index] = new Set([0, 1]));
      ax.forEach((v, i) => { if (i < 9 && Math.abs(v) > 0.25 && Math.abs(v) <= 1.01) seen.add(i); });
      const st = lay.sticks, rd = (k, d) => st[k] ? dz((ax[sdlAxis(pad, lay, st[k].ax)] || 0) * st[k].inv) : d;
      a0 = rd('leftx', a0); a1 = rd('lefty', a1); a2 = rd('rightx', 0); a3 = rd('righty', 0);
      for (const B of lay.axBtn) {
        const v = ax[sdlAxis(pad, lay, B.ax)] || 0, on = B.half ? v * B.sign > 0.5 : v > 0.5;
        const key = pad.index + ':a' + B.ax + B.sign; if (on && !IN.padPrev[key]) { IN.padEdgeT = t; IN.logIn('pad axis ' + B.ax + ' -> ' + B.act); } IN.padPrev[key] = on;
        if (on) { IN.cur[B.act] = true; any = true; }
      }
      const hb = hatBits(pad, lay);
      for (const bit of [1, 2, 4, 8]) if (hb & bit && lay.hat[bit]) { IN.cur[lay.hat[bit]] = true; any = true; }
    }
    else if (lay.right) {
      // hand-checked pad: right stick on the listed axes (Firefox packs axes; Chrome indexes by usage, Rz = 5)
      const [ix, iy] = ax.length > 8 && lay.right[1] === 3 ? [2, 5] : lay.right;
      a2 = dz(ax[ix] || 0); a3 = dz(ax[iy] || 0);
    }
    else if (!lay.xpad) { a2 = 0; a3 = 0; }   // generic HID guess: left stick and buttons only
    else {
      a2 = dz(ax[3] || 0); a3 = dz(ax[4] || 0);
      if ((ax[2] || -1) > 0.2) { IN.cur.lt = true; any = true; }
      if ((ax[5] || -1) > 0.2) { IN.cur.rt = true; any = true; }
      const hx = ax[6] || 0, hy = ax[7] || 0;
      if (hx < -0.5) IN.cur.left = true; if (hx > 0.5) IN.cur.right = true;
      if (hy < -0.5) IN.cur.up = true; if (hy > 0.5) IN.cur.down = true;
      if (Math.abs(hx) + Math.abs(hy) > 0.5) any = true;
    }
    lx = a0; ly = a1; rx = a2; ry = a3;
    // a stick pushed past half way also counts as a pad 'press' (Steam's desktop layout types arrow keys for it)
    const sOn = Math.hypot(ax[0] || 0, ax[1] || 0) > 0.5, rOn = Math.hypot(ax[2] || 0, ax[3] || 0) > 0.5;
    if ((sOn && !IN.padPrev.ls) || (rOn && !IN.padPrev.rs)) IN.padEdgeT = t;
    IN.padPrev.ls = sOn; IN.padPrev.rs = rOn;
    if (any || Math.abs(a0) + Math.abs(a1) + Math.abs(a2) + Math.abs(a3) > 0.2) { IN.lastDevice = 'pad'; IN.padName = pad.id; IN.padActT = t; }
  }
  // keys and clicks that Steam typed for a pad button: same moment as a pad press -> ignored (kept blocked until released)
  const steamy = (kt) => pads.length && Math.abs(kt - IN.padEdgeT) < 160;
  const young = (kt) => pads.length && t - IN.padActT < 3000 && t - kt < 45;   // wait a moment: the pad press may show up a poll later
  for (const k in IN.taps) {
    if (IN.keyBlock[k]) { delete IN.taps[k]; continue; }
    if (steamy(IN.keyT[k])) { IN.keyBlock[k] = true; IN.logIn('key ' + k + ' ignored (Steam typed it for a pad button)'); delete IN.taps[k]; continue; }
    if (young(IN.keyT[k])) continue;
  }
  const held = {};
  for (const k in IN.taps) { if (young(IN.keyT[k])) { held[k] = 1; continue; } const a = KEY_MAP[k]; if (KEY_ROLE[k]) IN.cur[KEY_ROLE[k]] = true; if (a) { IN.cur[a] = true; IN.logIn('key ' + k + ' -> ' + (KEY_ROLE[k] || a)); } }
  IN.taps = held;
  for (const k in IN.keys) if (IN.keys[k] && !IN.keyBlock[k] && !held[k]) {
    if (steamy(IN.keyT[k])) { IN.keyBlock[k] = true; continue; }
    const a = KEY_MAP[k]; if (a) IN.cur[a] = true; if (KEY_ROLE[k]) IN.cur[KEY_ROLE[k]] = true;
    const m = MOVE_KEYS[k]; if (m) { lx += m[0]; ly += m[1]; }
  }
  // game roles on top of the button names (the button names stay for menus: A confirms, B goes back):
  // on a controller B dashes and A throws an Ember (the player's choice); on the keyboard Space/Shift dash and E throws
  if (IN.padCur.b) IN.cur.dash = true;
  if (IN.padCur.a) IN.cur.ember = true;
  const l = Math.hypot(lx, ly); if (l > 1) { lx /= l; ly /= l; }
  IN.axes.lx = lx; IN.axes.ly = ly; IN.axes.rx = rx; IN.axes.ry = ry;
  // clicks: Steam's desktop layout turns the triggers into mouse buttons
  for (const [P, C, T, side] of [['leftPressed', 'leftClick', 'leftT', 'left'], ['rightPressed', 'rightClick', 'rightT', 'right']]) {
    IN.mouse[C] = false;
    if (!IN.mouse[P]) continue;
    if (steamy(IN.mouse[T] || 0)) { IN.mouse[P] = false; IN.mouse[side] = false; IN.logIn(side + ' click ignored (Steam typed it for a pad button)'); continue; }
    if (young(IN.mouse[T] || 0)) continue;
    IN.mouse[C] = true; IN.mouse[P] = false; IN.logIn(side + ' click');
  }
}
IN.padRecent = () => performance.now() - IN.padActT < 1500;
IN.logIn = (m) => { IN.log.unshift((performance.now() / 1000).toFixed(2) + '  ' + m); if (IN.log.length > 10) IN.log.length = 10; };
try { const c = JSON.parse(localStorage.getItem('rh_padmap') || 'null'); if (c && typeof c === 'object') IN.custom = c; } catch (e) { }
const pressed = a => !!IN.cur[a] && !IN.prev[a];
const held = a => !!IN.cur[a];
// navigation with auto-repeat (for menus): returns [dx, dy] once per step
function navDir(dt) {
  let dx = 0, dy = 0;
  const sx = IN.axes.lx, sy = IN.axes.ly;
  const dirs = { up: held('up') || sy < -0.6, down: held('down') || sy > 0.6, left: held('left') || sx < -0.6, right: held('right') || sx > 0.6 };
  for (const k in dirs) {
    if (dirs[k]) {
      IN.repeatT[k] = (IN.repeatT[k] ?? -1);
      if (IN.repeatT[k] < 0) { IN.repeatT[k] = 0.32; fire(k); }
      else { IN.repeatT[k] -= dt; if (IN.repeatT[k] <= 0) { IN.repeatT[k] = 0.09; fire(k); } }
    } else IN.repeatT[k] = -1;
  }
  function fire(k) { if (k === 'up') dy = -1; if (k === 'down') dy = 1; if (k === 'left') dx = -1; if (k === 'right') dx = 1; }
  return [dx, dy];
}
// stick (screen space) -> world direction on the ground plane
function stickToWorld(sx, sy) { return [(sx + sy) * Math.SQRT1_2, (-sx + sy) * Math.SQRT1_2]; }
// rumble on the controller in use: Chrome/Edge/Safari speak vibrationActuator.playEffect('dual-rumble'), Firefox speaks
// hapticActuators[].pulse(intensity, ms). Both are tried; the pad being read gets it (all pads if none is active yet).
function vibrate(strong = 0.5, weak = 0.5, ms = 120) {
  let pads = connectedPads(); const act = pads.filter(p => p.index === IN.activePad); if (act.length) pads = act;
  for (const p of pads) {
    try {
      if (p.vibrationActuator && p.vibrationActuator.playEffect) { p.vibrationActuator.playEffect('dual-rumble', { duration: ms, strongMagnitude: strong, weakMagnitude: weak }).catch(() => { }); IN.rumbleAPI = 'vibrationActuator'; continue; }
      if (p.hapticActuators && p.hapticActuators.length) { for (const h of p.hapticActuators) if (h.pulse) h.pulse(Math.min(1, Math.max(strong, weak)), ms); IN.rumbleAPI = 'hapticActuators'; continue; }
      IN.rumbleAPI = 'none (this browser offers no rumble for this pad)';
    } catch (e) { IN.rumbleAPI = 'error: ' + e.message; }
  }
}
// a sequence of rumbles: [[delay ms, strong, weak, ms], ...]
function rumble(seq) { for (const [d, s, w, ms] of seq) setTimeout(() => vibrate(s, w, ms), d); }

