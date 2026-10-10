import { encode } from "uqr";
import { describe, expect, it } from "vitest";

import {
    contrastOnWhite,
    emptyQrArt,
    isQrFinderCell,
    qrArt,
    qrFileName,
    qrLogoGeometry,
    qrSvg,
    tooLightToScan,
} from "./qr-art";

const LINK = "https://glow.saroh.app/q/h7c";

/** The squares a plain path draws, as `[x, y, w, h]`. */
function rects(d: string): [number, number, number, number][] {
    return Array.from(
        d.matchAll(/M(-?[\d.]+) (-?[\d.]+)h(-?[\d.]+)v(-?[\d.]+)h-[\d.]+z/g),
        (m) => [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])],
    );
}

/**
 * Reads a plain code back off its paths: a module is dark when its centre
 * is inside an odd number of squares (the eyes' `evenodd`), which is what a
 * scanner's sampling grid sees.
 */
function matrixOf(art: ReturnType<typeof qrArt>): boolean[][] {
    const all = [...rects(art.dots), ...rects(art.eyes)];
    return Array.from({ length: art.n }, (_, row) =>
        Array.from({ length: art.n }, (_, col) => {
            const cx = col + 0.5;
            const cy = row + 0.5;
            const hits = all.filter(
                ([x, y, w, h]) => cx > x && cx < x + w && cy > y && cy < y + h,
            ).length;
            return hits % 2 === 1;
        }),
    );
}

function must<T>(value: T | null | undefined): T {
    if (value === null || value === undefined) throw new Error("missing");
    return value;
}

const marks = (d: string) => d.split("M").length - 1;

