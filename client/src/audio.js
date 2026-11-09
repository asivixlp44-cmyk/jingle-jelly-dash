// Procedural soundtrack, effects and the ASMR sounds (Web Audio, no asset files).
//
// Music, two songs of our own:
// - "Gumdrop Shuffle" (Jingle Square and down the stages): a bouncy G-major tune at 120 BPM on swung eighths. A glockenspiel and a
//   celesta play the hook over a walking pizzicato bass, plucked strings on the backbeat, sleigh bells, a soft kick and a finger
//   snap, a warm pad; a jelly "bloop" ends every other bar. (G, Em7, Am7, D7, G, G7, C6 to Cm6, G to D7.)
// - "Avalanche Rush" (a race): a galloping D-minor chase at 160 BPM round the circle of fifths (Dm, Gm, C7, F, Bb, Em7b5, A7, A7):
//   a gallop in the bass, sleigh bells on every sixteenth, a bright lead with a run up into the top of the loop, big drums,
//   glockenspiel sparkles.
// Each song is rendered once in the background into eight-bar loops (one per intensity) and plays from those (see "the songs as
// loops"). Their instruments are synthesised a note at a time, sample by sample, the first time a note is needed (see "the
// instruments"): a note is then a buffer source and a gain.
//
// The ASMR sounds (asmr.js) are synthesised once into buffers; playAsmr plays one with a gain and a pan.
// The effects: buying, levels, Gift Boxes, Win Pads, gates, the Wobblers, races and the rest.
import { asmrBuffer } from './asmr.js';

let ctx = null, master, comp, musicBus, musicOut, duckFilter, sfxBus, asmrBus, reverb, roomVerb, delay, panL, panR;
let noiseBuf = null, meter = null;
let musicOn = false, schedTimer = null, seqStep = 0, nextTime = 0, ducked = false;
const settings = { music: 0.5, sfx: 0.8, asmr: 0.9, master: 1, muted: false };
try { Object.assign(settings, JSON.parse(localStorage.getItem('jjd_audio') || '{}')); } catch (e) { /* defaults */ }

const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);
const vary = (n) => (Math.random() * n) | 0;
let intensity = 1;
// 0 calm (before GO), 1 racing, 2 the last stretch
export function setMusicIntensity(k) { intensity = Math.max(0, Math.min(2, k | 0)); }

// a stereo pan into a bus (where there's no panner: the bus itself)
function panner(c, to, v) { if (!c.createStereoPanner) return to; const p = c.createStereoPanner(); p.pan.value = v; p.connect(to); return p; }
export function initAudio() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 3.5; comp.attack.value = 0.004; comp.release.value = 0.2;
    master = ctx.createGain(); master.gain.value = 1.0;
    comp.connect(master).connect(ctx.destination);
    meter = ctx.createAnalyser(); meter.fftSize = 2048; master.connect(meter);
    musicBus = ctx.createGain();
    duckFilter = ctx.createBiquadFilter(); duckFilter.type = 'lowpass'; duckFilter.frequency.value = 20000; duckFilter.Q.value = 0.5;
    const warm = ctx.createBiquadFilter(); warm.type = 'lowpass'; warm.frequency.value = 11000; warm.Q.value = 0.3;
    musicOut = ctx.createGain();
    musicBus.connect(warm).connect(duckFilter).connect(musicOut).connect(comp);
    panL = panner(ctx, musicBus, -0.4); panR = panner(ctx, musicBus, 0.4);
    sfxBus = ctx.createGain(); sfxBus.connect(comp);
    asmrBus = ctx.createGain(); asmrBus.connect(comp);
    applyVolumes();
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    reverb = ctx.createConvolver(); reverb.buffer = makeIR(ctx, 1.8, 3.2);
    const revGain = ctx.createGain(); revGain.gain.value = 0.24;
    reverb.connect(revGain).connect(musicBus);
    roomVerb = ctx.createConvolver(); roomVerb.buffer = makeIR(ctx, 1.1, 3);
    const roomGain = ctx.createGain(); roomGain.gain.value = 0.25;
    roomVerb.connect(roomGain).connect(sfxBus);
    delay = ctx.createDelay(1);
    // a dotted eighth of Gumdrop Shuffle (the song that plays live while its loops are still rendering)
    delay.delayTime.value = 0.375;
    const fb = ctx.createGain(); fb.gain.value = 0.3;
    const dlf = ctx.createBiquadFilter(); dlf.type = 'lowpass'; dlf.frequency.value = 3600;
    const dlGain = ctx.createGain(); dlGain.gain.value = 0.2;
    delay.connect(dlf).connect(fb).connect(delay);
    dlf.connect(dlGain).connect(musicBus);
    document.addEventListener('visibilitychange', () => {
        if (!ctx) return;
        if (document.hidden) ctx.suspend(); else if (!away) ctx.resume();
    });
}
function applyVolumes() {
    if (!ctx) return;
    const t = ctx.currentTime;
    const m = settings.master ?? 1;
    musicOut.gain.setTargetAtTime(settings.muted ? 0 : settings.music * 1.5 * m * (ducked ? 0.6 : 1), t, 0.08);
    sfxBus.gain.setTargetAtTime(settings.sfx * m, t, 0.05);
    asmrBus.gain.setTargetAtTime((settings.asmr ?? 1) * 1.1 * m, t, 0.05);
}
function save() { try { localStorage.setItem('jjd_audio', JSON.stringify(settings)); } catch (e) { /* ignore */ } }
export function getVolumes() { return { ...settings }; }
export function setVolume(kind, v) { settings[kind] = Math.max(0, Math.min(1, v)); save(); applyVolumes(); }
export function toggleMusic() { settings.muted = !settings.muted; save(); applyVolumes(); return !settings.muted; }
export const musicMuted = () => !!settings.muted;
// Browsers keep audio off until a click or key press: every gesture retries until it's running
// scrolled out of view, or the connection's gone: silence until told otherwise
let away = false;
export function audioAway(on) { away = !!on; if (!ctx) return; if (away) ctx.suspend(); else if (!document.hidden) ctx.resume(); }
export function resumeAudio() { if (away) return; initAudio(); if (ctx && ctx.state !== 'running') ctx.resume().catch(() => {}); if (ctx && !musicOn && wantMusic) startMusic(); }
const level = () => { if (!meter) return 0; const a = new Float32Array(meter.fftSize); meter.getFloatTimeDomainData(a); let p = 0; for (const v of a) p = Math.max(p, Math.abs(v)); return +p.toFixed(3); };
export const audioDebug = () => ({ peak: level(), state: ctx && ctx.state, musicOn, settings: { ...settings }, intensity, song: song === SONGS.climb ? 'climb' : 'plaza', loops: { plaza: !!loops.plaza, climb: !!loops.climb }, loopStats, player: player ? nameOf(player.song) + ':' + player.k : '' });
export const audioSuspended = () => !ctx || ctx.state !== 'running';
// Menus open: the music goes muffled and a little quieter
export function setMusicDuck(on) {
    if (!ctx || on === ducked) return;
    ducked = on;
    duckFilter.frequency.setTargetAtTime(on ? 900 : 20000, ctx.currentTime, 0.12);
    applyVolumes();
}

