/* Perssua Web — boot: navigation, header, action bar wiring and events. */
(function () {
  "use strict";

  function P() { return window.Perssua; }

  function badge() {
    var s = window.Sessions.current();
    var b = document.getElementById("session-badge");
    b.textContent = s ? s.title : window.T("no session");
    b.classList.toggle("live", !!s && !s.ended);
    document.getElementById("tray-label").textContent =
      s ? (window.T("Session: ") + s.title) : window.T("Ready");
    tickPill();
  }

  function tickPill() {
    var s = window.Sessions.current();
    var pill = document.getElementById("session-pill");
    if (!s || s.ended) { pill.style.display = "none"; return; }
    pill.style.display = "";
    var sec = Math.floor((Date.now() - s.started) / 1000);
    var mm = String(Math.floor(sec / 60)).padStart(2, "0");
    var ss = String(sec % 60).padStart(2, "0");
    pill.textContent = "● " + mm + ":" + ss + " " + window.T("— End");
    pill.title = window.T("End Session");
  }

  function planLabel() { /* open source: no plans, everything unlocked */ }

  function applyFlavor() {
    var f = P().state.settings.flavor || "perssua";
    var names = { perssua: "Perssua", cody: "Cody", notetaker: "Notetaker", reuniao: "Reuniao" };
    document.body.dataset.flavor = f;
    document.getElementById("brand").textContent = names[f] || "Perssua";
  }

  window.addEventListener("error", function (e) {
    P().log("render", "crashed: " + (e.message || "unknown"), true);
    window.Views.crashed();
  });

  document.querySelectorAll("[data-go]").forEach(function (b) {
    b.onclick = function () { window.Views.go(b.dataset.go); };
  });
  document.querySelectorAll("[data-quit]").forEach(function (b) {
    b.onclick = function () {
      window.electronAPI.showMessageBox({ message: "Quit Perssua? (web demo: the tab stays open)" });
    };
  });
  document.getElementById("session-pill").onclick = function () { window.Sessions.end(); };
  setInterval(tickPill, 1000);
  document.getElementById("lang-toggle").onclick = function () {
    window.I18N.setLang(window.I18N.lang() === "pt" ? "en" : "pt");
  };
  var retranslate = function () { window.I18N.translateTree(document.body); };
  P().on("chat", retranslate);
  P().on("sessions", retranslate);
  P().on("transcript", retranslate);
  P().on("speech", retranslate);

  P().on("sessions", badge);
  P().on("chat", function () { window.Views.renderChat(); });
  P().on("transcript", function () { window.Views.renderTrx(); });
  P().on("nav", function (v) { window.Views.go(v); });
  P().on("plan", planLabel);

  window.Shortcuts.bind();
  window.Notch.mount();
  applyFlavor();
  P().on("flavor", applyFlavor);
  window.I18N.applyStatic();
  window.I18N.translateTree(document.body);
  if (P().state.settings.stealth) document.body.classList.add("compact");
  badge();
  planLabel();
  P().log("app", "Perssua Web started");
  if (!P().state.onboarded) window.Views.onboarding();
  else window.Views.go("home");
})();
