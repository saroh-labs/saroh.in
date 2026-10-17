import { eventRefs } from "../../admin/admin-billing-actions.service";
import { PROVIDER_ID } from "../../admin/admin-billing.service";
import {
    razorpayPaidCharges,
    razorpayRefundOrDispute,
} from "./razorpay-reconcile";

/** A GET that answers `body` and remembers the path. */
function answering(body: unknown) {
    const paths: string[] = [];
    const get = (_what: string, path: string) => {
        paths.push(path);
        return Promise.resolve(new Response(JSON.stringify(body)));
    };
    return { get, paths };
}

describe("razorpayPaidCharges (DEC-166)", () => {
    it("reads a subscription's paid invoices: payment, amount paid, when", async () => {
        const { get, paths } = answering({
            items: [
                {
                    status: "paid",
                    payment_id: "pay_A1",
                    amount_paid: 118_000,
                    amount: 118_000,
                    paid_at: 1_792_000_000,
                },
                { status: "issued", payment_id: null, amount: 118_000 },
                { status: "paid", payment_id: null, amount_paid: 5 },
            ],
        });
        await expect(
            razorpayPaidCharges(get, "sub_X1", false),
        ).resolves.toEqual([
            {
                providerPaymentId: "pay_A1",
                amountPaise: 118_000,
                paidAt: new Date(1_792_000_000 * 1000),
            },
        ]);
        expect(paths).toEqual(["/invoices?subscription_id=sub_X1&count=100"]);
    });

    it("reads an order's captured payments", async () => {
        const { get, paths } = answering({
            items: [
                { id: "pay_O1", status: "captured", amount: 50_000 },
                { id: "pay_O2", status: "failed", amount: 50_000 },
            ],
        });
        await expect(
            razorpayPaidCharges(get, "order_X1", true),
        ).resolves.toEqual([
            { providerPaymentId: "pay_O1", amountPaise: 50_000, paidAt: null },
        ]);
        expect(paths).toEqual(["/orders/order_X1/payments"]);
    });
});

describe("razorpayRefundOrDispute (DEC-166)", () => {
    it("reads a refund's id, payment, amount and status", () => {
        expect(
            razorpayRefundOrDispute("refund.processed", {
                payload: {
                    refund: {
                        entity: {
                            id: "rfnd_R1",
                            payment_id: "pay_P1",
                            amount: 2_000,
                            status: "processed",
                        },
                    },
                },
            }),
        ).toEqual({
            refund: {
                providerRefundId: "rfnd_R1",
                providerPaymentId: "pay_P1",
                amountPaise: 2_000,
                status: "PROCESSED",
            },
        });
    });

    it("takes the status from the event's name when the refund doesn't say", () => {
        expect(
            razorpayRefundOrDispute("refund.failed", {
                payload: {
                    refund: { entity: { id: "rfnd_R2", payment_id: "pay_P2" } },
                },
            }).refund?.status,
        ).toBe("FAILED");
    });

    it("reads a dispute, opened as OPEN", () => {
        expect(
            razorpayRefundOrDispute("payment.dispute.created", {
                payload: {
                    dispute: {
                        entity: {
                            id: "disp_D1",
                            payment_id: "pay_P3",
                            amount: 9_000,
                            reason_code: "fraud",
                        },
                    },
                },
            }),
        ).toEqual({
            dispute: {
                providerDisputeId: "disp_D1",
                providerPaymentId: "pay_P3",
                amountPaise: 9_000,
                status: "OPEN",
                reason: "fraud",
            },
        });
    });

    it("reads nothing from another event, or one missing its ids", () => {
        expect(razorpayRefundOrDispute("subscription.charged", {})).toEqual({});
        expect(
            razorpayRefundOrDispute("refund.created", {
                payload: { refund: { entity: { id: "rfnd_R3" } } },
            }),
        ).toEqual({});
    });
});

describe("admin search and event ids (DEC-166)", () => {
    it("knows a Razorpay id from a business's name", () => {
        for (const id of [
            "pay_Abc123",
            "sub_Abc123",
            "cust_Abc123",
            "order_Abc123",
        ]) {
            expect(PROVIDER_ID.test(id)).toBe(true);
        }
        for (const q of ["Example Studio", "pay_", "sub nothing", "payments"]) {
            expect(PROVIDER_ID.test(q)).toBe(false);
        }
    });

    it("lists an event's provider ids and never its payload", () => {
        const refs = eventRefs({
            payload: {
                subscription: {
                    entity: { id: "sub_S1", customer_id: "cust_C1" },
                },
                payment: {
                    entity: { id: "pay_P1", email: "someone@example.com" },
                },
            },
        });
        expect(refs).toEqual({
            subscription: "sub_S1",
            payment: "pay_P1",
            customer: "cust_C1",
        });
        expect(JSON.stringify(refs)).not.toContain("example.com");
    });
});
