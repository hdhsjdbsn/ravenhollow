'use strict';
// Generative score played on recorded instruments (stereo CC0 samples from VSCO 2 CE and VCSL: strings, organ, harp,
// strumstick, bowed psaltery, brass, tubular bells, timpani, gong, didgeridoo) plus an additive formant choir.
// A lookahead scheduler runs one "piece" per zone; a combat layer swells when monsters engage.

const MUS = { piece: null, pieceName: null, out: null, verb: null, nextT: 0, step: 0, intensity: 0, target: 0, timer: null, rng: RNG(1), voices: 0 };

// ---------- sample instrument player ----------
function instClip(name, midi) {
  const L = Audio2.maps.inst && Audio2.maps.inst[name]; if (!L) return null;
  let best = L[0], bd = 1e9;
  for (const c of L) { const d = Math.abs(c.root - midi) + (c.root > midi ? 0.4 : 0); if (d < bd) { bd = d; best = c; } }  // prefer pitching up slightly
  return best;
}
// play an instrument note. opts: dur (s), vol, pan, atk, rel, verb (send), lp (cutoff), rate (override), detune (cents)
function note(name, t, midi, opts = {}) {
  if (!Audio2.banks.inst || !MUS.out) return;
  const c = instClip(name, midi); if (!c) return;
  const ctx = Audio2.ctx;
  if (MUS.voices > 90) return;  // safety valve
  const src = ctx.createBufferSource(); src.buffer = Audio2.banks.inst;
  src.playbackRate.value = Math.pow(2, (midi - c.root) / 12) * (opts.rate || 1);
  if (opts.detune) src.detune.value = opts.detune;
  const sus = c.ls !== undefined;
  const dur = opts.dur ?? (sus ? 4 : c.n);
  const atk = opts.atk ?? (sus ? 0.6 : 0.004), rel = opts.rel ?? (sus ? 1.5 : 0.4);
  const vol = (opts.vol ?? 0.5) * (c.g || 1);   // c.g: playback gain for clips stored normalised
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vol, t + atk);
  g.gain.setValueAtTime(vol, t + Math.max(atk, dur));
  g.gain.linearRampToValueAtTime(0.0001, t + Math.max(atk, dur) + rel);
  let node = src;
  if (opts.lp) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = opts.lp; f.Q.value = 0.6; src.connect(f); node = f; }
  node.connect(g);
  const p = ctx.createStereoPanner(); p.pan.value = opts.pan || 0; g.connect(p); p.connect(MUS.out);
  const vs = ctx.createGain(); vs.gain.value = opts.verb ?? 0.6; p.connect(vs); vs.connect(MUS.verb);
  if (sus) { src.loop = true; src.loopStart = c.s + c.ls; src.loopEnd = c.s + c.le; src.start(t, c.s); }
  else src.start(t, c.s, c.n);
  src.stop(t + Math.max(atk, dur) + rel + 0.05);
  MUS.voices++; src.onended = () => { MUS.voices--; };
}
const chord = (name, t, midis, opts = {}) => midis.forEach((m, i) => note(name, t + (opts.spread || 0) * i, m, Object.assign({}, opts, { pan: (opts.pan || 0) + (i - (midis.length - 1) / 2) * (opts.width ?? 0.25), detune: (Math.random() - 0.5) * 8 })));
const perc = (name, t, opts = {}) => note(name, t, 60, Object.assign({ atk: 0.002, rel: 0.6 }, opts));

// ---------- harmony ----------
// voicings: [bass, tenor..., top] in D minor and its dark relatives
const CH = {
  Dm: [38, 50, 57, 62, 65], C: [36, 48, 55, 60, 64], Bb: [34, 46, 53, 58, 62], A: [33, 45, 52, 57, 61], Asus: [33, 45, 52, 57, 62],
  F: [41, 48, 53, 57, 60], Gm: [43, 50, 55, 58, 62], Am: [45, 52, 57, 60, 64], Eb: [39, 51, 58, 63, 67], Cm: [36, 48, 55, 60, 63],
  Dsus: [38, 50, 57, 62, 64], Bbm: [34, 46, 53, 58, 61], Gb: [42, 49, 54, 58, 61], Ddim: [38, 50, 56, 62, 65],
};
const DMIN = [62, 64, 65, 67, 69, 70, 72, 74, 76, 77, 79, 81];
const pickR = (R, a) => a[Math.floor(R() * a.length)];

