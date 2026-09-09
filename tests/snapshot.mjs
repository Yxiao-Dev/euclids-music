// Renders a static SVG snapshot of the stage (k, m from argv) using the same
// pure functions as the game, for visual QA. Run: node tests/snapshot.mjs 7 6 out.svg
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(here, "..", "index.html"), "utf8");
const pure = html.slice(html.indexOf("/* ==== PURE ==== */"), html.indexOf("/* ==== ENDPURE ==== */"));
const box = {};
new Function("exports", pure + `
  Object.assign(exports, { orbit, bjorklund, dotXY, NOTE, hue, NAMES, intervals });
`)(box);
const { orbit, bjorklund, dotXY, NOTE, hue, NAMES, intervals } = box;

const k = +(process.argv[2] ?? 7), m = +(process.argv[3] ?? 6);
const out = process.argv[4] ?? `snapshot-k${k}-m${m}.svg`;
const orb = orbit(k), inO = new Set(orb), pat = bjorklund(m, 16);
const R_P = 126, R_R = 170;

let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 420 560" font-family="sans-serif">
<defs><radialGradient id="bg" cx="50%" cy="12%" r="110%">
<stop offset="0%" stop-color="#2C2647"/><stop offset="62%" stop-color="#241F38"/></radialGradient></defs>
<rect width="420" height="560" fill="url(#bg)"/>
<g transform="translate(0,60)">
<circle cx="210" cy="210" r="${R_R}" fill="none" stroke="rgba(239,234,251,.16)"/>
<circle cx="210" cy="210" r="${R_P}" fill="none" stroke="rgba(239,234,251,.16)"/>`;

// polygon chords
for (let i = 0; i < orb.length; i++) {
  const a = dotXY(orb[i], 12, R_P), b = dotXY(orb[(i + 1) % orb.length], 12, R_P);
  s += `<line x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${b.x.toFixed(1)}" y2="${b.y.toFixed(1)}" stroke="rgba(239,234,251,.5)" stroke-width="2.5" stroke-linecap="round"/>`;
}
// beans
for (let i = 0; i < 16; i++) {
  const { x, y } = dotXY(i, 16, R_R);
  s += pat[i]
    ? `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="6.5" fill="#E9B85C"/>`
    : `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="6.5" fill="rgba(239,234,251,.10)"/>`;
}
// conductor at slot 0
s += `<line x1="210" y1="182" x2="210" y2="30" stroke="rgba(239,234,251,.30)" stroke-width="2" stroke-linecap="round"/><circle cx="210" cy="24" r="4" fill="rgba(239,234,251,.55)"/>`;
// dots + labels (dot 0 shown active)
for (let i = 0; i < 12; i++) {
  const { x, y } = dotXY(i, 12, R_P);
  const on = inO.has(i);
  const fill = on ? `hsl(${hue(i)} 78% 70%)` : "rgba(239,234,251,.10)";
  const stroke = i === 0 ? ` stroke="#fff" stroke-width="3"` : "";
  s += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="14" fill="${fill}"${stroke}/>`;
  s += `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" dy="0.34em" text-anchor="middle" font-size="9.5" font-weight="600" fill="${on ? "#241F38" : "rgba(239,234,251,.35)"}">${NOTE[i]}</text>`;
}
// center button
s += `<circle cx="210" cy="210" r="45" fill="#38305C" stroke="rgba(233,184,92,.55)" stroke-width="2"/>
<path d="M198 192l32 18-32 18z" fill="#EFEAFB"/>
</g>
<text x="210" y="34" text-anchor="middle" font-size="24" font-weight="700" fill="#EFEAFB">欧几里得的音乐</text>
<text x="210" y="52" text-anchor="middle" font-size="12" fill="rgba(239,234,251,.55)">Euclid’s Music</text>`;
// badge + captions preview
if (NAMES[k]) s += `<text x="210" y="512" text-anchor="middle" font-size="18" font-weight="700" fill="#EFEAFB">✦ ${NAMES[k][0]}  <tspan font-size="12" fill="rgba(239,234,251,.55)">${NAMES[k][1]}</tspan> ✦</text>`;
s += `<text x="210" y="540" text-anchor="middle" font-size="12" fill="rgba(239,234,251,.55)">+${k} → ${orb.length} 个音　|　E(${m},16) ${(()=>{const g=intervals(pat);return g.every(x=>x===g[0])?`${g[0]}×${g.length}`:g.join("·")})()}</text>`;
s += `</svg>`;
writeFileSync(join(here, out), s);
console.log("wrote", out);
