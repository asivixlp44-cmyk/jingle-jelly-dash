// Avalanche Rush on screen: six lanes side by side down a candy hall of the world's own colours, each lane railed in its racer's colour
// and carpeted in jelly, the same things in every lane (syrup pools, candy bars, candy canes, ornaments swinging across, gift boxes
// sliding across, boost chevrons), a portal at the end. Behind the start line the avalanche: a towering wall of churning snow, snowballs
// tumbling off its top, spray running ahead along the floor, coming on faster and faster.
import { T, V3, scene } from './engine.js';
import { Kit, batchKits, rng } from './geo.js';
import { buildBlobs, releaseBlobs } from './blobs.js';
import { Signs, big, GOLD, AQUA } from './signs.js';
import { CU } from './clock.js';
import {
    horizon, clouds, stoneMaterial, propMaterial, seaMaterial, decalQuads, energyQuads, decal, energyQuad, halo, decalMaterial, energyMaterial,
    flameMesh, bladeGeo, bladeMaterial, wallRun, styleOf, lookOf, floorQuad, shade, mixC, presentMesh,
} from './world.js';
import { buildJelly } from './jelly.js';
import { CFG } from '../../shared/config.js';
import { ARENA, laneX, caneAt, laneBoxAt, LANE_BOX } from '../../shared/arena.js';

const SPOTS = CFG.matchSpots;
// a blade over a lane: its pivot's height and the arm down to its head (the head's x is caneAt * ARENA.hw from the lane's middle)
export const LANE_BLADE = { pivot: 10.6, arm: 8.6 };
// a boost pad's half size (x across, z along), round its x in the lane
export const LANE_BOOST = { hw: 3, hd: 3.2 };

// the avalanche: a wall of churning snow the width of the hall, spray reaching ahead along the floor, snowballs tumbling over its top;
// the snow goes on behind it
function surgeMesh(Wd, width) {
    const g = new T.PlaneGeometry(width, 52, 48, 24).translate(0, 26, 0).rotateY(Math.PI);
    const front = new T.Mesh(g, new T.ShaderMaterial({
        uniforms: { uNow: CU.uNow, uGlow: { value: new T.Color(Wd.glow) }, uGlow2: { value: new T.Color(Wd.hazard2) } },
        vertexShader: `uniform float uNow; varying vec2 vP; varying float vReach;
            void main() {
                vec3 p = position; float t = uNow;
                float n = sin(p.x * 0.23 + t * 1.7) * sin(p.y * 0.17 - t * 1.3) + 0.6 * sin(p.x * 0.07 - t * 0.9 + p.y * 0.05);
                // spray running ahead low down, the top curling over toward you like a wave of snow
                float low = 1.0 - smoothstep(0.0, 12.0, p.y);
                float reach = max(0.0, sin(p.x * 0.3 + sin(p.x * 0.11 + t) * 2.0 + t * 2.6)) * low * 6.0 + smoothstep(28.0, 52.0, p.y) * 8.0 + n * 2.4;
                p.z -= reach;
                vReach = reach; vP = p.xy;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
            }`,
        fragmentShader: `uniform float uNow; uniform vec3 uGlow; uniform vec3 uGlow2; varying vec2 vP; varying float vReach;
            float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
            void main() {
                float t = uNow;
                float top = 46.0 + 4.0 * sin(vP.x * 0.21 + t * 1.6) + 2.5 * sin(vP.x * 0.53 - t * 2.4);
                // snowballs bulging off the top edge
                float cell = floor(vP.x / 6.0);
                vec2 bc = vec2(cell * 6.0 + 3.0, top - 1.0 + 2.5 * sin(cell * 1.7 + t * 3.0));
                float ball = 1.0 - smoothstep(2.6, 3.0, length(vP - bc));
                if (vP.y > top && ball < 0.5) discard;
                // churning snow: soft folds of blue shadow, bright tumbling clumps, sparkles
                float sw = 0.5 + 0.5 * sin(vP.x * 0.12 + vP.y * 0.16 + sin(vP.y * 0.1 - t) * 3.0 - t * 2.4);
                float sw2 = 0.5 + 0.5 * sin(vP.x * 0.31 - vP.y * 0.27 + t * 3.1);
                vec2 cl = vP * 0.22 + vec2(0.0, t * 2.2);
                float clump = smoothstep(0.55, 0.85, 0.5 + 0.5 * sin(cl.x * 2.1 + sin(cl.y * 1.7) * 2.0) * sin(cl.y * 1.9));
                vec3 c = mix(vec3(0.62, 0.76, 0.95), vec3(0.94, 0.97, 1.0), clamp(sw * 0.6 + sw2 * 0.25 + clump * 0.4, 0.0, 1.0));
                c = mix(c, vec3(1.0), ball * 0.8);
                vec2 sp = floor(vP * 1.3 + vec2(0.0, t * 6.0));
                c += vec3(1.0) * step(0.97, hash(sp)) * 0.35;
                float edge = smoothstep(top - 4.0, top, vP.y) + smoothstep(4.0, 7.0, vReach) * 0.6;
                c = mix(c, mix(uGlow, vec3(1.0), 0.6), clamp(edge, 0.0, 1.0) * 0.45);
                // seen from inside (the snow has the camera, at the start line on a tall screen): a thin white veil, not a wall
                gl_FragColor = gl_FrontFacing ? vec4(c, 0.96) : vec4(c, 0.2);
                #include <colorspace_fragment>
            }`,
        transparent: true, depthWrite: false, side: T.DoubleSide,
    }));
    front.renderOrder = 4;
    const bodyG = new T.BoxGeometry(width, 50, 160).translate(0, 25, 88);
    const body = new T.Mesh(bodyG, new T.MeshBasicMaterial({ color: 0xdceafa, fog: false }));
    const grp = new T.Group();
    grp.add(front, body);
    grp.userData.parts = [front, body];
    return grp;
}

