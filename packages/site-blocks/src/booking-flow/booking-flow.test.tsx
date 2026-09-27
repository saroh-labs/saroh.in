import {
    act,
    fireEvent,
    render,
    screen,
    waitFor,
    within,
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
 * The provider's window (E11), stood in for: each one the page opens is
 * recorded with what it was opened with, and answers when a test says.
 */
const checkouts = vi.hoisted(() => ({
    opened: [] as {
        request: CheckoutRequest;
        answer: (outcome: CheckoutOutcome) => void;
        closed: boolean;
    }[],
}));
vi.mock("./checkout", () => ({
    openProviderCheckout: (request: CheckoutRequest) => {
        let answer: (outcome: CheckoutOutcome) => void = () => undefined;
        const outcome = new Promise<CheckoutOutcome>((resolve) => {
            answer = resolve;
        });
        const made = { request, answer, closed: false };
        checkouts.opened.push(made);
        return {
            outcome,
            close: () => {
                made.closed = true;
            },
        };
    },
}));

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

const ASHA: SignedInCustomer = { email: "asha@example.in", name: "Asha Rao" };

/**
 * The site's server actions, stood in for (A9). Booking posts to the fetch
 * mock at `…/services/<id>/book` and answers as the real action does, so a
 * test serves it like any other call.
 */
function account(over: Partial<BookingAccount> = {}): BookingAccount {
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
        ...over,
    };
}

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
    checkouts.opened = [];
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
}

