const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const fs = require('node:fs');

(async () => {
  const browser = await chromium.launch({ headless: true,
    ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.route('https://fonts.googleapis.com/**', r => r.abort());
    await page.route('https://fonts.gstatic.com/**', r => r.abort());
    const url = pathToFileURL(path.join(__dirname, '..', 'index.html')).href;
    await page.goto(url);
    await page.waitForFunction(() => window.EM);
    assert.equal(await page.locator('h1').textContent(), 'Euclid’s Music');
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await page.waitForFunction(() => EM.state().playing);
    await page.waitForTimeout(400);
    assert(await page.evaluate(() => voices.size > 0));
    await page.getByRole('button', { name: 'Stop', exact: true }).click();
    assert.equal(await page.evaluate(() => voices.size), 0);
    assert.equal(await page.evaluate(() => timer), null);
    assert(await page.locator('.key.black[data-pc="1"]').evaluate(el => {
      const b = el.getBoundingClientRect();
      return document.elementFromPoint(b.x + b.width * .25, b.y + b.height * .5) === el;
    }), 'root white key does not cover its neighboring black key');

    // Invoke the real scheduler with a deterministic audio clock and capture its
    // sound requests. This checks timing, not just copies of its counter logic.
    const timing = await page.evaluate(() => {
      const saved = { ctx, pluck, tick, soundClosureBloom };
      const results = [];
      try {
        ctx = { currentTime: 0 };
        for (const [n, step, pulses, tonic] of [[12,4,5,2],[12,6,16,0],[19,11,7,3],[31,18,1,7]]) {
          EM.setN(n); EM.setK(step); EM.setM(pulses); setRoot(tonic);
          const notes = [], clicks = [], blooms = [];
          pluck = (t, pc) => notes.push({ t, pc });
          tick = t => clicks.push(t);
          soundClosureBloom = t => blooms.push(t);
          document.getElementById('slotClicks').checked = true;
          document.getElementById('closureChord').checked = true;
          slot = pitchIdx = notesSince = 0; nextTime = 0; evq.length = 0; prevSchedPc = null;
          const events = [];
          for (let i = 0; i < 1100; i++) {
            ctx.currentTime = nextTime;
            schedule();
            events.push(...evq); evq.length = 0;
          }
          results.push({ n, step, pulses, tonic, L, duration: SLOT_DUR,
            notes, clicks, blooms, events: events.filter(e => e.type === 'note'),
            orbit: EM.orbit(), pattern: EM.pattern() });
        }
      } finally {
        ctx = saved.ctx; pluck = saved.pluck; tick = saved.tick; soundClosureBloom = saved.soundClosureBloom;
        document.getElementById('slotClicks').checked = false;
        document.getElementById('closureChord').checked = false;
        EM.setN(12); EM.setK(7); EM.setM(8); setRoot(0); resetSequence(); drawFullPolygon();
      }
      return results;
    });
    for (const r of timing) {
      for (let i = 1; i < r.clicks.length; i++) assert(Math.abs(r.clicks[i] - r.clicks[i-1] - r.duration) < 1e-8, 'uniform slots');
      r.notes.forEach((note, i) => {
        assert.equal(note.pc, r.orbit[i % r.L], 'root and orbit remain fixed');
        const slot = Math.round(note.t / r.duration);
        assert.equal(r.pattern[slot % 16], 1, 'only pattern onsets play');
        assert.equal(r.events[i].closing, i > 0 && i % r.L === 0, 'closure on actual return');
      });
      assert.equal(r.blooms.length, Math.floor((r.notes.length - 1) / r.L));
    }

    // Every supported control value, both stopped and with real Web Audio.
    for (const playing of [false, true]) {
      if (playing) await page.getByRole('button', { name: 'Play', exact: true }).click();
      await page.evaluate(() => {
        for (const n of [5,7,12,19,31]) {
          EM.setN(n);
          for (let k = 1; k < n; k++) {
            EM.setK(k);
            if (document.querySelectorAll('#dots > g').length !== n) throw Error('ring mismatch');
            if (EM.orbit().length !== n / gcd(k,n)) throw Error('orbit mismatch');
          }
          for (let m = 1; m <= 16; m++) {
            EM.setM(m);
            if (document.querySelectorAll('#beans .on').length !== m) throw Error('pulse mismatch');
          }
        }
      });
      if (playing) await page.getByRole('button', { name: 'Stop', exact: true }).click();
    }
    await page.evaluate(() => { EM.setN(12); EM.setK(4); EM.setM(16); setRoot(0); });
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await page.waitForTimeout(1450);
    assert.equal(await page.evaluate(() => EM.state().playShift), 0);
    assert.equal(await page.evaluate(() => EM.state().root), 0);
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); });
    assert.equal(await page.evaluate(() => EM.state().playing), false);
    assert.equal(await page.evaluate(() => voices.size), 0);
    await page.evaluate(() => { delete document.hidden; });

    await page.getByRole('radio', { name: '12', exact: true }).focus();
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.evaluate(() => EM.state().N), 19);
    assert.equal(await page.locator('#piano button:disabled').count(), 12);
    await page.keyboard.press('ArrowLeft');
    assert.equal(await page.locator('#piano button:disabled').count(), 0);
    await page.evaluate(() => { EM.setK(7); EM.setM(8); });
    await page.getByRole('button', { name: 'Play', exact: true }).focus();
    await page.keyboard.press('Space');
    assert.equal(await page.evaluate(() => EM.state().playing), true);
    await page.keyboard.press('Space');
    assert.equal(await page.evaluate(() => EM.state().playing), false);

    const assets = path.join(__dirname, '..', 'assets'); fs.mkdirSync(assets, { recursive: true });
    await page.locator('h1').click();
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(assets, 'hero-full.png'), fullPage: true });
    for (const [width, height] of [[390,844],[320,568],[768,1024]]) {
      await page.setViewportSize({ width, height });
      await page.evaluate(() => { EM.setN(31); document.querySelector('details').open = true; });
      await page.waitForTimeout(2700);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `no overflow at ${width}`);
      const boxes = await page.locator('.controls .ctl').evaluateAll(els => els.map(el => {const b=el.getBoundingClientRect(); return {left:b.left,right:b.right};}));
      assert(boxes.every(b => b.left >= 0 && b.right <= width), 'controls fit viewport');
      if (width === 390) await page.screenshot({ path: path.join(assets, 'mobile.png'), fullPage: true });
    }
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await page.waitForTimeout(600);
    assert.equal(await page.locator('#lights > *, #fx > *').count(), 0);
    await page.getByRole('button', { name: 'Stop', exact: true }).click();

    const noAudio = await browser.newPage();
    noAudio.on('pageerror', e => errors.push(e.message));
    await noAudio.addInitScript(() => { window.AudioContext = undefined; window.webkitAudioContext = undefined; });
    await noAudio.goto(url);
    await noAudio.getByRole('button', { name: 'Play', exact: true }).click();
    assert.match(await noAudio.locator('#audioStatus').textContent(), /could not start/);
    assert.deepEqual(errors, []);
    console.log('Browser checks passed: scheduler, audio lifecycle, controls, keyboard, layout, reduced motion, audio fallback.');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
