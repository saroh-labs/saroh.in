import { describe, expect, it, vi } from "vitest";

const getJson = vi.fn(() => Promise.resolve(null));
const adminFetch = vi.fn(() => Promise.resolve(new Response("")));
vi.mock("./control-plane", () => ({ getJson, adminFetch }));

const { listBillingActions, listProviderEvents, listSarohSubscriptions } =
    await import("./billing");
const {
    actionLabel,
    canEndAutopay,
    canRecheckRefund,
    razorpayDashboardUrl,
    readActionState,
    readEventFilter,
    refundSourceLabel,
    refundStatusLabel,
    rupeesToPaise,
} = await import("./billing-action-words");
const { refundedPaise } = await import("./billing-words");

describe("razorpayDashboardUrl", () => {
    it("opens each kind of Razorpay id in its dashboard section", () => {
        expect(razorpayDashboardUrl("pay_Abc123XYZ")).toBe(
            "https://dashboard.razorpay.com/app/payments/pay_Abc123XYZ",
        );
        expect(razorpayDashboardUrl("sub_Abc123XYZ")).toBe(
            "https://dashboard.razorpay.com/app/subscriptions/sub_Abc123XYZ",
        );
        expect(razorpayDashboardUrl("cust_Abc123XYZ")).toBe(
            "https://dashboard.razorpay.com/app/customers/cust_Abc123XYZ",
        );
        expect(razorpayDashboardUrl("order_Abc123XYZ")).toBe(
            "https://dashboard.razorpay.com/app/orders/order_Abc123XYZ",
        );
        expect(razorpayDashboardUrl("rfnd_Abc123XYZ")).toBe(
            "https://dashboard.razorpay.com/app/refunds/rfnd_Abc123XYZ",
        );
    });

    it("links nothing that isn't a Razorpay id", () => {
        for (const id of [
            null,
            undefined,
            "",
            "evt_123456",
            "ckabc123",
            "pay_",
            "pay_x/../../etc",
            "SRH/26-27/00001",
        ]) {
            expect(razorpayDashboardUrl(id)).toBeNull();
        }
        expect(razorpayDashboardUrl("pay_Abc123XYZ", "CASHFREE")).toBeNull();
        expect(
            razorpayDashboardUrl("pay_Abc123XYZ", "razorpay"),
        ).not.toBeNull();
    });
});

describe("rupeesToPaise", () => {
    it("reads rupees as an operator types them", () => {
        expect(rupeesToPaise("1180")).toBe(118_000);
        expect(rupeesToPaise("1,180.5")).toBe(118_050);
        expect(rupeesToPaise(" ₹99.05 ")).toBe(9_905);
        expect(rupeesToPaise("0.01")).toBe(1);
    });

    it("refuses anything that isn't a positive amount in paise", () => {
        for (const bad of [
            undefined,
            "",
            "0",
            "0.00",
            "-5",
            "1.234",
            "abc",
            "1e3",
        ]) {
            expect(rupeesToPaise(bad)).toBeNull();
        }
    });
});

describe("words", () => {
    it("names every action code the API raises, and something for a new one", () => {
        expect(actionLabel("billing_double_charge_refund_given_up")).toBe(
            "Refund a double charge by hand",
        );
        expect(actionLabel("billing_credit_note_may_be_needed")).toBe(
            "Credit note may be needed",
        );
        expect(actionLabel("billing_profile_owner_left")).toBe(
            "Billed to someone no longer an owner",
        );
        expect(actionLabel("billing_something_new")).toBe(
            "Billing needs a look",
        );
    });

    it("offers a refund re-check only on a double charge with its payment", () => {
        expect(
            canRecheckRefund({
                code: "billing_double_charge_refund_given_up",
                refs: { payment: "pay_1" },
            }),
        ).toBe(true);
        expect(
            canRecheckRefund({
                code: "billing_double_charge_refund_owed",
                refs: {},
            }),
        ).toBe(false);
        expect(
            canRecheckRefund({
                code: "billing_refund_failed",
                refs: { payment: "pay_1" },
            }),
        ).toBe(false);
    });

    it("says refund and dispute states and who recorded them", () => {
        expect(refundStatusLabel("PROCESSED")).toBe("Refunded");
        expect(refundStatusLabel("ACTION_REQUIRED")).toBe(
            "Dispute needs an answer",
        );
        expect(refundSourceLabel("MANUAL")).toBe("recorded by an operator");
    });

    it("offers End autopay only on a live provider subscription not already ending", () => {
        const live = {
            provider: "RAZORPAY",
            providerSubscriptionId: "sub_1",
            status: "ACTIVE",
            freeChosenAt: null,
        };
        expect(canEndAutopay(live)).toBe(true);
        expect(canEndAutopay({ ...live, provider: null })).toBe(false);
        expect(canEndAutopay({ ...live, status: "CANCELLED" })).toBe(false);
        expect(
            canEndAutopay({ ...live, freeChosenAt: "2026-10-17T00:00:00Z" }),
        ).toBe(false);
    });

    it("counts what was given back, never a failed refund or a dispute", () => {
        expect(
            refundedPaise({
                refunds: [
                    { kind: "REFUND", status: "PROCESSED", amountPaise: 500 },
                    { kind: "REFUND", status: "PENDING", amountPaise: 200 },
                    { kind: "REFUND", status: "FAILED", amountPaise: 900 },
                    { kind: "DISPUTE", status: "LOST", amountPaise: 900 },
                    { kind: "REFUND", status: "PROCESSED", amountPaise: null },
                ],
            }),
        ).toBe(700);
    });
});

describe("reading the query string", () => {
    it("is open unless resolved is asked for", () => {
        expect(readActionState(undefined)).toBe("open");
        expect(readActionState("resolved")).toBe("resolved");
        expect(readActionState("all")).toBe("open");
    });

    it("takes only the event filters it knows", () => {
        expect(readEventFilter("not-applied")).toBe("not-applied");
        expect(readEventFilter("no-business")).toBe("no-business");
        expect(readEventFilter("failed")).toBeUndefined();
    });
});

describe("the reads", () => {
    it("asks the API for the queue, the events and a search", async () => {
        await listBillingActions({ state: "resolved", page: 2 });
        await listProviderEvents({ filter: "no-business" });
        await listSarohSubscriptions({ q: "sub_Abc123" });
        expect(getJson).toHaveBeenCalledWith(
            "/billing/actions?state=resolved&page=2",
        );
        expect(getJson).toHaveBeenCalledWith(
            "/billing/events?filter=no-business",
        );
        expect(getJson).toHaveBeenCalledWith(
            "/billing/subscriptions?q=sub_Abc123",
        );
    });
});
