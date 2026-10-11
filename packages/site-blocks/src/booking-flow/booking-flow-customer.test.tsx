import {
    cleanup,
    fireEvent,
    render,
    screen,
    waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { SignedInCustomer } from "../account/api";
import { viewport } from "../test-viewport";
import type { SignedInBookRequest } from "./api";
import { resultOf } from "./api";
import {
    BOOKING_DRAFT_MS,
    draftSearch,
    parseBookingDraft,
} from "./booking-draft";
import type { BookingAccount } from "./booking-flow";
import BookingFlow, { accountPhone } from "./booking-flow";
import type { BookingPageData } from "./model";
import { googleCalendarHref, isBookResult, laterSkip } from "./model";

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
        await screen.findByRole("radio", { name: "7:00 am with Karan Mehta" }),
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

describe("the booking page on a phone", () => {
    it("draws the aside and the pinned bar both, and shows one by the screen's width", async () => {
        serve((url) =>
            url.endsWith("/days") ? json(ONE_DAYS) : json(booked, 201),
        );
        const { container, unmount } = render(
            <BookingFlow page={PAGE} apiUrl={API} account={account()} />,
        );
        await chooseOneToOne();
        // Both are in the page the server sends: no script picks one.
        expect(container.querySelector("aside")).not.toBeNull();
        expect(container.querySelector("[data-booking-bar]")).not.toBeNull();
        // At a desk the aside's button is the one a visitor can press.
        expect(
            screen.getByRole("button", { name: /^Book/ }).closest("aside"),
        ).not.toBeNull();
        unmount();

        viewport("phone");
        render(<BookingFlow page={PAGE} apiUrl={API} account={account()} />);
        await chooseOneToOne();
        expect(
            screen
                .getByRole("button", { name: /^Book/ })
                .closest("[data-booking-bar]"),
        ).not.toBeNull();
    });

    it("asks no script how wide the screen is", () => {
        for (const file of ["booking-flow.tsx", "flow-helpers.ts"]) {
            const source = readFileSync(join(__dirname, file), "utf8");
            expect(source).not.toMatch(/matchMedia|usePhone|innerWidth/);
        }
    });

    it("gives each day and time 44px under a finger", async () => {
        serve(() => json(ONE_DAYS));
        render(<BookingFlow page={PAGE} apiUrl={API} account={account()} />);
        fireEvent.click(
            screen.getByRole("radio", { name: /Personal training/ }),
        );
        const day = await screen.findByRole("radio", {
            name: "Sun 20 Sep: 1 time free",
        });
        expect(day.className).toContain("coarse:min-h-11");
        expect(day.parentElement?.className).toContain(
            "coarse:grid-cols-[repeat(auto-fill,minmax(44px,1fr))]",
        );
        // A time is 45px tall already.
        expect(
            screen.getByRole("radio", { name: "7:00 am with Karan Mehta" })
                .className,
        ).toContain("h-[45px]");
    });
});

// ── Choosing: what it is, who with, and which weeks ──────────────────────

const TWO_PEOPLE = {
    ...ONE_DAYS,
    staff: [
        { id: "staff_karan", name: "Karan Mehta" },
        { id: "staff_ritu", name: "Ritu Kapoor" },
    ],
};

describe("choosing on the booking page", () => {
    it("shows the chosen service's description", () => {
        serve(() => json(ONE_DAYS));
        const page = {
            ...PAGE,
            services: [
                {
                    ...PAGE.services[0],
                    description: "One hour, one to one. Bring trainers.",
                },
            ],
        };
        render(<BookingFlow page={page} apiUrl={API} account={account()} />);
        expect(screen.queryByText(/Bring trainers/)).toBeNull();
        fireEvent.click(
            screen.getByRole("radio", { name: /Personal training/ }),
        );
        expect(
            screen.getByText("One hour, one to one. Bring trainers."),
        ).toBeVisible();
    });

    it("offers With: Anyone or a person when more than one takes it, and reads that person's times", async () => {
        serve(() => json(TWO_PEOPLE));
        render(<BookingFlow page={PAGE} apiUrl={API} account={account()} />);
        fireEvent.click(
            screen.getByRole("radio", { name: /Personal training/ }),
        );
        const group = await screen.findByRole("radiogroup", { name: "With" });
        expect(group).toBeVisible();
        expect(screen.getByRole("radio", { name: "Anyone" })).toHaveAttribute(
            "aria-checked",
            "true",
        );
        fireEvent.click(screen.getByRole("radio", { name: "Ritu Kapoor" }));
        await waitFor(() =>
            expect(calls.at(-1)?.url).toBe(
                `${API}/public/services/svc_pt/days?staffId=staff_ritu`,
            ),
        );
        expect(
            await screen.findByRole("radio", { name: "Ritu Kapoor" }),
        ).toHaveAttribute("aria-checked", "true");
        fireEvent.click(screen.getByRole("radio", { name: "Anyone" }));
        await waitFor(() =>
            expect(calls.at(-1)?.url).toBe(
                `${API}/public/services/svc_pt/days`,
            ),
        );
    });

    it("offers no choice of person when one takes it", async () => {
        serve(() => json({ ...ONE_DAYS, staff: [TWO_PEOPLE.staff[0]] }));
        render(<BookingFlow page={PAGE} apiUrl={API} account={account()} />);
        await chooseOneToOne();
        expect(screen.queryByRole("radiogroup", { name: "With" })).toBeNull();
    });

    it("shows later dates past the first two weeks, and the way back", async () => {
        serve(() => json(ONE_DAYS));
        render(<BookingFlow page={PAGE} apiUrl={API} account={account()} />);
        await chooseOneToOne();
        fireEvent.click(
            screen.getByRole("button", { name: "Show later dates" }),
        );
        await waitFor(() =>
            expect(calls.at(-1)?.url).toBe(
                `${API}/public/services/svc_pt/days?skip=14`,
            ),
        );
        // Other weeks are other times: the one chosen is let go.
        expect(
            await screen.findByRole("radio", {
                name: "7:00 am with Karan Mehta",
            }),
        ).toHaveAttribute("aria-checked", "false");
        // The business books 21 days ahead: nothing later than these.
        expect(
            screen.queryByRole("button", { name: "Show later dates" }),
        ).toBeNull();
        fireEvent.click(
            screen.getByRole("button", { name: "Show earlier dates" }),
        );
        await waitFor(() =>
            expect(calls.at(-1)?.url).toBe(
                `${API}/public/services/svc_pt/days`,
            ),
        );
    });

    it("goes as far ahead as the business books, and twelve weeks at most", () => {
        expect(laterSkip(0, 21)).toBe(14);
        expect(laterSkip(14, 21)).toBeNull();
        expect(laterSkip(0, 7)).toBeNull();
        expect(laterSkip(56, null)).toBe(70);
        expect(laterSkip(70, null)).toBeNull();
    });

    it("with nothing free, offers a call and a WhatsApp message, and later dates", async () => {
        serve(() =>
            json({
                ...ONE_DAYS,
                days: [{ date: "2026-09-20", open: true, starts: [] }],
            }),
        );
        render(
            <BookingFlow
                page={PAGE}
                apiUrl={API}
                account={account()}
                reach={{
                    phone: "+918040992210",
                    whatsapp: "https://wa.me/919845012345",
                }}
            />,
        );
        fireEvent.click(
            screen.getByRole("radio", { name: /Personal training/ }),
        );
        expect(
            await screen.findByText(/Nothing free in the next two weeks/),
        ).toBeVisible();
        expect(
            screen.getByRole("link", { name: "Call +91 80409 92210" }),
        ).toHaveAttribute("href", "tel:+918040992210");
        expect(
            screen.getByRole("link", { name: "Message on WhatsApp" }),
        ).toHaveAttribute("href", "https://wa.me/919845012345");
        expect(
            screen.getByRole("button", { name: "Show later dates" }),
        ).toBeVisible();
    });

    it("with nothing free and no way to reach them set, invents no link", async () => {
        serve(() =>
            json({
                ...ONE_DAYS,
                days: [{ date: "2026-09-20", open: true, starts: [] }],
            }),
        );
        render(<BookingFlow page={PAGE} apiUrl={API} account={account()} />);
        fireEvent.click(
            screen.getByRole("radio", { name: /Personal training/ }),
        );
        await screen.findByText(/Nothing free in the next two weeks/);
        expect(screen.queryByRole("link", { name: /^Call/ })).toBeNull();
        expect(screen.queryByRole("link", { name: /WhatsApp/ })).toBeNull();
    });
});

// ── Kept through a reload (the email code is read in another app) ────────

describe("the booking through a reload", () => {
    const signedOut = () => account({ customer: null });

    it("brings back the service and the time, says so, and never keeps the note or the phone number", async () => {
        serve(() => json(ONE_DAYS));
        render(<BookingFlow page={PAGE} apiUrl={API} account={signedOut()} />);
        await chooseOneToOne();
        fireEvent.change(screen.getByLabelText("Phone (optional)"), {
            target: { value: "98450 12345" },
        });
        fireEvent.change(screen.getByLabelText("Anything we should know?"), {
            target: { value: "I take blood thinners" },
        });
        // On to the email code, where the customer leaves for their inbox.
        fireEvent.click(
            screen.getByRole("button", { name: "Continue to sign in" }),
        );
        await screen.findByLabelText("Email");

        const stored = JSON.stringify({ ...window.sessionStorage });
        expect(stored).toContain("svc_pt");
        expect(stored).not.toContain("blood thinners");
        // Nor the phone number: what is about the person is not written
        // to the browser's storage. A signed-in customer's comes back
        // from their account.
        expect(stored).not.toContain("98450");
        expect(document.cookie).toBe("");
        expect(JSON.stringify({ ...window.localStorage })).not.toContain(
            "svc_pt",
        );

        // The page loads again: a new page, the same tab.
        cleanup();
        serve(() => json(ONE_DAYS));
        render(<BookingFlow page={PAGE} apiUrl={API} account={signedOut()} />);
        const seven = await screen.findByRole("radio", {
            name: "7:00 am with Karan Mehta",
        });
        await waitFor(() =>
            expect(seven).toHaveAttribute("aria-checked", "true"),
        );
        expect(
            screen.getByRole("radio", { name: /Personal training/ }),
        ).toHaveAttribute("aria-checked", "true");
        expect(screen.getByLabelText("Phone (optional)")).toHaveValue("");
        expect(screen.getByLabelText("Anything we should know?")).toHaveValue(
            "",
        );
        expect(
            screen.getAllByText(
                "We kept what you chose: Personal training, Sun 20 Sep at 7:00 am with Karan Mehta. Your note wasn't kept, so add it again if you need to.",
            ).length,
        ).toBeGreaterThan(0);
    });

    it("checks the kept time against what is free now, and chooses the next one when it has gone", async () => {
        serve(() => json(ONE_DAYS));
        render(<BookingFlow page={PAGE} apiUrl={API} account={signedOut()} />);
        await chooseOneToOne();
        cleanup();

        serve(() =>
            json({
                ...ONE_DAYS,
                days: [
                    {
                        date: "2026-09-20",
                        open: true,
                        starts: [
                            {
                                ...ONE_DAYS.days[0].starts[0],
                                startAt: "2026-09-20T03:30:00.000Z",
                                endAt: "2026-09-20T04:30:00.000Z",
                            },
                        ],
                    },
                ],
            }),
        );
        render(<BookingFlow page={PAGE} apiUrl={API} account={signedOut()} />);
        const nine = await screen.findByRole("radio", {
            name: "9:00 am with Karan Mehta",
        });
        await waitFor(() =>
            expect(nine).toHaveAttribute("aria-checked", "true"),
        );
        expect(
            screen.getAllByText(
                "That time has gone. We've chosen the next free one: Sun 20 Sep at 9:00 am.",
            ).length,
        ).toBeGreaterThan(0);
    });

    it("forgets it once the booking is made", async () => {
        serve((url) =>
            url.endsWith("/days") ? json(ONE_DAYS) : json(booked, 201),
        );
        render(<BookingFlow page={PAGE} apiUrl={API} account={account()} />);
        await chooseOneToOne();
        expect(window.sessionStorage.getItem("saroh.booking-draft")).not.toBe(
            null,
        );
        fireEvent.click(screen.getByRole("button", { name: /^Book/ }));
        await screen.findByRole("heading", { name: "You're booked, Asha." });
        // Forgotten in an effect, just after the heading is drawn.
        await waitFor(() =>
            expect(window.sessionStorage.getItem("saroh.booking-draft")).toBe(
                null,
            ),
        );
    });

    it("keeps only what it knows, for two hours, under the address without its tags", () => {
        const now = 1_800_000_000_000;
        const kept = (over: Record<string, unknown>) =>
            parseBookingDraft(
                JSON.stringify({
                    search: "service=svc_pt",
                    serviceId: "svc_pt",
                    skip: 14,
                    person: "staff_ritu",
                    startAt: "2026-09-20T01:30:00.000Z",
                    where: "ONLINE",
                    pay: "DESK",
                    phone: "98450 12345",
                    hadNote: true,
                    savedAt: now - 60_000,
                    ...over,
                }),
                now,
            );
        expect(kept({})).toMatchObject({
            serviceId: "svc_pt",
            skip: 14,
            person: "staff_ritu",
            startAt: "2026-09-20T01:30:00.000Z",
            where: "ONLINE",
            pay: "DESK",
            hadNote: true,
        });
        expect(
            kept({ note: "blood thinners", source: "qr-h7c" }),
        ).not.toHaveProperty("note");
        expect(kept({ source: "qr-h7c" })).not.toHaveProperty("source");
        expect(kept({ startAt: "soon", skip: 999, pay: "FREE" })).toMatchObject(
            { startAt: null, skip: 70, pay: null },
        );
        expect(kept({ serviceId: "../etc" })).toBeNull();
        expect(kept({ savedAt: now - BOOKING_DRAFT_MS - 1 })).toBeNull();
        expect(kept({ savedAt: now + 60_000 })).toBeNull();
        expect(parseBookingDraft("not json", now)).toBeNull();
        expect(parseBookingDraft(null, now)).toBeNull();

        expect(
            draftSearch("?service=svc_pt&src=qr-h7c&utm_source=ig&fbclid=x"),
        ).toBe("service=svc_pt");
    });
});

// ── Once booked ──────────────────────────────────────────────────────────

describe("the booked card's calendar", () => {
    it("offers Google Calendar beside the calendar file", async () => {
        serve((url) =>
            url.endsWith("/days") ? json(ONE_DAYS) : json(booked, 201),
        );
        render(<BookingFlow page={PAGE} apiUrl={API} account={account()} />);
        await chooseOneToOne();
        fireEvent.click(screen.getByRole("button", { name: /^Book/ }));
        await screen.findByRole("heading", { name: "You're booked, Asha." });
        expect(
            screen.getByRole("button", { name: "Add to calendar" }),
        ).toBeVisible();
        const link = screen.getByRole("link", {
            name: "Add to Google Calendar",
        });
        const href = new URL(link.getAttribute("href") ?? "");
        expect(href.origin + href.pathname).toBe(
            "https://calendar.google.com/calendar/render",
        );
        expect(href.searchParams.get("action")).toBe("TEMPLATE");
        expect(href.searchParams.get("text")).toBe(
            "Personal training · Pulse Fitness",
        );
        expect(href.searchParams.get("dates")).toBe(
            "20260920T013000Z/20260920T023000Z",
        );
        expect(link).toHaveAttribute("target", "_blank");
        expect(link.getAttribute("rel")).toContain("noopener");
    });

    it("builds the link from the booking alone", () => {
        const href = googleCalendarHref({
            title: "Cut & colour",
            startAt: "2026-09-20T01:30:00.000Z",
            endAt: "2026-09-20T02:30:00.000Z",
            description: "Need to change it?",
            location: " At Kavi Salon ",
        });
        const url = new URL(href);
        expect(url.searchParams.get("text")).toBe("Cut & colour");
        expect(url.searchParams.get("location")).toBe("At Kavi Salon");
        expect(
            new URL(
                googleCalendarHref({
                    title: "x",
                    startAt: "2026-09-20T01:30:00.000Z",
                    endAt: "2026-09-20T02:30:00.000Z",
                    description: "",
                    location: null,
                }),
            ).searchParams.has("location"),
        ).toBe(false);
    });
});
