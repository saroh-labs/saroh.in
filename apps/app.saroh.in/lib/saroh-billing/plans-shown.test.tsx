/**
 * The one switch for Saroh's own plans in the workspace (DEC-136,
 * `NEXT_PUBLIC_PLANS`): off, Settings › Plan and billing isn't there and
 * nothing names a plan; on, everything is as it was. Made-up plans.
 */
import Link from "next/link";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const flag = vi.hoisted(() => ({ plans: undefined as string | undefined }));
const apiFetch = vi.hoisted(() => vi.fn());

vi.mock("@/env", () => ({
    env: {
        get NEXT_PUBLIC_PLANS() {
            return flag.plans;
        },
    },
}));
vi.mock("@/lib/api/http", () => ({
    apiFetch,
    orgBase: () => Promise.resolve("/organizations/org_1"),
}));
vi.mock("next/navigation", () => ({
    notFound: () => {
        throw new Error("NOT_FOUND");
    },
    useRouter: () => ({ refresh: vi.fn(), replace: vi.fn(), push: vi.fn() }),
    usePathname: () => "/",
}));

import PlanBillingLayout from "@/app/(shell)/settings/(sections)/billing/layout";
import ChangePlanPage from "@/app/(shell)/settings/(sections)/billing/plans/page";
import { GET as invoicePdf } from "@/app/api/saroh-invoices/[invoiceId]/pdf/route";
import { LimitNoticeBlock } from "@/components/billing/limit-notice";
import { PausedBanner, PausedNote } from "@/components/billing/paused-banner";
import { PlanEndingBanner } from "@/components/billing/plan-ending-banner";
import {
    LimitReachedCard,
    PlanLockedCard,
    PlanWay,
} from "@/components/billing/plan-way";
import { planRow } from "@/components/settings/ready/ready-rows";
import { settingsPagesFor } from "@/components/shared/navigation/nav-items";
import { madeWithNote } from "@/components/sites/blocks/fixed-block-inspector";
import type { PausedView } from "@/lib/billing/paused";
import { planRefusalOf } from "@/lib/billing/refusal";
import {
    emailPrompt,
    emailRefusalNote,
} from "@/lib/communications/email-setup";
import { blockerSentence } from "@/lib/modules/blocker-copy";
import { notificationHref } from "@/lib/notifications/href";
import type { AuditEventRow } from "@/lib/settings/activity";
import { activityLine } from "@/lib/settings/activity";
import { searchSettings } from "@/lib/settings/search";

import { plansShown } from "./plans-shown";
import { billingAccessOrNull, pausedOrNull } from "./service";

const owner = {
    role: "OWNER" as const,
    actions: null,
};

const PAUSED: PausedView = {
    state: "paused",
    pausesFrom: null,
    people: [],
    products: { cut: "all", count: 2 },
    posts: { cut: null, count: 0 },
    locations: [],
    sites: [],
};

const ENDING = {
    planName: "Plan B",
    endsAt: "2031-04-19T09:30:00.000Z",
    nextPlanName: "Plan A",
};

const REFUSED = {
    code: "PLAN_LIMIT_REACHED",
    limit: 10,
    used: 10,
    upgradeTo: { planId: "b", name: "Plan B", pricePaise: 11_100 },
    notice: {
        title: "You've reached your 10 things on Plan A",
        body: "You can't add more things.",
        cta: "See plans",
    },
};

const PLAN_CHANGE = {
    id: "evt_1",
    action: "organization.plan.changed",
    outcome: "SUCCESS",
    createdAt: "2031-04-01T00:00:00.000Z",
    actor: { id: "u_1", name: "Sanjay", email: "sanjay@example.com" },
    target: null,
    targetId: null,
    metadata: { from: "Plan A", to: "Plan B" },
} as unknown as AuditEventRow;

const PLAN_NOTICE = { type: "plan.limit", target: { kind: "plan", id: null } };

/** No email of its own, and a plan that can't connect one. */
const NO_EMAIL = { connected: false, canConnect: false };
const MAY = { connect: true, plans: true };
const WORDS = { connect: "Connect one.", plans: "Not on this one." };

