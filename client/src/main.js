import { Client } from '@colyseus/sdk';
import {
    T, V3, $, canvas, scene, camera, sun, renderer, updateSky, SUN_DIRECTION, GPU_NAME, setMood, setFogScale, updateEffects, floatText, billboard, prompts,
} from './engine.js';
import { S, actions, net, prof } from './state.js';
import { CU, setEpoch, rel } from './clock.js';
import { initAudio, resumeAudio, audioAway, audioDebug, startMusic, sfx, setVolume, audioSuspended, setMusicMode, setMusicIntensity, toggleMusic, playAsmr, prerenderMusic, allowLiveMusic, musicLite } from './audio.js';
import { buildAsmr } from './asmr.js';
import * as BX from './bloxity.js';
import { createAvatar, loadBase, packAvatar } from './avatar.js';
import { pad, pollGamepad, onGamepadConnection, rumble } from './gamepad.js';
import { padNav } from './padnav.js';
import * as FX from './fx.js';
import { render, updateFx, setQuality, getQuality, autoQualityAllowed, shadowDue, setResScale, getResScale, fxWarmGroup, fxShowAll, updateAmbient, setSpeedLines, confetti, screenConfetti } from './fx.js';
import { buildHub, onJellyBed } from './world.js';
import { jellyHit, jellyPressBegin, jellyPress, jellyPressEnd } from './jelly.js';
import { buildArena } from './arenaview.js';
import { makeShade, warmShades, SHADE_FADE } from './shades.js';
import { installIcons } from './icons.js';
import * as SH from './shadows.js';
import { chipBurst, chipsWarm, chipsTick } from './bits.js';
import { beginPals, endPals, palsWarm, Team } from './pals.js';
import { Char, pumpAvatars, avatarsPending } from './chars.js';
import { Track, pingSend, onPong, pingEvery } from './smooth.js';
import {
    toast, bigText, popup, notEnough, animateCounters, bump, updateHud, openPanel, openJaw, panelIs, refreshPanels, closeTop, anyPopup, codeResult, warmPanels,
    levelUp, winPop, measureHud, onSpun, askConfirm, flyWins, stepTick, queueState, matchHud, setScores, showCount, matchResults, questDone, dashFill, stageBar, hatchShow, reviveShow, reviveHide,
} from './ui.js';
import {
    CFG, WORLDS, WALLS_N, SHOES, POSTS, postOpen, JAWBREAKERS, TASKS, QUESTS, UPGRADES, upgradeCost, stepGain, isMega, megaEveryOf, runSpeed, strideOf, jumpPowerOf, jumpH, stageNeed, stageName, gateLock, xpNeed, lvCap, rebirthCost, dailyStatus, fmt, clamp, titleOf, rebirthMult, stageV,
    matchInfo, MATCH, SPOT_COL, SPOT_CSS,
} from '../../shared/config.js';
import { newBody, stepBody } from '../../shared/physics.js';
import { W, onPad, padAt, wallZ, lockZOf, northEnd, endPortal, postSpot, postAt, BELT, jbSpot, tongueBar, upgradeShed, playGate, worldsPortal, stageAt, stagePlan, bladeAt, sliderAt, SLIDER, inPool, onIce, BLADE, checkpoint, STAGE_TYPES } from '../../shared/world.js';
import { SWEEP, sweeperAngle, BALL, ballZ, GUM, gumballsAt, JWALL, TRAMP, TILE, onPlat } from '../../shared/stages.js';
import { ARENA, arenaPlan, arenaPhysics, laneX, caneAt, laneBoxAt, LANE_BOX, surgeAt, segStart, poolAt } from '../../shared/arena.js';

const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
if (isTouch) document.body.classList.add('touch');
function storageGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function storageSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pause = () => new Promise((r) => setTimeout(r, 0));
const RND = Math.random;
// a dash and a boost together make you go at most this much faster
const BURST = 2.0;

// =====================================================================================
// The world you're in, its gates
// =====================================================================================
let view = null, A = null;
const lockBox = { z: lockZOf(0) };
const gates = { open: -1 };
const worldOpts = {
    tongues: () => openPanel('tongues'),
    shed: () => openPanel('work'),
    worlds: () => openPanel('worlds'),
    play: () => pressPlay(),
    jaw: (i) => openJaw(i),
    post: (i) => buyPost(i),
};
function buyPost(i) {
    const c = POSTS[i];
    if (!c.gems) return;
    askConfirm('👟', c.name, 'Running on it gives x' + c.mult + ' Speed a step, for good.', c.gems + ' 💎', () => net.send('post', { i }));
}
function buildView(w) {
    if (view && view.w === w) return view;
    if (view) { view.dispose(); view = null; }
    worldOpts.low = getQuality() === 'low';
    view = buildHub(w, worldOpts);
    primeShades(w);
    P.hub = view.T.make(lockBox); if (!A) P.world = P.hub;
    setMood(WORLDS[w].mood, true);
    setFogScale(1);
    view.setProgress(S, postOpen);
    view.setBoards(boards);
    if (view.stageFx) view.stageFx.setCandies(S.candies && S.candies[w]);
    gates.open = -1;
    updateGates(true);
    return view;
}
function setProgress() { if (view) view.setProgress(S, postOpen); }
// which gates your Speed opens (what the server will say a moment from now: your steps on their way count)
function updateGates(force) {
    const open = gateLock(speedNow() * 1.02 + 1, S.world || 0);
    lockBox.z = lockZOf(open);
    if (!view || (open === gates.open && !force)) return;
    const was = gates.open;
    gates.open = open;
    view.setGates(open);
    if (!force && was >= 0 && open > was && running && !A) {
        sfx('gate');
        bigText(open >= WALLS_N ? 'EVERY GATE OPEN!' : 'GATE ' + open + ' OPEN!', '#7af4ff');
        if (!lowQ) screenConfetti(30);
    }
}
// a world switch: behind the fade, built, drawn once with nothing culled (its shaders and textures on the
// graphics card before you see it)
async function drawHidden(group) {
    const culled = [];
    group.traverse((o) => { if ((o.isMesh || o.isPoints) && o.frustumCulled) { o.frustumCulled = false; culled.push(o); } });
    try { await Promise.race([renderer.compileAsync(scene, camera), sleep(1200)]); } catch (e) { /* compiles when drawn */ }
    render();
    for (const o of culled) o.frustumCulled = true;
}
async function switchWorld(w, x, z) {
    switching = true;
    holdFpsWatch(6);
    closeTop(); closeTop();
    await fadeOut();
    try { buildView(w); await drawHidden(view.group); } catch (e) { console.error('[world]', e); noteError('[world] ' + (e && e.message)); }
    for (const r of remotes.values()) r.char.setVisible(false);
    switching = false;
    teleport(x, 0, z, Math.PI);
    fadeIn();
    bigText(WORLDS[w].icon + ' ' + WORLDS[w].name.toUpperCase(), '#7af4ff');
}

// =====================================================================================
// You: the shared physics (shared/physics.js) on your screen, every frame
// =====================================================================================
const P = {
    b: newBody(W.spawn.x, 0, W.spawn.z), facing: Math.PI, moving: false, world: null, hub: null,
    jumpPress: -9, lastJump: -9, minVy: 0, auto: null, frozen: false, snaps: 0, groundY: 0, floatT: -9, sndT: -9,
    portalAt: -9, gateAt: -9, endAt: -9, stunUntil: -9, boostUntil: -9, dashUntil: -9, dashReady: 0, holdDash: false, pilotDash: false,
    tread: -1, treadK: 0, treadAcc: 0, treadLast: -1, distAcc: 0, lastX: W.spawn.x, lastZ: W.spawn.z,
    padT: new Float64Array(WALLS_N).fill(-99), down: false, downPred: -9, fellAt: -9, pace: 1, v: CFG.walk, stepK: 0,
    vx: 0, vy: 0, vz: 0,
};
const myTeam = new Team();
let me = null, localAvatarReq = 0;
function buildMe() {
    if (me) me.dispose();
    me = new Char({ name: S.name, lv: S.lv, tr: titleOf(S.cleared), labelW: 4.8 });
    if (me.setShoe) me.setShoe(S.shoe || 0);
    setupLocalAvatar();
}
async function setupLocalAvatar() {
    const req = ++localAvatarReq;
    const a = await createAvatar(BX.currentAvatar(), BX.getSkinTextureUrl());
    if (!a) return;
    if (req !== localAvatarReq || !me) { a.dispose(); return; }
    me.wear(a);
    if (me.setShoe) me.setShoe(S.shoe || 0);
}
function syncMyAvatar() {
    const av = BX.currentAvatar();
    if (me && me.blox && av) { me.blox.setProportions(av.proportions); me.blox.setEquipped(av, BX.getSkinTextureUrl()); }
    net.send('avatar', { av: packAvatar(av) });
}
function teleport(x, y, z, yaw) {
    const b = P.b;
    b.x = x; b.y = y; b.z = z; b.vx = b.vy = b.vz = 0; b.onGround = true; b.pound = false;
    camSnap = true;
    P.tread = -1; P.treadK = 0; P.passed = -1;
    P.lastX = x; P.lastZ = z; P.distAcc = 0;
    if (me && me.trail) me.trail.reset();
    if (yaw !== undefined) { P.facing = yaw; cam.yaw = yaw + Math.PI; }
    sendMove(true);
}
const goTo = (to, k) => { if (!A && !P.down) { flushSteps(); net.send('warp', { to, k }); } };
actions.respawn = () => goTo('spawn');
actions.go = goTo;

// =====================================================================================
// A step: on your screen straight away (its numbers, its sound), on its way to the server a few times a second
// =====================================================================================
const pending = [];
const out = { n: 0, post: -1, xp: 0 };
let seq = 0, outAt = 0, lowQ = false;
const speedNow = () => (S.speed || 0) + (S.pendXp || 0);
const fmtNum = (v) => (v >= 1000 ? fmt(v) : String(Math.round(v * 10) / 10));
function panOf(x, z) {
    const dx = x - camera.position.x, dz = z - camera.position.z;
    const rx = Math.cos(cam.yaw), rz = -Math.sin(cam.yaw);
    return clamp((dx * rx + dz * rz) / 40, -0.8, 0.8);
}
function flushSteps() {
    if (out.n) {
        pending.push({ s: ++seq, xp: out.xp, n: out.n });
        net.send('step', { n: out.n, post: out.post, s: seq });
        out.n = 0; out.xp = 0;
    }
    outAt = performance.now();
}
function takeStep(post) {
    const t = clockT, b = P.b;
    if ((post !== out.post) && out.n) flushSteps();
    const mega = isMega((S.steps || 0) + (S.pendN || 0), S), mk = mega ? CFG.megaK : 1;
    const gain = stepGain(S, S.x2, S.world) * (post >= 0 ? POSTS[post].mult : 1) * mk;
    out.n++; out.post = post; out.xp += gain;
    S.pendXp = (S.pendXp || 0) + gain; S.pendN = (S.pendN || 0) + 1;
    S.xp = Math.min((S.need || xpNeed(S.lv, S.rebirths)) - 0.01, (S.xp || 0) + gain);
    S.stepsShown = (S.stepsShown || 0) + 1;
    P.stepK = 1;
    stepTick();
    if (mega) megaStep(b, gain);
    else if (t - P.floatT > (lowQ ? (post >= 0 ? 0.32 : 0.6) : 0.16) && !window.__noFloat) {
        P.floatT = t;
        floatText('+' + fmtNum(gain), post >= 0 ? '#7af4ff' : '#ffffff', FX.tmpV.set(b.x + (RND() - 0.5) * 3, P.vy + 6.2 + RND() * 1.6, b.z + (RND() - 0.5) * 2.4), 3.2, false, 'speed');
    }
    if (out.n >= 12) flushSteps();
}
function megaStep(b, gain) {
    playAsmr('mega', 0.6, 1);
    rumble(0.45, 120);
    shake = Math.max(shake, 0.3); fovKick = 3;
    if (!window.__noFloat) floatText('MEGA SQUISH! +' + fmtNum(gain), '#ffe24a', FX.tmpV.set(b.x, P.vy + 7.4, b.z), 5, true, 'speed');
    FX.ring(FX.tmpV.set(b.x, b.y + 0.3, b.z), 0x7af4ff, 12, 0.5);
    if (me) me.stretch(0.6);
    if (!lowQ) screenConfetti(12);
    S.megas = (S.megas || 0) + 1;
}
// DASH: a burst of speed (on a treadmill: hold it to sprint)
function dash() {
    const t = clockT;
    if (P.frozen) return;
    if (P.tread >= 0) { P.sprintAt = t; return; }
    if (t < P.dashReady || (A && A.phase !== 'play')) return;
    P.dashUntil = t + CFG.dashSecs; P.dashReady = t + CFG.dashCool;
    fovKick = Math.max(fovKick, 5);
    playAsmr('whoosh', 0.5, 1.1 + RND() * 0.1);
    rumble(0.3, 80);
    if (me) me.stretch(0.4);
    FX.ring(FX.tmpV.set(P.b.x, P.b.y + 0.4, P.b.z), 0x7af4ff, 7, 0.35);
}
actions.dash = dash;
const padReady = (k) => clockT - P.padT[k] >= CFG.padCool;

