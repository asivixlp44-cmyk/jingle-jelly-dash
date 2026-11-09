// The footsteps and the rest, synthesised sample by sample (no files) into short buffers once while the game loads: a jelly squish for
// a step (and a crunch for a step in the snow), a splat and a boing for a landing, the Mega Squish's big squish and sparkles, a glass
// bauble's bonk, a sugar rush's zap and jingle, the wind of a dash, a plunge into syrup, a treadmill starting up, a jelly spring, a
// sweet bell; a few variations of each. Playing one is a buffer source and a gain (and a pan for someone else's); nothing is built
// note by note.
const SR = 44100;
const rnd = (a, b) => a + Math.random() * (b - a);
let seed = 12345;
const noiseV = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2147483648 - 1; };

// ----- little DSP kit (in place on Float32Arrays) -----
const buf = (secs) => new Float32Array(Math.max(1, Math.round(secs * SR)));
function biquad(x, type, f, q) {
    const w = 2 * Math.PI * Math.min(f, SR * 0.45) / SR, cs = Math.cos(w), al = Math.sin(w) / (2 * (q || 0.707));
    let b0, b1, b2, a0, a1, a2;
    if (type === 'lp') { b0 = (1 - cs) / 2; b1 = 1 - cs; b2 = b0; } else if (type === 'hp') { b0 = (1 + cs) / 2; b1 = -(1 + cs); b2 = b0; } else { b0 = al; b1 = 0; b2 = -al; }
    a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al;
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let i = 0; i < x.length; i++) { const v = x[i], y = (b0 * v + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0; x2 = x1; x1 = v; y2 = y1; y1 = y; x[i] = y; }
    return x;
}
// a band-pass whose centre moves (f(t) in Hz): what makes a squish sound wet (its tuning moved every 4 samples)
function sweepBP(x, fOf, q) {
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0, cs = 0, al = 0, a0 = 1;
    for (let i = 0; i < x.length; i++) {
        if ((i & 3) === 0) { const w = 2 * Math.PI * Math.min(fOf(i / SR), SR * 0.45) / SR; cs = Math.cos(w); al = Math.sin(w) / (2 * q); a0 = 1 + al; }
        const v = x[i], y = (al * v - al * x2 + 2 * cs * y1 - (1 - al) * y2) / a0;
        x2 = x1; x1 = v; y2 = y1; y1 = y; x[i] = y;
    }
    return x;
}
// (the envelopes and pitch curves below are smooth: worked out every 8 samples, in a straight line between)
const CR = 8;
function addNoise(x, at, len, amp, env, filt) {
    const n = buf(len);
    for (let i = 0; i < n.length; i++) n[i] = noiseV();
    if (filt) for (const f of filt) biquad(n, f[0], f[1], f[2]);
    const i0 = Math.round(at * SR), m = Math.min(n.length, x.length - i0);
    for (let i = 0, ea = env(0, len); i < m; i += CR) {
        const eb = env((i + CR) / SR, len);
        for (let j = 0; j < CR && i + j < m; j++) x[i0 + i + j] += n[i + j] * amp * (ea + (eb - ea) * j / CR);
        ea = eb;
    }
}
// a sine whose frequency follows f(t), amplitude env(t)
function addTone(x, at, len, f, amp, env) {
    const i0 = Math.round(at * SR), m = Math.min(Math.ceil(len * SR), x.length - i0), k = 2 * Math.PI / SR;
    let ph = 0;
    for (let i = 0, fa = f(0), ea = env(0, len); i < m; i += CR) {
        const t = (i + CR) / SR, fb = f(t), eb = env(t, len);
        for (let j = 0; j < CR && i + j < m; j++) { const u = j / CR; ph += k * (fa + (fb - fa) * u); if (ph > 6.283185307179586) ph -= 6.283185307179586; x[i0 + i + j] += Math.sin(ph) * amp * (ea + (eb - ea) * u); }
        fa = fb; ea = eb;
    }
}
const dec = (k, a) => (t) => (a && t < a ? t / a : 1) * Math.exp(-(t - (a && t > a ? a : 0)) * k);
function norm(x, peak, fade) {
    let m = 0;
    for (let i = 0; i < x.length; i++) m = Math.max(m, Math.abs(x[i]));
    const k = m > 0 ? peak / m : 0;
    // a fade at the end (no click): a short one, or `fade` s for a sound still going
    const f = Math.min(x.length, Math.max(220, Math.round((fade || 0) * SR)));
    for (let i = 0; i < x.length; i++) x[i] *= k * (i > x.length - f ? (x.length - i) / f : 1);
    return x;
}
// a wet slur: noise through a sweeping resonance, rising or falling
function slur(x, at, len, f0, f1, q, amp) {
    const n = buf(len);
    for (let i = 0; i < n.length; i++) n[i] = noiseV();
    sweepBP(n, (t) => f0 + (f1 - f0) * Math.pow(t / len, 0.7), q);
    const i0 = Math.round(at * SR), L = n.length;
    for (let i = 0; i < L && i0 + i < x.length; i++) { const p = i / L; x[i0 + i] += n[i] * amp * Math.sin(Math.min(1, p * 1.05) * Math.PI) * (0.75 + 0.25 * Math.sin(p * 44)); }
}
// a wobble: an amplitude shaken rate times a second, down by depth (0..1) at the bottom of each shake, starting full
const wob = (rate, depth) => (t) => 1 - depth * (0.5 - 0.5 * Math.cos(2 * Math.PI * rate * t));
// the wet of a squish: noise through a resonance that moves (f(t) Hz), shaped by env(t), added in from `at`
function squelch(x, at, len, fOf, q, amp, env) {
    const n = buf(len);
    for (let i = 0; i < n.length; i++) n[i] = noiseV();
    sweepBP(n, fOf, q);
    const i0 = Math.round(at * SR), m = Math.min(n.length, x.length - i0);
    for (let i = 0, ea = env(0, len); i < m; i += CR) {
        const eb = env((i + CR) / SR, len);
        for (let j = 0; j < CR && i + j < m; j++) x[i0 + i + j] += n[i + j] * amp * (ea + (eb - ea) * j / CR);
        ea = eb;
    }
}
// a bubble popping: a little sine chirping up by `rise` (a fraction) over its length
function bubble(x, at, f, len, amp, rise) { addTone(x, at, len, (t) => f * (1 + (rise || 1.6) * t / len), amp, (t, l) => Math.sin(Math.PI * t / l)); }
// a steady sine from `at` dying away: f Hz, amplitude amp, d per second, an attack of att s (a running recurrence, no sin() or
// exp() a sample: the bells and jingles below are dozens of these)
function addPartial(x, at, f, amp, d, att) {
    if (f >= SR * 0.45) return;
    const w = 2 * Math.PI * f / SR, c = 2 * Math.cos(w), e = Math.exp(-d / SR), A = Math.max(1, (att || 0) * SR), i0 = Math.round(at * SR);
    let s1 = 0, s2 = -Math.sin(w), env = amp;
    for (let i = 0; i0 + i < x.length && env > 1e-5; i++) { x[i0 + i] += s1 * env * (i < A ? i / A : 1); const s0 = c * s1 - s2; s2 = s1; s1 = s0; env *= e; }
}
// a bell: a struck sine and its glockenspiel overtones, the high ones gone first
function addBell(x, at, f, amp, d) { for (const [k, a, m] of [[1, 1, 1], [2.756, 0.3, 2.5], [5.404, 0.1, 5]]) addPartial(x, at, f * k, amp * a, d * m, 0.0008); }
// sleigh bells: a few little bells, each ringing twice as its pellet rattles, and a hiss
function addJingle(x, at, amp) {
    for (let b = 0; b < 4; b++) {
        const f = rnd(2800, 6000), d = rnd(40, 60);
        for (let h = 0, tt = at + rnd(0, 0.014), a = amp * rnd(0.5, 1); h < 2; h++, tt += rnd(0.01, 0.024), a *= 0.5)
            for (const [k, pa] of [[1, 1], [1.52, 0.5], [2.33, 0.3]]) addPartial(x, tt, f * k, a * pa * 0.3, d * (1 + k * 0.2), 0.0005);
    }
    addNoise(x, at, 0.08, amp * 0.22, dec(45, 0.002), [['hp', 6000, 0.7]]);
}

