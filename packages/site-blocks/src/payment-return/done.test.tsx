import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PaymentReturn } from "./done";
import type { PaymentReturnView } from "./words";
import {
    backPathOf,
    paymentReturnOf,
    paymentReturnWords,
    RETURN_POLL_MS,
    RETURN_POLL_TRIES,
    sameSitePath,
} from "./words";

/**
 * The business's `/paid` page after Stripe's hosted Checkout (U8): the
 * API's read narrowed, each state's words, where Back goes, and the page
 * asking again until the payment settles.
 */

const view = (over: Partial<PaymentReturnView> = {}): PaymentReturnView => ({
    status: "open",
    kind: "hold",
    businessName: "Kavi Dental",
    amountCents: 4_500,
    currency: "USD",
    booking: {
        serviceName: "Check-up",
        startAt: "2026-11-20T09:30:00.000Z",
        endAt: "2026-11-20T10:00:00.000Z",
        timezone: "Europe/London",
    },
    returnPath: "/book?service=check-up",
    ...over,
});

afterEach(() => {
    vi.useRealTimers();
});

describe("the read, narrowed", () => {
    it("takes the API's view and drops a return path that leaves the site", () => {
        expect(paymentReturnOf(view())).toEqual(view());
        expect(
            paymentReturnOf({ ...view(), returnPath: "//evil.example" })
                ?.returnPath,
        ).toBeNull();
        expect(paymentReturnOf({ ...view(), status: "weird" })).toBeNull();
        expect(paymentReturnOf(null)).toBeNull();
    });

    it("keeps only same-site paths", () => {
        expect(sameSitePath("/pay/tok_1")).toBe("/pay/tok_1");
        for (const bad of [
            "https://x",
            "//x",
            "/\\x",
            "x",
            "",
            "/a\nb",
            `/${"a".repeat(600)}`,
        ]) {
            expect(sameSitePath(bad)).toBeNull();
        }
    });

    it("goes back where the customer paid from, else the kind's page", () => {
        expect(backPathOf(view())).toBe("/book?service=check-up");
        expect(backPathOf({ kind: "hold", returnPath: null })).toBe("/book");
        expect(backPathOf({ kind: "pack", returnPath: null })).toBe("/account");
        expect(backPathOf({ kind: "join", returnPath: null }, "/prices")).toBe(
            "/prices",
        );
        expect(backPathOf({ kind: "order", returnPath: null })).toBe("/");
    });
});

describe("the page's words", () => {
    it("says the booking's time in the business's zone, and no semicolons or dashes", () => {
        const w = paymentReturnWords(view({ status: "paid" }));
        expect(w.title).toBe("You're booked");
        expect(w.body).toBe("Check-up, Fri 20 Nov, 9:30 am. You paid $45.");
        expect(w.action).toBe("Back to Kavi Dental");
        for (const status of [
            "open",
            "processing",
            "paid",
            "failed",
            "closed",
            "refunding",
        ] as const) {
            const all = Object.values(
                paymentReturnWords(view({ status }), true),
            ).join(" ");
            expect(all).not.toMatch(/[;—–]/);
        }
    });

    it("says processing, refunding, failed and closed plainly", () => {
        expect(
            paymentReturnWords(view({ status: "processing", kind: "order" }))
                .title,
        ).toBe("Payment processing");
        expect(paymentReturnWords(view({ status: "refunding" })).body).toMatch(
            /came after the time was released\. It's being refunded/,
        );
        const failed = paymentReturnWords(view({ status: "failed" }));
        expect(failed).toMatchObject({ action: "Try again", problem: true });
        expect(
            paymentReturnWords(view({ status: "closed", kind: "pack" })).body,
        ).toBe("Nothing was taken. Start again when you're ready.");
    });
});

describe("the page", () => {
    it("confirms, asks again, then says booked with the way back", async () => {
        vi.useFakeTimers();
        const read = vi
            .fn<() => Promise<PaymentReturnView | null>>()
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce(view({ status: "paid" }));
        render(<PaymentReturn initial={view()} read={read} />);
        const status = screen.getByRole("status");
        expect(status.getAttribute("aria-live")).toBe("polite");
        expect(
            screen.getByRole("heading", { name: "Confirming your payment" }),
        ).toBe(document.activeElement);
        expect(screen.queryByRole("link")).toBeNull();

        await act(() => vi.advanceTimersByTimeAsync(RETURN_POLL_MS));
        expect(screen.getByRole("heading").textContent).toBe(
            "Confirming your payment",
        );
        await act(() => vi.advanceTimersByTimeAsync(RETURN_POLL_MS));
        const heading = screen.getByRole("heading", { name: "You're booked" });
        expect(heading).toBe(document.activeElement);
        expect(
            screen
                .getByRole("link", { name: "Back to Kavi Dental" })
                .getAttribute("href"),
        ).toBe("/book?service=check-up");
        expect(read).toHaveBeenCalledTimes(2);
    });

    it("stops asking after a minute and says it is still confirming", async () => {
        vi.useFakeTimers();
        const read = vi.fn(() => Promise.resolve(view()));
        render(<PaymentReturn initial={view()} read={read} />);
        for (let i = 0; i < RETURN_POLL_TRIES + 2; i++) {
            await act(() => vi.advanceTimersByTimeAsync(RETURN_POLL_MS));
        }
        expect(read).toHaveBeenCalledTimes(RETURN_POLL_TRIES);
        screen.getByRole("heading", { name: "Still confirming your payment" });
        screen.getByRole("link", { name: "Back to Kavi Dental" });
    });

    it("offers Try again, as a link back, when the payment failed", () => {
        render(
            <PaymentReturn
                initial={view({ status: "failed", returnPath: null })}
                read={() => Promise.resolve(null)}
            />,
        );
        screen.getByRole("alert");
        expect(
            screen
                .getByRole("link", { name: "Try again" })
                .getAttribute("href"),
        ).toBe("/book");
    });
});
