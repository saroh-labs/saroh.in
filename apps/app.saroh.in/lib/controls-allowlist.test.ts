import fs from "node:fs";
import path from "node:path";

import { RAW_ALLOWED } from "@saroh/eslint-config/controls-allowlist";
import { describe, expect, it } from "vitest";

/**
 * The list of hand-made controls only gets shorter.
 *
 * ESLint fails a raw `<button>`, `<input>`, `<select>`, `<textarea>` or
 * `<label>` in a file that isn't on the list. This is the other half: a
 * line that names a file or a tag the code no longer has is stale, and a
 * stale line is room for a hand-made control to come back unseen.
 */
const APP = path.resolve(__dirname, "..");
const allowed = RAW_ALLOWED as Record<string, readonly string[]>;

describe("the hand-made controls list matches the code", () => {
    it.each(Object.entries(allowed))("%s", (file, tags) => {
        const full = path.join(APP, file);
        expect(fs.existsSync(full), `${file} is gone: drop its line`).toBe(
            true,
        );
        const source = fs.readFileSync(full, "utf8");
        for (const tag of tags) {
            expect(
                new RegExp(`<${tag}\\b`).test(source),
                `${file} no longer draws <${tag}>: take it off its line`,
            ).toBe(true);
        }
    });

    it("no native select is left, and no file may keep one", () => {
        for (const tags of Object.values(allowed)) {
            expect(tags).not.toContain("select");
        }
    });
});
