// The HUD's icons, drawn: glossy cartoon candy art (SVG with gradients, a dark outline and a white shine), made once at load and set
// as CSS classes (.ic-spin, .ic-rebirth...). The menu never shows an emoji. Every pair of shoes, pet and Gift Box has its picture made
// here too.
const O = '#1c1236';
const f = (n) => +n.toFixed(1);
const svg = (body, defs) => `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'>${defs ? `<defs>${defs}</defs>` : ''}${body}</svg>`;
const stops = (s) => s.map((c, i) => `<stop offset='${f(i / (s.length - 1))}' stop-color='${c}'/>`).join('');
const grad = (id, s, x2, y2) => `<linearGradient id='${id}' x1='0' y1='0' x2='${x2 ?? 0}' y2='${y2 ?? 1}'>${stops(s)}</linearGradient>`;
const shine = (cx, cy, rx, ry, rot, o) => `<ellipse cx='${cx}' cy='${cy}' rx='${rx}' ry='${ry}' fill='#fff' opacity='${o || 0.55}'${rot ? ` transform='rotate(${rot} ${cx} ${cy})'` : ''}/>`;
const hex = (c) => '#' + (c >>> 0).toString(16).padStart(6, '0');
// a colour (0xRRGGBB) toward white (t > 0) or black (t < 0)
const tint = (c, t) => { const k = Math.abs(t), w = t > 0 ? 255 : 0, ch = (s) => Math.round(((c >> s) & 255) * (1 - k) + w * k); return hex((ch(16) << 16) | (ch(8) << 8) | ch(0)); };
const uri = (s) => 'data:image/svg+xml,' + encodeURIComponent(s.replace(/\s*\n\s*/g, ''));
const pt = (cx, cy, r, a) => f(cx + r * Math.cos(a)) + ' ' + f(cy + r * Math.sin(a));
// a star with n points (radii R, r), a four-point sparkle
const star = (cx, cy, R, r, n) => { let d = ''; for (let i = 0; i < (n || 5) * 2; i++) d += (i ? 'L' : 'M') + pt(cx, cy, i % 2 ? r : R, -Math.PI / 2 + i * Math.PI / (n || 5)); return d + 'Z'; };
const sparkle = (x, y, s, c) => `<path d='M${x} ${y - s}Q${x} ${y} ${x + s} ${y}Q${x} ${y} ${x} ${y + s}Q${x} ${y} ${x - s} ${y}Q${x} ${y} ${x} ${y - s}Z' fill='${c || '#fff'}' stroke='${O}' stroke-width='1.5' stroke-linejoin='round'/>`;
// a pinwheel of colours (a peppermint, a rainbow lollipop)
const swirl = (cx, cy, r, cols) => cols.map((c, i, a) => {
    const a0 = i / a.length * 6.2832, a1 = (i + 1) / a.length * 6.2832;
    return `<path d='M${cx} ${cy}Q${pt(cx, cy, r * 0.6, a0 - 1)} ${pt(cx, cy, r, a0)}A${r} ${r} 0 0 1 ${pt(cx, cy, r, a1)}Q${pt(cx, cy, r * 0.6, a1 - 1)} ${cx} ${cy}Z' fill='${c}'/>`;
}).join('');
// a candy-cane stroke along a path: outlined, white, red stripes
const cane = (d, w) => `<g fill='none' stroke-linejoin='round'><path d='${d}' stroke='${O}' stroke-width='${w + 3.5}' stroke-linecap='round'/><path d='${d}' stroke='#fff' stroke-width='${w}' stroke-linecap='round'/><path d='${d}' stroke='#ff2a4a' stroke-width='${w}' stroke-dasharray='${f(w * 0.6)} ${f(w * 0.6)}'/></g>`;
const GOLD = grad('y', ['#fff6a0', '#ffb21e']);

