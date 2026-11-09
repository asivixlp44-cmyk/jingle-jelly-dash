// The production build with real input only: no QA hooks, the keyboard, mouse and touch as a player uses them, the game's
// own words on screen as the only way to know what happened. Run: node tests/prod.mjs (it builds first)
import { execSync } from 'node:child_process';
import { startServer, stopAll, launch, open, sleep, shot, ROOT, TEST_PORT } from './lib.mjs';
import { wallZ, padAt, stagePlan } from '../shared/world.js';

let fails = 0;
const check = (c, what) => { console.log((c ? '  ok  ' : 'FAIL  ') + what); if (!c) fails++; };
const text = (page, sel) => page.$eval(sel, (e) => e.textContent);
const num = async (page, sel) => { const t = await text(page, sel); const n = parseFloat(t.replace(/,/g, '')); return /K$/.test(t) ? n * 1000 : /M$/.test(t) ? n * 1e6 : n; };
const visible = (page, sel) => page.$eval(sel, (e) => !e.hidden && getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().width > 0).catch(() => false);
const fill = (page) => page.$eval('#wbFill', (e) => parseFloat((e.style.transform.match(/scaleX\(([\d.]+)\)/) || [0, 0])[1]));
async function waitFor(fn, secs) { const t0 = Date.now(); while (Date.now() - t0 < secs * 1000) { const v = await fn(); if (v) return v; await sleep(150); } return null; }
const closeModal = async (page) => { if (await page.$eval('#modal', (e) => !e.hidden)) { await page.click('#modal [data-close]').catch(() => {}); await sleep(250); } };
const closeRevive = async (page) => { if (await visible(page, '#revive')) { await page.click('#revive [data-rv="no"]').catch(() => {}); await sleep(900); } };

