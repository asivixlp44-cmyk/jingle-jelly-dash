# [🎅] Jingle Jelly Dash

A multiplayer "+1 Speed" escape runner for the browser, built with **Three.js** and **Colyseus** for Bloxity. **Every step you take is +1 Speed, and every step squishes.** Train on the candy-cane treadmills of Jingle Square, then dash down the Jelly Run: a long Christmas course carpeted in giant wobbling jelly, cut into fifteen stages, each behind a ribbon gate that only opens to enough Speed. The moment you step into a stage its **Wobbler** (a giant jelly monster) plops down behind you and bounces after you. Leap the syrup pools, hop the candy bars, jump the sliding gift boxes, time the swinging ornaments and outrun it to the **Win Pad** at the stage's end for Wins. Buy faster shoes, open Gift Boxes for pets, rebirth, beat each world's boss to open the next, and press **PLAY** to race five others in **Avalanche Rush** with a wall of snow rolling in behind.

The genre, the core loop and the pacing follow the Roblox game *[+1 Speed Jelly Escape](https://www.roblox.com/games/119794319382738/1-Speed-Jelly-Escape)* (see the video in `reference/`). Everything players see and hear is our own: the name, the four Christmas worlds and their stages, the Wobblers, the jelly, the treadmills, the gates, the shoes, the pets and Gift Boxes, the HUD art, the text, the sounds and the music. Avalanche Rush isn't in the reference.

**There are no in-app purchases.** Everything costs Wins (from Win Pads and races) or Gems (from quests, daily tasks, races, gifts, the wheel, the daily reward and codes).

It shares its engine with the other Legion games: the server, Bloxity login and avatars, the top games' character animation, the camera and lighting rig, the quality system, profiles, saves, play stats, test scripts and deploy workflow. It is forked from Rift Runners (+1 Speed Solo Leveling Escape), the newest Legion game when this one started and the same genre, so it already had the PLAY queue, the start line, bot takeover, the per-mover snapshot buffer, far-avatar LOD and the whole test suite.

## Project layout

| Folder | What it is |
|---|---|
| `client/` | Vite + Three.js client. **`main.js`**: boot and warm-up, your runner on the shared physics, steps with prediction, treadmills, gates, the Wobblers (yours and everyone's), hazards, who's squashing the jelly, the guide chevrons, the camera, keyboard / mouse / touch / controller, other players smoothed on the server's clock, the network, your race, the QA autopilot. **`world.js`**: a world on screen: Jingle Square, the Jelly Gate's wreath, the treadmills, the Gift Boxes, the course with its candy walls, ribbon gates, obstacles, Win Pads and end arch. **`jelly.js`**: the jelly (two instanced shapes, chunked, squashing and rippling in the vertex shader). **`shades.js`**: the four Wobblers and their bosses. **`arenaview.js`**: a race's lanes and the avalanche. **`chars.js` + `avatar.js`**: characters with their shoes. **`pals.js`**: every pet in one draw. **`ui.js` + `index.html`**: the HUD and panels. **`icons.js`**: the HUD's drawn icons, a picture of every pair of shoes, pet and Gift Box. **`asmr.js`**: the squishes, crunches and the rest, synthesised at load. Also `audio.js`, `fx.js`, `engine.js`, `geo.js`, `signs.js`, `smooth.js`, `blobs.js`. |
| `server/` | Colyseus 0.18 server. **`RunRoom.js`** (the `run` room): steps and their two token buckets, the stride check, the move guard, the gates, the Wobblers and their catches, revives and checkpoints, Win Pads, shoes, upgrades, trails, auras, treadmills, Gift Boxes, teams, rebirths, worlds, the wheel, tasks, quests, rewards, codes, the square's bots. **`Match.js`**: the PLAY queue, the start line, the race, its bots, the avalanche, the prizes. Also profiles (MongoDB on Legion), leaderboards, play stats. |
| `shared/` | **`config.js`**: shoes, Levels, upgrades, trails, auras, treadmills, pets and Gift Boxes, the worlds and every stage's gate and pay, run speed, the Wobblers' speed, what a race is like at a Level and what it pays, tasks, quests, rewards, codes. **`world.js`**: where everything stands, every stage's obstacles from its seed, the sliding gift boxes, the physics. **`arena.js`**: a race's course from its seed, the avalanche. **`physics.js`**: moving and jumping, the move guard. |
| `tests/` | The test scripts (see Testing) and the setup-page generator |
| `covers/` | The two store covers (1920x1080, 800x800), rendered from the game |

## Run it locally

Needs Node 20 or newer. Double-click `start-local.bat`, or:

```sh
npm install          # installs client and server too
npm run build        # builds the client into client/dist
npm start            # server + game on http://localhost:3017
```

For development, run `npm run dev:server` and `npm run dev:client`, then open http://localhost:5579. The client talks to the server on port 3017 (`VITE_SERVER_URL` overrides that).

- Dev builds, or a build with `VITE_QA=1`, expose `window.__qa`: the autopilot, perf readings, teleports.
- Restart the server after changing `shared/`.
- For testing only, `QA=1` lets the client give itself Speed, Wins, Gems, levels, rebirths and shoes (`__qa.give`) and pick a race's map and Level. It is refused on Legion.

## Gameplay

- **Steps.** Run (WASD, the stick, the left stick) and every stride is a step: **+1 Speed**, times your shoes, Level, rebirths, pets, trail, aura, upgrades and the world you're in. A stride gets longer the faster you go, so you take about 7 steps a second at most. Every 25th step is a **Mega Squish**, x5.
- **The jelly.** The whole Jelly Run (and four beds in Jingle Square, and every race lane) is carpeted in domes of jelly in the world's colours. Each dome squashes flat under whoever is on it, every footstep sends a ripple out that sets the domes round it jiggling and settling, and a Wobbler's hops shake everything near it. Every step on jelly is a squish (on the square's snow it's a crunch).
- **Treadmills.** Nine belts in the square. Step on one and stand still: you run in place by yourself (4.5 steps a second), and holding **DASH** (Shift, a click, the button, RT) sprints at 9. Every step on a belt counts for its multiplier:
  - x1 Gumdrop, x2 Peppermint (1 rebirth), x3 Gingerbread (2), x5 Frosted (3), x8 Golden Bell (5), x12 Ice Crystal (7), x20 Aurora (10).
  - x35 Jingle (120 Gems) and x60 North Star (400 Gems).
  - A locked belt sits still and dark with a red cross on its screen.
- **Speed is how fast you run.** Run speed grows with the log of your Speed against the world's scale, from 16 studs a second up to about 75. Every new world starts slow again. **Sugar Rush** adds on top. **PACE** (L, RB, the button) holds you back to 75% or 50% for the tricky bits, but a Wobbler still comes at your full speed.
- **The Jelly Run.** Fifteen stages in each of four worlds, each stage sized for about five seconds' running at its own pace (140 to 400 studs).
  - **Gates.** A ribbon gate at the start of each stage opens only to enough Speed: 12, 40, 135, 450, 1.5K ... 27M in Jingle Village, then far more in each world after. A shut gate shows its curtain of light and what it wants.
  - **Every stage is a challenge of its own** (`shared/stages.js`), so no two in a row play alike. Each world runs through them in its own order, harder further in; the stage's name and a one-line tip show as you step in:
    - **Jelly Field**: jelly all over, syrup pools to jump, sugar-rush chevrons. The first stage of every world.
    - **Gumdrop Hop**: the floor is hot syrup; jump from one jelly platform to the next (they squash as you land). Run speed is held to the stage's own pace here, so a hop is a hop however much Speed you have.
    - **Jelly Bouncers**: syrup too wide to jump; land on the giant jelly trampolines and each throws you on to the next.
    - **Peppermint Sweeper**: giant candy-cane bars spin round a post right across the way (two crossed, later on): jump them.
    - **Snowball Roll**: giant snowballs roll down the lanes at you: pick your lane.
    - **Gumball Drop**: gumballs fall out of the sky where the shadows grow: keep moving.
    - **Jelly Walls**: wobbling walls of jelly right across: **DASH** into one to burst through; run into it and it bounces you back.
    - **Cookie Crumble**: a bridge of cookie tiles over syrup; each one cracks and drops a moment after you step on it.
    - **Frosty Slide**: slippery ice with pools and candy canes; you slide where you were going.
    - **Present Pushers**: giant gift boxes sliding from wall to wall: time it, or jump them.
    - **Ornament Alley**: giant ornaments swinging across, one after another.
    - **Candy Cane Maze**: walls of presents with one gap each, left and right in turn.
    - **Boss Gauntlet**: jelly walls, a sweeper and presents, with the world's boss behind you.
  - A hit knocks you back; a fall in the syrup sends you back to the stage's gate.
  - **Against the clock.** The server times every run through a stage, from going in to the Win Pad (a revive doesn't stop the clock), and keeps your best for each: "⏱ 5.8 s · NEW BEST! (was 6.2 s)".
  - **Golden Candies.** Three in every stage (180 in all), off the quick way: on a side platform, at the top of a bounce, at the end of a crumbling branch, in a sweeper's path. Each pays 2 Gems and Speed (5 Gems more for a stage's third), every 9 in a world a Lucky Wheel spin. The stage bar shows how many of the stage's you have, the Worlds card each world's. The server checks you were really there.
- **The Wobblers.** Step into a stage and its Wobbler plops down at the gate behind you: a Gumdrop Gobbler, a Marmalade Muncher, a Blue Razz Blob or a Grape Glutton. Each world's last stage brings its boss, nearly twice the size: the Gobbler King, the Caramel Colossus, the Frostberry Queen, the Midnight Monarch.
  - It hops after you at 70% of your top speed in the first stage, up to 92% in the last. **Wobble Ward** slows it.
  - Run flat out and it falls behind; stop, get knocked back or zigzag too much and it catches you.
  - The stage bar at the top says how far behind it is and turns red when it's close.
  - **Caught:** revive on the spot for 5 Gems (it comes again from well back), or go back to the stage's gate. You get 6 seconds to choose.
  - Reaching the Win Pad is an **escape**.
- **Win Pads** at the end of each stage pay Wins: x3 the first time each rebirth, and again every 30 seconds. **TO STAGE** warps you to the furthest stage you've reached that your Speed opens; **TO TREADMILLS** takes you back to your best belt.
- **Levels and rebirth.** Speed fills the Level bar, and every Level adds to every step, up to the **Level cap** (10, then +3 each rebirth).
  - **Rebirth** (at the cap, for Wins: 60, then x2.4 each time): back to Level 1 and 0 Speed, so the gates close again. In return every step gives x1.5, x2, x2.5... for good, and the cap goes up.
  - You keep your Wins, shoes, pets, upgrades, trails, auras and Gems. Rebirths open belts.
- **The Shoe Shop.** Sixteen pairs for Wins, from Cozy Socks to Jolly Legend Boots. Each adds Speed to every step and everyone sees them on your feet: their colours, a glowing sole on the better ones, wings on the best.
- **Gift Boxes and pets.** Eight Gift Boxes, five pets in each (50 / 30 / 14 / 5 / 1%), forty in all: snow bunnies, gummy bears, reindeer with antlers, penguins, a Jolly Jelly King... each following you round. Open one or three at a time; a finished collection pays Gems. Three on your team at first, up to six (**Pet Igloo**). The best go on your team by themselves until you choose your own.
- **Upgrades** (Wins, kept when you rebirth): Bouncy Soles, Sugar Rush, Wobble Ward, Jelly Springs (jump higher), Mega Squish (sooner), Lucky Bells (more Wins), Pet Igloo. **8 trails** for Wins and **5 auras** for Gems, both adding Speed to every step.
- **Four worlds:**
  - **Jingle Village**: a snowy morning, candy-cane walls, string lights, wreaths, strawberry, lime and pink jelly, cherry syrup.
  - **Gingerbread Glen**: a golden afternoon, gingerbread walls dripping icing, orange and caramel jelly, a sea of hot cocoa.
  - **Frostberry Falls**: ice and snow under an aurora, blue raspberry jelly, slush pools.
  - **Starlight Sweets**: a purple night of stars and floating rock candy, grape jelly, starry goo.
  - Beat a world's boss stage and the next one opens, through the arch at the far end.
- **Avalanche Rush** (PLAY, or walk through the gate):
  - **The queue.** Everyone who presses PLAY at about the same time goes in one race, and the queue shows how many were found ("2 / 6 found, starts in 7 s"). A late PLAY before the gun takes a bot's place on the start line.
  - **Bots** fill only the empty places. A bot takes over at once, under their name, from a player who leaves (after 6 seconds for a dropped connection).
  - **The course.** Six jelly lanes, each railed in its racer's colour, with the same pools, candy bars, ornaments, gift boxes, candy canes and boost chevrons in every lane.
  - **The avalanche.** A wall of churning snow wakes behind the start line and comes on faster and faster. Whoever it reaches is out where they stand, and the screen frosts over round the edges as it closes in.
  - **Fair speeds.** Everyone runs at about the same speed (your Speed counts only a little, on a log scale), so a new player with good jumps can beat a veteran. First through the portal wins; the rest get a last 12 seconds.
- **Content grows with you.** A race's Level is your Level plus 3 for each rebirth, and it decides:
  - the course's length (5 stretches at Level 1, up to 14),
  - the clock (57 s to 150 s),
  - ornaments from Level 4, sliding gift boxes from Level 6, candy canes from Level 8,
  - how fast the avalanche comes, how well the bots run,
  - and the prize.

  On the Jelly Run every stage needs about 3x the Speed of the one before and pays more Wins.
- **The rest of a session:**
  - **Quests:** a chain of 33 at the top of the screen (Golden Candies among them), each paid as soon as it's done.
  - **Daily tasks:** 3 a day (Wins, steps, stages cleared, Wobblers escaped, Golden Candies, Mega Squishes, races, Gift Boxes...).
  - **The Lucky Wheel:** a free spin every 7 minutes of play, up to 3 saved.
  - **Daily reward** over 7 days, **FREE gifts** at 2 / 5 / 9 / 14 / 20 / 30 / 45 minutes, and **x2 Speed** and **x2 Wins** for Gems.
  - **Codes:** `JINGLE`, `JELLY`, `SPEED`, `SQUISH`, `BLOXITY`, `LEGION`.
  - **Leaderboards:** Most Wins, Fastest (top Speed) and Races Won.
  - **Titles** over your head that grow with the stages you clear, from Snow Sprout through Jelly Jogger and Candy Sprinter to Jingle Champion, Jelly Legend and North Star Legend.
  - **The guide:** chevrons on the ground flow from you to what to do next: train, the Jelly Run, the next pad, through the next gate, home when it's shut, the quest's place.
- **Pacing** (`tests/economy.mjs`): a simulated first session on the real formulas. It trains on its best belt at 6.5 steps a second, runs whatever the gates open, gets caught or falls in a pool 12% of the time, and buys what it sensibly can.

  | When | What |
  |---|---|
  | 0:16 | Stage 1 cleared, first Win Pad |
  | 0:38 | Stage 4 |
  | 0:40 | First shoes and first Gift Box |
  | 2:56 | First rebirth |
  | 7:43 | Stage 8 |
  | 14:12 | Stage 10 |
  | 21:01 | Stage 11 |
  | 30:21 | Stage 12 |
  | 52:03 | Stage 14 |
  | about 72 min | The Gobbler King beaten, Gingerbread Glen opens |

  A rebirth comes every few minutes early on, and a race every six minutes. It's a simulation, not a person's session: nobody has playtested the pacing yet.
- **The server decides:**
  - **Steps.** Every step counts against a token bucket (14 a second on the ground, about 10 on a belt). A step on the ground also needs a stride's worth of distance that the move guard accepted, and a step on a belt needs you to be standing on an open belt.
  - Every gate, Wobbler, catch, revive, pad, purchase and race result, and every race's avalanche.
  - **Moves.** Moving further than you could run (dash and boost included), higher than a jump goes, or through a gate your Speed doesn't open is sent back.
  - **Wobblers.** A Wobbler is four numbers on the server's clock (stage, start time, start point, speed) that every screen works out the same way. A catch is judged against where your screen said you were at the time it said so, so a 350 ms round trip doesn't cost an honest runner.
- **On your screen first.** Your own movement runs on your device. Your Speed and the gates show each step at once, and each answer from the server takes off the steps it covers, so nothing jumps back over a long round trip.
- **Far from the servers** (300-400 ms round trip from Sri Lanka): the server's clock is corrected for the round trip. Others are drawn a little in the past on it, between snapshots stamped with server time, and each mover's delay follows how late its own snapshots arrive.
- **A dropped connection** reconnects by itself within 30 seconds and is told where things stand. A Wobbler doesn't chase someone who isn't there: you come back at the stage's gate. Dropped for over 6 seconds in a race, a bot carries on for you and you come back to the square.
- **Portrait phones:**
  - The HUD sizes itself by the screen's width.
  - The quest sits right of the Bloxity corner, and the menu is a strip under it, so the middle of the screen stays clear.
  - The stick, DASH and JUMP sit above the Level bar, and the scoreboard is two columns at the top.
  - The camera widens and pulls back, and widens further the faster you run.
  - A button works with a thumb still on the stick.

## Controls

| Action | Keyboard / mouse | Controller | Touch |
|---|---|---|---|
| Run | WASD / arrows | Left stick | The stick |
| Jump (hold to keep hopping) | Space | A | JUMP |
| Dash / sprint on a treadmill (hold) | Shift, F, Enter, a click on a belt | RT, LT or X | DASH |
| Use (the Shoe Shop, the Upgrades, a Gift Box, the portal) | E | Y | Tap the bubble |
| Camera | Drag, wheel | Right stick, R3 to zoom | Drag, pinch |
| To a stage / to the treadmills / home | B / B / R | Y with nothing near / L3 | TO STAGE / TO TREADMILLS |
| Race / Pace | P / L | LB / RB | The buttons |
| Shoes / Pets / Upgrades / Wheel / Quests / Shop | Z / J / U / C / Q / G | D-pad to the HUD's buttons, A to press; View for Quests | The buttons |
| In a panel | Mouse, Esc | D-pad or left stick moves the ring, A presses, B goes back, LB / RB change tabs | Tap |

## Sound

- **Squishes and the rest** are synthesised sample by sample while the game loads (filtered noise, resonances and pitch sweeps, a few variations of each): a soft wet jelly squish for every step on jelly, a crunch for a step in the snow, a splat and a boing for a landing, the Mega Squish's big squish and sparkles, a glass bauble's bonk when an ornament or a gift box knocks you, a sugar rush's zap and jingle, the wind of a dash, a plunge into syrup, a treadmill whirring up. A sound in play is one buffer source and a gain (and a panner for someone else's), never more than 22 at once.
- **Effects** for buying, Level Up (a bell arpeggio), a Gift Box (paper ripping and a chime), Win Pads, a gate opening, a Wobbler landing behind you (a gloopy burble), being caught (a gulp), a revive and an escape.
- **Music**, all our own and all generated: "Gumdrop Shuffle" (a bouncy swung G-major tune at 120 BPM: glockenspiel and celesta over a walking pizzicato bass, sleigh bells, a warm pad) in the square and down the stages, and "Avalanche Rush" (a galloping D-minor chase at 160 BPM: sleigh bells on every sixteenth, a bright lead, big drums) in a race. Each is rendered once into loops by an OfflineAudioContext behind the loading screen and plays from memory; on Low it is never played note by note.

## Graphics and performance

- **The top games' lighting** (hemisphere 1.1, ambient 0.45, sun 1.5, PCF shadows, no tone mapping). **Only matte (Lambert) and unlit materials**: no reflections, no environment map, no bloom or post-processing. Each world has a mood that only tints that rig: a crisp winter morning over Jingle Village, a golden afternoon over Gingerbread Glen, a clear pale blue with an aurora over Frostberry Falls, a purple night with stars and a pink-and-gold aurora over Starlight Sweets. Snow falls in the two snowy worlds; sugar glints and stardust drift in the others.
- **Our own art, all built here**: Jingle Square with its snowy tiles and peppermint paths, gingerbread market stalls under striped roofs heavy with snow, string lights, candy-cane lamp posts, Christmas trees hung with baubles, snowmen, piles of presents; the giant wreath of the Jelly Gate with its bow, bells and a ring of gold light; candy-cane treadmills with scrolling belts and glowing consoles; Gift Boxes turning over their stands; the course's candy walls with candy-cane pillars, swags of lights, wreaths and stockings, icing dripping in Gingerbread Glen, icicles in Frostberry Falls, stardust in Starlight Sweets; ribbon gates with a great bow and a curtain of light; moving syrup pools (cherry, caramel, blue razz slush, starry goo); candy bars, candy canes, walls of presents, giant ornaments swinging from candy-cane beams, gift boxes sliding from wall to wall; Win Pads with a gold star and a beam of light. Four Wobblers and their bosses, shoes on every character's feet (glowing soles, wings on the best), forty pets with glowing eyes, chunky outlined lettering on every sign, glossy SVG HUD icons.
- **The jelly** (`jelly.js`): every dome is an instance of one of two shapes, a fluted jelly mould close up (84 triangles, 70 on Low) and a plain low dome further off (35, 30 on Low). The domes are kept in chunks of 36 studs along the course; each frame the chunks the camera sees are picked (near ones fluted, far ones plain, the rest none, the rest of a world's 6,000-odd domes never drawn) and only when that choice changes are their instances copied into the two meshes: two draws for all the jelly in view. The squash under a runner (up to 8 at once), the ripple of the last 16 footsteps and the idle wobble are all in the vertex shader. Its shine is painted on (fixed), not a reflection.
- **Draw calls**: static things are merged per stage into one **BatchedMesh** per material. Each stage is culled on its own by the camera and the sun's shadow view, and also when it lies beyond the fog. Its draw list changes only when one comes into view or goes out. The small things (string lights, wreaths, icing drips, the little canes on the wall tops, floor stripes) are in a **detail kit** per stage, drawn only within 175 studs (120 on Low) and never in the shadow pass. Treadmills' belts, Gift Boxes, ornaments, sliding gift boxes, stars and beams are instanced. The stages' own moving things (sweeper bars, snowballs, gumballs, jelly walls, cookie tiles, Golden Candies) are instanced too, and only the ones within 300 to 480 studs of the camera are drawn (an instanced mesh down the whole course is never culled); the jelly walls are solid with no see-through dither, so the nearest hides the rest before they are shaded; every gate curtain, beam, portal and halo is one draw of light; every floating sign is one draw. A Wobbler is 2 draws. Far characters drop their accessories, shoes and team.
- **Typical views:**

  | Quality | Draw calls | Triangles |
  |---|---|---|
  | Low | 19-35 | 53-79k (a race 53-58k) |
  | Medium | 21-36 | 114-154k (a race 142k) |

  Before the detail kits, plain stripes and simpler canes the square alone was 314k triangles on Medium; `tests/tris.mjs` lists where they go.
- **Close to the camera**: an ornament swinging past the lens, a Wobbler at your heels, a gift box, a Win Pad's star and the nearest jelly dissolve in a fine checker, so nothing fills the screen and hides you.
- **Weak devices** start on **Low**: phones, and PCs with 4 cores or fewer, 4 GB or less, older Intel HD/UHD 6xx, small Radeons or software renderers.
  - Low means no shadow code, no multisampling on PCs (decided before the WebGL context exists), sparser jelly with simpler domes, fewer details, fewer floating numbers while running, a cap on footstep sounds and no speed lines.
  - Below 54 FPS the resolution steps down first, then the quality below 45.
  - On a 120 Hz+ screen, when frames are uneven, the game draws every other refresh.
- **Made for low-end PCs and phones** (what a weak device was paying for, found with Chrome traces, CPU and heap profiles on a 4x-throttled CPU):
  - **Screen confetti** is a full-screen 2D canvas redrawn every frame it falls: on Low a handful of paper bits (30%, at most 24), and none for a Win Pad (the coins and the burst round you are enough). It caused most of the long frames.
  - **Music**: its loops are synthesised in the background after loading; on Low only the calm loop of each song is made (2, not 5), so a weak device isn't synthesising megabytes of notes while you play.
  - **Signs**: all 77 floating signs share one canvas atlas. A sign whose words change (a gate opening) now uploads only its own cell (about 270 KB) instead of the whole 20 MB atlas, and the lettering is drawn straight into its cell, not into a canvas of its own first (sign painting at load: 2 s to 0.3 s at 4x throttle). On Low the atlas is smaller (13 MB).
  - **Memory**: the scenery's builders let go of their vertex arrays once they're on the graphics card (plain arrays of numbers for a whole course were ~55 MB of the JavaScript heap: 177 MB to 90 MB on the dev build).
  - **Draws**: a stage-effect mesh with nothing near the camera isn't drawn at all (an empty instanced draw still costs its whole set-up): 33 draws to 25 on Low while running.
  - **The stage bar** rewrites its "studs behind" only when the number you'd notice changes (to the stud when it's close, in fives further off), not 30 times a second.
  - **Loading on Low** paints the pop-ups of play and the first menus behind the loading screen; the big menus (pets, gift boxes, boards) are laid out when first opened.
- **Loading**:
  - Every shader is compiled and drawn once behind the loading screen: the course and its batches, the jelly (both shapes), instanced props, shadows, the light, the four Wobblers, pets, signs, a whole race's course with its jelly, gift boxes and avalanche, effects, the avatar. This world's Wobblers (a few, and the boss) are built then too, never mid-run.
  - Every HUD screen and panel, the revive prompt included, is painted once. Every emoji is drawn once in the page and once in a canvas. The GPU's name is read once.
  - Music renders once into loops in the background.
  - `tests/warm.mjs` does everything a player can do, every kind of stage included: 43 shaders after loading on Medium, 37 on Low, and **none compiled in play**. Going into a race compiles 2 more and a new world 6, both behind the fade.
- **The HUD** writes to the page only when a value changes and moves its bars with transforms. Nothing in the frame loop reads layout.
- **The CPU profile** (`tests/perf.mjs profile`: unminified dev build, weak laptop, Low, CPU 4x, running the Jelly Run):
  - 47% of the samples are native work outside JavaScript (the browser and the graphics driver) and 3% idle.
  - The largest JavaScript items are three.js's draw setup at about 2% each.
  - The frame's own work is about 8 ms at 4x throttle (update 2.3, camera and sky 0.7, render 5.1), so about 2 ms on a normal laptop.
  - Layout and style reads: 0.00%. Audio-node calls were 4%: the music's loops rendering in the background in those first seconds.
- **Measured** on this PC: Intel UHD Graphics on ANGLE D3D11 (forced with `LOW_GPU=1`), Chrome, headless, a 144 Hz display, the automatic resolution step-down switched off. Frames drawn per second, with the 95th percentile frame interval in brackets. *Paced* means the game was drawing every other refresh of the fast screen.

  | Device | Running the Jelly Run (autopilot, a Wobbler behind) | Sprinting on a treadmill | At a shut gate far up | At the spawn | In a race | Load + join (dev build) |
  |---|---|---|---|---|---|---|
  | Desktop, 1920x1080, High | 73 FPS (21 ms) | 68 FPS, paced (7 ms) | 72 FPS, paced (7 ms) | 65 FPS, paced (14 ms) | 97 FPS (14 ms) | 9 s |
  | Desktop, 1600x900, Medium | 98 FPS (21 ms) | 79 FPS, paced (21 ms) | 72 FPS, paced (7 ms) | 72 FPS, paced (7 ms) | 72 FPS, paced (7 ms) | 6 s |
  | **Weak laptop**: CPU throttled 4x, 1366x768, Low | 51 FPS (42 ms) | 68 FPS (21 ms) | 69 FPS, paced (14 ms) | 62 FPS, paced (14 ms) | 80 FPS (21 ms) | 13 s |
  | **Phone**: 844x390 @2x, touch, Low, CPU 4x | 62 FPS (35 ms) | 84 FPS, paced (21 ms) | 71 FPS, paced (14 ms) | 64 FPS, paced (14 ms) | 66 FPS, paced (21 ms) | 13 s |
  | **Phone**: 390x844 @2x, touch, Low, CPU 4x | 57 FPS (49 ms) | 63 FPS, paced (14 ms) | 67 FPS, paced (14 ms) | 68 FPS, paced (14 ms) | 63 FPS, paced (14 ms) | 12 s |

  Measured after the low-end work above, with the 13 kinds of stage in (running the Jelly Run on the weak laptop was 17 FPS before it, the phones 21-22, desktop Medium 41). This PC's graphics chip was shared with another busy browser while measuring, so these are on the low side: the same run gave 50 FPS to 86 FPS stage by stage on the weak laptop. In a 10 s CPU profile of the portrait phone running the Jelly Run, no frame's JavaScript took over 35 ms; the long frames left are the page waiting on the graphics process.

  - **The frame's work** at 4x throttle: 5.2 ms on the weak laptop running the Jelly Run, 6.3-7.6 ms on the phones.
  - **Stalls:** at most 4 frames in a measuring window went over 50 ms on the throttled devices; the longest outside those windows line up with the fade into a race as its course is built.
  - **Caveats:** numbers move between runs and with what else the PC is doing. The phones here are simulated: the game has not yet been measured on a real phone or on the Legion servers.

## Testing

Test tools install on their own: `npm --prefix tests install`. Browser runs need Chrome (`CHROME=<path>` chooses which). They use their own server port (3027), so a game running on 3017 can stay up.

- **`tests/server.test.mjs`, a headless server test** (83 checks, all passing). It covers:
  - A new player's start, ping and the clock, the bots.
  - **Steps:** standing still counts nothing; no more steps than strides run; a batch's limit.
  - **Treadmills:** only open ones, only standing on them, their clock-limited bucket; Mega Squishes; Levels.
  - **Gates:** a shut gate sends you back, an open one lets you through; too far, too high.
  - **Win Pads:** not on it, x3 the first time, not again at once, a pad you're not on.
  - **A Wobbler:** it wakes behind you at its share of your top speed; standing still it catches you; moves while down are ignored; reviving needs Gems; revived where you went down with the Wobbler coming again from well back; reaching the pad is an escape; back to the gate by choice or after 6 s; a syrup pool sends you back, a fall somewhere you're not doesn't.
  - **Spending and rewards:** shoes, upgrades, a trail, an aura, a Gem belt, three Gift Boxes and the auto team; the daily reward, a gift before and at its time, codes, the wheel, quests.
  - **Rebirth** (below the cap, what it resets, what it keeps) and **the worlds**; warps (no further than your gates open).
  - **A second player** sees the first.
  - **Races:** the queue for two, one race, bots filling, a late PLAY taking a bot's place; nobody runs before the gun, out of your lane is sent back; finishing; standing still the avalanche takes you; a leaver's bot under their name; places and prizes.
  - Nonsense messages; the save on rejoining.
- **`tests/economy.mjs`, a simulated first session**, for the pacing above.
- **`tests/autopilot.mjs`, browser runs with the autopilot:** one press of SPACE gives one jump; the whole loop (steps, a treadmill, into the Jelly Run, a Win Pad, shoes bought, Stage 4 cleared with Wobblers on its heels); full races on all four maps at Levels 2, 9, 20 and 40; stages cleared in every world; no snaps, no console errors. The autopilot jumps the sliding gift boxes.
- **`tests/latency.mjs`, a 350 ms round trip** through a relay, two real browser players: the round trip measured, Speed never jumping back while sprinting, every step getting there, straight through a gate that opens with no snap, a bot smooth from far away, one queue and one race, each seeing the other.
- **`tests/reconnect.mjs`, a dropped connection** in the square and in a race, short and long: it reconnects by itself, steps still count, a bot takes over, nobody's stuck on a course.
- **`tests/prod.mjs`, the production build with real input only.** No QA hooks: keyboard, mouse and touch, with the game's words on screen as the only way to know what happened. It runs:
  - W to run (Speed goes up), into the Jelly Run, a Wobbler waking, off to the side of the first pool and back to the middle for the Win Pad (x3).
  - A typed code, shoes bought, a Gift Box opened, every menu button and its panel, the wheel.
  - TO TREADMILLS and a step onto the belt (it runs by itself; Shift sprints), the pace button, the daily reward.
  - The queue (found count, cancel) and a whole race on W and Space.
  - `loadingEnd()` called once, after joining a server, with a stand-in for the SDK.
  - On a portrait phone: the stick runs, DASH works with a thumb on the stick, the stick runs into the Jelly Run, a menu button by touch, a button with a thumb still on the stick.
- **`tests/gamepad.mjs`, a session with a controller alone** (a stand-in for the Gamepad API): running, looking, jumps, zoom, RT sprinting on a belt, X dashing, the Shoe Shop by Y and A, every HUD button and panel by the ring, Y to a stage and up it, a race, the results.
- **`tests/screens.mjs`, screenshots of every screen** at 390x844, 360x800, 375x667, 844x390, 667x375, 768x1024, 800x600, 1024x600, 1280x720, 1366x768 and 1920x1080. It covers the HUD, every panel, a Gift Box opening, the big moments with toasts up, a treadmill, a stage with its Wobbler, the revive prompt, a shut gate, the queue, a race and the results. The HUD's boxes and touch controls are measured for overlaps, anything cut off and the Bloxity corner.
- **`tests/passable.mjs`, every stage of every world passable:** the autopilot starts at each stage's gate with just the Speed it wants and its Wobbler on, and has to reach the Win Pad (a fall or a catch counts). **`tests/stages.mjs`** screenshots every stage kind.
- **`tests/perf.mjs`, frame rates** (`LOW_GPU=1` for the integrated chip; `profile` for a CPU profile of the dev build). **`tests/warm.mjs`** lists any shader compiled after loading. **`tests/tris.mjs`** lists where the triangles go in a few views. **`tests/squish.mjs`** looks at the jelly up close. **`tests/look.mjs`** takes a few fixed views; **`tests/covers.mjs`** renders the covers. QA helpers: **`tests/trace-pilot.mjs`** follows the autopilot up the first stages, **`tests/perf-split.mjs`** measures running the Jelly Run with one thing at a time switched off, **`tests/probe.mjs`** screenshots a spot.
- **The last full run** (9 November 2026, this PC): `server.test` 83 of 83; `autopilot`, `latency` (a 357 ms round trip), `reconnect`, `prod` (real input only, desktop and a portrait phone), `gamepad` and `warm` all good; `screens` clean at all 11 sizes (one overlap at 667x375, a long toast under a popup, fixed by a shorter tip); no console errors anywhere.
- **Not tested yet:** a real controller in a person's hands, a real phone, the Legion servers, the real Bloxity SDK (a stand-in here), and a person playing it. The pacing comes from the simulation and the autopilot.
- **Known limit:** syrup pools, ornaments, sliding gift boxes and boost chevrons are judged on the player's screen, not the server (in a race the server judges them for bots). A modified client could skip a pool's restart or a knockback. Refusing moves over them would pull honest players back at a 350 ms round trip, so it's left this way until it's shown to matter. Gates, Wobblers, steps, pads and the avalanche are all the server's.

## Hosting

See `bloxity-setup.html` (every field of Bloxity's Create New Game form, with copy buttons, and the two covers; `node tests/setup-page.mjs` writes it) and `.github/workflows/deploy.yml` (deploys to Legion on a push to `main`; prod at https://jingle-jelly-dash.play.bloxity.io once hosted). Play stats: `GET /api/stats?key=<stats key>&days=7` (the key is in `server/STATS_KEY.local.txt`, not in the repo): session length, time to the first Win Pad, steps, stages cleared, Wobblers escaped and caught, Gift Boxes, races, levels and rebirths gained, frame rate by device, errors.
