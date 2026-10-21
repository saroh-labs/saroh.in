import {
    act,
    fireEvent,
    render,
    screen,
    waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SignedInCustomer } from "../account/api";
import type { BookingLookup } from "../account/booking-page";
import type { AccountBookingRow } from "../account/bookings-model";
import type { SignedInBookRequest } from "./api";
import { resultOf } from "./api";
import type { BookingAccount } from "./booking-flow";
import BookingFlow from "./booking-flow";
import type { CheckoutOutcome, CheckoutRequest } from "./checkout";
import type { BookingPageData } from "./model";
import { isBookResult } from "./model";

/** The provider's window (E11), stood in for, as the flow's own suite does. */
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
 * The booking step in the address (site templates v2 U9): each step a new
 * history entry, Back and Forward walking them with no server render, a
 * link or a reload opening on its step, and nothing private in the address.
 * The page keeps its look (Classic); what the existing suites pin about it
 * (`booking-flow*.test.tsx`) passes unchanged beside these.
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
            staff: ["Karan Mehta", "Ritu Kapoor"],
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

const KARAN = "2026-09-20T01:30:00.000Z"; // 7:00 am in Kolkata
const RITU = "2026-09-20T03:30:00.000Z"; // 9:00 am

function oneDays(staffId: string | null) {
    const starts = [
        {
            startAt: KARAN,
            endAt: "2026-09-20T02:30:00.000Z",
            staffId: "staff_karan",
            staffName: "Karan Mehta",
            placesLeft: null,
        },
        {
            startAt: RITU,
            endAt: "2026-09-20T04:30:00.000Z",
            staffId: "staff_ritu",
            staffName: "Ritu Kapoor",
            placesLeft: null,
        },
    ].filter((s) => !staffId || s.staffId === staffId);
    return {
        timezone: "Asia/Kolkata",
        kind: "one",
        capacity: 1,
        staff: [
            { id: "staff_karan", name: "Karan Mehta" },
            { id: "staff_ritu", name: "Ritu Kapoor" },
        ],
        days: [{ date: "2026-09-20", open: true, starts }],
    };
}

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
                    startAt: "2026-09-20T13:00:00.000Z", // 6:30 pm
                    endAt: "2026-09-20T13:45:00.000Z",
                    staffId: "staff_ritu",
                    staffName: "Ritu Kapoor",
                    placesLeft: 4,
                },
            ],
        },
    ],
};

const ASHA: SignedInCustomer = { email: "asha@example.com", name: "Asha Rao" };

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