describe("qrArt", () => {
    it("draws one mark per dark data module and three eyes", () => {
        const art = qrArt(LINK);
        const { data, size } = encode(LINK, { ecc: "H", border: 0 });

        let dark = 0;
        data.forEach((row, r) =>
            row.forEach((on, c) => {
                if (on && !isQrFinderCell(size, r, c)) dark += 1;
            }),
        );
        expect(art.n).toBe(size);
        expect(marks(art.dots)).toBe(dark);
        // Three eyes, three nested shapes each.
        expect(marks(art.eyes)).toBe(9);
        expect(art.viewBox).toBe(`-4 -4 ${size + 8} ${size + 8}`);
    });

    it("gives the same art for the same input", () => {
        const options = { style: "branded", logo: true } as const;
        expect(qrArt(LINK, options)).toEqual(qrArt(LINK, options));
        expect(qrArt(LINK)).not.toEqual(qrArt(`${LINK}x`));
    });

    it("plain: unit squares, square eyes, no box", () => {
        const art = qrArt(LINK, { style: "plain", logo: false });
        expect(art.dots).toMatch(/^(M\d+ \d+h1v1h-1z)+$/);
        expect(art.eyes).not.toContain("a");
        expect(art.eyes.startsWith("M0 0h7v7h-7z")).toBe(true);
        expect(art.logoBox).toBeNull();
        expect(art.boxPct).toBe(0);
        expect(qrLogoGeometry(art)).toBeNull();
    });

    it("branded: r=.42 dots, round eyes and an empty centre box", () => {
        const art = qrArt(LINK, { style: "branded", logo: true });
        const n = art.n;
        expect(art.dots).toMatch(
            /^(M[\d.]+ [\d.]+a0\.42 0\.42 0 1 0 0\.84 0a0\.42 0\.42 0 1 0 -0\.84 0z)+$/,
        );
        // 7, 5 and 3 module shapes with radii 2, 1.3 and 0.9.
        expect(art.eyes).toContain("M2 0h3a2 2 0 0 1 2 2");
        expect(art.eyes).toContain("M2.3 1h2.4a1.3 1.3 0 0 1 1.3 1.3");
        expect(art.eyes).toContain("M2.9 2h1.2a0.9 0.9 0 0 1 0.9 0.9");
        // The alignment pattern (version 4: centred on module 26) is one
        // small eye, 5, 3 and 1 modules, not dots: a weak scanner needs it
        // solid (QR_ALIGNMENT_RADII).
        expect(n).toBe(33);
        expect(marks(art.eyes)).toBe(12);
        expect(art.eyes).toContain("M25.4 24h2.2a1.4 1.4 0 0 1 1.4 1.4");
        expect(art.eyes).toContain("M25.8 25h1.4a0.8 0.8 0 0 1 0.8 0.8");
        expect(art.eyes).toContain("M26.5 26h0a0.5 0.5 0 0 1 0.5 0.5");
        // Plain leaves it to the squares.
        expect(marks(qrArt(LINK, { logo: true }).eyes)).toBe(9);

        // L = round(n * 0.22), odd; the box is L + 2, centred.
        let tile = Math.round(n * 0.22);
        if (tile % 2 === 0) tile += 1;
        const start = (n - tile) / 2 - 1;
        expect(art.logoBox).toEqual({ x: start, y: start, size: tile + 2 });
        expect(Number.isInteger(start)).toBe(true);
        expect(art.boxPct).toBeCloseTo(((tile + 2) / (n + 8)) * 100);
        expect(art.tilePct).toBeCloseTo((tile / (tile + 2)) * 100);

        // No dot's centre is inside the box.
        const centres = Array.from(
            art.dots.matchAll(/M([\d.]+) ([\d.]+)a/g),
            (m) => [Number(m[1]) + 0.42, Number(m[2])] as const,
        );
        expect(centres.length).toBeGreaterThan(0);
        for (const [x, y] of centres) {
            const inside =
                x > start &&
                x < start + tile + 2 &&
                y > start &&
                y < start + tile + 2;
            expect(inside).toBe(false);
        }
        // The same link without the box has more dots.
        expect(marks(qrArt(LINK, { style: "branded" }).dots)).toBeGreaterThan(
            marks(art.dots),
        );
    });

    it("the box takes about a fifth of the width, well inside what H recovers", () => {
        for (const text of [LINK, `${LINK}?${"a=1&".repeat(40)}`]) {
            const art = qrArt(text, { style: "branded", logo: true });
            const box = must(art.logoBox);
            expect((box.size - 2) / art.n).toBeGreaterThan(0.18);
            expect((box.size - 2) / art.n).toBeLessThan(0.27);
            // Area lost, against H's 30% of codewords.
            expect(box.size ** 2 / art.n ** 2).toBeLessThan(0.12);
        }
    });

    it("grows for a long link", () => {
        const long = `https://glow.saroh.app/p/${"argan-shampoo-".repeat(30)}`;
        const art = qrArt(long, { style: "branded", logo: true });
        expect(art.n).toBeGreaterThan(qrArt(LINK).n);
        expect(art.dots).not.toBe("");
        expect(art.logoBox).not.toBeNull();
    });

    it("empty or unencodable text is the empty art, not a throw", () => {
        const empty = emptyQrArt();
        expect(empty).toEqual({
            n: 0,
            viewBox: "-4 -4 8 8",
            dots: "",
            eyes: "",
            logoBox: null,
            boxPct: 0,
            tilePct: 0,
        });
        expect(qrArt("")).toEqual(empty);
        expect(qrArt("   ", { style: "branded", logo: true })).toEqual(empty);
        expect(qrArt(undefined as unknown as string)).toEqual(empty);
        // More than version 40 holds at H.
        expect(qrArt("x".repeat(5000))).toEqual(empty);
        expect(() => qrSvg(empty, { color: "#1C1C1A" })).not.toThrow();
    });

    it("round trip: the plain code's modules are uqr's, eyes included", () => {
        for (const text of [LINK, "glowstudio.in/book", "नमस्ते", "A"]) {
            const { data } = encode(text, { ecc: "H", border: 0 });
            expect(matrixOf(qrArt(text))).toEqual(data);
        }
    });

    it("round trip with a logo: every module outside the box is uqr's", () => {
        const art = qrArt(LINK, { style: "plain", logo: true });
        const { data } = encode(LINK, { ecc: "H", border: 0 });
        const box = must(art.logoBox);
        const drawn = matrixOf(art);
        let checked = 0;
        data.forEach((row, r) =>
            row.forEach((on, c) => {
                const inBox =
                    r >= box.y &&
                    r < box.y + box.size &&
                    c >= box.x &&
                    c < box.x + box.size;
                if (inBox) {
                    expect(drawn[r]?.[c]).toBe(false);
                } else {
                    expect(drawn[r]?.[c]).toBe(on);
                    checked += 1;
                }
            }),
        );
        expect(checked).toBe(art.n ** 2 - box.size ** 2);
    });

    it("branded dots sit on the same modules as the plain squares", () => {
        const plain = qrArt(LINK, { style: "plain", logo: true });
        const branded = qrArt(LINK, { style: "branded", logo: true });
        // All but the alignment pattern (modules 24 to 28), which branded
        // draws as a small eye.
        const inAlignment = (v: number) => v >= 24 && v <= 28;
        const squares = rects(plain.dots)
            .filter(([x, y]) => !(inAlignment(x) && inAlignment(y)))
            .map(([x, y]) => `${x},${y}`);
        const dots = Array.from(
            branded.dots.matchAll(/M([\d.]+) ([\d.]+)a/g),
            (m) => `${Math.round(Number(m[1]) - 0.08)},${Number(m[2]) - 0.5}`,
        );
        expect(dots).toEqual(squares);
        expect(rects(plain.dots).length - squares.length).toBe(17);
    });
});

