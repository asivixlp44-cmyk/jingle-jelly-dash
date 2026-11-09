// The jelly up close: a runner on the Jelly Run with the camera low behind, standing (the domes squashed under the feet), running
// (the ripples), and a landing. Screenshots only. Run: node tests/squish.mjs
import { startServer, startVite, stopAll, launch, open, shot, sleep, TEST_PORT } from './lib.mjs';
await startServer(TEST_PORT, { QA: '1', NO_BOTS: '1' });
await startVite();
const b = await launch();
const page = await open(b, 'http://localhost:5579/', { w: 1280, h: 720, q: process.env.Q || 'high', uid: 'squish' + Date.now() });
const ev = (fn, ...a) => page.evaluate(fn, ...a);
await sleep(800);
await ev(() => { const q = window.__qa; q.close(); q.hud(false); q.give({ speed: 40, noShade: true }); });
await sleep(600);
await ev(() => { const q = window.__qa; q.teleport(0, 0, q.checkpoint(1).z - 24, Math.PI); q.look(0, 0.12, 9); });
await sleep(1200);
await shot(page, 'squish_stand');
await ev(() => window.__qa.key('KeyW', true));
await sleep(900);
await shot(page, 'squish_run');
await ev(() => { window.__qa.key('KeyW', false); window.__qa.jump(); });
await sleep(1150);
await shot(page, 'squish_land');
await sleep(250);
await shot(page, 'squish_land2');
console.log('errors', page.errors);
await b.close(); stopAll();
process.exit(0);
