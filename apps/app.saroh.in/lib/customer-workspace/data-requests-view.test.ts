import { describe, expect, it } from "vitest";

import type { DataRequestRow } from "./data-requests-view";
import {
    openRequestFor,
    openRequestsText,
    readRequestFilter,
    requesterLabel,
    requestsHref,
    requestSub,
} from "./data-requests-view";

/** Customers › Requests' words and addresses (DEC-172, #1107). */

const ROW: DataRequestRow = {
    id: "cdr_1",
    kind: "REMOVAL",
    status: "OPEN",
    askedAt: "2026-10-19T06:00:00.000Z",
    handledAt: null,
    reason: null,
    contactId: "c1",
    name: "Asha Rao",
    email: "asha@example.com",
};

describe("the Requests tab's address", () => {
    it("opens on Open, the notice's own link", () => {
        expect(requestsHref()).toBe("/commerce/customers?tab=requests");
        expect(requestsHref("done")).toBe(
            "/commerce/customers?tab=requests&status=done",
        );
    });

    it("reads only a filter it knows, else Open", () => {
        expect(readRequestFilter("closed")).toBe("closed");
        expect(readRequestFilter("all")).toBe("all");
        expect(readRequestFilter("DONE")).toBe("open");
        expect(readRequestFilter(["done"])).toBe("open");
        expect(readRequestFilter(undefined)).toBe("open");
    });
});

describe("a row's words", () => {
    it("names them, else the email they asked from", () => {
        expect(requesterLabel(ROW)).toBe("Asha Rao");
        expect(requesterLabel({ ...ROW, name: "  " })).toBe("asha@example.com");
        expect(requesterLabel({ ...ROW, name: null, email: null })).toBe(
            "A customer",
        );
    });

    it("an open one says how to find them; an unlinked one says so", () => {
        expect(requestSub(ROW)).toBe("asha@example.com");
        expect(requestSub({ ...ROW, contactId: null })).toBe(
            "asha@example.com · Not linked to a customer yet. Find them by their email.",
        );
    });

    it("a closed one says why, a done one that it was done", () => {
        expect(
            requestSub({
                ...ROW,
                status: "CLOSED_WITHOUT_REMOVAL",
                reason: "Kept on request",
            }),
        ).toBe("Closed without removal: Kept on request");
        expect(requestSub({ ...ROW, status: "DONE" })).toBe(
            "Their details were removed.",
        );
    });
});

describe("the banners", () => {
    it("counts the open requests", () => {
        expect(openRequestsText(1)).toBe(
            "1 customer asked to remove their data",
        );
        expect(openRequestsText(3)).toBe(
            "3 customers asked to remove their data",
        );
    });

    it("finds this customer's open request, and only theirs", () => {
        const theirs = openRequestFor([ROW], "c1");
        expect(theirs?.id).toBe("cdr_1");
        expect(openRequestFor([ROW], "c2")).toBe(null);
        expect(openRequestFor([{ ...ROW, status: "DONE" }], "c1")).toBe(null);
        // Unread: no banner, rather than a wrong one.
        expect(openRequestFor(null, "c1")).toBe(null);
    });
});
