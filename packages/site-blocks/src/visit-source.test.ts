import { afterEach, describe, expect, it, vi } from "vitest";

import {
    classifyVisit,
    currentVisit,
    forgetVisitForTests,
    groupOfHost,
    markVisitStep,
    registerVisitSender,
    seeVisitPage,
    VISIT_IDLE_MS,
    visitFields,
    visitRefOf,
} from "./visit-source";

const OWN = "flowers.saroh.app";
const page = (referrer: string, search = "") => ({
    referrer,
    ownHost: OWN,
    search,
});

describe("where a visit came from (U15)", () => {
    it("groups the referrer's site", () => {
        expect(classifyVisit(page("https://l.instagram.com/"))).toEqual({
            source: "instagram",
            ref: null,
        });
        expect(
            classifyVisit(page("https://www.google.co.in/search?q=me")).source,
        ).toBe("google");
        expect(classifyVisit(page("https://wa.me/")).source).toBe("whatsapp");
        expect(classifyVisit(page("https://web.whatsapp.com/")).source).toBe(
            "whatsapp",
        );
        expect(classifyVisit(page("https://news.example.com/a")).source).toBe(
            "other",
        );
        expect(classifyVisit(page("")).source).toBe("direct");
        // The site itself is no referrer.
        expect(classifyVisit(page(`https://${OWN}/shop`)).source).toBe(
            "direct",
        );
    });

    it("never takes a look-alike for Google search", () => {
        expect(groupOfHost("mail.google.com")).toBeNull();
        expect(groupOfHost("googleusercontent.com")).toBeNull();
        expect(groupOfHost("google.evil.example")).toBeNull();
        expect(groupOfHost("notinstagram.com")).toBeNull();
        expect(groupOfHost("www.google.com")).toBe("google");
    });

    it("reads ref and utm_source only, and keeps a merchant's own label", () => {
        expect(
            classifyVisit(
                page(
                    "https://l.instagram.com/",
                    "?ref=Diwali-Post&email=a@example.com&utm_campaign=x",
                ),
            ),
        ).toEqual({ source: "instagram", ref: "diwali-post" });
        // A label that names a group decides it, and isn't kept as a label.
        expect(classifyVisit(page("", "?ref=instagram"))).toEqual({
            source: "instagram",
            ref: null,
        });
        expect(classifyVisit(page("", "?utm_source=wa"))).toEqual({
            source: "whatsapp",
            ref: null,
        });
        expect(
            classifyVisit(page("", "?utm_source=google&ref=autumn-sale")),
        ).toEqual({ source: "google", ref: "autumn-sale" });
        // A merchant's own link with no referrer (an app sends none).
        expect(classifyVisit(page("", "?ref=status"))).toEqual({
            source: "other",
            ref: "status",
        });
    });

    it("keeps no label that could name a person or carry an address", () => {
        for (const value of [
            "someone@example.com",
            "call-9876543210",
            "has space",
            "a.b",
            "x".repeat(33),
        ]) {
            expect(visitRefOf(value)).toBeNull();
            expect(
                classifyVisit(page("", `?ref=${encodeURIComponent(value)}`)),
            ).toEqual({ source: "direct", ref: null });
        }
    });
});

describe("the visit, in this tab's memory (U15)", () => {
    afterEach(() => {
        forgetVisitForTests();
        vi.restoreAllMocks();
    });

    it("sends each step once per visit, with only its source", () => {
        const sent: unknown[] = [];
        registerVisitSender((step, origin) => sent.push([step, origin]));
        const t = 1_000_000;

        seeVisitPage(t, page("https://l.instagram.com/", "?ref=story"));
        seeVisitPage(t + 1000, page("https://l.instagram.com/"));
        expect(markVisitStep("looked", t + 2000)).toBe(true);
        expect(markVisitStep("looked", t + 3000)).toBe(false);
        expect(markVisitStep("started", t + 4000)).toBe(true);

        const origin = { source: "instagram", ref: "story" };
        expect(sent).toEqual([
            ["visit", origin],
            ["looked", origin],
            ["started", origin],
        ]);
        expect(visitFields(t + 5000)).toEqual({
            visitSource: "instagram",
            visitRef: "story",
        });
    });

    it("writes nothing to any storage", () => {
        const set = vi.spyOn(Storage.prototype, "setItem");
        registerVisitSender(() => undefined);
        seeVisitPage(1, page("https://wa.me/"));
        markVisitStep("looked", 2);
        expect(set).not.toHaveBeenCalled();
        expect(document.cookie).toBe("");
    });

    it("ends after 30 minutes without a page; the next begins as typed", () => {
        const sent: unknown[] = [];
        registerVisitSender((step, origin) => sent.push([step, origin]));
        const t = 5_000_000;
        seeVisitPage(t, page("https://www.google.com/"));
        expect(currentVisit(t + VISIT_IDLE_MS - 1)?.source).toBe("google");
        expect(currentVisit(t + VISIT_IDLE_MS)).toBeNull();
        expect(visitFields(t + VISIT_IDLE_MS)).toEqual({});
        expect(markVisitStep("looked", t + VISIT_IDLE_MS)).toBe(false);

        // The page load's referrer is the old visit's, not this one's.
        seeVisitPage(t + VISIT_IDLE_MS + 1, page("https://www.google.com/"));
        expect(sent.at(-1)).toEqual(["visit", { source: "direct", ref: null }]);
    });

    it("sends no step and no checkout source when no visit began", () => {
        const send = vi.fn();
        registerVisitSender(send);
        expect(markVisitStep("started", 1)).toBe(false);
        expect(visitFields(1)).toEqual({});
        expect(send).not.toHaveBeenCalled();
    });

    it("sends nothing once the beacon is gone", () => {
        const send = vi.fn();
        registerVisitSender(send);
        seeVisitPage(1, page(""));
        registerVisitSender(null);
        expect(markVisitStep("looked", 2)).toBe(false);
        expect(send).toHaveBeenCalledTimes(1);
    });
});
