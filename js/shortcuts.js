/* Perssua Web — atalhos de teclado dentro da página.
   O desktop usa atalhos globais (setupGlobalShortcut); na web valem com
   a página focada e são configuráveis em Ajustes. */
(function () {
  "use strict";

  function norm(e) {
    var parts = [];
    if (e.ctrlKey) parts.push("ctrl");
    if (e.shiftKey) parts.push("shift");
    if (e.altKey) parts.push("alt");
    var k = e.key === " " ? "espaço" : e.key.toLowerCase();
    parts.push(k);
    return parts.join("+");
  }

  function onKey(e) {
    var s = window.Perssua.state.settings.shortcuts;
    var combo = norm(e);
    var toggle = (s.toggle || "").toLowerCase();
    var hide = (s.hide || "").toLowerCase();
    var cap = (s.capture || "").toLowerCase();
    if (combo === toggle) {
      e.preventDefault();
      var on = !document.body.classList.contains("compact");
      window.electronAPI.applyStealthyMode(on);
    } else if (combo === hide) {
      e.preventDefault();
      document.body.classList.toggle("hidden-ui");
    } else if (combo === cap) {
      e.preventDefault();
      window.Views.go("capture");
    } else if (combo === "ctrl+shift+l" && document.body.classList.contains("hidden-ui")) {
      document.body.classList.remove("hidden-ui");
    }
  }

  function bind() {
    document.removeEventListener("keydown", onKey);
    document.addEventListener("keydown", onKey);
  }

  window.Shortcuts = { bind: bind };
})();
