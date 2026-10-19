/* Perssua Web — camada window.electronAPI.
   Replica os 112 membros da context bridge do app original, mapeados para
   equivalentes web. O que o browser não permite (atalhos globais, overlay
   sempre-no-topo, Whisper/LLM locais) vira simulação honesta com registro. */
(function () {
  "use strict";

  function P() { return window.Perssua; }
  function stub(name, value) {
    return function () {
      P().log("shim", name + " (simulated in browser)");
      return Promise.resolve(typeof value === "function" ? value() : value);
    };
  }
  function syncStub(name, value) {
    return function () { P().log("shim", name + " (simulated in browser)"); return value; };
  }

  var clipboardTimer = null;

  var api = {
    platform: "web",
    send: function (ch) {
      P().log("ipc", "send " + ch);
      P().emit("ipc:" + ch, Array.prototype.slice.call(arguments, 1));
      return Promise.resolve(true);
    },
    simpleIPCTest: function () { return Promise.resolve("pong"); },
    log: function (m) { P().log("renderer", m); return Promise.resolve(true); },
    logToMain: function (m) { P().log("renderer", m); return Promise.resolve(true); },
    logApiRequest: function (u) { P().log("api", "→ " + u); return Promise.resolve(true); },
    logApiResponse: function (s) { P().log("api", "← " + s); return Promise.resolve(true); },
    testSentryMain: function () { P().log("diag", "sentry-ok"); return Promise.resolve("ok"); },

    notifySessionStarted: function (s) { P().emit("session-started", s); return Promise.resolve(true); },
    notifySessionEnded: function (s) { P().emit("session-ended", s); return Promise.resolve(true); },
    endSessionFromMainWindow: function () { P().emit("session-ended", {}); return Promise.resolve(true); },
    resumeSessionFromMainWindow: function (id) { P().emit("session-resume", id); return Promise.resolve(true); },
    openAssistantsFromMainWindow: function () { P().emit("nav", "assistants"); return Promise.resolve(true); },
    notifyAssistantUpdated: function (a) { P().emit("assistant-updated", a); return Promise.resolve(true); },
    notifySubscriptionSynced: function (p) { P().emit("plan", p); return Promise.resolve(true); },
    notifyTextInputVisibility: function (v) { P().emit("text-input", v); return Promise.resolve(true); },
    notifyActionBarVisibilityForEsc: function (v) { P().emit("actionbar-esc", v); return Promise.resolve(true); },
    notifyActionBarPromptInputEngagement: function (v) { P().emit("prompt-engage", v); return Promise.resolve(true); },
    notifyPermissionDialogStart: function () { P().emit("perm-start", {}); return Promise.resolve(true); },
    notifyPermissionDialogEnd: function () { P().emit("perm-end", {}); return Promise.resolve(true); },
    notifyScreenSharingStarted: function () { P().emit("sharing", true); return Promise.resolve(true); },
    notifyScreenSharingStopped: function () { P().emit("sharing", false); return Promise.resolve(true); },
    sendAutoMinimizeResponse: function (r) { P().emit("automin", r); return Promise.resolve(true); },

    getClipboardText: function () {
      if (!navigator.clipboard) return Promise.resolve("");
      return navigator.clipboard.readText().catch(function () { return ""; });
    },
    writeClipboardText: function (t) {
      if (!navigator.clipboard) return Promise.resolve(false);
      return navigator.clipboard.writeText(String(t)).then(function () { return true; },
        function () { return false; });
    },
    copyLogsToClipboard: function () {
      var txt = P().state.logs.map(function (l) {
        return l.t + " [" + l.scope + "] " + l.message;
      }).join("\n");
      return api.writeClipboardText(txt);
    },
    startClipboardMonitoring: function () {
      if (clipboardTimer) return Promise.resolve(true);
      var last = "";
      clipboardTimer = setInterval(function () {
        api.getClipboardText().then(function (t) {
          if (t && t !== last) { last = t; P().emit("clipboard", t); }
        });
      }, 1500);
      P().log("clipboard", "monitoring started");
      return Promise.resolve(true);
    },
    stopClipboardMonitoring: function () {
      clearInterval(clipboardTimer); clipboardTimer = null;
      return Promise.resolve(true);
    },
    getSelectedText: function () { return Promise.resolve(window.getSelection().toString()); },
    getAccessibilitySelectionState: function () { return Promise.resolve({ text: window.getSelection().toString() }); },
    exportLogs: function () {
      var blob = new Blob([JSON.stringify(P().state.logs, null, 1)], { type: "application/json" });
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob); a.download = "perssua-web-logs.json"; a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
      return Promise.resolve(true);
    },
    getLogPath: function () { return Promise.resolve("localStorage :: perssua-web-v1.logs"); },
    openLogsFolder: function () { P().emit("nav", "logs"); return Promise.resolve(true); },
    showMessageBox: function (o) {
      var msg = (o && o.message) || "Perssua";
      window.alert(window.T ? window.T(msg) : msg);
      return Promise.resolve(true);
    },
    openExternal: function (u) { window.open(u, "_blank", "noopener"); return Promise.resolve(true); },
    openExternalLink: function (u) { window.open(u, "_blank", "noopener"); return Promise.resolve(true); },
    quitApp: function () { P().log("app", "quit requested (tab stays open)"); return Promise.resolve(true); },
    showWindow: function () { document.body.classList.remove("hidden-ui"); return Promise.resolve(true); },
    hideWindow: function () { document.body.classList.add("hidden-ui"); return Promise.resolve(true); },
    restoreAppWindows: function () { document.body.classList.remove("hidden-ui"); return Promise.resolve(true); },
    requestWindowFocus: function () { if (window.focus) window.focus(); return Promise.resolve(true); },
    applyStealthyMode: function (on) {
      document.body.classList.toggle("compact", !!on);
      P().state.settings.stealth = !!on; P().save();
      return Promise.resolve(!!on);
    },
    settings: {
      get: function (k) { return Promise.resolve(P().state.settings[k]); },
      set: function (k, v) { P().state.settings[k] = v; P().save(); return Promise.resolve(true); },
    },
    assistants: {
      list: function () { return Promise.resolve(P().state.assistants); },
      select: function (id) { P().state.activeAssistant = id; P().save(); P().emit("assistant-updated", id); return Promise.resolve(true); },
    },
  };

  /* Eventos on* da bridge: assinatura no barramento interno. */
  ["onActionBarPromptInputDisengageRequested", "onOverlayCursorPoll",
   "onOverlayShapeRecalculationRequested", "onProviderCompatibilityEvent",
   "onProviderCompatibilityPolicy", "onTextInputKeyCaptured",
   "onTextInputKeyboardCaptureChanged", "onTriggerSelectToPrompt"
  ].forEach(function (name) {
    api[name] = function (fn) { P().on(name, fn); return Promise.resolve(true); };
  });

  /* Restante: capacidades de SO sem equivalente web, simuladas com registro. */
  ["agentMcp", "appUpdater", "appleSpeech", "audioDriver", "cancelAutoMinimize",
   "captureScreenshot", "checkMicrophonePermission", "checkMicrophonePermissionMain",
   "checkScreenCapturePermission", "checkScreenRecordingPermission", "codexApi",
   "codexAuth", "customApi", "desktopBrowserAuth", "disableLoopbackAudio",
   "enableAutoMinimizeDetection", "enableLoopbackAudio", "externalAssistantConfirmation",
   "externalSession", "extractScreenOcrText", "getAvailableDisplays",
   "getDisplayPreviews", "getProviderCompatibilityPolicy",
   "isTextInputKeyboardCaptureActive", "isTextInputVisible",
   "linuxWaylandSafeWindow", "localLLM", "localWhisper", "mcpOAuth",
   "moveWindowToDisplay", "moveWindowToScreenPoint", "notchBubble",
   "obsidian", "openRouterTrial", "requestMicrophonePermission",
   "requestMicrophonePermissionMain", "requestOverlayCursorState",
   "saveWhisperAudio", "setAlwaysOnTop", "setEscapeShortcut",
   "setIgnoreMouseEvents", "setLoginOverlayActive", "setMemoryAssistantActive",
   "setOverlayFocusableOverride", "setOverlaySurfaceMode", "setOverlayWindowShape",
   "setShortcutsSuspended", "setTrayVisibility", "settingsOnboarding",
   "setupGlobalShortcut", "startMouseMonitoring", "stopMouseMonitoring", "testSystemAudioCapability",
   "trialPaywall", "updateClickThroughState", "updateMainShortcut",
   "updateMouseMonitorConfig", "updateRemoteConfigValues",
   "updateTrayAssistants", "updateTrayLabels"
  ].forEach(function (name) { api[name] = stub(name, true); });

  window.electronAPI = api;
})();
