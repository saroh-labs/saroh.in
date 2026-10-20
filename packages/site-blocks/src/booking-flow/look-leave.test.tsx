import {
    act,
    cleanup,
    fireEvent,
    render,
    screen,
    waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SignedInCustomer } from "../account/api";
import type { SignedInBookRequest } from "./api";
import { resultOf } from "./api";
import type { BookingAccount } from "./booking-flow";
import BookingFlow from "./booking-flow";
import type { CheckoutOutcome } from "./checkout";
import type { BookingPageData } from "./model";
import { isBookResult } from "./model";

/**
 * Leaving a look's booking (review #20): Escape or Close on the pay step
 * lets the hold go before the page closes, never mid-Book, and a Book
 * press whose answer never came sends the same key from a fresh page.
 */

const router = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: vi.fn(), replace: router.replace }),
    usePathname: () => "/book",
}));
vi.mock("./checkout", () => ({
    openProviderCheckout: () => ({
        outcome: new Promise<CheckoutOutcome>(() => undefined),
        close: () => undefined,
    }),
}));

const API = "https://api.test";
const EIGHT = "2026-10-22T02:30:00.000Z";

const PAGE: BookingPageData = {
    businessName: "Prana Yoga",
    open: true,
    timezone: "Asia/Kolkata",
    payOnline: true,
    rules: { bookAheadDays: 21, latestBookingMinutes: 60, freeCancelHours: 6 },
    services: [
        {
            id: "svc_private",
            name: "Private session",
            description: null,
            durationMinutes: 60,
            kind: "one",
            capacity: 1,
            priceCents: 250_000,
            currency: "INR",
            online: false,
            staff: ["Meera Iyer"],
        },
    ],
};

const ASHA: SignedInCustomer = {
    email: "asha.kumar@example.com",
    name: "Asha Kumar",
};

function json(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
    });
}

const HELD_BOOKING = {
    reference: "PY-1",
    startAt: EIGHT,
    endAt: "2026-10-22T03:30:00.000Z",
    serviceName: "Private session",
    online: false,
    meetingUrl: null,
    state: "HELD",
    holdExpiresAt: "2026-10-20T10:15:00.000Z",
    payToken: "tok_1",
};

interface Serving {
    released: "RELEASED" | "HELD";
    /** What a Book press gets: the hold, or an answer that never comes. */
    book: () => Promise<Response>;
}
let serving: Serving;
const sent: { url: string; body: string | undefined }[] = [];

function serve() {
    globalThis.fetch = vi.fn((url: string, init?: RequestInit) => {
        sent.push({ url, body: init?.body as string | undefined });
        if (url.includes("/days")) {
            return Promise.resolve(
                json({
                    timezone: "Asia/Kolkata",
                    kind: "one",
                    capacity: 1,
                    days: [
                        {
                            date: "2026-10-22",
                            open: true,
                            starts: [
                                {
                                    startAt: EIGHT,
                                    endAt: "2026-10-22T03:30:00.000Z",
                                    staffId: null,
                                    staffName: null,
                                    placesLeft: null,
                                },
                            ],
                        },
                    ],
                }),
            );
        }
        if (url.endsWith("/book")) return serving.book();
        if (url.endsWith("/payment-intent")) {
            return Promise.resolve(
                json({
                    paymentIntentId: "pi_1",
                    provider: "RAZORPAY",
                    providerIntentId: "order_1",
                    amountCents: 250_000,
                    currency: "INR",
                    publicKey: "rzp_test_public",
                    clientParams: { razorpayOrderId: "order_1" },
                }),
            );
        }
        if (url.endsWith("/release")) {
            return Promise.resolve(
                json({ state: serving.released, holdExpiresAt: null }),
            );
        }
        return Promise.resolve(json({ state: "HELD", holdExpiresAt: null }));
    }) as unknown as typeof fetch;
}

function account(): BookingAccount {
    return {
        customer: ASHA,
        options: {
            businessName: "Prana Yoga",
            phone: null,
            challenge: { required: false, siteKey: null },
        },
        signIn: { requestCode: vi.fn(), verifyCode: vi.fn() },
        book: async ({ serviceId, ...rest }: SignedInBookRequest) => {
            const res = await fetch(`${API}/signed-in/${serviceId}/book`, {
                method: "POST",
                body: JSON.stringify({ serviceId, ...rest }),
            });
            const body: unknown = await res.json().catch(() => null);
            return resultOf(res.status, body, isBookResult);
        },
        signOut: vi.fn(() => Promise.resolve({ ok: true })),
    };
}

