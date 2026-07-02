// AZORA — front-end behaviour
// 1) Turn the white-background wing photo into a transparent-background cut-out
//    (flood-fill the white from the borders), then let CSS fill the exact wing
//    shape with the moving rainbow. 2) Scroll-reveal sections.
(function () {
  "use strict";

  /* ---------- wing: remove white background, drive the rainbow mask ---------- */
  function cutoutWing(img) {
    var w = img.naturalWidth, h = img.naturalHeight;
    if (!w || !h) return null;

    var canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    var ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0);

    var imgData;
    try {
      imgData = ctx.getImageData(0, 0, w, h);
    } catch (e) {
      return null; // canvas tainted — bail to fallback
    }
    var d = imgData.data;
    var N = w * h;

    // A pixel counts as "background white" only if it is bright on every channel.
    var TH = 236;
    function isWhite(i) {
      var p = i << 2;
      return d[p] >= TH && d[p + 1] >= TH && d[p + 2] >= TH;
    }

    // Flood fill inward from all four borders; the wing's dark outlines act as walls.
    var seen = new Uint8Array(N);
    var stack = new Int32Array(N);
    var sp = 0;
    function seed(idx) {
      if (!seen[idx] && isWhite(idx)) {
        seen[idx] = 1;
        stack[sp++] = idx;
      }
    }
    var x, y;
    for (x = 0; x < w; x++) { seed(x); seed((h - 1) * w + x); }
    for (y = 0; y < h; y++) { seed(y * w); seed(y * w + w - 1); }

    while (sp > 0) {
      var idx = stack[--sp];
      var ix = idx % w;
      var iy = (idx - ix) / w;
      if (ix > 0) seed(idx - 1);
      if (ix < w - 1) seed(idx + 1);
      if (iy > 0) seed(idx - w);
      if (iy < h - 1) seed(idx + w);
    }

    // Everything the flood fill reached = background -> transparent.
    for (var i = 0; i < N; i++) {
      if (seen[i]) d[(i << 2) + 3] = 0;
    }
    ctx.putImageData(imgData, 0, 0);

    try {
      return canvas.toDataURL("image/png");
    } catch (e) {
      return null;
    }
  }

  function initWing() {
    var hang = document.querySelector(".wing-hang");
    if (!hang) return;
    var img = hang.querySelector("img");
    var rainbow = hang.querySelector(".wing-rainbow");
    if (!img) return;

    function run() {
      var url = cutoutWing(img);
      if (url) {
        img.src = url; // transparent cut-out, multiplied over the rainbow for detail
        if (rainbow) {
          rainbow.style.webkitMaskImage = "url(" + url + ")";
          rainbow.style.maskImage = "url(" + url + ")";
        }
      } else if (rainbow) {
        // Fallback: no cut-out possible — colour via blend on the raw image.
        rainbow.style.display = "none";
        img.style.filter = "invert(1) brightness(2.3) saturate(1.15)";
        img.style.mixBlendMode = "screen";
      }
      hang.classList.add("ready");
    }

    if (img.complete && img.naturalWidth) run();
    else img.addEventListener("load", run, { once: true });
  }

  /* ---------- scroll reveal ---------- */
  function initReveal() {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          e.target.classList.add("in");
          io.unobserve(e.target);
        }
      });
    }, { threshold: 0.14 });
    document.querySelectorAll(".reveal").forEach(function (el) {
      io.observe(el);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () { initWing(); initReveal(); });
  } else {
    initWing();
    initReveal();
  }
})();
