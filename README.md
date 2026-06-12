# Treasure Run

A fast-paced 2D platformer heist game in vanilla JavaScript + Canvas — zero dependencies.

**Steal the treasure. Bring it home. Don't get caught.**

▶ **[Play it in your browser](https://nghelak.github.io/treasure-run/)**

![Made with](https://img.shields.io/badge/made%20with-vanilla%20JS-yellow) ![Dependencies](https://img.shields.io/badge/dependencies-none-brightgreen)

## How to play

Open `index.html` in any browser. That's it — no build, no server needed.

Each round, grab the treasure chest from the far side of the level and carry it back to your flag. Carrying it slows you down and alerts every enemy — the return trip is the real heist.

| Action | Keys |
|---|---|
| Move | ← → / A D |
| Jump | Space / W / ↑ |
| Drop through platform | S / ↓ |
| Retry round | R |

## Rounds & enemies

A new enemy type hunts you each round, each with its own telegraphed skill:

1. **Chaser** — relentless pursuit
2. **Sprinter** — telegraphed speed bursts
3. **Hooker** — extending hook that reels you in
4. **Jumper** — leaps at where you're *going*
5. **Boss: Warden King** — every 5th round, one brute with ALL their tricks
6. **Slasher** — dash-slash with a visible danger zone

…then the roster cycles with more enemies and more speed. Survive the tier-2 Warden King at round 10 to win.

## Gadgets & mana

After each round, pick 1 of 3 gadgets. Active skills cost mana (the bar over your head, refills over time):

| Gadget | Key | Mana | Effect |
|---|---|---|---|
| Dash | Shift | 25 | Invulnerable burst of speed |
| Double Jump | passive | 15 | Jump again mid-air |
| Shield | passive | — | Blocks one hit, recharges in 10s |
| Decoy | E | 35 | Enemies chase a fake you for 3s |
| Smoke Bomb | Q | 45 | Blinds all enemies for 2.5s |
| Stun Mine | F | 30 | Freezes the first enemy that steps on it |

## Features

- Procedurally generated terrain every round — always traversable (BFS-audited)
- Boss fights combining all enemy skills, scaling by tier
- Pixel-art sprites drawn entirely in code, WebAudio synth SFX
- Coyote time + jump buffering, screen shake, particles, parallax

## Project structure

```
index.html      entry point
js/sprites.js   pixel-art sprites baked from string maps
js/input.js     keyboard handling
js/level.js     procedural terrain generation + AABB physics
js/player.js    movement, hearts, mana bar, glow
js/enemies.js   enemy AI state machines + the Warden King boss
js/gadgets.js   gadget definitions and activation
js/game.js      game loop, states, HUD, camera, synth SFX
```

---

Built with [Claude Code](https://claude.com/claude-code).
