// The jelly: the domes of wobbling jelly carpeting the Jelly Run (and patches of Jingle Square, and the race's lanes). Every dome is an
// instance of one of two shapes: a fluted jelly mould close up, a plain low dome further off. The domes are kept in chunks along the
// course; each frame the chunks the camera sees are picked (near ones get the fluted shape, far ones the plain one, the rest none) and
// only when that choice changes are their instances copied into the two meshes: two draws for all the jelly in view.
// The wobble is all in the vertex shader: a dome squashes flat under whoever stands on it (uPress: up to 8 feet or Wobblers) and every
// footstep sends a ripple out that sets the domes round it jiggling and settling (uHit: the last 16 steps, each a time and a strength).
// Lit (Lambert), lighter at the top, a little self-lit so it reads as jelly; its shine is painted on (fixed), not a reflection.
import { T } from './engine.js';
import { CU } from './clock.js';

const PRESS_N = 8, HIT_N = 16;
// shared by every jelly mesh (the world's and a race's): set by main.js every frame
export const jellyU = {
    uPress: { value: Array.from({ length: PRESS_N }, () => new T.Vector4(0, 0, 1, 0)) },
    uHit: { value: Array.from({ length: HIT_N }, () => new T.Vector4(0, 0, -99, 0)) },
};
let hitAt = 0, pressN = 0;
// a footstep (or a landing, or a Wobbler coming down) at x, z: amp 1 a step, more for a landing
export function jellyHit(x, z, amp) { const h = jellyU.uHit.value[hitAt]; h.set(x, z, CU.uNow.value, amp ?? 1); hitAt = (hitAt + 1) % HIT_N; }
// who's standing on the jelly this frame: begin, then press(x, z, radius, strength 0..1) for each (at most 8)
export function jellyPressBegin() { pressN = 0; }
export function jellyPress(x, z, r, k) { if (pressN >= PRESS_N) return; jellyU.uPress.value[pressN++].set(x, z, r, k); }
export function jellyPressEnd() { for (let i = pressN; i < PRESS_N; i++) jellyU.uPress.value[i].w = 0; }

// ----- the shapes: a dome of radius 1, its height about 1 (each instance is scaled); aY: how far up (0 the foot, 1 the top) -----
function domeGeo(seg, flutes, rings) {
    // the profile from the foot up: [radius, height]; the flutes fade out towards the top
    const prof = rings > 2 ? [[1.0, 0], [1.03, 0.24], [0.86, 0.6], [0.48, 0.89], [0, 0.98]] : [[1.0, 0], [0.86, 0.5], [0.45, 0.88], [0, 0.96]];
    const pos = [], ay = [], idx = [], n = prof.length;
    for (let r = 0; r < n; r++) {
        const [rad, y] = prof[r], fl = flutes ? 0.075 * (1 - y) : 0;
        if (rad === 0) { pos.push(0, y, 0); ay.push(y); continue; }
        for (let i = 0; i < seg; i++) {
            const a = i / seg * Math.PI * 2, k = rad * (1 + fl * Math.cos(a * flutes));
            pos.push(Math.cos(a) * k, y, Math.sin(a) * k); ay.push(y);
        }
    }
    for (let r = 0; r < n - 1; r++) {
        const a0 = r * seg, a1 = (r + 1) * seg, top = prof[r + 1][0] === 0;
        for (let i = 0; i < seg; i++) {
            const i1 = (i + 1) % seg;
            if (top) idx.push(a0 + i, a1, a0 + i1);
            else idx.push(a0 + i, a1 + i, a0 + i1, a0 + i1, a1 + i, a1 + i1);
        }
    }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    g.setAttribute('aY', new T.Float32BufferAttribute(ay, 1));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
}