// ----- moving -----
// (the same objects every frame: read straight away, never kept)
const meSt = { x: 0, y: 0, z: 0, ry: 0, snapRy: true, air: false, moving: false, speed: 0, vy: 0, jump: false, airJump: false, pose: null, lick: 0, tilt: 0, sprint: false };
const remSt = { x: 0, y: 0, z: 0, ry: 0, air: false, moving: false, speed: 0, vy: 0, far: false, pose: null, lick: 0, sprint: false };
let teamRef = null, teamStr = '';
function updateMe(dt) {
    const t = clockT, b = P.b;
    let f = 0, r = 0;
    if (keys.KeyW || keys.ArrowUp) f += 1;
    if (keys.KeyS || keys.ArrowDown) f -= 1;
    if (keys.KeyD || keys.ArrowRight) r += 1;
    if (keys.KeyA || keys.ArrowLeft) r -= 1;
    f -= touchMove.y + pad.ly; r += touchMove.x + pad.lx;
    // the camera's stick: slow near the middle for aiming, quick at the edge
    if (pad.rx || pad.ry) {
        if (!anyPopup()) { cam.yaw -= pad.rx * Math.abs(pad.rx) * 3.2 * dt * camSens; cam.pitch = clamp(cam.pitch + pad.ry * Math.abs(pad.ry) * 2 * dt * camSens, -0.5, 1.3); }
    }
    const fx = -Math.sin(cam.yaw), fz = -Math.cos(cam.yaw), rx = Math.cos(cam.yaw), rz = -Math.sin(cam.yaw);
    let mx = fx * f + rx * r, mz = fz * f + rz * r;
    const l = Math.hypot(mx, mz);
    if (l > 1) { mx /= l; mz /= l; }
    let hold = !!(keys.Space || touchJump || (pad.held.has('A') && !padNav.hud));
    let pressed = t - P.jumpPress < 0.15;
    // the QA autopilot drives instead
    P.pilotDash = false;
    if (P.auto) { const a = pilot(dt); mx = a.mx; mz = a.mz; hold = a.hold; pressed = a.jump; }
    const outRace = A && A.out;
    P.frozen = anyPopup() || switching || (A && A.phase === 'wait') || t < P.stunUntil || P.down || t - P.downPred < 1.4 || outRace || (A && A.done);
    if (P.frozen) { mx = 0; mz = 0; pressed = false; hold = false; }
    P.moving = mx * mx + mz * mz > 0.01;
    if (P.moving) { b.lastMx = mx; b.lastMz = mz; }
    // steering or jumping steps off the treadmill
    if (P.tread >= 0 && (P.moving || pressed)) { P.tread = -1; P.treadAcc = 0; }
    // holding JUMP keeps jumping
    if (hold && b.onGround && !pressed && t - P.lastJump > 0.12) pressed = true;
    const dashing = t < P.dashUntil, boosted = t < P.boostUntil;
    // the stage you're in (its kind changes how you move): on ice you slide where you were going
    const kIce = !A && b.z < W.plaza.z0 ? stageAt(b.z) : -1, icy = kIce >= 0 && kIce < WALLS_N && b.onGround && onIce(S.world || 0, kIce, b.x, b.z);
    const base = A ? MATCH.v * (A.power || 1) * (boosted ? MATCH.boostK : 1) : runSpeed(S, speedNow(), S.world) * P.pace * (boosted ? 1.45 : 1);
    P.v = Math.min(base * (dashing ? CFG.dashK : 1), (A ? MATCH.v * MATCH.boostK : runSpeed(S, speedNow(), S.world)) * BURST);
    if (kIce >= 0 && kIce < WALLS_N && stagePlan(S.world || 0, kIce).type === 'stones') P.v = Math.min(P.v, stageV(kIce) * 1.15 + 6);
    const inp = { mx, mz, jump: pressed, hold, power: jumpPowerOf(S), double: false, speed: P.v / CFG.walk, grip: icy ? 0.09 : 1 };
    if (!b.onGround) P.minVy = Math.min(P.minVy, b.vy);
    const px = b.x, pz = b.z;
    // your body moves in real time down to 10 frames a second (a slow frame is two steps): the frame clock stops at 20, and
    // below that a weak device would run in slow motion while the Wobblers, on the server's clock, don't
    const dtB = Math.max(dt, Math.min(0.1, frameDt));
    let ev = stepBody(b, inp, dtB > 0.05 ? dtB / 2 : dtB, P.world);
    if (dtB > 0.05) { const ev2 = stepBody(b, inp.jump ? { ...inp, jump: false } : inp, dtB / 2, P.world); if (!ev) ev = ev2; }
    if (!A && b.onGround && b.ground && b.ground.tramp) {
        b.vy = TRAMP.bounce; b.onGround = false; b.ground = null; b.rising = false;
        const kt = stageAt(b.z), pl = kt >= 0 && kt < WALLS_N ? stagePlan(S.world || 0, kt) : null;
        if (pl) {
            let next = null;
            for (const p of pl.plats) if (p.kind === 'tramp' && p.z < b.z - 4 && (!next || p.z > next.z)) next = p;
            const lake = pl.lakes[0], tx = next ? next.x : b.x * 0.5, tz = next ? next.z : (lake ? lake.z0 - 5 : b.z - 30), T2 = 2 * TRAMP.bounce / CFG.grav;
            b.vx = (tx - b.x) / T2; b.vz = (tz - b.z) / T2; b.dashT = T2 - 0.05;
        }
        if (me) me.stretch(1);
        jellyHit(b.x, b.z, 2.6);
        playAsmr('jump', 0.55, 0.7 + RND() * 0.1);
        fovKick = Math.max(fovKick, 3); shake = Math.max(shake, 0.15);
        if (!lowQ) FX.ring(FX.tmpV.set(b.x, b.y + 0.2, b.z), 0xffffff, 7, 0.35);
    }
    if (ev === 1 || ev === 2) {
        // that press is used up: one press, one jump
        P.jumpPress = -9; P.lastJump = t;
        me.stretch(0.6);
        playAsmr('jump', 0.3, 1.05 + RND() * 0.1);
        P.minVy = 0;
        fovKick = Math.max(fovKick, 2.2);
    } else if (ev === 3 || ev === 4) {
        const k = clamp(-P.minVy / 60, 0.3, 1.4);
        me.squash(k);
        jellyHit(b.x, b.z, 0.9 + k * 1.1);
        playAsmr('land', 0.5, 0.9);
        if (!lowQ && k > 0.6) FX.dust(FX.tmpV.set(b.x, b.y + 0.2, b.z), 6, 0.6);
        P.minVy = 0;
    }
    if (P.moving) P.facing = lerpA(P.facing, Math.atan2(mx, mz), 1 - Math.exp(-dt * 14));
    // steps on the ground: a stride at a time (longer the faster you go)
    const moved = Math.hypot(b.x - px, b.z - pz);
    if (b.onGround && P.moving && !A && moved < 6) {
        P.distAcc += moved;
        const st = strideOf(P.v);
        const onJ = b.z < W.plaza.z0 || onJellyBed(b.x, b.z);
        while (P.distAcc >= st) {
            P.distAcc -= st; takeStep(-1);
            if (!window.__noStepSound && t - P.sndT > (lowQ ? 0.16 : 0.07)) { P.sndT = t; playAsmr(onJ ? 'step' : 'crunch', onJ ? 0.42 : 0.34, 0.95 + RND() * 0.2); }
            // a step on the jelly flicks up a drop of it behind your heel
            if (!lowQ && onJ && b.z < W.plaza.z0) { const c = WORLDS[S.world || 0].jelly; FX.splash(FX.tmpV.set(b.x + (RND() - 0.5) * 0.7, b.y, b.z + 0.4), c[(RND() * 3) | 0], P.v > 30 ? 2 : 1, 0.35); }
        }
    }
    // the jelly under you: a ripple every couple of studs you run (a squish in a race, where steps aren't counted)
    if (b.onGround && P.moving && moved < 6) {
        P.jellyAcc = (P.jellyAcc || 0) + moved;
        if (P.jellyAcc > 2.4) {
            P.jellyAcc = 0;
            jellyHit(b.x + (RND() - 0.5) * 0.8, b.z, 0.85);
            if (A && !window.__noStepSound && t - P.sndT > (lowQ ? 0.2 : 0.11)) { P.sndT = t; playAsmr('step', 0.36, 0.95 + RND() * 0.2); }
        }
    }
    // on a treadmill: your legs go by themselves (faster while you hold DASH); every step x the belt
    if (!A) {
        const i = postAt(b.x, b.z);
        if (P.tread < 0 && i >= 0 && !P.moving && b.onGround && t - (P.treadOff || -9) > 0.3) {
            if (postOpen(S, i)) { P.tread = i; P.treadAcc = 0; P.facing = Math.PI; playAsmr('belt', 0.35, 1); }
            else if (t - (P.lockT || -9) > 3) { P.lockT = t; const c = POSTS[i]; toast('🔒 ' + c.name + (c.gems ? ': open it with ' + c.gems + ' Gems' : ' opens at ' + c.reb + (c.reb > 1 ? ' rebirths' : ' rebirth')), '#ff9a8a'); }
        }
        if (P.tread >= 0 && i !== P.tread) { P.tread = -1; P.treadOff = t; }
        if (P.tread >= 0) {
            const sprint = P.holdDash || P.pilotDash || keys.ShiftLeft || keys.ShiftRight || keys.KeyF || keys.Enter || pad.held.has('X') || pad.held.has('RT') || t - (P.sprintAt || -9) < 0.35;
            P.treadAcc += dt * (sprint ? CFG.treadSprint : CFG.treadRate);
            P.sprinting = sprint;
            while (P.treadAcc >= 1) { P.treadAcc -= 1; takeStep(P.tread); if (t - P.sndT > 0.1) { P.sndT = t; playAsmr('step', 0.3, 1.05 + RND() * 0.15); } }
        }
    }
    if (!A) hubTouch(t, dt); else raceTouch(t, dt);
    if (b.y < -40) { if (A) teleport(laneX(A.spot), 0, b.z + 2, Math.PI); else goTo('spawn'); }
    if (b.onGround) P.groundY = b.y;
    S.inGauntlet = !A && b.z < W.plaza.z0;
    // where you're drawn: on the ground, or centred on the belt running in place
    P.treadK += ((P.tread >= 0 ? 1 : 0) - P.treadK) * Math.min(1, dt * 10);
    let dx = b.x, dy = b.y, dz = b.z, ry = P.facing;
    if (P.treadK > 0.002 && (P.tread >= 0 || P.treadLast >= 0)) {
        const i = P.tread >= 0 ? P.tread : P.treadLast, s = postSpot(i), e = P.treadK;
        dx += (s.x - dx) * e; dz += (s.z + 1 - dz) * e; dy += (0.55 - dy) * e;
        ry = lerpA(ry, Math.PI, e);
    }
    if (P.tread >= 0) P.treadLast = P.tread;
    P.vx = dx; P.vy = dy; P.vz = dz;
    P.stepK = Math.max(0, P.stepK - dt * 6);
    const onTread = P.treadK > 0.5;
    if (me) {
        const q = meSt; q.x = dx; q.y = dy; q.z = dz; q.ry = ry; q.air = !b.onGround && !onTread; q.moving = (P.moving && b.onGround) || onTread;
        q.speed = onTread ? (P.sprinting ? 34 : 20) : Math.hypot(b.vx, b.vz); q.vy = b.vy; q.jump = ev === 1; q.airJump = ev === 2; q.pose = P.down || (A && A.out) ? 'down' : null; q.lick = 0; q.tilt = 0; q.sprint = dashing || q.speed > 30;
        me.update(dt, t, q);
    }
    // your Familiars
    if (!A) { if (S.team !== teamRef) { teamRef = S.team; teamStr = (S.team || []).join(','); } myTeam.set(teamStr); myTeam.update(dt, t, b.x, b.y, b.z, ry, onTread || (P.moving && b.onGround)); }
    sendMove(false);
}
const lerpA = (a, b2, k) => { let d = (b2 - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return a + d * k; };
function updateSteps() {
    // what's gone to the server: a few times a second
    if (performance.now() - outAt > 120 && out.n) flushSteps();
    // the DASH button fills back up after a dash; on a treadmill it's always ready to sprint
    const t = clockT;
    dashFill(P.tread >= 0 ? 1 : clamp(1 - (P.dashReady - t) / CFG.dashCool, 0, 1), P.tread >= 0);
    const holding = P.holdDash || keys.ShiftLeft || keys.ShiftRight || keys.KeyF || keys.Enter || pad.held.has('X') || pad.held.has('RT') || P.pilotDash;
    if (holding && P.tread < 0 && t >= P.dashReady && P.moving) dash();
}
// ----- what you're standing on: a Win Pad, a boost, a pool, a blade, the portal, the gate -----
function hubTouch(t) {
    const b = P.b;
    if (!view || switching || P.down) return;
    if (b.z < W.plaza.z0) {
        const k = stageAt(b.z), w = S.world || 0;
        if (k >= 0 && k < WALLS_N) {
            // the Win Pad at this stage's end
            if ((b.onGround || b.y < jumpH(jumpPowerOf(S)) + 1.5) && onPad(k, b.x, b.z) && padReady(k)) { P.padT[k] = t; flushSteps(); sendMove(true); net.send('pad', { k }); }
            const nowS = net.now() / 1000;
            for (const o of stagePlan(w, k).list) {
                if (o.kind === 'boost') { if (b.onGround && Math.abs(b.x - o.x) < o.hw && Math.abs(b.z - o.z) < o.hd && t > P.boostUntil - 1.2) { P.boostUntil = t + 1.5; playAsmr('boost', 0.5, 1); fovKick = Math.max(fovKick, 4); if (!lowQ) FX.ring(FX.tmpV.set(b.x, b.y + 0.3, b.z), 0x7dff6b, 8, 0.3); } }
                else if (o.kind === 'blade' && t > P.stunUntil + 0.6 && Math.abs(b.z - o.z) < BLADE.depth + 0.6 && b.y < 6) {
                    // the axe's head is low only through the middle of its swing (it hangs from high up)
                    const bv = bladeAt(o, nowS), bx = bv * (W.halfW - 3);
                    if (Math.abs(bv) < 0.75 && Math.abs(b.x - bx) < 3.2) knock(b, 'BONK!');
                }
                else if (o.kind === 'slider' && t > P.stunUntil + 0.6 && Math.abs(b.z - o.z) < SLIDER.d / 2 + 0.7 && b.y < SLIDER.h - 0.6) {
                    if (Math.abs(b.x - sliderAt(o, nowS)) < SLIDER.w / 2 + 0.7) knock(b, 'WHUMP!');
                }
            }
            stageTouch(t, k, w, b, nowS);
            // syrup (a pool, a lake under the platforms or the bridge): back to the start of the stage
            if (b.onGround && b.y < 0.45 && t - P.fellAt > 1 && inPool(w, k, b.x, b.z) && !onTile(k, b.x, b.z, t)) fell(k);
        }
        // the far end: on to the next world
        if (gates.open >= WALLS_N && Math.abs(b.z - endPortal.z) < 2 && Math.abs(b.x - endPortal.x) < endPortal.r) { if (t - P.endAt > 3 && !anyPopup()) { sfx('whoosh'); openPanel('worlds'); } P.endAt = t; }
    } else {
        // walking through the portal's arch, or the gate's
        if (Math.abs(b.x - worldsPortal.x) < 7 && Math.abs(b.z - worldsPortal.z) < 1.6) { if (t - P.portalAt > 3 && !anyPopup()) { sfx('whoosh'); openPanel('worlds'); } P.portalAt = t; }
        if (Math.abs(b.x - playGate.x) < 7 && Math.abs(b.z - playGate.z) < 1.6) { if (t - P.gateAt > 3 && !S.queued && !anyPopup()) { sfx('whoosh'); pressPlay(); } P.gateAt = t; }
    }
}
// a crumbling cookie tile under you (standing on one cracks it)
function onTile(k, x, z, t) {
    const fx = view && view.stageFx;
    if (!fx) return false;
    for (const ti of fx.tiles) if (ti.k === k && Math.abs(ti.x - x) < TILE.s / 2 + 0.6 && Math.abs(ti.z - z) < TILE.s / 2 + 0.6 && fx.tileSolid(ti, t)) return true;
    return false;
}
const gumSeen = new Set(), gumList = [];
let stageTipK = -1;
const tipsShown = new Set();
// the stages' own challenges: sweepers, snowballs, gumballs, jelly walls, cookie tiles, golden candies
function stageTouch(t, k, w, b, nowS) {
    const plan = stagePlan(w, k), fx = view.stageFx, free = t > P.stunUntil + 0.6;
    // a new kind of stage: what to do in it (once a session each)
    if (stageTipK !== k) { stageTipK = k; const T2 = STAGE_TYPES[plan.type]; if (T2 && !tipsShown.has(plan.type) && b.z < wallZ(k) - 2) { tipsShown.add(plan.type); toast('🎯 ' + T2.title + ': ' + T2.tip, '#ffe24a'); } }
    for (const o of plan.list) {
        if (o.kind === 'sweeper') {
            if (!free || b.y > SWEEP.y + SWEEP.t / 2 + 0.2 || Math.abs(b.z - o.z) > SWEEP.r + 2) continue;
            for (let j = 0; j < o.bars; j++) {
                const a = sweeperAngle(o, nowS) + j * Math.PI / 2, dx = b.x - o.x, dz = b.z - o.z;
                const along = dx * Math.cos(a) - dz * Math.sin(a), perp = dx * Math.sin(a) + dz * Math.cos(a);
                if (Math.abs(along) < SWEEP.r + 0.8 && Math.abs(perp) < SWEEP.t / 2 + 1) { knock(b, 'WHACK!'); break; }
            }
        } else if (o.kind === 'boulders') {
            if (!free || b.z < o.z0 - 14 || b.z > o.z1 + 14) continue;
            for (let i = 0; i < o.lanes.length; i++) {
                const z = ballZ(o, i, nowS);
                if (z < o.z0 - 2 || z > o.z1 + 2) continue;
                if (Math.abs(b.x - o.lanes[i]) < BALL.r + 0.9 && Math.abs(b.z - z) < BALL.r + 0.9 && b.y < BALL.r * 2 - 0.5) { knock(b, 'SPLAT!'); shake = Math.max(shake, 0.6); break; }
            }
        } else if (o.kind === 'gumballs') {
            if (b.z < o.z0 - 8 || b.z > o.z1 + 8) continue;
            gumballsAt(o, nowS, gumList);
            for (const d of gumList) {
                const land = d.t0 + GUM.warn + GUM.fall;
                if (nowS < land || nowS > land + 0.2 || gumSeen.has(d.s)) continue;
                gumSeen.add(d.s); if (gumSeen.size > 64) gumSeen.clear();
                const dd = Math.hypot(b.x - d.x, b.z - d.z);
                if (dd < 12) { shake = Math.max(shake, 0.25 * (1 - dd / 12)); playAsmr('land', 0.35 * (1 - dd / 12), 0.7, panOf(d.x, d.z)); }
                if (free && dd < GUM.hit && b.y < 4.5) knock(b, 'BONK!');
            }
        } else if (o.kind === 'jwall') {
            if (Math.abs(b.z - o.z) > JWALL.d / 2 + 1.1 || !fx) continue;
            const wl = fx.walls.find((x) => x.k === k && x.i === o.i);
            if (!wl || !fx.wallUp(wl, t)) continue;
            if (t < P.dashUntil || t < P.boostUntil - 0.6) {
                // dashing into it: SPLAT, through, and your DASH is ready again at once (chain them: one DASH a wall)
                fx.burst(wl, t);
                P.dashReady = Math.min(P.dashReady, t + 0.15);
                playAsmr('mega', 0.6, 1.1); playAsmr('splash', 0.5, 1.2);
                shake = Math.max(shake, 0.4); rumble(0.5, 140);
                if (!window.__noFloat) floatText('SPLAT!', '#ff9ad8', FX.tmpV.set(b.x, b.y + 7, b.z), 5, true);
            } else {
                // walking into it: it wobbles and bounces you back (and never lets you through without a DASH)
                const side = b.z >= o.z ? 1 : -1, face = o.z + side * (JWALL.d / 2 + 1.3);
                if (t - (P.wallBonk || -9) > 0.5) {
                    P.wallBonk = t; fx.bonk(wl, t);
                    b.z = face; b.vz = 20 * side; b.vy = 12; b.onGround = false;
                    playAsmr('jump', 0.5, 0.8);
                    if (me) me.squash(0.8);
                    if (!window.__noFloat) floatText(isTouch ? 'DASH THROUGH!' : 'SHIFT TO DASH!', '#ffe24a', FX.tmpV.set(b.x, b.y + 7, b.z), 4, true);
                } else { b.z = face; if (b.vz * side < 0) b.vz = 0; }
            }
        } else if (o.kind === 'crumble') {
            if (!fx || !b.onGround || b.y > 0.5) continue;
            for (const ti of fx.tiles) if (ti.k === k && ti.state === 0 && Math.abs(ti.x - b.x) < TILE.s / 2 + 0.3 && Math.abs(ti.z - b.z) < TILE.s / 2 + 0.3) { fx.touch(ti, t); playAsmr('crunch', 0.25, 0.8 + RND() * 0.3); }
        }
    }
    // a golden candy: catch it
    if (fx) for (const c of fx.candies) {
        if (c.got || c.k !== k || Math.abs(b.z - c.z) > 3.2 || Math.abs(b.x - c.x) > 3.2 || b.y + 2.5 < c.y - 3 || b.y > c.y + 2) continue;
        fx.take(c);
        net.send('candy', { k, i: c.i });
        sfx('gem');
        rumble(0.3, 60);
        if (!lowQ) FX.ring(FX.tmpV.set(c.x, c.y, c.z), 0xffd23a, 6, 0.4);
        if (!window.__noFloat) floatText('🍬 GOLDEN CANDY!', '#ffd23a', FX.tmpV.set(c.x, c.y + 3, c.z), 5, true);
    }
}
function knock(b, word) {
    P.stunUntil = clockT + 0.7;
    rumble(0.7, 180);
    b.z += 5; b.vz = 18; b.vy = 18; b.onGround = false;
    playAsmr('bonk', 0.7, 1);
    shake = Math.max(shake, 0.5);
    if (me) me.squash(1);
    if (!window.__noFloat) floatText(word, '#ff9a8a', FX.tmpV.set(b.x, b.y + 8, b.z), 5, true);
    if (A) net.send('mHit', {});
}
function fell(k) {
    const b = P.b;
    P.fellAt = clockT;
    playAsmr('splash', 0.6, 0.9);
    rumble(0.6, 160);
    FX.splash(FX.tmpV.set(b.x, b.y + 0.4, b.z), WORLDS[S.world || 0].hazard2, lowQ ? 8 : 16, 1);
    bigText('STUCK IN SYRUP! BACK TO THE GATE', '#ff9a8a');
    P.downPred = clockT - 0.6;
    flushSteps(); sendMove(true);
    net.send('fell', { k });
}

// ----- the Shades: yours and everyone else's near, worked out from four numbers on the server's clock -----
const shades = [];
function shadeFor(kind, boss) {
    let s = shades.find((x) => !x.used && x.kind === kind && x.boss === boss);
    if (!s) {
        s = { kind, boss, used: false, obj: makeShade(kind, boss), x: 0 };
        // its landings ripple the jelly (when it can say so; otherwise a ripple now and then while it's down)
        s.hooked = 'onLand' in s.obj;
        if (s.hooked) s.obj.onLand = (x, z, a) => { if (s.used) jellyHit(x, z, (1.2 + (a || 1)) * (boss ? 1.8 : 1)); };
        shades.push(s);
    }
    s.used = true;
    return s;
}
// this Rift's Shades made ahead (behind the loading screen or a world switch's fade): yours, a few of others', the boss. Never built mid-run
function primeShades(w) {
    const kind = WORLDS[w].shade, got = [];
    for (const s of shades) s.used = false;
    for (const b of [false, false, false, false, true]) got.push(shadeFor(kind, b));
    for (const s of got) { s.used = false; s.obj.setVisible(false); }
}
function shadePos(shZ, shV, shAt, nowMs) { return shZ - shV * Math.max(0, (nowMs - shAt) / 1000); }
function drawShade(slot, pl, px, pz, dt, t, nowMs) {
    const w = S.world || 0, k = pl.shK, boss = k === WALLS_N - 1, s = shadeFor(WORLDS[w].shade, boss);
    const z = shadePos(pl.shZ, pl.shV, pl.shAt, nowMs), rising = nowMs < pl.shAt;
    s.x += (clamp(px, -W.halfW + 3, W.halfW - 3) - s.x) * Math.min(1, dt * 3);
    // (it plops down from the sky behind you: falling faster and faster, a splat when it lands)
    const u = 1 - clamp((pl.shAt - nowMs) / (CFG.shadeDelay * 1000), 0, 1), y = rising ? 18 * (1 - u * u) : 0;
    s.obj.setVisible(true);
    s.obj.update(dt, t, s.x, y, rising ? pl.shZ : Math.max(pz + 1.2, z), Math.PI, rising ? 0 : clamp(pl.shV / 40, 0.4, 1));
    return z;
}
const myShade = { shK: 255, shZ: 0, shV: 0, shAt: 0 };
let shadeRoarK = -1;
function updateShades(dt, t) {
    for (const s of shades) s.used = false;
    const nowMs = net.now(), room = net.room;
    let mine = null;
    if (!A && room && room.state && room.state.players) {
        const p = room.state.players.get(room.sessionId);
        if (p && p.shK !== 255 && !P.down) mine = p;
    }
    let near = null;
    if (mine) {
        const z = drawShade(0, mine, P.b.x, P.b.z, dt, t, nowMs), gap = P.b.z - z;
        near = { k: mine.shK, gap: Math.max(0, z - P.b.z) };
        if (shadeRoarK !== mine.shK) { shadeRoarK = mine.shK; sfx('roar'); toast('🍬 The ' + (mine.shK === WALLS_N - 1 ? WORLDS[S.world || 0].bossName : WORLDS[S.world || 0].shadeName) + ' plops down behind you! RUN!', '#ff9ad8'); }
        // it's on you: your screen sees it a moment before the server says so
        if (nowMs > mine.shAt && gap >= -1 && t - P.downPred > 2) { P.downPred = t; flushSteps(); sendMove(true); }
    } else shadeRoarK = -1;
    // everyone else's in this world, near you (fewer on Low)
    let others = 0;
    if (!A) for (const r of remotes.values()) {
        const p = r.p;
        if (!p || p.shK === 255 || !r.here || others >= (lowQ ? 1 : 3) || r.x === undefined || Math.abs(r.z - P.b.z) > 160) continue;
        drawShade(1, p, r.x, r.z, dt, t, nowMs);
        others++;
    }
    for (const s of shades) if (!s.used) s.obj.setVisible(false);
    return near;
}

// ----- the guide: chevrons on the ground, flowing from you to what to do next -----
const GUIDE_N = 12;
let guide = null, guideOn = false;
const guideM = new T.Matrix4(), guideQ = new T.Quaternion(), guideV = new V3(), guideS = new V3(1, 1, 1), guideUp = new V3(0, 1, 0);
function guideMesh() {
    const s = new T.Shape();
    s.moveTo(-2.2, -1); s.lineTo(0, 0.8); s.lineTo(2.2, -1); s.lineTo(2.2, 0.2); s.lineTo(0, 2); s.lineTo(-2.2, 0.2); s.closePath();
    const g = new T.ShapeGeometry(s).rotateX(-Math.PI / 2);
    const m = new T.InstancedMesh(g, new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.72, depthWrite: false }), GUIDE_N);
    m.frustumCulled = false; m.renderOrder = 2; m.count = 0;
    scene.add(m);
    return m;
}
function bestPost() {
    let best = 0;
    for (let i = 0; i < POSTS.length; i++) if (postOpen(S, i) && POSTS[i].mult >= POSTS[best].mult) best = i;
    return best;
}
// the furthest stage you've been to whose gate your Speed opens (where TO STAGE goes)
const frontier = () => Math.max(0, Math.min(WALLS_N - 1, (S.bests && S.bests[S.world || 0]) || 0, gates.open - 1));
// what's next, in order: a Win Pad ready ahead, the next gate if it's open, or training
function needTraining() {
    const best = (S.bests && S.bests[S.world || 0]) || 0;
    if (best >= WALLS_N) return false;
    // the gate after the furthest you've reached is shut: train for it
    return gates.open <= best + 1 && gates.open < WALLS_N && best >= 1;
}
function guideTarget() {
    const g = guideGoal(), b = P.b;
    if ((b.z > 54) !== (g.z > 54)) {
        if (b.z > 54) { if (Math.abs(b.x) > 13) return { x: 0, z: 56 }; } else if (b.z >= W.plaza.z0 - 6) return { x: clamp(b.x, -9, 9), z: 56 };
    }
    return g;
}
function guideGoal() {
    const b = P.b, Q = QUESTS[S.qi], next = SHOES[(S.shoe || 0) + 1];
    if (b.z < W.plaza.z0) {
        // in the Rift: on to this stage's Win Pad; past it, through the next gate if it's open, else home to train
        // (the way in, before the first gate, counts as the first stage)
        const k = Math.max(0, stageAt(b.z));
        if (k >= 0 && k < WALLS_N) {
            const pd = padAt(k);
            // (past its pad once, it stays passed: a step back doesn't send you to it again)
            if (b.z <= pd.z + W.padR) P.passed = k;
            if (P.passed !== k) return { x: 0, z: pd.z };
            if (k + 1 < WALLS_N && gates.open > k + 1) return { x: 0, z: wallZ(k + 1) - 12 };
            if (k + 1 >= WALLS_N) return { x: 0, z: endPortal.z };
        }
        return { x: 0, z: W.plaza.z0 + 8 };
    }
    if (Q && Q.kind === 'matches') return { x: playGate.x, z: playGate.z + 6 };
    if (Q && Q.kind === 'upgrades' && UPGRADES.some((u) => S.wins >= upgradeCost(u, (S.ups && S.ups[u.id]) || 0))) return { x: upgradeShed.x, z: upgradeShed.z + 8 };
    if (Q && Q.kind === 'hatch' && S.wins >= JAWBREAKERS[0].wins) { const s = jbSpot(0); return { x: s.x, z: s.z + 5 }; }
    if (next && S.wins >= next.wins && (S.speed || 0) > 3) return { x: tongueBar.x, z: tongueBar.z + 9 };
    if (needTraining() || (S.speed || 0) < 12) { const s = postSpot(bestPost()); return { x: s.x, z: s.z + 1 }; }
    return { x: 0, z: wallZ(0) + 8 };
}
function updateGuide(t) {
    if (!guide) guide = guideMesh();
    const b = P.b;
    const on = !A && !switching && !anyPopup() && P.tread < 0 && !P.down && (S.steps || 0) < 6000;
    const g = on ? guideTarget() : null;
    if (!g) { if (guideOn) { guideOn = false; guide.count = 0; guide.visible = false; } return; }
    const dx = g.x - b.x, dz = g.z - b.z, d = Math.hypot(dx, dz);
    if (d < 7) { guide.count = 0; guide.visible = false; guideOn = false; return; }
    guideOn = true; guide.visible = true;
    const ux = dx / d, uz = dz / d, gap = 6, off = (t * 11) % gap, y = (b.onGround ? b.y : P.groundY) + 0.42;
    guideQ.setFromAxisAngle(guideUp, Math.atan2(ux, uz) + Math.PI);
    let n = 0;
    for (let i = 0; i < GUIDE_N; i++) {
        const s = 3 + i * gap + off;
        if (s > d - 2) break;
        const fade = Math.min(1, (d - 2 - s) / 3) * Math.min(1, (s - 1) / 2);
        guide.setMatrixAt(n++, guideM.compose(guideV.set(b.x + ux * s, y, b.z + uz * s), guideQ, guideS.setScalar(Math.max(0.05, fade))));
    }
    guide.count = n;
    guide.instanceMatrix.needsUpdate = true;
}
// the stage you're in, at the top of the screen: how far to its Win Pad, how close its Shade is, the gate if it's shut
let stageNameK = -1, stageNameS = '';
function stageHud(near) {
    const b = P.b;
    if (A || b.z > W.plaza.z0 + 2) { stageBar(false); return; }
    const k = stageAt(b.z), w = S.world || 0;
    if (k < 0 || k >= WALLS_N) { stageBar(false); return; }
    const z0 = wallZ(k), pz = padAt(k).z, f = clamp((z0 - b.z) / (z0 - pz), 0, 1);
    let txt;
    // (how far behind: to the stud when it's close, in fives further off; every new number is the page laid out and painted again)
    if (near && near.k === k) txt = near.gap < 2 ? 'IT\'S ON YOU!' : (k === WALLS_N - 1 ? WORLDS[w].bossName : WORLDS[w].shadeName).toUpperCase() + ' · ' + (near.gap < 20 ? Math.round(near.gap) : Math.round(near.gap / 5) * 5) + ' studs behind';
    else if (b.z <= pz + W.padR) txt = k + 1 < WALLS_N ? (gates.open > k + 1 ? 'NEXT GATE OPEN: RUN ON!' : 'NEXT GATE: ' + fmt(stageNeed(w, k + 1)) + ' SPEED') : 'THE END: THROUGH THE ARCH!';
    else txt = 'to the Win Pad';
    // (the golden candies you've found in this stage)
    const cb = (S.candies && S.candies[w] && S.candies[w][k]) | 0, cn = (cb & 1) + ((cb >> 1) & 1) + ((cb >> 2) & 1), nk = w * 1000 + k * 10 + cn;
    if (nk !== stageNameK) { stageNameK = nk; stageNameS = 'STAGE ' + (k + 1) + ' · ' + stageName(w, k) + ' · 🍬' + cn + '/3'; }
    stageBar(true, stageNameS, f, txt, !!(near && near.k === k && near.gap < 12));
}

