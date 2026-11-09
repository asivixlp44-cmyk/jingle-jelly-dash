// A world on screen (shared/world.js has where everything stands): Jingle Square (its treadmills, the Gift Boxes, the Shoe Shop, the
// Upgrades, the Worlds portal, the Avalanche Rush gate and the leaderboards) behind a gingerbread town wall, the giant wreath of the
// Jelly Gate in the middle of it; through the Gate the Jelly Run, a long course north cut into stages and carpeted in wobbling jelly
// (jelly.js): a ribbon gate at the start of each (a curtain of light until your Speed opens it), what's in the way, a Win Pad at the end.
// Static things are merged per stretch (the square, each stage) into two batches: candy blocks (a texture) and props (lit, glowing,
// floating). Everything that glows or moves is one draw for the whole world: the floor's syrup, boosts, pads and belts (decals), the
// curtains, beams, portals and halos (energy), the candle flames, the swinging ornaments, the sliding gift boxes, the Gift Boxes.
import { T, V3, scene, matte, texFrom, fitFont, prompts, START_QUALITY } from './engine.js';
import { Kit, glowVCMaterial, nearFade, batchKits, rng } from './geo.js';
import { blob, buildBlobs, releaseBlobs } from './blobs.js';
import { Signs, big, GOLD, LIME, WHITE, RED, AQUA, PINK } from './signs.js';
import { CU } from './clock.js';
import { buildJelly } from './jelly.js';
import { buildStageFx } from './stagefx.js';
import { W, tongueBar, upgradeShed, worldsPortal, playGate, boards, wallZ, padAt, postSpot, BELT, POST_R, jbSpot, JB_R, hubFor, northEnd, endPortal, stagePlan, bladeAt, sliderAt, SLIDER, STAGE_TYPES } from '../../shared/world.js';
import { SWEEP, BALL, JWALL, TRAMP, inRect } from '../../shared/stages.js';
import { WORLDS, WALLS_N, POSTS, JAWBREAKERS, SHOES, padWins, stageNeed, stageName, fmt } from '../../shared/config.js';

export const shade = (c, k) => new T.Color(c).multiplyScalar(k).getHex();
export const mixC = (a, b, k) => new T.Color(a).lerp(new T.Color(b), k).getHex();
const tc = new T.Color();
const col3 = (c) => { tc.set(c); return [tc.r, tc.g, tc.b]; };
export function floorQuad(kit, x0, x1, z0, z1, y, c) { kit.quad([x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0], c, { uv: [x0 / 8, z1 / 8, x1 / 8, z0 / 8] }); }
// the course's walls: their inner face, thickness, height
export const XIN = 17.6, WT = 6.4, WH = 24;
// a swinging ornament: its pivot over the way, the rope down to the middle of the ball (its x is bladeAt * (halfW - 3)). Hung high on
// a long rope, so the ball stays low all the way across: at the middle of its swing 2 studs up, at the ends 7.6
export const BLADE_PIVOT = 22.4, BLADE_ARM = 20.4;

// ----- each world's look beyond its colours (shared/config.js WORLDS has those) -----
// flame: candle flames; crystal: ice and sugar crystals; cloth/cloth2: ribbons and stockings; metal: lamp posts and brackets; wood:
// beams and stalls; roof/roof2: the stalls' roofs; cloud; leaf: pine needles and holly; shop/ups: the stalls' awnings; cane: the candy
// canes' stripe; bulbs: the string lights' colours; snow: what lies on top of things
const STYLES = {
    jingle: { flame: 0xffb43a, flame2: 0xfff4c0, crystal: 0xa8e8ff, cloth: 0xd8202e, cloth2: 0xffd23a, metal: 0x2a6a3a, wood: 0x8a5428, roof: 0xd8343e, roof2: 0xf6f2ec, cloud: 0xffffff, leaf: 0x1e7a3e, shop: [0xff3a4a, 0xffffff], ups: [0x2ab450, 0xffffff], cane: 0xe8202e, bulbs: [0xff3a3a, 0xffd23a, 0x3ae860, 0x3ab4ff, 0xff7ad8], snow: 0xffffff },
    ginger: { flame: 0xffa83a, flame2: 0xfff0b0, crystal: 0xffd8a0, cloth: 0x7a1e14, cloth2: 0xffc23a, metal: 0x4a2a14, wood: 0x6a3a1a, roof: 0x5a2e14, roof2: 0xfff4e4, cloud: 0xfff0e0, leaf: 0x2a6a2a, shop: [0xff7a2a, 0xfff4e4], ups: [0xe8303a, 0xfff4e4], cane: 0xff6a1a, bulbs: [0xffd23a, 0xff8a1a, 0xff3a3a, 0xfff4c0], snow: 0xfff8f0 },
    frost: { flame: 0x7ae8ff, flame2: 0xf4ffff, crystal: 0x7ae8ff, cloth: 0x2a5aa8, cloth2: 0xf0fbff, metal: 0x5a7aa8, wood: 0x8a7462, roof: 0xf4fbff, roof2: 0xb8dcf6, cloud: 0xffffff, leaf: 0x2a6a6a, shop: [0x3ab4ff, 0xf4fbff], ups: [0x7a5aff, 0xf0f4ff], cane: 0x3a8aff, bulbs: [0x7ae8ff, 0xffffff, 0x9a8aff, 0x3affd8], snow: 0xffffff },
    star: { flame: 0xd87aff, flame2: 0xffe0fa, crystal: 0xff7ad8, cloth: 0x3a1a6a, cloth2: 0xffd23a, metal: 0x2a2048, wood: 0x4a2a6a, roof: 0x3a2470, roof2: 0xffd23a, cloud: 0x7a5ab8, leaf: 0x2a3a7a, shop: [0xff4ad8, 0xffe0f8], ups: [0x7ae8ff, 0x2a1a5a], cane: 0xa04aff, bulbs: [0xffd23a, 0xff7ad8, 0x7ae8ff, 0xffffff], snow: 0xfff4c0 },
};
export const styleOf = (Wd) => STYLES[Wd.id] || STYLES.jingle;
// a world's colours as drawn (config.js WORLDS, with a few tuned here for the look)
const LOOK = {};
export const lookOf = (w) => { const Wd = WORLDS[w] || WORLDS[0]; return LOOK[Wd.id] ? { ...Wd, ...LOOK[Wd.id] } : Wd; };

// ----- candy blocks: one material for every merged block of a world (its colour is in the vertices), a texture of rounded sugar
// tiles, each a little domed (lit top left, shaded bottom right) with a sparkle of sugar, the seams between them lighter, like icing;
// one texture tile is 8 x 8 studs (the boxes use tile: 8) -----
let stoneMat = null;
function paintStone() {
    const N = 512, U = 64, c = document.createElement('canvas'); c.width = c.height = N;
    const x = c.getContext('2d'), R = rng(4242);
    x.fillStyle = 'rgb(252,250,250)'; x.fillRect(0, 0, N, N);
    const SPLITS = [[4, 4], [3, 2, 3], [2, 4, 2], [3, 3, 2], [2, 3, 3], [5, 3], [3, 5]];
    const rr = (bx, by, w, h, r) => { x.beginPath(); x.moveTo(bx + r, by); x.arcTo(bx + w, by, bx + w, by + h, r); x.arcTo(bx + w, by + h, bx, by + h, r); x.arcTo(bx, by + h, bx, by, r); x.arcTo(bx, by, bx + w, by, r); x.closePath(); };
    for (let row = 0; row < 4; row++) {
        const y0 = row * 128, sp = SPLITS[Math.floor(R() * SPLITS.length)], off = Math.floor(R() * 8) * U;
        let at = off;
        for (const len of sp) {
            const w = len * U, g = 214 + Math.floor(R() * 22), tint = (R() - 0.5) * 6;
            for (const dx of [0, -N]) {
                const bx = at + dx;
                if (bx > N || bx + w < 0) continue;
                x.save(); rr(bx + 5, y0 + 5, w - 10, 118, 22); x.clip();
                // the tile: a soft dome of light over it
                const gr = x.createRadialGradient(bx + w * 0.35, y0 + 40, 8, bx + w * 0.5, y0 + 64, Math.max(w, 128) * 0.75);
                gr.addColorStop(0, `rgb(${g + 26 + tint | 0},${g + 26 | 0},${g + 26 - tint | 0})`); gr.addColorStop(1, `rgb(${g - 18 + tint | 0},${g - 18 | 0},${g - 18 - tint | 0})`);
                x.fillStyle = gr; x.fillRect(bx, y0, w, 128);
                // sugar sparkle
                const r2 = rng(Math.floor(at * 7 + row * 131));
                for (let i = 0; i < len * 46; i++) { const v = r2(); x.fillStyle = v > 0.5 ? `rgba(255,255,255,${(v - 0.5) * 0.9})` : `rgba(0,0,0,${(0.5 - v) * 0.12})`; x.fillRect(bx + r2() * w, y0 + r2() * 128, 2 + r2() * 3, 2 + r2() * 3); }
                // a rim: lit top and left, shaded bottom and right
                x.lineWidth = 7; x.strokeStyle = 'rgba(255,255,255,0.45)'; rr(bx + 8, y0 + 8, w - 16, 112, 18); x.stroke();
                x.lineWidth = 6; x.strokeStyle = 'rgba(0,0,0,0.16)'; x.beginPath(); x.moveTo(bx + w - 9, y0 + 24); x.lineTo(bx + w - 9, y0 + 116); x.lineTo(bx + 24, y0 + 116); x.stroke();
                x.restore();
            }
            at += w;
        }
    }
    return c;
}
export function stoneMaterial() {
    if (!stoneMat) {
        const map = texFrom(paintStone(), true);
        map.anisotropy = 8;
        stoneMat = matte({ color: 0xffffff, vertexColors: true, map });
        void START_QUALITY;
    }
    return stoneMat;
}

