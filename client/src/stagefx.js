// What moves in the stages' own challenges (shared/stages.js), one draw a kind for a whole world: the peppermint sweepers turning, the
// snowballs rolling down their lanes, the gumballs falling where their shadows grow, the jelly walls wobbling (and bursting when you
// dash into them), the cookie tiles cracking and dropping under you, and the golden candies turning over their spots.
// Where each thing is comes from the server's clock (the same on every screen); the walls you've burst and the tiles you've broken
// are yours alone (the server doesn't judge them). Lambert and unlit only; everything near the camera is cheap to move.
import { T, scene } from './engine.js';
import { CU } from './clock.js';
import { Kit, glowVCMaterial, nearFade } from './geo.js';
import { stagePlan } from '../../shared/world.js';
import { SWEEP, sweeperAngle, BALL, ballZ, GUM, gumballsAt, JWALL, TILE } from '../../shared/stages.js';
import { WALLS_N } from '../../shared/config.js';
import * as FX from './fx.js';

const m4 = new T.Matrix4(), q4 = new T.Quaternion(), v3 = new T.Vector3(), s3 = new T.Vector3(), e3 = new T.Euler(), tc = new T.Color();
const GUM_C = [0xff3a5a, 0x3ad860, 0x3a9aff, 0xffd23a, 0xff7ad8, 0xa04aff, 0xff8a2a, 0x3ae8d8];

// a jelly material for the walls: lit, a little self-lit, wobbling, its shine painted on
function wallMaterial() {
    // (solid: a row of see-through walls one behind another is a lot of drawing over the same pixels on a weak chip; the nearest one
    // hides the rest. The jelly look is in its glow, its shine and its wobble)
    const m = new T.MeshLambertMaterial({ color: 0xffffff });
    m.onBeforeCompile = (sh) => {
        sh.uniforms.uNow = CU.uNow;
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uNow; varying vec3 vLp;')
            .replace('#include <begin_vertex>', `#include <begin_vertex>
vec3 ip = instanceMatrix[3].xyz; float ph = ip.z * 0.37 + ip.x;
float up = clamp(position.y + 0.5, 0.0, 1.0);
transformed.z += (sin(uNow * 7.0 + ph + position.x * 3.0) * 0.09 + sin(uNow * 3.1 + position.x * 9.0) * 0.05) * up;
transformed.x += sin(uNow * 5.3 + ph) * 0.02 * up;
transformed.y *= 1.0 + 0.035 * sin(uNow * 6.1 + ph + position.x * 2.0);
vLp = position;`);
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vLp;')
            .replace('#include <color_fragment>', `#include <color_fragment>
diffuseColor.rgb *= 0.72 + 0.4 * clamp(vLp.y + 0.5, 0.0, 1.0);`)
            .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
// painted gloss: a soft band near the top, tall streaks down the face, a bright lip along the top edge
float streak = smoothstep(0.82, 1.0, sin(vLp.x * 38.0 + 1.3)) * smoothstep(-0.45, 0.35, vLp.y) * 0.55;
float band = smoothstep(0.28, 0.38, vLp.y) * (1.0 - smoothstep(0.42, 0.5, vLp.y)) * 0.6;
float shine = band + streak + smoothstep(0.47, 0.5, vLp.y) * 0.5;
totalEmissiveRadiance += diffuseColor.rgb * 0.38 + vec3(1.0) * shine * 0.4;`);
    };
    m.customProgramCacheKey = () => 'jj-jwall';
    return m;
}
// the shadow of a falling gumball (unlit, see-through, darker and bigger as it comes)
function shadowMaterial() {
    return new T.ShaderMaterial({
        vertexShader: 'attribute float aK; varying vec2 vP; varying float vK; void main() { vP = position.xz; vK = aK; gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0); }',
        fragmentShader: 'varying vec2 vP; varying float vK; void main() { float r = length(vP); if (r > 1.0) discard; float a = (1.0 - smoothstep(0.55, 1.0, r)) * (0.18 + 0.5 * vK) + smoothstep(0.86, 0.95, r) * (1.0 - smoothstep(0.95, 1.0, r)) * 0.55 * vK; gl_FragColor = vec4(mix(vec3(0.1, 0.02, 0.06), vec3(1.0, 0.25, 0.3), smoothstep(0.86, 0.95, r) * vK), a); }',
        transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
    });
}
// a sweeper's bar: right across (two ends), stripes along it, a gumdrop at each end; local x along the bar, its middle at the post
function barGeo(Wd, st) {
    const k = new Kit({ glow: true }), L = SWEEP.r, n = 14, sw = (L * 2) / n;
    for (let i = 0; i < n; i++) k.box(-L + (i + 0.5) * sw, 0, 0, sw + 0.02, SWEEP.t, SWEEP.t, i % 2 ? 0xffffff : st.cane);
    for (const sx of [-1, 1]) { k.box(sx * (L + 0.3), 0, 0, 1.6, 1.5, 1.5, Wd.jelly[0], { soft: true }); k.box(sx * (L + 0.3), 0.55, 0.45, 0.5, 0.3, 0.3, 0xffffff, { glow: 1 }); }
    k.box(0, 0, 0, 2.2, 1.6, 2.2, 0xffd23a, { soft: true });
    return k.geometry();
}
// a golden candy: a round middle, its wrapper twisted out either side
function candyGeo() {
    const k = new Kit({ glow: true }), G = 0xffc21e, G2 = 0xfff0a0;
    k.box(0, 0, 0, 1.3, 1.1, 1.1, G, { soft: true });
    k.box(0, 0.32, 0.4, 0.5, 0.2, 0.2, 0xffffff, { glow: 1 });
    for (const s of [-1, 1]) { k.box(s * 0.95, 0, 0, 0.5, 0.45, 0.45, G2, { soft: true }); k.box(s * 1.35, 0, 0, 0.45, 1.1, 1.0, G, { rz: s * 0.3 }); }
    return k.geometry();
}
function candyMaterial() {
    const m = glowVCMaterial(CU.uNow);
    const prev = m.onBeforeCompile;
    m.onBeforeCompile = (sh, r) => {
        prev.call(m, sh, r);
        sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
{ vec3 ip = instanceMatrix[3].xyz; float a = uNow * 2.2 + ip.x + ip.z; float ca = cos(a), sa = sin(a); transformed.xz = mat2(ca, -sa, sa, ca) * transformed.xz; transformed.y += sin(uNow * 2.6 + ip.z) * 0.25; }`);
        sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * 0.55;');
    };
    m.customProgramCacheKey = () => 'jj-candy';
    return m;
}

