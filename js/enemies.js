// Enemy base class (shared platformer locomotion AI) and the five
// round-specific enemy types, each a small state machine:
// patrol/chase -> windup (telegraph) -> attack -> cooldown.

class Enemy {
  constructor(x, y) {
    this.x = x; this.y = y;
    this.w = 26; this.h = 28;
    this.vx = 0; this.vy = 0;
    this.facing = 1;
    this.onGround = false;
    this.stun = 0;
    this.blind = 0;
    this.jumpCd = 0;
    this.anim = Math.random() * 10;
    this.speed = 120;
    this.sprite = Sprites.chaser;
    this.spriteW = Sprites.chaserW;
    this.dropT = 0;
    this.touchDamage = true;
  }

  update(dt, target) {
    this.anim += dt;
    if (this.jumpCd > 0) this.jumpCd -= dt;
    if (this.blind > 0) this.blind -= dt;

    if (this.stun > 0) {
      this.stun -= dt;
      this.vx = approach(this.vx, 0, 2000 * dt);
      this.vy += GRAV * dt;
      if (this.vy > MAXFALL) this.vy = MAXFALL;
      moveBody(this, dt);
      return;
    }

    const tgt = this.blind > 0 ? null : target;
    this.think(dt, tgt);

    this.vy += GRAV * dt;
    if (this.vy > MAXFALL) this.vy = MAXFALL;
    moveBody(this, dt);
  }

  // Default brain: walk at the target, hop over obstacles. Subclasses override.
  think(dt, tgt) {
    this.locomote(dt, tgt, this.speed * game.enemySpeedMul());
  }

  locomote(dt, tgt, spd) {
    if (!tgt) {
      this.vx = approach(this.vx, 0, 1600 * dt);
      return;
    }
    const dx = cx(tgt) - cx(this);
    const dir = Math.abs(dx) > 8 ? Math.sign(dx) : 0;
    this.vx = approach(this.vx, dir * spd, 2200 * dt);
    if (dir) this.facing = dir;

    if (this.onGround && dir && this.jumpCd <= 0) {
      const aheadX = dir > 0 ? this.x + this.w + 8 : this.x - 8;
      const wall = Level.solidAt(aheadX, this.y + this.h - 10) || this.blockedX;
      const gap = !Level.groundBelow(aheadX, this.y + this.h, 160);
      const targetAbove = (tgt.y + tgt.h) < this.y - 30 && Math.abs(dx) < 150;
      if (wall || gap || targetAbove) {
        this.vy = -JUMPV;
        this.jumpCd = 0.6;
      }
    }
    // Drop down to a target far below
    if (this.onGround && tgt.y > this.y + this.h + 80 && Math.abs(dx) < 60) {
      this.dropT = 0.18;
    }
    if (this.dropT > 0) this.dropT -= dt;
  }

  draw(g) {
    const flip = this.facing < 0;
    drawSprite(g, this.sprite, this.x + this.w / 2 - this.sprite.width / 2,
      this.y + this.h - this.sprite.height, flip);
    if (this.stun > 0) {
      g.fillStyle = PAL['4'];
      const a = this.anim * 6;
      for (let i = 0; i < 3; i++) {
        const ang = a + i * 2.1;
        g.fillRect(cx(this) + Math.cos(ang) * 14 - 2, this.y - 10 + Math.sin(ang) * 4 - 2, 4, 4);
      }
    }
    if (this.blind > 0) {
      g.fillStyle = 'rgba(148, 176, 194, 0.5)';
      g.fillText('?', cx(this) - 3, this.y - 8);
    }
  }

  drawFlash(g) {
    const flip = this.facing < 0;
    drawSprite(g, this.spriteW, this.x + this.w / 2 - this.sprite.width / 2,
      this.y + this.h - this.sprite.height, flip);
  }
}

