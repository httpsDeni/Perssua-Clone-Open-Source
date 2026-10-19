/* Perssua Web — Notch Bubble: the 300x34 top-center pill that expands
   into a live-answer panel (refresh, history, reasoning toggle, collapse).
   The browser cannot pin above other apps, so it docks to this page top. */
(function () {
  "use strict";

  function P() { return window.Perssua; }
  var idx = -1, reasoning = false;

  function mount() {
    var root = document.getElementById("notch-root");
    if (!root || root.firstChild) return;
    root.innerHTML =
      "<div class='notch-shape' id='notch'>" +
      "<div class='notch-header'><span class='notch-logo'>●</span>" +
      "<span class='notch-status' id='notch-status'>Perssua</span>" +
      "<span class='notch-header-actions'>" +
      "<button class='notch-header-btn refresh' id='notch-refresh' title='Refresh insight'>↻</button>" +
      "<button class='notch-header-btn reasoning' id='notch-reason' title='Advanced reasoning'>✦</button>" +
      "<button class='notch-header-btn' id='notch-toggle' title='Expand'>▾</button>" +
      "</span></div>" +
      "<div class='notch-body'><div class='notch-answer' id='notch-answer'>Ask something to see live insight here.</div>" +
      "<div class='row'><button class='glass-button' id='notch-prev'>‹ Prev</button>" +
      "<button class='glass-button' id='notch-next'>Next ›</button>" +
      "<button class='glass-button' id='notch-collapse'>Collapse</button></div>" +
      "</div><div class='notch-capture-indicator'></div></div>";
    var n = document.getElementById("notch");
    document.getElementById("notch-toggle").onclick = function () { n.classList.toggle("expanded"); };
    document.getElementById("notch-collapse").onclick = function () { n.classList.remove("expanded"); };
    document.getElementById("notch-prev").onclick = function () { step(-1); };
    document.getElementById("notch-next").onclick = function () { step(1); };
    document.getElementById("notch-reason").onclick = function (e) {
      reasoning = !reasoning;
      e.currentTarget.classList.toggle("active", reasoning);
      P().log("notch", "advanced reasoning " + (reasoning ? "on" : "off"));
    };
    document.getElementById("notch-refresh").onclick = function (e) {
      var h = window.Chat && window.Chat.history();
      if (!h.length) return;
      var btn = e.currentTarget;
      btn.classList.add("spinning");
      window.Chat.ask(h[h.length - 1].q).then(function () {
        btn.classList.remove("spinning");
      });
    };
    P().on("chat", function () {
      var b = document.getElementById("notch-refresh");
      if (b) b.classList.remove("spinning");
      render();
    });
    P().on("capture", function (on) {
      var el = document.getElementById("notch");
      if (el) el.classList.toggle("capture-active", !!on);
    });
    render();
  }

  function answers() {
    var h = window.Chat ? window.Chat.history() : [];
    return h.filter(function (x) { return x.a; });
  }

  function step(d) {
    var a = answers();
    if (!a.length) return;
    idx = (idx + d + a.length) % a.length;
    render();
  }

  function render() {
    var ans = document.getElementById("notch-answer");
    var status = document.getElementById("notch-status");
    if (!ans || !status) return;
    var T = window.T || function (s) { return s; };
    var a = answers();
    if (!a.length) {
      ans.textContent = T("Ask something to see live insight here.");
      status.textContent = "Perssua";
      return;
    }
    if (idx < 0 || idx >= a.length) idx = a.length - 1;
    ans.textContent = a[idx].a;
    status.textContent = T("Insight ") + (idx + 1) + "/" + a.length + (reasoning ? T(" · deep") : "");
  }

  window.Notch = { mount: mount, render: render };
})();
