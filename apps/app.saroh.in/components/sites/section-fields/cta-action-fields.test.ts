import { describe, expect, it } from "vitest";

import { withCtaLabel } from "./cta-action-fields";

/**
 * A button emptied back to nothing disappears; a button whose label is being
 * retyped keeps what it does (review of #255).
 */
describe("withCtaLabel", () => {
    it.each([
        ["a web address", { kind: "url", href: "" }],
        ["a call", { kind: "call", number: "" }],
        ["a WhatsApp message", { kind: "whatsapp", number: "" }],
        ["an email", { kind: "email", address: "" }],
        ["a page", { kind: "page", pageId: "" }],
    ] as const)("removes an emptied %s button", (_label, action) => {
        expect(withCtaLabel({ label: "Go", action }, "")).toBeUndefined();
    });

    it("keeps a button's number while its label is retyped", () => {
        const next = withCtaLabel(
            {
                label: "Call",
                action: { kind: "call", number: "+44 113 496 0000" },
            },
            "",
        );
        expect(next).toEqual({
            label: "",
            action: { kind: "call", number: "+44 113 496 0000" },
            style: "primary",
        });
    });

    it("lifts a v1 href into an action", () => {
        expect(
            withCtaLabel({ label: "Shop", href: "/products" }, "Shop now"),
        ).toEqual({
            label: "Shop now",
            action: { kind: "url", href: "/products" },
            style: "primary",
        });
    });
});