// Round 1 — walks straight at you, hops gaps. Tutorial enemy.
class Chaser extends Enemy {
  constructor(x, y) {
    super(x, y);
    this.w = 28; this.h = 20;
    this.speed = 130;
    this.sprite = Sprites.chaser;
    this.spriteW = Sprites.chaserW;
  }
}

// Round 2 — periodic telegraphed speed burst.
class Sprinter extends Enemy {
  constructor(x, y) {
    super(x, y);
    this.w = 24; this.h = 24;
    this.speed = 115;
    this.sprite = Sprites.sprinter;
    this.spriteW = Sprites.sprinterW;
    this.phase = 'normal';
    this.phaseT = rnd(1.5, 2.5);
  }

  think(dt, tgt) {
    this.phaseT -= dt;
    if (this.phase === 'normal' && this.phaseT <= 0) { this.phase = 'windup'; this.phaseT = 0.45; }
    else if (this.phase === 'windup' && this.phaseT <= 0) {
      this.phase = 'burst'; this.phaseT = 1.6;
      Sfx.play('sprint');
    } else if (this.phase === 'burst' && this.phaseT <= 0) { this.phase = 'normal'; this.phaseT = 2.2; }

    if (this.phase === 'windup') {
      this.vx = approach(this.vx, 0, 3000 * dt);
      return;
    }
    const spd = (this.phase === 'burst' ? this.speed * 2.3 : this.speed) * game.enemySpeedMul();
    this.locomote(dt, tgt, spd);
  }

  draw(g) {
    if (this.phase === 'windup' && Math.floor(this.anim * 14) % 2 === 0) {
      this.drawFlash(g);
    } else {
      super.draw(g);
      if (this.phase === 'burst') {
        g.fillStyle = 'rgba(239, 125, 87, 0.35)';
        g.fillRect(this.x - this.facing * 16, this.y + 4, this.w, this.h - 6);
      }
    }
  }
}

// Round 3 — fires an extending hook that reels the player in.
class Hooker extends Enemy {
  constructor(x, y) {
    super(x, y);
    this.w = 26; this.h = 26;
    this.speed = 95;
    this.sprite = Sprites.hooker;
    this.spriteW = Sprites.hookerW;
    this.state = 'chase';
    this.stateT = 0;
    this.cd = 1.5;
    this.hookLen = 0;
    this.hookAng = 0;
    this.hookHit = false;
    this.RANGE = 330;
  }

  think(dt, tgt) {
    if (this.cd > 0) this.cd -= dt;
    this.stateT -= dt;

    switch (this.state) {
      case 'chase': {
        this.locomote(dt, tgt, this.speed * game.enemySpeedMul());
        if (tgt && this.cd <= 0) {
          const d = dist(cx(this), cy(this), cx(tgt), cy(tgt));
          if (d < this.RANGE && Math.abs(cy(tgt) - cy(this)) < 180) {
            this.state = 'aim'; this.stateT = 0.5;
          }
        }
        break;
      }
      case 'aim': {
        this.vx = approach(this.vx, 0, 3000 * dt);
        if (tgt) {
          this.hookAng = Math.atan2(cy(tgt) - cy(this), cx(tgt) - cx(this));
          this.facing = Math.cos(this.hookAng) >= 0 ? 1 : -1;
        }
        if (this.stateT <= 0 || !tgt) {
          if (!tgt) { this.state = 'chase'; break; }
          this.state = 'fire'; this.hookLen = 0; this.hookHit = false;
          Sfx.play('hook');
        }
        break;
      }
      case 'fire': {
        this.vx = 0;
        this.hookLen += 750 * dt;
        const tipX = cx(this) + Math.cos(this.hookAng) * this.hookLen;
        const tipY = cy(this) + Math.sin(this.hookAng) * this.hookLen;
        const p = game.player;
        if (!this.hookHit && tipX > p.x - 6 && tipX < p.x + p.w + 6 && tipY > p.y - 6 && tipY < p.y + p.h + 6) {
          this.hookHit = true;
          // Reel the player toward the hooker
          const ang = Math.atan2(cy(this) - cy(p), cx(this) - cx(p));
          p.vx = Math.cos(ang) * 680;
          p.vy = Math.sin(ang) * 680 - 120;
          p.kbT = 0.3;
          game.shake(0.15, 4);
          Sfx.play('reel');
        }
        if (this.hookLen >= this.RANGE || this.hookHit) { this.state = 'retract'; }
        break;
      }
      case 'retract': {
        this.hookLen -= 900 * dt;
        if (this.hookLen <= 0) {
          this.hookLen = 0;
          this.state = 'chase';
          this.cd = 2.5;
        }
        break;
      }
    }
  }

