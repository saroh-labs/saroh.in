// @vitest-environment jsdom
/**
 * A plan's page on React Query (DEC-259), in the browser: the route's
 * loader stands until the plan (its title, tabs and actions) and the
 * settings every plan shares land, then the page draws them. Archive goes
 * as the tab's business and reads the plan on screen once, marking the
 * Plans tab and Home stale for their next visit; a refused one reads
 * nothing and says why.
 */
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const actions = vi.hoisted(() => ({
    setPlanArchived: vi.fn(),
    loadPlanEvents: vi.fn(),
    setPlanChargeTiming: vi.fn(),
}));
vi.mock("@/lib/subscriptions/actions", () => actions);
const refresh = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({
    useRouter: () => ({ refresh, push: vi.fn(), replace: vi.fn() }),
    usePathname: () => "/billing/plans/pl_1",
}));
const failure = vi.hoisted(() => ({ reportFailure: vi.fn() }));
vi.mock("@/components/billing/plan-refusal", () => failure);
const toast = vi.hoisted(() => ({ showUndo: vi.fn() }));
vi.mock("@saroh/ui/toast", async (importOriginal) => ({
    ...(await importOriginal<object>()),
    ...toast,
}));

import { domainKey } from "@/lib/query/keys";
import { makeTestClient, renderWithQuery } from "@/lib/query/test-utils";
import type { PlanView } from "@/lib/subscriptions/queries";
import {
    planRead,
    subscriptionSettingsRead,
    subscriptionsListRead,
} from "@/lib/subscriptions/queries";
import { SubscriptionSaveProvider } from "@/lib/subscriptions/use-subscriptions";

import { PlanDetailContainer } from "./detail-screen";

const ORG = "org_1";
// The merchant's own plan: sample figures only.
const VIEW: PlanView = {
    plan: {
        id: "pl_1",
        name: "Sample loaf plan",
        description: null,
        price: "111.00",
        currency: "INR",
        interval: "MONTH",
        status: "ACTIVE",
        classesPerMonth: null,
        subscriberCount: 0,
        byPrice: [],
        monthly: "0.00",
        monthlyFromMembers: "0.00",
        createdAt: "2026-11-01T00:00:00.000Z",
    },
    subscriptions: { state: "ok", data: { rows: [], truncated: false } },
    events: {
        state: "ok",
        data: { events: [], nextCursor: null, earlierUnrecorded: false },
    },
    withClasses: false,
};
const SETTINGS = { settings: null };
const STALE_AFTER = [
    subscriptionsListRead.options(ORG, {}).queryKey,
    domainKey("home", ORG, "home"),
];

let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;
const tick = (ms = 20) => act(() => new Promise((r) => setTimeout(r, ms)));
const paths = () =>
    fetchMock.mock.calls.map(([url]) => (url as string).split("?")[0]);
const button = (host: HTMLElement, name: string) =>
    Array.from(host.querySelectorAll("button")).find(
        (b) => b.textContent.trim() === name,
    );

beforeEach(() => {
    fetchMock = vi.fn<typeof fetch>((url) =>
        Promise.resolve(
            new Response(
                JSON.stringify(
                    (url as string).includes("/api/plans/") ? VIEW : SETTINGS,
                ),
            ),
        ),
    );
    vi.stubGlobal("fetch", fetchMock);
    for (const fn of [
        ...Object.values(actions),
        failure.reportFailure,
        toast.showUndo,
        refresh,
    ]) {
        fn.mockReset();
    }
});
afterEach(() => vi.unstubAllGlobals());

function draw(client = makeTestClient()) {
    return renderWithQuery(
        <SubscriptionSaveProvider>
            <PlanDetailContainer
                ask={{ planId: "pl_1" }}
                skeleton={<p>Loading the plan</p>}
                canWrite
                initialTab="overview"
            />
        </SubscriptionSaveProvider>,
        { client, orgId: ORG },
    );
}

describe("a plan's page, first paint", () => {
    it("keeps the route's loader until the plan and its settings land", async () => {
        let answer!: () => void;
        fetchMock.mockImplementation(
            (url) =>
                new Promise((resolve) => {
                    const body = (url as string).includes("/api/plans/")
                        ? VIEW
                        : SETTINGS;
                    if ((url as string).includes("/api/plans/")) {
                        answer = () =>
                            resolve(new Response(JSON.stringify(body)));
                    } else resolve(new Response(JSON.stringify(body)));
                }),
        );
        const { host, unmount } = draw();
        await tick();
        expect(host.textContent).toContain("Loading the plan");
        expect(host.querySelector("h1")).toBeNull();
        expect(paths().sort()).toEqual([
            "/api/plans/pl_1",
            "/api/subscriptions/settings",
        ]);

        answer();
        await tick();
        expect(host.querySelector("h1")?.textContent).toBe("Sample loaf plan");
        expect(host.textContent).not.toContain("Loading the plan");
        unmount();
    });
});

describe("Archive on a plan's page", () => {
    async function open() {
        const client = makeTestClient();
        // Read on an earlier visit, past its fresh moment.
        for (const key of STALE_AFTER) {
            client.setQueryData(key, {}, { updatedAt: Date.now() - 60_000 });
        }
        const view = draw(client);
        await tick();
        fetchMock.mockClear();
        return view;
    }

    it("goes as the tab's business and reads the plan once", async () => {
        const { client, host, unmount } = await open();
        actions.setPlanArchived.mockResolvedValue({ ok: true, data: {} });
        act(() => button(host, "Archive")?.click());
        await tick();
        expect(actions.setPlanArchived).toHaveBeenCalledWith("pl_1", true, ORG);
        expect(paths()).toEqual(["/api/plans/pl_1"]);
        for (const key of STALE_AFTER) {
            expect(client.getQueryState(key)?.isInvalidated).toBe(true);
        }
        // The settings every plan shares are not a plan's save.
        expect(
            client.getQueryState(
                subscriptionSettingsRead.options(ORG, {}).queryKey,
            )?.isInvalidated,
        ).toBe(false);
        expect(toast.showUndo).toHaveBeenCalled();
        expect(refresh).not.toHaveBeenCalled();
        unmount();
    });

    it("a refused one says why and reads nothing", async () => {
        const { client, host, unmount } = await open();
        actions.setPlanArchived.mockResolvedValue({
            ok: false,
            error: "Another business was opened in another tab.",
        });
        act(() => button(host, "Archive")?.click());
        await tick();
        expect(failure.reportFailure).toHaveBeenCalled();
        expect(paths()).toEqual([]);
        expect(
            client.getQueryState(
                planRead.options(ORG, { planId: "pl_1" }).queryKey,
            )?.isInvalidated,
        ).toBe(false);
        unmount();
    });
});