// ----- custom quads: meshes whose every vertex says what it is (a decal's kind and where in it the vertex is, its colours) -----
export class Quads {
    constructor(spec) { this.spec = spec; this.d = {}; for (const [k] of spec) this.d[k] = []; this.idx = []; this.n = 0; }
    vert(v) { for (const [k, s] of this.spec) { const a = v[k], arr = this.d[k]; for (let i = 0; i < s; i++) arr.push(a ? a[i] ?? 0 : 0); } return this.n++; }
    quad(a, b, c, d) { this.idx.push(a, b, c, a, c, d); }
    geometry() {
        const g = new T.BufferGeometry();
        for (const [k, s] of this.spec) g.setAttribute(k, new T.Float32BufferAttribute(this.d[k], s));
        g.setIndex(this.idx);
        g.computeBoundingSphere();
        return g;
    }
}
const DECAL = [['position', 3], ['aK', 4], ['aC1', 3], ['aC2', 3], ['aOn', 1]];
const ENERGY = [['position', 3], ['aOff', 2], ['aK', 4], ['aC1', 3], ['aC2', 3], ['aOn', 1]];
export const decalQuads = () => new Quads(DECAL);
export const energyQuads = () => new Quads(ENERGY);
// a flat decal (kind) over x/z, its local corners -1..1 (north is -1)
export function decal(Q, kind, cx, y, cz, hx, hz, c1, c2, on, aux) {
    const C1 = col3(c1), C2 = col3(c2), b = Q.n;
    for (const [sx, sz] of [[-1, 1], [1, 1], [1, -1], [-1, -1]]) Q.vert({ position: [cx + sx * hx, y, cz + sz * hz], aK: [kind, sx, sz, aux || 0], aC1: C1, aC2: C2, aOn: [on ?? 1] });
    Q.quad(b, b + 1, b + 2, b + 3);
    return b;
}
// a portal standing up, facing +z (and its back facing -z): an oval vortex w x h, its bottom at y0
export function portalDecal(Q, cx, y0, cz, w, h, c1, c2) {
    const x0 = cx - w / 2, x1 = cx + w / 2, y1 = y0 + h;
    decalUp(Q, 6, [x0, y0, cz], [x1, y0, cz], [x1, y1, cz], [x0, y1, cz], c1, c2, 1, h / w);
    decalUp(Q, 6, [x1, y0, cz - 0.04], [x0, y0, cz - 0.04], [x0, y1, cz - 0.04], [x1, y1, cz - 0.04], c1, c2, 1, h / w);
}
// a decal standing up: corners a (bottom left), b (bottom right), c (top right), d (top left) as seen from its front
export function decalUp(Q, kind, a, b, c, d, c1, c2, on, aux) {
    const C1 = col3(c1), C2 = col3(c2), i = Q.n;
    [[a, -1, 1], [b, 1, 1], [c, 1, -1], [d, -1, -1]].forEach(([p, u, v]) => Q.vert({ position: p, aK: [kind, u, v, aux || 0], aC1: C1, aC2: C2, aOn: [on ?? 1] }));
    Q.quad(i, i + 1, i + 2, i + 3);
    return i;
}
// energy: a standing quad facing +z (or turned by ry), local 0..1 across and up
export function energyQuad(Q, kind, cx, y0, cz, w, h, c1, c2, on, aux, ry) {
    const C1 = col3(c1), C2 = col3(c2), b = Q.n, ca = Math.cos(ry || 0), sa = Math.sin(ry || 0);
    for (const [u, v] of [[0, 0], [1, 0], [1, 1], [0, 1]]) { const lx = (u - 0.5) * w; Q.vert({ position: [cx + lx * ca, y0 + v * h, cz - lx * sa], aK: [kind, u, v, aux || 0], aC1: C1, aC2: C2, aOn: [on ?? 1] }); }
    Q.quad(b, b + 1, b + 2, b + 3);
    return b;
}
// a halo: a soft glow turned to the camera (in the shader), r its size
export function halo(Q, x, y, z, r, c, k) {
    const C = col3(c), b = Q.n;
    for (const [u, v] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) Q.vert({ position: [x, y, z], aOff: [u * r, v * r], aK: [4, u, v, k ?? 1], aC1: C, aC2: C, aOn: [1] });
    Q.quad(b, b + 1, b + 2, b + 3);
}
// a geometry's triangles into energy quads (beams, rings): its uv as the local coordinates
export function energyGeo(Q, g, kind, m4, c1, c2, on, aux) {
    const C1 = col3(c1), C2 = col3(c2), p = g.attributes.position, uv = g.attributes.uv, b = Q.n, v = new T.Vector3();
    for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i).applyMatrix4(m4); Q.vert({ position: [v.x, v.y, v.z], aK: [kind, uv ? uv.getX(i) : 0, uv ? uv.getY(i) : 0, aux || 0], aC1: C1, aC2: C2, aOn: [on ?? 1] }); }
    if (g.index) for (let i = 0; i < g.index.count; i++) Q.idx.push(b + g.index.getX(i));
    else for (let i = 0; i < p.count; i++) Q.idx.push(b + i);
    return b;
}
const FOG_V = '#include <fog_pars_vertex>', FOG_F = '#include <fog_pars_fragment>';
// The floor's lights, unlit, in one draw: syrup pools (each world's own), boost chevrons, Win Pads, snowflake circles, treadmill belts
// and their screens. aK.x: the kind, aK.yz: where in it, aK.w: a spare number; aOn: on (a pad ready, a belt open)
export function decalMaterial(Wd, low) {
    const mode = { jingle: 0, ginger: 1, frost: 2, star: 3 }[Wd.id] ?? 0;
    return new T.ShaderMaterial({
        uniforms: T.UniformsUtils.merge([T.UniformsLib.fog, { uMode: { value: mode }, uLow: { value: low ? 1 : 0 } }, { uNow: CU.uNow }]),
        vertexShader: `attribute vec4 aK; attribute vec3 aC1; attribute vec3 aC2; attribute float aOn;
            varying vec4 vK; varying vec3 vC1; varying vec3 vC2; varying float vOn; varying vec3 vW;
            ${FOG_V}
            void main() {
                vK = aK; vC1 = aC1; vC2 = aC2; vOn = aOn;
                vec4 wp = modelMatrix * vec4(position, 1.0); vW = wp.xyz;
                vec4 mvPosition = viewMatrix * wp;
                gl_Position = projectionMatrix * mvPosition;
                #include <fog_vertex>
            }`,
        fragmentShader: `uniform float uNow; uniform float uMode; uniform float uLow;
            varying vec4 vK; varying vec3 vC1; varying vec3 vC2; varying float vOn; varying vec3 vW;
            ${FOG_F}
            float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
            float rr(vec2 q, vec2 b, float r) { vec2 d = abs(q) - b + r; return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - r; }
            void main() {
                float k = vK.x, t = uNow; vec2 q = vK.yz; vec3 c = vec3(0.0);
                if (k < 0.5) {
                    // a pool of hot syrup, its edge glossy
                    vec2 p = vW.xz;
                    float edge = smoothstep(0.86, 1.0, abs(q.y)) + smoothstep(0.97, 1.0, abs(q.x)) * vK.w;
                    // a slow swirl and bubbles rising and popping (every syrup)
                    float n = sin(p.x * 0.33 + t * 0.7 + sin(p.y * 0.29 + t * 0.4) * 2.0) * sin(p.y * 0.41 - t * 0.5 + sin(p.x * 0.23) * 1.5);
                    vec2 g = floor(p * 0.45), f = fract(p * 0.45) - 0.5; float h = hash(g), ph = fract(t * 0.45 + h);
                    float bub = (1.0 - smoothstep(0.05 + 0.22 * ph, 0.09 + 0.24 * ph, length(f - (vec2(hash(g + 1.3), hash(g + 2.7)) - 0.5) * 0.3))) * step(0.55, h);
                    // a glossy streak drifting over it (painted, not a reflection)
                    float gloss = smoothstep(0.86, 1.0, sin(p.x * 0.16 + p.y * 0.11 - t * 0.9 + sin(p.y * 0.07) * 2.0));
                    if (uMode < 0.5) {
                        // cherry syrup: deep red, pink ribbons folding through it
                        c = mix(vC1 * 0.55, vC1 * 1.05, smoothstep(-0.7, 0.9, n));
                        c = mix(c, vC2, smoothstep(0.55, 0.95, sin(p.x * 0.5 + n * 2.4 + t * 0.6)) * 0.35);
                    } else if (uMode < 1.5) {
                        // caramel: gold over amber, darker folds, a thick slow swirl
                        c = mix(vC1 * 0.7, vC2 * 1.0, smoothstep(-0.6, 0.8, n));
                        c = mix(c, vec3(0.35, 0.14, 0.03), smoothstep(0.6, 0.95, abs(sin(p.y * 0.35 + n * 2.0 - t * 0.3))) * 0.45);
                    } else if (uMode < 2.5) {
                        // blue razz slush: bright blue, slabs of ice drifting
                        float w = sin(p.x * 0.3 + t * 0.8) * sin(p.y * 0.25 - t * 0.6);
                        c = mix(vC1 * 0.75, vC1 * 1.2, 0.5 + 0.5 * w);
                        vec2 gi = p * 0.18 + vec2(0.0, t * 0.04); vec2 id = floor(gi), fi = fract(gi) - 0.5;
                        float ice = step(0.6, hash(id)) * (1.0 - smoothstep(0.26, 0.3, max(abs(fi.x), abs(fi.y)) + 0.08 * sin(id.x * 7.0 + fi.y * 9.0)));
                        c = mix(c, mix(vC2, vec3(1.0), 0.6), ice * 0.85);
                    } else {
                        // starry grape goo: purple swirls, stars twinkling in it
                        c = mix(vC1 * 1.4, vC2 * 0.7, smoothstep(0.1, 1.0, n) * 0.8);
                        vec2 gs = floor(p * 1.4); float st = step(0.965, hash(gs)) * (0.5 + 0.5 * sin(t * 3.0 + hash(gs + 4.0) * 30.0));
                        c += vec3(1.0, 0.9, 0.7) * st * 0.9;
                    }
                    c = mix(c, mix(vC2, vec3(1.0), 0.5), bub * (1.0 - ph) * 0.8);
                    c += vec3(1.0) * gloss * 0.22;
                    c = mix(c, mix(vC2, vec3(1.0), 0.35) * 1.15, clamp(edge, 0.0, 1.0) * 0.8);
                } else if (k < 1.5) {
                    // a boost pad: chevrons running north, a bright frame
                    float d = rr(q, vec2(1.0), 0.25);
                    if (d > 0.0) discard;
                    float f = fract((q.y + abs(q.x) * 0.55) * 1.4 + t * 1.8);
                    float chev = smoothstep(0.0, 0.07, f) * (1.0 - smoothstep(0.42, 0.5, f)) * step(abs(q.x), 0.78);
                    c = mix(vC1, vC2, chev);
                    c = mix(c, vec3(1.0), (1.0 - smoothstep(0.0, 0.04, -d - 0.08)) * 0.9);
                    c = mix(c, vC1 * 0.6, 1.0 - smoothstep(0.0, 0.03, -d));
                    c *= 1.0 + 0.15 * sin(t * 6.0);
                } else if (k < 2.5) {
                    // a Win Pad: a gold plate, rays turning under a pulse of light, a green rim (grey while it cools down)
                    vec2 vP = q;
                    float d = rr(vP, vec2(0.92), 0.2), r = length(vP), a = atan(vP.y, vP.x);
                    if (d > 0.0) discard;
                    c = mix(vec3(1.0, 0.36, 0.01), vec3(1.0, 0.62, 0.03), smoothstep(0.1, 0.9, r));
                    c = mix(c, vec3(1.0, 0.85, 0.22), smoothstep(0.6, 0.85, sin(a * 8.0 - t * 1.3)) * 0.5 * (1.0 - smoothstep(0.2, 0.92, r)));
                    c = mix(c, vec3(1.0, 0.95, 0.55), smoothstep(0.1, 0.0, abs(fract(r - t * 0.45) - 0.5)) * 0.42);
                    c = mix(c, vec3(0.08, 0.8, 0.1), smoothstep(-0.1, -0.08, d));
                    c = mix(c, vec3(1.0), smoothstep(-0.05, -0.03, d));
                    c = mix(vec3(dot(c, vec3(0.3, 0.5, 0.2))) * 0.62, c, vOn);
                } else if (k < 3.5) {
                    // a snowflake circle: two rings, a big six-armed snowflake turning slowly in the middle, little flakes round the band
                    float r = length(q);
                    if (r > 1.0) discard;
                    float ring = smoothstep(0.035, 0.0, abs(r - 0.96)) + smoothstep(0.03, 0.0, abs(r - 0.72));
                    float ga = atan(q.y, q.x) + t * 0.15 * (vK.w > 0.5 ? -1.0 : 1.0);
                    float seg = mod(ga + 0.5236, 1.0472) - 0.5236;
                    vec2 a = vec2(cos(seg), sin(seg)) * r;
                    float arm = smoothstep(0.03, 0.0, abs(a.y)) * step(r, 0.62);
                    float br = 0.0;
                    for (int i = 1; i < 4; i++) { float bx = float(i) * 0.15; vec2 d = a - vec2(bx, 0.0); br += smoothstep(0.025, 0.0, abs(abs(d.y) - d.x * 0.9)) * step(0.0, d.x) * step(d.x, 0.1 - float(i) * 0.012); }
                    float band = step(0.76, r) * step(r, 0.92);
                    float ca = mod(ga * 12.0 / 6.2832, 1.0) - 0.5; vec2 fl = vec2(ca * 0.55, r - 0.84);
                    float flake = band * smoothstep(0.03, 0.0, min(abs(fl.x), abs(fl.y)) ) * step(length(fl), 0.06);
                    float v = clamp(ring + arm + br + flake, 0.0, 1.0);
                    if (v < 0.06) discard;
                    c = mix(vC1 * 0.7, mix(vC1, vec3(1.0), 0.45) * 1.2, v) * (0.88 + 0.12 * sin(t * 2.0 + r * 6.0));
                } else if (k < 4.5) {
                    // a treadmill's belt: slats running back, the edges lit in its colour (a shut one: still, dark, its lights red)
                    float run = vOn, sl = fract(q.y * 7.0 - t * 1.6 * run);
                    c = mix(vec3(0.06, 0.065, 0.09), vec3(0.16, 0.17, 0.22), smoothstep(0.0, 0.06, sl) * (1.0 - smoothstep(0.85, 0.92, sl)));
                    float side = smoothstep(0.8, 0.86, abs(q.x));
                    float dash = step(0.5, fract(q.y * 4.0 - t * 1.6 * run));
                    vec3 acc = mix(vec3(1.0, 0.18, 0.12), vC2, run);
                    c = mix(c, acc * (0.7 + 0.5 * dash), side);
                    float chev = fract((q.y + abs(q.x) * 0.5) * 2.0 + t * 0.6 * run);
                    c += acc * 0.18 * smoothstep(0.0, 0.05, chev) * (1.0 - smoothstep(0.18, 0.25, chev)) * step(abs(q.x), 0.5);
                    c *= mix(0.55, 1.0, run);
                } else if (k > 6.5) {
                    // ice: pale blue, frosted, long streaks of shine sliding over it, sparkles, cracks
                    vec2 p = vW.xz;
                    float n = sin(p.x * 0.11 + sin(p.y * 0.07) * 2.0) * sin(p.y * 0.09 + p.x * 0.03);
                    c = mix(vec3(0.62, 0.82, 0.97), vec3(0.86, 0.95, 1.0), 0.5 + 0.5 * n);
                    float streak = smoothstep(0.9, 1.0, sin(p.x * 0.2 + p.y * 0.35 - t * 0.6));
                    c += vec3(1.0) * streak * 0.25;
                    vec2 cg = abs(fract(p * 0.08 + 0.3 * sin(p.yx * 0.05)) - 0.5);
                    c = mix(c, vec3(0.5, 0.7, 0.9), smoothstep(0.47, 0.5, max(cg.x, cg.y)) * 0.6);
                    vec2 sg = floor(p * 1.6); c += vec3(1.0) * step(0.985, hash(sg)) * (0.5 + 0.5 * sin(t * 4.0 + hash(sg + 3.0) * 20.0)) * 0.7;
                    c = mix(c, vec3(1.0), smoothstep(0.9, 1.0, abs(q.x)) * 0.5);
                } else if (k > 5.5) {
                    // a portal: a vortex of its two colours turning in an oval, a white-hot eye, a glowing rim (aux: its height over width)
                    vec2 d = vec2(q.x, -q.y);
                    float r = length(d);
                    if (r > 1.0) discard;
                    vec2 p = vec2(d.x, d.y * vK.w);
                    float pr = length(p), an = atan(p.y, p.x), tw = an + pr * 3.2 - t * 1.6;
                    float arms = smoothstep(0.25, 0.75, 0.5 + 0.5 * sin(tw * 3.0)), fine = 0.5 + 0.5 * sin(an * 7.0 - pr * 11.0 + t * 3.1);
                    float lip = smoothstep(0.35, 0.5, abs(fract(tw * 3.0 / 6.2832) - 0.5));
                    c = mix(vC1 * 0.28, vC1 * 1.05, arms);
                    c = mix(c, vC2, arms * fine * 0.5);
                    c = mix(c, mix(vC2, vec3(1.0), 0.4), (1.0 - lip) * arms * 0.5);
                    c = mix(c, vec3(1.0), smoothstep(0.55, 0.0, pr) * 0.8);
                    c = mix(c, vC2 * 1.25, smoothstep(0.82, 0.97, r));
                    c *= 0.92 + 0.12 * sin(t * 2.0 + pr * 4.0);
                } else {
                    // a treadmill's screen: bars bouncing to a beat, a frame (shut: a red cross)
                    vec2 p = vec2(q.x, -q.y) * 0.5 + 0.5;
                    float fr = step(0.92, max(abs(q.x), abs(q.y)));
                    float col = floor(p.x * 7.0), h = 0.25 + 0.6 * abs(sin(t * (2.0 + hash(vec2(col, vK.w)) * 3.0) + col * 1.7));
                    float bar = step(p.y * 1.1, h) * step(0.15, fract(p.x * 7.0)) * step(fract(p.x * 7.0), 0.85) * step(0.12, p.y);
                    c = mix(vec3(0.03, 0.04, 0.08), vC2 * mix(0.7, 1.25, p.y), bar * vOn);
                    float x1 = smoothstep(0.1, 0.0, abs(q.x - q.y)) + smoothstep(0.1, 0.0, abs(q.x + q.y));
                    c = mix(c, vec3(1.0, 0.2, 0.15), x1 * step(abs(q.x), 0.6) * (1.0 - vOn));
                    c = mix(c, vC1, fr);
                }
                gl_FragColor = vec4(c, 1.0);
                #include <fog_fragment>
                #include <colorspace_fragment>
            }`,
        fog: true, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
    });
}
// Light that's added on top, unlit, in one draw: gate barriers, the beams over Win Pads, the Rift Gate's ring, portals and the halos
// round every flame. aOn 0: a barrier is gone, a beam dim
export function energyMaterial() {
    return new T.ShaderMaterial({
        uniforms: T.UniformsUtils.merge([T.UniformsLib.fog, { uNow: CU.uNow }]),
        vertexShader: `attribute vec2 aOff; attribute vec4 aK; attribute vec3 aC1; attribute vec3 aC2; attribute float aOn; uniform float uNow;
            varying vec4 vK; varying vec3 vC1; varying vec3 vC2; varying float vOn; varying float vD; varying vec3 vW;
            ${FOG_V}
            void main() {
                vK = aK; vC1 = aC1; vC2 = aC2; vOn = aOn;
                if (aK.x < 0.5 && aOn < 0.01) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
                vec4 wp = modelMatrix * vec4(position, 1.0); vW = wp.xyz;
                vec4 mvPosition = viewMatrix * wp;
                if (aK.x > 3.5) mvPosition.xy += aOff * (1.0 + 0.1 * sin(uNow * 9.0 + wp.x * 1.7 + wp.z * 0.9) * aK.w);
                vD = -mvPosition.z;
                gl_Position = projectionMatrix * mvPosition;
                #include <fog_vertex>
            }`,
        fragmentShader: `uniform float uNow;
            varying vec4 vK; varying vec3 vC1; varying vec3 vC2; varying float vOn; varying float vD; varying vec3 vW;
            ${FOG_F}
            void main() {
                float k = vK.x, t = uNow, a = 0.0; vec2 q = vK.yz; vec3 c = vC1;
                if (k < 0.5) {
                    // a gate's barrier: a lattice of light flowing up, bright at its edges, a lock in the middle
                    vec2 p = vec2(q.x * vK.w, q.y * 22.0);
                    vec2 g = p * vec2(0.26, 0.3) + vec2(0.0, -t * 0.25); g.x += mod(floor(g.y), 2.0) * 0.5; vec2 f = fract(g) - 0.5;
                    float line = 1.0 - smoothstep(0.0, 0.035, abs(abs(f.x) + abs(f.y) - 0.5));
                    float flow = 0.5 + 0.5 * sin(p.y * 0.5 - t * 3.2 + sin(p.x * 0.35 + t) * 2.0);
                    float streak = pow(0.5 + 0.5 * sin(p.x * 1.1 + sin(p.y * 0.15 - t * 0.7) * 2.0), 10.0) * (0.5 + 0.5 * sin(p.y * 0.35 - t * 5.0));
                    float edge = smoothstep(0.9, 1.0, abs(q.x * 2.0 - 1.0)) + smoothstep(0.93, 1.0, q.y);
                    float foot = smoothstep(0.12, 0.0, q.y);
                    vec2 lc = vec2((q.x - 0.5) * vK.w, (q.y - 0.42) * 22.0); float lr = length(lc);
                    float lock = smoothstep(0.35, 0.0, abs(lr - 3.2)) + smoothstep(0.3, 0.0, abs(length(vec2(lc.x, max(0.0, lc.y - 2.2))) - 1.5)) * step(2.2, lc.y)
                        + (1.0 - smoothstep(0.5, 0.65, length(lc - vec2(0.0, 0.4)))) + step(abs(lc.x), 0.28) * step(-1.4, lc.y) * step(lc.y, 0.4);
                    lock = clamp(lock, 0.0, 1.0) * (0.7 + 0.3 * sin(t * 3.0));
                    c = mix(vC1, vC2, flow * 0.45 + line * 0.55 + edge * 0.5);
                    float near = smoothstep(0.55, 1.0, max(abs(q.x * 2.0 - 1.0), q.y)) + foot;
                    a = 0.04 + line * (0.07 + 0.1 * flow + 0.25 * near) + streak * 0.22 + edge * 0.65 + foot * 0.4 + lock * 0.85;
                    a *= 0.85 + 0.15 * sin(t * 2.3 + q.x * 9.0);
                } else if (k < 1.5) {
                    // a beam of light up from a Win Pad (dim while it cools down)
                    a = pow(1.0 - q.y, 1.3) * (0.7 + 0.2 * sin(t * 3.0 - q.y * 22.0)) * smoothstep(10.0, 34.0, vD) * (0.2 + 0.8 * vOn);
                    c = mix(vC1, vC2, q.y);
                } else if (k < 2.5) {
                    // the Rift Gate's ring of energy, swirling round inside the stone
                    if (vW.y < 0.05) discard;
                    float sw = 0.5 + 0.5 * sin(q.x * 6.2832 * 7.0 + q.y * 6.0 - t * 2.4);
                    float sw2 = 0.5 + 0.5 * sin(q.x * 6.2832 * 13.0 - q.y * 4.0 + t * 3.6);
                    c = mix(vC1, vC2, sw * 0.6 + sw2 * 0.4);
                    a = smoothstep(0.0, 0.7, q.y) * (0.35 + 0.65 * sw * sw2 + 0.4 * smoothstep(0.82, 1.0, q.y));
                    a *= smoothstep(1.0, 0.94, q.y);
                } else if (k < 3.5) {
                    // a portal: a swirl round a bright middle
                    // (aux: its height over its width; a wide one is a curtain of light, a tall one an oval)
                    vec2 d = (q - 0.5) * 2.0, p = vec2(d.x, d.y * vK.w);
                    float r = vK.w < 0.6 ? max(abs(d.x) * 0.92, abs(d.y)) : length(d), pr = length(p) * (vK.w < 0.6 ? 1.0 : 1.3), an = atan(p.y, p.x);
                    float sw = sin(an * 4.0 + pr * 7.0 - t * 3.5) * 0.5 + 0.5, sw2 = sin(an * 7.0 - pr * 5.0 + t * 2.1) * 0.5 + 0.5;
                    if (vK.w < 0.6) { sw = 0.5 + 0.5 * sin(d.x * 9.0 + sin(d.y * 3.0 + t) * 2.0 - t * 2.5); sw2 = 0.5 + 0.5 * sin(d.y * 6.0 - t * 3.0 + d.x * 4.0); }
                    c = mix(vC1, vC2, sw * 0.7 + sw2 * 0.3);
                    c = mix(c, vec3(1.0), smoothstep(0.4, 0.0, pr) * 0.4);
                    a = (1.0 - smoothstep(0.82, 1.0, r)) * (0.3 + 0.35 * sw + 0.25 * smoothstep(0.6, 0.95, r));
                } else {
                    // a halo round a flame
                    float r = length(q);
                    a = pow(max(0.0, 1.0 - r), 2.2) * 0.42 * (0.85 + 0.15 * sin(t * 7.0 + vW.x * 3.0)) * smoothstep(3.0, 9.0, vD);
                }
                #ifdef USE_FOG
                a *= 1.0 - smoothstep(fogNear, fogFar, vFogDepth);
                #endif
                if (a < 0.004) discard;
                gl_FragColor = vec4(c * a, 1.0);
                #include <colorspace_fragment>
            }`,
        fog: true, transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide,
    });
}
// a portal on its own (a race's finish): a swirl in a w x h plane
export function portalMesh(w, h, c1, c2) {
    const Q = energyQuads();
    energyQuad(Q, 3, 0, -h / 2, 0, w, h, c1, c2, 1, h / w);
    const mesh = new T.Mesh(Q.geometry(), energyMaterial());
    mesh.renderOrder = 3;
    return mesh;
}

// ----- flames: every torch and brazier of a world, one draw. Three chunky tongues each, flickering in the shader -----
function flameGeo() {
    const pos = [], aP = [], parts = [[0, 0, 0, 0.55, 1.75, 0, 0.3], [0.16, 0.12, 0.08, 0.4, 1.25, 1, 1.1], [-0.15, 0.18, -0.1, 0.34, 1.05, 1, 2.1], [0, 0.3, 0, 0.2, 0.8, 2, 0.7]];
    for (const [ox, oy, oz, r, h, part, rot] of parts) {
        const ring = [];
        for (let i = 0; i < 4; i++) { const a = rot + i * Math.PI / 2; ring.push([ox + Math.cos(a) * r, oy + h * 0.32, oz + Math.sin(a) * r]); }
        const bot = [ox, oy, oz], top = [ox, oy + h, oz];
        for (let i = 0; i < 4; i++) {
            const a = ring[i], b = ring[(i + 1) % 4];
            pos.push(...top, ...b, ...a, ...bot, ...a, ...b);
            aP.push(part, 1, part, 0.32, part, 0.32, part, 0, part, 0.32, part, 0.32);
        }
    }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    g.setAttribute('aP', new T.Float32BufferAttribute(aP, 2));
    return g;
}
export function flameMesh(list, tip, parent) {
    if (!list.length) return null;
    const m = new T.ShaderMaterial({
        uniforms: T.UniformsUtils.merge([T.UniformsLib.fog, { uTip: { value: new T.Color(tip) } }, { uNow: CU.uNow }]),
        vertexShader: `attribute vec2 aP; uniform float uNow; uniform vec3 uTip; varying vec3 vC;
            ${FOG_V}
            void main() {
                vec3 ip = instanceMatrix[3].xyz; float sd = ip.x * 1.7 + ip.z * 0.9 + ip.y;
                vec3 p = position;
                p.y *= 1.0 + 0.17 * sin(uNow * 11.0 + sd + aP.x * 2.1) + 0.08 * sin(uNow * 17.0 + sd * 1.3);
                p.x += sin(uNow * 6.0 + sd + aP.x) * 0.13 * p.y; p.z += cos(uNow * 5.0 + sd) * 0.09 * p.y;
                vC = mix(instanceColor * 0.95, uTip, clamp(pow(aP.y, 1.6) * 0.75 + aP.x * 0.22, 0.0, 1.0)) * 1.15;
                vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(p, 1.0);
                gl_Position = projectionMatrix * mvPosition;
                #include <fog_vertex>
            }`,
        fragmentShader: `varying vec3 vC;
            ${FOG_F}
            void main() { gl_FragColor = vec4(vC, 1.0);
                #include <fog_fragment>
                #include <colorspace_fragment>
            }`,
        fog: true, side: T.DoubleSide,
    });
    const g = flameGeo(), mesh = new T.InstancedMesh(g, m, list.length), o = new T.Object3D(), c = new T.Color();
    list.forEach((f, i) => { o.position.set(f[0], f[1], f[2]); o.rotation.set(0, (f[0] * 7 + f[2]) % 6.28, 0); o.scale.setScalar(f[3]); o.updateMatrix(); mesh.setMatrixAt(i, o.matrix); mesh.setColorAt(i, c.set(f[4])); });
    mesh.frustumCulled = false; mesh.castShadow = false; mesh.receiveShadow = false;
    parent.add(mesh);
    return mesh;
}