  draw(g) {
    // Aim line telegraph
    if (this.state === 'aim') {
      g.strokeStyle = 'rgba(244, 244, 244, 0.4)';
      g.lineWidth = 1.5;
      g.setLineDash([6, 6]);
      g.beginPath();
      g.moveTo(cx(this), cy(this));
      g.lineTo(cx(this) + Math.cos(this.hookAng) * this.RANGE, cy(this) + Math.sin(this.hookAng) * this.RANGE);
      g.stroke();
      g.setLineDash([]);
    }
    // Hook chain + claw
    if (this.hookLen > 0) {
      const tipX = cx(this) + Math.cos(this.hookAng) * this.hookLen;
      const tipY = cy(this) + Math.sin(this.hookAng) * this.hookLen;
      g.strokeStyle = PAL['d'];
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(cx(this), cy(this));
      g.lineTo(tipX, tipY);
      g.stroke();
      g.fillStyle = PAL['c'];
      g.fillRect(tipX - 4, tipY - 4, 8, 8);
    }
    super.draw(g);
  }
}

// Round 4 — leaps in a high arc toward where you're heading, slams down.
class Jumper extends Enemy {
  constructor(x, y) {
    super(x, y);
    this.w = 28; this.h = 20;
    this.speed = 90;
    this.sprite = Sprites.jumper;
    this.spriteW = Sprites.jumperW;
    this.state = 'chase';
    this.stateT = 0;
    this.cd = 1.5;
  }

  think(dt, tgt) {
    if (this.cd > 0) this.cd -= dt;
    this.stateT -= dt;

    switch (this.state) {
      case 'chase': {
        this.locomote(dt, tgt, this.speed * game.enemySpeedMul());
        if (tgt && this.cd <= 0 && this.onGround) {
          const d = dist(cx(this), cy(this), cx(tgt), cy(tgt));
          if (d < 520) { this.state = 'squash'; this.stateT = 0.6; }
        }
        break;
      }
      case 'squash': {
        this.vx = approach(this.vx, 0, 3000 * dt);
        if (this.stateT <= 0) {
          const p = game.player;
          const t = 0.85;
          // Aim at the player's predicted position
          const px = cx(p) + p.vx * 0.4;
          this.vx = clamp((px - cx(this)) / t, -420, 420);
          this.vy = clamp((p.y - this.y - 0.5 * GRAV * t * t) / t, -900, -450);
          this.state = 'leap';
          this.facing = this.vx >= 0 ? 1 : -1;
          Sfx.play('leap');
        }
        break;
      }
      case 'leap': {
        // Ballistic — no steering. Wait for landing.
        if (this.onGround && this.vy >= 0) {
          this.state = 'chase';
          this.cd = 2.2;
          game.shake(0.2, 6);
          game.burst(cx(this), this.y + this.h, PAL['6'], 10);
          Sfx.play('slam');
          // Shockwave damage if the player is grounded nearby
          const p = game.player;
          if (p.onGround && Math.abs(cx(p) - cx(this)) < 90 && Math.abs((p.y + p.h) - (this.y + this.h)) < 30) {
            p.hit(this);
          }
        }
        break;
      }
    }
  }

