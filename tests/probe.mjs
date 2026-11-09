// QA helper: stands at a spot and looks, for a screenshot of something odd. Run: node tests/probe.mjs
import { startServer, startVite, stopAll, launch, open, shot, sleep, qa, TEST_PORT } from './lib.mjs';
await startServer(TEST_PORT, { QA: '1', NO_BOTS: '1' });
await startVite();
const b = await launch();
const page = await open(b, 'http://localhost:5579/', { w: 1280, h: 720, q: 'high', uid: 'probe' + Date.now() });
await sleep(800);
const spots = [['pad1-front', 1, -4, Math.PI], ['pad1-back', 1, 30, 0], ['pad1-on', 1, 0, Math.PI]];
for (const [name, k, dz, yaw] of spots) {
    await qa(page, (a) => { const q = window.__qa; q.close(); q.give({ speed: 200, noShade: true }); const z = q.view().pads[a.k].z + a.dz; q.teleport(0, 0, z, 0); q.look(a.yaw, 0.08, 12); }, { k, dz, yaw });
    await sleep(900);
    console.log(name, await shot(page, 'probe-' + name));
}
console.log('errors', page.errors);
await b.close(); stopAll();
process.exit(0);
