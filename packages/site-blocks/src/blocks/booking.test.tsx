import type { RenderedBooking } from "@saroh/block-contract";
import { BLOCK_META } from "@saroh/block-contract";
import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import BookingSection from "./booking";

/** The days read's answer: one day in the business's zone, with `starts`. */
function days(
    starts: { startAt: string; endAt: string; placesLeft?: number | null }[],
    over: Record<string, unknown> = {},
) {
    return {
        timezone: "Asia/Kolkata",
        kind: "one",
        capacity: 1,
        days: [
            {
                date: "2026-09-21",
                open: true,
                closed: false,
                starts: starts.map((s) => ({
                    staffId: null,
                    staffName: null,
                    placesLeft: null,
                    ...s,
                })),
            },
        ],
        staff: [],
        ...over,
    };
}

/**
 * #264 — a 200 in the wrong shape used to throw during render ("slots is not
 * iterable") and take the merchant's page with it. Each of these must land
 * in the block's own error state instead.
 */
describe("booking days response", () => {
    const realFetch = globalThis.fetch;
    afterEach(() => {
        globalThis.fetch = realFetch;
    });

    async function renderWith(response: Response) {
        globalThis.fetch = vi.fn(() => Promise.resolve(response));
        render(
            <BookingSection
                siteId="site_1"
                content={BLOCK_META.booking.fixtures.default as RenderedBooking}
            />,
        );
        await act(async () => {
            await Promise.resolve();
        });
    }

    it.each([
        ["a bare list of slots", json([])],
        ["an object with no days", json({ slots: [] })],
        [
            "a start without a start time",
            json(days([{ endAt: "2026-09-20T10:00:00Z" } as never])),
        ],
        [
            "a start with an unparseable time",
            json(days([{ startAt: "soon", endAt: "later" }])),
        ],
        ["null", json(null)],
        ["a body that is not JSON", new Response("<html>", { status: 200 })],
    ])("shows the error state for %s", async (_label, response) => {
        await renderWith(response);
        expect(screen.getByRole("alert").textContent).toMatch(
            /couldn't load available times/,
        );
        expect(
            screen.getByRole("button", { name: "Try again" }),
        ).toBeInTheDocument();
    });

    it("still renders a well-formed answer", async () => {
        await renderWith(
            json(
                days([
                    {
                        startAt: "2026-09-21T08:30:00.000Z",
                        endAt: "2026-09-21T09:00:00.000Z",
                    },
                ]),
            ),
        );
        expect(screen.queryByRole("alert")).toBeNull();
        // The day, and its one time, in the business's zone.
        expect(screen.getByText("Mon 21 Sep")).toBeInTheDocument();
        expect(screen.getByText("2:00 pm")).toBeInTheDocument();
        expect(
            screen.getByText("Times are in India Standard Time"),
        ).toBeInTheDocument();
    });
});

/**
 * How the booking block reads the public API's failures. The G5 snapshot in
 * `blocks.test.tsx` pins the markup; these pin the behaviour: which failures
 * offer a retry, and which API messages a visitor gets to see.
 */

const CONTENT = {
    serviceId: "svc_1",
    title: "Book a visit",
} as RenderedBooking;

function json(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
    });
}

/** The API's error envelope (`AllExceptionsFilter`). */
function apiError(status: number, message: string): Response {
    return json(
        {
            error: {
                code: "ERROR",
                message,
                statusCode: status,
                correlationId: "cid_1",
            },
        },
        status,
    );
}

