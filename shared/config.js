// Jingle Jelly Dash: the game's data and formulas, shared by the client and the server.
// The loop: every step is +Speed. Run, or train on the treadmills in Jingle Square (they multiply every step). Your Speed opens the
// ribbon gates of the Jelly Run: stage after stage of a long escape course carpeted in wobbling jelly, a Wobbler plopping down behind
// you in each one. Outrun it to the Win Pad at the stage's end for Wins. Wins buy faster shoes and open Gift Boxes for pets. A Level
// cap sends you to rebirth; clearing the last stage of a world opens the next. And PLAY: Avalanche Rush, six lanes, a wall of snow
// rolling in behind, first out wins.
// Everything is bought with Wins or Gems, all earned in the game. There are no in-app purchases.
export const lookup = (o) => Object.assign(Object.create(null), o);

export const CFG = {
    maxPlayers: 16,
    // moving: base run speed, gravity, the fastest fall, a jump's power; the fastest anyone runs
    walk: 16, vMax: 80, grav: 110, fallMax: 210, airDash: 46, hopV: 22, power: 58,
    // steps the server counts: this many a second, a couple of seconds' worth saved for a hiccup in the network
    stepRate: 14, stepBurst: 26,
    // on the ground a step is a stride (longer the faster you go, so a step takes at least 1/7 s)
    stride: 4.2, strideHz: 7,
    // a treadmill: steps a second by itself, and sprinting (holding DASH)
    treadRate: 4.5, treadSprint: 9,
    // a Win Pad pays again after this long
    padCool: 30,
    // every so many steps a Mega Squish: this much more of everything
    megaEvery: 25, megaK: 5,
    // DASH: how much faster, how long, how long before the next
    dashK: 1.65, dashSecs: 0.6, dashCool: 2.4,
    // a Wobbler: how long it waits before it comes, how far behind it starts; reviving where it caught you costs Gems
    shadeDelay: 1.3, shadeDelayEarly: 2.6, shadeBack: 14, reviveGems: 5, reviveSecs: 4,
    // the server keeps this many bots about when it's quiet (one leaves per player who joins)
    bots: 3,
    boostP2Gems: 25, boostP2Mins: 15, boostW2Gems: 40, boostW2Mins: 10,
    spinMins: 7, spinMax: 3,
    // Avalanche Rush: places, how long the queue stays open, how long the start line waits
    matchSpots: 6, matchQueue: 9, matchFull: 3, matchReady: 6,
};

// ----- jump power -> height (studs) -----
export const jumpH = (p) => Math.max(0, p) * Math.max(0, p) / 392;
export const jumpV = (p) => Math.sqrt(2 * CFG.grav * jumpH(p));

export const RARITIES = lookup({
    common: { name: 'Common', color: '#c8d0dc' }, uncommon: { name: 'Uncommon', color: '#7dff6b' }, rare: { name: 'Rare', color: '#3ab4ff' }, epic: { name: 'Epic', color: '#b45aff' },
    legendary: { name: 'Legendary', color: '#ffc42a' }, mythic: { name: 'Mythic', color: '#ff4a8a' },
});

// ----- the shoes: Wins buy the next pair. add: more Speed per step. The look: colours, a glow, wings -----
const sh = (id, name, rarity, add, wins, c1, c2, glow, wing) => ({ id, name, rarity, add, wins, c1, c2, glow: glow || 0, wing: wing || 0 });
export const SHOES = [
    sh('socks', 'Cozy Socks', 'common', 0, 0, 0xe8443a, 0xfff4ea),
    sh('slippers', 'Fuzzy Slippers', 'common', 1, 5, 0x8ad8ff, 0xffffff),
    sh('elf', 'Elf Booties', 'uncommon', 3, 22, 0x2ab450, 0xffd23a),
    sh('gumdrop', 'Gumdrop Kicks', 'uncommon', 8, 75, 0xff5aa8, 0x7dff6b),
    sh('snow', 'Snow Sneakers', 'rare', 20, 260, 0xf4fbff, 0x3ab4ff, 0.35),
    sh('mint', 'Peppermint Pumps', 'rare', 50, 900, 0xff3a4a, 0xffffff, 0.35),
    sh('ginger', 'Gingerbread Treads', 'rare', 120, 3200, 0xb0662e, 0xfff4e0, 0.4),
    sh('jelly', 'Jelly Jumpers', 'epic', 300, 11000, 0xff4ad8, 0xffb4f0, 0.6),
    sh('tinsel', 'Tinsel Trainers', 'epic', 750, 38000, 0xffd23a, 0xe8f0ff, 0.6),
    sh('reindeer', 'Reindeer Racers', 'epic', 1900, 130000, 0x8a5428, 0xff3a3a, 0.75, 1),
    sh('frost', 'Frostbite Boots', 'legendary', 4800, 450000, 0xd8f8ff, 0x3a9aff, 0.7),
    sh('sleigh', 'Sleigh Skates', 'legendary', 12000, 1600000, 0xd8202e, 0xffd23a, 0.85, 1),
    sh('aurora', 'Aurora Hi-Tops', 'legendary', 30000, 5500000, 0x3affc8, 0xa65aff, 0.9),
    sh('star', 'North Star Boots', 'mythic', 75000, 20000000, 0x1a2a6a, 0xfff4a0, 1, 1),
    sh('comet', 'Candy Comet Wings', 'mythic', 190000, 70000000, 0xff7ad8, 0x7ae8ff, 1, 1),
    sh('jolly', 'Jolly Legend Boots', 'mythic', 480000, 250000000, 0xffffff, 0xff2a4a, 1, 1),
];
export const shoeOf = (p) => SHOES[Math.min(SHOES.length - 1, Math.max(0, (p && p.shoe) || 0))];