// =====================================================================================
// Rift Rush: the queue, the start line, your race
// =====================================================================================
let qaMap = null;
function pressPlay() {
    if (A || switching || P.down) return;
    if (S.queued) { net.send('unplay', {}); return; }
    sfx('queue');
    flushSteps();
    net.send('play', qaMap || {});
}
actions.pressPlay = pressPlay;
let enteringMatch = false;
async function enterMatch(m) {
    enteringMatch = true;
    switching = true;
    holdFpsWatch(6);
    closeTop(); closeTop();
    reviveHide();
    S.queued = false; queueState(null);
    flushSteps();
    await fadeOut();
    if (A) leaveMatchView();
    const plan = arenaPlan(m.seed, m.lv);
    A = { id: m.id, seed: m.seed, lv: m.lv, w: m.w, plan, spot: m.spot, power: m.power, phase: 'wait', goAt: m.goAt, endsAt: 0, scores: [], names: m.names || [], found: m.found, D: matchInfo(m.lv), done: false, sent: false, out: false, items: {}, countShown: -1 };
    S.matchId = m.id;
    P.tread = -1; P.boostUntil = -9; P.stunUntil = -9; P.down = false;
    if (view) view.group.visible = false;
    try {
        A.view = buildArena(plan, m.w, SPOT_COL, getQuality() === 'low', m.spot);
        P.world = arenaPhysics(m.spot, plan);
        setMood(WORLDS[m.w].mood, true);
        setFogScale(1);
        for (const r of remotes.values()) r.char.setVisible(false);
        await drawHidden(A.view.group);
        const t0 = performance.now();
        while (avatarsPending() && performance.now() - t0 < 1500) await sleep(30);
    } catch (e) { console.error('[race]', e); noteError('[race] ' + (e && e.message)); }
    switching = false; enteringMatch = false;
    teleport(m.x, 0, m.z, m.ry);
    fadeIn();
    document.body.classList.add('inmatch');
    matchHud({ on: true, names: A.names, spot: A.spot, lv: A.lv, map: WORLDS[A.w].name });
    setScores(A);
    setMusicMode('climb');
    A.music = 0; setMusicIntensity(0);
    if (pendingSync && pendingSync.start.id === A.id) applySync(pendingSync);
    pendingSync = null;
}
// back from a dropped connection into a race: the clock, who's where, as they are now
let pendingSync = null;
function applySync(m) {
    if (m.phase === 'play') { A.phase = 'play'; A.endsAt = m.endAt; showCount(null); } else if (m.phase === 'done') A.phase = 'done';
    A.scores = m.lanes || [];
    const mine = A.scores.find((r) => r[0] === A.spot);
    if (mine && mine[3]) A.out = true;
    for (const i of m.items || []) A.items[i] = 1;
    setScores(A);
}
function leaveMatchView() {
    if (A && A.view) A.view.dispose();
    A = null; S.matchId = 0;
}
async function leaveMatch(m, results) {
    if (!A) return;
    switching = true;
    // (a question still open, "Leave the race?" say, has nothing left to ask)
    closeTop(); closeTop();
    await fadeOut();
    leaveMatchView();
    document.body.classList.remove('inmatch');
    matchHud({ on: false }); showCount(null); stageBar(false);
    $('#veil').style.opacity = '0';
    if (view) view.group.visible = true;
    if (m.w !== (view && view.w)) buildView(m.w); else updateGates(true);
    P.world = P.hub;
    setMood(WORLDS[m.w].mood, true);
    switching = false;
    teleport(m.x, 0, m.z, Math.PI);
    setMusicMode('plaza');
    setMusicIntensity(1);
    fadeIn();
    if (results) matchResults(results);
}
// the start line's count, the clock, the dark behind
function matchTick(dt) {
    const nowS = net.now();
    if (A.phase === 'wait') {
        const left = Math.ceil((A.goAt - nowS) / 1000);
        if (left !== A.countShown) { A.countShown = left; showCount(left > 0 ? String(left) : null); if (left > 0 && left <= 3) sfx('tick3'); }
        // the gun's message has had a second to get here and hasn't: the clock says it went
        if (nowS > A.goAt + 1000) { A.phase = 'play'; A.endsAt = A.goAt + A.D.secs * 1000; }
    } else if (A.phase === 'play') {
        const left = Math.max(0, Math.ceil((A.endsAt - nowS) / 1000));
        if (left !== A.leftShown) { A.leftShown = left; matchHud({ left }); if (left <= 5 && left > 0) sfx('tick3'); }
    }
    const sz = surgeAt(A.D, (nowS - A.goAt) / 1000);
    A.surgeZ = sz;
    if (A.view) A.view.update(nowS / 1000, sz);
    // the dark at your heels: the screen rumbles, the word goes up
    const gap = sz - P.b.z;
    A.gap = gap;
    if (A.phase === 'play' && !A.out && !A.done && gap < 0.5 && !A.outPred) { A.outPred = true; flushSteps(); sendMove(true); }
    if (A.phase === 'play' && !A.out && !A.done && gap < 14) shake = Math.max(shake, 0.12 * (1 - gap / 14));
    // the dark closing over the screen (written only when it changes by a step)
    const vk = A.out ? 0.7 : A.done ? 0 : clamp((10 - gap) / 10, 0, 1) * 0.55;
    if (Math.abs(vk - (A.veil ?? -1)) > 0.03) { A.veil = vk; $('#veil').style.opacity = vk.toFixed(2); }
    // the music builds: calm on the line, the full chase at the gun, everything when the avalanche is close or the clock nearly out
    const mk = A.phase !== 'play' || A.out || A.done ? (A.phase === 'wait' ? 0 : 1) : gap < 22 || (A.leftShown !== undefined && A.leftShown <= 10) ? 2 : 1;
    if (mk !== A.music) { A.music = mk; setMusicIntensity(mk); }
    void dt;
}
// what's in your lane: a pool, a bar, a blade, a boost, the portal
function raceTouch(t) {
    const b = P.b, cx = laneX(A.spot), plan = A.plan;
    if (A.phase !== 'play' || A.out || A.done) return;
    const nowS = net.now() / 1000;
    for (let i = 0; i < plan.obs.length; i++) {
        const o = plan.obs[i];
        if (o.kind === 'boost') {
            if (A.items[i] || Math.abs(b.z - o.z) > 4 || Math.hypot(b.x - (cx + o.x), b.z - o.z) > MATCH.r) continue;
            A.items[i] = 1;
            net.send('mItem', { i });
            P.boostUntil = t + MATCH.boostSecs;
            playAsmr('boost', 0.6, 1);
            bigText('BOOST!', '#7dff6b');
            fovKick = Math.max(fovKick, 5);
        } else if (o.kind === 'blade' && t > P.stunUntil + 0.6 && Math.abs(b.z - o.z) < 1.6 && b.y < 6) {
            const cv = caneAt(o, nowS), x = cx + cv * ARENA.hw;
            if (Math.abs(cv) < 0.8 && Math.abs(b.x - x) < 2.6) knock(b, 'OOF!');
        } else if (o.kind === 'slider' && t > P.stunUntil + 0.6 && Math.abs(b.z - o.z) < LANE_BOX.d / 2 + 0.6 && b.y < LANE_BOX.h - 0.5) {
            if (Math.abs(b.x - (cx + laneBoxAt(o, nowS))) < LANE_BOX.w / 2 + 0.6) knock(b, 'WHUMP!');
        }
    }
    if (b.onGround && t - P.fellAt > 1) {
        const o = poolAt(plan, b.x - cx, b.z);
        if (o) {
            P.fellAt = t;
            playAsmr('splash', 0.6, 0.9);
            FX.splash(FX.tmpV.set(b.x, 0.4, b.z), WORLDS[A.w].hazard2, lowQ ? 8 : 16, 1);
            net.send('mFell', { i: o.seg });
            teleport(cx, 0, segStart(o.seg), Math.PI);
            P.stunUntil = t + 0.45;
        }
    }
    if (!A.sent && b.z <= plan.finish + 4) { A.sent = true; flushSteps(); sendMove(true); net.send('mFinish', {}); }
}