  draw(g) {
    if (this.state === 'squash') {
      // Squash telegraph: draw flattened
      const img = this.sprite;
      const t = clamp(this.stateT / 0.6, 0, 1);
      const sy = 0.55 + 0.45 * t;
      g.save();
      g.translate(cx(this), this.y + this.h);
      g.scale(this.facing < 0 ? -1 : 1, sy);
      g.drawImage(img, -img.width / 2, -img.height);
      g.restore();
    } else {
      super.draw(g);
    }
  }
}

// Round 5 — telegraphed dash-slash with a visible danger zone.
class Slasher extends Enemy {
  constructor(x, y) {
    super(x, y);
    this.w = 26; this.h = 24;
    this.speed = 140;
    this.sprite = Sprites.slasher;
    this.spriteW = Sprites.slasherW;
    this.state = 'chase';
    this.stateT = 0;
    this.cd = 1;
    this.DASH_RANGE = 150;
  }

  get slashZone() {
    const w = this.DASH_RANGE + this.w;
    const x = this.facing > 0 ? this.x : this.x + this.w - w;
    return { x, y: this.y - 8, w, h: this.h + 16 };
  }

  think(dt, tgt) {
    if (this.cd > 0) this.cd -= dt;
    this.stateT -= dt;

    switch (this.state) {
      case 'chase': {
        this.locomote(dt, tgt, this.speed * game.enemySpeedMul());
        if (tgt && this.cd <= 0 && this.onGround) {
          const dx = cx(tgt) - cx(this);
          if (Math.abs(dx) < this.DASH_RANGE + 20 && Math.abs(cy(tgt) - cy(this)) < 60) {
            this.facing = Math.sign(dx) || 1;
            this.state = 'windup'; this.stateT = 0.4;
          }
        }
        break;
      }
      case 'windup': {
        this.vx = approach(this.vx, 0, 3000 * dt);
        if (this.stateT <= 0) {
          this.state = 'dash'; this.stateT = 0.16;
          Sfx.play('slash');
        }
        break;
      }
      case 'dash': {
        this.vx = this.facing * 1400;
        // Extended hitbox during the slash
        const p = game.player;
        const hb = { x: this.x - 14, y: this.y - 6, w: this.w + 28, h: this.h + 12 };
        if (overlap(hb, p)) p.hit(this);
        if (this.stateT <= 0) { this.state = 'recover'; this.stateT = 0.55; }
        break;
      }
      case 'recover': {
        this.vx = approach(this.vx, 0, 2400 * dt);
        if (this.stateT <= 0) { this.state = 'chase'; this.cd = 1.4; }
        break;
      }
    }
  }

  draw(g) {
    if (this.state === 'windup') {
      const z = this.slashZone;
      const a = 0.18 + 0.22 * (1 - this.stateT / 0.4);
      g.fillStyle = `rgba(177, 62, 83, ${a})`;
      g.fillRect(z.x, z.y, z.w, z.h);
    }
    if (this.state === 'dash') {
      g.fillStyle = 'rgba(244, 244, 244, 0.5)';
      g.fillRect(this.x - this.facing * 26, this.y, this.w + 20, this.h);
    }
    super.draw(g);
  }
}

// Boss (every 5th round) — one brute with all the previous roles' skills,
// picked by distance: far = hook/charge, mid = leap/charge, close = slash.
class Boss extends Enemy {
  constructor(x, y, tier = 1) {
    super(x, y);
    this.w = 52; this.h = 44;
    this.tier = tier;
    this.speed = 100 + 12 * tier;
    this.sprite = Sprites.boss;
    this.spriteW = Sprites.bossW;
    this.state = 'chase';
    this.stateT = 0;
    this.skillCd = 2.5;
    this.hookLen = 0; this.hookAng = 0; this.hookHit = false;
    this.RANGE = 400;
    this.DASH_RANGE = 190;
  }

  endSkill() {
    this.state = 'chase';
    this.skillCd = Math.max(1.1, 2.6 - 0.5 * this.tier);
  }

