import { describe, expect, it } from "vitest";

import {
    asSentence,
    confirmMatches,
    deletedLine,
    deleteQuestion,
    heldCounts,
    holdingsSentence,
    removalBody,
    REMOVED_TOAST,
} from "./removal";
import type { RemovalPreview } from "./service";

const NOTHING: Pick<RemovalPreview, "goes" | "stays"> = {
    goes: {
        notes: 0,
        attention: 0,
        consents: 0,
        messages: 0,
        threadMessages: 0,
        storeRecords: 0,
        ordersScrubbed: 0,
        bookingsCancelled: 0,
        bookings: 0,
        reviews: 0,
        account: false,
        autopay: 0,
    },
    stays: {
        orders: 0,
        invoices: 0,
        leads: 0,
        submissions: 0,
        packs: 0,
        subscriptions: 0,
        courses: 0,
    },
};

function preview(
    goes: Partial<RemovalPreview["goes"]> = {},
    stays: Partial<RemovalPreview["stays"]> = {},
): Pick<RemovalPreview, "goes" | "stays"> {
    return {
        goes: { ...NOTHING.goes, ...goes },
        stays: { ...NOTHING.stays, ...stays },
    };
}

describe("removalBody (C11)", () => {
    it("says the design's two sentences for someone with orders", () => {
        expect(removalBody(preview({}, { orders: 6 }))).toBe(
            "Their name, email, phone and address are removed and cannot be brought back. Their 6 orders stay in Orders as “Removed customer”, so your totals and records stay right.",
        );
    });

    it("counts one order in the singular", () => {
        expect(removalBody(preview({}, { orders: 1 }))).toContain(
            "Their 1 order stays in Orders",
        );
    });

    it("leaves out the orders sentence for someone who never ordered", () => {
        expect(removalBody(preview())).toBe(
            "Their name, email, phone and address are removed and cannot be brought back.",
        );
    });

    it("says bookings to come are cancelled, and autopay first", () => {
        const body = removalBody(
            preview({ bookingsCancelled: 2, autopay: 1 }, { orders: 1 }),
        );
        expect(body).toContain("Their 2 bookings still to come are cancelled.");
        expect(body).toContain("Their autopay is cancelled first.");
    });

    it("says their leads and form entries stay (DEC-041)", () => {
        expect(
            removalBody(preview({}, { leads: 2, submissions: 1 })),
        ).toContain("Their 2 leads and 1 form entry stay as they are.");
        expect(removalBody(preview({}, { leads: 1 }))).toContain(
            "Their 1 lead stays as it is.",
        );
    });
});

describe("confirmMatches (type the name to confirm)", () => {
    it("needs the name as the page shows it", () => {
        expect(confirmMatches("Priya Raman", "Priya Raman")).toBe(true);
        expect(confirmMatches("  Priya   Raman ", "Priya Raman")).toBe(true);
        expect(confirmMatches("Priya", "Priya Raman")).toBe(false);
        expect(confirmMatches("priya raman", "Priya Raman")).toBe(false);
    });

    it("never matches an empty name", () => {
        expect(confirmMatches("", "")).toBe(false);
        expect(confirmMatches("   ", " ")).toBe(false);
    });
});

describe("the words around it", () => {
    it("toasts in the design's words", () => {
        expect(REMOVED_TOAST).toBe(
            "Details removed. Their orders stay in Orders.",
        );
    });

    it("ends an API sentence with a full stop, once", () => {
        expect(asSentence("Finish or cancel their open order first")).toBe(
            "Finish or cancel their open order first.",
        );
        expect(asSentence("Try again.")).toBe("Try again.");
    });
});

describe("holdingsSentence", () => {
    it("names the counts when all three are known", () => {
        expect(
            holdingsSentence({ subscriptions: 2, packs: 1, courses: 0 }),
        ).toBe(
            "Their 2 subscriptions and 1 class pack go too, and their bookings paid with a pack or for a course are cancelled. ",
        );
        expect(
            holdingsSentence({ subscriptions: 1, packs: 0, courses: 0 }),
        ).toBe("Their subscription goes too. ");
        expect(
            holdingsSentence({ subscriptions: 0, packs: 0, courses: 2 }),
        ).toBe(
            "Their 2 course seats go too, and their bookings paid with a pack or for a course are cancelled. ",
        );
    });

    it("says nothing when they hold nothing", () => {
        expect(
            holdingsSentence({ subscriptions: 0, packs: 0, courses: 0 }),
        ).toBe("");
    });

    it("stays general when a count is not known", () => {
        expect(holdingsSentence({ subscriptions: 2, packs: 1 })).toMatch(
            /^Any subscription, class pack or course seat they hold ends/,
        );
    });
});