describe("the booking page (U19)", () => {
    it("says a day is Full or Closed, and opens on the first free one", async () => {
        serve(() => json(ONE_DAYS));
        render(<BookingFlow page={PAGE} apiUrl={API} account={account()} />);
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
        render(<BookingFlow page={PAGE} apiUrl={API} account={account()} />);
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
            serviceId: "svc_pt",
            staffId: "staff_karan",
            pay: "DESK",
        });
        expect(body).not.toHaveProperty("amount");
        // The booker is the account's (A9): no email, phone or name sent.
        expect(body).not.toHaveProperty("bookerEmail");
        expect(body).not.toHaveProperty("bookerPhone");
        expect(body).not.toHaveProperty("bookerName");
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
        render(<BookingFlow page={PAGE} apiUrl={API} account={account()} />);
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
        await screen.findByText("Pay with UPI or card in the Razorpay window");
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
        render(<BookingFlow page={PAGE} apiUrl={API} account={account()} />);
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
        render(<BookingFlow page={PAGE} apiUrl={API} account={account()} />);
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
            render(
                <BookingFlow page={PAGE} apiUrl={API} account={account()} />,
            );
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
        render(<BookingFlow page={PAGE} apiUrl={API} account={account()} />);
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

    /** Pay now, the payment can't start, and the booker asks for the desk. */
    function heldThenDesk(release: () => Response) {
        serve((url, init) => {
            if (url.endsWith("/days")) return json(ONE_DAYS);
            if (url.endsWith("/payment-intent")) return json({}, 500);
            if (url.endsWith("/release")) return release();
            if (url.endsWith("/book")) {
                const body = JSON.parse(init?.body as string) as {
                    pay: string;
                };
                return body.pay === "NOW"
                    ? json(
                          booked({
                              state: "HELD",
                              holdExpiresAt: "2026-09-18T04:15:00.000Z",
                              payToken: "tok_1",
                          }),
                          201,
                      )
                    : json(booked(), 201);
            }
            return json({ state: "HELD", holdExpiresAt: null });
        });
    }

    const deskBooks = () =>
        calls
            .filter((c) => c.url.endsWith("/book"))
            .filter(
                (c) =>
                    (JSON.parse(c.init?.body as string) as { pay: string })
                        .pay === "DESK",
            );

    it("stays with the hold when letting it go fails, and books nothing at the desk (K-2)", async () => {
        heldThenDesk(() => json({}, 500));
        render(<BookingFlow page={PAGE} apiUrl={API} account={account()} />);
        await chooseOneToOne();
        fireEvent.click(
            screen.getByRole("button", { name: "Pay ₹1,200 and book" }),
        );
        fireEvent.click(
            await screen.findByRole("button", {
                name: "Book it to pay at the desk",
            }),
        );

        await waitFor(() =>
            expect(
                calls.filter((c) => c.url.endsWith("/release")),
            ).toHaveLength(1),
        );
        expect(
            await screen.findByText(
                "Something went wrong on our side. Please try again.",
            ),
        ).toBeInTheDocument();
        // Still on the hold, with the way to try again.
        expect(
            screen.getByRole("button", { name: "Book it to pay at the desk" }),
        ).toBeInTheDocument();
        expect(deskBooks()).toHaveLength(0);
    });

    it("a hold paid just before it was let go is booked and paid, not booked again (K-2)", async () => {
        heldThenDesk(() => json({ state: "CONFIRMED", holdExpiresAt: null }));
        render(<BookingFlow page={PAGE} apiUrl={API} account={account()} />);
        await chooseOneToOne();
        fireEvent.click(
            screen.getByRole("button", { name: "Pay ₹1,200 and book" }),
        );
        fireEvent.click(
            await screen.findByRole("button", {
                name: "Book it to pay at the desk",
            }),
        );

        expect(
            await screen.findByRole("heading", { name: /You're booked/ }),
        ).toBeInTheDocument();
        expect(deskBooks()).toHaveLength(0);
    });

    it("another time or way of paying after a failed try sends a new key; the same choice keeps it", async () => {
        const KARAN_AT_7 = {
            startAt: "2026-09-20T01:30:00.000Z",
            endAt: "2026-09-20T02:30:00.000Z",
            staffId: "staff_karan",
            staffName: "Karan Mehta",
            placesLeft: null,
        };
        const TWO_STARTS = {
            ...ONE_DAYS,
            days: [
                {
                    date: "2026-09-20",
                    open: true,
                    starts: [
                        KARAN_AT_7,
                        {
                            ...KARAN_AT_7,
                            startAt: "2026-09-20T02:30:00.000Z",
                            endAt: "2026-09-20T03:30:00.000Z",
                        },
                    ],
                },
            ],
        };
        // Every try fails on the way back: it may or may not have booked.
        serve((url) =>
            url.endsWith("/days") ? json(TWO_STARTS) : json({}, 502),
        );
        render(<BookingFlow page={PAGE} apiUrl={API} account={account()} />);
        await chooseOneToOne();
        const keys = () =>
            calls
                .filter((c) => c.url.endsWith("/book"))
                .map(
                    (c) =>
                        (
                            JSON.parse(c.init?.body as string) as {
                                idempotencyKey: string;
                            }
                        ).idempotencyKey,
                );
        const tryIt = async (name: string) => {
            const before = keys().length;
            fireEvent.click(screen.getByRole("button", { name }));
            await waitFor(() => expect(keys()).toHaveLength(before + 1));
            await screen.findByText(
                "Something went wrong on our side. Please try again.",
            );
        };

        await tryIt("Pay ₹1,200 and book");
        // The same choice again: the same key.
        fireEvent.click(
            screen.getByRole("radio", { name: "07:00 with Karan Mehta" }),
        );
        await tryIt("Pay ₹1,200 and book");
        // Paying at the desk instead: a new key.
        fireEvent.click(screen.getByRole("radio", { name: /Pay at the desk/ }));
        await tryIt("Book — pay at the desk");
        // Another time: a new key.
        fireEvent.click(
            screen.getByRole("radio", { name: "08:00 with Karan Mehta" }),
        );
        await tryIt("Book — pay at the desk");

        const [first, same, desk, later] = keys();
        expect(same).toBe(first);
        expect(desk).not.toBe(first);
        expect(later).not.toBe(desk);
    });

    it("lists a class's sessions with places left, and a full one cannot be picked", async () => {
        serve(() => json(CLASS_DAYS));
        render(<BookingFlow page={PAGE} apiUrl={API} account={account()} />);
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
                account={account()}
                initialServiceId="svc_pt"
            />,
        );
        await screen.findByRole("radio", { name: "07:00 with Karan Mehta" });
        fireEvent.click(
            screen.getByRole("radio", { name: "07:00 with Karan Mehta" }),
        );
        expect(screen.queryByRole("radio", { name: /Pay ₹1,200/ })).toBeNull();
        expect(
            screen.getByRole("button", { name: "Book — pay at the desk" }),
        ).toBeInTheDocument();
    });

    it("says booking is not open when Appointments is off", () => {
        serve(() => json({}));
        render(
            <BookingFlow
                page={{ ...PAGE, open: false }}
                apiUrl={API}
                account={account()}
            />,
        );
        expect(
            screen.getByRole("heading", {
                name: "Online booking isn't open right now",
            }),
        ).toBeInTheDocument();
    });
});

describe("Where and anything we should know (E7)", () => {
    const KAVI: BookingPageData = {
        ...PAGE,
        businessName: "Kavi Dental",
        services: [
            {
                ...PAGE.services[0],
                id: "svc_consult",
                name: "Video consultation",
                online: false,
                where: "EITHER",
                staff: ["Dr Kavitha Rao"],
            },
            {
                ...PAGE.services[0],
                id: "svc_clean",
                name: "Cleaning",
                online: false,
                where: "IN_PERSON",
                staff: ["Dr Kavitha Rao"],
            },
        ],
    };
    const KAVI_DAYS = {
        ...ONE_DAYS,
        days: ONE_DAYS.days.map((d) => ({
            ...d,
            starts: d.starts.map((s) => ({
                ...s,
                staffId: "staff_kavitha",
                staffName: "Dr Kavitha Rao",
            })),
        })),
    };
    const LINK = "https://meet.example.com/kavi";

    async function chooseAt(service: RegExp) {
        fireEvent.click(screen.getByRole("radio", { name: service }));
        const time = await screen.findByRole("radio", {
            name: "07:00 with Dr Kavitha Rao",
        });
        fireEvent.click(time);
    }

    function bookBody(): Record<string, unknown> {
        const post = calls.find((c) => c.url.endsWith("/book"));
        return JSON.parse(post?.init?.body as string) as Record<
            string,
            unknown
        >;
    }

    it("asks Where for a service offered either way, and books a Video call with its link", async () => {
        serve((url) =>
            url.endsWith("/days")
                ? json(KAVI_DAYS)
                : json(
                      booked({
                          serviceName: "Video consultation",
                          online: true,
                          meetingUrl: LINK,
                      }),
                      201,
                  ),
        );
        render(<BookingFlow page={KAVI} apiUrl={API} account={account()} />);
        await chooseAt(/Video consultation/);

        const where = screen.getByRole("radiogroup", { name: "Where" });
        const clinic = screen.getByRole("radio", { name: "At Kavi Dental" });
        const video = screen.getByRole("radio", { name: "Video call" });
        expect(where).toContainElement(clinic);
        // In person until they say otherwise.
        expect(clinic).toHaveAttribute("aria-checked", "true");
        fireEvent.click(video);
        expect(video).toHaveAttribute("aria-checked", "true");
        expect(
            screen.getByText("The link to join shows here once you're booked."),
        ).toBeInTheDocument();

        fireEvent.change(screen.getByLabelText("Anything we should know?"), {
            target: { value: "  I take blood thinners  " },
        });
        fireEvent.click(screen.getByRole("radio", { name: /Pay at the desk/ }));
        fireEvent.click(
            screen.getByRole("button", { name: "Book — pay at the desk" }),
        );

        await screen.findByRole("heading", { name: "You're booked, Asha." });
        expect(bookBody()).toMatchObject({
            locationType: "ONLINE",
            intakeNote: "I take blood thinners",
        });
        // The confirmation says where it happens, and hands over the link.
        expect(
            screen.getByText(/^Video consultation · Video call · Sun 20 Sep/),
        ).toBeInTheDocument();
        expect(screen.getByRole("link", { name: LINK })).toHaveAttribute(
            "href",
            LINK,
        );
        // Nothing promises a message Saroh doesn't send.
        expect(document.body.textContent).not.toMatch(
            /on its way|we'll text|we'll email/i,
        );
    });

    it("never asks Where for an In person service, and says it's at the clinic", async () => {
        serve((url) =>
            url.endsWith("/days")
                ? json(KAVI_DAYS)
                : json(booked({ serviceName: "Cleaning" }), 201),
        );
        render(<BookingFlow page={KAVI} apiUrl={API} account={account()} />);
        await chooseAt(/Cleaning/);

        expect(
            screen.queryByRole("radiogroup", { name: "Where" }),
        ).not.toBeInTheDocument();
        // The note is asked of every booking.
        expect(
            screen.getByLabelText("Anything we should know?"),
        ).toBeInTheDocument();
        fireEvent.click(screen.getByRole("radio", { name: /Pay at the desk/ }));
        fireEvent.click(
            screen.getByRole("button", { name: "Book — pay at the desk" }),
        );

        await screen.findByRole("heading", { name: "You're booked, Asha." });
        const body = bookBody();
        expect(body).not.toHaveProperty("locationType");
        // An empty note isn't sent.
        expect(body).not.toHaveProperty("intakeNote");
        expect(
            screen.getByText(/^Cleaning · At Kavi Dental · Sun 20 Sep/),
        ).toBeInTheDocument();
    });

    it("says nothing about where for a business that only meets in person", async () => {
        serve((url) =>
            url.endsWith("/days") ? json(ONE_DAYS) : json(booked(), 201),
        );
        render(<BookingFlow page={PAGE} apiUrl={API} account={account()} />);
        await chooseOneToOne();
        expect(
            screen.queryByRole("radiogroup", { name: "Where" }),
        ).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole("radio", { name: /Pay at the desk/ }));
        fireEvent.click(
            screen.getByRole("button", { name: "Book — pay at the desk" }),
        );
        await screen.findByRole("heading", { name: "You're booked, Asha." });
        expect(
            screen.getByText(/^Personal training · Sun 20 Sep/),
        ).toBeInTheDocument();
    });

    it("caps the note at 1,000 characters", async () => {
        serve(() => json(KAVI_DAYS));
        render(<BookingFlow page={KAVI} apiUrl={API} account={account()} />);
        await chooseAt(/Cleaning/);
        expect(
            screen.getByLabelText("Anything we should know?"),
        ).toHaveAttribute("maxLength", "1000");
    });

    it("pays now for a Video call: the link arrives with the confirmation", async () => {
        let holdState = "HELD";
        serve((url) => {
            if (url.endsWith("/days")) return json(KAVI_DAYS);
            if (url.endsWith("/book")) {
                return json(
                    booked({
                        serviceName: "Video consultation",
                        online: true,
                        state: "HELD",
                        holdExpiresAt: "2026-09-18T04:15:00.000Z",
                        payToken: "tok_1",
                    }),
                    201,
                );
            }
            if (url.endsWith("/payment-intent")) {
                return json({
                    provider: "RAZORPAY",
                    providerIntentId: "order_1",
                    amountCents: 120_000,
                    currency: "INR",
                    publicKey: null,
                    clientParams: {},
                });
            }
            return json({
                state: holdState,
                holdExpiresAt: null,
                booking: {
                    online: true,
                    meetingUrl: holdState === "CONFIRMED" ? LINK : null,
                },
            });
        });
        render(<BookingFlow page={KAVI} apiUrl={API} account={account()} />);
        await chooseAt(/Video consultation/);
        fireEvent.click(screen.getByRole("radio", { name: "Video call" }));
        vi.useFakeTimers({ shouldAdvanceTime: true });
        fireEvent.click(
            screen.getByRole("button", { name: "Pay ₹1,200 and book" }),
        );
        await screen.findByText("Pay with UPI or card in the Razorpay window");
        expect(bookBody()).toMatchObject({ locationType: "ONLINE" });

        holdState = "CONFIRMED";
        await act(async () => {
            await vi.advanceTimersByTimeAsync(4_500);
        });
        await waitFor(() =>
            expect(
                screen.getByRole("heading", { name: "You're booked, Asha." }),
            ).toBeInTheDocument(),
        );
        expect(screen.getByRole("link", { name: LINK })).toBeInTheDocument();
    });
});

