'use strict';
// Renderer: baked sprite atlases → G-buffer → real-time lights, haze, bloom and a gritty post pass.
const GFX = (() => {
  const W = RES_W, H = RES_H, PPM = 64, D0 = 30, DR = 60;
  const CD = [-0.61237244, -0.5, -0.61237244], CR = [0.70710678, 0, -0.70710678], CU = [-0.35355339, 0.8660254, -0.35355339];
  let gl, cv;
  const P = {};
  const S = {
    cam: [0, 0, 0], camRaw: [0, 0, 0], lights: [], sheets: {}, queue: [], decalQ: [], parts: [], puffs: [], flames: [], glows: [], trails: [],
    amb: [0.03, 0.03, 0.04], sun: [0, 0, 0], sunDir: [0.4, 0.8, 0.3], fog: 0.0022, fogTop: 3.2, fogCol: [0, 0, 0], mist: 1, grime: 1, wet: 0,
    expo: 0.85, sat: 0.7, grain: 0.05, dither: 52, vig: 0.85, tint: [1, 1, 1], lift: [0, 0, 0], gain: [1.07, 1.0, 0.8], fade: 1, shake: 0, haze: [],
    cut: null, chars: [], emis: 1, occ: null, decalRect: [0, 0, 64, 0], stats: {}, v2: 0, bloom: 0.45, sharp: 0.5,
  };
  // ---------------------------------------------------------------- GL helpers
  function prog(vs, fs) {
    const mk = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o) + '\n' + s.split('\n').slice(0, 5).join('\n')); return o; };
    const p = gl.createProgram(); gl.attachShader(p, mk(gl.VERTEX_SHADER, vs)); gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs));
    ['aP', 'aC', 'iPos', 'iRect', 'iOff', 'iMisc', 'iTint'].forEach((n, i) => gl.bindAttribLocation(p, i, n));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const u = {}; const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) { const info = gl.getActiveUniform(p, i); u[info.name.replace(/\[0\]$/, '')] = gl.getUniformLocation(p, info.name); }
    return { p, u };
  }
  function tex(w, h, internal, format, type, filter, data) {
    const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, format, type, data || null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }
  function fbo(colors, depth) {
    const f = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, f);
    colors.forEach((t, i) => gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + i, gl.TEXTURE_2D, t, 0));
    if (depth) gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, depth, 0);
    gl.drawBuffers(colors.map((_, i) => gl.COLOR_ATTACHMENT0 + i));
    const st = gl.checkFramebufferStatus(gl.FRAMEBUFFER); if (st !== gl.FRAMEBUFFER_COMPLETE) throw new Error('framebuffer incomplete ' + st);
    return f;
  }
  function bindTex(u, name, t, unit) { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t); gl.uniform1i(u[name], unit); }
  // images: plain <img> (fetch is blocked in some sandboxes; file:// needs --allow-file-access-from-files)
  function loadImage(src) {
    return new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error('could not load ' + src)); im.src = src; });
  }
  function imgTex(im, rgba) {
    const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    const fmt = rgba === 'rg' ? [gl.RG8, gl.RG] : rgba ? [gl.RGBA8, gl.RGBA] : [gl.RGB8, gl.RGB];
    gl.texImage2D(gl.TEXTURE_2D, 0, fmt[0], im.naturalWidth, im.naturalHeight, 0, fmt[1], gl.UNSIGNED_BYTE, im);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }
  // ---------------------------------------------------------------- targets
  let quadVAO, instVAO, instBuf, partVAO, partBuf, trailVAO, trailBuf;
  let G0, G1, G2, depthTex, gbFB, sceneTex, sceneFB, sceneFB0, ATMO, BL, DECAL, occTex, gritTex, vistaTex;
  const INST_F = 20, MAXI = 8192;
  const instData = new Float32Array(MAXI * INST_F);
  const partData = new Float32Array(4096 * 8);
  function init(canvas) {
    cv = canvas;
    gl = cv.getContext('webgl2', { antialias: false, alpha: false, depth: false, premultipliedAlpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: false });
    if (!gl) throw new Error('WebGL 2 is not available');
    const HDR = !!gl.getExtension('EXT_color_buffer_float') || !!gl.getExtension('EXT_color_buffer_half_float');
    gl.getExtension('OES_texture_float_linear');
    P.gb = prog(GB_VS, GB_FS); P.light = prog(QUAD_VS, LIGHT_FS); P.fl = prog(FLAME_VS, FLAME_FS); P.part = prog(PART_VS, PART_FS);
    P.trail = prog(TRAIL_VS, TRAIL_FS); P.decal = prog(DECAL_VS, DECAL_FS); P.atmo = prog(QUAD_VS, ATMO_FS);
    P.bright = prog(QUAD_VS, BRIGHT_FS); P.blur = prog(QUAD_VS, BLUR_FS); P.post = prog(QUAD_VS, POST_FS);
    const qb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, qb); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
    quadVAO = gl.createVertexArray(); gl.bindVertexArray(quadVAO); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    instVAO = gl.createVertexArray(); gl.bindVertexArray(instVAO);
    gl.bindBuffer(gl.ARRAY_BUFFER, qb); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    instBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, instBuf); gl.bufferData(gl.ARRAY_BUFFER, instData.byteLength, gl.DYNAMIC_DRAW);
    for (let i = 0; i < 5; i++) { gl.enableVertexAttribArray(2 + i); gl.vertexAttribPointer(2 + i, 4, gl.FLOAT, false, INST_F * 4, i * 16); gl.vertexAttribDivisor(2 + i, 1); }
    partVAO = gl.createVertexArray(); gl.bindVertexArray(partVAO); partBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, partBuf);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 32, 0); gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 32, 16);
    trailVAO = gl.createVertexArray(); gl.bindVertexArray(trailVAO); trailBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, trailBuf);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 32, 0); gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 32, 16);
    gl.bindVertexArray(null);
    const FMT = HDR ? [gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT] : [gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE];
    G0 = tex(W, H, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, gl.NEAREST); G1 = tex(W, H, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, gl.NEAREST); G2 = tex(W, H, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, gl.NEAREST);
    depthTex = tex(W, H, gl.DEPTH_COMPONENT24, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, gl.NEAREST);
    gbFB = fbo([G0, G1, G2], depthTex);
    sceneTex = tex(W, H, FMT[0], FMT[1], FMT[2], gl.LINEAR); sceneFB = fbo([sceneTex], depthTex); sceneFB0 = fbo([sceneTex]);
    const mkT = (w, h) => { const t = tex(w, h, FMT[0], FMT[1], FMT[2], gl.LINEAR); return { t, f: fbo([t]), w, h }; };
    ATMO = mkT(W, H); BL = [mkT(320, 200), mkT(320, 200), mkT(160, 100), mkT(160, 100)];
    DECAL = (() => { const t = tex(2048, 2048, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, gl.LINEAR); return { t, f: fbo([t]) }; })();
    occTex = tex(4, 4, gl.R8, gl.RED, gl.UNSIGNED_BYTE, gl.LINEAR, new Uint8Array(16));
    vistaTex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, vistaTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB8, 1, 1, 0, gl.RGB, gl.UNSIGNED_BYTE, new Uint8Array([20, 18, 18]));
    loadImage('assets/vista.webp').then(im => {
      gl.bindTexture(gl.TEXTURE_2D, vistaTex);
      gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB8, gl.RGB, gl.UNSIGNED_BYTE, im);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.MIRRORED_REPEAT); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    }).catch(() => { });
    // world-space surface detail (assets/grit.webp); a flat grey until it has loaded
    gritTex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, gritTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB8, 1, 1, 0, gl.RGB, gl.UNSIGNED_BYTE, new Uint8Array([128, 128, 128]));
    loadImage('assets/grit.webp').then(im => {
      gl.bindTexture(gl.TEXTURE_2D, gritTex);
      gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB8, gl.RGB, gl.UNSIGNED_BYTE, im); gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    }).catch(() => { });
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return gl;
  }
  // ---------------------------------------------------------------- sheets (atlases)
  async function loadSheet(name, base, meta) {
    if (S.sheets[name]) return S.sheets[name];
    const [a, b, m] = await Promise.all(['_alb', '_nrm', '_mat'].map(s => loadImage(base + name + s + '.webp')));
    const sh = { name, meta, a: imgTex(a), b: imgTex(b), m: imgTex(m, meta.fmt !== 'char' ? true : 'rg'), char: meta.fmt === 'char' ? 1 : meta.fmt === 'layer' ? 2 : 0, id: Object.keys(S.sheets).length };
    S.sheets[name] = sh;
    return sh;
  }
  function freeSheet(name) { const s = S.sheets[name]; if (!s) return; [s.a, s.b, s.m].forEach(t => gl.deleteTexture(t)); delete S.sheets[name]; }
  // queue one baked frame. o: { flash, cut (cutaway-able), alpha, tint [r,g,b], emis, y }
  function sprite(sheet, anim, dir, f, x, y, z, o) {
    const A = sheet.meta.anims[anim]; if (!A) return;
    const fr = A.frames[dir % A.frames.length][Math.min(f, A.n - 1)]; if (!fr) return;
    S.queue.push([sheet, x, y, z, A.dr, fr, A.anchor, o]);
  }
  // ---------------------------------------------------------------- level data
  function setOccluders(w, h, perM, data, x0 = 0, z0 = 0) {
    gl.bindTexture(gl.TEXTURE_2D, occTex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, w * perM, h * perM, 0, gl.RED, gl.UNSIGNED_BYTE, data);
    S.occ = [x0, z0, perM, w * perM];
  }
  function clearDecals(x0, z0, size) {
    S.decalRect = [x0, z0, size, 0];
    gl.bindFramebuffer(gl.FRAMEBUFFER, DECAL.f); gl.viewport(0, 0, 2048, 2048); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
  }
  function decal(x, z, r, col, shape = 0) { S.decalQ.push([x, z, r, col, shape]); }
  function flushDecals() {
    if (!S.decalQ.length) return;
    gl.bindFramebuffer(gl.FRAMEBUFFER, DECAL.f); gl.viewport(0, 0, 2048, 2048);
    gl.disable(gl.DEPTH_TEST); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
    gl.useProgram(P.decal.p); gl.bindVertexArray(quadVAO);
    const [x0, z0, sz] = S.decalRect;
    for (const [x, z, r, c, shape] of S.decalQ) {
      gl.uniform4f(P.decal.u.uRect, (x - x0) / sz, (z - z0) / sz, r * 2 / sz, r * 2 / sz);
      gl.uniform4f(P.decal.u.uCol, c[0], c[1], c[2], c[3]); gl.uniform1f(P.decal.u.uSeed, Math.random() * 10); gl.uniform1f(P.decal.u.uShape, shape);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    S.decalQ.length = 0; gl.disable(gl.BLEND);
  }
  // ---------------------------------------------------------------- projection helpers (CPU)
  function toScreen(x, y, z) { const a = x - S.cam[0], b = y - S.cam[1], c = z - S.cam[2]; return [W / 2 + (a * CR[0] + c * CR[2]) * PPM, H / 2 - (a * CU[0] + b * CU[1] + c * CU[2]) * PPM]; }
  function screenToFloor(sx, sy, fy = 0) {
    const ox = (sx - W / 2) / PPM, oy = (H / 2 - sy) / PPM;
    const b = [S.cam[0] + CR[0] * ox + CU[0] * oy - CD[0] * D0, S.cam[1] + CU[1] * oy - CD[1] * D0, S.cam[2] + CR[2] * ox + CU[2] * oy - CD[2] * D0];
    const t = (fy - b[1]) / CD[1];
    return [b[0] + CD[0] * t, b[2] + CD[2] * t];
  }
  function tOf(x, y, z) { return D0 + (x - S.cam[0]) * CD[0] + (y - S.cam[1]) * CD[1] + (z - S.cam[2]) * CD[2]; }
  // camera: snap so that world-space pixel grid stays fixed (no shimmering)
  function setCamera(x, y, z) {
    S.camRaw = [x, y, z];
    const sx = (x * CR[0] + z * CR[2]) * PPM, sy = (x * CU[0] + y * CU[1] + z * CU[2]) * PPM;
    const dx = (Math.round(sx) - sx) / PPM, dy = (Math.round(sy) - sy) / PPM;
    S.cam = [x + CR[0] * dx + CU[0] * dy, y + CU[1] * dy, z + CR[2] * dx + CU[2] * dy];
  }
  function onScreen(x, y, z, m = 120) { const [sx, sy] = toScreen(x, y, z); return sx > -m && sx < W + m && sy > -m && sy < H + m * 2; }
  // ---------------------------------------------------------------- lights
  // fire flicker: layered value noise (never a visible period) with the odd gutter, when the flame ducks and recovers
  const hsh = n => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
  const vn = x => { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return hsh(i) * (1 - u) + hsh(i + 1) * u; };
  const flick = (t, k) => {
    const a = vn(t * 4.1 + k * 13.7) * 0.5 + vn(t * 9.3 + k * 7.1) * 0.3 + vn(t * 21.0 + k * 3.3) * 0.2;
    const gut = Math.max(0, vn(t * 0.55 + k * 5.9) - 0.72) * 2.4;
    return 1 + (a - 0.5) * 0.55 - gut * 0.4;
  };
  const LU = new Float32Array(NLIGHT_N() * 4), LC = new Float32Array(NLIGHT_N() * 4);
  function NLIGHT_N() { return 24; }
  let nl = 0;
  function pickLights(t) {
    // the nearest (and brightest) lights around the camera; the first few cast grid shadows
    const cx = S.camRaw[0], cz = S.camRaw[2];
    const cand = [];
    for (const l of S.lights) {
      if (!l.i) continue;
      const d = Math.hypot(l.p[0] - cx, l.p[2] - cz) - l.r;
      if (d > 13) continue;
      cand.push([d - (l.pri || 0) * 3, l]);
    }
    cand.sort((a, b) => a[0] - b[0]);
    nl = Math.min(cand.length, NLIGHT_N());
    let shadows = 0;
    for (let i = 0; i < nl; i++) {
      const l = cand[i][1];
      const k = l.f ? 1 + (flick(t, l.seed || i) - 1) * l.f : 1;
      LU.set([l.p[0], l.p[1], l.p[2], l.r], i * 4);
      const sh = l.shadow === false ? -1 : (shadows < (S.quality.shadows) && l.i > 1.5 ? (shadows++, 1) : 0);
      LC.set([l.c[0] * l.i * k, l.c[1] * l.i * k, l.c[2] * l.i * k, l.noChar ? -1 : sh], i * 4);
    }
  }
  S.quality = { shadows: 6 };
  function setLightU(u) { gl.uniform4fv(u.uL, LU); gl.uniform4fv(u.uLc, LC); gl.uniform1i(u.uNL, nl); }
  // ---------------------------------------------------------------- frame
  function render(t) {
    const st = S.stats; st.inst = 0; st.draws = 0;
    pickLights(t);
    flushDecals();
    // G-buffer
    gl.bindFramebuffer(gl.FRAMEBUFFER, gbFB); gl.viewport(0, 0, W, H);
    gl.disable(gl.BLEND); gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LESS); gl.depthMask(true);
    gl.clearBufferfv(gl.COLOR, 0, [0, 0, 0, 1]); gl.clearBufferfv(gl.COLOR, 1, [0.5, 1, 0.5, 0]); gl.clearBufferfv(gl.COLOR, 2, [0, 0, 0, 0]); gl.clearBufferfi(gl.DEPTH_STENCIL, 0, 1, 0);
    const p = P.gb; gl.useProgram(p.p);
    gl.uniform3f(p.u.uCam, S.cam[0], S.cam[1], S.cam[2]); gl.uniform1f(p.u.uTime, t);
    if (S.cut) { const [sx, sy] = toScreen(S.cut[0], S.cut[1], S.cut[2]); gl.uniform4f(p.u.uCut, sx, sy, S.cut[3], tOf(S.cut[0], S.cut[1] - 0.6, S.cut[2])); } else gl.uniform4f(p.u.uCut, 0, 0, 0, 0);
    gl.bindVertexArray(instVAO);
    S.queue.sort((a, b) => a[0].id - b[0].id);
    let i = 0;
    while (i < S.queue.length) {
      const sh = S.queue[i][0];
      let n = 0;
      for (; i < S.queue.length && S.queue[i][0] === sh && n < MAXI; i++, n++) {
        const [, x, y, z, dr, fr, an, o] = S.queue[i];
        const tint = (o && o.tint) || [1, 1, 1];
        instData.set([x, y, z, dr, fr[0], fr[1], fr[2], fr[3], fr[4], fr[5], an[0], an[1], o ? (o.flash || 0) : 0, o && o.cut ? 1 : 0, o && o.alpha !== undefined ? o.alpha : 1, o && o.scale ? o.scale : 1, tint[0], tint[1], tint[2], o ? (o.emis || 0) : 0], n * INST_F);
      }
      bindTex(p.u, 'tA', sh.a, 0); bindTex(p.u, 'tB', sh.b, 1); bindTex(p.u, 'tM', sh.m, 2); gl.uniform1f(p.u.uChar, sh.char || 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, instBuf); gl.bufferSubData(gl.ARRAY_BUFFER, 0, instData, 0, n * INST_F);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, n);
      st.inst += n; st.draws++;
    }
    S.queue.length = 0;
    // lighting
    gl.bindFramebuffer(gl.FRAMEBUFFER, sceneFB0); gl.disable(gl.DEPTH_TEST); gl.depthMask(false);
    const L = P.light; gl.useProgram(L.p); gl.bindVertexArray(quadVAO);
    gl.uniform3f(L.u.uCam, S.cam[0], S.cam[1], S.cam[2]);
    bindTex(L.u, 'tG0', G0, 0); bindTex(L.u, 'tG1', G1, 1); bindTex(L.u, 'tG2', G2, 2); bindTex(L.u, 'tDepth', depthTex, 3); bindTex(L.u, 'tOcc', occTex, 4); bindTex(L.u, 'tDecal', DECAL.t, 5); bindTex(L.u, 'tGrit', gritTex, 6); gl.uniform1f(L.u.uV2, S.v2);
    const o = S.occ || [0, 0, 1, 4]; gl.uniform4f(L.u.uOccRect, o[0], o[1], o[2], o[3]);
    gl.uniform4f(L.u.uDecalRect, S.decalRect[0], S.decalRect[1], S.decalRect[2], 0);
    setLightU(L.u);
    const CH = new Float32Array(32); S.chars.slice(0, 8).forEach((c, k) => CH.set(c, k * 4)); gl.uniform4fv(L.u.uCh, CH);
    gl.uniform3fv(L.u.uAmb, S.amb); gl.uniform3fv(L.u.uSun, S.sun); { const d = S.sunDir, l = Math.hypot(...d); gl.uniform3f(L.u.uSunDir, d[0] / l, d[1] / l, d[2] / l); }
    gl.uniform1f(L.u.uTime, t); gl.uniform1f(L.u.uEmis, S.emis * (0.85 + 0.2 * flick(t * 0.7, 3) - 0.2)); gl.uniform1f(L.u.uGrime, S.grime); gl.uniform1f(L.u.uWet, S.wet); const F = S.fill || [0, 0, 0, 0], FC = S.fillC || [0, 0, 0]; gl.uniform4f(L.u.uFill, F[0], F[1], F[2], F[3]); gl.uniform3f(L.u.uFillC, FC[0], FC[1], FC[2]);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    // forward effects, depth-tested against the G-buffer
    gl.bindFramebuffer(gl.FRAMEBUFFER, sceneFB); gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LESS); gl.depthMask(false); gl.enable(gl.BLEND);
    drawPuffs(); drawFlames(t); drawParts(); drawTrails(t);
    gl.disable(gl.BLEND); gl.disable(gl.DEPTH_TEST); gl.depthMask(true);
    const pass = (prg, target, fn) => { gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.f : null); if (target) gl.viewport(0, 0, target.w, target.h); gl.useProgram(prg.p); fn(prg.u); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); };
    gl.bindVertexArray(quadVAO);
    pass(P.atmo, ATMO, u => { gl.uniform3f(u.uCam, S.cam[0], S.cam[1], S.cam[2]); bindTex(u, 'tS', sceneTex, 0); bindTex(u, 'tDepth', depthTex, 1); setLightU(u); gl.uniform1f(u.uTime, t); gl.uniform1f(u.uFog, S.fog); gl.uniform1f(u.uMist, S.mist); gl.uniform1f(u.uFogTop, S.fogTop); gl.uniform3fv(u.uFogCol, S.fogCol); gl.uniform1f(u.uV2, S.v2); bindTex(u, 'tVista', vistaTex, 2); gl.uniform4fv(u.uVista, S.vista || [0, 0, 0, 0]); });
    pass(P.bright, BL[0], u => { bindTex(u, 'tS', ATMO.t, 0); gl.uniform2f(u.uTexel, 1 / W, 1 / H); });
    pass(P.blur, BL[1], u => { bindTex(u, 'tS', BL[0].t, 0); gl.uniform2f(u.uDir, 1.5 / 320, 0); });
    pass(P.blur, BL[0], u => { bindTex(u, 'tS', BL[1].t, 0); gl.uniform2f(u.uDir, 0, 1.5 / 200); });
    pass(P.bright, BL[2], u => { bindTex(u, 'tS', BL[0].t, 0); gl.uniform2f(u.uTexel, 1 / 320, 1 / 200); });
    pass(P.blur, BL[3], u => { bindTex(u, 'tS', BL[2].t, 0); gl.uniform2f(u.uDir, 1.5 / 160, 0); });
    pass(P.blur, BL[2], u => { bindTex(u, 'tS', BL[3].t, 0); gl.uniform2f(u.uDir, 0, 1.5 / 100); });
    const cw = cv.width, ch = cv.height, s = Math.min(cw / W, ch / H), vw = Math.round(W * s), vh = Math.round(H * s);
    S.view = { x: (cw - vw) >> 1, y: (ch - vh) >> 1, w: vw, h: vh };
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, cw, ch); gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.viewport(S.view.x, S.view.y, vw, vh);
    const U = P.post.u; gl.useProgram(P.post.p);
    bindTex(U, 'tS', ATMO.t, 0); bindTex(U, 'tB1', BL[0].t, 1); bindTex(U, 'tB2', BL[2].t, 2);
    const hz = new Float32Array(16); S.haze.slice(0, 4).forEach((h, k) => hz.set(h, k * 4)); gl.uniform4fv(U.uHaze, hz);
    gl.uniform1f(U.uTime, t); gl.uniform1f(U.uExpo, S.expo); gl.uniform1f(U.uSat, S.sat); gl.uniform1f(U.uGrain, S.grain); gl.uniform1f(U.uDither, S.dither); gl.uniform1f(U.uVig, S.vig); gl.uniform1f(U.uBloom, S.bloom); gl.uniform1f(U.uSharp, S.sharp); gl.uniform1f(U.uV2, S.v2);
    gl.uniform2f(U.uShake, (Math.random() - 0.5) * S.shake / W, (Math.random() - 0.5) * S.shake / H); gl.uniform2f(U.uRes, vw, vh);
    gl.uniform3fv(U.uTint, S.tint); gl.uniform3fv(U.uLift, S.lift); gl.uniform3fv(U.uGain, S.gain); gl.uniform1f(U.uFade, S.fade);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    S.chars.length = 0;
  }
  // ---------------------------------------------------------------- forward FX
  // puffs: alpha-blended, lit on the CPU (smoke, blood droplets, bone shards, dust)
  function lightAt(x, y, z) {
    const c = [S.amb[0] + 0.01, S.amb[1] + 0.01, S.amb[2] + 0.012];
    for (let i = 0; i < nl; i++) { const lx = LU[i * 4], ly = LU[i * 4 + 1], lz = LU[i * 4 + 2], r = LU[i * 4 + 3]; const d = Math.hypot(x - lx, y - ly, z - lz); if (d > r) continue; const k = Math.max(0, 1 - d * d / (r * r)); const a = k * k / (1 + d * d * 0.35); c[0] += LC[i * 4] * a; c[1] += LC[i * 4 + 1] * a; c[2] += LC[i * 4 + 2] * a; }
    if (S.sun[0] + S.sun[1] + S.sun[2] > 0) { c[0] += S.sun[0] * 0.5; c[1] += S.sun[1] * 0.5; c[2] += S.sun[2] * 0.5; }
    return c;
  }
  function drawPuffs() {
    if (!S.puffs.length) return;
    let n = 0;
    for (const p of S.puffs) {
      if (n >= 4096) break;
      const L = lightAt(p.x, p.y, p.z), fade = Math.min(1, p.life / p.max * 3) * Math.min(1, (p.max - p.life) * 6 + (p.smoke ? 0 : 1));
      const mx = Math.max(L[0], L[1], L[2]), k = (p.shard ? 1.1 : 0.55) / (1 + mx * 0.6) + (p.glow || 0);
      partData.set([p.x, p.y, p.z, p.size, p.col[0] * L[0] * k + (p.emit ? p.emit[0] : 0), p.col[1] * L[1] * k + (p.emit ? p.emit[1] : 0), p.col[2] * L[2] * k + (p.emit ? p.emit[2] : 0), p.a * fade], n * 8); n++;
    }
    gl.blendFuncSeparate(gl.ONE, gl.ONE_MINUS_SRC_ALPHA, gl.ZERO, gl.ONE);
    gl.useProgram(P.part.p); gl.uniform3f(P.part.u.uCam, S.cam[0], S.cam[1], S.cam[2]); gl.uniform1f(P.part.u.uAlphaMode, 1);
    gl.bindVertexArray(partVAO); gl.bindBuffer(gl.ARRAY_BUFFER, partBuf); gl.bufferData(gl.ARRAY_BUFFER, partData.subarray(0, n * 8), gl.DYNAMIC_DRAW);
    gl.drawArrays(gl.POINTS, 0, n);
  }
  function drawParts() {
    if (!S.parts.length) return;
    let n = 0;
    for (const p of S.parts) { if (n >= 4096) break; const a = Math.min(1, p.life / p.max * 2); const c = p.col; partData.set([p.x, p.y, p.z, p.size, c[0] * a, c[1] * a, c[2] * a, 0], n * 8); n++; }
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.useProgram(P.part.p); gl.uniform3f(P.part.u.uCam, S.cam[0], S.cam[1], S.cam[2]); gl.uniform1f(P.part.u.uAlphaMode, 0);
    gl.bindVertexArray(partVAO); gl.bindBuffer(gl.ARRAY_BUFFER, partBuf); gl.bufferData(gl.ARRAY_BUFFER, partData.subarray(0, n * 8), gl.DYNAMIC_DRAW);
    gl.drawArrays(gl.POINTS, 0, n);
  }
  // flames: [x, y, z, w, h, gain, seed, glowW, glowH, glowGain, tintA, tintB]
  function drawFlames(t) {
    if (!S.flames.length && !S.glows.length) return;
    gl.blendFunc(gl.ONE, gl.ONE);
    const u = P.fl.u; gl.useProgram(P.fl.p); gl.bindVertexArray(quadVAO);
    gl.uniform3f(u.uCam, S.cam[0], S.cam[1], S.cam[2]); gl.uniform1f(u.uTime, t);
    for (const f of S.flames) {
      if (!onScreen(f.x, f.y, f.z)) continue;
      const k = 1 + (flick(t * (f.speed || 1), f.seed || 0) - 1) * (f.fl ?? 1);
      const ta = f.tintA || [1.0, 0.42, 0.08], tb = f.tintB || [0.6, 0.08, 0.01];
      gl.uniform3f(u.uW, f.x, f.y, f.z); gl.uniform1f(u.uSeed, f.seed || 0); gl.uniform3fv(u.uTintA, ta); gl.uniform3fv(u.uTintB, tb);
      const st = f.style || [1, 0.15, 2.6, 1]; gl.uniform4f(u.uStyle, st[0], st[1], st[2], st[3]);
      const s2 = f.style2 || [0, 1, 1, 1]; gl.uniform4f(u.uStyle2, s2[0], s2[1], k, s2[3]);
      if (f.glow !== 0) { gl.uniform1f(u.uMode, 1); gl.uniform2f(u.uSize, f.w * 4, f.h * 2.6); gl.uniform1f(u.uGain, (f.glow || 0.8) * k); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); }
      gl.uniform1f(u.uMode, 0); gl.uniform2f(u.uSize, f.w * (0.94 + 0.06 * k), f.h * (0.72 + 0.3 * k)); gl.uniform1f(u.uGain, (f.g || 1.6) * (0.55 + 0.45 * k)); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    for (const g of S.glows) {
      gl.uniform3f(u.uW, g.x, g.y, g.z); gl.uniform1f(u.uMode, 1); gl.uniform2f(u.uSize, g.w, g.h); gl.uniform1f(u.uGain, g.g); gl.uniform3fv(u.uTintA, g.c || [1, 0.45, 0.14]); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
  }
  // trails: [{pts: [[hx,hy,hz, tx,ty,tz, alpha], ...], col}]
  function drawTrails() {
    if (!S.trails.length) return;
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.useProgram(P.trail.p); gl.uniform3f(P.trail.u.uCam, S.cam[0], S.cam[1], S.cam[2]); gl.bindVertexArray(trailVAO); gl.bindBuffer(gl.ARRAY_BUFFER, trailBuf);
    for (const tr of S.trails) {
      const n = tr.pts.length; if (n < 2) continue;
      const v = new Float32Array(n * 16), c = tr.col;
      tr.pts.forEach((s, i) => v.set([s[0], s[1], s[2], s[6], 0, c[0], c[1], c[2], s[3], s[4], s[5], s[6], 1, c[0], c[1], c[2]], i * 16));
      gl.bufferData(gl.ARRAY_BUFFER, v, gl.DYNAMIC_DRAW);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, n * 2);
    }
    S.trails.length = 0;
  }
  return { S, init, loadSheet, freeSheet, sprite, render, setCamera, toScreen, screenToFloor, tOf, onScreen, setOccluders, clearDecals, decal, lightAt, flick, W, H, PPM, CD, CR, CU, get gl() { return gl; } };
})();