// ----- building blocks (the effects, and the music's pad) -----
function noise(t, dur, type, freq, q, gain, out, freqEnd, attack) {
    const src = ctx.createBufferSource(); src.buffer = noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q || 1;
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    const g = ctx.createGain();
    if (attack) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + attack); } else g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(out || musicBus);
    src.start(t, Math.random() * 1.5); src.stop(t + dur + 0.05);
    return { f, g };
}
function tone(t, type, f0, f1, dur, gain, out, attack) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t);
    if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    if (attack) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + attack); } else g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(out || sfxBus); o.start(t); o.stop(t + dur + 0.05);
    return o;
}
// a soft pad: the chord on pairs of detuned saws through a low-pass, swelling in and out (built from nodes, a chord at a time)
function pad(t, notes, dur, gain, cut) {
    const g = ctx.createGain(), f = ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = cut; f.Q.value = 0.4;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + Math.min(0.45, dur * 0.3)); g.gain.setValueAtTime(gain, t + dur * 0.85); g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.3);
    f.connect(g); g.connect(musicBus); g.connect(reverb);
    for (const n of notes) for (const det of [-7, 7]) {
        const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = midi(n); o.detune.value = det;
        o.connect(f); o.start(t); o.stop(t + dur + 0.35);
    }
}