// ----- Level: what your Speed has filled. Every Level adds to what a step gives. A Level cap: rebirth to go past it -----
export const levelK = (lv) => 1 + 0.06 * (Math.max(1, lv | 0) - 1);
export const xpNeed = (lv, r) => Math.round(20 * Math.pow(1.42, Math.max(0, (lv | 0) - 1)) * Math.pow(2.2, r || 0));
export const lvCap = (r) => 10 + 3 * (r || 0);
export const rebirthMult = (r) => 1 + 0.5 * (r || 0);
// a rebirth costs Wins too: more shoe now, or more of everything later
export const rebirthCost = (r) => Math.round(60 * Math.pow(2.4, r || 0));
export const upLevel = (p, id) => (p.ups && p.ups[id]) || 0;
// the Upgrades, for Wins (kept when you rebirth)
export const UPGRADES = [
    { id: 'soles', name: 'Bouncy Soles', icon: '👟', text: 'More Speed from every step', base: 6, grow: 2.3, max: 18, stat: (n) => '+' + n * 15 + '% Speed a step' },
    { id: 'feet', name: 'Sugar Rush', icon: '⚡', text: 'You run faster', base: 10, grow: 2.4, max: 10, stat: (n) => '+' + n * 4 + '% run speed' },
    { id: 'ward', name: 'Wobble Ward', icon: '🛡️', text: 'Wobblers chase you slower', base: 14, grow: 2.5, max: 8, stat: (n) => '-' + n * 2 + '% Wobbler speed' },
    { id: 'spring', name: 'Jelly Springs', icon: '🦘', text: 'You jump higher and further', base: 18, grow: 2.6, max: 6, stat: (n) => '+' + n * 5 + '% jump' },
    { id: 'mega', name: 'Mega Squish', icon: '💥', text: 'Your Mega Squish comes round sooner', base: 30, grow: 2.8, max: 8, stat: (n) => 'every ' + (CFG.megaEvery - n * 2) + ' steps' },
    { id: 'luck', name: 'Lucky Bells', icon: '🔔', text: 'More Wins from every Win Pad', base: 25, grow: 2.6, max: 12, stat: (n) => '+' + n * 10 + '% Wins' },
    { id: 'den', name: 'Pet Igloo', icon: '🏠', text: 'Room for one more pet on your team', base: 120, grow: 8, max: 3, stat: (n) => (3 + n) + ' on your team' },
];
export const upgradeById = lookup(Object.fromEntries(UPGRADES.map((u) => [u.id, u])));
export const upgradeCost = (u, n) => Math.round(u.base * Math.pow(u.grow, n));
export const jumpPowerOf = (p) => CFG.power * Math.sqrt(1 + 0.05 * upLevel(p, 'spring'));
export const megaEveryOf = (p) => CFG.megaEvery - 2 * upLevel(p, 'mega');
export const isMega = (steps, p) => (steps + 1) % megaEveryOf(p) === 0;
export const teamMax = (p) => 3 + upLevel(p, 'den');

// ----- trails and auras: what you wear, and what it's worth. Trails for Wins, auras for Gems. Both more Speed -----
export const TRAILS = [
    { id: 'none', name: 'No Trail', rarity: 'common', wins: 0, gems: 0, c1: 0xffffff, mult: 1 },
    { id: 'snow', name: 'Snow Puff', rarity: 'common', wins: 15, gems: 0, c1: 0xf4fbff, mult: 1.1 },
    { id: 'candy', name: 'Candy Sparks', rarity: 'uncommon', wins: 90, gems: 0, c1: 0xff4a5a, mult: 1.25 },
    { id: 'holly', name: 'Holly Leaves', rarity: 'uncommon', wins: 450, gems: 0, c1: 0x46ec50, mult: 1.5 },
    { id: 'tinsel', name: 'Tinsel Ribbon', rarity: 'rare', wins: 2500, gems: 0, c1: 0xffd23a, mult: 2 },
    { id: 'mint', name: 'Peppermint Swirl', rarity: 'epic', wins: 15000, gems: 0, c1: 0xff7ab4, mult: 3 },
    { id: 'star', name: 'Starlight', rarity: 'epic', wins: 1e5, gems: 0, c1: 0xfff4a0, mult: 5 },
    { id: 'aurora', name: 'Aurora Wake', rarity: 'legendary', wins: 8e5, gems: 0, c1: 0x3affc8, mult: 9 },
    { id: 'rainbow', name: 'Rainbow Jelly', rarity: 'mythic', wins: 1e7, gems: 0, c1: 0xffffff, rainbow: 1, mult: 16 },
];
export const trailById = lookup(Object.fromEntries(TRAILS.map((s) => [s.id, s])));
export const AURAS = [
    { id: 'none', name: 'No Aura', rarity: 'common', wins: 0, gems: 0, c1: 0xffffff, mult: 1 },
    { id: 'frosty', name: 'Frosty Glow', rarity: 'uncommon', wins: 0, gems: 20, c1: 0x7ae8ff, mult: 1.25 },
    { id: 'cocoa', name: 'Cocoa Warmth', rarity: 'rare', wins: 0, gems: 60, c1: 0xff9a3a, mult: 1.6 },
    { id: 'holly', name: 'Holly Aura', rarity: 'epic', wins: 0, gems: 150, c1: 0x46ec50, mult: 2.2 },
    { id: 'star', name: 'Starlight Aura', rarity: 'legendary', wins: 0, gems: 350, c1: 0xffd23a, mult: 3.2 },
    { id: 'rainbow', name: 'Rainbow Jelly', rarity: 'mythic', wins: 0, gems: 800, c1: 0xffffff, rainbow: 1, mult: 5 },
];
export const auraById = lookup(Object.fromEntries(AURAS.map((s) => [s.id, s])));

