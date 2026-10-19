/** @vitest-environment jsdom */
import {
    cleanup,
    fireEvent,
    render,
    screen,
    waitFor,
    within,
} from "@testing-library/react";
import type { AnchorHTMLAttributes } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const toast = vi.hoisted(() => ({
    showSuccess: vi.fn(),
    showError: vi.fn(),
    showUndo: vi.fn(),
    dismissToasts: vi.fn(),
}));
const actions = vi.hoisted(() => ({
    raiseLimitAction: vi.fn(),
    planOverrideAction: vi.fn(),
    changePlanAction: vi.fn(),
    trialAction: vi.fn(),
    revokeLimitAction: vi.fn(),
    moduleOverrideAction: vi.fn(),
    priceOverrideAction: vi.fn(),
    removeOverrideAction: vi.fn(),
    catalogueMoveAction: vi.fn(),
}));

vi.mock("next/navigation", () => ({
    useSelectedLayoutSegments: () => ["(tabs)", "overview"],
    useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));
vi.mock("next/link", () => ({
    default: ({
        href,
        children,
        scroll: _scroll,
        ...rest
    }: AnchorHTMLAttributes<HTMLAnchorElement> & {
        href: string;
        scroll?: boolean;
    }) => (
        <a href={href} {...rest}>
            {children}
        </a>
    ),
}));
vi.mock("@/lib/business-actions", () => actions);
vi.mock("@saroh/ui/toast", () => toast);

import type {
    BusinessOverview,
    OverviewPlan,
    OverviewUsageRow,
} from "@/lib/overview-words";
import { overviewBadges } from "@/lib/overview-words";

import { BusinessTabs } from "../business-tabs";
import { ActivityCard } from "./activity-card";
import { ModulesCard } from "./modules-card";
import { PlanCard } from "./plan-card";
import { SiteCard } from "./site-card";
import { TeamCard } from "./team-card";
import { UsageCard } from "./usage-card";

// Made-up plans, prices and limits: nothing here is a real one.
const plan: OverviewPlan = {
    subscriptionId: "sub_row",
    effective: {
        id: "grow",
        name: "Plan B",
        basePlanId: "grow",
        basePlanName: "Plan B",
        override: null,
    },
    name: "Plan B",
    basePlanName: "Plan B",
    overrideEndsAt: null,
    status: "ACTIVE",
    pricePaise: 12_345,
    planPricePaise: 22_200,
    customPrice: { pricePaise: 12_345, expiresAt: "2026-12-31T18:29:59.000Z" },
    nextCharge: {
        at: "2026-11-01T00:00:00.000Z",
        how: "AUTOPAY",
        autopayRunsOutSoon: false,
    },
    offers: [
        {
            id: "ov_1",
            kind: "price",
            moduleKey: null,
            planKey: null,
            key: "price",
            value: 12_345,
            expiresAt: "2026-12-31T18:29:59.000Z",
        },
    ],
    livePlans: [
        { id: "free", name: "Plan A" },
        { id: "grow", name: "Plan B" },
    ],
};

const usage: OverviewUsageRow[] = [
    {
        key: "members",
        label: "People",
        used: 3,
        limit: 2,
        planLimit: 2,
        per: "",
        soft: true,
        over: true,
        changed: null,
        note: null,
        raisable: true,
    },
];

const overview: BusinessOverview = {
    organizationId: "org_1",
    plan: { status: "ok", data: plan },
    billedTo: { name: null },
    usage: { status: "ok", data: usage },
    modules: {
        status: "ok",
        data: {
            on: 4,
            off: 1,
            locked: 2,
            total: 7,
            planLimitsEnforced: false,
            note: "Plan limits not enforced yet",
        },
    },
    website: {
        status: "ok",
        data: {
            sites: [
                {
                    id: "s1",
                    name: "Main site",
                    published: true,
                    addresses: [
                        { kind: "web-address", url: "https://rye.example.com" },
                    ],
                },
            ],
            payments: [
                {
                    provider: "RAZORPAY",
                    connected: true,
                    needsAttention: false,
                },
            ],
            published: 1,
            paymentsConnected: true,
        },
    },
    team: {
        status: "ok",
        data: {
            members: [{ name: "Asha", role: "OWNER" }],
            count: 1,
            invitesOpen: 1,
        },
    },
    accountManager: { status: "ok", data: { manager: null } },
    activity: {
        status: "ok",
        data: [
            {
                id: "a1",
                source: "operator",
                action: "organization.limit",
                at: new Date().toISOString(),
            },
        ],
    },
    notes: {
        status: "ok",
        data: { count: 2, lastAt: "2026-10-01T00:00:00.000Z" },
    },
    badges: {
        billing: { needsYou: true, count: 1 },
        modules: { count: 4 },
        team: { count: 1 },
        notes: { count: 2 },
    },
};

function Overview({ canRaise = true }: { canRaise?: boolean }) {
    return (
        <main data-testid="overview">
            <PlanCard
                organizationId="org_1"
                plan={overview.plan}
                billedTo={overview.billedTo}
                canOverride
                canChangePlan
                legacyPlans={[]}
            />
            <UsageCard
                organizationId="org_1"
                usage={overview.usage}
                canRaise={canRaise}
            />
            <ModulesCard organizationId="org_1" modules={overview.modules} />
            <SiteCard organizationId="org_1" website={overview.website} />
            <TeamCard
                organizationId="org_1"
                team={overview.team}
                accountManager={overview.accountManager}
                canAssign={false}
            />
            <ActivityCard
                organizationId="org_1"
                activity={overview.activity}
                notes={overview.notes}
            />
        </main>
    );
}

const card = (id: string) => {
    const el = document.querySelector(`[data-overview-card="${id}"]`);
    if (!el) throw new Error(`no ${id} card`);
    return el as HTMLElement;
};

beforeEach(() => {
    vi.clearAllMocks();
});
afterEach(cleanup);

describe("a business's Overview (U3)", () => {
    it("draws every card from the one read", () => {
        render(<Overview />);
        for (const title of [
            "Plan and access",
            "Usage this month",
            "Modules",
            "Website and payments",
            "Team",
            "Recent activity and notes",
        ]) {
            expect(screen.getByRole("heading", { name: title })).toBeTruthy();
        }
        const planCard = within(card("plan"));
        expect(planCard.getByText(/custom price until/)).toBeTruthy();
        expect(planCard.getByText(/autopay/)).toBeTruthy();
        expect(planCard.getByText("Chooses at first payment")).toBeTruthy();
        expect(planCard.getByText(/^Custom price .* until/)).toBeTruthy();

        expect(within(card("usage")).getByText("3 of 2")).toBeTruthy();
        expect(
            within(card("usage")).getByText("Over, still allowed"),
        ).toBeTruthy();
        expect(
            within(card("modules")).getByText("Plan limits not enforced yet"),
        ).toBeTruthy();
        expect(within(card("team")).getByText("Owner")).toBeTruthy();
        expect(
            within(card("team")).getByText("1 invitation open"),
        ).toBeTruthy();
        expect(
            within(card("activity")).getByText(/2 notes, the last on/),
        ).toBeTruthy();
        expect(within(card("activity")).getByText(/by Saroh/)).toBeTruthy();
    });

    it("leaves Billed to off for a reader who may not see it", () => {
        render(
            <PlanCard
                organizationId="org_1"
                plan={overview.plan}
                billedTo={null}
                canOverride={false}
                canChangePlan={false}
                legacyPlans={[]}
            />,
        );
        expect(screen.queryByText("Billed to")).toBeNull();
        expect(screen.queryByRole("button", { name: /plan/ })).toBeNull();
    });

    it("says a card failed, inside it, and keeps the others", () => {
        render(
            <>
                <TeamCard
                    organizationId="org_1"
                    team={{ status: "failed" }}
                    accountManager={overview.accountManager}
                    canAssign={false}
                />
                <ModulesCard
                    organizationId="org_1"
                    modules={overview.modules}
                />
            </>,
        );
        expect(
            within(card("team")).getByText(/Couldn't load team/),
        ).toBeTruthy();
        expect(within(card("modules")).getByText("4")).toBeTruthy();
    });

    it("says when there is nothing to count", () => {
        render(
            <UsageCard
                organizationId="org_1"
                usage={{ status: "ok", data: [] }}
                canRaise
            />,
        );
        expect(screen.getByText("No limits to count")).toBeTruthy();
        expect(screen.queryByRole("button", { name: "Raise a limit…" })).toBe(
            null,
        );
    });

    it("opens Raise a limit… over Overview, saves, and highlights the card", async () => {
        actions.raiseLimitAction.mockResolvedValue({ ok: true, data: null });
        render(<Overview />);
        expect(card("usage").hasAttribute("data-just-changed")).toBe(false);

        fireEvent.click(screen.getByRole("button", { name: "Raise a limit…" }));
        const dialog = await screen.findByRole("dialog");
        // Over Overview: the page is still there under it, at its address.
        expect(screen.getByTestId("overview")).toBeTruthy();
        expect(
            within(dialog).getByText("Raise a limit for a while"),
        ).toBeTruthy();

        fireEvent.change(within(dialog).getByLabelText("New limit"), {
            target: { value: "5" },
        });
        fireEvent.change(within(dialog).getByLabelText(/Reason/), {
            target: { value: "Busy season for them" },
        });
        fireEvent.click(
            within(dialog).getByRole("button", { name: "Raise limit" }),
        );

        await waitFor(() =>
            expect(card("usage").hasAttribute("data-just-changed")).toBe(true),
        );
        expect(actions.raiseLimitAction).toHaveBeenCalledWith(
            "org_1",
            expect.objectContaining({ key: "members", value: 5, days: 30 }),
        );
        expect(toast.showSuccess).toHaveBeenCalledWith(
            "People raised to 5 for 30 days.",
            expect.any(String),
        );
        expect(card("plan").hasAttribute("data-just-changed")).toBe(false);
    });

    it("doesn't highlight when the raise is refused", async () => {
        actions.raiseLimitAction.mockResolvedValue({
            ok: false,
            error: "Only upwards.",
        });
        render(<Overview />);
        fireEvent.click(screen.getByRole("button", { name: "Raise a limit…" }));
        const dialog = await screen.findByRole("dialog");
        fireEvent.change(within(dialog).getByLabelText("New limit"), {
            target: { value: "1" },
        });
        fireEvent.change(within(dialog).getByLabelText(/Reason/), {
            target: { value: "Testing a refusal" },
        });
        fireEvent.click(
            within(dialog).getByRole("button", { name: "Raise limit" }),
        );
        expect(await within(dialog).findByText("Only upwards.")).toBeTruthy();
        expect(card("usage").hasAttribute("data-just-changed")).toBe(false);
        expect(toast.showSuccess).not.toHaveBeenCalled();
    });

    it("offers Raise a limit… only to those who may", () => {
        render(<Overview canRaise={false} />);
        expect(screen.queryByRole("button", { name: "Raise a limit…" })).toBe(
            null,
        );
    });
});

describe("the tab badges from the overview", () => {
    it("says Billing needs you while a billing action is open", () => {
        const badges = overviewBadges(overview.badges);
        expect(badges.billing).toEqual({
            count: 1,
            tone: "danger",
            says: "needs you",
        });
        expect(badges.modules).toEqual({ count: 4 });
        expect(badges.notes).toEqual({ count: 2 });

        render(<BusinessTabs organizationId="org_1" badges={badges} />);
        const billing = screen.getByRole("link", { name: /Billing/ });
        expect(billing.textContent).toContain("1");
    });

    it("puts no badge on Billing with nothing open, and none on no read", () => {
        expect(
            overviewBadges({
                ...overview.badges,
                billing: { needsYou: false, count: 0 },
                notes: { count: 0 },
            }),
        ).toEqual({ modules: { count: 4 }, team: { count: 1 } });
        expect(overviewBadges(null)).toEqual({});
    });
});