// ----- the instruments -----
// Each note of each instrument is synthesised sample by sample the first time it's asked for, at the rate it plays at (the loops'
// while they render, the device's live), and kept. A note in play is then a buffer source and a gain, not a dozen oscillators,
// filters and envelopes.
const TAU = Math.PI * 2;
const kitCache = new Map();
function kit(name, n, len) {
    const sr = ctx.sampleRate, key = name + n + ':' + (len ? len.toFixed(3) : '') + '@' + sr;
    let b = kitCache.get(key);
    if (!b) {
        const x = SYN[name](n, sr, len);
        b = ctx.createBuffer(1, x.length, sr);
        b.copyToChannel(x, 0);
        kitCache.set(key, b);
    }
    return b;
}
// a note: a buffer from t at a gain into a bus (the music's by default), some of it into the reverb and the echo
function voice(buf, t, gain, out, wet, echo) {
    const src = ctx.createBufferSource(), g = ctx.createGain();
    src.buffer = buf; g.gain.value = gain;
    src.connect(g).connect(out || musicBus);
    if (wet) send(g, reverb, wet);
    if (echo) send(g, delay, echo);
    src.start(Math.max(0, t));
    return g;
}
function send(g, to, amt) { if (amt >= 1) g.connect(to); else { const s = ctx.createGain(); s.gain.value = amt; g.connect(s).connect(to); } }
// a decaying sine added into x from `at` s: f Hz, amplitude a, dying away at d per second (a running recurrence, not a sin() a sample)
function partial(x, sr, f, a, d, at) {
    if (f >= sr * 0.45) return;
    const w = TAU * f / sr, c = 2 * Math.cos(w), e = Math.exp(-d / sr);
    let s1 = 0, s2 = -Math.sin(w), env = a;
    for (let i = Math.round((at || 0) * sr); i < x.length && env > 1e-5; i++) { x[i] += s1 * env; const s0 = c * s1 - s2; s2 = s1; s1 = s0; env *= e; }
}
// noise between lo and hi Hz, from `at` s for len s, amplitude a dying away at d per second (an attack of att s)
function hiss(x, sr, at, len, a, d, lo, hi, att) {
    const i0 = Math.round(at * sr), n = Math.round(len * sr), cl = 1 - Math.exp(-TAU * lo / sr), ch = 1 - Math.exp(-TAU * Math.min(hi, sr * 0.45) / sr), e = Math.exp(-d / sr), A = (att || 0) * sr;
    let l1 = 0, l2 = 0, h1 = 0, h2 = 0, env = a;
    for (let i = 0; i < n && i0 + i < x.length; i++, env *= e) {
        const w = Math.random() * 2 - 1;
        l1 += (w - l1) * cl; l2 += (l1 - l2) * cl; h1 += (w - l2 - h1) * ch; h2 += (h1 - h2) * ch;
        x[i0 + i] += h2 * env * (i < A ? i / A : 1);
    }
}
// the finish: an attack of att s, a short fade at the end, the peak at 1
function fin(x, sr, att) {
    let m = 0;
    for (let i = 0; i < x.length; i++) { const v = Math.abs(x[i]); if (v > m) m = v; }
    const k = m > 0 ? 1 / m : 0, A = Math.max(1, Math.round(att * sr)), F = Math.min(x.length, Math.round(sr * 0.015));
    for (let i = 0; i < x.length; i++) x[i] *= k * (i < A ? (i + 1) / A : 1) * (i >= x.length - F ? (x.length - i) / F : 1);
    return x;
}
// a band-limited saw's correction at its jump (polyBLEP)
const blep = (p, dt) => (p < dt ? ((p /= dt), p + p - p * p - 1) : p > 1 - dt ? ((p = (p - 1) / dt), p * p + p + p + 1) : 0);
// a resonant low-pass (a state-variable filter): const lp = svf(); lp.set(cutoff, rate, q) now and then; y = lp.run(x) a sample
function svf() {
    let a = 0, b = 0, a1 = 0, a2 = 0, a3 = 0;
    return {
        set(fc, sr, q) { const g = Math.tan(Math.PI * Math.min(fc, sr * 0.45) / sr); a1 = 1 / (1 + g * (g + 1 / q)); a2 = g * a1; a3 = g * a2; },
        run(v) { const v3 = v - b, v1 = a1 * a + a2 * v3, v2 = b + a2 * a + a3 * v3; a = 2 * v1 - a; b = 2 * v2 - b; return v2; },
    };
}
const SYN = {
    // a glockenspiel bar: a hard little strike, the note ringing on, its inharmonic overtones gone first
    glock(n, sr) {
        const f = midi(n), x = new Float32Array(Math.round(sr * 1.2));
        for (const [k, a, d] of [[1, 1, 3.6], [2.756, 0.36, 10], [5.404, 0.13, 22], [8.933, 0.05, 36]]) partial(x, sr, f * k, a, d);
        hiss(x, sr, 0, 0.004, 0.16, 400, 2000, 9000);
        return fin(x, sr, 0.0006);
    },
    // a celesta: a felt hammer on a plate over its resonator, bright for a moment, then round
    // (the note itself a running sine, its phase kept small; once the brightness has gone, just the sine)
    celesta(n, sr) {
        const f = midi(n), L = Math.round(sr * 1.0), x = new Float32Array(L), w = TAU * f / sr, c = 2 * Math.cos(w), e = Math.exp(-3.4 / sr), eb = Math.exp(-16 / sr);
        for (let i = 0, s1 = 0, s2 = -Math.sin(w), ph = 0, env = 1, br = 1.2; i < L; i++, env *= e, br *= eb) {
            x[i] = (br > 1e-4 ? Math.sin(ph + br * s1) : s1) * env;
            const s0 = c * s1 - s2; s2 = s1; s1 = s0;
            ph += w; if (ph > TAU) ph -= TAU;
        }
        partial(x, sr, f * 2, 0.12, 8); partial(x, sr, f * 4, 0.05, 24);
        return fin(x, sr, 0.002);
    },
    // a plucked string ringing for T s (Karplus-Strong): the walking bass low down, little pizzicato strings higher up
    pizz(n, sr, T) {
        const f = midi(n), L = Math.round(sr * T), x = new Float32Array(L), D = sr / f - 0.5, N = Math.floor(D), fr = D - N;
        const rho = Math.pow(0.001, 1 / (f * T)), cut = 1 - Math.exp(-TAU * Math.min(f * 6, 3500) / sr);
        // the pluck: a period of softened noise (a fingertip, not a pick), its average taken out
        const ex = new Float32Array(N + 1);
        let lp = 0, mean = 0, pk = 0;
        for (let i = 0; i <= N; i++) { lp += (Math.random() * 2 - 1 - lp) * cut; ex[i] = lp; mean += lp / (N + 1); }
        for (let i = 0; i < L; i++) {
            const j = i - N;
            x[i] = (i <= N ? ex[i] - mean : 0) + (j >= 2 ? rho * 0.5 * ((1 - fr) * x[j] + x[j - 1] + fr * x[j - 2]) : 0);
            if (i < 2 * N) pk = Math.max(pk, Math.abs(x[i]));
        }
        // the body: a round thump on the note; then warmed with a gentle low-pass
        partial(x, sr, f, 0.45 * pk, 16);
        for (let i = 0, y = 0, c = 1 - Math.exp(-TAU * 2600 / sr); i < L; i++) { y += (x[i] - y) * c; x[i] = y; }
        return fin(x, sr, 0.0015);
    },
    // sleigh bells shaken: a handful of little bells, each ringing two or three times as its pellet rattles, and a hiss
    sleigh(v, sr) {
        const x = new Float32Array(Math.round(sr * 0.25));
        for (let b = 0, nb = 5 + (v % 3); b < nb; b++) {
            const f0 = 2600 + Math.random() * 3400, d = 45 + Math.random() * 35;
            for (let h = 0, at = Math.random() * 0.016, a = 0.5 + Math.random() * 0.5; h < 3; h++, at += 0.01 + Math.random() * 0.018, a *= 0.5)
                for (const [k, pa] of [[1, 1], [1.52, 0.55], [2.33, 0.35], [3.08, 0.18]]) partial(x, sr, f0 * k * (0.99 + Math.random() * 0.02), a * pa, d * (1 + k * 0.2), at);
        }
        hiss(x, sr, 0, 0.2, 0.5, 32, 5000, 14000, 0.003);
        return fin(x, sr, 0.001);
    },
    // a kick: 0 soft and round (the village), 1 big (a race)
    kick(v, sr) {
        const x = new Float32Array(Math.round(sr * 0.42));
        for (let i = 0, ph = 0; i < x.length; i++) { const t = i / sr; ph += TAU * ((v ? 50 : 52) + (v ? 130 : 85) * Math.exp(-t * (v ? 30 : 24))) / sr; if (ph > TAU) ph -= TAU; x[i] = Math.sin(ph) * Math.exp(-t * (v ? 7.5 : 9)); }
        hiss(x, sr, 0, 0.006, v ? 0.35 : 0.12, 300, 800, 6000);
        return fin(x, sr, 0.0008);
    },
    // a snare: the skin and its wires
    snare(v, sr) { const x = new Float32Array(Math.round(sr * 0.32)); partial(x, sr, 186, 0.75, 24); partial(x, sr, 335, 0.4, 30); hiss(x, sr, 0, 0.32, 0.9, 14, 1400, 9000); return fin(x, sr, 0.0008); },
    // a clap: three quick slaps and the room after
    clap(v, sr) { const x = new Float32Array(Math.round(sr * 0.3)); for (let k = 0; k < 4; k++) hiss(x, sr, k * 0.011, k === 3 ? 0.25 : 0.012, 1, k === 3 ? 13 : 150, 900, 3800); return fin(x, sr, 0.0005); },
    // a finger snap (the village's backbeat)
    snap(v, sr) { const x = new Float32Array(Math.round(sr * 0.1)); hiss(x, sr, 0, 0.1, 1, 55, 1500, 5000); partial(x, sr, 1900 + v * 120, 0.3, 70); return fin(x, sr, 0.0005); },
    // a hi-hat: 0 closed, 1 open
    hat(v, sr) { const x = new Float32Array(Math.round(sr * (v ? 0.3 : 0.07))); hiss(x, sr, 0, x.length / sr, 1, v ? 12 : 70, 7000, 15000); return fin(x, sr, 0.0005); },
    // a crash: a long bright wash, a few metal partials in it
    crash(v, sr) { const x = new Float32Array(Math.round(sr * 1.6)); hiss(x, sr, 0, 1.6, 1, 2.6, 4000, 15000, 0.002); for (const f of [3150, 4370, 5230, 6970, 8110]) partial(x, sr, f, 0.03, 4); return fin(x, sr, 0.001); },
    // a tom: its note falling a little as it's hit
    tom(n, sr) {
        const f = midi(n), x = new Float32Array(Math.round(sr * 0.5));
        for (let i = 0, ph = 0; i < x.length; i++) { const t = i / sr; ph += TAU * f * (1 + 0.5 * Math.exp(-t * 22)) / sr; if (ph > TAU) ph -= TAU; x[i] = Math.sin(ph) * Math.exp(-t * 7); }
        hiss(x, sr, 0, 0.08, 0.15, 30, 200, 2000);
        return fin(x, sr, 0.001);
    },
    // a jelly bloop: a little sine flicking up into its note and wobbling
    bloop(n, sr) {
        const f = midi(n), x = new Float32Array(Math.round(sr * 0.3));
        for (let i = 0, ph = 0; i < x.length; i++) { const t = i / sr; ph += TAU * f * (1 - 0.45 * Math.exp(-t * 60)) * (1 + 0.03 * Math.sin(TAU * 13 * t) * Math.exp(-t * 6)) / sr; if (ph > TAU) ph -= TAU; x[i] = Math.sin(ph) * Math.exp(-t * 12); }
        partial(x, sr, f * 2, 0.15, 20);
        return fin(x, sr, 0.004);
    },
    // a race's bass: a saw and its fundamental through a low-pass that snaps shut, held len s (the filter retuned every 16 samples)
    bass(n, sr, len) {
        const f = midi(n), x = new Float32Array(Math.round(sr * (len + 0.05))), dt = f / sr, lp = svf();
        for (let i = 0, p = 0; i < x.length; i++) {
            const t = i / sr, s = 0.85 * (2 * p - 1 - blep(p, dt)) + 0.45 * Math.sin(TAU * p);
            p += dt; if (p >= 1) p -= 1;
            if ((i & 15) === 0) lp.set(160 + 2600 * Math.exp(-t * 20), sr, 1.1);
            x[i] = lp.run(s) * Math.min(1, t / 0.002) * (0.6 + 0.4 * Math.exp(-t * 16)) * (t > len ? Math.exp(-(t - len) * 70) : 1);
        }
        return fin(x, sr, 0);
    },
    // a race's lead: two saws a few cents apart and one an octave down, a low-pass, a vibrato that comes in late, held len s
    lead(n, sr, len) {
        const f = midi(n), x = new Float32Array(Math.round(sr * (len + 0.1))), lp = svf();
        let d1 = 0, d2 = 0, d3 = 0;
        for (let i = 0, p1 = 0, p2 = 0.4, p3 = 0.7; i < x.length; i++) {
            const t = i / sr;
            if ((i & 15) === 0) {
                const vib = 1 + 0.0055 * Math.sin(TAU * 5.6 * t) * Math.min(1, Math.max(0, (t - 0.12) / 0.2));
                d1 = f * 1.0035 * vib / sr; d2 = f * 0.9965 * vib / sr; d3 = f * 0.5 * vib / sr;
                lp.set(2400 + 3600 * Math.exp(-t * 7), sr, 0.9);
            }
            const s = 2 * p1 - 1 - blep(p1, d1) + 2 * p2 - 1 - blep(p2, d2) + 0.6 * (2 * p3 - 1 - blep(p3, d3));
            p1 += d1; if (p1 >= 1) p1 -= 1; p2 += d2; if (p2 >= 1) p2 -= 1; p3 += d3; if (p3 >= 1) p3 -= 1;
            x[i] = lp.run(s) * Math.min(1, t / 0.006) * (0.78 + 0.22 * Math.exp(-t * 12)) * (t > len ? Math.exp(-(t - len) * 45) : 1);
        }
        return fin(x, sr, 0);
    },
};