// ----- the treadmills in Jingle Square. Run on one and every step counts for its multiplier -----
export const POSTS = [
    { id: 'gumdrop', name: 'Gumdrop Belt', mult: 1, reb: 0, gems: 0, c: 0x46b45a, c2: 0x7dff6b },
    { id: 'mint', name: 'Peppermint Belt', mult: 2, reb: 1, gems: 0, c: 0xd8303e, c2: 0xffffff },
    { id: 'ginger', name: 'Gingerbread Belt', mult: 3, reb: 2, gems: 0, c: 0xa8642e, c2: 0xffd08a },
    { id: 'frost', name: 'Frosted Belt', mult: 5, reb: 3, gems: 0, c: 0x9ac8ec, c2: 0x5ae8ff },
    { id: 'bell', name: 'Golden Bell Belt', mult: 8, reb: 5, gems: 0, c: 0xffc21e, c2: 0xfff4a0 },
    { id: 'ice', name: 'Ice Crystal Belt', mult: 12, reb: 7, gems: 0, c: 0x5ad8ff, c2: 0xffffff },
    { id: 'aurora', name: 'Aurora Belt', mult: 20, reb: 10, gems: 0, c: 0x7a4aff, c2: 0x3affc8 },
    { id: 'jingle', name: 'Jingle Belt', mult: 35, reb: 0, gems: 120, c: 0xc81e3a, c2: 0xffd23a },
    { id: 'star', name: 'North Star Belt', mult: 60, reb: 0, gems: 400, c: 0x2a2a7a, c2: 0xfff4a0 },
];
export const postOpen = (p, i) => { const c = POSTS[i]; return !!c && (c.gems ? !!(p.posts && p.posts[c.id]) : (p.rebirths || 0) >= c.reb); };

