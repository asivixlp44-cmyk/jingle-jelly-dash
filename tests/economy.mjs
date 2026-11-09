// A simulated typical first session on the real formulas (shared/config.js): trains on the best open treadmill (sprinting some of
// the time), runs the Jelly Run when the next gate opens, takes its Win Pads (now and then a Wobbler or a pool sends it back to a stage's
// gate), buys what it can, rebirths at the cap, races now and then. It isn't a person, but it tells when things come:
// node economy.mjs [minutes]
import {
    CFG, WORLDS, WALLS_N, SHOES, POSTS, JAWBREAKERS, UPGRADES, upgradeCost, palsOf, PALS, teamMax, teamMult, stepGain, isMega, padPay, lvCap, xpNeed, rebirthCost, postOpen, rebirthMult, matchPrize, matchLv, matchInfo, worldOpen, TRAILS, fmt, clock,
    stageNeed, runSpeed, strideOf, gateLock,
} from '../shared/config.js';
import { stageLen } from '../shared/world.js';

const MINS = Number(process.argv[2] || 60), TREAD = Number(process.env.RATE || 6.5), TRIP = Number(process.env.TRIP || 0.12);
const p = { world: 0, lv: 1, xp: 0, speed: 0, rebirths: 0, shoe: 0, trail: 0, aura: 0, ups: {}, wins: 0, gems: 0, steps: 0, team: [], pals: {}, bests: {}, padsDone: {}, matches: 0 };
let t = 0, padAt = {}, rng = 1, nextRace = 300;
const R = () => { rng = (rng * 1664525 + 1013904223) >>> 0; return rng / 4294967296; };
const log = (s) => console.log(clock(t).padStart(6), s);
const seen = new Set();
const once = (k, s) => { if (!seen.has(k)) { seen.add(k); log(s); } };

