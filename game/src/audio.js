'use strict';
// Audio engine: buses, convolution reverb per zone, sample-based sound effects (sprite bank),
// layered ambience and spoken voice-over. All recordings are embedded (AUDIO_ASSETS, Opus).

const Audio2 = {
  ctx: null, ready: false, loaded: false, master: null, music: null, sfx: null, amb: null, voice: null,
  verb: null, verbSend: null, musicVerb: null, musicVerbSend: null, verbMul: 1,
  banks: {}, maps: {}, irs: {}, last: {}, lastClip: {}, zone: 'town', duck: 1,
};

function b64ToBuf(b64) {
  const bin = atob(b64), n = bin.length, u = new Uint8Array(n);
  for (let i = 0; i < n; i++) u[i] = bin.charCodeAt(i);
  return u.buffer;
}
function decodeB64(b64) {
  return new Promise((res, rej) => Audio2.ctx.decodeAudioData(b64ToBuf(b64), res, rej));
}

function initAudio() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    const ctx = new AC({ latencyHint: 'interactive' });
    Audio2.ctx = ctx;
    // master: gentle glue compression, sub-sonic cut, a touch of warmth
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.knee.value = 14; comp.ratio.value = 3; comp.attack.value = 0.006; comp.release.value = 0.3;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 32; hp.Q.value = 0.6;
    const warm = ctx.createBiquadFilter(); warm.type = 'lowshelf'; warm.frequency.value = 220; warm.gain.value = 1.5;
    const air = ctx.createBiquadFilter(); air.type = 'highshelf'; air.frequency.value = 9000; air.gain.value = -2.5;
    Audio2.master = ctx.createGain(); Audio2.master.gain.value = 0.95;
    const lim = ctx.createDynamicsCompressor(); lim.threshold.value = -2.5; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.001; lim.release.value = 0.12;
    Audio2.master.connect(hp); hp.connect(warm); warm.connect(air); air.connect(comp); comp.connect(lim); lim.connect(ctx.destination);
    for (const k of ['music', 'sfx', 'amb', 'voice']) { Audio2[k] = ctx.createGain(); Audio2[k].connect(Audio2.master); }
    // speech sits on top of the mix: its own leveller with make-up gain, and ambience ducks under it
    const vc = ctx.createDynamicsCompressor(); vc.threshold.value = -22; vc.knee.value = 8; vc.ratio.value = 3.5; vc.attack.value = 0.004; vc.release.value = 0.18;
    const vmk = ctx.createGain(); vmk.gain.value = 1.45;
    Audio2.voice.disconnect(); Audio2.voice.connect(vc); vc.connect(vmk); vmk.connect(Audio2.master);
    Audio2.ambDuck = ctx.createGain(); Audio2.amb.disconnect(); Audio2.amb.connect(Audio2.ambDuck); Audio2.ambDuck.connect(Audio2.master);
    Audio2.musicDuck = ctx.createGain(); Audio2.musicDuck.connect(Audio2.music);
    // zone reverb (sfx / ambience / voice)
    Audio2.verb = ctx.createConvolver();
    Audio2.verbSend = ctx.createGain(); Audio2.verbSend.connect(Audio2.verb);
    Audio2.verbRet = ctx.createGain(); Audio2.verbRet.gain.value = 0.55; Audio2.verb.connect(Audio2.verbRet); Audio2.verbRet.connect(Audio2.master);
    // music reverb (always a large, dark space)
    Audio2.musicVerb = ctx.createConvolver();
    Audio2.musicVerbSend = ctx.createGain(); Audio2.musicVerbSend.connect(Audio2.musicVerb);
    const mret = ctx.createGain(); mret.gain.value = 0.85; Audio2.musicVerb.connect(mret); mret.connect(Audio2.musicDuck);
    // fallback noise buffer (wind / room tone beds)
    const n = ctx.sampleRate * 3;
    Audio2.brownBuf = ctx.createBuffer(1, n, ctx.sampleRate);
    const b = Audio2.brownBuf.getChannelData(0); let last = 0;
    for (let i = 0; i < n; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; b[i] = last * 3.5; }
    for (let i = 0; i < 2000; i++) { const f = i / 2000; b[i] *= f; b[n - 1 - i] *= f; }
    applyVolumes();
    Audio2.ready = true;
    Audio2.loading = loadAudioAssets();
  } catch (e) { console.warn('audio init failed', e); }
}

