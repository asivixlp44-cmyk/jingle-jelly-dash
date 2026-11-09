// Every screen, at every size: three portrait phones, a landscape phone, a desktop. Measures the HUD's boxes and the touch
// controls for overlaps and things cut off, and saves a screenshot of each. Run: node tests/screens.mjs [one]
import { startServer, startVite, stopAll, launch, open, qa, shot, sleep, OUT, TEST_PORT } from './lib.mjs';

const ALL = [
    { name: '390x844', w: 390, h: 844, dpr: 2, touch: true },
    { name: '360x800', w: 360, h: 800, dpr: 2, touch: true },
    { name: '375x667', w: 375, h: 667, dpr: 2, touch: true },
    { name: '844x390', w: 844, h: 390, dpr: 2, touch: true },
    { name: '1280x720', w: 1280, h: 720, dpr: 1, touch: false },
    { name: '1920x1080', w: 1920, h: 1080, dpr: 1, touch: false },
    { name: '1366x768', w: 1366, h: 768, dpr: 1, touch: false },
    { name: '1024x600', w: 1024, h: 600, dpr: 1, touch: false },
    { name: '800x600', w: 800, h: 600, dpr: 1, touch: false },
    { name: '768x1024', w: 768, h: 1024, dpr: 2, touch: true },
    { name: '667x375', w: 667, h: 375, dpr: 2, touch: true },
];
const SIZES = process.argv[2] ? ALL.filter((s) => s.name === process.argv[2]) : ALL;
const HUD = ['#winsBox', '#gemsBox', '#menuGrid', '#leftBot', '#questLine', '#stageBar', '#bGift', '#bPlay', '#bX2', '#bAuto', '#bGo', '#powerLine', '#multis', '#lvBar', '#combo', '#stick', '#lickBtn', '#jumpBtn', '#tips'];
const WALL = [...HUD, '#wallBar'];
// the words that come and go: each big moment with two toasts up, against everything else on the screen
const LANE = [...HUD, '#toasts', '#bigText', '#popup', '#winPop', '#lvlUp'];
const MATCH = ['#mClock', '#scores', '#bQuit', '#powerLine', '#multis', '#lvBar', '#stick', '#lickBtn', '#jumpBtn', '#wallBar'];
const QUEUE = [...HUD, '#queueBar', '#toasts'];
// the boxes on screen: which overlap, and what's cut off
const audit = (page, sels) => page.evaluate((list) => {
    const out = { off: [], over: [], corner: [] }, boxes = [], W = innerWidth, H = innerHeight;
    for (const s of list) {
        const e = document.querySelector(s);
        if (!e || e.hidden) continue;
        const cs = getComputedStyle(e);
        if (cs.display === 'none' || cs.visibility === 'hidden') continue;
        const r = e.getBoundingClientRect();
        if (r.width < 1 || r.height < 1) continue;
        boxes.push({ s, l: r.left, t: r.top, r: r.right, b: r.bottom });
        if (r.left < -1 || r.top < -1 || r.right > W + 1 || r.bottom > H + 1) out.off.push(s + ' ' + [r.left, r.top, r.right, r.bottom].map(Math.round));
        // the Bloxity overlay's corner: top-left stays free
        if (r.left < 100 && r.top < 60) out.corner.push(s);
    }
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i], b = boxes[j], ox = Math.min(a.r, b.r) - Math.max(a.l, b.l), oy = Math.min(a.b, b.b) - Math.max(a.t, b.t);
        if (ox > 1.5 && oy > 1.5) out.over.push(a.s + ' x ' + b.s + ' (' + Math.round(ox) + 'x' + Math.round(oy) + ')');
    }
    return out;
}, sels);
let bad = 0;
await startServer(TEST_PORT, { QA: '1' });
await startVite();
const browser = await launch();
try {
    for (const S of SIZES) {
        console.log('\n=== ' + S.name);
        const page = await open(browser, 'http://localhost:5579/', { ...S, q: 'low', uid: 'scr' + S.name + Date.now() });
        await qa(page, () => { window.__qa.noWatch(true); window.__qa.close(); });
        await sleep(600);
        const report = async (tag, sels) => {
            await sleep(450);
            await shot(page, S.name + '-' + tag);
            if (!sels) return;
            const a = await audit(page, sels);
            const msg = [...a.off.map((x) => 'CUT ' + x), ...a.over.map((x) => 'OVER ' + x), ...a.corner.map((x) => 'CORNER ' + x)];
            if (msg.length) { bad += msg.length; console.log('  ' + tag + ': ' + msg.join(' · ')); } else console.log('  ' + tag + ': clean');
        };
        await report('hud', HUD);
        await qa(page, () => { window.__qa.give({ wins: 3000, gems: 200, playSecs: 200, best: 2, spins: 2, lv: 9, allPals: true }); });
        await sleep(300);
        await report('hud2', HUD);
        for (const [k, t] of [['tongues'], ['pals', 'jaws'], ['pals', 'team'], ['work', 'ups'], ['work', 'trails'], ['work', 'auras'], ['spin'], ['rebirth'], ['worlds'], ['shop'], ['shop', 'codes'], ['quests'], ['daily'], ['gifts'], ['boards'], ['settings']]) {
            await qa(page, (a) => { window.__qa.close(); window.__qa.panel(a.k, a.t); }, { k, t });
            await sleep(120);
            await shot(page, S.name + '-panel-' + k + (t ? '-' + t : ''));
            const fit = await page.evaluate(() => { const p = document.querySelector('#modal .panel'); if (!p) return 'none'; const r = p.getBoundingClientRect(); return r.left >= -1 && r.top >= -1 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1 ? '' : 'CUT ' + [r.left, r.top, r.right, r.bottom].map(Math.round); });
            if (fit) { bad++; console.log('  ' + k + ': ' + fit); }
        }
        await qa(page, () => window.__qa.close());
        // a Gift Box opening, three at a time
        await qa(page, () => window.__qa.ui.hatchShow({ j: 3, got: [{ id: 'frost0', fresh: true }, { id: 'frost3', fresh: false }, { id: 'frost4', fresh: true }], done: 0, mult: 3 }));
        await sleep(1500);
        await shot(page, S.name + '-hatch');
        const hfit = await page.evaluate(() => { for (const e of document.querySelectorAll('.hatchOne')) { const r = e.getBoundingClientRect(); if (r.left < -1 || r.top < -1 || r.right > innerWidth + 1 || r.bottom > innerHeight + 1) return 'CUT ' + [r.left, r.top, r.right, r.bottom].map(Math.round); } return ''; });
        if (hfit) { bad++; console.log('  hatch: ' + hfit); }
        await sleep(1800);
        // the big moments, one at a time in their lane, with toasts up
        for (const [tag, say] of [['big', "t.bigText('YOU BEAT THE GHOUL KING!', '#7dff6b')"], ['level', 't.levelUp(14, 15, true)'], ['wins', 't.winPop(12345)'], ['popup', "t.popup('🔄', 'REBIRTH 12!', 'Every step now gives x7 Speed', '#e0a8ff')"]]) {
            await page.evaluate("(() => { const t = window.__qa.ui; t.toast('👟 Run, or hold DASH on a treadmill. Then follow the arrows!', '#fff'); t.toast('🎯 Land 3 Mega Squishes', '#7dff6b'); " + say + '; })()');
            await sleep(500);
            await report('lane-' + tag, LANE);
            await sleep(2600);
        }
        // on a treadmill
        await qa(page, () => { window.__qa.teleport(-20, 0, 75, Math.PI); });
        await sleep(900);
        await report('tread', HUD);
        // in the Jelly Run, a Wobbler behind you
        await qa(page, () => { window.__qa.give({ speed: 0 }); window.__qa.teleport(0, 0, 20, Math.PI); });
        await sleep(400);
        await qa(page, () => { window.__qa.key('KeyW', true); });
        await sleep(900);
        await qa(page, () => { window.__qa.key('KeyW', false); });
        await sleep(1300);
        await qa(page, () => { window.__qa.ui.toast('🔊 Tap anywhere for sound!', '#7de8ff'); window.__qa.ui.bigText('GATE 7 OPEN!', '#7af4ff'); });
        await report('wall', [...WALL, '#toasts', '#bigText']);
        // caught: revive or back to the gate
        await page.waitForFunction(() => window.__qa.P.down, { timeout: 15000 }).catch(() => {});
        await sleep(500);
        await report('caught', WALL);
        const rfit = await page.evaluate(() => { const p = document.querySelector('#revive .panel'); if (!p) return 'no revive'; const r = p.getBoundingClientRect(); return r.left >= -1 && r.top >= -1 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1 ? '' : 'CUT ' + [r.left, r.top, r.right, r.bottom].map(Math.round); });
        if (rfit) { bad++; console.log('  revive: ' + rfit); }
        await qa(page, () => window.__qa.actions.giveUp());
        await sleep(1200);
        // at a gate that's shut
        await qa(page, () => { window.__qa.give({ best: 3, noShade: true }); window.__qa.teleport(0, 0, window.__qa.checkpoint(1).z + 30, Math.PI); });
        await sleep(300);
        await qa(page, () => { window.__qa.key('KeyW', true); });
        await sleep(1200);
        await qa(page, () => { window.__qa.key('KeyW', false); });
        await report('gate', [...WALL, '#toasts']);
        // queued, at a wall
        await qa(page, () => window.__qa.play({ map: 0, lv: 12 }));
        await sleep(400);
        await report('wall-queued', [...WALL, '#queueBar', '#toasts']);
        await qa(page, () => window.__qa.send('unplay', {}));
        await sleep(300);
        await qa(page, () => { window.__qa.teleport(0, 0, 92, Math.PI); });
        await sleep(300);
        // the queue
        await qa(page, () => window.__qa.play({ map: 0, lv: 12 }));
        await qa(page, () => window.__qa.ui.toast('🏃 Someone joined the race!', '#7af4ff'));
        await report('queue', QUEUE);
        // a race
        await qa(page, () => window.__qa.send('unplay', {}));
        await sleep(300);
        await qa(page, () => window.__qa.play({ map: 1, lv: 12, now: true }));
        await page.waitForFunction(() => { const m = window.__qa.state().match; return m && m.phase === 'wait'; }, { timeout: 15000 });
        await sleep(600);
        await report('race-line', MATCH);
        await page.waitForFunction(() => { const m = window.__qa.state().match; return m && m.phase === 'play'; }, { timeout: 15000 });
        await qa(page, () => window.__qa.auto(true));
        await sleep(3500);
        await qa(page, () => window.__qa.ui.toast('🏃 Someone joined the race!', '#7af4ff'));
        await report('race', [...MATCH, '#toasts']);
        await page.waitForFunction(() => !window.__qa.state().match, { timeout: 130000 });
        await sleep(1000);
        await shot(page, S.name + '-results');
        const fit = await page.evaluate(() => { const p = document.querySelector('#modal .panel'); if (!p) return 'no results'; const r = p.getBoundingClientRect(); return r.left >= -1 && r.top >= -1 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1 ? '' : 'CUT ' + [r.left, r.top, r.right, r.bottom].map(Math.round); });
        if (fit) { bad++; console.log('  results: ' + fit); } else console.log('  results: clean');
        await qa(page, () => { window.__qa.auto(false); window.__qa.close(); });
        const errs = [...page.errors, ...(await qa(page, () => window.__qa.errors()))];
        if (errs.length) { bad += errs.length; console.log('  errors:', errs.slice(0, 4)); }
        await page.close();
    }
} catch (e) { console.error(e); bad++; } finally { await browser.close(); stopAll(); }
console.log('\n' + (bad ? bad + ' problems' : 'all clean') + '; shots in', OUT);
process.exit(bad ? 1 : 0);
