import type { RenderedBooking } from "@saroh/block-contract";
import { BLOCK_META } from "@saroh/block-contract";
import { act, render, screen } from "@testing-library/react";
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

    const json = (body: unknown) =>
        new Response(JSON.stringify(body), {
            status: 200,
            headers: { "content-type": "application/json" },
        });

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