function stubFetch(...responses: Response[]) {
    const fetchMock = vi.fn();
    for (const res of responses) fetchMock.mockResolvedValueOnce(res);
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
}

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("booking block — availability failures", () => {
    it.each([404, 410])(
        "a %i says booking isn't open, with no Try again and no form",
        async (status) => {
            stubFetch(
                apiError(
                    status,
                    "This business isn't taking online bookings right now",
                ),
            );
            render(
                <BookingSection
                    siteId="site_1"
                    content={CONTENT}
                    apiUrl="https://api"
                />,
            );

            expect(
                await screen.findByText(/Online booking isn't open right now/),
            ).toBeInTheDocument();
            expect(screen.queryByRole("alert")).toBeNull();
            expect(
                screen.queryByRole("button", { name: "Try again" }),
            ).toBeNull();
            expect(
                screen.queryByRole("link", { name: "Book a time" }),
            ).toBeNull();
        },
    );

    it("a 500 shows the error and offers Try again", async () => {
        stubFetch(apiError(500, "Internal server error"));
        render(
            <BookingSection
                siteId="site_1"
                content={CONTENT}
                apiUrl="https://api"
            />,
        );

        expect(await screen.findByRole("alert")).toHaveTextContent(
            "We couldn't load available times right now",
        );
        expect(
            screen.getByRole("button", { name: "Try again" }),
        ).toBeInTheDocument();
    });
});

describe("booking block — sign-in is always on (A9)", () => {
    const startAt = "2026-09-21T08:30:00.000Z";
    const endAt = "2026-09-21T09:00:00.000Z";

    it("shows the next free times and sends the visitor to the booking page to book", async () => {
        stubFetch(json(days([{ startAt, endAt }]), 200));
        render(
            <BookingSection
                siteId="site_1"
                content={CONTENT}
                apiUrl="https://api"
                bookHref="/book"
            />,
        );

        const link = await screen.findByRole("link", { name: "Book a time" });
        expect(link).toHaveAttribute("href", "/book?service=svc_1");
        expect(
            screen.getByText(
                "You'll pick your time and confirm your email with a code.",
            ),
        ).toBeInTheDocument();
    });

    it("draws no guest details form, and books nothing itself", async () => {
        const fetchMock = stubFetch(json(days([{ startAt, endAt }]), 200));
        const { container } = render(
            <BookingSection
                siteId="site_1"
                content={CONTENT}
                apiUrl="https://api"
                bookHref="/book"
            />,
        );
        await screen.findByRole("link", { name: "Book a time" });

        expect(container.querySelector("form")).toBeNull();
        expect(container.querySelector("input")).toBeNull();
        expect(screen.queryByLabelText(/Email/)).toBeNull();
        expect(fetchMock).toHaveBeenCalledTimes(1);
        // The very read the booking page draws its times from.
        expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
            "https://api/public/sites/site_1/services/svc_1/days",
        );
    });

    it("in a preview, with no booking page, the button goes nowhere", async () => {
        stubFetch(json(days([{ startAt, endAt }]), 200));
        render(
            <BookingSection
                siteId="site_1"
                content={CONTENT}
                apiUrl="https://api"
            />,
        );

        const link = await screen.findByText("Book a time");
        expect(link).not.toHaveAttribute("href");
        expect(link).toHaveAttribute("aria-disabled", "true");
        // Its times are read, never tapped. They draw after the button on
        // a busy machine, so the test waits for them.
        expect((await screen.findByText("2:00 pm")).tagName).toBe("SPAN");
    });
});

