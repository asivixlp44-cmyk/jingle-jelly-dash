// A whole session with nothing but a controller: a stand-in for the browser's Gamepad API, pressed like real buttons and read by the
// game's own code. Runs, looks, jumps, dashes, sprints on a treadmill, reaches every button of the HUD and of every panel with the ring, buys something,
// plays a race to the end, unplugs. Run: node tests/gamepad.mjs
import { startServer, startVite, stopAll, launch, open, qa, shot, sleep, TEST_PORT } from './lib.mjs';

let fails = 0;
const check = (c, what) => { console.log((c ? '  ok  ' : 'FAIL  ') + what); if (!c) fails++; };
const FAKE = () => {
    const g = { id: 'Test Controller (STANDARD GAMEPAD)', index: 0, connected: true, mapping: 'standard', timestamp: 0, axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })), vibrationActuator: { playEffect: () => { window.__rumbles = (window.__rumbles || 0) + 1; return Promise.resolve('complete'); } } };
    window.__pad = g;
    navigator.getGamepads = () => [window.__padOn ? g : null, null, null, null];
    window.__padPlug = (on) => { window.__padOn = on; g.connected = on; const e = new Event(on ? 'gamepadconnected' : 'gamepaddisconnected'); e.gamepad = g; dispatchEvent(e); };
};
const BTN = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, BACK: 8, START: 9, L3: 10, R3: 11, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };
const set = (page, name, on) => page.evaluate((i, v) => { const b = window.__pad.buttons[i]; b.pressed = v; b.value = v ? 1 : 0; }, BTN[name], on);
const tap = async (page, name) => { await set(page, name, true); await sleep(70); await set(page, name, false); await sleep(70); };
const axes = (page, a) => page.evaluate((v) => { window.__pad.axes = v; }, a);
const st = (page) => qa(page, () => window.__qa.state());
const ringId = (page) => page.evaluate(() => { const r = window.__qa.padNav.ring; return r ? (r.id || r.dataset.act || r.dataset.tab || r.textContent.trim().slice(0, 20)) : null; });
// every button of a layer: can the ring get to it from where it starts, with the four directions?
const reach = (page) => page.evaluate(() => {
    const N = window.__qa.padNav, layer = N.layer();
    if (!layer) return { all: 0, got: 0, missed: ['no layer'] };
    const list = N.list(layer);
    const seen = new Set(), todo = [N.ring || list[0]];
    if (todo[0]) seen.add(todo[0]);
    while (todo.length) {
        const at = todo.pop();
        for (const d of ['UP', 'DOWN', 'LEFT', 'RIGHT']) {
            N.setRing(at);
            N.step(d);
            const to = N.ring;
            if (to && !seen.has(to)) { seen.add(to); todo.push(to); }
        }
    }
    const missed = list.filter((b) => !seen.has(b)).map((b) => b.id || b.dataset.act || b.dataset.tab || b.className);
    N.setRing(list[0]);
    return { all: list.length, got: seen.size, missed };
});

