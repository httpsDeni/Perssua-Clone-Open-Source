/* Perssua Web — sessões: iniciar, encerrar, retomar e conversar.
   Equivale a externalSessionHandoff + DatabaseManager (sessions/messages). */
(function () {
  "use strict";

  function P() { return window.Perssua; }
  function uid() { return "s" + Date.now().toString(36) + Math.floor(Math.random() * 1e4); }
  function buzz(ms) {
    try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) { /* desktop: no haptics */ }
  }

  function current() {
    var st = P().state;
    return st.sessions.find(function (s) { return s.id === st.activeSession; }) || null;
  }

  function start(title) {
    var st = P().state;
    var s = { id: uid(), title: title || ("Sessão " + (st.sessions.length + 1)),
      started: Date.now(), ended: null, messages: [], transcript: [] };
    st.sessions.unshift(s);
    st.activeSession = s.id;
    P().save();
    P().log("session", "started: " + s.title);
    buzz(10);
    window.electronAPI.notifySessionStarted({ id: s.id, title: s.title });
    P().emit("sessions", null);
    return s;
  }

  function end() {
    var s = current();
    if (!s) return null;
    s.ended = Date.now();
    P().state.activeSession = null;
    P().save();
    P().log("session", "ended: " + s.title);
    buzz([10, 40, 10]);
    window.electronAPI.notifySessionEnded({ id: s.id });
    P().emit("sessions", null);
    return s;
  }

  function resume(id) {
    var st = P().state;
    var s = st.sessions.find(function (x) { return x.id === id; });
    if (!s) return null;
    s.ended = null;
    st.activeSession = s.id;
    P().save();
    P().log("session", "retomada: " + s.title);
    P().emit("sessions", null);
    return s;
  }

  function remove(id) {
    var st = P().state;
    st.sessions = st.sessions.filter(function (x) { return x.id !== id; });
    if (st.activeSession === id) st.activeSession = null;
    P().save();
    P().emit("sessions", null);
  }

  function pushMessage(who, text) {
    var s = current();
    if (!s) s = start();
    s.messages.push({ who: who, text: String(text), t: Date.now() });
    P().save();
    P().emit("sessions", null);
    return s;
  }

  function pushTranscript(text, final, who) {
    var s = current();
    if (!s) s = start();
    s.transcript.push({ text: String(text), final: !!final, who: who || "", t: Date.now() });
    if (s.transcript.length > 400) s.transcript = s.transcript.slice(-400);
    P().save();
    P().emit("transcript", s);
    return s;
  }

  // Live mic interim: overwrite the pending line instead of appending,
  // so the transcript doesn't fill with partial repetitions.
  function upsertInterim(text, who) {
    var s = current();
    if (!s) s = start();
    var last = s.transcript[s.transcript.length - 1];
    if (last && !last.final && (last.who || "") === (who || "")) {
      last.text = String(text);
      last.t = Date.now();
    } else {
      s.transcript.push({ text: String(text), final: false, who: who || "", t: Date.now() });
      if (s.transcript.length > 400) s.transcript = s.transcript.slice(-400);
    }
    P().save();
    P().emit("transcript", s);
    return s;
  }

  function transcriptText(s) {
    return (s.transcript || []).filter(function (x) { return x.final; })
      .map(function (x) { return x.text; }).join("\n");
  }

  window.Sessions = { current: current, start: start, end: end,
    resume: resume, remove: remove, pushMessage: pushMessage,
    pushTranscript: pushTranscript, upsertInterim: upsertInterim,
    transcriptText: transcriptText };
})();