describe("qrSvg", () => {
    const art = qrArt(LINK, { style: "branded", logo: true });

    it("is a self-contained 1200×1200 file on white", () => {
        const svg = qrSvg(art, { color: "#5C2A48" });
        expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(
            true,
        );
        expect(svg).toContain('width="1200" height="1200"');
        expect(svg).toContain(
            '<rect width="1200" height="1200" fill="#FFFFFF"/>',
        );
        expect(svg).toContain(`<path d="${art.dots}" fill="#5C2A48"/>`);
        expect(svg).toContain('fill-rule="evenodd"');
        expect(svg).toContain(`scale(${1200 / (art.n + 8)}`.slice(0, 12));
        expect(svg).not.toMatch(/https?:\/\/(?!www\.w3\.org)/);
        expect(qrSvg(art, { color: "#5C2A48" })).toBe(svg);
    });

    it("draws the logo box with the design's radii and the initials tile", () => {
        const g = must(qrLogoGeometry(art));
        const tile = must(art.logoBox).size - 2;
        expect(g.box.rx).toBeCloseTo((tile + 2) * 0.18);
        expect(g.tile.rx).toBeCloseTo(tile * 0.22);
        expect(g.text.size).toBeCloseTo(tile * 0.4);

        const svg = qrSvg(art, {
            color: "#1C1C1A",
            logo: { initials: "GS" },
        });
        expect(svg).toContain(`rx="${Math.round(g.box.rx * 1000) / 1000}"`);
        expect(svg).toContain(`rx="${Math.round(g.tile.rx * 1000) / 1000}"`);
        expect(svg).toContain(">GS</text>");
        expect(svg).toContain('fill="#F5F2EC"');
    });

    it("embeds an image logo only as a data URL", () => {
        const dataUrl = "data:image/png;base64,iVBORw0KGgo=";
        expect(qrSvg(art, { color: "#1C1C1A", logo: { dataUrl } })).toContain(
            `href="${dataUrl}"`,
        );
        const remote = qrSvg(art, {
            color: "#1C1C1A",
            logo: { dataUrl: "https://example.com/logo.png" },
        });
        expect(remote).not.toContain("<image");
        expect(remote).not.toContain("example.com");
    });

    it("has no box when the art has none", () => {
        const svg = qrSvg(qrArt(LINK), {
            color: "#1C1C1A",
            logo: { initials: "GS" },
        });
        expect(svg).not.toContain("<text");
        expect(svg.match(/<rect/g)).toHaveLength(1);
    });

    it("writes the label under the code and escapes it", () => {
        const svg = qrSvg(art, {
            color: "#1F4D3A",
            label: 'Scan <to> "book" & pay',
        });
        expect(svg).toContain("Scan &lt;to&gt; &quot;book&quot; &amp; pay");
        expect(svg).not.toContain("<to>");
        // The pill is the code's colour and stays inside the file.
        const pill = must(
            /<rect x="([\d.]+)" y="(\d+)" width="([\d.]+)" height="(\d+)" rx="\d+" fill="#1F4D3A"\/>/.exec(
                svg,
            ),
        );
        expect(Number(pill[2]) + Number(pill[4])).toBeLessThanOrEqual(1200);
        expect(Number(pill[1])).toBeGreaterThanOrEqual(0);

        const long = qrSvg(art, { color: "#1F4D3A", label: "x".repeat(200) });
        const wide = must(
            /<rect x="([\d.]+)" y="\d+" width="([\d.]+)"[^>]*rx="68"/.exec(
                long,
            ),
        );
        expect(Number(wide[1]) + Number(wide[2])).toBeLessThanOrEqual(1200);
    });

    it("cannot be broken out of through the colour", () => {
        const svg = qrSvg(art, { color: '"/><script>x</script>' });
        expect(svg).not.toContain("<script>");
    });
});

