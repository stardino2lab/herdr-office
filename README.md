# Gilbak Office — a Herdr mod

Your coding agents as small animals by a pond, in [Herdr](https://herdr.dev). Working agents swim, agents that need you stand on the shore and call, idle ones stand still and fall asleep after a while. Click one to jump to its agent.

코딩 에이전트를 길밖의 마을(Gilbak Village) 동물 캐릭터로 보여주는 Herdr mod. 일하는 에이전트는 연못에서 헤엄치고, 승인 대기·완료는 물가에서 ❗ / ✓, 유휴는 가만히 서 있다가 5분 뒤 눕습니다. 클릭하면 그 에이전트로 이동.

![Gilbak Office](preview.png)

| Agent | Animal |
|---|---|
| working | swims around the pond |
| blocked | stands on the shore under a pulsing `!` |
| done | stands on the shore under a `✓` |
| idle | stands still at its place |
| idle for 5 minutes | lies down, `zZz` |

## Install

1. Copy `mods/herdr-office/` into `~/.config/herdr-app/mods/`. Herdr docks it at the bottom of the window.
2. To put it somewhere else, move its block in a layout of your own (`~/.config/herdr-app/layouts/<name>.json`). It adapts to the block's size: a wide block has the pond on the left, a tall one on top.

Or point your agent at this repo: `RECIPE.md` is the full brief.

## Before you add it

- It runs no programs, makes no network calls and reads or writes no files. It only reads Herdr's agent list and focuses a pane when you click.
- Built to stay light: the animation is animated WebP played by Herdr and native transitions; the mod's one timer redraws only when an animal starts or stops doing something. About 1 MB of art.
- Four animals (rabbit, dog, fox, cat). With more agents than that, some look alike.

## Develop

```sh
npm test
```

```sh
herdr-app check mods/herdr-office
```

The rules (`office.js`) are plain JavaScript with no Herdr imports, so the tests run under Node without Herdr.

The art is cut from Blender-rendered sprite sheets by `tools/build_sprites.py` (needs Pillow):

```sh
python tools/build_sprites.py <sheets folder> mods/herdr-office/art
```

## Art

The characters are from Gilbak Village (길밖의 마을) and were modeled and rendered by the author. They are included so the mod works; please don't reuse them elsewhere without asking.
