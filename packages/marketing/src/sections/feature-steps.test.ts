import { describe, expect, it } from "vitest";

import { shapeOf } from "./feature-steps";

const view = (width: number, height: number) => ({
    id: "x",
    image: { src: null, alt: "x", width, height },
});

describe("shapeOf", () => {
    it("tells a phone screen, an upright sheet and a desk screen apart", () => {
        expect(shapeOf(view(924, 2000))).toBe("phone");
        expect(shapeOf(view(1640, 2000))).toBe("upright");
        expect(shapeOf(view(2880, 1800))).toBe("wide");
    });
});
