// @vitest-environment jsdom
/**
 * What happened, for the lines nobody's hand made (#1137): a hold that
 * lapsed unpaid reads "Lapsed", never "Cancelled · by the customer", and a
 * refund reads "Refunded ₹500 to how they paid" or "Refund failed".
 */
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { BookingEvent } from "@/lib/services/service";

import { HistoryCard } from "./cards";

// The card's module reaches the server-only API client through a sibling
// import; nothing here calls it.
vi.mock("@/lib/api/http", () => ({}));

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
    (
        globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
});

afterEach(() => {
    act(() => root.unmount());
    host.remove();
});

function event(over: Partial<BookingEvent>): BookingEvent {
    return {
        id: over.type ?? "e",
        type: "BOOKED",
        actor: null,
        fromStartAt: null,
        toStartAt: null,
        createdAt: "2026-10-21T05:30:00.000Z",
        ...over,
    };
}

function lines(events: BookingEvent[]): string[] {
    act(() =>
        root.render(<HistoryCard events={events} timezone="Asia/Kolkata" />),
    );
    return Array.from(
        host.querySelectorAll<HTMLLIElement>("li"),
        (li) => li.textContent,
    );
}

describe("HistoryCard (#1137)", () => {
    it("a lapsed hold is a lapse, with no 'by the customer'", () => {
        const [booked, lapsed] = lines([
            event({ id: "b", type: "BOOKED" }),
            event({
                id: "l",
                type: "LAPSED",
                fromStartAt: "2026-10-22T05:30:00.000Z",
            }),
        ]);
        expect(booked).toContain("by the customer");
        expect(lapsed).toContain("Lapsed: not paid in time");
        expect(lapsed).not.toContain("by the customer");
        expect(lapsed).not.toContain("Cancelled");
    });

    it("a refund in time, and one refused", () => {
        const [cancelled, refunded, failed] = lines([
            event({
                id: "c",
                type: "CANCELLED",
                actor: { name: "Meera Iyer" },
            }),
            event({
                id: "r",
                type: "REFUNDED",
                data: { amountCents: 50_000, currency: "INR", outcome: "SENT" },
            }),
            event({
                id: "f",
                type: "REFUND_FAILED",
                data: {
                    amountCents: 50_000,
                    currency: "INR",
                    outcome: "FAILED",
                },
            }),
        ]);
        expect(cancelled).toContain("Cancelled");
        expect(cancelled).toContain("Meera Iyer");
        expect(refunded).toContain("Refunded ₹500 to how they paid");
        expect(refunded).not.toContain("by the customer");
        expect(failed).toContain("Refund failed");
        expect(failed).not.toContain("by the customer");
    });

    it("a class cancelled with a reason says so, as typed (#1172)", () => {
        const [withReason, before, plain] = lines([
            event({
                id: "c1",
                type: "CANCELLED",
                actor: { name: "Neha Kapoor" },
                data: {
                    classCancelled: true,
                    reason: "Studio flooded <b>sorry</b>",
                },
            }),
            // Cancelled with the class before reasons were asked.
            event({
                id: "c2",
                type: "CANCELLED",
                actor: { name: "Neha Kapoor" },
                data: { classCancelled: true },
            }),
            event({ id: "c3", type: "CANCELLED", actor: { name: "Meera" } }),
        ]);
        expect(withReason).toContain("Class cancelled");
        expect(withReason).toContain("Reason: Studio flooded <b>sorry</b>");
        expect(withReason).toContain("Neha Kapoor");
        // Typed words, never markup.
        expect(host.querySelector("li b")).toBeNull();
        expect(before).toContain("Class cancelled");
        expect(before).not.toContain("Reason");
        expect(plain).toContain("Cancelled");
        expect(plain).not.toContain("Class cancelled");
        expect(plain).not.toContain("Reason");
    });
});
