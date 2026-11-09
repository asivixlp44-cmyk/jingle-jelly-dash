// Looks at the game from set places: the spawn, a treadmill, the Jelly Gate, a stage with its Wobbler, a shut gate far up, the end arch,
// every world's plaza. A camera on the world; draws and triangles with each. Run: node tests/look.mjs (W, H, Q, BOTS change it)
import { startServer, startVite, stopAll, launch, open, shot, sleep, TEST_PORT } from './lib.mjs';
await startServer(TEST_PORT, { QA: '1', NO_BOTS: process.env.BOTS ? '' : '1' });
await startVite();
const b = await launch();
const page = await open(b, 'http://localhost:5579/', { w: +(process.env.W || 1280), h: +(process.env.H || 720), q: process.env.Q || 'medium', uid: 'look' + Date.now() });
const log = async (name) => { const f = await shot(page, name); console.log(name, JSON.stringify(await page.evaluate(() => { const s = window.__qa.state(), d = window.__qa.diag(); return { x: s.x, z: s.z, speed: Math.round(s.speed), stage: s.stage, gate: s.gateOpen, ...d }; }))); return f; };
const ev = (fn, ...a) => page.evaluate(fn, ...a);
await sleep(800);
await ev(() => window.__qa.close());
await log('a_spawn');
await ev(() => { const q = window.__qa; q.teleport(-20, 0, 75, Math.PI); q.look(0.5, 0.25, 18); });
await sleep(1500);
await log('b_treadmill');
await ev(() => { const q = window.__qa; q.teleport(0, 0, 60, Math.PI); q.look(0, 0.12, 22); });
await sleep(700);
await log('c_riftgate');
await ev(() => { const q = window.__qa; q.give({ speed: 30 }); q.teleport(0, 0, q.checkpoint(1).z + 4, Math.PI); q.key('KeyW', true); });
await sleep(1700);
await ev(() => { window.__qa.key('KeyW', false); window.__qa.look(Math.PI, 0.25, 22); });
await sleep(700);
await log('d_stage_shade');
await ev(() => { const q = window.__qa; if (q.P.down) q.actions.giveUp(); q.give({ speed: 3e5, noShade: true }); });
await sleep(1200);
await ev(() => { const q = window.__qa; q.teleport(0, 0, q.checkpoint(10).z + 40, Math.PI); q.look(0, 0.15, 20); q.key('KeyW', true); });
await sleep(1500);
await ev(() => window.__qa.key('KeyW', false));
await sleep(500);
await log('e_gate_shut');
await ev(() => { const q = window.__qa; q.give({ speed: 1e9 }); q.teleport(0, 0, q.northEnd + 60, Math.PI); q.look(0, 0.15, 22); });
await sleep(900);
await log('f_end_arch');
for (const w of [1, 2, 3]) {
    await ev((ww) => { const q = window.__qa; q.give({ openWorlds: true }); q.send('world', { w: ww }); }, w);
    await sleep(3500);
    await ev(() => { window.__qa.close(); window.__qa.look(0, 0.2, 22); });
    await sleep(500);
    await log('g_world' + w);
}
console.log('errors', page.errors);
await b.close(); stopAll();
process.exit(0);