function addSpeed(n) {
    const cap = lvCap(p.rebirths);
    p.speed += n;
    if (p.lv >= cap) { p.xp = 0; return; }
    p.xp += n;
    while (p.lv < cap && p.xp >= xpNeed(p.lv, p.rebirths)) { p.xp -= xpNeed(p.lv, p.rebirths); p.lv++; if (!p.rebirths && p.lv % 5 === 0) once('lv' + p.lv, 'Level ' + p.lv); }
    if (p.lv >= cap) { p.xp = 0; if (p.rebirths < 3) once('cap' + p.rebirths, 'at the Level cap ' + cap + ', Speed ' + fmt(p.speed)); }
}
function step(pm) {
    const mega = isMega(p.steps, p), mk = mega ? CFG.megaK : 1;
    p.steps++;
    addSpeed(stepGain(p, false, p.world) * pm * mk);
}
const bestPost = () => { let b = 0; for (let i = 0; i < POSTS.length; i++) if (postOpen(p, i) && POSTS[i].mult >= POSTS[b].mult) b = i; return b; };
const best = () => p.bests[p.world] || 0;
const open = () => gateLock(p.speed, p.world);
function bestTeam() {
    const own = PALS.filter((a) => p.pals[a.id] > 0).sort((a, b) => b.mult - a.mult), team = [];
    for (const a of own) for (let c = 0; c < p.pals[a.id] && team.length < teamMax(p); c++) team.push(a.id);
    p.team = team;
}
function shop() {
    for (let go = true; go;) {
        go = false;
        const nx = SHOES[p.shoe + 1];
        if (p.lv >= lvCap(p.rebirths) && p.wins < rebirthCost(p.rebirths) * 1.2) return;
        if (nx && p.wins >= nx.wins) { p.wins -= nx.wins; p.shoe++; once('sh' + p.shoe, 'bought ' + nx.name + ' (+' + fmt(nx.add) + ' a step)'); go = true; continue; }
        for (let j = JAWBREAKERS.length - 1; j >= 0; j--) {
            const J = JAWBREAKERS[j];
            if (p.wins < J.wins || (nx && p.wins < J.wins * 2.5 && nx.wins < J.wins * 4)) continue;
            p.wins -= J.wins;
            const list = palsOf(j), total = list.reduce((a, x) => a + x.odds, 0);
            let r = R() * total, a = list[0];
            for (const x of list) { r -= x.odds; if (r < 0) { a = x; break; } }
            p.pals[a.id] = (p.pals[a.id] || 0) + 1;
            bestTeam();
            once('jb' + j, 'opened the ' + J.name + ': ' + a.name + ', team x' + teamMult(p.team));
            go = true;
            break;
        }
        if (go) continue;
        for (const u of UPGRADES) {
            const n = p.ups[u.id] || 0;
            if (n < u.max && p.wins >= upgradeCost(u, n) * 2) { p.wins -= upgradeCost(u, n); p.ups[u.id] = n + 1; once('up' + u.id, 'upgrade: ' + u.name); go = true; break; }
        }
        if (go) continue;
        const tr = TRAILS[p.trail + 1];
        if (tr && p.wins >= tr.wins * 2.5) { p.wins -= tr.wins; p.trail++; once('tr' + p.trail, 'trail: ' + tr.name + ' x' + tr.mult); go = true; }
    }
}
// the Jelly Run: stage after stage while the gates open, steps on the way, each stage's pad
function run() {
    t += 4;
    for (let k = 0; k < Math.min(WALLS_N, open()); k++) {
        const v = runSpeed(p, p.speed, p.world), len = stageLen(k);
        // a Wobbler or a pool sends it back to the gate now and then: the stage again
        const tries = R() < TRIP ? 2 : 1;
        for (let i = 0; i < tries; i++) { t += len / v + 0.6; const n = Math.floor(len / strideOf(v)); for (let s = 0; s < n; s++) step(1); }
        if (k + 1 > best()) { p.bests[p.world] = k + 1; once('w' + p.world + 'k' + k, WORLDS[p.world].name + ': stage ' + (k + 1) + ' cleared (gate ' + fmt(stageNeed(p.world, k)) + '), Speed ' + fmt(p.speed) + ', ' + Math.round(v) + ' studs/s, ' + fmt(p.wins) + ' Wins'); }
        if (t - (padAt[k] || -99) >= CFG.padCool) {
            padAt[k] = t;
            const key = p.world + ':' + k, first = !p.padsDone[key];
            p.padsDone[key] = 1;
            const n = padPay(p, p.world, k, first, false);
            p.wins += n;
            once('pad', 'first Win Pad: +' + n);
        }
    }
    // back to the plaza: TO TREADMILLS
    t += 2;
}
function maybeRebirth() {
    const cap = lvCap(p.rebirths);
    if (p.lv < cap || p.wins < rebirthCost(p.rebirths)) return false;
    if (best() < WALLS_N && open() > best()) return false;
    p.wins -= rebirthCost(p.rebirths);
    p.rebirths++; p.lv = 1; p.xp = 0; p.speed = 0; p.padsDone = {};
    once('rb' + p.rebirths, 'REBIRTH ' + p.rebirths + ': x' + rebirthMult(p.rebirths));
    return true;
}
const end = MINS * 60;
log('start');
while (t < end) {
    // train until the next gate opens (a minute at most at a time, a little longer at the cap)
    const t0 = t, pm = POSTS[bestPost()].mult;
    const want = () => (best() >= WALLS_N ? false : open() <= best() + (best() === 0 ? 1 : 1));
    t += 3;
    while (t - t0 < 60 && want() && !(p.lv >= lvCap(p.rebirths) && t - t0 > 20)) { step(pm); t += 1 / TREAD; }
    run();
    shop();
    if (worldOpen(p, p.world + 1) && WORLDS[p.world + 1]) { p.world++; padAt = {}; once('world' + p.world, 'on to ' + WORLDS[p.world].name); }
    maybeRebirth();
    if (t > nextRace) {
        nextRace = t + 360;
        const lv = matchLv(p), D = matchInfo(lv), place = 1 + Math.floor(R() * 3), prize = matchPrize(place, D.segs, lv, p);
        t += D.secs * 0.5 + 10;
        p.wins += prize.wins; p.gems += prize.gems; addSpeed(prize.speed); p.matches++;
        once('race' + p.matches, 'race ' + p.matches + ' (Level ' + lv + ', ' + D.segs + ' stretches, ' + D.secs + ' s clock): +' + fmt(prize.wins) + ' Wins');
    }
}
log(`end: Speed ${fmt(p.speed)}, Level ${p.lv}, rebirths ${p.rebirths}, ${WORLDS[p.world].name} stage ${best()}, ${fmt(p.wins)} Wins, ${p.steps} steps, ${SHOES[p.shoe].name}, team x${teamMult(p.team)}`);
