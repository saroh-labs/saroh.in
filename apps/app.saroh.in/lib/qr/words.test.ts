import { describe, expect, it } from "vitest";

import { qrFailure } from "./failure";
import { code } from "./fixtures.test-data";
import { logoDataUrl, logoType, mayFetch, toDataUrl } from "./logo-data";
import {
    defaultLabel,
    linkWords,
    madeWords,
    opensWords,
    placeWords,
    QR_LABELS,
    QR_PLACES,
    refusalWords,
    TARGET_GONE,
    TOO_LIGHT,
} from "./words";

describe("the screen's words", () => {
    it("names the places as the design does, with Other last", () => {
        expect(QR_PLACES.map((p) => p.name)).toEqual([
            "Counter",
            "Mirror",
            "Visiting card",
            "Flyer",
            "Other…",
        ]);
        expect(placeWords(code({ place: "CARD" }))).toBe("Visiting card");
        expect(
            placeWords(code({ place: "OTHER", placeNote: "Front desk" })),
        ).toBe("Front desk");
        expect(placeWords(code({ place: "OTHER", placeNote: null }))).toBe(
            "Other",
        );
    });

    it("starts a code's label from what it opens", () => {
        expect(QR_LABELS).toEqual([
            "Scan to book",
            "Scan to order",
            "Scan to visit",
        ]);
        expect(defaultLabel("BOOK")).toBe("Scan to book");
        expect(defaultLabel("SHOP")).toBe("Scan to order");
        expect(defaultLabel("PRODUCT")).toBe("Scan to order");
        expect(defaultLabel("SITE")).toBe("Scan to visit");
        expect(defaultLabel("PAGE")).toBe("Scan to visit");
    });

    it("says a gone page is gone, and where its paper goes", () => {
        expect(
            opensWords(
                code({
                    target: {
                        kind: "PAGE",
                        ref: "x",
                        name: "A page no longer on your site",
                        path: null,
                        missing: true,
                    },
                }),
            ),
        ).toBe(TARGET_GONE);
        expect(opensWords(code())).toBe("Booking page");
        expect(linkWords("https://glow.saroh.app/q/h7c")).toBe(
            "glow.saroh.app/q/h7c",
        );
    });

    it("shows a dash until a booking is counted, then the number", () => {
        expect(madeWords(code())).toEqual({ bookings: "–", orders: null });
        expect(madeWords(code({ bookings: 11, orders: 1 }))).toEqual({
            bookings: "11",
            orders: "1 order",
        });
        expect(madeWords(code({ orders: 3 })).orders).toBe("3 orders");
    });
});

describe("a refused save", () => {
    const envelope = (
        message: string,
        details: unknown,
        code = "BAD_REQUEST",
    ) => ({
        error: { code, message, statusCode: 400, details },
    });

    it("keeps the control and the reason the API named", () => {
        const res = qrFailure(
            envelope(
                "Your online shop isn't open on this site, so a code can't open it yet.",
                { field: "target", reason: "shop-closed" },
            ),
            "fallback",
        );
        expect(res).toEqual({
            ok: false,
            error: "Your online shop isn't open on this site, so a code can't open it yet.",
            field: "target",
            reason: "shop-closed",
        });
        expect(refusalWords(res)).toEqual({
            where: "target",
            text: "Your online shop isn't open on this site, so a code can't open it yet.",
        });
    });

    it("says a too-light colour in the design's words, by the colour", () => {
        const res = qrFailure(
            envelope("That colour is too light for a phone to scan.", {
                field: "color",
                reason: "too-light",
            }),
            "fallback",
        );
        expect(refusalWords(res)).toEqual({ where: "color", text: TOO_LIGHT });
    });

    it("words a bare validation failure itself", () => {
        const res = qrFailure(envelope("Validation failed", {}), "fallback");
        expect(refusalWords(res)).toEqual({
            where: "general",
            text: "That didn't save. Try again.",
        });
        expect(
            refusalWords({ ok: false, error: "", reason: "page-missing" }).text,
        ).toMatch(/isn't on your published site/);
    });

    it("keeps a conflict's reason and the plan's lock", () => {
        expect(
            qrFailure(
                envelope("This code is retired, so it can't be changed.", {
                    reason: "retired",
                }),
                "fallback",
            ).reason,
        ).toBe("retired");
        const locked = qrFailure(
            envelope("Your own look isn't in your plan", {
                code: "MODULE_LOCKED",
                moduleId: "qr-branding",
                upgradeTo: { planId: "b", name: "Plan B", pricePaise: 11_100 },
            }),
            "fallback",
        );
        expect(locked.plan?.code).toBe("MODULE_LOCKED");
        expect(locked.plan?.upgradeTo?.name).toBe("Plan B");
        // Anything else falls back to our own sentence.
        expect(qrFailure(null, "We couldn't make that code.").error).toBe(
            "We couldn't make that code.",
        );
    });
});

describe("the logo as a data URL", () => {
    const png = new Uint8Array([137, 80, 78, 71]);
    const answer = (type: string, bytes: Uint8Array, ok = true) =>
        (() =>
            Promise.resolve(
                new Response(ok ? (bytes.buffer as ArrayBuffer) : null, {
                    status: ok ? 200 : 404,
                    headers: { "content-type": type },
                }),
            )) as unknown as typeof fetch;

    it("embeds a logo's bytes", async () => {
        expect(
            await logoDataUrl(
                "https://media.example.com/logo.png",
                answer("image/png; charset=binary", png),
            ),
        ).toBe(toDataUrl("image/png", png));
        expect(toDataUrl("image/png", png)).toBe(
            "data:image/png;base64,iVBORw==",
        );
    });

    it("draws no logo rather than something it can't vouch for", async () => {
        const url = "https://media.example.com/logo";
        expect(await logoDataUrl(null)).toBeNull();
        expect(await logoDataUrl(url, answer("image/svg+xml", png))).toBeNull();
        expect(await logoDataUrl(url, answer("text/html", png))).toBeNull();
        expect(
            await logoDataUrl(url, answer("image/png", png, false)),
        ).toBeNull();
        expect(
            await logoDataUrl(url, answer("image/png", new Uint8Array())),
        ).toBeNull();
        expect(
            await logoDataUrl(url, () => Promise.reject(new Error("down"))),
        ).toBeNull();
        expect(
            await logoDataUrl(
                "http://media.example.com/a.png",
                answer("image/png", png),
            ),
        ).toBeNull();
    });

    it("fetches https, and a local stack's own storage", () => {
        expect(mayFetch("https://media.example.com/a.png")).toBe(true);
        expect(mayFetch("http://localhost:9000/a.png")).toBe(true);
        expect(mayFetch("http://media.saroh.localhost/a.png")).toBe(true);
        expect(mayFetch("http://media.example.com/a.png")).toBe(false);
        expect(mayFetch("file:///etc/passwd")).toBe(false);
        expect(mayFetch("nonsense")).toBe(false);
        expect(logoType("IMAGE/JPEG")).toBe("image/jpeg");
        expect(logoType(null)).toBeNull();
    });
});
