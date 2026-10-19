/* Perssua Web — async buttons with working / done / retry states,
   mirroring the original async-button system (update, sign-in, save…). */
(function () {
  "use strict";

  function run(btn, labels, task) {
    var original = btn.textContent;
    var L = labels || {};
    btn.disabled = true;
    btn.textContent = L.working || "Working…";
    var done = function (msg) {
      btn.disabled = false;
      btn.textContent = msg || original;
      if (msg) setTimeout(function () { btn.textContent = original; }, 2500);
    };
    task().then(function (r) {
      done(L.done || "Done");
      return r;
    }).catch(function (e) {
      btn.disabled = false;
      btn.textContent = L.retry || "Retry";
      btn.onclick = function () { run(btn, labels, task); };
      window.Perssua.log("async", "failed: " + (e && e.message), true);
    });
  }

  function fakeProgress(btn, target, ms, then) {
    var p = 0;
    btn.disabled = true;
    var t = setInterval(function () {
      p = Math.min(100, p + 8 + Math.floor(Math.random() * 10));
      btn.textContent = "Updating " + p + "%";
      if (p >= 100) {
        clearInterval(t);
        btn.disabled = false;
        btn.textContent = target;
        if (then) then();
      }
    }, (ms || 1200) / 14);
  }

  window.Async = { run: run, fakeProgress: fakeProgress };
})();
