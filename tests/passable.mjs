// Every stage of every world, passable: the autopilot starts at a stage's gate with just the Speed its gate wants (a little over, as
// a player who's just opened it), its Wobbler on, and has to reach the Win Pad. A fall or a catch sends it back to the gate (that's
// counted); it gets a few tries. Run: node tests/passable.mjs [world] (ONLY=k,k to pick stages)
import { startServer, startVite, stopAll, launch, open, shot, sleep, TEST_PORT } from './lib.mjs';
import { WORLDS, WALLS_N, stageNeed } from '../shared/config.js';
import { stageType } from '../shared/stages.js';
const worlds = process.argv[2] !== undefined ? [+process.argv[2]] : [0, 1, 2, 3];
const only = process.env.ONLY ? process.env.ONLY.split(',').map(Number) : null;
await startServer(TEST_PORT, { QA: '1', NO_BOTS: '1' });
await startVite();
const b = await launch();
const page = await open(b, 'http://localhost:5579/', { w: 960, h: 540, q: 'low', uid: 'pass' + Date.now() });
const ev = (fn, ...a) => page.evaluate(fn, ...a);
let fails = 0;
await sleep(800);
await ev(() => { const q = window.__qa; q.close(); q.noWatch(true); q.give({ openWorlds: true }); });
for (const w of worlds) {
    await ev((ww) => { window.__qa.auto(false); window.__qa.close(); window.__qa.send('world', { w: ww }); }, w);
    await sleep(3500);
    for (let k = 0; k < WALLS_N; k++) {
        if (only && !only.includes(k)) continue;
        const speed = Math.max(20, stageNeed(w, k) * 1.25), type = stageType(w, k);
        await ev((a) => { const q = window.__qa; q.auto(false); q.close(); q.give({ speed: a.speed, best: a.k }); }, { speed, k });
        await sleep(400);
        await ev((kk) => { const q = window.__qa; const z = q.checkpoint(kk).z; q.teleport(0, 0, z + 4, Math.PI); q.look(0, 0.2, 22); }, k);
        await sleep(700);
        const t0 = Date.now(), pads0 = await ev(() => window.__qa.state().pads);
        await ev(() => window.__qa.auto(true));
        let ok = false, falls = 0, catches0 = await ev(() => window.__qa.state().catches || 0), lastZ = 0;
        while (Date.now() - t0 < 45000) {
            await sleep(400);
            const s = await ev(() => { const q = window.__qa, st = q.state(); if (q.P.down) q.actions.giveUp && q.actions.giveUp(); return { pads: st.pads, z: st.z, stage: st.stage, y: st.y }; });
            if (s.pads > pads0) { ok = true; break; }
            if (s.z > lastZ + 30 && lastZ) falls++;
            lastZ = s.z;
            // the autopilot heads home when a gate ahead is shut: this stage's pad is all it needs
            if (s.stage > k) { ok = true; break; }
        }
        const catches = (await ev(() => window.__qa.state().catches || 0)) - catches0;
        await ev(() => window.__qa.auto(false));
        const secs = ((Date.now() - t0) / 1000).toFixed(1);
        console.log((ok ? '  ok  ' : 'FAIL  ') + WORLDS[w].name + ' stage ' + (k + 1) + ' ' + type + ': ' + (ok ? 'through in ' + secs + ' s' : 'not through in 45 s') + (falls ? ', ' + falls + ' back to the gate' : '') + (catches ? ', caught ' + catches : ''));
        if (!ok) { fails++; await shot(page, 'pass-w' + w + '-k' + k + '-' + type); }
    }
}
console.log('errors', page.errors);
console.log(fails ? fails + ' stages not passed' : 'every stage passed');
await b.close(); stopAll();
process.exit(0);