// A list of things along the course, in order down it (z falling), drawn only near the camera: the ones within R of it go in the
// mesh's first slots and nothing else is drawn (an instanced mesh over the whole course is never culled: 15 stages of tiles and
// candies three thousand studs off, under the fog, cost as much as everything else on screen). slide() says if the window moved
function windowOf(list, zOf) { list.sort((a, b) => zOf(b) - zOf(a)); return { list, zOf, lo: 0, hi: 0 }; }
function slide(w, camZ, R) {
    const L = w.list;
    let lo = L.length, hi = L.length;
    for (let i = 0; i < L.length; i++) if (w.zOf(L[i]) < camZ + R) { lo = i; break; }
    for (let i = lo; i < L.length; i++) if (w.zOf(L[i]) <= camZ - R) { hi = i; break; }
    const moved = lo !== w.lo || hi !== w.hi;
    w.lo = lo; w.hi = hi;
    return moved;
}

// wi: the world; Wd/st: its look (world.js); low: Low quality. Returns what main.js reads and drives each frame
export function buildStageFx(group, wi, Wd, st, low) {
    const sweepers = [], balls = [], gumZones = [], walls = [], tiles = [], candies = [];
    for (let k = 0; k < WALLS_N; k++) {
        const P = stagePlan(wi, k);
        for (const o of P.list) {
            if (o.kind === 'sweeper') for (let j = 0; j < o.bars; j++) sweepers.push({ k, o, off: j * Math.PI / 2 });
            else if (o.kind === 'boulders') o.lanes.forEach((x, i) => balls.push({ k, o, i, x }));
            else if (o.kind === 'gumballs') gumZones.push({ k, o, list: [] });
            else if (o.kind === 'jwall') walls.push({ k, o, i: o.i, burstAt: -99, wobT: -99 });
            else if (o.kind === 'crumble') o.tiles.forEach((t, i) => tiles.push({ k, i, x: t.x, z: t.z, hitAt: -99, state: 0 }));
        }
        P.candies.forEach((c, i) => candies.push({ k, i, x: c.x, y: c.y, z: c.z, got: false }));
    }
    // (in order down the course, each drawn only near the camera)
    walls.forEach((w, i) => { w.c = Wd.jelly[i % Wd.jelly.length]; });
    const wBars = windowOf(sweepers, (x) => x.o.z), wBalls = windowOf(balls, (x) => x.o.z), wWalls = windowOf(walls, (x) => x.o.z);
    const wTiles = windowOf(tiles, (x) => x.z), wCand = windowOf(candies, (x) => x.z);
    const R_BARS = 300, R_BALLS = 480, R_WALLS = 320, R_TILES = 460, R_CAND = 460;
    const mats = [], geos = [], meshes = [];
    const own = (mesh) => { mesh.frustumCulled = false; mesh.matrixAutoUpdate = false; group.add(mesh); meshes.push(mesh); return mesh; };
    // ----- sweepers -----
    const barG = barGeo(Wd, st), barM = nearFade(glowVCMaterial(CU.uNow), 'jj-bar', 6, 12);
    geos.push(barG); mats.push(barM);
    const bars = own(new T.InstancedMesh(barG, barM, Math.max(1, sweepers.length)));
    bars.count = 0; bars.castShadow = !low; bars.instanceMatrix.setUsage(T.DynamicDrawUsage);
    // ----- rolling balls: snowballs (cookie dough in Gingerbread Glen, ice in Frostberry Falls, little planets in Starlight Sweets) -----
    const ballG = new T.IcosahedronGeometry(BALL.r, low ? 1 : 2), bc = [], c1 = new T.Color(Wd.id === 'ginger' ? 0xd8a060 : Wd.id === 'frost' ? 0xbfe6ff : Wd.id === 'star' ? 0x9a6aff : 0xf8fbff), c2 = new T.Color(Wd.id === 'ginger' ? 0x5a3214 : Wd.id === 'frost' ? 0x7ab8ff : Wd.id === 'star' ? 0xffd23a : 0xc8dcf2);
    { const p = ballG.attributes.position; for (let i = 0; i < p.count; i++) { const h = Math.sin(p.getX(i) * 3.1 + p.getY(i) * 1.7) * Math.sin(p.getZ(i) * 2.3 - p.getX(i)) ; tc.copy(c1).lerp(c2, h > 0.55 ? 0.85 : h < -0.6 ? 0.35 : 0); bc.push(tc.r, tc.g, tc.b); } }
    ballG.setAttribute('color', new T.Float32BufferAttribute(bc, 3));
    const ballM = nearFade(new T.MeshLambertMaterial({ vertexColors: true, emissive: 0x000000 }), 'jj-ball', 5, 11);
    geos.push(ballG); mats.push(ballM);
    const ballMesh = own(new T.InstancedMesh(ballG, ballM, Math.max(1, balls.length)));
    ballMesh.count = 0; ballMesh.castShadow = !low; ballMesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
    // ----- gumballs and their shadows -----
    const GUM_MAX = 40, gumG = new T.IcosahedronGeometry(GUM.r, low ? 1 : 2), gumM = new T.MeshLambertMaterial({ color: 0xffffff });
    gumM.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * 0.22 + vec3(1.0) * smoothstep(0.93, 0.99, dot(normalize(vNormal), normalize(vec3(-0.3, 0.8, 0.5)))) * 0.5;'); };
    gumM.customProgramCacheKey = () => 'jj-gum';
    geos.push(gumG); mats.push(gumM);
    const gumMesh = own(new T.InstancedMesh(gumG, gumM, GUM_MAX));
    gumMesh.setColorAt(0, tc.set(0xffffff)); gumMesh.count = 0; gumMesh.castShadow = false; gumMesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
    const shG = new T.CircleGeometry(1, 20).rotateX(-Math.PI / 2), shK = new Float32Array(GUM_MAX);
    shG.setAttribute('aK', new T.InstancedBufferAttribute(shK, 1));
    const shM = shadowMaterial();
    geos.push(shG); mats.push(shM);
    const shMesh = own(new T.InstancedMesh(shG, shM, GUM_MAX));
    shMesh.count = 0; shMesh.renderOrder = 2; shMesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
    // ----- jelly walls -----
    const wallG = new T.BoxGeometry(1, 1, 1, low ? 6 : 12, low ? 4 : 8, 2), wallM = wallMaterial();
    geos.push(wallG); mats.push(wallM);
    const wallMesh = own(new T.InstancedMesh(wallG, wallM, Math.max(1, walls.length)));
    wallMesh.setColorAt(0, tc.set(0xffffff));
    wallMesh.count = 0; wallMesh.castShadow = false; wallMesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
    // ----- cookie tiles -----
    const tk = new Kit();
    tk.box(0, -0.25, 0, TILE.s - 0.12, 0.5, TILE.s - 0.12, 0xc8823e, { soft: !low });
    tk.box(0, 0.02, 0, TILE.s - 0.9, 0.06, TILE.s - 0.9, 0xfff4e4);
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, 0]]) tk.box(x * 0.9, 0.06, z * 0.9, 0.36, 0.08, 0.36, Wd.jelly[(x + z + 4) % 3]);
    const tileG = tk.geometry(), tileM = nearFade(new T.MeshLambertMaterial({ vertexColors: true }), 'jj-tile', 3, 6);
    geos.push(tileG); mats.push(tileM);
    const tileMesh = own(new T.InstancedMesh(tileG, tileM, Math.max(1, tiles.length)));
    tileMesh.count = 0; tileMesh.receiveShadow = !low; tileMesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
    const tileAt = (ti, lt) => {
        // a tile: still, or shaking, dropping and tumbling, coming back up
        const u = lt - ti.hitAt;
        let y = 0.2, rx = 0, rz = 0, s = 1;
        if (ti.state !== 0) {
            if (u < TILE.shake) { rx = Math.sin(u * 60) * 0.05; rz = Math.cos(u * 47) * 0.05; }
            else if (u < TILE.shake + 1.2) { const f = u - TILE.shake; y = 0.2 - f * f * 30; rx = f * 2.2; rz = f * 1.3; s = Math.max(0, 1 - f * 0.6); }
            else if (u < TILE.shake + TILE.back) s = 0;
            else if (u < TILE.shake + TILE.back + 0.4) { const f = (u - TILE.shake - TILE.back) / 0.4; y = -2 + f * 2.2; s = f; }
            q4.setFromEuler(e3.set(rx, 0, rz));
        } else q4.identity();
        return m4.compose(v3.set(ti.x, y, ti.z), q4, s3.set(s, s, s));
    };
    // ----- golden candies -----
    const candG = candyGeo(), candM = candyMaterial();
    geos.push(candG); mats.push(candM);
    const candMesh = own(new T.InstancedMesh(candG, candM, Math.max(1, candies.length)));
    candMesh.count = 0; candMesh.castShadow = false; candMesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
    // (a candy found is drawn at no size; only the ones in the window have a slot)
    const setCandy = (i) => { if (i < wCand.lo || i >= wCand.hi) return; const c = candies[i]; m4.makeScale(c.got ? 0 : 1.15, c.got ? 0 : 1.15, c.got ? 0 : 1.15).setPosition(c.x, c.y, c.z); candMesh.setMatrixAt(i - wCand.lo, m4); };

    const near = (z, camZ, d) => Math.abs(z - camZ) < d;
    let warm = false;
    const gl = [];
    const fx = {
        sweepers, balls, gumZones, walls, tiles, candies,
        // the walls you've burst, the tiles you've broken: yours alone; t: your clock (seconds)
        wallUp: (w, t) => t - w.burstAt > 6,
        burst(w, t) { w.burstAt = t; v3.set(0, 3, w.o.z); for (let i = 0; i < 6; i++) { v3.x = (i - 2.5) * 5.5; FX.splash(v3, Wd.jelly[(w.i + i) % 3], low ? 3 : 6, 1.3); } },
        bonk(w, t) { w.wobT = t; },
        // a tile under you starts to crack (it drops TILE.shake later and comes back TILE.back after that)
        touch(ti, t) { if (ti.state === 0) { ti.state = 1; ti.hitAt = t; } },
        tileSolid: (ti, t) => ti.state === 0 || (ti.state === 1 && t - ti.hitAt < TILE.shake),
        // which candies you've already found (the server's word): bits per stage of this world
        setCandies(bits) { candies.forEach((c, i) => { const got = !!(bits && ((bits[c.k] | 0) & (1 << c.i))); if (got !== c.got) { c.got = got; setCandy(i); } }); candMesh.instanceMatrix.needsUpdate = true; },
        take(c) { c.got = true; setCandy(candies.indexOf(c)); candMesh.instanceMatrix.needsUpdate = true; },
        // every frame: t the server's seconds, lt your own clock's, camZ where the camera is along the course
        update(t, lt, camZ) {
            slide(wBars, camZ, R_BARS);
            for (let i = wBars.lo; i < wBars.hi; i++) {
                const s = sweepers[i], a = sweeperAngle(s.o, t) + s.off;
                q4.setFromAxisAngle(T.Object3D.DEFAULT_UP, a);
                m4.compose(v3.set(s.o.x, SWEEP.y, s.o.z), q4, s3.set(1, 1, 1));
                bars.setMatrixAt(i - wBars.lo, m4);
            }
            bars.count = wBars.hi - wBars.lo;
            if (bars.count) bars.instanceMatrix.needsUpdate = true;
            slide(wBalls, camZ, R_BALLS);
            for (let i = wBalls.lo; i < wBalls.hi; i++) {
                const b = balls[i], z = ballZ(b.o, b.i, t), roll = z / BALL.r;
                q4.setFromEuler(e3.set(roll, 0, 0));
                // a snowball grows as it rolls (from a little one at the far end to full size where it can hit you);
                // out past the near end it sinks away into the floor
                const grow = Math.max(0.12, Math.min(1, (z - b.o.z0 + 12) / 10)), sink = Math.max(0, z - b.o.z1) * 0.6;
                m4.compose(v3.set(b.x, BALL.r * grow - Math.min(BALL.r * 2.2, sink), z), q4, s3.set(grow, grow, grow));
                ballMesh.setMatrixAt(i - wBalls.lo, m4);
            }
            ballMesh.count = wBalls.hi - wBalls.lo;
            if (ballMesh.count) ballMesh.instanceMatrix.needsUpdate = true;
            // gumballs: falling from high up once their shadow has grown, a squash and a bounce off as they land
            let n = 0;
            for (const zn of gumZones) {
                if (!near(zn.o.z, camZ, 220)) continue;
                gumballsAt(zn.o, t, zn.list);
                for (const d of zn.list) {
                    if (n >= GUM_MAX) break;
                    const u = t - d.t0, land = GUM.warn + GUM.fall;
                    let y, sx = 1, sy = 1;
                    if (u < GUM.warn) y = 60; else if (u < land) { const f = (u - GUM.warn) / GUM.fall; y = GUM.r + (1 - f * f) * 56; } else { const f = u - land; y = GUM.r + Math.abs(Math.sin(f * 7)) * 3.4 * Math.exp(-f * 3); if (f < 0.12) { sy = 1 - (0.12 - f) * 3; sx = 1 + (0.12 - f) * 2; } }
                    const vis = u >= GUM.warn - 0.25 && u < land + 0.65;
                    m4.compose(v3.set(d.x, y, d.z), q4.identity(), s3.set(vis ? sx : 0, vis ? sy : 0, vis ? sx : 0));
                    gumMesh.setMatrixAt(n, m4); gumMesh.setColorAt(n, tc.set(GUM_C[d.c]));
                    const k = u < land ? Math.min(1, u / land) : Math.max(0, 1 - (u - land) * 2.5), r = GUM.hit * (0.55 + 0.45 * Math.min(1, u / land));
                    m4.makeScale(r, 1, r).setPosition(d.x, 0.08, d.z);
                    shMesh.setMatrixAt(n, m4); shK[n] = k;
                    n++;
                }
            }
            gumMesh.count = n; shMesh.count = n;
            if (n) { gumMesh.instanceMatrix.needsUpdate = true; gumMesh.instanceColor.needsUpdate = true; shMesh.instanceMatrix.needsUpdate = true; shG.attributes.aK.needsUpdate = true; }
            // jelly walls: standing (wobbling harder just after you bounce off), or burst
            if (slide(wWalls, camZ, R_WALLS)) { for (let i = wWalls.lo; i < wWalls.hi; i++) wallMesh.setColorAt(i - wWalls.lo, tc.set(walls[i].c)); if (wallMesh.instanceColor) wallMesh.instanceColor.needsUpdate = true; }
            for (let i = wWalls.lo; i < wWalls.hi; i++) {
                const w = walls[i], up = lt - w.burstAt > 6, back = Math.min(1, Math.max(0, (lt - w.burstAt - 6) * 3)), wob = Math.max(0, 1 - (lt - w.wobT) * 1.5);
                // (with the camera in it, it's not drawn: no see-through dither in its shader, so the nearest wall hides the ones
                // behind it before they're shaded)
                const k = up && Math.abs(w.o.z - camZ) > JWALL.d / 2 + 3 ? (w.burstAt > 0 ? back : 1) : 0, sq = 1 + Math.sin(lt * 24) * 0.08 * wob;
                m4.compose(v3.set(0, JWALL.h / 2 * k, w.o.z), q4.identity(), s3.set(34.6 * k, JWALL.h * k * sq, JWALL.d * k / sq));
                wallMesh.setMatrixAt(i - wWalls.lo, m4);
            }
            wallMesh.count = wWalls.hi - wWalls.lo;
            if (wallMesh.count) wallMesh.instanceMatrix.needsUpdate = true;
            // cookie tiles: a broken one comes back after a while (wherever the camera is); the ones near it drawn, still or moving
            for (const ti of tiles) if (ti.state !== 0 && lt - ti.hitAt >= TILE.shake + TILE.back + 0.4) ti.state = 0;
            const tMoved = slide(wTiles, camZ, R_TILES);
            let tAny = tMoved;
            for (let i = wTiles.lo; i < wTiles.hi; i++) {
                const ti = tiles[i];
                if (!tMoved && ti.state === 0 && !ti.moved) continue;
                tileMesh.setMatrixAt(i - wTiles.lo, tileAt(ti, lt)); tAny = true;
                ti.moved = ti.state !== 0;
            }
            tileMesh.count = wTiles.hi - wTiles.lo;
            if (tAny && tileMesh.count) tileMesh.instanceMatrix.needsUpdate = true;
            // golden candies (they spin in their shader)
            if (slide(wCand, camZ, R_CAND)) { for (let i = wCand.lo; i < wCand.hi; i++) setCandy(i); candMesh.count = wCand.hi - wCand.lo; if (candMesh.count) candMesh.instanceMatrix.needsUpdate = true; }
            for (const m of meshes) m.visible = warm || m.count > 0;
            void gl;
        },
        showAll(on) { warm = !!on; for (const m of meshes) m.visible = warm || m.count > 0; },
        dispose() { for (const m of meshes) { group.remove(m); m.dispose(); } for (const g of geos) g.dispose(); for (const m of mats) m.dispose(); },
    };
    fx.update(CU.uNow.value, 0, 0);
    return fx;
}
// where the rolling balls of a stage are now (for the jelly: they squash it as they go): calls fn(x, z) for each
export function eachBall(fx, t, k, fn) { for (const b of fx.balls) if (b.k === k) fn(b.x, ballZ(b.o, b.i, t)); }
