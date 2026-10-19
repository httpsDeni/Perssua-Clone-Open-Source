/* Perssua Web — screens faithful to the original windows:
   Home (mainApp), All Sessions, Assistants library, Transcription catalog,
   Capture, AI Sources, Settings, Logs. */
(function () {
  "use strict";

  function P() { return window.Perssua; }
  function el() { return document.getElementById("view"); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;")
      .replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function go(name) {
    document.body.dataset.view = name;
    document.querySelectorAll("#nav button").forEach(function (b) {
      b.classList.toggle("active", b.dataset.go === name);
    });
    ({ home: vHome, quick: vQuick, sessions: vSessions, session: vSessionDetail, assistants: vAssistants,
       transcribe: vTranscribe, capture: vCapture, models: vModels,
       settings: vSettings, logs: vLogs, legal: vLegal,
       integrations: vIntegrations }[name] || vHome)();
    el().focus();
    if (window.I18N) window.I18N.translateTree(el());
  }

  var quick = { mic: null, speaker: null, agent: null, trx: null };

  function qBadge(id) {
    var v = quick[id];
    return "<span class='badge" + (v === true ? " live" : "") + "' data-qst='" + id + "'>" +
      (v === true ? "passed" : v === false ? "failed" : "not tested") + "</span>";
  }

  function qRefresh() {
    ["mic", "speaker", "agent", "trx"].forEach(function (id) {
      var b = el().querySelector("[data-qst='" + id + "']");
      if (!b) return;
      var v = quick[id];
      b.textContent = v === true ? "passed" : v === false ? "failed" : "not tested";
      b.classList.toggle("live", v === true);
    });
    var join = el().querySelector("[data-join]");
    if (join) join.disabled = !(quick.mic === true && quick.agent === true);
  }

  function vQuick() {
    el().innerHTML =
      "<h2>Quick Meeting</h2><p class='sub'>Test everything in under a minute, then join fast.</p>" +
      "<div class='glass-panel'><h3>1 · Microphone</h3>" +
      "<div class='audio-meter meter-wrap'><div data-micbar></div></div>" +
      "<div class='row'><button class='glass-button primary' data-q='mic'>Test microphone</button>" + qBadge("mic") + "</div></div>" +
      "<div class='glass-panel'><h3>2 · Speaker</h3>" +
      "<p class='glass-text-secondary'>Plays a short test tone.</p>" +
      "<label style='max-width:280px'>Output<select data-spk><option value=''>System default</option></select></label>" +
      "<div class='row'><button class='glass-button' data-refresh>Refresh devices</button>" +
      "<span class='glass-text-secondary' data-devnote></span></div>" +
      "<div class='row'><button class='glass-button primary' data-q='speaker'>Play tone</button>" +
      "<button class='glass-button' data-heard style='display:none'>I heard it</button>" + qBadge("speaker") + "</div></div>" +
      "<div class='glass-panel'><h3>3 · Agent</h3>" +
      "<p class='glass-text-secondary'>Sends a test question to the active provider and shows the reply.</p>" +
      "<div class='row'><button class='glass-button primary' data-q='agent'>Send test question</button>" + qBadge("agent") + "</div>" +
      "<div class='transcript' data-agentout style='margin-top:8px'></div></div>" +
      "<div class='glass-panel'><h3>4 · Transcription</h3>" +
      "<p class='glass-text-secondary'>Records a 6-second clip and transcribes it with your transcription provider.</p>" +
      "<div class='row'><button class='glass-button primary' data-q='trx'>Record &amp; transcribe test</button>" + qBadge("trx") + "</div>" +
      "<div class='transcript' data-trxout style='margin-top:8px'></div></div>" +
      "<div class='row'><button class='glass-button primary' data-join disabled>Join meeting now</button></div>";
    qRefresh();
    el().querySelectorAll("[data-q]").forEach(function (b) {
      b.onclick = function () { qRun(b.dataset.q, b); };
    });
    el().querySelector("[data-heard]").onclick = function () {
      quick.speaker = true; qRefresh();
      el().querySelector("[data-heard]").style.display = "none";
    };
    el().querySelector("[data-join]").onclick = function () {
      var s = window.Sessions.start("Quick meeting " + new Date().toLocaleTimeString());
      if (P().state.settings.transcriptionProvider !== "clip") window.Speech.start();
      P().log("quick", "joined: " + s.title);
      go("home");
    };
    el().querySelector("[data-refresh]").onclick = function () { fillOutputs(); };
    fillOutputs();
    if (navigator.mediaDevices && navigator.mediaDevices.ondevicechange !== undefined) {
      navigator.mediaDevices.ondevicechange = function () {
        if (el().querySelector("[data-spk]")) fillOutputs();
      };
    }
  }

  function qRun(which, btn) {
    if (which === "mic") return qMic(btn);
    if (which === "speaker") return qTone(btn);
    if (which === "agent") return qAgent(btn);
    if (which === "trx") return qTrx(btn);
  }

  function qMic(btn) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      quick.mic = false; qRefresh(); return;
    }
    btn.disabled = true;
    navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
      var Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) { stream.getTracks().forEach(function (t) { t.stop(); }); quick.mic = false; qRefresh(); btn.disabled = false; return; }
      var ctx = new Ctx();
      var an = ctx.createAnalyser();
      an.fftSize = 256;
      ctx.createMediaStreamSource(stream).connect(an);
      var data = new Uint8Array(an.frequencyBinCount);
      var bar = el().querySelector("[data-micbar]");
      var peak = 0, ticks = 0;
      P().log("quick", "mic test: speak now (3s)");
      var t = setInterval(function () {
        an.getByteFrequencyData(data);
        var sum = 0, i;
        for (i = 0; i < data.length; i++) sum += data[i];
        var lvl = Math.min(100, Math.round(sum / data.length * 1.2));
        if (lvl > peak) peak = lvl;
        if (bar) bar.style.width = lvl + "%";
        if (++ticks >= 30) {
          clearInterval(t);
          stream.getTracks().forEach(function (tr) { tr.stop(); });
          ctx.close();
          btn.disabled = false;
          quick.mic = peak > 4;
          P().log("quick", "mic peak: " + peak + (quick.mic ? " (signal OK)" : " (silence — check input)"));
          qRefresh();
          fillOutputs();
        }
      }, 100);
    }).catch(function (e) {
      btn.disabled = false;
      quick.mic = false; qRefresh();
      window.electronAPI.showMessageBox({ message: "Microphone blocked: " + e.message });
    });
  }

  function qTone(btn) {
    var Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) { quick.speaker = false; qRefresh(); return; }
    var sel = el().querySelector("[data-spk]");
    var sinkId = sel ? sel.value : "";
    var ctx = new Ctx();
    var label = btn.textContent;
    btn.disabled = true;
    btn.textContent = "Playing…";
    if (window.I18N) window.I18N.translateTree(btn.parentElement);
    var restore = function () { btn.disabled = false; btn.textContent = label; };
    var play = function () {
      if (ctx.state === "suspended") {
        restore();
        window.electronAPI.showMessageBox({ message: "Audio is suspended by the browser — click Play tone again." });
        P().log("quick", "tone blocked: context suspended", true);
        return;
      }
      var t0 = ctx.currentTime + 0.05;
      [[880, 0, 0.35], [660, 0.4, 0.35]].forEach(function (n) {
        var o = ctx.createOscillator();
        var g = ctx.createGain();
        o.frequency.value = n[0];
        g.gain.setValueAtTime(0.0001, t0 + n[1]);
        g.gain.exponentialRampToValueAtTime(0.5, t0 + n[1] + 0.03);
        g.gain.setValueAtTime(0.5, t0 + n[1] + n[2] - 0.05);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + n[1] + n[2]);
        o.connect(g);
        if (sinkId && typeof Audio !== "undefined") {
          var dest = ctx.createMediaStreamDestination();
          g.connect(dest);
          var audio = new Audio();
          audio.srcObject = dest.stream;
          var go = function () { o.start(t0 + n[1]); o.stop(t0 + n[1] + n[2] + 0.05); };
          if (audio.setSinkId) audio.setSinkId(sinkId).then(go).catch(go);
          else go();
        } else {
          g.connect(ctx.destination);
          o.start(t0 + n[1]);
          o.stop(t0 + n[1] + n[2] + 0.05);
        }
        o.onended = function () { restore(); try { ctx.close(); } catch (e) { /* closed */ } };
      });
    };
    if (ctx.resume) ctx.resume().then(play).catch(play);
    else play();
    el().querySelector("[data-heard]").style.display = "";
    P().log("quick", "tone played" + (sinkId ? " (routed output)" : " (default output)") + " — awaiting confirmation");
  }

  function fillOutputs() {
    var sel = el().querySelector("[data-spk]");
    var note = el().querySelector("[data-devnote]");
    if (!sel) return;
    sel.innerHTML = "<option value=''>System default</option>";
    var done = function (n) {
      if (note) note.textContent = n > 0
        ? (" " + n + " output(s) found — pick your headset.")
        : " No extra outputs — check Bluetooth pairing in Windows sound settings.";
      if (window.I18N) {
        window.I18N.translateTree(sel);
        if (note) window.I18N.translateTree(note.parentElement || note);
      }
    };
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) { done(0); return; }
    navigator.mediaDevices.enumerateDevices().then(function (devs) {
      if (!el().querySelector("[data-spk]")) return;
      var n = 0;
      devs.forEach(function (d) {
        if (d.kind !== "audiooutput" || !d.deviceId || d.deviceId === "default") return;
        n++;
        var o = document.createElement("option");
        o.value = d.deviceId;
        o.textContent = d.label || ("Output device " + n);
        sel.appendChild(o);
      });
      done(n);
    }).catch(function () { done(0); });
  }

  function qAgent(btn) {
    btn.disabled = true;
    window.Chat.ask("Reply with exactly: check OK").then(function (reply) {
      btn.disabled = false;
      var out = el().querySelector("[data-agentout]");
      if (out) out.textContent = reply;
      quick.agent = reply && reply.length > 0;
      P().log("quick", "agent test " + (quick.agent ? "passed" : "failed"));
      qRefresh();
    });
  }

  function qTrx(btn) {
    var out = el().querySelector("[data-trxout]");
    var prov = P().state.settings.transcriptionProvider;
    btn.disabled = true;
    var done = function (ok, text) {
      btn.disabled = false;
      quick.trx = ok;
      if (out) out.textContent = text;
      P().log("quick", "transcription test " + (ok ? "passed" : "failed"));
      qRefresh();
    };
    if (prov === "clip") {
      window.WavRec.start(6).then(function () {
        if (out) out.textContent = "Recording 6s — speak now…";
        setTimeout(function () {
          var clip = window.WavRec.stop();
          fetch("/api/transcribe", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ audioBase64: window.WavRec.toBase64(clip.wav) }),
          }).then(function (r) { return r.json(); }).then(function (j) {
            if (j.error) throw new Error(j.error);
            done(true, (j.text || "").trim() || "(no speech detected — mic works, voice not recognized)");
          }).catch(function (e) {
            var hint = "";
            try {
              if (typeof location !== "undefined" && location.protocol === "file:") {
                hint = " — open the app via http://127.0.0.1:8080/ instead of the file";
              }
            } catch (err) { /* unknown */ }
            done(false, "Failed: " + e.message + hint);
          });
        }, 6000);
      }).catch(function (e) { btn.disabled = false; done(false, "Microphone failed: " + e.message); });
      return;
    }
    if (!window.Speech.supported()) { done(false, "Web Speech unavailable in this browser."); return; }
    try {
      var Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
      var rec = new Ctor();
      rec.lang = P().state.settings.speechLang || "pt-BR";
      rec.interimResults = false;
      rec.continuous = false;
      var got = "";
      if (out) out.textContent = "Listening 6s — speak now…";
      rec.onresult = function (ev) { got += ev.results[0][0].transcript + " "; };
      rec.onerror = function () { done(false, "Recognition error — check microphone permission."); };
      rec.onend = function () {
        done(got.trim().length > 0, got.trim() || "(nothing recognized — mic works, speech not detected)");
      };
      rec.start();
      setTimeout(function () { try { rec.stop(); } catch (e) { /* ended */ } }, 6000);
    } catch (e) { done(false, "Failed: " + e.message); }
  }

  var detailId = null;
  function goSession(id) { detailId = id; go("session"); }

  function vSessionDetail() {
    var st = P().state;
    var x = st.sessions.find(function (s) { return s.id === detailId; });
    if (!x) { go("sessions"); return; }
    var finals = x.transcript.filter(function (t) { return t.final; });
    el().innerHTML =
      "<h2>" + esc(x.title || "Untitled session") + "</h2>" +
      "<p class='sub'>" + new Date(x.started).toLocaleString() + " · " +
      x.messages.length + " msgs · " + finals.length + " transcript lines" +
      (x.ended ? " · ended" : " · active") + "</p>" +
      "<div class='row'><button class='glass-button' data-back>← All Sessions</button>" +
      "<button class='glass-button primary' data-sum>Generate summary</button>" +
      "<button class='glass-button' data-mail>Send summary by email</button></div>" +
      "<div class='glass-panel'><h3>Transcript</h3><div class='transcript'>" +
      (finals.map(function (t) { return "<div>· " + esc(t.text) + "</div>"; }).join("") ||
        "<span class='glass-text-secondary'>No transcript yet.</span>") + "</div></div>" +
      "<div class='glass-panel'><h3>Conversation</h3><div class='chatlog'>" +
      (x.messages.map(function (m) {
        return "<div class='msg " + (m.who === "me" ? "me" : "ai") + "'><div class='who'>" +
          (m.who === "me" ? "You" : "Assistant") + "</div>" + esc(m.text) + "</div>";
      }).join("") || "<p class='muted'>No messages yet.</p>") + "</div></div>";
    el().querySelector("[data-back]").onclick = function () { go("sessions"); };
    el().querySelector("[data-sum]").onclick = function () {
      var prev = st.activeSession;
      st.activeSession = x.id;
      window.Chat.summarize().then(function () {
        st.activeSession = prev; P().save(); go("session");
      });
    };
    el().querySelector("[data-mail]").onclick = function () {
      window.electronAPI.showMessageBox({ message: "Memory assistant e-mail sent to your account e-mail." });
    };
  }

  function vHome() {
    var st = P().state, s = window.Sessions.current();
    var asst = window.Chat.activeAssistant();
    var totalMsgs = st.sessions.reduce(function (n, x) { return n + x.messages.length; }, 0);
    var recent = st.sessions.slice(0, 5).map(function (x) {
      return "<li><span class='grow'><strong><a href='#' data-open='" + x.id + "'>" + esc(x.title) +
        "</a></strong><br>" +
        "<span class='glass-text-secondary'>" + new Date(x.started).toLocaleString() +
        " · " + x.messages.length + " msgs</span></span>" +
        "<button class='glass-button' data-resume='" + x.id + "'>Resume</button></li>";
    }).join("");

    el().innerHTML =
      "<h2>Home</h2><p class='sub'>Your AI companion — stealth copilot for meetings and code.</p>" +
      "<div class='glass-panel'><strong>Action Bar</strong>" +
      "<div class='row'><button class='glass-button' data-act='ask'>Ask about this meeting…</button>" +
      "<button class='glass-button' data-act='record'>● Record</button>" +
      "<button class='glass-button' data-act='stealth'>Stealth Mode: " + (st.settings.stealth ? "ON" : "OFF") + "</button>" +
      "<button class='glass-button' data-act='click'>Click-Through: " + (st.settings.clickThrough ? "on" : "off") + "</button>" +
      "<button class='glass-button' data-act='summary'>Transcription &amp; summary</button></div></div>" +
      "<div class='glass-panel'><h3>Active Session</h3>" +
      (s ? "<p><strong>" + esc(s.title) + "</strong></p>" +
        "<div class='row'><button class='glass-button' data-end>End Session</button></div>"
        : "<p class='glass-text-secondary'>No active session.</p>" +
        "<div class='row'><button class='glass-button primary' data-start>Start a Conversation</button></div>") + "</div>" +
      "<div class='glass-panel'><h3>Current Assistant</h3>" +
      "<p>" + esc(asst ? asst.name : "No assistant selected") + "</p>" +
      "<div class='row'><button class='glass-button' data-switch>Switch Assistant</button>" +
      "<button class='glass-button' data-manage>Manage Assistants</button></div></div>" +
      "<div class='glass-panel'><h3>Open source — free forever</h3>" +
      "<p class='glass-text-secondary'>No account, no trial, no paywall. Every feature is unlocked: " +
      st.sessions.length + " sessions · " + totalMsgs + " messages.</p>" +
      "<div class='row'><button class='glass-button' data-ref>Generate referral code</button>" +
      "<span class='glass-text-secondary mono' data-refout></span></div></div>" +
      "<div class='glass-panel'><h3>Recent Sessions</h3>" +
      "<ul class='list'>" + (recent || "<li class='glass-text-secondary'>No sessions yet.</li>") + "</ul>" +
      "<div class='row'><button class='glass-button' data-all>All Sessions</button></div></div>" +
      "<div class='glass-panel'><h3>Tips</h3><div class='row'>" +
      "<button class='glass-button' data-tip='record'>Record and transcribe voice for AI analysis</button>" +
      "<button class='glass-button' data-tip='shot'>Capture Screen — screenshot for visual analysis</button>" +
      "<button class='glass-button' data-tip='ask'>Ask Something — type a question for the AI</button></div></div>" +
      "<div class='glass-panel'><h3>Stealth Mode</h3><p>" +
      (st.settings.stealth ? "Application is Invisible" : "Application is Visible") + "</p>" +
      "<p class='glass-text-secondary'><button class='glass-button' data-stealth>Toggle stealth</button> " +
      "<button class='glass-button' data-privacy>Manage Privacy</button></p></div>";

    bindHome();
  }

  function bindHome() {
    var q = function (sel) { return el().querySelector(sel); };
    var qa = function (sel) { return el().querySelectorAll(sel); };
    var nb = q("[data-start]");
    if (nb) nb.onclick = function () { window.Sessions.start(); go("home"); };
    var eb = q("[data-end]");
    if (eb) eb.onclick = confirmEndSession;
    qa("[data-resume]").forEach(function (b) {
      b.onclick = function () { window.Sessions.resume(b.dataset.resume); go("home"); };
    });
    qa("[data-open]").forEach(function (a) {
      a.onclick = function (e) { e.preventDefault(); goSession(a.dataset.open); };
    });
    var sw = q("[data-switch]"); if (sw) sw.onclick = function () { go("assistants"); };
    var mg = q("[data-manage]"); if (mg) mg.onclick = function () { go("assistants"); };
    var al = q("[data-all]"); if (al) al.onclick = function () { go("sessions"); };
    var sth = q("[data-stealth]");
    if (sth) sth.onclick = function () {
      var on = !P().state.settings.stealth;
      window.electronAPI.applyStealthyMode(on); go("home");
    };
    var pv = q("[data-privacy]"); if (pv) pv.onclick = function () { go("settings"); };
    var rf = q("[data-ref]");
    if (rf) rf.onclick = function () {
      q("[data-refout]").textContent = "Your code: " + referralCode();
    };
    qa("[data-act]").forEach(function (b) {
      b.onclick = function () { actionBar(b.dataset.act); };
    });
    qa("[data-tip]").forEach(function (b) {
      b.onclick = function () {
        if (b.dataset.tip === "record") go("transcribe");
        else if (b.dataset.tip === "shot") go("capture");
        else go("sessions");
      };
    });
  }

  function actionBar(act) {
    if (act === "ask") go("sessions");
    else if (act === "record") go("transcribe");
    else if (act === "stealth") {
      var on = !P().state.settings.stealth;
      window.electronAPI.applyStealthyMode(on); go("home");
    } else if (act === "click") {
      P().state.settings.clickThrough = !P().state.settings.clickThrough;
      P().save(); go("home");
    } else if (act === "summary") go("transcribe");
  }

  function confirmEndSession() {
    var m = modal("<h2>End session?</h2><p>Send summary by email?</p>" +
      "<div class='row'><button class='glass-button primary' data-yes>Yes, end &amp; email</button>" +
      "<button class='glass-button' data-no>End without email</button></div>");
    m.querySelector("[data-yes]").onclick = function () {
      window.Sessions.end(); closeModal();
      window.electronAPI.showMessageBox({ message: "Memory assistant e-mail sent to your account e-mail." });
      go("home");
    };
    m.querySelector("[data-no]").onclick = function () {
      window.Sessions.end(); closeModal(); go("home");
    };
  }

  function vSessions() {
    var st = P().state;
    el().innerHTML =
      "<h2>All Sessions</h2><p class='sub'>Search all past sessions by title, date, summary, or transcript content.</p>" +
      "<div class='row'><input id='sq' placeholder='Search sessions…' aria-label='Search sessions'>" +
      "<button class='glass-button primary' data-new>Start a Conversation</button></div>" +
      "<ul class='list' id='slist'></ul>" +
      "<div class='glass-panel'><h3>Ask Something</h3>" +
      "<p class='glass-text-secondary'>Type a question or prompt for the AI. Uses the active session.</p>" +
      "<div class='chatlog' id='chatlog'></div>" +
      "<div class='row'><input id='chat-in' placeholder='Ask Something…' aria-label='Question'>" +
      "<button class='glass-button primary' data-ask>Ask</button></div></div>";
    var render = function (filter) {
      var f = (filter || "").toLowerCase();
      var items = st.sessions.filter(function (x) {
        if (!f) return true;
        var hay = (x.title + " " + window.Sessions.transcriptText(x) + " " +
          x.messages.map(function (m) { return m.text; }).join(" ")).toLowerCase();
        return hay.indexOf(f) >= 0;
      }).map(function (x) {
        return "<li><span class='grow'><strong><a href='#' data-open='" + x.id + "'>" +
          esc(x.title || "Untitled session") + "</a></strong><br>" +
          "<span class='glass-text-secondary'>" + new Date(x.started).toLocaleString() + " · " +
          x.messages.length + " msgs" + (x.ended ? " · ended" : " · active") + "</span></span>" +
          (st.activeSession === x.id
            ? "<button class='glass-button' data-end>End Session</button>"
            : "<button class='glass-button' data-resume='" + x.id + "'>Resume</button>") +
          " <button class='glass-button danger' data-del='" + x.id + "'>Delete</button></li>";
      }).join("");
      el().querySelector("#slist").innerHTML = items ||
        "<li class='glass-text-secondary'>No matching past sessions found.</li>";
      el().querySelectorAll("[data-open]").forEach(function (a) {
        a.onclick = function (e) { e.preventDefault(); goSession(a.dataset.open); };
      });
      el().querySelectorAll("[data-resume]").forEach(function (b) {
        b.onclick = function () { window.Sessions.resume(b.dataset.resume); go("sessions"); };
      });
      var eb = el().querySelector("[data-end]");
      if (eb) eb.onclick = confirmEndSession;
      el().querySelectorAll("[data-del]").forEach(function (b) {
        b.onclick = function () {
          if (window.confirm("Delete this session?")) { window.Sessions.remove(b.dataset.del); render(el().querySelector("#sq").value); }
        };
      });
    };
    render("");
    el().querySelector("#sq").oninput = function (e) { render(e.target.value); };
    el().querySelector("[data-new]").onclick = function () {
      if (window.Sessions.current()) {
        window.electronAPI.showMessageBox({ message: "End the current active session before resuming another one." });
        return;
      }
      window.Sessions.start(); go("sessions");
    };
    renderChat();
    var ask = function () {
      var inp = el().querySelector("#chat-in");
      if (!inp.value.trim()) return;
      var v = inp.value; inp.value = "";
      window.Chat.ask(v).then(renderChat);
    };
    el().querySelector("[data-ask]").onclick = ask;
    el().querySelector("#chat-in").onkeydown = function (e) { if (e.key === "Enter") ask(); };
  }

  function renderChat() {
    var box = document.getElementById("chatlog");
    if (!box) return;
    var s = window.Sessions.current();
    var msgs = s ? s.messages : [];
    box.innerHTML = msgs.map(function (m) {
      return "<div class='msg " + (m.who === "me" ? "me" : "ai") + "'><div class='who'>" +
        (m.who === "me" ? "You" : esc(window.Chat.activeAssistant().name)) + "</div>" +
        esc(m.text) + "</div>";
    }).join("") || "<p class='muted'>No messages yet.</p>";
    box.scrollTop = box.scrollHeight;
  }

  function vAssistants() {
    var st = P().state;
    var pt = window.I18N && window.I18N.lang() === "pt";
    var descFor = function (a) {
      if (pt && a.blurbPt) return a.blurbPt;
      if (a.blurb) return a.blurb;
      return a.prompt.slice(0, 90) + "…";
    };
    var items = st.assistants.map(function (a) {
      return "<li><span class='grow'><strong>" + esc(a.name) + "</strong>" +
        (a.custom ? "" : " <span class='badge'>built-in</span>") + "<br>" +
        "<span class='glass-text-secondary mono'>" + esc(descFor(a)) + "</span></span>" +
        (st.activeAssistant === a.id ? "<span class='badge live'>active</span>"
          : "<button class='glass-button' data-sel='" + a.id + "'>Use</button>") +
        (a.custom ? " <button class='glass-button danger' data-rm='" + a.id + "'>Delete</button>" : "") + "</li>";
    }).join("");
    el().innerHTML =
      "<h2>Assistants</h2><p class='sub'>Assistant Library. Only custom assistants can be deleted.</p>" +
      "<ul class='list'>" + items + "</ul>" +
      "<div class='row'><button class='glass-button' data-new>New assistant</button>" +
      "<button class='glass-button' data-imp>Import</button>" +
      "<button class='glass-button' data-exp>Export</button>" +
      "<button class='glass-button' data-studio>Review Web Studio proposal</button></div>" +
      "<div class='glass-panel' data-form style='display:none'><h3>New assistant</h3>" +
      "<label>Name<input id='an'></label><label>Prompt<textarea id='ap' rows='3'></textarea></label>" +
      "<label><span><input type='checkbox' id='ac' style='width:auto'> Only reply when certain</span></label>" +
      "<div class='row'><button class='glass-button primary' data-save>Save</button>" +
      "<button class='glass-button' data-cancel>Cancel</button></div></div>";
    el().querySelectorAll("[data-sel]").forEach(function (b) {
      b.onclick = function () { window.electronAPI.assistants.select(b.dataset.sel); go("assistants"); };
    });
    el().querySelectorAll("[data-rm]").forEach(function (b) {
      b.onclick = function () {
        if (window.confirm("Delete this assistant?")) {
          st.assistants = st.assistants.filter(function (a) { return a.id !== b.dataset.rm; });
          if (st.activeAssistant === b.dataset.rm) st.activeAssistant = st.assistants[0].id;
          P().save(); go("assistants");
        }
      };
    });
    var form = el().querySelector("[data-form]");
    el().querySelector("[data-new]").onclick = function () { form.style.display = "block"; };
    el().querySelector("[data-cancel]").onclick = function () { form.style.display = "none"; };
    el().querySelector("[data-save]").onclick = function () {
      var n = el().querySelector("#an").value.trim(), p = el().querySelector("#ap").value.trim();
      if (!n || !p) return;
      st.assistants.push({ id: "a" + Date.now(), name: n, prompt: p, custom: true,
        certain: el().querySelector("#ac").checked });
      P().save(); go("assistants");
    };
    el().querySelector("[data-imp]").onclick = function () {
      var f = document.createElement("input");
      f.type = "file"; f.accept = "application/json";
      f.onchange = function () {
        if (!f.files.length) return;
        var r = new FileReader();
        r.onload = function () {
          try {
            var arr = JSON.parse(r.result);
            (Array.isArray(arr) ? arr : [arr]).forEach(function (a, i) {
              if (a && a.name && a.prompt) {
                st.assistants.push({ id: "imp" + Date.now() + i, name: String(a.name),
                  prompt: String(a.prompt), custom: true });
              }
            });
            P().save(); P().log("assistants", "imported");
            go("assistants");
          } catch (e) {
            window.electronAPI.showMessageBox({ message: "Invalid assistants file." });
          }
        };
        r.readAsText(f.files[0]);
      };
      f.click();
    };
    el().querySelector("[data-exp]").onclick = function () {
      var blob = new Blob([JSON.stringify(st.assistants, null, 1)], { type: "application/json" });
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob); a.download = "perssua-assistants.json"; a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
    };
    el().querySelector("[data-studio]").onclick = externalConfirm;
  }

  function externalConfirm() {
    var m = modal("<h2>Perssua assistant review</h2>" +
      "<p class='glass-text-secondary'>This proposal came from the Web Studio. Nothing is saved until you confirm it here.</p>" +
      "<p><strong>Create this assistant?</strong></p>" +
      "<p class='glass-text-secondary'>You stay in control · First message · Session goal · " +
      "Follow-up suggestions · Summary and email prompt · Live Notch prompt · No specialized prompt</p>" +
      "<div class='row'><button class='glass-button primary' data-yes>Create assistant</button>" +
      "<button class='glass-button' data-no>Discard</button></div>");
    m.querySelector("[data-yes]").onclick = function () {
      P().state.assistants.push({ id: "a" + Date.now(), name: "Studio Assistant",
        prompt: "Assist with meeting follow-ups and summaries.", custom: true });
      P().save(); closeModal(); go("assistants");
    };
    m.querySelector("[data-no]").onclick = closeModal;
  }

  function isFirefox() {
    try { return /firefox/i.test(navigator.userAgent || ""); }
    catch (e) { return false; }
  }

  function vTranscribe() {
    var on = window.Speech.isRunning();
    var tp = P().state.settings.transcriptionProvider;
    var s = window.Sessions.current();
    var finals = s ? s.transcript.filter(function (x) { return x.final; }) : [];
    el().innerHTML =
      "<h2>Transcription</h2><p class='sub'>Record and transcribe voice for AI analysis.</p>" +
      (isFirefox() ? "<div class='glass-panel'><h3>Firefox detected</h3>" +
        "<p class='glass-text-secondary'>Firefox can't capture tab audio or do live Web Speech transcription. " +
        "Use Chrome/Edge for those, or here: record a <strong>local clip</strong> (mic works) and transcribe " +
        "it via the bridge with Muse voice.</p></div>" : "") +
      "<div class='row'><button class='glass-button primary' data-t>" + (on ? "Stop" : "Record") + "</button>" +
      "<button class='glass-button' data-meter>Test microphone</button>" +
      "<span class='badge" + (on ? " live" : "") + "'>" + (on ? "listening" : "idle") + "</span>" +
      "<label style='max-width:280px'>Provider<select id='tp'>" +
      [["live", "GPT Live Transcribe — low-latency streaming with context and language hints"],
       ["realtime", "GPT Realtime Whisper — realtime transcript deltas"],
       ["accurate", "GPT-4o Transcribe — higher accuracy, no streaming"],
       ["mini", "GPT-4o Mini Transcribe — faster and cost-effective"],
       ["clip", "Muse voice — local clip via bridge (wav)"]
      ].map(function (o) {
        return "<option value='" + o[0] + "'" + (tp === o[0] ? " selected" : "") + ">" + o[1] + "</option>";
      }).join("") + "</select></label>" +
      "<label style='max-width:200px'>Mic<select id='mlang'>" +
      [["pt-BR", "Português (BR)"], ["en-US", "English (US)"]].map(function (o) {
        return "<option value='" + o[0] + "'" + ((P().state.settings.speechLang || "pt-BR") === o[0] ? " selected" : "") + ">" + o[1] + "</option>";
      }).join("") + "</select></label></div>" +
      "<div class='glass-panel'><h3>Cloud transcription (paid, more accurate)</h3>" +
      "<p class='glass-text-secondary'>Optional. With a key, the GPT options above transcribe meeting-tab windows " +
      "and mic clips via the Whisper cloud API. Without a key, the free engines are used (browser speech / Muse bridge).</p>" +
      "<label>Base URL<input id='tbu' value='" + esc(P().state.settings.trxBaseUrl) + "'></label>" +
      "<label>API key<input id='tbk' type='password' value='" + esc(P().state.settings.trxKey) +
      "' placeholder='sk-…'></label>" +
      "<div class='row'><button class='glass-button primary' data-trxsave>Save</button> " +
      "<span class='badge' data-trxst>" + (window.Whisper && window.Whisper.configured() ? "key set" : "no key") + "</span></div></div>" +
      "<div class='glass-panel' data-clipbox style='display:" + (tp === "clip" ? "block" : "none") + "'>" +
      "<h3>Local clip</h3><p class='glass-text-secondary'>Records microphone to wav (max 60s), " +
      "then transcribes with <span class='mono'>muse voice transcribe</span> via the bridge.</p>" +
      "<div class='row'><button class='glass-button primary' data-clip>Record clip</button>" +
      "<span class='badge' data-clipst>idle</span></div></div>" +
      "<div class='audio-meter meter-wrap'><div id='micmeter'></div></div>" +
      "<div class='glass-panel'><h3>Their audio (meeting tab)</h3>" +
      "<p class='glass-text-secondary'>Your mic only hears YOU. To hear the other side:</p>" +
      "<ol class='glass-text-secondary'><li>Click the button, pick <strong>Chrome Tab</strong> (not Entire Screen).</li>" +
      "<li>Choose the Meet tab.</li>" +
      "<li>Turn <strong>Share tab audio</strong> ON (bottom-left switch), then Share.</li></ol>" +
      "<p class='glass-text-secondary'>Rolling windows are transcribed (10s with cloud key, 20s with the free bridge).</p>" +
      "<div class='row'><button class='glass-button primary' data-theirs>Share meeting tab audio</button>" +
      "<button class='glass-button' data-screen>Share screen audio (fallback)</button>" +
      "<span class='badge' data-theirsst>idle</span></div>" +
      "<label style='margin-top:10px'><span><input type='checkbox' data-auto" +
      (P().state.settings.autoAnswer ? " checked" : "") +
      " style='width:auto'> Auto-answer the other side's questions (popup)</span></label></div>" +
      "<div class='glass-panel'><h3>Live transcript</h3><div class='transcript' id='trx'></div></div>" +
      "<div class='glass-panel'><h3>Transcription catalog</h3><div class='transcript' id='trxcat'></div></div>";
    renderTrx();
    renderCat();
    P().on("transcript", function () { renderTrx(); renderCat(); });
    el().querySelector("[data-t]").onclick = function () {
      if (window.Speech.isRunning()) window.Speech.stop(); else window.Speech.start();
      go("transcribe");
    };
    el().querySelector("#tp").onchange = function (e) {
      P().state.settings.transcriptionProvider = e.target.value; P().save();
      go("transcribe");
    };
    var mlang = el().querySelector("#mlang");
    if (mlang) mlang.onchange = function (e) {
      P().state.settings.speechLang = e.target.value; P().save();
      P().log("speech", "mic language: " + e.target.value);
      if (window.Speech.isRunning()) { window.Speech.stop(); window.Speech.start(); }
      go("transcribe");
    };
    el().querySelector("[data-meter]").onclick = function () { micMeter(); };
    var trxSave = el().querySelector("[data-trxsave]");
    if (trxSave) trxSave.onclick = function () {
      P().state.settings.trxBaseUrl = el().querySelector("#tbu").value.trim() || "https://api.openai.com/v1";
      P().state.settings.trxKey = el().querySelector("#tbk").value.trim();
      P().save(); P().log("models", "transcription key saved");
      window.electronAPI.showMessageBox({ message: "Transcription key saved." });
      go("transcribe");
    };
    var clipBtn = el().querySelector("[data-clip]");
    if (clipBtn) clipBtn.onclick = function () { recordClip(clipBtn); };
    var theirsBtn = el().querySelector("[data-theirs]");
    var theirsSt = el().querySelector("[data-theirsst]");
    var setTheirs = function (m) {
      if (theirsSt) theirsSt.textContent = m;
      if (theirsBtn) theirsBtn.textContent =
        window.TheirAudio.isLive() ? "Stop tab audio" : "Share meeting tab audio";
      if (window.I18N && theirsSt) window.I18N.translateTree(theirsSt.parentElement);
      if (window.I18N && theirsBtn) window.I18N.translateTree(theirsBtn.parentElement);
    };
    P().on("their-audio", setTheirs);
    var startFlow = function (mode) {
      if (window.TheirAudio.isLive()) { window.TheirAudio.stop(); setTheirs("idle"); return; }
      // Full conversation: tab audio (them) + live mic (you) together.
      if (window.Speech && !window.Speech.isRunning() && window.Speech.supported()) {
        if (window.Speech.start()) P().log("their-audio", "mic live on too (both sides transcribed)");
      }
      window.TheirAudio.start(setTheirs, mode).catch(function (e) {
        setTheirs("idle");
        window.electronAPI.showMessageBox({ message: "Tab audio failed: " + e.message });
      });
    };
    theirsBtn.onclick = function () { startFlow("tab"); };
    el().querySelector("[data-screen]").onclick = function () { startFlow("screen"); };
    var autoBox = el().querySelector("[data-auto]");
    if (autoBox) autoBox.onchange = function () {
      P().state.settings.autoAnswer = autoBox.checked;
      P().save();
      if (autoBox.checked && window.AutoAnswer) window.AutoAnswer.scan();
    };
  }

  function recordClip(btn) {
    var st = el().querySelector("[data-clipst]");
    if (window.WavRec.isRecording()) {
      var clip = window.WavRec.stop();
      if (st) st.textContent = "transcribing…";
      btn.disabled = true;
      var tp = P().state.settings.transcriptionProvider;
      var useCloud = tp !== "clip" && window.Whisper && window.Whisper.configured();
      P().log("clip", "recorded " + clip.seconds + "s, sending to " + (useCloud ? "cloud" : "bridge"));
      var req = useCloud
        ? window.Whisper.transcribe(clip.wav, tp).then(function (text) { return { text: text }; })
        : fetch("/api/transcribe", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ audioBase64: window.WavRec.toBase64(clip.wav) }),
          }).then(function (r) { return r.json(); });
      req.then(function (j) {
        btn.disabled = false;
        if (j.error) throw new Error(j.error);
        var text = (j.text || "").trim() || "(no speech detected)";
        window.Sessions.pushTranscript(text, true, "me");
        if (st) st.textContent = "done";
        renderTrx();
      }).catch(function (e) {
        btn.disabled = false;
        if (st) st.textContent = "failed";
        P().log("clip", "transcribe failed: " + e.message, true);
        window.electronAPI.showMessageBox({ message: "Transcription failed: " + e.message });
      });
      return;
    }
    window.WavRec.start(60).then(function () {
      if (st) st.textContent = "recording… (tap again to stop)";
      btn.textContent = "Stop & transcribe";
    }).catch(function (e) {
      window.electronAPI.showMessageBox({ message: "Microphone failed: " + e.message });
    });
  }

  var meterStream = null;
  function micMeter() {
    var bar = document.getElementById("micmeter");
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      window.electronAPI.showMessageBox({ message: "Microphone test unavailable in this browser." });
      return;
    }
    if (meterStream) {
      meterStream.getTracks().forEach(function (t) { t.stop(); });
      meterStream = null;
      if (bar) bar.style.width = "0";
      return;
    }
    navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
      meterStream = stream;
      var Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      var ctx = new Ctx();
      var src = ctx.createMediaStreamSource(stream);
      var an = ctx.createAnalyser();
      an.fftSize = 256;
      src.connect(an);
      var data = new Uint8Array(an.frequencyBinCount);
      var tick = function () {
        if (!meterStream) return;
        an.getByteFrequencyData(data);
        var sum = 0;
        for (var i = 0; i < data.length; i++) sum += data[i];
        var lvl = Math.min(100, Math.round(sum / data.length * 1.2));
        if (bar) bar.style.width = lvl + "%";
        requestAnimationFrame(tick);
      };
      tick();
      P().log("audio", "microphone test running");
    }).catch(function () {
      window.electronAPI.showMessageBox({ message: "Audio access is blocked. Allow access and try the check again." });
    });
  }

  function renderTrx() {
    var t = document.getElementById("trx");
    if (!t) return;
    var s = window.Sessions.current();
    if (!s || !s.transcript.length) { t.innerHTML = "<span class='muted'>Nothing recorded yet.</span>"; return; }
    var en = P().state.settings.lang === "en";
    // Live view: their side only — your mic stays in history/context.
    var rows = s.transcript.filter(function (x) { return x.who !== "me"; }).slice(-30);
    if (!rows.length) { t.innerHTML = "<span class='muted'>Nothing recorded yet.</span>"; return; }
    t.innerHTML = rows.map(function (x) {
      var tag = x.who === "me" ? (en ? "me: " : "eu: ") : x.who === "them" ? (en ? "them: " : "eles: ") : "";
      return "<div class='" + (x.final ? "" : "interim") + "'>" + esc(tag + x.text) + "</div>";
    }).join("");
  }

  function renderCat() {
    var c = document.getElementById("trxcat");
    if (!c) return;
    var s = window.Sessions.current();
    var finals = s ? s.transcript.filter(function (x) { return x.final; }) : [];
    c.innerHTML = finals.length ? finals.map(function (x) {
      return "<div>· " + esc(x.text) + "</div>";
    }).join("") : "<span class='muted'>Nothing recorded yet.</span>";
  }

  function vCapture() {
    el().innerHTML =
      "<h2>Capture Screen</h2><p class='sub'>Take a screenshot for visual analysis. " +
      "The browser asks which screen to share on every capture.</p>" +
      "<div class='row'><button class='glass-button primary' data-shot>Capture Screen</button>" +
      "<button class='glass-button' data-analyze>Analyze screen</button>" +
      "<button class='glass-button' data-dl>Download</button>" +
      "<button class='glass-button' data-clip>Read clipboard</button></div>" +
      "<p class='glass-text-secondary'>Automatic OCR needs an extra library — attach the screenshot to your question instead.</p>" +
      "<div id='shotbox' style='margin-top:12px'></div>";
    var show = function (url) {
      el().querySelector("#shotbox").innerHTML =
        "<canvas class='shot' id='cv'></canvas><div class='row' style='margin-top:8px'>" +
        "<button class='glass-button' data-dl2>Download PNG</button></div>";
      var img = new Image();
      img.onload = function () {
        var cv = el().querySelector("#cv");
        cv.width = img.width; cv.height = img.height;
        cv.getContext("2d").drawImage(img, 0, 0);
        el().querySelector("[data-dl2]").onclick = function () { window.Capture.downloadShot(); };
      };
      img.src = url;
    };
    if (window.Capture.last()) show(window.Capture.last());
    el().querySelector("[data-shot]").onclick = function () {
      window.Capture.screenshot().then(show).catch(function (e) {
        window.electronAPI.showMessageBox({ message: "Capture failed: " + e.message });
      });
    };
    el().querySelector("[data-dl]").onclick = function () { window.Capture.downloadShot(); };
    el().querySelector("[data-analyze]").onclick = function () {
      var shot = window.Capture.last();
      if (!shot) {
        window.electronAPI.showMessageBox({ message: "Capture a screen first." });
        return;
      }
      var s = window.Sessions.current() || window.Sessions.start();
      window.Chat.ask("Analyze this screenshot and surface concise next steps.", shot).then(function () {
        go("sessions");
      });
    };
    el().querySelector("[data-clip]").onclick = function () {
      window.Capture.readClipboard().then(function (t) {
        window.electronAPI.showMessageBox({ message: t ? "Clipboard: " + t.slice(0, 300) : "Clipboard is empty or permission denied." });
      });
    };
  }

  function vModels() {
    var s = P().state.settings;
    el().innerHTML =
      "<h2>AI Sources</h2><p class='sub'>Settings → AI Sources. Bring your own API key (OpenAI or Google Gemini), or use the included trial credit.</p>" +
      "<div class='glass-panel'><h3>Provider</h3><div class='row'>" +
      [["openai", "OpenAI"], ["gemini", "Google Gemini"], ["custom", "Custom API"],
       ["claudecode", "Claude Code CLI"], ["muse", "Muse (Meta)"],
       ["local", "Local Models"], ["apple", "Apple Speech (native)"]
      ].map(function (o) {
        return "<button class='glass-button" + (s.provider === o[0] ? " primary" : "") + "' data-p='" + o[0] + "'>" + o[1] + "</button>";
      }).join("") + "</div>" +
      "<div id='prov' style='margin-top:12px'></div></div>" +
      "<div class='glass-panel'><h3>Local Models</h3>" +
      "<p class='glass-text-secondary'>No local models have been downloaded yet. " +
      "The web build cannot run Ollama / LM Studio / HuggingFace models — " +
      "point a Custom API at your local server instead (e.g. http://localhost:11434/v1).</p>" +
      "<p class='glass-text-secondary'>GPU: " + (navigator.gpu ? "WebGPU available" : "WebGPU unavailable") + ".</p></div>";
    var renderProv = function () {
      var box = el().querySelector("#prov");
      if (s.provider === "custom") {
        box.innerHTML = "<label>Base URL<input id='cbu' value='" + esc(s.customApiBaseUrl) + "' placeholder='http://localhost:11434/v1'></label>" +
          "<label>Model<input id='cmo' value='" + esc(s.customApiModel) + "'></label>" +
          "<div class='row'><button class='glass-button primary' data-save>Save</button></div>";
        box.querySelector("[data-save]").onclick = function () {
          s.customApiBaseUrl = box.querySelector("#cbu").value.trim();
          s.customApiModel = box.querySelector("#cmo").value.trim();
          s.llmBaseUrl = s.customApiBaseUrl || s.llmBaseUrl;
          s.llmModel = s.customApiModel || s.llmModel;
          P().save(); P().log("models", "custom API saved");
        };
      } else if (s.provider === "local" || s.provider === "apple") {
        box.innerHTML = "<p class='glass-text-secondary'>" +
          (s.provider === "local" ? "Local model runtime is desktop-only." : "Apple Speech is macOS-only.") +
          " On the web, transcription runs in the browser and answers come from the API above.</p>";
      } else if (s.provider === "claudecode" || s.provider === "muse") {
        box.innerHTML = "<p class='glass-text-secondary' data-bridge>Bridge: checking…</p>" +
          "<label>CLI model (optional)<input id='cm' value='" + esc(s.cliModel || "") +
          "' placeholder='empty = CLI default'></label>" +
          "<div class='row'><button class='glass-button primary' data-save>Save</button> " +
          "<button class='glass-button' data-test>Test</button></div>" +
          "<p class='glass-text-secondary'>Requires the bridge: run <span class='mono'>node server.js</span> " +
          "and open http://127.0.0.1:8080/. Answers come from your installed CLI.</p>";
        var status = box.querySelector("[data-bridge]");
        if (typeof fetch !== "undefined") {
          fetch("/api/bridge").then(function (r) { return r.json(); }).then(function (j) {
            var v = s.provider === "muse" ? j.muse : j.claude;
            status.textContent = "Bridge: " + (v ? "online (" + v + ")" : "CLI not found — check install/PATH");
          }).catch(function () { status.textContent = "Bridge: offline — run node server.js"; });
        } else { status.textContent = "Bridge: offline — run node server.js"; }
        box.querySelector("[data-save]").onclick = function () {
          s.cliModel = box.querySelector("#cm").value.trim(); P().save();
          window.electronAPI.showMessageBox({ message: "CLI provider saved." });
        };
        box.querySelector("[data-test]").onclick = function () {
          var b = box.querySelector("[data-test]");
          window.Async.run(b, { working: "Asking…", done: "Answered — see chat" }, function () {
            return window.Chat.ask("Reply with exactly: bridge OK");
          });
        };
      } else if (s.provider === "gemini") {
        box.innerHTML = "<label>Gemini API key<input id='bk' type='password' value='" + esc(s.llmKey) + "' placeholder='AIza…'></label>" +
          "<label>Model<input id='bm' value='" + esc(s.llmModel.indexOf("gemini") === 0 ? s.llmModel : "gemini-2.0-flash") + "'></label>" +
          "<div class='row'><button class='glass-button primary' data-save>Save</button></div>";
        box.querySelector("[data-save]").onclick = function () {
          s.llmBaseUrl = "https://generativelanguage.googleapis.com/v1beta/openai";
          s.llmKey = box.querySelector("#bk").value.trim();
          s.llmModel = box.querySelector("#bm").value.trim() || "gemini-2.0-flash";
          P().save(); P().log("models", "Gemini saved");
          window.electronAPI.showMessageBox({ message: "AI source saved." });
        };
      } else {
        box.innerHTML = "<label>Base URL<input id='bu' value='" + esc(s.llmBaseUrl) + "'></label>" +
          "<label>API key<input id='bk' type='password' value='" + esc(s.llmKey) + "' placeholder='sk-…'></label>" +
          "<label>Model<input id='bm' value='" + esc(s.llmModel) + "'></label>" +
          "<div class='row'><button class='glass-button primary' data-save>Save</button></div>" +
          "<p class='glass-text-secondary'>Without a key, chat answers in demo mode.</p>";
        box.querySelector("[data-save]").onclick = function () {
          s.llmBaseUrl = box.querySelector("#bu").value.trim() || s.llmBaseUrl;
          s.llmKey = box.querySelector("#bk").value.trim();
          s.llmModel = box.querySelector("#bm").value.trim() || s.llmModel;
          P().save(); P().log("models", "API saved");
          window.electronAPI.showMessageBox({ message: "AI source saved." });
        };
      }
    };
    renderProv();
    el().querySelectorAll("[data-p]").forEach(function (b) {
      b.onclick = function () { s.provider = b.dataset.p; P().save(); go("models"); };
    });
  }

  function vSettings() {
    var st = P().state, s = st.settings;
    el().innerHTML =
      "<h2>Settings</h2><p class='sub'>Account, audio, shortcuts and privacy.</p>" +
      "<div class='glass-panel'><h3>Appearance</h3><p class='glass-text-secondary'>Preview product flavor — " +
      "Dark surface, Light surface, Overlay action surface.</p><div class='row'>" +
      [["perssua", "Perssua (dark)"], ["cody", "Cody (dark)"], ["notetaker", "Notetaker (light)"],
       ["reuniao", "Reuniao (dark)"]
      ].map(function (o) {
        return "<button class='glass-button" + (s.flavor === o[0] ? " primary" : "") + "' data-fl='" + o[0] + "'>" + o[1] + "</button>";
      }).join("") + "</div></div>" +
      "<div class='glass-panel'><h3>Account</h3>" +
      "<p class='glass-text-secondary'>Open-source build: no accounts, no sign-in. " +
      "Everything runs locally and stays in this browser.</p></div>" +
      "<div class='glass-panel'><h3>Audio sources</h3>" +
      "<label>Your microphone<select id='au'>" +
      [["microphone", "System microphone"], ["screen", "Computer audio (screen capture)"],
       ["driver", "Perssua Audio Driver"]
      ].map(function (o) {
        return "<option value='" + o[0] + "'" + (s.audioSource === o[0] ? " selected" : "") + ">" + o[1] + "</option>";
      }).join("") + "</select></label>" +
      "<div class='audio-meter' style='margin-top:10px'><div id='meter'></div></div>" +
      "<p class='glass-text-secondary'>Their audio comes from the shared screen/tab. " +
      "The desktop driver install step does not apply here.</p>" +
      "<div class='row'><button class='glass-button primary' data-asave>Save audio choice</button></div></div>" +
      "<div class='glass-panel'><h3>Shortcuts</h3>" +
      "<p class='glass-text-secondary'>A quicker way to work — make every shortcut yours. " +
      "Global OS shortcuts don't exist on the web; these work with the page focused.</p>" +
      "<label>Toggle compact (<span class='kbd'>ctrl+shift+space</span>)<input id='k1' value='" + esc(s.shortcuts.toggle) + "'></label>" +
      "<label>Hide (<span class='kbd'>esc</span>)<input id='k2' value='" + esc(s.shortcuts.hide) + "'></label>" +
      "<label>Capture (<span class='kbd'>ctrl+shift+c</span>)<input id='k3' value='" + esc(s.shortcuts.capture) + "'></label>" +
      "<label>Click-through (<span class='kbd'>ctrl+m</span>)<input id='k4' value='" + esc(s.shortcuts.clickThrough) + "'></label>" +
      "<div class='row'><button class='glass-button primary' data-ksave>Save shortcuts</button></div></div>" +
      "<div class='glass-panel'><h3>Updates</h3>" +
      "<p class='glass-text-secondary'>Perssua Web 0.28.0-web (mirrors desktop 0.28.0).</p>" +
      "<div class='row'><button class='glass-button' data-upd>Check for updates</button></div></div>" +
      "<div class='glass-panel'><h3>Privacy &amp; stealth</h3>" +
      "<label><span><input type='checkbox' id='st'" + (s.stealth ? " checked" : "") +
      " style='width:auto'> Stealth mode (compact UI)</span></label>" +
      "<div class='row'><button class='glass-button primary' data-psave>Save</button></div></div>";
    el().querySelector("[data-asave]").onclick = function () {
      s.audioSource = el().querySelector("#au").value; P().save();
      window.electronAPI.showMessageBox({ message: "Audio choice saved." });
    };
    el().querySelectorAll("[data-fl]").forEach(function (b) {
      b.onclick = function () {
        s.flavor = b.dataset.fl; P().save(); P().emit("flavor", s.flavor); go("settings");
      };
    });
    el().querySelector("[data-ksave]").onclick = function () {
      s.shortcuts = { toggle: el().querySelector("#k1").value.trim() || s.shortcuts.toggle,
        hide: el().querySelector("#k2").value.trim() || s.shortcuts.hide,
        capture: el().querySelector("#k3").value.trim() || s.shortcuts.capture,
        clickThrough: el().querySelector("#k4").value.trim() || s.shortcuts.clickThrough };
      P().save(); window.Shortcuts.bind();
      window.electronAPI.showMessageBox({ message: "Shortcuts saved." });
    };
    el().querySelector("[data-psave]").onclick = function () {
      s.stealth = el().querySelector("#st").checked; P().save();
      window.electronAPI.applyStealthyMode(s.stealth); go("settings");
    };
    el().querySelector("[data-upd]").onclick = function () {
      var b = el().querySelector("[data-upd]");
      window.Async.run(b, { working: "Checking…", done: "You're on the latest version" }, function () {
        return new Promise(function (res) { setTimeout(res, 1200); });
      });
    };
  }

  function vLogs() {
    el().innerHTML =
      "<h2>Logs</h2><p class='sub'>Latest 500 entries.</p>" +
      "<div class='row'><button class='glass-button' data-exp>Export JSON</button>" +
      "<button class='glass-button' data-clip>Copy</button>" +
      "<button class='glass-button danger' data-clear>Clear</button></div>" +
      "<div class='glass-panel'><div class='logbox' id='lb'></div></div>";
    var render = function () {
      var lb = document.getElementById("lb");
      if (!lb) return;
      lb.innerHTML = P().state.logs.map(function (l) {
        return "<div class='" + (l.err ? "err" : "") + "'>" + esc(l.t) + " [" + esc(l.scope) + "] " + esc(l.message) + "</div>";
      }).join("");
      lb.scrollTop = lb.scrollHeight;
    };
    render();
    P().on("log", render);
    el().querySelector("[data-exp]").onclick = function () { window.electronAPI.exportLogs(); };
    el().querySelector("[data-clip]").onclick = function () { window.electronAPI.copyLogsToClipboard(); };
    el().querySelector("[data-clear]").onclick = function () { P().state.logs = []; P().save(); render(); };
  }

  function modal(html) {
    var root = document.getElementById("modal-root");
    root.innerHTML = "<div class='modal-veil'><div class='modal' role='dialog'>" + html + "</div></div>";
    if (window.I18N) window.I18N.translateTree(root);
    return root.firstChild;
  }

  function closeModal() { document.getElementById("modal-root").innerHTML = ""; }

  function onboarding() {
    var m = modal("<h2>Perssua setup</h2>" +
      "<p class='glass-text-secondary'>Step 1 of 2 — audio. Choose what the copilot listens to:</p>" +
      "<div class='row'><button class='glass-button' data-a='microphone'>System microphone</button>" +
      "<button class='glass-button' data-a='screen'>Computer audio</button></div>" +
      "<p class='glass-text-secondary'>Step 2 — pick an AI source in AI Sources (or use demo mode). " +
      "Everything is free, no account needed.</p>" +
      "<div class='row'><button class='glass-button primary' data-ok>Get started</button></div>");
    m.querySelectorAll("[data-a]").forEach(function (b) {
      b.onclick = function () {
        P().state.settings.audioSource = b.dataset.a; P().save();
        window.electronAPI.showMessageBox({ message: "Audio source saved." });
      };
    });
    m.querySelector("[data-ok]").onclick = function () {
      P().state.onboarded = true; P().save(); closeModal();
      shortcutAnnouncement(); go("home");
    };
  }

  function shortcutAnnouncement() {
    var m = modal("<h2>A quicker way to work</h2>" +
      "<p>Make every shortcut yours. Open Shortcuts in Settings to replace or disable any keyboard shortcut.</p>" +
      "<div class='row'><button class='glass-button primary' data-ok>Open shortcuts</button>" +
      "<button class='glass-button' data-close>Close shortcut tip</button></div>");
    m.querySelector("[data-ok]").onclick = function () { closeModal(); go("settings"); };
    m.querySelector("[data-close]").onclick = closeModal;
  }

  function connectAgents() {
    var m = modal("<h2>Connect agents</h2>" +
      "<p class='glass-text-secondary'>Link external assistants (MCP, Codex, Obsidian) from Integrations. " +
      "Nothing connects until you confirm it there.</p>" +
      "<div class='row'><button class='glass-button primary' data-ok>Open integrations</button>" +
      "<button class='glass-button' data-no>Later</button></div>");
    m.querySelector("[data-ok]").onclick = function () { closeModal(); go("integrations"); };
    m.querySelector("[data-no]").onclick = closeModal;
  }

  function vIntegrations() {
    var items = [
      ["Google Docs", "Ask questions over your documents (simulated MCP read).", "docs"],
      ["Google Drive", "Full-text file search as session context.", "drive"],
      ["Google Sheets", "Pull table data into answers.", "sheets"],
      ["Google Calendar", "Meeting titles as session titles.", "calendar"],
      ["Slack", "Share summaries to a channel.", "slack"],
      ["Notion", "Export summaries to Notion.", "notion"],
      ["Obsidian", "Export summaries to your vault.", "obsidian"],
      ["MCP server (agentMcp)", "Expose this app to external agents.", "agentMcp"],
      ["OAuth (mcpOAuth)", "Browser login for integrations.", "mcpOAuth"],
      ["Codex (codexAuth)", "Codex account for external assistance.", "codexAuth"],
      ["External session", "Session handoff from another app.", "externalSession"],
      ["Custom API (customApi)", "Your own generation endpoint.", "customApi"],
    ].map(function (x) {
      return "<li><span class='grow'><strong>" + x[0] + "</strong><br>" +
        "<span class='glass-text-secondary'>" + x[1] + "</span></span>" +
        "<button class='glass-button' data-int='" + x[2] + "'>Connect</button></li>";
    }).join("");
    el().innerHTML =
      "<h2>Integrations</h2><p class='sub'>Web demo: connections are simulated and logged (real OAuth needs a backend).</p>" +
      "<ul class='list'>" + items + "</ul>" +
      "<div class='glass-panel'><h3>Retrieve Context (Google Docs)</h3>" +
      "<p class='glass-text-secondary'>Manual flow: the model inspects your question, picks the read action " +
      "<span class='mono'>google_docs-find-document</span>, and injects the text before answering.</p>" +
      "<div class='row'><input id='ctx-q' placeholder='e.g. find info about NovaTech' aria-label='Question'>" +
      "<button class='glass-button primary' data-ctx>Retrieve Context</button></div>" +
      "<div class='transcript' id='ctx-out' style='margin-top:10px'></div></div>";
    el().querySelectorAll("[data-int]").forEach(function (b) {
      b.onclick = function () {
        var fn = window.electronAPI[b.dataset.int];
        if (fn) fn().then(function () { go("integrations"); });
        else { P().log("shim", b.dataset.int + " connected (simulated)"); go("integrations"); }
      };
    });
    el().querySelector("[data-ctx]").onclick = function () {
      var q = el().querySelector("#ctx-q").value.trim();
      if (!q) return;
      var topic = q.replace(/^(find|get|show|search)(\s+info\s+about|\s+about)?\s+/i, "").trim() || q;
      var out = el().querySelector("#ctx-out");
      out.innerHTML = "<div class='interim'>google_docs-find-document { filterText: \"" +
        esc(topic) + "\", maxResults: 5 } …</div>";
      P().log("mcp", "retrieve context: " + topic);
      setTimeout(function () {
        var ctx = "Doc: “" + topic + " — overview” (simulated). Key points: definition, owners, next steps.";
        out.innerHTML = "<div>" + esc(ctx) + "</div>";
        var s = window.Sessions.current() || window.Sessions.start("Docs context");
        s.messages.push({ who: "ai", text: "[docs context] " + ctx, t: Date.now() });
        P().save();
        window.electronAPI.showMessageBox({ message: "Context injected into the active session." });
      }, 900);
    };
  }

  function referralCode() {
    var code = "PERSSUA-" + Math.random().toString(36).slice(2, 8).toUpperCase();
    P().log("referral", "code generated: " + code);
    return code;
  }
  var DOCS = {
    privacy: { title: "Privacy Policy", updated: "May 12, 2025", body:
      "<p>This Privacy Policy explains how Montano Productions B.V. collects, uses, shares, and protects " +
      "your Personal Information when you use our desktop application and related services.</p>" +
      "<h3>1. Personal Information We Collect</h3>" +
      "<p>Contact details (name, email); account credentials; audio and screen data when permissions are granted; " +
      "billing information for subscriptions; support communications. Collected directly from you, automatically " +
      "via the application, and through device permissions you grant.</p>" +
      "<h3>2. How We Use Personal Information</h3>" +
      "<p>Provide and improve the Services; deliver contextual AI insights; billing and subscriptions; support; " +
      "research; updates and notifications; fraud detection; legal compliance.</p>" +
      "<h3>3. Sharing</h3><p>Vendors under confidentiality; legal/safety disclosures; business transfers.</p>" +
      "<h3>4. Cookies and Tracking</h3><p>Authenticate sessions, remember settings, aggregate usage. " +
      "No cross-site tracking.</p>" +
      "<h3>5. Data Security</h3><p>Appropriate safeguards; no online service is 100% secure — use strong passwords.</p>" +
      "<h3>6. Your Rights</h3><p>Access, correction, deletion, objection — contact <strong>legal@perssua.com</strong>.</p>" +
      "<h3>7. Audio Disclosure Compliance</h3><p>Inform all parties and obtain legally required consent before " +
      "enabling audio processing. We are not liable for misuse.</p>" +
      "<h3>8–13. Other</h3><p>Not intended for under-13s. International transfers to EU servers. Retention only as " +
      "long as necessary. Third-party links have their own policies. Changes notified via app or email.</p>" +
      "<p><strong>Montano Productions B.V.</strong><br>John M. Keynesplein 1, 1066 EP Amsterdam<br>" +
      "KvK 93885067 · help@perssua.com</p>" },
    terms: { title: "Terms of Service", updated: "April 2, 2026", body:
      "<h3>1. Service Overview and License</h3><p>Perssua is a desktop application that uses your own API key " +
      "to connect with AI services such as OpenAI and Google Gemini. It analyzes system audio and screen context " +
      "for real-time insights. Limited, non-exclusive, non-transferable license for personal or internal business use. " +
      "Features may change without notice. AI outputs must be independently verified.</p>" +
      "<p>Stealth disclaimer: the app is designed to operate discreetly during calls, but invisibility cannot be " +
      "guaranteed on every platform — you accept detection risk.</p>" +
      "<h3>2. Accounts</h3><p>Accurate registration data; you maintain your own API key and pay third-party charges; " +
      "lawful and ethical use only, including recording-consent laws.</p>" +
      "<h3>3. Payment and Subscriptions</h3><p>Free and paid plans; recurring billing until cancelled at period end; " +
      "no pro-rata refunds. Referral program: $10 account credit per qualifying referral (account credit only, " +
      "no cash value); self-referrals prohibited; unused credits forfeited on cancellation.</p>" +
      "<h3>4. Acceptable Use</h3><p>No illegal use, no non-consensual recording, no interference or unauthorized automation. " +
      "Use must remain ethical and non-deceptive, including interviews and assessments.</p>" +
      "<h3>5–7. IP, Third Parties, Termination</h3><p>IP owned by Montano Productions B.V.; third-party AI terms apply; " +
      "access may be terminated anytime; cancel by uninstalling.</p>" +
      "<h3>8–9. Warranty &amp; Liability</h3><p>Services “AS IS”. AI responses may be inaccurate — verify before acting. " +
      "Liability capped at amounts paid in the prior 6 months.</p>" +
      "<h3>10–12. Indemnification &amp; Law</h3><p>You indemnify the Company. Governed by the laws of the Netherlands " +
      "(Amsterdam courts). Contact: help@perssua.com, KvK 93885067.</p>" },
    refund: { title: "Refund Policy", updated: "May 12, 2025", body:
      "<p>24-hour refund policy for subscriptions, strictly conditioned on clear video evidence showing the software " +
      "is not functioning on your device.</p><ol><li>Contact <strong>help@perssua.com</strong> within 24 hours of purchase.</li>" +
      "<li>Include order confirmation and reason.</li><li>Attach a screen recording demonstrating the issue.</li></ol>" +
      "<p>Reviewed within 5–7 business days; approved refunds return via the original payment method. Fraudulent " +
      "requests may be denied.</p>" },
    cancel: { title: "Cancellation Policy", updated: "May 12, 2025", body:
      "<p>Cancel anytime in account settings. Monthly and annual plans stay active until the end of the paid term; " +
      "no further charges after that. No pro-rata refunds for mid-cycle cancellations.</p>" }
  };

  function vLegal() {
    el().innerHTML =
      "<h2>Legal</h2><p class='sub'>The same documents shipped with the desktop app.</p>" +
      "<div class='row'>" +
      [["privacy", "Privacy"], ["terms", "Terms"], ["refund", "Refunds"], ["cancel", "Cancellation"]
      ].map(function (o) {
        return "<button class='glass-button' data-doc='" + o[0] + "'>" + o[1] + "</button>";
      }).join("") + "</div><div class='glass-panel legal' id='doc'></div>";
    var show = function (key) {
      var d = DOCS[key];
      el().querySelector("#doc").innerHTML = "<h3>" + d.title + "</h3>" +
        "<p class='glass-text-secondary'>Last Updated: " + d.updated + "</p>" + d.body;
      el().querySelectorAll("[data-doc]").forEach(function (b) {
        b.classList.toggle("primary", b.dataset.doc === key);
      });
    };
    el().querySelectorAll("[data-doc]").forEach(function (b) {
      b.onclick = function () { show(b.dataset.doc); };
    });
    show("privacy");
  }

  function crashed() {
    var m = modal("<h2>Something went wrong</h2>" +
      "<p class='glass-text-secondary'>The render process ran into a problem. Your sessions are saved locally.</p>" +
      "<div class='row'><button class='glass-button primary' data-ok>Reload</button>" +
      "<button class='glass-button' data-no>Dismiss</button></div>");
    m.querySelector("[data-ok]").onclick = function () { window.location.reload(); };
    m.querySelector("[data-no]").onclick = closeModal;
  }

  window.Views = { go: go, goSession: goSession, onboarding: onboarding,
    closeModal: closeModal, renderChat: renderChat, renderTrx: renderTrx,
    connectAgents: connectAgents, crashed: crashed, referralCode: referralCode };
})();
