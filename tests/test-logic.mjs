// Extracts the ==== PURE ==== block from index.html and tests it in Node.
// Run: node tests/test-logic.mjs
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(here, "..", "index.html"), "utf8");
const a = html.indexOf("/* ==== PURE ==== */");
const b = html.indexOf("/* ==== ENDPURE ==== */");
if (a < 0 || b < 0) throw new Error("PURE markers not found");
const pure = html.slice(a, b);

const box = {};
new Function(
  "exports",
  pure + `
  Object.assign(exports, { N, SLOTS, EDOS, gcd, orbit, bjorklund, intervals, dotXY, FREQ, NOTE, NAMES, RNAMES, hue, freq, noteName, bestSteps, stepCents, errorCents, cents, JUST });
`)(box);
const { N, SLOTS, EDOS, gcd, orbit, bjorklund, intervals, dotXY, FREQ, NAMES, freq, noteName, bestSteps, stepCents, errorCents, cents, JUST, hue } = box;

let pass = 0, fail = 0;
const eq = (got, want, msg) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; }
  else { fail++; console.error(`FAIL ${msg}\n  got  ${g}\n  want ${w}`); }
};
const ok = (cond, msg) => { if (cond) pass++; else { fail++; console.error(`FAIL ${msg}`); } };

/* ---- gcd ---- */
eq(gcd(12, 8), 4, "gcd(12,8)");
eq(gcd(7, 12), 1, "gcd(7,12)");
eq(gcd(6, 12), 6, "gcd(6,12)");

/* ---- orbit lengths: the exact table from the game spec ---- */
const wantLen = { 1:12, 2:6, 3:4, 4:3, 5:12, 6:2, 7:12, 8:3, 9:4, 10:6, 11:12 };
for (let k = 1; k <= 11; k++) {
  eq(orbit(k).length, wantLen[k], `orbit length k=${k}`);
  eq(orbit(k).length, N / gcd(k, N), `orbit length formula k=${k}`);
  eq(new Set(orbit(k)).size, orbit(k).length, `orbit distinct k=${k}`);
  eq(orbit(k)[0], 0, `orbit starts at 0, k=${k}`);
}

/* ---- named structures land on the right pitch-class sets ---- */
eq(orbit(7), [0,7,2,9,4,11,6,1,8,3,10,5], "circle of fifths sequence (k=7)");
eq([...orbit(4)].sort((x,y)=>x-y), [0,4,8], "augmented triad set (k=4)");
eq([...orbit(3)].sort((x,y)=>x-y), [0,3,6,9], "diminished 7th set (k=3)");
eq([...orbit(2)].sort((x,y)=>x-y), [0,2,4,6,8,10], "whole-tone set (k=2)");
eq([...orbit(6)].sort((x,y)=>x-y), [0,6], "tritone set (k=6)");
ok(NAMES[7][1].includes("fifths") && /tritone/i.test(NAMES[6][0]), "NAMES table wired");

/* ---- Euclidean rhythms: canonical results from Toussaint ---- */
eq(bjorklund(3, 8).join(""), "10010010", "E(3,8) tresillo");
eq(bjorklund(5, 16).join(""), "1001001001001000", "E(5,16) bossa necklace");
eq(bjorklund(4, 16).join(""), "1000100010001000", "E(4,16) four-on-the-floor");
eq(bjorklund(7, 16).join(""), "1001010100101010", "E(7,16) samba necklace");
eq(bjorklund(16, 16).join(""), "1".repeat(16), "E(16,16) all onsets");
eq(bjorklund(1, 16).join(""), "1" + "0".repeat(15), "E(1,16)");

/* ---- maximal evenness: every gap is floor or ceil of 16/m; downbeat always sounds ---- */
for (let m = 1; m <= 16; m++) {
  const p = bjorklund(m, SLOTS);
  eq(p.length, SLOTS, `E(${m},16) length`);
  eq(p.reduce((s, v) => s + v, 0), m, `E(${m},16) onset count`);
  eq(p[0], 1, `E(${m},16) starts on downbeat`);
  const gaps = intervals(p);
  eq(gaps.reduce((s, v) => s + v, 0), SLOTS, `E(${m},16) gaps sum`);
  const lo = Math.floor(SLOTS / m), hi = Math.ceil(SLOTS / m);
  ok(gaps.every(g => g === lo || g === hi), `E(${m},16) maximally even (gaps=${gaps})`);
}
eq(intervals(bjorklund(6, 16)), [3,2,3,3,2,3], "E(6,16) is the 3·3·2 (tresillo×2) family");

