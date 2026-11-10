import { Room } from 'colyseus';
import { GameState, PlayerState } from './schema.js';
import {
    getProfile, hasProfile, markDirty, saveProfiles, adoptGuestProgress, loadProfile, releaseProfile,
    topProfiles, recordSession, saveSoon, USE_DB,
} from './profiles.js';
import { sealProfile, openSave } from './saves.js';
import { verifyBloxityToken } from './bloxity.js';
import { Match } from './Match.js';
import {
    CFG, WORLDS, WALLS_N, SHOES, TRAILS, AURAS, POSTS, postOpen, JAWBREAKERS, palById, palsOf, jbGems, teamMax, teamMult, SPIN, spinPrize, upgradeById, upgradeCost, jumpH, jumpPowerOf, xpNeed, lvCap, rebirthCost,
    stepGain, isMega, runSpeed, shadeRel, strideOf, stageNeed, stageV, gateLock, padPay, worldOpen, titleOf, TASKS, tasksFor, dayKey, QUESTS, DAILY, dailyStatus, GIFTS, CODES, PACKS, rewardText, rewardSpeed, clamp, BOT_NAMES, PLACES, PALS,
} from '../../shared/config.js';
import { W, hubFor, onPad, wallZ, padAt, nearPost, postSpot, northEnd, stageAt, checkpoint, BELT, stagePlan } from '../../shared/world.js';
import { newBody, stepBody, moveBudget } from '../../shared/physics.js';

const GREEN = '#7dff6b', GOLD = '#ffd028', RED = '#ff9a8a';
const cleanName = (name) => String(name || '').replace(/[^\w .\-]/g, '').trim().slice(0, 20);
const randomName = () => 'Runner' + Math.floor(1000 + Math.random() * 9000);
const finite = (v) => typeof v === 'number' && Number.isFinite(v);
const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
const num = (v, d) => (finite(v) ? v : d);
const rnd = (a, b) => a + Math.random() * (b - a);
const r1 = (v) => Math.round(v * 10) / 10;
// Guest ids come from the browser; they can never claim a Bloxity identity
const guestUid = (uid, fallback) => String(uid || fallback).replace(/^legion_/, 'guest_').slice(0, 64);
const cleanAvatar = (av) => (typeof av === 'string' && av.length <= 2000 ? av : '');
// the most a dash and a boost together make you go
const BURST = 2.0;

export const liveRooms = new Set();

// One server: up to 16 players training on the same plaza (a few bots keep it lively when it's quiet). Moving is client-side;
// every step, every gate, every Shade, every pad and everything that earns or costs anything is counted and checked here.
export class RunRoom extends Room {
    maxClients = CFG.maxPlayers;
    // (a real client sends well under a hundred: its moves, its steps, a ping)
    maxMessagesPerSecond = 160;

    onCreate() {
        liveRooms.add(this);
        this.setState(new GameState());
        this.setPatchRate(50);
        this.sessions = new Map();
        this.bots = [];
        this.race = new Match(this);
        const on = (type, fn) => this.onMessage(type, (client, m) => { try { fn.call(this, client, m || {}); } catch (e) { console.warn('[msg]', type, e.message); } });
        on('ping', (client, m) => client.send('pong', { c: num(m.c, 0), s: Date.now() }));
        on('move', this.onMove);
        on('step', this.onStep);
        on('pad', this.onPadTouch);
        on('warp', this.onWarp);
        on('fell', this.onFell);
        on('candy', this.onCandy);
        on('revive', this.onRevive);
        on('respawn', this.onRespawn);
        on('shoe', this.onBuyShoe);
        on('upgrade', this.onUpgrade);
        on('trail', this.onTrail);
        on('aura', this.onAura);
        on('post', this.onBuyPost);
        on('hatch', this.onHatch);
        on('team', this.onTeam);
        on('teamBest', this.onTeamBest);
        on('rebirth', this.onRebirth);
        on('world', this.onWorld);
        on('spin', this.onSpin);
        on('pack', this.onPack);
        on('x2', this.onX2);
        on('w2', this.onW2);
        on('tclaim', this.onTaskClaim);
        on('daily', this.onDaily);
        on('gift', this.onGift);
        on('code', this.onCode);
        on('tut', this.onTut);
        on('meta', this.onMeta);
        // (opening Quests: how far the daily tasks have got)
        on('want', (client) => { const s = this.sessions.get(client.sessionId), now = Date.now(); if (s && now - (s.wantAt || 0) > 1000) { s.wantAt = now; this.sendProfile(s); } });
        on('auth', this.onBloxityLogin);
        on('avatar', this.onAvatar);
        on('emote', this.onEmote);
        on('chat', this.onChat);
        on('play', (client, m) => { const s = this.sessions.get(client.sessionId); if (s && !s.down) this.race.press(s, m); });
        on('unplay', (client) => { const s = this.sessions.get(client.sessionId); if (s) this.race.cancel(s); });
        on('quit', this.onQuit);
        on('mItem', (client, m) => { const s = this.sessions.get(client.sessionId); if (s) this.race.item(s, m.i); });
        on('mFell', (client, m) => { const s = this.sessions.get(client.sessionId); if (s) this.race.fell(s, m.i); });
        on('mHit', (client) => { const s = this.sessions.get(client.sessionId); if (s) this.race.hit(s); });
        on('mFinish', (client) => { const s = this.sessions.get(client.sessionId); if (s) this.race.finish(s); });
        // QA only (QA=1, never on Legion): give yourself Wins, Gems, levels...
        if (process.env.QA === '1' && !process.env.BLOXITY_GAME_ID) on('qa', this.onQa);
        this.lastTick = Date.now();
        this.secAcc = 0;
        this.setSimulationInterval(() => this.update(), 50);
        this.clock.setInterval(() => this.broadcastBoards(), 10000);
        this.fillBots();
    }

    async onAuth(client, options) {
        const legion = options && options.token ? await verifyBloxityToken(options.token) : null;
        return legion ? { legion } : { guest: true };
    }

