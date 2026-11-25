# Gridiron 27

An original 3D American football game that runs in any modern browser on a laptop — Windows, macOS, Linux or ChromeOS. No install, no internet connection needed.

It is built around real football: 11-on-11 simulation, real schemes and playbooks, current pro rules (including the dynamic kickoff), a full season mode, and gameplay tuned against 2025 pro league averages.

> Gridiron 27 is an independent, original game. The league, all 32 teams, every player, and all artwork are fictional and procedurally generated. It is not affiliated with or endorsed by any real league, team, player or game publisher.

## Play it

**Easiest:** download [`Gridiron27.html`](Gridiron27.html) from this repository and double-click it. It opens in your browser and runs completely offline.

- Chrome, Edge, Firefox or Safari (current versions) with WebGL enabled.
- Plug in an Xbox or PlayStation controller for the best experience (press any button once so the browser sees it). The keyboard works for everything too.
- If the frame rate is low on an older laptop: **Settings → Graphics → Low**.

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
npm test           # headless CPU-vs-CPU games with realism stats
```

## Modes

- **Play Now** — exhibition game. Pick any two teams and set each side to CPU, keyboard, or a gamepad (two humans = local head-to-head). Choose difficulty (Rookie, Pro, All-Pro, Legend), quarter length (1–15 min), accelerated clock, weather (clear, rain, snow, wind) and day or night.
- **Season** — take a franchise through a 17-game schedule, a 14-team playoff, and multi-year offseasons with aging, progression, retirements and a seven-round draft. Play or sim each week; standings, league leaders, depth chart, playoff bracket and championship history are tracked and saved in your browser.
- **Two-Minute Drill** — down 4 with 2:00 left and one timeout. Go win it.
- **Practice** — run any play against the CPU from the same spot, as offense or defense.

## Controls

| Action | Keyboard | Gamepad |
|---|---|---|
| Move / sprint | WASD or arrows / Shift | Left stick / RT |
| Snap | Space | A |
| Throw to receiver | 1–5 (tap = lob, medium = touch, hold = bullet) | A B X Y RB |
| Lead the pass | Hold a direction while releasing | Left stick |
| Throw away | X | LB |
| Hot route / motion / audible | H / M / B | Y / LB / X |
| Hard count / protection slide / play art | K / L / I | — / — / LT |
| Juke / spin / stiff arm | Q E / R / F | Right stick ← → / B / A |
| Truck / hurdle / stutter / dive | C / V / X / Z | Right stick ↑ / Y / right stick ↓ / X |
| Protect ball | G (hold) | RB |
| Switch defender | Tab | B |
| Dive tackle / hit stick / strip | Space / F / Q | X / right stick ↑ / RB |
| Swat / play the ball | E / R | X / Y |
| DL swim / bull rush | E / R | A / X |
| Defensive audible / D-line shift / show blitz | B / J / N | X / — / — |
| Kick meter (aim, power, accuracy) | ← → then Space ×3 | Left stick then A ×3 |
| Instant replay (after a play) | Y | Y |
| Timeout / pause | T / Esc | Back / Start |

The full list is in **Controls** on the main menu.

## What's inside

- **Simulation** (`src/sim/`): a 60 Hz physics and AI simulation of all 22 players.
  - **Blocking**: engagements resolve from block and shed ratings, with pass sets, run fits, pulls and double teams.
  - **Coverage**: man coverage with rating-based reaction lag; zone drops (deep halves, thirds and quarters, curl/flat, hook, Tampa) that read routes.
  - **Pressure**: pass rush with swim and bull moves, plus blitzes and spies.
  - **Running**: ball carrier AI with lane vision and cutbacks; jukes, spins, stiff arms, trucks, hurdles and dives.
  - **Tackling**: angle, gang tackles, broken tackles, forward progress and fumbles.
  - **Passing**: lob, touch and bullet throws, pass placement, accuracy under pressure and on the run, contested catches, deflections and interceptions.
- **Playbooks** (`src/data/`): about 110 offensive plays across 14 formations and 48 defensive calls (Cover 0/1/2/3/4/6, Tampa 2, 2-Man, fire zones and blitzes) across 8 fronts. Six offensive styles give each team its own identity.
- **Rules**:
  - 2025/26 dynamic kickoff: landing zone, touchback at the 35, 40-yard spot on short kicks, declared onside kicks.
  - Overtime where both teams possess, then sudden death; playoff OT can't end in a tie.
  - Clock: two-minute warning, out-of-bounds restart rules, 10-second runoff, accelerated clock, timeouts.
  - Penalties: holding, pass interference, offside, false start, delay of game, intentional grounding.
- **CPU coaching**: situational play calling, fourth-down and two-point decisions, clock management.
- **Rendering** (`src/render/`): three.js stadium and crowd, a procedurally painted field, articulated players with code-driven animations, weather and a broadcast camera.

### Realism check

`npm test` simulates full games and compares per-team averages with the 2025 pro season. A typical run:

| Stat | Gridiron 27 | 2025 pro avg |
|---|---|---|
| Completion % | ~64% | 64.2% |
| Yards per attempt | ~6.9 | ~7.0 |
| Yards per carry | ~4.4 | 4.4 |
| Interceptions / game | ~0.6 | 0.70 |
| Sacks / game | ~2.1 | ~2.3 |
| Fumbles lost / game | ~0.5 | 0.46 |
| FG % | ~85% | 85.6% |
| Kick return avg | ~26 | ~26 |

Third-down conversion rate is still below the real-world figure; tuning continues in `src/sim/tune.js`.
