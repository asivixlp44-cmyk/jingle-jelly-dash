// QA helper: follows the autopilot up the first stages and prints where it is twice a second (where it stalls, what sent it back).
// Run: node tests/trace-pilot.mjs [secs]
import { startServer, startVite, stopAll, launch, open, qa, sleep, TEST_PORT } from './lib.mjs';
const SECS = +(process.argv[2] || 40);
await startServer(TEST_PORT, { QA: '1', NO_BOTS: '1' });
await startVite();
const browser = await launch();
try {
    const page = await open(browser, 'http://localhost:5579/', { w: 1280, h: 720, q: 'low', uid: 'trace' + Date.now() });
    page.on('console', (m) => { if (/pilot|fell|caught/i.test(m.text())) console.log('  [page]', m.text()); });
    await qa(page, () => { window.__qa.noWatch(true); window.__qa.close(); window.__qa.give({ speed: 60 }); });
    await sleep(800);
    console.log('plan 0:', JSON.stringify(await qa(page, () => window.__qa.view() && window.__qa.view().T && null)));
    await qa(page, () => window.__qa.auto(true));
    for (let i = 0; i < SECS * 2; i++) {
        await sleep(500);
        const s = await qa(page, () => { const q = window.__qa, s = q.state(); q.close(); return { x: s.x, y: s.y, z: s.z, st: s.stage, v: s.v, down: s.down, fz: q.P.frozen, mv: q.P.moving, tr: s.tread, pads: s.pads, gate: s.gateOpen, g: q.guideTarget(), fell: +(q.P.fellAt).toFixed(1), stun: +(q.P.stunUntil).toFixed(1) }; });
        console.log(JSON.stringify(s));
        if (s.down) await qa(page, () => window.__qa.actions.giveUp());
    }
} catch (e) { console.error(e); } finally { await browser.close(); stopAll(); }
process.exit(0);