    async onJoin(client, options, auth) {
        options = options || {};
        const guest = guestUid(options.uid, client.sessionId);
        let uid = guest, name = cleanName(options.name);
        if (auth && auth.legion) {
            uid = 'legion_' + auth.legion.id;
            name = cleanName(auth.legion.name) || name;
            await adoptGuestProgress(uid, guest, name);
        }
        await loadProfile(uid);
        // (the guest's copy was only loaded to look at: once it's been handed over, it doesn't stay in this server's memory)
        if (uid !== guest && !isOnline(guest)) releaseProfile(guest, isOnline);
        // A fresh server on a temporary disk restores the browser's signed backup (never with a database)
        const restore = !USE_DB && !hasProfile(uid) && openSave(options.save, [uid, guest]);
        const profile = getProfile(uid, name, randomName());
        if (restore) { Object.assign(profile, restore); markDirty(); }
        this.fixProfile(profile);
        kickOthers(uid, null);
        const player = new PlayerState();
        player.name = profile.name;
        player.pid = this.freePid();
        player.av = cleanAvatar(options.av);
        const now = Date.now();
        Object.assign(player, { x: W.spawn.x + rnd(-4, 4), y: 0, z: W.spawn.z, ry: Math.PI, t: now, world: profile.world || 0 });
        this.state.players.set(client.sessionId, player);
        const s = {
            id: client.sessionId, client, profile, player, guest, joinedAt: now, lastChat: 0, playSecs: 0, dirtyAt: 0, sealAt: 0, ack: 0, tokens: 0, tokAt: 0, ttok: 0, ttokAt: 0,
            gifts: {}, last: { x: player.x, y: 0, z: player.z }, lastAt: now, snapAt: 0, warpAt: 0, stepAt: 0, distAcc: 0, fellAt: 0,
            shade: null, down: null, match: null, racer: null, queued: false,
            stats: {
                fresh: now - (profile.firstPlay || 0) < 60000, steps: 0, wins: 0, pads: 0, cleared: 0, best: 0, buys: 0, hatch: 0, lv0: profile.lv, rb0: profile.rebirths, matches: 0, matchWins: 0, caught: 0, escapes: 0,
                touch: false, fps: 0, fpsSum: 0, fpsN: 0, fpsMin: 0, q: '', gpu: '', load: 0, dev: null, errs: [], firstPadAt: 0, firstMatchAt: 0,
            },
        };
        this.sessions.set(client.sessionId, s);
        this.syncPublic(s);
        client.send('hello', { now, bloxity: uid.startsWith('legion_') });
        profile.lastSeen = now;
        this.sendProfile(s, true);
        this.broadcastBoards(client);
        this.fillBots();
    }
    freePid() {
        const used = new Set([...this.state.players.values()].map((p) => p.pid));
        for (let i = 1; i < 255; i++) if (!used.has(i)) return i;
        return 255;
    }
    // Older saves / hand-edited data: keep every field the right shape
    fixProfile(p) {
        for (const k of ['wins', 'totalWins', 'totalSpeed', 'topSpeed', 'gems', 'xp', 'speed', 'rebirths', 'shoe', 'trail', 'aura', 'steps', 'megas', 'cleared', 'escapes', 'catches', 'spins', 'spinsUsed', 'pads', 'upgrades', 'hatched', 'playtime', 'lastSeen', 'qi', 'tut', 'x2Until', 'w2Until', 'world', 'matches', 'matchWins', 'podium']) if (!finite(p[k]) || p[k] < 0) p[k] = 0;
        p.gems = Math.floor(p.gems);
        p.lv = clamp(Math.floor(num(p.lv, 1)), 1, 9999);
        p.qi = clamp(Math.floor(p.qi), 0, QUESTS.length);
        p.world = clamp(Math.floor(p.world), 0, WORLDS.length - 1);
        for (const k of ['daily', 'codes', 'seen', 'jq', 'padsDone', 'bests', 'ups', 'trails', 'auras', 'posts', 'pals', 'index', 'jbDone', 'times']) p[k] = obj(p[k]);
        if (!worldOpen(p, p.world)) p.world = 0;
        p.shoe = clamp(Math.floor(p.shoe), 0, SHOES.length - 1);
        p.trail = clamp(Math.floor(p.trail), 0, TRAILS.length - 1);
        p.aura = clamp(Math.floor(p.aura), 0, AURAS.length - 1);
        p.topSpeed = Math.max(p.topSpeed, p.speed);
        for (const id of Object.keys(p.ups)) { const u = upgradeById[id]; if (!u) delete p.ups[id]; else p.ups[id] = clamp(num(p.ups[id], 0) | 0, 0, u.max); }
        for (const id of Object.keys(p.pals)) { if (!palById[id]) delete p.pals[id]; else p.pals[id] = Math.max(0, num(p.pals[id], 0) | 0); }
        p.team = (Array.isArray(p.team) ? p.team : []).filter((id) => p.pals[id] > 0).slice(0, teamMax(p));
        p.jq = { day: String(p.jq.day || ''), list: Array.isArray(p.jq.list) ? p.jq.list.slice(0, 3).map((q) => ({ k: String(q.k), p: Math.max(0, num(q.p, 0)), c: !!q.c })).filter((q) => TASKS[q.k]) : [] };
        if (!finite(p.firstPlay)) p.firstPlay = Date.now();
        if (!p.padAt || typeof p.padAt !== 'object' || Array.isArray(p.padAt)) p.padAt = {};
        p.spinSecs = Math.max(0, num(p.spinSecs, 0) | 0);
    }

    // A dropped connection has 30 seconds to come back. Meanwhile they aren't shown in the world, and in a race a bot takes over after
    // a few seconds (tick). kickOthers ends the wait if they turn up in a new session instead.
    onDrop(client) {
        const r = this.allowReconnection(client, 30), s = this.sessions.get(client.sessionId);
        r.catch(() => {});
        if (!s) return;
        s.recon = r; s.dropAt = Date.now();
        s.player.world = OFFSTAGE;
        // (a Shade doesn't hunt someone who isn't there: they come back to the start of the stage)
        this.clearShade(s);
    }
    onReconnect(client) {
        const s = this.sessions.get(client.sessionId);
        if (!s) return;
        s.client = client; s.recon = null;
        kickOthers(s.profile.uid, s);
        this.syncPublic(s);
        client.send('hello', { now: Date.now(), bloxity: s.profile.uid.startsWith('legion_') });
        this.sendProfile(s, true);
        this.broadcastBoards(client);
        if (!s.match) {
            const k = stageAt(s.last.z);
            if (s.down || (k >= 0 && k < WALLS_N)) this.toCheckpoint(s, Math.max(0, k), 'back');
        }
        this.race.resync(s, { w: s.profile.world, x: s.last.x, z: s.last.z });
    }
    onLeave(client) {
        const s = this.sessions.get(client.sessionId);
        if (s) this.race.leave(s, true);
        this.state.players.delete(client.sessionId);
        this.sessions.delete(client.sessionId);
        markDirty();
        this.fillBots();
        if (!s) return;
        const p = s.profile, st = s.stats;
        p.lastSeen = Date.now();
        recordSession({
            at: new Date(), secs: Math.round((Date.now() - s.joinedAt) / 1000), fresh: st.fresh, touch: st.touch,
            fps: st.fpsN ? Math.round(st.fpsSum / st.fpsN) : st.fps, fpsMin: st.fpsMin, q: st.q, gpu: st.gpu, load: st.load, dev: st.dev, errs: st.errs,
            steps: st.steps, cleared: st.cleared, wins: st.wins, pads: st.pads, best: st.best, buys: st.buys, hatch: st.hatch, lv0: st.lv0, lv: p.lv, rb0: st.rb0, rb: p.rebirths, matches: st.matches, matchWins: st.matchWins, caught: st.caught, escapes: st.escapes,
            firstPad: st.firstPadAt ? Math.round((st.firstPadAt - s.joinedAt) / 1000) : -1, firstMatch: st.firstMatchAt ? Math.round((st.firstMatchAt - s.joinedAt) / 1000) : -1, qi: p.qi,
        }).catch((e) => console.warn('[stats]', e.message));
        if (!isOnline(p.uid)) releaseProfile(p.uid, isOnline);
    }
    onDispose() {
        liveRooms.delete(this);
        for (const s of this.sessions.values()) s.profile.lastSeen = Date.now();
        markDirty();
        return saveProfiles();
    }

