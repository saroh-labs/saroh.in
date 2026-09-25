import {
    act,
    fireEvent,
    render,
    screen,
    waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import BookingFlow from "./booking-flow";
import type { BookingPageData } from "./model";

/**
 * The booking page's flow in jsdom (U19): what it asks the API, what it
 * shows back. Layout and the four scenes are the browser pass's; this pins
 * the choices, the words and the requests.
 */

const API = "https://api.test";

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

const ONE_DAYS = {
    timezone: "Asia/Kolkata",
    kind: "one",
    capacity: 1,
    days: [
        { date: "2026-09-18", open: true, starts: [] },
        { date: "2026-09-19", open: false, starts: [] },
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

const CLASS_DAYS = {
    timezone: "Asia/Kolkata",
    kind: "class",
    capacity: 12,
    days: [
        {
            date: "2026-09-20",
            open: true,
            starts: [
                {
                    startAt: "2026-09-20T01:30:00.000Z",
                    endAt: "2026-09-20T02:15:00.000Z",
                    staffId: "staff_ritu",
                    staffName: "Ritu Kapoor",
                    placesLeft: 0,
                },
                {
                    startAt: "2026-09-20T13:00:00.000Z",
                    endAt: "2026-09-20T13:45:00.000Z",
                    staffId: "staff_ritu",
                    staffName: "Ritu Kapoor",
                    placesLeft: 2,
                },
            ],
        },
    ],
};

const booked = (over: Record<string, unknown> = {}) => ({
    reference: "bk_1",
    startAt: "2026-09-20T01:30:00.000Z",
    endAt: "2026-09-20T02:30:00.000Z",
    serviceName: "Personal training",
    online: false,
    meetingUrl: null,
    state: "CONFIRMED",
    holdExpiresAt: null,
    payToken: null,
    ...over,
});

function json(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
    });
}

type Handler = (url: string, init?: RequestInit) => Response;
let calls: { url: string; init?: RequestInit }[];

function serve(handler: Handler) {
    calls = [];
    globalThis.fetch = vi.fn((input: string, init?: RequestInit) => {
        const url = input;
        calls.push({ url, init });
        return Promise.resolve(handler(url, init));
    }) as unknown as typeof fetch;
}

const realFetch = globalThis.fetch;
beforeEach(() => {
    window.matchMedia = vi.fn(() => ({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
    })) as unknown as typeof window.matchMedia;
});
afterEach(() => {
    globalThis.fetch = realFetch;
    vi.useRealTimers();
});

async function chooseOneToOne() {
    fireEvent.click(screen.getByRole("radio", { name: /Personal training/ }));
    await screen.findByRole("radio", { name: "07:00 with Karan Mehta" });
    fireEvent.click(
        screen.getByRole("radio", { name: "07:00 with Karan Mehta" }),
    );
    fireEvent.change(screen.getByLabelText("Name"), {
        target: { value: "Asha Rao" },
    });
    fireEvent.change(screen.getByLabelText("Email"), {
        target: { value: "asha@example.in" },
    });
}

describe("the booking page (U19)", () => {
    it("says a day is Full or Closed, and opens on the first free one", async () => {
        serve(() => json(ONE_DAYS));
        render(<BookingFlow page={PAGE} apiUrl={API} />);
        fireEvent.click(
            screen.getByRole("radio", { name: /Personal training/ }),
        );

        expect(
            await screen.findByRole("radio", { name: "Fri 18 Sep: full" }),
        ).toBeDisabled();
        expect(
            screen.getByRole("radio", { name: "Sat 19 Sep: closed" }),
        ).toBeDisabled();
        expect(
            screen.getByRole("radio", { name: "Sun 20 Sep: 1 time free" }),
        ).toHaveAttribute("aria-checked", "true");
        expect(calls[0]?.url).toBe(`${API}/public/services/svc_pt/days`);
    });

    it("books at the desk, and confirms without promising a message", async () => {
        serve((url) =>
            url.endsWith("/days") ? json(ONE_DAYS) : json(booked(), 201),
        );
        render(<BookingFlow page={PAGE} apiUrl={API} />);
        await chooseOneToOne();
        fireEvent.click(screen.getByRole("radio", { name: /Pay at the desk/ }));
        fireEvent.click(
            screen.getByRole("button", { name: "Book — pay at the desk" }),
        );

        expect(
            await screen.findByRole("heading", {
                name: "You're booked, Asha.",
            }),
        ).toBeInTheDocument();
        expect(
            screen.getByText("Pay ₹1,200 at the front desk when you arrive."),
        ).toBeInTheDocument();
        expect(document.body.textContent).not.toMatch(
            /on its way|we'll text|we'll email|confirmation link/i,
        );

        const post = calls.find((c) => c.url.endsWith("/book"));
        const body = JSON.parse(post?.init?.body as string) as Record<
            string,
            unknown
        >;
        expect(body).toMatchObject({
            startAt: "2026-09-20T01:30:00.000Z",
            bookerName: "Asha Rao",
            bookerEmail: "asha@example.in",
            staffId: "staff_karan",
            pay: "DESK",
        });
        expect(body).not.toHaveProperty("amount");
        expect(typeof body.idempotencyKey).toBe("string");
    });

    it("pays now: holds the place, starts the payment, and confirms when the hold does", async () => {
        let holdState = "HELD";
        serve((url) => {
            if (url.endsWith("/days")) return json(ONE_DAYS);
            if (url.endsWith("/book")) {
                return json(
                    booked({
                        state: "HELD",
                        holdExpiresAt: "2026-09-18T04:15:00.000Z",
                        payToken: "tok_1",
                    }),
                    201,
                );
            }
            if (url.endsWith("/payment-intent")) {
                return json({
                    paymentIntentId: "pi_1",
                    provider: "RAZORPAY",
                    providerIntentId: "order_1",
                    amountCents: 120_000,
                    currency: "INR",
                    publicKey: null,
                    clientParams: {},
                });
            }
            return json({ state: holdState, holdExpiresAt: null });
        });
        render(<BookingFlow page={PAGE} apiUrl={API} />);
        await chooseOneToOne();
        vi.useFakeTimers({ shouldAdvanceTime: true });
        fireEvent.click(
            screen.getByRole("button", { name: "Pay ₹1,200 and book" }),
        );

        expect(
            await screen.findByRole("heading", {
                name: "Pay ₹1,200 to confirm your place",
            }),
        ).toBeInTheDocument();
        await screen.findByText("Razorpay checkout opens here");
        const intent = calls.find((c) => c.url.endsWith("/payment-intent"));
        expect(intent?.url).toBe(`${API}/public/invoices/tok_1/payment-intent`);
        expect(JSON.parse(intent?.init?.body as string)).not.toHaveProperty(
            "amount",
        );

        holdState = "CONFIRMED";
        await act(async () => {
            await vi.advanceTimersByTimeAsync(4_500);
        });
        await waitFor(() =>
            expect(
                screen.getByRole("heading", { name: "You're booked, Asha." }),
            ).toBeInTheDocument(),
        );
        expect(screen.getByText("Paid ₹1,200 online.")).toBeInTheDocument();
    });

    it("says so when the hold runs out", async () => {
        serve((url) => {
            if (url.endsWith("/days")) return json(ONE_DAYS);
            if (url.endsWith("/book")) {
                return json(
                    booked({
                        state: "HELD",
                        holdExpiresAt: "2026-09-18T04:15:00.000Z",
                        payToken: "tok_1",
                    }),
                    201,
                );
            }
            if (url.endsWith("/payment-intent")) return json({}, 500);
            return json({ state: "RELEASED", holdExpiresAt: null });
        });
        render(<BookingFlow page={PAGE} apiUrl={API} />);
        await chooseOneToOne();
        vi.useFakeTimers({ shouldAdvanceTime: true });
        fireEvent.click(
            screen.getByRole("button", { name: "Pay ₹1,200 and book" }),
        );
        expect(
            await screen.findByText(
                "The business can't take payment online right now.",
            ),
        ).toBeInTheDocument();
        await act(async () => {
            await vi.advanceTimersByTimeAsync(4_500);
        });
        expect(
            await screen.findByRole("heading", {
                name: "The time held for you ran out",
            }),
        ).toBeInTheDocument();
    });

    it("tells the booker when the time was just taken, and shows what is left", async () => {
        serve((url) =>
            url.endsWith("/days")
                ? json(ONE_DAYS)
                : json(
                      { error: { message: "This slot is fully booked" } },
                      409,
                  ),
        );
        render(<BookingFlow page={PAGE} apiUrl={API} />);
        await chooseOneToOne();
        fireEvent.click(
            screen.getByRole("button", { name: "Pay ₹1,200 and book" }),
        );
        expect(
            await screen.findByText("This slot is fully booked"),
        ).toBeInTheDocument();
        await waitFor(() =>
            expect(calls.filter((c) => c.url.endsWith("/days"))).toHaveLength(
                2,
            ),
        );
    });

    it.each([
        ["a released hold", { state: "RELEASED" }],
        ["a cancelled hold", { state: "CANCELLED" }],
        ["a hold with no token to pay it", { state: "HELD", payToken: null }],
    ])(
        "never calls a replay of %s booked, and shows the times again (#508)",
        async (_label, answer) => {
            serve((url) =>
                url.endsWith("/days")
                    ? json(ONE_DAYS)
                    : json(
                          booked({
                              holdExpiresAt: "2026-09-18T04:15:00.000Z",
                              ...answer,
                          }),
                          201,
                      ),
            );
            render(<BookingFlow page={PAGE} apiUrl={API} />);
            await chooseOneToOne();
            fireEvent.click(
                screen.getByRole("button", { name: "Pay ₹1,200 and book" }),
            );

            expect(
                await screen.findByText(
                    "That time has gone. Pick another one.",
                ),
            ).toBeInTheDocument();
            expect(
                screen.queryByRole("heading", { name: /You're booked/ }),
            ).toBeNull();
            await waitFor(() =>
                expect(
                    calls.filter((c) => c.url.endsWith("/days")),
                ).toHaveLength(2),
            );
        },
    );

    it("books at the desk after a failed payment once, on a key it keeps for a retry (#508)", async () => {
        let deskAnswers = 0;
        serve((url, init) => {
            if (url.endsWith("/days")) return json(ONE_DAYS);
            if (url.endsWith("/payment-intent")) return json({}, 500);
            if (url.endsWith("/release")) {
                return json({ state: "RELEASED", holdExpiresAt: null });
            }
            if (url.endsWith("/book")) {
                const body = JSON.parse(init?.body as string) as {
                    pay: string;
                };
                if (body.pay === "NOW") {
                    return json(
                        booked({
                            state: "HELD",
                            holdExpiresAt: "2026-09-18T04:15:00.000Z",
                            payToken: "tok_1",
                        }),
                        201,
                    );
                }
                // The first desk booking fails on the way back.
                deskAnswers += 1;
                return deskAnswers === 1 ? json({}, 502) : json(booked(), 201);
            }
            return json({ state: "HELD", holdExpiresAt: null });
        });
        render(<BookingFlow page={PAGE} apiUrl={API} />);
        await chooseOneToOne();
        fireEvent.click(
            screen.getByRole("button", { name: "Pay ₹1,200 and book" }),
        );
        const desk = await screen.findByRole("button", {
            name: "Book it to pay at the desk",
        });
        fireEvent.click(desk);
        fireEvent.click(desk);

        expect(
            await screen.findByText(
                "Something went wrong on our side. Please try again.",
            ),
        ).toBeInTheDocument();
        const deskCalls = () =>
            calls
                .filter((c) => c.url.endsWith("/book"))
                .map(
                    (c) =>
                        JSON.parse(c.init?.body as string) as {
                            pay: string;
                            idempotencyKey: string;
                        },
                )
                .filter((b) => b.pay === "DESK");
        expect(calls.filter((c) => c.url.endsWith("/release"))).toHaveLength(1);
        expect(deskCalls()).toHaveLength(1);

        // Trying again sends the same key.
        fireEvent.click(
            screen.getByRole("button", { name: "Book — pay at the desk" }),
        );
        expect(
            await screen.findByRole("heading", {
                name: "You're booked, Asha.",
            }),
        ).toBeInTheDocument();
        const [first, retry] = deskCalls();
        expect(deskCalls()).toHaveLength(2);
        expect(retry.idempotencyKey).toBe(first.idempotencyKey);
    });

    it("lists a class's sessions with places left, and a full one cannot be picked", async () => {
        serve(() => json(CLASS_DAYS));
        render(<BookingFlow page={PAGE} apiUrl={API} />);
        fireEvent.click(screen.getByRole("radio", { name: /HIIT class/ }));

        const full = await screen.findByRole("radio", { name: /07:00.*Full/ });
        expect(full).toBeDisabled();
        const open = screen.getByRole("radio", {
            name: /18:30.*2 places left/,
        });
        expect(open).toBeEnabled();
        fireEvent.click(open);
        expect(open).toHaveAttribute("aria-checked", "true");
    });

    it("offers only the desk when the business takes no payment online", async () => {
        serve(() => json(ONE_DAYS));
        render(
            <BookingFlow
                page={{ ...PAGE, payOnline: false }}
                apiUrl={API}
                initialServiceId="svc_pt"
            />,
        );
        await screen.findByRole("radio", { name: "07:00 with Karan Mehta" });
        fireEvent.click(
            screen.getByRole("radio", { name: "07:00 with Karan Mehta" }),
        );
        fireEvent.change(screen.getByLabelText("Name"), {
            target: { value: "Asha Rao" },
        });
        fireEvent.change(screen.getByLabelText("Email"), {
            target: { value: "asha@example.in" },
        });
        expect(
            screen.queryByRole("radio", { name: /Pay ₹1,200 for/ }),
        ).toBeNull();
        expect(
            screen.getByRole("button", { name: "Book — pay at the desk" }),
        ).toBeInTheDocument();
    });

    it("says booking is not open when Appointments is off", () => {
        serve(() => json({}));
        render(<BookingFlow page={{ ...PAGE, open: false }} apiUrl={API} />);
        expect(
            screen.getByRole("heading", {
                name: "Online booking isn't open right now",
            }),
        ).toBeInTheDocument();
    });
});