// =====================================================================================
// The QA autopilot: plays the loop by itself (trains, buys, runs the Rift, takes its pads; in a race, runs for the end)
// =====================================================================================
let pilotBuyAt = 0, pilotWarpAt = 0;
// the next thing in the way, a little ahead, and where to go round it
function pilotAhead(list, z, cx) {
    let best = null;
    for (const o of list) {
        const oz = o.kind === 'pool' ? o.z1 : o.z;
        const d = z - oz;
        if (d < -2 || d > 26) continue;
        if (!best || d < best.d) best = { o, d };
    }
    if (!best) return { x: cx, jump: false };
    const o = best.o, d = best.d;
    if (o.kind === 'pool') return { x: cx, jump: d < Math.max(3, P.v * 0.12) && d > 0 };
    if (o.kind === 'hurdle') return { x: cx, jump: d < Math.max(2.5, P.v * 0.08) && d > 0 };
    // a sliding gift box: over the top of it (a jump is in the air above it for half a second)
    if (o.kind === 'slider') return { x: cx, jump: d < 3.2 + P.v * 0.16 && d > 0.5 };
    if (o.kind === 'slit') return { x: cx + o.gx, jump: false };
    if (o.kind === 'pillars') {
        // the widest way between them
        const xs = o.list.map((p) => p.x).sort((a, b) => a - b), edges = [cx - (A ? ARENA.hw : W.halfW - 1), ...xs.map((x) => cx + x), cx + (A ? ARENA.hw : W.halfW - 1)];
        let bx = cx, bw = 0;
        for (let i = 0; i < edges.length - 1; i++) if (edges[i + 1] - edges[i] > bw) { bw = edges[i + 1] - edges[i]; bx = (edges[i] + edges[i + 1]) / 2; }
        return { x: bx, jump: false };
    }
    if (o.kind === 'boost') return { x: cx + o.x, jump: false };
    return { x: cx, jump: false };
}
// the autopilot in a stage of its own kind: where to steer, when to jump or dash (null: the plain way, pilotAhead)
const pilotGum = [];
function pilotStage(plan, b, k, t) {
    const T2 = plan.type, nowS = net.now() / 1000, fx = view && view.stageFx;
    if (T2 === 'stones' || T2 === 'bounce') {
        // what it stands on (a platform, or the shore), the next platform ahead: chosen on the ground, kept till it lands
        const on = b.onGround ? plan.plats.find((p) => onPlat(p, b.x, b.z, 0.3) && b.y > p.top - 0.6) : null;
        if (b.onGround || !P.pTarget || P.pTarget.k !== k) {
            let next = null;
            let cost = 1e9;
            for (const p of plan.plats) { if (p === on || p.z > b.z - 1 || (on && p.z > on.z - on.sz / 2)) continue; const c = (b.z - p.z) + 1.6 * Math.abs(p.x - b.x); if (c < cost) { cost = c; next = p; } }
            // past the last platform: the far shore, straight ahead
            const lk = plan.lakes[0];
            if (!next && lk && b.z > lk.z0) next = { x: on ? on.x : b.x, z: lk.z0 - 5, sx: 30, sz: 10, top: 0 };
            P.pTarget = next ? { k, p: next } : null;
        }
        const next = P.pTarget && P.pTarget.p;
        if (!next) return null;
        const over = !b.onGround && Math.abs(b.z - next.z) < next.sz * 0.32 && b.y > next.top - 0.3;
        if (T2 === 'bounce') return { x: next.x, jump: false, brake: over, dash: false };
        // the edge of the ground under it: its platform's far side, or the shore where the syrup starts
        const lake = plan.lakes[0], ground = on ? on.z - on.sz / 2 : lake ? lake.z1 : b.z - 50, toEdge = b.z - ground;
        const reach = P.v * 0.79, toNext = b.z - (next.z + next.sz / 2);
        const jump = b.onGround && (toEdge < Math.max(0.9, P.v * 0.04) || (toNext < reach * 0.55 && toNext > 0.5));
        return { x: on ? clamp(next.x, on.x - on.sx / 2 + 1, on.x + on.sx / 2 - 1) : next.x, jump, hold: jump || !b.onGround, brake: over, dash: false };
    }
    if (T2 === 'crumble') {
        // along the bridge: its middle a little way ahead (further the faster it goes)
        const o = plan.list.find((x) => x.kind === 'crumble');
        if (!o || !o.path.length) return null;
        const zt = b.z - Math.max(3, P.v * 0.12);
        let best = o.path[0];
        for (const r2 of o.path) if (Math.abs(r2.z - zt) < Math.abs(best.z - zt)) best = r2;
        return { x: best.x, jump: false, dash: false };
    }
    if ((T2 === 'walls' || T2 === 'boss') && fx) {
        // dash into a jelly wall just ahead
        const wl = fx.walls.find((x) => x.k === k && fx.wallUp(x, t) && b.z - x.o.z > 0 && b.z - x.o.z < 9);
        if (wl) return { x: 0, jump: false, dash: true };
        if (T2 === 'walls') return { x: 0, jump: false, dash: false };
    }
    if (T2 === 'sweeper' || T2 === 'boss') {
        // jump a bar about to sweep through where you are
        for (const o of plan.list) {
            if (o.kind !== 'sweeper' || Math.abs(b.z - o.z) > SWEEP.r + 2) continue;
            for (let j = 0; j < o.bars; j++) {
                const a = sweeperAngle(o, nowS + 0.16) + j * Math.PI / 2, dx = b.x - o.x, dz = b.z - o.z;
                const perp = dx * Math.sin(a) + dz * Math.cos(a), along = dx * Math.cos(a) - dz * Math.sin(a);
                if (Math.abs(along) < SWEEP.r + 1 && Math.abs(perp) < 3.2 && b.onGround) return { x: o.x + 7, jump: true, hold: false };
            }
            return { x: o.x + 7, jump: false };
        }
        return null;
    }
    if (T2 === 'boulders') {
        // the lane whose ball has just gone by (or is furthest off)
        const o = plan.list.find((x) => x.kind === 'boulders');
        if (!o || b.z < o.z0 - 2) return null;
        let bx = b.x, best = -1e9;
        o.lanes.forEach((lx, i) => { const z = ballZ(o, i, nowS), rel = z - b.z, score = rel > BALL.r + 2 ? 1000 - rel : -rel; if (score > best) { best = score; bx = lx; } });
        return { x: bx, jump: false };
    }
    if (T2 === 'gumballs') {
        // keep out from under the shadows about to land
        const o = plan.list.find((x) => x.kind === 'gumballs');
        if (!o || b.z > o.z1 + 4 || b.z < o.z0) return null;
        gumballsAt(o, nowS, pilotGum);
        let x = b.x * 0.9;
        for (const d of pilotGum) { const land = d.t0 + GUM.warn + GUM.fall - nowS; if (land < -0.1 || land > 1.1 || Math.abs(d.z - b.z) > 10) continue; x += (b.x >= d.x ? 1 : -1) * 6; }
        return { x: clamp(x, -W.halfW + 3, W.halfW - 3), jump: false };
    }
    return null;
}
function pilot() {
    const o = { mx: 0, mz: 0, jump: false, hold: false }, b = P.b, t = clockT;
    if (switching || anyPopup()) return o;
    let tgt = null;
    if (A) {
        if (A.phase !== 'play' || A.out || A.done) return o;
        const cx = laneX(A.spot), a = pilotAhead(A.plan.obs, b.z, 0);
        tgt = { x: cx + a.x, z: A.plan.finish - 4 };
        o.jump = a.jump; o.hold = a.jump;
        P.pilotDash = true;
    } else if (view) {
        if (t > pilotBuyAt) {
            pilotBuyAt = t + 1.2;
            const next = SHOES[(S.shoe || 0) + 1];
            if (S.lv >= lvCap(S.rebirths) && S.wins >= rebirthCost(S.rebirths) && b.z > W.plaza.z0 && needTraining()) net.send('rebirth', {});
            else if (next && S.wins >= next.wins) net.send('shoe', {});
            else if (QUESTS[S.qi] && QUESTS[S.qi].kind === 'hatch' && S.wins >= JAWBREAKERS[0].wins) net.send('hatch', { j: 0, n: 1 });
            else if (QUESTS[S.qi] && QUESTS[S.qi].kind === 'upgrades') { const u = UPGRADES.find((x) => S.wins >= upgradeCost(x, (S.ups && S.ups[x.id]) || 0)); if (u) net.send('upgrade', { id: u.id }); }
            else if (QUESTS[S.qi] && QUESTS[S.qi].kind === 'trail' && S.wins >= 15) net.send('trail', { i: 1 });
            else if (S.wins >= JAWBREAKERS[0].wins * 2 && (S.hatched || 0) < 5) net.send('hatch', { j: 0, n: 1 });
        }
        tgt = guideTarget();
        // on a treadmill: train (sprinting) while the next gate's shut
        if (P.tread >= 0) { if (needTraining() || (S.speed || 0) < 12) { P.pilotDash = true; return o; } }
        if (b.z < W.plaza.z0) {
            const k = stageAt(b.z);
            // at a gate that's shut: the quick way back to train
            if (k >= 0 && k < WALLS_N && P.passed === k && !(gates.open > k + 1) && k + 1 < WALLS_N && t > pilotWarpAt) { pilotWarpAt = t + 3; goTo('post'); return o; }
            if (k >= 0 && k < WALLS_N) {
                const plan = stagePlan(S.world || 0, k), a = pilotStage(plan, b, k, t) || pilotAhead(plan.list, b.z, 0);
                // the last stretch: onto the Win Pad (not past it, off to one side)
                const toPad = b.z - padAt(k).z, lk = plan.lakes[0];
                tgt = { x: P.passed !== k && toPad < 24 && toPad > -W.padR && !(lk && b.z > lk.z0) ? clamp(a.x, -W.padR + 1.5, W.padR - 1.5) : a.x, z: tgt.z };
                o.jump = a.jump; o.hold = a.hold ?? a.jump; o.brake = !!a.brake || (!b.onGround && Math.abs(toPad) < W.padR && Math.abs(b.x) < W.padR);
                P.pilotDash = a.dash ?? (plan.type !== 'walls' && plan.type !== 'boss');
            }
        }
    }
    if (tgt) {
        const dx = tgt.x - b.x, dz = tgt.z - b.z, d = Math.hypot(dx, dz);
        // (heading up the Rift: mostly forward, steering to the side as it comes)
        if (d > 0.8) { if (b.z < W.plaza.z0 || A) { const sx = clamp(dx * 0.25, -1, 1), sz = dz < 0 ? -1 : 1; const l = Math.hypot(sx, sz); o.mx = sx / l; o.mz = sz / l; if (Math.abs(dz) < 2) { o.mx = dx / d; o.mz = dz / d; } } else { o.mx = dx / d; o.mz = dz / d; } }
        // in the air over where it means to land: ease off going forward (as a player does)
        if (o.brake) { o.mz = 0; o.mx = clamp(dx * 0.4, -1, 1); }
    }
    cam.yaw = A || b.z < W.plaza.z0 ? 0 : cam.yaw;
    return o;
}

// =====================================================================================
// The camera: close behind you (drag to turn, wheel / pinch to zoom); wider the faster you go
// =====================================================================================
const cam = { yaw: 0, pitch: 0.2, dist: isTouch ? 22 : 20 };
let camD = 18, camSens = 1, camSnap = true, shake = 0, fovKick = 0, speedFov = 0;
const dirV = new V3(), pivotV = new V3(), backV = new V3(), camPos = new V3(), lookV = new V3();
let pivotY = 5;
function lookDir(out_) { const p = cam.pitch, cp = Math.cos(p); return out_.set(-Math.sin(cam.yaw) * cp, -Math.sin(p), -Math.cos(cam.yaw) * cp); }
const LZD = SUN_DIRECTION.clone().normalize(), LX = new V3(0, 1, 0).cross(LZD).normalize(), LY = LZD.clone().cross(LX), snapV = new V3();
function snapShadow(p) {
    const c = sun.shadow.camera, texel = (c.right - c.left) / sun.shadow.mapSize.x;
    const a = Math.round(p.dot(LX) / texel) * texel, b = Math.round(p.dot(LY) / texel) * texel;
    snapV.copy(LX).multiplyScalar(a).addScaledVector(LY, b).addScaledVector(LZD, p.dot(LZD));
    sun.target.position.copy(snapV);
    sun.position.copy(snapV).addScaledVector(LZD, 200);
}
const AX = [0, 1, 2], oA = [0, 0, 0], dA = [0, 0, 0];
function rayHit(o, d, maxT) {
    let best = maxT;
    oA[0] = o.x; oA[1] = o.y; oA[2] = o.z; dA[0] = d.x; dA[1] = d.y; dA[2] = d.z;
    for (const c of P.world.solids) {
        if (c.max[1] - c.min[1] < 3 || Math.max(c.max[0] - c.min[0], c.max[2] - c.min[2]) < 2.2) continue;
        // (a pillar right behind you doesn't pull the camera in front of your face: only what's taller than you are wide counts)
        if (Math.abs(c.min[2] - o.z) > 60 && Math.abs(c.max[2] - o.z) > 60) continue;
        let t0 = 0, t1 = best, miss = false;
        for (const a of AX) {
            if (Math.abs(dA[a]) < 1e-9) { if (oA[a] < c.min[a] || oA[a] > c.max[a]) { miss = true; break; } continue; }
            let ta = (c.min[a] - oA[a]) / dA[a], tb = (c.max[a] - oA[a]) / dA[a];
            if (ta > tb) { const q = ta; ta = tb; tb = q; }
            t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
            if (t0 > t1) { miss = true; break; }
        }
        if (!miss && t0 > 0 && t0 < best) best = t0;
    }
    return best;
}
function updateCamera(dt) {
    const b = P.b, portrait = innerWidth < innerHeight;
    lookDir(dirV);
    const fx = P.vx, fz = P.vz, gy = (b.y + (P.vy - b.y) * 0.72) + 5.2;
    if (camSnap || (pivotV.x - fx) ** 2 + (pivotV.z - fz) ** 2 > 900) { pivotV.set(fx, gy, fz); pivotY = gy; camSnap = false; }
    else {
        const kx = 1 - Math.exp(-dt * 16);
        pivotV.x += (fx - pivotV.x) * kx; pivotV.z += (fz - pivotV.z) * kx;
        pivotY += (gy - pivotY) * (1 - Math.exp(-dt * (b.onGround ? 10 : 6)));
        pivotV.y = pivotY;
    }
    backV.copy(dirV).negate();
    let lim = cam.dist + (portrait ? 7 : 0) + Math.min(10, Math.max(0, b.y - P.groundY) * 0.08) + speedFov * 0.3;
    lim = Math.min(lim, rayHit(pivotV, backV, lim + 1) - 0.8);
    // the Rift's sides, a gate still shut, a race's outer rails: the camera stays on your side of them
    if (A) {
        const m = CFG.matchSpots * ARENA.laneW / 2 - 0.8;
        if (Math.abs(backV.x) > 1e-4) lim = Math.min(lim, (Math.sign(backV.x) * m - pivotV.x) / backV.x);
    } else if (pivotV.z - backV.z * -lim < W.plaza.z0 + 4 || pivotV.z < W.plaza.z0 + 4) {
        const m = W.halfW - 0.8;
        if (Math.abs(backV.x) > 1e-4 && pivotV.z + backV.z * lim < W.plaza.z0 + 4) lim = Math.min(lim, (Math.sign(backV.x) * m - pivotV.x) / backV.x);
        if (backV.z < -1e-4) lim = Math.min(lim, (lockBox.z - 0.4 - pivotV.z) / backV.z);
    }
    lim = Math.max(2, lim);
    camD = lim < camD ? lim : camD + (lim - camD) * (1 - Math.exp(-dt * 4));
    camPos.copy(pivotV).addScaledVector(backV, camD);
    if (camPos.y < 0.8) camPos.y = 0.8;
    camera.position.copy(camPos);
    camera.lookAt(lookV.copy(camPos).addScaledVector(dirV, 30));
    if (shake > 0.001) { const s = shake * shake * 0.8; camera.position.x += (RND() * 2 - 1) * s; camera.position.y += (RND() * 2 - 1) * s; shake = Math.max(0, shake - dt * 2.4); }
    // every takeoff and dash widens the view a touch, easing back; and the faster you run, the wider it stays
    fovKick = Math.max(0, fovKick - dt * 9);
    const hv = Math.hypot(b.vx, b.vz), sfTarget = clamp((hv - 22) * 0.16, 0, 9);
    speedFov += (sfTarget - speedFov) * Math.min(1, dt * 2.5);
    const want = (portrait ? 86 : 70) + fovKick + speedFov;
    if (Math.abs(camera.fov - want) > 0.01) { camera.fov += (want - camera.fov) * Math.min(1, dt * 10); camera.updateProjectionMatrix(); }
    camera.updateMatrixWorld();
    if (me) me.root.visible = camD > 2.2;
}