const SQUISH = `
vec3 jIp = instanceMatrix[3].xyz;
float jPress = 0.0;
for (int i = 0; i < ${PRESS_N}; i++) { vec4 P = uPress[i]; if (P.w > 0.0) { float d = length(jIp.xz - P.xy); jPress = max(jPress, P.w * (1.0 - smoothstep(P.z * 0.35, P.z, d))); } }
float jWob = 0.0;
for (int i = 0; i < ${HIT_N}; i++) {
    vec4 H = uHit[i]; float age = uNow - H.z;
    if (age > 0.0 && age < 1.6) {
        float d = length(jIp.xz - H.xy), a2 = age - d * 0.035;
        if (a2 > 0.0) jWob += H.w * (1.0 - smoothstep(1.5, 5.5 + age * 5.0, d)) * exp(-a2 * 4.2) * sin(a2 * 24.0);
    }
}
jWob = clamp(jWob, -1.4, 1.4);
float jIdle = sin(uNow * 2.1 + jIp.x * 0.37 + jIp.z * 0.29) * 0.025;
float jSy = 1.0 - 0.6 * jPress + jWob * 0.2 + jIdle;
float jSx = 1.0 + 0.24 * jPress - jWob * 0.08 - jIdle * 0.5;
`;
const mats = new Map();
function jellyMaterial(key, low) {
    let m = mats.get(key);
    if (m) return m;
    m = new T.MeshLambertMaterial({ color: 0xffffff });
    m.onBeforeCompile = (sh) => {
        sh.uniforms.uNow = CU.uNow; sh.uniforms.uPress = jellyU.uPress; sh.uniforms.uHit = jellyU.uHit;
        sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>
attribute float aY; uniform float uNow; uniform vec4 uPress[${PRESS_N}]; uniform vec4 uHit[${HIT_N}]; varying float vY; varying vec3 vLn;`)
            .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
${SQUISH}
objectNormal = normalize(vec3(objectNormal.x / jSx, objectNormal.y / max(0.2, jSy), objectNormal.z / jSx));
vLn = objectNormal; vY = aY;`)
            .replace('#include <begin_vertex>', `#include <begin_vertex>
transformed.y *= jSy; transformed.xz *= jSx;`);
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
varying float vY; varying vec3 vLn;`)
            .replace('#include <color_fragment>', `#include <color_fragment>
diffuseColor.rgb *= 0.6 + 0.55 * vY;
${low ? '' : 'if (length(vViewPosition) < 7.0) { float dk = 1.0 - smoothstep(3.0, 7.0, length(vViewPosition)); if (mod(floor(gl_FragCoord.x) + floor(gl_FragCoord.y), 2.0) < dk * 2.0) discard; }'}`)
            .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
vec3 jn = normalize(vLn);
float jShine = smoothstep(0.9, 0.975, dot(jn, normalize(vec3(-0.42, 0.78, 0.46)))) + 0.6 * smoothstep(0.965, 0.99, dot(jn, normalize(vec3(0.5, 0.62, 0.6))));
float jRim = 1.0 - clamp(jn.y, 0.0, 1.0);
totalEmissiveRadiance += diffuseColor.rgb * (0.2 + 0.25 * jRim) + vec3(1.0) * jShine * 0.55;`);
    };
    m.customProgramCacheKey = () => 'jj-jelly-' + key;
    mats.set(key, m);
    return m;
}

