"""
Draw the showcase's generated product images (shade swatches, band and tape
colours, shade cards) into apps/app.saroh.in/public/demo/.

Some variants can't be shown honestly by a stock photo: each of 28 hair
colour shades, 18 nail lacquers, five band strengths. These are drawn as the
thing they are, in that colour, labelled. Deterministic: the same list draws
the same pixels, so re-running changes no file.

    pnpm --filter @saroh/database exec tsx ../../scripts/demo-swatches/export.ts \
      | python3 scripts/demo-swatches/render.py

Needs Pillow. Fonts: Avenir Next (macOS), else Helvetica, else Pillow's own.
"""

import json
import math
import os
import random
import sys

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT = os.path.join(ROOT, "apps", "app.saroh.in", "public", "demo")

FONT_FILES = [
    "/System/Library/Fonts/Avenir Next.ttc",
    "/System/Library/Fonts/Helvetica.ttc",
]


def font(size, bold=False):
    for f in FONT_FILES:
        if os.path.exists(f):
            try:
                return ImageFont.truetype(f, size, index=(2 if bold else 0) if "Avenir" in f else (1 if bold else 0))
            except OSError:
                continue
    return ImageFont.load_default()


def rgb(hexcode):
    h = hexcode.lstrip("#")
    return tuple(int(h[i : i + 2], 16) for i in (0, 2, 4))


def shade(c, f):
    """f > 0 lightens towards white, f < 0 darkens towards black."""
    if f >= 0:
        return tuple(round(v + (255 - v) * f) for v in c)
    return tuple(round(v * (1 + f)) for v in c)


def luminance(c):
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]


BG = (247, 242, 236)
INK = (40, 32, 28)
MUTED = (120, 108, 100)


def labels(draw, w, h, title, subtitle, brand):
    draw.text((80, h - 230), title, font=font(96, True), fill=INK)
    draw.text((84, h - 120), subtitle, font=font(44), fill=MUTED)
    tw = draw.textlength(brand, font=font(30))
    draw.text((w - 80 - tw, 70), brand, font=font(30), fill=MUTED)


def hair(spec, brand):
    w = h = 1200
    im = Image.new("RGB", (w, h), BG)
    d = ImageDraw.Draw(im)
    base = rgb(spec["hex"])
    rnd = random.Random(spec["file"])
    cx, top, bottom = 600, 190, 900
    # Strands: a bundle that fans slightly and tapers to a point.
    for i in range(420):
        t = rnd.random()
        x0 = cx - 150 + 300 * t
        f = rnd.uniform(-0.28, 0.22)
        col = shade(base, f)
        width = rnd.choice([2, 3, 3, 4])
        pts = []
        phase = rnd.uniform(0, math.pi * 2)
        for k in range(40):
            y = top + 40 + (bottom - top - 40) * k / 39
            p = k / 39
            spread = 1 - 0.75 * p ** 1.6
            x = cx + (x0 - cx) * spread + 14 * math.sin(phase + p * 5) * p
            pts.append((x, y + rnd.uniform(-1, 1)))
        tail = rnd.uniform(0, 70)
        pts = [pt for pt in pts if pt[1] < bottom - tail]
        d.line(pts, fill=col, width=width, joint="curve")
    # A soft highlight down the middle.
    glow = Image.new("L", (w, h), 0)
    gd = ImageDraw.Draw(glow)
    gd.ellipse((cx - 70, top + 120, cx + 50, bottom - 260), fill=70)
    glow = glow.filter(ImageFilter.GaussianBlur(40))
    im = Image.composite(Image.new("RGB", (w, h), shade(base, 0.35)), im, glow)
    d = ImageDraw.Draw(im)
    # The clip that holds the tress.
    d.rounded_rectangle((cx - 175, top - 10, cx + 175, top + 60), radius=14, fill=(196, 198, 202), outline=(150, 152, 156), width=3)
    d.rounded_rectangle((cx - 175, top + 18, cx + 175, top + 30), radius=4, fill=(170, 172, 176))
    labels(d, w, h, spec["title"], spec["subtitle"], brand)
    return im


