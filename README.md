# Gridiron 27

An original 3D American football game that runs in any modern browser on a laptop — Windows, macOS, Linux or ChromeOS. No install, no internet connection needed.

It is built around real football: 11-on-11 simulation, real schemes and playbooks, current pro rules (including the dynamic kickoff), a full season mode, and gameplay tuned against 2025 pro league averages.

> Gridiron 27 is an independent, original game. The league, all 32 teams, every player, and all artwork are fictional and procedurally generated. It is not affiliated with or endorsed by any real league, team, player or game publisher.

## Play it

**Easiest:** download [`Gridiron27.html`](Gridiron27.html) from this repository and double-click it. It opens in your browser and runs completely offline.

- Chrome, Edge, Firefox or Safari (current versions) with WebGL enabled.
- Plug in an Xbox or PlayStation controller for the best experience (press any button once so the browser sees it). The keyboard works for everything too.
- Graphics default to **Auto**, which lowers the render resolution if your laptop can't hold a smooth frame rate and raises it again when there's headroom; if it's still slow at the lowest resolution it switches off bloom and then the shadow map (the FPS meter shows "lite fx"). You can also pick Low/Medium/High, and turn on **Settings → Show FPS** to see the frame rate.

**From source** (needs Node 18+):

```bash
npm install
```

```bash
npm run build      # writes dist/ and Gridiron27.html
```

```bash
npm run dev        # live-reload server at http://localhost:8000
```

```bash
npm test           # headless CPU-vs-CPU games: realism stats, then a commentary check
```

## Modes

- **Play Now** — exhibition game. Pick any two teams and set each side to CPU, keyboard, or a gamepad (two humans = local head-to-head). Choose difficulty (Rookie, Pro, All-Pro, Legend), quarter length (1–15 min), accelerated clock, weather (clear, rain, snow, wind) and day or night.
- **Season** — take a franchise through a 17-game schedule, a 14-team playoff, and multi-year offseasons with aging, progression, retirements and a seven-round draft. Play or sim each week; set your own depth chart (or auto-sort it by rating); standings, league leaders, playoff bracket and championship history are tracked and saved in your browser.
- **Two-Minute Drill** — down 4 with 2:00 left and one timeout. Go win it.
- **Practice** — run any play against the CPU from the same spot, as offense or defense.
- **Coach mode** (Settings) — you call every play and make every decision (fourth downs, PATs, onside kicks, timeouts, audibles, hot routes, defensive adjustments); the CPU plays it out. Works in Play Now and Season.

## Controls

