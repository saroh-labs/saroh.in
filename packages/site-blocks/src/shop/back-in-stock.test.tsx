import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { WatchView } from "./back-in-stock-shape";
import {
    cleanWatchEmail,
    consentLine,
    isWatchOffer,
    isWatchTaken,
    isWatchView,
    stopWaitingWords,
    watchProblemOf,
    watchResultOf,
} from "./back-in-stock-shape";
import { StopWaitingPage } from "./stop-waiting-page";

/**
 * "Tell me when it's back" (DEC-174, U24, #1155): the API's answers
 * narrowed, its refusals said in the visitor's words, and the stop page.
 * The form in the product page's action slot is tested with the page
 * (`product/product-page.test.tsx`).
 */

const VIEW: WatchView = {
    state: "waiting",
    business: "Northwind Goods",
    product: "Linen shirt (Blue / M)",
};

describe("the API's answers", () => {
    it("narrows each shape field by field", () => {
        expect(isWatchOffer({ offered: true, why: null })).toBe(true);
        expect(isWatchOffer({ offered: false, why: "NO_EMAIL" })).toBe(true);
        expect(isWatchOffer({ offered: false, why: "MAYBE" })).toBe(false);
        expect(isWatchTaken({ state: "waiting", stopToken: null })).toBe(true);
        expect(isWatchTaken({ state: "waiting", stopToken: "v1.a.b" })).toBe(
            true,
        );
        expect(isWatchTaken({ state: "told", stopToken: null })).toBe(false);
        expect(isWatchView(VIEW)).toBe(true);
        expect(isWatchView({ ...VIEW, state: "gone" })).toBe(false);
        expect(isWatchView(null)).toBe(false);
    });

    it("says each refusal in the visitor's words, never the API's", () => {
        const envelope = (reason: string) => ({
            error: { message: "x", details: { reason } },
        });
        expect(watchProblemOf(409, envelope("IN_STOCK"))).toMatchObject({
            reason: "not-offered",
            message: "This is in stock now. Refresh the page to buy it.",
        });
        expect(watchProblemOf(409, envelope("SWITCHED_OFF")).reason).toBe(
            "not-offered",
        );
        expect(
            watchProblemOf(409, {
                error: { message: "x", details: { code: "TEST_RELEASE" } },
            }),
        ).toMatchObject({
            reason: "test-release",
            message:
                "This is a test release. Nothing here is ordered, booked or paid.",
        });
        expect(watchProblemOf(400, {}).reason).toBe("invalid");
        expect(watchProblemOf(404, {}).reason).toBe("missing");
        expect(watchProblemOf(429, {}).reason).toBe("busy");
        expect(watchProblemOf(500, {}).reason).toBe("error");
        // A 409 with no reason it knows is trouble, not "not offered".
        expect(watchProblemOf(409, {}).reason).toBe("error");
    });

    it("an answer that isn't the shape is trouble", () => {
        expect(watchResultOf(200, { offered: "yes" }, isWatchOffer)).toEqual({
            ok: false,
            reason: "error",
            message: "We couldn't save that. Try again.",
        });
        expect(
            watchResultOf(
                201,
                { state: "waiting", stopToken: "t" },
                isWatchTaken,
            ),
        ).toEqual({ ok: true, data: { state: "waiting", stopToken: "t" } });
    });
});

describe("the words", () => {
    it("tidies an address as the API keeps it, and refuses a typo", () => {
        expect(cleanWatchEmail("  Asha@Example.COM ")).toBe("asha@example.com");
        expect(cleanWatchEmail("asha@example")).toBeNull();
        expect(cleanWatchEmail("asha example.com")).toBeNull();
        expect(cleanWatchEmail("")).toBeNull();
        expect(cleanWatchEmail(42)).toBeNull();
    });

    it("names the business in the opt-in", () => {
        expect(consentLine("Northwind Goods")).toBe(
            "Northwind Goods will email you now and when it's back. Nothing else.",
        );
    });

    it("says each way a watch stands", () => {
        expect(stopWaitingWords(VIEW).title).toBe(
            "Stop waiting for Linen shirt (Blue / M)?",
        );
        expect(stopWaitingWords({ ...VIEW, state: "told" }).title).toBe(
            "We've emailed you about Linen shirt (Blue / M)",
        );
        expect(stopWaitingWords({ ...VIEW, state: "stopped" }).body).toBe(
            "You won't be emailed when Linen shirt (Blue / M) is back at Northwind Goods.",
        );
    });
});

describe("the stop page", () => {
    it("opening it stops nothing: Stop waiting is a button", async () => {
        const stop = vi.fn(() =>
            Promise.resolve({
                ok: true as const,
                data: { ...VIEW, state: "stopped" as const },
            }),
        );
        render(<StopWaitingPage view={VIEW} token="v1.w1.sig" stop={stop} />);
        expect(stop).not.toHaveBeenCalled();
        expect(
            screen.getByRole("heading", {
                name: "Stop waiting for Linen shirt (Blue / M)?",
            }),
        ).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Stop waiting" }));
        expect(
            await screen.findByRole("heading", {
                name: "You've stopped waiting",
            }),
        ).toBeInTheDocument();
        expect(stop).toHaveBeenCalledWith("v1.w1.sig");
        expect(
            screen.queryByRole("button", { name: "Stop waiting" }),
        ).toBeNull();
        expect(
            screen.getByRole("link", { name: "Go to the shop" }),
        ).toHaveAttribute("href", "/shop");
    });

    it("told already: nothing to stop", () => {
        render(
            <StopWaitingPage
                view={{ ...VIEW, state: "told" }}
                token="t"
                stop={vi.fn()}
            />,
        );
        expect(
            screen.queryByRole("button", { name: "Stop waiting" }),
        ).toBeNull();
        expect(
            screen.getByText(
                "Northwind Goods emailed you when it was back. There's nothing to stop.",
            ),
        ).toBeInTheDocument();
    });

    it("says a test release in its own words, and keeps the button", async () => {
        const stop = vi.fn(() =>
            Promise.resolve({
                ok: false as const,
                reason: "test-release" as const,
                message:
                    "This is a test release. Nothing here is ordered, booked or paid.",
            }),
        );
        render(<StopWaitingPage view={VIEW} token="t" stop={stop} />);
        fireEvent.click(screen.getByRole("button", { name: "Stop waiting" }));
        expect(await screen.findByRole("alert")).toHaveTextContent(
            "This is a test release.",
        );
        expect(
            screen.getByRole("button", { name: "Stop waiting" }),
        ).toBeInTheDocument();
    });

    it.each(["folio", "quiet", "live"] as const)(
        "under %s, is the look's own page",
        (look) => {
            const { container } = render(
                <StopWaitingPage
                    view={VIEW}
                    token="t"
                    stop={vi.fn()}
                    look={look}
                />,
            );
            expect(
                container.querySelector(`[data-site-state-look="${look}"]`),
            ).not.toBeNull();
        },
    );
});
