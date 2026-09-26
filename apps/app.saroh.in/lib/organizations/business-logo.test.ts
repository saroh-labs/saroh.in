import { describe, expect, it } from "vitest";

import { LOGO_MAX_BYTES, logoFileProblem } from "./business-logo";

describe("logoFileProblem", () => {
    it("takes a PNG, JPG or WebP of 1 MB or less", () => {
        expect(logoFileProblem({ type: "image/png", size: 40_000 })).toBeNull();
        expect(logoFileProblem({ type: "image/jpeg", size: 1 })).toBeNull();
        expect(
            logoFileProblem({ type: "image/webp", size: LOGO_MAX_BYTES }),
        ).toBeNull();
    });

    it("refuses anything else, SVG included", () => {
        for (const type of ["image/svg+xml", "image/gif", "application/pdf"]) {
            expect(logoFileProblem({ type, size: 100 })).toBe(
                "That file isn't a PNG, JPG or WebP image.",
            );
        }
    });

    it("says how big a file over 1 MB is", () => {
        expect(
            logoFileProblem({ type: "image/png", size: 1.4 * LOGO_MAX_BYTES }),
        ).toBe("That image is 1.4 MB — keep it under 1 MB.");
    });
});
