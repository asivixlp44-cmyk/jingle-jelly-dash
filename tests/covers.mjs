// The two store covers (1920x1080, 800x800), rendered from the game itself at High: a runner squishing down the Jelly Run of Jingle
// Village towards you, a Gumdrop Gobbler bouncing at their heels, the ribbon gate behind, with the title over it in the game's own lettering.
// Run: node tests/covers.mjs
import fs from 'node:fs';
import path from 'node:path';
import { startServer, startVite, stopAll, launch, open, qa, sleep, ROOT, TEST_PORT } from './lib.mjs';

await startServer(TEST_PORT, { QA: '1', NO_BOTS: '1' });
await startVite();
const browser = await launch();
const dir = path.join(ROOT, 'covers');
fs.mkdirSync(dir, { recursive: true });
const OUTLINE = '#4a0618';
const TITLE = (big) => `<div id="ctitle" style="position:fixed;left:0;right:0;top:${big ? '4%' : '4.5%'};z-index:99;text-align:center;font-family:'Luckiest Guy',sans-serif;line-height:.92;color:#fff;letter-spacing:.02em;font-size:${big ? 148 : 112}px;text-shadow:-6px -6px 0 ${OUTLINE},6px -6px 0 ${OUTLINE},-6px 6px 0 ${OUTLINE},6px 6px 0 ${OUTLINE},0 13px 0 ${OUTLINE},0 18px 26px rgba(40,0,10,.45)">JINGLE ${big ? '' : '<br>'}<span style="color:#ff5aa8">JELLY</span> <span style="color:#7dff6b">DASH</span><div style="font-size:${big ? 56 : 44}px;color:#ffe24a;margin-top:${big ? 12 : 10}px">+1 SPEED EVERY STEP</div></div>`;
try {
    for (const [w, h, name, pitch, dist] of [[1920, 1080, 'cover-1920x1080.png', 0.05, 11], [800, 800, 'cover-800x800.png', 0.08, 12]]) {
        const page = await open(browser, 'http://localhost:5579/', { w, h, dpr: 1, q: 'high', uid: 'cover' + w + Date.now() });
        // (no floating numbers, and the Wobbler solid: it's a picture, not play)
        await qa(page, () => { const q = window.__qa; q.noWatch(true); q.close(); window.__noFloat = true; q.shadeFade(0, 0); q.give({ wins: 300, gems: 50, shoe: 3, lv: 1, best: 3, speed: 20 }); });
        await sleep(3000);
        // a stage's start: a dash in wakes its Wobbler, a stop lets it close in, then running on towards the camera with it a few studs behind
        await qa(page, () => { const q = window.__qa; q.close(); q.teleport(0, 0, q.checkpoint(1).z + 4, 0); });
        await sleep(300);
        await qa(page, (a) => { const q = window.__qa; q.look(Math.PI, a.pitch, a.dist); q.key('KeyS', true); }, { pitch, dist });
        await sleep(900);
        await qa(page, () => window.__qa.key('KeyS', false));
        await page.waitForFunction(() => { const q = window.__qa, r = q.net.room, p = r.state.players.get(r.sessionId); if (!p || p.shK === 255) return false; const z = p.shZ - p.shV * Math.max(0, (q.net.now() - p.shAt) / 1000); return z - q.P.b.z < 9; }, { timeout: 8000, polling: 30 }).catch(() => {});
        await qa(page, () => window.__qa.key('KeyS', true));
        await sleep(450);
        await qa(page, () => { const q = window.__qa; q.close(); const me = q.me(); if (me && me.label) me.label.visible = false; for (const s of ['#hud', '#touch', '#toasts', '#bigText', '#popup', '#winPop', '#lvlUp', '#combo', '#fps', '#tips', '#wallBar', '#revive']) { const e = document.querySelector(s); if (e) e.style.display = 'none'; } });
        await page.evaluate((html) => { const d = document.createElement('div'); d.innerHTML = html; document.body.appendChild(d); }, TITLE(w > 1000));
        await sleep(250);
        await page.screenshot({ path: path.join(dir, name), type: 'png' });
        console.log('wrote', name, page.errors);
        await page.close();
    }
} catch (e) { console.error(e); } finally { await browser.close(); stopAll(); }
process.exit(0);