// =====================================================================================
// Input
// =====================================================================================
const keys = {};
const touchMove = { x: 0, y: 0 };
let running = false, touchJump = false;
actions.onPanel = () => { for (const k in keys) keys[k] = false; touchJump = false; P.holdDash = false; };
addEventListener('keydown', (e) => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT')) { if (e.key === 'Enter' || e.key === 'Escape') e.target.blur(); if (e.key === 'Escape') closeTop(); return; }
    if (e.code === 'Space' || e.code.startsWith('Arrow') || e.code === 'Tab') e.preventDefault();
    if (!running) return;
    if (e.code === 'Escape' && !e.repeat) { if (closeTop()) return; if (BX.isEmbedded()) BX.showPortalMenu(); else openPanel('settings'); return; }
    keys[e.code] = true;
    if (e.repeat || anyPopup()) return;
    if (e.code === 'Space') P.jumpPress = clockT;
    if (e.code === 'KeyE' && activePrompt) usePrompt();
    if (e.code === 'KeyF' || e.code === 'Enter' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') dash();
    if (e.code === 'KeyL') actions.togglePace();
    if (A) return;
    if (e.code === 'KeyR') goTo('spawn');
    if (e.code === 'KeyB') goStage();
    if (e.code === 'KeyQ') openPanel('quests');
    if (e.code === 'KeyC') openPanel('spin');
    if (e.code === 'KeyG') openPanel('shop');
    if (e.code === 'KeyZ') openPanel('tongues');
    if (e.code === 'KeyJ') openPanel('pals');
    if (e.code === 'KeyU') openPanel('work');
    if (e.code === 'KeyP') pressPlay();
});
addEventListener('keyup', (e) => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; touchJump = false; drags.clear(); pinchD = 0; P.holdDash = false; });
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
const drags = new Map();
let pinchD = 0, holdId = null;
canvas.addEventListener('pointerdown', (e) => {
    canvas.focus();
    if (!running || anyPopup()) return;
    canvas.setPointerCapture(e.pointerId);
    drags.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, moved: false, at: performance.now() });
    if (drags.size === 2) { const [a, b] = [...drags.values()]; pinchD = Math.hypot(a.x - b.x, a.y - b.y); P.holdDash = false; holdId = null; }
    // a click on the world on a treadmill is a sprint (held: keep sprinting). The right button is only ever the camera
    else if (e.button === 0 && P.tread >= 0) { dash(); holdId = e.pointerId; P.holdDash = true; }
});
canvas.addEventListener('pointermove', (e) => {
    const d = drags.get(e.pointerId);
    if (!d) return;
    if (!d.moved && Math.hypot(e.clientX - d.x0, e.clientY - d.y0) > 6) { d.moved = true; if (holdId === e.pointerId) { holdId = null; P.holdDash = false; } }
    if (drags.size === 2) {
        const [a, b] = [...drags.values()], nd = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinchD) cam.dist = clamp(cam.dist * pinchD / Math.max(20, nd), 10, 46);
        pinchD = nd;
    } else if (d.moved) {
        const k = (e.pointerType === 'touch' ? 0.0068 : 0.0045) * camSens;
        cam.yaw -= (e.clientX - d.x) * k;
        cam.pitch = clamp(cam.pitch + (e.clientY - d.y) * k, -0.5, 1.3);
    }
    d.x = e.clientX; d.y = e.clientY;
});
const endDrag = (e) => { drags.delete(e.pointerId); if (drags.size < 2) pinchD = 0; if (holdId === e.pointerId) { holdId = null; P.holdDash = false; } };
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);
canvas.addEventListener('wheel', (e) => { cam.dist = clamp(cam.dist + Math.sign(e.deltaY) * 2, 10, 46); e.preventDefault(); }, { passive: false });
(function touchControls() {
    const stick = $('#stick'), knob = $('#knob');
    let id = null, rect = null;
    const set = (e) => {
        const r = rect;
        let dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
        const max = r.width / 2, l = Math.hypot(dx, dy);
        if (l > max) { dx *= max / l; dy *= max / l; }
        knob.style.transform = `translate(${dx}px, ${dy}px)`;
        touchMove.x = dx / max; touchMove.y = dy / max;
    };
    stick.addEventListener('pointerdown', (e) => { id = e.pointerId; rect = stick.getBoundingClientRect(); stick.setPointerCapture(id); set(e); });
    stick.addEventListener('pointermove', (e) => { if (e.pointerId === id) set(e); });
    const end = (e) => { if (e.pointerId !== id) return; id = null; knob.style.transform = ''; touchMove.x = touchMove.y = 0; };
    stick.addEventListener('pointerup', end); stick.addEventListener('pointercancel', end);
    const jb = $('#jumpBtn'), wb = $('#lickBtn');
    jb.addEventListener('pointerdown', (e) => { e.preventDefault(); jb.setPointerCapture(e.pointerId); P.jumpPress = clockT; touchJump = true; jb.classList.add('on'); });
    const jEnd = () => { touchJump = false; jb.classList.remove('on'); };
    jb.addEventListener('pointerup', jEnd); jb.addEventListener('pointercancel', jEnd);
    wb.addEventListener('pointerdown', (e) => { e.preventDefault(); wb.setPointerCapture(e.pointerId); wb.classList.add('on'); dash(); P.holdDash = true; });
    const wEnd = () => { wb.classList.remove('on'); P.holdDash = false; };
    wb.addEventListener('pointerup', wEnd); wb.addEventListener('pointercancel', wEnd);
})();

// A button: a click. A browser makes no click for a second finger, though, and a thumb on the stick is the first: then the lift of
// that finger is the tap.
let touchesDown = 0;
addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch') touchesDown++; }, true);
for (const ev of ['pointerup', 'pointercancel']) addEventListener(ev, (e) => { if (e.pointerType === 'touch') touchesDown = Math.max(0, touchesDown - 1); }, true);
addEventListener('blur', () => { touchesDown = 0; });
function tapOn(el, fn) {
    let id = null, at = 0;
    el.addEventListener('pointerdown', (e) => { id = e.pointerType === 'touch' && touchesDown > 1 ? e.pointerId : null; });
    el.addEventListener('pointerup', (e) => {
        if (e.pointerId !== id) return;
        id = null;
        const r = el.getBoundingClientRect();
        if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) { at = performance.now(); fn(); }
    });
    el.addEventListener('pointercancel', () => { id = null; });
    el.addEventListener('click', () => { if (performance.now() - at > 700) fn(); });
}
actions.tapOn = tapOn;
// ----- proximity prompts (the Shoe Shop, the Upgrades, the portal, the gate, a Rift Core, a treadmill with a price) -----
let activePrompt = null, promptX = -1, promptY = -1;
const pv = new V3();
function updatePrompt() {
    let best = null, bd = 1e9;
    const b = P.b;
    if (!A && !anyPopup() && b.y < 6 && P.tread < 0 && b.z > W.plaza.z0 - 4) for (const p of prompts) { if (p.on && !p.on()) continue; const d = Math.hypot(p.pos.x - b.x, p.pos.z - b.z); if (d < p.r && d < bd) { bd = d; best = p; } }
    activePrompt = best;
    const el = $('#promptBtn');
    if (!best) { if (!el.hidden) el.hidden = true; return; }
    pv.copy(best.pos).setY(best.pos.y + 6).project(camera);
    if (pv.z > 1) { el.hidden = true; return; }
    el.hidden = false;
    const lbl = best.label();
    if ($('#promptTxt').textContent !== lbl) $('#promptTxt').textContent = lbl;
    const px = Math.round(clamp((pv.x + 1) / 2, 0.24, 0.76) * innerWidth), py = Math.round(clamp((1 - pv.y) / 2, 0.24, 0.74) * innerHeight);
    if (px !== promptX || py !== promptY) { promptX = px; promptY = py; el.style.transform = `translate(${px}px, ${py}px) translate(-50%, -110%)`; }
}
function usePrompt() { if (activePrompt) { sfx('click'); activePrompt.act(); } }
tapOn($('#promptBtn'), usePrompt);

// ----- controller -----
let padMode = false, padSeen = 0, padTipsShown = false, padMenu = false, padHud = false;
function setPadMode(on) {
    if (padMode === on) return;
    padMode = on;
    document.body.classList.toggle('pad', on);
    $('#promptBtn').querySelector('kbd').textContent = on ? 'Y' : 'E';
    if (!on) { padNav.clear(); setPadMenu(false); }
    else if (running && !padTipsShown) { padTipsShown = true; showTips(); }
}
function setPadMenu(on) {
    if (padMenu !== on) { padMenu = on; document.body.classList.toggle('padmenu', on); }
    const h = on && padNav.hud && !anyPopup();
    if (padHud !== h) { padHud = h; document.body.classList.toggle('padhud', h); }
}
// a mouse, a key, a finger: the ring and the controller's hints get out of the way until the controller's used again
const padOff = () => { if (padMode) setPadMode(false); };
addEventListener('keydown', padOff, true);
addEventListener('pointerdown', padOff, true);
addEventListener('pointermove', (e) => { if (padMode && e.pointerType === 'mouse' && Math.abs(e.movementX) + Math.abs(e.movementY) > 6) padOff(); }, true);
onGamepadConnection((g, on) => {
    if (on) { toast('🎮 Controller ready!', '#7dff6b'); setPadMode(true); } else { toast('🎮 Controller disconnected', '#ffc27a'); setPadMode(false); }
});
const ZOOMS = [14, 20, 30];
function padButtons(dt) {
    if (!pad.connected) return;
    if (pad.lastUsed !== padSeen) {
        padSeen = pad.lastUsed;
        setPadMode(true);
        // a button on a controller doesn't count as a tap for the browser's sound rules everywhere
        if (pad.pressed.size && audioSuspended()) resumeAudio();
    }
    if (!running) return;
    const menu = padNav.frame(performance.now(), dt, padMode);
    setPadMenu(!!menu && padMode);
    if (!padMode) return;
    if (pad.pressed.has('START')) { if (!closeTop()) openPanel('settings'); return; }
    if (menu === 'back') { closeTop(); return; }
    if (menu) return;
    if (pad.pressed.has('A')) P.jumpPress = clockT;
    if (pad.pressed.has('X') || pad.pressed.has('RT') || pad.pressed.has('LT')) dash();
    if (pad.pressed.has('RB')) actions.togglePace();
    for (const d of ['UP', 'DOWN', 'LEFT', 'RIGHT']) if (pad.pressed.has(d)) { padNav.enterHud(d); return; }
    if (pad.pressed.has('R3')) { const i = ZOOMS.findIndex((z) => z >= cam.dist - 0.5); cam.dist = ZOOMS[(i + 1) % ZOOMS.length] || ZOOMS[0]; }
    if (A) return;
    if (pad.pressed.has('Y')) { if (activePrompt) usePrompt(); else goStage(); }
    if (pad.pressed.has('LB')) pressPlay();
    if (pad.pressed.has('BACK')) openPanel('quests');
    if (pad.pressed.has('L3')) goTo('spawn');
}

// =====================================================================================
// Everyone else in your world or your race (smoothed on the server's clock)
// =====================================================================================
const remotes = new Map();
const smp = { x: 0, y: 0, z: 0, ry: 0, a: 0, speed: 0 };
class Remote {
    constructor(p, id) {
        this.id = id;
        this.char = new Char({ name: p.name, lv: p.lv, tr: p.title });
        this.char.setAvatar(p.av);
        this.av = p.av; this.track = new Track(); this.air = false; this.prevY = p.y; this.vy = 0; this.minVy = 0; this.here = false;
        this.team = new Team(); this.treadK = 0; this.treadI = -1; this.shoe = -1; this.p = p;
    }
    update(p, dt, t) {
        this.p = p;
        this.track.push(p.t, p.x, p.y, p.z, p.ry, p.anim);
        const matchNow = A ? A.id : 0;
        this.here = p.match === matchNow && (matchNow > 0 || p.world === S.world);
        if (!this.here || switching) { this.char.setVisible(false); this.onGround = false; return; }
        const rt = net.now() - this.track.delayFor(dt);
        if (!this.track.sample(rt, smp, dt)) { smp.x = p.x; smp.y = p.y; smp.z = p.z; smp.ry = p.ry; smp.a = p.anim; smp.speed = 0; }
        // past a gate that's shut for you, in your world: out of sight anyway, the barrier's in the way
        const behind = !A && smp.z < lockBox.z - 8;
        const air = smp.a === 2, vy = dt > 0 ? (smp.y - this.prevY) / dt : 0;
        this.vy += (vy - this.vy) * Math.min(1, dt * 12);
        if (air) this.minVy = Math.min(this.minVy, this.vy);
        if (this.air && !air) { this.char.squash(0.6); this.minVy = 0; }
        if (!this.air && air && this.vy > 3) this.char.stretch(0.5);
        this.air = air; this.prevY = smp.y;
        if (p.av !== this.av) { this.av = p.av; this.char.setAvatar(p.av); }
        if (p.shoe !== this.shoe && this.char.setShoe) { this.shoe = p.shoe; this.char.setShoe(p.shoe); }
        // (their tag, when something on it has changed)
        const raceId = A ? A.id : 0;
        if (p.lv !== this.tagLv || p.name !== this.tagName || p.title !== this.tagTr || raceId !== this.tagRace) { this.tagLv = p.lv; this.tagName = p.name; this.tagTr = p.title; this.tagRace = raceId; this.char.setLabel(p.name, p.lv, p.title, A ? SPOT_CSS[A.names.find((n) => n.n === p.name)?.spot ?? 0] : undefined); }
        this.char.setTrail(p.trail); this.char.setAura(p.aura);
        // (right up against the camera a rival would fill the screen and hide you: they aren't drawn there)
        const d2 = camera.position.distanceToSquared(FX.tmpV.set(smp.x, smp.y + 3, smp.z)), near = !behind && d2 < (lowQ ? 150 * 150 : 240 * 240) && d2 > 64;
        this.char.setVisible(near);
        if (near) {
            this.char.fitLabel(Math.sqrt(d2));
            const far = d2 > 90 * 90;
            // on a treadmill: on the belt, running in place
            const tread = p.post !== 255 && p.anim === 3;
            this.treadK += ((tread ? 1 : 0) - this.treadK) * Math.min(1, dt * 8);
            if (tread) this.treadI = p.post;
            let x = smp.x, y = smp.y, z = smp.z, ry = smp.ry;
            if (this.treadK > 0.01 && this.treadI >= 0) {
                const s = postSpot(this.treadI), e = this.treadK;
                x += (s.x - x) * e; y += (0.55 - y) * e; z += (s.z + 1 - z) * e; ry = lerpA(ry, Math.PI, e);
            }
            const down = smp.a === 4, spd = this.treadK > 0.35 ? 22 : smp.speed;
            const q = remSt; q.x = x; q.y = y; q.z = z; q.ry = ry; q.air = air && this.treadK < 0.3; q.moving = ((smp.a === 1 || smp.speed > 2) || this.treadK > 0.35) && !down; q.speed = spd; q.vy = this.vy; q.far = far; q.pose = down ? 'down' : null; q.lick = 0; q.sprint = spd > 30;
            this.char.update(dt, t, q);
            if (!far && !A) { this.team.set(p.team); this.team.update(dt, t, smp.x, smp.y, smp.z, this.char.root.rotation.y, q.moving); }
            if (!far && q.moving && !q.air && d2 < 60 * 60 && t - (this.sndT || -9) > 0.28) {
                this.sndT = t;
                const onJ = !!A || z < W.plaza.z0 || onJellyBed(x, z);
                if (onJ) jellyHit(x, z, 0.7);
                if (d2 < 40 * 40) playAsmr(onJ ? 'step' : 'crunch', 0.12 * (1 - Math.sqrt(d2) / 45), 0.95 + RND() * 0.2, panOf(x, z));
            }
            this.x = x; this.y = y; this.z = z;
        }
        this.onGround = !air;
    }
    dispose() { this.char.dispose(); }
}
const seenIds = new Set();
function syncRemotes(dt, t) {
    const room = net.room;
    if (!room || !room.state || !room.state.players) return;
    seenIds.clear();
    room.state.players.forEach((p, id) => {
        if (id === room.sessionId) { if (S.name !== p.name) { S.name = p.name; if (me) me.setLabel(S.name, S.lv, titleOf(S.cleared)); } return; }
        seenIds.add(id);
        let r = remotes.get(id);
        if (!r) { r = new Remote(p, id); remotes.set(id, r); }
        r.update(p, dt, t);
    });
    for (const [id, r] of remotes) if (!seenIds.has(id)) { r.dispose(); remotes.delete(id); }
}