// ---------- pieces ----------
const PIECES = {
  // Ravenhollow: a lonely plucked strumstick and harp over cello, in the spirit of a village at dusk.
  town: {
    stepDur: 0.34, gain: 1.1,
    prog: [['Dm', 'Dm', 'C', 'C', 'Bb', 'Bb', 'Asus', 'A'], ['Dm', 'Dm', 'F', 'F', 'C', 'C', 'A', 'A'], ['Gm', 'Gm', 'Dm', 'Dm', 'Bb', 'C', 'Asus', 'A'], ['Dm', 'C', 'Bb', 'A', 'Dm', 'C', 'Bb', 'A']],
    step(i, t) {
      const R = MUS.rng, bar = Math.floor(i / 6), s = i % 6;
      const sec = Math.floor(bar / 8) % this.prog.length, ch = CH[this.prog[sec][bar % 8]];
      const pat = bar % 2 ? [1, 3, 4, 3, 2, 3] : [0, 2, 3, 4, 3, 2];
      const humanize = R() * 0.018;
      // arpeggio: harp for the bass on the downbeat, strumstick above
      if (s === 0) note('harp', t, ch[0] + 12, { vol: 0.5, pan: -0.25, verb: 0.5 });
      else note('strum', t + humanize, ch[pat[s]] + (ch[pat[s]] < 55 ? 12 : 0), { vol: 0.32 + R() * 0.08, pan: (pat[s] - 2) * 0.18, verb: 0.55 });
      // 12-string shimmer: folk harp an octave up, very soft
      if (s % 2 === 1 && R() < 0.5) note('folkharp', t + 0.01, ch[pat[s]] + 12, { vol: 0.22, pan: 0.35, verb: 0.8 });
      // cello bass after the first verse
      if (bar >= 8 && s === 0 && bar % 2 === 0) note('cello', t, ch[0] + (ch[0] < 36 ? 12 : 0), { dur: this.stepDur * 11, vol: 0.2, atk: 1.2, rel: 2, verb: 0.6, lp: 1600 });
      // melody (violin) in later verses: long tones on chord tones
      if (bar >= 16 && s === 0 && R() < 0.45) {
        const cand = DMIN.filter(m => ch.some(c => (m - c) % 12 === 0));
        note('violin', t + 0.05, pickR(R, cand), { dur: this.stepDur * (R() < 0.5 ? 5 : 11), vol: 0.22, atk: 0.9, rel: 1.6, verb: 0.9, pan: 0.2, lp: 4500 });
      }
      // viola pad in the third verse
      if (bar >= 24 && s === 0 && bar % 4 === 0) chord('viola', t, [ch[1], ch[2]], { dur: this.stepDur * 22, vol: 0.09, atk: 2.5, rel: 3, verb: 1, lp: 1800 });
      // distant church bell
      if (s === 0 && bar % 32 === 20) for (let k = 0; k < 3; k++) note('bell', t + k * 2.6, 50, { vol: 0.16, pan: -0.6, verb: 1.4, lp: 2400 });
    },
  },
  // The abbey: organ and choir, decaying; a tolling bell, bowed psaltery like a ghost in the rafters.
  abbey: {
    stepDur: 0.5, gain: 1.8,
    prog: ['Dm', 'Bb', 'Gm', 'A', 'Dm', 'Eb', 'Cm', 'A'],
    step(i, t) {
      const R = MUS.rng, c = Math.floor(i / 16), s = i % 16, ch = CH[this.prog[c % this.prog.length]];
      const L = 16 * this.stepDur;
      if (s === 0) {
        chord('organ', t, [ch[1], ch[2], ch[3]], { dur: L + 0.5, vol: 0.12, atk: 1.6, rel: 2.5, verb: 1.1, lp: 2200 });
        note('organPedal', t, ch[0] - (ch[0] > 40 ? 12 : 0), { dur: L + 1, vol: 0.18, atk: 1.2, rel: 3, verb: 0.9 });
        if (c % 2 === 1) chord(R() < 0.5 ? 'choir' : 'choirOo', t + 0.8, [ch[2], ch[3]], { dur: L - 1, vol: 0.13, atk: 2.4, rel: 3, verb: 1.3 });
        if (R() < 0.35) note('bell', t, 38, { vol: 0.22, rate: 1, verb: 1.5, lp: 1800, pan: -0.4 });
      }
      if (s === 8 && R() < 0.4) note('psaltery', t, pickR(R, [ch[3], ch[4]]) + 12, { dur: 4, vol: 0.07, atk: 1.6, rel: 2.5, verb: 1.6, pan: R() - 0.5 });
      if (s === 4 && R() < 0.15) perc('cymBow', t, { vol: 0.07, rel: 2, verb: 1.4, rate: 0.7 });
      if (s % 4 === 2 && R() < 0.1) note('harp', t, ch[2 + Math.floor(R() * 3)], { vol: 0.12, verb: 1.3, pan: R() - 0.5 });
    },
  },
  // The ossuary: contrabass and cello clusters, a heartbeat, violins trembling high above, choir moaning.
  catacombs: {
    stepDur: 0.55, gain: 2.1,
    step(i, t) {
      const R = MUS.rng, s = i % 16, ph = Math.floor(i / 32);
      const root = [26, 26, 25, 27][ph % 4];
      if (i % 32 === 0) {
        note('bass', t, root + 12, { dur: 32 * this.stepDur, vol: 0.22, atk: 3, rel: 4, verb: 0.8 });
        chord('cello', t + 1, [root + 24, root + 25], { dur: 30 * this.stepDur, vol: 0.09, atk: 5, rel: 4, verb: 1, lp: 1200, width: 0.5 });
      }
      if (i % 2 === 0 && (i % 16) < 6) { perc('frame', t, { vol: 0.28, rate: 0.6, verb: 0.6, lp: 900 }); perc('frame', t + 0.24, { vol: 0.16, rate: 0.55, verb: 0.6, lp: 700 }); }
      if (s === 8 && R() < 0.3) note('violinTrem', t, pickR(R, [74, 75, 77, 80]), { dur: 5, vol: 0.05, atk: 2.5, rel: 2.5, verb: 1.5, pan: R() * 1.2 - 0.6 });
      if (s === 0 && R() < 0.25) note('choirOo', t, pickR(R, [50, 51, 55]), { dur: 6, vol: 0.1, atk: 2.5, rel: 3, verb: 1.4, pan: R() - 0.5 });
      if (s === 12 && R() < 0.12) perc('gongScrape', t, { vol: 0.09, rel: 2, verb: 1.3, rate: 0.75 });
      if (s % 4 === 0 && R() < 0.12) note('bell', t, pickR(R, [61, 63, 66]), { vol: 0.06, verb: 1.6, lp: 3000, pan: R() - 0.5, rate: 0.993 });
    },
  },
  // The Hollow Deep: didgeridoo drone, tribal drums, a horn calling far away.
  caves: {
    stepDur: 0.38, gain: 2.0,
    pat: [1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1],
    step(i, t) {
      const R = MUS.rng, s = i % 16, bar = Math.floor(i / 16);
      if (i % 64 === 0) { note('didge', t, 37, { dur: 64 * this.stepDur, vol: 0.2, atk: 3, rel: 4, verb: 0.9, lp: 1500 }); note('bass', t, 33, { dur: 64 * this.stepDur, vol: 0.15, atk: 4, rel: 4, verb: 0.8 }); }
      if (bar >= 2 && this.pat[s] && R() < 0.85) perc(s === 0 ? 'timpSoft' : 'tom', t, { vol: s === 0 ? 0.32 : 0.16 + R() * 0.06, rate: s === 0 ? 0.8 : 0.7 + R() * 0.15, verb: 0.7, pan: (R() - 0.5) * 0.6, lp: 2500 });
      if (bar >= 4 && s === 0 && R() < 0.3) { const ph = [45, 48, 50, 52, 53]; let tt = t + 0.5; for (let k = 0; k < 3; k++) { const d = this.stepDur * (R() < 0.5 ? 3 : 5); note('horn', tt, pickR(R, ph), { dur: d, vol: 0.09, atk: 0.5, rel: 1.5, verb: 1.6, pan: -0.5, lp: 1800 }); tt += d + 0.2; } }
      if (s === 8 && R() < 0.2) note('psaltery', t, pickR(R, [69, 70, 74]), { dur: 3, vol: 0.05, atk: 1.2, rel: 2, verb: 1.6, pan: 0.5 });
    },
  },
  // The Burning Abyss: low brass in dissonant swells, timpani rolls, gong, a choir screaming in slow motion.
  abyss: {
    stepDur: 0.42, gain: 2.0,
    prog: [['Dm', 'Eb'], ['Bb', 'A'], ['Dm', 'Gb'], ['Gm', 'A']],
    step(i, t) {
      const R = MUS.rng, s = i % 16, bar = Math.floor(i / 16), half = Math.floor(s / 8);
      const ch = CH[this.prog[bar % 4][half]];
      if (s % 8 === 0) {
        chord('trombone', t, [ch[0] - (ch[0] > 36 ? 12 : 0) + 12, ch[1], ch[2]], { dur: 2.6, vol: 0.13, atk: 0.35, rel: 1.4, verb: 1, lp: 2200 });
        note('tuba', t, ch[0] - (ch[0] > 36 ? 12 : 0), { dur: 3, vol: 0.18, atk: 0.3, rel: 1.5, verb: 0.8 });
        if (bar % 2 === 1) chord('choir', t, [ch[2], ch[3]], { dur: 3.2, vol: 0.12, atk: 1, rel: 2, verb: 1.3 });
      }
      if (s === 0 && bar % 4 === 0) perc('gong', t, { vol: 0.2, rel: 3, verb: 1.2, rate: 0.85 });
      if (s === 12 && R() < 0.4) perc('timpRoll', t, { vol: 0.14, atk: 0.8, rel: 0.8, dur: 1.4, verb: 0.9 });
      if ([0, 6, 10].includes(s)) perc('timp', t, { vol: s === 0 ? 0.3 : 0.16, rate: 0.75, verb: 0.8, lp: 1800 });
      if (s === 4 && R() < 0.3) note('celloTrem', t, ch[1] + 1, { dur: 2.5, vol: 0.07, atk: 1, rel: 1.5, verb: 1.2 });
    },
  },
  // Boss: driving timpani ostinato, tremolo strings, brass stabs, gong.
  boss: {
    stepDur: 0.3, gain: 2.7,
    step(i, t) {
      const R = MUS.rng, s = i % 16, bar = Math.floor(i / 16);
      const prog = ['Dm', 'Eb', 'Dm', 'A', 'Gm', 'Eb', 'Bb', 'A'], ch = CH[prog[bar % 8]];
      if (s === 0) {
        chord('celloTrem', t, [ch[0] + 12, ch[1]], { dur: 16 * this.stepDur, vol: 0.12, atk: 0.3, rel: 0.8, verb: 0.7 });
        chord('violinTrem', t, [ch[3], ch[4]], { dur: 16 * this.stepDur, vol: 0.07, atk: 0.4, rel: 0.8, verb: 0.9 });
        note('tuba', t, ch[0] - (ch[0] > 36 ? 12 : 0), { dur: 1.2, vol: 0.2, atk: 0.05, rel: 0.6, verb: 0.6 });
        if (bar % 2 === 0) chord('choir', t, [ch[2], ch[3]], { dur: 4, vol: 0.12, atk: 0.8, rel: 1.5, verb: 1.2 });
        if (bar % 4 === 0) perc('gong', t, { vol: 0.24, rel: 3, verb: 1, rate: 0.9 });
      }
      if ([0, 3, 6, 8, 10, 12, 14].includes(s)) perc(s % 8 === 0 ? 'timp' : 'tom', t, { vol: s % 8 === 0 ? 0.34 : 0.2, rate: s % 8 === 0 ? 0.8 : 0.75 + (s % 3) * 0.04, verb: 0.5, lp: 3000, pan: (R() - 0.5) * 0.4 });
      if (s === 4 || s === 12) chord('horn', t, [ch[1], ch[2]], { dur: 0.5, vol: 0.12, atk: 0.03, rel: 0.4, verb: 0.9 });
    },
  },
};
// combat layer (dungeon pieces): tremolo cluster + timpani pulse, scaled by intensity
function combatStep(i, t, intensity) {
  if (intensity < 0.06) return;
  const s = i % 8;
  if (s % 2 === 0) perc(s === 0 ? 'timp' : 'tom', t, { vol: (s === 0 ? 0.26 : 0.13) * intensity, rate: 0.72, verb: 0.6, lp: 2000, pan: (s - 4) * 0.08 });
  if (s === 0 && Math.floor(i / 8) % 2 === 0) chord('celloTrem', t, [38, 39], { dur: 3, vol: 0.1 * intensity, atk: 0.5, rel: 1, verb: 0.8 });
}