// ----- pets: little winter critters that follow you. Out of Gift Boxes (eight of them), five in each -----
// ear: 0 none, 1 pointed, 2 floppy, 3 long; horn 0 none, 1 one, 2 antlers; tail 0..2; spike 0/1 (client/src/pals.js builds them all from one model)
// (the boxes are called JAWBREAKERS in the code: the list every system already knows)
const PT = ['common', 'uncommon', 'rare', 'epic', 'legendary'], PM = [0.1, 0.18, 0.3, 0.55, 1], ODDS = [50, 30, 14, 5, 1];
const JB = (id, name, wins, c1, c2, c3, list) => ({ id, name, wins, c1, c2, c3, list });
const pal = (name, c1, c2, ear, horn, tail, spike) => ({ name, c1, c2, ear, horn, tail, spike: spike || 0 });
export const JAWBREAKERS = [
    JB('paper', 'Paper Gift', 5, 0xe8443a, 0x46c85a, 0xfff4ea, [pal('Snow Bunny', 0xffffff, 0xff8ab4, 3, 0, 0), pal('Gumdrop Pup', 0xff5a6a, 0xffe0e6, 2, 0, 1), pal('Mitten Mouse', 0xc8ccd8, 0xff4a5a, 1, 0, 1), pal('Cocoa Cub', 0x8a5a3a, 0xffd8b0, 1, 0, 0), pal('Jingle Kitten', 0xffa04a, 0xfff4a0, 1, 0, 2)]),
    JB('ribbon', 'Ribbon Gift', 40, 0x3a8aff, 0xffd23a, 0xe8f4ff, [pal('Holly Hedgehog', 0x8a6a4a, 0x46ec50, 0, 0, 0, 1), pal('Candy Fox', 0xff5a3a, 0xffffff, 1, 0, 2), pal('Elf Pup', 0x46c85a, 0xff4a4a, 1, 0, 1), pal('Sugar Lamb', 0xfff4f0, 0xff8ad8, 2, 2, 0), pal('Tinsel Owl', 0xd8c8a8, 0xffd23a, 1, 0, 0)]),
    JB('cocoa', 'Cocoa Gift', 260, 0x8a5428, 0xfff4e0, 0x4a2410, [pal('Marshmallow Bear', 0xfff8f0, 0xffb4c8, 1, 0, 0), pal('Cinnamon Fox', 0xc86a2a, 0xffe0b0, 1, 0, 2), pal('Toffee Owl', 0xd8964a, 0xfff0c8, 1, 0, 0), pal('Gingerbread Pup', 0xb0662e, 0xffffff, 2, 0, 1), pal('Fudge Moose', 0x5a341e, 0xffd8a0, 2, 2, 0, 1)]),
    JB('frost', 'Frost Gift', 1700, 0xa8e8ff, 0xffffff, 0x3a8ae8, [pal('Ice Penguin', 0x2a3a5a, 0xffffff, 0, 0, 0), pal('Frost Fox', 0xe8f8ff, 0x7ad8ff, 1, 0, 2), pal('Polar Cub', 0xffffff, 0xa8e8ff, 1, 0, 0), pal('Snowflake Seal', 0xc8e0f0, 0x5ab4ff, 0, 0, 1), pal('Glacier Yeti', 0xe8f4ff, 0x3ab4ff, 2, 2, 0, 1)]),
    JB('candy', 'Candy Gift', 11000, 0xff4ad8, 0xffffff, 0x8a1a6a, [pal('Gummy Bear', 0xff4a6a, 0xffd23a, 1, 0, 0), pal('Lollipop Lamb', 0xff8ad8, 0xffffff, 2, 1, 0), pal('Jellybean Bunny', 0x7dff6b, 0xff4ad8, 3, 0, 0), pal('Taffy Cat', 0xffb45a, 0xff5ab4, 1, 0, 2), pal('Candy Cane Dragon', 0xff2a3a, 0xffffff, 1, 2, 2, 1)]),
    JB('starry', 'Star Gift', 75000, 0x2a2a7a, 0xffd23a, 0x0a0a2a, [pal('Twinkle Mouse', 0xc8c8f0, 0xffd23a, 1, 0, 1), pal('Comet Pup', 0x5a6aff, 0xfff4a0, 2, 0, 1), pal('Star Owl', 0x3a2a6a, 0xffd23a, 1, 0, 0), pal('Moonbeam Fox', 0xe8e8ff, 0x7a8aff, 1, 0, 2, 1), pal('Nova Reindeer', 0x8a5aff, 0xfff4a0, 1, 2, 1, 1)]),
    JB('aurora', 'Aurora Gift', 500000, 0x3affc8, 0xa65aff, 0x0a3a4a, [pal('Aurora Axolotl', 0xff9ae0, 0x3affc8, 1, 0, 2), pal('Prism Penguin', 0x3a3a6a, 0x7ae8ff, 0, 0, 0), pal('Northern Lynx', 0xd8e8ff, 0x3affc8, 1, 0, 2), pal('Borealis Stag', 0x5a3a8a, 0x3affc8, 1, 2, 1, 1), pal('Aurora Dragon', 0x2ad8b4, 0xd85aff, 3, 2, 2, 1)]),
    JB('jolly', 'Jolly Gift', 3500000, 0xffd23a, 0xff2a4a, 0xffffff, [pal('Bell Kitten', 0xffd23a, 0xff2a4a, 1, 0, 2), pal('Sleigh Pup', 0xff3a3a, 0xffd23a, 2, 0, 1), pal('Golden Reindeer', 0xffc23a, 0xfff4e0, 1, 2, 1), pal('Yule Phoenix', 0xff6a1a, 0xffe24a, 1, 1, 2, 1), pal('Jolly Jelly King', 0xff4a8a, 0xffd23a, 3, 2, 2, 1)]),
];
export const PALS = [];
JAWBREAKERS.forEach((J, j) => J.list.forEach((a, i) => {
    const k = Math.pow(2.3, j);
    PALS.push({ ...a, id: J.id + i, jb: j, tier: i, rarity: PT[i], odds: ODDS[i], mult: Math.round((1 + PM[i] * k) * 100) / 100 });
}));
export const palById = lookup(Object.fromEntries(PALS.map((a) => [a.id, a])));
export const palsOf = (j) => PALS.filter((a) => a.jb === j);
// your team's worth: what each pet adds, together
export function teamMult(team) {
    let m = 1;
    for (const id of team || []) { const a = palById[id]; if (a) m += a.mult - 1; }
    return Math.round(m * 100) / 100;
}
// a finished Gift Box's collection pays this many Gems
export const jbGems = (j) => 5 + j * 5;

// ----- what a step gives (before a treadmill's multiplier and a Mega Squish) -----
export function stepGain(p, x2, w) {
    const world = WORLDS[w === undefined ? (p.world || 0) : w] || WORLDS[0];
    return (1 + shoeOf(p).add) * levelK(p.lv) * rebirthMult(p.rebirths) * teamMult(p.team) * (TRAILS[p.trail | 0] || TRAILS[0]).mult * (AURAS[p.aura | 0] || AURAS[0]).mult * (1 + 0.15 * upLevel(p, 'soles')) * world.pow * (x2 ? 2 : 1);
}
export const padPay = (p, w, k, first, w2) => Math.max(1, Math.round(padWins(w, k) * (first ? FIRST_PAD : 1) * (1 + 0.1 * upLevel(p, 'luck')) * (w2 ? 2 : 1)));