    // ----- helpers -----
    sendTo(s, type, msg) { try { if (s) s.client.send(type, msg); } catch (e) { /* gone */ } }
    syncPublic(s) {
        const p = s.profile, pl = s.player;
        pl.name = p.name; pl.lv = p.lv; pl.wins = p.totalWins; pl.world = s.recon ? OFFSTAGE : p.world;
        pl.shoe = p.shoe; pl.trail = p.trail; pl.aura = p.aura;
        pl.team = (p.team || []).join(',');
        pl.title = titleOf(p.cleared);
    }
    x2On(p, now) { return (p.x2Until || 0) > (now || Date.now()); }
    w2On(p, now) { return (p.w2Until || 0) > (now || Date.now()); }
    // The player's private progress: straight away for anything they clicked on; while running, four times a second, only
    // what changes then (the rest of it isn't sent over and over)
    sendProfile(s, seal) {
        const p = s.profile, now = Date.now();
        s.dirtyAt = 0;
        this.jqOf(p, now);
        this.checkQuests(s);
        const m = {
            wins: Math.floor(p.wins), totalWins: Math.floor(p.totalWins), totalSpeed: Math.floor(p.totalSpeed), topSpeed: Math.floor(p.topSpeed), gems: p.gems, xp: r1(p.xp), speed: p.speed, lv: p.lv, need: xpNeed(p.lv, p.rebirths), ack: s.ack,
            rebirths: p.rebirths, shoe: p.shoe, trail: p.trail, aura: p.aura, trails: p.trails, auras: p.auras, posts: p.posts, ups: p.ups, upgrades: p.upgrades,
            steps: p.steps, megas: p.megas, cleared: p.cleared, escapes: p.escapes, catches: p.catches, bests: p.bests, padsDone: p.padsDone, pals: p.pals, team: p.team, hatched: p.hatched, index: p.index,
            spins: p.spins, spinIn: Math.max(0, CFG.spinMins * 60 - p.spinSecs), spinsUsed: p.spinsUsed, pads: p.pads, world: p.world, matches: p.matches, matchWins: p.matchWins, podium: p.podium,
            x2Until: p.x2Until, w2Until: p.w2Until,
            qi: p.qi, qv: p.qi < QUESTS.length ? this.questValue(p, QUESTS[p.qi].kind) : 0, jq: p.jq, daily: p.daily, codes: p.codes,
            gifts: s.gifts, sessionSecs: s.playSecs, playtime: p.playtime, tut: p.tut, seen: p.seen, firstPlay: p.firstPlay, now,
            candies: p.candies, candyN: p.candyN,
        };
        if (!USE_DB && (seal || now - s.sealAt > 10000)) { s.sealAt = now; m.save = sealProfile(p); }
        this.sendTo(s, 'profile', m);
    }
    sendLite(s) {
        const p = s.profile;
        s.dirtyAt = 0;
        this.checkQuests(s);
        // a quest or task just came good: there's more to tell than the short message holds
        if (s.jqDirty) { s.jqDirty = false; this.sendProfile(s); return; }
        const m = { xp: r1(p.xp), speed: p.speed, lv: p.lv, need: xpNeed(p.lv, p.rebirths), ack: s.ack, steps: p.steps, megas: p.megas, cleared: p.cleared, escapes: p.escapes, wins: Math.floor(p.wins), totalSpeed: Math.floor(p.totalSpeed), bests: p.bests };
        if (p.qi < QUESTS.length) m.qv = this.questValue(p, QUESTS[p.qi].kind);
        this.sendTo(s, 'lite', m);
    }
    dirty(s) { if (!s.dirtyAt) s.dirtyAt = Date.now(); markDirty(); }
    changed(s) { this.syncPublic(s); this.sendProfile(s); saveSoon(); }
    toast(s, text, color) { this.sendTo(s, 'toast', { text, color: color || '#ffffff' }); }
    broke(s, need, name, cur) { this.sendTo(s, 'broke', { need: Math.ceil(need), name, cur }); }
    payWins(s, n, name) { const p = s.profile; if (p.wins < n) { this.broke(s, n - p.wins, name, 'wins'); return false; } p.wins -= n; s.stats.buys++; return true; }
    payGems(s, n, name) { const p = s.profile; if (p.gems < n) { this.broke(s, n - p.gems, name, 'gems'); return false; } p.gems -= n; s.stats.buys++; return true; }
    giveReward(s, r, why) {
        const p = s.profile, speed = rewardSpeed(r, p.lv);
        if (speed) this.addSpeed(s, speed);
        if (r.wins) this.addWins(s, r.wins);
        if (r.gems) p.gems += r.gems;
        if (r.spins) p.spins += r.spins;
        if (r.x2) p.x2Until = Math.max(Date.now(), p.x2Until || 0) + r.x2 * 60000;
        const shown = { ...r, speed };
        if (why) this.sendTo(s, 'reward', { text: rewardText(shown), why, gems: r.gems || 0 });
        return shown;
    }
    addWins(s, n) {
        const p = s.profile;
        p.wins += n; p.totalWins += n; s.stats.wins += n;
        this.task(s, 'wins', n);
    }
    // Speed fills the Level bar, up to the cap
    addSpeed(s, n) {
        const p = s.profile, cap = lvCap(p.rebirths);
        p.speed += n; p.totalSpeed += n;
        if (p.speed > p.topSpeed) p.topSpeed = p.speed;
        if (p.lv >= cap) { p.xp = 0; return; }
        p.xp += n;
        let ups = 0;
        while (p.lv < cap && p.xp >= xpNeed(p.lv, p.rebirths)) { p.xp -= xpNeed(p.lv, p.rebirths); p.lv++; ups++; }
        if (p.lv >= cap) p.xp = 0;
        if (ups) {
            this.task(s, 'levels', ups);
            this.sendTo(s, 'levelup', { lv: p.lv, cap: p.lv >= cap });
            s.player.lv = p.lv;
        }
    }

    // ----- daily tasks, quests -----
    jqOf(p, now) {
        const d = dayKey(now);
        if (p.jq.day !== d) p.jq = { day: d, list: tasksFor(d).map((k) => ({ k, p: 0, c: false })) };
        return p.jq;
    }
    task(s, k, n) {
        const jq = this.jqOf(s.profile, Date.now());
        for (const q of jq.list) {
            if (q.k !== k || q.c) continue;
            const was = q.p;
            q.p = Math.min(TASKS[k].n, q.p + n);
            if (was < TASKS[k].n && q.p >= TASKS[k].n) { this.sendTo(s, 'taskdone', { k }); s.jqDirty = true; }
        }
        this.dirty(s);
    }
    questValue(p, kind) {
        if (kind === 'spins') return p.spinsUsed;
        if (kind === 'best') return (p.bests && p.bests[0]) || 0;
        if (kind === 'hatch') return p.hatched;
        return Math.floor(p[kind] || 0);
    }
    // a quest done pays at once, and the next one comes up
    checkQuests(s) {
        const p = s.profile;
        for (let k = 0; k < 4 && p.qi < QUESTS.length; k++) {
            const Q = QUESTS[p.qi];
            if (this.questValue(p, Q.kind) < Q.n) break;
            p.qi++;
            this.giveReward(s, Q);
            this.sendTo(s, 'questdone', { text: Q.text, reward: rewardText(Q), wins: Q.wins || 0 });
            s.jqDirty = true;
        }
    }
    onTaskClaim(client, m) {
        const s = this.sessions.get(client.sessionId);
        if (!s) return;
        const q = this.jqOf(s.profile, Date.now()).list[m.i | 0];
        if (!q || q.c || q.p < TASKS[q.k].n) return;
        q.c = true;
        this.giveReward(s, TASKS[q.k], 'Daily task done!');
        this.changed(s);
    }

    // ----- 20 times a second: the bots, the races, the Shades; every second: playtime, free spins -----
    update() {
        const now = Date.now(), dt = Math.min(0.1, (now - this.lastTick) / 1000);
        this.lastTick = now;
        this.state.now = now;
        // (whatever goes wrong in one tick, the room and everyone in it carry on)
        try {
            for (const b of this.bots) this.driveBot(b, now, dt);
            this.race.update(now, dt);
            for (const s of this.sessions.values()) {
                // a Shade that's caught up with someone standing still (their screen sends where they are at least twice a second)
                if (s.shade && !s.down && !s.recon && now - s.lastAt > 900 && now > s.shade.at && this.shadeZ(s.shade, now - 600) <= s.last.z + 1) this.caught(s, now);
                if (s.down && now - s.down.at > (CFG.reviveSecs + 1.5) * 1000) this.toCheckpoint(s, s.down.k, 'caught');
            }
            this.secAcc += dt;
            if (this.secAcc >= 1) { this.secAcc -= 1; this.tick(now); }
            for (const s of this.sessions.values()) if (s.dirtyAt && now - s.dirtyAt > 250) { this.syncPublic(s); if (s.jqDirty) { s.jqDirty = false; this.sendProfile(s); } else this.sendLite(s); }
        } catch (e) { console.warn('[update]', e.message); }
    }
    tick(now) {
        for (const s of this.sessions.values()) {
            const p = s.profile;
            // gone for now: their clocks wait; in a race, a bot carries on for them after a few seconds
            if (s.recon) { if (s.match && now - s.dropAt > DROP_MATCH_MS) this.sendHome(s); continue; }
            p.playtime = (p.playtime || 0) + 1;
            p.lastSeen = now;
            s.playSecs++;
            if (p.spins < CFG.spinMax) { p.spinSecs++; if (p.spinSecs >= CFG.spinMins * 60) { p.spinSecs = 0; p.spins++; this.toast(s, '🎡 A free spin is ready!', GOLD); this.changed(s); } } else p.spinSecs = 0;
            const g = GIFTS.findIndex((x, i) => !s.gifts[i] && s.playSecs >= x.min * 60 && s.playSecs < x.min * 60 + 1);
            if (g >= 0) this.toast(s, '🎁 A FREE gift is ready!', GOLD);
        }
        markDirty();
    }

