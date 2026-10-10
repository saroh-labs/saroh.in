// The print files' copy of the QR geometry, held to `packages/ui`'s.
//
// `qr-print-art.ts` is a copy of `packages/ui/src/lib/qr-art.ts` because
// the API can't import a UI package. Three things keep the two in step:
// the copy's numbers are read against that file's source; the paths drawn
// for one link are pinned to the same values the UI's own test pins
// (`qr-art.pin.test.ts`, which this reads, so one side can't be updated
// alone); and a plain code is read back off its paths and compared with
// the encoder's own modules.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { encode } from "uqr";

import {
    initialsOf,
    isQrFinderCell,
    QR_ALIGNMENT_RADII,
    QR_ALIGNMENT_SIDES,
    QR_DOT_RADIUS,
    QR_EYE_RADII,
    QR_EYE_SIDES,
    QR_LOGO_BOX_RADIUS,
    QR_LOGO_IMAGE_RADIUS,
    QR_LOGO_MIN_VERSION,
    QR_LOGO_SHARE,
    QR_LOGO_TEXT_SIZE,
    QR_LOGO_TILE_RADIUS,
    QR_QUIET_ZONE,
    QR_TILE_FILL,
    QR_TILE_TEXT,
    qrLogoGeometry,
    qrPrintArt,
} from "./qr-print-art";

const UI_LIB = join(
    __dirname,
    "..",
    "..",
    "..",
    "..",
    "..",
    "packages",
    "ui",
    "src",
    "lib",
);
const UI_SOURCE = readFileSync(join(UI_LIB, "qr-art.ts"), "utf8");
const UI_PINS = readFileSync(join(UI_LIB, "qr-art.pin.test.ts"), "utf8");

const LINK = "https://glow.saroh.app/q/h7c";

const hash = (d: string) =>
    createHash("sha256").update(d).digest("hex").slice(0, 16);
const marks = (d: string) => d.split("M").length - 1;

/** The squares a plain path draws, as `[x, y, w, h]`. */
function rects(d: string): [number, number, number, number][] {
    return Array.from(
        d.matchAll(/M(-?[\d.]+) (-?[\d.]+)h(-?[\d.]+)v(-?[\d.]+)h-[\d.]+z/g),
        (m) => [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])],
    );
}

describe("the copy's numbers are the UI renderer's", () => {
    it.each([
        ["the quiet zone", `QR_QUIET_ZONE = ${QR_QUIET_ZONE};`],
        ["a branded dot's radius", `QR_DOT_RADIUS = ${QR_DOT_RADIUS};`],
        [
            "the alignment eye's radii",
            `QR_ALIGNMENT_RADII = [${QR_ALIGNMENT_RADII.join(", ")}] as const;`,
        ],
        [
            "the smallest version with a logo",
            `QR_LOGO_MIN_VERSION = ${QR_LOGO_MIN_VERSION};`,
        ],
        ["the logo's share", `Math.round(n * ${QR_LOGO_SHARE})`],
        ["the tile's fill", `QR_TILE_FILL = "${QR_TILE_FILL}";`],
        ["the tile's letters", `QR_TILE_TEXT = "${QR_TILE_TEXT}";`],
        ["the box's corner", `rx: box.size * ${QR_LOGO_BOX_RADIUS} }`],
        ["the tile's corner", `rx: tile * ${QR_LOGO_TILE_RADIUS},`],
        ["an image's corner", `imageRx: tile * ${QR_LOGO_IMAGE_RADIUS},`],
        ["the initials' size", `size: tile * ${QR_LOGO_TEXT_SIZE} }`],
        // The finder eye: 7, 5 and 3 modules, radii 2, 1.3 and .9.
        ...QR_EYE_SIDES.map((side, i): [string, string] => [
            `the eye's ${side} module square`,
            `rr(x${i ? ` + ${i}` : ""}, y${i ? ` + ${i}` : ""}, ${side}, ${side}, rounded ? ${QR_EYE_RADII[i]} : 0)`,
        ]),
        // The alignment eye: 5, 3 and 1 modules.
        [
            "the alignment eye's ring",
            `rr(col - 2, row - 2, ${QR_ALIGNMENT_SIDES[0]}, ${QR_ALIGNMENT_SIDES[0]}, ring)`,
        ],
        [
            "the alignment eye's hole",
            `rr(col - 1, row - 1, ${QR_ALIGNMENT_SIDES[1]}, ${QR_ALIGNMENT_SIDES[1]}, hole)`,
        ],
        [
            "the alignment eye's centre",
            `rr(col, row, ${QR_ALIGNMENT_SIDES[2]}, ${QR_ALIGNMENT_SIDES[2]}, centre)`,
        ],
        ["error correction H", `ecc: "H",`],
    ])("%s", (_what, line) => {
        expect(UI_SOURCE).toContain(line);
    });

    it("holds the numbers the plan names", () => {
        expect(QR_QUIET_ZONE).toBe(4);
        expect(QR_DOT_RADIUS).toBe(0.42);
        expect(QR_EYE_SIDES).toEqual([7, 5, 3]);
        expect(QR_EYE_RADII).toEqual([2, 1.3, 0.9]);
        expect(QR_ALIGNMENT_SIDES).toEqual([5, 3, 1]);
        expect(QR_ALIGNMENT_RADII).toEqual([1.4, 0.8, 0.5]);
        expect(QR_LOGO_SHARE).toBe(0.22);
        expect(QR_LOGO_MIN_VERSION).toBe(3);
    });
});

