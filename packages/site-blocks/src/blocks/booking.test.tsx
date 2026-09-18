import type { RenderedBooking } from "@saroh/block-contract";
import { BLOCK_META } from "@saroh/block-contract";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import BookingSection from "./booking";

/**
 * #264 — a 200 from the availability endpoint in the wrong shape used to throw
 * during render ("slots is not iterable") and take the merchant's page with it.
 * Each of these must land in the block's own error state instead.
 */
describe("booking availability response", () => {
    const realFetch = globalThis.fetch;
    afterEach(() => {
        globalThis.fetch = realFetch;
    });

    async function renderWith(response: Response) {
        globalThis.fetch = vi.fn(() => Promise.resolve(response));
        render(
            <BookingSection
                content={BLOCK_META.booking.fixtures.default as RenderedBooking}
            />,
        );
        await act(async () => {
            await Promise.resolve();
        });
    }

    it.each([
        ["an object instead of a list", json({ slots: [] })],
        ["a slot without a start", json([{ endAt: "2026-09-20T10:00:00Z" }])],
        [
            "a slot with an unparseable start",
            json([{ startAt: "soon", endAt: "later" }]),
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

    it("still renders a well-formed list of slots", async () => {
        await renderWith(
            json([
                {
                    startAt: "2026-09-21T14:00:00.000Z",
                    endAt: "2026-09-21T14:30:00.000Z",
                },
            ]),
        );
        expect(screen.queryByRole("alert")).toBeNull();
        expect(screen.getAllByRole("radio")).toHaveLength(1);
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
            render(<BookingSection content={CONTENT} apiUrl="https://api" />);

            expect(
                await screen.findByText(/Online booking isn't open right now/),
            ).toBeInTheDocument();
            expect(screen.queryByRole("alert")).toBeNull();
            expect(
                screen.queryByRole("button", { name: "Try again" }),
            ).toBeNull();
            expect(
                screen.queryByRole("button", { name: "Confirm booking" }),
            ).toBeNull();
        },
    );

    it("a 500 shows the error and offers Try again", async () => {
        stubFetch(apiError(500, "Internal server error"));
        render(<BookingSection content={CONTENT} apiUrl="https://api" />);

        expect(await screen.findByRole("alert")).toHaveTextContent(
            "We couldn't load available times right now",
        );
        expect(
            screen.getByRole("button", { name: "Try again" }),
        ).toBeInTheDocument();
    });
});

describe("booking block — submit failures", () => {
    const startAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const endAt = new Date(Date.now() + 25 * 60 * 60 * 1000).toISOString();

    async function pickSlotAndSubmit() {
        render(<BookingSection content={CONTENT} apiUrl="https://api" />);
        fireEvent.click(await screen.findByRole("radio"));
        fireEvent.change(screen.getByLabelText(/Email/), {
            target: { value: "jane@example.com" },
        });
        fireEvent.click(
            screen.getByRole("button", { name: "Confirm booking" }),
        );
    }

    it("shows the API's message from a 4xx error envelope", async () => {
        stubFetch(json([{ startAt, endAt }], 200), apiError(400, "x"));
        await pickSlotAndSubmit();

        expect(await screen.findByRole("alert")).toHaveTextContent(/^x$/);
    });

    it("never shows a 5xx body", async () => {
        stubFetch(
            json([{ startAt, endAt }], 200),
            apiError(500, "Internal server error"),
        );
        await pickSlotAndSubmit();

        expect(await screen.findByRole("alert")).toHaveTextContent(
            "Something went wrong — please check your details and try again.",
        );
    });
});