| Action | Keyboard | Gamepad |
|---|---|---|
| Move / sprint | WASD or arrows / Shift | Left stick / RT |
| Snap | Space | A |
| Throw to the highlighted receiver (the game keeps the best open man marked with a gold ring; a red BLITZ flag means throw it now) | Space: tap = the right pass for the throw, hold = bullet | — (use his button) |
| Change the highlighted receiver | Q / E | — |
| Throw to a specific receiver (the number/button floats over him; open receivers glow) | 1–5, or click/tap him | A B X Y RB (tap / hold) |
| Lob | Shift + 1–5 | LT + button |
| Lead the pass | Hold a direction while releasing | Left stick |
| Throw away | X | LB |
| Catch type while the ball is in the air: aggressive / possession / run-after-catch | hold R / C / E | hold Y / A / X |
| Zone read: keep it | move the stick at the mesh | left stick |
| Speed option: pitch to the back | X | LB |
| RPO: pull it and throw | the read receiver's key before the handoff | his button |
| Hot route / motion / audible | H / M / B | Y / LB / X |
| Hard count / protection slide / play art | K / L / I | — / — / LT |
| Juke / spin / stiff arm | Q E / R / F | Right stick ← → / B / A |
| Truck / hurdle / stutter / dive | C / V / X / Z | Right stick ↑ / Y / right stick ↓ / X |
| Protect ball | G (hold) | RB |
| Switch to the defender nearest the ball | Tab | B |
| Strafe (face the QB while you move) | hold C | hold LT |
| Play the ball / user interception (a ring shows where it's coming down) | hold R while the pass is in the air | hold Y |
| Dive tackle / hit stick / strip | Space / F / Q | X / right stick ↑ / RB |
| Swat | E | X |
| DL swim / bull rush | E / R | A / X |
| Defensive audible | B | X |
| Assign your defender (blitz, QB spy, hook/curl/flat/deep zone, man on a receiver, contain) | H | Y |
| Coverage adjustments (shade inside/outside, play underneath/over the top, press/off, show blitz, bail) | N | RB |
| D-line shift (pinch / spread) | J | LB |
| Kick meter (aim, power, accuracy) | ← → then Space ×3 | Left stick then A ×3 |
| Instant replay (after a play) | Y | Y |
| Timeout (also from the play-call screen) / pause | T / P or Esc | Back / Start |

The full list is in **Controls** on the main menu.

## What's inside

- **Simulation** (`src/sim/`): a 60 Hz physics and AI simulation of all 22 players.
  - **Blocking**: engagements resolve from block and shed ratings, with pass sets, run fits, pulls and double teams.
  - **Coverage**: man coverage with rating-based reaction lag; zone drops (deep halves, thirds and quarters, curl/flat, hook, Tampa) that read routes; pre-snap shading and press/off adjustments change the leverage defenders play with.
  - **Run defense**: linebackers key the back and fill; deep safeties read run at the snap and come down to alley fits (play-action pulls them up for a moment).
  - **Pressure**: pass rush with swim and bull moves, plus blitzes and spies; protection picks up rushers in its lanes, and quarterbacks see unblocked rushers and throw hot.
  - **Running**: ball carrier AI with lane vision and cutbacks; jukes, spins, stiff arms, trucks, hurdles and dives.
  - **Option football**: zone reads (the QB reads the unblocked end), speed option with a pitch read, and RPOs where the QB reads the conflict defender and either hands off or pulls it and throws. Defenses stay honest on the RPO receiver and play the pitch man; linemen obey RPO downfield rules.
  - **Tackling**: angle, gang tackles, broken tackles, forward progress and fumbles.
  - **Passing**: realistic drops and a read progression (quarterbacks throw on rhythm at the receiver's break, and aware ones anticipate it), a throwing motion during which the QB can still be sacked, lob/touch/bullet throws, pass placement, accuracy by depth, under pressure and on the run, aggressive / possession / run-after-catch catches, contested catches, deflections and interceptions.
- **Playbooks** (`src/data/`): over 110 offensive plays (including RPOs, zone reads and the speed option) across 14 formations and 48 defensive calls (Cover 0/1/2/3/4/6, Tampa 2, 2-Man, fire zones and blitzes) across 8 fronts. Six offensive styles give each team its own identity.
- **Rules**:
  - 2025/26 dynamic kickoff: landing zone, touchback at the 35, 40-yard spot on short kicks, declared onside kicks.
  - Overtime where both teams possess, then sudden death; playoff OT can't end in a tie.
  - Clock: two-minute warning, out-of-bounds restart rules, 10-second runoff, accelerated clock, timeouts.
  - Penalties: holding, pass interference, offside, false start, delay of game, intentional grounding.
- **CPU coaching**: situational play calling, fourth-down and two-point decisions, clock management.
- **Presentation**: broadcast-style drive summaries, scoreboard flashes, halftime and final box scores with a Player of the Game, instant replay, and six different touchdown celebrations.
- **Audio** (`src/audio/`): everything is synthesized in the browser, with no sound files.
  - **Broadcast booth**: play-by-play for every play, with names, yardage, field position and down and distance. A second voice adds color from the game's own stats (a receiver's catches and yards, a back's carries, the QB's line, the score after a touchdown, third-down conversions and stops). Lines are spoken by your browser's built-in voices; it prefers natural-sounding and on-device voices, so it also works offline. **Settings → Commentary**: Every play, Big plays only, or Off.
  - **Home crowd**: a layered crowd that pulls for the home team. It cheers big plays, groans at turnovers and opponent scores, and boos flags on the home team, with whistles and applause. It quiets down for the home offense and gets loud for third downs on defense, with a "de-fense" chant and claps.
- **Motion capture** (`tools/mocap/convert.mjs` → `src/data/mocap.json`): running at every speed, the backpedal, defensive slides and idle standing come from real motion capture. The converter retargets clips from the CMU Graphics Lab Motion Capture Database onto the game's rig by matching limb directions. Strides are cut into seamless loops, and their rate follows the player's speed. Ball-carry arms, leaning into cuts, stances and throws stay hand-tuned on top.
- **Passing help**: a human QB gets the best open receiver highlighted, weighted toward a gain and the sticks, and switched to the quick throw when a free rusher is coming. Receivers work back to the ball on your throws until you steer them yourself. On the easier levels the pocket holds a beat longer and blitzes arrive a beat later.
- **Players** (`tools/blender/player.py` → `assets/player.glb`, `src/render/athlete.js`): every player is a skinned 3D athlete built procedurally in Blender. It's an original design with no scanned or downloaded models. The build works in these steps:
  - The athlete in full pads is described as overlapping volumes with muscle-shaped cross-sections: broad shoulder pads with a raised arch and capped shoulders under the jersey, short tight sleeves, a V-neck collar, a tapered waist with the jersey bloused over the belt, a thick neck with the trapezius sloping into the pads, muscled arms, thighs and calves, thigh and knee pads under the pants, and low-cut cleats. They're fused with a voxel remesh and retopologized into clean quads.
  - The uniform is cut into zones along straight lines (jersey, belt, pants, socks, cleats, gloves, skin) and UV-mapped, so team colors, numbers, collar trim, sleeve stripes and pants stripes are painted per team at runtime.
  - A subdivided copy of the game mesh gets a procedural sculpt (jersey folds where it tucks into the belt, drops off the pads and bunches at the armpits, seams, hems and collar ribbing, thigh and knee pad outlines, folds behind the knees, sock ribbing, laces, glove padding, and muscle definition on the arms and neck). It's baked into a normal map and an ambient-occlusion map on a second UV set, so the detail costs no triangles.
  - The body is rigged to the exact joints the game's animation drives, with automatic weights (the shoulder pads ride on the chest, with the caps lifting partly with the arms), plus "heavy" and "lean" body shapes so linemen and receivers look different.
  - Gloved fingers and thumbs, cleat soles with studs, and the helmet are rigid parts. The helmet has a shell with flared jaw guards, a ridge around the lower back, vents on the crown, ear holes with molded rims, a brow bumper, a multi-bar facemask with clips, a four-point chin strap and an optional visor.
  - In the game, each player's last name is painted across the back of his jersey above the number, and the jersey and pants get a cloth sheen at grazing angles.
  - Ambient occlusion is baked into the vertex colors.
  - In the game, the athletes' shaders are compiled one per frame before the players switch over to the model, so the switch doesn't stall the page.
- **Rendering** (`src/render/`): three.js with image-based lighting from a procedural stadium light probe (glossy clearcoat helmets reflect the stadium), an anti-aliased HDR post chain (bloom, filmic tone mapping, broadcast color grade and vignette), a physically based day sky or a starry night sky, sharp soft shadows plus contact shadows under every player, procedurally painted turf with mowing stripes, wear and a grass-grain normal map, and a full stadium of about 27,000 individually animated fans in team colors, suites, a roof canopy and scrolling LED ribbon boards. Everything is generated in code (no downloaded art) and renders on your own laptop's GPU; **Settings → Graphics** offers Auto (adapts resolution, then effects, to hold a smooth frame rate), Low (no post effects, lighter crowd), Medium and High. The crowd uses a separate shirt mask and alpha-to-coverage so the stands stay team-colored and shimmer-free at broadcast distance.

### Credits

Motion capture data comes from the CMU Graphics Lab Motion Capture Database (mocap.cs.cmu.edu), which was created with funding from NSF EIA-0196217. It uses the BVH conversion by B. Hahne and is retargeted for this game. CMU places no restrictions on its use.

### Rebuilding the player model

The model is generated, not hand-made, so it can be rebuilt or restyled from the script. You need Blender (free). The current model was built with Blender 5.3; the script also handles the older glTF exporter option names of Blender 4.x. The build starts from an empty scene, so run it headless as below, not inside a Blender session you want to keep.

```bash
blender -b --factory-startup -P tools/blender/player.py -- assets/player.glb
```

It takes under a minute, most of it the high-poly sculpt and the normal-map bake. The steps live in `tools/blender/gp/`: `body.py` (volumes), `uniform.py` (zones and the runtime UV layout), `rig.py` (joints, weights, body shapes), `helmet.py`, `gear.py` (fingers, soles, studs), `detail.py` (the sculpt), `bake.py` and `pipeline.py` (runs them in order, exports, and checks the GLB against what the game needs: the 16 material names, the joints, vertex colors, both morph targets, the second UV set, the normal map, and the triangle budget). Options are environment variables:

- `HD=0` skips the sculpt and the normal map: a quick build in about ten seconds.
- `SAVE=file.blend` also saves the finished scene as a new .blend to inspect in Blender (it won't overwrite an existing file).
- `PREVIEW=dir` also renders Workbench previews to `dir` (front, side, three-quarter, back, a close-up, a lineup of the lean, normal and heavy builds, and a far shot from broadcast distance).
- `FACES` (target body quad count; the retopology retries lower if the result would break the triangle budget), `BAKESIZE` / `SHIPSIZE` (normal map bake and shipped resolution), `IMGFMT` / `IMGQ` (image format and quality inside the GLB) and `MESHOPT=0` (no buffer compression).

The normal and occlusion maps ship inside the GLB as WebP images on the second UV set (three.js derives the tangent frame per pixel), and the GLB's buffers are meshopt-compressed (`EXT_meshopt_compression`, decoded by three.js's `MeshoptDecoder`), so the file is smaller than the old, simpler model (about 0.65 MB). `athlete.js` reads the maps and gives them to the body's materials (the jersey and pants add their tiled knit weave and a cloth sheen on top in the shader). A model without them still works with the knit alone.

Then preview it the way the game renders it, and rebuild the game:

```bash
node tools/viewer/shoot.cjs assets/player.glb preview.png
```

```bash
npm run build
```

To check the model in the game itself (screenshots go to `test/out/`): `poses.cjs` lines players up in chosen animations (`anim:speed[:L|R]`; `POSECAM=dist,height,offset` moves the camera), `gfxcheck.cjs` takes day and night close-ups, `posecheck.cjs` renders players in extreme poses (arms overhead, the throw, a sprint stride, a stance, arms out) through the game's own skeleton code to check the deformation, for any build (`"w": 1.28` heavy, `0.85` lean) and with plain or real team materials (`"team": 0`), and `perf.cjs` compares frame rates of game builds (`PERF_GPU=1` uses this machine's GPU).

