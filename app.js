// AZORA — front-end behaviour
//   1) Wing: strip white bg (canvas flood-fill) -> CSS fills the silhouette with rainbow
//   2) Scroll reveal
//   3) Sound: play a music file from the folder and make the wing + whole site react to
//      it live (beat pulses; the palette/flow swing between calm & intense as the music's
//      energy rises and falls) — mirroring the real sound-reactive LED product.
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

  /* ============================================================ SOUND (file) */
  var AudioCtx = window.AudioContext || window.webkitAudioContext;
  var actx = null, srcNode = null, analyser = null, freq = null, audioEl = null;
  var wired = false, playing = false, rafId = null;

  var siteHue = 0, flashHue = 320;
  var pulse = 0, bassSmooth = 0, intensity = 0;
  var section = "low", lastSwitch = 0;

  // energy rising/falling -> swing palette + animation speeds ("tempo" reaction)
  function onSection(name) {
    var fast = name === "high";
    siteHue = (siteHue + (fast ? 95 : 48)) % 360;
    flashHue = (flashHue + 65) % 360;
    root.style.setProperty("--site-hue", siteHue + "deg");
    root.style.setProperty("--site-sat", fast ? "1.28" : "1.02");
    root.style.setProperty("--flow-dur", (fast ? 4.5 : 11) + "s");
    root.style.setProperty("--spin-dur", (fast ? 12 : 26) + "s");
  }

  function frame() {
    if (analyser) {
      analyser.getByteFrequencyData(freq);
      var i, bass = 0, overall = 0;
      for (i = 1; i < 10; i++) bass += freq[i];
      bass /= (9 * 255);
      for (i = 1; i < 80; i++) overall += freq[i];
      overall /= (79 * 255);

      // beat pulse from bass transients -> wing + screen flash
      bassSmooth = bassSmooth * 0.9 + bass * 0.1;
      var transient = Math.max(0, bass - bassSmooth * 1.12);
      pulse = Math.max(pulse * 0.85, Math.min(1, bass * 0.45 + transient * 5));
      root.style.setProperty("--wing-scale", (1 + pulse * 0.055).toFixed(3));
      root.style.setProperty("--wing-bri", (1.12 + pulse * 0.95).toFixed(3));
      root.style.setProperty("--flash-op", (pulse * 0.42).toFixed(3));
      root.style.setProperty("--flash-hue", (flashHue | 0));

      // slow intensity tracker -> calm / intense section switching (with hysteresis)
      intensity = intensity * 0.94 + overall * 0.06;
      var now = performance.now();
      if (now - lastSwitch > 1400) {
        if (intensity > 0.42 && section !== "high") { section = "high"; lastSwitch = now; onSection("high"); }
        else if (intensity < 0.26 && section !== "low") { section = "low"; lastSwitch = now; onSection("low"); }
      }
    }
    rafId = requestAnimationFrame(frame);
  }

  function resetVars() {
    root.style.setProperty("--wing-scale", "1");
    root.style.setProperty("--wing-bri", "1.12");
    root.style.setProperty("--flash-op", "0");
    root.style.setProperty("--flow-dur", "14s");
    root.style.setProperty("--spin-dur", "30s");
    root.style.setProperty("--site-sat", "1");
  }

  function wire() {
    if (wired) return true;
    if (!AudioCtx || !audioEl) return false;
    actx = new AudioCtx();
    srcNode = actx.createMediaElementSource(audioEl);
    analyser = actx.createAnalyser();
    analyser.fftSize = 1024; analyser.smoothingTimeConstant = 0.8;
    freq = new Uint8Array(analyser.frequencyBinCount);
    srcNode.connect(analyser); analyser.connect(actx.destination);
    wired = true;
    return true;
  }

  function startAudio() {
    if (!wire()) { body.classList.add("audio-ready"); return; }
    if (actx.state === "suspended") actx.resume();
    var p = audioEl.play();
    if (p && p.then) {
      p.then(function () {
        playing = true;
        body.classList.add("audio-on", "audio-ready");
        section = "low"; lastSwitch = performance.now();
        if (!rafId) frame();
      }).catch(function () {
        // no file yet or playback blocked — still reveal the toggle
        body.classList.add("audio-ready");
      });
    } else {
      playing = true; body.classList.add("audio-on", "audio-ready"); if (!rafId) frame();
    }
  }

  function stopAudio() {
    if (audioEl) audioEl.pause();
    playing = false;
    body.classList.remove("audio-on");
    resetVars();
  }

  function initSound() {
    audioEl = document.getElementById("track");
    var overlay = document.getElementById("enter");
    var enterBtn = document.getElementById("enter-sound");
    var silentBtn = document.getElementById("enter-silent");
    var toggle = document.getElementById("sound-toggle");

    function hideOverlay() { if (overlay) overlay.classList.add("hide"); }
    if (!AudioCtx && enterBtn) enterBtn.textContent = "Enter";

    if (enterBtn) enterBtn.addEventListener("click", function () {
      hideOverlay();
      if (AudioCtx) startAudio(); else body.classList.add("audio-ready");
    });
    if (silentBtn) silentBtn.addEventListener("click", function () {
      hideOverlay();
      body.classList.add("audio-ready");
    });
    if (toggle) toggle.addEventListener("click", function () {
      if (!AudioCtx) return;
      if (playing) stopAudio(); else startAudio();
    });
  }

  /* ============================================================ SCROLL BAR */
  function initScrollbar() {
    var ticking = false;
    function update() {
      var doc = document.documentElement;
      var max = doc.scrollHeight - doc.clientHeight;
      var p = max > 0 ? doc.scrollTop / max : 0;
      root.style.setProperty("--scroll", p.toFixed(4));
      ticking = false;
    }
    addEventListener("scroll", function () {
      if (!ticking) { ticking = true; requestAnimationFrame(update); }
    }, { passive: true });
    update();
  }

  /* ============================================================ BOOT */
  function boot() { initWing(); initReveal(); initSound(); initScrollbar(); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
