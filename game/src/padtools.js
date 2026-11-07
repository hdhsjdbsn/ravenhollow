'use strict';
// Controller test and controller setup for the main game (the action fork has its own copy in action.js).
// F2 or Pause > Controller test: what the browser reports per pad (id, mapping, layout used, pressed button numbers,
// axes), the game actions it produced, recent inputs and the rumble API. Pause > Controller setup: press each button in
// turn; the result is kept in this browser (localStorage 'rh_padmap') and used from then on.
const PADT = { on: false, el: null, setup: null };
PADT.steps = [['a', 'A  (bottom) - attack, talk, pick up'], ['b', 'B  (right) - skill 3'], ['x', 'X  (left) - skill 1'], ['y', 'Y  (top) - skill 2'],
  ['lb', 'LB - healing potion'], ['rb', 'RB - mana potion'], ['lt', 'LT - town portal'], ['rt', 'RT - skill 4'], ['view', 'View / Back - inventory'], ['menu', 'Start / Menu - pause']];
PADT.test = function (on) {
  if (!PADT.el) { PADT.el = document.createElement('div'); PADT.el.style.cssText = 'position:fixed;left:12px;top:60px;z-index:60;max-width:560px;padding:10px 14px;background:rgba(8,6,4,.92);border:1px solid #5a4428;color:#e8d8b8;font:13px/1.5 ui-monospace,monospace;white-space:pre-wrap;pointer-events:none'; document.body.appendChild(PADT.el); }
  PADT.on = on === undefined ? !PADT.on : on; PADT.el.style.display = PADT.on ? '' : 'none';
};
PADT.start = function () { PADT.setup = { step: 0, prev: null, map: {}, t: 0.6 }; PADT.test(true); };
PADT.reset = function () { IN.custom = null; try { localStorage.removeItem('rh_padmap'); } catch (e) { } UI.msg('Controller: default buttons restored', '#a09070'); };
window.addEventListener('keydown', e => { if (e.code === 'F2') { e.preventDefault(); PADT.test(); } });
PADT.text = function () {
  const S = PADT.setup;
  if (S) {
    const st = PADT.steps[S.step];
    return 'CONTROLLER SETUP\n\n' + PADT.steps.map(([a, n], i) => (i < S.step ? '  ✓ ' : i === S.step ? '  ▶ ' : '    ') + n + (i < S.step ? '  = button ' + Object.keys(S.map).find(k => S.map[k] === a) : '')).join('\n') +
      '\n\nPress the button for ' + (st ? st[1].split(' - ')[0].trim() : '') + ' on your controller.\n(Esc on the keyboard cancels.)';
  }
  const d = IN.padDiag || [];
  return 'CONTROLLER TEST  (F2 to close)' + (IN.custom ? '   [your own button layout]' : '') + '\n' +
    (d.length ? d.map((p, i) => `#${i} ${p.used ? 'READ as ' + (IN.padLayoutName || '?') : 'ignored'}  (browser mapping: ${p.mapping})\n   ${p.id}\n   buttons down: ${p.b.join(', ') || '-'}\n   axes: ${p.ax.join('  ')}`).join('\n') : 'no controller seen yet: press any button on it') +
    `\ngame actions now: ${Object.keys(IN.cur).join(' ') || '-'}\nleft stick ${IN.axes.lx.toFixed(2)} ${IN.axes.ly.toFixed(2)}   right stick ${IN.axes.rx.toFixed(2)} ${IN.axes.ry.toFixed(2)}` +
    '\nrumble: ' + (IN.rumbleAPI || 'not tried yet') + '\n\nlast inputs:\n' + (IN.log.join('\n') || '-');
};
{
  const _ct = controlHero;
  controlHero = function (dt) { if (PADT.setup) { WORLD.hero.moveSpeedNow = 0; return; } return _ct(dt); };
  const _uh = updateHUD;
  updateHUD = function (dt) {
    const S = PADT.setup;
    if (S) {
      const d = (IN.padDiag || []).find(p => p.used), down = new Set(d ? d.b : []);
      S.t -= dt;
      if (S.prev && S.t <= 0) {
        const fresh = [...down].filter(i => !S.prev.has(i) && S.map[i] === undefined);
        if (fresh.length) {
          S.map[fresh[0]] = PADT.steps[S.step][0]; S.step++; S.t = 0.25; SFX.play('click');
          if (S.step >= PADT.steps.length) {
            // every button name was chosen: the choice replaces the pad's default layout entirely
            const gp = connectedPads().find(p => p.index === IN.activePad), base = gp ? padLayout(gp).map : PAD_MAP, custom = {};
            const chosen = new Set(PADT.steps.map(x => x[0]));
            for (const k in base) if (chosen.has(base[k])) custom[k] = null;
            for (const k in S.map) custom[k] = S.map[k];
            IN.custom = custom; try { localStorage.setItem('rh_padmap', JSON.stringify(custom)); } catch (e) { }
            PADT.setup = null; PADT.test(false); UI.msg('Controller layout saved', '#c8e0a0'); SFX.play('questDone', { vol: 0.5 });
          }
        }
      }
      if (PADT.setup) S.prev = down;
      if (IN.keys.Escape) { PADT.setup = null; PADT.test(false); UI.msg('Controller setup cancelled', '#a09070'); }
    }
    const r = _uh(dt);
    if (PADT.on && PADT.el) PADT.el.textContent = PADT.text();
    return r;
  };
}

// standing idle too long: the Penitent remarks on it (shared with the action fork; lines warrior_idle_*)
{
  let idleT = 0;
  const _upd = update;
  update = function (dt) {
    _upd(dt);
    const H = WORLD.hero; if (!H || Game.state !== 'play' || topPanel()) { idleT = 0; return; }
    const busy = Object.keys(IN.cur).length || IN.mouse.left || IN.mouse.right || IN.mouse.leftClick || Math.hypot(IN.axes.lx, IN.axes.ly) > 0.12 || H.action || Game.walkTo;
    idleT = busy || !H.alive ? 0 : idleT + dt;
    if (idleT > 20) { heroBark('idle', 40); idleT = -25; }
  };
}