    // ----- the Shades: one at a time, the one of the stage you're in. Four numbers, the same on every screen -----
    shadeZ(sh, ms) { return sh.z0 - sh.v * Math.max(0, (ms - sh.at) / 1000); }
    wakeShade(s, k, now) {
        const p = s.profile, type = stagePlan(p.world, k).type, pl = s.player;
        let v = runSpeed(p, p.speed, p.world) * shadeRel(k, p);
        // where you hop from platform to platform, or ride the trampolines, nobody runs flat out: it comes at a hopper's pace
        if (type === 'stones' || type === 'bounce') v = Math.min(v, stageV(k) * 0.62);
        s.shade = { k, at: now + (k < 3 ? CFG.shadeDelayEarly : CFG.shadeDelay) * 1000, z0: wallZ(k) + 3, v, t0: now };
        pl.shK = k; pl.shAt = s.shade.at; pl.shZ = s.shade.z0; pl.shV = v;
    }
    clearShade(s) { s.shade = null; s.player.shK = 255; }
    caught(s, now) {
        const sh = s.shade, p = s.profile;
        if (!sh) return;
        // a close call: the first time it reaches you in a stage it bounces off and comes again from well back (a catch is a
        // stop, a prompt, the gate: new players were caught ten times a session, and left)
        if (!sh.saved) {
            const pl = s.player;
            s.shade = { ...sh, at: now + 1600, z0: s.last.z + 28, saved: true };
            pl.shAt = s.shade.at; pl.shZ = s.shade.z0; pl.shV = sh.v;
            this.sendTo(s, 'saved', { k: sh.k });
            this.dirty(s);
            return;
        }
        s.down = { at: now, k: sh.k, x: s.last.x, y: s.last.y, z: s.last.z, v: sh.v, t0: sh.t0 };
        this.clearShade(s);
        p.catches++; s.stats.caught++;
        s.player.anim = 4;
        this.sendTo(s, 'caught', { k: sh.k, x: s.last.x, y: s.last.y, z: s.last.z, gems: CFG.reviveGems, secs: CFG.reviveSecs });
        this.dirty(s);
    }
    // back to the start of stage k (a Shade caught you, you fell, you came back): it'll wake again when you go on
    toCheckpoint(s, k, why) {
        const cp = checkpoint(k), now = Date.now();
        s.down = null;
        this.clearShade(s);
        s.last = { x: cp.x, y: 0, z: cp.z }; s.homeAt = now; s.lastAt = now;
        this.sendTo(s, 'warped', { x: cp.x, y: 0, z: cp.z, why });
    }
    onRevive(client) {
        const s = this.sessions.get(client.sessionId), now = Date.now();
        if (!s || !s.down || now - s.down.at > (CFG.reviveSecs + 1.5) * 1000) return;
        if (!this.payGems(s, CFG.reviveGems, 'a revive')) return;
        const d = s.down, pl = s.player;
        s.down = null;
        s.last = { x: d.x, y: d.y, z: d.z }; s.lastAt = now; s.homeAt = 0;
        // its Shade comes again, from well back
        s.shade = { k: d.k, at: now + 2200, z0: d.z + 34, v: d.v, t0: d.t0 || now, saved: true };
        pl.shK = d.k; pl.shAt = s.shade.at; pl.shZ = s.shade.z0; pl.shV = d.v;
        this.sendTo(s, 'revived', { x: d.x, y: d.y, z: d.z });
        this.changed(s);
    }
    onRespawn(client) {
        const s = this.sessions.get(client.sessionId);
        if (s && s.down) this.toCheckpoint(s, s.down.k, 'caught');
    }
    // your screen saw you fall in a pool: back to the stage's start (only ever where you are)
    onFell(client, m) {
        const s = this.sessions.get(client.sessionId), now = Date.now();
        if (!s || s.match || s.down || now - s.fellAt < 500) return;
        const k = stageAt(s.last.z);
        if (k < 0 || k >= WALLS_N || (finite(m.k) && (m.k | 0) !== k)) return;
        s.fellAt = now;
        this.toCheckpoint(s, k, 'fell');
    }