  pickSkill(tgt) {
    const d = dist(cx(this), cy(this), cx(tgt), cy(tgt));
    if (d > 330) {
      if (Math.random() < 0.6 && Math.abs(cy(tgt) - cy(this)) < 200) {
        this.state = 'aim'; this.stateT = 0.5;
      } else { this.state = 'sprintWind'; this.stateT = 0.45; }
    } else if (d > 170) {
      if (Math.random() < 0.55 && this.onGround) {
        this.state = 'squash'; this.stateT = 0.55;
      } else { this.state = 'sprintWind'; this.stateT = 0.45; }
    } else {
      this.facing = Math.sign(cx(tgt) - cx(this)) || 1;
      this.state = 'windup'; this.stateT = 0.4;
    }
  }

  think(dt, tgt) {
    this.stateT -= dt;
    switch (this.state) {
      case 'chase': {
        this.locomote(dt, tgt, this.speed * game.enemySpeedMul());
        if (this.skillCd > 0) this.skillCd -= dt;
        if (tgt && this.skillCd <= 0) this.pickSkill(tgt);
        break;
      }
      // -- Sprinter charge --
      case 'sprintWind': {
        this.vx = approach(this.vx, 0, 3000 * dt);
        if (this.stateT <= 0) { this.state = 'sprint'; this.stateT = 1.4; Sfx.play('sprint'); }
        break;
      }
      case 'sprint': {
        this.locomote(dt, tgt, this.speed * 2.4 * game.enemySpeedMul());
        if (this.stateT <= 0) this.endSkill();
        break;
      }
      // -- Hooker hook --
      case 'aim': {
        this.vx = approach(this.vx, 0, 3000 * dt);
        if (tgt) {
          this.hookAng = Math.atan2(cy(tgt) - cy(this), cx(tgt) - cx(this));
          this.facing = Math.cos(this.hookAng) >= 0 ? 1 : -1;
        }
        if (this.stateT <= 0 || !tgt) {
          if (!tgt) { this.endSkill(); break; }
          this.state = 'fire'; this.hookLen = 0; this.hookHit = false;
          Sfx.play('hook');
        }
        break;
      }
      case 'fire': {
        this.vx = 0;
        this.hookLen += 800 * dt;
        const tipX = cx(this) + Math.cos(this.hookAng) * this.hookLen;
        const tipY = cy(this) + Math.sin(this.hookAng) * this.hookLen;
        const p = game.player;
        if (!this.hookHit && tipX > p.x - 6 && tipX < p.x + p.w + 6 && tipY > p.y - 6 && tipY < p.y + p.h + 6) {
          this.hookHit = true;
          const ang = Math.atan2(cy(this) - cy(p), cx(this) - cx(p));
          p.vx = Math.cos(ang) * 750;
          p.vy = Math.sin(ang) * 750 - 120;
          p.kbT = 0.3;
          game.shake(0.15, 5);
          Sfx.play('reel');
        }
        if (this.hookLen >= this.RANGE || this.hookHit) this.state = 'retract';
        break;
      }
      case 'retract': {
        this.hookLen -= 1000 * dt;
        if (this.hookLen <= 0) { this.hookLen = 0; this.endSkill(); }
        break;
      }
      // -- Jumper leap --
      case 'squash': {
        this.vx = approach(this.vx, 0, 3000 * dt);
        if (this.stateT <= 0) {
          const p = game.player;
          const t = 0.85;
          const px = cx(p) + p.vx * 0.4;
          this.vx = clamp((px - cx(this)) / t, -460, 460);
          this.vy = clamp((p.y - this.y - 0.5 * GRAV * t * t) / t, -940, -480);
          this.state = 'leap';
          this.facing = this.vx >= 0 ? 1 : -1;
          Sfx.play('leap');
        }
        break;
      }
      case 'leap': {
        if (this.onGround && this.vy >= 0) {
          game.shake(0.3, 9);
          game.burst(cx(this), this.y + this.h, PAL['1'], 16);
          Sfx.play('slam');
          const p = game.player;
          if (p.onGround && Math.abs(cx(p) - cx(this)) < 120 && Math.abs((p.y + p.h) - (this.y + this.h)) < 36) {
            p.hit(this);
          }
          this.endSkill();
        }
        break;
      }
      // -- Slasher dash --
      case 'windup': {
        this.vx = approach(this.vx, 0, 3000 * dt);
        if (this.stateT <= 0) { this.state = 'dash'; this.stateT = 0.18; Sfx.play('slash'); }
        break;
      }
      case 'dash': {
        this.vx = this.facing * 1300;
        const p = game.player;
        const hb = { x: this.x - 16, y: this.y - 8, w: this.w + 32, h: this.h + 16 };
        if (overlap(hb, p)) p.hit(this);
        if (this.stateT <= 0) { this.state = 'recover'; this.stateT = 0.5; }
        break;
      }
      case 'recover': {
        this.vx = approach(this.vx, 0, 2400 * dt);
        if (this.stateT <= 0) this.endSkill();
        break;
      }
    }
  }