// =====================================================================================
// HUD buttons
// =====================================================================================
let switching = false;
// (the button lets go of the keyboard: SPACE jumps, it never presses the last button clicked again)
const bind = (sel, fn) => { const el = $(sel); tapOn(el, () => { sfx('click'); el.blur(); fn(); }); };
bind('#bTongues', () => openPanel('tongues'));
bind('#bPals', () => openPanel('pals'));
bind('#bWork', () => openPanel('work'));
bind('#bRebirth', () => openPanel('rebirth'));
bind('#bSpin', () => openPanel('spin'));
bind('#bQuests', () => openPanel('quests'));
bind('#bDaily', () => openPanel('daily'));
bind('#bWorlds', () => openPanel('worlds'));
bind('#bSettings', () => openPanel('settings'));
bind('#bShop', () => openPanel('shop'));
bind('#bGift', () => openPanel('gifts'));
bind('#questLine', () => openPanel('quests'));
bind('#winsBox', () => openPanel('boards'));
bind('#gemsBox', () => openPanel('shop'));
bind('#bX2', () => openPanel('shop'));
bind('#bPlay', () => pressPlay());
bind('#bAuto', () => actions.togglePace());
bind('#bGo', () => goStage());
bind('#qCancel', () => net.send('unplay', {}));
bind('#bQuit', () => askConfirm('🏳️', 'Leave the race?', 'A bot takes your place and you get no prize.', 'Leave', () => net.send('quit', {})));
function goStage() {
    if (A || P.down) return;
    if (S.inGauntlet || (S.speed || 0) < 12) goTo('post'); else goTo('stage', frontier());
}
function fadeOut() { $('#fade').style.opacity = 1; return sleep(260); }
function fadeIn() { $('#fade').style.opacity = 0; }
let showFps = false;
actions.fpsOn = () => showFps;
actions.toggleFps = () => { showFps = !showFps; $('#fps').hidden = !showFps; };
// your pace: full speed, or held back for the tricky bits (a Shade comes at your full speed, though)
const PACES = [1, 0.75, 0.5];
actions.togglePace = () => {
    const i = (PACES.indexOf(P.pace) + 1) % PACES.length;
    P.pace = PACES[i];
    S.pace = P.pace;
    toast(P.pace === 1 ? '⚡ Full speed!' : '🐢 Pace ' + Math.round(P.pace * 100) + '%: easier to steer (Wobblers stay quick!)', '#7af4ff');
    updateHud();
};
let boards = { wins: [], speed: [], race: [] };
actions.boards = () => boards;
actions.world = (w) => { if (w === S.world) { closeTop(); goTo('spawn'); return; } net.send('world', { w }); };
actions.toggleMusic = () => toggleMusic();
actions.revive = () => net.send('revive', {});
actions.giveUp = () => net.send('respawn', {});
actions.myZ = () => P.b.z;
addEventListener('resize', () => measureHud());

// =====================================================================================
// Networking
// =====================================================================================
const BLOXITY_GAME_ID = import.meta.env.VITE_BLOXITY_GAME_ID || '';
const ON_BLOXITY_HOST = /\.play\.bloxity\.io$/.test(location.hostname);
const DEV_CHANNEL = /\.dev\.play\.bloxity\.io$/.test(location.hostname);
const SERVER_URL = import.meta.env.VITE_SERVER_URL
    || (ON_BLOXITY_HOST ? `https://${location.hostname.replace(/\.play\.bloxity\.io$/, '.host.bloxity.io')}`
        : BLOXITY_GAME_ID ? `https://${BLOXITY_GAME_ID}.host.bloxity.io`
        : import.meta.env.DEV ? `${location.protocol}//${location.hostname}:3017` : location.origin);
async function serverEndpoint() {
    let url = SERVER_URL;
    if (BLOXITY_GAME_ID) {
        const r = await BX.resolveEndpoint(BLOXITY_GAME_ID, DEV_CHANNEL ? 'preview' : undefined);
        if (r && r.cold) loadingText('Waking up a server…');
        url = (r && r.endpoint) || SERVER_URL;
    }
    if (!/^https?:/i.test(url)) return url;
    if (!(await serverUp(url))) {
        loadingText('Waking up a server…');
        const until = Date.now() + 60000;
        while (Date.now() < until) { await sleep(2000); if (await serverUp(url)) break; }
    }
    return url;
}
async function serverUp(url) {
    try {
        const ctl = new AbortController();
        const t = setTimeout(() => ctl.abort(), 4000);
        const r = await fetch(url.replace(/\/$/, '') + '/health', { signal: ctl.signal, cache: 'no-store' });
        clearTimeout(t);
        return r.ok;
    } catch (e) { return false; }
}
let lastMoveSent = 0, lastMoveKey = '';
function sendMove(force) {
    if (switching) return;
    const now = performance.now();
    if (!force && now - lastMoveSent < 66) return;
    const b = P.b, tread = P.tread >= 0 && P.treadK > 0.3;
    const a = tread ? 3 : !b.onGround ? 2 : P.moving ? 1 : 0;
    const m = { x: +b.x.toFixed(2), y: +b.y.toFixed(2), z: +b.z.toFixed(2), ry: +P.facing.toFixed(3), a, v: Math.round(Math.hypot(b.vx, b.vz)) };
    if (tread) m.post = P.tread;
    const key = m.x + ',' + m.y + ',' + m.z + ',' + m.ry + ',' + a;
    if (!force && key === lastMoveKey && now - lastMoveSent < 500) return;
    lastMoveKey = key; lastMoveSent = now;
    m.ts = Math.round(net.now());
    net.send('move', m);
}
function playerUid() {
    let uid = storageGet('jjd1_uid');
    if (!uid) { uid = (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2) + Date.now()); storageSet('jjd1_uid', uid); }
    return uid;
}
// an answer from the server: its numbers, plus what you've stepped since that it hasn't seen yet
function reconcile(m) {
    if (m.ack !== undefined) while (pending.length && pending[0].s <= m.ack) pending.shift();
    let x = out.xp, n = out.n;
    for (const p of pending) { x += p.xp; n += p.n; }
    S.pendXp = x; S.pendN = n;
    if (m.xp !== undefined) S.xp = Math.min((m.need || S.need) - 0.01, m.xp + x);
    delete m.xp; delete m.ack;
}
let gotProfile = false, lastGems = 0, lastWins = 0, lastReb = -1, epochSet = false, connLost = false;
async function connect(name, endpoint) {
    const url = endpoint || await serverEndpoint();
    const client = new Client(url);
    const id = BX.identity();
    const room = await client.joinOrCreate('run', { uid: playerUid(), name: name || id.name, token: id.token, av: packAvatar(BX.currentAvatar()), save: storageGet('jjd1_save') || '' });
    net.room = room;
    net.bloxity = false;
    BX.updateRoom(room.roomId);
    room.onMessage('hello', (m) => { net.offset = m.now - Date.now(); if (!epochSet) { epochSet = true; setEpoch(m.now - 300000); } net.bloxity = !!m.bloxity; pingSend(); });
    room.onDrop(() => { toast('📶 Connection lost: reconnecting…', '#ffe24a'); });
    room.onReconnect(() => { toast('📶 Back online!', '#7dff6b'); });
    room.onMessage('pong', onPong);
    room.onMessage('profile', (m) => {
        const first = !gotProfile;
        if (m.save) storageSet('jjd1_save', m.save);
        delete m.now;
        const prevWorld = S.world, prevShoe = S.shoe;
        reconcile(m);
        Object.assign(S, m);
        S.x2 = (S.x2Until || 0) > net.now();
        S.profileAt = Date.now();
        gotProfile = true;
        if (!first && m.gems > lastGems) { bump('#gemsBox'); sfx('gem'); }
        if (!first && m.wins > lastWins + 0.5) bump('#winsBox');
        lastGems = m.gems; lastWins = m.wins;
        if (me) { me.setLabel(S.name, S.lv, titleOf(S.cleared)); me.setTrail(S.trail); me.setAura(S.aura); if (prevShoe !== S.shoe && me.setShoe) me.setShoe(S.shoe); }
        // the golden candies you've found (this world's)
        if (view && view.stageFx) view.stageFx.setCandies(S.candies && S.candies[view.w]);
        setProgress();
        if (lastReb !== S.rebirths) { lastReb = S.rebirths; document.body.classList.toggle('reborn', S.rebirths > 0); }
        // a world switch made elsewhere (another tab) shows up here
        if (!first && running && !switching && !A && prevWorld !== S.world && view && view.w !== S.world) switchWorld(S.world, W.spawn.x, W.spawn.z);
        refreshPanels();
        updateHud();
    });
    // while running: only what changes then, four times a second
    room.onMessage('lite', (m) => {
        reconcile(m);
        S.lv = m.lv; S.need = m.need; S.wins = m.wins; S.totalSpeed = m.totalSpeed; S.speed = m.speed; S.steps = m.steps; S.megas = m.megas; S.cleared = m.cleared; S.escapes = m.escapes;
        if (m.qv !== undefined) S.qv = m.qv;
        if (m.bests) S.bests = m.bests;
        S.profileAt = S.profileAt || Date.now();
        updateHud();
    });
    room.onMessage('toast', (m) => toast(m.text, m.color));
    room.onMessage('broke', (m) => notEnough(m));
    room.onMessage('code', (m) => codeResult(m));
    room.onMessage('boards', (m) => { boards = m; if (view) view.setBoards(m); if (panelIs('boards')) refreshPanels(); });
    room.onMessage('reward', (m) => { popup(m.gems && !/pc|wc/.test(m.text) ? '💎' : '🎁', m.why || 'Reward!', m.text, '#ffe24a', true); sfx('reward'); confetti(P.b); if (/wc/.test(m.text)) flyWins(8); });
    room.onMessage('levelup', (m) => {
        const was = S.lv;
        S.lv = m.lv; S.need = xpNeed(m.lv, S.rebirths); S.xp = 0;
        sfx('levelup');
        levelUp(was, m.lv, m.cap);
        if (m.cap) { screenConfetti(50); toast('🔄 Level cap! Rebirth for x' + rebirthMult((S.rebirths || 0) + 1) + ' Speed', '#e0a8ff'); }
        if (me) { FX.sparkleColumn(P.b, 0x7af4ff); me.setLabel(S.name, S.lv, titleOf(S.cleared)); }
        updateHud();
    });
    room.onMessage('padok', (m) => onPadOk(m));
    room.onMessage('warped', (m) => {
        const why = m.why;
        if (why === 'caught' || why === 'back' || why === 'fell') { P.down = false; P.downPred = -9; reviveHide(); }
        warpTo(m.x, m.y, m.z);
    });
    room.onMessage('caught', (m) => onCaught(m));
    room.onMessage('saved', () => {
        P.downPred = -9;
        sfx('revive'); rumble(0.6, 200); shake = Math.max(shake, 0.5);
        bigText('CLOSE CALL! RUN!', '#ffe24a');
        toast('🛡️ It bounced off you! Next time it catches you.', '#ffe24a');
        FX.ring(FX.tmpV.set(P.b.x, P.b.y + 0.4, P.b.z), 0xffe24a, 9, 0.45);
    });
    room.onMessage('revived', (m) => {
        P.down = false; P.downPred = -9; reviveHide();
        teleport(m.x, m.y, m.z, Math.PI);
        sfx('revive');
        bigText('REVIVED! RUN!', '#7dff6b');
        FX.sparkleColumn(P.b, 0x7dff6b);
    });
    room.onMessage('escaped', (m) => {
        sfx('escape');
        bigText(m.k === WALLS_N - 1 ? 'YOU BEAT THE ' + WORLDS[S.world || 0].bossName.toUpperCase() + '!' : 'ESCAPED!', '#7dff6b');
        // the stage against the clock: your time, your best
        if (m.secs > 0.5) toast('⏱ ' + m.secs.toFixed(1) + ' s' + (m.best ? (m.old ? ' · NEW BEST! (was ' + m.old.toFixed(1) + ' s)' : '') : ' · your best ' + m.old.toFixed(1) + ' s'), m.best && m.old ? '#7dff6b' : '#ffffff');
        if (!lowQ) screenConfetti(m.k === WALLS_N - 1 ? 90 : 24);
    });
    room.onMessage('reborn', (m) => {
        sfx('rankup');
        popup('🔄', 'REBIRTH ' + m.r + '!', 'Every step now gives x' + rebirthMult(m.r) + ' Speed', '#e0a8ff');
        screenConfetti(90);
        pending.length = 0; out.n = 0; out.xp = 0; S.pendXp = 0; S.pendN = 0;
        P.padT.fill(-99);
        teleport(m.x, 0, m.z, Math.PI);
        updateGates(true);
    });
    room.onMessage('warp', (m) => { S.world = m.w; pending.length = 0; out.n = 0; out.xp = 0; S.pendXp = 0; S.pendN = 0; P.padT.fill(-99); switchWorld(m.w, m.x, m.z); });
    room.onMessage('spun', (m) => onSpun(m));
    room.onMessage('hatched', (m) => { hatchShow(m); });
    room.onMessage('bought', (m) => {
        sfx('buy');
        screenConfetti(60);
        if (m.what === 'shoe') { const g = SHOES[m.i]; popup('👟', g.name.toUpperCase() + '!', '+' + fmt(g.add) + ' Speed a step', '#7af4ff'); if (me) FX.sparkleColumn(P.b, g.c1); }
        else if (m.what === 'upgrade') toast('⬆️ Upgraded!', '#7dff6b');
        else if (m.what === 'post') toast('👟 The ' + POSTS[m.i].name + ' is open: go and run on it!', '#7dff6b');
    });
    room.onMessage('candy', (m) => {
        if (!m.ok) return;
        toast('🍬 Golden Candy! +' + m.gems + ' 💎' + (m.all ? ' · all 3 in this stage!' : '') + ' (' + m.n + ' / 45 in ' + WORLDS[S.world || 0].name + ')', '#ffd23a');
        if (m.all) { screenConfetti(40); sfx('reward'); }
    });
    room.onMessage('taskdone', (m) => { sfx('task'); toast('✅ Daily task done: ' + TASKS[m.k].text + '! Claim it in Quests', '#7dff6b'); });
    room.onMessage('questdone', (m) => { sfx('task'); questDone(m); if (m.wins) flyWins(m.wins); });
    room.onMessage('authed', (m) => { S.name = m.name; });
    room.onMessage('snap', (m) => { P.snaps++; teleport(m.x, m.y, m.z); });
    room.onMessage('emote', (m) => { const r = remotes.get(m.s); if (r && r.char.blox) playEmoteOn(r.char.blox, m.id); });
    room.onMessage('chat', (m) => { const r = remotes.get(m.s); if (r) chatBubble(r.char.root, m.text); else if (m.s === room.sessionId && me) chatBubble(me.root, m.text); });
    // ----- Rift Rush -----
    room.onMessage('mQueue', (m) => {
        if (m.off) { S.queued = false; queueState(null); return; }
        const was = S.queued ? S.qFound : 0;
        S.queued = true; S.qFound = m.found;
        if (was && m.found > was) sfx('found');
        queueState(m);
    });
    room.onMessage('mStart', (m) => enterMatch(m));
    room.onMessage('mSync', (m) => { if (A && A.id === m.start.id) applySync(m); else { pendingSync = m; enterMatch(m.start); } });
    room.onMessage('mNone', (m) => { if (A) leaveMatch(m, null); });
    room.onMessage('mJoined', (m) => { toast('🏃 ' + m.name + ' joined the race!', '#7af4ff'); sfx('found'); if (A) { const n = A.names.find((x) => x.spot === m.spot); if (n) n.n = m.name; setScores(A); } });
    room.onMessage('mLeft', (m) => { toast(m.name + ' left: a bot takes over', '#c8d0dc'); });
    room.onMessage('mGo', (m) => {
        if (!A) return;
        A.phase = 'play'; A.endsAt = m.at + m.secs * 1000;
        showCount('RUN!'); setTimeout(() => showCount(null), 800);
        sfx('go');
        matchHud({ left: m.secs });
    });
    room.onMessage('mScore', (m) => { if (!A) return; A.scores = m.s; setScores(A); });
    room.onMessage('mOut', (m) => {
        if (!A) return;
        if (m.spot === A.spot) { A.out = true; sfx('caught'); rumble(0.9, 300); bigText('THE AVALANCHE GOT YOU!', '#bfe8ff'); }
        else toast('❄️ ' + m.name + ' was buried by the avalanche!', '#bfe8ff');
        const row = A.scores.find((r) => r[0] === m.spot);
        if (row) row[3] = 1;
        setScores(A);
    });
    room.onMessage('mDone', (m) => {
        if (!A) return;
        A.endsAt = m.endAt;
        if (m.spot === A.spot) { A.done = true; sfx('win'); screenConfetti(90); bigText(m.place === 0 ? 'YOU WIN!' : 'ESCAPED!', '#ffe24a'); }
        else toast('🏁 ' + m.name + ' escaped!', '#ffe24a');
        const row = A.scores.find((r) => r[0] === m.spot);
        if (row) row[2] = m.place;
        setScores(A);
    });
    room.onMessage('mTime', () => { if (A) { A.phase = 'done'; showCount('TIME!'); sfx('whoosh'); } });
    room.onMessage('mEnd', (m) => leaveMatch(m, m));
    room.onMessage('mBack', (m) => leaveMatch(m, null));
    room.onLeave((code) => {
        if (code === 4000) { $('#connectErr').textContent = 'You joined from somewhere else.'; }
        else $('#connectErr').textContent = 'Lost the connection to the server.';
        $('#start').hidden = false; $('#connectErr').hidden = false; $('#retryBtn').hidden = false; $('#loading').textContent = '';
        running = false; connLost = true;
        audioAway(true);
    });
    return room;
}
// caught by a Shade: down where you stand; revive here for Gems, or back to the stage's gate
function onCaught(m) {
    P.down = true; P.downPred = clockT;
    P.b.vx = P.b.vz = 0;
    flushSteps();
    sfx('caught');
    rumble(1, 400);
    shake = Math.max(shake, 0.8);
    const w = S.world || 0;
    bigText('CAUGHT!', '#ff5a7a');
    reviveShow({ who: m.k === WALLS_N - 1 ? WORLDS[w].bossName : WORLDS[w].shadeName, k: m.k, gems: m.gems, secs: m.secs, have: S.gems || 0 });
}
// a quick way round: behind a short fade
async function warpTo(x, y, z) {
    if (A || enteringMatch) return;
    switching = true;
    await fadeOut();
    if (A || enteringMatch) return;
    switching = false;
    teleport(x, y || 0, z, Math.PI);
    fadeIn();
    FX.sparkleColumn(P.b, 0x7dff6b);
}
// a Win Pad: Wins, and on you go
function onPadOk(m) {
    sfx('win');
    winPop(m.n);
    flyWins(m.n);
    FX.coinBurst(FX.tmpV.set(P.b.x, P.b.y + 3, P.b.z));
    confetti(P.b);
    if (!lowQ) screenConfetti(m.first ? 40 : 20);
    S.wins += m.n; S.totalWins += m.n;
    P.padT[m.k] = clockT;
    if (view) view.setPad(m.k, false);
    const best = (S.bests && S.bests[S.world || 0]) || 0;
    if (m.k + 1 > best) S.bests = { ...S.bests, [S.world || 0]: m.k + 1 };
    updateHud();
    if (m.first) toast('🏆 First time on this pad: x3!', '#ffe24a');
    // new shoes you can buy: one tap, here (the live stats: players had the Wins for the Fuzzy Slippers and never found the shop)
    const si = S.shoe || 0, next = SHOES[si + 1];
    if (next && S.wins >= next.wins && !shoeOffered.has(si)) {
        shoeOffered.add(si);
        setTimeout(() => {
            // (only while you're still at the pad: a pop-up stops you, and running on into the next stage there's a Wobbler behind)
            if (anyPopup() || A || (S.shoe || 0) !== si || S.wins < next.wins || Math.abs(P.b.z - padAt(m.k).z) > W.padR + 8) { shoeOffered.delete(si); return; }
            askConfirm('👟', 'NEW SHOES!', next.name + ': +' + fmt(next.add) + ' Speed every step you take', 'BUY · ' + fmt(next.wins) + ' 👑', () => net.send('shoe', {}));
        }, 450);
    }
    setTimeout(offerDaily, 2500);
}
const shoeOffered = new Set();
// the daily reward pops up only on the ground, between things
function offerDaily() {
    if (!running || A || !P.b.onGround || anyPopup() || offerDaily.done || P.b.z < W.plaza.z0) return;
    if (!dailyStatus(S.daily, net.now()).can) return;
    offerDaily.done = true;
    openPanel('daily');
}
async function playEmoteOn(avatar, id) {
    if (!avatar) return;
    const cat = await BX.loadEmotes();
    const e = cat.get(id);
    if (e && e.clip) avatar.playEmote(e.clip);
}
function chatBubble(group, text) {
    if (!group) return;
    if (group.userData.bubbleLbl) { group.remove(group.userData.bubbleLbl); group.userData.bubbleLbl.material.map.dispose(); }
    const lb = billboard([{ t: '💬 ' + text, c: '#ffffff', s: '#10203a', px: 44 }], 9, 1024, new V3(0, 11, 0), group);
    group.userData.bubbleLbl = lb;
    setTimeout(() => { if (group.userData.bubbleLbl === lb) { group.remove(lb); lb.material.map.dispose(); group.userData.bubbleLbl = null; } }, 5000);
}

