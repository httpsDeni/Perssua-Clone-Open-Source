/* Perssua Web — núcleo: estado, persistência e barramento de registros.
   Equivale a settingsStore + DatabaseManager + mainLogging do app original. */
(function () {
  "use strict";
  var KEY = "perssua-web-v1";
  var listeners = {};

  function defaults() {
    return {
      version: 3,
      onboarded: false,
      settings: {
        lang: "pt",
        autoAnswer: true,
        flavor: "perssua",
        cliModel: "",
        provider: "openai",
        llmBaseUrl: "https://api.openai.com/v1",
        llmKey: "",
        llmModel: "gpt-4o-mini",
        customApiBaseUrl: "",
        customApiModel: "",
        transcriptionProvider: "live",
        trxKey: "",
        trxBaseUrl: "https://api.openai.com/v1",
        speechLang: "pt-BR",
        stealth: false,
        audioSource: "microphone",
        clickThrough: false,
        shortcuts: { toggle: "ctrl+shift+space", hide: "esc", capture: "ctrl+shift+c", clickThrough: "ctrl+m" },
      },
      assistants: [
        { id: "explain", name: "Explain Code", custom: false,
          prompt: "Explain this code step by step with examples.",
          blurb: "Step-by-step code explanations with examples.",
          blurbPt: "Explica código passo a passo com exemplos." },
        { id: "debug", name: "Debug Helper", custom: false,
          prompt: "Help me debug this code. What might be causing the issue?",
          blurb: "Helps find what might be causing the issue.",
          blurbPt: "Ajuda a achar a causa do problema." },
        { id: "notetaker-q", name: "Notetaker Meeting Copilot", custom: false,
          prompt: (window.PROMPT_MEETING || "Answer concisely using the meeting transcript."),
          blurb: "Concise meeting answers from the transcript.",
          blurbPt: "Respostas objetivas da reunião a partir da transcrição." },
        { id: "notetaker-s", name: "Notetaker Summary", custom: false,
          prompt: (window.PROMPT_SUMMARY || "Summarize the meeting."),
          blurb: "Meeting summaries with decisions and owners.",
          blurbPt: "Resumos com decisões e responsáveis." },
      ],
      activeAssistant: "explain",
      sessions: [],
      activeSession: null,
      logs: [],
    };
  }

  var state = defaults();
  try {
    var raw = localStorage.getItem(KEY);
    if (raw) state = Object.assign(defaults(), JSON.parse(raw));
    // Perfis antigos salvaram o mic em inglês; UI em PT volta para pt-BR
    // (o usuário pode trocar de novo no seletor da tela Transcription).
    if (state.settings && state.settings.speechLang === "en-US" && state.settings.lang !== "en") {
      state.settings.speechLang = "pt-BR";
    }
  } catch (e) { /* perfil novo: segue com padrões */ }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* cota cheia */ }
  }

  function on(evt, fn) {
    (listeners[evt] = listeners[evt] || []).push(fn);
  }

  function emit(evt, data) {
    (listeners[evt] || []).forEach(function (fn) {
      try { fn(data); } catch (e) { log("listener:" + evt, String(e), true); }
    });
  }

  function log(scope, message, isErr) {
    var entry = { t: new Date().toISOString(), scope: scope, message: String(message), err: !!isErr };
    state.logs.push(entry);
    if (state.logs.length > 500) state.logs = state.logs.slice(-500);
    save();
    emit("log", entry);
    if (isErr && window.console) console.error("[perssua:" + scope + "]", message);
  }

  window.Perssua = { state: state, save: save, on: on, emit: emit, log: log };
})();
