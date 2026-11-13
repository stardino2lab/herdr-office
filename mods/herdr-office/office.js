// The pond's rules, with no Herdr imports: who is which animal, what each one is
// doing, where the pond and the shore are and how a walk or a swim is planned.
// Tested under plain node.

export const SPECIES = ["rabbit", "dog", "fox", "cat"];
export const SLEEP_AFTER = 5 * 60 * 1000; // idle this long: lie down
export const SPEED = { walk: 70, swim: 38 }; // px per second at scale 1

// Art sizes at scale 1 (the files are larger so they stay sharp).
// footY: the feet on land; waterY: the middle of the body in the swim clips (it lies flat).
export const CHAR = { w: 72, h: 72, footX: 36, footY: 62, waterY: 46 };
const SLOT = { w: 62, h: 84 }; // one animal's place on the shore, name tag included
const PAD = 8;
const MAX_SCALE = 1.6;

export function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

// Stable per pane: the same agent is the same animal after a restart.
export const speciesOf = (agent) => SPECIES[hash(agent.pane || agent.address) % SPECIES.length];

// work: swimming. blocked / done: on the shore, calling for the person.
// stand: idle, standing still. sleep: idle for a long time.
// `since`: when its status last changed (null: unknown, idle all along).
export function moodOf(status, since, now) {
  if (status === "working") return "work";
  if (status === "blocked") return "blocked";
  if (status === "done") return "done";
  return since == null || now - since > SLEEP_AFTER ? "sleep" : "stand";
}

// Where everything is for `count` agents in a width x height panel: the pond, and one
// place on the shore per agent. Wide panels put the shore on the right, tall ones at the
// bottom. The art is as big as fits (up to 1.6x), down to 0.5x when crowded.
export function plan(width, height, count) {
  const floor = { x: PAD, y: PAD, w: Math.max(0, width - 2 * PAD), h: Math.max(0, height - 2 * PAD) };
  const wide = floor.w >= floor.h * 1.4;
  const share = 0.4; // of the floor, for the shore
  const shore = wide
    ? { x: floor.x + floor.w * (1 - share), y: floor.y, w: floor.w * share, h: floor.h }
    : { x: floor.x, y: floor.y + floor.h * (1 - share), w: floor.w, h: floor.h * share };
  const pond = wide
    ? { x: floor.x, y: floor.y, w: floor.w * (1 - share) - PAD, h: floor.h }
    : { x: floor.x, y: floor.y, w: floor.w, h: floor.h * (1 - share) - PAD };

  const fit = (scale) => {
    const cols = Math.max(1, Math.floor(shore.w / (SLOT.w * scale)));
    const rows = Math.max(1, Math.floor(shore.h / (SLOT.h * scale)));
    return { cols, rows, fits: cols * rows >= count };
  };
  let scale = MAX_SCALE;
  let g = fit(scale);
  while (!g.fits && scale > 0.5) {
    scale = Math.round((scale - 0.1) * 10) / 10;
    g = fit(scale);
  }

  // Rows of at most `cols` places, the block centered on the shore.
  const perRow = Math.max(1, Math.min(g.cols, count));
  const rows = Math.ceil(count / perRow);
  const cw = Math.min(shore.w / perRow, SLOT.w * scale * 1.6);
  const ch = Math.min(shore.h / Math.max(1, rows), SLOT.h * scale * 1.2);
  const x0 = shore.x + (shore.w - cw * perRow) / 2;
  const y0 = shore.y + (shore.h - ch * rows) / 2;
  // A place is where the feet stand.
  const homes = Array.from({ length: count }, (_, i) => ({
    x: x0 + (i % perRow) * cw + cw / 2,
    y: y0 + Math.floor(i / perRow) * ch + (ch - SLOT.h * scale) / 2 + CHAR.footY * scale,
  }));

  // Where swimmers go: inside the pond's rounded edge.
  const mx = Math.min(pond.w / 2, CHAR.w * scale * 0.5);
  const top = Math.min(pond.h / 2, CHAR.waterY * scale);
  const bottom = Math.min(pond.h / 2, 12 * scale);
  const water = { x: pond.x + mx, y: pond.y + top, w: Math.max(0, pond.w - 2 * mx), h: Math.max(0, pond.h - top - bottom) };
  return { scale, wide, floor, pond, shore, homes, water };
}