const booked = (over: Record<string, unknown> = {}) => ({
    reference: "bk_1",
    startAt: KARAN,
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

let calls: { url: string; init?: RequestInit }[];
function serve(handler: (url: string, init?: RequestInit) => Response) {
    calls = [];
    globalThis.fetch = vi.fn((input: string, init?: RequestInit) => {
        calls.push({ url: input, init });
        return Promise.resolve(handler(input, init));
    }) as unknown as typeof fetch;
}

/** The time a booking request asked for, as the API books it. */
function startOf(init?: RequestInit): string {
    const body = JSON.parse(
        typeof init?.body === "string" ? init.body : "{}",
    ) as {
        startAt?: string;
    };
    return body.startAt ?? KARAN;
}

/** Times for whoever is asked, a booking, and a pay-now hold's own API. */
function serveAll(hold = { state: "HELD" }, payNow = false) {
    serve((url, init) => {
        if (url.includes("/svc_hiit/days")) return json(CLASS_DAYS);
        if (url.includes("/days")) {
            const staff = new URL(url).searchParams.get("staffId");
            return json(oneDays(staff));
        }
        if (url.endsWith("/book")) {
            return json(
                payNow
                    ? booked({
                          startAt: startOf(init),
                          state: "HELD",
                          holdExpiresAt: "2026-09-18T04:15:00.000Z",
                          payToken: "tok_1",
                      })
                    : booked({ startAt: startOf(init) }),
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
                publicKey: "rzp_live_public",
                clientParams: { razorpayOrderId: "order_1" },
            });
        }
        if (url.endsWith("/release")) {
            hold.state = "RELEASED";
            return json({ state: "RELEASED", holdExpiresAt: null });
        }
        return json({ state: hold.state, holdExpiresAt: null });
    });
    return hold;
}

const here = () => new URLSearchParams(window.location.search);

/** The browser's Back and Forward: the History API's own traversal. */
async function traverse(go: () => void, step: string) {
    await act(async () => {
        go();
        await waitFor(() => expect(here().get("step")).toBe(step));
    });
}
const back = (step: string) => traverse(() => window.history.back(), step);
const forward = (step: string) =>
    traverse(() => window.history.forward(), step);

const realFetch = globalThis.fetch;
let pushes: string[];
beforeEach(() => {
    checkouts.opened = [];
    window.history.replaceState(null, "", "/book");
    pushes = [];
    const push = window.history.pushState.bind(window.history);
    vi.spyOn(window.history, "pushState").mockImplementation((data, t, url) => {
        pushes.push(String(url));
        push(data, t, url);
    });
    window.matchMedia = vi.fn(() => ({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
    })) as unknown as typeof window.matchMedia;
});
afterEach(() => {
    globalThis.fetch = realFetch;
    vi.restoreAllMocks();
    vi.useRealTimers();
});

/** Service, then person, then time: each a step of its own. */
async function serviceThenPersonThenTime() {
    fireEvent.click(screen.getByRole("radio", { name: /Personal training/ }));
    await screen.findByRole("radiogroup", { name: "With" });
    expect(here().get("step")).toBe("who");
    fireEvent.click(screen.getByRole("radio", { name: "Ritu Kapoor" }));
    await waitFor(() => expect(here().get("step")).toBe("when"));
    fireEvent.click(
        await screen.findByRole("radio", { name: "9:00 am with Ritu Kapoor" }),
    );
    await waitFor(() => expect(here().get("step")).toBe("details"));
}

describe("the step in the address (U9)", () => {
    it("moves service → person → time as history entries, with no server render", async () => {
        serveAll();
        render(<BookingFlow page={PAGE} apiUrl={API} account={account()} />);
        // As the page opens, nothing is written: the address is the server's.
        expect(window.location.search).toBe("");
        await serviceThenPersonThenTime();

        expect(pushes).toEqual([
            "/book?service=svc_pt&step=who",
            "/book?service=svc_pt&staff=staff_ritu&step=when",
            "/book?service=svc_pt&staff=staff_ritu&date=2026-09-20&start=09%3A00&step=details",
        ]);
        // Every request was the API's own: the page itself was never asked
        // for again.
        expect(
            calls.every((c) => new URL(c.url).origin === new URL(API).origin),
        ).toBe(true);
    });

    it("Back returns to the person step with the service kept, and Forward chooses the time again", async () => {
        serveAll();
        render(<BookingFlow page={PAGE} apiUrl={API} account={account()} />);
        await serviceThenPersonThenTime();
        // Something typed on the page survives every step: no remount.
        fireEvent.change(screen.getByLabelText("Phone (optional)"), {
            target: { value: "98450 12345" },
        });

        await back("when");
        await waitFor(() =>
            expect(
                screen.getByRole("radio", { name: "9:00 am with Ritu Kapoor" }),
            ).toHaveAttribute("aria-checked", "false"),
        );
        expect(
            screen.getByRole("radio", { name: /Personal training/ }),
        ).toHaveAttribute("aria-checked", "true");
        expect(
            screen.getByRole("radio", { name: "Ritu Kapoor" }),
        ).toHaveAttribute("aria-checked", "true");
        // The step's own heading has focus, for a screen reader.
        expect(document.activeElement).toBe(
            screen.getByRole("heading", { name: "When?" }),
        );

        await back("who");
        await waitFor(() =>
            expect(
                screen.getByRole("radio", { name: "Anyone" }),
            ).toHaveAttribute("aria-checked", "true"),
        );
        expect(
            screen.getByRole("radio", { name: /Personal training/ }),
        ).toHaveAttribute("aria-checked", "true");

        await forward("when");
        await forward("details");
        await waitFor(() =>
            expect(
                screen.getByRole("radio", { name: "9:00 am with Ritu Kapoor" }),
            ).toHaveAttribute("aria-checked", "true"),
        );
        expect(screen.getByLabelText("Phone (optional)")).toHaveValue(
            "98450 12345",
        );
    });

    it("a link without a step: choosing a class is one entry, and Back unchooses it in place", async () => {
        window.history.replaceState(null, "", "/book?service=svc_hiit");
        serveAll();
        render(
            <BookingFlow
                page={PAGE}
                apiUrl={API}
                account={account()}
                initialServiceId="svc_hiit"
            />,
        );
        fireEvent.click(
            await screen.findByRole("radio", { name: /6:30 to 7:15 pm/ }),
        );
        await waitFor(() => expect(here().get("step")).toBe("details"));
        expect(pushes).toHaveLength(1);
        // Back to choosing another: the class is unchosen, in place.
        await back("when");
        expect(here().get("start")).toBeNull();
    });

    it("never puts a note, a phone, an email or a payment token in the address", async () => {
        const hold = serveAll(undefined, true);
        render(<BookingFlow page={PAGE} apiUrl={API} account={account()} />);
        await serviceThenPersonThenTime();
        fireEvent.change(screen.getByLabelText("Phone (optional)"), {
            target: { value: "98450 12345" },
        });
        fireEvent.change(screen.getByLabelText("Anything we should know?"), {
            target: { value: "I take blood thinners" },
        });
        vi.useFakeTimers({ shouldAdvanceTime: true });
        fireEvent.click(
            screen.getByRole("button", { name: "Pay ₹1,200 and book" }),
        );
        await screen.findByText("Pay online in the payment window");
        await waitFor(() => expect(here().get("step")).toBe("pay"));
        expect(hold.state).toBe("HELD");
        for (const url of [...pushes, window.location.href]) {
            expect(url).not.toMatch(/98450|blood|asha|tok_1|order_1|pi_1/i);
        }
    });
});

describe("a pay-now hold through Back and Forward (U9)", () => {
    async function holding() {
        const hold = serveAll(undefined, true);
        render(<BookingFlow page={PAGE} apiUrl={API} account={account()} />);
        await serviceThenPersonThenTime();
        vi.useFakeTimers({ shouldAdvanceTime: true });
        fireEvent.click(
            screen.getByRole("button", { name: "Pay ₹1,200 and book" }),
        );
        await screen.findByText("Pay online in the payment window");
        await waitFor(() => expect(checkouts.opened.length).toBe(1));
        return hold;
    }
    const bookings = () => calls.filter((c) => c.url.endsWith("/book"));
    const releases = () => calls.filter((c) => c.url.endsWith("/release"));

    it("survives a step back: nothing is let go, and Forward pays the same hold", async () => {
        await holding();
        await back("details");
        expect(
            await screen.findByRole("heading", { name: "Your details" }),
        ).toBeInTheDocument();
        expect(releases()).toHaveLength(0);
        // The window closes with the paying card; the hold stays.
        expect(checkouts.opened[0]?.closed).toBe(true);

        await forward("pay");
        expect(
            await screen.findByRole("heading", {
                name: "Pay ₹1,200 to confirm your place",
            }),
        ).toBeInTheDocument();
        expect(bookings()).toHaveLength(1);
        expect(releases()).toHaveLength(0);
        // The same payment, opened again.
        await waitFor(() => expect(checkouts.opened.length).toBe(2));
        expect(checkouts.opened[1]?.request.handoff.providerIntentId).toBe(
            "order_1",
        );
    });

    it("the same choice booked again after Back goes back to paying it, booking nothing new", async () => {
        await holding();
        await back("details");
        fireEvent.click(
            await screen.findByRole("button", { name: "Pay ₹1,200 and book" }),
        );
        expect(
            await screen.findByRole("heading", {
                name: "Pay ₹1,200 to confirm your place",
            }),
        ).toBeInTheDocument();
        expect(bookings()).toHaveLength(1);
        await waitFor(() => expect(here().get("step")).toBe("pay"));
    });

    it("another time after Back lets the kept hold go before booking it", async () => {
        const hold = await holding();
        await back("details");
        fireEvent.click(screen.getByRole("radio", { name: "Anyone" }));
        fireEvent.click(
            await screen.findByRole("radio", {
                name: "7:00 am with Karan Mehta",
            }),
        );
        fireEvent.click(
            screen.getByRole("button", { name: "Pay ₹1,200 and book" }),
        );
        await waitFor(() => expect(bookings()).toHaveLength(2));
        expect(releases()).toHaveLength(1);
        expect(hold.state).toBe("RELEASED");
    });

    it("'Not you?' after Back lets their hold go, so no one else pays for it", async () => {
        await holding();
        await back("details");
        fireEvent.click(screen.getByRole("button", { name: "Not you?" }));
        await waitFor(() => expect(releases()).toHaveLength(1));
        expect(
            await screen.findByRole("button", { name: "Continue to sign in" }),
        ).toBeInTheDocument();
    });

    it("a payment the window took while they were Back a step still books it", async () => {
        const hold = await holding();
        await back("details");
        hold.state = "CONFIRMED";
        await act(async () => {
            await vi.advanceTimersByTimeAsync(4_500);
        });
        expect(
            await screen.findByRole("heading", {
                name: "You're booked, Asha.",
            }),
        ).toBeInTheDocument();
        await waitFor(() => expect(here().get("step")).toBe("done"));
        expect(here().get("ref")).toBe("bk_1");
    });
});

describe("a link, or a reload, on a step (U9)", () => {
    it("opens on the time step with the choices, and writes nothing", async () => {
        window.history.replaceState(
            null,
            "",
            "/book?service=svc_pt&staff=staff_ritu&date=2026-09-20&start=09%3A00&step=details",
        );
        const opened = window.location.href;
        serveAll();
        render(
            <BookingFlow
                page={PAGE}
                apiUrl={API}
                account={account()}
                initialServiceId="svc_pt"
                initialStaff="staff_ritu"
                initialDate="2026-09-20"
                initialStart="09:00"
                initialStep="details"
            />,
        );
        await waitFor(() =>
            expect(
                screen.getByRole("radio", { name: "9:00 am with Ritu Kapoor" }),
            ).toHaveAttribute("aria-checked", "true"),
        );
        // The person's own times were read.
        expect(calls[0]?.url).toBe(
            `${API}/public/services/svc_pt/days?staffId=staff_ritu`,
        );
        expect(
            screen.getByRole("heading", { name: "Your details" }),
        ).toBeVisible();
        expect(window.location.href).toBe(opened);
        expect(pushes).toHaveLength(0);
    });

    it("a pay link with no hold checks the time again, on when, in place", async () => {
        window.history.replaceState(
            null,
            "",
            "/book?service=svc_pt&date=2026-09-20&start=07%3A00&step=pay",
        );
        serveAll();
        render(
            <BookingFlow
                page={PAGE}
                apiUrl={API}
                account={account()}
                initialServiceId="svc_pt"
                initialDate="2026-09-20"
                initialStart="07:00"
                initialStep="pay"
            />,
        );
        await waitFor(() =>
            expect(
                screen.getByRole("radio", { name: "7:00 am with Karan Mehta" }),
            ).toHaveAttribute("aria-checked", "true"),
        );
        await waitFor(() => expect(here().get("step")).toBe("when"));
        expect(here().get("start")).toBe("07:00");
        expect(pushes).toHaveLength(0);
        expect(calls.some((c) => c.url.endsWith("/book"))).toBe(false);
    });

    it("who, for a service one person takes, is put right to when", async () => {
        window.history.replaceState(
            null,
            "",
            "/book?service=svc_hiit&step=who",
        );
        serveAll();
        render(
            <BookingFlow
                page={PAGE}
                apiUrl={API}
                account={account()}
                initialServiceId="svc_hiit"
                initialStep="who"
            />,
        );
        await screen.findByRole("radio", { name: /6:30 to 7:15 pm/ });
        fireEvent.click(screen.getByRole("radio", { name: /6:30 to 7:15 pm/ }));
        await waitFor(() => expect(here().get("step")).toBe("details"));
        // The class session came first; there was no person step to push.
        expect(pushes).toEqual([
            "/book?service=svc_hiit&date=2026-09-20&start=18%3A30&step=details",
        ]);
    });

    it("a class from the timetable opens on details with the class chosen", async () => {
        serveAll();
        render(
            <BookingFlow
                page={PAGE}
                apiUrl={API}
                account={account()}
                initialServiceId="svc_hiit"
                initialDate="2026-09-20"
                initialStart="18:30"
                initialStep="details"
            />,
        );
        await waitFor(() =>
            expect(
                screen.getByRole("radio", { name: /6:30 to 7:15 pm/ }),
            ).toHaveAttribute("aria-checked", "true"),
        );
        expect(
            screen.getByRole("heading", { name: "Your details" }),
        ).toBeVisible();
    });
});

describe("the booked step (U9)", () => {
    const ROW: AccountBookingRow = {
        ref: "bk_1",
        service: "Personal training",
        serviceRef: "svc_pt",
        startAt: KARAN,
        endAt: "2026-09-20T02:30:00.000Z",
        timezone: "Asia/Kolkata",
        staff: "Karan Mehta",
        online: false,
        state: "booked",
        kind: "one",
        visit: null,
        cancelledLate: false,
        move: null,
        cancel: null,
    };
    const atDone = (booked: BookingLookup) =>
        render(
            <BookingFlow
                page={PAGE}
                apiUrl={API}
                account={account()}
                initialStep="done"
                initialRef="bk_1"
                booked={booked}
            />,
        );

    it("after a reload, reads the ticket from the customer's own booking", () => {
        serveAll();
        atDone({ ok: true, booking: ROW });
        expect(
            screen.getByRole("heading", { name: "You're booked." }),
        ).toBeInTheDocument();
        expect(screen.getByText(/^Personal training · /)).toBeInTheDocument();
        expect(
            screen.getByRole("link", { name: /Move or cancel it/ }),
        ).toHaveAttribute("href", "/account/bookings/bk_1");
    });

    it("someone else's, or signed out: says it couldn't find it, never a blank", () => {
        serveAll();
        atDone({ ok: false, reason: "missing" });
        expect(
            screen.getByRole("heading", {
                name: "We couldn't find this booking",
            }),
        ).toBeInTheDocument();
        expect(screen.queryByText(/Karan/)).toBeNull();
    });

    it("a read that failed says so, apart from one that isn't there", () => {
        serveAll();
        atDone({ ok: false, reason: "unavailable" });
        expect(
            screen.getByRole("heading", {
                name: "We couldn't load this booking",
            }),
        ).toBeInTheDocument();
    });

    it("booked here: the address names it, Back leaves it, and Forward shows it again", async () => {
        serveAll();
        render(<BookingFlow page={PAGE} apiUrl={API} account={account()} />);
        await serviceThenPersonThenTime();
        fireEvent.click(screen.getByRole("radio", { name: /Pay at the desk/ }));
        fireEvent.click(screen.getByRole("button", { name: /^Book/ }));
        await screen.findByRole("heading", { name: "You're booked, Asha." });
        await waitFor(() => expect(here().get("step")).toBe("done"));
        expect(here().get("ref")).toBe("bk_1");

        await back("details");
        expect(
            await screen.findByRole("heading", { name: "Your details" }),
        ).toBeInTheDocument();
        await forward("done");
        expect(
            await screen.findByRole("heading", {
                name: "You're booked, Asha.",
            }),
        ).toBeInTheDocument();
        // Booked once: Back and Forward never book again.
        expect(calls.filter((c) => c.url.endsWith("/book"))).toHaveLength(1);
    });
});
