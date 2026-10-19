"use strict";
/* Perssua Web — local bridge server (zero dependencies).
 *
 * Serves this folder AND shells out to provider CLIs installed on the
 * machine (Claude Code, Meta Muse). The browser cannot spawn processes,
 * so chat/transcription with local CLIs goes through here:
 *
 *   node server.js            -> http://localhost:8080/
 *   GET  /api/bridge         -> { claude, muse } versions or null
 *   POST /api/ask            -> { provider: "claudecode"|"muse", prompt, model? } -> { reply } | { error }
 *   POST /api/transcribe     -> { audioBase64 } (wav) -> { text } | { error }
 */
const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");
const { execFile } = require("child_process");

const ROOT = __dirname;
const PORT = Number(process.env.PORT || 8080);
const HOME = process.env.USERPROFILE || os.homedir();
// `muse voice transcribe` needs a wav decoder on PATH (ffmpeg). The winget
// install lives outside PATH, so make sure it is visible to our children.
for (const d of [
  path.join(HOME, "AppData", "Local", "Microsoft", "WinGet", "Links"),
]) {
  if (fs.existsSync(d) && !String(process.env.PATH || "").toLowerCase().includes(d.toLowerCase())) {
    process.env.PATH = d + path.delimiter + (process.env.PATH || "");
  }
}
try {
  const pkg = path.join(HOME, "AppData", "Local", "Microsoft", "WinGet", "Packages");
  for (const sub of fs.readdirSync(pkg)) {
    if (!/^Gyan\.FFmpeg/i.test(sub)) continue;
    const b = path.join(pkg, sub);
    for (const inner of fs.readdirSync(b)) {
      const cand = path.join(b, inner, "bin");
      if (fs.existsSync(path.join(cand, "ffmpeg.exe")) &&
          !String(process.env.PATH || "").toLowerCase().includes(cand.toLowerCase())) {
        process.env.PATH = cand + path.delimiter + (process.env.PATH || "");
      }
    }
  }
} catch (_) { /* best effort */ }
const KNOWN = {
  claude: [
    path.join(HOME, ".local", "bin", "claude.exe"),
    path.join(HOME, "AppData", "Local", "Programs", "claude", "claude.exe"),
  ],
  muse: [
    path.join(HOME, "AppData", "Local", "Programs", "muse", "muse.cmd"),
    path.join(HOME, ".local", "bin", "muse.exe"),
  ],
};
function binFor(name) {
  for (const p of KNOWN[name] || []) {
    try { if (fs.existsSync(p)) return p; } catch (e) { /* next */ }
  }
  return name;
}
const BIN = { claude: binFor("claude"), muse: binFor("muse") };
// ffmpeg binary for wav normalization (muse voice only takes 16kHz PCM).
function ffmpegBin() {
  const dirs = [];
  try {
    const pkg = path.join(HOME, "AppData", "Local", "Microsoft", "WinGet", "Packages");
    for (const sub of fs.readdirSync(pkg)) {
      if (!/^Gyan\.FFmpeg/i.test(sub)) continue;
      for (const inner of fs.readdirSync(path.join(pkg, sub))) {
        dirs.push(path.join(pkg, sub, inner, "bin", "ffmpeg.exe"));
      }
    }
  } catch (_) { /* best effort */ }
  dirs.push("ffmpeg");
  for (const d of dirs) {
    try {
      if (/^[a-z]+$/i.test(d) || fs.existsSync(d)) return d;
    } catch (_) { /* next */ }
  }
  return "ffmpeg";
}
const FFMPEG = ffmpegBin();
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".svg": "image/svg+xml",
  ".md": "text/markdown; charset=utf-8",
};

function spawnCli(bin, args, input, timeoutMs) {
  return new Promise((resolve) => {
    let file = bin;
    let argv = args.slice();
    if (process.platform === "win32" && /\.(cmd|bat)$/i.test(bin)) {
      file = "cmd.exe";
      argv = ["/d", "/s", "/c", bin].concat(argv);
    }
    const child = execFile(file, argv, {
      timeout: timeoutMs || 180000,
      maxBuffer: 8 * 1024 * 1024,
      windowsHide: true,
    }, (err, stdout, stderr) => {
      const out = String(stdout || "").trim();
      const errTxt = String(stderr || "").trim();
      if (err) resolve({ ok: false, error: out || errTxt || String((err.killed && "timed out") || err.message || err) });
      else resolve({ ok: true, out });
    });
    if (input != null && child.stdin) {
      child.stdin.write(input);
      child.stdin.end();
    }
  });
}

