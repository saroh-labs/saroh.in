import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { isPublicVisit as fromIndex } from "../index";
import { isPublicVisit } from "./public-visit";

const KAVI = {
    source: "storefront",
    storeId: "store_kavi",
    name: "Kavi Dental",
    address: "12th Main, Indiranagar, Bengaluru 560038",
    phone: "+918040992210",
    hours: [{ day: "MON", open: "09:00", close: "19:00", closed: false }],
    timezone: "Asia/Kolkata",
    closedDates: [],
};

describe("the public visit read's check (E6)", () => {
    it("lives in a module the server can call: no 'use client' directive", () => {
        // saroh.app's booking page calls it on the server for its header.
        // From a client module it is only a client reference there, the call
        // throws, and the header silently loses the address, hours and phone.
        const source = readFileSync(
            path.join(__dirname, "public-visit.ts"),
            "utf8",
        );
        expect(source).not.toMatch(/^\s*["']use client["']/m);
    });

    it("is the one the package exports", () => {
        expect(fromIndex).toBe(isPublicVisit);
    });

    it("takes the API's answer and refuses anything else", () => {
        expect(isPublicVisit(KAVI)).toBe(true);
        expect(isPublicVisit({ ...KAVI, hours: null, phone: null })).toBe(true);
        expect(isPublicVisit({ ...KAVI, source: "shop" })).toBe(false);
        expect(isPublicVisit({ ...KAVI, closedDates: [1] })).toBe(false);
        expect(isPublicVisit(null)).toBe(false);
    });
});
