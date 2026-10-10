import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { PaymentHandoff } from "../booking-flow/api";
import type {
    CheckoutOutcome,
    CheckoutRequest,
    OpenCheckout,
} from "../booking-flow/checkout";
import { STANDING_POLL_MS, STANDING_POLL_TRIES } from "../shop/checkout-sheet";
import type { PayLinkStart } from "./pay-link-pay";
import { PayLinkPay } from "./pay-link-pay";

/**
 * Paying from a pay link, with the provider's window replaced: what the
 * page says at each point, that a second press starts nothing, that another
 * go opens the same payment, and that "paid" is only ever the server's
 * re-read. The window itself (Razorpay's, Cashfree's) is `checkout.test.ts`.
 */

const INTENT: PaymentHandoff = {
    provider: "RAZORPAY",
    amountCents: 140_000,
    currency: "INR",
    providerIntentId: "order_rzp_1",
    publicKey: "rzp_test_1",
    clientParams: {},
};

afterEach(() => {
    vi.useRealTimers();
});

/** A provider window the test answers by hand. */
function windowOf() {
    const answers: ((outcome: CheckoutOutcome) => void)[] = [];
    const requests: CheckoutRequest[] = [];
    const close = vi.fn();
    const openCheckout = vi.fn<OpenCheckout>((request) => {
        requests.push(request);
        return {
            outcome: new Promise<CheckoutOutcome>((resolve) => {
                answers.push(resolve);
            }),
            close,
        };
    });
    return {
        openCheckout,
        requests,
        close,
        /** The window opened last says this. */
        says: async (outcome: CheckoutOutcome) => {
            await act(async () => {
                answers.at(-1)?.(outcome);
                await Promise.resolve();
            });
        },
    };
}

function setup(
    over: {
        start?: PayLinkStart;
        contact?: { phone: string | null; email: string | null } | null;
    } = {},
) {
    const start = vi.fn((_key: string) =>
        Promise.resolve<PayLinkStart>(
            over.start ?? { ok: true, intent: INTENT },
        ),
    );
    const refresh = vi.fn();
    const provider = windowOf();
    render(
        <PayLinkPay
            start={start}
            refresh={refresh}
            amount="₹1,400.00"
            businessName="Rye & Co."
            description="Invoice INV-7"
            payerName="Asha Rao"
            contact={over.contact}
            apiUrl="https://api.test"
            openCheckout={provider.openCheckout}
        />,
    );
    return { start, refresh, ...provider };
}

const payButton = () => screen.getByRole("button", { name: "Pay ₹1,400.00" });

/** Press Pay, and let the payment's start settle. */
async function pressPay() {
    await act(async () => {
        fireEvent.click(payButton());
        await Promise.resolve();
    });
}