    // ----- moving -----
    // where a player says they are: checked against how far they could have moved, how high they can jump and the gates still shut
    onMove(client, m) {
        const s = this.sessions.get(client.sessionId);
        if (!s || !finite(m.x) || !finite(m.y) || !finite(m.z)) return;
        const now = Date.now(), p = s.profile, L = s.last;
        const dt = (now - s.lastAt) / 1000;
        s.lastAt = now;
        if (s.match) {
            if (!this.race.move(s, m, dt)) { L.x = m.x; L.y = m.y; L.z = m.z; this.setPublicMove(s, m, now); }
            return;
        }
        // caught: you stay where you went down until you're revived or sent back
        if (s.down) return;
        // just sent somewhere (a warp, a rebirth, a world, a checkpoint): the moves still on their way from where they were are
        // dropped (no snap) until they arrive
        if (s.homeAt) {
            if (now - s.homeAt < 30000 && Math.hypot(m.x - L.x, m.z - L.z) > 6) return;
            s.homeAt = 0;
        }
        const w = p.world, v = runSpeed(p, p.speed, w), maxY = jumpH(jumpPowerOf(p)) + 12, dist = Math.hypot(m.x - L.x, m.z - L.z);
        let bad = !moveBudget(s, dist, v * BURST * 1.15 + 5, dt) || m.y > maxY || m.y < -40 || m.z < northEnd - 3 || m.z > W.plaza.z1 + 3 || Math.abs(m.x) > W.plaza.x1 + 3 || (m.z < W.plaza.z0 - 3 && Math.abs(m.x) > W.halfW + 3);
        // a gate your Speed doesn't open: nobody goes through it (a step that opened it may still be on its way: a moment's grace)
        const lock = gateLock(p.speed * 1.02 + 1, w);
        if (lock < WALLS_N && m.z < wallZ(lock) - 2 && (now - s.stepAt > 1500 || m.z < wallZ(lock) - 30)) bad = true;
        if (bad) {
            if (now - s.snapAt > 300) { s.snapAt = now; this.sendTo(s, 'snap', { x: L.x, y: L.y, z: L.z }); if (process.env.QA === '1') console.log('[snap]', p.name, 'from', [L.x, L.y, L.z].map((x) => +x.toFixed(1)), 'to', [m.x, m.y, m.z].map((x) => +x.toFixed(1)), 'dt', +dt.toFixed(2), 'lock', lock); }
            return;
        }
        // strides for steps on the ground (a step needs the ground under it)
        if (m.y < 0.6 || m.a === 1) s.distAcc = Math.min(60, s.distAcc + dist);
        L.x = m.x; L.y = m.y; L.z = m.z;
        this.setPublicMove(s, m, now);
        const post = finite(m.post) ? m.post | 0 : -1;
        s.player.post = m.a === 3 && post >= 0 && post < POSTS.length && postOpen(p, post) && nearPost(post, m.x, m.z, 6) ? post : 255;
        s.player.spd = clamp(finite(m.v) ? m.v : v, 0, CFG.vMax * BURST);
        // the Shades
        const ts = finite(m.ts) ? clamp(m.ts, now - 1500, now + 50) : now, k = stageAt(m.z), sh = s.shade;
        if (sh) {
            if (m.z <= padAt(sh.k).z + W.padR) {
                // the Win Pad: away from it
                this.clearShade(s);
                p.escapes++; s.stats.escapes++;
                this.task(s, 'escapes', 1);
                const secs = sh.t0 ? Math.round((now - sh.t0) / 100) / 10 : 0, key = p.world + ':' + sh.k, old = finite(p.times[key]) ? p.times[key] : 0;
                const best = secs > 0.5 && (!old || secs < old);
                if (best) p.times[key] = secs;
                this.sendTo(s, 'escaped', { k: sh.k, secs, best, old });
            } else if (m.z > wallZ(sh.k) + 6) this.clearShade(s);
            else if (ts > sh.at && this.shadeZ(sh, ts) <= m.z + 1) this.caught(s, now);
        } else if (!s.qaNoShade && k >= 0 && k < WALLS_N && m.z < wallZ(k) - 3 && m.z > padAt(k).z + W.padR + 2) this.wakeShade(s, k, now);
    }
    setPublicMove(s, m, now) {
        const pl = s.player;
        pl.x = m.x; pl.y = m.y; pl.z = m.z; pl.ry = finite(m.ry) ? m.ry : 0; pl.anim = finite(m.a) ? clamp(m.a | 0, 0, 3) : 0;
        pl.t = finite(m.ts) ? clamp(m.ts, now - 1500, now + 50) : now;
    }
    // ----- steps: from your screen, counted here. n of them, on a treadmill (post) or on the ground -----
    token(s, now, tread) {
        if (tread) {
            const rate = CFG.treadSprint * 1.12, cap = 14;
            s.ttok = Math.min(cap, (s.ttokAt ? s.ttok : cap) + (now - (s.ttokAt || now)) / 1000 * rate);
            s.ttokAt = now;
            if (s.ttok < 1) return false;
            s.ttok -= 1;
            return true;
        }
        s.tokens = Math.min(CFG.stepBurst, (s.tokAt ? s.tokens : CFG.stepBurst) + (now - (s.tokAt || now)) / 1000 * CFG.stepRate);
        s.tokAt = now;
        if (s.tokens < 1) return false;
        s.tokens -= 1;
        return true;
    }
    onStep(client, m) {
        const s = this.sessions.get(client.sessionId);
        if (!s || !finite(m.n)) return;
        if (finite(m.s)) s.ack = Math.max(s.ack, m.s | 0);
        if (s.match || s.down) return;
        const now = Date.now(), p = s.profile, w = p.world, L = s.last, n = clamp(m.n | 0, 0, 30), x2 = this.x2On(p, now);
        let post = finite(m.post) ? m.post | 0 : -1;
        if (post >= 0 && (post >= POSTS.length || !postOpen(p, post) || !nearPost(post, L.x, L.z, 7))) post = -1;
        const pm = post >= 0 ? POSTS[post].mult : 1, stride = strideOf(runSpeed(p, p.speed, w)) * 0.7;
        let got = 0;
        for (let i = 0; i < n; i++) {
            if (!this.token(s, now, post >= 0)) break;
            if (post < 0) { if (s.distAcc < stride) break; s.distAcc -= stride; }
            got++;
            const mega = isMega(p.steps, p), mk = mega ? CFG.megaK : 1;
            p.steps++; s.stats.steps++;
            if (mega) { p.megas++; this.task(s, 'megas', 1); }
            this.addSpeed(s, stepGain(p, x2, w) * pm * mk);
        }
        if (got) { this.task(s, 'steps', got); s.stepAt = now; }
        this.dirty(s);
    }
    // a Win Pad: at the end of a stage, you standing on it, not too soon after the last time
    onPadTouch(client, m) {
        const s = this.sessions.get(client.sessionId);
        if (!s || s.match || s.down) return;
        const p = s.profile, k = m.k | 0, L = s.last, now = Date.now(), w = p.world;
        if (k < 0 || k >= WALLS_N || !onPad(k, L.x, L.z) || L.y > jumpH(jumpPowerOf(p)) + 2) return;
        const key = w + ':' + k;
        if (now - (p.padAt[key] || 0) < CFG.padCool * 1000) return;
        p.padAt[key] = now;
        const first = !p.padsDone[key];
        p.padsDone[key] = 1;
        const n = padPay(p, w, k, first, this.w2On(p, now));
        this.addWins(s, n);
        p.pads++; s.stats.pads++;
        p.cleared++; s.stats.cleared++;
        this.task(s, 'cleared', 1);
        if (k + 1 > (p.bests[w] || 0)) { p.bests[w] = k + 1; s.stats.best = Math.max(s.stats.best, k + 1); }
        if (!s.stats.firstPadAt) s.stats.firstPadAt = now;
        this.task(s, 'pads', 1);
        this.sendTo(s, 'padok', { k, n, first, cool: CFG.padCool });
        this.changed(s);
    }
    // a golden candy: you have to be at it (where your last move said you were), once each, ever
    onCandy(client, m) {
        const s = this.sessions.get(client.sessionId);
        if (!s || s.match || s.down) return;
        const p = s.profile, w = p.world, k = m.k | 0, i = m.i | 0, L = s.last;
        if (k < 0 || k >= WALLS_N || i < 0 || i > 2) return;
        const c = stagePlan(w, k).candies[i];
        if (!c || Math.hypot(L.x - c.x, L.z - c.z) > 5 || L.y < c.y - 7 || L.y > c.y + 3) { this.sendTo(s, 'candy', { ok: false, k, i }); return; }
        const bits = p.candies[w] || (p.candies[w] = new Array(WALLS_N).fill(0));
        if (bits[k] & (1 << i)) return;
        bits[k] |= 1 << i;
        p.candyN = (p.candyN || 0) + 1;
        const all = bits[k] === 7, n = bits.reduce((a, b2) => a + ((b2 & 1) + ((b2 >> 1) & 1) + ((b2 >> 2) & 1)), 0);
        // 2 Gems each, 5 more for all three in a stage, a spin every 9 in a world
        const gems = 2 + (all ? 5 : 0);
        p.gems += gems;
        if (n % 9 === 0) { p.spins = Math.min(99, p.spins + 1); this.toast(s, '🎡 ' + n + ' Golden Candies: a free spin!', '#ffd23a'); }
        this.addSpeed(s, rewardSpeed({ speed: 30 }, p.lv));
        this.task(s, 'candies', 1);
        this.sendTo(s, 'candy', { ok: true, k, i, n, all, gems });
        this.changed(s);
    }
    // the quick ways round: the plaza, your best open treadmill, a stage you've reached whose gate your Speed opens
    onWarp(client, m) {
        const s = this.sessions.get(client.sessionId);
        if (!s || s.match || s.down) return;
        const now = Date.now(), p = s.profile;
        if (now - s.warpAt < 700) return;
        s.warpAt = now;
        let to = { x: W.spawn.x + rnd(-4, 4), y: 0, z: W.spawn.z };
        if (m.to === 'post') {
            let best = 0;
            for (let i = 0; i < POSTS.length; i++) if (postOpen(p, i) && POSTS[i].mult >= POSTS[best].mult) best = i;
            const sp = postSpot(best);
            to = { x: sp.x, y: 0, z: sp.z + BELT.l / 2 + 2.5 };
        } else if (m.to === 'stage') {
            const top = Math.min(WALLS_N - 1, (p.bests[p.world] || 0), gateLock(p.speed, p.world) - 1);
            const k = clamp(m.k | 0, 0, Math.max(0, top)), cp = checkpoint(k);
            to = { x: cp.x, y: 0, z: cp.z };
        }
        this.clearShade(s);
        s.last = { x: to.x, y: to.y, z: to.z }; s.homeAt = now;
        this.sendTo(s, 'warped', to);
    }

