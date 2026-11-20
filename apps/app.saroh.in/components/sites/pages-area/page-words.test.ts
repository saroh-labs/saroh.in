import { describe, expect, it } from "vitest";

import type { SitePage } from "@/lib/sites/service";

import {
    draftOf,
    lengthHint,
    lostWords,
    madeFrom,
    pageChanges,
    pageLink,
} from "./page-words";

const bridal: SitePage = {
    id: "p2",
    path: "/services/bridal-makeup-packages",
    title: "Bridal makeup packages",
    isHome: false,
    hidden: false,
    kind: "FREE",
    inMenu: true,
    seoTitle: null,
    seoDescription: null,
    shareImageMediaId: null,
    shareImageUrl: null,
    noindex: false,
};

describe("page settings words (WXPPageSheet)", () => {
    it("says how long a Google text is, and never blocks a long one", () => {
        expect(lengthHint(124, 160)).toBe("124 of 160 · a good length");
        expect(lengthHint(0, 160)).toBe("0 of 160");
        expect(lengthHint(170, 160)).toBe("170 of 160 · Google may cut it");
        expect(lengthHint(43, 60)).toBe("43 of 60 · a good length");
    });

    it("tags the pages made from the business", () => {
        expect(madeFrom({ kind: "SHOP" })).toBe("From your products");
        expect(madeFrom({ kind: "JOURNAL" })).toBe("From your posts");
        expect(madeFrom({ kind: "FREE" })).toBeNull();
    });

    it("draws a link on the business's address", () => {
        expect(pageLink("gulmohar.saroh.app", "/bridal")).toBe(
            "gulmohar.saroh.app/bridal",
        );
        expect(pageLink("gulmohar.saroh.app", "/")).toBe("gulmohar.saroh.app");
        expect(pageLink(null, "/bridal")).toBe("/bridal");
    });
});

describe("pageChanges: only what changed goes to the API", () => {
    it("sends nothing for an untouched sheet", () => {
        expect(pageChanges(bridal, draftOf(bridal))).toEqual({});
    });

    it("sends a new link, Google text and Show on Google off", () => {
        const d = {
            ...draftOf(bridal),
            path: " /bridal ",
            seoDescription: "Bridal makeup in Rohtak.",
            onGoogle: false,
        };
        expect(pageChanges(bridal, d)).toEqual({
            path: "/bridal",
            seoDescription: "Bridal makeup in Rohtak.",
            noindex: true,
        });
    });

    it("clears a Google title left blank, and never sends a blank title", () => {
        const page = { ...bridal, seoTitle: "Bridal | Gulmohar" };
        expect(
            pageChanges(page, { ...draftOf(page), seoTitle: "  ", title: "" }),
        ).toEqual({ seoTitle: null });
    });

    it("sends a library photo by its id, and clears one removed", () => {
        expect(
            pageChanges(bridal, {
                ...draftOf(bridal),
                shareImageMediaId: "m1",
                shareImageUrl: "https://cdn.example.com/bride.jpg",
            }),
        ).toEqual({ shareImageMediaId: "m1" });
        const withImage = {
            ...bridal,
            shareImageMediaId: "m1",
            shareImageUrl: "https://cdn.example.com/bride.jpg",
        };
        expect(
            pageChanges(withImage, {
                ...draftOf(withImage),
                shareImageMediaId: null,
                shareImageUrl: null,
            }),
        ).toEqual({ shareImageMediaId: null });
    });

    it("never moves Home or a Book page, nor hides Home", () => {
        const home = { ...bridal, id: "p1", path: "/", isHome: true };
        expect(
            pageChanges(home, { ...draftOf(home), path: "/x", hidden: true }),
        ).toEqual({});
        const book = { ...bridal, path: "/book", kind: "BOOK" as const };
        expect(pageChanges(book, { ...draftOf(book), path: "/b" })).toEqual({});
    });

    it("hides and takes out of the menu", () => {
        expect(
            pageChanges(bridal, {
                ...draftOf(bridal),
                hidden: true,
                inMenu: false,
            }),
        ).toEqual({ hidden: true, inMenu: false });
    });
});

describe("lostWords: leaving asks once, naming what is lost (WXSStates)", () => {
    it("names the changes", () => {
        expect(lostWords({ path: "/bridal", seoDescription: "x" })).toBe(
            "You changed the page link and the text on Google. They will be lost.",
        );
        expect(lostWords({ shareImageMediaId: null })).toBe(
            "You changed the share image. It will be lost.",
        );
    });
});