const tc = new T.Color(), mm = new T.Matrix4(), fr = new T.Frustum(), pm = new T.Matrix4(), sph = new T.Sphere(new T.Vector3(), 1);
// list: [{ x, z, r (radius), c (colour) }]; o: { low, chunk (studs along z), near (studs: fluted shape inside this), far (studs: none
// beyond this), y (the floor) }
export function buildJelly(parent, list, o) {
    o = o || {};
    const low = !!o.low, C = o.chunk || 36, NEAR = o.near ?? (low ? 110 : 170), FAR = o.far ?? (low ? 240 : 380), y0 = o.y || 0;
    const nearG = low ? domeGeo(10, 5, 3) : domeGeo(12, 6, 3), farG = domeGeo(low ? 6 : 7, 0, 2);
    // the chunks: by z (and x for the square's patches), each its instances' matrices and colours ready to copy
    const byKey = new Map();
    for (const d of list) {
        const key = Math.floor(d.z / C) * 1000 + Math.floor((d.x + 500) / (o.chunkX || 1000));
        let ch = byKey.get(key);
        if (!ch) { ch = { items: [], x0: 1e9, x1: -1e9, z0: 1e9, z1: -1e9 }; byKey.set(key, ch); }
        ch.items.push(d);
        ch.x0 = Math.min(ch.x0, d.x - d.r); ch.x1 = Math.max(ch.x1, d.x + d.r); ch.z0 = Math.min(ch.z0, d.z - d.r); ch.z1 = Math.max(ch.z1, d.z + d.r);
    }
    const chunks = [...byKey.values()].map((ch) => {
        const n = ch.items.length, M = new Float32Array(n * 16), Cc = new Float32Array(n * 3);
        ch.items.forEach((d, i) => {
            mm.makeScale(d.r, d.r * (d.h ?? 0.78), d.r).setPosition(d.x, d.y ?? y0, d.z);
            mm.toArray(M, i * 16);
            tc.set(d.c); Cc[i * 3] = tc.r; Cc[i * 3 + 1] = tc.g; Cc[i * 3 + 2] = tc.b;
        });
        const cx = (ch.x0 + ch.x1) / 2, cz = (ch.z0 + ch.z1) / 2;
        return { n, M, C: Cc, c: new T.Vector3(cx, 1, cz), rad: Math.hypot(ch.x1 - ch.x0, ch.z1 - ch.z0) / 2 + 2, state: 0 };
    });
    const total = Math.max(1, list.length);
    const mk = (g, key) => {
        const mesh = new T.InstancedMesh(g, jellyMaterial(key, low), total);
        mesh.setColorAt(0, tc.set(0xffffff));
        mesh.instanceMatrix.setUsage(T.DynamicDrawUsage); mesh.instanceColor.setUsage(T.DynamicDrawUsage);
        mesh.count = 0; mesh.visible = false;
        mesh.frustumCulled = false; mesh.castShadow = false; mesh.receiveShadow = !low;
        mesh.matrixAutoUpdate = false;
        parent.add(mesh);
        return mesh;
    };
    const nearM = mk(nearG, low ? 'nl' : 'n'), farM = mk(farG, low ? 'fl' : 'f');
    let sig = -1;
    const fill = (mesh, want) => {
        let at = 0;
        for (const ch of chunks) if (ch.state === want) { mesh.instanceMatrix.array.set(ch.M, at * 16); mesh.instanceColor.array.set(ch.C, at * 3); at += ch.n; }
        mesh.count = at; mesh.visible = at > 0;
        if (at) {
            mesh.instanceMatrix.clearUpdateRanges(); mesh.instanceMatrix.addUpdateRange(0, at * 16); mesh.instanceMatrix.needsUpdate = true;
            mesh.instanceColor.clearUpdateRanges(); mesh.instanceColor.addUpdateRange(0, at * 3); mesh.instanceColor.needsUpdate = true;
        }
    };
    const J = {
        meshes: [nearM, farM], count: list.length,
        // every frame: which chunks the camera sees, and how close; the meshes are refilled only when that changes
        update(camera, force) {
            camera.updateMatrixWorld();
            fr.setFromProjectionMatrix(pm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
            const cp = camera.position;
            let changed = !!force || sig < 0;
            for (let i = 0; i < chunks.length; i++) {
                const ch = chunks[i], d = ch.c.distanceTo(cp) - ch.rad;
                sph.center.copy(ch.c); sph.radius = ch.rad;
                const st = d > FAR || !fr.intersectsSphere(sph) ? 0 : d < NEAR ? 1 : 2;
                if (st !== ch.state) { ch.state = st; changed = true; }
            }
            if (!changed) return;
            sig = 1;
            fill(nearM, 1); fill(farM, 2);
        },
        // everything near in view (the warm-up: every program drawn once)
        showAll() { for (const ch of chunks) ch.state = 0; if (chunks[0]) chunks[0].state = 1; if (chunks[1]) chunks[1].state = 2; fill(nearM, 1); fill(farM, 2); sig = -1; },
        dispose() {
            for (const m of [nearM, farM]) { if (m.parent) m.parent.remove(m); m.dispose(); }
            nearG.dispose(); farG.dispose();
        },
    };
    return J;
}
