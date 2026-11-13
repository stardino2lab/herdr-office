// Herdr Office: every agent is a Gilbak villager by a pond.
// Working ones swim, ones that need you stand on the shore and call, idle ones stand
// still and lie down after a while. Click one to go to its agent.
//
// Kept light on purpose: the art plays itself (animated WebP), walks and swims are native
// transitions, and the one timer redraws only when somebody starts or stops doing something.
import { View, div, image } from "gpui-kit";
import { agents, spaces, theme, run } from "herdr";
import { CHAR, speciesOf, moodOf, plan, clipOf, step, spawn } from "./office.js";

const ART = "mods/herdr-office/art";
const TICK = 500;
const KOREAN = (() => { try { return new Intl.DateTimeFormat().resolvedOptions().locale.startsWith("ko"); } catch { return false; } })();
const GRASS = "#5f8f4e";
const SAND = "#d9c58f";
const WATER = "#4f9fd0";
const DEEP = "#3f8cc0";

function tabsById() {
  const out = {};
  for (const s of spaces()) for (const t of s.tabs) out[t.id] = t;
  return out;
}

function tagOf(a, tabs) {
  const t = tabs[a.tab];
  return t?.named ? t.name : a.space_name || a.tab_name || a.address;
}

export default class Office extends View {
  init(_props, cx) {
    this.width = 0; // unknown until the first size report: nobody is placed before that
    this.height = 0;
    this.walkers = {}; // address -> walker (see office.js)
    this.hover = null;
    cx.timer.every(TICK, (cx) => { if (this.tick()) cx.notify(); });
  }

  // Moves everybody one step on; true when the picture changed.
  tick() {
    if (!this.width || !this.height) return false;
    const now = Date.now();
    const list = agents();
    const tabs = tabsById();
    const layout = plan(this.width, this.height, list.length);
    let changed = false;
    const live = new Set();
    list.forEach((a, i) => {
      live.add(a.address);
      const old = this.walkers[a.address];
      // When its status last changed: watched here once the agent is known, the tab's own
      // record before that (null: nothing since the app started).
      const since = old ? (old.status === a.status ? old.since : now) : tabs[a.tab]?.changed_at ?? null;
      const mood = moodOf(a.status, since, now);
      const home = layout.homes[i];
      if (!old) {
        this.walkers[a.address] = spawn(mood, home, layout, now, Math.random);
        changed = true;
      } else if (step(old, mood, home, layout, now, Math.random)) changed = true;
      const m = this.walkers[a.address];
      m.status = a.status;
      m.since = since;
    });
    for (const k of Object.keys(this.walkers)) if (!live.has(k)) { delete this.walkers[k]; changed = true; }
    return changed;
  }

  render(cx) {
    const t = theme();
    const list = agents();
    const tabs = tabsById();
    this.tick(); // live data changed: place everyone before drawing
    const layout = plan(this.width, this.height, list.length);
    const s = layout.scale;
    const p = layout.pond;

    const root = div()
      .id("office")
      .relative()
      .size_full()
      .overflow_hidden()
      .bg(GRASS)
      .on_size_change((size, cx) => {
        if (Math.abs(size.width - this.width) > 1 || Math.abs(size.height - this.height) > 1) {
          this.width = size.width;
          this.height = size.height;
          cx.notify();
        }
      })
      // the pond: a sand rim, the water, a deeper middle
      .child(div().absolute().left(p.x).top(p.y).w(p.w).h(p.h).rounded(Math.min(p.h, p.w) * 0.42).bg(SAND))
      .child(div().absolute().left(p.x + 5).top(p.y + 5).w(Math.max(0, p.w - 10)).h(Math.max(0, p.h - 10)).rounded(Math.min(p.h, p.w) * 0.4).bg(WATER))
      .child(div().absolute().left(p.x + p.w * 0.12).top(p.y + p.h * 0.2).w(p.w * 0.76).h(p.h * 0.6).rounded(Math.min(p.h, p.w) * 0.3).bg(DEEP).opacity(0.55));

    if (list.length === 0) {
      return root.child(
        div().absolute().left(layout.shore.x).top(layout.shore.y).w(layout.shore.w).h(layout.shore.h)
          .flex().items_center().justify_center().text_size(12).text_color("#ffffffc0")
          .child(KOREAN ? "아직 에이전트가 없어요." : "No agents yet."));
    }

    const cw = CHAR.w * s;
    const chh = CHAR.h * s;
    const drawn = [];
    list.forEach((a) => {
      const m = this.walkers[a.address];
      if (!m) return;
      const x = m.moving ? m.tx : m.x;
      const y = m.moving ? m.ty : m.y;
      const clip = clipOf(m);
      const hovered = this.hover === a.address;
      const tag = tagOf(a, tabs);
      // The point (x, y) is the feet on land, the middle of the body in the pond.
      const anchorY = (m.wet ? CHAR.waterY : CHAR.footY) * s;

      const bubble =
        m.mood === "blocked" ? div().px(5).rounded(7).bg(t.blocked).text_color("#ffffff").font_bold().child("!")
            .loop("opacity", { from: 0.6, to: 1, period: 900 })
        : m.mood === "done" ? div().px(5).rounded(7).bg(t.done).text_color("#ffffff").font_bold().child("✓")
        : m.mood === "sleep" && !m.moving && !m.wet ? div().text_color("#ffffff").font_bold().frames(["z", "zZ", "zZz", "zZ"], 700)
        : null;

      const duration = Math.max(1, m.moving ? m.dur : 150);
      const el = div()
        .id(`who-${a.address}`)
        .absolute()
        .w(cw)
        .h(chh + 14)
        .left(x - CHAR.footX * s)
        .top(y - anchorY)
        .transition("left", { duration, easing: "linear" })
        .transition("top", { duration, easing: "linear" })
        .cursor_pointer()
        .on_hover((h, cx) => {
          const next = h ? a.address : this.hover === a.address ? null : this.hover;
          if (next !== this.hover) { this.hover = next; cx.notify(); }
        })
        .on_click(() => (a.pane ? run("pane.focus", { pane: a.pane }) : run("agent.focus", { terminal: a.address })))
        // under it: a ripple in the water, a shadow on land
        .child(m.wet
          ? div().absolute().left(cw * 0.06).top(anchorY - 4 * s).w(cw * 0.88).h(22 * s).rounded_full().bg("#ffffff")
              .loop("opacity", { from: 0.18, to: 0.42, period: 1100 })
          : div().absolute().left(cw * 0.28).top(anchorY - 4 * s).w(cw * 0.44).h(7 * s).rounded_full().bg("#00000030")
              .when(clip === "sleep", (el) => el.opacity(0)))
        .child(image(`${ART}/${speciesOf(a)}/${clip}.webp`).absolute().left(0).top(0).w(cw).h(chh))
        .when(!!bubble, (el) => el.child(
          div().absolute().left(0).w(cw).top(-6).flex().justify_center().text_size(11).child(bubble)))
        // name tag: under the feet on land, under the ripple in the water
        .child(
          div().absolute().left(-24).w(cw + 48).top(anchorY + (m.wet ? 20 : 8) * s).flex().justify_center().child(
            div().max_w(cw + 48).px(4).rounded(4).truncate()
              .text_size(10)
              .text_color("#ffffff")
              .bg(hovered || a.focused ? "#000000a0" : "#00000048")
              .child(hovered ? `${tag} · ${a.program?.name ?? a.app ?? ""}` : tag)));
      drawn.push({ z: y, el });
    });

    drawn.sort((a, b) => a.z - b.z); // back to front
    return root.children(drawn.map((d) => d.el));
  }
}
