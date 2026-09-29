import { describe, expect, it } from "vitest";

import type { OrderRead } from "./read";
import {
    printableRows,
    printTicketsLabel,
    readTicketIds,
    ticketAttention,
    ticketLine,
    ticketOrder,
    TICKETS_MAX,
    ticketsHref,
    ticketsSummary,
    ticketWho,
} from "./tickets";

/**
 * Bulk "Print tickets (N)" (plan B, B6): only orders with a ticket, oldest
 * first, and the paper never carries a sensitive Needs attention entry.
 */

function read(over: Partial<OrderRead> = {}): OrderRead {
    return {
        id: "o1",
        orderId: "1042",
        placedAt: "2026-09-27T09:00:00.000Z",
        ticketName: "Kitchen ticket",
        customer: null,
        walkIn: null,
        ...over,
    } as OrderRead;
}

describe("the bulk button", () => {
    it("counts only the selected orders that have a ticket", () => {
        const rows = [
            { id: "a", ticketName: "Kitchen ticket" },
            { id: "b", ticketName: null },
            { id: "c", ticketName: "Packing slip" },
        ];
        expect(printableRows(rows).map((r) => r.id)).toEqual(["a", "c"]);
        expect(printTicketsLabel(2)).toBe("Print tickets (2)");
    });

    it("opens the tickets page with the ids, each once", () => {
        expect(ticketsHref(["a", "b", "a"])).toBe(
            "/commerce/orders/tickets?ids=a,b",
        );
    });
});

describe("readTicketIds", () => {
    it("reads the ids back, each once, dropping anything that isn't an id", () => {
        expect(readTicketIds({ ids: "a1,b2,a1, c3 ,../x,<b>" })).toEqual([
            "a1",
            "b2",
            "c3",
        ]);
        expect(readTicketIds({})).toEqual([]);
        expect(readTicketIds({ ids: ["a1", "b2"] })).toEqual(["a1", "b2"]);
    });

    it("never asks for more than a page's worth", () => {
        const many = Array.from({ length: 80 }, (_, i) => `o${i}`).join(",");
        expect(readTicketIds({ ids: many })).toHaveLength(TICKETS_MAX);
    });
});

describe("ticketOrder", () => {
    it("prints oldest first, and leaves out a way of leaving with no ticket", () => {
        const newer = read({ id: "n", placedAt: "2026-09-27T12:00:00.000Z" });
        const older = read({ id: "o", placedAt: "2026-09-27T08:00:00.000Z" });
        const none = read({ id: "x", ticketName: null });
        expect(ticketOrder([newer, none, older]).map((o) => o.id)).toEqual([
            "o",
            "n",
        ]);
    });
});

describe("ticketAttention", () => {
    const entry = (over: Record<string, unknown>) => ({
        id: "e1",
        kind: "ALLERGY",
        label: "Sesame",
        detail: null,
        source: "STAFF",
        sensitive: false,
        allergen: null,
        matchAllergens: [],
        ...over,
    });

    it("carries what may go on paper, never a sensitive entry", () => {
        const got = ticketAttention({
            entries: [
                entry({}),
                entry({
                    id: "e2",
                    kind: "MEDICAL",
                    label: "Pregnant",
                    sensitive: true,
                }),
            ],
            hiddenSensitiveCount: 0,
        } as unknown as OrderRead["attention"]);
        expect(got).toEqual({ lines: ["Allergy: Sesame"], unchecked: false });
    });

    it("says it couldn't be checked when the API couldn't read it", () => {
        expect(ticketAttention(null)).toEqual({ lines: [], unchecked: true });
        expect(ticketAttention(undefined)).toEqual({
            lines: [],
            unchecked: false,
        });
    });
});

describe("a ticket's words", () => {
    it("writes a line as the design's slip does", () => {
        expect(
            ticketLine({ name: "Bun", variantTitle: "Large", quantity: 2 }),
        ).toBe("2 × Bun, Large");
        expect(ticketLine({ name: null, quantity: 1 })).toBe(
            "1 × A product that's gone",
        );
    });

    it("names who it's for", () => {
        expect(
            ticketWho(
                read({
                    customer: {
                        id: "c",
                        name: "Priya Raman",
                        phone: null,
                        contactId: null,
                        orderCount: 1,
                        firstOrderAt: null,
                    },
                }),
            ),
        ).toBe("Priya Raman");
        expect(ticketWho(read({ walkIn: { name: "Asha", phone: null } }))).toBe(
            "Walk-in · Asha",
        );
        expect(ticketWho(read())).toBe("Their record is gone");
    });

    it("says what it couldn't print", () => {
        expect(ticketsSummary({ printed: 3, noTicket: 0, failed: 0 })).toEqual({
            title: "3 tickets",
            notes: [],
        });
        expect(ticketsSummary({ printed: 1, noTicket: 1, failed: 2 })).toEqual({
            title: "1 ticket",
            notes: [
                "1 order has no ticket to print.",
                "2 orders couldn't be loaded. Print them from their own pages.",
            ],
        });
    });
});
