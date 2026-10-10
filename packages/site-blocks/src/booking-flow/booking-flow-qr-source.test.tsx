import {
    fireEvent,
    render,
    screen,
    waitFor,
    within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SignedInCustomer } from "../account/api";
import type { BookSignedIn, SignedInBookRequest } from "./api";
import type { BookingAccount } from "./booking-flow";
import BookingFlow from "./booking-flow";
import type { BookingPageData } from "./model";

vi.mock("./checkout", () => ({
    openProviderCheckout: () => ({
        outcome: new Promise(() => undefined),
        close: () => undefined,
    }),
}));

/**
 * The QR code a booking came from (`qr-source.ts`): the tag on the booking
 * page's address is sent with the booking, through every step, and is kept
 * nowhere a later visit could read it.
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
                    endAt: "2026-09-20T02:30:00.000Z",
                    staffId: "staff_karan",
                    staffName: "Karan Mehta",
                    placesLeft: null,
                },
            ],
        },
    ],
};

const BOOKED = {
    reference: "bk_1",
    startAt: "2026-09-20T01:30:00.000Z",
    endAt: "2026-09-20T02:30:00.000Z",
    serviceName: "Personal training",
    online: false,
    meetingUrl: null,
    state: "CONFIRMED" as const,
    holdExpiresAt: null,
    payToken: null,
};

const ASHA: SignedInCustomer = { email: "asha@example.com", name: "Asha Rao" };

function account(
    book: BookSignedIn,
    over: Partial<BookingAccount> = {},
): BookingAccount {
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
        book,
        signOut: vi.fn(() => Promise.resolve({ ok: true })),
        ...over,
    };
}

/** A stand-in for the site's booking action that records what it was sent. */
function booking() {
    const sent: SignedInBookRequest[] = [];
    const book: BookSignedIn = (request) => {
        sent.push(request);
        return Promise.resolve({
            ok: true as const,
            value: BOOKED,
        });
    };
    return { sent, book };
}

function openAt(address: string) {
    window.history.replaceState({}, "", address);
}

async function chooseAndPay() {
    fireEvent.click(screen.getByRole("radio", { name: /Personal training/ }));
    fireEvent.click(
        await screen.findByRole("radio", { name: "07:00 with Karan Mehta" }),
    );
    const desk = screen.queryByRole("radio", { name: /Pay at the desk/ });
    if (desk) fireEvent.click(desk);
}

const realFetch = globalThis.fetch;
beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    window.matchMedia = vi.fn(() => ({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
    })) as unknown as typeof window.matchMedia;
    globalThis.fetch = vi.fn(() =>
        Promise.resolve(
            new Response(JSON.stringify(DAYS), {
                status: 200,
                headers: { "content-type": "application/json" },
            }),
        ),
    );
});
afterEach(() => {
    globalThis.fetch = realFetch;
    openAt("/");
});

describe("the QR code a booking came from", () => {
    it("sends the tag on the page's address with the booking", async () => {
        openAt("/book?src=qr-h7c");
        const { sent, book } = booking();
        render(
            <BookingFlow page={PAGE} apiUrl={API} account={account(book)} />,
        );
        await chooseAndPay();
        fireEvent.click(
            screen.getByRole("button", { name: "Book — pay at the desk" }),
        );
        await screen.findByRole("heading", { name: "You're booked, Asha." });
        expect(sent).toHaveLength(1);
        expect(sent[0]).toMatchObject({
            serviceId: "svc_pt",
            source: "qr-h7c",
        });
    });

    it("keeps it through the sign-in sheet", async () => {
        openAt("/book?service=svc_pt&src=qr-h7c");
        const { sent, book } = booking();
        render(
            <BookingFlow
                page={PAGE}
                apiUrl={API}
                initialServiceId="svc_pt"
                account={account(book, { customer: null })}
            />,
        );
        fireEvent.click(
            await screen.findByRole("radio", {
                name: "07:00 with Karan Mehta",
            }),
        );
        fireEvent.change(screen.getByLabelText("Name"), {
            target: { value: "Asha Rao" },
        });
        const desk = screen.queryByRole("radio", { name: /Pay at the desk/ });
        if (desk) fireEvent.click(desk);
        fireEvent.click(
            screen.getByRole("button", { name: "Continue to sign in" }),
        );
        const sheet = await screen.findByRole("dialog");
        expect(sent).toHaveLength(0);
        fireEvent.change(within(sheet).getByLabelText("Email"), {
            target: { value: "asha@example.com" },
        });
        fireEvent.click(
            within(sheet).getByRole("button", { name: "Send code" }),
        );
        fireEvent.change(await within(sheet).findByLabelText("Code"), {
            target: { value: "123456" },
        });
        fireEvent.click(within(sheet).getByRole("button", { name: "Sign in" }));

        await waitFor(() => expect(sent).toHaveLength(1));
        expect(sent[0]?.source).toBe("qr-h7c");
    });

    it("sends no source from a page whose address has no tag", async () => {
        openAt("/book");
        const { sent, book } = booking();
        render(
            <BookingFlow page={PAGE} apiUrl={API} account={account(book)} />,
        );
        await chooseAndPay();
        fireEvent.click(
            screen.getByRole("button", { name: "Book — pay at the desk" }),
        );
        await waitFor(() => expect(sent).toHaveLength(1));
        expect(sent[0]).not.toHaveProperty("source");
    });

    it("ignores a tag that isn't a QR code's", async () => {
        openAt("/book?src=newsletter");
        const { sent, book } = booking();
        render(
            <BookingFlow page={PAGE} apiUrl={API} account={account(book)} />,
        );
        await chooseAndPay();
        fireEvent.click(
            screen.getByRole("button", { name: "Book — pay at the desk" }),
        );
        await waitFor(() => expect(sent).toHaveLength(1));
        expect(sent[0]).not.toHaveProperty("source");
    });

    it("keeps the tag in no cookie and no storage", async () => {
        openAt("/book?src=qr-h7c");
        const { sent, book } = booking();
        const { unmount } = render(
            <BookingFlow page={PAGE} apiUrl={API} account={account(book)} />,
        );
        await chooseAndPay();
        fireEvent.click(
            screen.getByRole("button", { name: "Book — pay at the desk" }),
        );
        await waitFor(() => expect(sent).toHaveLength(1));

        const kept = [
            document.cookie,
            JSON.stringify({ ...window.localStorage }),
            JSON.stringify({ ...window.sessionStorage }),
        ].join("\n");
        expect(kept).not.toContain("qr-");
        expect(kept).not.toContain("h7c");

        // The booking page opened again without the tag: nothing remembers.
        unmount();
        openAt("/book");
        render(
            <BookingFlow page={PAGE} apiUrl={API} account={account(book)} />,
        );
        await chooseAndPay();
        fireEvent.click(
            screen.getByRole("button", { name: "Book — pay at the desk" }),
        );
        await waitFor(() => expect(sent).toHaveLength(2));
        expect(sent[1]).not.toHaveProperty("source");
    });
});
