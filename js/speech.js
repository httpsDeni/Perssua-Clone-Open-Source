/* Perssua Web — transcrição contínua via Web Speech API.
   Equivalente web do Whisper local: sem download de modelo, usa o
   reconhecimento do browser (requer Chrome/Edge e internet). */
(function () {
  "use strict";

  function P() { return window.Perssua; }
  var rec = null, running = false, lang = "pt-BR";

  function supported() {
    return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  }

  function build() {
    var Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
    rec = new Ctor();
    rec.lang = P().state.settings.speechLang || lang;
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = function (ev) {
      for (var i = ev.resultIndex; i < ev.results.length; i++) {
        var r = ev.results[i];
        var txt = r[0].transcript.trim();
        if (!txt) continue;
        if (r.isFinal) window.Sessions.pushTranscript(txt, true, "me");
        else if (window.Sessions.upsertInterim) window.Sessions.upsertInterim(txt, "me");
        else window.Sessions.pushTranscript(txt, false, "me");
        P().emit("speech", { text: txt, final: r.isFinal });
      }
    };
    rec.onerror = function (ev) { P().log("speech", "erro: " + ev.error, true); };
    rec.onend = function () {
      if (running) { try { rec.start(); } catch (e) { /* reinício */ } }
      else P().emit("speech-state", false);
    };
  }

  function start() {
    if (!supported()) {
      P().log("speech", "Web Speech unavailable in this browser", true);
      return false;
    }
    if (running) return true;
    build();
    running = true;
    try { rec.start(); } catch (e) { P().log("speech", String(e), true); return false; }
    P().log("speech", "transcription started (" + rec.lang + ")");
    P().emit("speech-state", true);
    return true;
  }

  function stop() {
    running = false;
    if (rec) { try { rec.stop(); } catch (e) { /* já parado */ } }
    P().log("speech", "transcription stopped");
    P().emit("speech-state", false);
  }

  function isRunning() { return running; }

  window.Speech = { start: start, stop: stop, isRunning: isRunning, supported: supported };
})();