function initMusic() {
  if (!Audio2.ready) return;
  MUS.timer = setInterval(musicTick, 50);
}
function setMusic(name) {
  if (!Audio2.ready || MUS.pieceName === name) return;
  const ctx = Audio2.ctx, now = ctx.currentTime;
  if (MUS.out) {
    const old = MUS.out, oldV = MUS.verb;
    old.gain.cancelScheduledValues(now); old.gain.setValueAtTime(old.gain.value, now); old.gain.linearRampToValueAtTime(0.0001, now + 3);
    oldV.gain.cancelScheduledValues(now); oldV.gain.setValueAtTime(oldV.gain.value, now); oldV.gain.linearRampToValueAtTime(0.0001, now + 3);
    setTimeout(() => { try { old.disconnect(); oldV.disconnect(); } catch (e) { } }, 9000);
  }
  MUS.out = ctx.createGain(); MUS.out.gain.setValueAtTime(0.0001, now); MUS.out.gain.linearRampToValueAtTime(PIECES[name].gain || 1, now + 3); MUS.out.connect(Audio2.musicDuck);
  MUS.verb = ctx.createGain(); MUS.verb.gain.value = 0.6 * (PIECES[name].gain || 1); MUS.verb.connect(Audio2.musicVerbSend);
  MUS.pieceName = name; MUS.piece = PIECES[name]; MUS.step = 0; MUS.nextT = now + 0.8;
}
function musicTick() {
  if (!Audio2.ready || !MUS.piece || !Audio2.banks.inst || Audio2.ctx.state !== 'running') return;
  const ctx = Audio2.ctx;
  if (MUS.nextT < ctx.currentTime - 0.5) MUS.nextT = ctx.currentTime + 0.05;  // after a stall (tab hidden)
  MUS.intensity += (MUS.target - MUS.intensity) * 0.04;
  while (MUS.nextT < ctx.currentTime + 0.4) {
    try {
      MUS.piece.step(MUS.step, MUS.nextT);
      if (MUS.pieceName !== 'town' && MUS.pieceName !== 'boss' && MUS.step % 2 === 0) combatStep(MUS.step / 2, MUS.nextT, MUS.intensity);
    } catch (e) { console.warn('music', e); }
    MUS.nextT += MUS.piece.stepDur; MUS.step++;
  }
}

