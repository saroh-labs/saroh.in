import {
    fireEvent,
    render,
    screen,
    waitFor,
    within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SignedInCustomer } from "../account/api";
import type { Result, SignedInBookRequest } from "./api";
import type { BookingAccount } from "./booking-flow";
import BookingFlow from "./booking-flow";
import type { BookingPageData, BookResult } from "./model";
import type {
    WaitlistApi,
    WaitlistJoined,
    WaitlistPlace,
    WaitlistPlaces,
} from "./waitlist";
import { fullSessionText, ordinal, waitlistReachText } from "./waitlist";

/**
 * A full class's waitlist on the booking page (round-2 A12, the Pulse
 * Fitness design): a full session still reads and can be chosen — "Full —
 * join waitlist" — and the last step joins its line with nothing to pay.
 * A place held for the customer is booked the normal way; one they wait for
 * can be left. What the page promises follows how they will really hear.
 */

const START = "2026-10-05T13:00:00.000Z";

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
            id: "svc_hiit",
            name: "HIIT class",
            description: null,
            durationMinutes: 45,
            kind: "class",
            capacity: 12,
            priceCents: 50_000,
            currency: "INR",
            online: false,
            staff: ["Ritu Kapoor"],
        },
    ],
};

const FULL_DAYS = {
    timezone: "Asia/Kolkata",
    kind: "class",
    capacity: 12,
    days: [
        {
            date: "2026-10-05",
            open: true,
            starts: [
                {
                    startAt: START,
                    endAt: "2026-10-05T13:45:00.000Z",
                    staffId: "staff_ritu",
                    staffName: "Ritu Kapoor",
                    placesLeft: 0,
                },
            ],
        },
    ],
};

const ASHA: SignedInCustomer = { email: "asha@example.in", name: "Asha Rao" };

const booked: BookResult = {
    reference: "bk_1",
    startAt: START,
    endAt: "2026-10-05T13:45:00.000Z",
    serviceName: "HIIT class",
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

function serve() {
    globalThis.fetch = vi.fn(() => Promise.resolve(json(FULL_DAYS)));
}

const ok = <T,>(value: T): Promise<Result<T>> =>
    Promise.resolve({ ok: true, value });

function waitlist(
    over: Partial<WaitlistApi> & { places?: WaitlistPlace[] } = {},
): WaitlistApi & {
    mine: ReturnType<typeof vi.fn>;
    join: ReturnType<typeof vi.fn>;
    leave: ReturnType<typeof vi.fn>;
} {
    const joined: WaitlistJoined = {
        startAt: START,
        status: "WAITING",
        placeInLine: 3,
        offeredUntil: null,
        reach: "EMAIL",
    };
    return {
        mine: vi.fn(
            over.mine ??
                (() => ok<WaitlistPlaces>({ places: over.places ?? [] })),
        ),
        join: vi.fn(over.join ?? (() => ok(joined))),
        leave: vi.fn(over.leave ?? (() => ok({ left: true }))),
    };
}

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
        book: vi.fn((_: SignedInBookRequest) => ok(booked)),
        signOut: vi.fn(() => Promise.resolve({ ok: true })),
        ...over,
    };
}

async function pickFullSession(label = /Full — join waitlist/) {
    fireEvent.click(screen.getByRole("radio", { name: /HIIT class/ }));
    fireEvent.click(await screen.findByRole("radio", { name: label }));
}

/** The confirm button: the aside's, the last one drawn. */
function confirmButton(name: RegExp): HTMLElement {
    const all = screen.getAllByRole("button", { name });
    return all[all.length - 1];
}

const realFetch = globalThis.fetch;
beforeEach(() => {
    window.matchMedia = vi.fn(() => ({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
    })) as unknown as typeof window.matchMedia;
    serve();
});
afterEach(() => {
    globalThis.fetch = realFetch;
});

describe("the waitlist's words", () => {
    it("says places in line as ordinals", () => {
        expect([1, 2, 3, 4, 11, 12, 13, 21, 22].map(ordinal)).toEqual([
            "1st",
            "2nd",
            "3rd",
            "4th",
            "11th",
            "12th",
            "13th",
            "21st",
            "22nd",
        ]);
    });

    it("labels a full session by where the customer stands", () => {
        const zone = "Asia/Kolkata";
        expect(fullSessionText(undefined, zone)).toBe("Full — join waitlist");
        expect(
            fullSessionText(
                {
                    startAt: START,
                    status: "WAITING",
                    placeInLine: 2,
                    offeredUntil: null,
                },
                zone,
            ),
        ).toBe("On the waitlist · 2nd");
        expect(
            fullSessionText(
                {
                    startAt: START,
                    status: "OFFERED",
                    placeInLine: null,
                    offeredUntil: "2026-10-05T09:30:00.000Z",
                },
                zone,
            ),
        ).toBe("Held for you until 15:00");
    });

    it("promises only the way they will really hear", () => {
        expect(waitlistReachText("EMAIL", "a@x.in")).toContain("email a@x.in");
        expect(waitlistReachText("ACCOUNT", "a@x.in")).toContain(
            "your account on this site",
        );
        const none = waitlistReachText("NONE", "a@x.in");
        expect(none).not.toMatch(/email|text|SMS|WhatsApp/i);
        expect(none).toContain("Come back to this page");
    });
});