  draw(g) {
    // Telegraphs
    if (this.state === 'aim') {
      g.strokeStyle = 'rgba(244, 244, 244, 0.45)';
      g.lineWidth = 2;
      g.setLineDash([6, 6]);
      g.beginPath();
      g.moveTo(cx(this), cy(this));
      g.lineTo(cx(this) + Math.cos(this.hookAng) * this.RANGE, cy(this) + Math.sin(this.hookAng) * this.RANGE);
      g.stroke();
      g.setLineDash([]);
    }
    if (this.state === 'windup') {
      const w = this.DASH_RANGE + this.w;
      const x = this.facing > 0 ? this.x : this.x + this.w - w;
      const a = 0.18 + 0.25 * (1 - this.stateT / 0.4);
      g.fillStyle = `rgba(177, 62, 83, ${a})`;
      g.fillRect(x, this.y - 10, w, this.h + 20);
    }
    if (this.hookLen > 0) {
      const tipX = cx(this) + Math.cos(this.hookAng) * this.hookLen;
      const tipY = cy(this) + Math.sin(this.hookAng) * this.hookLen;
      g.strokeStyle = PAL['d'];
      g.lineWidth = 4;
      g.beginPath();
      g.moveTo(cx(this), cy(this));
      g.lineTo(tipX, tipY);
      g.stroke();
      g.fillStyle = PAL['c'];
      g.fillRect(tipX - 5, tipY - 5, 10, 10);
    }

    if (this.state === 'sprintWind' && Math.floor(this.anim * 14) % 2 === 0) {
      this.drawFlash(g);
    } else if (this.state === 'squash') {
      const t = clamp(this.stateT / 0.55, 0, 1);
      const sy = 0.55 + 0.45 * t;
      g.save();
      g.translate(cx(this), this.y + this.h);
      g.scale(this.facing < 0 ? -1 : 1, sy);
      g.drawImage(this.sprite, -this.sprite.width / 2, -this.sprite.height);
      g.restore();
    } else {
      super.draw(g);
      if (this.state === 'sprint' || this.state === 'dash') {
        g.fillStyle = 'rgba(93, 39, 93, 0.4)';
        g.fillRect(this.x - this.facing * 24, this.y + 6, this.w, this.h - 10);
      }
    }
  }
}

const BOSS_TYPE = {
  cls: Boss, boss: true, name: 'Warden King',
  tip: 'It knows ALL their tricks. Spend your mana wisely.',
};

const ENEMY_TYPES = [
  { cls: Chaser, name: 'Chaser', tip: 'It follows you everywhere. Keep moving!' },
  { cls: Sprinter, name: 'Sprinter', tip: 'White flash means it\'s about to CHARGE.' },
  { cls: Hooker, name: 'Hooker', tip: 'Its hook drags you in. Don\'t stand in the aim line.' },
  { cls: Jumper, name: 'Jumper', tip: 'It leaps where you\'re going. Change direction!' },
  { cls: Slasher, name: 'Slasher', tip: 'Telegraphed dash-slash. Stay out of the red zone.' },
];
