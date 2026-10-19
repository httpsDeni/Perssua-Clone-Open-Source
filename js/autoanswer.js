/* Perssua Web — popup de respostas: quando a transcrição traz uma pergunta
   do outro lado (?), o agente responde sozinho e a resposta aparece num
   popup dedicado. Histórico completo fica no chat da sessão. */
(function () {
  "use strict";

  function P() { return window.Perssua; }
  var working = false, workingSince = 0;

  function ensurePop() {
    var pop = document.getElementById("answer-pop");
    if (pop) return pop;
    pop = document.createElement("div");
    pop.id = "answer-pop";
    pop.innerHTML = "<div class='ans-head'><strong>Live Answer</strong>" +
      "<button class='glass-button' data-x>×</button></div>" +
      "<div class='ans-q'></div><div class='ans-a'></div>";
    document.body.appendChild(pop);
    pop.querySelector("[data-x]").onclick = function () { pop.style.display = "none"; };
    return pop;
  }

  function show(q, a) {
    var pop = ensurePop();
    pop.style.display = "block";
    pop.querySelector(".ans-q").textContent = q;
    pop.querySelector(".ans-a").textContent = a;
    if (window.I18N) window.I18N.translateTree(pop);
  }

  // Whisper/Web Speech often drop the "?", so interrogative phrasing
  // (PT or EN) also triggers — not just the punctuation. Bare imperatives
  // ("Diga um exemplo…") and a name mid-sentence count too.
  function isQuestion(t) {
    if (/\?/.test(t)) return true;
    var s = String(t || "");
    var m = s.match(/(deni|dani|danny)[,\s]+(.+)$/i);
    var core = (m ? m[2] : s).replace(/^\s*(por favor)[,\s]+/i, "");
    return /^(o que|o q\b|qual|quais|quando|quanto|quantos|quantas|onde|como|por\s?que|porque|quem|pode|podem|poderia|poderiam|consegue|conseguem|conseguiria|sabe|sabem|saberia|conhece|conhecem|conheceria|diga|diga-me|explique|explique-me|fale|fale-me|conte|conte-me|descreva|cite|liste|mostre|d[êe]\b|exemplo\s+de|me\s+(diz|diga|fala|fale|conta|conte|explica|explic|responde|mostra|d[êe]|d[áa])|você\s+(conhece|sabe|pode|consegue|poderia|usa|usou|já|acha|gosta)|voce\s+(conhece|sabe|pode|consegue|poderia|usa|usou|ja|acha|gosta)|what|which|when|where|how|why|who|can|could|would|is|are|do|does|did|tell me|explain|describe|give me|list|show me)/i.test(core);
  }

  function scan() {
    if (working) {
      // A previous answer that never settled must not wedge us forever.
      if (Date.now() - workingSince < 120000) return;
      working = false;
      P().log("autoanswer", "stale answer reset", true);
    }
    var st = P().state;
    if (!st.settings.autoAnswer) return;
    var s = window.Sessions.current();
    if (!s) return;
    // Only the other side's questions trigger the popup — never your own mic.
    var finals = s.transcript.filter(function (x) { return x.final && x.who !== "me"; });
    var from = s.answeredUpto || 0;
    var q = null, qi = -1, i;
    for (i = from; i < finals.length; i++) {
      if (isQuestion(finals[i].text)) { q = finals[i].text; qi = i; break; }
    }
    if (!q) {
      if (s.answeredUpto !== finals.length) { s.answeredUpto = finals.length; P().save(); }
      return;
    }
    working = true;
    workingSince = Date.now();
    s.answeredUpto = qi + 1;
    P().save();
    P().log("autoanswer", "question: " + q.slice(0, 80));
    var req;
    try {
      req = window.Chat.ask("The other side asked: " + q + ". Reply in the meeting language with at most " +
        "2 short sentences a person could say out loud. Be direct: no greeting, no preamble, " +
        "no meta-commentary, just the answer.");
    } catch (e) {
      working = false;
      P().log("autoanswer", "ask threw: " + e.message, true);
      return;
    }
    req.then(function (a) {
      working = false;
      show(q, a);
      scan();
    }).catch(function (e) {
      working = false;
      P().log("autoanswer", "answer failed: " + ((e && e.message) || e), true);
    });
  }

  P().on("transcript", scan);
  window.AutoAnswer = { scan: scan, show: show, isQuestion: isQuestion };
})();
