// Keyboard state. `down` is held state, `pressed` fires once per fixed update.

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

  const down = {};
  const pressed = {};

  window.addEventListener('keydown', (e) => {
    const k = KEYMAP[e.code];
    if (!k) return;
    e.preventDefault();
    if (!down[k]) pressed[k] = true;
    down[k] = true;
    if (typeof Sfx !== 'undefined') Sfx.unlock();
  });

  window.addEventListener('keyup', (e) => {
    const k = KEYMAP[e.code];
    if (!k) return;
    e.preventDefault();
    down[k] = false;
  });

  return {
    down: (k) => !!down[k],
    pressed: (k) => !!pressed[k],
    endFrame: () => { for (const k in pressed) pressed[k] = false; },
  };
})();
