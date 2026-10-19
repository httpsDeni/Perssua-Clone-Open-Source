/* Perssua Web — "their audio": captures the meeting tab's audio via
   screen/tab share (with the audio checkbox ON) and transcribes rolling
   20s windows through the bridge (`muse voice transcribe`).
   The microphone only hears YOU — this is how the other side gets heard. */
(function () {
  "use strict";

  function P() { return window.Perssua; }
  var live = null;

  // Cloud key = short windows (fast turnaround). Free bridge spawns a CLI
  // per window, so longer windows keep it from thrashing.
  function winSec() {
    try { if (window.Whisper && window.Whisper.configured()) return 10; } catch (e) { /* free */ }
    return 20;
  }

  function fileHint() {
    try {
      if (typeof location !== "undefined" && location.protocol === "file:") {
        return "open the app via http://127.0.0.1:8080/ — not the file directly";
      }
    } catch (e) { /* unknown */ }
    return null;
  }

  function isLive() { return !!live; }

  function start(statusCb, mode) {
    if (live) return Promise.resolve(true);
    if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
      return Promise.reject(new Error("tab share unavailable"));
    }
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return Promise.reject(new Error("WebAudio unavailable"));
    var say = function (m) {
      if (statusCb) statusCb(m);
      P().emit("their-audio", m);
    };
    var screen = mode === "screen";
    var tries = screen ? [
      { audio: true, video: { displaySurface: { ideal: "monitor" } } },
      { audio: true, video: true },
    ] : [
      { audio: true, video: { displaySurface: { ideal: "browser" }, selfBrowserSurface: { ideal: "exclude" } } },
      { audio: true, video: true },
      { audio: true, video: false },
    ];
    var fatal = function (e) {
      return e && (e.name === "NotAllowedError" || e.name === "AbortError" || e.name === "NotFoundError");
    };
    var attempt = function (i) {
      if (i >= tries.length) return Promise.reject(new Error("share rejected"));
      return navigator.mediaDevices.getDisplayMedia(tries[i]).catch(function (e) {
        if (fatal(e)) throw e;
        return attempt(i + 1);
      });
    };
    return attempt(0).then(function (stream) {
        var vids = stream.getVideoTracks();
        var vlabel = vids.length ? (vids[0].label || "?") : "none";
        vids.forEach(function (t) { t.stop(); });
        var tracks = stream.getAudioTracks();
        if (!tracks.length) {
          stream.getTracks().forEach(function (t) { t.stop(); });
          P().log("their-audio", "shared video [" + vlabel + "] with 0 audio tracks", true);
          throw new Error(screen
            ? "shared [" + vlabel + "] with no audio — tick Share SYSTEM audio, or try the Meet TAB option"
            : "shared [" + vlabel + "] with no audio — share the Meet TAB (not screen) with audio ON");
        }
        var ctx = new AC();
        var src = ctx.createMediaStreamSource(stream);
        var proc = ctx.createScriptProcessor(4096, 1, 1);
        var chunks = [];
        proc.onaudioprocess = function (ev) {
          if (!live) return;
          chunks.push(new Float32Array(ev.inputBuffer.getChannelData(0)));
        };
        src.connect(proc);
        proc.connect(ctx.destination);
        live = { stream: stream, ctx: ctx, proc: proc, chunks: chunks,
          rate: ctx.sampleRate, busy: false, stopped: false };
        tracks[0].onended = function () { stop(); };
        say("listening");
        P().log("their-audio", "tab audio connected (" + live.rate + "Hz)");
        pump(say);
        return true;
      });
  }

  function flatten(chunks) {
    var total = 0, i;
    for (i = 0; i < chunks.length; i++) total += chunks[i].length;
    var flat = new Float32Array(total);
    var off = 0;
    for (i = 0; i < chunks.length; i++) { flat.set(chunks[i], off); off += chunks[i].length; }
    return flat;
  }

  function pump(say) {
    if (!live || live.stopped) return;
    setTimeout(function () {
      if (!live || live.stopped) return;
      try {
        // Watchdog: a hung request must never wedge the loop.
        if (live.busy && Date.now() - (live.busySince || 0) > 90000) {
          live.busy = false;
          P().log("their-audio", "window watchdog: unstuck a hung request", true);
        }
        // Drain in place: onaudioprocess closes over this same array —
        // replacing it would orphan all future audio into the old one.
        var chunks = live.chunks.slice();
        live.chunks.length = 0;
        if (!chunks.length) {
          // Silence still flows as audio — zero chunks means the capture
          // itself stalled (background tab). Surface it instead of looping mute.
          live.empty = (live.empty || 0) + 1;
          if (live.empty === 6) {
            P().log("their-audio", "6 windows without audio — keep this tab visible?", true);
            say("no audio — keep this tab visible?");
          }
          pump(say); return;
        }
        live.empty = 0;
        if (live.busy) { pump(say); return; }
        live.busy = true;
        live.busySince = Date.now();
        say("transcribing");
        var wav = window.WavRec.encodeWav(flatten(chunks), live.rate);
        var prov = "";
        try { prov = P().state.settings.transcriptionProvider; } catch (e) { /* default */ }
        var useCloud = prov !== "clip" && window.Whisper && window.Whisper.configured();
        var ctl = null, timer = null;
        try { ctl = new AbortController(); } catch (e) { /* no timeout */ }
        if (ctl) {
          timer = setTimeout(function () { try { ctl.abort(); } catch (e) { /* done */ } }, 60000);
        }
        var clearT = function () { if (timer) { clearTimeout(timer); timer = null; } };
        var req = useCloud
          ? window.Whisper.transcribe(wav, prov).then(function (text) { return { text: text }; })
          : fetch("/api/transcribe", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ audioBase64: window.WavRec.toBase64(wav) }),
              signal: ctl ? ctl.signal : undefined,
            }).then(function (r) { return r.json(); });
        req.then(function (j) {
          clearT();
          if (live) live.busy = false;
          if (j.error) throw new Error(j.error);
          var text = (j.text || "").trim();
          if (text) {
            window.Sessions.pushTranscript(text, true, "them");
            say("listening");
          } else { say("listening"); }
          pump(say);
        }).catch(function (e) {
          clearT();
          if (live) live.busy = false;
          var msg = String((e && e.message) || e);
          var net = (e && e.name === "TypeError") || /fetch|network|load failed/i.test(msg);
          P().log("their-audio", "window failed: " + msg, true);
          say(net ? (fileHint() || "bridge error — is node server.js running?") : msg);
          pump(say);
        });
      } catch (e) {
        // Nothing may break the chain: log, unstick, reschedule.
        try {
          P().log("their-audio", "pump fault (recovering): " + e.message, true);
          if (live) live.busy = false;
        } catch (_) { /* logging failed */ }
        pump(say);
      }
    }, winSec() * 1000);
  }

  function stop() {
    if (!live) return;
    live.stopped = true;
    try {
      live.proc.disconnect();
      live.stream.getTracks().forEach(function (t) { t.stop(); });
      live.ctx.close();
    } catch (e) { /* already closed */ }
    live = null;
    P().log("their-audio", "stopped");
    P().emit("their-audio", "idle");
  }

  window.TheirAudio = { start: start, stop: stop, isLive: isLive };
})();
