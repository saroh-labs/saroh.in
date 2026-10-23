import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
    actionLabel,
    actionWords,
    BILLING_ACTION_CODES,
    jobLabel,
    jobsHref,
} from "./billing-action-words";
import {
    eventHandled,
    eventWords,
    HANDLED_LABEL,
    hasEventWords,
} from "./billing-event-words";
import {
    invoicesExportHref,
    invoiceStatusHref,
    isNarrowed,
} from "./billing-filters";
import { invoiceStatus, readInvoiceStatus } from "./billing-words";

/** The API's list of codes, read from its source: the one place they live. */
function apiActionCodes(): string[] {
    const file = path.resolve(
        __dirname,
        "../../api.saroh.in/src/modules/billing/billing-actions.ts",
    );
    const source = readFileSync(file, "utf8");
    const list = /BILLING_ACTION_CODES = \[([\s\S]*?)\] as const/.exec(source);
    if (!list) throw new Error("BILLING_ACTION_CODES not found in the API");
    return [...list[1].matchAll(/"([a-z_]+)"/g)].map((m) => m[1]);
}

describe("every billing action code has words (R28)", () => {
    it("knows exactly the codes the API raises", () => {
        expect([...BILLING_ACTION_CODES]).toEqual(apiActionCodes());
    });

    it("gives each a title, one sentence and a fix of its own", () => {
        const unknown = actionWords("billing_something_new");
        for (const code of apiActionCodes()) {
            const words = actionWords(code);
            expect(words, code).not.toBe(unknown);
            expect(words.label.length, code).toBeGreaterThan(3);
            // One sentence: it ends once, with a full stop.
            expect(words.what, code).toMatch(/^[A-Z][^.]*\.$/);
            expect(words.fix.label.length, code).toBeGreaterThan(3);
        }
    });

    it("still has something to say for a code it doesn't know", () => {
        expect(actionLabel("billing_something_new")).toBe(
            "Billing needs a look",
        );
        expect(actionWords("billing_something_new").fix.kind).toBe(
            "subscription",
        );
    });

    it("says what a failed job was doing, and where it opens in Jobs", () => {
        expect(jobLabel("billing.email")).toBe("Send a billing email");
        expect(jobLabel("billing.something.new")).toBe("billing.something.new");
        expect(jobsHref("billing.email")).toBe(
            "/operations/jobs?status=FAILED&type=billing.email",
        );
    });
});

describe("provider events in words (R28)", () => {
    it("says what an event means", () => {
        expect(eventWords("subscription.charged")).toBe(
            "A plan's payment went through",
        );
        expect(eventWords("payment.dispute.lost")).toMatch(/lost a dispute/);
        expect(hasEventWords("refund.processed")).toBe(true);
    });

    it("falls back to the event's own code when it has no words", () => {
        expect(eventWords("subscription.teleported")).toBe(
            "subscription.teleported",
        );
        expect(hasEventWords("subscription.teleported")).toBe(false);
    });

    it("says whether Saroh handled it", () => {
        const org = { id: "o", name: "Rye", slug: "rye" };
        expect(
            eventHandled({
                processedAt: "2026-10-18T00:00:00Z",
                organization: org,
            }),
        ).toBe("handled");
        expect(eventHandled({ processedAt: null, organization: org })).toBe(
            "not-applied",
        );
        expect(eventHandled({ processedAt: null, organization: null })).toBe(
            "no-business",
        );
        expect(HANDLED_LABEL["not-applied"]).toBe("Not applied");
    });
});

describe("invoices: Paid, Unpaid, Refunded (R29)", () => {
    const row = {
        totalPaise: 11_800,
        providerAmountPaise: 11_800 as number | null,
        refunds: [] as { kind: string; status: string }[],
    };

    it("reads Unpaid when Razorpay took less than the total", () => {
        expect(invoiceStatus(row)).toBe("paid");
        expect(invoiceStatus({ ...row, providerAmountPaise: null })).toBe(
            "paid",
        );
        expect(invoiceStatus({ ...row, providerAmountPaise: 5_000 })).toBe(
            "unpaid",
        );
    });

    it("reads Refunded for a processed refund or a lost dispute, not a pending one", () => {
        const back = (kind: string, status: string) =>
            invoiceStatus({ ...row, refunds: [{ kind, status }] });
        expect(back("REFUND", "PROCESSED")).toBe("refunded");
        expect(back("DISPUTE", "LOST")).toBe("refunded");
        expect(back("REFUND", "PENDING")).toBe("paid");
        expect(back("DISPUTE", "WON")).toBe("paid");
    });

    it("takes only the statuses it knows from the address", () => {
        expect(readInvoiceStatus("unpaid")).toBe("unpaid");
        expect(readInvoiceStatus("overdue")).toBeUndefined();
    });

    it("the Unpaid chip narrows in place, and pressed again lets go", () => {
        const at = { month: "2026-10", gstin: "yes", page: "3" };
        const on = invoiceStatusHref("/billing/invoices", at, "unpaid");
        expect(on).toBe(
            "/billing/invoices?month=2026-10&gstin=yes&status=unpaid",
        );
        expect(
            invoiceStatusHref(
                "/billing/invoices",
                { month: "2026-10", status: "unpaid" },
                "unpaid",
            ),
        ).toBe("/billing/invoices?month=2026-10");
        expect(isNarrowed("invoices", { status: "refunded" })).toBe(true);
    });

    it("the export keeps every filter, and nothing about the page", () => {
        expect(
            invoicesExportHref({
                month: "2026-10",
                q: "rye",
                gstin: "no",
                status: "refunded",
                page: "2",
                open: "sub_1",
            }),
        ).toBe(
            "/billing/invoices/export?month=2026-10&q=rye&gstin=no&status=refunded",
        );
    });
});
