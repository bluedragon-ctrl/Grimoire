// Minimal Grimoire stub for the vendored renderer.
// The original game's game-state.js pulled in FOV, dungeon-gen, spawning,
// persistence. Phase 3 doesn't need any of that — the renderer only reads
// four helpers, so we provide just those with our simpler VisualState shape:
//
//   state.map: string[][]            // map[y][x] = tile key (e.g. 'floor' | 'wall')
//   state.visible, state.explored    // optional Uint8Array or Set<string> 'x,y'
//                                    // if absent → everything treated visible+explored.
//   entity.hp, entity.dead           // alive unless hp <= 0 or dead === true

export function getTile(state, x, y) {
  const row = state.map?.[y];
  return row ? row[x] ?? 'wall' : 'wall';
}

export function isVisible(state, x, y) {
  if (!state.visible) return true;
  if (state.visible instanceof Set) return state.visible.has(`${x},${y}`);
  const w = state.width ?? 0;
  return state.visible[y * w + x] === 1;
}

export function isExplored(state, x, y) {
  if (!state.explored) return true;
  if (state.explored instanceof Set) return state.explored.has(`${x},${y}`);
  const w = state.width ?? 0;
  return state.explored[y * w + x] === 1;
}

export function isAlive(e) {
  if (!e) return false;
  if (e.dead === true) return false;
  if (typeof e.hp === 'number') return e.hp > 0;
  return true;
}
