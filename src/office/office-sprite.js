/**
 * Office Sprite — Sprite sheet loading, drawing, animation ticking
 * Ported from pixel_office spriteSheet.ts
 * Uses AVATAR_FILES from office-config.js (synced with taskbar renderer)
 */

/* eslint-disable no-unused-vars */

var officeSkinImages = {}; // filename → Image

function loadAllOfficeSkins() {
  const ts = Date.now();
  officeSkinImages = {};
  const promises = [];
  for (let i = 0; i < AVATAR_FILES.length; i++) {
    (function (filename) {
      const img = new Image();
      img.src = '/public/characters/' + filename + '?v=' + ts;
      officeSkinImages[filename] = img;
      promises.push(new Promise(function (resolve) {
        if (img.complete) { resolve(); return; }
        img.onload = function () { resolve(); };
        img.onerror = function () {
          console.error('[OfficeSprite] Failed to load:', img.src);
          resolve();
        };
      }));
    })(AVATAR_FILES[i]);
  }
  return Promise.all(promises);
}

function getOfficeSkinImage(avatarFile) {
  return officeSkinImages[avatarFile] || officeSkinImages[AVATAR_FILES[0]];
}

function drawOfficeSprite(ctx, agent) {
  const img = getOfficeSkinImage(agent.avatarFile);
  if (!img || !img.complete || img.naturalWidth === 0) return;

  const frames = SPRITE_FRAMES[agent.currentAnim];
  if (!frames) return;
  const frameIdx = frames[agent.animFrame % frames.length];

  const sx = (frameIdx % OFFICE.COLS) * OFFICE.FRAME_W;
  const sy = Math.floor(frameIdx / OFFICE.COLS) * OFFICE.FRAME_H;

  ctx.drawImage(
    img,
    sx, sy, OFFICE.FRAME_W, OFFICE.FRAME_H,
    Math.round(agent.x - OFFICE.FRAME_W / 2),
    Math.round(agent.y - OFFICE.FRAME_H),
    OFFICE.FRAME_W, OFFICE.FRAME_H
  );
}

function tickOfficeAnimation(agent, deltaMs) {
  agent.animTimer += deltaMs;
  if (agent.animTimer >= OFFICE.ANIM_INTERVAL) {
    agent.animTimer -= OFFICE.ANIM_INTERVAL;
    const frames = SPRITE_FRAMES[agent.currentAnim];
    if (frames) {
      agent.animFrame = (agent.animFrame + 1) % frames.length;
    }
  }
}

function animKeyFromDir(dir, moving) {
  if (moving) return 'walk_' + dir;
  return dir + '_idle';
}