// ----- the worlds: 15 stages each, every one needing more Speed and paying more than the last. Clearing the last opens the next -----
export const WALLS_N = 15;
// a stage: its name; the Wobbler that chases you through it lives in the world (shade), the last stage's is its boss.
// jelly: the colours of the jelly carpeting the course; floor/path/rim: the ground; wall/wall2: the candy walls; trim: their lights;
// moss: what grows or sits on top (holly, icing, snow, stardust); hazard/hazard2: the syrup pools; sea/sea2: the land all round
export const WORLDS = [
    {
        id: 'jingle', name: 'Jingle Village', rank: 'I', icon: '🎄', sc: 1, pow: 1, wins: 1, mood: 'jingle', shade: 'gobbler', shadeName: 'Gumdrop Gobbler', bossName: 'Gobbler King',
        floor: 0xf2f6fc, floor2: 0xe6eef8, path: 0xff5a64, rim: 0xc6d4e8, wall: 0xf6f2ec, wall2: 0xd8343e, trim: 0xffd23a, moss: 0x2aa84a, hazard: 0xd81e3a, hazard2: 0xff8aa0, sea: 0xdce8f6, sea2: 0xffffff, glow: 0xffd23a,
        jelly: [0xff3a5a, 0x3ad860, 0xff7ac8],
        stages: ['Snowy Start', 'Gumdrop Lane', 'Candy Cane Row', 'Jelly Hollow', 'Mitten Way', 'Cocoa Corner', 'Bell Tower Run', 'Tinsel Trail', 'Sugarplum Street', 'Wobble Walk', 'Present Pile', 'Sleigh Slope', 'Snowglobe Square', 'Frosty Finish', 'Gobbler King\'s Hall'],
    },
    {
        id: 'ginger', name: 'Gingerbread Glen', rank: 'II', icon: '🍪', sc: 6e7, pow: 40, wins: 120, mood: 'ginger', shade: 'muncher', shadeName: 'Marmalade Muncher', bossName: 'Caramel Colossus',
        floor: 0xd8a06a, floor2: 0xcc9460, path: 0xfff4e4, rim: 0x8a5428, wall: 0xb8743c, wall2: 0x7a4420, trim: 0xffb43a, moss: 0xffffff, hazard: 0xc85a10, hazard2: 0xffc04a, sea: 0x6a3a22, sea2: 0xb07a4a, glow: 0xffa83a,
        jelly: [0xff8a1a, 0xffc23a, 0xe8303a],
        stages: ['Cookie Gate', 'Icing Alley', 'Crumb Bridge', 'Caramel Creek', 'Toffee Steps', 'Oven Row', 'Sprinkle Path', 'Fudge Falls', 'Muffin Mile', 'Cinnamon Swirl', 'Syrup Springs', 'Biscuit Bend', 'Honey Hill', 'Baker\'s Dozen', 'The Colossus\'s Kitchen'],
    },
    {
        id: 'frost', name: 'Frostberry Falls', rank: 'III', icon: '❄️', sc: 3.6e15, pow: 1600, wins: 14000, mood: 'frost', shade: 'razz', shadeName: 'Blue Razz Blob', bossName: 'Frostberry Queen',
        floor: 0xdcf0fc, floor2: 0xd0e6f6, path: 0xffffff, rim: 0x9ab8d8, wall: 0xb4dcf6, wall2: 0x6aa4dc, trim: 0x5ae8ff, moss: 0xffffff, hazard: 0x1a5ac8, hazard2: 0x8ae0ff, sea: 0x4a8ad8, sea2: 0xe0f8ff, glow: 0x7ae8ff,
        jelly: [0x3a8aff, 0x3ae8d8, 0x9a7aff],
        stages: ['Icicle Gate', 'Berry Brook', 'Slush Slide', 'Frozen Falls', 'Snowdrift Dash', 'Blue Razz Ridge', 'Glacier Glide', 'Frostbite Path', 'Crystal Cove', 'Sleet Street', 'Polar Pass', 'Shiver Stair', 'Blizzard Bend', 'Winter\'s Heart', 'Frostberry Queen\'s Court'],
    },
    {
        id: 'star', name: 'Starlight Sweets', rank: 'IV', icon: '🌟', sc: 2e23, pow: 64000, wins: 1.7e6, mood: 'star', shade: 'glutton', shadeName: 'Grape Glutton', bossName: 'Midnight Monarch',
        floor: 0x5a4a8a, floor2: 0x52437e, path: 0xffd23a, rim: 0x2e2050, wall: 0x47367a, wall2: 0x2c1e56, trim: 0xff7ad8, moss: 0xfff4a0, hazard: 0x2a0a5a, hazard2: 0xc87aff, sea: 0x1a0e3a, sea2: 0xb45aff, glow: 0xd87aff,
        jelly: [0xa04aff, 0xff4ad8, 0x4ad8ff],
        stages: ['Twinkle Gate', 'Moonbeam Walk', 'Comet Curve', 'Stardust Steps', 'Nebula Nougat', 'Meteor Mile', 'Galaxy Gumdrops', 'Orbit Alley', 'Aurora Arch', 'Wishing Way', 'Starfall Stair', 'Cosmic Candy', 'Midnight Mint', 'The Last Light', 'Midnight Monarch\'s Throne'],
    },
];
// the Speed a stage's gate wants (stage 0's is open): about x3.2 a stage, a little less further in, so a first world lasts most of an hour
const NEED = [0, 12, 40, 135, 450, 1500, 4800, 15000, 45000, 135000, 400000, 1150000, 3300000, 9500000, 27000000];
const STAGE_WINS = [1, 1, 2, 3, 5, 7, 10, 14, 19, 26, 35, 47, 63, 84, 112];
export const stageNeed = (w, k) => (k <= 0 ? 0 : NEED[Math.min(WALLS_N - 1, k)] * WORLDS[w].sc);
export const stageName = (w, k) => WORLDS[w].stages[k];
export const padWins = (w, k) => STAGE_WINS[k] * WORLDS[w].wins;
// the first touch of a pad each rebirth pays this much more
export const FIRST_PAD = 3;
export const worldOpen = (p, w) => w === 0 || ((p.bests && p.bests[w - 1]) || 0) >= WALLS_N;
// the first gate your Speed doesn't open (WALLS_N: they're all open)
export function gateLock(speed, w) { for (let k = 0; k < WALLS_N; k++) if (speed < stageNeed(w, k)) return k; return WALLS_N; }
// how fast you run, studs a second: a log of your Speed against the world's scale (every world starts slow again), Sugar Rush on top
export const runSpeed = (p, speed, w) => Math.min(CFG.vMax, CFG.walk + 3.4 * Math.log(1 + Math.max(0, speed) / (4 * WORLDS[w || 0].sc))) * (1 + 0.04 * upLevel(p, 'feet'));
// a step on the ground: a stride, longer the faster you go
export const strideOf = (v) => Math.max(CFG.stride, v / CFG.strideHz);
// a stage's Wobbler: as quick as this share of how fast you run when it wakes (Wobble Ward slows it)
// (the first stages slow: half your speed in the first, two thirds by the fifth, then up to 0.88 in the last)
export const shadeRel = (k, p) => Math.min(0.92, k < 4 ? 0.5 + 0.045 * k : 0.68 + 0.02 * (k - 4)) * (1 - 0.02 * upLevel(p, 'ward'));
// how fast the stage is meant to be run (its layout is sized for this): someone with just enough Speed for it
export const stageV = (k) => CFG.walk + 3.4 * Math.log(1 + NEED[Math.max(0, Math.min(WALLS_N - 1, k))] / 4);