// always this code, not a build left over from before
execSync('npm run build', { cwd: ROOT, stdio: 'ignore' });
await startServer(TEST_PORT, {});
const browser = await launch();
try {
    console.log('--- desktop, keyboard and mouse');
    const url = 'http://localhost:' + TEST_PORT + '/';
    const page = await open(browser, url, { w: 1280, h: 720, uid: 'prod' + Date.now() });
    console.log('  load + join', page.loadSecs, 's');
    check(await page.evaluate(() => !window.__qa), 'no QA hooks in the build');
    check(await visible(page, '#hud') && await visible(page, '#menuGrid'), 'no start menu: straight in the world, the HUD up');
    await sleep(1200);
    // the first thing: running is Speed
    const p0 = await num(page, '#powerVal');
    await page.keyboard.down('KeyW');
    await sleep(1500);
    check(await num(page, '#powerVal') > p0 + 2, 'W: running, and every step is Speed: ' + await text(page, '#powerVal'));
    // on up the path, through the Jelly Gate: off to the right of the first pool, back to the middle for the Win Pad
    const inRift = await waitFor(() => visible(page, '#wallBar'), 10);
    check(!!inRift && /STAGE 1/.test(await text(page, '#wbName')), 'into the Jelly Run: ' + await text(page, '#wbName'));
    await shot(page, 'prod-rift');
    const shade = await waitFor(async () => /studs behind|IT'S ON YOU/.test(await text(page, '#wbHp')), 6);
    check(!!shade, 'a Wobbler wakes behind: ' + await text(page, '#wbHp'));
    // the stage bar says how far along you are: SPACE just before each pool (where they are is the same on every screen)
    const z0 = wallZ(0), pz = padAt(0).z, pools = stagePlan(0, 0).list.filter((o) => o.kind === 'pool').map((o) => o.z1), jumped = new Set();
    const won = await waitFor(async () => {
        const z = z0 - (await fill(page)) * (z0 - pz);
        for (const p of pools) if (!jumped.has(p) && z - p < 5 && z - p > 0) { jumped.add(p); await page.keyboard.press('Space'); }
        if (jumped.size && pools.some((p) => z > p + 12)) for (const p of [...jumped]) if (z > p + 12) jumped.delete(p);
        return (await num(page, '#winsVal')) >= 3;
    }, 25);
    await page.keyboard.up('KeyW');
    await shot(page, 'prod-pad');
    check(!!won, 'outran it to the Win Pad, x3 the first time: ' + await text(page, '#winsVal') + ' Wins');
    await closeRevive(page);
    // a code typed in: some Wins to spend
    await page.click('#bShop'); await sleep(200);
    await page.click('#modal [data-tab="codes"]'); await sleep(150);
    await page.type('#codeIn', 'speed'); await page.keyboard.press('Enter'); await sleep(500);
    check(/Code redeemed/.test(await page.$eval('#toasts', (e) => e.textContent)), 'a code typed into the shop');
    await closeModal(page);
    // the Shoe Shop by its button
    await page.click('#bTongues'); await sleep(300);
    await page.click('#modal [data-act="tongue"]');
    check(!!(await waitFor(() => page.$eval('#modal', (e) => (e.textContent.match(/Owned ✓/g) || []).length >= 2), 8)), 'the Shoe Shop: the Fuzzy Slippers bought, owned in the shop');
    await closeModal(page);
    // a Gift Box
    await page.click('#bPals'); await sleep(300);
    await page.click('#modal [data-act="hatch"][data-n="1"]');
    const hatched = await waitFor(() => visible(page, '#hatch'), 3);
    await sleep(1200);
    await shot(page, 'prod-hatch');
    check(!!hatched, 'a Gift Box opened by its button');
    await waitFor(async () => !(await visible(page, '#hatch')), 5);
    await closeModal(page);
    // the panels by their buttons
    for (const b of ['#bTongues', '#bPals', '#bWork', '#bRebirth', '#bQuests', '#bSpin', '#bDaily', '#bWorlds', '#bShop', '#bSettings']) {
        await page.click(b); await sleep(220);
        const open1 = await page.$eval('#modal', (e) => !e.hidden && !!e.querySelector('.panel'));
        if (!open1) check(false, b + ' opens');
        await page.click('#modal [data-close]'); await sleep(160);
    }
    check(true, 'every menu button opens its panel, its X closes it');
    await page.click('#bSpin'); await sleep(250);
    const canSpin = await page.$eval('#modal [data-act="spin"]', (e) => !e.disabled).catch(() => false);
    if (canSpin) { await page.click('#modal [data-act="spin"]'); await sleep(3900); check(/YOU WON/.test(await text(page, '#popT')), 'the wheel by its button'); }
    await closeModal(page);
    // TO TREADMILLS by its button, a step onto the belt: it runs by itself, faster holding SHIFT
    await page.click('#bGo');
    await sleep(1100);
    await page.keyboard.down('KeyW'); await sleep(380); await page.keyboard.up('KeyW');
    await sleep(700);
    // (two windows by itself, the slower one counted: a Mega Squish, x5, in one window would make it look like sprinting)
    const sp1 = await num(page, '#powerVal');
    await sleep(1500);
    const spA = await num(page, '#powerVal');
    await sleep(1500);
    const sp2 = await num(page, '#powerVal');
    const walk = Math.min(spA - sp1, sp2 - spA) / 1.5;
    check(sp2 > sp1 + 4, 'TO TREADMILLS, a step onto the belt: it runs by itself (' + sp1 + ' → ' + sp2 + ')');
    check(/SPRINT/.test(await text(page, '#lickTxt')), 'on the belt DASH says SPRINT');
    await page.keyboard.down('ShiftLeft'); await sleep(2000); await page.keyboard.up('ShiftLeft');
    const sp3 = await num(page, '#powerVal');
    check((sp3 - sp2) / 2 > walk * 1.4, 'holding SHIFT sprints: ' + ((sp3 - sp2) / 2).toFixed(1) + ' a second, against ' + walk.toFixed(1));
    await shot(page, 'prod-tread');
    // the pace
    await page.click('#bAuto'); await sleep(250);
    check(/PACE 75%/.test(await text(page, '#autoTitle')), 'the pace button: ' + await text(page, '#autoTitle'));
    await page.click('#bAuto'); await sleep(150); await page.click('#bAuto'); await sleep(150);
    check(/FULL SPEED/.test(await text(page, '#autoTitle')), 'round again to full speed');
    // the daily reward offers itself back on the plaza; claim it with its button
    await page.click('#bDaily'); await sleep(300);
    const canDaily = await page.$eval('#modal [data-act="daily"]', (e) => !e.disabled).catch(() => false);
    if (canDaily) { await page.click('#modal [data-act="daily"]'); await sleep(500); check(/Next reward/.test(await page.$eval('#modal', (e) => e.textContent)), 'the daily reward claimed by its button'); }
    await closeModal(page);
    // a race, all of it, with real input
    await page.click('#bPlay'); await sleep(400);
    check(await visible(page, '#queueBar') && /1 \/ 6 found/.test(await text(page, '#qFound')), 'PLAY: the queue says who was found: ' + await text(page, '#qFound'));
    await page.click('#qCancel'); await sleep(400);
    check(!(await visible(page, '#queueBar')), 'cancel: out of the queue');
    await page.click('#bPlay');
    const inM = await waitFor(() => visible(page, '#matchHud'), 20);
    check(!!inM, 'the queue runs out: the course, the start line');
    await shot(page, 'prod-line');
    const go = await waitFor(async () => /RUN/.test(await text(page, '#countdown')), 12);
    check(!!go, 'the count, the gun');
    await page.keyboard.down('KeyW'); await page.keyboard.down('Space');
    const wl = await waitFor(async () => { const rows = await page.$$eval('#scores .sr.me em', (e) => e.map((x) => x.textContent)); return rows.length && (parseInt(rows[0], 10) >= 20 || /✓|❄️/.test(rows[0])); }, 25);
    check(!!wl, 'W and SPACE: up the lane on the board: ' + await page.$$eval('#scores .sr.me em', (e) => e.map((x) => x.textContent).join()));
    await shot(page, 'prod-race');
    const res = await waitFor(() => page.$eval('#modal', (e) => !e.hidden && /Race again/.test(e.textContent)), 140);
    await page.keyboard.up('Space'); await page.keyboard.up('KeyW');
    check(!!res, 'the race ends: the results, with a prize');
    await shot(page, 'prod-results');
    await closeModal(page);
    check(!(await visible(page, '#matchHud')) && await visible(page, '#menuGrid'), 'back in the world');
    check(page.errors.length === 0, 'no console errors: ' + JSON.stringify(page.errors.slice(0, 4)));
    await page.close();

    console.log('--- what the game tells Bloxity (an SDK stand-in)');
    const STUB = 'window.__log = []; window.Legion = { SDK: { init() { window.__log.push("init"); }, portal: { isEmbeddedInLegion() { return false; } }, game: { loadingStep() {}, updateRoom(r) { window.__log.push(r ? "room:yes" : "room:no"); }, loadingEnd() { window.__log.push("loadingEnd"); window.__startHidden = document.querySelector("#start").hidden; } }, on() {}, off() {} } };';
    const sdkPage = await open(browser, url, { w: 1280, h: 720, uid: 'prodsdk' + Date.now(), sdkStub: STUB });
    await sleep(800);
    const lg = await sdkPage.evaluate(() => window.__log);
    check(lg.filter((x) => x === 'loadingEnd').length === 1, 'loadingEnd() is called once: ' + lg.join(', '));
    check(lg.indexOf('room:yes') >= 0 && lg.indexOf('room:yes') < lg.indexOf('loadingEnd'), 'after it has joined a server, with no menu in between');
    check(await sdkPage.evaluate(() => window.__startHidden === true), 'with the loading screen already gone');
    check(sdkPage.errors.length === 0, 'no console errors: ' + JSON.stringify(sdkPage.errors.slice(0, 4)));
    await sdkPage.close();

    console.log('--- a phone in portrait, touch only');
    const ph = await open(browser, url, { w: 390, h: 844, dpr: 2, touch: true, uid: 'prodph' + Date.now() });
    console.log('  load + join', ph.loadSecs, 's');
    await sleep(1500);
    check(await visible(ph, '#stick') && await visible(ph, '#lickBtn') && await visible(ph, '#jumpBtn'), 'the stick, DASH and JUMP are there');
    const box = await ph.$eval('#stick', (e) => { const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    const cdp = await ph.createCDPSession();
    const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts });
    const pw0 = await num(ph, '#powerVal');
    await touch('touchStart', [{ x: box.x, y: box.y, id: 1 }]);
    await touch('touchMove', [{ x: box.x, y: box.y - 40, id: 1 }]);
    await sleep(1500);
    check(await num(ph, '#powerVal') > pw0 + 2, 'the stick runs, and every step is Speed: ' + await text(ph, '#powerVal'));
    // a thumb on the stick, the other on DASH
    const lb = await ph.$eval('#lickBtn', (e) => { const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    await touch('touchMove', [{ x: box.x, y: box.y - 40, id: 1 }, { x: lb.x, y: lb.y, id: 2 }]);
    await sleep(60);
    const f0 = await ph.$eval('#lickFill', (e) => e.style.transform);
    await touch('touchMove', [{ x: box.x, y: box.y - 40, id: 1 }]);
    await sleep(100);
    check(/scaleY\(0\.[0-8]/.test(await ph.$eval('#lickFill', (e) => e.style.transform)) || /scaleY\(0\.[0-8]/.test(f0), 'DASH with a thumb still on the stick: the button empties and fills back');
    const c0 = await waitFor(() => visible(ph, '#wallBar'), 12);
    await touch('touchEnd', []);
    check(!!c0, 'the stick runs into the Jelly Run: ' + await text(ph, '#wbName'));
    await shot(ph, 'prod-phone');
    const t0 = await ph.$eval('#bTongues', (e) => { const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    await sleep(300);
    await closeRevive(ph);
    await touch('touchStart', [{ x: t0.x, y: t0.y, id: 3 }]); await sleep(40); await touch('touchEnd', []); await sleep(350);
    check(await ph.$eval('#modal', (e) => !e.hidden), 'a menu button by touch');
    await sleep(300);
    await ph.click('#modal [data-close]').catch(() => {}); await sleep(300);
    if (await ph.$eval('#modal', (e) => !e.hidden)) { const xb = await ph.$eval('#modal [data-close]', (e) => { const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }); await touch('touchStart', [{ x: xb.x, y: xb.y, id: 4 }]); await sleep(40); await touch('touchEnd', []); await sleep(300); }
    // out of the Wobbler's way first (standing in a stage it catches you, and the revive prompt would take the tap): TO TREADMILLS by touch
    await closeRevive(ph);
    const gb = await ph.$eval('#bGo', (e) => { const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    await touch('touchStart', [{ x: gb.x, y: gb.y, id: 4 }]); await sleep(40); await touch('touchEnd', []); await sleep(1600);
    await closeRevive(ph);
    // a thumb on the stick, the other on a button: a browser makes no click for a second finger
    const t1 = await ph.$eval('#bQuests', (e) => { const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    await touch('touchStart', [{ x: box.x, y: box.y, id: 1 }]); await sleep(120);
    await touch('touchStart', [{ x: box.x, y: box.y, id: 1 }, { x: t1.x, y: t1.y, id: 2 }]); await sleep(60);
    await touch('touchEnd', [{ x: box.x, y: box.y, id: 1 }]); await sleep(120);
    await touch('touchEnd', []); await sleep(400);
    check(await ph.$eval('#modal', (e) => !e.hidden && !!e.querySelector('.panel')), 'a button pressed with a thumb still on the stick');
    check(ph.errors.length === 0, 'no console errors: ' + JSON.stringify(ph.errors.slice(0, 4)));
} catch (e) { console.error(e); fails++; } finally { await browser.close(); stopAll(); }
console.log(fails ? fails + ' FAILED' : 'all good');
process.exit(fails ? 1 : 0);
