// Main game: fixed-timestep loop, state machine
// (menu -> intro -> playing -> pick -> ... -> fail/win), camera, HUD, SFX.

const WIN_ROUND = 10;

// --- Tiny WebAudio synth ---------------------------------------------------
const Sfx = {
  ctx: null,
  unlock() {
    if (!this.ctx) {
      try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { /* no audio */ }
    }
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  },
  tone(f0, f1, dur, type, vol, delay = 0) {
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    const gn = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t + dur);
    gn.gain.setValueAtTime(vol, t);
    gn.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(gn); gn.connect(this.ctx.destination);
    o.start(t); o.stop(t + dur + 0.02);
  },
  play(name) {
    if (!this.ctx) return;
    const T = {
      jump:     [[420, 680, 0.1, 'square', 0.12]],
      hit:      [[220, 70, 0.22, 'sawtooth', 0.22]],
      pickup:   [[620, 1240, 0.16, 'square', 0.16], [930, 1860, 0.16, 'square', 0.12, 0.08]],
      dash:     [[760, 280, 0.12, 'sawtooth', 0.14]],
      hook:     [[240, 200, 0.1, 'square', 0.14]],
      reel:     [[160, 420, 0.18, 'sawtooth', 0.18]],
      slash:    [[950, 180, 0.09, 'sawtooth', 0.16]],
      sprint:   [[480, 820, 0.14, 'square', 0.12]],
      leap:     [[300, 720, 0.14, 'square', 0.12]],
      slam:     [[130, 50, 0.18, 'sawtooth', 0.22]],
      shield:   [[820, 820, 0.12, 'triangle', 0.18]],
      zap:      [[1100, 180, 0.12, 'square', 0.16]],
      gadget:   [[520, 660, 0.08, 'square', 0.12]],
      smoke:    [[200, 90, 0.3, 'triangle', 0.16]],
      select:   [[760, 760, 0.06, 'square', 0.1]],
      ready:    [[880, 1320, 0.1, 'square', 0.12], [1320, 1760, 0.1, 'square', 0.1, 0.07]],
      deny:     [[150, 110, 0.14, 'square', 0.16]],
      fail:     [[420, 320, 0.18, 'square', 0.16], [320, 230, 0.18, 'square', 0.16, 0.18], [230, 110, 0.3, 'square', 0.16, 0.36]],
      roundwin: [[520, 520, 0.12, 'square', 0.14], [660, 660, 0.12, 'square', 0.14, 0.12], [780, 780, 0.12, 'square', 0.14, 0.24], [1040, 1040, 0.22, 'square', 0.14, 0.36]],
    }[name];
    if (T) for (const a of T) this.tone(a[0], a[1], a[2], a[3], a[4], a[5] || 0);
  },
};