describe("paying from a pay link", () => {
    it("offers Pay alone before a payment is started: nothing to check yet", () => {
        setup();
        expect(payButton()).toBeEnabled();
        expect(screen.queryByRole("button", { name: "Check again" })).toBe(
            null,
        );
        expect(screen.queryByRole("status")).toBe(null);
        expect(screen.queryByRole("alert")).toBe(null);
    });

    it("opens the business's provider window on the intent the server returned", async () => {
        const { start, requests } = setup();
        await pressPay();
        expect(start).toHaveBeenCalledTimes(1);
        expect(requests).toEqual([
            {
                handoff: INTENT,
                business: "Rye & Co.",
                description: "Invoice INV-7",
                booker: { name: "Asha Rao", email: "" },
                apiUrl: "https://api.test",
            },
        ]);
        expect(
            screen.getByRole("button", { name: "Payment window open…" }),
        ).toBeDisabled();
        expect(screen.getByRole("status")).toHaveTextContent(
            "Finish paying in the secure payment window.",
        );
        // Nothing of the handoff is drawn on the page.
        expect(document.body.textContent).not.toMatch(
            /order_rzp_1|rzp_test_1|RAZORPAY|widget/i,
        );
    });

    it("starts one payment however many times Pay is pressed", async () => {
        const { start, openCheckout } = setup();
        await act(async () => {
            const button = payButton();
            fireEvent.click(button);
            fireEvent.click(button);
            fireEvent.click(button);
            await Promise.resolve();
        });
        expect(start).toHaveBeenCalledTimes(1);
        expect(openCheckout).toHaveBeenCalledTimes(1);
    });

    it("after the window says paid, reads the page again until the server says so, and never says Paid itself", async () => {
        vi.useFakeTimers();
        const { refresh, says } = setup();
        await pressPay();
        expect(refresh).not.toHaveBeenCalled();
        await says("paid");
        expect(screen.getByRole("status")).toHaveTextContent(
            "Confirming your payment",
        );
        expect(screen.getByRole("status")).toHaveTextContent(
            "There's no need to pay again.",
        );
        // No Pay to press twice, and nothing claims the money arrived.
        expect(screen.queryByRole("button", { name: /Pay/ })).toBe(null);
        expect(screen.queryByText(/^Paid|is paid|Thank you/)).toBe(null);

        await act(async () => {
            await vi.advanceTimersByTimeAsync(0);
        });
        expect(refresh).toHaveBeenCalledTimes(1);
        await act(async () => {
            await vi.advanceTimersByTimeAsync(STANDING_POLL_MS);
        });
        expect(refresh).toHaveBeenCalledTimes(2);
    });

    it("says it is still checking when the server takes long, and offers Check again", async () => {
        vi.useFakeTimers();
        const { refresh, says } = setup();
        await pressPay();
        await says("paid");
        // Each read is asked for once the one before it has been drawn.
        for (let i = 0; i < STANDING_POLL_TRIES; i += 1) {
            await act(async () => {
                await vi.advanceTimersByTimeAsync(STANDING_POLL_MS);
            });
        }
        expect(refresh).toHaveBeenCalledTimes(STANDING_POLL_TRIES);
        expect(screen.getByRole("status")).toHaveTextContent(
            "Still checking your payment",
        );
        expect(screen.getByRole("status")).toHaveTextContent(
            "This is taking longer than usual. There's no need to pay again. Rye & Co. gets your payment as soon as it's confirmed.",
        );
        expect(screen.queryByRole("button", { name: /Pay/ })).toBe(null);
        fireEvent.click(screen.getByRole("button", { name: "Check again" }));
        expect(refresh).toHaveBeenCalledTimes(STANDING_POLL_TRIES + 1);
    });

    it("says a refused payment took nothing, and tries the same payment again", async () => {
        const { start, requests, says, refresh } = setup();
        await pressPay();
        await says("failed");
        expect(screen.getByRole("alert")).toHaveTextContent(
            "The payment didn't go through. Nothing was taken. Try again.",
        );
        await act(async () => {
            fireEvent.click(
                screen.getByRole("button", { name: "Try again · ₹1,400.00" }),
            );
            await Promise.resolve();
        });
        // The same payment, opened again: no second one is started.
        expect(start).toHaveBeenCalledTimes(1);
        expect(requests).toHaveLength(2);
        expect(requests[1].handoff).toBe(INTENT);
        expect(
            screen.getByRole("button", { name: "Payment window open…" }),
        ).toBeDisabled();
        expect(refresh).not.toHaveBeenCalled();
    });

    it("says the window was closed, without alarm, and offers Pay and Check again", async () => {
        const { start, openCheckout, says, refresh } = setup();
        await pressPay();
        await says("closed");
        expect(screen.getByRole("status")).toHaveTextContent(
            "The payment window closed before you paid.",
        );
        expect(screen.queryByRole("alert")).toBe(null);
        fireEvent.click(screen.getByRole("button", { name: "Check again" }));
        expect(refresh).toHaveBeenCalledTimes(1);
        await pressPay();
        expect(start).toHaveBeenCalledTimes(1);
        expect(openCheckout).toHaveBeenCalledTimes(2);
    });

    it("says so when the window can't open", async () => {
        const { says } = setup();
        await pressPay();
        await says("unavailable");
        expect(screen.getByRole("alert")).toHaveTextContent(
            "We couldn't open the payment window. Check your connection and try again.",
        );
        expect(
            screen.getByRole("button", { name: "Try again · ₹1,400.00" }),
        ).toBeEnabled();
    });

    it("shows the server's own words when the payment can't start, and Pay again", async () => {
        const { openCheckout, refresh } = setup({
            start: {
                ok: false,
                message:
                    "That's a lot of tries at once. Wait a minute and try again.",
            },
        });
        await pressPay();
        expect(screen.getByRole("alert")).toHaveTextContent(
            "That's a lot of tries at once. Wait a minute and try again.",
        );
        expect(openCheckout).not.toHaveBeenCalled();
        expect(refresh).not.toHaveBeenCalled();
        expect(payButton()).toBeEnabled();
        expect(screen.queryByRole("button", { name: "Check again" })).toBe(
            null,
        );
    });

    it("reads the page again when the server says it was settled meanwhile", async () => {
        const { refresh } = setup({
            start: {
                ok: false,
                message: "This link no longer works.",
                settled: true,
            },
        });
        await pressPay();
        expect(refresh).toHaveBeenCalledTimes(1);
    });

    it("closes the window when the page is left", async () => {
        const start = vi.fn(() =>
            Promise.resolve<PayLinkStart>({ ok: true, intent: INTENT }),
        );
        const provider = windowOf();
        const { unmount } = render(
            <PayLinkPay
                start={start}
                refresh={vi.fn()}
                amount="₹1,400.00"
                businessName="Rye & Co."
                description="Order #ORD-7"
                openCheckout={provider.openCheckout}
            />,
        );
        await pressPay();
        unmount();
        expect(provider.close).toHaveBeenCalled();
    });
});

