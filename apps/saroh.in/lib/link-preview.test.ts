import { describe, expect, it } from "vitest";

import type { CheckFailure, LinkFacts } from "./link-preview";
import {
    addressProblem,
    cardImage,
    cardText,
    checkedLine,
    domainOf,
    failureMessage,
    reportLink,
    splitScheme,
} from "./link-preview";

/**
 * The link preview tool's rules on saroh.in (resources plan U2): what the
 * visitor typed, cleaned so the scheme never doubles (R19); each failure in
 * the page's voice (R5); the report's own address (R13); and which tags
 * each app's card is drawn from.
 */

describe("splitScheme (R19)", () => {
    it.each([
        ["https://shop.in/menu", "https", "shop.in/menu"],
        ["HTTP://shop.in", "http", "shop.in"],
        ["https://https://shop.in", "https", "shop.in"],
        ["  https://shop.in  ", "https", "shop.in"],
        ["shop.in", null, "shop.in"],
        ["shop.in/https://x", null, "shop.in/https://x"],
    ])("splits %s", (value, scheme, rest) => {
        expect(splitScheme(value)).toEqual({ scheme, rest });
    });
});

describe("addressProblem", () => {
    it("asks for an address when there is none", () => {
        expect(addressProblem("  ")).toBe(
            "Paste a web address first, like yourbusiness.in.",
        );
    });

    it.each(["hello", "my shop.in", "shop", "@@@"])(
        "says %s isn't an address",
        (value) => {
            expect(addressProblem(value)).toBe(
                "That doesn't look like a web address. Try something like yourbusiness.in.",
            );
        },
    );

    it.each(["shop.in", "www.shop.co.in/menu?x=1", "127.0.0.1:4123/page"])(
        "takes %s",
        (value) => {
            expect(addressProblem(value)).toBeNull();
        },
    );
});

describe("failureMessage", () => {
    const all: CheckFailure[] = [
        "invalid",
        "blocked",
        "unreachable",
        "not-html",
        "no-tags",
        "too-large",
        "timeout",
        "rate-limited",
        "unavailable",
    ];

    it("words every failure, naming the site where it helps", () => {
        for (const failure of all) {
            expect(failureMessage(failure, "shop.in").length).toBeGreaterThan(
                20,
            );
        }
        expect(failureMessage("unreachable", "shop.in")).toBe(
            "We couldn't reach shop.in. Check the address, or try again in a minute.",
        );
        expect(failureMessage("unreachable", "shop.in", 404)).toContain(
            "(404)",
        );
        expect(failureMessage("no-tags", "shop.in")).toBe(
            "We read shop.in, but found no share tags: no title, description or picture for the apps to use.",
        );
    });

    it("names the site as typed, before any path", () => {
        expect(domainOf("https://Shop.in/menu?x=1")).toBe("shop.in");
    });
});

describe("reportLink (R13)", () => {
    it("gives the report its own address, without the scheme for https", () => {
        expect(reportLink("https://www.saroh.in", "https://shop.in/")).toBe(
            "https://www.saroh.in/tools/link-preview?url=shop.in",
        );
        expect(reportLink("https://www.saroh.in", "https://shop.in/menu")).toBe(
            "https://www.saroh.in/tools/link-preview?url=shop.in%2Fmenu",
        );
        expect(reportLink("https://www.saroh.in", "http://shop.in/")).toBe(
            "https://www.saroh.in/tools/link-preview?url=http%3A%2F%2Fshop.in",
        );
    });
});

describe("checkedLine", () => {
    it("says just now, then the time in India", () => {
        const at = "2026-10-05T14:12:00.000Z";
        expect(checkedLine(at, Date.parse(at) + 5_000)).toBe(
            "Checked just now.",
        );
        expect(checkedLine(at, Date.parse(at) + 5 * 60_000)).toBe(
            "Checked at 7:42 pm.",
        );
    });
});

describe("what each card is drawn from", () => {
    const facts: LinkFacts = {
        domain: "shop.in",
        finalUrl: "https://shop.in/",
        status: 200,
        title: "Share title",
        description: "Share description",
        siteName: null,
        image: {
            url: "https://shop.in/a.jpg",
            loads: false,
            width: null,
            height: null,
            type: null,
            bytes: null,
        },
        tags: {
            title: "Page title",
            description: null,
            canonical: null,
            og: {
                title: "Share title",
                description: "Share description",
                image: "https://shop.in/a.jpg",
                url: null,
                siteName: null,
            },
            twitter: {
                card: null,
                title: "X title",
                description: null,
                image: null,
            },
        },
    };

    it("reads Google's from the page title and meta description, X's from its own tags", () => {
        expect(cardText(facts, "google")).toEqual({
            title: "Page title",
            description: "",
            siteName: "shop.in",
        });
        expect(cardText(facts, "x").title).toBe("X title");
        expect(cardText(facts, "whatsapp")).toEqual({
            title: "Share title",
            description: "Share description",
            siteName: "shop.in",
        });
    });

    it("draws no picture when it doesn't load, and the sample's as its stand-in", () => {
        expect(cardImage(facts)).toBeNull();
        if (!facts.image) throw new Error("expected a picture");
        const loads = { ...facts, image: { ...facts.image, loads: true } };
        expect(cardImage(loads)?.url).toBe("https://shop.in/a.jpg");
        expect(cardImage(loads, true)?.url).toBe("");
    });
});
