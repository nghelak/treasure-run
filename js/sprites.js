// Pixel-art placeholder sprites, defined as string maps and baked to
// offscreen canvases at load. Palette is Sweetie-16.

const PAL = {
  '0': '#1a1c2c', '1': '#5d275d', '2': '#b13e53', '3': '#ef7d57',
  '4': '#ffcd75', '5': '#a7f070', '6': '#38b764', '7': '#257179',
  '8': '#29366f', '9': '#3b5dc9', 'a': '#41a6f6', 'b': '#73eff7',
  'c': '#f4f4f4', 'd': '#94b0c2', 'e': '#566c86', 'f': '#333c57',
};

function makeSprite(rows, scale = 2) {
  const h = rows.length, w = rows[0].length;
  const c = document.createElement('canvas');
  c.width = w * scale; c.height = h * scale;
  const g = c.getContext('2d');
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const ch = rows[y][x];
      if (ch === '.' || ch === ' ') continue;
      g.fillStyle = PAL[ch] || '#ff00ff';
      g.fillRect(x * scale, y * scale, scale, scale);
    }
  }
  return c;
}

// White silhouette of a sprite, used for hit flashes / telegraphs.
function makeWhite(img) {
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0);
  g.globalCompositeOperation = 'source-atop';
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, c.width, c.height);
  return c;
}

function drawSprite(g, img, x, y, flip) {
  if (flip) {
    g.save();
    g.translate(Math.round(x) + img.width, Math.round(y));
    g.scale(-1, 1);
    g.drawImage(img, 0, 0);
    g.restore();
  } else {
    g.drawImage(img, Math.round(x), Math.round(y));
  }
}

const Sprites = {};

(function initSprites() {
  const playerLegs = {
    idle: ['....8888....', '....8888....', '....8..8....', '....8..8....', '....f..f....', '...ff..ff...'],
    run1: ['....8888....', '...88..88...', '...8....8...', '..f......8..', '..f......f..', '.ff......ff.'],
    run2: ['....8888....', '....8888....', '.....88.....', '....8..8....', '....f.f.....', '...ff.ff....'],
    jump: ['....8888....', '...8888.....', '...88.......', '...f........', '..ff........', '............'],
  };
  const playerTop = [
    '....9999....',
    '...999999...',
    '...999999...',
    '...444444...',
    '...404404...',
    '...444444...',
    '....aaaa....',
    '...aaaaaa...',
    '..4aaaaaa4..',
    '...aaaaaa...',
  ];
  const playerFrame = legs => makeSprite(playerTop.concat(legs));

  Sprites.playerIdle = playerFrame(playerLegs.idle);
  Sprites.playerRun1 = playerFrame(playerLegs.run1);
  Sprites.playerRun2 = playerFrame(playerLegs.run2);
  Sprites.playerJump = playerFrame(playerLegs.jump);

  Sprites.chaser = makeSprite([
    '....222222....',
    '..2222222222..',
    '.222222222222.',
    '.22cc2222cc22.',
    '.22c02222c022.',
    '.222222222222.',
    '.222200002222.',
    '.222222222222.',
    '..2222222222..',
    '..22..22..22..',
  ]);

  Sprites.sprinter = makeSprite([
    '....3333....',
    '...333333...',
    '...3c03c0...',
    '...333333...',
    '....3333....',
    '...333333...',
    '..33333333..',
    '...333333...',
    '....3333....',
    '....3..3....',
    '...3....3...',
    '...f....f...',
  ]);

  Sprites.hooker = makeSprite([
    '...111111....',
    '..11111111...',
    '..1cc11cc1...',
    '..1c011c01...',
    '..11111111...',
    '..11111111...',
    '..111111111e.',
    '..11111111.ee',
    '..11111111...',
    '...111111....',
    '...11..11....',
    '...11..11....',
    '...ff..ff....',
  ]);

  Sprites.jumper = makeSprite([
    '..6c6....6c6..',
    '..666....666..',
    '.666666666666.',
    '.666666666666.',
    '.666666666666.',
    '.666000000666.',
    '.666666666666.',
    '..666....666..',
    '.66........66.',
    '.66........66.',
  ]);

  Sprites.slasher = makeSprite([
    '....eeee........',
    '...eeeeee.......',
    '...ec0ec0e......',
    '...eeeeee.......',
    '..eeeeeeee......',
    '..eeeeeeeedccccc',
    '..eeeeeeee......',
    '...eeeeee.......',
    '...ee..ee.......',
    '...ee..ee.......',
    '...ff..ff.......',
  ]);

  Sprites.treasure = makeSprite([
    '..4444444444..',
    '.444444444444.',
    '.433333333334.',
    '.444444444444.',
    '.444444444444.',
    '.44444cc44444.',
    '.44444cc44444.',
    '.444444444444.',
    '.f4444444444f.',
    '.ffffffffffff.',
  ]);

  Sprites.heart = makeSprite([
    '.22..22.',
    '22222222',
    '22222222',
    '.222222.',
    '..2222..',
    '...22...',
  ]);

  Sprites.heartEmpty = makeSprite([
    '.ff..ff.',
    'ffffffff',
    'ffffffff',
    '.ffffff.',
    '..ffff..',
    '...ff...',
  ]);

  Sprites.flag = makeSprite([
    'd55555......',
    'd5555555....',
    'd555555555..',
    'd5555555....',
    'd55555......',
    'd...........',
    'd...........',
    'd...........',
    'd...........',
    'd...........',
    'd...........',
    'd...........',
    'd...........',
    'd...........',
    'd...........',
    'd...........',
    'd...........',
    'd...........',
    'd...........',
    'ff..........',
  ]);

  Sprites.mine = makeSprite([
    '..cc..',
    '.3333.',
    '333333',
    '333333',
    'ffffff',
  ]);

  // Boss: crowned brute, drawn at 4x scale
  Sprites.boss = makeSprite([
    '..4...44...4..',
    '..4444444444..',
    '..1111111111..',
    '.111111111111.',
    '.11cc1111cc11.',
    '.11c01111c011.',
    '.111111111111.',
    '.112222222211.',
    '.111111111111.',
    '.111111111111.',
    '..1111111111..',
    '..11..11..11..',
  ], 4);

  // White variants for flashes
  Sprites.chaserW = makeWhite(Sprites.chaser);
  Sprites.sprinterW = makeWhite(Sprites.sprinter);
  Sprites.hookerW = makeWhite(Sprites.hooker);
  Sprites.jumperW = makeWhite(Sprites.jumper);
  Sprites.slasherW = makeWhite(Sprites.slasher);
  Sprites.bossW = makeWhite(Sprites.boss);
  Sprites.playerW = makeWhite(Sprites.playerIdle);
})();
