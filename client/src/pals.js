// The pets hopping after everyone: little winter jelly critters. One model with every part on it (ears three ways, a candy horn or
// reindeer antlers, tails, holly-leaf spines with berries), and each instance says which of them it has and in what colours. One draw
// for the whole crowd, the list rewritten once a frame (only the nearest characters get theirs). A jelly body (lighter on top, a
// painted shine), rosy cheeks, and painted eyes that glow (unlit) in their accent colour, a bright spark in each.
import { T, scene, selfLit } from './engine.js';
import { CU } from './clock.js';
import { merge } from './geo.js';
import { palById } from '../../shared/config.js';
import { getQuality } from './fx.js';

const m4 = new T.Matrix4(), q = new T.Quaternion(), vP = new T.Vector3(), vS = new T.Vector3(), UP = new T.Vector3(0, 1, 0), tc = new T.Color();
let mesh = null, aC2 = null, aShape = null, cap = 0, n = 0;
// what each part is (EAR1X / EAR3X: the pointed ears standing out sideways, the long ones swept back, under antlers)
const P = { BODY: 0, BELLY: 1, EYE: 2, DARK: 3, SPARK: 4, EAR1: 5, EAR2: 6, EAR3: 7, HORN1: 8, HORN2: 9, TAIL1: 10, TAIL2: 11, SPIKE: 12, FOOT: 13, SHINE: 14, BERRY: 15, BLUSH: 16, EAR1X: 17, EAR3X: 18 };