// ----- a title over your head: how far you've come (stages cleared, all told) -----
const TITLES = [[0, 'Snow Sprout'], [3, 'Jelly Jogger'], [8, 'Gumdrop Dasher'], [15, 'Candy Sprinter'], [25, 'Peppermint Racer'], [40, 'Sleigh Speedster'], [60, 'Jingle Champion'], [100, 'Jelly Legend'], [160, 'North Star Legend']];
export const titleOf = (cleared) => { let t = TITLES[0][1]; for (const [n, name] of TITLES) if ((cleared || 0) >= n) t = name; return t; };

// ----- Avalanche Rush: what a race is like at a Level. Longer and tougher as you level up, and better paid -----
// your Level for this: your Level plus what you've left behind in rebirths
export const matchLv = (p) => (p.lv || 1) + 3 * (p.rebirths || 0);
export function matchInfo(lv) {
    const L = Math.max(1, lv | 0), segs = Math.min(14, 5 + Math.floor(L / 6));
    return {
        segs,
        // the clock runs out long after a good run; that's for the ones who stop
        secs: Math.round(Math.min(150, 24 + segs * 6.5)),
        // what's in the way: pools and bars from the start, swinging ornaments from Level 4, sliding presents from Level 6, candy canes from Level 8
        blades: L < 4 ? 0 : Math.min(segs - 1, 1 + Math.floor(L / 7)),
        sliders: L < 6 ? 0 : Math.min(segs - 2, 1 + Math.floor(L / 9)),
        pillars: L < 8 ? 0 : Math.min(segs - 1, 1 + Math.floor(L / 10)),
        // the avalanche behind: when it sets off, how fast, how fast it speeds up
        surgeAt: Math.max(3.5, 6 - L * 0.05), surgeV: Math.min(22, 15 + L * 0.12), surgeA: Math.min(0.55, 0.22 + L * 0.006),
        // how good the bots are: how they run, how often they trip
        botPace: Math.min(1, 0.86 + L * 0.004), botTrip: Math.max(0.12, 0.45 - L * 0.006),
    };
}
// in a race your Speed counts only so much (a log scale): a new player with quick feet can beat a veteran
export const matchPower = (p) => Math.round((1 + Math.min(0.2, Math.log10(1 + (p.speed || 0)) * 0.015)) * 100) / 100;
export const MATCH = { v: 27, boostSecs: 1.6, boostK: 1.45, stunSecs: 0.7, r: 3.2 };
export const PLACES = ['1st', '2nd', '3rd', '4th', '5th', '6th'];
const PLACE_K = [4.5, 3.2, 2.4, 1.8, 1.4, 1.1], PLACE_GEMS = [8, 5, 3, 2, 1, 1];
export function matchPrize(place, segs, lv, p) {
    const best = padWins(p.world || 0, Math.min(WALLS_N - 1, Math.max(0, ((p.bests && p.bests[p.world || 0]) || 1) - 1)));
    const k = PLACE_K[place] ?? 1.1, grow = 1 + Math.min(1.5, (lv | 0) * 0.015);
    return {
        wins: Math.max(1, Math.round((1 + best) * k * grow)),
        gems: (PLACE_GEMS[place] ?? 1) + (place === 0 ? Math.min(12, Math.floor((lv | 0) / 12)) : 0),
        speed: Math.round(Math.max(12, xpNeed(p.lv || 1) * 0.5) * k * Math.min(2.5, 0.5 + (segs || 0) / 6)),
    };
}
// everyone's colour in a race: their lane, their flags, their name on the board
export const SPOT_COL = [0xff4a6a, 0x3ab4ff, 0xffd23a, 0x46ec50, 0xc45aff, 0xff8a2a];
export const SPOT_CSS = SPOT_COL.map((c) => '#' + c.toString(16).padStart(6, '0'));

