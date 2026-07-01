// Scroll-reveal: fade sections in as they enter the viewport.
(function () {
  "use strict";
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
})();
