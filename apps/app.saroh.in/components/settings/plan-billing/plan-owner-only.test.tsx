/**
 * Only the owner changes what the business pays Saroh (DEC-131, amended
 * 2026-10-11). An Admin opens Settings › Plan and billing and reads it:
 * the plan, the plans and the invoices, a note saying only the owner can
 * change it, and no control that would (a plan's button, the coupon, the
 * payment method, a payment to carry on, an add-on). The owner keeps every
 * one. Made-up plans and prices.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AddonRow, PickerRow } from "@/lib/saroh-billing/plan-view";

import { AddonsCard } from "./addons-card";
import { PlanChooser } from "./plan-chooser";
import { YourPlan } from "./your-plan";

const resolveActiveOrganization = vi.fn();
vi.mock("@/lib/organizations/service", () => ({
    resolveActiveOrganization: () => resolveActiveOrganization() as unknown,
}));
vi.mock("@/lib/session", () => ({ requireSession: () => Promise.resolve() }));
// Plans shown, as the runner has it everywhere else (DEC-136).
vi.mock("@/env", () => ({ env: { NEXT_PUBLIC_PLANS: "on" } }));
vi.mock("next/navigation", () => ({
    useRouter: () => ({ refresh: vi.fn(), replace: vi.fn() }),
    usePathname: () => "/settings/billing",
    useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/saroh-billing/billing-actions", () => ({
    checkCouponAction: vi.fn(),
    confirmCheckoutAction: vi.fn(),
    changePlanAction: vi.fn(),
    quoteChangeAction: vi.fn(),
    setAddonAction: vi.fn(),
}));

const SUBSCRIPTION = {
    id: "sub_1",
    status: "ACTIVE",
    provider: "RAZORPAY",
    cancelAtPeriodEnd: false,
    currentPeriodEnd: "2031-04-01T00:00:00.000Z",
    plan: {
        id: "plan_b",
        key: "b",
        name: "Plan B",
        priceCents: 11100,
        currency: "INR",
        interval: "month",
        entitlements: {},
    },
};
vi.mock("@/lib/saroh-billing/service", () => ({
    getSarohSubscription: () =>
        Promise.resolve({ status: "ok", subscription: SUBSCRIPTION }),
    getBillingAccess: () => Promise.resolve({ status: "ok", data: null }),
    livePricing: () => Promise.resolve(null),
    listSarohInvoices: () => Promise.resolve({ status: "ok", data: [] }),
    listAddons: () => Promise.resolve({ status: "ok", data: null }),
    getCheckouts: () => Promise.resolve({ status: "ok", data: null }),
    getPlanUsage: () => Promise.resolve({ status: "not-available-yet" }),
    quotePlan: () => Promise.resolve(null),
}));

const READ_ONLY =
    "Your role can read the plan but not change it. Only the owner can change this.";

/** An Admin as the API resolves one: reads the plan, can't change it. */
const ADMIN = {
    id: "org_1",
    name: "Rye Bakery",
    role: "ADMIN",
    actions: ["org:read", "org:update", "member:invite", "billing:read"],
};
const OWNER = {
    ...ADMIN,
    role: "OWNER",
    actions: [...ADMIN.actions, "billing:manage"],
};

async function page(org: unknown): Promise<string> {
    resolveActiveOrganization.mockResolvedValue(org);
    const { default: PlanBillingPage } =
        await import("@/app/(shell)/settings/(sections)/billing/page");
    return renderToStaticMarkup(await PlanBillingPage());
}

beforeEach(() => vi.clearAllMocks());

describe("Settings › Plan and billing, by who is reading", () => {
    it("opens for an Admin to read, saying only the owner can change it", async () => {
        const html = await page(ADMIN);
        expect(html).toContain("Your plan");
        expect(html).toContain("You&#x27;re on Plan B");
        expect(html).toContain(READ_ONLY);
        expect(html).not.toContain("An owner or admin");
        // How it's paid is read, with no way to change it.
        expect(html).toContain("Paid through Razorpay");
        expect(html).not.toMatch(/>Change</);
        expect(html).not.toContain('aria-label="Coupon"');
        expect(html).toContain("Invoices");
    });

    it("reads an Admin by the role too, when no permissions came back", async () => {
        const html = await page({ ...ADMIN, actions: undefined });
        expect(html).toContain(READ_ONLY);
        expect(html).not.toContain('aria-label="Coupon"');
    });

    it("keeps every control for the owner, and no note", async () => {
        const html = await page(OWNER);
        expect(html).not.toContain("Only the owner can");
        expect(html).toMatch(/>Change</);
        expect(html).toContain('aria-label="Coupon"');
    });

    it("stays shut to someone the API doesn't read it to", async () => {
        const html = await page({
            ...ADMIN,
            role: "MEMBER",
            actions: ["org:read"],
        });
        expect(html).toContain("You can&#x27;t open Plan and billing");
        expect(html).not.toContain("Your plan");
    });
});

