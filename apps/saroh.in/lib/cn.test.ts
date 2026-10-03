import { describe, expect, it } from "vitest";

import { cn } from "./cn";

/** `mk-*` keys keep their own groups (see cn.ts for the trap). */
describe("cn", () => {
    it("keeps a mk size beside a colour", () => {
        expect(cn("text-mk-note text-muted-foreground")).toBe(
            "text-mk-note text-muted-foreground",
        );
        expect(cn("text-mk-body text-mk-copy")).toBe(
            "text-mk-body text-mk-copy",
        );
        for (const size of ["mk-price-lg", "mk-pricing-hero", "mk-h2-xs"]) {
            expect(cn(`text-${size} text-foreground`)).toBe(
                `text-${size} text-foreground`,
            );
        }
    });

    it("lets a later mk size or width win", () => {
        expect(cn("text-mk-h2 text-mk-h2-sm")).toBe("text-mk-h2-sm");
        expect(cn("max-w-mk-page max-w-[860px]")).toBe("max-w-[860px]");
        expect(cn("px-mk-gutter px-0")).toBe("px-0");
    });

    it("keeps an outline's style beside its width", () => {
        expect(
            cn("focus-visible:[outline-style:solid] focus-visible:outline-2"),
        ).toBe("focus-visible:[outline-style:solid] focus-visible:outline-2");
    });
});
