/* Perssua Web — captura de tela e área de transferência.
   Equivale a screen-capture IPC + extractScreenOcrText: o browser exige
   escolha explícita da tela a cada captura (sem acesso silencioso). */
(function () {
  "use strict";

  function P() { return window.Perssua; }
  var lastShot = null;

  function screenshot() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
      P().log("capture", "getDisplayMedia unavailable", true);
      return Promise.reject(new Error("capture unavailable in this browser"));
    }
    P().emit("capture", true);
    return navigator.mediaDevices.getDisplayMedia({ video: true, audio: false })
      .then(function (stream) {
        var video = document.createElement("video");
        video.srcObject = stream;
        return video.play().then(function () {
          var c = document.createElement("canvas");
          c.width = video.videoWidth; c.height = video.videoHeight;
          c.getContext("2d").drawImage(video, 0, 0);
          stream.getTracks().forEach(function (t) { t.stop(); });
          lastShot = c.toDataURL("image/png");
          P().log("capture", "screenshot " + c.width + "x" + c.height);
          P().emit("shot", lastShot);
          P().emit("capture", false);
          return lastShot;
        });
      }).catch(function (e) {
        P().emit("capture", false);
        throw e;
      });
  }

  function downloadShot() {
    if (!lastShot) return false;
    var a = document.createElement("a");
    a.href = lastShot; a.download = "perssua-captura.png"; a.click();
    return true;
  }

  function readClipboard() { return window.electronAPI.getClipboardText(); }

  function ocrNote() {
    P().log("capture", "OCR needs an extra library in the browser; screenshot ready for manual analysis");
    return "Automatic OCR is not included: capture the screen and attach it to your question, " +
      "or paste text with the clipboard button.";
  }

  window.Capture = { screenshot: screenshot, downloadShot: downloadShot,
    readClipboard: readClipboard, ocrNote: ocrNote,
    last: function () { return lastShot; } };
})();
