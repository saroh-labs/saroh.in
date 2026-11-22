/**
 * One older photo's size, blur and copies (DEC-246 backfill): upright from
 * its EXIF orientation, copies only narrower than the photo, and no EXIF
 * (so no GPS) in any copy. The rows are in media-variants.db.spec.ts.
 */
import { isValidPlaceholder } from "@saroh/block-contract";
import sharp from "sharp";

import { imageFacts } from "./media-variants";
import { parseArgs } from "./media-variants.cli";

/** A 1600×900 JPEG stored sideways (orientation 6) with a GPS position. */
function sidewaysJpeg(): Promise<Buffer> {
    return sharp({
        create: {
            width: 1600,
            height: 900,
            channels: 3,
            background: { r: 200, g: 120, b: 40 },
        },
    })
        .jpeg()
        .withMetadata({ orientation: 6 })
        .withExifMerge({
            IFD3: { GPSLatitudeRef: "N", GPSLatitude: "12/1 58/1 0/1" },
        })
        .toBuffer();
}

describe("imageFacts", () => {
    it("reads the upright size, makes a placeholder and EXIF-free copies", async () => {
        const input = await sidewaysJpeg();
        const before = await sharp(input).metadata();
        expect(before.orientation).toBe(6);
        expect(before.exif).toBeDefined();

        const facts = await imageFacts(input, { copies: true });

        // Orientation 6 turns 1600×900 on its side.
        expect(facts).toMatchObject({ width: 900, height: 1600 });
        expect(isValidPlaceholder(facts.placeholder)).toBe(true);
        expect(facts.copies.map((c) => c.width)).toEqual([480]);
        for (const copy of facts.copies) {
            const meta = await sharp(copy.body).metadata();
            expect(meta.format).toBe("webp");
            expect(meta.width).toBe(copy.width);
            expect(meta.height).toBe(Math.round((1600 * copy.width) / 900));
            expect(meta.exif).toBeUndefined();
            expect(meta.orientation).toBeUndefined();
        }
    });

    it("gives size and blur but no copies when asked to keep it as is", async () => {
        const facts = await imageFacts(await sidewaysJpeg(), { copies: false });
        expect(facts.copies).toEqual([]);
        expect(isValidPlaceholder(facts.placeholder)).toBe(true);
    });
});

describe("parseArgs", () => {
    it("reads --dry-run and --limit, and refuses anything else", () => {
        expect(parseArgs([])).toEqual({ dryRun: false });
        expect(parseArgs(["--dry-run", "--limit=20"])).toEqual({
            dryRun: true,
            limit: 20,
        });
        expect(parseArgs(["--limit=0"])).toBeNull();
        expect(parseArgs(["--apply"])).toBeNull();
    });
});
