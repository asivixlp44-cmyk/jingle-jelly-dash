// Browser runs with the autopilot, on the dev client (it has the QA hooks): the whole loop (train, run the Jelly Run, the Win Pads, shoes,
// a Gift Box, the gates opening) and full races on every map at a few Levels, every world's stages. Prints what happened; screenshots go
// to OUT_DIR. Run: node tests/autopilot.mjs [quick]
import { startServer, startVite, stopAll, launch, open, qa, shot, sleep, OUT, TEST_PORT } from './lib.mjs';

const quick = process.argv[2] === 'quick';
let fails = 0;
const check = (c, what) => { console.log((c ? '  ok  ' : 'FAIL  ') + what); if (!c) fails++; };
const st = (page) => qa(page, () => window.__qa.state());
async function until(page, fn, secs, arg) {
    const t0 = Date.now();
    while (Date.now() - t0 < secs * 1000) {
        const v = await page.evaluate(fn, arg);
        if (v) return v;
        // (a pop-up offering the daily reward would stop the pilot's feet: it says no thanks; caught by a Wobbler: back to the gate)
        await page.evaluate(() => { window.__qa.close(); if (window.__qa.P.down) window.__qa.actions.giveUp(); });
        await sleep(250);
    }
    return null;
}

await startServer(TEST_PORT, { QA: '1' });
await startVite();
const browser = await launch();
try {
    const page = await open(browser, 'http://localhost:5579/', { w: 1280, h: 720, q: 'medium', uid: 'pilot' + Date.now() });
    console.log('load', page.loadSecs, 's;', await qa(page, () => window.__qa.gpu()));
    await qa(page, () => { window.__qa.noWatch(true); window.__qa.close(); });
    // ----- one press, one jump -----
    {
        await sleep(1000);
        await qa(page, () => window.__qa.close());
        const jumps = async () => page.evaluate(async () => {
            let n = 0, was = window.__qa.state().onGround, t0 = performance.now();
            while (performance.now() - t0 < 3000) {
                const g = window.__qa.state().onGround;
                if (was && !g) n++;
                was = g;
                await new Promise((r) => requestAnimationFrame(r));
            }
            return n;
        });
        const run = jumps();
        await page.keyboard.press('Space');
        const one = await run;
        check(one === 1, 'one press of SPACE, one jump: ' + one + ' in 3 s');
        const run2 = jumps();
        await page.keyboard.down('Space'); await sleep(1500); await page.keyboard.up('Space');
        const held = await run2;
        check(held >= 2 && held <= 6, 'holding it keeps jumping, and it stops when let go: ' + held + ' in 3 s (held 1.5 s)');
    }
    // ----- the loop -----
    console.log('\n--- the loop on the autopilot: train, run the Jelly Run, a pad, shoes');
    await qa(page, () => window.__qa.auto(true));
    const t0 = Date.now();
    const secs = () => Math.round((Date.now() - t0) / 1000);
    const tr = await until(page, () => window.__qa.state().steps >= 10 && window.__qa.state(), 40);
    check(!!tr, 'stepping: ' + (tr && tr.steps) + ' steps after ' + secs() + ' s, Speed ' + (tr && Math.floor(tr.speed)));
    // on a belt (where the guide sends a new player): it trains there while it's short of 12 Speed. (Walking there from the
    // spawn can make 12 on the way, and then the guide rightly sends it straight to the first gate, so it starts on the belt)
    await qa(page, () => { const q = window.__qa; q.auto(false); q.give({ speed: 0 }); const g = q.guideTarget(); q.teleport(g.x, 0, g.z, Math.PI); });
    await sleep(600);
    await qa(page, () => window.__qa.auto(true));
    const tm = await until(page, () => window.__qa.state().tread >= 0 && window.__qa.state(), 20);
    check(!!tm, 'training on a treadmill after ' + secs() + ' s');
    await sleep(1500);
    await shot(page, 'pilot-tread');
    const in1 = await until(page, () => window.__qa.state().stage >= 0 && window.__qa.state(), 60);
    check(!!in1, 'into the Jelly Run after ' + secs() + ' s at ' + (in1 && in1.v) + ' studs/s');
    await sleep(2500);
    await shot(page, 'pilot-rift');
    const pd = await until(page, () => window.__qa.state().pads >= 1 && window.__qa.state(), 90);
    check(!!pd && pd.cleared >= 1, 'a Win Pad after ' + secs() + ' s: ' + (pd && pd.wins) + ' Wins in hand');
    await shot(page, 'pilot-pad');
    if (!quick) {
        const sw = await until(page, () => window.__qa.state().shoe >= 1 && window.__qa.state(), 150);
        check(!!sw, 'the first shoes bought on its own after ' + secs() + ' s, Level ' + (sw && sw.lv));
        const b2 = await until(page, () => (window.__qa.state().bests[0] || 0) >= 4 && window.__qa.state(), 240);
        check(!!b2, 'Stage 4 cleared after ' + secs() + ' s, Level ' + (b2 && b2.lv) + ', ' + (b2 && b2.wins) + ' Wins, ' + (b2 && b2.escapes) + ' Wobblers escaped, caught ' + (b2 && b2.catches));
        await shot(page, 'pilot-stage4');
    }
    const s1 = await st(page);
    check(s1.snaps === 0, 'no snaps on the run: ' + s1.snaps);
    // ----- every map: a full race at a few Levels -----
    for (const [w, lv] of (quick ? [[0, 2], [2, 20]] : [[0, 2], [1, 9], [2, 20], [3, 40]])) {
        console.log('\n--- map ' + w + ', Level ' + lv + ': a full race');
        await qa(page, () => { window.__qa.auto(false); window.__qa.close(); });
        await until(page, () => !window.__qa.P.down, 10);
        await qa(page, (a) => window.__qa.play({ map: a.w, lv: a.lv, now: true }), { w, lv });
        const inM = await until(page, () => { const m = window.__qa.state().match; return m && m.phase === 'wait' && m; }, 20);
        check(!!inM && inM.w === w, 'into the race: map ' + (inM && inM.w) + ', ' + (inM && inM.n) + ' stretches, ' + (inM && inM.secs) + ' s');
        await sleep(1200);
        await shot(page, 'race' + w + '-line');
        await qa(page, () => window.__qa.auto(true));
        const go = await until(page, () => { const m = window.__qa.state().match; return m && m.phase === 'play' && m; }, 12);
        check(!!go, 'the gun');
        await sleep(5000);
        await qa(page, () => window.__qa.close());
        await shot(page, 'race' + w + '-mid');
        const mid = await st(page);
        check(mid.match && mid.z < -60, 'running: ' + (mid.match && Math.round(-mid.z)) + ' studs, scores ' + JSON.stringify(mid.match && mid.match.scores));
        const fin = await until(page, () => { const m = window.__qa.state().match; return (!m || m.done || m.out) && (m || window.__qa.state()); }, 120);
        check(!!fin && !fin.out, 'the autopilot gets to the portal' + (fin && fin.out ? ' (the avalanche got it)' : ''));
        await shot(page, 'race' + w + '-fin');
        const end = await until(page, (n) => !window.__qa.state().match && window.__qa.S.matches > n && window.__qa.state(), 170, mid.matches);
        const s2 = await st(page);
        check(!!end, 'the race ends and pays: ' + s2.matches + ' raced, ' + s2.wins + ' Wins, snaps ' + s2.snaps);
        await sleep(1400);
        await shot(page, 'race' + w + '-end');
        const rows = await page.$$eval('#modal .row', (els) => els.map((e) => e.textContent.replace(/\s+/g, ' ').trim()));
        console.log('      result: ' + rows.join(' | '));
        await qa(page, () => window.__qa.close());
        await qa(page, () => window.__qa.auto(false));
        await sleep(600);
    }
    // ----- each world -----
    await qa(page, () => window.__qa.give({ openWorlds: true, rebirths: 12, shoe: 12, lv: 50 }));
    for (const w of [1, 2, 3]) {
        console.log('\n--- World ' + w);
        await qa(page, (ww) => { window.__qa.auto(false); window.__qa.close(); window.__qa.send('world', { w: ww }); }, w);
        await until(page, (ww) => window.__qa.state().world === ww, 15, w);
        await sleep(1800);
        await qa(page, () => { window.__qa.look(0, 0.2, 22); });
        await shot(page, 'world' + w + '-a');
        // strong enough for its first few gates
        await qa(page, (ww) => { const sc = [1, 6e7, 3.6e15, 2e23][ww]; window.__qa.give({ speed: sc * 600, best: 0 }); }, w);
        await sleep(400);
        await qa(page, () => window.__qa.auto(true));
        const c0 = (await st(page)).cleared;
        const s = await until(page, (c) => window.__qa.state().cleared > c + 1 && window.__qa.state(), 70, c0);
        check(!!s, 'World ' + w + ': stages cleared on the run: ' + (s && s.cleared - c0) + ' (best ' + JSON.stringify(s && s.bests) + ')');
        await shot(page, 'world' + w + '-b');
    }
    await qa(page, () => { window.__qa.auto(false); window.__qa.send('world', { w: 0 }); });
    await until(page, () => window.__qa.state().world === 0, 15);
    await sleep(1500);
    const e1 = await qa(page, () => window.__qa.errors());
    const sf = await st(page);
    check(sf.snaps <= 1, 'no snaps all the way: ' + sf.snaps);
    check(page.errors.length === 0 && e1.length === 0, 'no console errors: ' + JSON.stringify(page.errors.slice(0, 5)) + JSON.stringify(e1.slice(0, 5)));
    console.log('\nfinal', JSON.stringify(sf));
} catch (e) { console.error(e); fails++; } finally { await browser.close(); stopAll(); }
console.log(fails ? fails + ' FAILED' : 'all good', '; shots in', OUT);
process.exit(fails ? 1 : 0);
