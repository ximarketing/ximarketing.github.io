// Shared by the server and the canvas replay. Keep collision order and operation
// order identical to the original Bakehouse game and the training environment.
export const RADII = Object.freeze([16, 22, 30, 38, 47, 57, 68, 80, 94, 110, 135]);
export const FRAMES_PER_DROP = 115;
export const FRAME_MS = 10;
export const TURN_MS = FRAMES_PER_DROP * FRAME_MS;
export const NATIVE_FRAME_MS = 1000 / 60;

// Play the descent at the source game's clock, then smoothly accelerate only
// the remaining settling frames to show the settled board before the next drop.
export function replayFrameAt(elapsedMs, contactFrame, endFrame = FRAMES_PER_DROP) {
  const elapsed = Math.max(0, elapsedMs);
  if (elapsed >= TURN_MS) return endFrame;
  // Old in-flight moves from before contact capture retain their original replay.
  if (!Number.isInteger(contactFrame)) return Math.min(endFrame, Math.floor(elapsed / FRAME_MS));
  const contactMs = contactFrame * NATIVE_FRAME_MS;
  if (elapsed <= contactMs || endFrame * NATIVE_FRAME_MS <= TURN_MS) {
    return Math.min(endFrame, Math.floor(elapsed / NATIVE_FRAME_MS));
  }
  const remainingMs = TURN_MS - contactMs;
  const progress = (elapsed - contactMs) / remainingMs;
  const normalFrames = remainingMs / NATIVE_FRAME_MS;
  const extraFrames = endFrame - contactFrame - normalFrames;
  return Math.min(endFrame, Math.floor(contactFrame + normalFrames * progress + extraFrames * progress * progress));
}

const WIDTH = 520, HEIGHT = 680, WALL = 4, RED_LINE = 50;

function pastry(l, x, y) {
  return {l, r: RADII[l], x, y, vx: 0, vy: 0};
}

function confine(b) {
  if (b.x - b.r < WALL) {
    b.x = WALL + b.r;
    b.vx = Math.abs(b.vx) * .25;
  }
  if (b.x + b.r > WIDTH - WALL) {
    b.x = WIDTH - WALL - b.r;
    b.vx = -Math.abs(b.vx) * .25;
  }
  if (b.y + b.r > HEIGHT - WALL) {
    b.y = HEIGHT - WALL - b.r;
    b.vy = -Math.abs(b.vy) * .25;
    if (Math.abs(b.vy) < .5) b.vy = 0;
  }
}

export function beginDrop(board, level, x) {
  const r = RADII[level];
  const spawnX = Math.max(r + WALL, Math.min(WIDTH - r - WALL, x));
  return [...board.map(b => ({...b})), pastry(level, spawnX, RED_LINE + r + 4)];
}

export function stepPhysics(board, falling) {
  let contact = false;
  for (const b of board) {
    b.vy += .45;
    b.vx *= .99;
    b.vy *= .99;
    b.x += b.vx;
    b.y += b.vy;
    if (b === falling && b.y + b.r > HEIGHT - WALL) contact = true;
    confine(b);
  }
  const additions = [];
  let points = 0;
  for (let i = 0; i < board.length; i++) {
    const b = board[i];
    if (b.merged) continue;
    for (let j = i + 1; j < board.length; j++) {
      const other = board[j];
      if (other.merged) continue;
      const dx = other.x - b.x, dy = other.y - b.y;
      const distance = Math.sqrt(dx * dx + dy * dy), minDistance = b.r + other.r;
      if (distance > minDistance + .25) continue;
      if (b === falling || other === falling) contact = true;
      if (b.l === other.l && b.l < RADII.length - 1) {
        b.merged = other.merged = true;
        const newBall = pastry(b.l + 1, (b.x + other.x) / 2, (b.y + other.y) / 2);
        newBall.vy = -2;
        confine(newBall);
        additions.push(newBall);
        points += (newBall.l + 1) * 10;
        break;
      }
      const nx = distance > .0001 ? dx / distance : 1;
      const ny = distance > .0001 ? dy / distance : 0;
      const overlap = Math.max(0, minDistance - distance);
      b.x -= nx * overlap * .5;
      b.y -= ny * overlap * .5;
      other.x += nx * overlap * .5;
      other.y += ny * overlap * .5;
      const dot = (other.vx - b.vx) * nx + (other.vy - b.vy) * ny;
      if (dot < 0) {
        const impulse = dot * .5;
        b.vx += impulse * nx;
        b.vy += impulse * ny;
        other.vx -= impulse * nx;
        other.vy -= impulse * ny;
      }
    }
  }
  if (additions.length) board = board.filter(b => !b.merged).concat(additions);
  for (const b of board) confine(b);
  return {board, points, contact, dead: board.some(b => b.y - b.r <= RED_LINE)};
}

export function simulateDrop(before, level, x) {
  let board = beginDrop(before, level, x), points = 0, dead = false;
  const falling = board.at(-1);
  let contactFrame, endFrame = 0;
  while (endFrame < FRAMES_PER_DROP && !dead) {
    const frame = stepPhysics(board, contactFrame ? undefined : falling);
    endFrame++;
    if (frame.contact) contactFrame = endFrame;
    board = frame.board;
    points += frame.points;
    dead = frame.dead;
  }
  return {board, points, dead, contactFrame: contactFrame ?? endFrame, endFrame};
}
