// @vitest-environment jsdom
/**
 * Subscriptions on React Query, first paint (owner, 25 Nov): the header,
 * its button, the tabs and New plan are drawn at once; the count is a bar,
 * the rows the loader's own and Subscribe someone waits for the plans it
 * offers. When the list lands the rows replace the skeleton in place.
 */
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
    usePathname: () => "/billing/subscriptions",
    useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/subscriptions/actions", () => ({}));
vi.mock("@/lib/gst-rates/actions", () => ({}));
// The quick look records a payment and makes a link (finding 21).
vi.mock("@/lib/invoices/actions", () => ({}));
vi.mock("@/lib/invoices/link-actions", () => ({}));

import { renderWithQuery } from "@/lib/query/test-utils";

import { SubscriptionsContainer } from "./subscriptions-container";

const SUB = {
    id: "sub_1",
    status: "ACTIVE",
    plan: { id: "pl_1", name: "Loaf plan" },
    contact: { id: "c_1", name: "Asha Rao", email: "asha@example.com" },
    price: "800.00",
    currency: "INR",
    interval: "MONTH",
    timezone: "Asia/Kolkata",
    currentPeriodStart: "2026-11-01T00:00:00.000Z",
    currentPeriodEnd: "2026-12-01T00:00:00.000Z",
    nextRenewalAt: "2026-11-30T18:30:00.000Z",
    startsAt: null,
    endsAt: null,
    pausedAt: null,
    pausedUntil: null,
    cancelledAt: null,
    overdue: false,
    overdueCount: 0,
    unpaidCount: 0,
    unpaidTotal: "0.00",
    oldestUnpaid: null,
    latestInvoice: null,
    startedAt: "2026-10-01T00:00:00.000Z",
    createdAt: "2026-10-01T00:00:00.000Z",
};
const LIST = {
    subscriptions: [SUB],
    truncated: false,
    plans: { state: "ok", data: [] },
    charges: { state: "ok", data: {} },
    renewals: null,
};

let answer: (path: string) => unknown;
let release!: () => void;
beforeEach(() => {
    const gate = new Promise<void>((r) => (release = r));
    vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string) => {
            const path = url.split("?")[0];
            if (path === "/api/subscriptions") await gate;
            return new Response(JSON.stringify(answer(path)), { status: 200 });
        }),
    );
    answer = (path) =>
        path === "/api/subscriptions"
            ? LIST
            : path === "/api/subscriptions/settings"
              ? { settings: null }
              : [];
});
afterEach(() => vi.unstubAllGlobals());

const tick = () => act(() => new Promise((r) => setTimeout(r, 20)));

describe("Subscriptions' first paint", () => {
    it("draws the frame at once, the rows when they land", async () => {
        const { host, unmount } = renderWithQuery(
            <SubscriptionsContainer
                appointments={null}
                canWrite
                initialTab="subscribers"
                nowIso="2026-11-25T06:30:00.000Z"
            />,
        );
        await tick();
        const subscribe = Array.from(host.querySelectorAll("button")).find(
            (b) => b.textContent === "Subscribe someone",
        );
        // The menu's word for the page (DEC-264).
        expect(host.querySelector("h1")?.textContent).toBe("Memberships");
        expect(host.querySelectorAll('[role="tab"]')).toHaveLength(2);
        expect(subscribe?.disabled).toBe(true);
        expect(
            host.querySelector('[data-slot="figure-loading"]'),
        ).not.toBeNull();
        expect(host.textContent).not.toContain("Asha Rao");
        expect(host.textContent).not.toContain("No one is subscribed yet");

        act(() => release());
        await tick();
        expect(host.textContent).toContain("Asha Rao");
        expect(host.querySelector('[data-slot="figure-loading"]')).toBeNull();
        unmount();
    });
});
