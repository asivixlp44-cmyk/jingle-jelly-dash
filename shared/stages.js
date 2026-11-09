// The stages' own challenges: every stage of the Jelly Run is a kind of its own, with its own look and its own way through, so no
// two stages in a row play alike. A world runs through them in its own order, harder the further in (shared/world.js builds each
// stage from its kind and its seed; the client draws it and judges it on your screen; the server knows its platforms).
//   field      Jelly Field: jelly all over, a few pools to jump, boost chevrons (the first stage of every world)
//   stones     Gumdrop Hop: the floor is hot syrup; jump from one wobbling jelly platform to the next
//   bounce     Jelly Bouncers: syrup too wide to jump; giant jelly trampolines throw you across
//   sweeper    Peppermint Sweeper: giant candy-cane bars spinning round a post, right across the way: jump them
//   boulders   Snowball Roll: giant balls rolling down the lanes at you: pick your lane
//   gumballs   Gumball Drop: gumballs falling out of the sky where the shadows grow: keep moving
//   walls      Jelly Walls: wobbling walls of jelly right across: DASH into them to burst through
//   crumble    Cookie Crumble: a bridge of cookie tiles over syrup; each one cracks and drops a moment after you step on it
//   ice        Frosty Slide: slippery ice, pools and candy canes; you slide where you were going
//   sliders    Present Pushers: giant gift boxes sliding from wall to wall
//   ornaments  Ornament Alley: giant ornaments swinging across, one after another
//   maze       Candy Cane Maze: walls of presents with one gap each, left and right in turn
//   boss       The boss's gauntlet: jelly walls, a sweeper, presents, with the boss Wobbler behind
import { rngFrom } from './config.js';

export const STAGE_TYPES = {
    field: { title: 'Jelly Field', tip: 'Squish across the jelly! Jump the syrup pools.' },
    stones: { title: 'Gumdrop Hop', tip: 'The floor is hot syrup! Jump from jelly to jelly.' },
    bounce: { title: 'Jelly Bouncers', tip: 'Land on the trampolines: they throw you across the syrup!' },
    sweeper: { title: 'Peppermint Sweeper', tip: 'Jump the spinning candy canes as they come round!' },
    boulders: { title: 'Snowball Roll', tip: 'Giant snowballs! Pick a lane and dodge them.' },
    gumballs: { title: 'Gumball Drop', tip: 'Gumballs from the sky! Stay off the growing shadows.' },
    walls: { title: 'Jelly Walls', tip: 'Jelly walls! DASH into them to burst through.' },
    crumble: { title: 'Cookie Crumble', tip: 'The cookies crumble behind you: don\'t stop!' },
    ice: { title: 'Frosty Slide', tip: 'Slippery ice! You slide where you were going.' },
    sliders: { title: 'Present Pushers', tip: 'Giant presents sliding across: time it, or jump them!' },
    ornaments: { title: 'Ornament Alley', tip: 'Swinging ornaments: run through when they swing away.' },
    maze: { title: 'Candy Cane Maze', tip: 'Find the gap in every wall of presents.' },
    boss: { title: 'Boss Gauntlet', tip: 'The boss is coming: burst the walls, jump the sweeper, RUN!' },
};
// each world's fifteen, easy kinds first (the last two are tougher versions of the world's favourites)
const ORDER = [
    ['field', 'sliders', 'stones', 'ornaments', 'sweeper', 'bounce', 'boulders', 'walls', 'ice', 'maze', 'gumballs', 'crumble', 'stones', 'sweeper', 'boss'],
    ['field', 'stones', 'walls', 'sweeper', 'sliders', 'crumble', 'bounce', 'gumballs', 'ornaments', 'boulders', 'maze', 'ice', 'bounce', 'walls', 'boss'],
    ['field', 'ice', 'sliders', 'bounce', 'boulders', 'stones', 'sweeper', 'crumble', 'gumballs', 'walls', 'ornaments', 'maze', 'ice', 'boulders', 'boss'],
    ['field', 'bounce', 'gumballs', 'stones', 'sweeper', 'walls', 'crumble', 'sliders', 'boulders', 'ice', 'maze', 'ornaments', 'bounce', 'gumballs', 'boss'],
];
export const stageType = (w, k) => (ORDER[(w | 0) % ORDER.length][k] || 'field');