describe("UPI and card checkout (E11)", () => {
    const HANDOFF = {
        paymentIntentId: "pi_1",
        provider: "RAZORPAY",
        providerIntentId: "order_1",
        amountCents: 120_000,
        currency: "INR",
        publicKey: "rzp_live_public",
        clientParams: { razorpayOrderId: "order_1" },
    };

    /** A pay-now hold whose state the test moves; the hold's own API. */
    function servePayNow() {
        const hold = { state: "HELD" };
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
            if (url.endsWith("/payment-intent")) return json(HANDOFF);
            return json({ state: hold.state, holdExpiresAt: null });
        });
        return hold;
    }

    async function payNow() {
        render(<BookingFlow page={PAGE} apiUrl={API} account={account()} />);
        await chooseOneToOne();
        vi.useFakeTimers({ shouldAdvanceTime: true });
        fireEvent.click(
            screen.getByRole("button", { name: "Pay ₹1,200 and book" }),
        );
        await screen.findByText("Pay with UPI or card in the Razorpay window");
        // The card can draw before the effect that opens the window runs; on a
        // slow runner the test answered a window not yet made (CI, #687).
        await waitFor(() => expect(checkouts.opened.length).toBeGreaterThan(0));
    }

    const answer = async (outcome: CheckoutOutcome, nth = 0) => {
        await act(async () => {
            checkouts.opened[nth]?.answer(outcome);
            await Promise.resolve();
        });
    };

    const poll = async () => {
        await act(async () => {
            await vi.advanceTimersByTimeAsync(4_500);
        });
    };

    it("offers UPI or card in the designs' words: an appointment now, a class for the class", async () => {
        serve((url) =>
            url.includes("svc_hiit") ? json(CLASS_DAYS) : json(ONE_DAYS),
        );
        render(<BookingFlow page={PAGE} apiUrl={API} account={account()} />);
        await chooseOneToOne();
        expect(
            screen.getByRole("radio", {
                name: "Pay ₹1,200 now UPI or card — your appointment is confirmed straight away",
            }),
        ).toHaveAttribute("aria-checked", "true");
        expect(
            screen.getByRole("radio", {
                name: "Pay at the desk Held for you; pay when you arrive",
            }),
        ).toBeInTheDocument();

        fireEvent.click(screen.getByRole("radio", { name: /HIIT class/ }));
        fireEvent.click(
            await screen.findByRole("radio", { name: /18:30.*2 places left/ }),
        );
        expect(
            screen.getByRole("radio", {
                name: "Pay ₹500 for this class UPI or card — your place is confirmed straight away",
            }),
        ).toBeInTheDocument();
    });

    it("pays: opens the provider on the hold's order, says Paying… and confirms when the webhook does", async () => {
        const hold = servePayNow();
        await payNow();

        expect(checkouts.opened).toHaveLength(1);
        const { request } = checkouts.opened[0];
        expect(request.handoff).toMatchObject({
            provider: "RAZORPAY",
            providerIntentId: "order_1",
            publicKey: "rzp_live_public",
            amountCents: 120_000,
        });
        expect(request.business).toBe("Pulse Fitness");
        expect(request.description).toMatch(/^Personal training · /);
        expect(request.booker).toEqual({
            name: "Asha Rao",
            email: "asha@example.in",
        });

        await answer("paid");
        expect(screen.getByText("Paying…")).toBeInTheDocument();
        expect(
            screen.getByText(/Razorpay is confirming your payment/),
        ).toBeInTheDocument();
        // Paid, so letting the hold go is no longer offered.
        expect(
            screen.queryByRole("button", {
                name: "Cancel and pick another time",
            }),
        ).toBeNull();

        // Still held: the page waits for the webhook, never guesses.
        await poll();
        expect(screen.getByText("Paying…")).toBeInTheDocument();

        hold.state = "CONFIRMED";
        await poll();
        await waitFor(() =>
            expect(
                screen.getByRole("heading", { name: "You're booked, Asha." }),
            ).toBeInTheDocument(),
        );
        expect(screen.getByText("Paid ₹1,200 online.")).toBeInTheDocument();
        expect(
            calls.filter((c) => c.url.endsWith("/payment-intent")),
        ).toHaveLength(1);
    });

    it("the provider refuses: says so, keeps the hold, and tries again on the same payment", async () => {
        const hold = servePayNow();
        await payNow();
        await answer("failed");

        expect(screen.getByRole("alert")).toHaveTextContent(
            "The payment didn't go through — try again.",
        );
        expect(calls.some((c) => c.url.endsWith("/release"))).toBe(false);
        expect(
            screen.getByRole("heading", {
                name: "Pay ₹1,200 to confirm your place",
            }),
        ).toBeInTheDocument();
        expect(
            screen.getByRole("button", { name: "Book it to pay at the desk" }),
        ).toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: "Try again" }));
        await waitFor(() => expect(checkouts.opened).toHaveLength(2));
        expect(checkouts.opened[1]?.request.handoff.providerIntentId).toBe(
            "order_1",
        );
        expect(
            calls.filter((c) => c.url.endsWith("/payment-intent")),
        ).toHaveLength(1);
        expect(screen.queryByRole("alert")).toBeNull();

        await answer("paid", 1);
        hold.state = "CONFIRMED";
        await poll();
        await waitFor(() =>
            expect(
                screen.getByRole("heading", { name: "You're booked, Asha." }),
            ).toBeInTheDocument(),
        );
    });

    it("the window is closed before paying: it can be opened again", async () => {
        servePayNow();
        await payNow();
        await answer("closed");

        expect(
            screen.getByText("The payment window was closed before you paid"),
        ).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Pay ₹1,200" }));
        await waitFor(() => expect(checkouts.opened).toHaveLength(2));
        expect(checkouts.opened[0]?.closed).toBe(true);
    });

    it("the window can't open: says so, and offers another try", async () => {
        servePayNow();
        await payNow();
        await answer("unavailable");

        expect(screen.getByRole("alert")).toHaveTextContent(
            "We couldn't open the payment window. Check your connection and try again.",
        );
        fireEvent.click(screen.getByRole("button", { name: "Try again" }));
        await waitFor(() => expect(checkouts.opened).toHaveLength(2));
    });

    it("the hold runs out mid-payment: the window closes and the place is let go", async () => {
        const hold = servePayNow();
        await payNow();

        hold.state = "RELEASED";
        await poll();
        expect(
            await screen.findByRole("heading", {
                name: "The time held for you ran out",
            }),
        ).toBeInTheDocument();
        expect(screen.getByText(/Nothing was charged\./)).toBeInTheDocument();
        expect(checkouts.opened[0]?.closed).toBe(true);
        // A late answer from the window changes nothing.
        await answer("paid");
        expect(
            screen.getByRole("heading", {
                name: "The time held for you ran out",
            }),
        ).toBeInTheDocument();
    });

    it("the hold runs out after the window took the money: never says nothing was charged", async () => {
        const hold = servePayNow();
        await payNow();
        await answer("paid");

        hold.state = "RELEASED";
        await poll();
        expect(
            await screen.findByRole("heading", {
                name: "The time held for you ran out",
            }),
        ).toBeInTheDocument();
        expect(
            screen.getByText(
                /before your payment was confirmed\. If money left your account, get in touch with Pulse Fitness and they can refund it\./,
            ),
        ).toBeInTheDocument();
        expect(screen.queryByText(/Nothing was charged/)).toBeNull();
    });

    it("no provider connected: Pay now isn't offered and no window opens", async () => {
        serve(() => json(ONE_DAYS));
        render(
            <BookingFlow
                page={{ ...PAGE, payOnline: false }}
                apiUrl={API}
                account={account()}
                initialServiceId="svc_pt"
            />,
        );
        fireEvent.click(
            await screen.findByRole("radio", {
                name: "07:00 with Karan Mehta",
            }),
        );
        expect(screen.queryByText(/UPI or card/)).toBeNull();
        expect(checkouts.opened).toHaveLength(0);
    });
});

