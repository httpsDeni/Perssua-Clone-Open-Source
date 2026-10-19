/* Perssua Web — paid cloud transcription (OpenAI-compatible Whisper API).
   Used for meeting-tab windows and mic clips when the user sets a key in
   Transcription. Without a key the free engines are used (browser speech /
   Muse bridge) and this module is never called. */
(function () {
  "use strict";

  function P() { return window.Perssua; }

  var MODELS = {
    live: "gpt-4o-mini-transcribe",
    realtime: "gpt-4o-transcribe",
    accurate: "gpt-4o-transcribe",
    mini: "gpt-4o-mini-transcribe",
    clip: "gpt-4o-mini-transcribe",
  };

  function configured() {
    try {
      var s = P().state.settings;
      return !!(s && s.trxKey && s.trxKey.trim());
    } catch (e) { return false; }
  }

  function modelFor(provider) {
    return MODELS[provider] || MODELS.mini;
  }

  // wav: Uint8Array (16-bit PCM wav from WavRec.encodeWav).
  function transcribe(wav, provider) {
    var s = P().state.settings;
    var base = (s.trxBaseUrl || "https://api.openai.com/v1").replace(/\/$/, "");
    var url = base + "/audio/transcriptions";
    var blob = new Blob([wav], { type: "audio/wav" });
    var form = new FormData();
    form.append("file", blob, "clip.wav");
    form.append("model", modelFor(provider || s.transcriptionProvider));
    form.append("language", "pt");
    form.append("response_format", "json");
    P().log("whisper", "POST " + url + " (" + modelFor(provider || s.transcriptionProvider) + ")");
    return fetch(url, {
      method: "POST",
      headers: { "Authorization": "Bearer " + s.trxKey.trim() },
      body: form,
    }).then(function (r) {
      if (!r.ok) {
        return r.text().then(function (body) {
          var detail = "";
          try { detail = (JSON.parse(body).error || {}).message || ""; } catch (e) { detail = String(body || ""); }
          throw new Error("HTTP " + r.status + (detail ? " — " + detail.slice(0, 220) : ""));
        });
      }
      return r.json();
    }).then(function (j) {
      return (j.text || "").trim();
    });
  }

  window.Whisper = { transcribe: transcribe, configured: configured, modelFor: modelFor };
})();