/** Everything the shell and a screen can draw of a plan, in one string. */
function drawn(): string {
    return renderToStaticMarkup(
        <>
            <PausedBanner view={PAUSED} />
            <PausedNote>This product is paused.</PausedNote>
            <PlanEndingBanner ending={ENDING} now={new Date(2031, 3, 13)} />
            <LimitNoticeBlock
                full
                title="You've reached your 10 things on Plan A"
                body="You can't add more things."
                cta="See Plan B"
                href="/settings/billing/plans?plan=b"
            />
            <PlanWay>
                <Link href="/settings/billing/plans">See plans</Link>
            </PlanWay>
            <PlanLockedCard
                name="Things"
                plan="Plan B"
                href="/settings/billing/plans?plan=b"
            />
            <LimitReachedCard
                title="You're at 10 things"
                plan="Plan B"
                href="/settings/billing/plans?plan=b"
            />
        </>,
    );
}

function okJson(body: unknown) {
    return {
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify(body)),
    };
}

beforeEach(() => {
    apiFetch.mockReset();
});

describe("plansShown", () => {
    it("is on only for exactly on: unset, off or anything else hides plans", () => {
        for (const value of [undefined, "", "off", "ON", "true", "1"]) {
            flag.plans = value;
            expect(plansShown()).toBe(false);
        }
        flag.plans = "on";
        expect(plansShown()).toBe(true);
    });
});

describe("with plans hidden (the switch unset)", () => {
    beforeEach(() => {
        flag.plans = undefined;
    });

    it("leaves Plan and billing out of the Settings sections, for the owner too", () => {
        const hrefs = settingsPagesFor(owner).map((p) => p.href);
        expect(hrefs).not.toContain("/settings/billing");
        // Nothing else leaves with it.
        expect(hrefs).toEqual([
            "/settings/organization",
            "/settings/people",
            "/settings/modules",
            "/settings/profile",
            "/settings/share",
            "/settings/activity",
            "/settings/providers",
            "/settings/data",
        ]);
    });

    it("has no entry for it in Settings search", () => {
        const all = searchSettings("", owner, { limit: 500 });
        expect(all.length).toBeGreaterThan(10);
        expect(all.some((h) => h.href.startsWith("/settings/billing"))).toBe(
            false,
        );
        for (const typed of ["plan", "billing", "invoices from saroh"]) {
            expect(
                searchSettings(typed, owner).some((h) =>
                    h.href.startsWith("/settings/billing"),
                ),
            ).toBe(false);
        }
    });

    it("answers /settings/billing with the app's not-found", () => {
        expect(() => PlanBillingLayout({ children: "the page" })).toThrow(
            "NOT_FOUND",
        );
    });

    it("answers its Change plan screen the same, before any plan is read", async () => {
        // The layout above it answers first; the page says so too.
        await expect(ChangePlanPage()).rejects.toThrow("NOT_FOUND");
        expect(apiFetch).not.toHaveBeenCalled();
    });

    it("answers Saroh's invoice PDF with a 404, unasked", async () => {
        const res = await invoicePdf(new Request("https://app.example.com/"), {
            params: Promise.resolve({ invoiceId: "inv_1" }),
        });
        expect(res.status).toBe(404);
        expect(apiFetch).not.toHaveBeenCalled();
    });

    it("reads no plan and nothing paused, and doesn't ask the API", async () => {
        expect(await billingAccessOrNull()).toBeNull();
        expect(await pausedOrNull()).toBeNull();
        expect(apiFetch).not.toHaveBeenCalled();
    });

    it("draws no banner, limit notice, plan card or way to a plan", () => {
        expect(drawn()).toBe("");
    });

    it("reads a plan's refusal as any other failure: no notice, no link", () => {
        expect(planRefusalOf(REFUSED, REFUSED.notice.title)).toBeNull();
        expect(
            planRefusalOf(
                { code: "MODULE_LOCKED", upgradeTo: REFUSED.upgradeTo },
                "Things isn't in your Plan A plan.",
            ),
        ).toBeNull();
    });

    it("links nothing in Activity or the inbox to the page", () => {
        expect(activityLine(PLAN_CHANGE)).toBeNull();
        expect(notificationHref(PLAN_NOTICE)).toBe("/");
    });

    it("names no plan for a module the plan holds, or under the site's footer", () => {
        expect(blockerSentence({ code: "ENTITLEMENT_REQUIRED" })).toBe(
            "This isn't available for your business yet.",
        );
        expect(
            blockerSentence({
                code: "ENTITLEMENT_REQUIRED",
                message: "Things comes with Plan B.",
            }),
        ).not.toMatch(/plan/i);
        expect(madeWithNote()).not.toMatch(/plan/i);
    });

    it("offers no plans where the plan holds the business's own email", () => {
        expect(emailPrompt(NO_EMAIL, MAY)).toBeNull();
        expect(emailRefusalNote(NO_EMAIL, MAY, WORDS)).toEqual({
            text: WORDS.plans,
            action: null,
        });
    });

    it("gives a setup step that is the way to a plan no button", () => {
        const action = {
            label: "See plans",
            href: "/settings/billing/plans",
        };
        expect(planRow(action, true, "So money reaches your bank.")).toEqual({
            why: "So money reaches your bank.",
        });
        expect(planRow(action, false)).toEqual({});
        // Any other step is untouched.
        const connect = { label: "Connect", href: "/settings/providers" };
        expect(planRow(connect, true)).toEqual({ action: connect });
    });
});