// ----- the wheel: one spin's prizes (weights) -----
export const SPIN = [
    { w: 22, xp: 1, text: 'Speed', color: '#3ad8ff' }, { w: 18, wins: 1, text: 'Wins', color: '#ffd028' }, { w: 14, gems: 5, text: '5 Gems', color: '#b45aff' },
    { w: 12, xp: 3, text: 'Big Speed', color: '#7ae8ff' }, { w: 10, wins: 3, text: 'Big Wins', color: '#ff9a1a' }, { w: 10, x2: 10, text: 'x2 Speed', color: '#46ec50' },
    { w: 8, gems: 15, text: '15 Gems', color: '#7a4aff' }, { w: 6, wins: 10, text: 'Huge Wins', color: '#ff4a8a' },
];
// a spin's prize grows with what you've reached
export function spinPrize(s, p) {
    const best = padWins(p.world || 0, Math.min(WALLS_N - 1, Math.max(0, ((p.bests && p.bests[p.world || 0]) || 1) - 1)));
    return { speed: s.xp ? Math.round(s.xp * xpNeed(p.lv || 1) * 0.35) : 0, wins: s.wins ? Math.round(s.wins * (1 + best)) : 0, gems: s.gems || 0, x2: s.x2 || 0 };
}

// ----- daily tasks -----
export const TASKS = lookup({
    wins: { text: 'Collect Wins', icon: '🏆', n: 40, gems: 6, wins: 6 },
    steps: { text: 'Take 800 steps', icon: '👟', n: 800, gems: 5, wins: 4 },
    cleared: { text: 'Clear Jelly Run stages', icon: '🎀', n: 12, gems: 6, wins: 5 },
    levels: { text: 'Level Up', icon: '⭐', n: 8, gems: 6, wins: 5 },
    pads: { text: 'Step on Win Pads', icon: '🏁', n: 10, gems: 5, wins: 6 },
    matches: { text: 'Race in Avalanche Rush', icon: '🥇', n: 3, gems: 8, wins: 6 },
    hatch: { text: 'Open Gift Boxes', icon: '🎁', n: 5, gems: 5, wins: 4 },
    spins: { text: 'Spin the Wheel', icon: '🎡', n: 2, gems: 5, wins: 3 },
    megas: { text: 'Land Mega Squishes', icon: '💥', n: 25, gems: 5, wins: 4 },
    escapes: { text: 'Escape Wobblers', icon: '🍬', n: 8, gems: 6, wins: 5 },
    candies: { text: 'Find Golden Candies', icon: '🍬', n: 3, gems: 8, wins: 6 },
});
const TASK_POOL = ['steps', 'cleared', 'levels', 'pads', 'matches', 'hatch', 'spins', 'megas', 'escapes', 'candies'];
export const dayKey = (ms) => new Date(ms).toISOString().slice(0, 10);
export const dayLeft = (ms) => 86400 - Math.floor(ms / 1000) % 86400;
export function tasksFor(day) {
    let h = 2166136261;
    for (let i = 0; i < day.length; i++) { h ^= day.charCodeAt(i); h = Math.imul(h, 16777619); }
    const r = rngFrom(h >>> 0), pool = TASK_POOL.slice(), out = ['wins'];
    while (out.length < 3) out.push(pool.splice(Math.floor(r() * pool.length), 1)[0]);
    return out;
}

// ----- quests: always a next goal (shown at the top of the screen); they pay as soon as they're done -----
export const QUESTS = [
    { kind: 'speed', n: 12, text: 'Run or train to 12 Speed!', gems: 2 },
    { kind: 'best', n: 1, text: 'Clear Stage 1 of the Jelly Run', wins: 1 },
    { kind: 'pads', n: 2, text: 'Step on 2 Win Pads', gems: 2 },
    { kind: 'shoe', n: 1, text: 'Buy the Fuzzy Slippers', gems: 3 },
    { kind: 'hatch', n: 1, text: 'Open a Gift Box', wins: 2 },
    { kind: 'best', n: 3, text: 'Clear Stage 3', gems: 3 },
    { kind: 'lv', n: 5, text: 'Reach Level 5', wins: 3 },
    { kind: 'candyN', n: 1, text: 'Find a Golden Candy in a stage', gems: 4 },
    { kind: 'megas', n: 3, text: 'Land 3 Mega Squishes', gems: 3 },
    { kind: 'matches', n: 1, text: 'Press PLAY: race in Avalanche Rush', gems: 5 },
    { kind: 'upgrades', n: 1, text: 'Buy an upgrade', gems: 3 },
    { kind: 'shoe', n: 2, text: 'Buy the Elf Booties', wins: 6 },
    { kind: 'lv', n: 10, text: 'Hit the Level cap: Level 10', gems: 4 },
    { kind: 'rebirths', n: 1, text: 'Rebirth: x1.5 and the Peppermint Belt', gems: 10 },
    { kind: 'best', n: 5, text: 'Clear Stage 5', wins: 15 },
    { kind: 'escapes', n: 10, text: 'Escape 10 Wobblers', gems: 5 },
    { kind: 'candyN', n: 6, text: 'Find 6 Golden Candies', wins: 10 },
    { kind: 'trail', n: 1, text: 'Get a trail', wins: 8 },
    { kind: 'podium', n: 1, text: 'Finish a race in the top 3', gems: 8 },
    { kind: 'shoe', n: 4, text: 'Buy the Snow Sneakers', gems: 8 },
    { kind: 'best', n: 8, text: 'Clear Stage 8', wins: 60 },
    { kind: 'rebirths', n: 3, text: 'Rebirth 3 times: the Frosted Belt', gems: 15 },
    { kind: 'candyN', n: 15, text: 'Find 15 Golden Candies', gems: 20 },
    { kind: 'spins', n: 5, text: 'Spin the wheel 5 times', gems: 6 },
    { kind: 'steps', n: 5000, text: 'Take 5,000 steps', wins: 120 },
    { kind: 'matchWins', n: 1, text: 'Win a race', gems: 15 },
    { kind: 'best', n: 11, text: 'Clear Stage 11', gems: 20 },
    { kind: 'shoe', n: 6, text: 'Buy the Gingerbread Treads', wins: 500 },
    { kind: 'best', n: 15, text: 'Beat the Gobbler King: a new world!', gems: 40 },
    { kind: 'rebirths', n: 7, text: 'Rebirth 7 times: the Ice Crystal Belt', gems: 40 },
    { kind: 'matchWins', n: 5, text: 'Win 5 races', gems: 30 },
    { kind: 'hatch', n: 50, text: 'Open 50 Gift Boxes', gems: 40 },
    { kind: 'steps', n: 50000, text: 'Take 50,000 steps', gems: 60 },
];