const rows: PickerRow[] = [
    {
        planId: "a",
        name: "Plan A",
        price: "₹0",
        amount: "₹0",
        per: "",
        what: "For A.",
        offer: null,
        current: false,
        cta: { label: "Move to Plan A", iso: null, primary: false },
        scheduled: null,
        lead: "",
        lines: ["10 things"],
        note: null,
    },
    {
        planId: "b",
        name: "Plan B",
        price: "₹111 a month + GST",
        amount: "₹111",
        per: "a month + GST",
        what: "For B.",
        offer: null,
        current: true,
        cta: { label: "Keep Plan B", iso: null, primary: false },
        scheduled: null,
        lead: "Everything in Plan A, plus:",
        lines: ["A team of 3"],
        note: null,
    },
];

const chooser = (canChange: boolean) =>
    renderToStaticMarkup(
        <PlanChooser
            rows={{ month: rows, year: rows }}
            yearly={{ on: false }}
            initialCycle="month"
            canChange={canChange}
            addons={null}
            currentPlan="Plan B"
        />,
    );

describe("the plans, read without billing:manage", () => {
    it("shows each plan and where the business stands, and no way to change or a coupon", () => {
        const html = chooser(false);
        expect(html).toContain("Plan A");
        expect(html).toContain(">₹111<");
        expect(html).toContain("a month + GST");
        expect(html).toContain("A team of 3");
        expect(html).toContain("Current plan");
        expect(html).toContain("These are Saroh&#x27;s plans");
        expect(html).not.toContain("Move to Plan A");
        expect(html).not.toContain("Keep Plan B");
        expect(html).not.toContain("<button");
        expect(html).not.toContain('aria-label="Coupon"');
        expect(html).not.toContain("Coupon code");
    });

    it("keeps the buttons and the coupon for the owner", () => {
        const html = chooser(true);
        expect(html).toMatch(/<button[^>]*>.*?Move to Plan A.*?<\/button>/);
        expect(html).toMatch(/<button[^>]*>.*?Keep Plan B.*?<\/button>/);
        expect(html).toContain('aria-label="Coupon code"');
    });
});

const yourPlan = (canChange: boolean, waiting = true) =>
    renderToStaticMarkup(
        <YourPlan
            name="Plan B"
            price="₹111 a month + GST"
            includes="For B."
            next={{ kind: "text", text: "Nothing to pay" }}
            method="Paid through Razorpay"
            footnote=""
            notes={[
                {
                    kind: "authorise",
                    tone: "attention",
                    lead: "Your payment didn't go through.",
                    iso: null,
                    tail: "",
                    action: { label: "Authorise", planId: "b", cycle: "month" },
                },
            ]}
            pending={
                waiting
                    ? {
                          planName: "Plan B",
                          expiresAt: "2031-03-08T00:00:00.000Z",
                          handoff: null,
                      }
                    : null
            }
            canChange={canChange}
        />,
    );

describe("Your plan, read without billing:manage", () => {
    it("says what is under way, with no payment method to change and no payment to carry on", () => {
        const html = yourPlan(false);
        expect(html).toContain("Paid through Razorpay");
        expect(html).toContain("Your payment didn&#x27;t go through.");
        expect(html).not.toMatch(/>Change</);
        expect(html).not.toContain("Authorise");
        expect(html).not.toContain("#change-plan");
        expect(html).not.toContain("Checking your payment");
    });

    it("keeps all three for the owner", () => {
        // One message at a time: the payment under way, then the note.
        const html = yourPlan(true);
        expect(html).toMatch(/>Change</);
        expect(html).toContain("Checking your payment for Plan B");
        expect(html).not.toContain("Authorise");
        const after = yourPlan(true, false);
        expect(after).toMatch(/>Change</);
        expect(after).toContain("Authorise");
        expect(after).toContain("#change-plan");
    });
});

const addons: AddonRow[] = [
    {
        id: "seat",
        name: "Extra team member",
        line: "₹50 a month each",
        total: "",
        isModule: false,
        quantity: 1,
        max: 5,
        available: true,
        why: null,
    },
    {
        id: "module",
        name: "A module",
        line: "₹90 a month",
        total: "",
        isModule: true,
        quantity: 0,
        max: 1,
        available: true,
        why: null,
    },
];

const addonsCard = (canChange: boolean) =>
    renderToStaticMarkup(
        <AddonsCard rows={addons} sum="" canChange={canChange} />,
    );

describe("add-ons, read without billing:manage", () => {
    const buttons = (html: string) => html.match(/<button[^>]*>/g) ?? [];

    it("shows what is held, with every control off", () => {
        const all = buttons(addonsCard(false));
        expect(all).toHaveLength(3);
        for (const button of all) expect(button).toContain('disabled=""');
    });

    it("leaves them on for the owner", () => {
        const all = buttons(addonsCard(true));
        expect(all).toHaveLength(3);
        for (const button of all) {
            expect(button).not.toContain('disabled=""');
        }
    });

    it("stops More at the add-on's own maximum, and never Fewer (DEC-157)", () => {
        // Held above a maximum that came down since: kept, and no more.
        for (const quantity of [5, 7]) {
            const html = renderToStaticMarkup(
                <AddonsCard
                    rows={addons.slice(0, 1).map((a) => ({ ...a, quantity }))}
                    sum=""
                    canChange
                />,
            );
            const [fewer, more] = buttons(html);
            expect(fewer).not.toContain('disabled=""');
            expect(more).toContain('disabled=""');
            expect(html).toContain(`>${quantity}<`);
        }
    });
});