/* ---- frequencies: 12-EDO from C4, strictly ascending, octave closes ---- */
ok(Math.abs(FREQ[0] - 261.6256) < 1e-3, "FREQ[0] = C4");
ok(Math.abs(FREQ[9] - 440.0) < 0.01, "FREQ[9] = A4 = 440");
for (let i = 1; i < 12; i++) ok(FREQ[i] > FREQ[i-1], `FREQ ascending at ${i}`);
ok(Math.abs(FREQ[11] * Math.pow(2, 1/12) - 523.2511) < 0.01, "B4 + semitone = C5");

/* ---- geometry: dots on the circle, 12 o'clock start, clockwise ---- */
const top = dotXY(0, 12, 126);
ok(Math.abs(top.x - 210) < 1e-9 && Math.abs(top.y - 84) < 1e-9, "dot 0 at 12 o'clock");
const three = dotXY(3, 12, 126);
ok(Math.abs(three.x - 336) < 1e-9 && Math.abs(three.y - 210) < 1e-9, "dot 3 at 3 o'clock (clockwise)");
for (let i = 0; i < 12; i++) {
  const { x, y } = dotXY(i, 12, 126);
  ok(Math.abs(Math.hypot(x - 210, y - 210) - 126) < 1e-9, `dot ${i} on radius`);
}

/* ---- combined loop: pitch cycle closes after L onsets regardless of rhythm ---- */
for (const [k, m] of [[7, 8], [3, 6], [4, 5], [6, 16]]) {
  const L = orbit(k).length;
  // simulate scheduler counters
  let pitchIdx = 0, notesSince = 0, closedAt = -1;
  for (let onset = 0; onset < 100; onset++) {
    const idx = pitchIdx % L;
    if (notesSince >= L && idx === 0 && closedAt < 0) closedAt = onset;
    pitchIdx++; notesSince++;
  }
  eq(closedAt, L, `closure detected after exactly L=${L} notes (k=${k},m=${m})`);
}


/* ---- N-EDO: the clock is a choice ---- */
eq(EDOS, [5, 7, 12, 19, 31], "EDO menu");
for (const n of EDOS) {
  for (let k = 1; k < n; k++) {
    const o = orbit(k, n);
    eq(o.length, n / gcd(k, n), `orbit(${k},${n}) length`);
    eq(new Set(o).size, o.length, `orbit(${k},${n}) distinct`);
    ok(o.every(x => x >= 0 && x < n), `orbit(${k},${n}) in range`);
  }
  ok(Math.abs(freq(0, n) - 261.6256) < 1e-3, `freq(0,${n}) = C4`);
  ok(Math.abs(freq(n, n) - 2 * 261.6256) < 1e-3, `freq(${n},${n}) = one octave`);
  for (let i = 1; i < n; i++) ok(freq(i, n) > freq(i - 1, n), `freq ascending ${i}/${n}`);
  ok(Math.abs(hue(n, n) - 360) < 1e-9, `hue wraps at ${n}`);
}
eq(noteName(9, 12), "A", "noteName 12");
eq(noteName(9, 19), "F♯↓", "noteName off-12 = nearest 12-EDO name + drift arrow (9/19 oct ≈ 5.68 semitones, just below F♯)");
eq(noteName(9, 12), "A", "noteName at 12 carries no arrow");

/* the negotiation table (just fifth 701.96c, just third 386.31c) */
ok(Math.abs(cents(1.5) - 701.955) < 0.01, "just fifth in cents");
ok(Math.abs(cents(1.25) - 386.314) < 0.01, "just third in cents");
const table = { 12:[7, 4], 19:[11, 6], 31:[18, 10], 53:[31, 17] };
for (const [n, [f, t]] of Object.entries(table)) {
  eq(bestSteps(JUST.fifth, +n), f, `best fifth in ${n}-EDO`);
  eq(bestSteps(JUST.third, +n), t, `best third in ${n}-EDO`);
}
const near = (a, b, msg) => ok(Math.abs(a - b) < 0.05, `${msg} (got ${a.toFixed(3)}, want ${b})`);
near(errorCents(JUST.fifth, 12), -1.955, "12-EDO fifth error");
near(errorCents(JUST.third, 12), 13.686, "12-EDO third error");
near(errorCents(JUST.fifth, 19), -7.218, "19-EDO fifth error");
near(errorCents(JUST.third, 19), -7.366, "19-EDO third error");
near(errorCents(JUST.fifth, 31), -5.181, "31-EDO fifth error");
near(errorCents(JUST.third, 31), 0.783, "31-EDO third error");
near(errorCents(JUST.fifth, 53), -0.068, "53-EDO fifth error");
near(stepCents(7, 12), 700, "7 steps of 12 = 700c");

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