// ----- the moving things' sizes and where they are at server time t (seconds) -----
// a sweeper: its bars' half length, how high their middle is, how thick; post: its radius
export const SWEEP = { r: 15.4, y: 1.2, t: 1.0, post: 1.6 };
// a sweeper's angle at t (radians)
export const sweeperAngle = (o, t) => o.phase + (o.dir * Math.PI * 2 * (t % o.period)) / o.period;
// a rolling ball: its radius; the z of lane i's ball at t (it rolls from the stage's far end towards its gate, again and again)
export const BALL = { r: 3.4 };
export function ballZ(o, i, t) { const L = o.z1 - o.z0 + 24, s = ((t * o.v + o.ph[i]) % L + L) % L; return o.z0 - 12 + s; }
// a gumball: its radius, how long its shadow grows before it lands, how long it falls, how far from where it lands it hits
export const GUM = { r: 2.5, warn: 1.15, fall: 0.42, hit: 3.6 };
// the gumballs of a drop zone falling or just landed at t: [{ x, z, t0 (when its shadow appeared), c (colour index) }]
const gumHash = (a, b) => { let h = Math.imul(a ^ 0x9e3779b9, 2654435761) ^ Math.imul(b + 0x7f4a7c15, 2246822519); h ^= h >>> 15; h = Math.imul(h, 2654435769); h ^= h >>> 13; return (h >>> 0) / 4294967296; };
export function gumballsAt(o, t, out) {
    out = out || [];
    out.length = 0;
    const life = GUM.warn + GUM.fall + 0.7, s1 = Math.floor(t / o.dt), s0 = Math.floor((t - life) / o.dt);
    for (let s = s0; s <= s1; s++) {
        const t0 = s * o.dt;
        if (t0 > t || t - t0 > life) continue;
        const u = gumHash(o.seed, s), v = gumHash(o.seed + 17, s);
        out.push({ x: o.x0 + u * (o.x1 - o.x0), z: o.z0 + v * (o.z1 - o.z0), t0, c: s & 7, s });
    }
    return out;
}
// a jelly wall: its thickness and height (too high to jump: DASH through)
export const JWALL = { d: 2.6, h: 11 };
// a trampoline: its size, its top, how hard it throws you up
export const TRAMP = { w: 8, top: 1.2, bounce: 54 };
// a crumbling cookie tile: its size; how long it shakes before it drops, how long until it's back
export const TILE = { s: 4, shake: 0.5, back: 4.5 };

// ----- building a stage of a kind: what's in the way, the syrup lakes, the platforms, the golden candies -----
// g: { w, k, a (the zone's south end: the gate side), b (its north end: the pad side), v (the stage's pace), hw (half its width),
// r (its random numbers), d (0..1: how far into the world) }; returns { list, lakes, plats, candies, icy }
export function buildStage(type, g) {
    const out = { list: [], lakes: [], plats: [], candies: [], icy: [] };
    const B = BUILD[type] || BUILD.field;
    B(g, out, g.a, g.b);
    return out;
}
// a golden candy: x, y (its middle), z
const candy = (out, x, y, z) => out.candies.push({ x: +x.toFixed(2), y: +y.toFixed(2), z: +z.toFixed(2) });
// a jump at this pace, from the ground: how far it carries (a full jump is in the air about 0.79 s)
const jumpDist = (v) => v * 0.79;

