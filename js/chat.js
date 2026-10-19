/* Perssua Web — chat com o assistente via endpoint compatível OpenAI.
   Sem chave: responde em modo simulado para demonstração. */
(function () {
  "use strict";

  function P() { return window.Perssua; }

  // fetch with a hard ceiling: a hung provider must surface as an error
  // reply, never as eternal silence.
  function fetchTimeout(url, opts, ms) {
    var ctl = null, timer = null;
    try { ctl = new AbortController(); } catch (e) { /* no timeout */ }
    opts = opts || {};
    if (ctl) {
      opts.signal = ctl.signal;
      timer = setTimeout(function () { try { ctl.abort(); } catch (e) { /* done */ } }, ms || 90000);
    }
    return fetch(url, opts).then(function (r) {
      if (timer) clearTimeout(timer);
      return r;
    }).catch(function (e) {
      if (timer) clearTimeout(timer);
      throw e;
    });
  }

  function activeAssistant() {
    var st = P().state;
    return st.assistants.find(function (a) { return a.id === st.activeAssistant; }) || st.assistants[0];
  }

  var hist = [];
  function remember(q, a) {
    hist.push({ q: q, a: a });
    if (hist.length > 20) hist = hist.slice(-20);
  }

  function mockReply(userText, context, imageDataUrl) {
    var lines = (context || "").split("\n").filter(Boolean);
    var last = lines.slice(-3).join(" / ");
    return "Got it: “" + userText + "”." +
      (imageDataUrl ? " I can see the attached screenshot (demo: attach a key in AI Sources for real visual analysis)." : "") +
      (last ? " Recent transcript mentions: " + last + "." : " No transcript in this session yet.") +
      " (demo reply — no API key and no local CLI found: set a key in AI Sources " +
      "or run `node server.js` with the Claude Code / Muse CLIs installed.)";
  }

  function summarize() {
    var s = window.Sessions.current();
    if (!s) return Promise.resolve("(no active session)");
    var context = window.Sessions.transcriptText(s) ||
      s.messages.map(function (m) { return m.who + ": " + m.text; }).join("\n");
    return ask("Summarize this session. List decisions, owners and deadlines. Context:\n" + context);
  }

  function bridgeBase() {
    try {
      if (typeof location !== "undefined" && location.protocol.indexOf("http") === 0) return "";
    } catch (e) { /* file:// or unknown */ }
    return null;
  }

  function askViaBridge(provider, prompt, model) {
    var base = bridgeBase();
    if (base === null || typeof fetch === "undefined") {
      return Promise.resolve("(local CLIs need the bridge: run `node server.js` " +
        "and open http://127.0.0.1:8080/ instead of the file directly.)");
    }
    return fetchTimeout(base + "/api/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: provider, prompt: prompt, model: model || "" }),
    }, 120000).then(function (r) { return r.json(); }).then(function (j) {
      if (j.error) throw new Error(j.error);
      return j.reply || "(empty reply)";
    }).catch(function (e) {
      var msg = String((e && e.message) || e);
      var net = (e && e.name === "TypeError") || /fetch|network|load failed/i.test(msg);
      P().log("bridge", "ask failed: " + msg, true);
      if (net) {
        var hint = "";
        try {
          if (typeof location !== "undefined" && location.protocol === "file:") {
            hint = " — open via http://127.0.0.1:8080/ instead of the file";
          }
        } catch (err) { /* unknown */ }
        return "(bridge error: " + msg + hint + " — is `node server.js` running?)";
      }
      return "(provider error: " + msg + ")";
    });
  }

  // No key-based provider: prefer the free local CLIs (Muse/Claude Code
  // via `node server.js`) before falling back to the demo reply.
  function bridgeAuto(prompt, model) {
    var base = bridgeBase();
    if (base === null || typeof fetch === "undefined") return Promise.resolve(null);
    return fetch(base + "/api/bridge").then(function (r) { return r.json(); }).then(function (j) {
      if (j && j.muse) { P().log("bridge", "auto: using muse CLI"); return askViaBridge("muse", prompt, model); }
      if (j && j.claude) { P().log("bridge", "auto: using claude CLI"); return askViaBridge("claudecode", prompt, model); }
      return null;
    }).catch(function () { return null; });
  }

  function ask(userText, imageDataUrl) {
    var st = P().state;
    var asst = activeAssistant();
    var s = window.Sessions.current();
    var context = s ? window.Sessions.transcriptText(s) : "";
    window.Sessions.pushMessage("me", userText + (imageDataUrl ? " [screenshot attached]" : ""));
    P().emit("chat", null);

    var fullPrompt = (imageDataUrl ? "[screenshot attached — describe what you see only if asked] " : "") +
      asst.prompt + "\n\nTranscript:\n" + context + "\n\nQuestion: " + userText;
    function done(reply) {
      remember(userText, reply);
      window.Sessions.pushMessage("ai", reply);
      P().emit("chat", null);
      return reply;
    }

    if (st.settings.provider === "claudecode" || st.settings.provider === "muse") {
      return askViaBridge(st.settings.provider, fullPrompt, st.settings.cliModel).then(done);
    }

    if (!st.settings.llmKey) {
      return bridgeAuto(fullPrompt, st.settings.cliModel).then(function (reply) {
        if (reply !== null) return done(reply);
        return new Promise(function (res) {
          setTimeout(function () { res(done(mockReply(userText, context, imageDataUrl))); }, 600);
        });
      });
    }

    var userContent = imageDataUrl
      ? [{ type: "text", text: "Transcript:\n" + context + "\n\nQuestion: " + userText },
         { type: "image_url", image_url: { url: imageDataUrl } }]
      : ("Transcript:\n" + context + "\n\nQuestion: " + userText);
    var url = st.settings.llmBaseUrl.replace(/\/$/, "") + "/chat/completions";
    P().log("api", "POST " + url);
    window.electronAPI.logApiRequest(url);
    return fetchTimeout(url, {
      method: "POST",
      headers: { "Content-Type": "application/json",
        "Authorization": "Bearer " + st.settings.llmKey },
      body: JSON.stringify({
        model: st.settings.llmModel,
        messages: [
          { role: "system", content: asst.prompt },
          { role: "user", content: userContent },
        ],
      }),
    }).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    }).then(function (j) {
      var reply = (j.choices && j.choices[0] && j.choices[0].message.content) || "(no reply)";
      window.electronAPI.logApiResponse("ok");
      remember(userText, reply);
      window.Sessions.pushMessage("ai", reply);
      P().emit("chat", null);
      return reply;
    }).catch(function (e) {
      P().log("api", "failed: " + e.message + " — demo fallback", true);
      var reply = mockReply(userText, context);
      remember(userText, reply);
      window.Sessions.pushMessage("ai", reply);
      P().emit("chat", null);
      return reply;
    });
  }

  window.Chat = { ask: ask, summarize: summarize, activeAssistant: activeAssistant,
    history: function () { return hist.slice(); } };
})();
