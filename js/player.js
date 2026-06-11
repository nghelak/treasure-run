// Player: run/jump physics with coyote time and jump buffering,
// hearts, knockback, i-frames, treasure carry state, dash.

class Player {
  constructor(x, y) {
    this.x = x; this.y = y;
    this.w = 24; this.h = 32;
    this.vx = 0; this.vy = 0;
    this.facing = 1;
    this.onGround = false;
    this.coyote = 0;
    this.jumpBuf = 0;
    this.hearts = 3;
    this.invuln = 0;
    this.kbT = 0;       // knockback: no control while > 0
    this.dashT = 0;     // dashing while > 0 (invulnerable)
    this.dropT = 0;     // dropping through one-way platforms while > 0
    this.airJumps = 0;
    this.carrying = false;
    this.anim = 0;
  }

  get speed() {
    return this.carrying ? 260 * 0.85 : 260;
  }

  update(dt) {
    let mx = 0;
    if (Input.down('left')) mx -= 1;
    if (Input.down('right')) mx += 1;

    if (this.dashT > 0) {
      this.dashT -= dt;
      this.vx = this.facing * 820;
      this.vy = 0;
    } else if (this.kbT > 0) {
      this.kbT -= dt;
      this.vy += GRAV * dt;
    } else {
      const accel = this.onGround ? 2600 : 1700;
      this.vx = approach(this.vx, mx * this.speed, accel * dt);
      if (mx) this.facing = mx;
      this.vy += GRAV * dt;
    }
    if (this.vy > MAXFALL) this.vy = MAXFALL;

    // Coyote time + jump buffer
    this.coyote = this.onGround ? 0.1 : Math.max(0, this.coyote - dt);
    this.jumpBuf = Input.pressed('jump') ? 0.12 : Math.max(0, this.jumpBuf - dt);

    if (this.jumpBuf > 0 && this.kbT <= 0) {
      if (this.coyote > 0) {
        this.vy = -JUMPV;
        this.coyote = 0; this.jumpBuf = 0;
        Sfx.play('jump');
      } else if (this.airJumps > 0 && game.spendMana(gadgetById('doublejump').mana)) {
        this.vy = -JUMPV * 0.92;
        this.airJumps--; this.jumpBuf = 0;
        game.burst(cx(this), this.y + this.h, PAL['5'], 8);
        Sfx.play('jump');
      }
    }

    // Drop through one-way platforms
    if (Input.pressed('down') && this.onGround) this.dropT = 0.18;
    if (this.dropT > 0) { this.dropT -= dt; if (this.vy < 100) this.vy = 100; }

    moveBody(this, dt);

    if (this.onGround) this.airJumps = game.has('doublejump') ? 1 : 0;
    if (this.invuln > 0) this.invuln -= dt;
    this.anim += dt;
  }

  hit(from) {
    if (this.invuln > 0 || this.dashT > 0) return false;

    const dir = cx(this) < cx(from) ? -1 : 1;

    if (game.has('shield') && game.cooldowns.shield <= 0) {
      game.cooldowns.shield = gadgetById('shield').cd;
      this.vx = dir * 250; this.vy = -180; this.kbT = 0.15;
      this.invuln = 0.8;
      game.burst(cx(this), cy(this), PAL['b'], 14);
      Sfx.play('shield');
      return false;
    }

    this.hearts--;
    this.vx = dir * 380; this.vy = -300;
    this.kbT = 0.25;
    this.invuln = 1.5;
    game.shake(0.25, 7);
    game.burst(cx(this), cy(this), PAL['2'], 12);
    Sfx.play('hit');
    return true;
  }

  draw(g) {
    // Hero glow (always visible, pulses)
    const px = cx(this), py = cy(this);
    const r = 30 + Math.sin(this.anim * 4) * 4;
    const grad = g.createRadialGradient(px, py, 6, px, py, r);
    grad.addColorStop(0, 'rgba(255, 226, 140, 0.28)');
    grad.addColorStop(1, 'rgba(255, 226, 140, 0)');
    g.fillStyle = grad;
    g.fillRect(px - r, py - r, r * 2, r * 2);

    this.drawManaBar(g);

    if (this.invuln > 0 && Math.floor(this.invuln * 12) % 2 === 0) return;

    let img = Sprites.playerIdle;
    if (!this.onGround) img = Sprites.playerJump;
    else if (Math.abs(this.vx) > 30) {
      img = Math.floor(this.anim * 10) % 2 ? Sprites.playerRun1 : Sprites.playerRun2;
    }
    drawSprite(g, img, this.x, this.y, this.facing < 0);

    // Shield bubble
    if (game.has('shield') && game.cooldowns.shield <= 0) {
      g.strokeStyle = 'rgba(115, 239, 247, 0.6)';
      g.lineWidth = 2;
      g.beginPath();
      g.arc(cx(this), cy(this), 24, 0, Math.PI * 2);
      g.stroke();
    }

    // Carried treasure above head (above the mana bar)
    if (this.carrying) {
      const bob = Math.sin(this.anim * 8) * 2;
      drawSprite(g, Sprites.treasure, cx(this) - Sprites.treasure.width / 2, this.y - 42 + bob, false);
    }

    // Dash trail
    if (this.dashT > 0) {
      g.fillStyle = 'rgba(65, 166, 246, 0.35)';
      g.fillRect(this.x - this.facing * 18, this.y + 4, this.w, this.h - 8);
    }
  }

  // Over-head mana bar; refills over time, blinks red on a failed cast.
  drawManaBar(g) {
    const bw = 30, bh = 4;
    const bx = cx(this) - bw / 2, by = this.y - 12;
    g.fillStyle = 'rgba(11, 13, 22, 0.85)';
    g.fillRect(bx - 1, by - 1, bw + 2, bh + 2);
    const frac = clamp(game.mana / game.manaMax, 0, 1);
    const denied = game.manaFlash > 0 && Math.floor(game.manaFlash * 16) % 2 === 0;
    g.fillStyle = denied ? PAL['2'] : (frac >= 1 ? PAL['b'] : PAL['a']);
    g.fillRect(bx, by, bw * frac, bh);
  }
}
