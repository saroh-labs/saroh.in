import { describe, expect, it } from "vitest";

import type { ClosingRefundRow, ClosingView } from "./closing";
import { closingBanner } from "./closing";

const NOW = new Date("2026-10-20T00:00:00.000Z");
const LATER = "2026-11-08T00:00:00.000Z";
const EARLIER = "2026-10-10T00:00:00.000Z";

const refund = (extra: Partial<ClosingRefundRow> = {}): ClosingRefundRow => ({
    key: "refund:r1",
    stage: "CONFIRMING",
    amountMinor: 50_000,
    currency: "INR",
    customer: "Asha Rao",
    paper: { label: "#1042", href: "/commerce/orders/ord_1" },
    provider: "RAZORPAY",
    providerRef: "rfnd_1",
    ...extra,
});

function view(
    closing: Partial<NonNullable<ClosingView["closing"]>> = {},
): ClosingView {
    return {
        closing: {
            deletesOn: LATER,
            refunds: { rows: [], count: 0, hidden: 0 },
            memberships: { byProvider: [], rows: [] },
            ...closing,
        },
    };
}

describe("closingBanner (#921)", () => {
    it("says nothing for a business that isn't closing, or an unread notice", () => {
        expect(closingBanner({ closing: null }, NOW)).toBeNull();
        expect(closingBanner(null, NOW)).toBeNull();
    });

    it("says when, and what still works", () => {
        const b = closingBanner(view(), NOW);
        expect(b?.title).toBe("This business will be deleted");
        expect(b?.deletesOn).toBe(LATER);
        expect(b?.body).toMatch(/nothing new can start/);
        expect(b?.refunds).toBeNull();
        expect(b?.memberships).toBeNull();
    });

    it("says it winds down: what is finished, never started (DEC-120)", () => {
        const b = closingBanner(view(), NOW);
        expect(b?.body).toMatch(/finish, cancel and refund/);
        // An older API, or anyone but an owner: no data link, no warning.
        expect(b?.data).toBeNull();
        expect(b?.refundInDashboard).toBeNull();
    });

    it("offers an owner their data, and says where to refund once the keys are gone", () => {
        const b = closingBanner(
            view({ canDownloadData: true, refundsOnline: false }),
            NOW,
        );
        expect(b?.data).toEqual({
            label: "Download your data",
            href: "/settings/data",
        });
        expect(b?.refundInDashboard).toMatch(
            /Refund each customer in your provider's dashboard/,
        );
        expect(
            closingBanner(view({ refundsOnline: true }), NOW)
                ?.refundInDashboard,
        ).toBeNull();
    });

    it("lists the refunds in the owner's words, each linked, with its reference", () => {
        const b = closingBanner(
            view({
                refunds: {
                    rows: [
                        refund(),
                        refund({
                            key: "intent:pi_2",
                            stage: "OWED",
                            customer: null,
                            paper: {
                                label: "INV-7",
                                href: "/billing/invoices/inv_7",
                            },
                            providerRef: "pay_2",
                        }),
                    ],
                    count: 2,
                    hidden: 0,
                },
            }),
            NOW,
        );
        expect(b?.refunds?.intro).toBe(
            "These refunds haven't gone back to your customers yet. Finish each one, and check it in your Razorpay dashboard.",
        );
        const first = b?.refunds?.lines[0];
        expect(first).toMatchObject({
            key: "refund:r1",
            label: "#1042",
            href: "/commerce/orders/ord_1",
            reference: "rfnd_1",
        });
        expect(first?.detail).toMatch(
            /^Asha Rao · .*500 · sent, not confirmed yet$/,
        );
        expect(b?.refunds?.lines[1]?.href).toBe("/billing/invoices/inv_7");
        expect(b?.refunds?.more).toBeNull();
    });

    it("names no one provider when the refunds are on several", () => {
        const b = closingBanner(
            view({
                refunds: {
                    rows: [
                        refund(),
                        refund({ key: "k2", provider: "CASHFREE" }),
                    ],
                    count: 2,
                    hidden: 0,
                },
            }),
            NOW,
        );
        expect(b?.refunds?.intro).toMatch(
            /check it in your payment provider's dashboard\.$/,
        );
    });

    it("says how many it can't show, rather than hide them", () => {
        const b = closingBanner(
            view({ refunds: { rows: [], count: 2, hidden: 2 } }),
            NOW,
        );
        expect(b?.refunds?.lines).toEqual([]);
        expect(b?.refunds?.more).toBe(
            "2 refunds on orders or invoices an owner or admin can see.",
        );
    });

    it("past its date, says it waits for the refunds", () => {
        const b = closingBanner(
            view({
                deletesOn: EARLIER,
                refunds: { rows: [refund()], count: 1, hidden: 0 },
            }),
            NOW,
        );
        expect(b?.title).toBe(
            "This business will be deleted once its customers' refunds are finished",
        );
        expect(b?.deletesOn).toBeNull();
    });

    it("warns that autopay memberships aren't cancelled at the provider, with the list", () => {
        const b = closingBanner(
            view({
                memberships: {
                    byProvider: [
                        { provider: "RAZORPAY", active: 2 },
                        { provider: "CASHFREE", active: 0 },
                    ],
                    rows: [
                        {
                            subscriptionId: "sub_1",
                            customer: "Ravi",
                            plan: "Monthly yoga",
                            provider: "RAZORPAY",
                            href: "/billing/subscriptions/sub_1",
                        },
                    ],
                },
            }),
            NOW,
        );
        expect(b?.memberships?.warnings).toEqual([
            "Deleting the business stops Saroh syncing with Razorpay. It doesn't cancel your customers' autopay memberships there — 2 are active. Cancel them in your Razorpay dashboard if you want them stopped.",
        ]);
        expect(b?.memberships?.lines).toEqual([
            {
                key: "sub_1",
                label: "Ravi · Monthly yoga",
                href: "/billing/subscriptions/sub_1",
            },
        ]);
    });
});
