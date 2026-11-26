// @vitest-environment jsdom
/**
 * Change plan and Google Calendar on React Query (DEC-259, U18), in the
 * browser: the header at once from the page's gate and the loader's pieces
 * where the body goes, with one read and no rows; held, drawn with no read.
 * A Google Calendar save goes with the tab's business, reads the tab once
 * and never draws the page again (`router.refresh()`); a refused one reads
 * nothing.
 */
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
    refresh: vi.fn(),
    fetch: vi.fn(),
    saveMeet: vi.fn(),
}));
vi.mock("next/navigation", () => ({
    useRouter: () => ({ refresh: h.refresh, push: vi.fn(), replace: vi.fn() }),
    usePathname: () => "/settings/integrations/google-calendar",
    useSearchParams: () => new URLSearchParams(),
    notFound: () => {
        throw new Error("NOT_FOUND");
    },
}));
vi.mock("@/lib/google-calendar/actions", () => ({
    saveBusinessMeetAccess: (...a: unknown[]) => h.saveMeet(...a) as unknown,
    accountCalendars: vi.fn(),
    saveAccountCalendars: vi.fn(),
    disconnectAccount: vi.fn(),
    moveMyBookings: vi.fn(),
    connectGoogle: vi.fn(),
}));
vi.mock("@/lib/saroh-billing/billing-actions", () => ({
    checkCouponAction: vi.fn(),
    confirmCheckoutAction: vi.fn(),
    changePlanAction: vi.fn(),
    quoteChangeAction: vi.fn(),
    billingProfileViewAction: vi.fn(),
    chooseBillingProfileAction: vi.fn(),
    createBillingProfileAction: vi.fn(),
    updateBillingProfileAction: vi.fn(),
}));
vi.mock("@/env", () => ({ env: { NEXT_PUBLIC_PLANS: "on" } }));

import { ChangePlanScreen } from "@/components/settings/plan-billing/change-plan-screen";
import { googleCalendarRead } from "@/lib/google-calendar/queries";
import type { CalendarStatus } from "@/lib/google-calendar/types";
import { getBrowserQueryClient } from "@/lib/query/client";
import { renderWithQuery } from "@/lib/query/test-utils";

import { GoogleCalendarContainer } from "./google-calendar-container";

const ORG = "org_1";
const STATUS: CalendarStatus = {
    state: "CONNECTED",
    pausedBecause: null,
    accounts: [
        {
            id: "ga_1",
            googleEmail: "asha@example.com",
            state: "CONNECTED",
            calendars: [
                { id: "cal_1", name: "Asha", writeTo: true, checkBusy: true },
            ],
            granted: {
                events: true,
                freeBusy: true,
                calendars: true,
                meet: true,
            },
            busyRefreshedAt: null,
            behind: false,
        },
    ],
    bookingsGoTo: null,
    accountsAllowed: 1,
    meetAccess: "RESTRICTED",
};
const READY = { kind: "ready", status: STATUS, morePlan: null };

let unmount: (() => void) | undefined;
beforeEach(() => {
    h.refresh.mockReset();
    h.fetch.mockReset();
    h.saveMeet.mockReset();
    vi.stubGlobal("fetch", h.fetch);
    getBrowserQueryClient().clear();
});
afterEach(() => {
    unmount?.();
    vi.unstubAllGlobals();
});

const answer = (data: unknown) =>
    Promise.resolve(
        new Response(JSON.stringify(data), {
            status: 200,
            headers: { "content-type": "application/json" },
        }),
    );
const readsOf = (path: string) =>
    h.fetch.mock.calls.filter(([url]) => String(url).includes(path)).length;
const flush = () =>
    act(async () => {
        await new Promise((r) => setTimeout(r, 0));
    });