async function loadAudioAssets() {
  if (typeof AUDIO_ASSETS === 'undefined') return;
  try {
    const A = AUDIO_ASSETS;
    Audio2.maps.sfx = A.sfxMap; Audio2.maps.inst = A.instMap;
    const [sfx, inst] = await Promise.all([decodeB64(A.sfx), decodeB64(A.inst)]);
    Audio2.banks.sfx = sfx; Audio2.banks.inst = inst;
    for (const k in A.ir) Audio2.irs[k] = await decodeB64(A.ir[k]);
    Audio2.musicVerb.buffer = Audio2.irs.cathedral;
    setReverbZone(Audio2.zone);
    Audio2.loaded = true;
    if (AMB.zone) setAmbience(AMB.zone, true);
  } catch (e) { console.warn('audio assets failed', e); }
}

function applyVolumes() {
  if (!Audio2.ctx) return;
  const S = G.settings;
  Audio2.music.gain.value = (S.musicVol ?? 0.7) * 0.8;
  Audio2.sfx.gain.value = (S.sfxVol ?? 0.8);
  Audio2.amb.gain.value = (S.sfxVol ?? 0.8) * 0.9;
  Audio2.voice.gain.value = (S.voiceVol ?? 0.9) * 0.95;
}
Audio2.unlock = function () { if (Audio2.ctx && Audio2.ctx.state !== 'running') Audio2.ctx.resume(); };

const ZONE_VERB = { town: ['town', 0.55], abbey: ['cathedral', 1.0], catacombs: ['crypt', 1.0], caves: ['cave', 1.1], abyss: ['cathedral', 1.2] };
function setReverbZone(zone) {
  Audio2.zone = zone;
  const z = ZONE_VERB[zone] || ZONE_VERB.abbey;
  Audio2.verbMul = z[1];
  const ir = Audio2.irs[z[0]];
  if (ir && Audio2.verb.buffer !== ir) {
    // swapping a convolver buffer clicks if sound is ringing: fade the return around it
    const t = Audio2.ctx.currentTime, g = Audio2.verbRet.gain;
    g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(0, t + 0.08);
    setTimeout(() => { try { Audio2.verb.buffer = ir; } catch (e) { } const t2 = Audio2.ctx.currentTime; g.setValueAtTime(0, t2); g.linearRampToValueAtTime(0.55, t2 + 0.4); }, 100);
  }
}

// ---------------- sound effects ----------------
const SFX_ALIAS = { risen: 'zombie', archer: 'skeleton', bishop: 'king', hound: 'hound' };
function sfxClips(name) {
  const M = Audio2.maps.sfx; if (!M) return null;
  if (M[name]) return M[name];
  const m = name.match(/^(.*?)(Aggro|Attack|Die)$/);
  if (m) {
    const a = SFX_ALIAS[m[1]]; if (a && M[a + m[2]]) return M[a + m[2]];
    return M['zombie' + m[2]] || null;
  }
  return null;
}
const UI_SOUNDS = new Set(['click', 'menuMove', 'menuOpen', 'error', 'pageTurn']);
const SFX = {
  play(name, opts = {}) {
    if (!Audio2.loaded || Audio2.ctx.state !== 'running') return null;
    const ctx = Audio2.ctx, now = ctx.currentTime;
    if (Audio2.last[name] && now - Audio2.last[name] < (opts.minGap ?? 0.045)) return null;
    const clips = sfxClips(name); if (!clips) return null;
    Audio2.last[name] = now;
    let vol = opts.vol ?? 1, pan = opts.pan ?? 0, dist = 0;
    if (opts.x !== undefined && WORLD.hero) {
      const H = WORLD.hero, dx = opts.x - H.x, dz = opts.z - H.z; dist = Math.hypot(dx, dz);
      vol *= clamp(1 - (dist - 3) / 17, 0, 1); if (vol <= 0.01) return null;
      pan = clamp((dx - dz) * 0.085, -0.75, 0.75);
    }
    let ci = (Math.random() * clips.length) | 0;
    if (clips.length > 2 && ci === Audio2.lastClip[name]) ci = (ci + 1 + ((Math.random() * (clips.length - 1)) | 0)) % clips.length;
    Audio2.lastClip[name] = ci; const c = clips[ci];
    const src = ctx.createBufferSource(); src.buffer = Audio2.banks.sfx;
    const ui = UI_SOUNDS.has(name);
    src.playbackRate.value = opts.rate ?? (ui ? 1 : 1 + (Math.random() - 0.5) * 0.07);
    const g = ctx.createGain(); g.gain.value = vol;
    let node = src;
    const lpf = opts.lp || (dist > 7 ? clamp(9000 - (dist - 7) * 600, 1500, 9000) : 0);
    if (lpf) { const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = lpf; src.connect(lp); node = lp; }
    node.connect(g);
    const p = ctx.createStereoPanner(); p.pan.value = pan; g.connect(p); p.connect(Audio2.sfx);
    if (!ui) {
      const s = ctx.createGain(); s.gain.value = ((c.v ?? 0.1) + 0.12 + (opts.wet || 0) + dist * 0.012) * Audio2.verbMul; p.connect(s); s.connect(Audio2.verbSend);
    }
    const t = now + (opts.delay || 0) + 0.004;
    src.start(t, c.s, c.n);
    return src;
  },
};