// The four moving clips are the diagonals.
export function facing(dx, dy) {
  return `${dy < 0 ? "N" : "S"}${dx < 0 ? "W" : "E"}`;
}

// In the water it paddles even when it stays in place.
export function clipOf(m) {
  if (m.wet) return `swim${m.dir}`;
  if (m.moving) return `walk${m.dir}`;
  return m.mood === "sleep" ? "sleep" : "idle";
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const clampTo = (p, r) => ({ x: clamp(p.x, r.x, r.x + r.w), y: clamp(p.y, r.y, r.y + r.h) });
// On the edge counts as in: that is where one gets in and out.
export const within = (p, r) => p.x >= r.x - 0.5 && p.x <= r.x + r.w + 0.5 && p.y >= r.y - 0.5 && p.y <= r.y + r.h + 0.5;
const near = (a, b) => Math.hypot(a.x - b.x, a.y - b.y) <= 2;

// Where a walker is right now.
export function posOf(m, now) {
  if (!m.moving) return { x: m.x, y: m.y };
  const f = m.dur > 0 ? clamp((now - m.start) / m.dur, 0, 1) : 1;
  return { x: m.x + (m.tx - m.x) * f, y: m.y + (m.ty - m.y) * f };
}

// One straight leg. It is a swim when both ends are in the water.
function go(m, target, now, layout) {
  const from = posOf(m, now);
  const dist = Math.hypot(target.x - from.x, target.y - from.y);
  m.x = from.x; m.y = from.y;
  m.tx = target.x; m.ty = target.y;
  m.dir = facing(target.x - from.x, target.y - from.y);
  m.wet = within(from, layout.water) && within(target, layout.water);
  m.start = now;
  m.dur = Math.max(1, Math.round((dist / ((m.wet ? SPEED.swim : SPEED.walk) * layout.scale)) * 1000));
  m.moving = true;
}

// Advances one agent's walker. Returns true when what is drawn must change.
// Working: walk to the pond's edge, then swim from spot to spot. Anything else:
// swim to the edge nearest home, walk home, stay there. `rand` is Math.random.
export function step(m, mood, home, layout, now, rand) {
  let changed = false;
  if (m.mood !== mood) { m.mood = mood; changed = true; }
  const water = layout.water;

  if (m.moving && now - m.start >= m.dur) {
    m.x = m.tx; m.y = m.ty; m.moving = false;
    m.pauseUntil = now + 600 + rand() * 2400;
    changed = true;
  }
  const dest = m.moving ? { x: m.tx, y: m.ty } : { x: m.x, y: m.y };

  if (mood === "work" && water.w > 0 && water.h > 0) {
    if (!within(dest, water)) {
      // Not heading for the water yet: go to its nearest edge.
      go(m, clampTo(posOf(m, now), water), now, layout);
      return true;
    }
    if (!m.moving && now >= (m.pauseUntil ?? 0)) {
      const target = { x: water.x + rand() * water.w, y: water.y + rand() * water.h };
      if (Math.hypot(target.x - m.x, target.y - m.y) >= 24) { go(m, target, now, layout); return true; }
      m.pauseUntil = now + 800;
    }
    if (!m.moving && !m.wet) { m.wet = true; changed = true; } // arrived at the edge: it is in
    return changed;
  }

  if (!home) return changed;
  if (near(dest, home)) {
    if (!m.moving && m.wet) { m.wet = false; changed = true; }
    return changed;
  }
  const at = posOf(m, now);
  const exit = clampTo(home, water);
  // Still out in the water: swim to the edge first. At the edge (or on land): walk home.
  if (m.wet && within(at, water) && !near(at, exit)) {
    if (!near(dest, exit)) { go(m, exit, now, layout); changed = true; }
    return changed;
  }
  go(m, home, now, layout);
  m.wet = false;
  return true;
}

// A new agent appears where it belongs instead of walking in.
export function spawn(mood, home, layout, now, rand) {
  const w = layout.water;
  const wet = mood === "work" && w.w > 0 && w.h > 0;
  const p = wet ? { x: w.x + rand() * w.w, y: w.y + rand() * w.h } : home ?? { x: 0, y: 0 };
  return { x: p.x, y: p.y, tx: p.x, ty: p.y, dir: "SE", wet, moving: false, start: 0, dur: 0, pauseUntil: now + rand() * 2000, mood };
}
