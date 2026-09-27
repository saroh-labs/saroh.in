import {
    act,
    fireEvent,
    render,
    screen,
    waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import BookingFlow from "./booking-flow";
import type { CheckoutOutcome, CheckoutRequest } from "./checkout";
import type { BookingPageData } from "./model";

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
        render(<BookingFlow page={PAGE} apiUrl={API} />);
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
        expect(screen.queryByRole("radio", { name: /Pay ₹1,200/ })).toBeNull();
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
        fireEvent.change(screen.getByLabelText("Name"), {
            target: { value: "Rahul Iyer" },
        });
        fireEvent.change(screen.getByLabelText("Email"), {
            target: { value: "rahul@example.in" },
        });
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
        render(<BookingFlow page={KAVI} apiUrl={API} />);
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

        await screen.findByRole("heading", { name: "You're booked, Rahul." });
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
        render(<BookingFlow page={KAVI} apiUrl={API} />);
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

        await screen.findByRole("heading", { name: "You're booked, Rahul." });
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
        render(<BookingFlow page={PAGE} apiUrl={API} />);
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
        render(<BookingFlow page={KAVI} apiUrl={API} />);
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
        render(<BookingFlow page={KAVI} apiUrl={API} />);
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
                screen.getByRole("heading", { name: "You're booked, Rahul." }),
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
        render(<BookingFlow page={PAGE} apiUrl={API} />);
        await chooseOneToOne();
        vi.useFakeTimers({ shouldAdvanceTime: true });
        fireEvent.click(
            screen.getByRole("button", { name: "Pay ₹1,200 and book" }),
        );
        await screen.findByText("Pay with UPI or card in the Razorpay window");
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
        render(<BookingFlow page={PAGE} apiUrl={API} />);
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
            phone: undefined,
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
        expect(checkouts.opened).toHaveLength(2);
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
        expect(checkouts.opened).toHaveLength(2);
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
        expect(checkouts.opened).toHaveLength(2);
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
                initialServiceId="svc_pt"
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
        fireEvent.change(screen.getByLabelText("Email"), {
            target: { value: "asha@example.in" },
        });
        expect(screen.queryByText(/UPI or card/)).toBeNull();
        expect(checkouts.opened).toHaveLength(0);
    });
});
