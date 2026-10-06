import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { SHOT_KEYS, shots } from "./shots";
import { CAPTURED } from "./shots.captured";

describe("captured shots", () => {
    it("each captured shot is a design or Help key with its file under public/", () => {
        for (const [key, shot] of Object.entries(CAPTURED)) {
            if (!key.startsWith("help-")) expect(SHOT_KEYS).toContain(key);
            expect(
                fs.existsSync(path.join(__dirname, "../public", shot.src)),
            ).toBe(true);
        }
    });

    it("a captured shot replaces its placeholder", () => {
        for (const [key, shot] of Object.entries(CAPTURED)) {
            if (key.startsWith("help-")) continue;
            expect(shots[key as keyof typeof shots].src).toBe(shot.src);
        }
    });
});

describe("Help shots", () => {
    it("live under /shots/help/, and a mark sits inside its image", () => {
        for (const [key, shot] of Object.entries(CAPTURED)) {
            if (!key.startsWith("help-")) {
                expect(shot.mark).toBeUndefined();
                continue;
            }
            expect(shot.src).toBe(`/shots/help/${key}.webp`);
            if (!shot.mark) continue;
            const { x, y, w, h } = shot.mark;
            expect(x).toBeGreaterThanOrEqual(-0.02);
            expect(y).toBeGreaterThanOrEqual(-0.02);
            expect(x + w).toBeLessThanOrEqual(1.02);
            expect(y + h).toBeLessThanOrEqual(1.02);
        }
    });
});