    // ----- spending: shoes, upgrades, trails, auras, treadmills, Rift Cores, rebirths, worlds -----
    onBuyShoe(client) {
        const s = this.sessions.get(client.sessionId);
        if (!s) return;
        const p = s.profile, next = p.shoe + 1, G = SHOES[next];
        if (!G) return;
        if (!this.payWins(s, G.wins, G.name)) return;
        p.shoe = next;
        this.sendTo(s, 'bought', { what: 'shoe', i: next });
        this.changed(s);
    }
    onUpgrade(client, m) {
        const s = this.sessions.get(client.sessionId);
        if (!s) return;
        const p = s.profile, u = upgradeById[m.id];
        if (!u) return;
        const n = p.ups[u.id] || 0;
        if (n >= u.max) return;
        if (!this.payWins(s, upgradeCost(u, n), u.name)) return;
        p.ups[u.id] = n + 1; p.upgrades++;
        if (u.id === 'den' && !p.teamSet) this.bestTeam(p);
        this.sendTo(s, 'bought', { what: 'upgrade', id: u.id, n: n + 1 });
        this.changed(s);
    }
    onTrail(client, m) {
        const s = this.sessions.get(client.sessionId);
        if (!s) return;
        const p = s.profile, i = m.i | 0, X = TRAILS[i];
        if (!X) return;
        if (!p.trails[X.id] && i > 0) { if (!this.payWins(s, X.wins, X.name)) return; p.trails[X.id] = 1; this.sendTo(s, 'bought', { what: 'trail', i }); }
        p.trail = i;
        this.changed(s);
    }
    onAura(client, m) {
        const s = this.sessions.get(client.sessionId);
        if (!s) return;
        const p = s.profile, i = m.i | 0, X = AURAS[i];
        if (!X) return;
        if (!p.auras[X.id] && i > 0) { if (!this.payGems(s, X.gems, X.name)) return; p.auras[X.id] = 1; this.sendTo(s, 'bought', { what: 'aura', i }); }
        p.aura = i;
        this.changed(s);
    }
    onBuyPost(client, m) {
        const s = this.sessions.get(client.sessionId);
        if (!s) return;
        const p = s.profile, c = POSTS[m.i | 0];
        if (!c || !c.gems || p.posts[c.id]) return;
        if (!this.payGems(s, c.gems, c.name)) return;
        p.posts[c.id] = 1;
        this.sendTo(s, 'bought', { what: 'post', i: m.i | 0 });
        this.changed(s);
    }
    // a Rift Core: Wins for one or three, its odds say who's inside
    onHatch(client, m) {
        const s = this.sessions.get(client.sessionId);
        if (!s) return;
        const p = s.profile, j = m.j | 0, J = JAWBREAKERS[j], n = m.n === 3 ? 3 : 1;
        if (!J) return;
        if (!this.payWins(s, J.wins * n, J.name)) return;
        const list = palsOf(j), got = [], total = list.reduce((a, x) => a + x.odds, 0);
        for (let i = 0; i < n; i++) {
            let r = Math.random() * total, a = list[0];
            for (const x of list) { r -= x.odds; if (r < 0) { a = x; break; } }
            p.pals[a.id] = (p.pals[a.id] || 0) + 1;
            p.hatched++; s.stats.hatch++;
            got.push({ id: a.id, fresh: !p.index[a.id] });
            p.index[a.id] = 1;
        }
        this.task(s, 'hatch', n);
        // the best of what you own goes on your team by itself until you've chosen for yourself
        if (!p.teamSet) this.bestTeam(p);
        let done = 0;
        if (!p.jbDone[J.id] && list.every((x) => p.index[x.id])) { p.jbDone[J.id] = 1; done = jbGems(j); p.gems += done; }
        this.sendTo(s, 'hatched', { j, got, done, mult: teamMult(p.team) });
        this.changed(s);
    }
    bestTeam(p) {
        const owned = PALS.filter((a) => p.pals[a.id] > 0).sort((a, b) => b.mult - a.mult), team = [];
        for (const a of owned) for (let c = 0; c < p.pals[a.id] && team.length < teamMax(p); c++) team.push(a.id);
        p.team = team;
    }
    onTeam(client, m) {
        const s = this.sessions.get(client.sessionId);
        if (!s) return;
        const p = s.profile, id = String(m.id || ''), i = p.team.indexOf(id);
        if (!palById[id] || !p.pals[id]) return;
        if (m.on === false) { if (i >= 0) p.team.splice(i, 1); } else {
            const have = p.team.filter((x) => x === id).length;
            if (p.team.length >= teamMax(p) || have >= p.pals[id]) { this.toast(s, 'Your team is full', RED); return; }
            p.team.push(id);
        }
        p.teamSet = 1;
        this.changed(s);
    }
    onTeamBest(client) {
        const s = this.sessions.get(client.sessionId);
        if (!s) return;
        s.profile.teamSet = 0;
        this.bestTeam(s.profile);
        this.changed(s);
    }
    onRebirth(client) {
        const s = this.sessions.get(client.sessionId);
        if (!s || s.match) return;
        const p = s.profile, need = lvCap(p.rebirths);
        if (p.lv < need) { this.toast(s, 'Rebirth needs Level ' + need, RED); return; }
        if (!this.payWins(s, rebirthCost(p.rebirths), 'a rebirth')) return;
        p.rebirths++; p.lv = 1; p.xp = 0; p.speed = 0;
        p.padsDone = {};
        p.padAt = {};
        s.down = null; this.clearShade(s);
        const sx = W.spawn.x + rnd(-4, 4);
        s.last = { x: sx, y: 0, z: W.spawn.z }; s.homeAt = Date.now();
        this.sendTo(s, 'reborn', { r: p.rebirths, x: sx, z: W.spawn.z });
        this.changed(s);
    }
    onWorld(client, m) {
        const s = this.sessions.get(client.sessionId);
        if (!s || s.match) return;
        const p = s.profile, w = clamp(m.w | 0, 0, WORLDS.length - 1);
        if (w === p.world) return;
        if (!worldOpen(p, w)) { this.toast(s, '🔒 Clear the last stage of ' + WORLDS[w - 1].name + ' to open ' + WORLDS[w].name, RED); return; }
        p.world = w;
        s.down = null; this.clearShade(s);
        const sx = W.spawn.x + rnd(-4, 4);
        s.last = { x: sx, y: 0, z: W.spawn.z }; s.homeAt = Date.now();
        this.sendTo(s, 'warp', { w, x: sx, z: W.spawn.z });
        this.changed(s);
    }
    onSpin(client) {
        const s = this.sessions.get(client.sessionId);
        if (!s) return;
        const p = s.profile;
        if (p.spins < 1) return;
        p.spins--; p.spinsUsed++;
        let r = Math.random() * SPIN.reduce((a, x) => a + x.w, 0), i = 0;
        for (; i < SPIN.length - 1; i++) { r -= SPIN[i].w; if (r < 0) break; }
        const prize = spinPrize(SPIN[i], p);
        if (prize.speed) this.addSpeed(s, prize.speed);
        if (prize.wins) this.addWins(s, prize.wins);
        if (prize.gems) p.gems += prize.gems;
        if (prize.x2) p.x2Until = Math.max(Date.now(), p.x2Until || 0) + prize.x2 * 60000;
        this.task(s, 'spins', 1);
        this.sendTo(s, 'spun', { i, text: rewardText(prize) });
        this.changed(s);
    }
    onPack(client, m) {
        const s = this.sessions.get(client.sessionId), k = s && PACKS.find((x) => x.id === m.id);
        if (!k || !this.payGems(s, k.gems, k.wins + ' Wins')) return;
        const n = Math.round(k.wins * WORLDS[s.profile.world].wins);
        this.addWins(s, n);
        this.toast(s, '+' + n + ' Wins!', GOLD);
        this.changed(s);
    }
    onX2(client) {
        const s = this.sessions.get(client.sessionId);
        if (!s || !this.payGems(s, CFG.boostP2Gems, 'x2 Speed')) return;
        const p = s.profile;
        p.x2Until = Math.max(Date.now(), p.x2Until || 0) + CFG.boostP2Mins * 60000;
        this.toast(s, 'x2 Speed for ' + CFG.boostP2Mins + ' minutes!', GOLD);
        this.changed(s);
    }
    onW2(client) {
        const s = this.sessions.get(client.sessionId);
        if (!s || !this.payGems(s, CFG.boostW2Gems, 'x2 Wins')) return;
        const p = s.profile;
        p.w2Until = Math.max(Date.now(), p.w2Until || 0) + CFG.boostW2Mins * 60000;
        this.toast(s, 'x2 Wins for ' + CFG.boostW2Mins + ' minutes!', GOLD);
        this.changed(s);
    }
    // ----- a race's end, on the room's side: what the player gets -----
    onMatchEnd(s, r, prize, rows, mt) {
        const p = s.profile;
        p.matches++; s.stats.matches++;
        if (!s.stats.firstMatchAt) s.stats.firstMatchAt = Date.now();
        if (r.place === 0) { p.matchWins++; s.stats.matchWins++; }
        if (r.place <= 2) p.podium++;
        this.addWins(s, prize.wins);
        p.gems += prize.gems;
        this.addSpeed(s, prize.speed);
        this.task(s, 'matches', 1);
        const sx = W.spawn.x + rnd(-4, 4);
        s.last = { x: sx, y: 0, z: W.spawn.z }; s.homeAt = Date.now();
        this.sendTo(s, 'mEnd', { place: r.place, prize, rows, spot: r.spot, lv: mt.lv, w: p.world, x: sx, z: W.spawn.z, placeName: PLACES[r.place] });
        this.changed(s);
    }
    onQuit(client) {
        const s = this.sessions.get(client.sessionId);
        // (the clock's run out already: the prize is a moment away, there's nothing to leave)
        if (!s || !s.match || s.match.phase === 'done') return;
        this.sendHome(s);
    }
    // out of the race, a bot in their place, back on the plaza
    sendHome(s) {
        this.race.leave(s, true);
        const sx = W.spawn.x + rnd(-4, 4), p = s.profile;
        s.last = { x: sx, y: 0, z: W.spawn.z }; s.homeAt = Date.now();
        this.sendTo(s, 'mBack', { w: p.world, x: sx, z: W.spawn.z });
        this.changed(s);
    }
    // the race takes you: no Shade, no waiting to be revived
    toRace(s) { s.down = null; this.clearShade(s); }