function probe() {
  return Promise.all([
    spawnCli(BIN.claude, ["--version"], null, 20000),
    spawnCli(BIN.muse, ["--version"], null, 20000),
  ]).then((r) => ({
    claude: r[0].ok ? r[0].out.trim().split("\n")[0] : null,
    muse: r[1].ok ? r[1].out.trim().split("\n")[0] : null,
    ffmpeg: FFMPEG,
    ffmpegExists: FFMPEG === "ffmpeg" ? "on-path?" : String(fs.existsSync(FFMPEG)),
    pathHasFfmpeg: String(process.env.PATH || "").toLowerCase().includes("ffmpeg"),
  }));
}

function readBody(req, cap) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > (cap || 25 * 1024 * 1024)) { reject(new Error("body too large")); req.destroy(); }
      else chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function tmpFile(ext) {
  return path.join(os.tmpdir(), "perssua-" + crypto.randomBytes(8).toString("hex") + ext);
}

function ask(provider, prompt, model) {
  prompt = String(prompt || "").slice(0, 20000);
  if (!prompt.trim()) return Promise.resolve({ error: "empty prompt" });
  if (provider === "muse") {
    const f = tmpFile(".txt");
    fs.writeFileSync(f, prompt, "utf8");
    const args = ["exec", "--prompt-file", f];
    if (model) args.push("--model", String(model).slice(0, 80));
    return spawnCli(BIN.muse, args, null).then((r) => {
      try { fs.unlinkSync(f); } catch (e) { /* best effort */ }
      return r.ok ? { reply: r.out.trim() } : { error: r.error };
    });
  }
  const args = ["-p"];
  if (model) args.push("--model", String(model).slice(0, 80));
  return spawnCli(BIN.claude, args, prompt).then((r) =>
    (r.ok ? { reply: r.out.trim() } : { error: r.error }));
}

function transcribe(audioBase64) {
  let buf;
  try { buf = Buffer.from(String(audioBase64 || ""), "base64"); }
  catch (e) { return Promise.resolve({ error: "invalid base64" }); }
  if (buf.length < 100 || buf.toString("ascii", 0, 4) !== "RIFF" ||
      buf.toString("ascii", 8, 12) !== "WAVE") {
    return Promise.resolve({ error: "not a wav file" });
  }
  const f = tmpFile(".wav");
  fs.writeFileSync(f, buf);
  const c = tmpFile(".16k.wav");
  const cleanup = () => {
    try { fs.unlinkSync(f); } catch (e) { /* best effort */ }
    try { fs.unlinkSync(c); } catch (e) { /* best effort */ }
  };
  // Normalize to 16kHz mono PCM: browser/mic wavs (44.1/48kHz) are rejected
  // by `muse voice` when it cannot find a decoder for resampling.
  return spawnCli(FFMPEG, ["-y", "-v", "error", "-i", f,
    "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", c], null, 60000).then((cv) => {
    const src = cv.ok ? c : f;
    return spawnCli(BIN.muse, ["voice", "transcribe", src], null, 180000).then((r) => {
      cleanup();
      return r.ok ? { text: r.out.trim() } : { error: r.error };
    });
  });
}

function serveStatic(req, res) {
  let urlPath = decodeURIComponent(req.url.split("?")[0]);
  if (urlPath === "/") urlPath = "/index.html";
  const full = path.normalize(path.join(ROOT, urlPath));
  if (!full.startsWith(ROOT) || !fs.existsSync(full) || fs.statSync(full).isDirectory()) {
    res.writeHead(404); res.end("not found");
    return;
  }
  res.writeHead(200, { "Content-Type": MIME[path.extname(full).toLowerCase()] || "application/octet-stream" });
  fs.createReadStream(full).pipe(res);
}

const server = http.createServer((req, res) => {
  if (req.method === "GET" && req.url.split("?")[0] === "/api/bridge") {
    probe().then((info) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(info));
    });
    return;
  }
  if (req.method === "POST" && req.url === "/api/ask") {
    readBody(req).then((raw) => {
      let data = {};
      try { data = JSON.parse(raw); } catch (e) { /* fallthrough */ }
      ask(data.provider, data.prompt, data.model).then((out) => {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(out));
      });
    }).catch(() => { res.writeHead(413); res.end('{"error":"body too large"}'); });
    return;
  }
  if (req.method === "POST" && req.url === "/api/transcribe") {
    readBody(req).then((raw) => {
      let data = {};
      try { data = JSON.parse(raw); } catch (e) { /* fallthrough */ }
      transcribe(data.audioBase64).then((out) => {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(out));
      });
    }).catch(() => { res.writeHead(413); res.end('{"error":"body too large"}'); });
    return;
  }
  serveStatic(req, res);
});

server.listen(PORT, "127.0.0.1", () => {
  console.log("perssua-web bridge on http://127.0.0.1:" + PORT + "/");
  probe().then((info) => console.log("providers:", JSON.stringify(info)));
});
