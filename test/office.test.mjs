import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SPECIES, SLEEP_AFTER, speciesOf, moodOf, plan, facing, clipOf, step, spawn, posOf, within,
} from "../mods/herdr-office/office.js";

const NOW = 1_000_000_000;
const half = () => 0.5;

// Runs a walker until it has nothing left to do (or `limit` ms pass).
function settle(m, mood, home, p, from, rand = half, limit = 600_000) {
  let now = from;
  for (; now < from + limit; now += 250) {
    step(m, mood, home, p, now, rand);
    if (!m.moving && mood !== "work" && Math.hypot(m.x - home.x, m.y - home.y) <= 2) break;
  }
  return now;
}

test("an agent keeps its animal, and it is one of the four", () => {
  const a = { pane: "p7", address: "t7" };
  assert.equal(speciesOf(a), speciesOf({ ...a }));
  assert.ok(SPECIES.includes(speciesOf(a)));
  assert.ok(SPECIES.includes(speciesOf({ pane: "", address: "t9" })));
});

test("status decides the mood; long idle means sleep", () => {
  assert.equal(moodOf("working", null, NOW), "work");
  assert.equal(moodOf("blocked", NOW, NOW), "blocked");
  assert.equal(moodOf("done", NOW, NOW), "done");
  assert.equal(moodOf("idle", NOW - 1000, NOW), "stand");
  assert.equal(moodOf("idle", NOW - SLEEP_AFTER - 1, NOW), "sleep");
  assert.equal(moodOf("idle", null, NOW), "sleep");
});

test("every agent gets its own place on the shore, inside the panel and out of the pond", () => {
  for (const [w, h, n] of [[900, 240, 5], [320, 640, 4], [1200, 200, 12], [300, 300, 1], [3000, 240, 3], [600, 240, 30]]) {
    const p = plan(w, h, n);
    assert.equal(p.homes.length, n, `${w}x${h}`);
    assert.ok(p.scale >= 0.5 && p.scale <= 1.6);
    const seen = new Set();
    for (const home of p.homes) {
      assert.ok(home.x >= 0 && home.x <= w && home.y >= 0 && home.y <= h, `home ${home.x},${home.y} in ${w}x${h}`);
      assert.equal(within(home, p.water), false, "a home is on land");
      seen.add(`${Math.round(home.x)},${Math.round(home.y)}`);
    }
    assert.equal(seen.size, n, "no two share a place");
  }
  assert.equal(plan(900, 240, 5).wide, true);
  assert.equal(plan(320, 640, 4).wide, false);
});

test("a crowded shore shrinks the art instead of dropping anyone", () => {
  assert.equal(plan(900, 300, 2).scale, 1.6);
  assert.ok(plan(400, 200, 12).scale < 1);
});

test("no agents, no room: an empty plan, no crash", () => {
  assert.deepEqual(plan(0, 0, 0).homes, []);
  assert.equal(plan(900, 240, 0).homes.length, 0);
});

test("facing and clips", () => {
  assert.equal(facing(5, 5), "SE");
  assert.equal(facing(-5, 5), "SW");
  assert.equal(facing(5, -5), "NE");
  assert.equal(facing(-5, -5), "NW");
  assert.equal(clipOf({ wet: true, moving: false, dir: "NW", mood: "work" }), "swimNW");
  assert.equal(clipOf({ wet: false, moving: true, dir: "SE", mood: "work" }), "walkSE");
  assert.equal(clipOf({ wet: false, moving: false, dir: "SE", mood: "stand" }), "idle");
  assert.equal(clipOf({ wet: false, moving: false, dir: "SE", mood: "blocked" }), "idle");
  assert.equal(clipOf({ wet: false, moving: false, dir: "SE", mood: "sleep" }), "sleep");
});

test("an idle agent stands still at home", () => {
  const p = plan(900, 240, 2);
  const m = spawn("stand", p.homes[0], p, NOW, half);
  assert.deepEqual([m.x, m.y, m.wet, m.moving], [p.homes[0].x, p.homes[0].y, false, false]);
  for (let now = NOW; now < NOW + 60_000; now += 500) {
    assert.equal(step(m, "stand", p.homes[0], p, now, Math.random), false);
  }
  assert.equal(m.moving, false);
});

test("starting work: walk to the pond's edge, then swim around inside it", () => {
  const p = plan(900, 240, 1);
  const home = p.homes[0];
  const m = spawn("stand", home, p, NOW, half);
  assert.equal(step(m, "work", home, p, NOW, half), true);
  assert.equal(m.wet, false, "the way to the pond is a walk");
  assert.ok(within({ x: m.tx, y: m.ty }, p.water), "heading for the water");
  let now = NOW;
  let swam = false;
  for (; now < NOW + 120_000; now += 250) {
    step(m, "work", home, p, now, Math.random);
    if (m.wet) {
      assert.ok(within(posOf(m, now), p.water), "a swimmer stays in the water");
      if (m.moving) swam = true;
    }
  }
  assert.equal(m.wet, true);
  assert.ok(swam, "it swims from spot to spot");
});

test("a swimmer that stops working swims to the edge, then walks home and stays", () => {
  const p = plan(900, 240, 2);
  const home = p.homes[1];
  const m = spawn("work", home, p, NOW, () => 0.1); // far side of the pond
  assert.equal(m.wet, true);
  assert.equal(step(m, "blocked", home, p, NOW, half), true);
  assert.equal(m.wet, true, "first leg is a swim");
  assert.ok(within({ x: m.tx, y: m.ty }, p.water));
  const end = settle(m, "blocked", home, p, NOW);
  assert.equal(m.moving, false);
  assert.equal(m.wet, false);
  assert.ok(Math.hypot(m.x - home.x, m.y - home.y) <= 2);
  assert.equal(step(m, "blocked", home, p, end + 5000, half), false, "settled: no more redraws");
});

test("changing its mind mid-walk starts from where it is", () => {
  const p = plan(900, 240, 1);
  const home = p.homes[0];
  const m = spawn("stand", home, p, NOW, half);
  step(m, "work", home, p, NOW, half);
  const mid = NOW + Math.floor(m.dur / 2);
  const at = posOf(m, mid);
  assert.equal(step(m, "done", home, p, mid, half), true);
  assert.ok(Math.abs(m.x - at.x) < 0.01 && Math.abs(m.y - at.y) < 0.01);
  assert.deepEqual([m.tx, m.ty], [home.x, home.y]);
  assert.equal(m.wet, false);
});

test("a pond too small to swim in: working agents just stay home", () => {
  const p = plan(60, 60, 1);
  const m = spawn("work", p.homes[0], p, NOW, half);
  assert.doesNotThrow(() => { for (let now = NOW; now < NOW + 5000; now += 500) step(m, "work", p.homes[0], p, now, half); });
});
