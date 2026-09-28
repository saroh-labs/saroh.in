import { afterEach, describe, expect, it, vi } from "vitest";

import type { PaymentHandoff } from "./api";
import type { CheckoutRequest } from "./checkout";
import { openProviderCheckout, RAZORPAY_SDK } from "./checkout";

/**
 * The provider's window (E11), against stand-ins for the providers' browser
 * SDKs: what it is opened with — the handoff's order, the business's public
 * key, no payment methods of Saroh's choosing (DEC-059), never an amount of
 * the page's — and how each way it can end is read.
 */

type Options = Record<string, unknown> & {
    handler: () => void;
    modal: { ondismiss: () => void };
};

let razorpay: {
    options: Options;
    opened: number;
    closed: number;
    failed?: (r: unknown) => void;
}[];

function fakeRazorpay() {
    razorpay = [];
    const Razorpay = vi.fn(function (this: unknown, options: Options) {
        const made: (typeof razorpay)[number] = {
            options,
            opened: 0,
            closed: 0,
        };
        razorpay.push(made);
        return {
            open: () => void made.opened++,
            close: () => void made.closed++,
            on: (_event: string, handler: (r: unknown) => void) => {
                made.failed = handler;
            },
        };
    });
    (window as unknown as { Razorpay: unknown }).Razorpay = Razorpay;
}

const handoff = (over: Partial<PaymentHandoff> = {}): PaymentHandoff => ({
    provider: "RAZORPAY",
    amountCents: 120_000,
    currency: "INR",
    providerIntentId: "order_1",
    publicKey: "rzp_live_public",
    clientParams: { razorpayOrderId: "order_1", amount: 120_000 },
    ...over,
});

const request = (over: Partial<PaymentHandoff> = {}): CheckoutRequest => ({
    handoff: handoff(over),
    business: "Kavi Dental",
    description: "Check-up · Sun 20 Sep at 07:00",
    booker: {
        name: "Asha Rao",
        email: "asha@example.in",
        phone: "98450 12345",
    },
});

const flush = () => new Promise((r) => setTimeout(r, 0));

afterEach(() => {
    delete (window as unknown as { Razorpay?: unknown }).Razorpay;
    delete (window as unknown as { Cashfree?: unknown }).Cashfree;
    document.head.querySelectorAll("script").forEach((s) => s.remove());
});

describe("the provider's window (E11)", () => {
    it("opens Razorpay on the handoff's order with the public key, and the methods the account has on", async () => {
        fakeRazorpay();
        openProviderCheckout(request());
        await flush();

        expect(razorpay).toHaveLength(1);
        const made = razorpay[0];
        expect(made.opened).toBe(1);
        expect(made.options).toMatchObject({
            key: "rzp_live_public",
            order_id: "order_1",
            amount: 120_000,
            currency: "INR",
            name: "Kavi Dental",
            prefill: {
                name: "Asha Rao",
                email: "asha@example.in",
                contact: "98450 12345",
            },
            retry: { enabled: false },
        });
        // Saroh doesn't choose or restrict the methods (DEC-059): no
        // display config, so the window shows what the account has on.
        expect(made.options).not.toHaveProperty("config");
        expect(made.options).not.toHaveProperty("method");
    });

    it("reads a payment, a refusal and a dismissal — and only the first answer", async () => {
        fakeRazorpay();
        const paid = openProviderCheckout(request());
        await flush();
        razorpay[0]?.options.handler();
        razorpay[0]?.options.modal.ondismiss();
        await expect(paid.outcome).resolves.toBe("paid");

        const refused = openProviderCheckout(request());
        await flush();
        razorpay[1]?.failed?.({ error: { code: "BAD_REQUEST_ERROR" } });
        await expect(refused.outcome).resolves.toBe("failed");
        // A refusal shuts the window; the page offers another try.
        expect(razorpay[1]?.closed).toBe(1);

        const closed = openProviderCheckout(request());
        await flush();
        razorpay[2]?.options.modal.ondismiss();
        await expect(closed.outcome).resolves.toBe("closed");
    });

    it("closes the window when the page moves on, and says nothing after", async () => {
        fakeRazorpay();
        const session = openProviderCheckout(request());
        await flush();
        session.close();
        razorpay[0]?.options.handler();
        expect(razorpay[0]?.closed).toBe(1);
        const settled = await Promise.race([
            session.outcome,
            flush().then(() => "pending"),
        ]);
        expect(settled).toBe("pending");
    });

    it("can't open without the business's public key or an order", async () => {
        fakeRazorpay();
        await expect(
            openProviderCheckout(request({ publicKey: null })).outcome,
        ).resolves.toBe("unavailable");
        await expect(
            openProviderCheckout(
                request({ providerIntentId: null, clientParams: {} }),
            ).outcome,
        ).resolves.toBe("unavailable");
        await expect(
            openProviderCheckout(request({ provider: "STRIPE" })).outcome,
        ).resolves.toBe("unavailable");
        expect(razorpay).toHaveLength(0);
    });

    it("loads Razorpay's script when the page doesn't have it, and says so when it can't", async () => {
        const session = openProviderCheckout(request());
        const script = document.head.querySelector<HTMLScriptElement>(
            `script[src="${RAZORPAY_SDK}"]`,
        );
        expect(script).not.toBeNull();
        script?.onerror?.(new Event("error"));
        await expect(session.outcome).resolves.toBe("unavailable");
        // The failed script is gone, so another try loads it again.
        expect(
            document.head.querySelector(`script[src="${RAZORPAY_SDK}"]`),
        ).toBeNull();
    });

    it("opens Cashfree's drop-in on its payment session", async () => {
        const checkout = vi.fn(() =>
            Promise.resolve({ paymentDetails: { paymentMessage: "ok" } }),
        );
        const Cashfree = vi.fn(() => ({ checkout }));
        (window as unknown as { Cashfree: unknown }).Cashfree = Cashfree;

        const session = openProviderCheckout(
            request({
                provider: "CASHFREE",
                publicKey: null,
                clientParams: { paymentSessionId: "session_1" },
            }),
        );
        await expect(session.outcome).resolves.toBe("paid");
        expect(Cashfree).toHaveBeenCalledWith({ mode: "production" });
        expect(checkout).toHaveBeenCalledWith({
            paymentSessionId: "session_1",
            redirectTarget: "_modal",
        });
    });

    it("tells Cashfree's closed window from its refused payment", async () => {
        let answer: unknown = {
            error: { message: "Payment failed: declined by bank" },
        };
        (window as unknown as { Cashfree: unknown }).Cashfree = () => ({
            checkout: () => Promise.resolve(answer),
        });
        const cashfree = () =>
            openProviderCheckout(
                request({
                    provider: "CASHFREE",
                    clientParams: { paymentSessionId: "session_1" },
                }),
            ).outcome;

        await expect(cashfree()).resolves.toBe("failed");
        answer = { error: { message: "User closed the popup" } };
        await expect(cashfree()).resolves.toBe("closed");
        await expect(
            openProviderCheckout(
                request({ provider: "CASHFREE", clientParams: {} }),
            ).outcome,
        ).resolves.toBe("unavailable");
    });
});