await startServer(TEST_PORT, { QA: '1' });
await startVite();
const browser = await launch();
try {
    const page = await open(browser, 'http://localhost:5579/', { w: 1280, h: 720, q: 'low', uid: 'pad' + Date.now(), init: FAKE });
    await qa(page, () => { window.__qa.noWatch(true); window.__qa.close(); });
    await sleep(500);

    console.log('--- plugged in');
    await page.evaluate(() => window.__padPlug(true));
    await sleep(300);
    check(await page.evaluate(() => document.body.classList.contains('pad')), 'the game knows a controller is in use');
    check(await page.evaluate(() => /RT/.test(document.querySelector('#tips').textContent)), 'the hints are the controller\'s');
    await shot(page, 'pad-tips');

    console.log('--- walking and looking');
    const a0 = await st(page);
    await axes(page, [0, -1, 0, 0]);
    await sleep(1000);
    await axes(page, [0, 0, 0, 0]);
    const a1 = await st(page);
    check(a1.z < a0.z - 8, 'left stick up walks north: ' + a0.z + ' to ' + a1.z);
    await sleep(350);
    const a2 = await st(page);
    await sleep(350);
    const a3 = await st(page);
    check(Math.abs(a3.z - a2.z) < 0.01, 'let go and you stop');
    await axes(page, [0.1, 0.1, 0, 0]);
    await sleep(400);
    const a4 = await st(page);
    check(Math.abs(a4.z - a3.z) < 0.01 && Math.abs(a4.x - a3.x) < 0.01, 'a stick resting a little off centre doesn\'t walk you anywhere');
    await axes(page, [0, 0, 0, 0]);
    const yaw0 = await qa(page, () => window.__qa.cam.yaw);
    await axes(page, [0, 0, 1, 0]);
    await sleep(500);
    await axes(page, [0, 0, 0, 0]);
    const yaw1 = await qa(page, () => window.__qa.cam.yaw);
    check(yaw1 < yaw0 - 0.5, 'right stick turns the camera: ' + yaw0.toFixed(2) + ' to ' + yaw1.toFixed(2));
    await qa(page, () => window.__qa.look(0, 0.2));
    await set(page, 'A', true);
    await sleep(200);
    const j = await st(page);
    await set(page, 'A', false);
    check(j.y > 0.5, 'A jumps: up to ' + j.y);
    await sleep(900);
    const d0 = await qa(page, () => window.__qa.cam.dist);
    await tap(page, 'R3');
    check((await qa(page, () => window.__qa.cam.dist)) !== d0, 'R3 changes the zoom');

    console.log('--- a treadmill, sprinting');
    await qa(page, () => { window.__qa.teleport(-20, 0, 75, Math.PI); });
    await sleep(800);
    const p0 = (await st(page)).speed;
    await sleep(1500);
    const pIdle = (await st(page)).speed - p0;
    await set(page, 'RT', true);
    await sleep(1500);
    await set(page, 'RT', false);
    await sleep(300);
    const p1 = (await st(page)).speed;
    check(p1 - p0 - pIdle > pIdle * 1.2, 'holding RT sprints on the belt: ' + pIdle.toFixed(0) + ' idle, then ' + (p1 - p0 - pIdle).toFixed(0) + ' in 1.5 s');
    await qa(page, () => { window.__qa.teleport(0, 0, 70, Math.PI); });
    await sleep(400);
    await axes(page, [0, -1, 0, 0]);
    await sleep(300);
    await tap(page, 'X');
    await sleep(200);
    await axes(page, [0, 0, 0, 0]);
    check((await qa(page, () => window.__qa.P.dashReady)) > 0, 'X dashes');
    check((await page.evaluate(() => window.__rumbles || 0)) > 0, 'you feel it in your hands');

    console.log('--- a shop, with Y');
    await qa(page, () => { window.__qa.give({ wins: 5000, gems: 500, playSecs: 200 }); window.__qa.teleport(44, 0, 66, Math.PI); });
    await sleep(500);
    check((await st(page)).prompt === 'Shoe Shop', 'at the Shoe Shop, its prompt is up');
    check(await page.evaluate(() => document.querySelector('#promptBtn kbd').textContent === 'Y'), 'the prompt says Y');
    await tap(page, 'Y');
    await sleep(400);
    check(await page.evaluate(() => !document.querySelector('#modal').hidden), 'Y opens it');
    check(!!(await ringId(page)), 'the ring is on: ' + (await ringId(page)));
    check(await page.evaluate(() => getComputedStyle(document.querySelector('#padHint')).display !== 'none'), 'the hints for a menu are up');
    await shot(page, 'pad-panel');
    const tongue0 = (await st(page)).shoe;
    await tap(page, 'A');
    await sleep(500);
    const after = await st(page);
    const confirmUp = await page.evaluate(() => !document.querySelector('#confirm').hidden);
    if (confirmUp) { await shot(page, 'pad-confirm'); await tap(page, 'A'); await sleep(500); }
    check((await st(page)).shoe > tongue0, 'A buys the next shoes: ' + tongue0 + ' to ' + (await st(page)).shoe + (confirmUp ? ' (after a yes)' : ''));
    void after;
    await tap(page, 'B');
    await sleep(300);
    check(await page.evaluate(() => document.querySelector('#modal').hidden), 'B closes it');
    check((await ringId(page)) === null, 'the ring has gone');

    console.log('--- the HUD');
    await qa(page, () => window.__qa.teleport(0, 0, 92, Math.PI));
    await sleep(300);
    await tap(page, 'LEFT');
    check((await ringId(page)) === 'bTongues', 'the D-pad brings the ring to the HUD: ' + (await ringId(page)));
    await shot(page, 'pad-hud');
    const hud = await reach(page);
    check(hud.missed.length === 0, 'the ring reaches every button of the HUD: ' + hud.got + ' of ' + hud.all + (hud.missed.length ? ' missing ' + hud.missed : ''));
    const y0 = (await st(page)).y;
    await page.evaluate(() => window.__qa.padNav.setRing(document.querySelector('#bTongues')));
    await tap(page, 'A');
    await sleep(350);
    check((await st(page)).y === y0 && await page.evaluate(() => !document.querySelector('#modal').hidden), 'A presses that button, with no jump');
    await tap(page, 'B');
    await sleep(250);
    check((await ringId(page)) === 'bTongues', 'B closes the panel and the ring is back where it was');
    await tap(page, 'B');
    await sleep(200);
    check((await ringId(page)) === null, 'B again and you\'re back in the world');
    await tap(page, 'RIGHT');
    check((await ringId(page)) === 'bPlay', 'D-pad right starts on PLAY');
    const z0 = (await st(page)).z;
    await axes(page, [0, -1, 0, 0]);
    await sleep(500);
    await axes(page, [0, 0, 0, 0]);
    check((await ringId(page)) === null && (await st(page)).z < z0 - 1, 'the stick walks you off the HUD');

    console.log('--- every panel');
    for (const [k, t] of [['tongues'], ['pals', 'jaws'], ['pals', 'team'], ['work', 'ups'], ['work', 'trails'], ['work', 'auras'], ['spin'], ['rebirth'], ['worlds'], ['shop'], ['shop', 'codes'], ['quests'], ['daily'], ['gifts'], ['boards'], ['settings']]) {
        await qa(page, (a) => { window.__qa.close(); window.__qa.panel(a.k, a.t); }, { k, t });
        await sleep(200);
        await qa(page, () => {});
        const r = await reach(page);
        const name = k + (t ? '/' + t : '');
        check(r.missed.length === 0 && r.all > 0, name + ': ' + r.got + ' of ' + r.all + ' buttons' + (r.missed.length ? ', missing ' + r.missed.slice(0, 5) : ''));
    }
    await qa(page, () => { window.__qa.close(); window.__qa.panel('pals', 'jaws'); });
    await sleep(250);
    const tab0 = await page.evaluate(() => document.querySelector('.tab.on').dataset.tab);
    await tap(page, 'RB');
    await sleep(250);
    const tab1 = await page.evaluate(() => document.querySelector('.tab.on').dataset.tab);
    check(tab1 !== tab0, 'RB changes the tab: ' + tab0 + ' to ' + tab1);
    await tap(page, 'LB');
    await sleep(250);
    check((await page.evaluate(() => document.querySelector('.tab.on').dataset.tab)) === tab0, 'LB changes it back');
    await qa(page, () => { window.__qa.close(); window.__qa.panel('settings'); });
    await sleep(250);
    await page.evaluate(() => window.__qa.padNav.setRing(document.querySelector('input[type=range]')));
    const v0 = await page.evaluate(() => +document.querySelector('input[type=range]').value);
    await tap(page, 'RIGHT');
    const v1 = await page.evaluate(() => +document.querySelector('input[type=range]').value);
    check(v1 !== v0 || v0 === 100, 'the D-pad moves a slider: ' + v0 + ' to ' + v1);
    await shot(page, 'pad-settings');
    await tap(page, 'START');
    await sleep(250);
    check(await page.evaluate(() => document.querySelector('#modal').hidden), 'Start closes a panel');
    await tap(page, 'START');
    await sleep(250);
    check(await page.evaluate(() => !document.querySelector('#modal').hidden), 'Start opens the settings');
    await tap(page, 'B');
    await sleep(250);
    await tap(page, 'BACK');
    await sleep(250);
    check(await page.evaluate(() => !document.querySelector('#modal').hidden), 'View opens the quests');
    await tap(page, 'B');
    await sleep(250);

    console.log('--- to a stage and up it');
    await qa(page, () => window.__qa.give({ speed: 200, best: 3, noShade: true }));
    await qa(page, () => { window.__qa.teleport(0, 0, 92, Math.PI); });
    await sleep(500);
    await tap(page, 'Y');
    await sleep(1500);
    const w0 = await st(page);
    check(w0.z < 30, 'Y with nothing near takes you to a stage: z ' + w0.z + ', stage ' + (w0.stage + 1));
    await axes(page, [0, -1, 0, 0]);
    await set(page, 'RT', true);
    await sleep(2500);
    await set(page, 'RT', false);
    await axes(page, [0, 0, 0, 0]);
    const w1 = await st(page);
    check(w1.z < w0.z - 30, 'the stick and RT up the stage: ' + Math.round(w0.z - w1.z) + ' studs');

    console.log('--- a race, on the controller alone');
    await qa(page, () => { window.__qa.send('qa', {}); window.__qa.close(); });
    await qa(page, () => { window.__qa.teleport(0, 0, 92, Math.PI); });
    await sleep(300);
    await tap(page, 'LB');
    await sleep(300);
    check((await st(page)).queued || !!(await st(page)).match, 'LB joins the queue');
    await qa(page, () => window.__qa.send('unplay', {}));
    await sleep(300);
    await qa(page, () => window.__qa.play({ map: 1, lv: 8, now: true }));
    await page.waitForFunction(() => { const m = window.__qa.state().match; return m && m.phase === 'play'; }, { timeout: 30000 });
    await axes(page, [0, -1, 0, 0]);
    await set(page, 'RT', true);
    let peak = 0;
    for (let i = 0; i < 480; i++) {
        const s = await st(page);
        if (!s.match) break;
        peak = Math.max(peak, -s.z);
        if (i % 16 === 0) { await set(page, 'A', true); await sleep(60); await set(page, 'A', false); }
        await sleep(250);
    }
    await set(page, 'RT', false);
    await axes(page, [0, 0, 0, 0]);
    check(peak > 60, 'up the lane in the race: ' + Math.round(peak) + ' studs');
    await page.waitForFunction(() => !window.__qa.state().match, { timeout: 60000 });
    await sleep(900);
    check(await page.evaluate(() => !document.querySelector('#modal').hidden), 'the results are up');
    check(!!(await ringId(page)), 'the ring is on the results: ' + (await ringId(page)));
    await shot(page, 'pad-results');
    await tap(page, 'B');
    await sleep(300);
    check(await page.evaluate(() => document.querySelector('#modal').hidden), 'B leaves the results');

    console.log('--- other hands, other ways');
    await tap(page, 'LEFT');
    check(!!(await ringId(page)), 'the ring is up');
    await page.mouse.move(300, 300);
    await page.mouse.move(420, 380, { steps: 2 });
    await sleep(200);
    check((await ringId(page)) === null && await page.evaluate(() => !document.body.classList.contains('pad')), 'a mouse takes over: the ring and the hints go');
    await tap(page, 'X');
    await sleep(100);
    check(await page.evaluate(() => document.body.classList.contains('pad')), 'the controller takes back over');
    await axes(page, [0, -1, 0, 0]);
    await sleep(150);
    await page.evaluate(() => window.__padPlug(false));
    await sleep(300);
    const u0 = await st(page);
    await sleep(500);
    const u1 = await st(page);
    check(Math.abs(u1.z - u0.z) < 0.01 && await page.evaluate(() => !document.body.classList.contains('pad')), 'unplugged while walking: you stop, the hints go');
    const errs = [...page.errors, ...(await qa(page, () => window.__qa.errors()))];
    check(errs.length === 0, 'no console errors: ' + JSON.stringify(errs.slice(0, 3)));
    await page.close();

    // a controller with no standard layout whose axes rest away from the middle
    console.log('--- a cheap controller');
    const FAKE2 = () => {
        const g = { id: 'Generic USB Joystick', index: 0, connected: true, mapping: '', timestamp: 0, axes: [0, 0, -1, -1], buttons: Array.from({ length: 12 }, () => ({ pressed: false, touched: false, value: 0 })) };
        window.__pad = g;
        navigator.getGamepads = () => [window.__padOn ? g : null, null, null, null];
        window.__padPlug = (on) => { window.__padOn = on; const e = new Event('gamepadconnected'); e.gamepad = g; dispatchEvent(e); };
    };
    const p2 = await open(browser, 'http://localhost:5579/', { w: 960, h: 540, q: 'low', uid: 'pad2' + Date.now(), init: FAKE2 });
    await qa(p2, () => { window.__qa.noWatch(true); window.__qa.close(); });
    await sleep(300);
    await p2.evaluate(() => window.__padPlug(true));
    await sleep(300);
    const c0 = await qa(p2, () => window.__qa.cam.yaw);
    await sleep(500);
    check((await qa(p2, () => window.__qa.cam.yaw)) === c0, 'axes resting at -1 don\'t spin the camera');
    await axes(p2, [0, -1, -1, -1]);
    const n0 = await st(p2);
    await sleep(600);
    await axes(p2, [0, 0, -1, -1]);
    check((await st(p2)).z < n0.z - 3, 'it still walks you');
    await p2.close();
} catch (e) { console.error(e); fails++; } finally { await browser.close(); stopAll(); }
console.log(fails ? fails + ' problems' : 'all good');
process.exit(fails ? 1 : 0);