describe("heldCounts — counted as the delete counts (#869)", () => {
    const now = new Date("2026-10-09T10:00:00Z");

    it("counts running or paused subscriptions, unexpired packs, held seats", () => {
        expect(
            heldCounts(
                {
                    subscriptions: [
                        { status: "ACTIVE" },
                        { status: "PAUSED" },
                        { status: "CANCELLED" },
                    ],
                    packs: [
                        { expiresAt: "2026-11-01T00:00:00Z" },
                        { expiresAt: "2026-10-01T00:00:00Z" },
                    ],
                    courses: [{ status: "ACTIVE" }, { status: "CANCELLED" }],
                },
                now,
            ),
        ).toEqual({ subscriptions: 2, packs: 1, courses: 1 });
    });

    it("leaves a kind that wasn't read, or failed, unknown", () => {
        expect(heldCounts({ subscriptions: null, packs: [] }, now)).toEqual({
            subscriptions: undefined,
            packs: 0,
            courses: undefined,
        });
    });
});

describe("deleteQuestion — the person page's delete confirm (#869)", () => {
    it("lists what deleting ends when every count is known", () => {
        expect(
            deleteQuestion(2, { subscriptions: 1, packs: 1, courses: 0 }),
        ).toBe(
            "Their notes and 2 leads go with them. Their 1 subscription and 1 class pack go too, and their bookings paid with a pack or for a course are cancelled. Orders, other bookings and invoices stay on record under the name they gave, and a location's record of a customer with the same email is kept. This cannot be undone.",
        );
    });

    it("says nothing they don't hold", () => {
        expect(
            deleteQuestion(0, { subscriptions: 0, packs: 0, courses: 0 }),
        ).toBe(
            "Their notes go with them. Orders, bookings and invoices stay on record under the name they gave, and a location's record of a customer with the same email is kept. This cannot be undone.",
        );
        expect(
            deleteQuestion(1, { subscriptions: 1, packs: 0, courses: 0 }),
        ).toMatch(
            /^Their notes and 1 lead go with them\. Their subscription goes too\. Orders, bookings and invoices/,
        );
    });

    it("stays a plain sentence when the counts couldn't be read", () => {
        const plain = deleteQuestion(null, {});
        expect(plain).toMatch(/^Their notes and any leads go with them\. /);
        expect(plain).toContain(
            "Any subscription, class pack or course seat they hold ends",
        );
        expect(plain).toMatch(/This cannot be undone\.$/);
        expect(plain).not.toMatch(/\d/);
    });
});

const base = {
    id: "c_1",
    deleted: true as const,
    leads: 0,
    subscriptions: 0,
    packs: 0,
    courses: 0,
    bookingsCancelled: 0,
};

describe("deletedLine", () => {
    it("says only the name when nothing went with them", () => {
        expect(deletedLine("Asha Rao", base)).toBe("Asha Rao deleted");
    });

    it("names what went with them", () => {
        expect(deletedLine("Asha Rao", { ...base, leads: 2 })).toBe(
            "Asha Rao deleted, with 2 leads",
        );
        expect(
            deletedLine("Asha Rao", {
                ...base,
                leads: 2,
                subscriptions: 1,
                packs: 1,
            }),
        ).toBe(
            "Asha Rao deleted, with 2 leads, 1 subscription and 1 class pack",
        );
    });

    it("says which bookings were cancelled", () => {
        expect(
            deletedLine("Asha Rao", {
                ...base,
                packs: 1,
                courses: 1,
                bookingsCancelled: 2,
            }),
        ).toBe(
            "Asha Rao deleted, with 1 class pack and 1 course. 2 bookings still to come were cancelled",
        );
    });
});