// ----- presents: a box, a ribbon round it both ways, a bow on top. One geometry; aP says which part a vertex is (0 the paper,
// 1 the ribbon), and each instance has its two colours (instanceColor the paper, aB the ribbon). The Gift Boxes in the square turn
// slowly and bob over their stands (spin 1); the sliding ones on the course don't (spin 0) -----
function presentGeo(low) {
    const k = new Kit(), RIB = 0xff0000, PAP = 0x00ff00;
    // the box (a touch rounded), the lid over it
    k.box(0, 0.46, 0, 1.9, 0.92, 1.9, PAP, { soft: true });
    k.box(0, 0.98, 0, 2.02, 0.2, 2.02, PAP, { soft: !low });
    // the ribbon: a band each way, round the sides and over the lid
    k.box(0, 0.5, 0, 0.36, 1.02, 1.96, RIB); k.box(0, 0.5, 0, 1.96, 1.02, 0.36, RIB);
    k.box(0, 1.0, 0, 0.38, 0.24, 2.08, RIB); k.box(0, 1.0, 0, 2.08, 0.24, 0.38, RIB);
    // the bow: two loops leaning out, two tails, a knot
    for (const s of [-1, 1]) {
        k.box(s * 0.36, 1.32, 0, 0.62, 0.5, 0.26, RIB, { soft: !low, rz: s * 0.55 });
        k.box(s * 0.3, 1.13, s * 0.25, 0.18, 0.08, 0.56, RIB, { ry: s * 0.6 });
    }
    k.box(0, 1.2, 0, 0.3, 0.3, 0.3, RIB, { soft: !low });
    const g = k.geometry(), col = g.attributes.color, n = col.count, part = new Float32Array(n);
    // which part: the red channel (the ribbon) against the green (the paper); then the colour is just its shading
    for (let i = 0; i < n; i++) { const r = col.getX(i), gg = col.getY(i); part[i] = r > gg ? 1 : 0; const sh = Math.max(r, gg); col.setXYZ(i, sh, sh, sh); }
    g.setAttribute('aP', new T.BufferAttribute(part, 1));
    return g;
}
function presentMaterial(spin, key) {
    const m = new T.MeshLambertMaterial({ color: 0xffffff, vertexColors: true });
    m.onBeforeCompile = (sh) => {
        sh.uniforms.uNow = CU.uNow;
        const rot = spin ? 'float ca = cos(uNow * 0.55 + instanceMatrix[3].x), sa = sin(uNow * 0.55 + instanceMatrix[3].x); mat2 Rr = mat2(ca, -sa, sa, ca);' : '';
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aP; attribute vec3 aB; uniform float uNow; varying float vP; varying vec3 vB; varying vec3 vLp; varying float vSh;')
            .replace('#include <beginnormal_vertex>', spin ? `#include <beginnormal_vertex>\n{ ${rot} objectNormal.xz = Rr * objectNormal.xz; }` : '#include <beginnormal_vertex>')
            .replace('#include <begin_vertex>', `#include <begin_vertex>\nvP = aP; vB = aB; vLp = position; vSh = color.r; ${spin ? `{ ${rot} transformed.xz = Rr * transformed.xz; transformed.y += sin(uNow * 1.4 + instanceMatrix[3].x) * 0.12; }` : ''}`);
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uNow; varying float vP; varying vec3 vB; varying vec3 vLp; varying float vSh;')
            .replace('#include <color_fragment>', `#include <color_fragment>
// paper: the instance's colour with a soft pattern of dots; ribbon: its own colour, a sheen line down it (painted)
float dots = step(0.82, fract(sin(dot(floor(vLp.xz * 3.0 + vLp.y * 3.0), vec2(12.9898, 78.233))) * 43758.5453)) * step(vLp.y, 0.93) * (1.0 - vP);
vec3 paper = diffuseColor.rgb * (1.0 + 0.18 * dots);
diffuseColor.rgb = mix(paper, vSh * vB * (1.0 + 0.25 * smoothstep(0.7, 1.0, sin(vLp.x * 9.0 + vLp.z * 9.0))), vP);
if (length(vViewPosition) < 10.0) { float dk = 1.0 - smoothstep(5.0, 10.0, length(vViewPosition)); if (mod(floor(gl_FragCoord.x) + floor(gl_FragCoord.y), 2.0) < dk * 2.0) discard; }`)
            .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
totalEmissiveRadiance += diffuseColor.rgb * (0.12 + 0.18 * vP);`);
    };
    m.customProgramCacheKey = () => key;
    return m;
}
// a world of presents in one draw: list [{ x, y, z, s (size), c1 (paper), c2 (ribbon), ry }]; cap: room for more (moving ones)
export function presentMesh(list, low, parent, spin, cap) {
    const g = presentGeo(low), n = Math.max(1, cap ?? list.length), B = new Float32Array(n * 3), c = new T.Color();
    g.setAttribute('aB', new T.InstancedBufferAttribute(B, 3));
    const mesh = new T.InstancedMesh(g, presentMaterial(spin, spin ? 'jj-gift' : 'jj-slide'), n), o = new T.Object3D();
    // (the instance colour has to be there before the program is built: the shader reads it)
    mesh.setColorAt(0, c.set(0xffffff));
    list.forEach((J, i) => {
        o.position.set(J.x, J.y, J.z); o.rotation.set(0, J.ry || 0, 0); o.scale.set(J.sx ?? J.s, J.sy ?? J.s, J.sz ?? J.s); o.updateMatrix();
        mesh.setMatrixAt(i, o.matrix);
        mesh.setColorAt(i, c.set(J.c1)); c.set(J.c2); B[i * 3] = c.r; B[i * 3 + 1] = c.g; B[i * 3 + 2] = c.b;
    });
    mesh.count = list.length;
    mesh.frustumCulled = false; mesh.castShadow = !low; mesh.receiveShadow = !low;
    parent.add(mesh);
    return mesh;
}
// the star over a Win Pad: a fat five-pointed star, front and back, turning and bobbing in the vertex shader, painted and unlit
function crownGeo() {
    const pos = [], col = [], r0 = 2.6, r1 = 1.12, th = 0.62, GOLD0 = [1, 0.5, 0.02], GOLD1 = [1, 0.8, 0.12], TIP = [1, 0.97, 0.6];
    const P = (i) => { const a = Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? r1 : r0; return [Math.cos(a) * r, Math.sin(a) * r + 2.6, 0]; };
    const tri = (a, b, c, ca, cb, cc) => { pos.push(...a, ...b, ...c); col.push(...ca, ...cb, ...cc); };
    for (let i = 0; i < 10; i++) {
        const a = P(i), b = P(i + 1), mid = i % 2 ? GOLD0 : GOLD1;
        // the two faces rise to a point in the middle (a fat star)
        tri([0, 2.6, th], a, b, TIP, mid, GOLD0); tri([0, 2.6, -th], b, a, TIP, GOLD0, mid);
    }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new T.Float32BufferAttribute(col, 3));
    return g;
}
function crownMaterial() {
    return new T.ShaderMaterial({
        uniforms: { uNow: CU.uNow },
        vertexShader: `attribute vec3 color; uniform float uNow; varying vec3 vC; varying float vD;
            void main() {
                vC = color;
                vec3 ip = instanceMatrix[3].xyz, p = position;
                float a = uNow * 1.4 + ip.z * 0.1, ca = cos(a), sa = sin(a);
                p = vec3(ca * p.x - sa * p.z, p.y + sin(uNow * 2.0 + ip.z) * 0.35, sa * p.x + ca * p.z);
                vec4 mv = modelViewMatrix * vec4(p + ip, 1.0); vD = -mv.z;
                gl_Position = projectionMatrix * mv;
            }`,
        // (it dissolves right at the lens: the camera running past it never sees a wall of gold)
        fragmentShader: 'varying vec3 vC; varying float vD; void main() { if (vD < 10.0) { float dk = 1.0 - smoothstep(4.0, 10.0, vD); if (mod(floor(gl_FragCoord.x) + floor(gl_FragCoord.y), 2.0) < dk * 2.0) discard; } gl_FragColor = vec4(vC, 1.0);\n#include <colorspace_fragment>\n}',
        side: T.DoubleSide,
    });
}
// ----- a swinging ornament: a big bauble (bands of colour, a gold cap) on a striped rope, hung from its pivot (local 0, 0, 0),
// swinging across x -----
export function bladeGeo(Wd, armLen, scale) {
    const k = new Kit({ glow: true }), L = armLen, s = scale || 1, st = styleOf(Wd), c1 = Wd.jelly[0], c2 = Wd.jelly[1];
    k.box(0, -0.4, 0, 1.4 * s, 1.4 * s, 1.4 * s, st.metal, { soft: true });
    // the rope: the world's stripe colour and white in turn
    const segs = 8, rl = L - 4.4;
    for (let i = 0; i < segs; i++) k.box(0, -0.9 - (i + 0.5) * (rl / segs), 0, 0.42 * s, rl / segs + 0.02, 0.42 * s, i % 2 ? 0xffffff : st.cane);
    // the cap and its loop
    k.box(0, -L + 3.6 * s, 0, 1.5 * s, 0.9 * s, 1.5 * s, 0xffd23a, { soft: true });
    k.box(0, -L + 4.25 * s, 0, 0.7 * s, 0.5 * s, 0.25 * s, 0xffd23a);
    // the ball: round, its colours in bands, a white shine painted on it (glowing)
    const R = 3.05 * s, ball = new T.IcosahedronGeometry(R, 2), p = ball.attributes.position, cols = [], cc = new T.Color(), cb = new T.Color(c2), cw = new T.Color(0xffffff), ca = new T.Color(c1);
    for (let i = 0; i < p.count; i++) { const y = p.getY(i) / R; if (Math.abs(y) < 0.16) cc.copy(cb); else if (Math.abs(Math.abs(y) - 0.45) < 0.07) cc.copy(cw); else cc.copy(ca); cols.push(cc.r, cc.g, cc.b); }
    ball.setAttribute('color', new T.Float32BufferAttribute(cols, 3));
    k.addGeo(ball, new T.Matrix4().makeTranslation(0, -L, 0), 0);
    ball.dispose();
    k.box(-1.2 * s, -L + 1.45 * s, 2.25 * s, 0.9 * s, 0.5 * s, 0.4 * s, 0xffffff, { glow: 1, rz: 0.7, ry: -0.4 });
    k.box(-1.65 * s, -L + 0.7 * s, 2.4 * s, 0.32 * s, 0.32 * s, 0.3 * s, 0xffffff, { glow: 1 });
    k.box(1.2 * s, -L + 1.45 * s, -2.25 * s, 0.9 * s, 0.5 * s, 0.4 * s, 0xffffff, { glow: 1, rz: -0.7, ry: -0.4 });
    return k.geometry();
}
const propMats = new Map();
// the props' material of a scene (shared by the ornaments' instances: the same program as the batches)
export function propMaterial() { let m = propMats.get(0); if (!m) { m = glowVCMaterial(CU.uNow); propMats.set(0, m); } return m; }
// the ornaments: the props' material, dissolving in a fine checker as one swings close to the camera (in a lane it would fill the screen)
export function bladeMaterial() {
    let m = propMats.get(1);
    if (!m) { m = nearFade(glowVCMaterial(CU.uNow), 'jj-blade', 6, 13); propMats.set(1, m); }
    return m;
}

// ----- leaderboards: three on one texture, one draw -----
function boardAtlas() {
    const c = document.createElement('canvas'); c.width = 1536; c.height = 600;
    return { c, t: texFrom(c), keys: ['', '', ''] };
}
function drawBoard(A, i, title, rows, Wd) {
    const key = JSON.stringify(rows || []);
    if (key === A.keys[i]) return;
    A.keys[i] = key;
    const x = A.c.getContext('2d'), Wb = 768, H = 900, s = 512 / Wb;
    x.setTransform(s, 0, 0, 600 / H, i * 512, 0);
    const g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#1f5a3c'); g.addColorStop(1, '#0d2a1c');
    x.fillStyle = g; x.fillRect(0, 0, Wb, H);
    // a candy-cane frame
    const glow = '#' + new T.Color(Wd.glow).getHexString();
    x.lineWidth = 22; x.strokeStyle = '#ffffff'; x.strokeRect(11, 11, Wb - 22, H - 22);
    x.save(); x.beginPath(); x.rect(0, 0, Wb, H); x.rect(22, 22, Wb - 44, H - 44); x.clip('evenodd');
    x.strokeStyle = '#e8202e'; x.lineWidth = 16;
    for (let k = -H; k < Wb + H; k += 48) { x.beginPath(); x.moveTo(k, 0); x.lineTo(k + H, H); x.stroke(); }
    x.restore();
    x.strokeStyle = 'rgba(255,255,255,0.08)'; x.lineWidth = 2;
    for (let k = 0; k < 14; k++) { x.beginPath(); x.moveTo(30, 130 + k * 60); x.lineTo(Wb - 30, 130 + k * 60); x.stroke(); }
    x.textAlign = 'center'; x.textBaseline = 'middle'; x.lineJoin = 'round';
    fitFont(x, title, Wb - 80, 74, 400, '"Luckiest Guy", Fredoka, sans-serif', 0.2);
    x.lineWidth = 14; x.strokeStyle = '#3a0a0a'; x.strokeText(title, Wb / 2, 76); x.fillStyle = '#ffd23a'; x.fillText(title, Wb / 2, 76);
    (rows || []).slice(0, 9).forEach((r, k) => {
        const y = 172 + k * 80;
        x.fillStyle = k % 2 ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.1)'; x.fillRect(34, y - 36, Wb - 68, 72);
        x.textAlign = 'left'; x.lineWidth = 8; x.strokeStyle = '#08200f';
        const name = '#' + (k + 1) + ' ' + r.n;
        fitFont(x, name, Wb - 310, 44, 700, 'Fredoka, sans-serif', 0);
        x.fillStyle = k === 0 ? '#ffd23a' : k === 1 ? '#e8ecf4' : k === 2 ? '#ffa86a' : '#ffffff';
        x.strokeText(name, 48, y); x.fillText(name, 48, y);
        x.textAlign = 'right'; x.font = '700 44px Fredoka, sans-serif'; x.strokeText(fmt(r.v), Wb - 48, y); x.fillStyle = glow; x.fillText(fmt(r.v), Wb - 48, y);
    });
    if (!rows || !rows.length) { x.textAlign = 'center'; x.font = '700 46px Fredoka, sans-serif'; x.fillStyle = '#d8f0e0'; x.fillText('Be the first!', Wb / 2, 200); }
    x.setTransform(1, 0, 0, 1, 0, 0);
    A.t.needsUpdate = true;
}

// ----- far away: clouds, and what stands on the horizon all along the Jelly Run -----
export function clouds(Wd) {
    const far = (x, y, z, sx, sy, sz, c) => blob(x, y, z, sx, sy, sz, c, { far: true, sway: 0, ry: x });
    const st = styleOf(Wd), n = Wd.id === 'star' ? 0 : Wd.id === 'ginger' ? 16 : 22;
    for (let i = 0; i < n; i++) {
        const a = i * 2.39996, r = 300 + (i * 37) % 380, cx = Math.cos(a) * r * 1.2, cz = 100 - (i * 211) % 2400, cy = 90 + (i * 53) % 70, s = 22 + (i * 13) % 20;
        const cl = Wd.id === 'ginger' ? (i % 2 ? 0xfff0e0 : 0xffe2c8) : (i % 3 ? st.cloud : 0xeef4ff);
        if (Math.abs(cx) < 70) continue;
        far(cx, cy, cz, s * 1.5, s * 0.7, s * 1.1, cl);
        for (let k = 0; k < 3; k++) { const b = k * 2.1 + a; far(cx + Math.cos(b) * s * 0.8, cy - s * 0.12 + (k % 2) * s * 0.12, cz + Math.sin(b) * s * 0.55, s * 0.85, s * 0.5, s * 0.7, cl); }
    }
}
// A far shape: rings from the bottom up, each [radius, height, colour], many-sided and a little uneven, flat-shaded; the top ring closes
// with a cap. A kit of these is part of the world's one batch: more shapes, not more draws.
export function stack(kit, x, z, rings, sides, R, sq, glow) {
    const wob = rings.map(() => { const w = []; for (let i = 0; i < sides; i++) w.push(0.86 + R() * 0.28); return w; });
    const at = (r, i) => { const a = i / sides * Math.PI * 2 + 0.3, k = rings[r][0] * wob[r][i % sides]; return [x + Math.cos(a) * k, rings[r][1], z + Math.sin(a) * k * (sq || 1)]; };
    for (let r = 0; r < rings.length - 1; r++) for (let i = 0; i < sides; i++) kit.quad(at(r, i + 1), at(r, i), at(r + 1, i), at(r + 1, i + 1), rings[r][2], { c2: rings[r + 1][2], glow: glow || 0 });
    const t = rings.length - 1, top = [x, rings[t][1] + rings[t][0] * 0.08, z];
    for (let i = 0; i < sides; i++) kit.quad(at(t, i + 1), at(t, i), top, top, rings[t][2], { glow: glow || 0 });
}
// the same, upside down (a floating island's rock): rings from the top down
function hang(kit, x, z, rings, sides, R, glow) {
    const wob = rings.map(() => { const w = []; for (let i = 0; i < sides; i++) w.push(0.8 + R() * 0.4); return w; });
    const at = (r, i) => { const a = i / sides * Math.PI * 2 + 0.3, k = rings[r][0] * wob[r][i % sides]; return [x + Math.cos(a) * k, rings[r][1], z + Math.sin(a) * k]; };
    for (let r = 0; r < rings.length - 1; r++) for (let i = 0; i < sides; i++) kit.quad(at(r, i), at(r, i + 1), at(r + 1, i + 1), at(r + 1, i), rings[r][2], { c2: rings[r + 1][2], glow: glow || 0 });
    const top = [x, rings[0][1], z];
    for (let i = 0; i < sides; i++) kit.quad(at(0, i), top, top, at(0, i + 1), rings[0][2], { glow: glow || 0 });
}
// a giant candy cane standing in the distance (or a small one by the path): stripes up a pole, the hook at the top
function bigCane(kit, x, z, h, w, c, R, glow) {
    const n = Math.max(4, Math.min(10, Math.round(h / (w * 1.6)))), sh = h / n, ry = R() * 3;
    for (let i = 0; i < n; i++) kit.box(x, (i + 0.5) * sh, z, w, sh + 0.02, w, i % 2 ? 0xffffff : c, { ry: ry + i * 0.35, glow: glow || 0 });
    const hr = w * 1.7;
    for (let i = 0; i < 4; i++) {
        const a = (i + 0.5) / 4 * Math.PI, cx = x + Math.cos(ry) * (hr - Math.cos(a) * hr), cz = z - Math.sin(ry) * (hr - Math.cos(a) * hr);
        kit.box(cx, h + Math.sin(a) * hr, cz, w, w * 1.35, w, i % 2 ? c : 0xffffff, { ry, rz: 0, glow: glow || 0 });
    }
}
// kits: a few kits along the way (each culled on its own); from z0 north to z1
export function horizon(Wd, kits, R, z0, z1, low) {
    const n = kits.length, span = z0 - z1, step = low ? 300 : 210, list = [], st = styleOf(Wd);
    for (let z = z0; z > z1; z -= step) for (const sx of [-1, 1]) list.push([sx * (170 + R() * 300), z - R() * step * 0.8, 46 + R() * 70]);
    for (const [x, z, s] of list) {
        const kit = kits[Math.min(n - 1, Math.max(0, Math.floor((z0 - z) / span * n)))], pick = R();
        if (Wd.id === 'jingle') {
            // snowy hills with pines at their feet; now and then a giant candy cane or a gumdrop hill
            if (pick < 0.62) {
                stack(kit, x, z, [[s * 1.2, -12, 0xa8c0e0], [s * 0.94, s * 0.26, 0xcadcf0], [s * 0.62, s * 0.6, 0xe8f2fc], [s * 0.3, s * 0.86, 0xffffff], [s * 0.05, s * 1.0, 0xffffff]], 8, () => 0.5 + R() * 0.12, 0.86, 0);
                if (!low) for (let k = 0; k < 3; k++) { const a = R() * 6.28, px = x + Math.cos(a) * s * 1.05, pz = z + Math.sin(a) * s * 0.9, h = s * (0.32 + R() * 0.18); stack(kit, px, pz, [[h * 0.34, -4, 0x1e5a3a], [h * 0.2, h * 0.55, 0x2a7a4a], [h * 0.02, h, 0xf4fbff]], 6, R); }
            } else if (pick < 0.82) bigCane(kit, x, z, s * 1.4, s * 0.12, st.cane, R);
            else { const c = Wd.jelly[Math.floor(R() * Wd.jelly.length)]; stack(kit, x, z, [[s * 0.8, -6, c], [s * 0.74, s * 0.3, c], [s * 0.5, s * 0.6, mixC(c, 0xffffff, 0.2)], [s * 0.05, s * 0.72, mixC(c, 0xffffff, 0.35)]], 10, () => 0.5, 1, 0.5); }
        } else if (Wd.id === 'ginger') {
            // cookie mesas under thick icing, its drips down the sides; giant lollipops
            if (pick < 0.7) {
                const H = s * 0.8;
                stack(kit, x, z, [[s * 1.1, -12, 0x8a5428], [s * 1.0, H * 0.7, 0xa8683a], [s * 0.96, H, 0xb8783c]], 9, () => 0.5 + R() * 0.08, 0.9, 0);
                stack(kit, x, z, [[s * 1.0, H - 0.4, 0xffffff], [s * 0.82, H + s * 0.1, 0xfff8f0], [s * 0.05, H + s * 0.14, 0xffffff]], 9, () => 0.5, 0.9, 0);
                for (let k = 0; k < 4; k++) { const a = k * 1.57 + R(), l = s * (0.15 + R() * 0.2); kit.box(x + Math.cos(a) * s * 0.98, H - l / 2, z + Math.sin(a) * s * 0.88, s * 0.12, l, s * 0.12, 0xffffff); }
            } else {
                const h = s * 1.3, r = s * 0.42, c = Wd.jelly[Math.floor(R() * Wd.jelly.length)];
                kit.box(x, h / 2, z, s * 0.05, h, s * 0.05, 0xfff4e4);
                stack(kit, x, z, [[r, h - r * 0.25, c], [r * 0.92, h, mixC(c, 0xffffff, 0.4)], [r * 0.5, h + r * 0.12, c]], 12, () => 0.5, 0.22, 0.3);
            }
        } else if (Wd.id === 'frost') {
            const H = s * 1.5;
            stack(kit, x, z, [[s * 1.15, -12, 0x9ac0e8], [s * 0.95, H * 0.22, 0xb0d0f0], [s * 0.72, H * 0.48, 0xd0e6fa], [s * 0.48, H * 0.66, 0xeaf6ff], [s * 0.26, H * 0.84, 0xffffff], [s * 0.04, H, 0xffffff]], 9, () => 0.5 + R() * 0.1, 0.85, 0.86);
            stack(kit, x + s * 0.7, z + s * 0.2, [[s * 0.62, -12, 0xa8c8ec], [s * 0.42, H * 0.3, 0xc0dcf6], [s * 0.24, H * 0.46, 0xf4faff], [s * 0.02, H * 0.62, 0xffffff]], 8, R, 0.9, 0.86);
        } else {
            // floating candy islands under the stars: a rock of rock candy, lollipops and sugar crystals on top
            const y = 40 + R() * 120, r = s * 0.7;
            hang(kit, x, z, [[r, y, 0x6a4ab0], [r * 0.7, y - r * 0.5, 0x4a2a8a], [r * 0.32, y - r * 1.1, 0x2c1a5a], [r * 0.04, y - r * 1.6, 0x1a0e34]], 7, R, 0.85);
            for (let k = 0; k < 3; k++) { const a = k * 2.2 + x, cx = x + Math.cos(a) * r * 0.5, cz = z + Math.sin(a) * r * 0.5, h = r * (0.4 + k * 0.15); stack(kit, cx, cz, [[r * 0.09, y, Wd.jelly[k % 3]], [r * 0.05, y + h, 0xffe4ff], [r * 0.01, y + h * 1.15, 0xffffff]], 5, R, 1, 1); }
        }
    }
}

// ----- the land round it all: a snowfield, a sea of hot cocoa, frozen water, the starry deep. Unlit, moving in the shader; it follows the camera -----
export function seaMaterial(Wd, low) {
    const m = new T.MeshBasicMaterial({ color: Wd.sea });
    const mode = { jingle: 0, ginger: 1, frost: 2, star: 3 }[Wd.id] ?? 0;
    m.onBeforeCompile = (sh) => {
        Object.assign(sh.uniforms, { uNow: CU.uNow, uLow: { value: low ? 1 : 0 }, uSea2: { value: new T.Color(Wd.sea2) }, uMode: { value: mode } });
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vWxz;')
            .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWxz = (modelMatrix * vec4(position, 1.0)).xz;');
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uNow; uniform float uLow; uniform vec3 uSea2; uniform float uMode; varying vec2 vWxz;')
            .replace('#include <color_fragment>', `#include <color_fragment>
{
    vec2 p = vWxz; float t = uNow;
    float w = sin(p.x * 0.05 + t * 0.6) * sin(p.y * 0.043 - t * 0.45) + 0.5 * sin((p.x + p.y) * 0.11 + t * 0.9);
    if (uMode < 0.5) {
        // a snowfield: soft drifts, sparkles winking in the sun
        float dr = sin(p.x * 0.021 + sin(p.y * 0.017) * 2.0) * sin(p.y * 0.026 + sin(p.x * 0.013) * 1.5);
        diffuseColor.rgb = mix(diffuseColor.rgb, uSea2, smoothstep(-0.4, 0.9, dr) * 0.55);
        if (uLow < 0.5) { vec2 c = floor(p * 0.6); float h = fract(sin(dot(c, vec2(12.9898, 78.233))) * 43758.5453); diffuseColor.rgb += vec3(1.0) * step(0.985, h) * smoothstep(0.6, 1.0, sin(t * 3.0 + h * 40.0)) * 0.6; }
    } else if (uMode < 1.5) {
        // hot cocoa: slow swirls of cream, marshmallows drifting
        float n = sin(p.x * 0.04 + sin(p.y * 0.03 + t * 0.2) * 2.5 + t * 0.15) * sin(p.y * 0.035 - t * 0.12);
        diffuseColor.rgb = mix(diffuseColor.rgb, uSea2, smoothstep(0.2, 0.9, n) * 0.5);
        vec2 g = p * 0.05 + vec2(t * 0.03, t * 0.02); vec2 id = floor(g), f = fract(g) - 0.5;
        float hm = fract(sin(dot(id, vec2(12.9898, 78.233))) * 43758.5453);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0, 0.97, 0.93), step(0.8, hm) * (1.0 - smoothstep(0.12, 0.16, max(abs(f.x), abs(f.y)))));
    } else if (uMode < 2.5) {
        // frozen water: pack ice, cracks of dark water
        vec2 q = abs(fract(p * 0.018 + 0.2 * sin(p.yx * 0.03)) - 0.5);
        float crack = smoothstep(0.46, 0.5, max(q.x, q.y));
        diffuseColor.rgb = mix(uSea2, diffuseColor.rgb, crack * 0.9 + 0.1 + w * 0.05);
    } else {
        // the starry deep: nebulae turning, stars far below
        float n = sin(p.x * 0.012 + t * 0.05 + sin(p.y * 0.01) * 2.0) * sin(p.y * 0.014 - t * 0.04);
        diffuseColor.rgb = mix(diffuseColor.rgb, uSea2 * 0.6, smoothstep(0.0, 1.0, n) * 0.55);
        vec2 c = floor(p * 0.25); float st = step(0.985, fract(sin(dot(c, vec2(12.9898, 78.233))) * 43758.5453));
        diffuseColor.rgb += st * vec3(1.0, 0.95, 0.8) * (0.5 + 0.5 * sin(t * 2.0 + c.x));
    }
}`);
    };
    m.customProgramCacheKey = () => 'jj-sea';
    return m;
}

// ----- props of each world -----
// a cluster of ice or sugar crystals leaning out of the ground
function crystals(P, x, y, z, s, c, R) {
    const n = 3 + Math.floor(R() * 3);
    for (let i = 0; i < n; i++) {
        const a = R() * 6.28, h = s * (0.8 + R() * 1.2), w = s * (0.22 + R() * 0.14), lean = 0.15 + R() * 0.45;
        P.box(x + Math.cos(a) * s * 0.25, y + h * 0.42, z + Math.sin(a) * s * 0.25, w, h, w, i % 2 ? c : mixC(c, 0xffffff, 0.35), { glow: 1, rx: Math.sin(a) * lean, rz: -Math.cos(a) * lean, ry: a });
    }
}
// a Christmas tree: tiers of needles, snow on each, baubles and lights, a star on top
function xmasTree(P, x, z, h, R, st, Wd, low) {
    P.box(x, h * 0.08, z, 1.2, h * 0.16, 1.2, 0x5a3a22);
    const tiers = 4, leaf = st.leaf;
    for (let k = 0; k < tiers; k++) {
        const y = h * (0.12 + k * 0.19), r = h * (0.36 - k * 0.075);
        stack(P, x, z, [[r, y, shade(leaf, 0.85)], [r * 0.55, y + h * 0.17, leaf], [r * 0.12, y + h * 0.25, shade(leaf, 1.15)]], 7, R);
        stack(P, x, z, [[r * 1.02, y + 0.02, st.snow], [r * 0.82, y + 0.45, st.snow]], 7, () => 0.5);
        if (!low) for (let i = 0; i < 4; i++) { const a = R() * 6.28, rr = r * 0.8, yy = y + 0.6 + R() * h * 0.08; P.box(x + Math.cos(a) * rr, yy, z + Math.sin(a) * rr, 0.6, 0.6, 0.6, st.bulbs[(i + k) % st.bulbs.length], { glow: 1 }); }
    }
    // the star
    P.box(x, h * 0.98, z, 1.4, 1.4, 0.4, 0xffd23a, { glow: 1, rz: Math.PI / 4 }); P.box(x, h * 0.98, z, 1.4, 1.4, 0.42, 0xffe87a, { glow: 1 });
    void Wd;
}
// a snowman: three balls, coal eyes and buttons, a carrot, a scarf and a hat
function snowman(P, x, z, s, R, st) {
    const ry = (R() - 0.5) * 1.2, ball = (y, r) => stack(P, x, z, [[r * 0.7, y - r * 0.7, 0xeef4fc], [r, y - r * 0.2, 0xffffff], [r * 0.95, y + r * 0.25, 0xffffff], [r * 0.55, y + r * 0.75, 0xffffff]], 8, () => 0.5);
    ball(s * 1.2, s * 1.25); ball(s * 2.8, s * 0.9); ball(s * 4.05, s * 0.62);
    const fx = Math.sin(ry), fz = Math.cos(ry);
    for (const ex of [-0.22, 0.22]) P.box(x + fx * s * 0.58 + fz * ex * s, s * 4.25, z + fz * s * 0.58 - fx * ex * s, s * 0.12, s * 0.12, s * 0.12, 0x1a1a22);
    P.box(x + fx * s * 0.78, s * 4.05, z + fz * s * 0.78, s * 0.14, s * 0.14, s * 0.55, 0xff7a1a, { ry });
    for (let i = 0; i < 3; i++) P.box(x + fx * s * 0.86, s * (2.4 + i * 0.32), z + fz * s * 0.86, s * 0.13, s * 0.13, s * 0.13, 0x1a1a22);
    P.box(x, s * 3.45, z, s * 1.25, s * 0.28, s * 1.25, st.cloth, { ry }); P.box(x + fz * s * 0.5, s * 3.0, z - fx * s * 0.5, s * 0.3, s * 0.8, s * 0.12, st.cloth, { ry });
    P.box(x, s * 4.68, z, s * 1.1, s * 0.12, s * 1.1, 0x1a1a22, { ry }); P.box(x, s * 5.0, z, s * 0.7, s * 0.6, s * 0.7, 0x1a1a22, { ry }); P.box(x, s * 4.8, z, s * 0.74, s * 0.14, s * 0.74, st.cloth2, { ry });
}
// a pile of presents
function presents(P, x, z, R, n, sc) {
    const C = [[0xe8303a, 0xffd23a], [0x2ab450, 0xff3a3a], [0x3a8aff, 0xffffff], [0xffc23a, 0xe8303a], [0xa04aff, 0xffd23a], [0xff7ac8, 0xffffff]];
    for (let i = 0; i < n; i++) {
        const [c1, c2] = C[Math.floor(R() * C.length)], s = (0.9 + R() * 1.2) * (sc || 1), a = R() * 6.28, d = i ? 1 + R() * 1.6 : 0, px = x + Math.cos(a) * d * s, pz = z + Math.sin(a) * d * s, ry = R() * 3;
        P.box(px, s * 0.5, pz, s, s, s, c1, { ry });
        P.box(px, s * 0.5, pz, s * 1.02, s * 1.02, s * 0.22, c2, { ry }); P.box(px, s * 0.5, pz, s * 0.22, s * 1.02, s * 1.02, c2, { ry });
        P.box(px, s * 1.08, pz, s * 0.42, s * 0.22, s * 0.16, c2, { ry, rz: 0.4 }); P.box(px, s * 1.08, pz, s * 0.16, s * 0.22, s * 0.42, c2, { ry, rx: 0.4 });
    }
}
// a lollipop: a stick and a swirled disc
function lollipop(P, x, z, h, r, c1, R) {
    const ry = R() * 3, fx = Math.sin(ry), fz = Math.cos(ry);
    P.box(x, h / 2, z, 0.3, h, 0.3, 0xfff8f0);
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; P.box(x + fz * Math.cos(a) * r * 0.5, h + Math.sin(a) * r * 0.5, z - fx * Math.cos(a) * r * 0.5, r * 0.62, r * 0.62, 0.5, i % 2 ? c1 : 0xffffff, { ry, rz: a }); }
    P.box(x, h, z, r * 0.5, r * 0.5, 0.56, mixC(c1, 0xffffff, 0.3), { ry });
}
// a lamp post shaped like a candy cane, a warm light hanging from its hook
function lampPost(P, fl, x, z, h, st, R) {
    bigCane(P, x, z, h, 0.5, st.cane, R);
    fl.push([x, h - 0.8, z, 0.8, st.flame]);
}
// a gingerbread house: walls, a snowy roof with icing on its edge, windows lit, a gumdrop or two
function gingerHouse(P, x, z, s, R, st, Wd, ry) {
    const W2 = s * 1.1, D2 = s, H2 = s * 0.8, c = 0xb0662e;
    P.box(x, H2 / 2, z, W2 * 2, H2, D2 * 2, c, { ry, soft: true });
    const fx = Math.sin(ry), fz = Math.cos(ry), rx = Math.cos(ry), rz = -Math.sin(ry);
    for (const sd of [-1, 1]) {
        P.box(x + rx * sd * W2 * 0.55, H2 + s * 0.4, z + rz * sd * W2 * 0.55, W2 * 1.25, s * 0.18, D2 * 2.3, st.snow, { ry, rz: -sd * 0.62 });
        P.box(x + fx * (D2 + 0.05) + rx * sd * W2 * 0.45, H2 * 0.55, z + fz * (D2 + 0.05) + rz * sd * W2 * 0.45, s * 0.42, s * 0.36, 0.1, 0xffd86a, { ry, glow: 1 });
    }
    P.box(x + fx * (D2 + 0.06), H2 * 0.35, z + fz * (D2 + 0.06), s * 0.42, H2 * 0.7, 0.1, 0x6a3a1a, { ry });
    P.box(x + fx * (D2 + 0.09), H2 + 0.05, z + fz * (D2 + 0.09), W2 * 2.1, s * 0.12, 0.12, 0xffffff, { ry });
    for (let i = 0; i < 3; i++) P.box(x + fx * (D2 + 0.1) + rx * (i - 1) * s * 0.7, H2 * 0.92, z + fz * (D2 + 0.1) + rz * (i - 1) * s * 0.7, s * 0.2, s * 0.2, 0.2, Wd.jelly[i % Wd.jelly.length], { ry, soft: true });
}
function grow(P, S, Wd, st, x, z, R, fl, low) {
    const h = 12 + R() * 6, pick = R();
    if (Wd.id === 'frost') { if (pick < 0.7) xmasTree(P, x, z, h + 3, R, st, Wd, low); else crystals(P, x, 0, z, 2.6, st.crystal, R); }
    else if (Wd.id === 'ginger') { if (pick < 0.4) gingerHouse(P, x, z, 3.4, R, st, Wd, R() * 3); else if (pick < 0.7) lollipop(P, x, z, 7 + R() * 4, 2.4, Wd.jelly[Math.floor(R() * 3)], R); else xmasTree(P, x, z, h, R, st, Wd, low); }
    else if (Wd.id === 'star') { if (pick < 0.5) crystals(P, x, 0, z, 3, pick < 0.25 ? st.crystal : Wd.trim, R); else lollipop(P, x, z, 8 + R() * 4, 2.6, Wd.jelly[Math.floor(R() * 3)], R); }
    else { if (pick < 0.55) xmasTree(P, x, z, h, R, st, Wd, low); else if (pick < 0.8) snowman(P, x, z, 1.1, R, st); else presents(P, x, z, R, 4); }
    void S; void fl;
}

// ----- the course's candy walls: a run of wall along one side (sx -1 west, 1 east), its inner face at xIn, from z0 north up to z1 -----
// skip(z): no pillar there (a gate's frame, an ornament's beam). fl: lights are added to this list
export function wallRun(S, P, sx, xIn, z0, z1, ctx, skip) {
    const { Wd, st, R, low, fl } = ctx, len = z1 - z0, zm = (z0 + z1) / 2, xc = sx * (xIn + WT / 2), id = Wd.id;
    // the little things (lights, wreaths, icing drips, canes on top): the detail kit, drawn only close up
    const Q = ctx.dk || P;
    if (len <= 0.1) return;
    // the wall itself, down into the ground; a plinth, a cornice
    S.box(xc, (WH - 14) / 2, zm, WT, WH + 14, len, Wd.wall, { tile: 8 });
    S.box(sx * (xIn + WT / 2 - 0.2), 1.1, zm, WT + 0.4, 2.2, len, Wd.wall2, { tile: 8 });
    S.box(sx * (xIn + WT / 2 - 0.25), WH - 0.7, zm, WT + 0.5, 1.4, len + 0.02, Wd.wall2, { tile: 8 });
    // a strip of light along its foot
    P.box(sx * (xIn - 0.41), 2.45, zm, 0.06, 0.24, len, Wd.trim, { glow: 1 });
    // its top: snow and little candy canes (Jingle), icing and gumdrops (Gingerbread), snow and ice (Frost), stardust and lollipops (Star)
    const top = WH, cap = id === 'star' ? 0xfff4c0 : st.snow;
    P.box(sx * (xIn + WT / 2 - 0.3), top + 0.45, zm, WT + 0.6, 0.9, len, cap, { soft: true });
    if (id === 'ginger') {
        // icing dripping down over the edge
        for (let z = z0 + 1; z < z1 - 0.5; z += low ? 4.5 + R() * 3 : 2.2 + R() * 2.4) { const h = 0.6 + R() * 2.2; Q.box(sx * (xIn - 0.08), WH - 0.4 - h / 2, z, 0.3, h, 0.7, 0xffffff); }
        for (let z = z0 + 3; z < z1 - 2; z += 9 + R() * 5) { const c = Wd.jelly[Math.floor(R() * 3)]; stack(Q, sx * (xIn + 1.6 + R() * 2.5), z, [[1.1, top + 0.8, c], [0.9, top + 1.7, mixC(c, 0xffffff, 0.25)], [0.1, top + 2.2, mixC(c, 0xffffff, 0.4)]], 6, () => 0.5, 1, 0.3); }
    } else if (id === 'frost') {
        for (let z = z0 + 3; z < z1 - 2; z += 6 + R() * 6) { const h = 2 + R() * 5; Q.box(sx * (xIn + 1.5 + R() * 3), top + h / 2 + 0.6, z, 1.2, h, 1.2, R() < 0.5 ? 0xd8f4ff : Wd.trim, { glow: R() < 0.5 ? 1 : 0, rz: (R() - 0.5) * 0.5, rx: (R() - 0.5) * 0.5 }); }
        for (let z = z0 + 1; z < z1 - 0.5; z += low ? 5 + R() * 4 : 2.2 + R() * 3) { const h = 0.8 + R() * 2.8; Q.box(sx * (xIn - 0.1), WH - 1.4 - h / 2, z, 0.35, h, 0.35, 0xe8faff, { glow: 1 }); }
    } else if (id === 'star') {
        for (let z = z0 + 2; z < z1 - 1; z += low ? 6 : 3.2 + R() * 2) Q.box(sx * (xIn + 1 + R() * 4), top + 1.2 + R() * 3, z, 0.5, 0.5, 0.5, R() < 0.5 ? 0xffd23a : Wd.trim, { glow: 6 + R() * 0.98, rz: Math.PI / 4 });
    } else {
        for (let z = z0 + 4; z < z1 - 3; z += low ? 16 : 11) bigCane(Q, sx * (xIn + 2.4), z, 4.2, 0.45, st.cane, R);
    }
    // candy-cane pillars every so often, a lamp on every other one, string lights swagging between them
    const gap = low ? 30 : 22, n = Math.max(1, Math.floor(len / gap)), sp = len / n;
    for (let i = 0; i <= n; i++) {
        const z = z0 + i * sp;
        if (skip && skip(z)) continue;
        if (z < z0 + 1 || z > z1 - 1) continue;
        // the pillar: stripes up the wall's face, a cap
        const ns = 6, sh2 = WH / ns;
        for (let j = 0; j < ns; j++) P.box(sx * (xIn + 0.3), (j + 0.5) * sh2, z, 1.9, sh2 + 0.02, 3, j % 2 ? 0xffffff : st.cane);
        P.box(sx * (xIn + 0.2), WH + 0.3, z, 2.6, 0.8, 3.8, cap);
        if (id === 'frost') crystals(P, sx * (xIn + 0.3), WH + 0.4, z, 1.4, st.crystal, R);
        if (i % 2 === 0 && (!low || i % 4 === 0)) {
            const tx = sx * (xIn - 1.15);
            P.box(sx * (xIn - 0.5), 9.2, z, 1.4, 0.35, 0.35, st.metal);
            P.box(tx, 9.7, z, 1.1, 0.8, 1.1, 0xffd23a);
            fl.push([tx, 10.05, z, 1.05, st.flame]);
        }
        // between this pillar and the next: string lights in a swag, and a wreath or a stocking now and then
        if (i < n) {
            const bz = z + sp / 2;
            if (skip && skip(bz)) continue;
            if (!low || i % 2 === 0) {
                const nb = low ? 5 : 9;
                for (let b = 1; b < nb; b++) { const f = b / nb, yy = WH - 3.2 - Math.sin(f * Math.PI) * 4.2; Q.box(sx * (xIn - 0.25), yy, z + f * sp, 0.5, 0.7, 0.5, st.bulbs[(b + i) % st.bulbs.length], { glow: 1 }); }
            }
            const r = R();
            if (r < 0.4 && !low) {
                // a wreath: a ring of needles, berries, a red bow
                const wx = sx * (xIn - 0.2), wy = 11;
                for (let j = 0; j < 8; j++) { const a = j / 8 * Math.PI * 2; Q.box(wx, wy + Math.sin(a) * 1.9, bz + Math.cos(a) * 1.9, 0.6, 1.5, 1.5, j % 2 ? st.leaf : shade(st.leaf, 1.2), { rx: a }); }
                for (let j = 0; j < 4; j++) { const a = j * 1.7 + 0.4; Q.box(wx - sx * 0.35, wy + Math.sin(a) * 1.9, bz + Math.cos(a) * 1.9, 0.35, 0.35, 0.35, 0xff2a3a, { glow: 1 }); }
                Q.box(wx - sx * 0.4, wy - 1.9, bz - 0.6, 0.3, 0.9, 1.2, st.cloth, { rx: 0.5 }); Q.box(wx - sx * 0.4, wy - 1.9, bz + 0.6, 0.3, 0.9, 1.2, st.cloth, { rx: -0.5 });
            } else if (r < 0.65 && !low) {
                // a stocking hanging off a hook
                const wx = sx * (xIn - 0.25);
                Q.box(wx, 9.5, bz, 0.5, 3.2, 1.6, st.cloth); Q.box(wx, 8.2, bz + 0.7, 0.5, 1.2, 2.2, st.cloth);
                Q.box(wx - sx * 0.05, 11.1, bz, 0.6, 0.8, 1.8, 0xffffff);
            } else if (r < 0.85) {
                const c = Wd.jelly[Math.floor(R() * 3)];
                stack(Q, sx * (xIn - 1.4), bz + (R() - 0.5) * 6, [[1.5, 0, c], [1.35, 1.0, mixC(c, 0xffffff, 0.2)], [0.15, 1.8, mixC(c, 0xffffff, 0.4)]], 7, () => 0.5, 1, 0.3);
            }
            if ((id === 'jingle' || id === 'frost') && R() < 0.6) Q.box(sx * (xIn - 0.6), 2.4, bz + (R() - 0.5) * 8, 1.6, 0.9, 3 + R() * 5, 0xffffff, { soft: !low });
        }
    }
    // the outside face: a buttress now and then
    for (let z = z0 + 20; z < z1 - 10; z += 44) S.box(sx * (xIn + WT + 1.6), (WH - 14) / 2 - 4, z, 3.2, WH + 6, 5, Wd.wall2, { tile: 8 });
}

// the open stages' edge (the platforms, the trampolines, the crumbling bridge): a low candy-cane fence, the course's edge dropping away
// to the land below, string lights along the rail: the whole sky and the land in view
export function fenceRun(S, P, sx, xIn, z0, z1, ctx) {
    const { Wd, st, low } = ctx, len = z1 - z0, zm = (z0 + z1) / 2, Q = ctx.dk || P;
    if (len <= 0.1) return;
    S.box(sx * (xIn + 1.6), -4.6, zm, 3.2, 9.2, len, Wd.rim, { tile: 8 });
    P.box(sx * (xIn + 1.6), 0.25, zm, 3.4, 0.5, len, st.snow, { soft: !low });
    const n = Math.max(1, Math.floor(len / 4.4)), sp = len / n;
    for (let i = 0; i <= n; i++) { const z = z0 + i * sp; for (let j = 0; j < 3; j++) P.box(sx * (xIn + 0.9), 0.6 + j * 0.9, z, 0.6, 0.92, 0.6, j % 2 ? 0xffffff : st.cane); }
    P.box(sx * (xIn + 0.9), 3.05, zm, 0.5, 0.4, len, st.cane);
    P.box(sx * (xIn + 0.9), 2.0, zm, 0.3, 0.3, len, 0xffffff);
    if (!low) for (let i = 0; i < n; i++) { const z = z0 + (i + 0.5) * sp; Q.box(sx * (xIn + 0.9), 2.65, z, 0.45, 0.6, 0.45, st.bulbs[i % st.bulbs.length], { glow: 1 }); }
}

// a ribbon gate across the course at z: two giant candy-cane pillars, the beam over them, a big bow in the middle, lights on top
function gateFrame(S, P, z, ctx, k) {
    const { Wd, st, fl, low } = ctx, hw = W.halfW, H = W.gateH;
    const fc = shade(Wd.wall2, 0.9);
    for (const sx of [-1, 1]) {
        // the pillar: wide red and white stripes up a column, set in the wall
        S.box(sx * (hw + 3.1), (H + 6 - 14) / 2, z, 7, H + 6 + 14, 6, fc, { tile: 8 });
        const ns = 8, sh2 = (H + 6) / ns;
        for (let j = 0; j < ns; j++) P.box(sx * (hw + 1.2), (j + 0.5) * sh2, z, 2.6, sh2 + 0.02, 6.4, j % 2 ? 0xffffff : st.cane);
        P.box(sx * (hw - 0.42), H / 2, z + 1.4, 0.12, H - 2, 0.5, Wd.trim, { glow: 1 });
        P.box(sx * (hw - 0.42), H / 2, z - 1.4, 0.12, H - 2, 0.5, Wd.trim, { glow: 1 });
        // a lamp on top of each pillar
        P.box(sx * (hw + 3.1), H + 6.4, z, 4, 0.8, 4, st.snow, { soft: true });
        P.box(sx * (hw + 3.1), H + 7.2, z, 1.6, 1.2, 1.6, 0xffd23a, { soft: true });
        fl.push([sx * (hw + 3.1), H + 7.6, z, 2, st.flame]);
        if (Wd.id === 'frost') crystals(P, sx * (hw + 5.5), H + 6, z, 1.6, st.crystal, ctx.R);
    }
    S.box(0, H + 3, z, hw * 2 + 0.2, 6, 5, fc, { tile: 8 });
    S.box(0, H + 0.35, z, hw * 2 + 0.4, 0.7, 5.6, shade(fc, 0.85), { tile: 8 });
    P.box(0, H + 6.3, z, hw * 2 + 0.6, 0.7, 5.4, st.snow, { soft: true });
    // the bow: two big loops, two tails, a knot
    const by = H + 3.2, bz = z + 2.9;
    for (const s2 of [-1, 1]) {
        P.box(s2 * 2.6, by + 0.4, bz, 4.2, 3.2, 1, st.cloth, { soft: true, rz: s2 * 0.35 });
        P.box(s2 * 1.4, by - 2.8, bz + 0.1, 1.2, 4, 0.6, st.cloth, { rz: s2 * 0.3 });
    }
    P.box(0, by, bz + 0.2, 1.8, 1.8, 1.2, shade(st.cloth, 1.15), { soft: true });
    // the stage's number in coloured bulbs along the beam
    const n = Math.min(15, k + 1);
    for (let j = 0; j < n; j++) P.box((j - (n - 1) / 2) * 1.5, H + 1.4, z + 2.55, 0.8, 0.8, 0.5, st.bulbs[j % st.bulbs.length], { glow: 1 });
    // the threshold
    P.box(0, 0.04, z, hw * 2, 0.08, 1.2, Wd.trim, { glow: 1, shade: 0.7 });
}

// floating sugar rocks over Starlight Sweets, bobbing slowly
function rubble(P, x, y, z, s, R, Wd) {
    const ph = R() * 0.98;
    P.box(x, y, z, s, s * 0.7, s * 0.9, R() < 0.5 ? Wd.wall : Wd.wall2, { glow: 5 + ph, soft: true, ry: R() * 3, rx: R() * 0.5 });
    if (R() < 0.5) P.box(x, y - s * 0.4, z, s * 0.3, s * 0.3, s * 0.3, Wd.trim, { glow: 6 + ph });
}
// the square's jelly beds (x0, x1, z0, z1): your first steps squish
export const JELLY_BEDS = [[8.5, 16.5, 94.5, 110], [-16.5, -8.5, 94.5, 110], [8.5, 15, 67, 81], [-15, -8.5, 67, 81]];
export const onJellyBed = (x, z) => JELLY_BEDS.some((b) => x > b[0] - 1 && x < b[1] + 1 && z > b[2] - 1 && z < b[3] + 1);
// the domes of a stage (or a bed): rows across, every other row offset, each dome its world's colour (a little lighter or darker)
// unless something in the way or a pad wants the room. clear(x, z) says where not
function jellyRows(out, Wd, R, low, x0, x1, z0, z1, clear) {
    const dx = low ? 5.4 : 4.3, dz = dx * 0.87, r0 = low ? 2.35 : 1.9;
    let row = 0;
    for (let z = z1; z > z0; z -= dz, row++) {
        for (let x = x0 + (row % 2 ? dx / 2 : 0); x <= x1; x += dx) {
            const px = x + (R() - 0.5) * 0.7, pz = z + (R() - 0.5) * 0.7;
            if (clear && clear(px, pz)) continue;
            const pick = R(), c = Wd.jelly[pick < 0.5 ? 0 : pick < 0.8 ? 1 : 2], v = R();
            out.push({ x: px, z: pz, r: r0 * (0.86 + R() * 0.28), h: 0.72 + R() * 0.16, c: v < 0.3 ? mixC(c, 0xffffff, 0.14) : v > 0.8 ? shade(c, 0.86) : c });
        }
    }
}

export function buildHub(wi, opts) {
    const Tw = hubFor(wi), Wd = lookOf(wi), st = styleOf(Wd), R = rng(wi * 97 + 11), low = !!opts.low, id = Wd.id;
    const group = new T.Group(), signs = low ? new Signs(6, 352, 120) : new Signs(6, 448, 152), fl = [], ctx = { Wd, st, R, low, fl };
    const D = decalQuads(), E = energyQuads(), domes = [];
    // a kit per stretch: the square, then each stage of the Jelly Run
    const S0 = new Kit(), P0 = new Kit({ glow: true }), stretchS = [S0], stretchP = [P0];
    // the detail kits (small things), drawn only close up: the square's, then one per stage
    const D0 = new Kit({ glow: true }), detail = [D0], NEAR_D = low ? 120 : 175;
    D0.far = low ? 150 : 230;
    // ----- the land all round -----
    const sea = new T.Mesh(new T.PlaneGeometry(5000, 5000).rotateX(-Math.PI / 2), seaMaterial(Wd, low));
    sea.position.set(0, -8, 0); sea.renderOrder = 1; sea.frustumCulled = false;
    group.add(sea);
    // ----- the square's floor: snowy tiles, candy paths, a snowflake circle round the spawn -----
    const P = W.plaza, tile = 12;
    for (let x = P.x0; x < P.x1; x += tile) for (let z = P.z0; z < P.z1; z += tile) {
        const x1 = Math.min(P.x1, x + tile), z1 = Math.min(P.z1, z + tile);
        floorQuad(S0, x, x1, z, z1, 0, (Math.floor(x / tile) + Math.floor(z / tile)) & 1 ? Wd.floor : Wd.floor2);
    }
    // a path: its colour with stripes of white across (a peppermint road), a white rim
    const stripe = id === 'jingle' || id === 'star' ? 0xffffff : Wd.rim;
    const path = (x0, x1, z0, z1) => {
        floorQuad(S0, x0, x1, z0, z1, 0.05, Wd.path);
        const along = z1 - z0 > x1 - x0;
        if (along) for (let z = z0 + 1.5; z < z1 - 1; z += 4) floorQuad(S0, x0 + 0.6, x1 - 0.6, z, z + 1.4, 0.06, stripe);
        else for (let x = x0 + 1.5; x < x1 - 1; x += 4) floorQuad(S0, x, x + 1.4, z0 + 0.6, z1 - 0.6, 0.06, stripe);
        for (const [a, b, c, d] of [[x0, x1, z0, z0 + 0.6], [x0, x1, z1 - 0.6, z1], [x0, x0 + 0.6, z0, z1], [x1 - 0.6, x1, z0, z1]]) floorQuad(S0, a, b, c, d, 0.07, Wd.rim);
    };
    path(-7, 7, 44, 100);
    path(-66, -7, 85, 91); path(7, 66, 85, 91);
    path(-34, -7, 60, 65); path(7, 34, 60, 65);
    for (let z = 50; z < 100; z += 9) if (z < 82 || z > 94) D0.box(0, 0.08, z, 1.6, 0.06, 1.6, Wd.trim, { glow: 1, ry: Math.PI / 4 });
    decal(D, 3, W.spawn.x, 0.1, W.spawn.z, 9, 9, Wd.trim, 0, 1, 0);
    // ground cover: snow drifts, sprinkles, stardust
    {
        const Rd = rng(wi * 29 + 3), N = low ? 14 : 30;
        for (let n = 0, tries = 0; n < N && tries < 400; tries++) {
            const x = (Rd() - 0.5) * 140, z = 48 + Rd() * 68, ax = Math.abs(x);
            if (ax < 10 || (z > 82 && z < 94) || onJellyBed(x, z)) continue;
            let clear = true;
            for (let i = 0; i < POSTS.length && clear; i++) { const s = postSpot(i); if (Math.abs(s.x - x) < 6 && Math.abs(s.z - z) < 8) clear = false; }
            for (let i = 0; i < JAWBREAKERS.length && clear; i++) { const s = jbSpot(i); if ((s.x - x) ** 2 + (s.z - z) ** 2 < 36) clear = false; }
            if (!clear || (z < 62 && ax > 30 && ax < 58)) continue;
            n++;
            if (id === 'ginger') { const a = Rd() * 3; for (let k = 0; k < 4; k++) D0.box(x + (Rd() - 0.5) * 3, 0.06, z + (Rd() - 0.5) * 3, 0.22, 0.1, 0.7, Wd.jelly[k % 3], { ry: a + k }); }
            else if (id === 'star') D0.box(x, 0.2 + Rd() * 0.3, z, 0.4, 0.4, 0.4, Rd() < 0.5 ? Wd.trim : 0xffd23a, { glow: 2 });
            else D0.box(x, 0.1, z, 3 + Rd() * 4, 0.24, 2 + Rd() * 3, 0xffffff, { soft: !low, ry: Rd() * 3 });
        }
    }
    // the square's jelly beds, a candy-cane border round each
    for (const b of JELLY_BEDS) {
        jellyRows(domes, Wd, R, low, b[0] + 1.6, b[1] - 1.6, b[2] + 1.6, b[3] - 1.6, null);
        floorQuad(S0, b[0], b[1], b[2], b[3], 0.03, shade(Wd.jelly[0], 0.55));
        for (const [a, c, d, e] of [[b[0], b[1], b[2], b[2] + 0.7], [b[0], b[1], b[3] - 0.7, b[3]], [b[0], b[0] + 0.7, b[2], b[3]], [b[1] - 0.7, b[1], b[2], b[3]]]) P0.box((a + c) / 2, 0.3, (d + e) / 2, c - a, 0.6, e - d, st.cane);
    }
    // the square's edge: a snowbank on a low wall, then a cliff down to the land below
    const mx = (P.x0 + P.x1) / 2, mz = (P.z0 + P.z1) / 2, Wd2 = P.x1 - P.x0, D2 = P.z1 - P.z0;
    const edge = (x, z, sx, sz) => { S0.box(x, -6, z, sx, 14, sz, Wd.rim, { tile: 8 }); S0.box(x, 0.8, z, sx, 1.6, sz, Wd.wall2, { tile: 8 }); P0.box(x, 1.8, z, sx + 0.4, 0.7, sz + 0.4, st.snow, { soft: true }); };
    edge(mx, P.z1 + 1.2, Wd2 + 4.8, 2.4); edge(P.x0 - 1.2, mz, 2.4, D2); edge(P.x1 + 1.2, mz, 2.4, D2);
    for (let x = P.x0; x <= P.x1; x += 12) bigCane(D0, x, P.z1 + 1.2, 4.4, 0.6, st.cane, R);
    for (let z = P.z0 + 12; z <= P.z1; z += 12) for (const sx of [-1, 1]) bigCane(D0, sx * (P.x1 + 1.2), z, 4.4, 0.6, st.cane, R);
    S0.box(0, -14, mz + 2, Wd2 + 10, 12, D2 + 8, shade(Wd.rim, 0.8), { tile: 8 });
    for (let i = 0; i < (low ? 8 : 18); i++) { const a = R(), x = a < 0.33 ? P.x0 - 4 - R() * 6 : a < 0.66 ? P.x1 + 4 + R() * 6 : (R() - 0.5) * 150, z = a < 0.66 ? P.z0 + R() * D2 : P.z1 + 4 + R() * 6, s = 3 + R() * 6; P0.box(x, -8 + s * 0.3, z, s, s, s * 0.9, id === 'jingle' || id === 'frost' ? 0xffffff : shade(Wd.rim, 0.9 + R() * 0.2), { soft: !low, ry: R() * 3, rx: R() * 0.4 }); }
    // candy-cane lamp posts by the paths and round the edge
    for (const [x, z] of [[P.x0 + 2, P.z1 - 2], [P.x1 - 2, P.z1 - 2], [P.x0 + 2, 70], [P.x1 - 2, 70], [-13, 96], [13, 96]]) lampPost(P0, fl, x, z, 7.5, st, R);
    for (const sx of [-1, 1]) for (const z of [52, 68, 78, 102]) lampPost(P0, fl, sx * 9.5, z, 6, st, R);

    // ----- the north side: a gingerbread town wall, the Jelly Gate's great wreath in the middle of it, towers either side -----
    const ring = { z: 40, cy: 15, rIn: 24, rOut: 33 };
    for (const sx of [-1, 1]) {
        const x0 = 26, x1 = P.x1 + 3, wz = 40;
        S0.box(sx * (x0 + x1) / 2, 2, wz, x1 - x0, 32, 8, Wd.wall, { tile: 8 });
        S0.box(sx * (x0 + x1) / 2, 18.6, wz + 0.2, x1 - x0, 1.2, 8.6, Wd.wall2, { tile: 8 });
        P0.box(sx * (x0 + x1) / 2, 19.6, wz, x1 - x0 + 0.6, 1, 8.8, st.snow, { soft: true });
        S0.box(sx * (x0 + x1) / 2, 0.9, wz + 4.2, x1 - x0, 1.8, 0.6, Wd.wall2, { tile: 8 });
        // string lights along its top, presents and a snowman at its foot
        for (let x = x0 + 1.5; x < x1; x += 2.4) D0.box(sx * x, 17.4 - Math.abs(Math.sin(x * 0.4)) * 1.2, wz + 4.45, 0.5, 0.7, 0.5, st.bulbs[Math.floor(x) % st.bulbs.length], { glow: 1 });
        // a gingerbread tower by the Gate and one at the corner: a cone roof, snow on it, lit windows
        for (const [tx, th, tw] of [[37, 40, 10], [P.x1 + 1, 30, 9]]) {
            S0.box(sx * tx, (th - 14) / 2, wz, tw, th + 14, tw, Wd.wall2, { tile: 8 });
            S0.box(sx * tx, th + 0.6, wz, tw + 1.6, 1.2, tw + 1.6, shade(Wd.wall2, 0.9), { tile: 8 });
            stack(P0, sx * tx, wz, [[tw * 0.82, th + 1.2, st.roof], [tw * 0.42, th + tw * 0.75, st.roof2], [tw * 0.05, th + tw * 1.3, st.roof]], 8, () => 0.5);
            stack(P0, sx * tx, wz, [[tw * 0.86, th + 1.1, st.snow], [tw * 0.7, th + 2.2, st.snow]], 8, () => 0.5);
            P0.box(sx * tx, th + tw * 1.38, wz, 1.6, 1.6, 0.5, 0xffd23a, { glow: 1, rz: Math.PI / 4 });
            for (const wy of [th * 0.45, th * 0.7]) { P0.box(sx * tx, wy, wz + tw / 2 + 0.06, 1.8, 2.6, 0.12, 0xffd86a, { glow: 1 }); P0.box(sx * tx, wy, wz + tw / 2 + 0.1, 0.25, 2.6, 0.14, Wd.wall2); }
            fl.push([sx * tx, th + 1.6, wz + tw / 2, 1.4, st.flame]);
        }
        // great wreaths hanging on the wall, a red bow under each
        for (const bx of [48, 60]) {
            const x = sx * bx, z = wz + 4.3, cy2 = 11;
            for (let j = 0; j < 12; j++) { const a = j / 12 * Math.PI * 2; P0.box(x + Math.cos(a) * 3.2, cy2 + Math.sin(a) * 3.2, z, 2.2, 2.2, 1.1, j % 2 ? st.leaf : shade(st.leaf, 1.2), { rz: a }); }
            for (let j = 0; j < 6; j++) { const a = j * 1.1 + 0.3; P0.box(x + Math.cos(a) * 3.2, cy2 + Math.sin(a) * 3.2, z + 0.6, 0.6, 0.6, 0.4, 0xff2a3a, { glow: 1 }); }
            P0.box(x - 1.2, cy2 - 3.4, z + 0.6, 2.2, 1.5, 0.5, st.cloth, { rz: 0.4, soft: true }); P0.box(x + 1.2, cy2 - 3.4, z + 0.6, 2.2, 1.5, 0.5, st.cloth, { rz: -0.4, soft: true });
        }
        if (!low) presents(D0, sx * 31, wz + 6.5, R, 4, 1.2);
    }
    // the Jelly Gate: a giant wreath round the way in, its lights, a great red bow on top, gold light swirling round inside it
    {
        const N = low ? 26 : 38, rm = (ring.rIn + ring.rOut) / 2;
        for (let i = 0; i < N; i++) {
            const a = (i + 0.5) / N * Math.PI * 2, cx = Math.cos(a) * rm, cy = ring.cy + Math.sin(a) * rm;
            if (cy < -4) continue;
            for (let k = 0; k < (low ? 2 : 3); k++) {
                const o = (k - 1) * 2.4, ox = Math.cos(a) * o, oy = Math.sin(a) * o;
                P0.box(cx + ox, cy + oy, ring.z + (R() - 0.5) * 3, 4.6 + R() * 1.4, 4.6 + R() * 1.4, 7 + R() * 2, k === 1 ? st.leaf : shade(st.leaf, 0.8 + R() * 0.45), { rz: a + R(), rx: (R() - 0.5) * 0.5, soft: !low && k === 1 });
            }
            P0.box(cx + Math.cos(a) * (R() - 0.5) * 6, cy + Math.sin(a) * (R() - 0.5) * 6, ring.z + 4.4, 0.9, 0.9, 0.6, i % 3 ? 0xff2a3a : st.bulbs[i % st.bulbs.length], { glow: 1 });
            if (i % 2 === 0) P0.box(Math.cos(a) * (ring.rIn + 1.2), ring.cy + Math.sin(a) * (ring.rIn + 1.2), ring.z + 4.2, 0.8, 1.1, 0.8, st.bulbs[(i >> 1) % st.bulbs.length], { glow: 1 });
        }
        // the bow at the top, two gold bells under it
        const by = ring.cy + rm + 1, bz = ring.z + 5;
        for (const s2 of [-1, 1]) {
            P0.box(s2 * 5.2, by + 1.2, bz, 8.6, 6.4, 2.2, st.cloth, { soft: true, rz: s2 * 0.32 });
            P0.box(s2 * 3, by - 6, bz + 0.4, 2.4, 8.5, 1, st.cloth, { rz: s2 * 0.32 });
            stack(P0, s2 * 3.6, bz + 1.4, [[0.3, by - 9.2, 0xffd23a], [1.7, by - 8.8, 0xffc21e], [1.2, by - 7, 0xffe24a], [0.4, by - 5.9, 0xffd23a]], 8, () => 0.5, 1, 0);
        }
        P0.box(0, by, bz + 0.6, 3.6, 3.6, 2.6, shade(st.cloth, 1.15), { soft: true });
        const rg = new T.RingGeometry(ring.rIn - 5, ring.rIn + 0.4, 96, 1), pp = rg.attributes.position, uv = rg.attributes.uv;
        for (let i = 0; i < pp.count; i++) { const x = pp.getX(i), y = pp.getY(i); uv.setXY(i, (Math.atan2(y, x) / (Math.PI * 2) + 1) % 1, (Math.hypot(x, y) - (ring.rIn - 5)) / 5.4); }
        energyGeo(E, rg, 2, new T.Matrix4().makeTranslation(0, ring.cy, ring.z + 4.7), Wd.glow, 0xffffff, 1);
        energyGeo(E, rg, 2, new T.Matrix4().makeTranslation(0, ring.cy, ring.z - 4.7), Wd.glow, 0xffffff, 1);
        rg.dispose();
        signs.add([big('THE JELLY RUN', AQUA, 112, '#06142a'), { t: 'squish your way to the end!', c: '#ffffff', s: '#06142a', px: 40 }], 30, new V3(0, ring.cy + ring.rOut + 9.5, ring.z + 6), false, 320);
    }

    // ----- the Jelly Run -----
    const hw = W.halfW, pads = [], beamAt = [], blades = [], gates = [], sliders = [];
    const SLIDE_C = [[0xe8303a, 0xffd23a], [0x2ab450, 0xff3a3a], [0x3a8aff, 0xffffff], [0xffc23a, 0xe8303a], [0xa04aff, 0xffd23a], [0xff7ac8, 0xffffff]];
    for (let k = 0; k < WALLS_N; k++) {
        const Sk = new Kit(), Pk = new Kit({ glow: true }), Dk = new Kit({ glow: true }), zs = k === 0 ? P.z0 : wallZ(k), zn = k === WALLS_N - 1 ? northEnd - 6 : wallZ(k + 1), pd = padAt(k), plan = stagePlan(wi, k);
        stretchS.push(Sk); stretchP.push(Pk);
        Dk.far = NEAR_D; detail.push(Dk); ctx.dk = Dk;
        const pools = plan.list.filter((o) => o.kind === 'pool').concat(plan.lakes.map((l) => ({ kind: 'pool', x0: l.x0, x1: l.x1, z0: l.z0, z1: l.z1, lake: true })));
        const open = plan.type === 'stones' || plan.type === 'bounce' || plan.type === 'crumble';
        // the floor with the pools cut out of it: bands across, the tile colours in turn
        const cuts = new Set([zn, zs]);
        for (const o of pools) { cuts.add(o.z0); cuts.add(o.z1); }
        for (let z = Math.ceil(zn / 12) * 12; z < zs; z += 12) cuts.add(z);
        const zz = [...cuts].filter((z) => z >= zn && z <= zs).sort((a, b) => a - b);
        for (let i = 0; i < zz.length - 1; i++) {
            const a = zz[i], b = zz[i + 1], m = (a + b) / 2, inPool = pools.find((o) => m > o.z0 && m < o.z1);
            // (the floor under the jelly tinted its colour: past the last domes the course still reads as a jelly carpet)
            const c = mixC(Math.floor(m / 12) & 1 ? Wd.floor : Wd.floor2, Wd.jelly[0], 0.22);
            const xs = inPool ? [[inPool.x1, hw]].filter(([u, v]) => v - u > 0.01) : [[-hw, hw]];
            for (const [x0, x1] of xs) {
                floorQuad(Sk, x0, x1, a, b, 0.02, c);
                for (const sx of [-1, 1]) { const g0 = Math.max(x0, sx < 0 ? -hw : hw - 1.4), g1 = Math.min(x1, sx < 0 ? -hw + 1.4 : hw); if (g1 > g0) floorQuad(Sk, g0, g1, a, b, 0.04, Wd.rim); }
            }
        }
        // the pools: a pit, the syrup in it (a decal), a glossy lip
        for (const o of pools) {
            const full = o.x1 - o.x0 > hw * 1.9, cx = (o.x0 + o.x1) / 2, w = o.x1 - o.x0, d = o.z1 - o.z0;
            for (const zz2 of [o.z0 + 0.2, o.z1 - 0.2]) Sk.box(cx, -0.8, zz2, w, 1.6, 0.4, shade(Wd.rim, 0.8), { tile: 8 });
            if (!full) Sk.box(o.x1 - 0.2, -0.8, (o.z0 + o.z1) / 2, 0.4, 1.6, d, shade(Wd.rim, 0.8), { tile: 8 });
            decal(D, 0, cx, -0.3, (o.z0 + o.z1) / 2, w / 2, d / 2, Wd.hazard, Wd.hazard2, 1, full ? 0 : 1);
            for (const zz2 of [o.z0, o.z1]) Pk.box(cx, 0.08, zz2, w, 0.16, 0.5, 0xffffff);
            if (!full) Pk.box(o.x1, 0.08, (o.z0 + o.z1) / 2, 0.5, 0.16, d, 0xffffff);
        }
        // the gate at this stage's start
        const gz = wallZ(k), blz = plan.list.filter((o) => o.kind === 'blade' || o.kind === 'slider').map((o) => o.z);
        const skip = (z) => Math.abs(z - gz) < 6 || (k < WALLS_N - 1 && Math.abs(z - wallZ(k + 1)) < 6) || blz.some((b) => Math.abs(z - b) < 3.6) || (k === 0 && z > 36);
        for (const sx of [-1, 1]) (open ? fenceRun : wallRun)(Sk, Pk, sx, XIN, zn, zs, ctx, skip);
        if (k > 0) gateFrame(Sk, Pk, gz, ctx, k);
        else {
            // the first gate: always open, two candy canes and a garland
            for (const sx of [-1, 1]) bigCane(P0, sx * (hw + 1.4), gz, 9, 1.1, st.cane, R);
            // a garland swagging between them: little bunches of needles, a light on every other one, a bow in the middle
            for (let j = 0; j < 24; j++) { const f = (j + 0.5) / 24, x = -hw - 1 + f * (hw + 1) * 2, y = 10.2 - Math.sin(f * Math.PI) * 3.2; P0.box(x, y, gz, 1.3, 0.95, 0.95, j % 2 ? st.leaf : shade(st.leaf, 1.25), { rz: (j % 3) * 0.6, rx: (j % 2) * 0.5 }); if (j % 2) P0.box(x, y - 0.55, gz + 0.45, 0.42, 0.5, 0.42, st.bulbs[j % st.bulbs.length], { glow: 1 }); }
            for (const s2 of [-1, 1]) P0.box(s2 * 1.1, 7.3, gz + 0.5, 1.9, 1.3, 0.5, st.cloth, { rz: s2 * 0.4 });
            P0.box(0, 7.1, gz + 0.6, 0.8, 0.8, 0.6, shade(st.cloth, 1.15));
            P0.box(0, 0.04, gz, hw * 2, 0.08, 1.2, Wd.trim, { glow: 1, shade: 0.7 });
        }
        const need = stageNeed(wi, k);
        const nameSign = signs.add([{ t: 'STAGE ' + (k + 1) + ' · ' + STAGE_TYPES[plan.type].title.toUpperCase(), c: '#ffe24a', s: '#3a0a10', px: 38 }, big(stageName(wi, k), WHITE, 84, '#3a0a10')], 16, new V3(0, W.gateH + 10.6, gz + 3.5), false, 150);
        const needSign = signs.add([big(k === 0 ? 'RUN!' : fmt(need) + ' SPEED', k === 0 ? LIME : RED, 84, k === 0 ? '#0a2a0a' : '#2a0606', 'bolt')], 13, new V3(0, W.gateH + 6.6, gz + 3.5), false, 150);
        gates.push({ k, z: gz, nameSign, needSign, need, locked: null, e: k > 0 ? energyQuad(E, 0, 0, 0, gz + 1.6, hw * 2, W.gateH, Wd.glow, 0xffffff, 1, hw * 2) : -1 });
        ctx.dk = null;
        // what's in the way
        for (const o of plan.list) {
            if (o.kind === 'hurdle') {
                // a candy bar across the way: stripes, a glossy top
                const nb = 12, bw = hw * 2 / nb;
                for (let j = 0; j < nb; j++) Sk.box(-hw + (j + 0.5) * bw, o.h / 2, o.z, bw + 0.02, o.h, o.d, j % 2 ? 0xffffff : st.cane, { tile: 8 });
                Pk.box(0, o.h + 0.08, o.z, hw * 2, 0.16, o.d * 0.6, Wd.hazard2, { glow: 1 });
                for (const sx of [-1, 1]) Sk.box(sx * (hw - 0.6), o.h / 2 + 0.6, o.z, 1.6, o.h + 1.2, o.d + 0.6, shade(Wd.wall2, 0.85), { tile: 8 });
            } else if (o.kind === 'pillars') {
                // giant candy canes to weave round
                for (const p of o.list) {
                    Sk.box(p.x, 0.4, p.z, p.s + 1, 0.8, p.s + 1, shade(Wd.wall2, 0.9), { tile: 8 });
                    bigCane(Pk, p.x, p.z, 13, p.s * 0.82, st.cane, R);
                    if (id === 'jingle' || id === 'frost') Pk.box(p.x, 0.9, p.z, p.s + 1.4, 0.6, p.s + 1.4, 0xffffff, { soft: true });
                    else if (id === 'star') rubble(Pk, p.x, 17 + R() * 3, p.z, 1.6, R, Wd);
                }
            } else if (o.kind === 'slit') {
                // a wall of presents, stacked, with one way through
                const l0 = -hw, l1 = o.gx - o.gw / 2, r0 = o.gx + o.gw / 2, r1 = hw;
                for (const [a, b] of [[l0, l1], [r0, r1]]) {
                    if (b - a < 0.05) continue;
                    Sk.box((a + b) / 2, o.h / 2, o.z, b - a, o.h, o.d, Wd.wall2, { tile: 8 });
                    const nx = Math.max(1, Math.round((b - a) / 3.2)), bw = (b - a) / nx;
                    for (let j = 0; j < nx; j++) for (let row = 0; row < 3; row++) {
                        const [c1, c2] = SLIDE_C[(j * 3 + row + k) % SLIDE_C.length], px = a + (j + 0.5) * bw, py = row * (o.h / 3) + o.h / 6, ph = o.h / 3 - 0.08;
                        for (const sz2 of [1, -1]) {
                            Pk.box(px, py, o.z + sz2 * (o.d / 2 + 0.06), bw - 0.12, ph, 0.12, c1);
                            Pk.box(px, py, o.z + sz2 * (o.d / 2 + 0.1), 0.36, ph, 0.1, c2); Pk.box(px, py, o.z + sz2 * (o.d / 2 + 0.11), bw - 0.12, 0.3, 0.1, c2);
                        }
                    }
                    Pk.box((a + b) / 2, o.h + 0.3, o.z, b - a + 0.4, 0.6, o.d + 0.4, st.snow, { soft: true });
                }
                for (const ex of [l1, r0]) if (ex > -hw + 0.1 && ex < hw - 0.1) { Pk.box(ex, o.h / 2, o.z + o.d / 2 + 0.15, 0.4, o.h, 0.12, Wd.trim, { glow: 1 }); Pk.box(ex, o.h / 2, o.z - o.d / 2 - 0.15, 0.4, o.h, 0.12, Wd.trim, { glow: 1 }); }
                // an arrow over the way through
                Pk.box(o.gx, o.h + 2.2, o.z, 1.2, 2.2, 0.3, Wd.trim, { glow: 1 });
                Pk.box(o.gx - 0.7, o.h + 1.1, o.z, 0.5, 1.8, 0.3, Wd.trim, { glow: 1, rz: 0.8 }); Pk.box(o.gx + 0.7, o.h + 1.1, o.z, 0.5, 1.8, 0.3, Wd.trim, { glow: 1, rz: -0.8 });
            } else if (o.kind === 'boost') {
                decal(D, 1, o.x, 0.09, o.z, o.hw, o.hd, mixC(Wd.jelly[0], 0x000000, 0.45), mixC(Wd.glow, 0xffffff, 0.35), 1, 0);
                Sk.box(o.x, 0.04, o.z, o.hw * 2 + 0.8, 0.08, o.hd * 2 + 0.8, Wd.rim, { tile: 8 });
            } else if (o.kind === 'blade') {
                // the beam it hangs from, wall to wall: a big candy cane laid across
                const by = BLADE_PIVOT + 0.8, nb = 10, bw = (XIN + 2) * 2 / nb;
                for (let j = 0; j < nb; j++) Pk.box(-(XIN + 2) + (j + 0.5) * bw, by, o.z, bw + 0.02, 1.5, 1.5, j % 2 ? 0xffffff : st.cane);
                for (const sx of [-1, 1]) { Pk.box(sx * (XIN - 0.3), by - 2.2, o.z, 1, 4.6, 2.4, st.metal); Pk.box(sx * (XIN - 2.2), by - 1.3, o.z, 3.6, 0.5, 0.5, st.metal, { rz: sx * 0.75 }); }
                Pk.box(0, by - 0.2, o.z, 2.4, 2, 2.4, 0xffd23a, { soft: true });
                // a warning stripe across the floor where it swings
                for (let x = -14; x <= 14; x += 4) Dk.box(x, 0.05, o.z, 2, 0.04, 0.4, Wd.hazard2, { glow: 1, shade: 0.8 });
                blades.push({ o, z: o.z, i: blades.length });
            } else if (o.kind === 'slider') {
                // a giant gift box sliding from wall to wall: its track across the floor, striped bumpers at each end
                const tz = SLIDER.d / 2 + 0.7;
                floorQuad(Sk, -hw, hw, o.z - tz, o.z + tz, 0.05, shade(Wd.rim, 0.85));
                for (const sz2 of [-1, 1]) for (let x = -hw + 1; x < hw - 1; x += 3) Dk.box(x + 0.75, 0.07, o.z + sz2 * tz, 1.5, 0.05, 0.4, x % 6 < 3 ? Wd.hazard2 : 0xffffff, { glow: 1, shade: 0.85 });
                for (const sx of [-1, 1]) for (let j = 0; j < 4; j++) Pk.box(sx * (hw - 0.4), 0.8 + j * 1.6, o.z, 0.8, 1.6, SLIDER.d + 1, j % 2 ? 0xffffff : st.cane);
                const [c1, c2] = SLIDE_C[(sliders.length + k) % SLIDE_C.length];
                sliders.push({ o, z: o.z, i: sliders.length, c1, c2 });
            } else if (o.kind === 'sweeper') {
                // its post: a fat candy cane, a gumdrop on top; a warning circle round it on the floor
                for (let j = 0; j < 6; j++) Pk.box(o.x, 0.5 + j, o.z, SWEEP.post * 2, 1.02, SWEEP.post * 2, j % 2 ? 0xffffff : st.cane, { ry: j * 0.3 });
                stack(Pk, o.x, o.z, [[SWEEP.post * 1.2, 6, Wd.jelly[1]], [SWEEP.post * 0.9, 7, mixC(Wd.jelly[1], 0xffffff, 0.25)], [0.2, 7.6, mixC(Wd.jelly[1], 0xffffff, 0.45)]], 8, () => 0.5, 1, 0.3);
                decal(D, 3, o.x, 0.11, o.z, SWEEP.r + 1.2, SWEEP.r + 1.2, 0xff6a7a, 0, 1, o.dir > 0 ? 0 : 1);
                floorQuad(Sk, -hw, hw, o.z - SWEEP.r - 1, o.z + SWEEP.r + 1, 0.03, mixC(Wd.floor, Wd.jelly[1], 0.18));
            } else if (o.kind === 'boulders') {
                // the lanes they roll down: darker tracks (the snowballs start small at the far end and grow as they come)
                for (const lx of o.lanes) {
                    floorQuad(Sk, lx - BALL.r - 0.6, lx + BALL.r + 0.6, o.z0 - 12, o.z1 + 2, 0.05, shade(Wd.floor2, 0.86));
                    for (let z = o.z1; z > o.z0; z -= 9) Dk.box(lx, 0.09, z, 1.4, 0.04, 2.8, Wd.hazard2, { glow: 1, shade: 0.8 });
                }
            } else if (o.kind === 'gumballs') {
                // a candy-tile floor where they fall (the shadows show on it)
                for (let z = o.z1; z > o.z0; z -= 6) for (let x = -hw + 3; x < hw - 2; x += 6) floorQuad(Sk, x - 2.9, x + 2.9, z - 5.9, z - 0.1, 0.04, ((x + z) / 6 | 0) & 1 ? mixC(Wd.floor, Wd.jelly[2], 0.25) : mixC(Wd.floor2, Wd.jelly[0], 0.15));
            } else if (o.kind === 'jwall') {
                // where a jelly wall stands: a warning band, a post at each end
                for (const sz2 of [-1, 1]) Dk.box(0, 0.08, o.z + sz2 * (JWALL.d / 2 + 0.8), hw * 2, 0.04, 0.5, Wd.hazard2, { glow: 1, shade: 0.85 });
                for (const sx of [-1, 1]) for (let j = 0; j < 4; j++) Pk.box(sx * (hw - 0.3), 1.5 + j * 3, o.z, 1.2, 3.02, JWALL.d + 1, j % 2 ? 0xffffff : st.cane);
            }
        }
        // the platforms: cookie stones with a cushion of jelly on top, trampolines (a drum, a skin of jelly)
        for (const p of plan.plats) {
            if (p.kind === 'stone') {
                Sk.box(p.x, (p.top - 0.4 - 1.2) / 2, p.z, p.sx, p.top - 0.4 + 1.2, p.sz, 0xc8823e, { tile: 8 });
                Pk.box(p.x, p.top - 0.42, p.z, p.sx + 0.3, 0.3, p.sz + 0.3, 0xfff4e4, { soft: !low });
                domes.push({ x: p.x, z: p.z, y: p.top - 0.38, r: Math.min(p.sx, p.sz) * 0.47, h: 0.3, c: Wd.jelly[Math.abs(Math.round(p.x * 3 + p.z)) % 3] });
            } else {
                const r = p.sx / 2;
                stack(Pk, p.x, p.z, [[r * 0.9, -0.8, shade(Wd.jelly[1], 0.7)], [r * 0.98, p.top - 0.5, Wd.jelly[1]], [r * 1.05, p.top - 0.2, 0xffffff]], 12, () => 0.5);
                for (let j = 0; j < 6; j++) { const a2 = j / 6 * Math.PI * 2; Pk.box(p.x + Math.cos(a2) * r * 0.97, (p.top - 0.8) / 2, p.z + Math.sin(a2) * r * 0.97, 0.5, p.top + 0.6, 0.5, 0xffffff, { ry: -a2 }); }
                domes.push({ x: p.x, z: p.z, y: p.top - 0.35, r: r * 0.92, h: 0.24, c: Wd.jelly[2] });
            }
        }
        // ice: a frozen floor
        for (const o of plan.icy) decal(D, 7, 0, 0.06, (o.z0 + o.z1) / 2, hw, (o.z1 - o.z0) / 2, 0xffffff, 0, 1, 0);
        // the Win Pad at the stage's end: a plate of light (a decal), a star over it, a beam, what it's worth
        const padSign = signs.add([big('+' + fmt(padWins(wi, k)) + ' WINS', GOLD, 96, '#3a1a00', 'crown')], 12, new V3(pd.x, 14, pd.z), true, 90);
        const di = decal(D, 2, pd.x, 0.12, pd.z, W.padR + 1, W.padR + 1, 0, 0, 1, 0);
        Sk.box(pd.x, 0.05, pd.z, (W.padR + 1.6) * 2, 0.1, (W.padR + 1.6) * 2, Wd.wall2, { tile: 8 });
        for (const [ox, oz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { bigCane(Pk, pd.x + ox * (W.padR + 1.5), pd.z + oz * (W.padR + 1.5), 3.2, 0.7, st.cane, R); Pk.box(pd.x + ox * (W.padR + 1.5), 3.9, pd.z + oz * (W.padR + 1.5), 0.9, 0.9, 0.9, 0xffc21e, { glow: 1 }); }
        const bi = energyGeo(E, BEAM_GEO(), 1, new T.Matrix4().makeTranslation(pd.x, 0, pd.z), 0xff8a1a, 0xffe07a, 1);
        pads.push({ k, sign: padSign, x: pd.x, z: pd.z, di, bi });
        beamAt.push([pd.x, 0, pd.z]);
        // the jelly: rows across the whole stage, clear of what's in the way, the pad and the gates
        const pr = W.padR + 2.6, near = [];
        for (const o of plan.list) near.push(o);
        jellyRows(domes, Wd, R, low, -hw + 2.4, hw - 2.4, zn + 6, zs - 7, (x, z) => {
            if (Math.abs(x - pd.x) < pr && Math.abs(z - pd.z) < pr) return true;
            if (Math.abs(z - gz) < 6.5 || (k < WALLS_N - 1 && Math.abs(z - wallZ(k + 1)) < 6.5)) return true;
            for (const o of plan.lakes) if (z > o.z0 - 2.6 && z < o.z1 + 2.6) return true;
            for (const o of plan.icy) if (inRect(o, x, z)) return true;
            for (const o of near) {
                if (o.kind === 'pool') { if (z > o.z0 - 2.6 && z < o.z1 + 2.6 && x > o.x0 - 2.6 && x < o.x1 + 2.6) return true; }
                else if (o.kind === 'sweeper') { if (Math.abs(z - o.z) < SWEEP.r + 1.5) return true; }
                else if (o.kind === 'boulders') { if (z > o.z0 - 14 && z < o.z1 + 4 && o.lanes.some((lx) => Math.abs(x - lx) < BALL.r + 1.4)) return true; }
                else if (o.kind === 'gumballs') { if (z > o.z0 - 1 && z < o.z1 + 1) return true; }
                else if (o.kind === 'jwall') { if (Math.abs(z - o.z) < JWALL.d / 2 + 2) return true; }
                else if (o.kind === 'hurdle' || o.kind === 'slit') { if (Math.abs(z - o.z) < (o.d || 2) / 2 + 2.4) return true; }
                else if (o.kind === 'slider') { if (Math.abs(z - o.z) < SLIDER.d / 2 + 2.6) return true; }
                else if (o.kind === 'blade') { if (Math.abs(z - o.z) < 3.4) return true; }
                else if (o.kind === 'boost') { if (Math.abs(x - o.x) < o.hw + 1.6 && Math.abs(z - o.z) < o.hd + 1.6) return true; }
                else if (o.kind === 'pillars') { for (const p of o.list) if ((x - p.x) ** 2 + (z - p.z) ** 2 < (p.s * 0.7 + 2.3) ** 2) return true; }
            }
            return false;
        });
    }
    // the far end: a wall across, an arch of candy canes, and through it the next world
    {
        const P9 = stretchP[stretchP.length - 1], S9 = stretchS[stretchS.length - 1], z = endPortal.z, nextW = WORLDS[wi + 1];
        S9.box(0, (WH - 14) / 2, northEnd - 6 - WT / 2, (XIN + WT) * 2, WH + 14, WT, Wd.wall, { tile: 8 });
        for (const sx of [-1, 1]) { bigCane(P9, sx * 11, z, 22, 3, st.cane, R); fl.push([sx * 11, 24.6, z, 2, st.flame]); }
        S9.box(0, 23, z, 26, 3, 3.6, Wd.wall2, { tile: 8 });
        P9.box(0, 24.8, z, 26.4, 0.8, 4, st.snow, { soft: true });
        P9.box(0, 23, z + 1.85, 18, 0.5, 0.1, Wd.trim, { glow: 1 });
        portalDecal(D, 0, 0.2, z, 18.6, 21.6, Wd.glow, nextW ? nextW.glow : 0xffffff);
        signs.add([big(nextW ? 'ON TO ' + nextW.name.toUpperCase() + '!' : 'ALL WORLDS CLEARED!', GOLD, 92, '#3a1a00')], 22, new V3(0, 29, z + 2), false, 160);
    }
    const crownG = crownGeo(), crownMat = crownMaterial();
    const crowns = new T.InstancedMesh(crownG, crownMat, WALLS_N);
    { const m = new T.Matrix4(); beamAt.forEach((b, i) => crowns.setMatrixAt(i, m.makeTranslation(b[0], b[1] + 8.2, b[2]))); }
    crowns.frustumCulled = false;
    group.add(crowns);

    // ----- the Shoe Shop and the Upgrades: gingerbread stalls under a striped roof with snow on it, an awning over the counter -----
    const booth = (q, wallC, roofC, roof2, aw1, aw2) => {
        const x = q.x, z = q.z, w = 24, hw2 = w / 2, y0 = 10, rise = 6.5, zf = z + 5.6, zb = z - 8.4, d = zf - zb;
        S0.box(x, 0.15, z - 1.4, w + 2, 0.3, 17, Wd.wall2, { tile: 8 });
        S0.box(x, 5, zb + 1.5, w, 10, 3, wallC, { tile: 8 });
        for (const sx of [-1, 1]) {
            S0.box(x + sx * (hw2 - 0.5), 3, z - 3.2, 1.5, 6, 9, wallC, { tile: 8 });
            for (let j = 0; j < 5; j++) P0.box(x + sx * (hw2 - 0.5), 1 + j * 2, zf, 1.5, 2.02, 1.5, j % 2 ? 0xffffff : st.cane);
            P0.box(x + sx * (hw2 + 0.5), 7.4, zf + 0.6, 0.9, 0.3, 0.3, st.metal); P0.box(x + sx * (hw2 + 0.9), 7.9, zf + 0.6, 0.9, 0.7, 0.9, 0xffd23a, { soft: true });
            fl.push([x + sx * (hw2 + 0.9), 8.2, zf + 0.6, 0.8, st.flame]);
        }
        P0.box(x, y0, zf, w + 1, 0.9, 1, st.wood);
        const ang = Math.atan2(rise, hw2), L = Math.hypot(rise, hw2) + 1.6, nst = 6, stp = d / nst;
        for (let i = 0; i < nst; i++) for (const s of [-1, 1]) P0.box(x + s * (hw2 / 2 + 0.2), y0 + rise / 2 + 0.3, zb + stp * (i + 0.5), L, 0.6, stp + 0.02, i % 2 ? roofC : roof2, { rz: -s * ang });
        for (const s of [-1, 1]) P0.box(x + s * (hw2 / 2 + 0.2), y0 + rise / 2 + 0.75, z - 1.4, L * 0.9, 0.45, d, st.snow, { rz: -s * ang, soft: true });
        P0.box(x, y0 + rise + 0.5, z - 1.4, 1.2, 0.8, d + 0.6, st.wood);
        for (const [zz, nz] of [[zf, 1], [zb, -1]]) P0.faceTo([x - hw2, y0, zz], [x + hw2, y0, zz], [x, y0 + rise, zz], [x, y0 + rise, zz], [0, 0, nz], shade(wallC, 0.9));
        // icicles of icing along the roof's edge, lights under the awning
        for (let i = 0; i < 12; i++) D0.box(x - hw2 + 1 + i * (w - 2) / 11, y0 - 0.6, zf + 0.6, 0.35, 0.6 + (i % 3) * 0.35, 0.35, 0xffffff, { glow: 1 });
        for (let i = 0; i < 10; i++) { const sw = (w - 2) / 10; P0.box(x - (w - 2) / 2 + sw * (i + 0.5), 8.6, zf + 2.3, sw + 0.02, 0.35, 5, i % 2 ? aw1 : aw2, { rx: 0.42 }); }
        for (let i = 0; i < 10; i++) { const sw = (w - 2) / 10; P0.box(x - (w - 2) / 2 + sw * (i + 0.5), 7.55, zf + 4.65, sw * 0.8, 0.9, 0.2, i % 2 ? aw2 : aw1, {}); }
        for (let i = 0; i < 9; i++) D0.box(x - (w - 4) / 2 + i * (w - 4) / 8, 7.0, zf + 4.8, 0.45, 0.6, 0.45, st.bulbs[i % st.bulbs.length], { glow: 1 });
        S0.box(x, 2.1, z + 3, w - 2.4, 4.2, 4.4, wallC, { tile: 8 });
        P0.box(x, 4.35, z + 3, w - 1.6, 0.5, 4.8, st.wood);
        P0.box(x, 3.2, z + 5.25, w - 3, 0.2, 0.1, aw1, { glow: 1 });
    };
    {
        const q = tongueBar, x = q.x, z = q.z;
        booth(q, Wd.id === 'jingle' ? 0xb0662e : shade(Wd.wall, 1.05), st.roof, st.roof2, st.shop[0], st.shop[1]);
        // shoes on the counter and the shelves: every pair in the shop
        SHOES.forEach((s, i) => {
            const row = i < 6 ? 0 : i < 11 ? 1 : 2, col = i < 6 ? i : i < 11 ? i - 6 : i - 11, n = row === 0 ? 6 : 5;
            const sx = x - 8 + col * (16 / (n - 1)), sy = row === 0 ? 4.9 : 4.6 + row * 2.2, sz = row === 0 ? z + 3 : z - 6.6;
            if (row) P0.box(sx, sy - 0.45, sz, 3, 0.3, 1.6, st.wood);
            P0.box(sx - 0.35, sy, sz, 0.6, 0.55, 1.2, s.c1, { soft: true }); P0.box(sx + 0.35, sy, sz, 0.6, 0.55, 1.2, s.c1, { soft: true });
            P0.box(sx - 0.35, sy - 0.25, sz + 0.05, 0.66, 0.2, 1.3, s.c2, { glow: s.glow ? 1 : 0 }); P0.box(sx + 0.35, sy - 0.25, sz + 0.05, 0.66, 0.2, 1.3, s.c2, { glow: s.glow ? 1 : 0 });
        });
        // a giant boot on the roof, its cuff of white fluff
        const gy = 18.4, gz = z - 1;
        P0.box(x, gy, gz, 3.4, 2.4, 6.4, st.shop[0], { soft: true }); P0.box(x, gy + 1.8, gz - 1.6, 3.2, 2.4, 3, st.shop[0], { soft: true });
        P0.box(x, gy + 3.2, gz - 1.6, 3.6, 1.1, 3.4, 0xffffff, { soft: true });
        P0.box(x, gy - 1.3, gz + 0.2, 3.6, 0.7, 7, 0xffffff, { soft: true }); P0.box(x, gy - 1.55, gz + 0.2, 3.7, 0.25, 7.1, st.shop[1] === 0xffffff ? 0xffd23a : st.shop[1], { glow: 1 });
        P0.box(x + 1.8, gy + 0.6, gz - 2.6, 0.3, 1.8, 2.2, 0xffffff, { glow: 1, rx: -0.5 }); P0.box(x - 1.8, gy + 0.6, gz - 2.6, 0.3, 1.8, 2.2, 0xffffff, { glow: 1, rx: -0.5 });
        signs.add([big('SHOE SHOP', GOLD, 112, '#3a1a00'), { t: 'faster shoes for Wins', c: '#ffffff', s: '#3a1a00', px: 40 }], 14, new V3(x, 25.4, z + 4), false, 150);
    }
    {
        const q = upgradeShed, x = q.x, z = q.z;
        booth(q, Wd.id === 'jingle' ? 0xa8602a : shade(Wd.wall, 0.95), st.roof2 === 0xffffff ? 0x2ab450 : st.roof, 0xffffff, st.ups[0], st.ups[1]);
        // jars of sweets, a candy mixer, a rack of training weights made of gumdrops
        P0.box(x - 5, 5.2, z + 3, 3.6, 1.2, 1.8, st.metal, { soft: true }); P0.box(x - 5, 6.1, z + 3, 4.6, 0.8, 2, 0xffd23a, { soft: true });
        for (let i = 0; i < 4; i++) { const c = [0xff4a6a, 0x46ec50, 0x3ab4ff, 0xffd23a][i]; P0.box(x + 1.5 + i * 2.2, 5.3, z + 3, 1.2, 1.4, 1.2, c, { glow: 1, soft: true }); P0.box(x + 1.5 + i * 2.2, 6.25, z + 3, 0.5, 0.6, 0.5, 0xe8e0d0); }
        for (let i = 0; i < 4; i++) { P0.box(x - 6 + i * 4, 7.2, z - 6.6, 3, 0.3, 0.3, st.metal); for (const s of [-1, 1]) P0.box(x - 6 + i * 4 + s * 1.3, 7.2, z - 6.6, 0.4, 1.2 + i * 0.2, 1.2 + i * 0.2, Wd.jelly[i % 3], { soft: true }); }
        // a great arrow pointing up, on the roof
        const ay = 18.6;
        P0.box(x, ay - 1, z - 1, 2, 4, 1.4, st.ups[0], { glow: 1 });
        P0.box(x - 1.1, ay + 1.6, z - 1, 1.2, 3.2, 1.4, st.ups[0], { glow: 1, rz: -0.8 }); P0.box(x + 1.1, ay + 1.6, z - 1, 1.2, 3.2, 1.4, st.ups[0], { glow: 1, rz: 0.8 });
        signs.add([big('UPGRADES', AQUA, 118, '#06142a'), { t: 'run faster, jump higher', c: '#ffffff', s: '#06142a', px: 40 }], 12.5, new V3(x, 25.6, z + 4), false, 150);
    }
    // ----- the treadmills: a belt between rails, a console with a screen at the front (north). Its own colours -----
    const postSigns = POSTS.map((c, i) => {
        const s = postSpot(i), bw = BELT.w, bl = BELT.l, cz = s.z - bl / 2 - 0.9;
        // the deck, the frame along both sides, rollers at either end
        S0.box(s.x, 0.06, s.z, bw + 2.4, 0.12, bl + 1.2, shade(Wd.wall2, 0.9), { tile: 8 });
        for (const sx of [-1, 1]) {
            P0.box(s.x + sx * (bw / 2 + 0.45), 0.32, s.z, 0.9, 0.64, bl + 0.4, c.c, { soft: true });
            P0.box(s.x + sx * (bw / 2 + 0.45), 0.66, s.z, 0.3, 0.06, bl - 0.6, c.c2, { glow: 1 });
            // the handrails from the console back along the belt: candy-striped
            for (let j = 0; j < 4; j++) P0.box(s.x + sx * (bw / 2 + 0.3), 4.2, cz + 0.95 + j * 0.85, 0.42, 0.42, 0.86, j % 2 ? 0xffffff : c.c);
            P0.box(s.x + sx * (bw / 2 + 0.3), 4.2, cz + 4.15, 0.6, 0.6, 0.3, c.c2, { glow: 1 });
        }
        for (const ez of [s.z - bl / 2, s.z + bl / 2]) P0.box(s.x, 0.2, ez, bw + 0.2, 0.4, 0.6, shade(c.c, 0.7), { soft: true });
        decal(D, 4, s.x, 0.14, s.z, bw / 2, bl / 2, c.c, c.c2, 1, i);
        // the console: a column, a slanted panel with the screen, a bar along its top, a bow on it
        P0.box(s.x, 0.95, cz + 0.15, bw + 1.4, 1.9, 1.9, shade(c.c, 0.75), { soft: true });
        P0.box(s.x, 1.5, cz + 1.12, bw + 0.2, 0.16, 0.1, c.c2, { glow: 1 });
        for (const sx of [-1, 1]) P0.box(s.x + sx * (bw / 2 + 0.2), 3.5, cz + 0.45, 0.9, 3.6, 0.9, shade(c.c, 0.9), { soft: true, rx: -0.16 });
        const ca = -0.62, cy = 5.7, czc = cz + 0.75, ny = -Math.sin(ca), nz = Math.cos(ca), uy = Math.cos(ca), uz = Math.sin(ca);
        P0.box(s.x, cy, czc, bw + 1.8, 2.2, 0.9, c.c, { soft: true, rx: ca });
        P0.box(s.x, cy + uy * 1.15, czc + uz * 1.15, bw + 2, 0.3, 1, c.c2, { glow: 1, rx: ca });
        P0.box(s.x, cy + uy * 1.15 + 0.3, czc + uz * 1.15 - 0.2, bw + 2.2, 0.35, 1.2, st.snow, { soft: true });
        const sw = 2.9, sh = 0.78, fy = cy + ny * 0.47, fz = czc + nz * 0.47;
        const sidx = decalUp(D, 5, [s.x - sw, fy - uy * sh, fz - uz * sh], [s.x + sw, fy - uy * sh, fz - uz * sh], [s.x + sw, fy + uy * sh, fz + uz * sh], [s.x - sw, fy + uy * sh, fz + uz * sh], shade(c.c, 0.6), c.c2, 1, i);
        const name = signs.add([big('x' + c.mult + ' SPEED', i < 7 ? LIME : PINK, 76, '#10300a', 'bolt'), { t: c.name, c: '#ffffff', s: '#1a1030', px: 38 }], 8.5, new V3(s.x, 9.6, cz), false, 92);
        const lock = signs.add([big(c.gems ? c.gems + ' GEMS' : c.reb + (c.reb > 1 ? ' REBIRTHS' : ' REBIRTH'), RED, 72)], 7, new V3(s.x, 3.4, s.z + 2), false, 70);
        return { name, lock, i, open: null, bIdx: -1, sIdx: sidx };
    });
    // (each belt's 4 vertices come straight after its frame's, in order: find them by kind)
    {
        const kinds = D.d.aK;
        let b = 0;
        for (let v = 0; v < D.n; v += 4) if (kinds[v * 4] === 4) postSigns[b++].bIdx = v;
    }
    // ----- the Gift Boxes: each a big present turning over a snowy stand, its name and price under it -----
    const giftList = JAWBREAKERS.map((J, i) => {
        const s = jbSpot(i), r = 2.1 + i * 0.06;
        stack(S0, s.x, s.z, [[3.4, 0, Wd.wall2], [3.2, 0.8, Wd.wall2], [2.4, 1.2, shade(Wd.wall2, 1.1)], [1.8, 3, shade(Wd.wall2, 1.05)], [2.3, 3.6, Wd.wall2], [2.2, 4.1, Wd.wall2]], 8, () => 0.5);
        P0.box(s.x, 4.2, s.z, 4.2, 0.3, 4.2, st.snow, { soft: true });
        for (let k = 0; k < 6; k++) { const a = k * 1.047 + 0.3; D0.box(s.x + Math.cos(a) * 3.3, 1.0, s.z + Math.sin(a) * 3.3, 0.5, 0.5, 0.5, st.bulbs[k % st.bulbs.length], { glow: 1 }); }
        decal(D, 3, s.x, 0.08, s.z, 5.4, 5.4, J.c2, 0, 1, i % 2);
        signs.add([big(J.name, WHITE, 72, '#1a1030'), big(fmt(J.wins) + ' WINS', GOLD, 64, '#3a1a00', 'crown')], 8.2, new V3(s.x, 4.4 + r * 2.8 + 2.6, s.z), false, 82);
        return { x: s.x, y: 4.35, z: s.z, s: r * 1.15, c1: J.c1, c2: J.c2 };
    });
    const cores = presentMesh(giftList, low, group, true);
    // ----- the Worlds portal and the Avalanche Rush gate: candy-cane arches, a swirl of light in each -----
    const arch = (p, c1, c2, title, sub, g1) => {
        for (const sx of [-1, 1]) {
            for (let j = 0; j < 9; j++) P0.box(p.x + sx * 8, j * 2 + 1, p.z, 2.4, 2.02, 2.4, j % 2 ? 0xffffff : st.cane);
            S0.box(p.x + sx * 8, 0.8, p.z, 3.4, 1.6, 3.4, shade(Wd.wall2, 0.9), { tile: 8 });
            for (let j = 0; j < 4; j++) P0.box(p.x + sx * 8, 3 + j * 4, p.z + 1.25, 0.9, 0.9, 0.1, c1, { glow: 1, rz: Math.PI / 4 });
            fl.push([p.x + sx * 8, 21.4, p.z, 1.4, g1]);
            P0.box(p.x + sx * 8, 20.8, p.z, 2.2, 0.6, 2.2, 0xffd23a, { soft: true });
        }
        S0.box(p.x, 19.2, p.z, 19.6, 2.4, 2.8, Wd.wall2, { tile: 8 });
        P0.box(p.x, 20.7, p.z, 20, 0.7, 3.2, st.snow, { soft: true });
        P0.box(p.x, 19.2, p.z + 1.45, 14, 0.4, 0.1, c1, { glow: 1 });
        portalDecal(D, p.x, 0.3, p.z, 13.6, 17.6, c1, c2);
        signs.add(sub ? [big(title, GOLD, 104, '#3a1a00'), { t: sub, c: '#ffffff', s: '#3a1a00', px: 40 }] : [big(title, AQUA, 118, '#06142a')], 13, new V3(p.x, 24.8, p.z), false, 170);
    };
    arch(worldsPortal, 0x3ab4ff, 0xc8f4ff, 'WORLDS', null, 0x7ae8ff);
    arch(playGate, 0xffffff, 0x8ad8ff, 'AVALANCHE RUSH', 'walk in, or press PLAY', 0xffd23a);
    // ----- the leaderboards -----
    const BA = boardAtlas(), boardG = [];
    const TITLES = ['MOST WINS', 'FASTEST', 'RACES WON'];
    boards.forEach((bd, i) => {
        const side = bd.x !== 0;
        S0.box(bd.x, 7.5, bd.z, side ? 1.6 : 26, 15, side ? 26 : 1.6, Wd.wall2, { tile: 8 });
        S0.box(bd.x, 15.4, bd.z, side ? 2.4 : 27, 0.8, side ? 27 : 2.4, shade(Wd.wall2, 0.85), { tile: 8 });
        P0.box(bd.x, 16.1, bd.z, side ? 2.8 : 27.4, 0.7, side ? 27.4 : 2.8, st.snow, { soft: true });
        for (const s of [-1, 1]) bigCane(P0, bd.x + (side ? 0 : s * 13.4), bd.z + (side ? s * 13.4 : 0), 16, 1.6, st.cane, R);
        const dir = side ? (bd.x < 0 ? 1 : -1) : -1;
        P0.box(bd.x + (side ? dir * 0.85 : 0), 14.4, bd.z + (side ? 0 : dir * 0.85), side ? 0.1 : 23.6, 0.4, side ? 23.6 : 0.1, Wd.trim, { glow: 1 });
        const g = new T.PlaneGeometry(23, 13), uv = g.attributes.uv;
        for (let v = 0; v < uv.count; v++) uv.setX(v, (uv.getX(v) + i) / 3);
        g.rotateY(side ? (bd.x < 0 ? Math.PI / 2 : -Math.PI / 2) : Math.PI);
        g.translate(bd.x + (side ? dir * 0.85 : 0), 7.4, bd.z + (side ? 0 : dir * 0.85));
        boardG.push(g);
        drawBoard(BA, i, TITLES[i], [], Wd);
    });
    const boardMesh = new T.Mesh(mergeG(boardG), new T.MeshBasicMaterial({ map: BA.t, toneMapped: false }));
    for (const g of boardG) g.dispose();
    group.add(boardMesh);
    // ----- what fills the square: Christmas trees, snowmen, presents, lollipops -----
    const spots = [[-68, 50], [68, 50], [-67, 64], [67, 64], [-66, 113], [66, 113], [-14, 113], [14, 113], [-46, 113], [44, 113], [-68, 80], [68, 80]];
    for (const [x, z] of spots) grow(P0, S0, Wd, st, x, z, R, fl, low);
    if (!low) { snowman(D0, -24, 92, 1.2, R, st); presents(D0, 24, 93, R, 5, 1.1); }
    if (id === 'star') for (let i = 0; i < (low ? 8 : 18); i++) rubble(P0, (R() - 0.5) * 170, 24 + R() * 30, 40 + R() * 90, 2 + R() * 3, R, Wd);
    clouds(Wd);
    const farKits = [new Kit({ glow: true }), new Kit({ glow: true }), new Kit({ glow: true }), new Kit({ glow: true })];
    horizon(Wd, farKits, rng(wi * 41 + 5), 260, northEnd - 200, low);
    stretchP.push(...farKits);
    // ----- build it -----
    const decalMat = decalMaterial(Wd, low), decalGeo = D.geometry(), decals = new T.Mesh(decalGeo, decalMat);
    decals.frustumCulled = false; decals.renderOrder = 1;
    group.add(decals);
    for (const f of fl) halo(E, f[0], f[1] + f[3] * 0.7, f[2], f[3] * 2.4, f[4], 1);
    const energyMat = energyMaterial(), energyG = E.geometry(), energy = new T.Mesh(energyG, energyMat);
    energy.frustumCulled = false; energy.renderOrder = 3;
    group.add(energy);
    const flames = flameMesh(fl, st.flame2, group);
    const bladeG = bladeGeo(Wd, BLADE_ARM), bladeM = new T.InstancedMesh(bladeG, bladeMaterial(), Math.max(1, blades.length));
    {
        const o = new T.Object3D();
        blades.forEach((b, i) => { o.position.set(0, BLADE_PIVOT, b.z); o.rotation.set(0, 0, 0); o.updateMatrix(); bladeM.setMatrixAt(i, o.matrix); });
        bladeM.count = blades.length;
        bladeM.instanceMatrix.setUsage(T.DynamicDrawUsage);
        bladeM.frustumCulled = false; bladeM.castShadow = !low; bladeM.receiveShadow = true;
        group.add(bladeM);
    }
    // the sliding gift boxes: one draw, moved every frame near the camera
    const SX = SLIDER.w / 2.04, SY = (SLIDER.h - 1.4) / 1.08, SZ = SLIDER.d / 2.04;
    const slideM = presentMesh(sliders.map((s) => ({ x: 0, y: 0, z: s.z, sx: SX, sy: SY, sz: SZ, c1: s.c1, c2: s.c2 })), low, group, false, Math.max(1, sliders.length));
    slideM.instanceMatrix.setUsage(T.DynamicDrawUsage);
    const jelly = buildJelly(group, domes, { low });
    const stageFx = buildStageFx(group, wi, Wd, st, low);
    buildBlobs(group, () => Math.random());
    const stoneMesh = batchKits(stretchS, stoneMaterial(), true);
    if (stoneMesh) group.add(stoneMesh);
    const propMesh = batchKits(stretchP, propMaterial(), true);
    if (propMesh) group.add(propMesh);
    // (the little things throw no shadow worth drawing twice)
    const detailMesh = batchKits(detail, propMaterial(), false);
    if (detailMesh) group.add(detailMesh);
    signs.build(group);
    // nothing here moves as a whole: its matrices are worked out once, not every frame
    group.traverse((o) => { o.matrixAutoUpdate = false; o.updateMatrix(); });
    group.updateMatrixWorld(true);
    scene.add(group);
    // ----- prompts: the Shoe Shop, the Upgrades, the portal, the race gate, a Gift Box, a treadmill with a price -----
    const PR = [];
    PR.push({ pos: new V3(tongueBar.x, 0, tongueBar.z + 4), r: tongueBar.r, label: () => 'Shoe Shop', act: () => opts.tongues(), zone: 'world' });
    PR.push({ pos: new V3(upgradeShed.x, 0, upgradeShed.z + 4), r: upgradeShed.r, label: () => 'Upgrades', act: () => opts.shed(), zone: 'world' });
    PR.push({ pos: new V3(worldsPortal.x, 0, worldsPortal.z), r: worldsPortal.r, label: () => 'Worlds', act: () => opts.worlds(), zone: 'world' });
    PR.push({ pos: new V3(playGate.x, 0, playGate.z), r: playGate.r, label: () => 'Avalanche Rush', act: () => opts.play(), zone: 'world' });
    JAWBREAKERS.forEach((J, i) => { const s = jbSpot(i); PR.push({ pos: new V3(s.x, 0, s.z), r: JB_R + 2.2, label: () => J.name, act: () => opts.jaw(i), zone: 'world' }); });
    for (const v of postSigns) { const s = postSpot(v.i); if (POSTS[v.i].gems) PR.push({ pos: new V3(s.x, 0, s.z), r: POST_R + 1, label: () => 'Open the ' + POSTS[v.i].name, act: () => opts.post(v.i), zone: 'world', on: () => !v.open }); }
    prompts.length = 0; prompts.push(...PR);
    // ----- what changes -----
    const dOn = decalGeo.attributes.aOn, eOn = energyG.attributes.aOn, padK = new Float32Array(WALLS_N).fill(1);
    const setOn = (attr, from, n, v) => { for (let i = 0; i < n; i++) attr.setX(from + i, v); attr.addUpdateRange(from, n); attr.needsUpdate = true; };
    const bo = new T.Object3D(), bm = new T.Matrix4();
    let gatesOpen = -1;
    const view = {
        T: Tw, w: wi, group, sea, pads, signs, gates, blades: bladeM, cores, jelly, sliders, slideM, stageFx,
        setBoards(m) { drawBoard(BA, 0, TITLES[0], m.wins, Wd); drawBoard(BA, 1, TITLES[1], m.speed, Wd); drawBoard(BA, 2, TITLES[2], m.race, Wd); },
        // what you've got: which treadmills are open (a shut one's belt stands still, its lights red, its price showing)
        setProgress(p, postOpenFn) {
            for (const v of postSigns) {
                const open = !!postOpenFn(p, v.i);
                if (open === v.open) continue;
                v.open = open;
                signs.show(v.lock, !open);
                setOn(dOn, v.bIdx, 4, open ? 1 : 0); setOn(dOn, v.sIdx, 4, open ? 1 : 0);
            }
        },
        // a Win Pad cooling down: grey, its beam dim
        setPad(k, on) {
            const v = on ? 1 : 0, P2 = pads[k];
            if (!P2 || padK[k] === v) return;
            padK[k] = v;
            setOn(dOn, P2.di, 4, v);
            setOn(eOn, P2.bi, BEAM_N, v);
        },
        // the gates your Speed opens (index < open): no curtain; the rest: the curtain of light, the Speed they want in red
        setGates(open) {
            open = Math.max(1, open | 0);
            if (open === gatesOpen) return;
            gatesOpen = open;
            for (const g of gates) {
                if (g.k === 0) continue;
                const locked = g.k >= open;
                if (locked === g.locked) continue;
                g.locked = locked;
                setOn(eOn, g.e, 4, locked ? 1 : 0);
                signs.set(g.needSign, [big(locked ? fmt(g.need) + ' SPEED' : 'OPEN', locked ? RED : LIME, 84, locked ? '#2a0606' : '#0a2a0a', 'bolt')]);
            }
        },
        // every frame: the ornaments and gift boxes near the camera move (the rest stay as they are), the land under the camera
        update(t, camX, camZ, lt) {
            stageFx.update(t, lt ?? t, camZ ?? 0);
            let any = false;
            for (const b of blades) {
                if (Math.abs(b.z - camZ) > 250) continue;
                const s = Math.max(-1, Math.min(1, bladeAt(b.o, t) * (W.halfW - 3) / BLADE_ARM));
                bo.position.set(0, BLADE_PIVOT, b.z); bo.rotation.set(0, 0, Math.asin(s)); bo.updateMatrix();
                bladeM.setMatrixAt(b.i, bm.copy(bo.matrix));
                any = true;
            }
            if (any) bladeM.instanceMatrix.needsUpdate = true;
            any = false;
            for (const s of sliders) {
                if (Math.abs(s.z - camZ) > 260) continue;
                bm.makeScale(SX, SY, SZ).setPosition(sliderAt(s.o, t), 0, s.z);
                slideM.setMatrixAt(s.i, bm);
                any = true;
            }
            if (any) slideM.instanceMatrix.needsUpdate = true;
            if (camX !== undefined) { sea.position.set(camX, -8, camZ); sea.updateMatrix(); }
        },
        dispose() {
            releaseBlobs(group);
            signs.dispose();
            jelly.dispose();
            stageFx.dispose();
            crownG.dispose(); crownMat.dispose(); crowns.dispose();
            cores.geometry.dispose(); cores.material.dispose(); cores.dispose();
            slideM.geometry.dispose(); slideM.material.dispose(); slideM.dispose();
            decalGeo.dispose(); decalMat.dispose();
            energyG.dispose(); energyMat.dispose();
            if (flames) { flames.geometry.dispose(); flames.material.dispose(); flames.dispose(); }
            bladeG.dispose(); bladeM.dispose();
            sea.geometry.dispose(); sea.material.dispose();
            if (stoneMesh) (stoneMesh.isBatchedMesh ? stoneMesh.dispose() : stoneMesh.geometry.dispose());
            if (propMesh) (propMesh.isBatchedMesh ? propMesh.dispose() : propMesh.geometry.dispose());
            if (detailMesh) (detailMesh.isBatchedMesh ? detailMesh.dispose() : detailMesh.geometry.dispose());
            BA.t.dispose(); boardMesh.geometry.dispose(); boardMesh.material.dispose();
            scene.remove(group);
        },
    };
    view.setGates(1);
    return view;
}
// a beam's geometry (a tall open cylinder), and how many vertices it has
let beamGeo = null;
function BEAM_GEO() { if (!beamGeo) beamGeo = new T.CylinderGeometry(1.5, 1.5, 44, 8, 1, true).translate(0, 22, 0); return beamGeo; }
const BEAM_N = (8 + 1) * (1 + 1);
function mergeG(list) {
    const n = list.reduce((a, g) => a + g.attributes.position.count, 0), pos = new Float32Array(n * 3), uv = new Float32Array(n * 2), idx = [];
    let o = 0;
    for (const g of list) { pos.set(g.attributes.position.array, o * 3); uv.set(g.attributes.uv.array, o * 2); for (let i = 0; i < g.index.count; i++) idx.push(o + g.index.getX(i)); o += g.attributes.position.count; }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(pos, 3)); g.setAttribute('uv', new T.BufferAttribute(uv, 2)); g.setIndex(idx);
    g.computeBoundingSphere();
    return g;
}