// =====================================================================================
// Every frame
// =====================================================================================
let clockT = 0, slowT = 0, pingT = 0, metaT = 20;
// who's squashing the jelly this frame: you, the nearest others, the Wobblers (each Wobbler's hops send a big ripple out)
function jellyPresses(t) {
    jellyPressBegin();
    const b = P.b, lift = b.onGround ? 0 : Math.max(0, b.y - (P.groundY || 0));
    jellyPress(P.vx, P.vz, 2.9, clamp(1 - lift / 2.5, 0, 1));
    let n = 1;
    for (const r of remotes.values()) {
        if (n >= 5) break;
        if (!r.here || r.x === undefined || Math.abs(r.z - P.vz) > 80 || Math.abs(r.x - P.vx) > 80) continue;
        jellyPress(r.x, r.z, 2.9, (r.y || 0) > 1.5 ? 0 : 1);
        n++;
    }
    for (const s of shades) {
        if (!s.used || !s.obj.root.visible) continue;
        const o = s.obj.root.position, sc = s.boss ? 1.8 : 1;
        // (still dropping in from the sky: nothing squashed yet; the splat comes when it lands)
        if (o.y > 3) { s.hitT = -9; continue; }
        jellyPress(o.x, o.z, 5.4 * sc, 1);
        if (!s.hooked && t - (s.hitT || -9) > 0.42) { s.hitT = t; jellyHit(o.x, o.z, 1.6 * sc); }
    }
    jellyPressEnd();
}
function update(dt) {
    clockT += dt;
    const t = clockT;
    CU.uNow.value = rel(net.now());
    lowQ = getQuality() === 'low';
    pumpAvatars();
    beginPals();
    if (!A) updateGates(false);
    updateMe(dt);
    updateSteps();
    updatePrompt();
    syncRemotes(dt, t);
    const near = updateShades(dt, t);
    jellyPresses(t);
    stageHud(near);
    updateGuide(t);
    contactShadows();
    endPals();
    chipsTick();
    // (the blades swing on the server's own seconds: the same clock the hits below use)
    if (view && !A) view.update(net.now() / 1000, camera.position.x, camera.position.z, clockT);
    updateEffects(dt);
    updateFx(dt);
    S.powerShown = speedNow();
    S.runV = P.v;
    animateCounters(dt);
    if (A) matchTick(dt);
    slowT -= dt;
    if (slowT <= 0) {
        slowT = 1;
        S.x2 = (S.x2Until || 0) > net.now();
        S.frontTxt = 'Stage ' + (frontier() + 1);
        if (view && !A) for (let k = 0; k < WALLS_N; k++) view.setPad(k, padReady(k));
        updateHud();
    }
    pingT -= dt;
    if (pingT <= 0) { pingT = pingEvery(); pingSend(); }
    metaT -= dt;
    if (metaT <= 0) { metaT = 30; sendMeta(); }
}
// the contact shadows (Low quality): under you and everyone near
function contactShadows() {
    SH.shadowsOn(lowQ);
    if (!lowQ) { SH.begin(); SH.end(); return; }
    SH.begin();
    SH.add(P.vx, 0, P.vz, Math.max(0, P.vy), 3);
    for (const r of remotes.values()) if (r.here && r.x !== undefined) SH.add(r.x, 0, r.z, Math.max(0, r.y), 3);
    SH.end();
}
const AMB = { jingle: { color: 0xffffff, dir: -0.7, snow: true }, ginger: { color: 0xffe0a0, dir: 0.3, snow: false }, frost: { color: 0xffffff, dir: -0.55, snow: true }, star: { color: 0xffe8ff, dir: 0.25, snow: false } };
function updateCameraAll(dt) {
    updateCamera(dt);
    const t = clockT;
    if (shadowDue()) snapShadow(FX.tmpV.set(P.b.x, P.b.y, P.b.z));
    updateSky(camera.position, t, dt);
    const w = A ? A.w : S.world;
    updateAmbient(camera.position, t, AMB[WORLDS[w || 0].mood] || AMB.jingle);
    // speed lines at the edges: running fast, dashing, boosted
    const hv = Math.hypot(P.b.vx, P.b.vz);
    // (not on Low: drawing them is a canvas's worth of work every frame)
    setSpeedLines(lowQ ? 0 : clamp((hv - 30) / 40, 0, 1), dt);
}

// ----- play stats: how the game runs on this device and any error it hit -----
const fpsWin = { sum: 0, n: 0 }, errSeen = new Set(), errQueue = [];
let metaFirst = true, loadSecs = 0, lastFps = 60;
function noteError(msg, src, line, col) {
    const file = src ? String(src).split('/').pop().split('?')[0] : '';
    const k = String(msg || '?').slice(0, 150) + (file ? ' @' + file + ':' + (line || 0) + ':' + (col || 0) : '');
    if (errSeen.has(k) || errSeen.size >= 20) return;
    errSeen.add(k); errQueue.push(k);
}
window.addEventListener('error', (e) => noteError(e.message, e.filename, e.lineno, e.colno));
window.addEventListener('unhandledrejection', (e) => noteError('promise: ' + ((e.reason && e.reason.message) || e.reason)));
addEventListener('pagehide', () => { if (running) sendMeta(); });
let gpuNameCache = null;
function gpuName() {
    if (gpuNameCache !== null) return gpuNameCache;
    gpuNameCache = GPU_NAME.slice(0, 90) + (renderer.getContext().getContextAttributes().antialias ? '' : ' (no AA)');
    return gpuNameCache;
}
function sendMeta() {
    const m = { touch: isTouch, fps: fpsWin.n ? Math.round(fpsWin.sum / fpsWin.n) : lastFps, q: getQuality(), errs: errQueue.splice(0, 5) };
    fpsWin.sum = 0; fpsWin.n = 0;
    if (metaFirst) { metaFirst = false; Object.assign(m, { gpu: gpuName(), load: loadSecs, dpr: Math.round(devicePixelRatio * 100) / 100, w: innerWidth, h: innerHeight, cores: navigator.hardwareConcurrency || 0, mem: navigator.deviceMemory || 0 }); }
    net.send('meta', m);
}

// ----- the smoothness watch (every half second): the resolution adapts first, then the quality -----
const fpsWatch = { t: 0, avg: 60, low: 0, good: 0, trial: null, cpuUntil: 0, fails: 0, upAt: -99, upFrom: 1, ceil: 1, ceilUntil: 0, holdUntil: 0, lows: 0 };
// a world switch builds things for a moment: the watcher looks away for a few seconds
function holdFpsWatch(secs) { fpsWatch.holdUntil = fpsWatch.t + (secs || 4); fpsWatch.avg = Math.max(fpsWatch.avg, 58); }
let watchOff = false;
function watchFps(fps) {
    if (!running || document.hidden || watchOff) return;
    const w = fpsWatch;
    w.t += 0.5;
    // a single stall (one slow half-second) doesn't count: only two in a row do
    w.lows = fps < 45 ? w.lows + 1 : 0;
    if (w.lows === 1 && fps < 45) return;
    w.avg += (fps - w.avg) * 0.35;
    if (w.t < 3 || w.t < w.holdUntil) return;
    if (w.t > w.ceilUntil) w.ceil = 1;
    if (w.trial) {
        if (w.t - w.trial.at < 2) return;
        if (w.avg < w.trial.fps * 1.06) { setResScale(w.trial.prev); w.fails++; w.cpuUntil = w.t + Math.min(240, 30 * w.fails); } else w.fails = 0;
        w.trial = null;
        return;
    }
    const scale = getResScale();
    // high frame rates first: below 54 a 60 Hz screen is already missing frames
    if (w.avg < 54 && w.t > w.cpuUntil && scale > 0.56) {
        if (w.t - w.upAt < 6) { w.ceil = w.upFrom; w.ceilUntil = w.t + 60; }
        w.trial = { at: w.t, fps: w.avg, prev: scale };
        setResScale(scale * 0.85);
        w.good = 0;
        return;
    }
    if (w.avg >= 57) {
        w.good += 0.5;
        if (w.good >= 6 && scale < w.ceil - 0.01) { w.good = 0; w.upAt = w.t; w.upFrom = scale; setResScale(Math.min(w.ceil, scale / 0.88)); }
    } else w.good = 0;
    if (!autoQualityAllowed()) return;
    w.low = w.avg < 45 && (scale <= 0.56 || w.t < w.cpuUntil) ? w.low + 0.5 : 0;
    if (w.low < 3) return;
    w.low = 0;
    const next = { high: 'medium', medium: 'low' }[getQuality()];
    if (!next) return;
    setQuality(next, true, w.t < 45);
    if (next === 'low') musicLite(true);
    toast('⚙️ Graphics set to ' + (next === 'medium' ? 'Medium' : 'Low') + ' for smoother play', '#7de8ff');
}
// Even frame pacing: on a fast screen (120 Hz and up) a frame that misses the refresh waits for the next one, so
// a game running between half and full rate shows frames of uneven length (a stutter, though the FPS is high).
// When most frames miss and some don't, it draws every other refresh instead: an even 72 on a 144 Hz screen.
const ivs = [];
let refreshMs = 0, paceN = 0, strikes = 0, pacedAt = 0, paced = false, trial = false;
function noteInterval(ms) { if (ms > 2 && ms < 60 && ivs.length < 400) ivs.push(ms); }
function paceFrames() {
    if (!running || document.hidden || isTouch) return;
    const now = performance.now();
    if (paced) { if (now - pacedAt > 30000) { paced = false; skipOdd = false; trial = true; ivs.length = 0; } return; }
    if (ivs.length < 200) return;
    paceN++;
    const s = ivs.slice().sort((a, b) => a - b), p10 = s[Math.floor(s.length * 0.1)];
    refreshMs = refreshMs ? Math.min(refreshMs, p10) : p10;
    const late = s.filter((v) => v > refreshMs * 1.5).length / s.length;
    ivs.length = 0;
    const uneven = refreshMs < 9 && late > 0.25 && late < 0.9;
    strikes = uneven ? strikes + 1 : 0;
    if ((trial && uneven) || (paceN > 3 && strikes >= 2 && fpsWatch.t >= fpsWatch.holdUntil)) {
        paced = true; skipOdd = true; pacedAt = now; strikes = 0;
        console.info('[pace] every other refresh (' + Math.round(500 / refreshMs) + ' FPS), ' + Math.round(late * 100) + '% of frames were late');
    }
    trial = false;
}
const perf = { n: 0, sum: 0, max: 0, last: 0 };
const spikes = [], slowParts = [];
let secAvg = {};
let frameErrors = 0, lastFrame = 0, loadingSignaled = false, fpsAcc = 0, fpsFrames = 0, skipOdd = false, oddFrame = false;
let rafN = 0, frameDt = 0;
// scrolled out of view in a feed (the page doesn't count as hidden then): no sound, nothing worked out or drawn
let offscreen = false;
if ('IntersectionObserver' in window) new IntersectionObserver((es) => { offscreen = !es[es.length - 1].isIntersecting; audioAway(offscreen || connLost); }).observe($('#app'));
function frame(now) {
    requestAnimationFrame(frame);
    if (offscreen) { lastFrame = 0; return; }
    rafN++;
    if (skipOdd) { oddFrame = !oddFrame; if (oddFrame) return; }
    frameDt = (now - (lastFrame || now)) / 1000;
    const dt = Math.min(0.05, frameDt);
    if (lastFrame && !skipOdd) noteInterval(now - lastFrame);
    fpsAcc += (now - (lastFrame || now)) / 1000; fpsFrames++;
    if (fpsAcc >= 0.5) {
        const fps = fpsFrames / fpsAcc;
        lastFps = Math.round(fps);
        if (running && !document.hidden) { fpsWin.sum += fps; fpsWin.n++; }
        if (showFps) $('#fps').textContent = lastFps + ' FPS';
        if (isTouch && !skipOdd && fps > 100) skipOdd = true;
        // drawing every other refresh only makes sense on a fast screen keeping up: if the refreshes themselves are slow, draw them all
        if (skipOdd && rafN / fpsAcc < 95) { skipOdd = false; paced = false; pacedAt = 0; }
        rafN = 0;
        paceFrames();
        watchFps(fps); fpsAcc = 0; fpsFrames = 0;
    }
    if (lastFrame && now - lastFrame > 45 && spikes.length < 60) spikes.push({ at: Math.round(now), ms: Math.round(now - lastFrame), work: +perf.last.toFixed(1), res: getResScale() });
    lastFrame = now;
    if (!loadingSignaled) { loadingSignaled = true; BX.triggerAllSettings(); }
    if (epochSet) CU.uNow.value = rel(net.now());
    pollGamepad();
    padButtons(dt);
    if (running) {
        const w0 = performance.now();
        try {
            prof.start();
            update(dt);
            prof.mark('update');
            updateCameraAll(dt);
            // the jelly in view (its chunks are re-chosen only when the camera's view of them changes)
            if (A) { if (A.view && A.view.jelly) A.view.jelly.update(camera); } else if (view && view.jelly) view.jelly.update(camera);
            prof.mark('camera+sky');
            render();
            prof.mark('render');
        } catch (e) {
            if (frameErrors++ < 5) console.error('[frame]', e);
            const at = String((e && e.stack) || '').split('\n').find((l) => /:\d+:\d+/.test(l)) || '';
            noteError('[frame] ' + ((e && e.message) || e), '', 0, 0);
            if (at) noteError('[frame at] ' + at.trim().slice(-120));
        }
        const w = performance.now() - w0;
        perf.n++; perf.sum += w; perf.max = Math.max(perf.max, w); perf.last = w;
        for (let i = 0; i < prof.parts.length; i += 2) secAvg[prof.parts[i]] = (secAvg[prof.parts[i]] || 0) + prof.parts[i + 1];
        secAvg.n = (secAvg.n || 0) + 1;
        if (w > 50 && slowParts.length < 20) { const o = {}; for (let i = 0; i < prof.parts.length; i += 2) o[prof.parts[i]] = +(o[prof.parts[i]] || 0) + +prof.parts[i + 1].toFixed(1); slowParts.push({ at: Math.round(now), ms: Math.round(w), calls: renderer.info.render.calls, prog: renderer.info.programs.length, ...o }); }
    }
}

