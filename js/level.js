// World geometry, collision helpers, and shared math utilities.

const WORLD = { w: 2400, h: 720 };
const VIEW = { w: 960, h: 540 };
const GRAV = 1400;
const MAXFALL = 900;
const JUMPV = 660;

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function approach(v, target, amt) {
  return v < target ? Math.min(v + amt, target) : Math.max(v - amt, target);
}
function overlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}
function dist(ax, ay, bx, by) { return Math.hypot(bx - ax, by - ay); }
function rnd(a, b) { return a + Math.random() * (b - a); }
function cx(b) { return b.x + b.w / 2; }
function cy(b) { return b.y + b.h / 2; }

const Level = {
  // Filled by generate() each round.
  platforms: [],

  baseZone: { x: 0, y: 400, w: 160, h: 320 },
  playerSpawn: { x: 70, y: 640 },
  treasureSpawn: { x: 2200, y: 216 },
  enemySpawns: [],

  // New terrain every round: a climbing chain of one-way platforms from the
  // ground up to the treasure (rises <= 105px, gaps <= 90px — always within
  // jump reach), plus random filler platforms and solid crates.
  generate(round) {
    const P = [{ x: 0, y: 680, w: 2400, h: 40 }]; // ground

    // Main chain, left -> right, in a low mountain-wave profile: it climbs to
    // a modest peak (y ~450) then dips back to ground-reachable height
    // (y ~600) and repeats, running all the way to the right edge of the
    // world. Low peaks keep every platform within easy enemy pursuit.
    let x = rnd(210, 290);
    let y = rnd(575, 600);
    let dirUp = true;
    const chain = [];
    while (x < 2250) {
      const w = Math.min(Math.round(rnd(110, 170)), WORLD.w - 10 - Math.round(x));
      const p = { x: Math.round(x), y: Math.round(y), w, h: 12, oneWay: true };
      P.push(p);
      chain.push(p);
      x += w + rnd(40, 90);
      y += dirUp ? rnd(-85, -35) : rnd(35, 85);
      if (y < 470) { y = Math.max(450, y); dirUp = false; }
      else if (y > 600) { y = Math.min(600, y); dirUp = true; }
    }
    // Treasure sits on a final perch flush against the right edge of the
    // world — the farthest possible run from the base
    let perch = chain[chain.length - 1];
    if (perch.x + perch.w < 2300) {
      const fx = Math.min(perch.x + perch.w + Math.round(rnd(40, 80)), 2300);
      const fp = {
        x: fx, y: Math.round(clamp(perch.y - rnd(20, 85), 450, 600)),
        w: WORLD.w - 10 - fx, h: 12, oneWay: true,
      };
      P.push(fp);
      chain.push(fp);
      perch = fp;
    }
    this.treasureSpawn = { x: Math.round(perch.x + perch.w / 2 - 14), y: perch.y - 24 };

    // Filler platforms for alternate routes: must not crowd the chain, and
    // must be jumpable from something below (rise <= 100, within reach)
    const fillers = 4 + (round % 3);
    for (let i = 0; i < fillers; i++) {
      const f = {
        x: Math.round(rnd(350, 2120)), y: Math.round(rnd(460, 620)),
        w: Math.round(rnd(100, 160)), h: 12, oneWay: true,
      };
      const clear = P.every(p =>
        !(Math.abs(p.y - f.y) < 75 && f.x < p.x + p.w + 60 && f.x + f.w > p.x - 60));
      const reachable = P.some(p => {
        const rise = p.y - f.y;
        return rise > 0 && rise <= 100 && f.x < p.x + p.w + 170 && f.x + f.w > p.x - 170;
      });
      if (clear && reachable) P.push(f);
    }

    // Solid crates on the ground
    const crates = 2 + (round % 2);
    for (let i = 0; i < crates; i++) {
      const h = Math.round(rnd(44, 90));
      P.push({ x: Math.round(rnd(450, 2150)), y: 680 - h, w: Math.round(rnd(44, 58)), h });
    }

    // Repair pass: every platform must have support below it that enemies can
    // reliably jump from (rise 20..120, horizontally overlapping). Platforms
    // at y >= 560 are reachable straight from the ground. Add stepping stones
    // (lowest platforms first, so stones can support each other) until stable.
    const supported = (p, all) => p.y >= 560 || all.some(q => {
      if (q === p) return false;
      const rise = p === q ? 0 : q.y - p.y;
      return rise >= 20 && rise <= 120 &&
        p.x < q.x + q.w + 150 && p.x + p.w > q.x - 150;
    });
    for (let guard = 0; guard < 24; guard++) {
      const broken = P.filter(p => p.oneWay && !supported(p, P))
        .sort((a, b) => b.y - a.y)[0];
      if (!broken) break;
      P.push({
        x: Math.round(broken.x + broken.w / 2 - 55 + rnd(-30, 30)),
        y: Math.round(broken.y + rnd(90, 115)),
        w: 110, h: 12, oneWay: true,
      });
    }

    this.platforms = P;

    // Spread on the ground + one guarding the treasure perch
    this.enemySpawns = [
      { x: rnd(950, 1150), y: 640 },
      { x: rnd(1550, 1750), y: 640 },
      { x: this.treasureSpawn.x - 50, y: perch.y - 60 },
      { x: rnd(1250, 1450), y: 640 },
      { x: rnd(1850, 2050), y: 640 },
      { x: rnd(550, 750), y: 640 },
    ];
    this.bossSpawn = { x: 1950, y: 560 };
  },

  // Is there a non-oneWay solid at this point?
  solidAt(x, y) {
    for (const p of this.platforms) {
      if (p.oneWay) continue;
      if (x >= p.x && x <= p.x + p.w && y >= p.y && y <= p.y + p.h) return true;
    }
    return false;
  },

  // Is there any landable surface below (x, y) within `depth` pixels?
  groundBelow(x, y, depth) {
    for (const p of this.platforms) {
      if (x >= p.x && x <= p.x + p.w && p.y >= y - 2 && p.y <= y + depth) return true;
    }
    return false;
  },
};