// ---------------- voice-over ----------------
const VOICE = { cur: null, curId: null, cache: new Map(), token: 0 };
async function getVoiceBuffer(id) {
  if (VOICE.cache.has(id)) return VOICE.cache.get(id);
  const b64 = typeof AUDIO_ASSETS !== 'undefined' && AUDIO_ASSETS.voice[id];
  if (!b64) return null;
  const buf = await decodeB64(b64);
  VOICE.cache.set(id, buf);
  if (VOICE.cache.size > 24) VOICE.cache.delete(VOICE.cache.keys().next().value);
  return buf;
}
// play a spoken line; returns a promise resolving to the duration (0 if unavailable)
async function playVoice(id, opts = {}) {
  if (!Audio2.ready || !Audio2.ctx || Audio2.ctx.state !== 'running') return 0;
  const tok = ++VOICE.token;
  stopVoice(true);
  let buf; try { buf = await getVoiceBuffer(id); } catch (e) { return 0; }
  if (!buf || tok !== VOICE.token) return 0;
  const ctx = Audio2.ctx, t = ctx.currentTime + 0.05;
  const src = ctx.createBufferSource(); src.buffer = buf;
  const g = ctx.createGain(); g.gain.value = opts.vol ?? 1;
  src.connect(g); g.connect(Audio2.voice);
  const s = ctx.createGain(); s.gain.value = (opts.verb ?? 0.12) * Audio2.verbMul; g.connect(s); s.connect(Audio2.verbSend);
  src.start(t);
  VOICE.cur = { src, g }; VOICE.curId = id;
  // duck the music under speech
  const d = Audio2.musicDuck.gain; d.cancelScheduledValues(t); d.setValueAtTime(d.value, t); d.linearRampToValueAtTime(opts.duck ?? 0.42, t + 0.3);
  if (opts.duckAmb && Audio2.ambDuck) { const a = Audio2.ambDuck.gain; a.cancelScheduledValues(t); a.setValueAtTime(a.value, t); a.linearRampToValueAtTime(opts.duckAmb, t + 0.3); }
  src.onended = () => { if (VOICE.cur && VOICE.cur.src === src) { VOICE.cur = null; VOICE.curId = null; unduck(); } };
  return buf.duration;
}
function unduck() { const ctx = Audio2.ctx, t = ctx.currentTime; for (const n of [Audio2.musicDuck, Audio2.ambDuck]) { if (!n) continue; const d = n.gain; d.cancelScheduledValues(t); d.setValueAtTime(d.value, t); d.linearRampToValueAtTime(1, t + 1.2); } }
function stopVoice(quick) {
  if (!VOICE.cur) return;
  const { src, g } = VOICE.cur; VOICE.cur = null; VOICE.curId = null;
  try { const t = Audio2.ctx.currentTime; g.gain.setValueAtTime(g.gain.value, t); g.gain.linearRampToValueAtTime(0, t + (quick ? 0.06 : 0.25)); src.stop(t + 0.3); } catch (e) { }
  if (!quick) unduck();
}
// hero barks: short class lines, rate-limited so they never spam
const BARK = { last: {} };
function heroBark(kind, cooldown = 6) {
  const H = WORLD.hero; if (!H) return;
  const now = G.time;
  if (BARK.last[kind] && now - BARK.last[kind] < cooldown) return;
  if (VOICE.cur && !(VOICE.curId || '').match(/_(invfull|nomana|cantuse|noportal|levelup|lowhp|unique|bosskill|kill|descend|idle)(_\d+)?$/)) return; // never talk over dialogue
  const base = `${H.voice || H.cls}_${kind}`, V = typeof AUDIO_ASSETS !== 'undefined' ? AUDIO_ASSETS.voice : {};
  const takes = Object.keys(V).filter(k => k === base || (k.startsWith(base + '_') && /^\d+$/.test(k.slice(base.length + 1))));
  if (!takes.length) return;
  BARK.last[kind] = now;
  let id = takes[(Math.random() * takes.length) | 0];
  if (takes.length > 1 && id === BARK.prev) id = takes[(takes.indexOf(id) + 1) % takes.length];
  BARK.prev = id;
  playVoice(id, { duck: 0.7, verb: 0.08 });
}