// =====================================================================================
// Boot: build everything behind the loading screen, join, play (no start menu)
// =====================================================================================
function loadingText(t) { $('#loading').textContent = t; }
let joining = false, joinTask = null, worldReady = null;
async function joinServer() {
    const endpointTask = serverEndpoint();
    endpointTask.catch(() => {});
    await waitForLogin(400);
    const saved = (storageGet('jjd1_name') || '').slice(0, 20);
    for (let attempt = 0; ; attempt++) {
        try { return await connect(BX.identity().loggedIn ? '' : saved, attempt === 0 ? await endpointTask : null); } catch (e) {
            if (attempt >= 4) throw e;
            console.warn('[join] attempt', attempt + 1, 'failed:', e && e.message);
            loadingText('Waking up a server…');
            await sleep(2000 * (attempt + 1));
        }
    }
}
function waitForLogin(ms) {
    if (!BX.bloxity.ready || BX.identity().loggedIn) return Promise.resolve();
    return new Promise((res) => { const t0 = performance.now(); (function check() { if (BX.identity().loggedIn || performance.now() - t0 > ms) res(); else setTimeout(check, 100); })(); });
}
async function play() {
    if (joining || running) return;
    joining = true;
    $('#connectErr').hidden = true; $('#retryBtn').hidden = true;
    if (!joinTask) joinTask = joinServer();
    initAudio();
    try {
        await worldReady;
        loadingText('Joining a server…');
        $('#loadBar').style.width = '92%';
        BX.loadingStep('Joining a server…');
        await joinTask;
        const t0 = performance.now();
        while (!gotProfile && performance.now() - t0 < 6000) await sleep(50);
    } catch (e) {
        joinTask = null;
        console.error(e);
        joining = false;
        loadingText('');
        $('#connectErr').hidden = false;
        $('#connectErr').textContent = 'Could not reach the game server. Check your connection and try again.';
        $('#retryBtn').hidden = false;
        BX.loadingEnd();
        return;
    }
    joining = false;
    if (connLost) { BX.loadingEnd(); return; }
    // your world (the one you were in last time)
    if (S.world !== view.w) buildView(S.world);
    updateGates(true);
    setProgress();
    running = true;
    S.joinedAt = Date.now();
    if (!me) buildMe();
    me.setTrail(S.trail); me.setAura(S.aura);
    const p = net.room.state.players.get(net.room.sessionId);
    teleport(p ? p.x : W.spawn.x, 0, p ? p.z : W.spawn.z, Math.PI);
    cam.yaw = 0; cam.pitch = 0.2;
    loadingText('Almost there…');
    $('#loadBar').style.width = '100%';
    await primeFrames();
    if (connLost) { BX.loadingEnd(); return; }
    // everyone's avatar made behind the loading screen too
    { const t0 = performance.now(); while (avatarsPending() && performance.now() - t0 < 2000) await sleep(30); }
    fpsAcc = 0; fpsFrames = 0;
    // until a song's first loop is rendered it plays note by note (~100 audio nodes a second): fine on a PC, not on
    // a phone or a weak laptop (Low), which waits for the loop in silence
    allowLiveMusic(getQuality() !== 'low');
    startMusic();
    setMusicMode('plaza');
    $('#start').hidden = true;
    $('#start').style.opacity = '';
    $('#hud').hidden = false;
    measureHud();
    updateHud();
    showTips();
    if (!S.pads) {
        setTimeout(() => bigText('EVERY STEP IS SPEED!', '#7af4ff'), 500);
        setTimeout(() => toast(isTouch ? '👟 Run, or hold DASH on a treadmill. Then follow the arrows!' : '👟 Run (WASD), or hold Shift on a treadmill. Then follow the arrows!', '#ffffff'), 1600);
    } else toast('👋 Welcome back, ' + (S.name || 'Runner') + '!', '#ffffff');
    setTimeout(() => { if (audioSuspended()) toast('🔊 Tap anywhere for sound!', '#7de8ff'); }, 3500);
    // the daily reward: straight away for someone back, after the first Win Pad for someone new
    if (S.pads) setTimeout(offerDaily, 1500);
    canvas.focus();
    loadSecs = Math.round(performance.now() / 100) / 10;
    metaT = 8;
    BX.loadingEnd();
}
async function primeFrames() {
    $('#start').style.opacity = '0.985';
    $('#hud').hidden = false;
    try { await Promise.race([renderer.compileAsync(scene, camera), sleep(1500)]); } catch (e) { /* compiles on first use */ }
    for (let i = 0; i < 4; i++) await new Promise((r) => { requestAnimationFrame(r); setTimeout(r, 120); });
    const gl = renderer.getContext();
    if (!gl.fenceSync) return;
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const t0 = performance.now();
    while (gl.clientWaitSync(sync, 0, 0) === gl.TIMEOUT_EXPIRED && performance.now() - t0 < 1500) await sleep(15);
    gl.deleteSync(sync);
}
let tipsT0 = 0, tipsT1 = 0;
function showTips() {
    if (isTouch && !padMode) return;
    const el = $('#tips');
    const k = (key, what) => `<span><kbd>${key}</kbd>${what}</span>`;
    el.innerHTML = padMode
        ? k('L stick', 'Run') + k('A', 'Jump') + k('RT', 'DASH / sprint') + k('R stick', 'Camera') + k('Y', 'Use / to a stage') + k('LB', 'Race') + k('RB', 'Pace') + k('D-pad', 'Menus') + k('Start', 'Settings')
        : k('WASD', 'Run') + k('Space', 'Jump') + k('Shift', 'DASH / sprint') + k('Drag', 'Camera') + k('E', 'Use') + k('P', 'Race') + k('B', 'To a stage') + k('L', 'Pace') + k('R', 'Home');
    el.hidden = false; el.style.opacity = 1;
    clearTimeout(tipsT0); clearTimeout(tipsT1);
    tipsT0 = setTimeout(() => { el.style.opacity = 0; }, 12000);
    tipsT1 = setTimeout(() => { el.hidden = true; }, 12900);
}
function unlockAudioOnGesture() {
    // (kept on: a phone call or another app can stop the sound again, and only a touch brings it back)
    const unlock = () => { if (audioSuspended()) resumeAudio(); };
    for (const ev of ['pointerdown', 'pointerup', 'keydown', 'touchstart', 'touchend', 'click']) addEventListener(ev, unlock, true);
}
function wirePortalSettings() {
    const embedded = (fn) => (v) => { if (BX.isEmbedded()) fn(v); };
    const pct = (v) => { const n = parseFloat(String(v)); if (!isFinite(n)) return undefined; return clamp(n > 1 ? n / 100 : n, 0, 1); };
    BX.listenSetting('master_volume', embedded((v) => { const p = pct(v); if (p !== undefined) setVolume('master', p); }));
    BX.listenSetting('music_volume', embedded((v) => { const p = pct(v); if (p !== undefined) setVolume('music', p); }));
    BX.listenSetting('graphics_quality', embedded((v) => { setQuality(v === 'Low' ? 'low' : v === 'Medium' ? 'medium' : 'high', true); musicLite(v === 'Low'); }));
    BX.listenSetting('camera_sensitivity', embedded((v) => { camSens = clamp(parseFloat(v) || 1, 0.1, 5); }));
    BX.listenSetting('show_fps', (v) => { showFps = v === 'true'; $('#fps').hidden = !showFps; });
}
function wirePortalEvents() {
    BX.onPortalEvent((event, data) => {
        if (event === 'respawn_request') { if (running) goTo('spawn'); }
        else if (event === 'open_daily') openPanel('daily');
        else if (event === 'chat_message_sent' && data) net.send('chat', { text: String(data) });
        else if (event === 'play_emote' && data) { if (me) playEmoteOn(me.blox, String(data)); net.send('emote', { id: String(data) }); }
    });
    BX.onAvatarChanged(() => syncMyAvatar());
    BX.onProportionsChanged(() => syncMyAvatar());
}
// The HUD's words and emoji painted for a few frames behind the loading screen, in the fonts and sizes
// the game uses: the first time a glyph (an emoji above all, on Windows) is drawn costs a long pause.
async function warmHudText() {
    const lines = [['🛒📋🔄✨📅🌈🌍⚙️🎁💎🎄🍪❄️🌟', 2.3], ['🔊🔇🏆🎯✅⭐🎡🏁👑😖⬆️🏳️👟🎀🍬🔔', 1.8], ['🥉🥈🥇💠🔒🔓⏱💬👋🛍️🏃🎉⏳📶🐢🐾🎅', 1.4], ['⚡🛡️🦘💥🍀🏠🎟️🚫✓✕−+🎮', 2.6]];
    const d = document.createElement('div');
    d.style.cssText = 'position:absolute;left:0;top:0;width:3000px;opacity:0.01;pointer-events:none;z-index:1';
    d.innerHTML = lines.map(([em, s]) => `<div style="font-size:${s}rem;white-space:nowrap">${em}</div>`).join('')
        + [['var(--chunky)', 3, 400, 'o'], ['var(--chunky)', 2, 400, 'o'], ['var(--font)', 2.3, 700, 'o'], ['var(--font)', 1.1, 700, 'o1']]
            .map(([f, s, w, c]) => `<div class="${c}" style="font-family:${f};font-size:${s}rem;font-weight:${w};white-space:nowrap">Level Up! Speed (→) WINS SHOES FOR FREE! X2 0123456789 Stage Avalanche Rush PLAY DASH CAUGHT! K M B / MAX</div>`).join('');
    document.body.appendChild(d);
    for (let i = 0; i < 3; i++) await new Promise((r) => { requestAnimationFrame(r); setTimeout(r, 150); });
    d.remove();
    // and once in a canvas (name tags, chat bubbles and signs are drawn there)
    const cv = document.createElement('canvas'); cv.width = 1200; cv.height = 140;
    const cx = cv.getContext('2d');
    for (const px of [36, 44, 52, 70, 76]) { cx.font = '700 ' + px + 'px Fredoka, "Arial Rounded MT Bold", sans-serif'; cx.fillText('💬💎👑🔒🏆✓ Lv. 0123456789 Speed Wins Stage', 4, 100); }
}
async function prepareWorld() {
    const step = (t, k) => { loadingText(t); BX.loadingStep(t); if (k) $('#loadBar').style.width = Math.round(k * 100) + '%'; };
    step('Loading fonts…', 0.08);
    try { await Promise.race([Promise.all([document.fonts.load('700 40px Fredoka'), document.fonts.load('400 40px "Luckiest Guy"')]), sleep(2500)]); } catch (e) { /* fallback font */ }
    await warmHudText();
    step('Wobbling the jelly…', 0.18);
    buildView(0);
    SH.initShadows();
    await pause();
    step('Waking the Wobblers…', 0.36);
    await buildAsmr(pause);
    musicLite(getQuality() === 'low');
    prerenderMusic();
    // every HUD screen and panel painted once, invisibly (the browser compiles how to draw them now)
    step('Lacing up…', 0.55);
    {
        const hud = $('#hud');
        hud.hidden = false; hud.classList.add('warmui');
        measureHud();
        const lite = getQuality() === 'low', endPanels = warmPanels(lite);
        for (let i = 0; i < (lite ? 2 : 4); i++) await new Promise((r) => { requestAnimationFrame(r); setTimeout(r, 120); });
        endPanels();
        hud.classList.remove('warmui'); hud.hidden = true;
    }
    // the warm-up: every shader the game uses (the Jelly Run's, the Wobblers', the pets', a race's, every effect) compiled and drawn
    // once now, not in play
    step('Getting ready to run…', 0.75);
    const extras = [fxWarmGroup()];
    for (const g of extras) { g.position.set(0, -60, 0); scene.add(g); }
    beginPals(); chipsWarm(); palsWarm();
    const sg = new T.Group(); sg.position.set(0, -60, 20); scene.add(sg); extras.push(sg);
    try { warmShades(sg); } catch (e) { console.warn('[warm shades]', e); }
    let warmA = null;
    try { warmA = buildArena(arenaPlan(7, 14), 0, SPOT_COL, getQuality() === 'low', 0); } catch (e) { console.warn('[warm]', e); }
    try {
        const base = await Promise.race([loadBase(), sleep(4000)]);
        const a = base ? await createAvatar(null) : null;
        if (a) { a.root.position.set(0, -60, 10); a.update(1 / 60, { t: 0 }); scene.add(a.root); extras.push(a.root); }
    } catch (e) { /* the avatar's shaders compile when it first shows */ }
    fxShowAll(true);
    if (view && view.jelly) view.jelly.showAll();
    if (view && view.stageFx) view.stageFx.showAll(true);
    if (warmA && warmA.jelly) warmA.jelly.showAll();
    camera.position.set(0, 60, 130); camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
    gpuName();
    try { await Promise.race([renderer.compileAsync(scene, camera), sleep(1500)]); } catch (e) { /* later */ }
    const culled = [];
    scene.traverse((o) => { if ((o.isMesh || o.isPoints || o.isSprite || o.isLine) && o.frustumCulled) { o.frustumCulled = false; culled.push(o); } });
    render();
    for (const o of culled) o.frustumCulled = true;
    await pause();
    fxShowAll(false);
    if (view && view.stageFx) view.stageFx.showAll(false);
    for (const g of extras) scene.remove(g);
    if (warmA) warmA.dispose();
    beginPals(); endPals();
    setMood(WORLDS[view.w].mood, true);
    console.info('[prewarm] ready,', renderer.info.programs.length, 'shaders');
}
async function boot() {
    installIcons();
    BX.initBloxity();
    joinTask = joinServer();
    joinTask.catch(() => {});
    loadBase().catch(() => {});
    worldReady = prepareWorld();
    wirePortalSettings();
    wirePortalEvents();
    BX.onIdentity((id) => {
        if (net.room && id.loggedIn && id.token && !net.bloxity) net.send('auth', { token: id.token });
        if (net.room) { setupLocalAvatar(); syncMyAvatar(); }
    });
    addEventListener('pagehide', () => { try { if (net.room) net.room.leave(true); } catch (e) { /* closing anyway */ } });
    $('#retryBtn').addEventListener('click', () => location.reload());
    unlockAudioOnGesture();
    requestAnimationFrame(frame);
    play();
}
boot();

// =====================================================================================
// QA: the autopilot and hooks for the test scripts
// =====================================================================================
if (import.meta.env.DEV || import.meta.env.VITE_QA) {
    window.__qa = {
        P, S, cam, net, scene, camera, me: () => me, renderer: () => renderer, audio: () => audioDebug(), actions, view: () => view, match: () => A, gates,
        state: () => ({ world: S.world, x: +P.b.x.toFixed(2), y: +P.b.y.toFixed(2), z: +P.b.z.toFixed(2), onGround: P.b.onGround, wins: S.wins, gems: S.gems, lv: S.lv, xp: S.xp, speed: S.powerShown, v: +P.v.toFixed(1), rebirths: S.rebirths, shoe: S.shoe, steps: S.steps, cleared: S.cleared, escapes: S.escapes, catches: S.catches, megas: S.megas, pads: S.pads, bests: S.bests, gateOpen: gates.open, stage: stageAt(P.b.z), tread: P.tread, down: P.down, snaps: P.snaps, programs: renderer.info.programs.length, prompt: activePrompt && activePrompt.label(), q: getQuality(), others: remotes.size, qi: S.qi, queued: !!S.queued, match: A ? { phase: A.phase, lv: A.lv, w: A.w, spot: A.spot, n: A.plan.n, secs: A.D.secs, done: A.done, out: A.out, scores: A.scores, finish: A.plan.finish } : null, matches: S.matches, matchWins: S.matchWins, hatched: S.hatched, team: S.team }),
        auto: (on) => { P.auto = on === false ? null : true; },
        key: (code, down) => { keys[code] = !!down; if (down && code === 'Space') P.jumpPress = clockT; },
        jump: () => { P.jumpPress = clockT; },
        dash,
        teleport: (x, y, z, yaw) => { net.send('qa', { tp: [x, y, z] }); teleport(x, y, z, yaw); },
        look: (yaw, pitch, dist) => { cam.yaw = yaw; cam.pitch = pitch; if (dist !== undefined) cam.dist = dist; },
        quality: (q) => setQuality(q),
        give: (o) => net.send('qa', o),
        send: (type, m) => net.send(type, m || {}),
        panel: (k, tab) => openPanel(k, tab),
        close: () => { let n = 0; while (closeTop() && n < 9) n++; return n; },
        world: (w) => switchWorld(w, W.spawn.x, W.spawn.z),
        play: (m) => { qaMap = m || null; pressPlay(); },
        perf: (reset) => { const r = { frames: perf.n, avgMs: +(perf.sum / Math.max(1, perf.n)).toFixed(2), maxMs: +perf.max.toFixed(1), fps: lastFps, calls: renderer.info.render.calls, tris: renderer.info.render.triangles, paced: skipOdd }; if (reset) { perf.n = 0; perf.sum = 0; perf.max = 0; } return r; },
        diag: () => { renderer.info.reset(); renderer.info.autoReset = false; render(); const r = { calls: renderer.info.render.calls, tris: renderer.info.render.triangles, ratio: renderer.getPixelRatio(), programs: renderer.info.programs.length }; renderer.info.autoReset = true; return r; },
        errors: () => [...errSeen],
        noWatch: (on) => { watchOff = on === undefined ? true : !!on; },
        hud: (on) => { $('#hud').style.display = on ? '' : 'none'; $('#touch').style.display = on ? '' : 'none'; },
        mood: (m) => setMood(m, true),
        shadeFade: (a, b) => SHADE_FADE.value.set(a, b),
        res: (k) => setResScale(k),
        gpu: () => gpuName(),
        spikes: () => spikes.splice(0),
        slow: () => slowParts.splice(0),
        sections: () => { const n = secAvg.n || 1, o = {}; for (const k in secAvg) if (k !== 'n') o[k] = +(secAvg[k] / n).toFixed(2); secAvg = {}; return o; },
        avatars: () => avatarsPending(),
        remotes: () => remotes,
        delays: () => [...remotes.values()].map((r) => Math.round(r.track.delay)),
        ui: { toast, bigText, popup, levelUp, winPop, hatchShow, reviveShow, reviveHide },
        padNav,
        guideTarget,
        checkpoint,
        northEnd,
        stageType: (k) => stagePlan(S.world || 0, k).type,
    };
}
void panelIs; void refreshPanels; void toggleMusic; void popup; void flyWins; void lvCap; void megaEveryOf; void chipBurst; void sun; void BELT;