describe("the business's contact under Pay", () => {
    it("links the phone and the email when the page has them", () => {
        setup({ contact: { phone: "+919845012345", email: "hi@rye.example" } });
        const help = screen.getByText(/Need help\? Reach Rye & Co\./);
        expect(help).toHaveTextContent(
            "Need help? Reach Rye & Co. on +91 98450 12345 or at hi@rye.example",
        );
        expect(
            screen.getByRole("link", { name: "+91 98450 12345" }),
        ).toHaveAttribute("href", "tel:+919845012345");
        expect(
            screen.getByRole("link", { name: "hi@rye.example" }),
        ).toHaveAttribute("href", "mailto:hi@rye.example");
    });

    it("says only what there is", () => {
        setup({ contact: { phone: null, email: "hi@rye.example" } });
        expect(
            screen.getByText(/Need help\? Reach Rye & Co\./),
        ).toHaveTextContent("Need help? Reach Rye & Co. at hi@rye.example");
    });

    it("draws nothing without a contact", () => {
        setup({ contact: null });
        expect(screen.queryByText(/Need help/)).toBe(null);
    });
});

describe("a page with a choice of its own before paying", () => {
    it("draws the page's controls in place of the button, on the same payment", async () => {
        const start = vi.fn(() =>
            Promise.resolve<PayLinkStart>({ ok: true, intent: INTENT }),
        );
        const provider = windowOf();
        render(
            <PayLinkPay
                start={start}
                refresh={vi.fn()}
                amount="₹1,400.00"
                businessName="Rye & Co."
                description="Invoice INV-7"
                openCheckout={provider.openCheckout}
                choice={(paying) => (
                    <button
                        type="button"
                        onClick={paying.pay}
                        disabled={paying.busy}
                    >
                        Just pay this invoice
                    </button>
                )}
            />,
        );
        expect(screen.queryByRole("button", { name: "Pay ₹1,400.00" })).toBe(
            null,
        );
        await act(async () => {
            fireEvent.click(
                screen.getByRole("button", { name: "Just pay this invoice" }),
            );
            await Promise.resolve();
        });
        expect(start).toHaveBeenCalledTimes(1);
        expect(provider.openCheckout).toHaveBeenCalledTimes(1);
        expect(
            screen.getByRole("button", { name: "Just pay this invoice" }),
        ).toBeDisabled();
    });
});
