// Gadget definitions, activation, and the pick-1-of-3 screen data.

const GADGETS = [
  { id: 'dash', name: 'Dash', short: 'DSH', key: 'SHIFT', cd: 3, mana: 25,
    desc: 'Invulnerable burst of speed.', color: PAL['a'] },
  { id: 'doublejump', name: 'Double Jump', short: 'DJ', key: 'passive', cd: 0, mana: 15,
    desc: 'Jump once more in mid-air.', color: PAL['5'] },
  { id: 'shield', name: 'Shield', short: 'SHD', key: 'passive', cd: 10, mana: 0,
    desc: 'Blocks one hit, recharges in 10s.', color: PAL['b'] },
  { id: 'decoy', name: 'Decoy', short: 'DCY', key: 'E', cd: 8, mana: 35,
    desc: 'Fake you. Enemies chase it for 3s.', color: PAL['4'] },
  { id: 'smoke', name: 'Smoke Bomb', short: 'SMK', key: 'Q', cd: 8, mana: 45,
    desc: 'Blinds all enemies for 2.5s.', color: PAL['d'] },
  { id: 'mine', name: 'Stun Mine', short: 'MNE', key: 'F', cd: 6, mana: 30,
    desc: 'Freezes the first enemy that steps on it.', color: PAL['3'] },
];

function gadgetById(id) {
  return GADGETS.find(gg => gg.id === id);
}

// Called every fixed update while playing: cooldowns (with ready-boom
// notification), mana-gated activation, decoy/mine lifecycles.
function updateGadgets(dt) {
  // Tick cooldowns; fire a "replenished" boom when one completes.
  GADGETS.filter(gg => game.has(gg.id)).forEach((gg) => {
    const before = game.cooldowns[gg.id] || 0;
    if (before > 0) {
      game.cooldowns[gg.id] = before - dt;
      if (before - dt <= 0 && gg.cd > 0) game.skillReady(gg);
    }
  });
  const p = game.player;

  if (game.has('dash') && Input.pressed('dash') && game.cooldowns.dash <= 0 && p.kbT <= 0
      && game.spendMana(gadgetById('dash').mana)) {
    p.dashT = 0.18;
    game.cooldowns.dash = gadgetById('dash').cd;
    game.burst(cx(p), cy(p), PAL['a'], 10);
    Sfx.play('dash');
  }

  if (game.has('decoy') && Input.pressed('decoy') && game.cooldowns.decoy <= 0
      && game.spendMana(gadgetById('decoy').mana)) {
    game.decoy = { x: p.x, y: p.y, w: p.w, h: p.h, vx: 0, vy: 0, t: 3 };
    game.cooldowns.decoy = gadgetById('decoy').cd;
    game.burst(cx(p), cy(p), PAL['4'], 10);
    Sfx.play('gadget');
  }

  if (game.has('smoke') && Input.pressed('smoke') && game.cooldowns.smoke <= 0
      && game.spendMana(gadgetById('smoke').mana)) {
    for (const e of game.enemies) e.blind = 2.5;
    game.cooldowns.smoke = gadgetById('smoke').cd;
    for (let i = 0; i < 26; i++) {
      game.particles.push({
        x: cx(p) + rnd(-50, 50), y: cy(p) + rnd(-40, 40),
        vx: rnd(-30, 30), vy: rnd(-40, 10),
        life: rnd(0.8, 1.6), color: PAL['d'], size: rnd(5, 12),
      });
    }
    Sfx.play('smoke');
  }

  if (game.has('mine') && Input.pressed('mine') && game.cooldowns.mine <= 0 && p.onGround
      && game.spendMana(gadgetById('mine').mana)) {
    game.mines.push({ x: cx(p) - 6, y: p.y + p.h - 10, w: 12, h: 10 });
    game.cooldowns.mine = gadgetById('mine').cd;
    Sfx.play('gadget');
  }

  // Decoy lifetime
  if (game.decoy) {
    game.decoy.t -= dt;
    if (game.decoy.t <= 0) {
      game.burst(cx(game.decoy), cy(game.decoy), PAL['4'], 8);
      game.decoy = null;
    }
  }

  // Mines vs enemies
  for (let i = game.mines.length - 1; i >= 0; i--) {
    const m = game.mines[i];
    for (const e of game.enemies) {
      if (e.stun <= 0 && overlap(m, e)) {
        e.stun = 3;
        game.mines.splice(i, 1);
        game.burst(cx(e), cy(e), PAL['3'], 14);
        game.shake(0.12, 4);
        Sfx.play('zap');
        break;
      }
    }
  }
}

// Pick 3 random gadgets the player doesn't own yet.
function rollGadgetChoices() {
  const pool = GADGETS.filter(gg => !game.has(gg.id));
  const choices = [];
  while (choices.length < 3 && pool.length > 0) {
    choices.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  }
  return choices;
}
