import jsQR from "jsqr";
import { describe, expect, it } from "vitest";

import type { QrArt } from "./qr-art";
import { qrArt, qrLogoGeometry, tooLightToScan } from "./qr-art";

/**
 * The code is read back by a real decoder. jsQR is the strict one: it could
 * not read a branded code whose alignment pattern was drawn as dots, at any
 * dot size, where ZXing could (`QR_ALIGNMENT_RADII` has the numbers). So a
 * change to the branded geometry that a weak scanner cannot read fails here.
 *
 * The picture is rasterised from the art's own paths, the ones the screen
 * and the download draw, with no image library: a pixel is inked when its
 * centre is inside an odd number of shapes (`evenodd`).
 */

interface Shape {
    x: number;
    y: number;
    size: number;
    /** Corner radius; `size / 2` is a circle, 0 a square. */
    r: number;
}

/** Every subpath `qrArt` writes: a unit square, a dot, or a rounded square. */
function shapesOf(d: string): Shape[] {
    return d
        .split("M")
        .filter((part) => part !== "")
        .map((part) => {
            const dot = /^([\d.]+) ([\d.]+)a([\d.]+) /.exec(part);
            if (dot) {
                const r = Number(dot[3]);
                return {
                    x: Number(dot[1]),
                    y: Number(dot[2]) - r,
                    size: 2 * r,
                    r,
                };
            }
            const round = /^([\d.]+) ([\d.]+)h([\d.]+)a([\d.]+) /.exec(part);
            if (round) {
                const r = Number(round[4]);
                return {
                    x: Number(round[1]) - r,
                    y: Number(round[2]),
                    size: Number(round[3]) + 2 * r,
                    r,
                };
            }
            const square = /^([\d.]+) ([\d.]+)h([\d.]+)v[\d.]+h-[\d.]+z$/.exec(
                part,
            );
            if (!square) throw new Error(`Unread subpath: M${part}`);
            return {
                x: Number(square[1]),
                y: Number(square[2]),
                size: Number(square[3]),
                r: 0,
            };
        });
}

function inside(s: Shape, px: number, py: number): boolean {
    if (px < s.x || px > s.x + s.size || py < s.y || py > s.y + s.size) {
        return false;
    }
    // Distance from the nearest corner's centre, inside the corner squares.
    const dx = Math.max(s.x + s.r - px, px - (s.x + s.size - s.r), 0);
    const dy = Math.max(s.y + s.r - py, py - (s.y + s.size - s.r), 0);
    return dx * dx + dy * dy <= s.r * s.r;
}

/** RGBA pixels of the code on white, `scale` pixels to a module. */
function rasterise(art: QrArt, hex: string, scale: number) {
    const quiet = 4;
    const side = (art.n + quiet * 2) * scale;
    const ink = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

    // Shapes by the modules they touch, so a pixel asks only its own cell.
    const cells = new Map<number, Shape[]>();
    for (const shape of [...shapesOf(art.dots), ...shapesOf(art.eyes)]) {
        for (let y = Math.floor(shape.y); y < shape.y + shape.size; y++) {
            for (let x = Math.floor(shape.x); x < shape.x + shape.size; x++) {
                const key = y * art.n + x;
                cells.set(key, [...(cells.get(key) ?? []), shape]);
            }
        }
    }
    const logo = qrLogoGeometry(art);
    const box: Shape | null = logo
        ? { x: logo.box.x, y: logo.box.y, size: logo.box.size, r: logo.box.rx }
        : null;
    // The tile filled in ink: the darkest logo there can be.
    const tile: Shape | null = logo
        ? {
              x: logo.tile.x,
              y: logo.tile.y,
              size: logo.tile.size,
              r: logo.tile.rx,
          }
        : null;

    const data = new Uint8ClampedArray(side * side * 4).fill(255);
    for (let py = 0; py < side; py++) {
        for (let px = 0; px < side; px++) {
            const x = (px + 0.5) / scale - quiet;
            const y = (py + 0.5) / scale - quiet;
            let dark: boolean;
            if (tile && inside(tile, x, y)) dark = true;
            else if (box && inside(box, x, y)) dark = false;
            else {
                const here = cells.get(Math.floor(y) * art.n + Math.floor(x));
                dark =
                    (here ?? []).filter((s) => inside(s, x, y)).length % 2 ===
                    1;
            }
            if (dark) data.set(ink, (py * side + px) * 4);
        }
    }
    return { data, side };
}

function decode(art: QrArt, hex: string, scale = 8): string | null {
    const { data, side } = rasterise(art, hex, scale);
    return jsQR(data, side, side)?.data ?? null;
}

/** A link of exactly `length` characters, the shape of a real short link. */
const link = (length: number) =>
    "https://glow.saroh.app/q/h7c?src=qr-counter-standee-".padEnd(length, "x") +
    "";

/** Bytes a version holds at error correction H, versions 3 to 10. */
const CAPACITY: [version: number, bytes: number][] = [
    [3, 24],
    [4, 34],
    [5, 44],
    [6, 58],
    [7, 64],
    [8, 84],
    [9, 98],
    [10, 119],
];

/** Ink, and the lightest grey `tooLightToScan` still lets through. */
const COLOURS = ["#1C1C1A", "#7F7F7F"];

describe("a real decoder reads the code back (jsQR)", () => {
    it("checks the colours it is about to use are ones the screen allows", () => {
        for (const colour of COLOURS)
            expect(tooLightToScan(colour)).toBe(false);
    });

    for (const style of ["plain", "branded"] as const) {
        for (const logo of [false, true]) {
            it(`${style}, ${logo ? "with the logo box" : "no logo"}: versions 3 to 10`, () => {
                for (const [version, bytes] of CAPACITY) {
                    const text = link(bytes).slice(0, bytes);
                    const art = qrArt(text, { style, logo });
                    expect(art.n).toBe(17 + 4 * version);
                    for (const colour of COLOURS) {
                        expect(
                            decode(art, colour),
                            `version ${version} in ${colour}`,
                        ).toBe(text);
                    }
                }
            });
        }
    }

    it("reads the design's own short link at 280px, branded with a logo", () => {
        const text = "https://glow.saroh.app/q/h7c";
        const art = qrArt(text, { style: "branded", logo: true });
        // 280px across 41 modules (33 and the quiet zone): 7 to a module.
        expect(decode(art, "#5C2A48", 7)).toBe(text);
        expect(decode(art, "#1F4D3A", 7)).toBe(text);
        expect(decode(art, "#1E3A5F", 7)).toBe(text);
    });

    it("a very short text under a logo is drawn at version 3 so it reads", () => {
        for (const text of ["A", "glow.in/q/h7c"]) {
            for (const style of ["plain", "branded"] as const) {
                const art = qrArt(text, { style, logo: true });
                expect(art.n).toBe(29);
                expect(decode(art, "#1C1C1A")).toBe(text);
            }
            // Without a logo it stays as small as it can be.
            expect(qrArt(text).n).toBeLessThan(29);
            expect(decode(qrArt(text, { style: "branded" }), "#1C1C1A")).toBe(
                text,
            );
        }
    });
});
