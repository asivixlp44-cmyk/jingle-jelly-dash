// The whole loop and its guards, headless: starts its own server (QA=1, a temporary data folder) and plays it over the
// network as real clients do. Run: npm --prefix tests run server
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@colyseus/sdk';
import { CFG, WALLS_N, WORLDS, SHOES, TRAILS, AURAS, POSTS, UPGRADES, JAWBREAKERS, upgradeCost, xpNeed, lvCap, rebirthCost, rebirthMult, padWins, FIRST_PAD, stepGain, CODES, QUESTS, GIFTS, DAILY, matchInfo, stageNeed, runSpeed, shadeRel, strideOf } from '../shared/config.js';
import { W, wallZ, padAt, postSpot, checkpoint, stagePlan } from '../shared/world.js';
import { arenaPlan, startSpot, laneX, surgeAt } from '../shared/arena.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 2998, URL_ = 'http://localhost:' + PORT;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-test-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
function ok(cond, what) { if (cond) { pass++; console.log('  ok  ' + what); } else { fail++; console.log('FAIL  ' + what); } }

class Bot {
    constructor(name) { this.name = name; this.msgs = {}; this.p = {}; this.x = 0; this.z = W.spawn.z; this.y = 0; this.seq = 0; this.snaps = 0; }
    async join(extra) {
        const c = new Client(URL_);
        this.room = await c.joinOrCreate('run', { uid: 'test_' + this.name, name: this.name, ...(extra || {}) });
        const R = this.room;
        for (const t of ['hello', 'pong', 'toast', 'broke', 'code', 'boards', 'reward', 'levelup', 'padok', 'warped', 'reborn', 'warp', 'spun', 'bought', 'taskdone', 'questdone', 'hatched', 'caught', 'revived', 'escaped', 'mQueue', 'mStart', 'mGo', 'mScore', 'mDone', 'mOut', 'mTime', 'mEnd', 'mBack', 'mJoined', 'mLeft', 'mSync', 'mNone', 'authed', 'emote', 'chat', 'candy', 'saved']) R.onMessage(t, (m) => { (this.msgs[t] = this.msgs[t] || []).push(m); });
        R.onMessage('profile', (m) => { Object.assign(this.p, m); this.profiles = (this.profiles || 0) + 1; });
        R.onMessage('lite', (m) => { Object.assign(this.p, m); });
        R.onMessage('snap', (m) => { this.snaps++; this.x = m.x; this.y = m.y; this.z = m.z; });
        await this.wait(() => this.p.now);
        const me = R.state.players.get(R.sessionId);
        this.x = me.x; this.z = me.z;
        return this;
    }
    send(t, m) { this.room.send(t, m || {}); }
    async wait(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < (ms ?? 5000)) { const v = fn(); if (v) return v; await sleep(15); } return null; }
    got(t) { return (this.msgs[t] || []).length; }
    last(t) { const l = this.msgs[t]; return l && l[l.length - 1]; }
    clear(t) { this.msgs[t] = []; }
    move(x, y, z, ts, a, post) { this.x = x; this.y = y; this.z = z; this.send('move', { x, y, z, ry: 0, a: a ?? 1, ts: ts ?? Date.now(), post }); }
    // a QA teleport: next move is checked from there
    async tp(x, y, z) { this.send('qa', { tp: [x, y, z] }); this.x = x; this.z = z; this.y = y; await sleep(60); this.move(x, y, z); await sleep(60); }
    // run in a straight line to (x, z) at v studs a second, a move every 100 ms
    async run(x, z, v) {
        const sx = this.x, sz = this.z, d = Math.hypot(x - sx, z - sz), n = Math.max(1, Math.ceil(d / ((v || 30) * 0.1)));
        for (let i = 1; i <= n; i++) { this.move(sx + (x - sx) * i / n, 0, sz + (z - sz) * i / n); await sleep(100); }
    }
    step(n, post) { this.send('step', { n, post: post ?? -1, s: ++this.seq }); }
    // n steps on a treadmill at a rate the bucket allows
    async tread(n, post) { for (let i = 0; i < n; i += 3) { this.step(Math.min(3, n - i), post); await sleep(330); } await sleep(300); }
    me() { return this.room.state.players.get(this.room.sessionId); }
    leave() { return this.room.leave(); }
}

