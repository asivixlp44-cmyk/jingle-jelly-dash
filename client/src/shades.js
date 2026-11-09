// The Wobblers: what chases you down the Jelly Run. Four kinds, one to each world: a Gumdrop Gobbler of strawberry jelly crusted in
// sugar, a Marmalade Muncher glazed in caramel with a cookie stuck in its head, a frosty Blue Razz Blob under a snowcap and icy
// shards, a Grape Glutton studded with glowing star sprinkles. Each is a body turned round its middle from an outline (a gumdrop, a
// jelly mould, a drop, a ball) with big cartoon eyes, angry brows, a toothy grin, stubby arms and its own hat, all in one geometry
// (one draw, one shadow draw) skinned to a few bones. The body's bone squashes and stretches as it hops (scaled, keeping its
// volume), the top of the jelly wobbles over its foot (its vertices blend from the body's bone to the top's going up), the jaw
// drops, the eyes blink, the arms flail and the hat lags and bonks. Lit (Lambert) and a little self-lit, as jelly glows from inside;
// the gloss is painted: lighter over the top, darker low down, a bright band at the foot where the light comes through, white
// streaks fixed on the body. A glossy puddle of itself underneath, a spatter of jelly each time it lands.
// A boss (the last stage's) is 1.8 times the size and crowned. Normal ones stand 9-11 studs tall (a player is about 5).
import { T, scene } from './engine.js';
import { Kit, glowVCMaterial, nearFadeU, rng } from './geo.js';
import { CU } from './clock.js';
import * as FX from './fx.js';

