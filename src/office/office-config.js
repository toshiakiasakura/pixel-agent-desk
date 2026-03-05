/**
 * Office Config — Constants, sprite frame map, seat configs, state mappings
 * Ported from pixel_office spriteSheet.ts, types.ts, seatConfigs.ts
 */

/* eslint-disable no-unused-vars */

const OFFICE = {
  TILE_SIZE: 32,
  FRAME_W: 48,
  FRAME_H: 64,
  COLS: 9,
  ANIM_FPS: 8,
  ANIM_INTERVAL: 1000 / 8,
  MOVE_SPEED: 110,
  ARRIVE_THRESHOLD: 2,
};

// Sprite frame map (avatar_*.webp — 432x256, 9cols x 4rows, 48x64px/frame)
const SPRITE_FRAMES = {
  down_idle:   [0],
  walk_down:   [1, 2, 3, 4],
  left_idle:   [5],
  walk_left:   [6, 7, 8, 9],
  right_idle:  [10],
  walk_right:  [11, 12, 13, 14],
  up_idle:     [15],
  walk_up:     [16, 17, 18, 19],
  dance:       [20, 21, 22, 23, 24, 25, 26, 27],
  jump_down:   [28],
  jump_left:   [29],
  jump_right:  [30],
  jump_up:     [31],
  sit_down:    [32],
  sit_left:    [33],
  sit_right:   [34],
  sit_up:      [35],
};

// Seat direction/pose config (global ID → pose)
const SEAT_MAP = {
  10: { dir: 'right', animType: 'sit' },
  12: { dir: 'right', animType: 'sit' },
  18: { dir: 'right', animType: 'sit' },
  28: { dir: 'right', animType: 'sit' },

  11: { dir: 'left', animType: 'sit' },
  13: { dir: 'left', animType: 'sit' },
  19: { dir: 'left', animType: 'sit' },
  29: { dir: 'left', animType: 'sit' },

  24: { dir: 'up', animType: 'stand' },

  4:  { dir: 'up', animType: 'sit' },
  5:  { dir: 'up', animType: 'sit' },
  6:  { dir: 'up', animType: 'sit' },
  7:  { dir: 'up', animType: 'sit' },
  14: { dir: 'up', animType: 'sit' },
  15: { dir: 'up', animType: 'sit' },
};

function getSeatConfig(id) {
  return SEAT_MAP[id] || { dir: 'down', animType: 'sit' };
}

// Dashboard status → office zone mapping
const STATE_ZONE_MAP = {
  'working':   'desk',
  'thinking':  'desk',
  'waiting':   'idle',
  'completed': 'idle',
  'help':      'desk',
  'error':     'desk',
};

// State colors for nametags
const STATE_COLORS = {
  idle:      '#22c55e',
  working:   '#f97316',
  thinking:  '#8b5cf6',
  meeting:   '#3b82f6',
  wandering: '#a855f7',
  error:     '#ef4444',
  done:      '#0ea5e9',
  completed: '#0ea5e9',
  waiting:   '#22c55e',
  help:      '#ef4444',
};

// All available avatar filenames (must match public/characters/)
var AVATAR_FILES = [
  'avatar_0.webp','avatar_1.webp','avatar_2.webp','avatar_3.webp',
  'avatar_4.webp','avatar_5.webp','avatar_6.webp','avatar_7.webp',
  'avatar_8.webp','avatar_9.webp','avatar_09.webp',
  'avatar_10.webp','avatar_11.webp','avatar_12.webp','avatar_13.webp',
  'avatar_14.webp','avatar_15.webp','avatar_16.webp','avatar_17.webp',
  'avatar_18.webp','avatar_19.webp','avatar_20.webp','avatar_21.webp',
  'avatar_22.webp',
];

/**
 * Deterministic avatar index from agentId (same result for same id, everywhere)
 * Used by both taskbar renderer and office to sync avatars.
 */
function avatarIndexFromId(id) {
  let hash = 0;
  const str = id || '';
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0; // 32-bit int
  }
  return Math.abs(hash) % AVATAR_FILES.length;
}

// Laptop index → seat ID mapping
const LAPTOP_ID_MAP = {
  0: 10, 1: 8, 2: 9, 3: 11,
  4: 0, 5: 1, 6: 2, 7: 3,
  8: 12, 9: 14, 10: 15, 11: 13,
  12: 4, 13: 5, 14: 6, 15: 7,
};