// ----- the two songs -----
// the chords: a root (the bass's) and the notes the pad and the strings play
const CH = {
    // Gumdrop Shuffle, in G
    G: { r: 43, n: [67, 71, 74, 76] }, Em: { r: 40, n: [64, 67, 71, 74] }, Am7: { r: 45, n: [67, 69, 72, 76] }, D7: { r: 38, n: [66, 69, 72, 74] },
    G7: { r: 43, n: [65, 67, 71, 74] }, C6: { r: 48, n: [64, 67, 69, 72] }, Cm6: { r: 48, n: [63, 67, 69, 72] }, GD: { r: 38, n: [62, 67, 71, 74] },
    // Avalanche Rush, in D minor
    Dm: { r: 38, n: [57, 62, 65, 69] }, Gm: { r: 43, n: [58, 62, 67, 70] }, C7: { r: 36, n: [58, 60, 64, 67] }, F: { r: 41, n: [57, 60, 65, 69] },
    Bb: { r: 46, n: [58, 62, 65, 69] }, Em7b5: { r: 40, n: [55, 58, 62, 64] }, A7: { r: 45, n: [57, 61, 64, 67] },
};
const SONGS = {
    // the village and the course: "Gumdrop Shuffle", G major, 120 BPM, swung eighths
    plaza: {
        bpm: 120,
        // each bar's chords, a half bar each
        harm: [['G', 'G'], ['Em', 'Em'], ['Am7', 'Am7'], ['D7', 'D7'], ['G', 'G'], ['G7', 'G7'], ['C6', 'Cm6'], ['GD', 'D7']],
        // the walking bass, a note a beat
        walk: [[43, 47, 50, 51], [52, 50, 47, 44], [45, 48, 52, 51], [50, 48, 45, 42], [43, 47, 50, 52], [55, 53, 50, 47], [48, 52, 48, 51], [50, 47, 45, 42]],
        // the tune, in eighths: [eighth, note]
        lead: [
            [[0, 83], [1, 83], [2, 88], [4, 86], [5, 83], [6, 86]],
            [[0, 88], [1, 91], [2, 90], [4, 88], [5, 86], [6, 83]],
            [[0, 81], [1, 81], [2, 88], [4, 84], [5, 81], [6, 84]],
            [[0, 84], [1, 83], [2, 81], [4, 78], [5, 79], [6, 81]],
            [[0, 83], [1, 83], [2, 88], [4, 86], [5, 83], [6, 86]],
            [[0, 88], [1, 91], [2, 89], [4, 88], [5, 86], [6, 83]],
            [[0, 88], [1, 91], [2, 93], [6, 91], [7, 87]],
            [[0, 86], [2, 83], [3, 79], [4, 78], [5, 81], [6, 84], [7, 81]],
        ],
    },
    // a race: "Avalanche Rush", D minor, 160 BPM
    climb: {
        bpm: 160,
        harm: [['Dm', 'Dm'], ['Gm', 'Gm'], ['C7', 'C7'], ['F', 'F'], ['Bb', 'Bb'], ['Em7b5', 'Em7b5'], ['A7', 'A7'], ['A7', 'A7']],
        // the tune, in sixteenths: [sixteenth, note, sixteenths long]
        lead: [
            [[0, 81, 4], [4, 86, 2], [6, 84, 4], [10, 81, 2], [12, 77, 4]],
            [[0, 79, 6], [6, 82, 6], [12, 86, 4]],
            [[0, 79, 4], [4, 84, 2], [6, 82, 4], [10, 79, 2], [12, 76, 4]],
            [[0, 77, 6], [6, 81, 6], [12, 84, 4]],
            [[0, 77, 4], [4, 82, 2], [6, 81, 4], [10, 77, 2], [12, 74, 4]],
            [[0, 76, 6], [6, 79, 6], [12, 82, 4]],
            [[0, 81, 2], [2, 85, 2], [4, 88, 2], [6, 91, 4], [10, 89, 2], [12, 88, 4]],
            [[0, 85, 4], [4, 88, 4], [8, 69, 1], [9, 70, 1], [10, 73, 1], [11, 74, 1], [12, 76, 1], [13, 77, 1], [14, 79, 1], [15, 80, 1]],
        ],
    },
};
let song = SONGS.plaza, songNext = SONGS.plaza, STEP = 60 / song.bpm / 4;
// 'plaza' (the village and the course) or 'climb' (a race): the song changes at the next bar
export function setMusicMode(name) { if (SONGS[name]) songNext = SONGS[name]; }
function playStep(s, t) {
    const bar = Math.floor(s / 16) % 8, i = s % 16;
    if (song === SONGS.plaza) plazaStep(bar, i, t, intensity); else climbStep(bar, i, t, intensity);
}
// Gumdrop Shuffle: calm (0) the celesta has the tune over the pad, a bass note a half bar and sleigh bells on the backbeat;
// then (1) the glockenspiel takes it, the bass walks, the strings pluck, the sleigh bells and the drums swing
function plazaStep(bar, i, t, k) {
    const h = song.harm[bar], ch = CH[h[i >> 3]], sw = i % 4 === 2 ? STEP * 0.42 : 0, walk = song.walk[bar], split = h[1] !== h[0];
    if (i === 0 || (i === 8 && split)) pad(t, ch.n.map((n) => n - 12), STEP * (split ? 8 : 16), k ? 0.0042 : 0.0047, 1300);
    for (const [e, n] of song.lead[bar]) if (e * 2 === i) {
        if (k) { voice(kit('glock', n), t + sw, 0.058, panL, 1, 0.45); voice(kit('celesta', n - 12), t + sw, 0.031, panR, 0.6); }
        else voice(kit('celesta', n), t + sw, 0.03, musicBus, 1, 0.45);
    }
    if (k ? i % 2 === 0 : i === 4 || i === 12) voice(kit('sleigh', vary(6)), t + sw, i === 4 || i === 12 ? 0.09 : i % 4 ? 0.047 : 0.034, panR);
    if (!k) { if (i === 0 || i === 8) voice(kit('pizz', walk[i >> 2], 1.3), t, 0.1); return; }
    // the walking bass, on the beat, with a skip into every other bar
    if (i % 4 === 0) voice(kit('pizz', walk[i >> 2], 0.9), t, 0.125);
    if (i === 14 && bar % 2) voice(kit('pizz', song.walk[(bar + 1) % 8][0], 0.9), t + sw, 0.05);
    // plucked strings on the backbeat, strummed
    if (i === 4 || i === 12) for (let j = 1; j < 4; j++) voice(kit('pizz', ch.n[j], 0.4), t + (j - 1) * 0.012, 0.021, j % 2 ? panL : panR, 0.5);
    // a soft kick (and one skipping into every other bar), a finger snap
    if (i === 0 || i === 8 || (i === 10 && bar % 2)) voice(kit('kick', 0), t + sw, 0.1);
    if (i === 4 || i === 12) voice(kit('snap', vary(3)), t, 0.035, musicBus, 0.5);
    // a jelly bloop to end a phrase
    if (i === 14 && bar % 2) voice(kit('bloop', ch.n[3] + 12), t + sw, 0.06, panL, 0.6, 0.6);
}
// Avalanche Rush: calm (0, before GO) a pad, a pulse in the bass, the celesta's arpeggio and sleigh bells on the eighths; racing (1)
// the gallop, sleigh bells on every sixteenth, kick and snare, the lead, a glockenspiel's sparkle; the last stretch (2) claps,
// open hats, toms, the glockenspiel on the lead an octave up
function climbStep(bar, i, t, k) {
    const ch = CH[song.harm[bar][i >> 3]], r = ch.r, fill = bar === 7 && i >= 8, arp = ch.n[[0, 1, 2, 3, 2, 1, 3, 2][(i >> 1) & 7]] + 24;
    if (i === 0) pad(t, ch.n, STEP * 16, k ? 0.0048 : 0.0068, k ? 1700 : 1100);
    if (k || i % 2 === 0) voice(kit('sleigh', vary(6)), t, !k ? 0.045 : i % 4 === 2 ? 0.087 : i % 2 ? 0.037 : 0.058, i % 2 ? panL : panR);
    if (!k) {
        if (i % 2 === 0) { voice(kit('celesta', arp), t, 0.031, i % 4 ? panR : panL, 1, 0.5); voice(kit('bass', r, STEP * 0.8), t, 0.072); }
        if (i === 0 || i === 8) voice(kit('kick', 1), t, 0.067);
        return;
    }
    if (k === 2 ? i % 2 === 1 : i % 4 === 2) voice(kit('glock', arp), t, k === 2 ? 0.019 : 0.027, panR, 1);
    // the gallop: an eighth and two sixteenths a beat, hopping up an octave into the next bar
    if (i % 4 === 0) voice(kit('bass', r, STEP * 1.7), t, 0.109);
    else if (i % 4 >= 2) voice(kit('bass', r + (i === 15 ? 12 : 0), STEP * 0.8), t, 0.088);
    // the drums: a kick every beat, the snare on the backbeat and rolling up into the top of the loop, a crash there
    if (i % 4 === 0) voice(kit('kick', 1), t, 0.11);
    if (fill) voice(kit('snare', vary(3)), t, 0.044 + (i - 8) * 0.0126, musicBus, 0.4);
    else if (i === 4 || i === 12) voice(kit('snare', vary(3)), t, 0.14, musicBus, 0.45);
    if (i === 0 && (bar === 0 || (k === 2 && bar === 4))) voice(kit('crash', 0), t, 0.08, musicBus, 0.5);
    if (k === 2) {
        if ((i === 4 || i === 12) && !fill) voice(kit('clap', vary(2)), t, 0.08, musicBus, 0.6);
        if (i % 4 === 2) voice(kit('hat', 1), t, 0.03, panL);
        if (bar === 3 && i >= 12) voice(kit('tom', [52, 49, 45, 40][i - 12]), t, 0.14, musicBus, 0.3);
    }
    for (const [s0, n, len] of song.lead[bar]) if (s0 === i) {
        voice(kit('lead', n, STEP * len * 0.9), t, k === 2 ? 0.088 : 0.078, musicBus, 0.5, 0.35);
        if (k === 2) voice(kit('glock', n + 12), t, 0.033, panL, 1);
    }
}