describe("with plans shown (the switch on)", () => {
    beforeEach(() => {
        flag.plans = "on";
    });

    it("keeps Plan and billing in the Settings sections and its search", () => {
        expect(settingsPagesFor(owner).map((p) => p.href)).toContain(
            "/settings/billing",
        );
        expect(searchSettings("invoices from saroh", owner)).toEqual([
            {
                label: "Invoices from Saroh",
                where: "Plan and billing",
                href: "/settings/billing",
            },
        ]);
    });

    it("opens /settings/billing and asks the API for the invoice", async () => {
        expect(PlanBillingLayout({ children: "the page" })).toBe("the page");
        apiFetch.mockResolvedValue({ ok: false, status: 404, body: null });
        const res = await invoicePdf(new Request("https://app.example.com/"), {
            params: Promise.resolve({ invoiceId: "inv_1" }),
        });
        expect(res.status).toBe(404);
        expect(apiFetch).toHaveBeenCalledTimes(1);
    });

    it("reads the plan and what is paused from the API", async () => {
        apiFetch.mockImplementation((path: string) =>
            Promise.resolve(
                okJson(
                    path.endsWith("/billing/paused")
                        ? PAUSED
                        : { source: "legacy", enforced: false, modules: [] },
                ),
            ),
        );
        expect(await pausedOrNull()).toEqual(PAUSED);
        expect(await billingAccessOrNull()).toMatchObject({
            source: "legacy",
        });
    });

    it("draws the banners, the limit notice and the way to a plan", () => {
        const html = drawn();
        expect(html).toContain("Paused by your plan");
        expect(html).toContain("This product is paused.");
        expect(html).toContain("Your Plan B plan ends in");
        expect(html).toContain("You&#x27;ve reached your 10 things on Plan A");
        expect(html).toContain('href="/settings/billing/plans"');
        expect(html).toContain("See Plan B");
        expect(html).toContain("You&#x27;re at 10 things");
    });

    it("reads a plan's refusal as its notice", () => {
        expect(planRefusalOf(REFUSED, REFUSED.notice.title)).toMatchObject({
            code: "PLAN_LIMIT_REACHED",
            cta: "See plans",
        });
    });

    it("links Activity and the inbox to the page, and names the plan", () => {
        expect(activityLine(PLAN_CHANGE)).toMatchObject({
            what: "moved the plan from Plan A to Plan B",
            where: { label: "Plan and billing", href: "/settings/billing" },
        });
        expect(notificationHref(PLAN_NOTICE)).toBe("/settings/billing/plans");
        expect(blockerSentence({ code: "ENTITLEMENT_REQUIRED" })).toContain(
            "Plan and billing",
        );
        expect(madeWithNote()).toContain("On the Free plan");
    });

    it("offers the plans where the plan holds the business's own email", () => {
        expect(emailPrompt(NO_EMAIL, MAY)).toMatchObject({
            kind: "plans",
            action: { href: "/settings/billing/plans" },
        });
        expect(emailRefusalNote(NO_EMAIL, MAY, WORDS)?.action).toEqual({
            href: "/settings/billing/plans",
            label: "See plans",
        });
    });

    it("keeps a setup step's way to a plan", () => {
        const action = {
            label: "See plans",
            href: "/settings/billing/plans",
        };
        expect(planRow(action, true)).toEqual({ action });
    });
});