// ----- the model (made once) -----
// the body: a ball this size round its middle
const BR = [1, 0.96, 0.95], BC = [0, 1, 0];
// a part's vertices: what they are, and the point they turn about
function tag(g, kind, piv) {
    if (g.index) g = g.toNonIndexed();
    const c = g.attributes.position.count, k = new Float32Array(c).fill(kind), pv = new Float32Array(c * 3);
    for (let i = 0; i < c; i++) { pv[i * 3] = piv[0]; pv[i * 3 + 1] = piv[1]; pv[i * 3 + 2] = piv[2]; }
    g.setAttribute('aK', new T.BufferAttribute(k, 1));
    g.setAttribute('aPiv', new T.BufferAttribute(pv, 3));
    if (g.attributes.uv) g.deleteAttribute('uv');
    return g;
}
// a smooth ball (detail >= 0) or a five-sided cone (detail < 0), scaled s, tipped rot (about x, then z), at `at`
function part(kind, detail, s, at, rot) {
    const g = detail < 0 ? new T.ConeGeometry(1, 2, 5, 1).toNonIndexed() : new T.IcosahedronGeometry(1, detail);
    if (detail >= 0) { const a = g.attributes.position, nn = g.attributes.normal; for (let i = 0; i < a.count; i++) { const l = Math.hypot(a.getX(i), a.getY(i), a.getZ(i)) || 1; nn.setXYZ(i, a.getX(i) / l, a.getY(i) / l, a.getZ(i) / l); } }
    g.scale(s[0], s[1], s[2]);
    if (rot) g.rotateX(rot[0] || 0).rotateZ(rot[1] || 0);
    g.translate(at[0], at[1], at[2]);
    return tag(g, kind, at);
}
// a tapered rod (r0 at a to r1 at b) or, r1 0, a cone pointing from a to b (its base hidden in what it grows from)
function limb(kind, a, b, r0, r1) {
    const d = new T.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]), h = d.length();
    const g = r1 > 0 ? new T.CylinderGeometry(r1, r0, h, 5, 1) : new T.ConeGeometry(r0, h, 5, 1, true);
    g.translate(0, h / 2, 0).applyQuaternion(new T.Quaternion().setFromUnitVectors(UP, d.normalize())).translate(a[0], a[1], a[2]);
    return tag(g, kind, a);
}
// a holly leaf (a flat, pointed diamond) growing from `base`: len long, splayed sideways (about z) then leaned back (about x), its
// face turned to whoever is behind and above (the camera, nearly always)
const TOWARD = new T.Vector3(0, 0.5, -0.87);
function leaf(base, len, splay, lean) {
    const a = new T.Vector3(-Math.sin(splay), Math.cos(splay) * Math.cos(lean), Math.cos(splay) * Math.sin(lean)).normalize();
    const f = TOWARD.clone().addScaledVector(a, -TOWARD.dot(a)).normalize(), w = new T.Vector3().crossVectors(a, f);
    const g = new T.OctahedronGeometry(1, 0).scale(len * 0.42, len / 2, 0.035).translate(0, len / 2, 0);
    g.applyMatrix4(new T.Matrix4().makeBasis(w, a, f).setPosition(base[0], base[1], base[2]));
    return tag(g, P.SPIKE, base);
}
// where the body's surface is in direction d from its middle, and which way it faces there
function onBody(d) {
    const v = new T.Vector3(d[0], d[1], d[2]).normalize();
    return { p: [v.x * BR[0] + BC[0], v.y * BR[1] + BC[1], v.z * BR[2] + BC[2]], n: [v.x / BR[0], v.y / BR[1], v.z / BR[2]] };
}
// a flat disc painted on a surface (an eye, a cheek, the shine): w x h, `segs` sides, lifted off it a little, turned `spin` in its
// own plane and nudged (ox, oy) along it; lit like the ball under it
function decal(kind, at, w, h, segs, lift, spin, ox, oy) {
    const nn = new T.Vector3(at.n[0], at.n[1], at.n[2]).normalize(), x = new T.Vector3().crossVectors(UP, nn).normalize(), y = new T.Vector3().crossVectors(nn, x);
    const g = new T.CircleGeometry(1, segs).scale(w, h, 1).rotateZ(spin || 0).translate(ox || 0, oy || 0, 0);
    const o = new T.Vector3(at.p[0], at.p[1], at.p[2]).addScaledVector(nn, lift);
    g.applyMatrix4(new T.Matrix4().makeBasis(x, y, nn).setPosition(o));
    const a = g.attributes.position, nr = g.attributes.normal;
    for (let i = 0; i < a.count; i++) { const dx = a.getX(i) - BC[0], dy = a.getY(i) - BC[1], dz = a.getZ(i) - BC[2], l = Math.hypot(dx, dy, dz) || 1; nr.setXYZ(i, dx / l, dy / l, dz / l); }
    return tag(g, kind, at.p);
}
// the point on the body straight up its back at angle `phi` from the top, sunk in a little, and how far it leans back there
function onBack(phi) {
    const c = Math.cos(phi), s = Math.sin(phi), nl = Math.hypot(c / BR[1], s / BR[2]);
    return [[0, BC[1] + c * BR[1] - 0.05 * c / BR[1] / nl, -s * BR[2] + 0.05 * s / BR[2] / nl], -Math.atan2(s / BR[2], c / BR[1])];
}
function palGeo(low) {
    const L = [
        part(P.BODY, low ? 1 : 2, BR, BC),
        part(P.BELLY, 1, [0.62, 0.56, 0.4], [0, 0.7, 0.6]),
        part(P.FOOT, 0, [0.34, 0.2, 0.42], [-0.48, 0.14, 0.34]), part(P.FOOT, 0, [0.34, 0.2, 0.42], [0.48, 0.14, 0.34]),
        // a little mouth on the belly, a shine up on the body
        decal(P.DARK, { p: [0, 0.88, 0.979], n: [0, 0.235, 0.972] }, 0.085, 0.055, 8, 0.01),
        decal(P.SHINE, onBody([-0.42, 0.78, 0.46]), 0.24, 0.1, 10, 0.014, 0.55),
        decal(P.SHINE, onBody([-0.66, 0.46, 0.6]), 0.05, 0.05, 6, 0.014),
        part(P.HORN1, -1, [0.14, 0.36, 0.14], [0, 2.14, 0.22], [0.25, 0]),
        part(P.TAIL1, 0, [0.28, 0.28, 0.28], [0, 0.84, -1]),
        part(P.TAIL2, 0, [0.17, 0.17, 0.72], [0, 1, -1.38], [-0.5, 0]),
    ];
    for (const sx of [-1, 1]) {
        // eyes: dark, lit in the accent colour low down, a spark up to one side and a little one below (the same side on both)
        const e = onBody([sx * 0.37, 0.14, 0.92]);
        L.push(decal(P.DARK, e, 0.2, 0.235, 12, 0.016), decal(P.EYE, e, 0.13, 0.12, 12, 0.024, 0, 0, -0.075),
            decal(P.SPARK, e, 0.068, 0.068, 6, 0.032, 0, 0.055, 0.07), decal(P.SPARK, e, 0.034, 0.034, 6, 0.032, 0, -0.065, -0.085),
            decal(P.BLUSH, onBody([sx * 0.62, -0.06, 0.78]), 0.15, 0.085, 8, 0.012));
        // ears: pointed, floppy, long; under antlers the pointed ones stand out sideways and the long ones sweep back
        L.push(part(P.EAR1, -1, [0.28, 0.32, 0.18], [sx * 0.62, 1.84, 0], [0, -sx * 0.32]),
            part(P.EAR1X, -1, [0.22, 0.28, 0.13], [sx * 0.98, 1.6, 0.02], [0, -sx * 1.15]),
            part(P.EAR2, 0, [0.28, 0.5, 0.22], [sx * 0.98, 1.3, 0], [0, sx * 0.3]),
            part(P.EAR3, 0, [0.2, 0.68, 0.16], [sx * 0.42, 2.34, -0.06], [0, -sx * 0.14]),
            part(P.EAR3X, 0, [0.18, 0.62, 0.14], [sx * 0.52, 2.02, -0.52], [-1, -sx * 0.5]));
        // reindeer antlers: a beam up and out from the top of the head, a tine forward from low on it, two at the top
        const X = (p) => [sx * p[0], p[1], p[2]], A = X([0.28, 1.8, -0.06]), B = X([0.64, 2.62, -0.26]);
        L.push(limb(P.HORN2, A, B, 0.085, 0.062), limb(P.HORN2, X([0.41, 2.1, -0.13]), X([0.46, 2.42, 0.13]), 0.055, 0),
            limb(P.HORN2, B, X([0.6, 2.98, -0.15]), 0.058, 0), limb(P.HORN2, B, X([0.95, 2.8, -0.3]), 0.058, 0));
    }
    // holly-leaf spines down the back, in pairs, with three berries at the top pair
    [[0.38, 0.48, 0.75], [0.96, 0.42, 0.62], [1.5, 0.36, 0.5]].forEach(([phi, len, splay], i) => {
        const [at, lean] = onBack(phi);
        L.push(leaf(at, len, splay, lean), leaf(at, len, -splay, lean));
        if (!i) for (const b of [[-0.085, 0.1, 0.08], [0.085, 0.1, 0.08], [0, 0.18, 0.02]]) L.push(part(P.BERRY, 0, [0.085, 0.085, 0.085], [at[0] + b[0], at[1] + b[1], at[2] + b[2]]));
    });
    return merge(L);
}
function palMaterial() {
    const m = new T.MeshLambertMaterial({ color: 0xffffff });
    m.onBeforeCompile = (sh) => {
        sh.uniforms.uNow = CU.uNow;
        sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>
attribute float aK; attribute vec3 aPiv; attribute vec3 aC2; attribute vec4 aShape; uniform float uNow; varying vec3 vPC; varying float vGl; varying float vSt;`)
            .replace('#include <begin_vertex>', `#include <begin_vertex>
{
    float k = aK, on = 1.0, ear = aShape.x, antl = step(1.5, aShape.y), spk = fract(aShape.z * 10.0 + 0.01) > 0.5 ? 1.0 : 0.0;
    vec3 c = instanceColor;
    vGl = 0.0; vSt = -1.0;
    // its parts: what this one has. The body is jelly: deeper underneath, lighter on top
    if (k < 0.5) { c *= 0.8 + 0.2 * smoothstep(0.1, 1.2, position.y); c = mix(c, vec3(1.0), 0.16 * smoothstep(1.2, 1.96, position.y)); }
    else if (k < 1.5) c = mix(aC2, vec3(1.0), 0.12);
    else if (k < 2.5) { c = mix(aC2, vec3(1.0), 0.2) * (0.9 + 0.15 * sin(uNow * 3.0 + aShape.w)); vGl = 1.0; }
    else if (k < 3.5) { c = vec3(0.012, 0.01, 0.03); vGl = 1.0; }
    else if (k < 4.5) { c = vec3(1.0); vGl = 1.0; }
    else if (k < 5.5) { on = step(0.5, ear) * step(ear, 1.5) * (1.0 - antl); c = mix(c, aC2, 0.75 * smoothstep(0.3, 0.85, objectNormal.z)); }
    else if (k < 6.5) { on = step(1.5, ear) * step(ear, 2.5); c = aC2; }
    else if (k < 7.5) { on = step(2.5, ear) * (1.0 - antl); c = mix(c, aC2, 0.7 * smoothstep(0.4, 0.9, objectNormal.z)); }
    else if (k < 8.5) { on = step(0.5, aShape.y) * (1.0 - antl); c = aC2; vSt = position.y * 7.0 + position.x * 3.0; }
    else if (k < 9.5) { on = antl; c = aC2 * (0.78 + 0.22 * smoothstep(1.8, 2.9, position.y)); }
    else if (k < 10.5) { on = step(0.5, aShape.z) * step(aShape.z, 1.5); c = aC2; }
    else if (k < 11.5) { on = step(1.5, aShape.z); transformed.x += sin(uNow * 7.0 + aShape.w) * 0.22 * (aPiv.z - position.z + 0.6); }
    else if (k < 12.5) { on = spk; c = aC2; }
    else if (k < 13.5) c = instanceColor * 0.72;
    else if (k < 14.5) { c = mix(instanceColor, vec3(1.0), 0.85); vGl = 1.0; }
    else if (k < 15.5) { on = spk; c = vec3(0.86, 0.02, 0.05); }
    else if (k < 16.5) c = mix(instanceColor, vec3(1.0, 0.25, 0.4), 0.55);
    else if (k < 17.5) { on = step(0.5, ear) * step(ear, 1.5) * antl; c = mix(c, aC2, 0.75 * smoothstep(0.3, 0.85, objectNormal.z)); }
    else { on = step(2.5, ear) * antl; c = mix(c, aC2, 0.6 * smoothstep(0.3, 0.9, objectNormal.y)); }
    if (on < 0.5) transformed = vec3(0.0, -4000.0, 0.0);
    vPC = c;
}`);
        // (a candy horn's red stripes, drawn per pixel)
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vPC; varying float vGl; varying float vSt;')
            .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb = vSt > 0.0 ? mix(vPC, vec3(0.9, 0.03, 0.07), step(0.5, fract(vSt))) : vPC;')
            .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vPC * vGl * 1.1; diffuseColor.rgb *= 1.0 - vGl;');
    };
    m.customProgramCacheKey = () => 'jjd-pal';
    return selfLit(m);
}
function build() {
    if (mesh) return;
    const low = getQuality() === 'low';
    cap = low ? 16 : 34;
    const g = palGeo(low);
    aC2 = new T.InstancedBufferAttribute(new Float32Array(cap * 3), 3).setUsage(T.DynamicDrawUsage);
    aShape = new T.InstancedBufferAttribute(new Float32Array(cap * 4), 4).setUsage(T.DynamicDrawUsage);
    g.setAttribute('aC2', aC2); g.setAttribute('aShape', aShape);
    mesh = new T.InstancedMesh(g, palMaterial(), cap);
    mesh.setColorAt(0, tc.set(0xffffff));
    mesh.instanceColor.setUsage(T.DynamicDrawUsage);
    mesh.frustumCulled = false; mesh.castShadow = false; mesh.receiveShadow = false; mesh.count = 0;
    scene.add(mesh);
}
export function beginPals() { build(); n = 0; }
// a pet at (x, y, z), facing ry, squashed s (1 is round), size k
export function addPal(id, x, y, z, ry, s, k) {
    const a = palById[id];
    if (!a || n >= cap) return;
    const sz = (k || 1) * (0.72 + a.tier * 0.05);
    q.setFromAxisAngle(UP, ry);
    mesh.setMatrixAt(n, m4.compose(vP.set(x, y, z), q, vS.set(sz * (2 - s), sz * s, sz * (2 - s))));
    mesh.setColorAt(n, tc.set(a.c1));
    tc.set(a.c2); aC2.setXYZ(n, tc.r, tc.g, tc.b);
    // (the spike's in the tail's number: a tenth for yes)
    aShape.setXYZW(n, a.ear, a.horn, a.tail + (a.spike ? 0.06 : 0), a.tier * 1.3 + a.jb);
    n++;
}
export function endPals() {
    if (!mesh) return;
    mesh.count = n; mesh.visible = n > 0;
    if (n) { mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor.needsUpdate = true; aC2.needsUpdate = true; aShape.needsUpdate = true; }
}
export function palsWarm() { build(); n = 0; mesh.count = 1; mesh.setMatrixAt(0, m4.makeTranslation(0, -80, 0)); mesh.setColorAt(0, tc.set(0xffffff)); mesh.visible = true; mesh.instanceMatrix.needsUpdate = true; }

// A team following its owner: a state per pet, hopping along behind in a line
export class Team {
    constructor() { this.ids = []; this.key = ''; this.st = []; }
    set(csv) {
        if (csv === this.key) return;
        this.key = csv;
        this.ids = csv ? csv.split(',').filter((id) => palById[id]).slice(0, 6) : [];
        while (this.st.length < this.ids.length) this.st.push({ x: 1e9, z: 0, h: 0, vy: 0, ry: 0, s: 1, sv: 0, p: Math.random() * 6, lick: 0 });
    }
    get size() { return this.ids.length; }
    // lick (anything truthy: a step landed, a Mega Squish): they get excited, a hop on the spot
    update(dt, t, x, y, z, ry, lick) {
        const ids = this.ids;
        for (let i = 0; i < ids.length; i++) {
            const S = this.st[i], side = i % 2 ? 1 : -1, back = 3.8 + Math.floor(i / 2) * 2.4;
            const tx = x - Math.sin(ry) * back + Math.cos(ry) * side * 2.3, tz = z - Math.cos(ry) * back - Math.sin(ry) * side * 2.3;
            if (S.x > 1e8 || (S.x - tx) ** 2 + (S.z - tz) ** 2 > 3600) { S.x = tx; S.z = tz; S.h = 0; S.vy = 0; }
            const dx = tx - S.x, dz = tz - S.z, d = Math.hypot(dx, dz), moving = d > 1.2, sp = Math.min(46, d * 7);
            if (moving) { S.x += dx / d * sp * dt; S.z += dz / d * sp * dt; S.ry = Math.atan2(dx, dz); } else {
                // standing still: facing the same way as you
                let dr = (ry - S.ry) % 6.2832; if (dr > 3.1416) dr -= 6.2832; if (dr < -3.1416) dr += 6.2832;
                S.ry += dr * Math.min(1, dt * 3);
            }
            // hopping along when there's ground to cover, a little bounce on the spot now and then, and when they're excited
            S.vy -= 70 * dt; S.h += S.vy * dt;
            if (S.h <= 0) { if (S.vy < -3) S.sv = -3.4; S.h = 0; S.vy = moving ? 15 : (lick || Math.sin(t * 0.8 + S.p) > 0.985) ? 9 : 0; }
            S.sv += (((1 - S.s) * 120) - S.sv * 11) * dt; S.s = Math.max(0.65, Math.min(1.3, S.s + S.sv * dt));
            addPal(ids[i], S.x, y + S.h + 0.05, S.z, S.ry, S.s);
        }
    }
}