export function buildArena(plan, w, spotsCol, low, mySpot) {
    const Wd = lookOf(w), st = styleOf(Wd), R = rng(w * 53 + 3), group = new T.Group(), signs = new Signs(4, 448, 152);
    const fl = [], ctx = { Wd, st, R, low, fl }, D = decalQuads(), E = energyQuads();
    const S0 = new Kit(), P0 = new Kit({ glow: true }), kits = [S0], propKits = [P0];
    const L2 = ARENA.laneW / 2, hwAll = SPOTS * L2, XA = hwAll + 0.6, back = 36, end = plan.finish - 16;
    const sea = new T.Mesh(new T.PlaneGeometry(3000, 3000).rotateX(-Math.PI / 2), seaMaterial(Wd, low));
    sea.position.set(0, -8, (back + end) / 2);
    group.add(sea);
    // stretches of the hall, each its own kit (culled on its own)
    const SEG = 120, stretches = [];
    for (let z = back; z > end; z -= SEG) { const S = new Kit(), P = new Kit({ glow: true }); stretches.push({ z1: z, z0: Math.max(end, z - SEG), S, P }); kits.push(S); propKits.push(P); }
    const at = (z) => stretches.find((s) => z <= s.z1 && z >= s.z0) || stretches[stretches.length - 1];
    const pools = plan.obs.filter((o) => o.kind === 'pool');
    // the floor: each lane in its racer's colour (yours brighter), bands of flagstone, the pools cut out
    {
        const cuts = new Set([end, back]);
        for (const o of pools) { cuts.add(o.z0); cuts.add(o.z1); }
        for (let z = Math.ceil(end / 12) * 12; z < back; z += 12) cuts.add(z);
        for (const s of stretches) cuts.add(s.z0);
        const zz = [...cuts].filter((z) => z >= end && z <= back).sort((a, b) => a - b);
        for (let i = 0; i < zz.length - 1; i++) {
            const a = zz[i], b = zz[i + 1], m = (a + b) / 2;
            if (pools.some((o) => m > o.z0 && m < o.z1)) continue;
            const K = at(m).S;
            for (let s = 0; s < SPOTS; s++) {
                const cx = laneX(s), c0 = mixC(Wd.floor, spotsCol[s], s === mySpot ? 0.34 : 0.16), c = Math.floor(m / 12) & 1 ? c0 : shade(c0, 0.93);
                floorQuad(K, cx - L2, cx + L2, a, b, 0.02, c);
            }
        }
    }
    for (const o of pools) {
        const K = at((o.z0 + o.z1) / 2), d = o.z1 - o.z0;
        for (const z of [o.z0 + 0.2, o.z1 - 0.2]) K.S.box(0, -0.8, z, hwAll * 2, 1.6, 0.4, shade(Wd.rim, 0.8), { tile: 8 });
        decal(D, 0, 0, -0.3, (o.z0 + o.z1) / 2, hwAll, d / 2, Wd.hazard, Wd.hazard2, 1, 0);
        for (const z of [o.z0, o.z1]) K.P.box(0, 0.08, z, hwAll * 2, 0.16, 0.5, 0xffffff, { soft: !low });
    }
    // the rails between the lanes: low stone walls lit along the top in the colours either side of them
    for (let s = 1; s < SPOTS; s++) {
        const x = -hwAll + s * ARENA.laneW;
        for (const S of stretches) {
            const zm = (S.z0 + S.z1) / 2, len = S.z1 - S.z0;
            S.S.box(x, 0.6, zm, 0.8, 1.2, len, Wd.wall2, { tile: 8 });
            S.P.box(x - 0.22, 1.24, zm, 0.34, 0.1, len, spotsCol[s - 1], { glow: 1 });
            S.P.box(x + 0.22, 1.24, zm, 0.34, 0.1, len, spotsCol[s], { glow: 1 });
        }
    }
    // the hall's walls, the back wall behind the start, the wall at the far end
    for (const S of stretches) for (const sx of [-1, 1]) wallRun(S.S, S.P, sx, XA, S.z0, S.z1, ctx, (z) => z > back - 4);
    S0.box(0, 8, back + 3, (XA + 6.4) * 2, 30, 6, Wd.wall, { tile: 8 });
    S0.box(0, 8, end - 3, (XA + 6.4) * 2, 30, 6, Wd.wall, { tile: 8 });
    // the start: a line of light across, a gate of light over each lane in its colour, the name over it all
    for (let s = 0; s < SPOTS; s++) {
        const cx = laneX(s);
        P0.box(cx, 0.08, ARENA.startZ - 2.2, ARENA.laneW - 1.4, 0.08, 0.7, 0xffffff, { glow: 1 });
        for (const sx of [-1, 1]) P0.box(cx + sx * (L2 - 0.9), 4, ARENA.startZ - 2.2, 0.7, 8, 0.7, spotsCol[s], { glow: 1 });
        P0.box(cx, 8.2, ARENA.startZ - 2.2, ARENA.laneW - 1.2, 0.7, 0.7, spotsCol[s], { glow: 1 });
        P0.box(cx, 0.06, ARENA.startZ + 4, 3, 0.06, 3, spotsCol[s], { glow: 1, ry: Math.PI / 4 });
    }
    signs.add([big('AVALANCHE RUSH', GOLD, 100, '#3a1a00'), { t: 'outrun the avalanche!', c: '#ffffff', s: '#3a1a00', px: 40 }], 26, new V3(0, 17, ARENA.startZ - 6), false, 140);
    // what's in the way, in every lane
    const blades = [], boxes = [], BOX_C = [[0xe8303a, 0xffd23a], [0x2ab450, 0xff3a3a], [0x3a8aff, 0xffffff], [0xffc23a, 0xe8303a], [0xa04aff, 0xffd23a], [0xff7ac8, 0xffffff]];
    for (const o of plan.obs) {
        const K = at(o.z ?? o.z0);
        for (let s = 0; s < SPOTS; s++) {
            const cx = laneX(s);
            if (o.kind === 'hurdle') {
                // a candy bar across the lane, striped in its racer's colour
                const wd = ARENA.hw * 2 + 1, nb = 6, bw = wd / nb;
                for (let j = 0; j < nb; j++) K.S.box(cx - wd / 2 + (j + 0.5) * bw, o.h / 2, o.z, bw + 0.02, o.h, o.d, j % 2 ? 0xffffff : spotsCol[s], { tile: 8 });
                K.P.box(cx, o.h + 0.08, o.z, wd, 0.16, o.d * 0.6, Wd.hazard2, { glow: 1 });
            } else if (o.kind === 'pillars') {
                // candy canes to weave round
                for (const p of o.list) {
                    for (let j = 0; j < 6; j++) K.P.box(cx + p.x, (j + 0.5) * 1.5, p.z, 2.8, 1.52, 2.8, j % 2 ? 0xffffff : st.cane, { soft: !low, ry: j * 0.35 });
                    K.P.box(cx + p.x, 9.4, p.z, 3.4, 0.9, 3.4, st.snow, { soft: true });
                }
            } else if (o.kind === 'blade') {
                const by = LANE_BLADE.pivot + 0.7;
                for (let j = 0; j < 7; j++) K.P.box(cx - ARENA.laneW / 2 + (j + 0.5) * ARENA.laneW / 7, by, o.z, ARENA.laneW / 7 + 0.02, 1, 1.2, j % 2 ? 0xffffff : st.cane, {});
                for (const sx of [-1, 1]) K.S.box(cx + sx * L2, by / 2, o.z, 1.2, by + 0.6, 1.6, Wd.wall2, { tile: 8 });
                K.P.box(cx, by - 0.2, o.z, 1.6, 1.4, 1.6, st.metal, { soft: true });
                for (let x = -6; x <= 6; x += 3) K.P.box(cx + x, 0.05, o.z, 1.4, 0.04, 0.35, Wd.hazard2, { glow: 1, shade: 0.8 });
                blades.push({ o, x: cx });
            } else if (o.kind === 'slider') {
                // a gift box sliding from rail to rail: its track, warning stripes
                const tz = LANE_BOX.d / 2 + 0.6;
                floorQuad(K.S, cx - L2, cx + L2, o.z - tz, o.z + tz, 0.05, shade(Wd.rim, 0.85));
                for (const sz2 of [-1, 1]) K.P.box(cx, 0.07, o.z + sz2 * tz, ARENA.hw * 2, 0.05, 0.35, Wd.hazard2, { glow: 1, shade: 0.85 });
                const [c1, c2] = BOX_C[(boxes.length + s) % BOX_C.length];
                boxes.push({ o, x: cx, c1, c2 });
            } else if (o.kind === 'boost') {
                decal(D, 1, cx + o.x, 0.09, o.z, LANE_BOOST.hw, LANE_BOOST.hd, mixC(Wd.floor, 0x000000, 0.55), mixC(spotsCol[s], 0xffffff, 0.3), 1, 0);
                K.S.box(cx + o.x, 0.04, o.z, LANE_BOOST.hw * 2 + 0.6, 0.08, LANE_BOOST.hd * 2 + 0.6, Wd.rim, { tile: 8 });
            }
        }
    }
    // the finish: a chequered band across every lane, a great arch, a portal of light the width of the hall
    {
        const K = at(plan.finish), z = plan.finish;
        for (let s = 0; s < SPOTS; s++) { const cx = laneX(s); for (let i = 0; i < 7; i++) for (let j = 0; j < 2; j++) K.P.box(cx - 6 + i * 2, 0.06, z + 1.2 - j * 2.4, 2, 0.06, 2.4, (i + j) % 2 ? 0x1a1030 : 0xffffff, { glow: (i + j) % 2 ? 0 : 1 }); }
        for (const sx of [-1, 1]) {
            for (let j = 0; j < 13; j++) K.P.box(sx * (hwAll + 2.2), (j + 0.5) * 2, z - 6, 4.4, 2.02, 5, j % 2 ? 0xffffff : st.cane, { soft: !low });
            fl.push([sx * (hwAll + 2.2), 26.8, z - 6, 2.2, st.flame]);
        }
        K.S.box(0, 25, z - 6, hwAll * 2 + 9, 4, 5, Wd.wall2, { tile: 8 });
        K.P.box(0, 25, z - 6 + 2.55, hwAll * 2, 0.6, 0.1, 0xffc21e, { glow: 1 });
        energyQuad(E, 3, 0, 0.2, z - 6, hwAll * 2, 22.6, 0xffc21e, Wd.glow, 1, 22.6 / (hwAll * 2));
        signs.add([big('FINISH!', GOLD, 118, '#3a1a00')], 24, new V3(0, 31, z - 4), false, 400);
    }
    clouds(Wd);
    const farKits = [new Kit({ glow: true }), new Kit({ glow: true })];
    horizon(Wd, farKits, rng(w * 41 + 5), back + 260, end - 200, low);
    propKits.push(...farKits);
    for (const f of fl) halo(E, f[0], f[1] + f[3] * 0.7, f[2], f[3] * 2.4, f[4], 1);
    // the jelly: rows down every lane, clear of what's in the way, the start and the finish
    const domes = [], dx = low ? 5.2 : 4.2, dz = dx * 0.87, r0 = low ? 2.2 : 1.85;
    const clearAt = (z) => {
        if (z > ARENA.startZ - 5 || z < plan.finish + 4) return true;
        for (const o of plan.obs) {
            if (o.kind === 'pool') { if (z > o.z0 - 2.6 && z < o.z1 + 2.6) return true; }
            else if (o.kind === 'hurdle') { if (Math.abs(z - o.z) < o.d / 2 + 2.4) return true; }
            else if (o.kind === 'slider') { if (Math.abs(z - o.z) < LANE_BOX.d / 2 + 2.4) return true; }
            else if (o.kind === 'blade') { if (Math.abs(z - o.z) < 3) return true; }
            else if (o.kind === 'pillars') { for (const p of o.list) if (Math.abs(z - p.z) < 3.6) return true; }
            else if (o.kind === 'boost') { if (Math.abs(z - o.z) < LANE_BOOST.hd + 1.6) return true; }
        }
        return false;
    };
    for (let s = 0; s < SPOTS; s++) {
        const cx = laneX(s);
        let row = 0;
        for (let z = ARENA.startZ - 6; z > plan.finish + 4; z -= dz, row++) {
            if (clearAt(z)) continue;
            for (let x = -ARENA.hw + 1.9 + (row % 2 ? dx / 2 : 0); x <= ARENA.hw - 1.9; x += dx) {
                const pick = R(), c = Wd.jelly[pick < 0.5 ? 0 : pick < 0.8 ? 1 : 2];
                domes.push({ x: cx + x + (R() - 0.5) * 0.5, z: z + (R() - 0.5) * 0.5, r: r0 * (0.88 + R() * 0.24), h: 0.72 + R() * 0.14, c });
            }
        }
    }
    const jelly = buildJelly(group, domes, { low });
    const BX_ = LANE_BOX.w / 2.04, BY_ = (LANE_BOX.h - 1) / 1.08, BZ_ = LANE_BOX.d / 2.04;
    const boxM = presentMesh(boxes.map((b) => ({ x: b.x, y: 0, z: b.o.z, sx: BX_, sy: BY_, sz: BZ_, c1: b.c1, c2: b.c2 })), low, group, false, Math.max(1, boxes.length));
    boxM.instanceMatrix.setUsage(T.DynamicDrawUsage);
    // ----- build it -----
    buildBlobs(group, () => Math.random());
    const stoneMesh = batchKits(kits, stoneMaterial(), true);
    if (stoneMesh) group.add(stoneMesh);
    const propMesh = batchKits(propKits, propMaterial(), true);
    if (propMesh) group.add(propMesh);
    const decalMat = decalMaterial(Wd, low), decalGeo = D.geometry(), decals = new T.Mesh(decalGeo, decalMat);
    decals.frustumCulled = false; decals.renderOrder = 1;
    group.add(decals);
    const energyMat = energyMaterial(), energyG = E.geometry(), energy = new T.Mesh(energyG, energyMat);
    energy.frustumCulled = false; energy.renderOrder = 3;
    group.add(energy);
    const flames = flameMesh(fl, st.flame2, group);
    const bladeG = bladeGeo(Wd, LANE_BLADE.arm, 0.72), bladeM = new T.InstancedMesh(bladeG, bladeMaterial(), Math.max(1, blades.length));
    bladeM.count = blades.length;
    bladeM.instanceMatrix.setUsage(T.DynamicDrawUsage);
    bladeM.frustumCulled = false; bladeM.castShadow = !low; bladeM.receiveShadow = true;
    group.add(bladeM);
    const surge = surgeMesh(Wd, (XA + 6.4) * 2 + 4);
    surge.position.set(0, 0, ARENA.surgeZ0);
    group.add(surge);
    signs.build(group);
    group.traverse((o) => { o.matrixAutoUpdate = false; o.updateMatrix(); });
    group.updateMatrixWorld(true);
    scene.add(group);
    const bo = new T.Object3D();
    let lastZ = NaN;
    const bm = new T.Matrix4();
    const view = {
        group, surge, blades: bladeM, jelly,
        // t: the server's seconds (the clock caneAt counts by); surgeZ: where the avalanche's front is (shared/arena.js surgeAt)
        update(t, surgeZ) {
            for (let i = 0; i < blades.length; i++) {
                const b = blades[i], s = Math.max(-1, Math.min(1, caneAt(b.o, t) * ARENA.hw / LANE_BLADE.arm));
                bo.position.set(b.x, LANE_BLADE.pivot, b.o.z); bo.rotation.set(0, 0, Math.asin(s)); bo.updateMatrix();
                bladeM.setMatrixAt(i, bo.matrix);
            }
            if (blades.length) bladeM.instanceMatrix.needsUpdate = true;
            for (let i = 0; i < boxes.length; i++) { const b = boxes[i]; bm.makeScale(BX_, BY_, BZ_).setPosition(b.x + laneBoxAt(b.o, t), 0, b.o.z); boxM.setMatrixAt(i, bm); }
            if (boxes.length) boxM.instanceMatrix.needsUpdate = true;
            if (surgeZ !== undefined && surgeZ !== lastZ) { lastZ = surgeZ; surge.position.z = surgeZ; surge.updateMatrix(); }
        },
        dispose() {
            releaseBlobs(group);
            signs.dispose();
            if (stoneMesh) (stoneMesh.isBatchedMesh ? stoneMesh.dispose() : stoneMesh.geometry.dispose());
            if (propMesh) (propMesh.isBatchedMesh ? propMesh.dispose() : propMesh.geometry.dispose());
            decalGeo.dispose(); decalMat.dispose(); energyG.dispose(); energyMat.dispose();
            if (flames) { flames.geometry.dispose(); flames.material.dispose(); flames.dispose(); }
            bladeG.dispose(); bladeM.dispose();
            jelly.dispose();
            boxM.geometry.dispose(); boxM.material.dispose(); boxM.dispose();
            for (const m of surge.userData.parts) { m.geometry.dispose(); m.material.dispose(); }
            sea.geometry.dispose(); sea.material.dispose();
            scene.remove(group);
        },
    };
    view.update(CU.uNow.value, ARENA.surgeZ0);
    return view;
}
void AQUA;