describe("opening on a time from On today (G18)", () => {
    const TWO_TIMES = {
        ...ONE_DAYS,
        days: [
            ...ONE_DAYS.days.slice(0, 2),
            {
                date: "2026-09-20",
                open: true,
                starts: [
                    ONE_DAYS.days[2].starts[0],
                    {
                        startAt: "2026-09-20T02:30:00.000Z",
                        endAt: "2026-09-20T03:30:00.000Z",
                        staffId: "staff_karan",
                        staffName: "Karan Mehta",
                        placesLeft: null,
                    },
                ],
            },
        ],
    };

    it("opens on the service and day with the linked time chosen", async () => {
        serve(() => json(TWO_TIMES));
        render(
            <BookingFlow
                page={PAGE}
                apiUrl={API}
                account={account()}
                initialServiceId="svc_pt"
                initialDate="2026-09-20"
                initialStart="08:00"
            />,
        );
        const time = await screen.findByRole("radio", {
            name: "08:00 with Karan Mehta",
        });
        await waitFor(() =>
            expect(time).toHaveAttribute("aria-checked", "true"),
        );
        expect(
            screen.getByRole("radio", { name: "Sun 20 Sep: 2 times free" }),
        ).toHaveAttribute("aria-checked", "true");
        // Straight on to who they are.
        expect(screen.getByText(/Booking as/)).toBeInTheDocument();
        expect(screen.queryByText(/just gone/)).toBeNull();
    });

    it("opens on the day and says so when the time has just gone", async () => {
        serve(() => json(TWO_TIMES));
        render(
            <BookingFlow
                page={PAGE}
                apiUrl={API}
                account={account()}
                initialServiceId="svc_pt"
                initialDate="2026-09-20"
                initialStart="10:15"
            />,
        );
        expect(
            await screen.findByText(
                "That time has just gone — here's what's left.",
            ),
        ).toBeInTheDocument();
        expect(
            screen.getByRole("radio", { name: "Sun 20 Sep: 2 times free" }),
        ).toHaveAttribute("aria-checked", "true");
        expect(
            screen.getByRole("radio", { name: "07:00 with Karan Mehta" }),
        ).toHaveAttribute("aria-checked", "false");
        expect(screen.queryByLabelText("Name")).toBeNull();
    });

    it("chooses a class session with places, and not a full one", async () => {
        serve(() => json(CLASS_DAYS));
        const { unmount } = render(
            <BookingFlow
                page={PAGE}
                apiUrl={API}
                account={account()}
                initialServiceId="svc_hiit"
                initialDate="2026-09-20"
                initialStart="18:30"
            />,
        );
        const open = await screen.findByRole("radio", {
            name: /18:30.*2 places left/,
        });
        await waitFor(() =>
            expect(open).toHaveAttribute("aria-checked", "true"),
        );
        unmount();

        serve(() => json(CLASS_DAYS));
        render(
            <BookingFlow
                page={PAGE}
                apiUrl={API}
                account={account()}
                initialServiceId="svc_hiit"
                initialDate="2026-09-20"
                initialStart="07:00"
            />,
        );
        expect(
            await screen.findByText(
                "That time has just gone — here's what's left.",
            ),
        ).toBeInTheDocument();
    });

    it("ignores a date and time without a service", async () => {
        serve(() => json(TWO_TIMES));
        render(
            <BookingFlow
                page={PAGE}
                apiUrl={API}
                account={account()}
                initialDate="2026-09-20"
                initialStart="08:00"
            />,
        );
        fireEvent.click(
            screen.getByRole("radio", { name: /Personal training/ }),
        );
        await screen.findByRole("radio", { name: "07:00 with Karan Mehta" });
        expect(
            screen.getByRole("radio", { name: "08:00 with Karan Mehta" }),
        ).toHaveAttribute("aria-checked", "false");
        expect(screen.queryByText(/just gone/)).toBeNull();
    });
});