describe("tooLightToScan", () => {
    it("refuses Saffron light and allows Ink", () => {
        expect(tooLightToScan("#F0A92B")).toBe(true);
        expect(tooLightToScan("#1C1C1A")).toBe(false);
        expect(tooLightToScan("#5C2A48")).toBe(false);
        expect(tooLightToScan("#1F4D3A")).toBe(false);
        expect(tooLightToScan("#1E3A5F")).toBe(false);
        expect(tooLightToScan("#FFFFFF")).toBe(true);
    });

    it("follows the 4:1 rule at the boundary", () => {
        // Mid grey straddles 4:1 against white: 7F is just over, 80 just under.
        expect(must(contrastOnWhite("#7F7F7F"))).toBeGreaterThanOrEqual(4);
        expect(must(contrastOnWhite("#7F7F7F"))).toBeLessThan(4.01);
        expect(tooLightToScan("#7F7F7F")).toBe(false);
        expect(must(contrastOnWhite("#808080"))).toBeLessThan(4);
        expect(must(contrastOnWhite("#808080"))).toBeGreaterThan(3.9);
        expect(tooLightToScan("#808080")).toBe(true);
    });

    it("reads short and bare hex, and refuses what it cannot read", () => {
        expect(contrastOnWhite("#000")).toBeCloseTo(21);
        expect(contrastOnWhite("fff")).toBeCloseTo(1);
        expect(tooLightToScan("1c1c1a")).toBe(false);
        expect(tooLightToScan("rebeccapurple")).toBe(true);
        expect(tooLightToScan("")).toBe(true);
    });
});

describe("qrFileName", () => {
    it("names the file after the business and the code", () => {
        expect(qrFileName("Glow Studio", "h7c")).toBe("glow-studio-qr-h7c");
        expect(qrFileName("  Café Déjà Vu & Co. ", "A1")).toBe(
            "cafe-deja-vu-co-qr-a1",
        );
    });

    it("still gives a name when a part is missing", () => {
        expect(qrFileName("", "h7c")).toBe("qr-h7c");
        expect(qrFileName("Glow Studio")).toBe("glow-studio-qr");
        expect(qrFileName("रसोई", null)).toBe("qr");
    });
});