    // ----- rewards -----
    onDaily(client) {
        const s = this.sessions.get(client.sessionId);
        if (!s) return;
        const p = s.profile, now = Date.now(), st = dailyStatus(p.daily, now);
        if (!st.can) return;
        p.daily = { last: dayKey(now), streak: st.streak + 1 };
        this.giveReward(s, DAILY[st.day], 'Daily reward: day ' + (st.day + 1) + '!');
        this.changed(s);
    }
    onGift(client, m) {
        const s = this.sessions.get(client.sessionId), i = m.i | 0, g = GIFTS[i];
        if (!s || !g || s.gifts[i] || s.playSecs < g.min * 60 - 2) return;
        s.gifts[i] = true;
        this.giveReward(s, g, 'FREE gift!');
        this.changed(s);
    }
    onCode(client, m) {
        const s = this.sessions.get(client.sessionId);
        if (!s) return;
        const code = String(m.code || '').trim().toUpperCase().slice(0, 20), r = CODES[code];
        if (!r) { this.sendTo(s, 'code', { ok: false, text: 'That code doesn\'t work' }); return; }
        if (s.profile.codes[code]) { this.sendTo(s, 'code', { ok: false, text: 'You already used that code' }); return; }
        s.profile.codes[code] = true;
        const shown = this.giveReward(s, r);
        this.sendTo(s, 'code', { ok: true, text: 'Code redeemed: ' + rewardText(shown, true) });
        this.changed(s);
    }
    onTut(client, m) {
        const s = this.sessions.get(client.sessionId);
        if (!s) return;
        if (finite(m.tut)) s.profile.tut = clamp(Math.max(s.profile.tut, m.tut | 0), 0, 99);
        // (only the worlds' "new" flags are ever kept)
        if (typeof m.seen === 'string' && /^w\d$/.test(m.seen)) s.profile.seen[m.seen] = 1;
        markDirty();
    }
    onMeta(client, m) {
        const s = this.sessions.get(client.sessionId);
        if (!s) return;
        const st = s.stats;
        if (typeof m.touch === 'boolean') st.touch = m.touch;
        if (finite(m.fps)) { const f = clamp(Math.round(m.fps), 0, 240); st.fps = f; st.fpsSum += f; st.fpsN++; st.fpsMin = st.fpsN === 1 ? f : Math.min(st.fpsMin, f); }
        if (typeof m.q === 'string') st.q = m.q.slice(0, 8);
        if (typeof m.gpu === 'string' && !st.gpu) st.gpu = m.gpu.slice(0, 90);
        if (finite(m.load) && !st.load) st.load = clamp(Math.round(m.load * 10) / 10, 0, 600);
        if (!st.dev && finite(m.w)) st.dev = { w: clamp(m.w | 0, 0, 9999), h: clamp(m.h | 0, 0, 9999), dpr: clamp(num(m.dpr, 1), 0, 8), cores: clamp(m.cores | 0, 0, 256), mem: clamp(num(m.mem, 0), 0, 1024) };
        if (Array.isArray(m.errs)) for (const e of m.errs.slice(0, 5)) if (typeof e === 'string' && st.errs.length < 8) st.errs.push(e.slice(0, 220));
    }
    broadcastBoards(client) {
        const row = (key, v) => topProfiles(key).filter((p) => v(p) > 0).map((p) => ({ n: p.name, v: v(p) }));
        const m = { wins: row('totalWins', (p) => Math.floor(p.totalWins || 0)), speed: row('topSpeed', (p) => Math.floor(p.topSpeed || 0)), race: row('matchWins', (p) => Math.floor(p.matchWins || 0)) };
        if (client) client.send('boards', m); else this.broadcast('boards', m);
    }

    onQa(client, m) {
        const s = this.sessions.get(client.sessionId);
        if (!s) return;
        const p = s.profile;
        if (finite(m.wins)) { p.wins += m.wins; p.totalWins += Math.max(0, m.wins); }
        if (finite(m.gems)) p.gems += m.gems;
        if (finite(m.lv)) { p.lv = clamp(m.lv | 0, 1, 999); p.xp = 0; }
        if (finite(m.speed)) { p.speed = Math.max(0, m.speed); p.topSpeed = Math.max(p.topSpeed, p.speed); }
        if (finite(m.rebirths)) p.rebirths = clamp(m.rebirths | 0, 0, 99);
        if (finite(m.shoe)) p.shoe = clamp(m.shoe | 0, 0, SHOES.length - 1);
        if (finite(m.steps)) p.steps = Math.max(0, m.steps | 0);
        if (finite(m.spins)) p.spins = clamp(m.spins | 0, 0, 99);
        if (finite(m.qi)) p.qi = clamp(m.qi | 0, 0, QUESTS.length);
        if (finite(m.playSecs)) s.playSecs = m.playSecs | 0;
        if (m.tasks) { const jq = this.jqOf(p, Date.now()); for (const q of jq.list) q.p = TASKS[q.k].n; }
        if (finite(m.best)) { p.bests[p.world] = clamp(m.best | 0, 0, WALLS_N); }
        if (m.openWorlds) for (let w = 0; w < WORLDS.length; w++) p.bests[w] = WALLS_N;
        if (m.allPals) { for (const a of PALS) { p.pals[a.id] = (p.pals[a.id] || 0) + 1; p.index[a.id] = 1; } this.bestTeam(p); }
        if (m.noShade) { this.clearShade(s); s.qaNoShade = true; }
        // a QA teleport: where the next move is checked from
        if (Array.isArray(m.tp) && m.tp.every(finite)) { s.last = { x: m.tp[0], y: m.tp[1], z: m.tp[2] }; s.lastAt = Date.now(); s.homeAt = 0; this.clearShade(s); }
        this.changed(s);
    }

