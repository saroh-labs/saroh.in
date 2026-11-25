// @vitest-environment jsdom
/**
 * Subscriptions on React Query (DEC-259), in the browser: a pause or a
 * resume goes as the tab's business, then reads the subscription on screen
 * once and nothing else, marking Invoices (renewals make invoices) and Home
 * (Needs you shows failed renewals) stale for their next visit; a refused
 * one reads nothing. Outside the provider (a person's page) the page is
 * drawn again, as before.
 */
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const actions = vi.hoisted(() => ({
    cancelPlanChange: vi.fn(),
    cancelSubscription: vi.fn(),
    changePlan: vi.fn(),
    keepSubscription: vi.fn(),
    pauseSubscription: vi.fn(),
    resumeSubscription: vi.fn(),
    retrySubscription: vi.fn(),
    skipCollection: vi.fn(),
    unskipCollection: vi.fn(),
}));
vi.mock("@/lib/subscriptions/actions", () => actions);
vi.mock("@/lib/invoices/link-actions", () => ({ newPayLink: vi.fn() }));
vi.mock("@/lib/gst-rates/actions", () => ({ saveGstRates: vi.fn() }));
const refresh = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({
    useRouter: () => ({ refresh, push: vi.fn(), replace: vi.fn() }),
}));
const toast = vi.hoisted(() => ({
    showSuccess: vi.fn(),
    showError: vi.fn(),
    showUndo: vi.fn(),
}));
vi.mock("@saroh/ui/toast", async (importOriginal) => ({
    ...(await importOriginal<object>()),
    ...toast,
}));

import { useSubscriptionActions } from "@/components/subscriptions/subscription-detail/use-subscription-actions";
import { domainKey } from "@/lib/query/keys";
import { makeTestClient, renderWithQuery } from "@/lib/query/test-utils";
import { pauseOptions } from "@/lib/subscriptions/pause";
import {
    subscriptionContactsRead,
    subscriptionRead,
    subscriptionSettingsRead,
    subscriptionsListRead,
} from "@/lib/subscriptions/queries";
import type { Subscription } from "@/lib/subscriptions/service";
import {
    SubscriptionSaveProvider,
    useSubscription,
    useSubscriptionSave,
} from "@/lib/subscriptions/use-subscriptions";

const ORG = "org_1";
const NOW = new Date("2026-11-25T06:30:00.000Z");
const SUB = {
    id: "sub_1",
    status: "ACTIVE",
    plan: { id: "pl_1", name: "Loaf plan" },
    contact: { id: "c_1", name: "Asha Rao", email: "asha@example.com" },
    timezone: "Asia/Kolkata",
    currentPeriodStart: "2026-11-01T00:00:00.000Z",
    currentPeriodEnd: "2026-12-01T00:00:00.000Z",
    nextRenewalAt: "2026-11-30T18:30:00.000Z",
    pendingPlan: null,
    pausedUntil: null,
    endsAt: null,
} as unknown as Subscription;
const ASK = { subscriptionId: "sub_1" };
const OTHERS = [
    domainKey("invoices", ORG, "list", {}),
    domainKey("home", ORG, "home"),
];
const QUIET = [
    subscriptionSettingsRead.options(ORG, {}).queryKey,
    subscriptionContactsRead.options(ORG, {}).queryKey,
];

let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;
const tick = (ms = 20) => act(() => new Promise((r) => setTimeout(r, ms)));
const paths = () =>
    fetchMock.mock.calls.map(([url]) => (url as string).split("?")[0]);

beforeEach(() => {
    fetchMock = vi.fn<typeof fetch>(() =>
        Promise.resolve(new Response("{}", { status: 200 })),
    );
    vi.stubGlobal("fetch", fetchMock);
    for (const fn of [...Object.values(actions), ...Object.values(toast)]) {
        fn.mockReset();
    }
    refresh.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

/** Read on an earlier visit, past its fresh moment. */
function seeded() {
    const client = makeTestClient();
    for (const key of [
        subscriptionRead.options(ORG, ASK).queryKey,
        // The list, not on screen: marked stale, not read.
        subscriptionsListRead.options(ORG, {}).queryKey,
        ...OTHERS,
        ...QUIET,
    ]) {
        client.setQueryData(key, {}, { updatedAt: Date.now() - 60_000 });
    }
    return client;
}

type Actions = ReturnType<typeof useSubscriptionActions>;

function Detail({ report }: { report: (a: Actions) => void }) {
    useSubscription(ASK);
    report(useSubscriptionActions(SUB, [], NOW, () => undefined));
    return null;
}

async function open() {
    const client = seeded();
    let act$!: Actions;
    const view = renderWithQuery(
        <SubscriptionSaveProvider>
            <Detail report={(a) => (act$ = a)} />
        </SubscriptionSaveProvider>,
        { client, orgId: ORG },
    );
    await tick();
    fetchMock.mockClear();
    return { run: () => act$, ...view };
}

describe("a pause, then a resume", () => {
    it("goes as the tab's business and reads the subscription once each", async () => {
        const { client, run, unmount } = await open();
        actions.pauseSubscription.mockResolvedValue({ ok: true, data: {} });
        const option = pauseOptions(SUB, NOW)[0];

        act(() => run().pause(option));
        await tick();
        expect(actions.pauseSubscription).toHaveBeenCalledWith(
            "sub_1",
            option.choice,
            ORG,
        );
        expect(paths()).toEqual(["/api/subscriptions/sub_1"]);
        for (const key of [
            ...OTHERS,
            subscriptionsListRead.options(ORG, {}).queryKey,
        ]) {
            expect(client.getQueryState(key)?.isInvalidated).toBe(true);
        }
        for (const key of QUIET) {
            expect(client.getQueryState(key)?.isInvalidated).toBe(false);
        }

        fetchMock.mockClear();
        actions.resumeSubscription.mockResolvedValue({ ok: true, data: {} });
        act(() => run().resume());
        await tick();
        expect(actions.resumeSubscription).toHaveBeenCalledWith("sub_1", ORG);
        expect(paths()).toEqual(["/api/subscriptions/sub_1"]);
        expect(refresh).not.toHaveBeenCalled();
        unmount();
    });

    it("a refused one says why and reads nothing", async () => {
        const { client, run, unmount } = await open();
        actions.pauseSubscription.mockResolvedValue({
            ok: false,
            error: "Another business was opened in another tab.",
        });
        act(() => run().pause(pauseOptions(SUB, NOW)[0]));
        await tick();
        expect(toast.showError).toHaveBeenCalled();
        expect(paths()).toEqual([]);
        expect(client.getQueryState(OTHERS[1])?.isInvalidated).toBe(false);
        unmount();
    });
});

describe("outside Subscriptions' screens", () => {
    it("names no business and draws the page again", async () => {
        let save!: ReturnType<typeof useSubscriptionSave>;
        function Part({
            report,
        }: {
            report: (s: ReturnType<typeof useSubscriptionSave>) => void;
        }) {
            report(useSubscriptionSave());
            return null;
        }
        const { unmount } = renderWithQuery(
            <Part report={(s) => (save = s)} />,
        );
        expect(save.orgId).toBeUndefined();
        await act(() => save.saved());
        expect(refresh).toHaveBeenCalledTimes(1);
        expect(paths()).toEqual([]);
        unmount();
    });
});
