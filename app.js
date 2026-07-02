// AZORA — front-end behaviour
//   1) Wing: strip white bg (canvas flood-fill) -> CSS fills the silhouette with rainbow
//   2) Scroll reveal
//   3) Sound: synthesize an electronic beat with high/low tempo sections and make the
//      wing + whole site react (beat pulses, palette swings on tempo change) — mirroring
//      the real sound-reactive LED product.
(function () {
  "use strict";
  var root = document.documentElement;
  var body = document.body;

  /* ============================================================ WING CUTOUT */
  function cutoutWing(img) {
    var w = img.naturalWidth, h = img.naturalHeight;
    if (!w || !h) return null;
    var canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    var ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0);
    var imgData;
    try { imgData = ctx.getImageData(0, 0, w, h); } catch (e) { return null; }
    var d = imgData.data, N = w * h, TH = 236;
    function isWhite(i) { var p = i << 2; return d[p] >= TH && d[p + 1] >= TH && d[p + 2] >= TH; }
    var seen = new Uint8Array(N), stack = new Int32Array(N), sp = 0;
    function seed(idx) { if (!seen[idx] && isWhite(idx)) { seen[idx] = 1; stack[sp++] = idx; } }
    var x, y;
    for (x = 0; x < w; x++) { seed(x); seed((h - 1) * w + x); }
    for (y = 0; y < h; y++) { seed(y * w); seed(y * w + w - 1); }
    while (sp > 0) {
      var idx = stack[--sp], ix = idx % w, iy = (idx - ix) / w;
      if (ix > 0) seed(idx - 1);
      if (ix < w - 1) seed(idx + 1);
      if (iy > 0) seed(idx - w);
      if (iy < h - 1) seed(idx + w);
    }
    for (var i = 0; i < N; i++) { if (seen[i]) d[(i << 2) + 3] = 0; }
    ctx.putImageData(imgData, 0, 0);
    try { return canvas.toDataURL("image/png"); } catch (e) { return null; }
  }

  function initWing() {
    var hang = document.querySelector(".wing-hang");
    if (!hang) return;
    var img = hang.querySelector("img"), rainbow = hang.querySelector(".wing-rainbow");
    if (!img) return;
    function run() {
      var url = cutoutWing(img);
      if (url) {
        img.src = url;
        if (rainbow) { rainbow.style.webkitMaskImage = "url(" + url + ")"; rainbow.style.maskImage = "url(" + url + ")"; }
      } else if (rainbow) {
        rainbow.style.display = "none";
        img.style.filter = "invert(1) brightness(2.3) saturate(1.15)";
        img.style.mixBlendMode = "screen";
      }
      hang.classList.add("ready");
    }
    if (img.complete && img.naturalWidth) run();
    else img.addEventListener("load", run, { once: true });
  }

  /* ============================================================ SCROLL REVEAL */
  function initReveal() {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } });
    }, { threshold: 0.14 });
    document.querySelectorAll(".reveal").forEach(function (el) { io.observe(el); });
  }

  /* ============================================================ SOUND ENGINE */
  var AudioCtx = window.AudioContext || window.webkitAudioContext;
  var actx = null, master = null, analyser = null, freq = null, noiseBuf = null;
  var playing = false, timerId = null, rafId = null;
  var nextNoteTime = 0, step16 = 0;
  var AHEAD = 0.12, LOOKAHEAD = 25; // seconds / ms

  // tempo map: alternating low & high sections (bars per section)
  var sections = [
    { bpm: 96,  bars: 4, name: "low"  },
    { bpm: 140, bars: 4, name: "high" },
    { bpm: 112, bars: 2, name: "low"  },
    { bpm: 152, bars: 4, name: "high" }
  ];
  var secIdx = 0, barsLeft = sections[0].bars, bpm = sections[0].bpm;
  var scale = [0, 3, 5, 7, 10];              // minor pentatonic
  var ROOT = 55;                              // A1
  function hz(semi) { return ROOT * Math.pow(2, semi / 12); }
  function noteLen() { return 60 / bpm / 4; } // 16th-note duration

  var siteHue = 0, flashHue = 320;

  function buildGraph() {
    master = actx.createGain(); master.gain.value = 0.0;
    var comp = actx.createDynamicsCompressor();
    analyser = actx.createAnalyser(); analyser.fftSize = 1024; analyser.smoothingTimeConstant = 0.75;
    freq = new Uint8Array(analyser.frequencyBinCount);
    master.connect(comp); comp.connect(analyser); analyser.connect(actx.destination);
    // fade in
    master.gain.setValueAtTime(0.0001, actx.currentTime);
    master.gain.exponentialRampToValueAtTime(0.65, actx.currentTime + 1.2);
    // noise buffer for drums
    var len = actx.sampleRate;
    noiseBuf = actx.createBuffer(1, len, actx.sampleRate);
    var data = noiseBuf.getChannelData(0);
    for (var i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  }

  function env(node, t, peak, dur, atk) {
    node.gain.setValueAtTime(0.0001, t);
    node.gain.exponentialRampToValueAtTime(peak, t + (atk || 0.005));
    node.gain.exponentialRampToValueAtTime(0.0008, t + dur);
  }
  function kick(t) {
    var o = actx.createOscillator(), g = actx.createGain();
    o.frequency.setValueAtTime(155, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    env(g, t, 1.0, 0.3, 0.004); o.connect(g).connect(master); o.start(t); o.stop(t + 0.32);
  }
  function snare(t) {
    var n = actx.createBufferSource(); n.buffer = noiseBuf;
    var hp = actx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 1400;
    var g = actx.createGain(); env(g, t, 0.5, 0.18, 0.004);
    n.connect(hp).connect(g).connect(master); n.start(t); n.stop(t + 0.2);
  }
  function hat(t, loud) {
    var n = actx.createBufferSource(); n.buffer = noiseBuf;
    var hp = actx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 7500;
    var g = actx.createGain(); env(g, t, loud ? 0.22 : 0.12, 0.05, 0.003);
    n.connect(hp).connect(g).connect(master); n.start(t); n.stop(t + 0.06);
  }
  function bass(t, f, dur) {
    var o = actx.createOscillator(); o.type = "sawtooth"; o.frequency.value = f;
    var lp = actx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 550;
    var g = actx.createGain(); env(g, t, 0.34, dur, 0.012);
    o.connect(lp).connect(g).connect(master); o.start(t); o.stop(t + dur + 0.03);
  }
  function lead(t, f, dur) {
    var o = actx.createOscillator(); o.type = "square"; o.frequency.value = f;
    var lp = actx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 2600;
    var g = actx.createGain(); env(g, t, 0.10, dur, 0.006);
    o.connect(lp).connect(g).connect(master); o.start(t); o.stop(t + dur + 0.03);
  }

  function scheduleStep(s, t) {
    var high = sections[secIdx].name === "high";
    if (s % 4 === 0) kick(t);
    if (high && (s === 10 || s === 14)) kick(t);       // extra kicks when fast
    if (s === 4 || s === 12) snare(t);
    if (s % 2 === 0) hat(t, s % 4 === 0);
    if (s % 2 === 0) bass(t, hz(scale[(s / 2 | 0) % scale.length]), noteLen() * 1.7);
    if (high && s % 2 === 0) lead(t, hz(scale[s % scale.length] + 12), noteLen() * 1.3);
  }

  function scheduler() {
    while (nextNoteTime < actx.currentTime + AHEAD) {
      scheduleStep(step16, nextNoteTime);
      nextNoteTime += noteLen();
      step16++;
      if (step16 % 16 === 0) {                          // bar boundary
        barsLeft--;
        if (barsLeft <= 0) {
          secIdx = (secIdx + 1) % sections.length;
          bpm = sections[secIdx].bpm; barsLeft = sections[secIdx].bars;
          onTempoChange(sections[secIdx]);
        }
      }
    }
    timerId = setTimeout(scheduler, LOOKAHEAD);
  }

  // tempo change -> swing the palette + set animation speeds (the "whole site" reaction)
  function onTempoChange(sec) {
    var fast = sec.bpm >= 130;
    siteHue = (siteHue + (fast ? 95 : 48)) % 360;
    flashHue = (flashHue + 65) % 360;
    root.style.setProperty("--site-hue", siteHue + "deg");
    root.style.setProperty("--site-sat", fast ? "1.28" : "1.02");
    root.style.setProperty("--flow-dur", (fast ? 2.3 : 6.5) + "s");
    root.style.setProperty("--spin-dur", (fast ? 7 : 20) + "s");
  }

  // per-frame: read audio energy, drive beat pulse on wing + whole-screen flash
  var pulse = 0, bassSmooth = 0;
  function frame() {
    if (analyser) {
      analyser.getByteFrequencyData(freq);
      var b = 0, i;
      for (i = 1; i < 10; i++) b += freq[i];
      b /= (9 * 255);
      bassSmooth = bassSmooth * 0.9 + b * 0.1;
      var transient = Math.max(0, b - bassSmooth * 1.12);
      pulse = Math.max(pulse * 0.85, Math.min(1, b * 0.45 + transient * 5));
      root.style.setProperty("--wing-scale", (1 + pulse * 0.055).toFixed(3));
      root.style.setProperty("--wing-bri", (1.12 + pulse * 0.95).toFixed(3));
      root.style.setProperty("--flash-op", (pulse * 0.42).toFixed(3));
      root.style.setProperty("--flash-hue", (flashHue | 0));
    }
    rafId = requestAnimationFrame(frame);
  }

  function resetVars() {
    root.style.setProperty("--wing-scale", "1");
    root.style.setProperty("--wing-bri", "1.12");
    root.style.setProperty("--flash-op", "0");
    root.style.setProperty("--flow-dur", "8s");
    root.style.setProperty("--spin-dur", "22s");
    root.style.setProperty("--site-sat", "1");
  }

  function startAudio() {
    if (!actx) { actx = new AudioCtx(); buildGraph(); }
    if (actx.state === "suspended") actx.resume();
    playing = true;
    step16 = 0; secIdx = 0; bpm = sections[0].bpm; barsLeft = sections[0].bars;
    onTempoChange(sections[0]);
    nextNoteTime = actx.currentTime + 0.08;
    scheduler();
    if (!rafId) frame();
    body.classList.add("audio-on", "audio-ready");
  }
  function stopAudio() {
    playing = false;
    if (timerId) { clearTimeout(timerId); timerId = null; }
    if (actx) actx.suspend();
    body.classList.remove("audio-on");
    resetVars();
  }

  function initSound() {
    var overlay = document.getElementById("enter");
    var enterBtn = document.getElementById("enter-sound");
    var silentBtn = document.getElementById("enter-silent");
    var toggle = document.getElementById("sound-toggle");

    function hideOverlay() { if (overlay) overlay.classList.add("hide"); }

    if (!AudioCtx) {                       // no Web Audio -> just let them in
      if (enterBtn) enterBtn.textContent = "Enter";
    }

    if (enterBtn) enterBtn.addEventListener("click", function () {
      hideOverlay();
      if (AudioCtx) startAudio(); else body.classList.add("audio-ready");
    });
    if (silentBtn) silentBtn.addEventListener("click", function () {
      hideOverlay();
      body.classList.add("audio-ready");   // reveal toggle so they can enable later
    });
    if (toggle) toggle.addEventListener("click", function () {
      if (!AudioCtx) return;
      if (playing) stopAudio(); else startAudio();
    });
  }

  /* ============================================================ BOOT */
  function boot() { initWing(); initReveal(); initSound(); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