// ---------------- ambience ----------------
const AMB = { nodes: [], timer: 0, zone: null, beds: [] };
const AMB_ZONES = {
  town:      { bedVol: 0.55, bed: [380, 0.11, 0.07, 220], events: [['ambCrow', 0.18, 0.5], ['ambWind', 0.3, 0.35], ['ambBell', 0.05, 0.4], ['ambChain', 0.06, 0.3], ['ambCreak', 0.14, 0.4]], every: [3, 8] },
  abbey:     { bedVol: 0.8, bed: [160, 0.10, 0.05, 60], events: [['ambDrip', 0.28, 0.5], ['ambChain', 0.12, 0.45], ['ambMoan', 0.1, 0.45], ['ambWhisper', 0.08, 0.35], ['ambThud', 0.1, 0.6], ['ambDistantBell', 0.05, 0.4], ['ambScrape', 0.08, 0.45], ['ambGroan', 0.08, 0.45], ['ambCreak', 0.08, 0.35]], every: [2.5, 6.5] },
  catacombs: { bedVol: 0.8, bed: [140, 0.11, 0.05, 50], events: [['ambDrip', 0.28, 0.5], ['ambScrape', 0.14, 0.5], ['ambMoan', 0.12, 0.5], ['ambWhisper', 0.12, 0.4], ['ambThud', 0.1, 0.6], ['ambChain', 0.1, 0.4], ['ambGroan', 0.08, 0.45], ['ambEerie', 0.06, 0.4], ['ambRumble', 0.05, 0.6]], every: [2, 6] },
  caves:     { bedVol: 0.7, bed: [120, 0.12, 0.05, 40], events: [['ambDrip', 0.5, 0.55], ['ambScrape', 0.12, 0.45], ['ambThud', 0.12, 0.6], ['ambMoan', 0.05, 0.35], ['ambWater', 0.14, 0.45], ['ambRumble', 0.08, 0.6], ['ambCreak', 0.05, 0.35]], every: [1.2, 4] },
  abyss:     { bedVol: 0.65, bed: [90, 0.15, 0.08, 30], events: [['ambThud', 0.2, 0.7], ['ambMoan', 0.2, 0.5], ['ambWhisper', 0.12, 0.45], ['ambScrape', 0.1, 0.45], ['ambFire', 0.15, 0.4], ['ambChain', 0.08, 0.4], ['ambRumble', 0.12, 0.65], ['ambEerie', 0.1, 0.45], ['ambGroan', 0.1, 0.5]], every: [1.5, 5] },
};
// recorded stereo beds (AUDIO_ASSETS.amb, seamless loops), decoded on first use
const AMB_BUF = {};
async function ambBed(zone) {
  if (AMB_BUF[zone]) return AMB_BUF[zone];
  const b64 = typeof AUDIO_ASSETS !== 'undefined' && AUDIO_ASSETS.amb && AUDIO_ASSETS.amb[zone];
  if (!b64) return null;
  try { AMB_BUF[zone] = await decodeB64(b64); } catch (e) { return null; }
  return AMB_BUF[zone];
}
function setAmbience(zone, force) {
  if (!Audio2.ready) return;
  if (AMB.zone === zone && !force) return;
  setReverbZone(zone);
  const c = Audio2.ctx, t = c.currentTime;
  for (const n of AMB.beds) { try { n.g.gain.setValueAtTime(n.g.gain.value, t); n.g.gain.linearRampToValueAtTime(0, t + 2); n.src.stop(t + 2.2); } catch (e) { } }
  AMB.beds = []; AMB.zone = zone; AMB.timer = 1.5;
  const Z = AMB_ZONES[zone] || AMB_ZONES.abbey;
  const tok = AMB.token = (AMB.token || 0) + 1;
  ambBed(zone).then(buf => {
    if (tok !== AMB.token) return;
    const t = c.currentTime;
    if (buf) {
      // recorded room tone / wind / drones, with a slow breathing swell on top
      const src = c.createBufferSource(); src.buffer = buf; src.loop = true;
      const g = c.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(Z.bedVol ?? 0.85, t + 3);
      const sw = c.createGain(); sw.gain.value = 1;
      const lfo = c.createOscillator(); lfo.frequency.value = 0.037; const lg = c.createGain(); lg.gain.value = 0.18; lfo.connect(lg); lg.connect(sw.gain);
      src.connect(sw); sw.connect(g); g.connect(Audio2.amb);
      // a little of the bed into the zone reverb so it sits in the same space as everything else
      const s2 = c.createGain(); s2.gain.value = 0.12 * Audio2.verbMul; g.connect(s2); s2.connect(Audio2.verbSend);
      src.start(t, Math.random() * buf.duration); lfo.start(t);
      AMB.beds.push({ src, g }, { src: lfo, g });
      return;
    }
    // fallback: slowly breathing filtered noise
    const [freq, vol, lfoAmt, lfoF] = Z.bed;
    for (let k = 0; k < 2; k++) {
      const src = c.createBufferSource(); src.buffer = Audio2.brownBuf; src.loop = true; src.playbackRate.value = 0.7 + k * 0.23;
      const f = c.createBiquadFilter(); f.type = zone === 'town' ? 'bandpass' : 'lowpass'; f.frequency.value = freq * (1 + k * 0.6); f.Q.value = zone === 'town' ? 0.7 : 0.5;
      const lfo = c.createOscillator(); lfo.frequency.value = 0.05 + k * 0.031; const lg = c.createGain(); lg.gain.value = lfoF * (1 + k); lfo.connect(lg); lg.connect(f.frequency);
      const g = c.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol * (k ? 0.6 : 1), t + 3);
      const p = c.createStereoPanner(); p.pan.value = k ? 0.4 : -0.4;
      src.connect(f); f.connect(g); g.connect(p); p.connect(Audio2.amb);
      src.start(t, Math.random() * 2); lfo.start(t);
      AMB.beds.push({ src, g }, { src: lfo, g });
    }
  });
}
function updateAmbience(dt) {
  if (!Audio2.loaded || Audio2.ctx.state !== 'running' || !AMB.zone) return;
  AMB.timer -= dt; if (AMB.timer > 0) return;
  const Z = AMB_ZONES[AMB.zone] || AMB_ZONES.abbey;
  AMB.timer = Z.every[0] + Math.random() * (Z.every[1] - Z.every[0]);
  let r = Math.random(), tot = Z.events.reduce((a, e) => a + e[1], 0) * 1.0;
  r *= tot;
  for (const [name, w, vol] of Z.events) {
    if ((r -= w) > 0) continue;
    const H = WORLD.hero;
    const a = Math.random() * TAU, d = 6 + Math.random() * 10;
    const pan = Math.cos(a) * 0.85;
    const s = SFX.play(name, { vol: vol * (0.7 + Math.random() * 0.5), pan, rate: 0.9 + Math.random() * 0.2, minGap: 4, wet: 0.25, lp: 2500 + Math.random() * 5000 });
    break;
  }
}

