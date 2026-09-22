import { describe, expect, it } from "vitest";

import { billedTo, invoiceStatus, sourceLabel } from "./status";

const NOW = new Date("2026-09-22T10:00:00Z");
const day = (d: string) => `${d}T10:00:00.000Z`;

describe("invoiceStatus", () => {
    it("says Overdue for an issued invoice past its due date, with how long", () => {
        expect(
            invoiceStatus(
                { standing: "OVERDUE", dueAt: day("2026-09-19") },
                NOW,
            ),
        ).toEqual({
            label: "Overdue",
            variant: "error",
            detail: "3 days overdue",
        });
    });

    it("says when an issued invoice is due", () => {
        expect(
            invoiceStatus(
                { standing: "ISSUED", dueAt: day("2026-09-23") },
                NOW,
            ),
        ).toEqual({ label: "Issued", variant: "info", detail: "Due tomorrow" });
        expect(
            invoiceStatus({ standing: "ISSUED", dueAt: day("2026-09-22") }, NOW)
                .detail,
        ).toBe("Due today");
        expect(
            invoiceStatus({ standing: "ISSUED", dueAt: day("2026-09-29") }, NOW)
                .detail,
        ).toBe("Due in 7 days");
    });

    it("says Paid, Draft and Void plainly", () => {
        expect(
            invoiceStatus({ standing: "PAID", dueAt: null }, NOW).label,
        ).toBe("Paid");
        expect(invoiceStatus({ standing: "DRAFT", dueAt: null }, NOW)).toEqual({
            label: "Draft",
            variant: "neutral",
            detail: null,
        });
        expect(
            invoiceStatus({ standing: "VOID", dueAt: null }, NOW).label,
        ).toBe("Void");
    });

    it("says overdue by one day in the singular", () => {
        expect(
            invoiceStatus(
                { standing: "OVERDUE", dueAt: day("2026-09-21") },
                NOW,
            ).detail,
        ).toBe("1 day overdue");
    });
});

describe("billedTo", () => {
    it("reads the bill-to copied on issue, even after the contact is gone", () => {
        expect(
            billedTo({
                contact: null,
                billTo: { name: "Asha Rao", email: "asha@example.com" },
            }),
        ).toEqual({
            name: "Asha Rao",
            email: "asha@example.com",
            contactId: null,
        });
    });

    it("reads the contact on a draft, which has no bill-to yet", () => {
        expect(
            billedTo({
                contact: {
                    id: "c_1",
                    name: "Asha Rao",
                    email: "asha@example.com",
                },
                billTo: null,
            }),
        ).toEqual({
            name: "Asha Rao",
            email: "asha@example.com",
            contactId: "c_1",
        });
    });

    it("says so when there is nobody to bill", () => {
        expect(billedTo({ contact: null, billTo: null }).name).toBe(
            "No one chosen",
        );
    });
});

describe("sourceLabel", () => {
    it("names what an invoice is for", () => {
        expect(sourceLabel("SUBSCRIPTION")).toBe("Membership");
        expect(sourceLabel("PACK")).toBe("Class pack");
        expect(sourceLabel("COURSE")).toBe("Course");
        expect(sourceLabel("MANUAL")).toBe("Entered by hand");
    });
});

describe("forWhat and invoiceMoney", async () => {
    const { forWhat, invoiceMoney } = await import("./money");

    it("says what an invoice is for from its first line", () => {
        expect(
            forWhat({
                description: "Personal training",
                quantity: 4,
                lineCount: 1,
            }),
        ).toBe("Personal training × 4");
        expect(
            forWhat({
                description: "Personal training",
                quantity: 4,
                lineCount: 3,
            }),
        ).toBe("Personal training + 2 more");
        expect(forWhat(null)).toBe("No lines yet");
    });

    it("always shows two decimals", () => {
        expect(invoiceMoney("2400", "INR")).toBe("₹2,400.00");
        expect(invoiceMoney("396.5", "INR")).toBe("₹396.50");
    });
});