describe("Change plan and Google Calendar, first paint", () => {
    it("Change plan draws its header and the loader's pieces at once, with no plans, and reads once", () => {
        h.fetch.mockReturnValue(new Promise(() => undefined));
        const view = renderWithQuery(<ChangePlanScreen canChange />, {
            client: getBrowserQueryClient(),
            orgId: ORG,
        });
        unmount = view.unmount;
        expect(view.host.querySelector("h1")?.textContent).toBe("Change plan");
        expect(view.host.textContent).toContain("Back to Plan and billing");
        expect(view.host.querySelector('[aria-busy="true"]')).not.toBe(null);
        expect(view.host.querySelector('[aria-label="Coupon"]')).toBe(null);
        expect(readsOf("/api/settings/billing/plans")).toBe(1);
        expect(h.fetch).toHaveBeenCalledTimes(1);
    });

    it("Google Calendar draws its header at once, then its accounts from one read", async () => {
        h.fetch.mockImplementation(() => answer(READY));
        const view = renderWithQuery(
            <GoogleCalendarContainer
                business="Rye"
                outcome={null}
                mayMeetAccess
            />,
            { client: getBrowserQueryClient(), orgId: ORG },
        );
        unmount = view.unmount;
        expect(view.host.querySelector("h1")?.textContent).toBe(
            "Google Calendar",
        );
        expect(view.host.querySelector('[aria-busy="true"]')).not.toBe(null);
        expect(view.host.textContent).not.toContain("asha@example.com");
        await act(() =>
            vi.waitFor(() =>
                expect(view.host.textContent).toContain("asha@example.com"),
            ),
        );
        expect(readsOf("/api/settings/integrations/google-calendar")).toBe(1);
    });

    it("says a refusal in its own words", async () => {
        h.fetch.mockImplementation(() => answer({ kind: "denied" }));
        const view = renderWithQuery(
            <GoogleCalendarContainer
                business="Rye"
                outcome={null}
                mayMeetAccess={false}
            />,
            { client: getBrowserQueryClient(), orgId: ORG },
        );
        unmount = view.unmount;
        await act(() =>
            vi.waitFor(() =>
                expect(view.host.textContent).toContain(
                    "You can't open Google Calendar",
                ),
            ),
        );
    });
});

describe("Google Calendar's save", () => {
    async function opened() {
        const client = getBrowserQueryClient();
        const { queryKey, meta } = googleCalendarRead.options(ORG, {});
        client.getQueryCache().build(client, { queryKey, meta }).setData(READY);
        h.fetch.mockImplementation(() => answer(READY));
        const view = renderWithQuery(
            <GoogleCalendarContainer
                business="Rye"
                outcome={null}
                mayMeetAccess
            />,
            { client, orgId: ORG },
        );
        unmount = view.unmount;
        expect(h.fetch).not.toHaveBeenCalled();
        const change = Array.from(view.host.querySelectorAll("button")).filter(
            (b) => b.textContent === "Change",
        );
        // Bookings' Change, then Who can join's.
        act(() => change.at(-1)?.click());
        const open = document.querySelector<HTMLButtonElement>(
            '[role="radio"][value="OPEN"]',
        );
        act(() => open?.click());
        const save = Array.from(document.querySelectorAll("button")).find(
            (b) => b.textContent === "Save",
        );
        await act(async () => {
            save?.click();
            await new Promise((r) => setTimeout(r, 0));
        });
        await flush();
    }

    it("goes with the tab's business, reads the tab once and never refreshes the page", async () => {
        h.saveMeet.mockResolvedValue({
            ok: true,
            data: { meetAccess: "OPEN", updating: 0 },
        });
        await opened();
        expect(h.saveMeet).toHaveBeenCalledWith("OPEN", ORG);
        expect(readsOf("/api/settings/integrations/google-calendar")).toBe(1);
        expect(h.refresh).not.toHaveBeenCalled();
    });

    it("reads nothing when refused", async () => {
        h.saveMeet.mockResolvedValue({ ok: false, error: "Not yours." });
        await opened();
        expect(h.saveMeet).toHaveBeenCalledTimes(1);
        expect(h.fetch).not.toHaveBeenCalled();
        expect(h.refresh).not.toHaveBeenCalled();
    });
});
