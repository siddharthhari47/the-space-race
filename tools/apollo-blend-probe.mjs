/* Does the camera ever look at nothing?

   tools/apollo-mission-check.mjs answers almost every question about this
   camera by arithmetic, offline, in a few milliseconds. It cannot answer
   this one. The interlude does not cut from the mission camera to the tour
   camera, it blends between them, and the blended camera's aim depends on
   the vehicle's live pose -- where the stack actually is, after the Earth
   has spun and the flight model has flown it there. That is a running
   page, not a formula, so this file drives one.

   It found a real bug the day it was written. With the aim blended as a
   rotation (a slerp between the mission camera's quaternion and the tour
   camera's), there were two stretches -- around tourU 0.13 on the way in
   and 0.92 to 0.95 on the way out -- where every corner of every mesh in
   the vehicle was outside the frame. Not small, not badly composed:
   absent. Both were invisible to every offline check, because the tour
   camera alone was framed correctly at both, and it was only the blend
   between them that pointed at empty sky. scene.js now blends the aim as
   a point instead, and this file is what says so.

   Needs a preview server and Chrome:

     npm run build && npm run preview       # in another shell
     node tools/apollo-blend-probe.mjs

   Exits non-zero if any sampled scroll position draws no vehicle. */

import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const URL = process.env.APOLLO_URL || "http://localhost:5500/";
const SAMPLES = 60;
const PORT = 9224;

const CHROME = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "/usr/bin/google-chrome",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].find((p) => fs.existsSync(p));
if (!CHROME) {
  console.error("No Chrome found. Set one of the paths in CHROME above.");
  process.exit(2);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "apollo-blend-"));
const chrome = spawn(
  CHROME,
  [
    "--headless=new",
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`,
    "--window-size=1440,810",
    "--no-first-run",
    "--no-default-browser-check",
    "--hide-scrollbars",
    "--mute-audio",
    "--disable-background-timer-throttling",
    "--disable-renderer-backgrounding",
    "about:blank",
  ],
  { stdio: "ignore" }
);

async function endpoint() {
  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      if (r.ok) return true;
    } catch {}
    await sleep(150);
  }
  throw new Error("Chrome never opened its debugging port");
}

let ws;
let nextId = 1;
const pending = new Map();

function send(method, params = {}) {
  const id = nextId++;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((res, rej) => pending.set(id, { res, rej }));
}

async function evaluate(expression) {
  const r = await send("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
  return r.result.value;
}

/* Every corner of every visible mesh in the vehicle, projected into the
   camera that just drew the frame. Corners rather than centres because a
   stage can be mostly out of frame with its centre off the edge and still
   be perfectly well framed, and vice versa. */
const PROBE = `(() => {
  const a = window.__apollo, c = a.camera, v = a.vehicle;
  c.updateMatrixWorld(true);
  v.object3D.updateMatrixWorld(true);
  const V = v.object3D.position.constructor;
  let inside = 0, total = 0, xlo = Infinity, xhi = -Infinity, ylo = Infinity, yhi = -Infinity;
  v.object3D.traverse((o) => {
    if (!o.isMesh || !o.visible || !o.geometry) return;
    if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
    const bb = o.geometry.boundingBox;
    for (const sx of [0, 1]) for (const sy of [0, 1]) for (const sz of [0, 1]) {
      const w = new V(sx ? bb.max.x : bb.min.x, sy ? bb.max.y : bb.min.y, sz ? bb.max.z : bb.min.z);
      o.localToWorld(w).project(c);
      total++;
      if (w.z <= -1 || w.z >= 1) continue;
      xlo = Math.min(xlo, w.x); xhi = Math.max(xhi, w.x);
      ylo = Math.min(ylo, w.y); yhi = Math.max(yhi, w.y);
      if (Math.abs(w.x) <= 1 && Math.abs(w.y) <= 1) inside++;
    }
  });
  return { u: a.tourU(), inside, total,
           x: [xlo, xhi].map((n) => +n.toFixed(2)), y: [ylo, yhi].map((n) => +n.toFixed(2)) };
})()`;

let failures = 0;
try {
  await endpoint();
  const list = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: "PUT" })).json();
  ws = new WebSocket(list.webSocketDebuggerUrl);
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    const p = pending.get(msg.id);
    if (!p) return;
    pending.delete(msg.id);
    msg.error ? p.rej(new Error(msg.error.message)) : p.res(msg.result);
  };
  await new Promise((r) => (ws.onopen = r));
  await send("Runtime.enable");
  await send("Page.enable");
  await send("Page.navigate", { url: URL });
  await sleep(3000);

  const ok = await evaluate(`!!(window.__apollo && window.__apollo.tourU)`);
  if (!ok) throw new Error(`No Apollo scene at ${URL}. Is the preview serving a fresh build?`);

  const max = await evaluate(`document.documentElement.scrollHeight - document.documentElement.clientHeight`);

  console.log(`Probing the blended camera at ${URL}, ${SAMPLES} samples through the interlude.\n`);
  console.log("  tourU   inside/total   x range          y range");

  /* Open interval. tourU clamps to zero everywhere above the interlude, so
     asking for exactly zero bisects all the way back to the top of the
     document -- a scroll position where the rocket is still on the pad and
     is *meant* not to be in frame. u=0 is the mission camera's own
     business and apollo-mission-check.mjs already owns it; what this file
     is here for is the part in between. */
  for (let i = 1; i <= SAMPLES; i++) {
    const want = i / SAMPLES;
    // tourU rises monotonically with scroll, so bisect for an exact beat.
    // progress is set alongside the scroll so the eased follow does not
    // leave the camera somewhere between two samples.
    await evaluate(`(() => {
      const a = window.__apollo, max = ${max}, want = ${want};
      let lo = 0, hi = max;
      for (let k = 0; k < 40; k++) {
        const mid = (lo + hi) / 2;
        window.scrollTo(0, mid); a.state.progress = a.state.target = mid / max;
        const u = a.tourU();
        if (u < 0) { lo = mid; continue; }
        if (u < want) lo = mid; else hi = mid;
      }
      window.scrollTo(0, hi); a.state.progress = a.state.target = hi / max;
    })()`);
    await sleep(120);
    const r = await evaluate(PROBE);
    const blank = r.inside === 0;
    if (blank) failures++;
    if (blank || i % 10 === 0) {
      console.log(
        `  ${r.u.toFixed(3)}   ${String(r.inside).padStart(4)}/${String(r.total).padEnd(5)}  ` +
          `${JSON.stringify(r.x).padEnd(16)} ${JSON.stringify(r.y).padEnd(16)}` +
          (blank ? "  <-- NOTHING IN FRAME" : "")
      );
    }
  }

  console.log("");
  if (failures) {
    console.log(`FAIL  ${failures} of ${SAMPLES} sampled positions draw no vehicle at all.`);
  } else {
    console.log(`All ${SAMPLES} sampled positions keep some of the vehicle in frame.`);
  }
} catch (err) {
  console.error("Probe could not run:", err.message);
  failures = failures || 1;
} finally {
  try { ws?.close(); } catch {}
  try { chrome.kill(); } catch {}
  await sleep(300);
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
}
process.exit(failures ? 1 : 0);