describe("the paths drawn for one link, pinned on both sides", () => {
    it.each([
        {
            style: "plain",
            logo: false,
            dotMarks: 476,
            eyeMarks: 9,
            dots: "044e9e44e9021c9d",
            eyes: "e4698477bbc09d10",
            box: null,
        },
        {
            style: "branded",
            logo: false,
            dotMarks: 459,
            eyeMarks: 12,
            dots: "667c9bd5c7760713",
            eyes: "bd4c137bc8100bf2",
            box: null,
        },
        {
            style: "branded",
            logo: true,
            dotMarks: 424,
            eyeMarks: 12,
            dots: "ec1d28edfc27ee07",
            eyes: "bd4c137bc8100bf2",
            box: { x: 12, y: 12, size: 9 },
        },
    ] as const)("a $style code (logo: $logo)", (pin) => {
        const art = qrPrintArt(LINK, { style: pin.style, logo: pin.logo });
        expect(art.n).toBe(33);
        expect(marks(art.dots)).toBe(pin.dotMarks);
        expect(marks(art.eyes)).toBe(pin.eyeMarks);
        expect(hash(art.dots)).toBe(pin.dots);
        expect(hash(art.eyes)).toBe(pin.eyes);
        expect(art.logoBox).toEqual(pin.box);

        // The UI's own test pins `qrArt` to these same values: if they
        // were changed here alone, or there alone, this fails.
        expect(UI_PINS).toContain(`"${pin.dots}"`);
        expect(UI_PINS).toContain(`"${pin.eyes}"`);
        expect(UI_PINS).toContain(`dotMarks: ${pin.dotMarks},`);
    });
});

describe("qrPrintArt", () => {
    it("draws a plain code that reads back as the encoder's modules", () => {
        const art = qrPrintArt(LINK);
        const { data, size } = encode(LINK, { ecc: "H", border: 0 });
        expect(art.n).toBe(size);

        // A module is dark when its centre is inside an odd number of
        // squares (the eyes fill even-odd): what a scanner's grid samples.
        const all = [...rects(art.dots), ...rects(art.eyes)];
        const read = Array.from({ length: size }, (_, row) =>
            Array.from({ length: size }, (_, col) => {
                const cx = col + 0.5;
                const cy = row + 0.5;
                const hits = all.filter(
                    ([x, y, w, h]) =>
                        cx > x && cx < x + w && cy > y && cy < y + h,
                ).length;
                return hits % 2 === 1;
            }),
        );
        expect(read).toEqual(data);
    });

    it("draws one mark for each dark module outside the eyes", () => {
        const art = qrPrintArt(LINK);
        const { data, size } = encode(LINK, { ecc: "H", border: 0 });
        let dark = 0;
        data.forEach((row, r) =>
            row.forEach((on, c) => {
                if (on && !isQrFinderCell(size, r, c)) dark += 1;
            }),
        );
        expect(marks(art.dots)).toBe(dark);
    });

    it("makes a code with a logo at least version 3, with an odd box clear of the eyes", () => {
        const short = qrPrintArt("https://a.co", { logo: true });
        expect(short.n).toBeGreaterThanOrEqual(29);
        const box = short.logoBox;
        expect(box).not.toBeNull();
        if (!box) return;
        expect((box.size - 2) % 2).toBe(1);
        expect(box.x).toBeGreaterThanOrEqual(8);
        expect(box.x + box.size).toBeLessThanOrEqual(short.n - 8);

        const g = qrLogoGeometry(short);
        expect(g?.tile.size).toBe(box.size - 2);
        expect(g?.text.x).toBe(short.n / 2);
    });

    it("draws nothing for no text, and for text no QR can hold", () => {
        expect(qrPrintArt("  ").n).toBe(0);
        expect(qrPrintArt("x".repeat(4000)).n).toBe(0);
    });
});

describe("initialsOf", () => {
    it.each([
        ["Glow Studio", "GS"],
        ["Rye & Co.", "RC"],
        ["rye", "R"],
        ["  The  Little Loaf Bakery ", "TL"],
        ["", ""],
    ])("%s → %s", (name, initials) => {
        expect(initialsOf(name)).toBe(initials);
    });
});
