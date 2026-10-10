import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SignedInCustomer } from "../account/api";
import type { SignedInBookRequest } from "./api";
import { resultOf } from "./api";
import type { BookingAccount } from "./booking-flow";
import BookingFlow, { accountPhone } from "./booking-flow";
import type { BookingPageData } from "./model";
import { isBookResult } from "./model";

/**
 * The booking page for a customer coming back: what the page already knows
 * about them is there, and nothing they chose is asked for twice.
 */

const API = "https://api.test";

const PAGE: BookingPageData = {
    businessName: "Pulse Fitness",
    open: true,
    timezone: "Asia/Kolkata",
    payOnline: false,
    rules: {
        bookAheadDays: 21,
        latestBookingMinutes: 120,
        freeCancelHours: 12,
    },
    services: [
        {
            id: "svc_pt",
            name: "Personal training",
            description: null,
            durationMinutes: 60,
            kind: "one",
            capacity: 1,
            priceCents: 120_000,
            currency: "INR",
            online: false,
            staff: ["Karan Mehta"],
        },
    ],
};

const ONE_DAYS = {
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
                    endAt: "2026-09-20T02:30:00.000Z",
                    staffId: "staff_karan",
                    staffName: "Karan Mehta",
                    placesLeft: null,
                },
            ],
        },
    ],
};

const ASHA: SignedInCustomer = {
    email: "asha@example.com",
    name: "Asha Rao",
    phone: "+91 98450 12345",
};

function account(over: Partial<BookingAccount> = {}): BookingAccount {
    return {
        customer: ASHA,
        options: {
            businessName: "Pulse Fitness",
            phone: null,
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
        ...over,
    };
}

const booked = {
    reference: "bk_1",
    startAt: "2026-09-20T01:30:00.000Z",
    endAt: "2026-09-20T02:30:00.000Z",
    serviceName: "Personal training",
    online: false,
    meetingUrl: null,
    state: "CONFIRMED",
    holdExpiresAt: null,
    payToken: null,
};

function json(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
    });
}

let calls: { url: string; init?: RequestInit }[];
function serve(handler: (url: string) => Response) {
    calls = [];
    globalThis.fetch = vi.fn((input: string, init?: RequestInit) => {
        calls.push({ url: input, init });
        return Promise.resolve(handler(input));
    }) as unknown as typeof fetch;
}

const realFetch = globalThis.fetch;
beforeEach(() => {
    window.sessionStorage.clear();
    window.matchMedia = vi.fn(() => ({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
    })) as unknown as typeof window.matchMedia;
});
afterEach(() => {
    globalThis.fetch = realFetch;
});

async function chooseOneToOne() {
    fireEvent.click(screen.getByRole("radio", { name: /Personal training/ }));
    fireEvent.click(
        await screen.findByRole("radio", { name: "07:00 with Karan Mehta" }),
    );
}

describe("the phone on the booking page, for a signed-in customer", () => {
    it("is theirs already, and is sent with the booking", async () => {
        serve((url) =>
            url.endsWith("/days") ? json(ONE_DAYS) : json(booked, 201),
        );
        render(<BookingFlow page={PAGE} apiUrl={API} account={account()} />);
        await chooseOneToOne();
        const phone = screen.getByLabelText("Phone (optional)");
        expect(phone).toHaveValue("+91 98450 12345");
        expect(phone).not.toBeRequired();
        fireEvent.click(screen.getByRole("button", { name: /^Book/ }));
        await screen.findByRole("heading", { name: "You're booked, Asha." });
        const post = calls.find((c) => c.url.endsWith("/book"));
        expect(JSON.parse(post?.init?.body as string)).toMatchObject({
            bookerPhone: "+91 98450 12345",
        });
    });

    it("can be changed or emptied for this booking", async () => {
        serve((url) =>
            url.endsWith("/days") ? json(ONE_DAYS) : json(booked, 201),
        );
        render(<BookingFlow page={PAGE} apiUrl={API} account={account()} />);
        await chooseOneToOne();
        fireEvent.change(screen.getByLabelText("Phone (optional)"), {
            target: { value: "" },
        });
        fireEvent.click(screen.getByRole("button", { name: /^Book/ }));
        await screen.findByRole("heading", { name: "You're booked, Asha." });
        const post = calls.find((c) => c.url.endsWith("/book"));
        expect(JSON.parse(post?.init?.body as string)).not.toHaveProperty(
            "bookerPhone",
        );
    });

    it("is left empty when the account has none, or one the booking wouldn't take", () => {
        expect(accountPhone(null)).toBe("");
        expect(accountPhone({ email: "a@example.com", name: null })).toBe("");
        expect(
            accountPhone({
                email: "a@example.com",
                name: null,
                phone: "080 4099 2210 ext 4",
            }),
        ).toBe("");
        expect(
            accountPhone({
                email: "a@example.com",
                name: null,
                phone: " 98450 12345 ",
            }),
        ).toBe("98450 12345");
    });
});
