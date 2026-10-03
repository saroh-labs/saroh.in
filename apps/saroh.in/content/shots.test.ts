import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { SHOT_KEYS, shots } from "./shots";
import { CAPTURED } from "./shots.captured";

describe("captured shots", () => {
    it("each captured shot is a design key with its file under public/", () => {
        for (const [key, shot] of Object.entries(CAPTURED)) {
            expect(SHOT_KEYS).toContain(key);
            expect(
                fs.existsSync(path.join(__dirname, "../public", shot.src)),
            ).toBe(true);
        }
    });

    it("a captured shot replaces its placeholder", () => {
        for (const key of Object.keys(CAPTURED) as (keyof typeof shots)[]) {
            expect(shots[key].src).toBe(CAPTURED[key]!.src);
        }
    });
});
