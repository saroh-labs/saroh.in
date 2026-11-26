import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SignedInCustomer } from "../account/api";
import type { SignedInBookRequest } from "./api";
import { resultOf } from "./api";
import type { BookingAccount } from "./booking-flow";
import BookingFlow from "./booking-flow";
import { payWords } from "./flow-words";
import type { BookingPageData } from "./model";
import { isBookResult, servicePickPrice } from "./model";
import { pressDay } from "./test-press-day";

/**
 * A free service on the booking page (DEC-261): "Free" where the price
 * would be, no way to pay asked, "Book" on the button, and a confirmation
 * that never mentions paying.
 */

const API = "https://api.test";

const FREE_TRIAL = {
    id: "svc_trial",
    name: "Free trial class",
    description: null,
    durationMinutes: 45,
    kind: "one" as const,
    capacity: 1,
    priceCents: 0,
    currency: "INR",
    online: false,
    staff: ["Karan Mehta"],
};

const PAGE: BookingPageData = {
    businessName: "Pulse Fitness",
    open: true,
    timezone: "Asia/Kolkata",
    payOnline: true,
    rules: {
        bookAheadDays: 21,
        latestBookingMinutes: 120,
        freeCancelHours: 12,
    },
    services: [FREE_TRIAL],
};

const DAYS = {
    timezone: "Asia/Kolkata",
    kind: "one",
    capacity: 1,
    days: [
        {
            date: "2026-09-20",
            open: true,
            starts: [
                {
                    startAt: "2026-09-20T01:30:00.000Z",
                    endAt: "2026-09-20T02:15:00.000Z",
                    staffId: "staff_karan",
                    staffName: "Karan Mehta",
                    placesLeft: null,
                },
            ],
        },
    ],
};

const ASHA: SignedInCustomer = { email: "asha@example.in", name: "Asha Rao" };

let calls: { url: string; init?: RequestInit }[] = [];

function json(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
    });
}

function account(): BookingAccount {
    return {
        customer: ASHA,
        options: {
            businessName: "Pulse Fitness",
            phone: "+91 80 4120 8800",
            challenge: { required: false, siteKey: null },
        },
        signIn: {
            requestCode: vi.fn(() =>
                Promise.resolve({ ok: true as const, resendAfterSeconds: 30 }),
            ),
            verifyCode: vi.fn(() =>
                Promise.resolve({ ok: true as const, customer: ASHA }),
            ),
        },
        book: async ({ serviceId, ...rest }: SignedInBookRequest) => {
            const res = await fetch(
                `${API}/signed-in/services/${serviceId}/book`,
                {
                    method: "POST",
                    body: JSON.stringify({ serviceId, ...rest }),
                },
            );
            const body: unknown = await res.json().catch(() => null);
            return resultOf(res.status, body, isBookResult);
        },
        signOut: vi.fn(() => Promise.resolve({ ok: true })),
    };
}

const realFetch = globalThis.fetch;
beforeEach(() => {
    window.sessionStorage.clear();
    window.matchMedia = vi.fn(() => ({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
    })) as unknown as typeof window.matchMedia;
    calls = [];
    globalThis.fetch = vi.fn((input: string, init?: RequestInit) => {
        calls.push({ url: input, init });
        return Promise.resolve(
            input.endsWith("/days")
                ? json(DAYS)
                : json(
                      {
                          reference: "bk_1",
                          startAt: "2026-09-20T01:30:00.000Z",
                          endAt: "2026-09-20T02:15:00.000Z",
                          serviceName: "Free trial class",
                          online: false,
                          meetingUrl: null,
                          state: "CONFIRMED",
                          holdExpiresAt: null,
                          payToken: null,
                      },
                      201,
                  ),
        );
    }) as unknown as typeof fetch;
});
afterEach(() => {
    globalThis.fetch = realFetch;
    window.sessionStorage.clear();
});

describe("a free service's words (DEC-261)", () => {
    it('says "Free" where a price would be, never "₹0"', () => {
        expect(servicePickPrice(FREE_TRIAL)).toBe("Free");
        // No price at all is not free.
        expect(servicePickPrice({ ...FREE_TRIAL, priceCents: null })).toBe(
            null,
        );
    });

    it("offers no way to pay and books with Book", () => {
        const words = payWords({
            page: PAGE,
            service: FREE_TRIAL,
            credit: {
                kind: "PACK",
            } as unknown as Parameters<typeof payWords>[0]["credit"],
            payChoice: null,
            signedIn: true,
            waitMode: null,
        });
        expect(words.free).toBe(true);
        expect(words.choices).toEqual([]);
        expect(words.unpayable).toBeNull();
        expect(words.price).toBeNull();
        expect(words.due).toBe("Free");
        expect(words.confirmLabel).toBe("Book");
        expect(words.barLabel).toBe("Book");
    });
});

describe("booking a free service (DEC-261)", () => {
    it("books straight away and confirms without a word about paying", async () => {
        render(
            <BookingFlow
                siteId="site_1"
                page={PAGE}
                apiUrl={API}
                account={account()}
            />,
        );
        fireEvent.click(
            screen.getByRole("radio", { name: /Free trial class/ }),
        );
        await pressDay();
        fireEvent.click(
            await screen.findByRole("radio", {
                name: "7:00 am with Karan Mehta",
            }),
        );
        expect(screen.queryByRole("radio", { name: /Pay at the desk/ })).toBe(
            null,
        );
        fireEvent.click(screen.getByRole("button", { name: "Book" }));

        expect(
            await screen.findByText("It's free. There's nothing to pay."),
        ).toBeInTheDocument();
        expect(document.body.textContent).not.toMatch(
            /pay at the|front desk|₹0|pay later/i,
        );
    });
});
