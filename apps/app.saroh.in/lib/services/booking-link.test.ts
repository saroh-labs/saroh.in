/**
 * "Your booking page" (DEC-175, #1158): what the row says and offers in
 * each state. Honest until live: no link to copy before customers can open
 * it, and the right way to put it live for who is looking.
 */
import { describe, expect, it } from "vitest";

import type { BookingLinkView } from "./booking-link";
import {
    bookingLinkRow,
    decodeBookingLink,
    NOT_LIVE,
    publishLine,
    shownAddress,
} from "./booking-link";

const SITE = { id: "site_1", name: "Bend Physio", address: "bend-physio" };
const URL = "https://bend-physio.saroh.app/book";

const view = (over: Partial<BookingLinkView> = {}): BookingLinkView => ({
    state: "draft",
    site: SITE,
    host: "bend-physio.saroh.app",
    url: URL,
    published: false,
    mayPublish: true,
    make: null,
    ...over,
});

describe("the booking page row", () => {
    it("live: the address and the link to share", () => {
        expect(
            bookingLinkRow(view({ state: "live", published: true })),
        ).toEqual({
            kind: "live",
            address: "bend-physio.saroh.app/book",
            url: URL,
            line: "Live: customers can open it and book.",
        });
    });

    it("a verified domain is the address customers get", () => {
        const row = bookingLinkRow(
            view({
                state: "live",
                published: true,
                host: "book.bendphysio.in",
                url: "https://book.bendphysio.in/book",
            }),
        );
        expect(row).toMatchObject({ address: "book.bendphysio.in/book" });
    });

    it("not live yet, for someone who may publish: Publish booking page here", () => {
        expect(bookingLinkRow(view())).toEqual({
            kind: "draft",
            address: "bend-physio.saroh.app/book",
            line: `${NOT_LIVE}.`,
            publish: "here",
        });
    });

    it("not live yet, for someone who may not: who can", () => {
        expect(bookingLinkRow(view({ mayPublish: false }))).toMatchObject({
            kind: "draft",
            line: `${NOT_LIVE}. An owner or admin can publish it.`,
            publish: "ask",
        });
    });

    it("a website already published whose page isn't served: finished in Website", () => {
        // Publishing here would put every waiting change live with it.
        expect(bookingLinkRow(view({ published: true }))).toMatchObject({
            kind: "draft",
            publish: "website",
        });
    });

    it("live but with no address to show is not offered as live", () => {
        expect(
            bookingLinkRow(view({ state: "live", url: null, host: null })),
        ).toMatchObject({ kind: "draft", address: null });
    });

    it.each([
        ["ready", "make"],
        ["website", "website"],
        ["permission", null],
        ["no-service", null],
        ["unavailable", null],
    ] as const)("no website yet (%s): %s", (make, action) => {
        const row = bookingLinkRow(
            view({ state: "none", site: null, host: null, url: null, make }),
        );
        expect(row).toMatchObject({ kind: "none", action });
        expect(row.kind === "none" && row.line.length > 0).toBe(true);
    });

    it("no website and nothing said why: nothing offered", () => {
        expect(
            bookingLinkRow(view({ state: "none", site: null, make: null })),
        ).toMatchObject({ kind: "none", action: null });
    });
});

describe("its words and its read", () => {
    it("shows an address without its scheme", () => {
        expect(shownAddress("https://rye.saroh.app/book")).toBe(
            "rye.saroh.app/book",
        );
        expect(shownAddress("https://rye.in/")).toBe("rye.in");
    });

    it("the sheet says the website goes live with it", () => {
        expect(publishLine(view())).toContain("bend-physio.saroh.app/book");
        expect(publishLine(view())).toContain("Your website goes live with it");
        expect(publishLine(view({ url: null }))).toContain("your web address");
    });

    it("reads the API's answer, and nothing it can't read", () => {
        expect(decodeBookingLink(view())).toEqual(view());
        expect(decodeBookingLink({ state: "draft" })).toBeNull();
        expect(decodeBookingLink(null)).toBeNull();
        // A reason this app doesn't know is no reason.
        expect(
            decodeBookingLink({ ...view({ state: "none" }), make: "later" })
                ?.make,
        ).toBeNull();
    });
});
