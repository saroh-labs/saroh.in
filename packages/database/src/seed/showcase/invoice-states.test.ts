import { describe, expect, it } from "vitest";

import type { PlanInput } from "./bakery";
import { planWorld } from "./bakery";
import { PRODUCTS } from "./bakery-catalogue";
import { SHELVES } from "./bakery-stock";
import type { LedgerSpec } from "./invoice-states";
import {
    addTrailRows,
    emptyTrailRows,
    ledgerColumns,
    RYE_COLOUR,
    settleLedger,
} from "./invoice-states";

/**
 * The invoice states the showcase plans (DEC-173, #1129): the settle rules
 * mirror the API's, and Rye's trade invoices show every state the rebuilt
 * screens draw, on any day the seed is run.
 */

const DAY = 86_400_000;
const at = (iso: string) => new Date(iso);

const pay = (
    amountPaise: number,
    receivedAt: string,
    extra: Partial<LedgerSpec> = {},
): LedgerSpec => ({
    amountPaise,
    method: "CASH",
    receivedAt: at(receivedAt),
    recordedById: "owner",
    ...extra,
});

describe("settleLedger", () => {
    it("is partly paid below the total, and paid at the last payment once it reaches it", () => {
        const part = [pay(100_000, "2026-10-01T10:00:00Z")];
        expect(settleLedger(250_000, part)).toMatchObject({
            paidCents: 100_000,
            paid: false,
        });
        const all = [
            ...part,
            pay(150_000, "2026-10-05T10:00:00Z", { method: "UPI" }),
        ];
        const settled = settleLedger(250_000, all);
        expect(settled.paid).toBe(true);
        expect(settled.last?.method).toBe("UPI");
    });

    it("counts a waiting cheque as received and a bounced one not at all", () => {
        const waiting = pay(840_000, "2026-10-01T10:00:00Z", {
            method: "CHEQUE",
            cheque: { number: "004512", bank: "HDFC Bank", status: "WAITING" },
        });
        expect(settleLedger(840_000, [waiting]).paid).toBe(true);
        const bounced: LedgerSpec = {
            ...waiting,
            cheque: {
                number: "004512",
                bank: "HDFC Bank",
                status: "BOUNCED",
                settledAt: at("2026-10-03T10:00:00Z"),
            },
        };
        expect(settleLedger(840_000, [bounced])).toMatchObject({
            paidCents: 0,
            paid: false,
            last: null,
        });
    });

    it("never settles a ₹0 invoice", () => {
        expect(settleLedger(0, []).paid).toBe(false);
    });
});

describe("ledgerColumns", () => {
    it("leaves the paid columns empty while it is owed", () => {
        expect(
            ledgerColumns("inv", 250_000, [
                pay(100_000, "2026-10-01T10:00:00Z"),
            ]),
        ).toEqual({
            status: "ISSUED",
            paidCents: 100_000,
            paidAt: null,
            paymentMethod: null,
            paymentReference: null,
            paymentNote: null,
        });
    });

    it("refuses more than the total, as the API does", () => {
        expect(() =>
            ledgerColumns("inv", 100_000, [
                pay(100_100, "2026-10-01T10:00:00Z"),
            ]),
        ).toThrow(/more than its total/);
    });
});

describe("addTrailRows", () => {
    it("writes a cheque's bank status, the share log and the emails on seeded ids", () => {
        const rows = emptyTrailRows();
        addTrailRows(rows, {
            orgId: "org",
            invoiceId: "inv",
            currency: "INR",
            number: "RC/26-27/0001",
            business: "Rye & Co.",
            to: {
                name: "Vivek Nair",
                email: "brewlane@example.com",
                contactId: "c",
            },
            idFor: (...parts) => `inv_${parts.join("_")}`,
            trail: {
                ledger: [
                    pay(420_000, "2026-10-01T10:00:00Z", {
                        method: "CHEQUE",
                        cheque: {
                            number: "220871",
                            bank: "State Bank of India",
                            status: "BOUNCED",
                            settledAt: at("2026-10-04T10:00:00Z"),
                            reason: "Insufficient funds",
                        },
                    }),
                ],
                shares: [
                    {
                        channel: "WHATSAPP",
                        kind: "REMINDER",
                        at: at("2026-10-06T10:00:00Z"),
                        byUserId: "owner",
                    },
                ],
                emails: [
                    {
                        template: "INVOICE_REMINDER",
                        at: at("2026-10-05T10:00:00Z"),
                        byUserId: null,
                    },
                ],
            },
        });
        expect(rows.payments[0]).toMatchObject({
            id: "inv_payment_0",
            bankStatus: "BOUNCED",
            bouncedAt: at("2026-10-04T10:00:00Z"),
            clearedAt: null,
            bounceReason: "Insufficient funds",
        });
        expect(rows.shares[0]).toMatchObject({
            id: "inv_share_0",
            channel: "WHATSAPP",
            kind: "REMINDER",
        });
        expect(rows.messages[0]).toMatchObject({
            id: "inv_message_0",
            template: "INVOICE_REMINDER",
            toAddress: "brewlane@example.com",
            status: "SENT",
        });
    });
});