    // ----- the bots: a few runners on the plaza when it's quiet (each real player sends one home): on a treadmill a while,
    // wandering over to the next thing, a dash into the Rift's first stage and back -----
    fillBots() {
        // (QA: no bots at all, for a clean shot)
        const want = process.env.NO_BOTS && !process.env.BLOXITY_GAME_ID ? 0 : Math.max(0, CFG.bots - this.sessions.size);
        while (this.bots.length > want) { const b = this.bots.pop(); this.state.players.delete(b.id); }
        const used = new Set([...this.state.players.values()].map((p) => p.name));
        while (this.bots.length < want) {
            const id = 'bot' + Math.floor(Math.random() * 1e9);
            let name = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)];
            for (let i = 0; used.has(name) && i < 20; i++) name = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)] + (i > 10 ? i : '');
            used.add(name);
            const lv = Math.floor(rnd(2, 24)), pl = new PlayerState(), x = rnd(-30, 30), z = rnd(62, 98), shoe = clamp(Math.floor(lv / 5), 0, 5);
            const team = Array.from({ length: Math.floor(rnd(0, 3)) }, () => 'stone' + Math.floor(rnd(0, 4))).join(',');
            Object.assign(pl, { name, bot: true, pid: this.freePid(), lv, wins: Math.floor(rnd(5, 600)), x, y: 0, z, t: Date.now(), world: 0, shoe, team, title: titleOf(lv), trail: Math.random() < 0.4 ? 1 + Math.floor(Math.random() * 3) : 0 });
            pl.av = botAvatar();
            this.state.players.set(id, pl);
            this.bots.push({ id, pl, body: newBody(x, 0, z), goal: null, until: 0, next: 0, post: -1, hang: 0, speed: rnd(0.9, 1.25) });
        }
    }
    driveBot(b, now, dt) {
        const T = hubFor(0), body = b.body, pl = b.pl;
        const inp = { mx: 0, mz: 0, jump: false, hold: true, power: CFG.power, double: false, speed: b.speed };
        // on a treadmill: running in place
        if (b.hang > now) { pl.anim = 3; pl.post = b.post; pl.t = now; pl.spd = 22; return; }
        if (b.post >= 0) { b.post = -1; pl.post = 255; b.goal = null; }
        if (!b.goal || now > b.until) {
            const r = Math.random();
            if (r < 0.55) { const pi = [0, 1, 2, 3][Math.floor(rnd(0, 4))], sp = postSpot(pi); b.goal = { x: sp.x, z: sp.z, post: pi }; }
            else if (r < 0.8) b.goal = { x: rnd(-9, 9), z: wallZ(0) - rnd(20, 70), rift: true };
            else b.goal = { x: rnd(-60, 60), z: rnd(60, 110) };
            b.until = now + 16000;
        }
        // into the Rift through the middle of the mouth, back out the same way
        let gx = b.goal.x, gz = b.goal.z;
        if (b.goal.rift && body.z > W.plaza.z0 + 2 && Math.abs(body.x) > 8) { gx = 0; gz = W.plaza.z0 - 4; }
        const dx = gx - body.x, dz = gz - body.z, d = Math.hypot(dx, dz);
        if (d > 1.2) { inp.mx = dx / d; inp.mz = dz / d; } else if (b.goal.post !== undefined) { b.post = b.goal.post; b.hang = now + rnd(6000, 15000); pl.ry = Math.PI; body.x = b.goal.x; body.z = b.goal.z; pl.x = body.x; pl.z = body.z; }
        else if (b.goal.rift) b.goal = { x: rnd(-8, 8), z: rnd(56, 70) };
        else b.goal = null;
        // it keeps clear of everyone else
        let ax = 0, az = 0;
        this.state.players.forEach((o) => {
            if (o === pl || o.match || o.world !== 0) return;
            const ex = body.x - o.x, ez = body.z - o.z, e2 = ex * ex + ez * ez;
            if (e2 < 49 && e2 > 0.01) { const e = Math.sqrt(e2), k = (7 - e) / 7 / e; ax += ex * k; az += ez * k; }
        });
        if ((ax || az) && d > 4) {
            inp.mx += ax * 2; inp.mz += az * 2;
            const ml = Math.hypot(inp.mx, inp.mz);
            if (ml > 1) { inp.mx /= ml; inp.mz /= ml; }
        }
        // what's in the Rift's way: a hop now and then
        if (body.onGround && now >= b.next) { if (Math.random() < (body.z < W.plaza.z0 ? 0.6 : 0.1)) inp.jump = true; b.next = now + rnd(700, 2600); }
        stepBody(body, inp, dt, T.world);
        pl.x = body.x; pl.y = body.y; pl.z = body.z; pl.t = now;
        const sp = Math.hypot(body.vx, body.vz);
        if (sp > 1) pl.ry = Math.atan2(body.vx, body.vz);
        pl.anim = !body.onGround ? 2 : sp > 2 ? 1 : 0;
        pl.spd = sp;
    }

    // ----- Bloxity -----
    async onBloxityLogin(client, m) {
        const s = this.sessions.get(client.sessionId);
        if (!s || !m || s.authing) return;
        s.authing = true;
        const legion = await verifyBloxityToken(m.token);
        s.authing = false;
        if (!legion || !this.sessions.has(client.sessionId)) return;
        const uid = 'legion_' + legion.id;
        if (s.profile.uid === uid) return;
        const name = cleanName(legion.name) || s.profile.name;
        const guestProfile = s.profile, world0 = guestProfile.world;
        guestProfile.lastSeen = Date.now();
        await adoptGuestProgress(uid, guestProfile.uid, name);
        await loadProfile(uid);
        if (!this.sessions.has(client.sessionId)) return;
        kickOthers(uid, s);
        s.profile = getProfile(uid, name, randomName());
        this.fixProfile(s.profile);
        s.profile.lastSeen = Date.now();
        if (!isOnline(guestProfile.uid)) releaseProfile(guestProfile.uid, isOnline);
        s.player.name = s.profile.name;
        if (!s.match) {
            const w1 = s.profile.world;
            s.down = null; this.clearShade(s);
            if (w1 !== world0 || s.last.z < W.plaza.z0) {
                const sx = W.spawn.x + rnd(-4, 4), to = { x: sx, y: 0, z: W.spawn.z };
                s.last = { ...to }; s.homeAt = Date.now();
                if (w1 !== world0) this.sendTo(s, 'warp', { w: w1, x: sx, z: W.spawn.z }); else this.sendTo(s, 'warped', to);
            }
        }
        this.changed(s);
        client.send('authed', { name: s.profile.name });
        this.toast(s, 'Logged in as ' + s.profile.name, GREEN);
        this.broadcastBoards();
    }
    onAvatar(client, m) {
        const s = this.sessions.get(client.sessionId), now = Date.now();
        if (!s || !m || now - (s.avAt || 0) < 500) return;
        s.avAt = now;
        s.player.av = cleanAvatar(m.av);
    }
    onEmote(client, m) {
        const s = this.sessions.get(client.sessionId);
        const now = Date.now();
        if (!s || !m || typeof m.id !== 'string' || m.id.length > 40 || now - (s.emoteAt || 0) < 700) return;
        s.emoteAt = now;
        this.broadcast('emote', { s: client.sessionId, id: m.id }, { except: client });
    }
    onChat(client, m) {
        const s = this.sessions.get(client.sessionId);
        if (!s || !m || typeof m.text !== 'string') return;
        const now = Date.now();
        if (now - s.lastChat < 800) return;
        s.lastChat = now;
        const text = m.text.replace(/\s+/g, ' ').trim().slice(0, 120);
        if (text) this.broadcast('chat', { s: client.sessionId, name: s.profile.name, text });
    }
}

// a dropped player's "world": nobody's in it, so nobody draws them
const OFFSTAGE = 99;
const DROP_MATCH_MS = 6000;
const botAvatar = () => JSON.stringify({ e: { skinId: String(Math.floor(Math.random() * 21)) }, p: { height: Math.round(rnd(0.92, 1.08) * 100) / 100 } });
// the same player somewhere else (another tab, another server): they leave there
function kickOthers(uid, keep) {
    // (one waiting to reconnect has no socket to close: its wait is over)
    for (const room of liveRooms) for (const o of room.sessions.values()) if (o.profile.uid === uid && o !== keep) { try { if (o.recon) o.recon.reject(false); else o.client.leave(4000); } catch (e) { /* gone */ } }
}
function isOnline(uid) {
    for (const room of liveRooms) for (const s of room.sessions.values()) if (s.profile.uid === uid) return true;
    return false;
}
void stageNeed;