// --- Game ------------------------------------------------------------------
const game = {
  state: 'menu',
  round: 1,
  gadgets: {},
  cooldowns: {},
  player: null,
  enemies: [],
  treasure: { x: 0, y: 0, w: 28, h: 20, taken: false },
  decoy: null,
  mines: [],
  particles: [],
  uiParticles: [],
  readyFlash: {},
  mana: 100,
  manaMax: 100,
  manaFlash: 0,
  cam: { x: 0, y: 0 },
  shakeT: 0, shakeMag: 0,
  introT: 0,
  choices: [],
  pickIdx: 0,
  time: 0,

  has(id) { return !!this.gadgets[id]; },

  spendMana(n) {
    if (n <= 0) return true;
    if (this.mana >= n) { this.mana -= n; return true; }
    this.manaFlash = 0.4;
    Sfx.play('deny');
    return false;
  },

  // Screen-space position of the i-th owned gadget icon in the HUD.
  iconCenter(i) { return { x: 14 + i * 44 + 18, y: VIEW.h - 50 + 18 }; },

  // Where a gadget's cooldown indicator lives on screen (HUD icon row on
  // desktop, on-screen skill button on touch devices).
  gadgetAnchor(gg) {
    if (TouchUI.active) {
      const idx = TouchUI.ownedSkills().findIndex(g2 => g2.id === gg.id);
      if (idx >= 0 && TouchUI.skillSlots[idx]) {
        return { x: TouchUI.skillSlots[idx].x, y: TouchUI.skillSlots[idx].y };
      }
      return { x: 90, y: 40 }; // passives: near the hearts
    }
    const i = GADGETS.filter(g2 => this.has(g2.id)).findIndex(g2 => g2.id === gg.id);
    return this.iconCenter(i);
  },

  // A skill finished recharging: particle boom on its indicator + ping.
  skillReady(gg) {
    const c = this.gadgetAnchor(gg);
    this.readyFlash[gg.id] = 0.5;
    for (let n = 0; n < 14; n++) {
      const a = rnd(0, Math.PI * 2), s = rnd(50, 160);
      this.uiParticles.push({
        x: c.x, y: c.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: rnd(0.3, 0.6), color: gg.color, size: rnd(2, 4),
      });
    }
    Sfx.play('ready');
  },

  enemySpeedMul() {
    const loop = Math.floor((this.round - 1) / 5);
    let m = 1 + 0.05 * loop;
    if (this.player && this.player.carrying) m *= 1.15; // alerted!
    return m;
  },

  isBossRound() { return this.round % 5 === 0; },
  roundEnemyType() {
    if (this.isBossRound()) return BOSS_TYPE;
    // Skip boss rounds when cycling the roster, so every type still appears
    const idx = (this.round - 1 - Math.floor((this.round - 1) / 5)) % 5;
    return ENEMY_TYPES[idx];
  },
  roundEnemyCount() {
    if (this.isBossRound() || this.round === 1) return 1;
    const loop = Math.floor((this.round - 1) / 5);
    if (loop === 0) return 3;
    // First round after a boss eases the new type in, then ramps up
    return (this.round - 1) % 5 === 0 ? 3 : 4;
  },

  // Boss rounds bring minions of the previous round's enemy type
  bossMinionType() {
    const r = this.round - 1; // the round before a boss is never a boss
    return ENEMY_TYPES[(r - 1 - Math.floor((r - 1) / 5)) % 5];
  },
  bossMinionCount() { return 1 + this.round / 5; },

  shake(t, mag) { this.shakeT = Math.max(this.shakeT, t); this.shakeMag = mag; },

  burst(x, y, color, n) {
    for (let i = 0; i < n; i++) {
      const a = rnd(0, Math.PI * 2), s = rnd(40, 180);
      this.particles.push({
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 60,
        life: rnd(0.3, 0.7), color, size: rnd(2, 5),
      });
    }
  },

  newRun() {
    this.round = 1;
    this.gadgets = {};
    this.cooldowns = {};
    this.startRound();
  },

  startRound() {
    Level.generate(this.round);
    this.player = new Player(Level.playerSpawn.x, Level.playerSpawn.y - 32);
    this.treasure.x = Level.treasureSpawn.x;
    this.treasure.y = Level.treasureSpawn.y;
    this.treasure.taken = false;
    this.decoy = null;
    this.mines = [];
    this.enemies = [];
    const type = this.roundEnemyType();
    if (type.boss) {
      this.enemies.push(new Boss(Level.bossSpawn.x, Level.bossSpawn.y, this.round / 5));
      const mt = this.bossMinionType();
      for (let i = 0; i < this.bossMinionCount(); i++) {
        const sp = Level.enemySpawns[i % Level.enemySpawns.length];
        this.enemies.push(new mt.cls(sp.x, sp.y - 40));
      }
    } else {
      const count = this.roundEnemyCount();
      for (let i = 0; i < count; i++) {
        const sp = Level.enemySpawns[i % Level.enemySpawns.length];
        this.enemies.push(new type.cls(sp.x + (i >= Level.enemySpawns.length ? 60 : 0), sp.y - 40));
      }
    }
    for (const id in this.cooldowns) this.cooldowns[id] = 0;
    this.mana = this.manaMax;
    this.manaFlash = 0;
    this.readyFlash = {};
    this.introT = 2.4;
    this.state = 'intro';
    this.snapCamera();
  },

  roundComplete() {
    Sfx.play('roundwin');
    this.burst(cx(this.player), cy(this.player), PAL['4'], 24);
    if (this.round >= WIN_ROUND) {
      this.state = 'win';
      return;
    }
    this.choices = rollGadgetChoices();
    if (this.choices.length > 0) {
      this.pickIdx = 0;
      this.state = 'pick';
    } else {
      this.round++;
      this.startRound();
    }
  },

  // --- Update --------------------------------------------------------------
  update(dt) {
    this.time += dt;

    // Particles always tick
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 300 * dt;
      p.life -= dt;
      if (p.life <= 0) this.particles.splice(i, 1);
    }
    for (let i = this.uiParticles.length - 1; i >= 0; i--) {
      const p = this.uiParticles[i];
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vx *= 0.94; p.vy *= 0.94;
      p.life -= dt;
      if (p.life <= 0) this.uiParticles.splice(i, 1);
    }
    for (const id in this.readyFlash) {
      if (this.readyFlash[id] > 0) this.readyFlash[id] -= dt;
    }
    if (this.manaFlash > 0) this.manaFlash -= dt;
    if (this.shakeT > 0) this.shakeT -= dt;

    switch (this.state) {
      case 'menu':
        if (Input.pressed('confirm') || Input.tap()) { Sfx.play('select'); this.newRun(); }
        break;

      case 'intro':
        this.introT -= dt;
        if (this.introT <= 0 || Input.pressed('confirm') || Input.pressed('jump') || Input.tap()) {
          this.state = 'playing';
        }
        this.updateCamera(dt);
        break;

      case 'playing':
        this.updatePlaying(dt);
        break;

      case 'pick': {
        if (Input.pressed('left')) { this.pickIdx = (this.pickIdx + this.choices.length - 1) % this.choices.length; Sfx.play('select'); }
        if (Input.pressed('right')) { this.pickIdx = (this.pickIdx + 1) % this.choices.length; Sfx.play('select'); }
        let chosen = -1;
        if (Input.pressed('pick1')) chosen = 0;
        if (Input.pressed('pick2')) chosen = 1;
        if (Input.pressed('pick3')) chosen = 2;
        if (Input.pressed('confirm') || Input.pressed('jump')) chosen = this.pickIdx;
        const tp = Input.tap();
        if (tp) {
          this.pickCardRects().forEach((rc, i) => {
            if (tp.x >= rc.x && tp.x <= rc.x + rc.w && tp.y >= rc.y && tp.y <= rc.y + rc.h) chosen = i;
          });
        }
        if (chosen >= 0 && chosen < this.choices.length) {
          const gg = this.choices[chosen];
          this.gadgets[gg.id] = true;
          this.cooldowns[gg.id] = 0;
          Sfx.play('pickup');
          this.round++;
          this.startRound();
        }
        break;
      }

      case 'fail':
        if (Input.pressed('retry') || Input.pressed('confirm') || Input.tap()) {
          Sfx.play('select');
          this.startRound();
        }
        break;

      case 'win':
        if (Input.pressed('confirm') || Input.tap()) { this.state = 'menu'; }
        break;
    }
  },

  pickCardRects() {
    const n = this.choices.length, cw = 215, ch = 150, gap = 25;
    const y = (VIEW.h - 320) / 2;
    const x0 = (VIEW.w - (n * cw + (n - 1) * gap)) / 2;
    return this.choices.map((c, i) => ({ x: x0 + i * (cw + gap), y: y + 100, w: cw, h: ch }));
  },

  updatePlaying(dt) {
    // Mana refills over time whenever it isn't full
    this.mana = Math.min(this.manaMax, this.mana + 14 * dt);

    const p = this.player;
    p.update(dt);
    updateGadgets(dt);

    // Enemies chase the decoy if one is active
    const target = this.decoy || p;
    for (const e of this.enemies) e.update(dt, target);

    // Contact damage
    for (const e of this.enemies) {
      if (e.stun > 0) continue;
      if (overlap(e, p)) p.hit(e);
    }

    // Treasure pickup
    if (!this.treasure.taken && overlap(p, this.treasure)) {
      this.treasure.taken = true;
      p.carrying = true;
      this.burst(cx(this.treasure), cy(this.treasure), PAL['4'], 18);
      this.shake(0.15, 4);
      Sfx.play('pickup');
    }

    // Deliver to base
    if (p.carrying && overlap(p, Level.baseZone)) {
      p.carrying = false;
      this.roundComplete();
      return;
    }

    // Caught
    if (p.hearts <= 0) {
      p.carrying = false;
      this.state = 'fail';
      this.shake(0.4, 10);
      Sfx.play('fail');
    }

    this.updateCamera(dt);
  },

  updateCamera(dt) {
    const p = this.player;
    if (!p) return;
    const tx = clamp(cx(p) + p.facing * 60 - VIEW.w / 2, 0, WORLD.w - VIEW.w);
    const ty = clamp(cy(p) - VIEW.h / 2, 0, WORLD.h - VIEW.h);
    const k = 1 - Math.pow(0.001, dt); // smooth exponential follow
    this.cam.x += (tx - this.cam.x) * k * 0.9;
    this.cam.y += (ty - this.cam.y) * k * 0.9;
  },

  snapCamera() {
    const p = this.player;
    this.cam.x = clamp(cx(p) - VIEW.w / 2, 0, WORLD.w - VIEW.w);
    this.cam.y = clamp(cy(p) - VIEW.h / 2, 0, WORLD.h - VIEW.h);
  },

  // --- Render --------------------------------------------------------------
  render(g) {
    drawBackground(g, this.cam.x, this.cam.y);

    if (this.state === 'menu') { this.drawMenu(g); this.drawRotateHint(g); return; }

    let sx = 0, sy = 0;
    if (this.shakeT > 0) {
      sx = rnd(-this.shakeMag, this.shakeMag);
      sy = rnd(-this.shakeMag, this.shakeMag);
    }
    g.save();
    g.translate(Math.round(-this.cam.x + sx), Math.round(-this.cam.y + sy));

    drawLevel(g);

    // Treasure
    if (!this.treasure.taken) {
      const t = this.treasure;
      const bob = Math.sin(this.time * 3) * 3;
      g.fillStyle = 'rgba(255, 205, 117, 0.15)';
      g.beginPath();
      g.arc(cx(t), cy(t) + bob, 26 + Math.sin(this.time * 5) * 3, 0, Math.PI * 2);
      g.fill();
      drawSprite(g, Sprites.treasure, t.x, t.y + bob, false);
    }

    // Mines
    for (const m of this.mines) {
      drawSprite(g, Sprites.mine, m.x, m.y, false);
      if (Math.floor(this.time * 4) % 2 === 0) {
        g.fillStyle = PAL['2'];
        g.fillRect(m.x + 5, m.y - 2, 2, 2);
      }
    }

    // Decoy (ghostly player copy)
    if (this.decoy) {
      g.save();
      g.globalAlpha = 0.45 + Math.sin(this.time * 10) * 0.15;
      drawSprite(g, Sprites.playerIdle, this.decoy.x, this.decoy.y, false);
      g.restore();
    }

    for (const e of this.enemies) e.draw(g);
    this.player.draw(g);

    for (const p of this.particles) {
      g.globalAlpha = clamp(p.life * 2, 0, 1);
      g.fillStyle = p.color;
      g.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    g.globalAlpha = 1;

    g.restore();

    this.drawHUD(g);
    this.drawTouchControls(g);

    if (this.state === 'intro') this.drawIntro(g);
    if (this.state === 'pick') this.drawPick(g);
    if (this.state === 'fail') this.drawFail(g);
    if (this.state === 'win') this.drawWin(g);

    this.drawRotateHint(g);
  },

  drawTouchControls(g) {
    if (!TouchUI.active) return;
    g.textAlign = 'center';
    g.textBaseline = 'middle';

    const drawBtn = (b, label, color, held) => {
      g.fillStyle = held ? 'rgba(115, 239, 247, 0.22)' : 'rgba(20, 24, 40, 0.45)';
      g.beginPath();
      g.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = color || 'rgba(244, 244, 244, 0.3)';
      g.lineWidth = 2;
      g.stroke();
      g.fillStyle = 'rgba(244, 244, 244, 0.75)';
      g.font = `bold ${Math.round(b.r * 0.55)}px monospace`;
      g.fillText(label, b.x, b.y + 1);
    };

    for (const b of TouchUI.moveButtons) drawBtn(b, b.label, null, Input.down(b.key));
    drawBtn(TouchUI.jumpButton, TouchUI.jumpButton.label, 'rgba(167, 240, 112, 0.5)', Input.down('jump'));

    TouchUI.ownedSkills().forEach((gg, i) => {
      const s = TouchUI.skillSlots[i];
      if (!s) return;
      const cd = this.cooldowns[gg.id] || 0;
      drawBtn(s, gg.short, gg.color, false);
      if (cd > 0 && gg.cd > 0) {
        // Cooldown pie + countdown
        g.fillStyle = 'rgba(0, 0, 0, 0.6)';
        g.beginPath();
        g.moveTo(s.x, s.y);
        g.arc(s.x, s.y, s.r, -Math.PI / 2, -Math.PI / 2 + (cd / gg.cd) * Math.PI * 2);
        g.closePath();
        g.fill();
        g.fillStyle = PAL['c'];
        g.font = 'bold 13px monospace';
        g.fillText(cd.toFixed(1), s.x, s.y + 1);
      } else {
        g.fillStyle = this.mana >= gg.mana ? PAL['a'] : PAL['2'];
        g.font = 'bold 9px monospace';
        g.fillText(gg.mana + 'mp', s.x, s.y + s.r - 9);
      }
      const rf = this.readyFlash[gg.id] || 0;
      if (rf > 0) {
        g.strokeStyle = gg.color;
        g.globalAlpha = rf / 0.5;
        g.lineWidth = 3;
        g.beginPath();
        g.arc(s.x, s.y, s.r + (1 - rf / 0.5) * 14, 0, Math.PI * 2);
        g.stroke();
        g.globalAlpha = 1;
      }
    });

    g.textBaseline = 'alphabetic';
    g.textAlign = 'left';
  },

  drawRotateHint(g) {
    if (!TouchUI.active || window.innerWidth >= window.innerHeight) return;
    g.fillStyle = 'rgba(11, 13, 22, 0.92)';
    g.fillRect(0, 0, VIEW.w, VIEW.h);
    g.textAlign = 'center';
    g.fillStyle = PAL['4'];
    g.font = 'bold 40px monospace';
    g.fillText('⟳', VIEW.w / 2, VIEW.h / 2 - 30);
    g.fillStyle = PAL['c'];
    g.font = 'bold 22px monospace';
    g.fillText('ROTATE YOUR PHONE', VIEW.w / 2, VIEW.h / 2 + 20);
    g.fillStyle = PAL['d'];
    g.font = '14px monospace';
    g.fillText('Treasure Run plays in landscape', VIEW.w / 2, VIEW.h / 2 + 50);
    g.textAlign = 'left';
  },

  drawHUD(g) {
    // Hearts
    for (let i = 0; i < 3; i++) {
      const img = i < this.player.hearts ? Sprites.heart : Sprites.heartEmpty;
      g.drawImage(img, 14 + i * 22, 12);
    }

    // Round
    g.font = 'bold 18px monospace';
    g.textAlign = 'center';
    g.fillStyle = PAL['c'];
    g.fillText('ROUND ' + this.round, VIEW.w / 2, 26);

    // Objective hint
    g.font = '12px monospace';
    g.fillStyle = PAL['d'];
    g.fillText(this.player.carrying ? 'BRING IT HOME!' : 'STEAL THE TREASURE', VIEW.w / 2, 44);

    // Gadget icons: short label, mana cost, cooldown countdown, ready flash.
    // On touch devices the on-screen skill buttons show all this instead.
    let iconIdx = 0;
    for (const gg of TouchUI.active ? [] : GADGETS) {
      if (!this.has(gg.id)) continue;
      const gx = 14 + iconIdx * 44;
      const cd = this.cooldowns[gg.id] || 0;
      const onCd = cd > 0 && gg.cd > 0;
      g.fillStyle = '#11131f';
      g.fillRect(gx, VIEW.h - 50, 36, 36);
      g.strokeStyle = gg.color;
      g.lineWidth = 2;
      g.strokeRect(gx, VIEW.h - 50, 36, 36);

      g.fillStyle = onCd ? PAL['e'] : gg.color;
      g.font = 'bold 11px monospace';
      g.fillText(gg.short, gx + 18, VIEW.h - 36);

      if (onCd) {
        const frac = clamp(cd / gg.cd, 0, 1);
        g.fillStyle = 'rgba(0, 0, 0, 0.65)';
        g.fillRect(gx, VIEW.h - 50, 36, 36 * frac);
        // Replenish countdown in seconds
        g.fillStyle = PAL['c'];
        g.font = 'bold 12px monospace';
        g.fillText(cd.toFixed(1), gx + 18, VIEW.h - 21);
      } else if (gg.mana > 0) {
        // Mana cost when ready
        g.fillStyle = this.mana >= gg.mana ? PAL['a'] : PAL['2'];
        g.font = 'bold 10px monospace';
        g.fillText(gg.mana + 'mp', gx + 18, VIEW.h - 21);
      }

      // Expanding ring when the skill just replenished
      const rf = this.readyFlash[gg.id] || 0;
      if (rf > 0) {
        const t = 1 - rf / 0.5;
        g.strokeStyle = gg.color;
        g.globalAlpha = rf / 0.5;
        g.lineWidth = 3;
        g.beginPath();
        g.arc(gx + 18, VIEW.h - 32, 18 + t * 16, 0, Math.PI * 2);
        g.stroke();
        g.globalAlpha = 1;
      }

      g.font = '10px monospace';
      g.fillStyle = PAL['d'];
      g.fillText(gg.key === 'passive' ? '' : gg.key, gx + 18, VIEW.h - 6);
      iconIdx++;
    }

    // Screen-space particles (skill-ready booms)
    for (const p of this.uiParticles) {
      g.globalAlpha = clamp(p.life * 2.5, 0, 1);
      g.fillStyle = p.color;
      g.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    g.globalAlpha = 1;

    // Off-screen objective arrow
    const objX = this.player.carrying ? 90 : cx(this.treasure);
    const objY = this.player.carrying ? 640 : cy(this.treasure);
    const sxp = objX - this.cam.x, syp = objY - this.cam.y;
    if (sxp < 30 || sxp > VIEW.w - 30 || syp < 30 || syp > VIEW.h - 30) {
      const ax = clamp(sxp, 30, VIEW.w - 30);
      const ay = clamp(syp, 50, VIEW.h - 60);
      const ang = Math.atan2(syp - ay, sxp - ax);
      g.save();
      g.translate(ax, ay);
      g.rotate(ang);
      g.fillStyle = this.player.carrying ? PAL['5'] : PAL['4'];
      g.beginPath();
      g.moveTo(12, 0); g.lineTo(-6, -8); g.lineTo(-6, 8);
      g.closePath();
      g.fill();
      g.restore();
    }
    g.textAlign = 'left';
  },

  panel(g, w, h) {
    const x = (VIEW.w - w) / 2, y = (VIEW.h - h) / 2;
    g.fillStyle = 'rgba(11, 13, 22, 0.88)';
    g.fillRect(x, y, w, h);
    g.strokeStyle = PAL['4'];
    g.lineWidth = 2;
    g.strokeRect(x, y, w, h);
    return { x, y };
  },

  drawMenu(g) {
    g.textAlign = 'center';
    g.fillStyle = PAL['4'];
    g.font = 'bold 52px monospace';
    g.fillText('TREASURE RUN', VIEW.w / 2, 150);
    g.fillStyle = PAL['d'];
    g.font = '16px monospace';
    g.fillText('Steal the treasure. Bring it home. Don\'t get caught.', VIEW.w / 2, 195);

    const bob = Math.sin(this.time * 3) * 4;
    g.drawImage(Sprites.treasure, VIEW.w / 2 - 14, 230 + bob);

    g.fillStyle = PAL['c'];
    g.font = '14px monospace';
    const lines = TouchUI.active ? [
      'MOVE  ◀ ▶ (left side)   JUMP  ▲ (right side)',
      'Skill buttons appear next to JUMP.',
      'Gadgets unlock between rounds.',
    ] : [
      'MOVE  ←→ / A D        JUMP  SPACE / W / ↑',
      'DROP DOWN  S / ↓      RETRY  R',
      'Gadgets unlock between rounds.',
    ];
    lines.forEach((l, i) => g.fillText(l, VIEW.w / 2, 320 + i * 26));

    if (Math.floor(this.time * 2) % 2 === 0) {
      g.fillStyle = PAL['5'];
      g.font = 'bold 20px monospace';
      g.fillText(TouchUI.active ? 'TAP TO START' : 'PRESS ENTER', VIEW.w / 2, 440);
    }
    g.textAlign = 'left';
  },

  drawIntro(g) {
    const type = this.roundEnemyType();
    const count = this.roundEnemyCount();
    const { y } = this.panel(g, 560, 150);
    g.textAlign = 'center';
    g.fillStyle = type.boss ? PAL['2'] : PAL['4'];
    g.font = 'bold 32px monospace';
    g.fillText(type.boss ? 'BOSS ROUND ' + this.round : 'ROUND ' + this.round, VIEW.w / 2, y + 45);
    if (type.boss) {
      const pulse = Math.floor(this.time * 4) % 2 === 0;
      g.fillStyle = pulse ? PAL['4'] : PAL['2'];
      g.font = 'bold 24px monospace';
      g.fillText('☠ ' + type.name.toUpperCase() + ' ☠', VIEW.w / 2, y + 80);
      g.fillStyle = PAL['3'];
      g.font = 'bold 14px monospace';
      g.fillText('+ ' + this.bossMinionType().name.toUpperCase() + ' MINIONS ×' + this.bossMinionCount(), VIEW.w / 2, y + 104);
      g.fillStyle = PAL['d'];
      g.font = '14px monospace';
      g.fillText(type.tip, VIEW.w / 2, y + 128);
    } else {
      g.fillStyle = PAL['2'];
      g.font = 'bold 20px monospace';
      g.fillText(type.name.toUpperCase() + (count > 1 ? '  ×' + count : ''), VIEW.w / 2, y + 80);
      g.fillStyle = PAL['d'];
      g.font = '14px monospace';
      g.fillText(type.tip, VIEW.w / 2, y + 110);
    }
    if (this.round === 1) {
      g.fillStyle = PAL['5'];
      g.fillText('Grab the chest on the far right, then run back to your flag!', VIEW.w / 2, y + 132);
    }
    g.textAlign = 'left';
  },

  drawPick(g) {
    const { y } = this.panel(g, 760, 320);
    g.textAlign = 'center';
    g.fillStyle = PAL['5'];
    g.font = 'bold 28px monospace';
    g.fillText('ROUND ' + this.round + ' CLEARED!', VIEW.w / 2, y + 45);
    g.fillStyle = PAL['c'];
    g.font = '16px monospace';
    g.fillText('Choose a gadget:', VIEW.w / 2, y + 78);

    const rects = this.pickCardRects();
    this.choices.forEach((gg, i) => {
      const rc = rects[i];
      const sel = i === this.pickIdx;
      g.fillStyle = sel ? '#1d2438' : '#11131f';
      g.fillRect(rc.x, rc.y, rc.w, rc.h);
      g.strokeStyle = sel ? PAL['4'] : gg.color;
      g.lineWidth = sel ? 3 : 2;
      g.strokeRect(rc.x, rc.y, rc.w, rc.h);

      g.fillStyle = gg.color;
      g.font = 'bold 18px monospace';
      g.fillText(gg.name, rc.x + rc.w / 2, rc.y + 38);
      g.fillStyle = PAL['d'];
      g.font = '12px monospace';
      this.wrapText(g, gg.desc, rc.x + rc.w / 2, rc.y + 66, rc.w - 24, 16);
      g.fillStyle = PAL['c'];
      g.font = 'bold 13px monospace';
      g.fillText(gg.key === 'passive' ? 'PASSIVE' : 'KEY: ' + gg.key, rc.x + rc.w / 2, rc.y + rc.h - 32);
      g.fillStyle = PAL['e'];
      g.fillText('[' + (i + 1) + ']', rc.x + rc.w / 2, rc.y + rc.h - 12);
    });

    g.fillStyle = PAL['d'];
    g.font = '13px monospace';
    g.fillText(TouchUI.active ? 'Tap a card to choose' : '1/2/3 or ←→ + ENTER', VIEW.w / 2, y + 295);
    g.textAlign = 'left';
  },

  drawFail(g) {
    const { y } = this.panel(g, 480, 150);
    g.textAlign = 'center';
    g.fillStyle = PAL['2'];
    g.font = 'bold 36px monospace';
    g.fillText('CAUGHT!', VIEW.w / 2, y + 55);
    g.fillStyle = PAL['d'];
    g.font = '15px monospace';
    g.fillText('The treasure slipped away...', VIEW.w / 2, y + 90);
    g.fillStyle = PAL['c'];
    g.font = 'bold 16px monospace';
    g.fillText('Press R to retry round ' + this.round, VIEW.w / 2, y + 122);
    g.textAlign = 'left';
  },

  drawWin(g) {
    const { y } = this.panel(g, 600, 200);
    g.textAlign = 'center';
    g.fillStyle = PAL['4'];
    g.font = 'bold 40px monospace';
    g.fillText('YOU ESCAPED!', VIEW.w / 2, y + 60);
    g.fillStyle = PAL['5'];
    g.font = '16px monospace';
    g.fillText(WIN_ROUND + ' rounds of loot, safely home.', VIEW.w / 2, y + 100);
    const owned = GADGETS.filter(gg => this.has(gg.id)).map(gg => gg.name).join(', ');
    g.fillStyle = PAL['d'];
    g.font = '13px monospace';
    g.fillText('Gadgets collected: ' + (owned || 'none — a purist!'), VIEW.w / 2, y + 130);
    g.fillStyle = PAL['c'];
    g.font = 'bold 16px monospace';
    g.fillText('Press ENTER', VIEW.w / 2, y + 170);
    g.textAlign = 'left';
  },

  wrapText(g, text, x, y, maxW, lineH) {
    const words = text.split(' ');
    let line = '';
    for (const w of words) {
      const test = line ? line + ' ' + w : w;
      if (g.measureText(test).width > maxW && line) {
        g.fillText(line, x, y);
        line = w;
        y += lineH;
      } else line = test;
    }
    if (line) g.fillText(line, x, y);
  },
};

// --- Background ------------------------------------------------------------
function drawBackground(g, camX, camY) {
  const grad = g.createLinearGradient(0, 0, 0, VIEW.h);
  grad.addColorStop(0, '#10121e');
  grad.addColorStop(1, '#1f2a52');
  g.fillStyle = grad;
  g.fillRect(0, 0, VIEW.w, VIEW.h);

  // Stars (deterministic, slow parallax)
  g.fillStyle = 'rgba(244, 244, 244, 0.4)';
  for (let i = 0; i < 50; i++) {
    const x = (((i * 311 + 37) - camX * 0.1) % VIEW.w + VIEW.w) % VIEW.w;
    const y = (i * 173 + 23) % (VIEW.h * 0.6);
    g.fillRect(x, y, 2, 2);
  }

  // Two parallax hill layers
  const layers = [
    { f: 0.25, base: 430, amp: 60, color: '#181c33' },
    { f: 0.5, base: 490, amp: 45, color: '#222845' },
  ];
  for (const L of layers) {
    g.fillStyle = L.color;
    g.beginPath();
    g.moveTo(0, VIEW.h);
    for (let x = 0; x <= VIEW.w; x += 16) {
      const wx = x + camX * L.f;
      const y = L.base - camY * 0.3 + Math.sin(wx * 0.006) * L.amp + Math.sin(wx * 0.017) * L.amp * 0.4;
      g.lineTo(x, y);
    }
    g.lineTo(VIEW.w, VIEW.h);
    g.closePath();
    g.fill();
  }
}

// --- Boot ------------------------------------------------------------------
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;

const DT = 1 / 60;
let last = performance.now();
let acc = 0;

function step(now) {
  acc += Math.min((now - last) / 1000, 0.25);
  last = now;
  while (acc >= DT) {
    game.update(DT);
    Input.endFrame();
    acc -= DT;
  }
  game.render(ctx);
}

function frame(now) {
  step(now);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Keep simulating when rAF is throttled (hidden/background tab).
setInterval(() => {
  const now = performance.now();
  if (now - last > 50) step(now);
}, 33);