describe("sign-in at the last step (A9)", () => {
    const TWO_STARTS = {
        ...ONE_DAYS,
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
                    {
                        startAt: "2026-09-20T02:30:00.000Z",
                        endAt: "2026-09-20T03:30:00.000Z",
                        staffId: "staff_karan",
                        staffName: "Karan Mehta",
                        placesLeft: null,
                    },
                ],
            },
        ],
    };

    const bookCalls = () =>
        calls
            .filter((c) => c.url.endsWith("/book"))
            .map(
                (c) =>
                    JSON.parse(c.init?.body as string) as Record<
                        string,
                        unknown
                    >,
            );

    async function pickSeven() {
        fireEvent.click(
            screen.getByRole("radio", { name: /Personal training/ }),
        );
        fireEvent.click(
            await screen.findByRole("radio", {
                name: "07:00 with Karan Mehta",
            }),
        );
        payAtDesk();
    }

    /** Paying is asked once they're named. */
    function payAtDesk() {
        const desk = screen.queryByRole("radio", { name: /Pay at the desk/ });
        if (desk) fireEvent.click(desk);
    }

    async function signInWithCode(email: string) {
        const sheet = await screen.findByRole("dialog");
        fireEvent.change(within(sheet).getByLabelText("Email"), {
            target: { value: email },
        });
        fireEvent.click(
            within(sheet).getByRole("button", { name: "Send code" }),
        );
        fireEvent.change(await within(sheet).findByLabelText("Code"), {
            target: { value: "123456" },
        });
        fireEvent.click(within(sheet).getByRole("button", { name: "Sign in" }));
    }

    const cannotSend = () => ({
        requestCode: vi.fn(() =>
            Promise.resolve({
                ok: false as const,
                reason: "unavailable" as const,
            }),
        ),
        verifyCode: vi.fn(),
    });

    it("a visitor gives a name, signs in at the last step, and is booked straight after the code", async () => {
        serve((url) =>
            url.endsWith("/days") ? json(ONE_DAYS) : json(booked(), 201),
        );
        const verifyCode = vi.fn(() =>
            Promise.resolve({
                ok: true as const,
                customer: { email: "meera@example.in", name: null },
            }),
        );
        render(
            <BookingFlow
                page={PAGE}
                apiUrl={API}
                account={account({
                    customer: null,
                    signIn: {
                        requestCode: vi.fn(() =>
                            Promise.resolve({
                                ok: true as const,
                                resendAfterSeconds: 30,
                            }),
                        ),
                        verifyCode,
                    },
                })}
            />,
        );
        await pickSeven();
        expect(
            screen.getByText(/You'll confirm your email with a code/),
        ).toBeInTheDocument();
        // Nothing is booked, and no sheet, until they've named themselves.
        fireEvent.click(
            screen.getByRole("button", { name: "Continue to sign in" }),
        );
        expect(screen.getAllByText("Add your name.").length).toBeGreaterThan(0);
        expect(screen.queryByRole("dialog")).toBeNull();

        fireEvent.change(screen.getByLabelText("Name"), {
            target: { value: "Meera Shah" },
        });
        payAtDesk();
        fireEvent.click(
            screen.getByRole("button", { name: "Continue to sign in" }),
        );
        expect(
            await screen.findByText(
                "Last step: confirm it's you, then we'll finish. No password.",
            ),
        ).toBeInTheDocument();
        expect(bookCalls()).toHaveLength(0);

        await signInWithCode("meera@example.in");

        expect(
            await screen.findByRole("heading", {
                name: "You're booked, Meera.",
            }),
        ).toBeInTheDocument();
        expect(
            screen.getByText(
                "We've saved this to your details with Pulse Fitness.",
            ),
        ).toBeInTheDocument();
        expect(verifyCode).toHaveBeenCalledWith("meera@example.in", "123456");
        const [body] = bookCalls();
        expect(body).toMatchObject({
            serviceId: "svc_pt",
            startAt: "2026-09-20T01:30:00.000Z",
            bookerName: "Meera Shah",
            pay: "DESK",
        });
        expect(body).not.toHaveProperty("bookerEmail");
    });

    it("a signed-in customer reads 'Booking as' and books with no code and no details form", async () => {
        serve((url) =>
            url.endsWith("/days") ? json(ONE_DAYS) : json(booked(), 201),
        );
        const requestCode = vi.fn();
        render(
            <BookingFlow
                page={PAGE}
                apiUrl={API}
                account={account({
                    signIn: { requestCode, verifyCode: vi.fn() },
                })}
            />,
        );
        await pickSeven();

        expect(screen.getByText(/Booking as/)).toHaveTextContent(
            "Booking as Asha Rao · Not you?",
        );
        expect(screen.queryByLabelText("Name")).toBeNull();
        fireEvent.click(
            screen.getByRole("button", { name: "Book — pay at the desk" }),
        );

        expect(
            await screen.findByRole("heading", {
                name: "You're booked, Asha.",
            }),
        ).toBeInTheDocument();
        expect(screen.queryByRole("dialog")).toBeNull();
        expect(requestCode).not.toHaveBeenCalled();
    });

    it("asks a signed-in account with no name for one, and sends it", async () => {
        serve((url) =>
            url.endsWith("/days") ? json(ONE_DAYS) : json(booked(), 201),
        );
        render(
            <BookingFlow
                page={PAGE}
                apiUrl={API}
                account={account({
                    customer: { email: "new@example.in", name: null },
                })}
            />,
        );
        await pickSeven();
        expect(screen.getByText(/Booking as/)).toHaveTextContent(
            "Booking as new@example.in",
        );
        fireEvent.change(screen.getByLabelText("Name"), {
            target: { value: "Neha Joshi" },
        });
        payAtDesk();
        fireEvent.click(
            screen.getByRole("button", { name: "Book — pay at the desk" }),
        );

        await screen.findByRole("heading", { name: "You're booked, Neha." });
        expect(bookCalls()[0]).toMatchObject({ bookerName: "Neha Joshi" });
    });

    it("never draws a guest details form: no email or phone field, signed in or not", async () => {
        serve(() => json(ONE_DAYS));
        const { unmount } = render(
            <BookingFlow
                page={PAGE}
                apiUrl={API}
                account={account({ customer: null })}
            />,
        );
        await pickSeven();
        expect(screen.queryByLabelText("Email")).toBeNull();
        expect(screen.queryByLabelText(/Phone/)).toBeNull();
        unmount();

        render(<BookingFlow page={PAGE} apiUrl={API} account={account()} />);
        await pickSeven();
        expect(screen.queryByLabelText("Email")).toBeNull();
        expect(screen.queryByLabelText(/Phone/)).toBeNull();
    });

    it("'Not you?' signs out, and the last step is signing in again", async () => {
        serve(() => json(ONE_DAYS));
        const signOut = vi.fn(() => Promise.resolve({ ok: true }));
        render(
            <BookingFlow
                page={PAGE}
                apiUrl={API}
                account={account({ signOut })}
            />,
        );
        await pickSeven();

        fireEvent.click(screen.getByRole("button", { name: "Not you?" }));

        expect(
            await screen.findByRole("button", { name: "Continue to sign in" }),
        ).toBeInTheDocument();
        expect(signOut).toHaveBeenCalledTimes(1);
        expect(screen.getByLabelText("Name")).toHaveValue("");
        expect(screen.queryByText(/Booking as/)).toBeNull();
    });

    it("says so when they already hold this slot, and keeps their choice", async () => {
        serve((url) =>
            url.endsWith("/days")
                ? json(ONE_DAYS)
                : json(
                      {
                          error: {
                              message: "You're already booked for this.",
                              details: { reason: "already-booked" },
                          },
                      },
                      409,
                  ),
        );
        render(<BookingFlow page={PAGE} apiUrl={API} account={account()} />);
        await pickSeven();
        fireEvent.click(
            screen.getByRole("button", { name: "Book — pay at the desk" }),
        );

        expect(
            await screen.findByText("You're already booked for this."),
        ).toBeInTheDocument();
        // Not "the time has gone": the times aren't read again.
        expect(calls.filter((c) => c.url.endsWith("/days"))).toHaveLength(1);
        expect(
            screen.getByRole("radio", { name: "07:00 with Karan Mehta" }),
        ).toHaveAttribute("aria-checked", "true");
    });

    it("the time goes while they sign in: says so, and chooses the next free one", async () => {
        let daysRead = 0;
        serve((url) => {
            if (url.endsWith("/days")) {
                daysRead += 1;
                // Read again after the 409: 07:00 has gone.
                return json(
                    daysRead === 1
                        ? TWO_STARTS
                        : {
                              ...TWO_STARTS,
                              days: [
                                  {
                                      ...TWO_STARTS.days[0],
                                      starts: TWO_STARTS.days[0].starts.slice(
                                          1,
                                      ),
                                  },
                              ],
                          },
                );
            }
            return json(
                { error: { message: "This slot is fully booked" } },
                409,
            );
        });
        render(
            <BookingFlow
                page={PAGE}
                apiUrl={API}
                account={account({ customer: null })}
            />,
        );
        await pickSeven();
        fireEvent.change(screen.getByLabelText("Name"), {
            target: { value: "Meera Shah" },
        });
        payAtDesk();
        fireEvent.click(
            screen.getByRole("button", { name: "Continue to sign in" }),
        );
        await signInWithCode("asha@example.in");

        expect(
            await screen.findByText(
                "That time has just gone. We've chosen the next free one: Sun 20 Sep at 08:00.",
            ),
        ).toBeInTheDocument();
        expect(
            screen.getByRole("radio", { name: "08:00 with Karan Mehta" }),
        ).toHaveAttribute("aria-checked", "true");
        // Signed in now: booking the next one needs no code.
        expect(
            screen.getByRole("button", { name: "Book — pay at the desk" }),
        ).toBeInTheDocument();
    });

    it("a code that can't be sent: the sheet says so with the business's phone, and nothing is booked", async () => {
        serve(() => json(ONE_DAYS));
        render(
            <BookingFlow
                page={PAGE}
                apiUrl={API}
                account={account({ customer: null, signIn: cannotSend() })}
            />,
        );
        await pickSeven();
        fireEvent.change(screen.getByLabelText("Name"), {
            target: { value: "Meera Shah" },
        });
        payAtDesk();
        fireEvent.click(
            screen.getByRole("button", { name: "Continue to sign in" }),
        );
        const sheet = await screen.findByRole("dialog");
        fireEvent.change(within(sheet).getByLabelText("Email"), {
            target: { value: "meera@example.in" },
        });
        fireEvent.click(
            within(sheet).getByRole("button", { name: "Send code" }),
        );

        const alert = await within(sheet).findByRole("alert");
        expect(alert).toHaveTextContent(
            "We couldn't send your code — try again in a few minutes",
        );
        expect(alert).toHaveTextContent(
            "Or call Pulse Fitness on +91 80 4120 8800",
        );
        expect(bookCalls()).toHaveLength(0);
    });

    it("a business with no public phone: the sentence alone", async () => {
        serve(() => json(ONE_DAYS));
        render(
            <BookingFlow
                page={PAGE}
                apiUrl={API}
                account={account({
                    customer: null,
                    options: {
                        businessName: "Pulse Fitness",
                        phone: null,
                        challenge: { required: false, siteKey: null },
                    },
                    signIn: cannotSend(),
                })}
            />,
        );
        await pickSeven();
        fireEvent.change(screen.getByLabelText("Name"), {
            target: { value: "Meera Shah" },
        });
        payAtDesk();
        fireEvent.click(
            screen.getByRole("button", { name: "Continue to sign in" }),
        );
        const sheet = await screen.findByRole("dialog");
        fireEvent.change(within(sheet).getByLabelText("Email"), {
            target: { value: "meera@example.in" },
        });
        fireEvent.click(
            within(sheet).getByRole("button", { name: "Send code" }),
        );

        const alert = await within(sheet).findByRole("alert");
        expect(alert).toHaveTextContent(
            "We couldn't send your code — try again in a few minutes",
        );
        expect(alert).not.toHaveTextContent(/Or call/);
        expect(bookCalls()).toHaveLength(0);
    });

    it("a session that ended meanwhile: says so, and asks them to sign in again", async () => {
        serve((url) =>
            url.endsWith("/days")
                ? json(ONE_DAYS)
                : json(
                      {
                          error: {
                              message: "Sign in to continue.",
                              details: { reason: "signed-out" },
                          },
                      },
                      401,
                  ),
        );
        render(<BookingFlow page={PAGE} apiUrl={API} account={account()} />);
        await pickSeven();
        fireEvent.click(
            screen.getByRole("button", { name: "Book — pay at the desk" }),
        );

        expect(
            await screen.findByText(
                "Your sign-in has ended. Sign in again to book.",
            ),
        ).toBeInTheDocument();
        expect(
            screen.getByRole("button", { name: "Continue to sign in" }),
        ).toBeInTheDocument();
    });
});