describe("a full class on the booking page (A12)", () => {
    it("is closed, as before, when the site offers no waitlist", async () => {
        render(<BookingFlow page={PAGE} account={account()} apiUrl="x" />);
        fireEvent.click(screen.getByRole("radio", { name: /HIIT class/ }));
        const full = await screen.findByRole("radio", { name: /Full/ });
        expect(full).toBeDisabled();
        expect(full).not.toHaveTextContent("join waitlist");
    });

    it("joins the line with nothing to pay, and says how they'll hear", async () => {
        const wl = waitlist();
        const acc = account({ waitlist: wl });
        render(<BookingFlow page={PAGE} account={acc} apiUrl="x" />);
        await pickFullSession();

        expect(screen.getByText("Waitlist")).toBeInTheDocument();
        expect(screen.getByText("₹0")).toBeInTheDocument();
        // No way to pay: nothing is charged to wait.
        expect(screen.queryByRole("radiogroup", { name: /pay/i })).toBeNull();

        fireEvent.click(confirmButton(/Join the waitlist/));
        expect(
            await screen.findByRole("heading", {
                name: "You're on the waitlist, Asha.",
            }),
        ).toBeInTheDocument();
        expect(wl.join).toHaveBeenCalledWith({
            serviceId: "svc_hiit",
            startAt: START,
        });
        expect(acc.book).not.toHaveBeenCalled();
        expect(screen.getByText("You're 3rd in line.")).toBeInTheDocument();
        expect(
            screen.getByText(
                "If a place frees up, we'll hold it for you and email asha@example.in.",
            ),
        ).toBeInTheDocument();
        expect(
            screen.getByText(/Nothing is charged until you book it\./),
        ).toBeInTheDocument();
    });

    it("signs in first, then joins", async () => {
        const wl = waitlist();
        render(
            <BookingFlow
                page={PAGE}
                account={account({ customer: null, waitlist: wl })}
                apiUrl="x"
            />,
        );
        await pickFullSession();
        fireEvent.change(screen.getByLabelText("Name"), {
            target: { value: "Asha Rao" },
        });
        fireEvent.click(confirmButton(/Continue to sign in/));
        expect(wl.join).not.toHaveBeenCalled();
        const sheet = await screen.findByRole("dialog");
        fireEvent.change(within(sheet).getByLabelText("Email"), {
            target: { value: "asha@example.in" },
        });
        fireEvent.click(
            within(sheet).getByRole("button", { name: "Send code" }),
        );
        fireEvent.change(await within(sheet).findByLabelText("Code"), {
            target: { value: "123456" },
        });
        fireEvent.click(within(sheet).getByRole("button", { name: "Sign in" }));
        await waitFor(() => expect(wl.join).toHaveBeenCalled());
        expect(
            await screen.findByRole("heading", { name: /on the waitlist/ }),
        ).toBeInTheDocument();
    });

    it("says there's room, and reads the times again, when a place is free", async () => {
        const wl = waitlist({
            join: () =>
                Promise.resolve({
                    ok: false,
                    status: 409,
                    message: "There's room — book it.",
                    reason: "room",
                }),
        });
        render(
            <BookingFlow
                page={PAGE}
                account={account({ waitlist: wl })}
                apiUrl="x"
            />,
        );
        await pickFullSession();
        const reads = vi.mocked(globalThis.fetch).mock.calls.length;
        fireEvent.click(confirmButton(/Join the waitlist/));
        expect(
            await screen.findByText("There's room — book it."),
        ).toBeInTheDocument();
        await waitFor(() =>
            expect(vi.mocked(globalThis.fetch).mock.calls.length).toBe(
                reads + 1,
            ),
        );
    });

    it("says an eleventh join is refused, in its own words", async () => {
        const words =
            "You're on 10 waitlists already. Leave one to join another.";
        const wl = waitlist({
            join: () =>
                Promise.resolve({
                    ok: false,
                    status: 409,
                    message: words,
                    reason: "too-many",
                }),
        });
        render(
            <BookingFlow
                page={PAGE}
                account={account({ waitlist: wl })}
                apiUrl="x"
            />,
        );
        await pickFullSession();
        fireEvent.click(confirmButton(/Join the waitlist/));
        expect(await screen.findByText(words)).toBeInTheDocument();
    });

    it("books a place held for them the normal way", async () => {
        const wl = waitlist({
            places: [
                {
                    startAt: START,
                    status: "OFFERED",
                    placeInLine: null,
                    offeredUntil: "2026-10-05T09:30:00.000Z",
                },
            ],
        });
        const acc = account({ waitlist: wl });
        render(<BookingFlow page={PAGE} account={acc} apiUrl="x" />);
        await pickFullSession(/Held for you until 15:00/);
        fireEvent.click(confirmButton(/Book — pay at the desk/));
        expect(
            await screen.findByRole("heading", {
                name: "You're booked, Asha.",
            }),
        ).toBeInTheDocument();
        expect(acc.book).toHaveBeenCalledWith(
            expect.objectContaining({ startAt: START, pay: "DESK" }),
        );
        expect(wl.join).not.toHaveBeenCalled();
    });

    it("lets them leave a line they are in", async () => {
        const wl = waitlist({
            places: [
                {
                    startAt: START,
                    status: "WAITING",
                    placeInLine: 2,
                    offeredUntil: null,
                },
            ],
        });
        render(
            <BookingFlow
                page={PAGE}
                account={account({ waitlist: wl })}
                apiUrl="x"
            />,
        );
        await pickFullSession(/On the waitlist · 2nd/);
        fireEvent.click(confirmButton(/Leave the waitlist/));
        await waitFor(() =>
            expect(wl.leave).toHaveBeenCalledWith({
                serviceId: "svc_hiit",
                startAt: START,
            }),
        );
        expect(
            await screen.findByText("You've left the waitlist for that class."),
        ).toBeInTheDocument();
        expect(
            screen.getByRole("radio", { name: /Full — join waitlist/ }),
        ).toBeInTheDocument();
    });
});