const input = (now: Date): PlanInput => ({
    now,
    orgId: "org",
    stores: { H: "store-h", O: "store-o" },
    demoUserId: "owner",
    counterUserId: "nisha",
    productIds: PRODUCTS.map((_, i) => `product-${i}`),
    variantIds: PRODUCTS.map((p, i) =>
        (p.variants ?? []).map((_, v) => `product-${i}-variant-${v}`),
    ),
    shelfIds: new Map(SHELVES.map((s) => [s.key, `shelf-${s.key}`])),
    planIds: ["plan-0", "plan-1", "plan-2"],
    allergenId: { Sesame: "allergen-sesame" },
});

describe("Rye's trade invoices on any day", () => {
    const start = Date.parse("2026-10-20T00:00:30+05:30");
    const nows = Array.from(
        { length: 12 },
        (_, k) => new Date(start + k * (DAY / 3) + k * 7 * DAY),
    );

    it.each(nows.map((now) => [now.toISOString(), now] as const))(
        "at %s every trail falls after issue and before now",
        (_label, now) => {
            const docs = planWorld(input(now)).docs.filter((d) =>
                d.id.includes("trade"),
            );
            for (const d of docs) {
                const issued = d.issuedAt?.getTime() ?? Infinity;
                const times = [
                    ...(d.trail?.ledger ?? []).flatMap((p) => [
                        p.receivedAt,
                        ...(p.cheque?.settledAt ? [p.cheque.settledAt] : []),
                    ]),
                    ...(d.trail?.shares ?? []).map((s) => s.at),
                    ...(d.trail?.emails ?? []).map((e) => e.at),
                ];
                for (const t of times) {
                    expect(t.getTime(), d.id).toBeGreaterThanOrEqual(issued);
                    expect(t.getTime(), d.id).toBeLessThanOrEqual(
                        now.getTime(),
                    );
                }
                for (const p of d.trail?.ledger ?? []) {
                    if (p.cheque?.settledAt) {
                        expect(p.cheque.settledAt >= p.receivedAt, d.id).toBe(
                            true,
                        );
                    }
                }
            }
            // A rewrite comes after the credit note that cancelled its
            // first paper.
            const credit = docs.find((d) => d.kind === "CREDIT_NOTE");
            const rewrite = docs.find((d) => d.reissuedFromId);
            expect(credit?.issuedAt).toBeTruthy();
            expect(
                (rewrite?.createdAt.getTime() ?? 0) >
                    (credit?.issuedAt?.getTime() ?? Infinity),
            ).toBe(true);
        },
    );

    it("plans part paid, two cheques waiting, a bounce, a credit and each style", () => {
        const now = new Date(start);
        const docs = planWorld(input(now)).docs.filter((d) =>
            d.id.includes("trade"),
        );
        const cheques = docs.flatMap((d) =>
            (d.trail?.ledger ?? []).filter((p) => p.cheque),
        );
        expect(
            cheques
                .filter((p) => p.cheque?.status === "WAITING")
                .map((p) => p.amountPaise / 100)
                .sort((a, b) => a - b),
        ).toEqual([5_600, 8_400]);
        expect(cheques.some((p) => p.cheque?.status === "BOUNCED")).toBe(true);
        expect(cheques.some((p) => p.cheque?.status === "CLEARED")).toBe(true);
        expect(docs.some((d) => d.status === "CREDITED")).toBe(true);
        expect(
            new Set(docs.flatMap((d) => (d.paper ? [d.paper.style] : []))),
        ).toEqual(new Set(["CLASSIC", "BAND", "COMPACT"]));
        expect(
            docs
                .filter((d) => d.paper)
                .every((d) => d.paper?.colour === RYE_COLOUR),
        ).toBe(true);
    });
});
