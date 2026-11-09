/**
 * Global at launch is Free-only (Global launch plan U5, KTD7): with no Saroh
 * billing on the edition, Plan and billing holds only the Free note with
 * "Tell me when", and the three places that used to say "Upgrade" say the
 * plan's own words with no way to a plan. India with plans shown is
 * unchanged. Made-up plans.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

interface Flag {
    plans: string | undefined;
    edition: "INDIA" | "GLOBAL";
}
const flag = vi.hoisted((): Flag => ({ plans: "on", edition: "GLOBAL" }));
const apiFetch = vi.hoisted(() => vi.fn());

vi.mock("@/env", () => ({
    env: {
        get NEXT_PUBLIC_PLANS() {
            return flag.plans;
        },
    },
}));
vi.mock("@/lib/edition", async (actual) => {
    const { editionProfile } = await import("@saroh/edition");
    return {
        ...(await actual<object>()),
        get PROFILE() {
            return editionProfile(flag.edition);
        },
    };
});
vi.mock("@/lib/api/http", () => ({
    apiFetch,
    orgBase: () => Promise.resolve("/organizations/org_1"),
}));
vi.mock("@/lib/session", () => ({ requireSession: () => Promise.resolve() }));
// Whether the API sells Global its plans (stage 9) is `plansOpen`'s own test;
// here it follows the switch, as before.
vi.mock("@/lib/saroh-billing/service", async (actual) => ({
    ...(await actual<object>()),
    plansOpen: async () =>
        (await import("@/lib/saroh-billing/plans-shown")).plansShown(),
}));
vi.mock("next/navigation", () => ({
    notFound: () => {
        throw new Error("NOT_FOUND");
    },
    redirect: () => {
        throw new Error("REDIRECT");
    },
    unstable_rethrow: () => undefined,
    useRouter: () => ({ refresh: vi.fn(), replace: vi.fn(), push: vi.fn() }),
    usePathname: () => "/",
}));

import PlanBillingPage from "@/app/(shell)/settings/(sections)/billing/page";
import ChangePlanPage from "@/app/(shell)/settings/(sections)/billing/plans/page";
import { access, row } from "@/lib/billing/fixtures.test-data";
import { importNext } from "@/lib/billing/meter";
import { offlinePayHint } from "@/lib/invoices/offline-hint";
import { onlineBookingProblem } from "@/lib/services/online-booking";
import { trackersLock } from "@/lib/sites/trackers-lock";

import { FREE_NOTE, freeNoteShown } from "./global-free";
import { tellMeWhenPaidPlans } from "./paid-plans-actions";

const UPGRADE = /upgrade|paid plan/i;

const lockedTrackers = access({
    modules: [
        row({
            moduleId: "site-trackers",
            name: "Your own trackers",
            state: "locked",
            limit: null,
            usage: null,
            menu: null,
            child: null,
            upgradeTo: { planId: "b", name: "Plan B", pricePaise: 11_100 },
        }),
    ],
});

const planBlocked = {
    bookingPayment: "ONLINE",
    onlineBlocker: "PLAN",
} as unknown as Parameters<typeof onlineBookingProblem>[1];

describe("Global, Free-only (no Saroh billing)", () => {
    beforeEach(() => {
        flag.plans = "on";
        flag.edition = "GLOBAL";
        apiFetch.mockReset();
    });

    it("shows the Free note on Plan and billing, with Tell me when and no plan to buy", async () => {
        expect(freeNoteShown()).toBe(true);
        const html = renderToStaticMarkup(await PlanBillingPage());
        expect(html).toContain("You&#x27;re on Free");
        expect(html).toContain("Paid plans aren&#x27;t available yet");
        expect(html).toContain(FREE_NOTE.ask);
        expect(html).not.toContain("/settings/billing/plans");
        expect(html).not.toMatch(/\$\d|₹|Change plan/);
        // Nothing about a plan is read.
        expect(apiFetch).not.toHaveBeenCalled();
    });

    it("keeps the Change plan screen not-found", async () => {
        await expect(ChangePlanPage()).rejects.toThrow("NOT_FOUND");
    });

    it("asks the API for Tell me when with nothing in the body: the address is the session's", async () => {
        apiFetch.mockResolvedValue(new Response("{}", { status: 200 }));
        await expect(tellMeWhenPaidPlans()).resolves.toEqual({ ok: true });
        expect(apiFetch).toHaveBeenCalledWith(
            "/organizations/org_1/paid-plans-interest",
            { method: "POST" },
        );
    });

    it("says the plan's own words on the trackers lock, the CSV import and the online-booking gate", () => {
        const lock = trackersLock(lockedTrackers);
        expect(lock?.line).not.toMatch(UPGRADE);
        expect(lock?.kept).not.toMatch(UPGRADE);

        expect(importNext(3)).toBe("Import the first 3.");
        expect(importNext(0)).toBeNull();

        const problem = onlineBookingProblem(
            { priceCents: 5000, depositMode: "FULL" },
            planBlocked,
        );
        expect(problem?.text).not.toMatch(UPGRADE);

        const hint = offlinePayHint({
            blocker: "PLAN",
            paymentsOn: true,
            providerConnected: true,
            who: "Your customer",
        });
        expect(hint.text).not.toMatch(UPGRADE);
        expect(hint.fix).toBeNull();
    });
});

describe("India, plans shown", () => {
    beforeEach(() => {
        flag.plans = "on";
        flag.edition = "INDIA";
    });

    it("has no Free note, and still says Upgrade", () => {
        expect(freeNoteShown()).toBe(false);
        expect(trackersLock(lockedTrackers)?.kept).toMatch(/Upgrade/);
        expect(importNext(3)).toBe("Import the first 3, or upgrade for more.");
        expect(importNext(0)).toBe("Upgrade to bring them in.");
        expect(
            offlinePayHint({
                blocker: "PLAN",
                paymentsOn: true,
                providerConnected: true,
                who: "Your customer",
            }).fix?.href,
        ).toBe("/settings/billing/plans");
    });

    it("keeps no page at all while India's plans are switched off", () => {
        flag.plans = undefined;
        expect(freeNoteShown()).toBe(false);
    });
});
