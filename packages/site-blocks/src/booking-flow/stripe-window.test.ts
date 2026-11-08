import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PaymentHandoff } from "./api";
import type { CheckoutOutcome, CheckoutRequest, Settle } from "./checkout";
import { postCheckoutReturn } from "./checkout";
import { cappedRadius, openStripeWindow, STRIPE_SDK } from "./stripe-window";

/**
 * The parked Stripe window (owner, 8 Nov 2026), against a stand-in for
 * Stripe.js. `open` wires it the way openProviderCheckout would (its
 * commented STRIPE line): the first answer stands, a paid return goes to
 * the API first, and the page's close removes the window.
 */
function open(request: CheckoutRequest) {
    let resolve: (o: CheckoutOutcome) => void = () => undefined;
    const outcome = new Promise<CheckoutOutcome>((r) => (resolve = r));
    let removeStripe: (() => void) | null = null;
    let closed = false;
    let settled = false;
    const once: Settle = (value, returned) => {
        if (settled || closed) return;
        settled = true;
        if (value === "paid" && returned && request.apiUrl) {
            void postCheckoutReturn(request.apiUrl, returned).then(() => {
                if (!closed) resolve(value);
            });
            return;
        }
        resolve(value);
    };
    openStripeWindow(request, once, (remove) => {
        if (closed) return false;
        removeStripe = remove;
        return true;
    });
    return {
        outcome,
        close: () => {
            if (closed) return;
            closed = true;
            removeStripe?.();
        },
    };
}

const request = (over: Partial<PaymentHandoff> = {}): CheckoutRequest => ({
    handoff: {
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
    },
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
    document.head.querySelectorAll("script").forEach((s) => s.remove());
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
        open(request());
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
        const session = open({
            ...request(),
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
        const session = open(request());
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
        const session = open(request());
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
        const closed = open(request());
        await flush();
        button("Close")?.click();
        await expect(closed.outcome).resolves.toBe("closed");
        expect(dialog()).toBeNull();

        const escaped = open(request());
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
        const session = open(request());
        await flush();
        expect(dialog()?.contains(document.activeElement)).toBe(true);
        button("Close")?.click();
        await session.outcome;
        expect(document.activeElement).toBe(opener);
        opener.remove();
    });

    it("removes the window when the hold lapses, and says nothing after", async () => {
        fakeStripe();
        const session = open(request());
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
        await expect(open(request({ publicKey: null })).outcome).resolves.toBe(
            "unavailable",
        );
        await expect(
            open(
                request({
                    clientParams: { stripePaymentIntentId: "pi_fake_1" },
                }),
            ).outcome,
        ).resolves.toBe("unavailable");
        expect(stripe).toHaveLength(0);

        delete (window as unknown as { Stripe?: unknown }).Stripe;
        const session = open(request());
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
        const session = open(request());
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