// ----- the songs as loops -----
// Every part repeats after eight bars, so each song is rendered once per intensity (in the background, an
// OfflineAudioContext) into an eight-bar loop, and the loops play from buffers, in step, crossfading as the
// intensity changes. Played live, a note at a time, a song builds a hundred-odd audio nodes a second: a few
// percent of every frame on a weak laptop's main thread, and the audio thread's work on top.
// Until a song's loops are ready it plays live, as it always did.
const LOOP_STEPS = 128, LOOP_RATE = 24000;
const KS = { plaza: [0, 1], climb: [0, 1, 2] };
const loops = { plaza: null, climb: null };
let player = null;     // the loops playing: { song, srcs, gains, k }
const nameOf = (sg) => (sg === SONGS.climb ? 'climb' : 'plaza');
// the loop for an intensity: the nearest one rendered so far
const loopK = (sg, k) => Math.min(k, (loops[nameOf(sg)] || KS[nameOf(sg)]).length - 1);
function scheduler() {
    while (nextTime < ctx.currentTime + 0.2) {
        // (no live notes: the next song waits until its loops are ready, the one playing carries on)
        if (seqStep % 16 === 0 && song !== songNext && (liveMusic || loops[nameOf(songNext)])) {
            // the new song from its first bar; the old one's loops stop there
            song = songNext; STEP = 60 / song.bpm / 4; seqStep = 0;
            if (player) stopPlayer(nextTime);
        }
        if (player && globalThis.__ovtLegacy) stopPlayer(nextTime);
        // more of this song's loops ready since it started: picked up at the bar line, seamlessly
        if (player && seqStep % 16 === 0 && loops[nameOf(song)] && loops[nameOf(song)].length > player.srcs.length) stopPlayer(nextTime);
        if (!player && loops[nameOf(song)] && seqStep % 16 === 0 && !globalThis.__ovtLegacy) startPlayer(nextTime, (seqStep % LOOP_STEPS) * STEP);
        if (!player && liveMusic) playStep(seqStep, nextTime);
        nextTime += STEP;
        seqStep++;
    }
    if (player) {
        const k = Math.min(loopK(song, intensity), player.gains.length - 1);
        if (k !== player.k) { player.k = k; player.gains.forEach((g, i) => g.gain.setTargetAtTime(i === k ? 1 : 0, ctx.currentTime, 0.12)); }
    }
}
function startPlayer(t, offset) {
    const k = loopK(song, intensity), srcs = [], gains = [];
    loops[nameOf(song)].forEach((buf, i) => {
        const src = ctx.createBufferSource(), g = ctx.createGain();
        src.buffer = buf; src.loop = true;
        g.gain.value = i === k ? 1 : 0;
        src.connect(g).connect(musicBus);
        src.start(t, offset);
        srcs.push(src); gains.push(g);
    });
    player = { song, srcs, gains, k };
}
function stopPlayer(t) {
    for (const g of player.gains) { g.gain.setValueAtTime(g.gain.value, t); g.gain.linearRampToValueAtTime(0, t + 0.06); }
    for (const src of player.srcs) src.stop(t + 0.08);
    player = null;
}
function makeIR(c, secs, decay) {
    const len = Math.round(c.sampleRate * secs), b = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay); }
    return b;
}
// the time left before the next frame (none known: a few ms)
// the idle time left before the next frame; a game using all of every frame (a weak laptop) has none,
// so then a short slice every tenth of a second
const idle = () => new Promise((r) => (window.requestIdleCallback ? requestIdleCallback((d) => r(d), { timeout: 100 }) : setTimeout(() => r(null), 50)));
// behind the loading screen the loops get big slices (nothing else is drawing yet); in play, idle moments only
let loadingFast = false;
const slice = () => (loadingFast ? new Promise((r) => setTimeout(() => r({ fast: true }), 0)) : idle());
let loopIR = null;
const PRE_STEPS = 16;
// One song at one intensity: its eight bars after a bar of run-up (the end of the loop, so the loop
// starts with its own last notes' echoes still ringing, as it will when it goes round), the notes laid
// out a few at a time in idle moments (each instrument's notes synthesised as they're first needed), then the eight bars kept.
// QA: how long each loop took (the notes laid out on the main thread, in ms; its slices; the audio rendering)
const loopStats = [];
async function renderLoop(sg, k) {
    const w0 = performance.now(); let js = 0, slices = 0;
    const step = 60 / sg.bpm / 4, len = Math.round(LOOP_STEPS * step * LOOP_RATE), pre = Math.round(PRE_STEPS * step * LOOP_RATE);
    const oc = new OfflineAudioContext(2, pre + len, LOOP_RATE);
    const bus = oc.createGain(); bus.connect(oc.destination);
    const rv = oc.createConvolver(); rv.buffer = loopIR || (loopIR = makeIR(oc, 1.8, 3.2));
    const rg = oc.createGain(); rg.gain.value = 0.24; rv.connect(rg).connect(bus);
    // the echo a dotted eighth behind, in time with the song
    const dl = oc.createDelay(1); dl.delayTime.value = step * 3;
    const fb = oc.createGain(); fb.gain.value = 0.3;
    const lf = oc.createBiquadFilter(); lf.type = 'lowpass'; lf.frequency.value = 3600;
    const dg = oc.createGain(); dg.gain.value = 0.2;
    dl.connect(lf).connect(fb).connect(dl); lf.connect(dg).connect(bus);
    const pl = panner(oc, bus, -0.4), pr = panner(oc, bus, 0.4);
    for (let s = -PRE_STEPS; s < LOOP_STEPS;) {
        const d = await slice(), until = performance.now() + (d && d.fast ? 12 : d && !d.didTimeout ? Math.min(6, Math.max(1, d.timeRemaining() - 1)) : 2);
        // the note builders draw on these: pointed at the offline graph while they build, all in one go
        // (the live music never sees them)
        const live = { ctx, musicBus, reverb, delay, panL, panR, song, STEP, intensity };
        ctx = oc; musicBus = bus; reverb = rv; delay = dl; panL = pl; panR = pr; song = sg; STEP = step; intensity = k;
        const j0 = performance.now(); slices++;
        try { do { playStep((s + LOOP_STEPS) % LOOP_STEPS, (s + PRE_STEPS) * step); s++; } while (s < LOOP_STEPS && performance.now() < until); } finally { ({ ctx, musicBus, reverb, delay, panL, panR, song, STEP, intensity } = live); }
        js += performance.now() - j0;
    }
    const r0 = performance.now(), out = await oc.startRendering();
    loopStats.push({ song: nameOf(sg), k, js: Math.round(js), slices, render: Math.round(performance.now() - r0), wall: Math.round(performance.now() - w0) });
    const loop = new AudioBuffer({ length: len, numberOfChannels: 2, sampleRate: LOOP_RATE });
    for (let c = 0; c < 2; c++) loop.copyToChannel(out.getChannelData(c).subarray(pre, pre + len), c);
    return loop;
}
let loopsStarted = false;
// on Low only the first (calm) loop of each song is made: the others are minutes of synthesis in a weak device's idle moments,
// and megabytes of notes for the garbage collector, all while you play (the song keeps one mood instead of rising with the chase)
let loopsMax = 9;
export function musicLite(on) { loopsMax = on ? 1 : 9; }
// on a slow device (Low quality) the music waits for its loops in silence rather than being played note by note
let liveMusic = true;
export function allowLiveMusic(on) { liveMusic = !!on; }
// each instrument's synthesis run once first on a throwaway note, a slice each, so its code is warmed up (compiled) before the
// loops need it: a first, slow run in the middle of play would hold a frame up
async function warmKit() { for (const name of Object.keys(SYN)) { await slice(); SYN[name](72, LOOP_RATE, 0.05); } }
async function renderLoops() {
    if (loopsStarted || typeof OfflineAudioContext === 'undefined') return;
    loopsStarted = true;
    try {
        await warmKit();
        // the calmest loop of the song playing now, then the other song's, then the rest: a song plays as soon as
        // it has one (the music starts several times sooner than waiting for all of them)
        const order = nameOf(song) === 'climb' ? ['climb', 'plaza'] : ['plaza', 'climb'];
        for (let i = 0; i < Math.max(KS.plaza.length, KS.climb.length) && i < loopsMax; i++) {
            for (const name of order) {
                if (i >= KS[name].length) continue;
                const buf = await renderLoop(SONGS[name], KS[name][i]);
                (loops[name] || (loops[name] = [])).push(buf);
            }
        }
    } catch (e) { console.warn('[music] loops', e); }
    // the notes synthesised for the loops aren't needed again; the effects' sleigh bells made now, in idle moments
    for (const key of [...kitCache.keys()]) if (key.endsWith('@' + LOOP_RATE)) kitCache.delete(key);
    try { for (let v = 0; v < 6; v++) { await slice(); kit('sleigh', v); } } catch (e) { /* made when first rung */ }
}
let wantMusic = false;
export function startMusic() {
    wantMusic = true;
    if (!ctx || musicOn) return;
    musicOn = true;
    seqStep = 0; nextTime = ctx.currentTime + 0.1;
    schedTimer = setInterval(scheduler, 30);
    // a few seconds in, not while the game is still settling after loading
    loadingFast = false;
    if (!loopsStarted) setTimeout(renderLoops, 5000);
}
// while the game loads: the songs' loops start rendering now, in big slices, so the music never has to be
// played note by note (that builds a hundred-odd audio nodes a second: a real cost on a slow phone)
export function prerenderMusic() { if (!ctx || loopsStarted) return; loadingFast = true; renderLoops(); }
export function stopMusic() { musicOn = false; clearInterval(schedTimer); if (player) stopPlayer(ctx.currentTime); }