```bash
node tools/viewer/poses.cjs check run:3,run:9,catch:6,throw,block,stance3,tackle,carry:6
```

```bash
node tools/viewer/gfxcheck.cjs check
```

```bash
node tools/viewer/posecheck.cjs test/out/poses.png '{"w":1.28}'
```

### Realism check

`npm test` simulates full CPU-vs-CPU games (15-minute quarters) and compares per-team averages with the 2025 pro season; `node test/realism.mjs` adds play-level checks (run-gain distribution, yards per completion, time to throw, pressure, deep-ball and missed-tackle rates). A typical run:

| Stat | Gridiron 27 | 2025 pro avg |
|---|---|---|
| Points per team | ~25 | 23.0 |
| Completion % | ~63% | 64.2% |
| Yards per attempt | ~7.1 | ~7.0 |
| Yards per carry | ~4.6 | 4.4 |
| Runs stuffed (≤0 yds) / 10+ yds | ~18% / ~13% | ~18% / ~11% |
| Sack rate | ~7% | ~6.6% |
| Interceptions / game | ~0.9 | 0.70 |
| Fumbles lost / game | ~0.45 | 0.46 |
| Third-down conversion | ~37% | 39.9% |
| FG % | ~84% | 85.6% |
| Kick return avg | ~24 | ~26 |

Known gaps: CPU teams run a few more plays per game than real teams (~67 vs ~62) and punt a little more often. Gameplay constants live in `src/sim/tune.js`.