const realFetch = globalThis.fetch;
beforeEach(() => {
    router.replace.mockClear();
    sent.length = 0;
    window.sessionStorage.clear();
    serving = {
        released: "RELEASED",
        book: () => Promise.resolve(json(HELD_BOOKING, 201)),
    };
    serve();
    window.history.replaceState(
        null,
        "",
        "/book?service=svc_private&date=2026-10-22&start=08:00&step=details",
    );
});
afterEach(() => {
    globalThis.fetch = realFetch;
});

const action = () =>
    screen
        .getAllByRole("button")
        .find((b) => b.hasAttribute("data-booking-action")) ?? document.body;

const escape = () => fireEvent.keyDown(document, { key: "Escape" });

const releases = () => sent.filter((r) => r.url.endsWith("/release"));
const bookKeys = () =>
    sent
        .filter((r) => r.url.endsWith("/book"))
        .map(
            (r) =>
                (JSON.parse(r.body ?? "{}") as { idempotencyKey?: string })
                    .idempotencyKey,
        );

/** On the pay step, the time chosen and "Pay now" picked. */
async function toPayStep() {
    render(
        <BookingFlow
            page={PAGE}
            apiUrl={API}
            account={account()}
            look="quiet"
            initialServiceId="svc_private"
            initialDate="2026-10-22"
            initialStart="08:00"
            initialStep="details"
        />,
    );
    await screen.findByText("Booking as Asha Kumar");
    await waitFor(() => expect(action()).not.toHaveAttribute("aria-disabled"));
    fireEvent.click(action());
    await waitFor(() =>
        expect(new URLSearchParams(window.location.search).get("step")).toBe(
            "pay",
        ),
    );
    fireEvent.click(screen.getByRole("radio", { name: /Pay ₹2,500 now/ }));
}

async function toPaying() {
    await toPayStep();
    await act(async () => {
        fireEvent.click(action());
        await Promise.resolve();
    });
    await screen.findByRole("heading", { name: "Pay in the payment window" });
}

describe("leaving a look's booking", () => {
    it("lets the hold go before Escape closes the pay step", async () => {
        await toPaying();
        await act(async () => {
            escape();
            await Promise.resolve();
        });
        await waitFor(() => expect(router.replace).toHaveBeenCalledTimes(1));
        expect(releases()).toHaveLength(1);
    });

    it("stays and says so when the hold won't let go", async () => {
        serving.released = "HELD";
        await toPaying();
        await act(async () => {
            fireEvent.click(
                screen.getByRole("button", { name: "Close booking" }),
            );
            await Promise.resolve();
        });
        expect(
            await screen.findByText(
                "We couldn't let go of the time we're holding for you. Try again.",
            ),
        ).toBeVisible();
        expect(releases()).toHaveLength(1);
        expect(router.replace).not.toHaveBeenCalled();
    });

    it("does not close while Book is under way", async () => {
        serving.book = () => new Promise<Response>(() => undefined);
        await toPayStep();
        await act(async () => {
            fireEvent.click(action());
            await Promise.resolve();
        });
        await waitFor(() => expect(bookKeys()).toHaveLength(1));
        await act(async () => {
            escape();
            await Promise.resolve();
        });
        expect(router.replace).not.toHaveBeenCalled();
        expect(releases()).toHaveLength(0);
    });

    it("sends the same key from a fresh page when Book's answer never came", async () => {
        serving.book = () => new Promise<Response>(() => undefined);
        await toPayStep();
        await act(async () => {
            fireEvent.click(action());
            await Promise.resolve();
        });
        await waitFor(() => expect(bookKeys()).toHaveLength(1));
        // The page is gone mid-Book (a reload, a close): drawn afresh.
        cleanup();
        serving.book = () => Promise.resolve(json(HELD_BOOKING, 201));
        window.history.replaceState(
            null,
            "",
            "/book?service=svc_private&date=2026-10-22&start=08:00&step=details",
        );
        await toPaying();
        const keys = bookKeys();
        expect(keys).toHaveLength(2);
        expect(keys[0]).toBeTruthy();
        expect(keys[1]).toBe(keys[0]);
        // Answered: the next booking is a new attempt.
        expect(window.sessionStorage.getItem("saroh.booking-attempt")).toBe(
            null,
        );
    });
});