describe("booking block — each free time is a way in", () => {
    const morning = {
        startAt: "2026-09-21T03:30:00.000Z",
        endAt: "2026-09-21T04:00:00.000Z",
    };
    const afternoon = {
        startAt: "2026-09-21T08:30:00.000Z",
        endAt: "2026-09-21T09:00:00.000Z",
    };

    it("links each time to the booking page with its service, day and time chosen", async () => {
        stubFetch(json(days([morning, afternoon]), 200));
        render(
            <BookingSection
                siteId="site_1"
                content={CONTENT}
                apiUrl="https://api"
                bookHref="/book"
            />,
        );
        // The day and the time on the wall in the business's zone: what
        // the booking page opens on (`findInitialStart`).
        expect(
            await screen.findByRole("link", {
                name: "Book Mon 21 Sep at 9:00 am",
            }),
        ).toHaveAttribute(
            "href",
            "/book?service=svc_1&date=2026-09-21&start=09%3A00",
        );
        const later = screen.getByRole("link", {
            name: "Book Mon 21 Sep at 2:00 pm",
        });
        expect(later).toHaveAttribute(
            "href",
            "/book?service=svc_1&date=2026-09-21&start=14%3A00",
        );
        // 44px under a finger.
        expect(later.className).toContain("coarse:min-h-11");
    });

    it("offers only a class session with a place left", async () => {
        stubFetch(
            json(
                days(
                    [
                        { ...morning, placesLeft: 0 },
                        { ...afternoon, placesLeft: 2 },
                    ],
                    { kind: "class", capacity: 12 },
                ),
                200,
            ),
        );
        render(
            <BookingSection
                siteId="site_1"
                content={CONTENT}
                apiUrl="https://api"
                bookHref="/book"
            />,
        );
        await screen.findByRole("link", { name: "Book Mon 21 Sep at 2:00 pm" });
        expect(
            screen.queryByRole("link", { name: "Book Mon 21 Sep at 9:00 am" }),
        ).toBeNull();
    });

    it("with nothing free, offers a call and a WhatsApp message where the business has them", async () => {
        stubFetch(json(days([]), 200));
        render(
            <BookingSection
                siteId="site_1"
                content={CONTENT}
                apiUrl="https://api"
                bookHref="/book"
                reach={{
                    phone: "+918040992210",
                    whatsapp: "https://wa.me/919845012345",
                }}
            />,
        );
        expect(
            await screen.findByText(/No open times in the next 14 days/),
        ).toBeInTheDocument();
        expect(
            screen.getByRole("link", { name: "Call +91 80409 92210" }),
        ).toHaveAttribute("href", "tel:+918040992210");
        expect(
            screen.getByRole("link", { name: "Message on WhatsApp" }),
        ).toHaveAttribute("href", "https://wa.me/919845012345");
    });

    it("with nothing free and no way set, says so and invents no link", async () => {
        stubFetch(json(days([]), 200));
        render(
            <BookingSection
                siteId="site_1"
                content={CONTENT}
                apiUrl="https://api"
                bookHref="/book"
            />,
        );
        await screen.findByText(/No open times in the next 14 days/);
        expect(screen.queryByRole("link", { name: /^Call/ })).toBeNull();
        expect(screen.queryByRole("link", { name: /WhatsApp/ })).toBeNull();
    });

    it("closed, offers the same ways to get in touch", async () => {
        stubFetch(apiError(404, "Not found"));
        render(
            <BookingSection
                siteId="site_1"
                content={CONTENT}
                apiUrl="https://api"
                reach={{ phone: "+918040992210", whatsapp: null }}
            />,
        );
        await screen.findByText(/Online booking isn't open right now/);
        expect(
            screen.getByRole("link", { name: "Call +91 80409 92210" }),
        ).toBeInTheDocument();
    });
});

describe("booking block — Next open (U6)", () => {
    const NEXT = {
        ...CONTENT,
        variant: "nextOpen",
        beforeYouBook: "Bring any recent reports.",
    } as RenderedBooking;
    /** Fourteen days from Tue 17 Nov; `open` lists the days with a 10:00 time. */
    function fortnight(open: number[], closed: number[] = []) {
        const list = Array.from({ length: 14 }, (_, i) => {
            const d = new Date(Date.UTC(2026, 10, 17 + i));
            const date = d.toISOString().slice(0, 10);
            return {
                date,
                open: open.includes(i),
                closed: closed.includes(i),
                starts: open.includes(i)
                    ? [
                          {
                              startAt: `${date}T04:30:00.000Z`,
                              endAt: `${date}T05:15:00.000Z`,
                              staffId: null,
                              staffName: null,
                              placesLeft: null,
                          },
                      ]
                    : [],
            };
        });
        return {
            timezone: "Asia/Kolkata",
            kind: "one",
            capacity: 1,
            days: list,
            staff: [],
        };
    }

    it("shows the next three open days, links each time and day, and the owner's note", async () => {
        stubFetch(json(fortnight([1, 2, 4, 6], [0, 5])));
        render(
            <BookingSection
                siteId="site_1"
                content={NEXT}
                apiUrl="https://api"
                bookHref="/book"
            />,
        );
        const first = await screen.findByRole("link", {
            name: "Book Wed 18 Nov at 10:00 am, open",
        });
        expect(first).toHaveAttribute(
            "href",
            "/book?service=svc_1&date=2026-11-18&start=10%3A00",
        );
        expect(screen.getByText("Tomorrow")).toBeTruthy();
        // Three days only; the fourth open day is in the strip, not a row.
        expect(
            screen.queryByRole("link", { name: /Mon 23 Nov at/ }),
        ).toBeNull();
        expect(
            screen.getByRole("link", { name: "Mon 23 Nov, open times" }),
        ).toHaveAttribute("href", "/book?service=svc_1&date=2026-11-23");
        // Today is closed: greyed, plain, not a link.
        expect(screen.getByLabelText("Tue 17 Nov, closed").tagName).toBe(
            "SPAN",
        );
        expect(screen.getByLabelText("Sun 22 Nov, closed").tagName).toBe(
            "SPAN",
        );
        expect(screen.getByText(/Bring any recent reports/)).toBeTruthy();
        expect(
            screen.getByRole("link", { name: "See every time" }),
        ).toHaveAttribute("href", "/book?service=svc_1");
        expect(document.body.textContent).not.toMatch(/\bFree\b/);
    });

    it("with nothing open in two weeks, says so and asks", async () => {
        stubFetch(json(fortnight([])));
        render(
            <BookingSection
                siteId="site_1"
                content={NEXT}
                apiUrl="https://api"
                bookHref="/book"
                askHref="/contact#enquiry"
                reach={{ phone: "+910000001006", whatsapp: null }}
            />,
        );
        expect(
            await screen.findByText("No open times in the next two weeks"),
        ).toBeTruthy();
        expect(screen.getByRole("link", { name: "Ask us" })).toHaveAttribute(
            "href",
            "/contact#enquiry",
        );
    });

    it("a failed read says booking still works, with Try again", async () => {
        stubFetch(json({}, 500));
        render(
            <BookingSection
                siteId="site_1"
                content={NEXT}
                apiUrl="https://api"
                bookHref="/book"
            />,
        );
        expect(await screen.findByText(/Open times didn.t load/)).toBeTruthy();
        expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
        expect(
            screen.getByRole("link", { name: "Booking page" }),
        ).toHaveAttribute("href", "/book?service=svc_1");
    });
});
