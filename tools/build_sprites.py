"""Cuts the Gilbak 8-direction sprite sheets into small animated WebPs for the mod.

Usage: python tools/build_sprites.py [SRC] [OUT]
  SRC  the rabbit-blender out-game folder (sheets: rows = directions, columns = frames)
  OUT  the mod's art folder

Needs Pillow. The mod never cuts frames itself: image() plays each WebP natively.
"""
import json
import sys
from pathlib import Path

from PIL import Image

SRC = Path(sys.argv[1] if len(sys.argv) > 1 else "sheets")
OUT = Path(sys.argv[2] if len(sys.argv) > 2 else Path(__file__).resolve().parent.parent / "mods/herdr-office/art")

SPECIES = ["rabbit", "dog", "fox", "cat"]
CELL = 96  # stored px per frame (shown smaller; keeps HiDPI sharp)
# clip name -> (source action, direction)
CLIPS = {
    "walkSE": ("walk", "SE"),
    "walkSW": ("walk", "SW"),
    "walkNE": ("walk", "NE"),
    "walkNW": ("walk", "NW"),
    "idle": ("idle", "S"),
    "swimSE": ("dive", "SE"),
    "swimSW": ("dive", "SW"),
    "swimNE": ("dive", "NE"),
    "swimNW": ("dive", "NW"),
}
PROPS = {}
# The swim clips are the sheets' "dive" action: lying flat and paddling, the whole body shown.


def frames_of(folder, meta, action, direction):
    clip = meta["clips"][f"{action}:{direction}"]
    sheet = Image.open(folder / clip["image"]).convert("RGBA")
    out = []
    for f in clip["frames"]:
        cell = sheet.crop((f["x"], f["y"], f["x"] + f["width"], f["y"] + f["height"]))
        out.append(cell.resize((CELL, CELL), Image.LANCZOS))
    return out, clip["fps"]


def save_anim(frames, fps, path):
    frames[0].save(path, save_all=True, append_images=frames[1:], duration=round(1000 / fps),
                   loop=0, lossless=True, method=6, disposal=2)


def main():
    info = {"cell": CELL, "species": SPECIES, "props": {}}
    for sp in SPECIES:
        folder = SRC / sp
        meta = json.loads((folder / f"{sp}-8dir.json").read_text(encoding="utf-8"))
        dest = OUT / sp
        dest.mkdir(parents=True, exist_ok=True)
        for name, (action, direction) in CLIPS.items():
            frames, fps = frames_of(folder, meta, action, direction)
            save_anim(frames, fps, dest / f"{name}.webp")
        # Asleep: the front-facing idle frame lying down on the grass, head up and to the right.
        # One still frame.
        front, _ = frames_of(folder, meta, "idle", "S")
        front[0].rotate(-63, resample=Image.BICUBIC).save(dest / "sleep.webp", lossless=True, method=6)
        scale = CELL / meta["frameSize"]
        info["foot"] = {"x": round(meta["footAnchor"]["x"] * scale, 2), "y": round(meta["footAnchor"]["y"] * scale, 2)}
    for name, src in PROPS.items():
        im = Image.open(SRC / "props" / f"{src}.png").convert("RGBA")
        im = im.crop(im.getbbox())
        # A clear 2 px rim, so scaling never smears the art's edge into a faint box.
        padded = Image.new("RGBA", (im.width + 4, im.height + 4), (0, 0, 0, 0))
        padded.alpha_composite(im, (2, 2))
        im = padded
        im.save(OUT / f"{name}.png", optimize=True)
        info["props"][name] = {"w": im.width, "h": im.height}
    print(json.dumps(info))
    total = sum(p.stat().st_size for p in OUT.rglob("*.*"))
    print(f"{len(list(OUT.rglob("*.*")))} files, {total // 1024} KB on disk")


if __name__ == "__main__":
    main()