// =====================================================================================
// The ASMR sounds: key ('step', 'crunch', 'land', 'mega'...), gain, rate (pitch), pan -1..1, delay (s)
// =====================================================================================
let voices = 0;
const MAX_VOICES = 22;
export function playAsmr(key, gain, rate, pan, delay) {
    if (!ctx || ctx.state !== 'running' || (settings.asmr ?? 1) <= 0 || voices >= MAX_VOICES) return;
    const b = asmrBuffer(ctx, key);
    if (!b) return;
    const src = ctx.createBufferSource();
    src.buffer = b;
    src.playbackRate.value = rate || 1;
    const g = ctx.createGain();
    g.gain.value = gain ?? 1;
    let out = g;
    if (pan) { const p = ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan)); g.connect(p); out = p; }
    src.connect(g);
    out.connect(asmrBus);
    voices++;
    src.onended = () => { voices--; src.disconnect(); g.disconnect(); if (out !== g) out.disconnect(); };
    src.start(ctx.currentTime + 0.003 + (delay || 0));
}

// =====================================================================================
// Sound effects (sfx(name, arg): arg is a pitch / combo number for some)
// =====================================================================================
// a bell: a struck sine and its glockenspiel overtones (brighter: more of them), ringing on into the room
function chime(t, n, dur, gain, bright) {
    const f = midi(n), g = ctx.createGain();
    g.gain.value = gain; g.connect(sfxBus); g.connect(roomVerb);
    tone(t, 'sine', f, null, dur, 1, g, 0.002);
    tone(t, 'sine', f * 2.756, null, dur * 0.3, bright ? 0.42 : 0.24, g, 0.001);
    tone(t, 'sine', f * 5.404, null, dur * 0.12, bright ? 0.2 : 0.08, g, 0.001);
}
// sleigh bells (the music's), shaken n times
function jingle(t, gain, n) { for (let i = 0; i < (n || 1); i++) voice(kit('sleigh', vary(6)), t + i * 0.075, gain * (i ? 0.75 : 1), sfxBus).connect(roomVerb); }
// glitter: a high hiss sparkling away
const glitter = (t, dur, gain) => noise(t, dur, 'highpass', 7000, 0.7, gain, sfxBus, 0, 0.04);
// a jelly bloop: a sine flicking up into f
const bloop = (t, f, gain) => tone(t, 'sine', f * 0.55, f, 0.09, gain, sfxBus, 0.004);
// a wobbly jelly voice: f0 to f1 over dur, its pitch shaking rate times a second by depth (a fraction of f0)
function wobble(t, type, f0, f1, dur, gain, rate, depth, out) {
    const o = ctx.createOscillator(), l = ctx.createOscillator(), lg = ctx.createGain(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    l.frequency.value = rate; lg.gain.value = f0 * depth;
    l.connect(lg).connect(o.frequency);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(out || sfxBus);
    o.start(t); l.start(t); o.stop(t + dur + 0.05); l.stop(t + dur + 0.05);
}
const SFX = {
    // the menus: a jelly plip, a pop up with a tinkle, a pop down, a soft "nuh-uh"
    click(t) { tone(t, 'sine', 620, 1240, 0.045, 0.12); tone(t + 0.003, 'sine', 2480, null, 0.025, 0.02); },
    open(t) { tone(t, 'sine', 400, 900, 0.11, 0.1, sfxBus, 0.008); jingle(t + 0.04, 0.05); },
    close(t) { tone(t, 'sine', 880, 420, 0.1, 0.08, sfxBus, 0.006); },
    denied(t) { wobble(t, 'triangle', 311, 277, 0.15, 0.11, 18, 0.03); wobble(t + 0.16, 'triangle', 233, 196, 0.26, 0.11, 18, 0.04); },
    // bought: bright bells, a jangle of sleigh bells, glitter
    buy(t) { [86, 91, 98].forEach((n, i) => chime(t + i * 0.07, n, 0.7, i === 2 ? 0.06 : 0.085, true)); jingle(t, 0.13, 2); glitter(t + 0.05, 0.6, 0.03); },
    equip(t) { tone(t, 'sine', 260, 640, 0.07, 0.1, sfxBus, 0.005); chime(t + 0.05, 91, 0.5, 0.08, true); },
    reward(t) { [79, 83, 86, 91].forEach((n, i) => chime(t + i * 0.065, n, 0.8, 0.085)); jingle(t + 0.2, 0.09); glitter(t + 0.15, 0.6, 0.03); },
    // a gem: sugar crystals, glassy and high
    gem(t) { [86, 91, 95, 98, 103].forEach((n, i) => chime(t + i * 0.045, n, 0.45, 0.065, true)); glitter(t, 0.45, 0.025); },
    task(t) { [83, 86, 91].forEach((n, i) => chime(t + i * 0.07, n, 0.55, 0.09)); SFX.gem(t + 0.22); },
    // a level: a joyful bell arpeggio two octaves up, its chord ringing on, sleigh bells
    levelup(t) { [67, 71, 74, 79, 83, 86, 91].forEach((n, i) => chime(t + i * 0.055, n, 0.75, 0.075, true)); [79, 83, 86, 91].forEach((n) => chime(t + 0.42, n, 1.5, 0.045)); jingle(t + 0.38, 0.12, 3); glitter(t + 0.35, 1, 0.04); },
    // a rebirth: higher and brighter, up into D, a warm chord swelling under it
    rankup(t) { [62, 66, 69, 74, 78, 81, 86, 90, 93].forEach((n, i) => chime(t + i * 0.06, n, 0.8, 0.07, true)); [62, 66, 69, 74].forEach((n) => tone(t + 0.5, 'triangle', midi(n), null, 1.8, 0.05, sfxBus, 0.15)); jingle(t + 0.5, 0.13, 4); glitter(t + 0.5, 1.3, 0.05); },
    // a ribbon whipping by, a tinkle at its end
    whoosh(t) { noise(t, 0.32, 'bandpass', 380, 1.4, 0.13, sfxBus, 2400, 0.09); jingle(t + 0.17, 0.045); },
    // a rare one out of a Gift Box: a magic run up the bells
    lucky(t) { [86, 88, 91, 95, 98, 100, 103, 107].forEach((n, i) => chime(t + i * 0.032, n, 0.45, 0.05, true)); glitter(t, 0.6, 0.05); jingle(t + 0.1, 0.08, 2); },
    // a Gift Box shaken: the paper rustling, the box knocking, bells inside
    shake(t) { for (let i = 0; i < 6; i++) { const a = t + i * 0.13; noise(a, 0.08, 'bandpass', 2400, 1.1, 0.07, sfxBus, 4000, 0.008); tone(a, 'sine', 180, 110, 0.07, 0.08); if (i % 2) jingle(a + 0.015, 0.04); } },
    // and opened: the paper ripping, a magic chime
    crack(t) { for (let i = 0; i < 10; i++) noise(t + i * 0.017 + Math.random() * 0.006, 0.03, 'bandpass', 1800 + i * 260, 1.3, 0.09 * (1 - i / 14), sfxBus); noise(t, 0.2, 'highpass', 1500, 0.7, 0.05, sfxBus, 5000, 0.01); [86, 90, 93, 98, 102].forEach((n, i) => chime(t + 0.12 + i * 0.05, n, 0.6, 0.075, true)); glitter(t + 0.12, 0.8, 0.045); },
    wall(t, n) { const b = 79 + Math.min(12, n || 1); [0, 4, 7, 12].forEach((d, i) => chime(t + i * 0.05, b + d, 0.5, 0.08, true)); jingle(t, 0.06); },
    summit(t) { [74, 78, 81, 86, 90, 93, 98].forEach((n, i) => chime(t + i * 0.07, n, 0.7, 0.07, true)); [62, 66, 69, 74].forEach((n) => tone(t + 0.5, 'triangle', midi(n), null, 1.6, 0.06, sfxBus, 0.05)); jingle(t + 0.45, 0.12, 4); glitter(t, 1, 0.05); },
    // a Win Pad (and a race won): a bright ding-ding, sleigh bells, glitter
    win(t) { chime(t, 91, 0.9, 0.12, true); chime(t + 0.13, 95, 1.3, 0.12, true); chime(t + 0.13, 83, 1.3, 0.05); jingle(t, 0.12, 3); glitter(t + 0.1, 0.9, 0.035); },
    lose(t) { [67, 66, 65, 64].forEach((n, i) => wobble(t + i * 0.28, 'triangle', midi(n - 12), midi(n - 12) * 0.97, i === 3 ? 0.9 : 0.3, 0.07, 7, 0.02)); },
    pass(t) { chime(t, 86, 0.5, 0.08); chime(t + 0.1, 91, 0.8, 0.08); jingle(t + 0.1, 0.06); },
    // a Super Squish slam on the way down: a jelly splat
    slam(t) { noise(t, 0.26, 'lowpass', 1400, 1.2, 0.12, sfxBus, 180, 0.006); wobble(t, 'sine', 220, 70, 0.28, 0.08, 16, 0.05); },
    dash(t) { noise(t, 0.28, 'bandpass', 900, 1.4, 0.14, sfxBus, 3200, 0.02); jingle(t + 0.12, 0.04); },
    respawn(t) { wobble(t, 'sine', 180, 520, 0.35, 0.08, 14, 0.05); [74, 79, 83, 86, 91].forEach((n, i) => chime(t + 0.05 + i * 0.04, n, 0.4, 0.05)); glitter(t, 0.5, 0.03); },
    snap(t) { tone(t, 'sine', 720, 320, 0.07, 0.07, sfxBus, 0.003); },
    // a Gift Box, unwrapped
    newblade(t) { noise(t, 0.4, 'bandpass', 500, 2, 0.1, sfxBus, 3200, 0.05); [79, 83, 86, 95].forEach((n, i) => chime(t + 0.12 + i * 0.06, n, 0.6, 0.09, true)); jingle(t + 0.12, 0.08); },
    // a race: you're in the queue; someone else found; the count; the start
    queue(t) { chime(t, 81, 0.45, 0.1); chime(t + 0.1, 86, 0.7, 0.1); },
    found(t) { [86, 90, 93].forEach((n, i) => chime(t + i * 0.05, n, 0.4, 0.08, true)); },
    tick3(t) { chime(t, 81, 0.4, 0.12, true); tone(t, 'sine', 1900, 1300, 0.02, 0.04); },
    go(t) { [74, 78, 81, 86].forEach((n) => chime(t, n, 0.9, 0.05, true)); tone(t, 'square', midi(74), null, 0.3, 0.03, sfxBus, 0.005); tone(t, 'square', midi(81), null, 0.3, 0.025, sfxBus, 0.005); tone(t, 'sine', 140, 48, 0.3, 0.13); jingle(t, 0.16, 4); noise(t, 0.35, 'bandpass', 600, 1, 0.1, sfxBus, 3600, 0.01); },
    // a gate opening: a ribbon whooshing up, the chimes climbing with it
    gate(t) { noise(t, 0.7, 'bandpass', 320, 1.2, 0.1, sfxBus, 3200, 0.12); [74, 79, 83, 86, 91].forEach((n, i) => chime(t + 0.1 + i * 0.07, n, 0.75, 0.07, true)); jingle(t + 0.42, 0.08, 2); },
    // a Wobbler waking: a low, gloopy burble (a big jelly clearing its throat), bubbles, a blorp
    roar(t) {
        const o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain(), l1 = ctx.createOscillator(), l1g = ctx.createGain(), l2 = ctx.createOscillator(), l2g = ctx.createGain();
        o.type = 'sawtooth'; o.frequency.setValueAtTime(68, t); o.frequency.linearRampToValueAtTime(96, t + 0.45); o.frequency.linearRampToValueAtTime(74, t + 1);
        l1.frequency.value = 9; l1g.gain.value = 9; l1.connect(l1g).connect(o.frequency);
        f.type = 'lowpass'; f.Q.value = 7; f.frequency.value = 520;
        l2.frequency.value = 4.5; l2g.gain.value = 260; l2.connect(l2g).connect(f.frequency);
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.06, t + 0.12); g.gain.setValueAtTime(0.06, t + 0.7); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.05);
        o.connect(f).connect(g).connect(sfxBus);
        for (const x of [o, l1, l2]) { x.start(t); x.stop(t + 1.1); }
        for (let i = 0; i < 6; i++) bloop(t + 0.1 + i * 0.13 + Math.random() * 0.05, 150 + Math.random() * 180, 0.05);
        tone(t + 0.95, 'sine', 110, 260, 0.14, 0.06, sfxBus, 0.01);
    },
    // caught: a big wet splorch, a gulp and a glug, a sorry little "wah-waah"
    caught(t) {
        noise(t, 0.32, 'lowpass', 2200, 1.4, 0.2, sfxBus, 180, 0.004);
        tone(t + 0.02, 'sine', 330, 85, 0.16, 0.18, sfxBus, 0.004);
        tone(t + 0.2, 'sine', 190, 115, 0.12, 0.13, sfxBus, 0.006);
        for (let i = 0; i < 3; i++) bloop(t + 0.08 + i * 0.06, 260 + i * 70, 0.06);
        wobble(t + 0.36, 'triangle', 330, 160, 0.65, 0.07, 6, 0.03);
    },
    revive(t) { wobble(t, 'sine', 190, 560, 0.35, 0.09, 14, 0.05); [67, 74, 79, 83, 86, 91].forEach((n, i) => chime(t + i * 0.05, n, 0.6, 0.075, true)); jingle(t + 0.15, 0.1, 2); glitter(t, 0.6, 0.035); },
    // a stage escaped: a quick "whee!" up the bells (a Win Pad's ding-ding lands on top of it)
    escape(t) { tone(t, 'sine', 520, 1560, 0.2, 0.05, sfxBus, 0.02); [79, 83, 86, 91].forEach((n, i) => chime(t + i * 0.045, n, 0.6, 0.07, true)); jingle(t + 0.12, 0.08); },
};
export function sfx(name, arg) {
    // (a sound asked for while the tab's away would wait, and play with all the others when it's back)
    if (ctx && ctx.state !== 'running') return;
    if (!ctx || !SFX[name] || settings.sfx <= 0) return;
    SFX[name](ctx.currentTime + 0.005, arg);
}