const BUILD = {
    // a field of jelly: a few pools, boosts, a hurdle now and then
    field(g, out, a, b) {
        const { r, v, k, hw } = g, n = Math.max(2, Math.min(5, 2 + Math.floor(k / 4))), span = (a - b) / n;
        for (let i = 0; i < n; i++) {
            const z = a - span * (i + 0.5) + (r() - 0.5) * span * 0.25;
            if (i % 2 === 0) { const d = Math.max(5, Math.min(22, v * 0.3)); out.list.push({ kind: 'pool', z0: z - d / 2, z1: z + d / 2, x0: -hw - 1, x1: hw + 1 }); candy(out, (r() - 0.5) * hw, 4.5, z); }
            else out.list.push({ kind: 'boost', z, x: (r() - 0.5) * (hw * 2 - 10), hw: 5, hd: 4 });
        }
        candy(out, (r() < 0.5 ? -1 : 1) * (hw - 2), 1.5, a - (a - b) * 0.15);
        candy(out, 0, 1.5, b + 6);
    },
    // jelly platforms over hot syrup: a path of rows, each in reach of the last
    stones(g, out, a, b) {
        // centre to centre about two thirds of a full jump at the stage's pace (steer and ease off in the air to land on it)
        const { r, v, d, hw } = g, spacing = Math.max(10, Math.min(30, jumpDist(v) * 0.55 + 5)), depth = Math.max(6.5, Math.min(10, spacing * 0.42)), gap = spacing - depth;
        out.lakes.push({ x0: -hw - 1, x1: hw + 1, z0: b + 1, z1: a - 1 });
        let z = a - 4 - depth / 2, cx = 0, row = 0, far = a;
        const sideCandy = [];
        while (z - depth / 2 > b + 3) {
            const w = Math.max(5.2, 8.2 - d * 2.6) + r() * 1.4;
            cx = Math.max(-hw + w / 2 + 1, Math.min(hw - w / 2 - 1, cx + (r() - 0.5) * 12));
            const top = 0.9 + r() * 1.6;
            out.plats.push({ kind: 'stone', x: cx, z, sx: w, sz: depth, top });
            far = z - depth / 2;
            // a second platform off to one side now and then (a candy on some)
            if (r() < 0.55) {
                const sx2 = cx > 0 ? cx - 12 - r() * 3 : cx + 12 + r() * 3;
                if (Math.abs(sx2) < hw - 3) { const t2 = 0.9 + r() * 2.2; out.plats.push({ kind: 'stone', x: sx2, z: z + (r() - 0.5) * 3, sx: 6, sz: 6, top: t2 }); sideCandy.push([sx2, t2 + 1.6, z]); }
            }
            z -= depth + gap * (0.85 + r() * 0.3) + d * 1.5;
            row++;
        }
        for (let i = 0; i < 3; i++) { const c = sideCandy[Math.floor((i + 0.5) / 3 * sideCandy.length)]; if (c) candy(out, c[0], c[1], c[2]); else candy(out, 0, 4, a - (a - b) * (0.25 + i * 0.25)); }
        out.lakes[0].z0 = Math.max(b + 1, far - gap * 0.95 - d * 1.5);
        void row;
    },
    // trampolines over syrup: each one throws you on to the next
    bounce(g, out, a, b) {
        const { r, v, d, hw } = g, step = Math.max(16, Math.min(40, v * 0.86));
        out.lakes.push({ x0: -hw - 1, x1: hw + 1, z0: b + 1, z1: a - 1 });
        // the first one right at the shore: run onto it
        let z = a - 1 - TRAMP.w / 2, cx = (r() - 0.5) * 8, i = 0;
        while (z - TRAMP.w / 2 > b + 2) {
            out.plats.push({ kind: 'tramp', x: cx, z, sx: TRAMP.w - d * 1.2, sz: TRAMP.w - d * 1.2, top: TRAMP.top });
            // a candy high over the gap between this one and the next: catch it at the top of the bounce
            if (i % 2 === 1 && out.candies.length < 3) candy(out, cx + (r() - 0.5) * 4, 11, z - step / 2);
            cx = Math.max(-hw + 6, Math.min(hw - 6, cx + (r() - 0.5) * 14));
            z -= step * (0.9 + r() * 0.2);
            i++;
        }
        while (out.candies.length < 3) candy(out, (r() - 0.5) * 10, 10, a - (a - b) * (0.3 + out.candies.length * 0.25));
    },
    // sweepers: a post in the middle, a bar right across turning round it (two crossed later on)
    sweeper(g, out, a, b) {
        const { r, d, k } = g, room = SWEEP.r * 2 + 8, n = Math.max(1, Math.min(3, Math.floor((a - b) / room)));
        const used = n * room, z0 = a - ((a - b) - used) / 2;
        for (let i = 0; i < n; i++) {
            const z = z0 - room * (i + 0.5);
            out.list.push({ kind: 'sweeper', z, x: 0, period: Math.max(1.9, 3.7 - d * 1.5 - i * 0.2), dir: i % 2 ? -1 : 1, phase: r() * 6.283, bars: k >= 8 && i > 0 ? 2 : 1 });
            candy(out, (r() < 0.5 ? -1 : 1) * 4.5, 1.6, z + (r() - 0.5) * 6);
        }
        while (out.candies.length < 3) candy(out, (r() - 0.5) * 20, 1.6, z0 - used - 3 - out.candies.length * 4);
    },
    // snowballs rolling down three lanes (two early on), never all at once
    boulders(g, out, a, b) {
        const { r, d, hw } = g, lanes = d < 0.25 ? [-7, 7] : [-11, 0, 11], z1 = a - 6, z0 = b + 4, L = z1 - z0 + 24, ph = lanes.map((_, i) => ((i + r() * 0.5) / lanes.length) * L);
        out.list.push({ kind: 'boulders', z: (z0 + z1) / 2, z0, z1, lanes, v: 13 + d * 13, ph });
        for (let i = 0; i < 3; i++) candy(out, lanes[i % lanes.length], 1.6, z1 - (z1 - z0) * (0.25 + i * 0.25));
        void hw;
    },
    // gumballs dropping all over the zone
    gumballs(g, out, a, b) {
        const { r, d, hw, w, k } = g;
        out.list.push({ kind: 'gumballs', z: (a + b) / 2, z0: b + 3, z1: a - 3, x0: -hw + 2.5, x1: hw - 2.5, dt: Math.max(0.11, 0.24 - d * 0.12), seed: w * 1009 + k * 71 + 5 });
        for (let i = 0; i < 3; i++) candy(out, (r() - 0.5) * (hw * 2 - 6), 1.6, a - (a - b) * (0.2 + i * 0.3));
        // a couple of boosts to get through quicker
        out.list.push({ kind: 'boost', z: a - (a - b) * 0.45, x: (r() - 0.5) * 12, hw: 5, hd: 4 });
    },
    // jelly walls across the way: dash through
    walls(g, out, a, b) {
        const { r, d } = g, n = Math.max(2, Math.min(6, 3 + Math.floor(d * 3))), span = (a - b) / n;
        for (let i = 0; i < n; i++) {
            const z = a - span * (i + 0.5);
            out.list.push({ kind: 'jwall', z, i });
            if (i < 3) candy(out, (r() - 0.5) * 18, 1.6, z - span * 0.35);
        }
    },
    // a cookie bridge over syrup, winding, two tiles wide (three early on)
    crumble(g, out, a, b) {
        const { r, d, hw } = g, S = TILE.s, wide = d < 0.3 ? 3 : 2, tiles = [];
        out.lakes.push({ x0: -hw - 1, x1: hw + 1, z0: b + 1, z1: a - 1 });
        let cx = 0, side = [];
        const path = [];
        for (let z = a - S / 2 - 0.5, i = 0; z > b + 1 + S / 2; z -= S, i++) {
            if (i % 3 === 0) cx = Math.max(-hw + S * wide / 2 + 1, Math.min(hw - S * wide / 2 - 1, cx + (r() - 0.5) * 9));
            const x0 = Math.round((cx - S * wide / 2) / S) * S + S / 2;
            path.push({ z, x: x0 + (wide - 1) * S / 2 });
            for (let j = 0; j < wide; j++) tiles.push({ x: x0 + j * S, z });
            // a branch out to a candy now and then
            if (i % 9 === 5 && side.length < 3) { const dir = cx > 0 ? -1 : 1; for (let j = 1; j <= 3; j++) tiles.push({ x: x0 + (dir < 0 ? -j : wide - 1 + j) * S, z }); side.push([x0 + (dir < 0 ? -3 : wide + 2) * S, z]); }
        }
        out.list.push({ kind: 'crumble', z: (a + b) / 2, tiles: tiles.filter((t) => Math.abs(t.x) < hw - 0.5), path });
        // the far shore comes right up to the bridge's last row (no syrup between)
        if (path.length) out.lakes[0].z0 = Math.max(b + 1, path[path.length - 1].z - S / 2 + 0.5);
        for (let i = 0; i < 3; i++) { const c = side[i]; if (c && Math.abs(c[0]) < hw) candy(out, c[0], 1.6, c[1]); else candy(out, cx, 4, a - (a - b) * (0.3 + i * 0.2)); }
    },
    // slippery ice: candy canes to weave round, pools, a boost
    ice(g, out, a, b) {
        const { r, v, hw } = g;
        out.icy.push({ x0: -hw - 1, x1: hw + 1, z0: b, z1: a + 4 });
        const n = 4, span = (a - b) / n;
        for (let i = 0; i < n; i++) {
            const z = a - span * (i + 0.5);
            if (i % 2 === 0) {
                const m = 3, pz = [];
                for (let j = 0; j < m; j++) pz.push({ x: -hw + 4 + ((j + 0.5) / m) * (hw * 2 - 8) + (r() - 0.5) * 3, z: z + (r() - 0.5) * 8, s: 3.4 });
                out.list.push({ kind: 'pillars', z, list: pz });
            } else { const dd = Math.max(5, Math.min(16, v * 0.24)); out.list.push({ kind: 'pool', z0: z - dd / 2, z1: z + dd / 2, x0: (r() < 0.5 ? -hw - 1 : -hw * 0.3), x1: (r() < 0.5 ? hw * 0.3 : hw + 1) }); }
            if (out.candies.length < 3) candy(out, (r() - 0.5) * (hw * 2 - 6), 1.6, z - span * 0.3);
        }
    },
    // presents sliding across, one after another
    sliders(g, out, a, b) {
        const { r, d } = g, n = Math.max(2, Math.min(5, 2 + Math.floor(d * 4))), span = (a - b) / n;
        for (let i = 0; i < n; i++) {
            const z = a - span * (i + 0.5);
            out.list.push({ kind: 'slider', z, period: Math.max(2.1, 3.4 - d * 1.1) + r() * 0.7, phase: r() * 6.283 });
            if (i < 3) candy(out, (r() - 0.5) * 22, 7.6, z);
        }
        while (out.candies.length < 3) candy(out, 0, 1.6, b + 5 + out.candies.length * 3);
    },
    // ornaments swinging, one after another
    ornaments(g, out, a, b) {
        const { r, d } = g, n = Math.max(3, Math.min(6, 3 + Math.floor(d * 4))), span = (a - b) / n;
        for (let i = 0; i < n; i++) {
            const z = a - span * (i + 0.5);
            out.list.push({ kind: 'blade', z, period: Math.max(1.9, 2.8 - d * 0.7) + r() * 0.6, phase: r() * 6.283 });
            if (i % 2 === 0 && out.candies.length < 3) candy(out, 0, 1.6, z);
        }
        while (out.candies.length < 3) candy(out, (r() - 0.5) * 20, 1.6, b + 6);
    },
    // walls of presents, the gap left and right in turn
    maze(g, out, a, b) {
        const { r, d, hw } = g, n = Math.max(4, Math.min(8, 4 + Math.floor(d * 5))), span = (a - b) / n;
        for (let i = 0; i < n; i++) {
            const z = a - span * (i + 0.5), side = i % 2 ? 1 : -1, gw = Math.max(5, 7.5 - d * 2), gx = side * (hw - gw / 2 - 1.5 - r() * 4);
            out.list.push({ kind: 'slit', z, gx, gw, h: 9, d: 2 });
            // a candy in the corner the gap doesn't go to
            if (i % 2 === 1 && out.candies.length < 3) candy(out, -side * (hw - 3), 1.6, z + span * 0.4);
        }
        while (out.candies.length < 3) candy(out, 0, 1.6, b + 5 + out.candies.length * 3);
    },
    // the boss: jelly walls, then a sweeper, then presents
    boss(g, out, a, b) {
        const L = a - b, w1 = a - L * 0.32, w2 = a - L * 0.66;
        BUILD.walls({ ...g, d: 0.4 }, out, a, w1);
        BUILD.sweeper({ ...g, d: 1 }, out, w1, w2);
        BUILD.sliders({ ...g, d: 1 }, out, w2, b);
        out.candies.length = Math.min(3, out.candies.length);
    },
};

// ----- tests on the stage's ground, shared -----
export function inRect(o, x, z) { return x > o.x0 && x < o.x1 && z > o.z0 && z < o.z1; }
export const onPlat = (p, x, z, pad) => Math.abs(x - p.x) < p.sx / 2 + (pad || 0) && Math.abs(z - p.z) < p.sz / 2 + (pad || 0);
void rngFrom;