const MAKE = {
    // a step on the jelly: a squish (it gives, squelches round the foot and springs back), soft, a little different every time
    step() {
        const L = rnd(0.1, 0.125), x = buf(L), p = rnd(0.86, 1.16), up = rnd(950, 1250) * p, tp = L * rnd(0.26, 0.38), w = wob(34, 0.4);
        squelch(x, 0, L, (t) => (t < tp ? 330 * p + (up - 330 * p) * Math.sin((t / tp) * Math.PI / 2) : 520 * p + (up - 520 * p) * Math.exp(-(t - tp) * 45)), rnd(3.5, 5), 0.9, (t) => Math.min(1, t / 0.008) * Math.exp(-t * 32));
        addTone(x, 0, L, (t) => 135 * p * (1 + 0.5 * Math.exp(-t * 70)), 0.45, (t) => Math.min(1, t / 0.006) * Math.exp(-t * 40) * w(t));
        for (let k = 0, m = 2 + ((Math.random() * 2.5) | 0); k < m; k++) bubble(x, rnd(0.012, L - 0.05), rnd(650, 1300) * p, rnd(0.008, 0.022), 0.1);
        biquad(x, 'lp', 3600, 0.7); biquad(x, 'hp', 50, 0.7);
        return norm(x, 0.3, 0.025);
    },
    // a step in fresh snow: a crunch of tiny crackles (the heel, then the toe), the hush of it packing down, a soft thud
    crunch() {
        const L = rnd(0.15, 0.19), x = buf(L), p = rnd(0.9, 1.12);
        for (const [at, m, amp] of [[0, 44, 1], [rnd(0.045, 0.065), 26, 0.6]]) {
            for (let k = 0; k < m; k++) {
                const t0 = at + Math.pow(Math.random(), 1.7) * 0.075, i0 = Math.round(t0 * SR), n = Math.round(rnd(0.0005, 0.0024) * SR), a = amp * rnd(0.15, 1) * Math.exp(-(t0 - at) * 20);
                for (let i = 0; i < n && i0 + i < x.length; i++) x[i0 + i] += noiseV() * a * (1 - i / n);
            }
        }
        biquad(x, 'hp', 650 * p, 0.6); biquad(x, 'lp', 5200 * p, 0.6);
        addNoise(x, 0, L, 0.16, (t) => Math.min(1, t / 0.006) * Math.exp(-t * 18), [['bp', 1200 * p, 0.7]]);
        addTone(x, 0, 0.07, (t) => 80 * p * (1 - t * 2.5), 0.25, dec(40, 0.004));
        return norm(x, 0.62, 0.02);
    },
    // landing from a jump: a bigger jelly splat, and the jelly springing back with a wobble
    land() {
        const x = buf(0.3), p = rnd(0.9, 1.1), w = wob(17, 0.35);
        squelch(x, 0, 0.16, (t) => 260 * p + 1700 * p * Math.exp(-t * 16), 2.4, 1, (t) => Math.min(1, t / 0.003) * Math.exp(-t * 18));
        addTone(x, 0.008, 0.28, (t) => 88 * p * (1 + 0.35 * (1 - Math.exp(-t * 18))) * (1 + 0.05 * Math.sin(2 * Math.PI * 16 * t) * Math.exp(-t * 6)), 0.75, (t) => Math.min(1, t / 0.005) * Math.exp(-t * 11) * w(t));
        for (let k = 0; k < 3; k++) bubble(x, rnd(0.03, 0.2), rnd(500, 1000) * p, rnd(0.015, 0.03), 0.12);
        biquad(x, 'lp', 3400, 0.7); biquad(x, 'hp', 40, 0.7);
        return norm(x, 0.42);
    },
    // the Mega Squish: a big, slow squish, the jelly springing up, a sparkle of little bells running up over it
    mega() {
        const x = buf(0.8), w = wob(22, 0.3);
        squelch(x, 0, 0.32, (t) => (t < 0.09 ? 240 + 900 * Math.sin((t / 0.09) * Math.PI / 2) : 480 + 660 * Math.exp(-(t - 0.09) * 16)), 4, 0.9, (t) => Math.min(1, t / 0.012) * Math.exp(-t * 9));
        addTone(x, 0.02, 0.38, (t) => 120 * (1 + 2.2 * (1 - Math.exp(-t * 9))), 0.45, (t) => Math.min(1, t / 0.01) * Math.exp(-t * 7) * w(t));
        addTone(x, 0, 0.14, (t) => 70 * (1 - t * 2), 0.8, dec(22, 0.003));
        [0, 2, 4, 7, 9, 12].forEach((d, k) => addBell(x, 0.16 + k * 0.045, 1046.5 * Math.pow(2, d / 12), 0.16, 9));
        addNoise(x, 0.15, 0.45, 0.06, (t) => Math.sin(Math.PI * t / 0.45), [['hp', 7000, 0.7]]);
        return norm(x, 0.7);
    },
    // knocked by a giant swinging ornament or a sliding gift: a bright glassy bauble's bonk, and a boing
    bonk() {
        const x = buf(0.42), p = rnd(0.94, 1.06);
        for (const [k, a, d] of [[1, 1, 16], [2.32, 0.6, 22], [4.08, 0.35, 30], [6.15, 0.18, 42]]) addPartial(x, 0, 760 * p * k, a * 0.5, d, 0.0008);
        addNoise(x, 0, 0.012, 0.6, dec(400), [['bp', 3000, 1]]);
        addTone(x, 0.03, 0.36, (t) => 210 * (1 + 1.1 * (1 - Math.exp(-t * 14))) * (1 + 0.07 * Math.sin(2 * Math.PI * 18 * t) * Math.exp(-t * 5)), 0.5, dec(9, 0.006));
        return norm(x, 0.6);
    },
    // a boost: a sugar rush (a fizzing zap up), sleigh bells, three chimes going up
    boost() {
        const x = buf(0.42);
        addTone(x, 0, 0.32, (t) => 500 + 2200 * Math.pow(t / 0.32, 0.8), 0.3, (t) => Math.min(1, t / 0.006) * Math.exp(-t * 8) * (0.75 + 0.25 * Math.sin(2 * Math.PI * 38 * t)));
        addNoise(x, 0, 0.26, 0.28, dec(10, 0.01), [['hp', 5000, 0.8]]);
        addJingle(x, 0.02, 0.5); addJingle(x, 0.13, 0.35);
        [0, 4, 7].forEach((d, k) => addBell(x, k * 0.05, 1318.5 * Math.pow(2, d / 12), 0.22, 10));
        return norm(x, 0.5);
    },
    // a dash: wind, a tiny shimmer of sleigh bells in it
    whoosh() {
        const x = buf(0.36), p = rnd(0.9, 1.1), n = buf(0.34);
        for (let i = 0; i < n.length; i++) n[i] = noiseV();
        sweepBP(n, (t) => (500 + 2600 * Math.sin(Math.min(1, t / 0.34) * Math.PI)) * p, 1.6);
        for (let i = 0; i < n.length; i++) x[i] += n[i] * Math.sin(Math.min(1, i / n.length) * Math.PI);
        addJingle(x, rnd(0.15, 0.21), 0.12);
        return norm(x, 0.45);
    },
    // into the syrup: a thick plunge, big slow bubbles coming up through it, a sticky pull
    splash() {
        const x = buf(0.6);
        squelch(x, 0, 0.34, (t) => 220 + 700 * Math.exp(-t * 12), 2.5, 1, (t) => Math.min(1, t / 0.004) * Math.exp(-t * 9));
        addTone(x, 0, 0.18, (t) => 120 * (1 - t * 2.5), 0.6, dec(18, 0.004));
        for (let k = 0; k < 6; k++) bubble(x, 0.08 + k * rnd(0.05, 0.075), rnd(160, 420), rnd(0.04, 0.07), 0.3, 2.2);
        squelch(x, 0.36, 0.18, (t) => 380 + 420 * (t / 0.18), 3, 0.35, (t, l) => Math.sin(Math.PI * t / l));
        biquad(x, 'lp', 2600, 0.7);
        return norm(x, 0.5);
    },
    // a treadmill's belt starting up: the motor winding up, the rollers clicking faster, a jingle
    belt() {
        const x = buf(0.48);
        addTone(x, 0, 0.48, (t) => 70 + 130 * Math.min(1, t * 2.8), 0.45, (t) => Math.min(1, t * 10) * Math.exp(-t * 3));
        addTone(x, 0, 0.48, (t) => 2 * (70 + 130 * Math.min(1, t * 2.8)), 0.12, (t) => Math.min(1, t * 10) * Math.exp(-t * 3.5));
        addNoise(x, 0, 0.48, 0.22, (t) => Math.min(1, t * 8) * Math.exp(-t * 4), [['bp', 600, 2]]);
        for (let k = 0, at = 0.02; k < 9 && at < 0.42; k++, at += 0.07 * Math.pow(0.82, k)) addNoise(x, at, 0.006, 0.3, dec(500), [['bp', 2400, 1.5]]);
        addJingle(x, 0.03, 0.18);
        return norm(x, 0.4, 0.12);
    },
};
// the jump: a jelly spring (a wet little shlup, and a boing)
function makeBoing(big) {
    const L = big ? 0.75 : 0.22, x = buf(L);
    addTone(x, 0, L, (t) => (big ? 160 : 260) * (1 + (big ? 1.4 : 0.9) * (1 - Math.exp(-t * (big ? 10 : 28)))) * (1 + (big ? 0.08 : 0.05) * Math.sin(t * 2 * Math.PI * (big ? 15 : 22)) * Math.exp(-t * 4)), 0.6, dec(big ? 5 : 16, 0.004));
    addTone(x, 0, L * 0.7, (t) => (big ? 320 : 520) * (1 + 0.9 * (1 - Math.exp(-t * 24))), 0.12, dec(big ? 8 : 26, 0.004));
    slur(x, 0, 0.05, 500, 1500, 3, 0.22);
    return norm(x, big ? 0.7 : 0.5, 0.03);
}
// a sweet bell (Wins arriving in the counter, played a little higher each)
function makeTick() {
    const x = buf(0.34);
    addPartial(x, 0, 1318.5, 0.6, 12, 0.002);
    addPartial(x, 0, 2637, 0.14, 22, 0.002);
    addPartial(x, 0, 1318.5 * 2.756, 0.1, 34, 0.001);
    return norm(x, 0.5);
}
// ----- the bank: made while loading (a few at a time, so the page stays responsive) -----
const VARIANTS = 4;
const bank = {};
export async function buildAsmr(pause) {
    const out = (k, f, n) => { bank[k] = []; for (let i = 0; i < n; i++) bank[k].push(f()); };
    for (const kind of Object.keys(MAKE)) {
        out(kind, () => MAKE[kind](), VARIANTS);
        if (pause) await pause();
    }
    out('jump', () => makeBoing(false), 2);
    out('tick', makeTick, 1);
}
// the AudioBuffers (made once the audio context exists)
const ready = {};
export function asmrBuffer(ctx, key) {
    let list = ready[key];
    if (!list) {
        const raw = bank[key];
        if (!raw) return null;
        list = ready[key] = raw.map((a) => { const b = ctx.createBuffer(1, a.length, SR); b.copyToChannel(a, 0); return b; });
    }
    return list[Math.floor(Math.random() * list.length)];
}
export const asmrKinds = () => Object.keys(MAKE);