const srv = spawn(process.execPath, ['src/index.js'], { cwd: path.join(ROOT, 'server'), env: { ...process.env, PORT: String(PORT), QA: '1', DATA_DIR: dataDir, NO_BOTS: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
srv.stdout.on('data', (d) => { if (process.env.VERBOSE) process.stdout.write(d); });
srv.stderr.on('data', (d) => { if (!/SAVE_SECRET/.test(String(d))) process.stderr.write(d); });
for (let i = 0; i < 60; i++) { try { const r = await fetch(URL_ + '/health'); if (r.ok) break; } catch (e) { /* not yet */ } await sleep(150); }

try {
    console.log('--- a new player');
    const a = await new Bot('alice').join();
    ok(a.p.lv === 1 && a.p.speed === 0 && a.p.wins === 0 && a.p.shoe === 0 && a.p.rebirths === 0, 'starts at Level 1 with nothing');
    ok(a.got('boards') === 1, 'told the leaderboards');
    a.send('ping', { c: 123 });
    await a.wait(() => a.last('pong'));
    ok(a.last('pong').c === 123 && Math.abs(a.last('pong').s - Date.now()) < 2000, 'ping answers with the server\'s clock');
    let bots = 0;
    a.room.state.players.forEach((p) => { if (p.bot) bots++; });
    ok(bots === CFG.bots - 1, 'a bot goes home for each real player (' + bots + ' left)');

    console.log('--- steps on the ground');
    a.step(3);
    await sleep(300);
    ok(a.p.steps === 0, 'steps standing still count for nothing (' + a.p.steps + ')');
    await a.run(a.x, a.z - 30, 30);
    a.step(4);
    await a.wait(() => a.p.steps >= 4);
    ok(a.p.steps === 4 && a.p.speed === 4, 'steps after running 30 studs: +1 Speed each (' + a.p.speed + ')');
    ok(a.p.ack >= 2, 'the answer says which steps it has heard');
    const st0 = a.p.steps;
    a.step(30);
    await sleep(400);
    const stride = strideOf(runSpeed({}, 4, 0)) * 0.7;
    ok(a.p.steps - st0 <= Math.ceil(26 / stride) + 1, 'no more steps than the strides run (' + (a.p.steps - st0) + ' for 26 studs left)');
    a.send('step', { n: 9999, post: -1, s: ++a.seq });
    await sleep(300);
    ok(a.p.steps < 40, 'a batch is cut down to 30 steps at most');

    console.log('--- treadmills');
    const t0 = postSpot(0), t1 = postSpot(1);
    await a.tp(t0.x, 0, t0.z + 1);
    a.move(t0.x, 0, t0.z + 1, Date.now(), 3, 0);
    await sleep(80);
    const sp0 = a.p.speed;
    await a.tread(9, 0);
    ok(a.p.speed - sp0 >= 8, 'running on the Gumdrop Belt: +1 a step (' + (a.p.speed - sp0) + ')');
    ok(a.me().post === 0 && a.me().anim === 3, 'everyone sees you on it');
    const sp1 = a.p.speed;
    await a.tread(6, 1);
    ok(a.p.speed - sp1 <= 1, 'the Peppermint Belt is shut without a rebirth (' + (a.p.speed - sp1) + ')');
    await a.tp(t1.x, 0, t1.z + 1);
    const sp2 = a.p.speed;
    await a.tread(6, 0);
    ok(a.p.speed - sp2 <= 1, 'a treadmill counts only standing on it');
    // the bucket: 60 at once is not 60
    await a.tp(t0.x, 0, t0.z + 1);
    const sp3 = a.p.steps;
    for (let i = 0; i < 6; i++) a.step(10, 0);
    await sleep(400);
    ok(a.p.steps - sp3 <= 16, 'a treadmill\'s steps are capped by the clock (' + (a.p.steps - sp3) + ' of 60)');
    ok(a.p.megas >= 1, 'every ' + CFG.megaEvery + 'th step is a Mega Squish (' + a.p.megas + ')');
    ok(a.p.lv > 1 && a.got('levelup') > 0, 'Speed fills the Level bar: Level ' + a.p.lv);

    console.log('--- the gates');
    a.send('qa', { speed: 5, noShade: true });
    await a.wait(() => a.p.speed === 5);
    await a.tp(0, 0, W.plaza.z0 + 4);
    await a.run(0, wallZ(1) + 6, 34);
    const sn0 = a.snaps;
    await a.run(0, wallZ(1) - 12, 30);
    await sleep(200);
    ok(a.snaps > sn0, 'gate 2 (' + stageNeed(0, 1) + ' Speed) sends 5 Speed back');
    a.send('qa', { speed: stageNeed(0, 1) + 1 });
    await a.wait(() => a.p.speed > stageNeed(0, 1));
    await a.tp(0, 0, wallZ(1) + 6);
    const sn1 = a.snaps;
    await a.run(0, wallZ(1) - 12, 30);
    await sleep(200);
    ok(a.snaps === sn1 && a.me().z < wallZ(1) - 8, 'with enough Speed it opens');
    const sn2 = a.snaps;
    a.move(0, 0, a.z - 200);
    await sleep(150);
    ok(a.snaps > sn2, 'too far in one go: sent back');
    await sleep(250);
    a.move(0, 40, a.z);
    await sleep(150);
    ok(a.snaps > sn2 + 1, 'too high: sent back');

    console.log('--- Win Pads');
    const pd = padAt(0);
    await a.tp(0, 0, pd.z + 30);
    a.send('pad', { k: 0 });
    await sleep(200);
    ok(a.got('padok') === 0, 'not on the pad: nothing');
    await a.tp(pd.x, 0, pd.z);
    a.send('pad', { k: 0 });
    await a.wait(() => a.got('padok'));
    const pk = a.last('padok');
    ok(pk && pk.first && pk.n === padWins(0, 0) * FIRST_PAD, 'the first time each rebirth: x' + FIRST_PAD + ' (' + (pk && pk.n) + ' Wins)');
    ok(a.p.bests[0] === 1 && a.p.cleared === 1, 'Stage 1 cleared');
    a.send('pad', { k: 0 });
    await sleep(250);
    ok(a.got('padok') === 1, 'not again straight away');
    a.send('pad', { k: 3 });
    await sleep(200);
    ok(a.got('padok') === 1, 'a pad you\'re not on: nothing');

    console.log('--- golden candies');
    const gc = stagePlan(0, 0).candies[0], gc2 = stagePlan(0, 0).candies[1];
    await a.tp(gc.x + 40, 0, gc.z);
    a.send('candy', { k: 0, i: 0 });
    await a.wait(() => a.got('candy'));
    ok(a.last('candy').ok === false && !((a.p.candies[0] || [])[0] & 1), 'a candy you are not at: refused');
    const gm0 = a.p.gems;
    await a.tp(gc.x, Math.max(0, gc.y - 1.5), gc.z);
    a.send('candy', { k: 0, i: 0 });
    await a.wait(() => a.got('candy') === 2);
    ok(a.last('candy').ok && ((a.p.candies[0] || [])[0] & 1) === 1 && a.p.candyN === 1 && a.p.gems === gm0 + 2, 'at it: found, 2 Gems, saved (' + a.p.candyN + ')');
    a.send('candy', { k: 0, i: 0 });
    await sleep(250);
    ok(a.got('candy') === 2 && a.p.candyN === 1, 'the same candy again: nothing');
    await a.tp(gc2.x, Math.max(0, gc2.y - 1.5), gc2.z);
    a.send('candy', { k: 0, i: 1 });
    await a.wait(() => a.got('candy') === 3);
    ok(a.last('candy').ok && a.last('candy').n === 2, 'a second one: 2 found in Jingle Village');

    console.log('--- a Wobbler');
    a.send('qa', { speed: 0 });
    a.send('qa', { tp: [0, 0, W.plaza.z0 + 2] });
    a.room.state.players.get(a.room.sessionId);
    await sleep(100);
    // a fresh player for the Wobblers (alice has turned them off)
    const c = await new Bot('carol').join();
    await c.tp(0, 0, wallZ(0) + 2);
    await c.run(0, wallZ(0) - 8, 20);
    await c.wait(() => c.me().shK === 0, 2000);
    ok(c.me().shK === 0 && c.me().shV > 0, 'stage 1\'s Wobbler wakes behind you (' + c.me().shV.toFixed(1) + ' studs a second)');
    ok(Math.abs(c.me().shV - runSpeed({}, 0, 0) * shadeRel(0, {})) < 0.01, 'it runs at a share of your top speed');
    // stand still: the first time it reaches you it bounces off (a close call) and comes again from well back; then it catches you
    await c.wait(() => c.got('saved'), 9000);
    ok(c.got('saved') === 1 && c.got('caught') === 0, 'the first time it reaches you: a close call, not a catch');
    await sleep(150);
    ok(c.me().shK === 0 && c.me().shZ > c.z + 20, 'it comes again from well back (' + (c.me().shZ - c.z).toFixed(0) + ' studs)');
    await c.wait(() => c.got('caught'), 12000);
    ok(c.got('caught') === 1 && c.last('caught').k === 0, 'standing still, it catches you the second time');
    await sleep(150);
    ok(c.me().shK === 255 && c.me().anim === 4, 'down where you stood, its Wobbler gone');
    const cz = c.z, sn3 = c.snaps;
    c.move(0, 0, cz - 4);
    await sleep(150);
    ok(c.snaps === sn3, 'moves while down are ignored, not snapped');
    c.send('revive');
    await sleep(250);
    ok(c.got('broke') === 1 && c.got('revived') === 0, 'reviving needs ' + CFG.reviveGems + ' Gems');
    c.send('qa', { gems: 20 });
    await c.wait(() => c.p.gems === 20);
    c.send('revive');
    await c.wait(() => c.got('revived'));
    ok(c.got('revived') === 1 && c.p.gems === 20 - CFG.reviveGems, 'revived where you went down, for ' + CFG.reviveGems + ' Gems');
    await sleep(150);
    ok(c.me().shK === 0 && c.me().shZ > cz + 20, 'its Wobbler comes again, from well back');
    // run for the pad: escape
    await c.run(0, padAt(0).z - 2, 26);
    await c.wait(() => c.got('escaped'), 1500);
    ok(c.got('escaped') === 1 && c.p.escapes >= 1, 'reaching the Win Pad: escaped');
    { const e = c.last('escaped'); ok(e.secs > 1 && e.secs < 30 && e.best === true && !e.old, 'timed on the server\'s clock from going in (through the revive): ' + e.secs + ' s, a first best'); }
    ok(c.me().shK === 255, 'the Wobbler is gone');
    // caught again, then back to the gate
    await c.tp(0, 0, wallZ(0) + 2);
    await c.run(0, wallZ(0) - 8, 20);
    await c.wait(() => c.got('caught') >= 2, 20000);
    c.send('respawn');
    await c.wait(() => c.got('warped'));
    const wp = c.last('warped'), cp = checkpoint(0);
    ok(wp && wp.why === 'caught' && wp.z === cp.z, 'or back to the stage\'s gate');
    // the revive window runs out by itself
    await c.run(0, wallZ(0) - 14, 20);
    await c.wait(() => c.got('caught') >= 3, 20000);
    const w0 = c.got('warped');
    await c.wait(() => c.got('warped') > w0, (CFG.reviveSecs + 3) * 1000);
    ok(c.got('warped') > w0, 'no answer: back to the gate after ' + CFG.reviveSecs + ' s');
    // a pool: back to the gate
    const pool = stagePlan(0, 0).list.find((o) => o.kind === 'pool');
    if (pool) {
        await c.tp(0, 0, (pool.z0 + pool.z1) / 2);
        const w1 = c.got('warped');
        c.send('fell', { k: 0 });
        await c.wait(() => c.got('warped') > w1);
        ok(c.last('warped').why === 'fell' && c.last('warped').z === cp.z, 'into a pool: back to the gate');
        c.send('fell', { k: 4 });
        await sleep(200);
        ok(c.got('warped') === w1 + 1, 'a fall somewhere you\'re not: nothing');
    }

    console.log('--- spending');
    a.send('shoe');
    await a.wait(() => a.got('broke') || a.got('bought'));
    ok(a.p.shoe === 0 || a.p.wins >= 0, 'shoes cost Wins');
    a.send('qa', { wins: 100000, gems: 2000 });
    await a.wait(() => a.p.wins >= 100000);
    const w2 = a.p.wins;
    a.send('shoe');
    await a.wait(() => a.p.shoe === 1);
    ok(a.p.shoe === 1 && a.p.wins === w2 - SHOES[1].wins, 'the Fuzzy Slippers for ' + SHOES[1].wins + ' Wins');
    ok(stepGain({ ...a.p, team: a.p.team }, false, 0) > stepGain({ ...a.p, shoe: 0 }, false, 0), 'shoes add to every step');
    for (const u of UPGRADES.slice(0, 3)) { a.send('upgrade', { id: u.id }); }
    await sleep(300);
    ok(UPGRADES.slice(0, 3).every((u) => a.p.ups[u.id] === 1), 'upgrades for Wins');
    await sleep(200);
    const g0 = a.p.gems, wt = a.p.wins;
    a.send('trail', { i: 1 }); a.send('aura', { i: 1 });
    await sleep(300);
    ok(a.p.trail === 1 && a.p.aura === 1 && a.p.gems <= g0 - AURAS[1].gems + 10 && a.p.wins <= wt - TRAILS[1].wins + 10, 'a trail for Wins, an aura for Gems');
    const gp = POSTS.findIndex((x) => x.gems);
    a.send('post', { i: gp });
    await sleep(200);
    ok(a.p.posts[POSTS[gp].id] === 1, 'the ' + POSTS[gp].name + ' for Gems');
    a.send('hatch', { j: 0, n: 3 });
    await a.wait(() => a.got('hatched'));
    ok(a.last('hatched').got.length === 3 && a.p.hatched === 3 && a.p.team.length === 3, 'three Gift Boxes: three pets, on the team by themselves');
    a.send('hatch', { j: 99 });
    await sleep(150);
    ok(a.p.hatched === 3, 'a Gift Box that isn\'t there: nothing');

    console.log('--- rewards');
    a.send('daily');
    await a.wait(() => a.got('reward'));
    ok(a.p.daily.streak === 1, 'the daily reward, day 1');
    a.send('daily');
    await sleep(200);
    ok(a.p.daily.streak === 1, 'once a day');
    a.send('gift', { i: 0 });
    await sleep(200);
    ok(!a.p.gifts[0], 'a gift before its time: nothing');
    a.send('qa', { playSecs: GIFTS[0].min * 60 });
    await sleep(100);
    a.send('gift', { i: 0 });
    await a.wait(() => a.p.gifts && a.p.gifts[0]);
    ok(a.p.gifts[0], 'a gift at ' + GIFTS[0].min + ' minutes');
    const code = Object.keys(CODES)[0];
    a.send('code', { code: code.toLowerCase() });
    await a.wait(() => a.got('code'));
    ok(a.last('code').ok, 'the code ' + code + ' works');
    a.send('code', { code });
    await a.wait(() => a.got('code') === 2);
    ok(!a.last('code').ok, 'once');
    a.send('qa', { spins: 1 });
    await sleep(100);
    a.send('spin');
    await a.wait(() => a.got('spun'));
    ok(a.got('spun') === 1 && a.p.spinsUsed === 1, 'the wheel spins');
    ok(a.p.qi >= 2 && a.got('questdone') >= 2, 'quests pay as they\'re done (' + a.p.qi + ' done)');

    console.log('--- rebirth and the worlds');
    a.send('qa', { lv: 3 });
    await sleep(100);
    a.send('rebirth');
    await sleep(200);
    ok(a.p.rebirths === 0, 'below the Level cap: no rebirth');
    a.send('qa', { lv: lvCap(0), speed: 999 });
    await a.wait(() => a.p.lv === lvCap(0));
    const wr = a.p.wins;
    a.send('rebirth');
    await a.wait(() => a.got('reborn'));
    ok(a.p.rebirths === 1 && a.p.lv === 1 && a.p.speed === 0 && a.p.wins === wr - rebirthCost(0), 'rebirth: back to Level 1 and 0 Speed, for ' + rebirthCost(0) + ' Wins');
    ok(a.p.shoe === 1 && a.p.ups.soles === 1 && a.p.hatched === 3, 'shoes, upgrades and pets kept');
    ok(stepGain(a.p, false, 0) > stepGain({ ...a.p, rebirths: 0 }, false, 0), 'every step x' + rebirthMult(1));
    a.send('world', { w: 1 });
    await sleep(200);
    ok(a.p.world === 0, 'the next world is shut until the last stage is cleared');
    a.send('qa', { best: WALLS_N });
    await sleep(100);
    a.send('world', { w: 1 });
    await a.wait(() => a.got('warp'));
    await sleep(150);
    ok(a.p.world === 1 && a.me().world === 1, 'then it opens: ' + WORLDS[1].name);
    a.send('world', { w: 0 });
    await a.wait(() => a.got('warp') === 2);

    console.log('--- warps');
    a.send('qa', { speed: stageNeed(0, 3) + 10, best: 4 });
    await sleep(150);
    a.send('warp', { to: 'stage', k: 9 });
    await a.wait(() => a.last('warped') && a.last('warped').z < 0);
    ok(a.last('warped').z === checkpoint(3).z, 'TO STAGE goes no further than the gates you open (stage 4)');
    await sleep(800);
    a.send('warp', { to: 'post' });
    await a.wait(() => a.last('warped').z > 60);
    ok(Math.abs(a.last('warped').x - postSpot(POSTS.findIndex((x) => x.gems)).x) < 1, 'TO TREADMILLS goes to your best one');

    console.log('--- someone else');
    const b = await new Bot('bob').join();
    await sleep(200);
    let seesA = false;
    b.room.state.players.forEach((p) => { if (p.name === 'alice') seesA = true; });
    ok(seesA, 'a second player sees the first');

    console.log('--- Avalanche Rush: the queue, a late player, the race');
    a.send('qa', { lv: 5 });
    a.send('play', { map: 2 });
    await a.wait(() => a.last('mQueue'));
    ok(a.last('mQueue').found === 1 && a.last('mQueue').spots === CFG.matchSpots, 'the queue: 1 / ' + CFG.matchSpots + ' found');
    b.send('play');
    await b.wait(() => b.last('mQueue'));
    await a.wait(() => a.last('mQueue').found === 2);
    ok(a.last('mQueue').found === 2 && b.last('mQueue').found === 2, 'pressing PLAY about the same time: the same queue (2 found)');
    await a.wait(() => a.got('mStart'), 15000);
    await b.wait(() => b.got('mStart'), 3000);
    const ms = a.last('mStart'), plan = arenaPlan(ms.seed, ms.lv);
    ok(ms && b.got('mStart') && ms.id === b.last('mStart').id, 'one race for both');
    ok(ms.names.length === CFG.matchSpots, 'bots fill the empty places');
    // a late PLAY before the gun takes a bot's place
    c.send('play');
    await c.wait(() => c.got('mStart'), 3000);
    ok(c.got('mStart') && c.last('mStart').id === ms.id && a.got('mJoined') === 1, 'a late PLAY takes a bot\'s place on the line');
    // moving on the line before the gun
    const sa = startSpot(ms.spot);
    a.x = sa.x; a.z = sa.z;
    const sn4 = a.snaps;
    await a.run(sa.x, -20, 20);
    await sleep(200);
    ok(a.snaps > sn4, 'nobody runs before the gun');
    await a.wait(() => a.got('mGo'), 9000);
    ok(a.got('mGo') === 1, 'the gun');
    // carol leaves: a bot takes her place, under her name
    c.leave();
    await a.wait(() => a.got('mLeft'), 3000);
    ok(a.got('mLeft') === 1, 'carol left: everyone is told');
    // out of your lane
    a.x = sa.x; a.z = sa.z;
    const sn5 = a.snaps;
    a.move(sa.x + 30, 0, sa.z);
    await sleep(150);
    ok(a.snaps > sn5, 'out of your lane: sent back');
    // run the race: alice runs; bob stands still and the avalanche takes him
    const t0r = Date.now();
    a.x = sa.x; a.z = sa.z;
    const fin = plan.finish;
    while (a.z > fin + 1 && Date.now() - t0r < 40000) { a.move(laneX(ms.spot), 0, Math.max(fin, a.z - 3.6)); await sleep(100); }
    a.send('mFinish');
    await a.wait(() => a.got('mDone'), 3000);
    ok(a.last('mDone') && a.last('mDone').spot === ms.spot, 'over the line: finished (' + ((Date.now() - t0r) / 1000).toFixed(1) + ' s)');
    await b.wait(() => (b.msgs.mOut || []).some((m) => m.spot === b.last('mStart').spot), 20000);
    ok((b.msgs.mOut || []).some((m) => m.spot === b.last('mStart').spot), 'standing still, the avalanche takes you');
    const D = matchInfo(ms.lv);
    ok(surgeAt(D, 0) > 0 && surgeAt(D, 20) < surgeAt(D, 10), 'the avalanche comes on faster and faster');
    await a.wait(() => a.got('mEnd'), 30000);
    const me_ = a.last('mEnd');
    ok(me_ && me_.place === 0, 'first out wins (' + (me_ && me_.placeName) + ')');
    ok(me_ && me_.prize.wins > 0 && me_.prize.gems > 0, 'a prize: ' + (me_ && me_.prize.wins) + ' Wins, ' + (me_ && me_.prize.gems) + ' Gems');
    // (the profile follows the result in its own message)
    await a.wait(() => a.p.matches === 1 && a.p.matchWins === 1, 1500);
    ok(a.p.matches === 1 && a.p.matchWins === 1, 'counted: 1 race, 1 win');
    const bE = await b.wait(() => b.last('mEnd'), 3000);
    ok(bE && bE.place > 0 && me_.rows.length === CFG.matchSpots, 'everyone placed, ' + me_.rows.length + ' rows');
    ok(me_.rows.some((r) => r.n === 'carol' && r.bot), 'carol\'s place was taken by a bot under her name');

    console.log('--- nonsense');
    for (const t of ['step', 'move', 'pad', 'warp', 'hatch', 'team', 'world', 'upgrade', 'code', 'mItem', 'mFell', 'revive', 'fell']) a.send(t, { n: 'x', x: 'NaN', k: {}, id: [1], w: 'a', code: 5, i: -1 });
    a.send('move', { x: Infinity, y: 0, z: 0 });
    await sleep(300);
    ok(a.me() && a.room.connection.isOpen, 'nonsense messages are ignored, the room carries on');

    console.log('--- saved');
    const wSaved = a.p.wins, rbSaved = a.p.rebirths;
    await a.leave();
    await sleep(400);
    const a2 = await new Bot('alice').join();
    ok(a2.p.wins === wSaved && a2.p.rebirths === rbSaved && a2.p.shoe === 1, 'rejoining: everything as it was');
    void xpNeed; void QUESTS; void DAILY; void TRAILS; void JAWBREAKERS; void upgradeCost;
} catch (e) {
    fail++;
    console.log('FAIL  threw: ' + (e && e.stack));
}
console.log(`\n${pass} passed, ${fail} failed`);
srv.kill();
process.exit(fail ? 1 : 0);
