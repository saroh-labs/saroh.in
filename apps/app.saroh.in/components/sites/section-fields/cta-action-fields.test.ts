import { describe, expect, it } from "vitest";

import type { SitePage } from "@/lib/sites/service";

import { isMissingPage, shownAction, withCtaLabel } from "./cta-action-fields";

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

/** Raw paths are never shown to a merchant (editor audit, 21 Nov). */
describe("a typed link to the site's own page", () => {
    const pages = [
        { id: "p1", path: "/", isHome: true },
        { id: "p2", path: "/about" },
    ] as unknown as SitePage[];

    it("reads as that page", () => {
        expect(shownAction({ kind: "url", href: "/about/" }, pages)).toEqual({
            kind: "page",
            pageId: "p2",
        });
        expect(
            shownAction({ kind: "url", href: "/about#hours" }, pages),
        ).toEqual({ kind: "url", href: "/about#hours" });
    });

    it("says a page the site doesn't have is missing", () => {
        expect(isMissingPage({ kind: "url", href: "/products" }, pages)).toBe(
            true,
        );
        expect(isMissingPage({ kind: "url", href: "/about?x=1" }, pages)).toBe(
            false,
        );
        expect(
            isMissingPage({ kind: "url", href: "https://example.com" }, pages),
        ).toBe(false);
    });
});