// Shared AABB physics step for player and enemies.
// Body needs: x, y, w, h, vx, vy. Sets body.onGround / body.blockedX.
function moveBody(b, dt) {
  b.blockedX = false;

  // Horizontal
  b.x += b.vx * dt;
  for (const p of Level.platforms) {
    if (p.oneWay) continue;
    if (overlap(b, p)) {
      if (b.vx > 0) b.x = p.x - b.w;
      else if (b.vx < 0) b.x = p.x + p.w;
      b.vx = 0;
      b.blockedX = true;
    }
  }
  if (b.x < 0) { b.x = 0; b.blockedX = true; }
  if (b.x + b.w > WORLD.w) { b.x = WORLD.w - b.w; b.blockedX = true; }

  // Vertical
  const prevBottom = b.y + b.h;
  b.y += b.vy * dt;
  b.onGround = false;
  for (const p of Level.platforms) {
    if (!overlap(b, p)) continue;
    if (p.oneWay) {
      if (b.dropT > 0) continue;
      if (b.vy > 0 && prevBottom <= p.y + 1) {
        b.y = p.y - b.h; b.vy = 0; b.onGround = true;
      }
    } else {
      if (b.vy > 0) { b.y = p.y - b.h; b.vy = 0; b.onGround = true; }
      else if (b.vy < 0) { b.y = p.y + p.h; b.vy = 0; }
    }
  }
  if (b.y < 0) { b.y = 0; b.vy = 0; }
  if (b.y + b.h > WORLD.h) { b.y = WORLD.h - b.h; b.vy = 0; b.onGround = true; }
}

function drawLevel(g) {
  for (const p of Level.platforms) {
    if (p.oneWay) {
      g.fillStyle = PAL['7'];
      g.fillRect(p.x, p.y, p.w, p.h);
      g.fillStyle = PAL['6'];
      g.fillRect(p.x, p.y, p.w, 4);
    } else {
      g.fillStyle = PAL['f'];
      g.fillRect(p.x, p.y, p.w, p.h);
      g.fillStyle = PAL['e'];
      g.fillRect(p.x, p.y, p.w, 6);
      // brick seams on the ground
      if (p.w > 200) {
        g.fillStyle = PAL['0'];
        for (let x = p.x + 40; x < p.x + p.w; x += 80) g.fillRect(x, p.y + 14, 4, 4);
      }
    }
  }
  // Base zone glow + flag
  const bz = Level.baseZone;
  g.fillStyle = 'rgba(167, 240, 112, 0.08)';
  g.fillRect(bz.x, bz.y, bz.w, bz.h);
  drawSprite(g, Sprites.flag, 60, 680 - Sprites.flag.height, false);
}