def nail(spec, brand):
    w = h = 1200
    im = Image.new("RGB", (w, h), BG)
    d = ImageDraw.Draw(im)
    base = rgb(spec["hex"])
    # A brush stroke of the lacquer.
    stroke = Image.new("L", (w, h), 0)
    sd = ImageDraw.Draw(stroke)
    sd.rounded_rectangle((560, 330, 1060, 470), radius=70, fill=255)
    stroke = stroke.filter(ImageFilter.GaussianBlur(2))
    im.paste(Image.new("RGB", (w, h), base), (0, 0), stroke)
    d = ImageDraw.Draw(im)
    d.rounded_rectangle((600, 352, 1000, 372), radius=10, fill=shade(base, 0.35))
    # The bottle: glass, lacquer inside, a black cap.
    glass = (232, 230, 228)
    d.rounded_rectangle((180, 470, 470, 860), radius=60, fill=glass, outline=(200, 196, 192), width=4)
    d.rounded_rectangle((200, 500, 450, 840), radius=50, fill=base)
    d.rounded_rectangle((225, 520, 260, 800), radius=16, fill=shade(base, 0.4))
    d.rectangle((265, 430, 385, 475), fill=glass, outline=(200, 196, 192), width=3)
    d.rounded_rectangle((250, 190, 400, 440), radius=18, fill=(26, 24, 24))
    d.rounded_rectangle((268, 205, 290, 420), radius=8, fill=(70, 66, 66))
    labels(d, w, h, spec["title"], spec["subtitle"], brand)
    return im


def band(spec, brand):
    w = h = 1200
    im = Image.new("RGB", (w, h), BG)
    d = ImageDraw.Draw(im)
    base = rgb(spec["hex"])
    box = (160, 230, 1040, 760)
    d.rounded_rectangle(box, radius=260, fill=shade(base, -0.18))
    d.rounded_rectangle((box[0] + 16, box[1] + 10, box[2] - 16, box[3] - 24), radius=250, fill=base)
    d.rounded_rectangle((box[0] + 120, box[1] + 110, box[2] - 120, box[3] - 110), radius=150, fill=BG)
    d.rounded_rectangle((box[0] + 260, box[1] + 36, box[2] - 300, box[1] + 56), radius=10, fill=shade(base, 0.3))
    labels(d, w, h, spec["title"], spec["subtitle"], brand)
    return im


def tape(spec, brand):
    w = h = 1200
    im = Image.new("RGB", (w, h), BG)
    d = ImageDraw.Draw(im)
    base = rgb(spec["hex"])
    cx, cy, r = 520, 500, 300
    # The loose end, laid out to the right.
    d.polygon([(cx + 40, cy + r - 10), (1080, cy + r - 10), (1080, cy + r + 90), (cx + 40, cy + r + 90)], fill=shade(base, -0.05))
    d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=base)
    for k in range(18):
        rr = r - 10 - k * 7
        d.ellipse((cx - rr, cy - rr, cx + rr, cy + rr), outline=shade(base, -0.08 if k % 2 else 0.06), width=2)
    d.ellipse((cx - 120, cy - 120, cx + 120, cy + 120), fill=(196, 160, 112))
    d.ellipse((cx - 95, cy - 95, cx + 95, cy + 95), fill=BG)
    labels(d, w, h, spec["title"], spec["subtitle"], brand)
    return im


def card(spec, brand):
    colours = spec["hex"]
    names = spec.get("labels") or [""] * len(colours)
    cols = 7 if len(colours) > 20 else 6
    rows = math.ceil(len(colours) / cols)
    w, h = 1600, 1000
    im = Image.new("RGB", (w, h), BG)
    d = ImageDraw.Draw(im)
    d.text((70, 50), spec["title"], font=font(56, True), fill=INK)
    d.text((72, 122), spec["subtitle"], font=font(32), fill=MUTED)
    gx, gy = 70, 200
    cw = (w - 2 * gx) / cols
    ch = (h - gy - 50) / rows
    for i, hx in enumerate(colours):
        r, c = divmod(i, cols)
        x0, y0 = gx + c * cw, gy + r * ch
        col = rgb(hx)
        d.rounded_rectangle((x0 + 8, y0 + 6, x0 + cw - 8, y0 + ch - 44), radius=16, fill=col)
        d.rounded_rectangle((x0 + 22, y0 + 18, x0 + 40, y0 + ch - 60), radius=8, fill=shade(col, 0.25))
        d.text((x0 + 10, y0 + ch - 38), names[i], font=font(24), fill=INK)
    return im


DRAW = {"hair": hair, "nail": nail, "band": band, "tape": tape, "card": card}


def main():
    data = json.load(sys.stdin)
    n = 0
    for group in data:
        for spec in group["swatches"]:
            path = os.path.join(OUT, spec["file"])
            os.makedirs(os.path.dirname(path), exist_ok=True)
            DRAW[spec["kind"]](spec, group["brand"]).save(path, optimize=True)
            n += 1
    print(f"demo-swatches: drew {n} images into {os.path.relpath(OUT, ROOT)}")


main()
