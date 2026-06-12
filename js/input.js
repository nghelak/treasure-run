// Keyboard + touch input. `down` is held state, `pressed` fires once per
// fixed update. Touch devices get on-screen controls (TouchUI): movement on
// the left, jump + skill buttons on the right. Taps outside buttons are
// reported via Input.tap() for menu/pick screens.

const Input = (() => {
  const KEYMAP = {
    ArrowLeft: 'left', KeyA: 'left',
    ArrowRight: 'right', KeyD: 'right',
    ArrowUp: 'jump', KeyW: 'jump', Space: 'jump',
    ArrowDown: 'down', KeyS: 'down',
    ShiftLeft: 'dash', ShiftRight: 'dash',
    KeyE: 'decoy', KeyQ: 'smoke', KeyF: 'mine',
    KeyR: 'retry', Enter: 'confirm',
    Digit1: 'pick1', Digit2: 'pick2', Digit3: 'pick3',
  };

  const keyDown = {};
  const touchDown = {};
  const pressed = {};
  let tap = null;

  window.addEventListener('keydown', (e) => {
    const k = KEYMAP[e.code];
    if (!k) return;
    e.preventDefault();
    if (!keyDown[k]) pressed[k] = true;
    keyDown[k] = true;
    if (typeof Sfx !== 'undefined') Sfx.unlock();
  });

  window.addEventListener('keyup', (e) => {
    const k = KEYMAP[e.code];
    if (!k) return;
    e.preventDefault();
    keyDown[k] = false;
  });

  return {
    down: (k) => !!keyDown[k] || !!touchDown[k],
    pressed: (k) => !!pressed[k],
    tap: () => tap,
    press: (k) => { pressed[k] = true; },
    setTap: (p) => { tap = p; },
    touchDown,
    endFrame: () => {
      for (const k in pressed) pressed[k] = false;
      tap = null;
    },
  };
})();

const TouchUI = {
  // Visible immediately on coarse-pointer devices; also activates on first touch
  active: ('ontouchstart' in window) ||
    (window.matchMedia && matchMedia('(any-pointer: coarse)').matches),

  // Movement cluster (bottom-left) + jump (bottom-right), canvas coordinates
  moveButtons: [
    { key: 'left', label: '◀', x: 72, y: 462, r: 46 },
    { key: 'right', label: '▶', x: 184, y: 462, r: 46 },
    { key: 'down', label: '▼', x: 128, y: 360, r: 32 },
  ],
  jumpButton: { key: 'jump', label: '▲', x: 878, y: 458, r: 52 },

  // Skill buttons fan out to the upper-left of jump; filled in GADGETS order
  // with the player's owned active (non-passive) gadgets
  skillSlots: [
    { x: 788, y: 488, r: 33 },
    { x: 720, y: 440, r: 33 },
    { x: 672, y: 378, r: 33 },
    { x: 648, y: 308, r: 33 },
  ],

  // Active (non-passive) gadgets the player owns, in GADGETS order
  ownedSkills() {
    if (typeof game === 'undefined' || typeof GADGETS === 'undefined') return [];
    return GADGETS.filter(gg => game.has(gg.id) && gg.key !== 'passive');
  },

  // All currently hittable buttons
  buttons() {
    const out = [...this.moveButtons, this.jumpButton];
    this.ownedSkills().forEach((gg, i) => {
      if (this.skillSlots[i]) out.push({ ...this.skillSlots[i], key: gg.id, gadget: gg });
    });
    return out;
  },

  hit(p) {
    let best = null, bestD = Infinity;
    for (const b of this.buttons()) {
      const d = Math.hypot(p.x - b.x, p.y - b.y);
      if (d <= b.r + 14 && d < bestD) { best = b; bestD = d; }
    }
    return best;
  },
};

(() => {
  const cvs = document.getElementById('game');

  function canvasPos(t) {
    const r = cvs.getBoundingClientRect();
    return { x: (t.clientX - r.left) * 960 / r.width, y: (t.clientY - r.top) * 540 / r.height };
  }

  function refresh(e, isStart) {
    e.preventDefault();
    TouchUI.active = true;
    if (typeof Sfx !== 'undefined') Sfx.unlock();

    const prev = { ...Input.touchDown };
    for (const k in Input.touchDown) delete Input.touchDown[k];
    for (const t of e.touches) {
      const b = TouchUI.hit(canvasPos(t));
      if (b) Input.touchDown[b.key] = true;
    }
    for (const k in Input.touchDown) {
      if (!prev[k]) Input.press(k);
    }
    if (isStart) {
      for (const t of e.changedTouches) {
        const p = canvasPos(t);
        if (!TouchUI.hit(p)) Input.setTap(p);
      }
    }
  }

  cvs.addEventListener('touchstart', e => refresh(e, true), { passive: false });
  cvs.addEventListener('touchmove', e => refresh(e, false), { passive: false });
  cvs.addEventListener('touchend', e => refresh(e, false), { passive: false });
  cvs.addEventListener('touchcancel', e => refresh(e, false), { passive: false });
})();
