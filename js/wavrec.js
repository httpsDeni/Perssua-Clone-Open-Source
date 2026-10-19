/* Perssua Web — gravador WAV (mono PCM16) para clipes locais.
   O `muse voice transcribe` aceita wav: gravamos do microfone, codificamos
   aqui no browser (sem dependências) e enviamos em base64 para a ponte. */
(function () {
  "use strict";

  function P() { return window.Perssua; }
  var MAX_SEC = 60;
  var active = null;

  function encodeWav(samples, sampleRate) {
    var n = samples.length;
    var buf = new ArrayBuffer(44 + n * 2);
    var v = new DataView(buf);
    var wstr = function (o, s) { for (var i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    wstr(0, "RIFF");
    v.setUint32(4, 36 + n * 2, true);
    wstr(8, "WAVE");
    wstr(12, "fmt ");
    v.setUint32(16, 16, true);
    v.setUint16(20, 1, true);
    v.setUint16(22, 1, true);
    v.setUint32(24, sampleRate, true);
    v.setUint32(28, sampleRate * 2, true);
    v.setUint16(32, 2, true);
    v.setUint16(34, 16, true);
    wstr(36, "data");
    v.setUint32(40, n * 2, true);
    for (var i = 0; i < n; i++) {
      var s = Math.max(-1, Math.min(1, samples[i]));
      v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    }
    return buf;
  }

  function start(maxSec) {
    if (active) return Promise.resolve(false);
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      return Promise.reject(new Error("microfone indisponível"));
    }
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return Promise.reject(new Error("WebAudio indisponível"));
    return navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
      var ctx = new AC();
      var src = ctx.createMediaStreamSource(stream);
      var proc = ctx.createScriptProcessor(4096, 1, 1);
      var chunks = [];
      var stopped = false;
      proc.onaudioprocess = function (ev) {
        if (stopped) return;
        chunks.push(new Float32Array(ev.inputBuffer.getChannelData(0)));
      };
      src.connect(proc);
      proc.connect(ctx.destination);
      var rec = { stream: stream, ctx: ctx, proc: proc, chunks: chunks,
        rate: ctx.sampleRate, started: Date.now(), maxMs: (maxSec || MAX_SEC) * 1000 };
      active = rec;
      P().emit("clip-state", true);
      rec.timer = setTimeout(function () { stop(); }, rec.maxMs);
      return true;
    });
  }

  function stop() {
    if (!active) return null;
    var rec = active;
    active = null;
    clearTimeout(rec.timer);
    try {
      rec.proc.disconnect();
      rec.stream.getTracks().forEach(function (t) { t.stop(); });
      rec.ctx.close();
    } catch (e) { /* already closed */ }
    var total = 0, i;
    for (i = 0; i < rec.chunks.length; i++) total += rec.chunks[i].length;
    var flat = new Float32Array(total);
    var off = 0;
    for (i = 0; i < rec.chunks.length; i++) {
      flat.set(rec.chunks[i], off);
      off += rec.chunks[i].length;
    }
    P().emit("clip-state", false);
    return { wav: encodeWav(flat, rec.rate), seconds: Math.round((Date.now() - rec.started) / 1000) };
  }

  function toBase64(buf) {
    var bytes = new Uint8Array(buf);
    var bin = "";
    var CH = 32768;
    for (var i = 0; i < bytes.length; i += CH) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
    }
    return btoa(bin);
  }

  function isRecording() { return !!active; }

  window.WavRec = { start: start, stop: stop, toBase64: toBase64,
    isRecording: isRecording, encodeWav: encodeWav };
})();
