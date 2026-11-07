import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PaymentHandoff } from "./api";
import type { CheckoutRequest } from "./checkout";
import {
    cappedRadius,
    openProviderCheckout,
    postCheckoutReturn,
    RAZORPAY_SDK,
    STRIPE_SDK,
} from "./checkout";

/**
 * The provider's window (E11), against stand-ins for the providers' browser
 * SDKs: what it is opened with — the handoff's order, the business's public
 * key, no payment methods of Saroh's choosing (DEC-059), never an amount of
 * the page's — and how each way it can end is read.
 */

type Options = Record<string, unknown> & {
    handler: (response?: unknown) => void;
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
    description: "Check-up · Sun 20 Sep at 7:00 am",
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

    it("opens the sandbox drop-in when the API made a sandbox order", async () => {
        const checkout = vi.fn(() =>
            Promise.resolve({ paymentDetails: { paymentMessage: "ok" } }),
        );
        const Cashfree = vi.fn(() => ({ checkout }));
        (window as unknown as { Cashfree: unknown }).Cashfree = Cashfree;

        const session = openProviderCheckout(
            request({
                provider: "CASHFREE",
                publicKey: null,
                clientParams: {
                    paymentSessionId: "session_2",
                    mode: "sandbox",
                },
            }),
        );
        await expect(session.outcome).resolves.toBe("paid");
        expect(Cashfree).toHaveBeenCalledWith({ mode: "sandbox" });
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

describe("autopay's authorisation window (D12)", () => {
    it("opens Razorpay as a recurring payment for the provider's customer", async () => {
        fakeRazorpay();
        openProviderCheckout(
            request({
                clientParams: {
                    razorpayOrderId: "order_auth",
                    razorpayCustomerId: "cust_1",
                    recurring: true,
                },
            }),
        );
        await flush();
        expect(razorpay[0].options).toMatchObject({
            order_id: "order_auth",
            recurring: "1",
            customer_id: "cust_1",
        });
    });

    it("takes D19's adapter as it answers: the return page as callback_url", async () => {
        fakeRazorpay();
        openProviderCheckout(
            request({
                clientParams: {
                    razorpayOrderId: "order_auth",
                    razorpayCustomerId: "cust_1",
                    recurring: true,
                    method: "upi",
                    callbackUrl: "https://pulse.saroh.app/autopay?pay=t",
                },
            }),
        );
        await flush();
        expect(razorpay[0].options).toMatchObject({
            order_id: "order_auth",
            recurring: "1",
            customer_id: "cust_1",
            callback_url: "https://pulse.saroh.app/autopay?pay=t",
        });
    });

    it("takes Razorpay's own \"1\" too, and never a return page that isn't https", async () => {
        fakeRazorpay();
        openProviderCheckout(
            request({
                clientParams: {
                    razorpayOrderId: "order_auth",
                    recurring: "1",
                    callbackUrl: "javascript:alert(1)",
                },
            }),
        );
        await flush();
        expect(razorpay[0].options).toMatchObject({ recurring: "1" });
        expect(razorpay[0].options).not.toHaveProperty("callback_url");
    });

    it("never marks a plain payment recurring", async () => {
        fakeRazorpay();
        openProviderCheckout(request());
        await flush();
        expect(razorpay[0].options).not.toHaveProperty("recurring");
        expect(razorpay[0].options).not.toHaveProperty("customer_id");
    });
});

describe("the window's return, posted to the API (P1)", () => {
    const API = "https://api.test";
    const SIGNED = {
        razorpay_payment_id: "pay_1",
        razorpay_order_id: "order_1",
        razorpay_signature: "ab".repeat(32),
    };
    let posted: { url: string; init: RequestInit }[];
    let reply: () => Promise<Response>;

    beforeEach(() => {
        posted = [];
        reply = () =>
            Promise.resolve(
                new Response(JSON.stringify({ confirmed: true }), {
                    status: 200,
                    headers: { "Content-Type": "application/json" },
                }),
            );
        vi.stubGlobal(
            "fetch",
            vi.fn((url: string, init: RequestInit) => {
                posted.push({ url, init });
                return reply();
            }),
        );
    });
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("posts Razorpay's signed return before the page is told it's paid", async () => {
        fakeRazorpay();
        let told = false;
        const session = openProviderCheckout({ ...request(), apiUrl: API });
        void session.outcome.then(() => {
            told = true;
        });
        await flush();
        let answer: (r: Response) => void = () => undefined;
        reply = () =>
            new Promise<Response>((resolve) => {
                answer = resolve;
            });
        razorpay[0]?.options.handler(SIGNED);
        await flush();
        expect(posted).toHaveLength(1);
        expect(told).toBe(false);

        answer(new Response(JSON.stringify({ confirmed: true })));
        await expect(session.outcome).resolves.toBe("paid");
        const [{ url, init }] = posted;
        expect(url).toBe("https://api.test/public/payments/return");
        expect(init.method).toBe("POST");
        expect(init.credentials).toBe("omit");
        expect(JSON.parse(init.body as string)).toEqual({
            provider: "RAZORPAY",
            providerOrderId: "order_1",
            providerPaymentId: "pay_1",
            signature: "ab".repeat(32),
        });
        // Never an amount: the API reads it from the provider.
        expect(init.body as string).not.toMatch(/amount/);
    });

    it("still says paid when the API refuses or can't be reached; the webhook is the backup", async () => {
        fakeRazorpay();
        reply = () => Promise.resolve(new Response("{}", { status: 400 }));
        const refused = openProviderCheckout({ ...request(), apiUrl: API });
        await flush();
        razorpay[0]?.options.handler(SIGNED);
        await expect(refused.outcome).resolves.toBe("paid");

        reply = () => Promise.reject(new TypeError("offline"));
        const offline = openProviderCheckout({ ...request(), apiUrl: API });
        await flush();
        razorpay[1]?.options.handler(SIGNED);
        await expect(offline.outcome).resolves.toBe("paid");
        expect(posted).toHaveLength(2);
    });

    it("posts nothing without an API, or without a whole signed return", async () => {
        fakeRazorpay();
        const noApi = openProviderCheckout(request());
        await flush();
        razorpay[0]?.options.handler(SIGNED);
        await expect(noApi.outcome).resolves.toBe("paid");

        const unsigned = openProviderCheckout({ ...request(), apiUrl: API });
        await flush();
        razorpay[1]?.options.handler({ razorpay_payment_id: "pay_1" });
        await expect(unsigned.outcome).resolves.toBe("paid");
        expect(posted).toHaveLength(0);
    });

    it("posts Cashfree's order, which the API checks with Cashfree itself", async () => {
        (window as unknown as { Cashfree: unknown }).Cashfree = () => ({
            checkout: () =>
                Promise.resolve({ paymentDetails: { paymentMessage: "ok" } }),
        });
        const session = openProviderCheckout({
            ...request({
                provider: "CASHFREE",
                providerIntentId: "2149460581",
                publicKey: null,
                clientParams: {
                    paymentSessionId: "session_1",
                    cashfreeOrderId: "2149460581",
                },
            }),
            apiUrl: API,
        });
        await expect(session.outcome).resolves.toBe("paid");
        expect(JSON.parse(posted[0]?.init.body as string)).toEqual({
            provider: "CASHFREE",
            providerOrderId: "2149460581",
        });
    });

    it("reads the API's answer: confirmed or not", async () => {
        await expect(
            postCheckoutReturn(API, {
                provider: "RAZORPAY",
                providerOrderId: "order_1",
            }),
        ).resolves.toBe(true);
        reply = () =>
            Promise.resolve(new Response(JSON.stringify({ confirmed: false })));
        await expect(
            postCheckoutReturn(API, {
                provider: "RAZORPAY",
                providerOrderId: "order_1",
            }),
        ).resolves.toBe(false);
    });
});

describe("Stripe's Payment Element, in a window of the site's own (U7)", () => {
    type Confirm = () => Promise<unknown>;
    let stripe: {
        key: string;
        elementsOptions?: Record<string, unknown>;
        paymentOptions?: Record<string, unknown>;
        mounted?: HTMLElement;
        confirms: unknown[];
    }[];
    let confirm: Confirm;

    const stripeRequest = (
        over: Partial<PaymentHandoff> = {},
    ): CheckoutRequest => ({
        ...request({
            provider: "STRIPE",
            amountCents: 4_500,
            currency: "USD",
            providerIntentId: "pi_fake_1",
            publicKey: "pk_test_fake",
            clientParams: {
                stripePaymentIntentId: "pi_fake_1",
                clientSecret: "pi_fake_1_secret_fake",
            },
            ...over,
        }),
    });

    function fakeStripe() {
        stripe = [];
        confirm = () =>
            Promise.resolve({
                paymentIntent: { id: "pi_fake_1", status: "succeeded" },
            });
        (window as unknown as { Stripe: unknown }).Stripe = (key: string) => {
            const made: (typeof stripe)[number] = { key, confirms: [] };
            stripe.push(made);
            return {
                elements: (options: Record<string, unknown>) => {
                    made.elementsOptions = options;
                    return {
                        create: (
                            _type: string,
                            options: Record<string, unknown>,
                        ) => {
                            made.paymentOptions = options;
                            return {
                                mount: (el: HTMLElement) => {
                                    made.mounted = el;
                                },
                            };
                        },
                    };
                },
                confirmPayment: (options: unknown) => {
                    made.confirms.push(options);
                    return confirm();
                },
            };
        };
    }

    const dialog = () => document.querySelector("dialog");
    const button = (name: string): HTMLButtonElement | undefined =>
        Array.from(dialog()?.querySelectorAll("button") ?? []).find((b) =>
            b.textContent.startsWith(name),
        );

    beforeEach(() => {
        // jsdom has <dialog> but not its modal methods.
        const proto = HTMLDialogElement.prototype as unknown as Record<
            string,
            unknown
        >;
        proto.showModal ??= function (this: HTMLDialogElement) {
            this.setAttribute("open", "");
        };
        proto.close ??= function (this: HTMLDialogElement) {
            this.removeAttribute("open");
        };
    });
    afterEach(() => {
        delete (window as unknown as { Stripe?: unknown }).Stripe;
        document.querySelectorAll("dialog").forEach((d) => d.remove());
        vi.unstubAllGlobals();
    });

    it("opens the Payment Element on the intent's client secret, named for the business, with the booker filled in", async () => {
        fakeStripe();
        openProviderCheckout(stripeRequest());
        await flush();

        expect(stripe[0]?.key).toBe("pk_test_fake");
        expect(stripe[0]?.elementsOptions).toMatchObject({
            clientSecret: "pi_fake_1_secret_fake",
        });
        expect(stripe[0]?.paymentOptions).toMatchObject({
            defaultValues: {
                billingDetails: { name: "Asha Rao", email: "asha@example.in" },
            },
        });
        const d = dialog();
        expect(d?.hasAttribute("open")).toBe(true);
        expect(stripe[0]?.mounted && d?.contains(stripe[0].mounted)).toBe(true);
        const label = d?.getAttribute("aria-labelledby") ?? "";
        expect(document.getElementById(label)?.textContent).toBe("Kavi Dental");
        expect(button("Pay")?.textContent).toBe("Pay $45");
        // Only the site's own tokens, never Saroh's.
        expect(d?.style.cssText).toContain("--site-surface");
        expect(d?.outerHTML).not.toMatch(/saroh/i);
    });

    it("pays: the intent goes to the API as the return, then the page is told", async () => {
        fakeStripe();
        const posted: { url: string; body: unknown }[] = [];
        vi.stubGlobal(
            "fetch",
            vi.fn((url: string, init: RequestInit) => {
                posted.push({ url, body: JSON.parse(init.body as string) });
                return Promise.resolve(
                    new Response(JSON.stringify({ confirmed: true }), {
                        status: 200,
                    }),
                );
            }),
        );
        const session = openProviderCheckout({
            ...stripeRequest(),
            apiUrl: "https://api.test",
        });
        await flush();
        button("Pay")?.click();
        await expect(session.outcome).resolves.toBe("paid");
        expect(stripe[0]?.confirms[0]).toMatchObject({
            redirect: "if_required",
        });
        expect(posted).toEqual([
            {
                url: "https://api.test/public/payments/return",
                body: { provider: "STRIPE", providerOrderId: "pi_fake_1" },
            },
        ]);
        expect(dialog()).toBeNull();
        // The client secret is never sent anywhere but Stripe.js.
        expect(JSON.stringify(posted)).not.toContain("secret");
    });

    it("says paid on a processing payment too; the API asks Stripe", async () => {
        fakeStripe();
        confirm = () =>
            Promise.resolve({
                paymentIntent: { id: "pi_fake_1", status: "processing" },
            });
        const session = openProviderCheckout(stripeRequest());
        await flush();
        button("Pay")?.click();
        await expect(session.outcome).resolves.toBe("paid");
    });

    it("keeps a field to fix in the window, and a decline ends it as failed", async () => {
        fakeStripe();
        confirm = () =>
            Promise.resolve({
                error: {
                    type: "validation_error",
                    message: "Your card number is incomplete.",
                },
            });
        const session = openProviderCheckout(stripeRequest());
        await flush();
        button("Pay")?.click();
        await flush();
        expect(dialog()?.querySelector('[role="alert"]')?.textContent).toBe(
            "Your card number is incomplete.",
        );
        expect(button("Pay")?.disabled).toBe(false);

        confirm = () =>
            Promise.resolve({
                error: { type: "card_error", message: "Declined." },
            });
        button("Pay")?.click();
        await expect(session.outcome).resolves.toBe("failed");
        expect(dialog()).toBeNull();
    });

    it("Close and Escape say closed", async () => {
        fakeStripe();
        const closed = openProviderCheckout(stripeRequest());
        await flush();
        button("Close")?.click();
        await expect(closed.outcome).resolves.toBe("closed");
        expect(dialog()).toBeNull();

        const escaped = openProviderCheckout(stripeRequest());
        await flush();
        dialog()?.dispatchEvent(new Event("cancel", { cancelable: true }));
        await expect(escaped.outcome).resolves.toBe("closed");
        expect(dialog()).toBeNull();
    });

    it("moves focus into the window and back to where it was", async () => {
        fakeStripe();
        const opener = document.createElement("button");
        document.body.appendChild(opener);
        opener.focus();
        const session = openProviderCheckout(stripeRequest());
        await flush();
        expect(dialog()?.contains(document.activeElement)).toBe(true);
        button("Close")?.click();
        await session.outcome;
        expect(document.activeElement).toBe(opener);
        opener.remove();
    });

    it("removes the window when the hold lapses, and says nothing after", async () => {
        fakeStripe();
        const session = openProviderCheckout(stripeRequest());
        await flush();
        expect(dialog()).not.toBeNull();
        session.close();
        expect(dialog()).toBeNull();
        const settled = await Promise.race([
            session.outcome,
            flush().then(() => "pending"),
        ]);
        expect(settled).toBe("pending");
    });

    it("can't open without the key, the client secret or Stripe.js", async () => {
        fakeStripe();
        await expect(
            openProviderCheckout(stripeRequest({ publicKey: null })).outcome,
        ).resolves.toBe("unavailable");
        await expect(
            openProviderCheckout(
                stripeRequest({
                    clientParams: { stripePaymentIntentId: "pi_fake_1" },
                }),
            ).outcome,
        ).resolves.toBe("unavailable");
        expect(stripe).toHaveLength(0);

        delete (window as unknown as { Stripe?: unknown }).Stripe;
        const session = openProviderCheckout(stripeRequest());
        const script = document.head.querySelector<HTMLScriptElement>(
            `script[src="${STRIPE_SDK}"]`,
        );
        expect(script).not.toBeNull();
        script?.onerror?.(new Event("error"));
        await expect(session.outcome).resolves.toBe("unavailable");
        expect(dialog()).toBeNull();
    });

    // Last: Stripe.js counts as loaded for the page from here on.
    it("never opens when the page closed it before Stripe.js loaded", async () => {
        const session = openProviderCheckout(stripeRequest());
        session.close();
        fakeStripe();
        const script = document.head.querySelector<HTMLScriptElement>(
            `script[src="${STRIPE_SDK}"]`,
        );
        expect(script).not.toBeNull();
        script?.onload?.(new Event("load"));
        await flush();
        expect(stripe).toHaveLength(0);
        expect(dialog()).toBeNull();
    });
});

describe("the payment window's corners", () => {
    it("caps a pill template's radius so card fields stay fields", () => {
        expect(cappedRadius("9999px")).toBe("10px");
        expect(cappedRadius("6px")).toBe("6px");
        expect(cappedRadius("")).toBeNull();
    });
});
