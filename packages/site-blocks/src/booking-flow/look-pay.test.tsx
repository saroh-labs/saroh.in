import {
    act,
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
import type { CheckoutOutcome, CheckoutRequest } from "./checkout";
import type { BookingPageData } from "./model";
import { isBookResult } from "./model";

/**
 * Paying now in a look (DEC-172, plan U10): the pay step's button carries
 * the price; paying holds the time; what the screen says is only what is
 * known — the window open, didn't go through, waiting for it to come
 * through — and the same hold and watch as Classic.
 */

vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
    usePathname: () => "/book",
}));

const checkouts = vi.hoisted(() => ({
    opened: [] as {
        request: CheckoutRequest;
        answer: (outcome: CheckoutOutcome) => void;
    }[],
}));
vi.mock("./checkout", () => ({
    openProviderCheckout: (request: CheckoutRequest) => {
        let answer: (outcome: CheckoutOutcome) => void = () => undefined;
        const outcome = new Promise<CheckoutOutcome>((resolve) => {
            answer = resolve;
        });
        checkouts.opened.push({ request, answer });
        return { outcome, close: () => undefined };
    },
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

function serve() {
    globalThis.fetch = vi.fn((url: string) => {
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
        if (url.endsWith("/book")) {
            return Promise.resolve(
                json(
                    {
                        reference: "PY-1",
                        startAt: EIGHT,
                        endAt: "2026-10-22T03:30:00.000Z",
                        serviceName: "Private session",
                        online: false,
                        meetingUrl: null,
                        state: "HELD",
                        holdExpiresAt: "2026-10-20T10:15:00.000Z",
                        payToken: "tok_1",
                    },
                    201,
                ),
            );
        }
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
        signIn: {
            requestCode: vi.fn(),
            verifyCode: vi.fn(),
        },
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
    checkouts.opened = [];
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

describe("paying now, in a look", () => {
    it("puts the price on the button, holds the time and says only what is known", async () => {
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
        // The time is chosen once its day is read.
        await waitFor(() =>
            expect(action()).not.toHaveAttribute("aria-disabled"),
        );
        fireEvent.click(action());
        await waitFor(() =>
            expect(
                new URLSearchParams(window.location.search).get("step"),
            ).toBe("pay"),
        );
        fireEvent.click(screen.getByRole("radio", { name: /Pay ₹2,500 now/ }));
        expect(action()).toHaveTextContent("Pay ₹2,500 and book");
        expect(
            screen.getByText(/We hold 8:00 am for you for 15 minutes/),
        ).toBeVisible();

        await act(async () => {
            fireEvent.click(action());
            await Promise.resolve();
        });
        expect(
            await screen.findByRole("heading", {
                name: "Pay in the payment window",
            }),
        ).toBeVisible();
        await waitFor(() => expect(checkouts.opened).toHaveLength(1));

        await act(async () => {
            checkouts.opened[0]?.answer("failed");
            await Promise.resolve();
        });
        expect(
            await screen.findByRole("heading", {
                name: "The payment didn't go through",
            }),
        ).toBeVisible();
        expect(
            screen.getByRole("button", { name: "Try again · Pay ₹2,500" }),
        ).toBeVisible();
        expect(
            screen.getByRole("button", { name: "Pay at the desk instead" }),
        ).toBeVisible();

        await act(async () => {
            fireEvent.click(
                screen.getByRole("button", { name: "Try again · Pay ₹2,500" }),
            );
            await Promise.resolve();
        });
        await act(async () => {
            checkouts.opened[1]?.answer("paid");
            await Promise.resolve();
        });
        expect(
            await screen.findByRole("heading", {
                name: "Waiting for your payment to come through",
            }),
        ).toBeVisible();
        expect(screen.queryByRole("button", { name: /Try again/ })).toBeNull();
    });
});