// ----- rewards: the 7-day daily reward, playtime gifts, codes, the Gem shop -----
export const DAILY = [
    { speed: 40 }, { spins: 2 }, { wins: 15 }, { gems: 10 }, { speed: 400 }, { x2: 30 }, { wins: 150, gems: 30 },
];
export function dailyStatus(d, now) {
    const today = dayKey(now), yest = dayKey(now - 86400000);
    if (!d || !d.last) return { can: true, day: 0, streak: 0 };
    if (d.last === today) return { can: false, day: d.streak % 7, streak: d.streak };
    const streak = d.last === yest ? d.streak : 0;
    return { can: true, day: streak % 7, streak };
}
// FREE gifts for playing (minutes into this session)
export const GIFTS = [
    { min: 2, speed: 60 }, { min: 5, wins: 12 }, { min: 9, spins: 1 }, { min: 14, gems: 8 }, { min: 20, wins: 50 }, { min: 30, x2: 15 }, { min: 45, wins: 200, gems: 10 },
];
export const CODES = lookup({
    JINGLE: { speed: 100 }, JELLY: { gems: 5 }, SPEED: { wins: 10 }, BLOXITY: { spins: 2 }, LEGION: { gems: 5 }, SQUISH: { wins: 8, speed: 60 },
});
export const PACKS = [
    { id: 'p1', gems: 10, wins: 20 }, { id: 'p2', gems: 30, wins: 90 }, { id: 'p3', gems: 80, wins: 320 },
];
// a reward's Speed grows with your Level (what the server pays, and what the screen promises)
export const rewardSpeed = (r, lv) => (r.speed ? Math.round(r.speed * Math.max(1, Math.pow(1.3, (lv || 1) - 1) * 0.4)) : 0);
// HTML: a Win (a trophy) and Speed (a bolt) are drawn (classes "wc", "pc"), Gems are 💎
export function rewardText(r, plain) {
    return [r.speed ? fmt(r.speed) + (plain ? ' Speed' : ' <i class="pc"></i>') : '', r.wins ? fmtComma(r.wins) + (plain ? ' Wins' : ' <i class="wc"></i>') : '', r.gems ? r.gems + ' 💎' : '', r.spins ? r.spins + (r.spins > 1 ? ' spins' : ' spin') : '', r.x2 ? 'x2 Speed ' + r.x2 + ' min' : ''].filter(Boolean).join(' + ');
}

export const BOT_NAMES = [
    'JellyJay', 'GumdropGabe', 'SnowySky', 'ZoomZara', 'xXSquishXx', 'TinselTess', 'BellBen', 'FrostyFinn', 'CocoaKai', 'NovaNoel',
    'BlitzBo', 'HollyHana', 'SleighSam', 'QuickQuinn', 'MintyMia', 'JingleJules', 'SkySkipper', 'WobbleWill', 'SprinkleRio', 'CandyCam',
];

// ----- helpers -----
export function rngFrom(seed) {
    let s = (seed >>> 0) || 1;
    return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}
export function fmt(v) {
    v = Math.floor(v || 0);
    if (v < 1000) return String(v);
    const u = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];
    let i = 0, x = v;
    while (x >= 1000 && i < u.length - 1) { x /= 1000; i++; }
    return (x >= 100 ? Math.floor(x) : Math.floor(x * 100) / 100) + u[i];
}
export const fmtComma = (v) => { const s = String(Math.floor(v || 0)); return s.length < 4 || /e/.test(s) ? s : s.replace(/\B(?=(\d{3})+(?!\d))/g, ','); };
export function clock(s) {
    s = Math.max(0, Math.floor(s));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
    return (h ? h + ':' + String(m).padStart(2, '0') : String(m)) + ':' + String(x).padStart(2, '0');
}
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