export const SHADE_KINDS = ['gobbler', 'muncher', 'razz', 'glutton'];
export const SHADE_BOSS_SCALE = 1.8;
let mat = null, puddleMat = null;
// (it dissolves from 24 studs in front of the lens, gone by 11: a Wobbler on your heels sits between the camera and you, and its
// wide body never hides you)
// (from 24 studs in it dissolves, gone by 11: a Wobbler between the camera and you never hides you; the covers set it to 0, 0)
export const SHADE_FADE = { value: new T.Vector2(11, 24) };
const material = () => mat || (mat = nearFadeU(glowVCMaterial(CU.uNow), 'rr-shade', SHADE_FADE));
// the puddle of itself it sits in (unlit): a splat whose lobes wobble, a few drops flung clear, deep in the middle, a bright lip, a
// streak of gloss
function puddleMaterial() {
    if (puddleMat) return puddleMat;
    puddleMat = new T.ShaderMaterial({
        uniforms: { uNow: CU.uNow },
        vertexShader: `attribute vec3 color; varying vec2 vP; varying vec3 vC;
            void main() { vP = position.xz; vC = color; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: `uniform float uNow; varying vec2 vP; varying vec3 vC;
            void main() {
                float r = length(vP), a = atan(vP.y, vP.x);
                float e = r / (0.78 + 0.07 * sin(a * 5.0 + uNow * 2.1) + 0.05 * sin(a * 8.0 - uNow * 2.9 + 1.3) + 0.03 * sin(a * 3.0 + 2.0));
                float d = min(min(length(vP - vec2(0.83, 0.36)) / 0.1, length(vP - vec2(-0.64, -0.64)) / 0.085), min(length(vP - vec2(-0.34, 0.87)) / 0.07, length(vP - vec2(0.47, -0.84)) / 0.06));
                float m = min(e, d);
                if (m > 1.0) discard;
                vec3 c = vC * mix(0.5, 1.0, smoothstep(0.0, 0.9, m));
                c = mix(c, min(vC * 1.6 + 0.1, vec3(1.0)), smoothstep(0.8, 0.95, m));
                float gl = (1.0 - smoothstep(0.025, 0.08, abs(e - 0.64))) * smoothstep(0.35, 0.9, dot(vP / max(r, 0.001), vec2(-0.6, 0.8)));
                c = mix(c, vec3(1.0), gl * 0.8);
                gl_FragColor = vec4(c, 0.9 - 0.45 * smoothstep(0.92, 1.0, m));
                #include <colorspace_fragment>
            }`,
        transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
    return puddleMat;
}

const TAU = Math.PI * 2;
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (a, b, v) => { const x = clamp01((v - a) / (b - a)); return x * x * (3 - 2 * x); };
const V = (x, y, z) => new T.Vector3(x || 0, y || 0, z || 0);
const FWD = V(0, 0, 1), UP = V(0, 1, 0), AX = V(1, 0, 0), AY = V(0, 1, 0), AZ = V(0, 0, 1);

// ----- the rig -----
// root; the body (hops, squashes, leans, its bone at the middle of its foot); the top of the jelly (wobbles over the foot); the eyes
// (blink); the brows; the jaw (drops); the hat (lags and bonks); the arms. PARENT: each one's parent
const BASE = 1, TOP = 2, EYES = 3, BROWS = 4, JAW = 5, HAT = 6, ARM_L = 7, ARM_R = 8;
const PARENT = [-1, 0, 1, 2, 2, 1, 2, 1, 1];
// the bones (up to three) and weights the next vertices are tied to
const W = { i: [BASE, 0, 0], w: [1, 0, 0] };
let bodyH = 10;
// how much of the top's bone a point at height h follows: none at the foot, all of it from the eyes up
const topK = (h) => smooth(0.1, 0.68, h / bodyH);
function rigid(b) { W.i[0] = b; W.w[0] = 1; W.i[1] = 0; W.w[1] = 0; W.i[2] = 0; W.w[2] = 0; }
function onBody(h) { const k = topK(h); W.i[0] = BASE; W.w[0] = 1 - k; W.i[1] = TOP; W.w[1] = k; W.i[2] = 0; W.w[2] = 0; }
// on the body and (j of it) on the jaw: the bottom of the mouth goes down with it, its corners stay
function onJaw(h, j) { const k = topK(h); W.i[0] = BASE; W.w[0] = (1 - k) * (1 - j); W.i[1] = TOP; W.w[1] = k * (1 - j); W.i[2] = JAW; W.w[2] = j; }

// a vertex as it's built: place, normal, colour, glow, bones
class Vt {
    constructor() { this.p = V(); this.n = V(); this.c = new T.Color(); this.g = 0; this.i = [BASE, 0, 0]; this.w = [1, 0, 0]; this.th = 0; this.h = 0; }
    tie() { for (let k = 0; k < 3; k++) { this.i[k] = W.i[k]; this.w[k] = W.w[k]; } return this; }
    copy(o) { this.p.copy(o.p); this.n.copy(o.n); this.c.copy(o.c); this.g = o.g; this.th = o.th; this.h = o.h; for (let k = 0; k < 3; k++) { this.i[k] = o.i[k]; this.w[k] = o.w[k]; } return this; }
}
const _p = V(), _n = V(), _u = V(), _w = V(), _f = V(), _s = V(), _fi = V();
// everything a kind is made of, triangle by triangle (M: where what's added next is placed, e.g. a hat built round its own middle)
class Acc {
    constructor() { this.pos = []; this.nor = []; this.col = []; this.glow = []; this.si = []; this.sw = []; this.M = null; this.NM = new T.Matrix3(); }
    at(m) { this.M = m || null; if (m) this.NM.getNormalMatrix(m); return this; }
    put(v) {
        _p.copy(v.p); _n.copy(v.n);
        if (this.M) { _p.applyMatrix4(this.M); _n.applyMatrix3(this.NM).normalize(); }
        this.pos.push(_p.x, _p.y, _p.z); this.nor.push(_n.x, _n.y, _n.z); this.col.push(v.c.r, v.c.g, v.c.b); this.glow.push(v.g);
        this.si.push(v.i[0], v.i[1], v.i[2], 0); this.sw.push(v.w[0], v.w[1], v.w[2], 0);
    }
    // a triangle, turned to face the way its vertices' normals do (a sliver of nothing is left out)
    tri(a, b, c) {
        _u.subVectors(b.p, a.p); _w.subVectors(c.p, a.p); _f.crossVectors(_u, _w);
        if (_f.lengthSq() < 1e-12) return;
        _s.copy(a.n).add(b.n).add(c.n);
        if (_f.dot(_s) < 0) { this.put(a); this.put(c); this.put(b); } else { this.put(a); this.put(b); this.put(c); }
    }
    get count() { return this.pos.length / 3; }
}
// one flat face through three points, facing away from `inside`
const _fa = new Vt(), _fb = new Vt(), _fc = new Vt();
function flat(acc, a, b, c, color, g, inside) {
    _u.subVectors(b, a); _w.subVectors(c, a); _f.crossVectors(_u, _w);
    if (_f.lengthSq() < 1e-14) return;
    _f.normalize();
    if (_f.dot(_fi.copy(a).add(b).add(c).multiplyScalar(1 / 3).sub(inside)) < 0) _f.negate();
    for (const v of [_fa, _fb, _fc]) { v.n.copy(_f); v.c.set(color); v.g = g; v.tie(); }
    _fa.p.copy(a); _fb.p.copy(b); _fc.p.copy(c);
    acc.tri(_fa, _fb, _fc);
}

// ----- the body: an outline [radius, height] from the rim of its foot to the top of its head, turned round the y axis -----
// mod(θ, h/H): an optional bulge round it. θ 0 is its front (+z), where its face is.
function body(prof, mod) {
    const n = prof.length, H = prof[n - 1][1];
    // (a smooth curve through the points: it leaves the foot toward the next point and comes over the top level)
    const at = (i) => (i < 0 ? [2 * prof[0][0] - prof[1][0], 2 * prof[0][1] - prof[1][1]] : i >= n ? [-prof[n - 2][0], prof[n - 2][1]] : prof[i]);
    const cr = (a, b, c, d, u) => 0.5 * (2 * b + (c - a) * u + (2 * a - 5 * b + 4 * c - d) * u * u + (3 * b - a - 3 * c + d) * u * u * u);
    const R = [], Hh = [];
    for (let i = 0; i < n - 1; i++) {
        const a = at(i - 1), b = at(i), c = at(i + 1), d = at(i + 2);
        for (let s = 0; s < 16; s++) { const u = s / 16; R.push(Math.max(0, cr(a[0], b[0], c[0], d[0], u))); Hh.push(Math.min(H - 1e-4, cr(a[1], b[1], c[1], d[1], u))); }
    }
    R.push(0); Hh.push(H);
    for (let i = 1; i < Hh.length - 1; i++) Hh[i] = Math.max(Hh[i], Hh[i - 1] + 1e-6);
    const m = R.length;
    const rOf = (h) => {
        if (h <= Hh[0]) return R[0];
        if (h >= H) return 0;
        let lo = 0, hi = m - 1;
        while (hi - lo > 1) { const md = (lo + hi) >> 1; if (Hh[md] <= h) lo = md; else hi = md; }
        return R[lo] + (R[hi] - R[lo]) * (h - Hh[lo]) / (Hh[hi] - Hh[lo]);
    };
    const P = (th, h, o) => { const r = rOf(h) * (mod ? mod(th, h / H) : 1); return o.set(r * Math.sin(th), h, r * Math.cos(th)); };
    const a = V(), b = V(), c = V(), d = V();
    const N = (th, h, o) => {
        if (h > H - 2e-3) return o.set(0, 1, 0);
        P(th + 1e-3, h, a); P(th - 1e-3, h, b); a.sub(b);
        P(th, Math.min(H, h + 3e-3), c); P(th, Math.max(0, h - 3e-3), d); c.sub(d);
        o.crossVectors(a, c);
        const l = o.length();
        return l < 1e-10 ? o.set(0, 1, 0) : o.multiplyScalar(1 / l);
    };
    // the surface's own axes at a point: X round it, Y up it, Z out of it
    const frame = (th, h, X, Y, Z) => { N(th, h, Z); P(th + 1e-3, h, a); P(th - 1e-3, h, b); X.subVectors(a, b); X.addScaledVector(Z, -X.dot(Z)).normalize(); Y.crossVectors(Z, X); };
    const L = [0];
    for (let i = 1; i < m; i++) L.push(L[i - 1] + Math.hypot(R[i] - R[i - 1], Hh[i] - Hh[i - 1]));
    // k + 1 rings evenly along the outline, foot to top
    const rings = (k) => {
        const out = [];
        for (let i = 0; i <= k; i++) {
            const l = L[m - 1] * i / k;
            let j = 1;
            while (j < m - 1 && L[j] < l) j++;
            out.push(Hh[j - 1] + (Hh[j] - Hh[j - 1]) * clamp01((l - L[j - 1]) / (L[j] - L[j - 1] || 1)));
        }
        out[0] = 0; out[k] = H;
        return out;
    };
    let rMax = 0;
    for (const r of R) rMax = Math.max(rMax, r);
    return { H, rOf, P, N, frame, rings, rMax };
}
// the jelly's colour up the body: brightest at the foot (the light coming through), darker low down, lighter over the top;
// returns the glow (a little more at the foot)
function jellyPaint(K) {
    const foot = new T.Color(K.foot), deep = new T.Color(K.deep), mid = new T.Color(K.col), top = new T.Color(K.top), g0 = K.glow;
    return (hn, c) => {
        if (hn < 0.13) c.copy(foot).lerp(deep, smooth(0, 0.13, hn));
        else if (hn < 0.52) c.copy(deep).lerp(mid, smooth(0.13, 0.52, hn));
        else c.copy(mid).lerp(top, smooth(0.52, 1, hn));
        return g0 + 0.32 * (1 - smooth(0, 0.15, hn));
    };
}
function bodyMesh(acc, B, cols, nr, paint) {
    const hs = B.rings(nr), G = [];
    for (let i = 0; i <= nr; i++) {
        const row = [];
        for (let j = 0; j <= cols; j++) {
            const th = (j / cols - 0.5) * TAU, h = hs[i], v = new Vt();
            B.P(th, h, v.p); B.N(th, h, v.n); v.g = paint(h / B.H, v.c); onBody(h); v.tie();
            row.push(v);
        }
        G.push(row);
    }
    for (let i = 0; i < nr; i++) for (let j = 0; j < cols; j++) { const a = G[i][j], b = G[i][j + 1], c = G[i + 1][j + 1], d = G[i + 1][j]; acc.tri(a, b, c); acc.tri(a, c, d); }
    // the underside, flat
    onBody(0);
    const mid = new Vt(); mid.n.set(0, -1, 0); mid.g = paint(0, mid.c); mid.tie();
    const rim = G[0].map((v) => { const w = new Vt().copy(v); w.n.set(0, -1, 0); return w; });
    for (let j = 0; j < cols; j++) acc.tri(mid, rim[j], rim[j + 1]);
}
// A patch laid over the body: map(u, v, o) gives the point (o.th, o.h) of each u, v in 0..1; raised off the surface by off; paint(u, v,
// h/H, colour) gives its colour and returns its glow; bind(u, v, h) ties it to the bones. Returns its grid of vertices.
const TH = { th: 0, h: 0 };
function patch(acc, B, nu, nv, map, off, paint, bind) {
    const G = [];
    for (let j = 0; j <= nv; j++) {
        const row = [];
        for (let i = 0; i <= nu; i++) {
            const u = i / nu, v = j / nv, x = new Vt();
            map(u, v, TH);
            x.th = TH.th; x.h = Math.max(0, Math.min(B.H, TH.h));
            B.P(x.th, x.h, x.p); B.N(x.th, x.h, x.n);
            x.p.addScaledVector(x.n, typeof off === 'function' ? off(u, v) : off);
            x.g = paint(u, v, x.h / B.H, x.c);
            bind(u, v, x.h); x.tie();
            row.push(x);
        }
        G.push(row);
    }
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) { const a = G[j][i], b = G[j][i + 1], c = G[j + 1][i + 1], d = G[j + 1][i]; acc.tri(a, b, c); acc.tri(a, c, d); }
    return G;
}
// the edge of a raised layer (snow, caramel) along one row of its patch: a strip down to the body, facing down the slope (k: darker)
function lip(acc, B, row, off, k) {
    const a = V(), b = V(), lo = [], hi = [];
    for (const v of row) {
        B.P(v.th, Math.max(0, v.h - 0.05), a); B.P(v.th, v.h + 0.05, b);
        a.sub(b).normalize().addScaledVector(v.n, 0.35).normalize();
        const x = new Vt().copy(v), y = new Vt().copy(v);
        x.p.addScaledVector(v.n, -off * 1.4);
        x.n.copy(a); y.n.copy(a);
        x.c.multiplyScalar(k); y.c.multiplyScalar(k);
        lo.push(x); hi.push(y);
    }
    for (let i = 0; i < row.length - 1; i++) { acc.tri(lo[i], lo[i + 1], hi[i + 1]); acc.tri(lo[i], hi[i + 1], hi[i]); }
}
// an ellipsoid round o, radii rx, ry, rz along the axes X, Y, Z; paint(sx, sy, sz (its unit sphere), colour, place) returns the glow.
// Tied to the bones W says now.
function ellipsoid(acc, o, rx, ry, rz, X, Y, Z, ws, hs, paint) {
    const G = [];
    for (let j = 0; j <= hs; j++) {
        const la = (j / hs) * Math.PI, sy = Math.cos(la), sr = Math.sin(la), row = [];
        for (let i = 0; i <= ws; i++) {
            const lo = (i / ws) * TAU, sx = sr * Math.sin(lo), sz = sr * Math.cos(lo), v = new Vt();
            v.p.copy(o).addScaledVector(X, sx * rx).addScaledVector(Y, sy * ry).addScaledVector(Z, sz * rz);
            v.n.set(0, 0, 0).addScaledVector(X, sx / rx).addScaledVector(Y, sy / ry).addScaledVector(Z, sz / rz).normalize();
            v.g = paint(sx, sy, sz, v.c, v.p); v.tie();
            row.push(v);
        }
        G.push(row);
    }
    for (let j = 0; j < hs; j++) for (let i = 0; i < ws; i++) { const a = G[j][i], b = G[j][i + 1], c = G[j + 1][i + 1], d = G[j + 1][i]; acc.tri(a, b, c); acc.tri(a, c, d); }
}
const plain = (color, g) => (sx, sy, sz, c) => { c.set(color); return g; };
// a box from the Kit (o.soft: bevelled) centred at p, along the axes o.X, o.Y, o.Z (turned o.rz in its own face, then o.rot), glow o.g
const _m = new T.Matrix4(), _m2 = new T.Matrix4(), _eu = new T.Euler();
function box(acc, p, sx, sy, sz, color, o) {
    o = o || {};
    const k = new Kit({ glow: true });
    let rx = 0, ry = 0, rz = 0;
    if (o.X) {
        _m.makeBasis(o.X, o.Y, o.Z);
        if (o.rz) _m.multiply(_m2.makeRotationZ(o.rz));
        if (o.rot) _m.multiply(_m2.makeRotationFromEuler(o.rot));
        _eu.setFromRotationMatrix(_m, 'XYZ'); rx = _eu.x; ry = _eu.y; rz = _eu.z;
    }
    k.box(p.x, p.y, p.z, sx, sy, sz, color, { soft: !!o.soft, glow: o.g || 0, rx, ry, rz });
    const v = new Vt();
    for (let i = 0; i < k.count; i++) {
        v.p.set(k.pos[i * 3], k.pos[i * 3 + 1], k.pos[i * 3 + 2]); v.n.set(k.nor[i * 3], k.nor[i * 3 + 1], k.nor[i * 3 + 2]);
        v.c.setRGB(k.col[i * 3], k.col[i * 3 + 1], k.col[i * 3 + 2]); v.g = k.glow[i]; v.tie();
        acc.put(v);
    }
}
// two axes square to d (and d)
function axes(d) { const D = d.clone().normalize(), U = (Math.abs(D.y) > 0.9 ? V(1, 0, 0) : V(0, 1, 0)).cross(D).normalize(); return [U, V().crossVectors(D, U), D]; }
// a crystal (or a crown's point): from base along dir, widest a little way up, to a point; flat faces
function spike(acc, base, dir, len, rad, sides, color, g, spin) {
    const [U, Q, D] = axes(dir), mid = base.clone().addScaledVector(D, len * 0.28), tip = base.clone().addScaledVector(D, len), ring = [];
    for (let i = 0; i < sides; i++) { const a = (i / sides) * TAU + (spin || 0); ring.push(mid.clone().addScaledVector(U, Math.cos(a) * rad).addScaledVector(Q, Math.sin(a) * rad)); }
    for (let i = 0; i < sides; i++) { const p = ring[i], q = ring[(i + 1) % sides]; flat(acc, p, q, tip, color, g, mid); flat(acc, p, q, base, color, g, mid); }
}
// a cut jewel round c (an octahedron, flatter along n)
function gem(acc, c, n, s, color, g) {
    const [U, Q, N] = axes(n), P = [c.clone().addScaledVector(U, s), c.clone().addScaledVector(Q, s), c.clone().addScaledVector(U, -s), c.clone().addScaledVector(Q, -s)];
    const f = c.clone().addScaledVector(N, s * 0.75), b = c.clone().addScaledVector(N, -s * 0.5);
    for (let i = 0; i < 4; i++) { flat(acc, P[i], P[(i + 1) % 4], f, color, g, c); flat(acc, P[i], P[(i + 1) % 4], b, color, g, c); }
}
// a five-pointed star on the plane X, Y at o, raised dep along Z (both: a face behind too)
function star(acc, o, X, Y, Z, R1, R2, dep, color, g, both) {
    const pts = [], top = [];
    for (let i = 0; i < 10; i++) {
        const a = Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? R2 : R1, p = o.clone().addScaledVector(X, Math.cos(a) * r).addScaledVector(Y, Math.sin(a) * r);
        pts.push(p); top.push(p.clone().addScaledVector(Z, dep));
    }
    const c = o.clone().addScaledVector(Z, dep * 1.3), inside = o.clone().addScaledVector(Z, dep * 0.4), back = o.clone().addScaledVector(Z, both ? -dep * 0.3 : 0);
    for (let i = 0; i < 10; i++) {
        const j = (i + 1) % 10;
        flat(acc, c, top[i], top[j], color, g, inside);
        flat(acc, pts[i], pts[j], top[j], color, g, inside);
        flat(acc, pts[i], top[j], top[i], color, g, inside);
        if (both) flat(acc, back, pts[i], pts[j], color, g, inside);
    }
}
// a crown's band round the y axis in the hat's own frame: its outer wall flaring out to the top, the inner wall, the rim
function band(acc, y0, h, r, thick, flare, segs, c0, c1, g) {
    const sl = flare / h;
    const ring = (rad, y, nx, ny, col) => {
        const out = [];
        for (let i = 0; i <= segs; i++) { const a = (i / segs) * TAU, v = new Vt(); v.p.set(Math.sin(a) * rad, y, Math.cos(a) * rad); v.n.set(Math.sin(a) * nx, ny, Math.cos(a) * nx).normalize(); v.c.set(col); v.g = g; v.tie(); out.push(v); }
        return out;
    };
    const strip = (A, B) => { for (let i = 0; i < segs; i++) { acc.tri(A[i], A[i + 1], B[i + 1]); acc.tri(A[i], B[i + 1], B[i]); } };
    strip(ring(r, y0, 1, -sl, c0), ring(r + flare, y0 + h, 1, -sl, c1));
    strip(ring(r - thick, y0, -1, sl, c0), ring(r - thick + flare, y0 + h, -1, sl, c1));
    strip(ring(r - thick + flare, y0 + h, 0, 1, c1), ring(r + flare, y0 + h, 0, 1, c1));
}
// a cookie: a disc round the z axis, centred, its edge rounded
function disc(acc, R, d, segs, cFace, cMid, cEdge, g) {
    const ri = R * 0.94;
    for (const s of [-1, 1]) {
        const mid = new Vt(); mid.p.set(0, 0, s * d / 2); mid.n.set(0, 0, s); mid.c.set(cMid); mid.g = g; mid.tie();
        const rim = [];
        for (let i = 0; i <= segs; i++) { const a = (i / segs) * TAU, v = new Vt(); v.p.set(Math.cos(a) * ri, Math.sin(a) * ri, s * d / 2); v.n.set(0, 0, s); v.c.set(cFace); v.g = g; v.tie(); rim.push(v); }
        for (let i = 0; i < segs; i++) acc.tri(mid, rim[i], rim[i + 1]);
    }
    const rows = [[-d / 2, ri, -0.7], [0, R, 0], [d / 2, ri, 0.7]].map(([z, r, nz]) => {
        const out = [];
        for (let i = 0; i <= segs; i++) { const a = (i / segs) * TAU, v = new Vt(); v.p.set(Math.cos(a) * r, Math.sin(a) * r, z); v.n.set(Math.cos(a), Math.sin(a), nz).normalize(); v.c.set(cEdge); v.g = g; v.tie(); out.push(v); }
        return out;
    });
    for (let k = 0; k < 2; k++) for (let i = 0; i < segs; i++) { const A = rows[k], B = rows[k + 1]; acc.tri(A[i], A[i + 1], B[i + 1]); acc.tri(A[i], B[i + 1], B[i]); }
}
const mat4 = (x, y, z, rx, ry, rz, order) => new T.Matrix4().compose(V(x, y, z), new T.Quaternion().setFromEuler(new T.Euler(rx, ry, rz, order || 'XYZ')), V(1, 1, 1));

// ----- the face: eyes, brows, a toothy mouth; stubby arms; streaks of gloss -----
const GREY = new T.Color(0xc4cee4);
// big cartoon eyes looking mostly ahead, black pupils turned a little in and down (at you), white glints; lashes (a queen's)
function eyes(acc, B, E, out) {
    const h = E.hn * B.H, [rx, ry, rz] = E.r, [px, py, pz] = E.p, X = V(), Y = V(), Z = V(), p = V(), cen = V();
    rigid(EYES);
    for (const s of [-1, 1]) {
        const th = s * E.th;
        B.frame(th, h, X, Y, Z);
        const Ze = Z.clone().lerp(FWD, 0.5).normalize(), Xe = V().crossVectors(UP, Ze).normalize(), Ye = V().crossVectors(Ze, Xe);
        const o = B.P(th, h, p).clone().addScaledVector(Ze, rz * 0.15);
        cen.add(o);
        ellipsoid(acc, o, rx, ry, rz, Xe, Ye, Ze, 11, 7, (sx, sy, sz, c) => { c.set(0xffffff).lerp(GREY, smooth(0.1, -1, sy) * 0.6); return 0.55; });
        const gx = -s * 0.2, gy = -0.1, t = 1 / Math.sqrt((gx / rx) ** 2 + (gy / ry) ** 2 + (1 / rz) ** 2);
        const q = V(gx * t, gy * t, t), nq = V(q.x / rx / rx, q.y / ry / ry, q.z / rz / rz).normalize();
        const Zp = V().addScaledVector(Xe, nq.x).addScaledVector(Ye, nq.y).addScaledVector(Ze, nq.z).normalize();
        const pc = o.clone().addScaledVector(Xe, q.x).addScaledVector(Ye, q.y).addScaledVector(Ze, q.z).addScaledVector(Zp, -pz * 0.3);
        const Xp = V().crossVectors(UP, Zp).normalize(), Yp = V().crossVectors(Zp, Xp);
        ellipsoid(acc, pc, px, py, pz, Xp, Yp, Zp, 9, 5, plain(E.pc || 0x16101e, 0));
        ellipsoid(acc, pc.clone().addScaledVector(Xp, -px * 0.36).addScaledVector(Yp, py * 0.4).addScaledVector(Zp, pz * 0.8), px * 0.34, px * 0.34, 0.08, Xp, Yp, Zp, 6, 3, plain(0xffffff, 1));
        ellipsoid(acc, pc.clone().addScaledVector(Xp, px * 0.36).addScaledVector(Yp, -py * 0.38).addScaledVector(Zp, pz * 0.75), px * 0.15, px * 0.15, 0.05, Xp, Yp, Zp, 4, 2, plain(0xffffff, 1));
        if (E.lash) for (let i = 0; i < 3; i++) {
            const a = 0.55 + i * 0.36, d = V().addScaledVector(Xe, s * Math.cos(a)).addScaledVector(Ye, Math.sin(a));
            const lp = o.clone().addScaledVector(Xe, s * Math.cos(a) * rx * 1.02).addScaledVector(Ye, Math.sin(a) * ry * 1.02).addScaledVector(Ze, rz * 0.2).addScaledVector(d, 0.22);
            box(acc, lp, 0.13, 0.6, 0.12, E.lash, { X: Xe, Y: Ye, Z: Ze, rz: Math.atan2(Math.sin(a), s * Math.cos(a)) - Math.PI / 2 });
        }
    }
    out.eyes = cen.multiplyScalar(0.5);
}
// angry brows, thick and low, pressing down on the tops of the eyes, their inner ends down
function brows(acc, B, Bw, E, out) {
    const h = (E.hn + Bw.dy) * B.H + E.r[1] * 0.86, X = V(), Y = V(), Z = V(), p = V(), cen = V();
    rigid(BROWS);
    for (const s of [-1, 1]) {
        const th = s * (E.th + 0.03);
        B.frame(th, h, X, Y, Z);
        const Zb = Z.clone().lerp(FWD, 0.5).normalize(), Xb = V().crossVectors(UP, Zb).normalize(), Yb = V().crossVectors(Zb, Xb);
        B.P(th, h, p).addScaledVector(Zb, E.r[2] * 0.55 + Bw.s[2] * 0.25);
        cen.add(p);
        box(acc, p, Bw.s[0], Bw.s[1], Bw.s[2], Bw.c, { X: Xb, Y: Yb, Z: Zb, rz: s * Bw.tilt, soft: true, g: Bw.g || 0 });
    }
    out.brows = cen.multiplyScalar(0.5);
}
// A big grin: the top lip a smile, the bottom one hanging in a D under it, the inside dark; teeth (or two buck teeth, or icicle
// fangs) along the top, a few along the bottom, a tongue. Its bottom half is tied to the jaw.
function mouth(acc, B, M, out) {
    const H = B.H, w = M.w, X = V(), Y = V(), Z = V(), p = V();
    const up = (th) => (M.hn + M.smile * (th / w) ** 2) * H;
    const low = (th) => up(th) - M.depth * H * Math.pow(Math.max(0, 1 - (th / w) ** 2), 0.6);
    const jk = (u, v) => clamp01(v) * Math.sqrt(Math.max(0, 1 - Math.abs(2 * u - 1) ** 3));
    const cav = new T.Color(M.cav), deep = cav.clone().multiplyScalar(0.35);
    patch(acc, B, 16, 3, (u, v, o) => { const th = (u * 2 - 1) * w; o.th = th; o.h = up(th) + (low(th) - up(th)) * v; }, 0.05,
        (u, v, hn, c) => { c.copy(cav).lerp(deep, Math.sin(Math.PI * u) * Math.sin(Math.PI * Math.min(1, v * 1.3))); return 0; },
        (u, v, h) => onJaw(h, jk(u, v)));
    const teeth = M.teeth || 0xfffaf0;
    const tooth = (u, h, tw, tl, j, soft) => {
        const th = (u * 2 - 1) * w;
        B.frame(th, h, X, Y, Z); B.P(th, h, p).addScaledVector(Z, 0.15);
        onJaw(h, j);
        box(acc, p, tw, tl, 0.32, teeth, { X, Y, Z, soft, g: 0.45 });
    };
    if (M.buck) {
        // two big buck teeth
        for (const s of [-1, 1]) { const u = 0.5 + s * 0.052, h = up(0) - M.buck * 0.5 + 0.12; tooth(u, h, 0.84, M.buck, 0, true); }
    } else {
        for (let i = 0; i < M.up; i++) {
            const u = 0.17 + 0.66 * (i + 0.5) / M.up, th = (u * 2 - 1) * w, mid = 1 - Math.abs(2 * u - 1), tl = M.toothH * (0.72 + 0.32 * mid);
            const tw = B.rOf(up(th)) * 2 * w * 0.66 / M.up * 0.9;
            tooth(u, up(th) - tl * 0.5 + 0.1, tw, tl, 0);
        }
    }
    for (let i = 0; i < M.lo; i++) {
        const u = 0.32 + 0.36 * (i + 0.5) / M.lo, th = (u * 2 - 1) * w, tl = M.toothH * 0.62, tw = B.rOf(low(th)) * 2 * w * 0.36 / M.lo * 0.82;
        tooth(u, low(th) + tl * 0.5 - 0.08, tw, tl, jk(u, 0.96));
    }
    if (M.fangs) for (const s of [-1, 1]) {
        // icicle fangs
        const u = 0.5 + s * 0.17, th = (u * 2 - 1) * w, h = up(th) + 0.05;
        B.frame(th, h, X, Y, Z); B.P(th, h, p).addScaledVector(Z, 0.2);
        onJaw(h, 0);
        spike(acc, p, V().addScaledVector(Y, -1).addScaledVector(Z, 0.12), M.fangs, 0.26, 4, 0xe4faff, 0.55, 0.4);
    }
    // the tongue (lolling out over the chin: a glutton's)
    {
        const u = 0.55, v = M.loll ? 1.0 : 0.72, th = (u * 2 - 1) * w, h0 = up(th) + (low(th) - up(th)) * v, h = h0 - (M.loll ? M.tr[1] * 0.55 : 0);
        B.frame(th, h, X, Y, Z); B.P(th, h, p).addScaledVector(Z, M.loll ? 0.22 : 0.08);
        const tc = new T.Color(M.tongue), td = tc.clone().multiplyScalar(0.62);
        onJaw(h0, jk(u, v));
        const Zt = Z.clone(), Yt = Y.clone(), Xt = X.clone();
        if (M.loll) { Zt.addScaledVector(Y, -0.35).normalize(); Yt.crossVectors(Zt, Xt).normalize(); }
        ellipsoid(acc, p, M.tr[0], M.tr[1], M.tr[2], Xt, Yt, Zt, 8, 5, (sx, sy, sz, c) => { c.copy(tc).lerp(td, smooth(0.3, -0.9, M.loll ? sz : sy) * 0.8); return 0.15; });
        // the line down its middle
        box(acc, p.clone().addScaledVector(Zt, M.tr[2] * 0.95).addScaledVector(Yt, M.loll ? -M.tr[1] * 0.1 : M.tr[1] * 0.1), 0.09, M.tr[1] * (M.loll ? 1.1 : 0.9), 0.06, td, { X: Xt, Y: Yt, Z: Zt });
    }
    const lo0 = low(0);
    out.jaw = B.P(0, lo0, V());
    out.jawOut = B.rOf(Math.max(0, lo0 - 1)) - B.rOf(lo0);
    out.lipUp = up(0);
}
// stubby jelly arms on its sides, hanging down and out, tied to their own bones at the shoulder
function arms(acc, B, A, paint, out) {
    out.arms = [];
    for (const s of [-1, 1]) {
        const th = s * A.th, h = A.hn * B.H, Z = V(), p = V();
        B.N(th, h, Z); B.P(th, h, p);
        const sh = p.clone().addScaledVector(Z, -A.r * 0.5);
        const dir = Z.clone().setY(0).normalize().multiplyScalar(0.72).add(V(0, -0.7, 0.1)).normalize();
        const Ya = dir.clone().negate(), Xa = V().crossVectors(Ya, FWD).normalize(), Za = V().crossVectors(Xa, Ya);
        rigid(s < 0 ? ARM_L : ARM_R);
        ellipsoid(acc, sh.clone().addScaledVector(dir, A.len * 0.44), A.r, A.len * 0.56, A.r * 0.94, Xa, Ya, Za, 9, 6, (sx, sy, sz, c, q) => paint(q.y / B.H + 0.2 + 0.08 * sy, c));
        out.arms.push(sh);
    }
}
// a painted streak of gloss (unlit white) over the body from a to b ([θ, h/H]), thickest in its middle; a dot of light at dot;
// raised off (over a glaze, say)
function gloss(acc, B, a, b, wid, dot, off) {
    const H = B.H, white = (u, v, hn, c) => { c.set(0xffffff); return 1; }, bind = (u, v, h) => onBody(h);
    const rr = Math.max(0.6, B.rOf((a[1] + b[1]) * 0.5 * H)), dx = (b[0] - a[0]) * rr, dy = (b[1] - a[1]) * H, l = Math.hypot(dx, dy) || 1, nx = -dy / l, ny = dx / l;
    off = off || 0.045;
    patch(acc, B, 8, 1, (u, v, o) => {
        const k = (v - 0.5) * wid * (0.12 + 0.88 * Math.sin(Math.PI * u));
        o.h = (a[1] + (b[1] - a[1]) * u) * H + ny * k;
        o.th = a[0] + (b[0] - a[0]) * u + nx * k / Math.max(0.6, B.rOf(o.h));
    }, off, white, bind);
    if (!dot) return;
    const hd = dot[1] * H, rd = wid * 0.42, r2 = Math.max(0.6, B.rOf(hd));
    patch(acc, B, 8, 1, (u, v, o) => { const t = u * TAU; o.th = dot[0] + Math.cos(t) * rd * v / r2; o.h = hd + Math.sin(t) * rd * v; }, off, white, bind);
}
// not over its face (nor its lolling tongue), nor its arms: where the sugar, sprinkles and frost go
const nearFace = (K, th, hn) => (Math.abs(th) < K.mouth.w + 0.3 && hn > K.mouth.hn - K.mouth.depth - (K.mouth.loll ? 0.25 : 0.08) && hn < K.eye.hn + 0.26) || (Math.abs(Math.abs(th) - K.arm.th) < 0.5 && Math.abs(hn - K.arm.hn) < 0.15);
// n things scattered over the body, apart: put(θ, h, X, Y, Z, p, i) for each
function scatter(B, K, R, n, hn0, hn1, gap, put) {
    const done = [], X = V(), Y = V(), Z = V(), p = V();
    for (let tries = 0; done.length < n && tries < 2000; tries++) {
        const th = (R() * 2 - 1) * Math.PI, hn = hn0 + R() * (hn1 - hn0);
        if (nearFace(K, th, hn)) continue;
        const h = hn * B.H;
        B.P(th, h, p);
        if (done.some((q) => q.distanceTo(p) < gap)) continue;
        done.push(p.clone());
        B.frame(th, h, X, Y, Z);
        onBody(h);
        put(th, h, X, Y, Z, p, done.length - 1);
    }
}
// a crown on the hat (built round its own middle, then set on the head, tilted): a band, points (balls or stars on their tips), jewels
function crown(acc, C) {
    acc.at(mat4(0, C.y, 0, C.tilt[0], 0, C.tilt[1]));
    rigid(HAT);
    const r = C.r;
    band(acc, 0, C.h, r + 0.24, 0.24, 0.2, 14, C.gold, C.gold2, 0.22);
    for (let i = 0; i < C.pts; i++) {
        const a = (i / C.pts) * TAU, s = Math.sin(a), c = Math.cos(a), o = V(s, 0, c), rr = r + 0.3;
        const big = C.big && i === 0, len = C.len * (big ? 1.25 : 1), dir = V(s * 0.22, 1, c * 0.22).normalize();
        const base = V(s * rr, C.h - len * 0.28, c * rr), tip = base.clone().addScaledVector(dir, len);
        spike(acc, base, dir, len, 0.4, 4, C.gold, 0.25, a + Math.PI / 4);
        if (C.ball) ellipsoid(acc, tip, 0.26, 0.26, 0.26, AX, AY, AZ, 5, 3, plain(C.gold2, 0.45));
        if (C.star) { const Zs = o.clone(), Xs = V().crossVectors(UP, Zs).normalize(), Ys = V().crossVectors(Zs, Xs), sr = big ? 0.78 : 0.56; star(acc, tip.clone().addScaledVector(dir, sr * 0.4), Xs, Ys, Zs, sr, sr * 0.45, 0.14, C.starC, 1, true); }
        gem(acc, V(s * (r + 0.36), C.h * 0.48, c * (r + 0.36)), o, 0.27, C.gems[i % C.gems.length], 1);
    }
    acc.at(null);
}

// ----- the kinds -----
// sugar crystals all over (some glinting); a gold crown with glowing jewels for the Gobbler King
function gobblerX(acc, B, K, boss) {
    const R = rng(11), e = new T.Euler();
    scatter(B, K, R, 34, 0.05, 0.92, 0.75, (th, h, X, Y, Z, p) => {
        const s = 0.17 + R() * 0.11, glint = R() < 0.3;
        box(acc, p.clone().addScaledVector(Z, 0.03), s, s, s, glint ? 0xffffff : R() < 0.5 ? 0xffeef2 : 0xffc4d2, { X, Y, Z, rot: e.set(R() * 3, R() * 3, R() * 3), g: glint ? 1 : 0.3 });
    });
    if (boss) crown(acc, { y: B.H - 1.0, r: 1.8, h: 1.25, pts: 5, len: 1.8, tilt: [0.06, -0.14], gold: 0xffb81e, gold2: 0xffe680, gems: [0xff2a4a, 0x3ae86a, 0x3aa8ff, 0xff4ad8, 0xffd23a], ball: true });
}
// a caramel glaze over its top running down in drips; a cookie stuck in its head (or the Colossus's chef's hat in a gold crown,
// and a chocolate moustache)
function muncherX(acc, B, K, boss) {
    const H = B.H, c1 = new T.Color(K.glaze), c2 = new T.Color(K.glaze2), X = V(), Y = V(), Z = V(), p = V();
    const lo = (th) => (0.775 + 0.022 * Math.sin(th * 3 + 1) + 0.016 * Math.sin(th * 7 + 2)) * H;
    const paint = (u, v, hn, c) => { c.copy(c2).lerp(c1, smooth(0.72, 1, hn)); return 0.3; }, bind = (u, v, h) => onBody(h);
    const G = patch(acc, B, 22, 3, (u, v, o) => { o.th = (u - 0.5) * TAU; const l = lo(o.th); o.h = l + (H - l) * v * v; }, 0.1, paint, bind);
    lip(acc, B, G[0], 0.1, 0.78);
    for (const [th0, len, wid] of [[1.55, 1.8, 0.78], [2.2, 2.5, 0.84], [2.85, 1.4, 0.72], [3.5, 2.6, 0.86], [4.15, 1.6, 0.74], [4.75, 2.2, 0.8]]) {
        const top = lo(th0) + 0.3, end = top - len;
        patch(acc, B, 2, 3, (u, v, o) => { o.h = top - len * v; o.th = th0 + (u - 0.5) * wid * (1 - 0.18 * v) / B.rOf(o.h); }, 0.095, paint, bind);
        B.frame(th0, end, X, Y, Z); B.P(th0, end, p).addScaledVector(Z, 0.1);
        onBody(end);
        ellipsoid(acc, p, wid * 0.6, wid * 0.66, wid * 0.4, X, Y, Z, 6, 3, (sx, sy, sz, c) => { c.copy(c2).multiplyScalar(0.9 + 0.1 * sy); return 0.3; });
    }
    if (!boss) {
        // the cookie: half sunk in the top of its head, tilted, chocolate chips on both faces
        rigid(HAT);
        acc.at(mat4(0.35, H - 0.15, -0.2, 0.12, 0.55, 0.42, 'YXZ'));
        disc(acc, 1.8, 0.55, 12, 0xe0a458, 0xf2c47a, 0xb87634, 0.12);
        const R = rng(5);
        for (const s of [-1, 1]) for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU + R() * 0.8, r = 0.45 + R() * 0.85; box(acc, V(Math.cos(a) * r, Math.sin(a) * r, s * 0.3), 0.44, 0.34, 0.2, 0x4a220c, { X: AX, Y: AY, Z: AZ, rz: R() * 3 }); }
        acc.at(null);
        return;
    }
    crown(acc, { y: H - 1.05, r: 2.15, h: 1.05, pts: 5, len: 1.3, tilt: [0.04, 0.1], gold: 0xffb81e, gold2: 0xffe680, gems: [0xff3a4a, 0x3ad8ff, 0x46ec50] });
    // the chef's hat rising out of the crown: its band, a puff on top
    acc.at(mat4(0, H - 0.6, 0, 0.04, 0, 0.1));
    rigid(HAT);
    band(acc, 0, 1.75, 1.9, 0.3, 0.18, 12, 0xeae6f0, 0xffffff, 0.3);
    const puff = (sx, sy, sz, c) => { c.set(0xffffff).lerp(GREY, smooth(0.3, -1, sy) * 0.45); return 0.3; };
    for (let i = 0; i < 3; i++) { const a = (i / 3) * TAU + 0.5; ellipsoid(acc, V(Math.sin(a) * 1.05, 2.15, Math.cos(a) * 1.05), 1.2, 0.95, 1.2, AX, AY, AZ, 6, 4, puff); }
    ellipsoid(acc, V(0, 2.7, 0), 1.3, 1.0, 1.3, AX, AY, AZ, 7, 4, puff);
    acc.at(null);
    // the moustache, curled up at its ends, over the grin
    for (const s of [-1, 1]) {
        const th = s * 0.3, h = K.at.lipUp + 0.3;
        B.frame(th, h, X, Y, Z); B.P(th, h, p).addScaledVector(Z, 0.22);
        onBody(h);
        const Xr = X.clone().multiplyScalar(Math.cos(s * 0.16)).addScaledVector(Y, Math.sin(s * 0.16)), Yr = V().crossVectors(Z, Xr);
        ellipsoid(acc, p, 1.0, 0.36, 0.32, Xr, Yr, Z, 7, 4, plain(0x4a2008, 0.05));
        ellipsoid(acc, p.clone().addScaledVector(Xr, s * 0.98).addScaledVector(Yr, 0.2), 0.3, 0.3, 0.28, X, Y, Z, 5, 3, plain(0x4a2008, 0.05));
    }
}
// a snowcap drooping over in lumps, icy shards sticking up out of it, frost speckles; the Frostberry Queen's ice tiara and lashes
function razzX(acc, B, K, boss) {
    const H = B.H, snow = new T.Color(0xf6fcff), snow2 = new T.Color(0xcfe6fa);
    const lo = (th) => (0.705 + 0.02 * Math.sin(th * 3 + 2) - 0.05 * Math.pow(Math.max(0, Math.cos(th * 6 + 0.5)), 3)) * H;
    const G = patch(acc, B, 36, 3, (u, v, o) => { o.th = (u - 0.5) * TAU; const l = lo(o.th); o.h = l + (H - l) * v * v; }, 0.13,
        (u, v, hn, c) => { c.copy(snow2).lerp(snow, smooth(0.66, 0.86, hn)); return 0.35; }, (u, v, h) => onBody(h));
    lip(acc, B, G[0], 0.13, 0.84);
    rigid(HAT);
    for (const [th, lean, len, rad, spin, c] of [[0.5, 0.5, 1.75, 0.42, 0.25, 0xc8f6ff], [2.55, 0.62, 1.6, 0.34, -0.3, 0x8ae6ff], [4.2, 0.55, 1.85, 0.38, 0.4, 0xc8f6ff], [1.5, 0.3, 1.25, 0.3, 0.6, 0x8ae6ff], [5.3, 0.4, 1.3, 0.3, 0.1, 0x8ae6ff]]) {
        spike(acc, V(Math.sin(th) * 0.55, H - 0.6, Math.cos(th) * 0.55), V(Math.sin(th) * lean, 1, Math.cos(th) * lean), len, rad, 5, c, 0.55, spin);
    }
    const R = rng(17);
    scatter(B, K, R, 16, 0.08, 0.64, 1.3, (th, h, X, Y, Z, p) => {
        const s = 0.24 + R() * 0.14;
        box(acc, p.clone().addScaledVector(Z, 0.03), s, s, 0.07, R() < 0.5 ? 0xe6f8ff : 0xb8ecff, { X, Y, Z, rz: Math.PI / 4, g: 0.65 });
    });
    if (!boss) return;
    // the tiara: a band of ice over its brow, five crystals standing up off it, a glowing gem in the middle
    const X = V(), Y = V(), Z = V(), p = V(), hb = 0.8 * H;
    patch(acc, B, 12, 1, (u, v, o) => { o.th = (u - 0.5) * 1.9; o.h = hb + (v - 0.5) * 0.55; }, 0.2, (u, v, hn, c) => { c.set(0xd8f6ff); return 0.5; }, () => rigid(HAT));
    rigid(HAT);
    for (let i = -2; i <= 2; i++) {
        const th = i * 0.36, len = (i === 0 ? 2.5 : 1.85 - Math.abs(i) * 0.25);
        B.frame(th, hb, X, Y, Z); B.P(th, hb + 0.1, p).addScaledVector(Z, 0.14);
        spike(acc, p, V().addScaledVector(Y, 1).addScaledVector(Z, 0.2), len, i === 0 ? 0.42 : 0.34, 4, i % 2 ? 0x7ae8ff : 0xe8fcff, 0.65, 0.78);
    }
    B.frame(0, hb, X, Y, Z); B.P(0, hb, p).addScaledVector(Z, 0.4);
    gem(acc, p, Z, 0.5, 0x5ad8ff, 1);
}
// glowing star sprinkles and a few rods; a grape's stem and leaf on top; the Midnight Monarch's crown of stars
function gluttonX(acc, B, K, boss) {
    const H = B.H, R = rng(23), SC = [0xffe14a, 0xff7ad8, 0x6ae8ff, 0xffffff, 0xffb43a];
    scatter(B, K, R, boss ? 12 : 15, 0.07, 0.9, 1.5, (th, h, X, Y, Z, p, i) => {
        if (i % 4 === 3) { box(acc, p.clone().addScaledVector(Z, 0.06), 0.62, 0.17, 0.17, SC[(i + 2) % SC.length], { X, Y, Z, rz: R() * 3, g: 0.9 }); return; }
        const s = 0.44 + R() * 0.22, a = R() * TAU, Xr = X.clone().multiplyScalar(Math.cos(a)).addScaledVector(Y, Math.sin(a)), Yr = V().crossVectors(Z, Xr);
        star(acc, p, Xr, Yr, Z, s, s * 0.46, 0.1, SC[i % SC.length], 1);
    });
    rigid(HAT);
    // the stem, a little crook at its end, and a vine leaf
    box(acc, V(0.05, H + 0.32, 0), 0.4, 1.1, 0.4, 0x6a5a24, { X: AX, Y: AY, Z: AZ, rz: -0.18, soft: true });
    box(acc, V(0.32, H + 0.98, 0), 0.34, 0.75, 0.34, 0x6a5a24, { X: AX, Y: AY, Z: AZ, rz: -0.9, soft: true });
    if (!boss) {
        const Xl = V(1, 0.32, 0).normalize(), Zl = V(0, 0.45, 1).normalize(), Yl = V().crossVectors(Zl, Xl).normalize(), Zr = V().crossVectors(Xl, Yl);
        const lc = new T.Color(0x3cc84a), ld = new T.Color(0x1e8a30);
        ellipsoid(acc, V(-1.05, H - 0.05, 0.25), 1.25, 0.72, 0.13, Xl, Yl, Zr, 8, 4, (sx, sy, sz, c) => { c.copy(lc).lerp(ld, smooth(-0.2, -1, sx) * 0.6); return 0.12; });
        box(acc, V(-1.0, H + 0.0, 0.25).addScaledVector(Zr, 0.12), 1.7, 0.07, 0.06, 0xa8f088, { X: Xl, Y: Yl, Z: Zr, g: 0.3 });
        return;
    }
    crown(acc, { y: H - 0.75, r: 2.35, h: 1.0, pts: 5, len: 1.35, tilt: [0.05, 0.12], gold: 0xffb81e, gold2: 0xffe680, gems: [0xff4ad8, 0x6ae8ff, 0xffe14a], star: true, starC: 0xffe14a, big: true });
}

// prof: the body's outline [radius, height], foot to top; col/top/deep/foot: the jelly's colour, lighter over the top, darker low down,
// brightest at the foot; glow: how much it glows from inside; drop: its splats; eye/brow/mouth/arm: where the face goes (th: how
// far round from the front, hn: how high, as a share of its height; the brows sit on the eyes); gloss: its painted streaks [from
// [θ, hn], to [θ, hn], width, a dot [θ, hn]], one on the front, one on the back, both on its sunny side; move: its hop (rate, height,
// squash, jiggle)
const KINDS = {
    gobbler: (boss) => ({
        prof: [[4.0, 0], [4.55, 0.4], [4.72, 1.3], [4.6, 2.8], [4.25, 4.3], [3.72, 5.75], [3.0, 7.05], [2.12, 8.15], [1.15, 8.95], [0, 9.35]],
        col: 0xff2d4a, top: 0xffa2b2, deep: 0xb80c2a, foot: 0xff5a6e, glow: 0.18, drop: 0xff4a66, spark: 0xffffff,
        eye: { th: 0.42, hn: 0.6, r: [1.0, 1.15, 0.6], p: [0.56, 0.68, 0.24] },
        brow: { s: [1.85, 0.56, 0.5], tilt: 0.46, dy: 0, c: 0x5a0614 },
        mouth: { w: 1.0, hn: 0.41, smile: 0.075, depth: 0.135, cav: 0x400818, up: 6, lo: 4, toothH: 0.62, tongue: 0xff6a98, tr: [1.15, 0.36, 0.5] },
        arm: { th: 1.42, hn: 0.33, len: 2.6, r: 0.84 },
        gloss: [[[-1.08, 0.79], [-0.42, 0.9], 0.4, [-1.32, 0.68]], [[Math.PI + 0.42, 0.7], [Math.PI + 1.2, 0.8], 0.46, [Math.PI + 1.42, 0.64]]],
        move: { rate: 1, hop: 1, squash: 1, jig: 1 },
        extra: gobblerX,
    }),
    muncher: (boss) => ({
        prof: [[4.3, 0], [4.85, 0.4], [5.02, 1.2], [4.82, 2.3], [4.5, 2.95], [4.56, 3.45], [4.3, 4.6], [3.7, 5.9], [2.95, 6.85], [2.48, 7.3], [2.46, 7.8], [1.7, 8.75], [0.7, 9.25], [0, 9.38]],
        col: boss ? 0xf2a018 : 0xff8418, top: boss ? 0xffe08a : 0xffc070, deep: boss ? 0xb85a06 : 0xcc4206, foot: boss ? 0xffc23a : 0xffa02a, glow: 0.2, drop: boss ? 0xffb43a : 0xff9a2a, spark: 0xffd27a,
        glaze: boss ? 0xb85a10 : 0xd88a2a, glaze2: boss ? 0x8a3e08 : 0xa85a14,
        eye: { th: 0.38, hn: 0.58, r: [0.98, 1.12, 0.58], p: [0.54, 0.66, 0.22] },
        brow: { s: [1.85, 0.6, 0.5], tilt: 0.36, dy: 0, c: 0x5a2006 },
        mouth: { w: 0.95, hn: 0.385, smile: 0.06, depth: 0.12, cav: 0x4a1006, up: 0, lo: 0, toothH: 0.62, buck: 1.05, tongue: 0xff6a7a, tr: [1.05, 0.34, 0.48] },
        arm: { th: 1.42, hn: 0.31, len: 2.5, r: 0.84 },
        gloss: [[[-1.25, 0.83], [-0.45, 0.91], 0.36, null, 0.16], [[-1.4, 0.48], [-1.02, 0.66], 0.4, null], [[Math.PI + 0.42, 0.52], [Math.PI + 1.2, 0.62], 0.46, [Math.PI + 1.42, 0.47]]],
        move: { rate: 0.95, hop: 0.9, squash: 1.12, jig: 1.2 },
        extra: muncherX,
    }),
    razz: (boss) => ({
        prof: [[3.9, 0], [4.5, 0.45], [4.68, 1.5], [4.45, 3.1], [3.85, 4.9], [2.95, 6.6], [2.0, 8.0], [1.12, 9.2], [0.45, 10.0], [0, 10.35]],
        col: 0x2a8cff, top: 0x9ad8ff, deep: 0x0a3cc0, foot: 0x52b4ff, glow: 0.2, drop: 0x5ab0ff, spark: 0xd8f8ff,
        eye: { th: 0.4, hn: 0.5, r: [1.0, 1.18, 0.6], p: [0.56, 0.68, 0.24], lash: boss ? 0x0a1440 : 0 },
        brow: { s: [1.75, 0.52, 0.5], tilt: 0.42, dy: 0, c: 0x0a2470 },
        mouth: { w: 0.95, hn: 0.335, smile: 0.06, depth: 0.12, cav: 0x0a1448, up: 5, lo: 3, toothH: 0.58, fangs: 0.95, tongue: 0x5ae0ff, tr: [1.05, 0.34, 0.46] },
        arm: { th: 1.42, hn: 0.31, len: 2.5, r: 0.8 },
        gloss: [[[-1.42, 0.38], [-1.0, 0.6], 0.42, null], [[Math.PI + 0.42, 0.5], [Math.PI + 1.2, 0.6], 0.46, [Math.PI + 1.42, 0.45]]],
        move: { rate: 1.08, hop: 1.15, squash: 0.85, jig: 0.85 },
        extra: razzX,
    }),
    glutton: (boss) => ({
        prof: [[3.7, 0], [4.65, 0.55], [5.15, 1.8], [5.25, 3.4], [4.95, 5.1], [4.25, 6.55], [3.1, 7.75], [1.7, 8.55], [0.7, 8.85], [0, 8.92]],
        col: boss ? 0x5a34e6 : 0x9a3cff, top: boss ? 0xaaa0ff : 0xd2a2ff, deep: boss ? 0x22107a : 0x4a10a8, foot: boss ? 0x7a62ff : 0xb45cff, glow: 0.26, drop: boss ? 0x8a7aff : 0xb46aff, spark: 0xffe14a,
        eye: { th: 0.32, hn: 0.665, r: [0.95, 1.08, 0.58], p: [0.54, 0.64, 0.22] },
        brow: { s: [1.7, 0.52, 0.5], tilt: 0.44, dy: 0, c: 0x22084a },
        mouth: { w: 1.08, hn: 0.47, smile: 0.06, depth: 0.15, cav: 0x1e0634, up: 7, lo: 5, toothH: 0.58, loll: true, tongue: 0xff5ab0, tr: [0.78, 0.95, 0.32] },
        arm: { th: 1.45, hn: 0.31, len: 2.4, r: 0.88 },
        gloss: [[[-1.45, 0.6], [-1.0, 0.82], 0.46, [-0.66, 0.9]], [[Math.PI + 0.42, 0.72], [Math.PI + 1.2, 0.8], 0.5, [Math.PI + 1.42, 0.66]]],
        move: { rate: 0.86, hop: 0.82, squash: 1.12, jig: 1.12 },
        extra: gluttonX,
    }),
};

// Each kind is one geometry, built once and shared by every Wobbler of the kind (freed with the last one)
const cache = new Map();
function kindGeo(kind, boss) {
    const key = kind + (boss ? '!' : '');
    let e = cache.get(key);
    if (!e) {
        const K = KINDS[kind](boss), B = body(K.prof, K.mod), acc = new Acc(), at = {}, paint = jellyPaint(K);
        bodyH = B.H;
        K.at = at;
        bodyMesh(acc, B, 24, 12, paint);
        eyes(acc, B, K.eye, at);
        brows(acc, B, K.brow, K.eye, at);
        mouth(acc, B, K.mouth, at);
        arms(acc, B, K.arm, paint, at);
        for (const g of K.gloss) gloss(acc, B, g[0], g[1], g[2], g[3], g[4]);
        K.extra(acc, B, K, boss);
        acc.at(null);
        const g = new T.BufferGeometry();
        g.setAttribute('position', new T.Float32BufferAttribute(acc.pos, 3));
        g.setAttribute('normal', new T.Float32BufferAttribute(acc.nor, 3));
        g.setAttribute('color', new T.Float32BufferAttribute(acc.col, 3));
        g.setAttribute('aGlow', new T.Float32BufferAttribute(acc.glow, 1));
        g.setAttribute('skinIndex', new T.Uint16BufferAttribute(acc.si, 4));
        g.setAttribute('skinWeight', new T.Float32BufferAttribute(acc.sw, 4));
        g.computeBoundingBox();
        // the bones' places in the rest pose
        const rest = [[0, 0, 0], [0, 0, 0], [0, 0.42 * B.H, 0], [0, at.eyes.y, at.eyes.z], [0, at.brows.y, at.brows.z], [0, at.jaw.y, at.jaw.z], [0, B.H, 0], at.arms[0].toArray(), at.arms[1].toArray()];
        const puddle = new T.CircleGeometry(1, 32).rotateX(-Math.PI / 2), c = new T.Color(K.drop), col = new Float32Array(puddle.attributes.position.count * 3);
        for (let i = 0; i < col.length; i += 3) { col[i] = c.r; col[i + 1] = c.g; col[i + 2] = c.b; }
        puddle.setAttribute('color', new T.BufferAttribute(col, 3));
        e = { K, H: B.H, rad: B.rMax, rest, jawOut: at.jawOut, g, puddle, refs: 0, key };
        cache.set(key, e);
    }
    e.refs++;
    return e;
}
function release(e) {
    if (--e.refs > 0) return;
    e.g.dispose(); e.puddle.dispose();
    cache.delete(e.key);
}

// ----- one Wobbler -----
const tmp = new T.Vector3();
const GND = 0.3;      // the share of each hop it spends on the ground (landing, crouching to spring)
// kind: 'gobbler' | 'muncher' | 'razz' | 'glutton'; boss: the last stage's, bigger and crowned
export function makeShade(kind, boss) {
    if (!KINDS[kind]) kind = SHADE_KINDS[0];
    const e = kindGeo(kind, boss), K = e.K, mv = K.move, root = new T.Group(), sc = boss ? SHADE_BOSS_SCALE : 1;
    root.scale.setScalar(sc);
    const bones = [];
    for (let i = 0; i < e.rest.length; i++) {
        const b = new T.Bone(), r = e.rest[i], pr = PARENT[i] >= 0 ? e.rest[PARENT[i]] : [0, 0, 0];
        b.position.set(r[0] - pr[0], r[1] - pr[1], r[2] - pr[2]);
        if (PARENT[i] >= 0) bones[PARENT[i]].add(b);
        bones.push(b);
    }
    const [, bBase, bTop, bEyes, bBrows, bJaw, bHat, bArmL, bArmR] = bones;
    const topY = bTop.position.y, eyeP = bEyes.position.clone(), browP = bBrows.position.clone(), jawP = bJaw.position.clone(), hatY = bHat.position.y;
    const mesh = new T.SkinnedMesh(e.g, material());
    mesh.add(bones[0]);
    mesh.updateMatrixWorld(true);
    mesh.bind(new T.Skeleton(bones));
    // a fixed sphere round it in any pose, hopping (nothing re-measures the posed mesh)
    const bb = e.g.boundingBox, cen = bb.getCenter(new T.Vector3());
    cen.y += 2;
    mesh.boundingSphere = new T.Sphere(cen, bb.getSize(new T.Vector3()).length() * 0.6 + 4);
    mesh.boundingBox = bb.clone().expandByScalar(4);
    mesh.castShadow = true; mesh.receiveShadow = false;
    root.add(mesh);
    const puddle = new T.Mesh(e.puddle, puddleMaterial()), pr = e.rad * 1.3;
    puddle.position.y = 0.08 / sc;
    puddle.renderOrder = 2;
    root.add(puddle);
    // the hop: ph its phase (0 lands, GND springs), what was felt last (a landing, a takeoff: how long ago, how hard), the wobble's side
    let ph = 0, hopping = false, amp = 0, landT = 9, landA = 0, upT = 9, upA = 0, side = 1, blinkT = 1 + Math.random() * 3, blinkP = 9, dripT = 0;
    let px = NaN, py = 0, pz = 0, pvy = 0, shown = false, dead = false;
    const seed = Math.random() * 100;
    // it lands: a splat, the jelly flying off its rim, a glint or two (bigger for a boss, and a ring); S.onLand(x, z, how hard) hears
    // of every landing, seen or not (main.js: the jelly's ripple)
    function land(a, x, y, z) {
        landT = 0; landA = Math.min(1.3, a); side = -side;
        if (S.onLand) S.onLand(x, z, a);
        if (!shown) return;
        const r = e.rad * sc * 0.95, n = boss ? 6 : 4, a0 = Math.random() * TAU;
        for (let i = 0; i < n; i++) {
            const ang = a0 + (i / n) * TAU;
            tmp.set(x + Math.cos(ang) * r, y + 0.3, z + Math.sin(ang) * r);
            FX.splash(tmp, K.drop, boss ? 3 : 2, 0.6 + 0.35 * a);
            if (i < (boss ? 2 : 1)) FX.popSpark(tmp.setY(y + 1.2 * sc), K.spark);
        }
        if (boss) FX.ring(tmp.set(x, y, z), K.drop, 11, 0.5);
    }
    const S = {
        root, kind, boss: !!boss, height: bb.max.y * sc,
        // (x, z, a): called on every landing (a: how hard, about 0.5 .. 1.3); main.js sets it
        onLand: null,
        // x, y, z: where its foot is (root.position stays there; the hop is the body's); ry: which way it faces (0: +z, like a
        // character); speed01: 0 standing .. 1 at full chase
        update(dt, t, x, y, z, ry, speed01) {
            dt = dt > 0 ? Math.min(dt, 0.1) : 0;
            const k = clamp01(speed01 || 0);
            // somewhere new (a pooled Wobbler handed to someone else): start afresh
            if (!(Math.abs(x - px) + Math.abs(z - pz) < 40)) { hopping = false; ph = 0; amp = 0; landT = upT = 9; py = y; pvy = 0; }
            const vy = dt > 0 ? (y - py) / dt : pvy;
            // dropped in from above: it splats down
            if (dt > 0 && pvy < -9 && vy > -2) land(1.2, x, y, z);
            px = x; py = y; pz = z; pvy = vy;
            root.position.set(x, y, z);
            root.rotation.y = ry;
            // the hop: on the ground for the first part (the landing's splat, a crouch), then up and over; it finishes its hop
            // before it stands still
            const want = k > 0.05;
            if (want && !hopping) { hopping = true; ph = 0.06; }
            if (hopping) {
                const p0 = ph;
                ph += dt * mv.rate * (1.3 + 0.6 * k) * (boss ? 0.8 : 1);
                if (p0 < GND && ph >= GND) { upT = 0; upA = 0.5 + 0.5 * k; }
                if (ph >= 1) { ph -= 1; land(0.55 + 0.45 * k, x, y, z); if (!want) { hopping = false; ph = 0; } }
            }
            amp += ((hopping ? 1 : 0) - amp) * Math.min(1, dt * 4);
            landT += dt; upT += dt;
            const air = hopping && ph >= GND, u = air ? (ph - GND) / (1 - GND) : 0, q = hopping && !air ? ph / GND : 0;
            const hy = air ? (1.2 + 2.4 * k) * mv.hop * 4 * u * (1 - u) : 0;
            // squash and stretch (keeping its volume): crouched to spring, stretched leaving the ground and coming down, splatted
            // when it lands and wobbling after; breathing when it stands; stretched falling in from above
            let sy = 1;
            if (air) sy += (0.24 * (1 - u) * (1 - u) + 0.13 * u * u * u) * mv.squash * amp;
            else if (hopping) sy -= 0.2 * smooth(0.25, 1, q) * mv.squash * amp;
            const lj = landA * Math.exp(-landT * 5.5) * Math.cos(landT * 25 * mv.jig);
            sy -= 0.3 * lj * mv.squash;
            sy += 0.022 * Math.sin(t * 2.2 + seed) * (1 - 0.7 * amp);
            if (vy < -4) sy += Math.min(0.2, -vy * 0.006);
            sy = Math.max(0.6, Math.min(1.45, sy));
            const sxz = 1 / Math.sqrt(sy);
            // the top of the jelly lurches on as the foot stops, is left behind as it springs, sways when it stands
            const lurch = landA * Math.exp(-landT * 4) * Math.sin(landT * 19 * mv.jig), lag = upA * Math.exp(-upT * 5) * Math.sin(upT * 19);
            const shZ = (0.55 * lurch - 0.38 * lag) * mv.jig + 0.07 * Math.sin(t * 1.7 + seed) * (1 - amp);
            const shX = side * 0.32 * landA * Math.exp(-landT * 3.5) * Math.sin(landT * 15 * mv.jig) * mv.jig + 0.14 * Math.sin(t * 1.3 + seed * 2) * (1 - 0.6 * amp);
            bBase.position.set(0, hy, 0);
            bBase.rotation.set(air ? 0.3 * (2 * u - 1) * Math.sin(Math.PI * u) * amp : 0, 0, 0);
            bBase.scale.set(sxz, sy, sxz);
            bTop.position.set(shX, topY, shZ);
            bTop.rotation.set(shZ * 0.12, 0.12 * Math.sin(t * 0.6 + seed) * (1 - amp), -shX * 0.12);
            // the eyes keep a little of their shape and lag a touch; a blink now and then
            blinkT -= dt; blinkP += dt;
            if (blinkT < 0) { blinkT = 2.2 + Math.random() * 3.5; blinkP = 0; }
            const bl = blinkP < 0.16 ? 1 - 0.9 * Math.sin((blinkP / 0.16) * Math.PI) : 1, ks = Math.pow(sxz, -0.6), ky = Math.pow(sy, -0.6);
            bEyes.position.set(eyeP.x, eyeP.y - 0.14 * lj, eyeP.z);
            bEyes.scale.set(ks, ky * bl, ks);
            bBrows.position.set(browP.x, browP.y + 0.16 * lj - 0.12 * upA * Math.exp(-upT * 6) + 0.05 * Math.sin(t * 2.6 + seed) * (1 - amp), browP.z);
            bBrows.scale.set(ks, ky, ks);
            // the jaw: wide open as it flies, snapping shut to land; panting when it stands
            const open = amp * (air ? smooth(0, 0.28, u) * (1 - smooth(0.7, 0.94, u)) : 0) + (1 - amp) * (0.14 + 0.1 * Math.sin(t * 1.9 + seed));
            bJaw.position.set(jawP.x, jawP.y - open * 1.15, jawP.z + open * 1.15 * Math.max(0, e.jawOut) + open * 0.1);
            // the arms: up and flapping as it flies, flopping down when it lands, reaching for you as it comes
            const raise = 0.25 + amp * (air ? 0.85 * Math.sin(Math.PI * u) + 0.2 * Math.sin(t * 13 + seed) : 0) - 0.55 * lj + 0.1 * Math.sin(t * 1.6 + seed) * (1 - amp);
            const reach = -0.55 * amp * k - 0.15;
            bArmL.rotation.set(reach + 0.08 * Math.sin(t * 2.1), 0, -raise);
            bArmR.rotation.set(reach + 0.08 * Math.sin(t * 2.1 + 1.3), 0, raise + 0.06 * Math.sin(t * 9 + seed) * amp);
            const ka = Math.pow(sxz, -0.5), kay = Math.pow(sy, -0.5);
            bArmL.scale.set(ka, kay, ka); bArmR.scale.set(ka, kay, ka);
            // the hat keeps most of its shape, lags the wobble and bonks on its head when it lands
            const kh = Math.pow(sxz, -0.8), khy = Math.pow(sy, -0.8);
            bHat.position.set(0, hatY + 0.3 * landA * Math.max(0, Math.sin(landT * 13)) * Math.exp(-landT * 6), 0);
            bHat.rotation.set(shZ * 0.16, 0, -shX * 0.2);
            bHat.scale.set(kh, khy, kh);
            // its puddle spreads when it splats, shrinks under it as it flies
            const ps = pr * (air ? 1 - 0.2 * Math.sin(Math.PI * u) * amp : 1) * (1 + 0.3 * Math.max(0, lj));
            puddle.scale.set(ps, 1, ps);
            // drips of jelly off it as it flies
            dripT -= dt;
            if (shown && air && dripT < 0) {
                dripT = 0.1 + Math.random() * 0.09;
                const ang = Math.random() * TAU, rr = Math.random() * e.rad * 0.6 * sc;
                tmp.set(x + Math.cos(ang) * rr, y + (hy + 0.3) * sc, z + Math.sin(ang) * rr);
                FX.splash(tmp, K.drop, 1, 0.1);
            }
        },
        setVisible(on) {
            on = !!on;
            if (on === shown) return;
            shown = on;
            root.visible = on;
            if (on && !root.parent && !dead) scene.add(root); else if (!on && root.parent) scene.remove(root);
        },
        dispose() {
            if (dead) return;
            dead = true;
            if (root.parent) root.parent.remove(root);
            mesh.skeleton.dispose();
            release(e);
        },
    };
    S.update(0, 0, 0, 0, 0, 0, 0);
    S.setVisible(true);
    return S;
}
// one of each kind (and a boss) for the warm-up: their shaders compile at load. Returns them (dispose each when done)
export function warmShades(parent) {
    const out = SHADE_KINDS.map((k, i) => makeShade(k, i === 0));
    out.forEach((s, i) => { s.setVisible(false); s.root.visible = true; s.root.position.set(i * 14, -60, 0); (parent || scene).add(s.root); });
    return out;
}
