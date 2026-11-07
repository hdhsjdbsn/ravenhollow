'use strict';
// which baked set family draws the hero ('hero' = the game's Penitent; a test page may swap in another)
const HSET = (typeof window !== 'undefined' && window.HERO_SET) || 'pen';   // the Penitent's sprite sets: pen_* (concept model) since 2026-10-28, hero_* before
// Global namespace for the whole game.
const G = {
  time: 0, dt: 0, frame: 0,
  W: 1280, H: 800,         // internal render size (16:10, the Legion Go S panel)
  settings: {
    grain: true, musicVol: 0.7, sfxVol: 0.8, voiceVol: 0.9, showDamage: false, brightness: 1.0,
  },
};

// ---------- math helpers ----------
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = t => t * t * (3 - 2 * t);
const dist2 = (ax, az, bx, bz) => { const dx = ax - bx, dz = az - bz; return dx * dx + dz * dz; };
const dist = (ax, az, bx, bz) => Math.sqrt(dist2(ax, az, bx, bz));
const angDiff = (a, b) => { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };
const approach = (v, target, step) => v < target ? Math.min(v + step, target) : Math.max(v - step, target);
const TAU = Math.PI * 2;

// ---------- seeded RNG ----------
function RNG(seed) {
  let s = (seed >>> 0) || 1;
  const r = () => {
    s |= 0; s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  r.int = (a, b) => a + Math.floor(r() * (b - a + 1));   // inclusive
  r.range = (a, b) => a + r() * (b - a);
  r.pick = arr => arr[Math.floor(r() * arr.length)];
  r.chance = p => r() < p;
  r.weighted = (arr, wf) => {
    let tot = 0; for (const a of arr) tot += wf(a);
    let x = r() * tot;
    for (const a of arr) { x -= wf(a); if (x <= 0) return a; }
    return arr[arr.length - 1];
  };
  r.shuffle = arr => { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; };
  return r;
}
const rand = RNG((Date.now() ^ 0x5bd1e995) >>> 0);

// ---------- noise ----------
// Tileable value/gradient noise utilities (level layout).
function makeNoise(seed) {
  const r = RNG(seed);
  const P = new Uint8Array(512);
  const perm = [...Array(256).keys()];
  r.shuffle(perm);
  for (let i = 0; i < 512; i++) P[i] = perm[i & 255];
  const G2 = [];
  for (let i = 0; i < 256; i++) { const a = r() * TAU; G2.push([Math.cos(a), Math.sin(a)]); }
  const fade = t => t * t * t * (t * (t * 6 - 15) + 10);
  // periodic perlin noise with period px,py (integers)
  function perlin(x, y, px = 256, py = 256) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const x0 = ((xi % px) + px) % px, y0 = ((yi % py) + py) % py;
    const x1 = (x0 + 1) % px, y1 = (y0 + 1) % py;
    const g = (ix, iy, dx, dy) => { const v = G2[P[P[ix & 255] + (iy & 255)]]; return v[0] * dx + v[1] * dy; };
    const u = fade(xf), v = fade(yf);
    const a = g(x0, y0, xf, yf), b = g(x1, y0, xf - 1, yf);
    const c = g(x0, y1, xf, yf - 1), d = g(x1, y1, xf - 1, yf - 1);
    return lerp(lerp(a, b, u), lerp(c, d, u), v) * 1.4; // ~[-1,1]
  }
  function fbm(x, y, oct = 4, px = 256, py = 256, lac = 2, gain = 0.5) {
    let amp = 1, f = 1, s = 0, n = 0;
    for (let i = 0; i < oct; i++) {
      s += amp * perlin(x * f, y * f, px * f, py * f);
      n += amp; amp *= gain; f *= lac;
    }
    return s / n;
  }
  // tileable worley (cellular) noise: returns [f1, f2, cellId]
  function worley(x, y, cells, jitter = 0.9) {
    const xi = Math.floor(x), yi = Math.floor(y);
    let f1 = 9, f2 = 9, id = 0;
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
      const cx = xi + ox, cy = yi + oy;
      const wx = ((cx % cells) + cells) % cells, wy = ((cy % cells) + cells) % cells;
      const h = P[P[wx & 255] + (wy & 255)];
      const h2 = P[(h + 71) & 511];
      const fx = cx + 0.5 + (h / 255 - 0.5) * jitter, fy = cy + 0.5 + (h2 / 255 - 0.5) * jitter;
      const d = Math.hypot(fx - x, fy - y);
      if (d < f1) { f2 = f1; f1 = d; id = h * 256 + h2; } else if (d < f2) f2 = d;
    }
    return [f1, f2, id];
  }
  return { perlin, fbm, worley, hash: (a, b) => P[P[a & 255] + (b & 255)] / 255 };
}

// ---------- tiny event bus ----------
const Bus = {
  h: {},
  on(ev, fn) { (this.h[ev] = this.h[ev] || []).push(fn); },
  emit(ev, ...a) { const l = this.h[ev]; if (l) for (const f of l) f(...a); },
};

// ---------- misc ----------
function fmtNum(n) { return Math.round(n).toLocaleString('en-US'); }
function choiceWeighted(r, table) { // table: [[item, weight], ...]
  let tot = 0; for (const t of table) tot += t[1];
  let x = r() * tot;
  for (const t of table) { x -= t[1]; if (x <= 0) return t[0]; }
  return table[table.length - 1][0];
}

