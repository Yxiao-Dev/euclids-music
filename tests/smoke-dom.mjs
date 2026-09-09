// Boots index.html in jsdom (no audio, no real rendering) and exercises the UI wiring.
// Run: node tests/smoke-dom.mjs   (requires: npm i jsdom)
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { JSDOM } from "jsdom";

const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(here, "..", "index.html"), "utf8");

const errors = [];
const dom = new JSDOM(html, {
  runScripts: "dangerously",
  pretendToBeVisual: true,
  resources: undefined, // don't fetch fonts
});
dom.virtualConsole?.on?.("jsdomError", e => errors.push(e));
dom.window.addEventListener("error", e => errors.push(e.error || e.message));

const { window } = dom;
const doc = window.document;

let pass = 0, fail = 0;
const ok = (c, msg) => { if (c) pass++; else { fail++; console.error("FAIL " + msg); } };
const eq = (g, w, msg) => ok(JSON.stringify(g) === JSON.stringify(w), `${msg} (got ${JSON.stringify(g)})`);

ok(errors.length === 0, `no boot errors: ${errors.map(String).join("; ")}`);
ok(window.EM, "debug surface window.EM exists");

// structure
eq(doc.querySelectorAll("#dots g").length, 12, "12 pitch dots");
eq(doc.querySelectorAll("#beans circle").length, 16, "16 rhythm beans");
eq(doc.querySelectorAll("#dots text").length, 12, "12 note labels");
ok(doc.querySelector("#playBtn"), "play button present");

// defaults
eq(window.EM.state().k, 7, "default k=7");
eq(window.EM.state().m, 8, "default m=8");
eq(window.EM.orbit().length, 12, "default orbit length 12");
eq(doc.querySelectorAll("#beans .on").length, 8, "8 beans on at m=8");
eq(doc.querySelectorAll("#lines line").length, 12, "full polygon pre-drawn while paused (12 chords)");
ok(doc.getElementById("cap1").textContent.includes("12"), "cap1 shows 12 tones");
ok(doc.getElementById("val1").textContent === "+7", "val1 shows +7");
ok(doc.getElementById("val2").textContent === "8 / 16", "val2 shows 8 / 16");
ok(!doc.getElementById("badge").classList.contains("show"), "badge hidden before any closure");

// slider wiring: sweep every k, every m — no exceptions, consistent state
const s1 = doc.getElementById("s1"), s2 = doc.getElementById("s2");
const fire = el => el.dispatchEvent(new window.Event("input", { bubbles: true }));
const wantLen = { 1:12, 2:6, 3:4, 4:3, 5:12, 6:2, 7:12, 8:3, 9:4, 10:6, 11:12 };
for (let k = 1; k <= 11; k++) {
  s1.value = String(k); fire(s1);
  eq(window.EM.state().k, k, `k wired to ${k}`);
  eq(window.EM.orbit().length, wantLen[k], `orbit len at k=${k}`);
  eq(doc.querySelectorAll("#lines line").length, wantLen[k], `polygon chords at k=${k}`);
  ok(doc.getElementById("cap1").textContent.includes(String(wantLen[k])), `cap1 count at k=${k}`);
}
for (let m = 1; m <= 16; m++) {
  s2.value = String(m); fire(s2);
  eq(window.EM.state().m, m, `m wired to ${m}`);
  eq(doc.querySelectorAll("#beans .on").length, m, `${m} beans on`);
  const cap = doc.getElementById("cap2").textContent;
  const q = Math.floor(16 / m), r = 16 % m;
  ok(cap.includes(`E(${m},16): 16 = ${q}×${m} + ${r}`), `cap2 shows Euclidean division at m=${m} ("${cap.trim()}")`);
}
// m=1 caption must show the full-circle gap 16, not 0 (regression for the intervals() fix)
s2.value = "1"; fire(s2);
ok(doc.getElementById("cap2").textContent.includes("1×16"), "E(1,16) caption shows one gap of 16");

// tritone check: k=6 leaves exactly 2 lit dots
s1.value = "6"; fire(s1);
// jsdom normalizes hsl() to rgb(); orbit dots get opaque rgb, dim dots get rgba
const lit = [...doc.querySelectorAll("#dots circle")].filter(c => /^rgb\(/.test(c.style.fill)).length;
eq(lit, 2, "k=6 lights exactly 2 dots");

// spacebar handler exists and doesn't throw without AudioContext...
// (jsdom has no AudioContext; toggle() would throw — so we only verify the listener path guards)
ok(typeof window.EM.setK === "function" && typeof window.EM.setM === "function", "setters exposed");

ok(errors.length === 0, `no errors after full sweep: ${errors.map(String).join("; ")}`);

/* ---- N-EDO: rebuild the clock and the piano goes dark ---- */
{
  const win = dom.window, doc = win.document;
  const EM = win.EM;
  EM.setK(7);           // start from the default fifth
  EM.setN(19);
  const st = EM.state();
  ok(st.N === 19, "setN(19) sets N");
  ok(st.k === 11, `fifth carried across: k=${st.k} (want 11 = best fifth in 19-EDO)`);
  ok(doc.querySelectorAll("#dots > g").length === 19, "19 dots rebuilt");
  ok(doc.getElementById("s1").max === "18", "step slider max = N-1");
  ok(doc.querySelectorAll("#tuningStrip .mark").length === 19, "19 tuning marks");
  ok(doc.querySelectorAll("#tuningStrip .tick").length === 12, "12 piano ticks");
  ok(doc.querySelectorAll("#piano .key:disabled").length === 12, "piano disabled off-12");
  ok(doc.querySelector(".lesson").classList.contains("off-piano"), "off-piano class set");
  ok(doc.getElementById("lines").children.length === 19, "19-gon drawn at k=11");
  ok(doc.getElementById("edo").querySelector("button.on").dataset.n === "19", "19 button on");
  EM.setN(31);
  ok(EM.state().k === 18 && doc.querySelectorAll("#dots > g").length === 31, "31-EDO: k=18, 31 dots");
  EM.setN(12);
  ok(EM.state().k === 7 && doc.querySelectorAll("#dots > g").length === 12, "back to 12: k=7, 12 dots");
  ok(doc.querySelectorAll("#piano .key:disabled").length === 0, "piano re-enabled at 12");
  ok(/12/.test(doc.getElementById("cap1").textContent), "caption shows 12 tones at 12");
  ok(!doc.getElementById("cap1").textContent.includes("gcd"), "no gcd under the slider");
  ok(doc.querySelector("footer .credit").textContent.includes("Yang Xiao"), "credit line present");
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0); // explicit exit: the page runs a rAF loop under pretendToBeVisual