function wheel() {
    const C = ['#ff3a4a', '#fff6e8', '#2ec85a', '#ffd23a', '#ff3a4a', '#fff6e8', '#2ec85a', '#ffd23a'];
    let p = '', s = '', b = '';
    for (let i = 0; i < 8; i++) {
        const a0 = i / 8 * Math.PI * 2 - Math.PI / 2, a1 = a0 + Math.PI / 4;
        p += `<path d='M32 35L${pt(32, 35, 21, a0)}A21 21 0 0 1 ${pt(32, 35, 21, a1)}Z' fill='${C[i]}'/>`;
        s += `M32 35L${pt(32, 35, 21, a0)}`;
    }
    for (let i = 0; i < 12; i++) b += `<circle cx='${f(32 + 24.6 * Math.cos(i * Math.PI / 6))}' cy='${f(35 + 24.6 * Math.sin(i * Math.PI / 6))}' r='1.9' fill='${i % 2 ? '#fff' : '#ffe24a'}'/>`;
    return svg(`<circle cx='32' cy='35' r='27.5' fill='url(#r)' stroke='${O}' stroke-width='3.5'/>${b}<circle cx='32' cy='35' r='21' fill='${O}'/>${p}
        <path d='${s}' fill='none' stroke='${O}' stroke-width='1.6'/><circle cx='32' cy='35' r='21' fill='none' stroke='${O}' stroke-width='2.5'/>
        ${shine(24, 26, 10, 4.5, -30, 0.45)}<circle cx='32' cy='35' r='6' fill='url(#y)' stroke='${O}' stroke-width='3'/>
        <path d='M23 2L41 2L32 16Z' fill='url(#g)' stroke='${O}' stroke-width='3' stroke-linejoin='round'/>`,
    grad('r', ['#ff7a8a', '#c8102e']) + GOLD + grad('g', ['#7af08a', '#16983a']));
}
// a wrapped present: the box (c1), its ribbon and bow (c2), a pattern on the paper (dots, zigzag, waves, snowflakes, stripes, stars)
function present(c1, c2, pat, pc, glint) {
    const P = pc === undefined ? '' : hex(pc);
    let p = '';
    if (pat === 'dots') p = [[15, 36], [22, 44], [14, 52], [22, 58], [43, 36], [50, 44], [42, 52], [50, 58]].map(([x, y]) => `<circle cx='${x}' cy='${y}' r='2.6' fill='${P}'/>`).join('');
    else if (pat === 'stripes') p = `<path d='M-8 64L28 28M4 64L40 28M16 64L52 28M28 64L64 28M40 64L76 28' stroke='${P}' stroke-width='5'/>`;
    else if (pat === 'zigzag') p = `<path d='M10 39L15 35L20 39L25 35L30 39L35 35L40 39L45 35L50 39L55 35M10 52L15 48L20 52L25 48L30 52L35 48L40 52L45 48L50 52L55 48' fill='none' stroke='${P}' stroke-width='2.6' stroke-linejoin='round'/>`;
    else if (pat === 'waves') p = `<path d='M8 39Q13 34 18 39T28 39T38 39T48 39T58 39M8 51Q13 46 18 51T28 51T38 51T48 51T58 51' fill='none' stroke='${P}' stroke-width='3.2' stroke-linecap='round'/>`;
    else if (pat === 'flakes') p = `<path d='${[[18, 38], [45, 40], [18, 53], [46, 54]].map(([x, y]) => `M${x - 4} ${y}L${x + 4} ${y}M${x - 2} ${y - 3.5}L${x + 2} ${y + 3.5}M${x - 2} ${y + 3.5}L${x + 2} ${y - 3.5}`).join('')}' stroke='${P}' stroke-width='2' stroke-linecap='round'/>`;
    else if (pat === 'stars') p = `<path d='${star(18, 38, 4, 1.8)}${star(46, 40, 4, 1.8)}${star(17, 53, 3.2, 1.4)}${star(47, 54, 3.2, 1.4)}' fill='${P}'/>`;
    return svg(`<path d='M32 20C22 3 7 6 13 16C16 21 26 21 32 20ZM32 20C42 3 57 6 51 16C48 21 38 21 32 20Z' fill='url(#r)' stroke='${O}' stroke-width='3.5' stroke-linejoin='round'/>
        <path d='M29 18C23 11 16 10 16.5 14.5M35 18C41 11 48 10 47.5 14.5' fill='none' stroke='${tint(c2, -0.32)}' stroke-width='2.4' stroke-linecap='round'/>
        <rect x='10' y='29' width='44' height='31' rx='3' fill='url(#b)'/><g clip-path='url(#k)'>${p}</g><rect x='10' y='29' width='44' height='31' rx='3' fill='none' stroke='${O}' stroke-width='4'/>
        <rect x='6' y='19' width='52' height='13' rx='3' fill='url(#l)' stroke='${O}' stroke-width='4'/>
        <path d='M27 19L37 19L37 60L27 60Z' fill='url(#q)' stroke='${O}' stroke-width='3' stroke-linejoin='round'/><path d='M27 32L37 32' stroke='${O}' stroke-width='2.5'/>
        <ellipse cx='32' cy='19.5' rx='6' ry='5' fill='url(#r)' stroke='${O}' stroke-width='3'/>
        ${shine(15, 23, 6, 2.2)}<rect x='13.5' y='33' width='3.5' height='19' rx='1.75' fill='#fff' opacity='.3'/>${shine(30, 17.5, 2, 1.2)}${glint ? sparkle(56, 9, 6.5, '#fffbe0') + sparkle(5, 40, 4) : sparkle(56, 9, 5.5, '#fffbe0')}`,
    grad('b', [tint(c1, 0.22), hex(c1), tint(c1, -0.22)]) + grad('l', [tint(c1, 0.45), tint(c1, 0.08)]) + grad('r', [tint(c2, 0.5), hex(c2)]) + grad('q', [tint(c2, -0.12), tint(c2, 0.4), tint(c2, -0.12)], 1, 0)
        + `<clipPath id='k'><rect x='10' y='29' width='44' height='31' rx='3'/></clipPath>`);
}
// a pet: a round jelly critter in its colours (lighter on top, a shine), big eyes lit in its accent colour, a blush, and its parts:
// ears (1 pointed, 2 floppy, 3 long), a candy horn or reindeer antlers, a holly sprig, a tail (1 a puff, 2 a long curl)
const BODY = 'M32 15C47 15 57 28 57 43C57 55 46 60 32 60C18 60 7 55 7 43C7 28 17 15 32 15Z';
function critter(a, o) {
    o = o || {};
    const C1 = hex(a.c1), C2 = hex(a.c2), ol = `stroke='${O}' stroke-width='3' stroke-linejoin='round'`, M = `transform='matrix(-1 0 0 1 64 0)'`;
    let back = '', top = '', defs = grad('g', [tint(a.c1, 0.42), C1, tint(a.c1, -0.16)]) + `<g id='e'><ellipse cx='22.5' cy='36' rx='5.6' ry='6.6' fill='${O}'/><ellipse cx='22.5' cy='38.6' rx='3.7' ry='3.5' fill='${C2}'/><circle cx='24.4' cy='33.4' r='2.2' fill='#fff'/><circle cx='20.4' cy='37.6' r='1' fill='#fff'/></g>`;
    if (a.tail === 1) back += `<circle cx='53' cy='52' r='6.5' fill='${tint(a.c2, 0.1)}' ${ol}/>`;
    else if (a.tail === 2) back += `<path d='M48 54C61 57 65 44 58 37C55 34 51 37 54 40' fill='none' stroke='${O}' stroke-width='8.5' stroke-linecap='round'/><path d='M48 54C61 57 65 44 58 37C55 34 51 37 54 40' fill='none' stroke='${C1}' stroke-width='4.5' stroke-linecap='round'/>`;
    // (under antlers the pointed ears stand out sideways, a reindeer's)
    if (a.ear === 1 && a.horn === 2) back += `<path id='p' d='M12 32L0 15L24 20Z' fill='${C1}' ${ol}/><use href='#p' ${M}/><path d='M12.6 26.4L5 18L19 20.6ZM51.4 26.4L59 18L45 20.6Z' fill='${tint(a.c2, 0.25)}'/>`;
    else if (a.ear === 1) back += `<path id='p' d='M13 32L9 5L31 19Z' fill='${C1}' ${ol}/><use href='#p' ${M}/><path d='M15.6 26L13 11.5L25.6 19.6ZM48.4 26L51 11.5L38.4 19.6Z' fill='${tint(a.c2, 0.25)}'/>`;
    else if (a.ear === 2) back += `<ellipse id='p' cx='10' cy='35' rx='7' ry='14' transform='rotate(16 10 35)' fill='${C2}' ${ol}/><use href='#p' ${M}/>`;
    else if (a.ear === 3) back += `<ellipse id='p' cx='21' cy='12' rx='6.5' ry='14' transform='rotate(-10 21 12)' fill='${C1}' ${ol}/><use href='#p' ${M}/><ellipse id='i' cx='21' cy='13' rx='3' ry='9.5' transform='rotate(-10 21 13)' fill='${tint(a.c2, 0.2)}'/><use href='#i' ${M}/>`;
    if (a.horn === 1) back += `<path d='M25 20L32 1L39 20Z' fill='${C2}' ${ol}/><path d='M27.8 15.6L36.2 12.2M29.6 9.6L34.6 7.6' stroke='#ff3a5a' stroke-width='2.6' stroke-linecap='round'/>`;
    else if (a.horn === 2) {
        const h = o.antler || C2;
        defs += `<path id='h' d='M26 20C25 14 21 10 13 7.5M21 11.6L21.5 3.5M16 9L13 2.5M24.5 15.5L17.5 14.5'/>`;
        back += `<g fill='none' stroke-linecap='round' stroke-linejoin='round'><use href='#h' stroke='${O}' stroke-width='7.5'/><use href='#h' ${M} stroke='${O}' stroke-width='7.5'/><use href='#h' stroke='${h}' stroke-width='4'/><use href='#h' ${M} stroke='${h}' stroke-width='4'/></g>`;
    }
    // a holly sprig on top of the head (beside a horn): two spiky leaves, three red berries
    if (a.spike) {
        const [x, y, r1, r2] = a.horn === 1 ? [43, 18, -30, -105] : [32, 17, -62, -118];
        defs += `<path id='l' d='M0 0L4 -3.4L5.6 -1.4L8.6 -4.4L10 -1.4L14.6 -2.2L16 0L14.6 2.2L10 1.4L8.6 4.4L5.6 1.4L4 3.4Z' fill='${C2}' stroke='${O}' stroke-width='1.8' stroke-linejoin='round'/>`;
        top += `<use href='#l' transform='translate(${x} ${y}) rotate(${r1}) scale(.85)'/><use href='#l' transform='translate(${x} ${y}) rotate(${r2}) scale(.85)'/><g fill='#ff2a3a' stroke='${O}' stroke-width='1.5'><circle cx='${x - 2.6}' cy='${y + 1.4}' r='2.8'/><circle cx='${x + 2.6}' cy='${y + 1.4}' r='2.8'/><circle cx='${x}' cy='${y - 2.2}' r='2.8'/></g><circle cx='${x - 0.9}' cy='${y - 3.1}' r='.9' fill='#fff'/>`;
    }
    const nose = o.nose ? `<circle cx='32' cy='44' r='3.8' fill='#ff2a3a' stroke='${O}' stroke-width='2'/><circle cx='30.8' cy='42.8' r='1.2' fill='#fff'/>` : `<ellipse cx='32' cy='43.4' rx='2.3' ry='1.6' fill='${O}'/>`;
    return svg(`${back}<path d='${BODY}' fill='url(#g)' stroke='${O}' stroke-width='3.5'/><ellipse cx='32' cy='50.5' rx='14' ry='7.5' fill='${o.belly || tint(a.c2, 0.15)}'/>
        <ellipse cx='15' cy='45' rx='4.5' ry='2.8' fill='#ff4a8a' opacity='.4'/><ellipse cx='49' cy='45' rx='4.5' ry='2.8' fill='#ff4a8a' opacity='.4'/>
        <use href='#e'/><use href='#e' x='19'/><path d='M28 47Q30 50 32 47Q34 50 36 47' fill='none' stroke='${O}' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'/>${nose}
        ${shine(21, 24, 7.5, 3.2, -30)}<circle cx='13.6' cy='31' r='1.7' fill='#fff' opacity='.6'/>${top}`, defs);
}
// a sneaker, side on: the shape every pair of shoes uses (toe to the right), its sole, a fluffy cuff round the ankle
const shoePath = 'M6 40C6 30 10 22 18 20L28 18C30 26 36 30 44 31C52 32 58 35 59 42L59 47C59 50 57 52 54 52L10 52C7 52 6 50 6 47Z';
const solePath = 'M6 45L59 45L59 47C59 50 57 52 54 52L10 52C7 52 6 50 6 47Z';
const cuffPath = 'M12 23C8 19 12 13 17 15C18 10 25 9 27 13C31 11 35 15 32 20C33 24 29 26 26 24C23 27 19 26 18 24C16 27 12 26 12 23Z';
const ICONS = {
    spin: wheel(),
    // rebirth: two candy-cane arrows chasing each other round a gold star, on a mint orb
    rebirth: svg(`<circle cx='32' cy='32' r='27' fill='url(#b)' stroke='${O}' stroke-width='4'/>
        ${cane('M16 32A16 16 0 0 1 40 18M48 32A16 16 0 0 1 24 46', 5.5)}
        <path d='M34.7 24.3L48.7 23.1L42.7 10.5ZM29.3 39.7L15.3 40.9L21.3 53.5Z' fill='#ff2a4a' stroke='${O}' stroke-width='3' stroke-linejoin='round'/>
        <path d='${star(32, 32, 9, 4)}' fill='url(#y)' stroke='${O}' stroke-width='2.5' stroke-linejoin='round'/>
        ${shine(21, 15, 9, 4, -30)}`, grad('b', ['#c8fff0', '#2ed8a8', '#0e9a7e']) + GOLD),
    // a gift: a red present, a gold ribbon and bow
    gift: present(0xf03248, 0xffd23a),
    // the worlds: a snow globe with a little tree in it
    world: svg(`<clipPath id='c'><circle cx='32' cy='28' r='22'/></clipPath>
        <circle cx='32' cy='28' r='24' fill='url(#g)' stroke='${O}' stroke-width='4'/>
        <g clip-path='url(#c)'><ellipse cx='32' cy='50' rx='30' ry='12' fill='#fff'/><ellipse cx='32' cy='41' rx='17' ry='3' fill='#d8eeff'/></g>
        <path d='M32 10L41 23L37 23L44 34L20 34L27 23L23 23Z' fill='url(#t)' stroke='${O}' stroke-width='2.5' stroke-linejoin='round'/>
        <rect x='29.5' y='34' width='5' height='5' rx='1' fill='#a8642e' stroke='${O}' stroke-width='2'/>
        <circle cx='29' cy='21' r='1.8' fill='#ff3a4a'/><circle cx='35' cy='28' r='1.8' fill='#ffe24a'/><circle cx='27' cy='30' r='1.8' fill='#3ab4ff'/><circle cx='38' cy='31.5' r='1.6' fill='#ff3a4a'/>
        <path d='${star(32, 9.5, 5, 2.2)}' fill='#ffe24a' stroke='${O}' stroke-width='1.6' stroke-linejoin='round'/>
        <g fill='#fff'><circle cx='16' cy='24' r='1.6'/><circle cx='47' cy='18' r='1.8'/><circle cx='21' cy='13' r='1.3'/><circle cx='45' cy='33' r='1.5'/><circle cx='14' cy='35' r='1.2'/><circle cx='40' cy='12' r='1.1'/></g>
        <path d='M15 22A18 18 0 0 1 28 10' fill='none' stroke='#fff' stroke-width='3.5' stroke-linecap='round' opacity='.75'/>
        <path d='M12 47L52 47L56 60L8 60Z' fill='url(#b)' stroke='${O}' stroke-width='3.5' stroke-linejoin='round'/><path d='M11 53.5L53 53.5' stroke='#ffd23a' stroke-width='3'/>`,
    `<radialGradient id='g' cx='.38' cy='.32' r='.75'>${stops(['#ffffff', '#c4ecff', '#5aaef0'])}</radialGradient>` + grad('t', ['#7af08a', '#16983a']) + grad('b', ['#ff7a7a', '#b81030'])),
    // quests: a scroll with a list ticked off, a candy cane hooked on it
    quest: svg(`<rect x='9' y='9' width='36' height='46' fill='url(#p)' stroke='${O}' stroke-width='3.5'/>
        <rect x='5' y='4' width='44' height='10' rx='5' fill='url(#w)' stroke='${O}' stroke-width='3.5'/><rect x='5' y='50' width='44' height='10' rx='5' fill='url(#w)' stroke='${O}' stroke-width='3.5'/>
        <g fill='#fff' stroke='${O}' stroke-width='2.2'><rect x='13' y='19' width='8' height='8' rx='2'/><rect x='13' y='34' width='8' height='8' rx='2'/></g>
        <path d='M14 22L17 25.5L23 17M14 37L17 40.5L23 32' fill='none' stroke='#22c73a' stroke-width='3.4' stroke-linecap='round' stroke-linejoin='round'/>
        <path d='M26 23L38 23M26 38L38 38' stroke='#c8b090' stroke-width='3' stroke-linecap='round'/>
        ${cane('M53 59L53 19A6 6 0 0 0 41 19L41 22', 6)}${shine(14, 7, 6, 1.6)}`,
    grad('p', ['#fffaf0', '#f2dcb8']) + grad('w', ['#ffe8c0', '#d8a868'])),
    // settings: a frosty gear with a peppermint in the middle
    gear: svg(`<g fill='url(#m)' stroke='${O}' stroke-width='3.5' stroke-linejoin='round'>${[0, 45, 90, 135, 180, 225, 270, 315].map((a) => `<rect x='26' y='3' width='12' height='16' rx='3' transform='rotate(${a} 32 32)'/>`).join('')}<circle cx='32' cy='32' r='20'/></g>
        <circle cx='32' cy='32' r='11' fill='#fff'/>${swirl(32, 32, 11, ['#ff2a4a', '#fff', '#ff2a4a', '#fff', '#ff2a4a', '#fff'])}<circle cx='32' cy='32' r='11' fill='none' stroke='${O}' stroke-width='3'/>
        ${shine(23, 20, 7, 3.2, -35)}${shine(29, 27, 2.6, 1.3, -35)}`, grad('m', ['#ffffff', '#c4d0ec', '#7a88b4'])),
    // the shop: a red gift bag with a gold star, a holly-green band
    shop: svg(`<path d='M22 22C22 7 42 7 42 22' fill='none' stroke='${O}' stroke-width='6.5' stroke-linecap='round'/><path d='M22 22C22 7 42 7 42 22' fill='none' stroke='#ffd23a' stroke-width='2.8' stroke-linecap='round'/>
        <path d='M10 20L54 20L50 60L14 60Z' fill='url(#r)' stroke='${O}' stroke-width='4' stroke-linejoin='round'/>
        <path d='M10 20L54 20L53 30L11 30Z' fill='url(#g)' stroke='${O}' stroke-width='3' stroke-linejoin='round'/>
        <g fill='#fff'><circle cx='17' cy='25' r='1.6'/><circle cx='27' cy='25' r='1.6'/><circle cx='37' cy='25' r='1.6'/><circle cx='47' cy='25' r='1.6'/></g>
        <path d='${star(32, 45, 11, 5)}' fill='url(#y)' stroke='${O}' stroke-width='2.6' stroke-linejoin='round'/>
        ${shine(17, 40, 2.6, 7)}${shine(30, 40, 2, 1.2)}`, grad('r', ['#ff7a8a', '#d0102e']) + grad('g', ['#7af08a', '#16983a']) + GOLD),
    // the Shoe Shop: a red sneaker with a fluffy white cuff and a gold lightning bolt
    tongue: svg(`<path d='${shoePath}' fill='url(#r)' stroke='${O}' stroke-width='4' stroke-linejoin='round'/>
        <path d='${solePath}' fill='url(#s)' stroke='${O}' stroke-width='3' stroke-linejoin='round'/>
        <path d='M33 25L25 36L32 35L28 44L41 30L34 31Z' fill='#ffe24a' stroke='${O}' stroke-width='2' stroke-linejoin='round'/>
        <path d='${cuffPath}' fill='#fff' stroke='${O}' stroke-width='3' stroke-linejoin='round'/>
        ${shine(11, 36, 2.6, 5.5)}${shine(50, 35, 4, 1.8, 15)}`, grad('r', ['#ff8a8a', '#d0102e']) + grad('s', ['#ffffff', '#d8e4f4'])),
    // pets: a pink jelly reindeer, antlers and a shiny red nose
    pal: critter({ c1: 0xff86c8, c2: 0x4ad8ff, ear: 1, horn: 2 }, { nose: 1, antler: '#c07a3a', belly: '#fff0f6' }),
    // upgrades: a candy-cane wrench
    work: svg(`<pattern id='s' width='9' height='9' patternUnits='userSpaceOnUse' patternTransform='rotate(45)'><rect width='9' height='9' fill='#fff'/><rect width='4.5' height='9' fill='#ff2a4a'/></pattern>
        <path d='M44 6C52 3 60 10 58 18L51 13L45 17L46 25L53 28C47 34 39 32 37 26L15 51C10 56 2 50 6 45L30 19C27 13 35 6 44 6Z' fill='url(#s)' stroke='${O}' stroke-width='3.5' stroke-linejoin='round'/>
        <path d='M44 6C52 3 60 10 58 18L51 13L45 17L46 25L53 28C47 34 39 32 37 26L15 51C10 56 2 50 6 45L30 19C27 13 35 6 44 6Z' fill='url(#g)'/>
        ${shine(42, 10, 5.5, 2.2, -20, 0.6)}${shine(12, 46, 2.2, 1.2, -45, 0.6)}`, `<linearGradient id='g' x2='1' y2='1'><stop offset='0' stop-color='#fff' stop-opacity='.4'/><stop offset='.5' stop-color='#fff' stop-opacity='0'/><stop offset='1' stop-color='#000' stop-opacity='.2'/></linearGradient>`),
    // style (trails and auras): a rainbow swirl lollipop, sparkling
    style: svg(`<circle cx='32' cy='33' r='26' fill='#fff' stroke='${O}' stroke-width='4'/>${swirl(32, 33, 24, ['#ff3a6a', '#fff', '#ffa82a', '#fff', '#ffe02a', '#fff', '#3ad860', '#fff', '#3ab4ff', '#fff', '#a85aff', '#fff'])}
        <circle cx='32' cy='33' r='24' fill='none' stroke='${O}' stroke-width='1' opacity='.25'/>${shine(21, 20, 9, 4, -35, 0.6)}${sparkle(55, 8, 6.5, '#fffbe0')}${sparkle(8, 56, 4.5)}`),
    // a Gem
    gem: svg(`<path d='M14 10L50 10L61 26L32 58L3 26Z' fill='url(#g)' stroke='${O}' stroke-width='4' stroke-linejoin='round'/>
        <path d='M3 26L61 26M14 10L22 26L32 58L42 26L50 10M22 26L32 10L42 26' fill='none' stroke='#fff' stroke-opacity='.5' stroke-width='2'/>
        <path d='M14 10L22 26L3 26Z' fill='#fff' opacity='.35'/>${shine(20, 16, 5, 2.5, -20, 0.7)}${sparkle(53, 50, 5.5)}`, grad('g', ['#ffd8ff', '#d070ff', '#8a2aff'])),
};
// a pair of shoes' picture for the Shoe Shop: its colours (the shoe c1, the cuff, the stripe and the laces c2), a glowing sole, wings on
// the best; the second shoe of the pair peeks out behind
// (the wing: three feathers fanned back from the ankle, outlined as one shape)
const FEATHERS = `<ellipse cx='10' cy='20.1' rx='9.5' ry='3.7' transform='rotate(198 10 20.1)'/><ellipse cx='11.9' cy='16.6' rx='9.5' ry='3.7' transform='rotate(222 11.9 16.6)'/><ellipse cx='15.1' cy='14.3' rx='9.5' ry='3.5' transform='rotate(246 15.1 14.3)'/>`;
export function tongueSvg(G) {
    const c1 = hex(G.c1), c2 = hex(G.c2), glow = G.glow > 0;
    const wing = G.wing ? `<g stroke='${O}' stroke-width='5'>${FEATHERS}</g><g fill='url(#w)'>${FEATHERS}</g><path d='M17 22L5 18M17.5 21L8 12.5M18.5 20L13 9' stroke='${tint(G.c2, 0.1)}' stroke-width='1.5' stroke-linecap='round'/>` : '';
    const glowFx = glow ? `<ellipse cx='32' cy='55' rx='29' ry='5.5' fill='${c2}' opacity='${f(0.3 + G.glow * 0.3)}'/>` : '';
    return uri(svg(`${glowFx}<g transform='translate(5 -6)'><path d='${shoePath}' fill='${tint(G.c1, -0.28)}' stroke='${O}' stroke-width='4' stroke-linejoin='round'/><path d='${solePath}' fill='${tint(glow ? G.c2 : 0xf4f6fa, -0.25)}' stroke='${O}' stroke-width='3' stroke-linejoin='round'/></g>
        <path d='${shoePath}' fill='url(#g)' stroke='${O}' stroke-width='4' stroke-linejoin='round'/>
        <path d='${solePath}' fill='${glow ? c2 : '#f4f6fa'}' stroke='${O}' stroke-width='3' stroke-linejoin='round'/>
        <path d='M33 27C38 32 46 34 55 36' stroke='${O}' stroke-width='6.5' fill='none' stroke-linecap='round'/><path d='M33 27C38 32 46 34 55 36' stroke='${c2}' stroke-width='3.5' fill='none' stroke-linecap='round'/>
        <path d='${cuffPath}' fill='url(#c)' stroke='${O}' stroke-width='3' stroke-linejoin='round'/>${wing}
        ${shine(11, 36, 2.6, 5.5)}${shine(50, 36.5, 3.5, 1.5, 15)}${glow ? shine(20, 48.5, 8, 1.2, 0, 0.7) : ''}`,
    grad('g', [tint(G.c1, 0.3), c1, tint(G.c1, -0.15)]) + grad('c', [tint(G.c2, 0.5), c2]) + grad('w', ['#ffffff', tint(G.c2, 0.6)])));
}
// a pet's picture: its colours, ears, horn or antlers, holly spines and tail; eyes lit in its accent colour
export function palSvg(a) { return uri(critter(a)); }
// a Gift Box: a present wrapped in its colours (c1 the paper, c2 the ribbon and bow, c3 or c2 the pattern); the rarest ones sparkle more
const WRAP = { paper: ['dots', 'c3'], ribbon: ['zigzag', 'c3'], cocoa: ['waves', 'c2'], frost: ['flakes', 'c3'], candy: ['stripes', 'c2'], starry: ['stars', 'c2', 1], aurora: ['waves', 'c2', 1], jolly: ['stars', 'c3', 1] };
export function jawSvg(J) {
    const w = WRAP[J.id] || ['dots', 'c3'];
    return uri(present(J.c1, J.c2, w[0], J[w[1]], w[2]));
}
export function installIcons() {
    const st = document.createElement('style');
    st.textContent = Object.entries(ICONS).map(([k, s]) => `.ic-${k}{background-image:url("${uri(s)}")}`).join('\n');
    document.head.appendChild(st);
}
