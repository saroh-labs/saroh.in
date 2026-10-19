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

const actions = vi.hoisted(() => ({
    readOwnRateAction: vi.fn(),
    previewOwnRateAction: vi.fn(),
    setOwnRateAction: vi.fn(),
    endOwnRateAction: vi.fn(),
    setCommissionRateAction: vi.fn(),
    markPayoutPaidAction: vi.fn(),
    exportPayoutsAction: vi.fn(),
}));
vi.mock("@/lib/commission-actions", () => actions);
vi.mock("@/lib/account-manager-actions", () => ({
    managerCandidatesAction: vi.fn(),
    assignManagerAction: vi.fn(),
    endManagerAction: vi.fn(),
}));
vi.mock("@/lib/team-member-actions", () => ({}));
const toast = vi.hoisted(() => ({
    showSuccess: vi.fn(),
    showError: vi.fn(),
    showUndo: vi.fn(),
    dismissToasts: vi.fn(),
}));
vi.mock("@saroh/ui/toast", () => toast);
vi.mock("next/link", () => ({
    default: ({
        href,
        children,
        ...rest
    }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
        <a href={href} {...rest}>
            {children}
        </a>
    ),
}));
vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
    usePathname: () => "/team",
    useSearchParams: () => new URLSearchParams(),
}));

import { TeamCard } from "@/components/business/overview/team-card";
import type { RatesView, StatementLine } from "@/lib/commission-words";
import { lineRateWords, rateLabel } from "@/lib/commission-words";
import type {
    OverviewAccountManager,
    OverviewPanel,
} from "@/lib/overview-words";
import type { OwnRateSummary, OwnRateView } from "@/lib/own-rate-words";
import {
    earnsFromChips,
    earnsFromProblem,
    previewWords,
} from "@/lib/own-rate-words";

import { MemberBusinesses } from "./member-businesses";
import { OwnRateDialog } from "./own-rate-dialog";
import { RatesSheet } from "./rates-sheet";

/** A rate drawn for this run: never one written in the repository. */
const RATE = 1 + Math.floor(Math.random() * 4_999);
const percentOf = (bps: number) => (bps / 100).toFixed(2);

// Made-up people and businesses: nobody here is real.
function summary(over: Partial<OwnRateSummary> = {}): OwnRateSummary {
    return {
        organizationId: "org_1",
        businessName: "Green Leaf Gym",
        dates: {
            joined: "2026-08-01",
            firstPaidPlan: "2026-09-10",
            managerSince: "2026-08-15",
        },
        manager: { platformAdminId: "pa_asha", name: "Asha" },
        current: null,
        upcoming: null,
        history: [],
        ...over,
    };
}

const ownRate: OwnRateView = {
    id: "bcr_1",
    platformAdminId: "pa_asha",
    managerName: "Asha",
    basisPoints: RATE,
    earnsFrom: "2026-09-09T18:30:00.000Z",
    earnsFromDay: "2026-09-10",
    until: null,
    lastDay: null,
    setByName: "Mohit",
    reason: "agreed with them",
    createdAt: "2026-10-19T00:00:00.000Z",
    endedAt: null,
    endedReason: null,
};

const accountManager: OverviewPanel<OverviewAccountManager> = {
    status: "ok",
    data: {
        manager: {
            platformAdminId: "pa_asha",
            name: "Asha",
            kind: "ASSIGNED",
            source: "ASSIGNED",
            since: "2026-08-15T06:00:00.000Z",
        },
    },
};

beforeEach(() => {
    actions.readOwnRateAction.mockResolvedValue({
        ok: true,
        data: summary(),
    });
    actions.previewOwnRateAction.mockResolvedValue({
        ok: true,
        data: {
            earnsFromDay: "2026-09-10",
            lastDay: null,
            managerName: "Asha",
            payments: 3,
            amountPaise: 45_600,
            alreadyPriced: 0,
            replaces: null,
        },
    });
});
afterEach(() => {
    cleanup();
    vi.clearAllMocks();
});

const dialog = () => within(screen.getByRole("dialog"));

describe("Set commission… (the dialog)", () => {
    it("offers the days as chips, a day before the first paid plan off saying why", async () => {
        render(
            <OwnRateDialog
                organizationId="org_1"
                businessName="Green Leaf Gym"
                onOpenChange={vi.fn()}
                onSaved={vi.fn()}
            />,
        );
        const joined = await dialog().findByRole("button", {
            name: /^Joined · 1 Aug/,
        });
        expect((joined as HTMLButtonElement).disabled).toBe(true);
        const took = dialog().getByRole("button", {
            name: /^Asha took it on · 15 Aug/,
        });
        expect((took as HTMLButtonElement).disabled).toBe(true);
        expect(
            dialog().getAllByText("Before its first paid plan"),
        ).toHaveLength(2);
        const first = dialog().getByRole("button", {
            name: /^First paid plan · 10 Sep/,
        });
        expect((first as HTMLButtonElement).disabled).toBe(false);
        fireEvent.click(first);
        expect(first.getAttribute("aria-pressed")).toBe("true");
    });

    it("shows the dry run, then sets the rate in basis points with the reason", async () => {
        const onSaved = vi.fn();
        actions.setOwnRateAction.mockResolvedValue({
            ok: true,
            data: {
                ...summary({ current: ownRate }),
                backPaid: { payments: 3, amountPaise: 45_600 },
            },
        });
        render(
            <OwnRateDialog
                organizationId="org_1"
                businessName="Green Leaf Gym"
                onOpenChange={vi.fn()}
                onSaved={onSaved}
            />,
        );
        fireEvent.click(
            await dialog().findByRole("button", { name: /^First paid plan/ }),
        );
        fireEvent.change(dialog().getByLabelText("Rate (%)"), {
            target: { value: percentOf(RATE) },
        });
        const line = await dialog().findByText(
            /^3 payments since 10 Sept? get commission: .* to Asha\.$/,
        );
        expect(line.hasAttribute("data-dry-run")).toBe(true);
        expect(actions.previewOwnRateAction).toHaveBeenCalledWith("org_1", {
            basisPoints: RATE,
            earnsFrom: "2026-09-10",
        });
        expect(actions.setOwnRateAction).not.toHaveBeenCalled();

        fireEvent.change(
            dialog().getByLabelText("Reason (kept in the audit trail)"),
            { target: { value: "agreed with them" } },
        );
        fireEvent.click(dialog().getByRole("button", { name: "Set rate" }));
        await waitFor(() => expect(onSaved).toHaveBeenCalled());
        expect(actions.setOwnRateAction).toHaveBeenCalledWith(
            "org_1",
            expect.objectContaining({
                basisPoints: RATE,
                earnsFrom: "2026-09-10",
                reason: "agreed with them",
            }),
        );
        expect(onSaved).toHaveBeenCalledWith(
            expect.stringMatching(/3 payments got commission\.$/),
            expect.anything(),
        );
    });

    it("says why when the business has no paid plan, and sets nothing", async () => {
        actions.readOwnRateAction.mockResolvedValue({
            ok: true,
            data: summary({
                dates: {
                    joined: "2026-08-01",
                    firstPaidPlan: null,
                    managerSince: "2026-08-15",
                },
            }),
        });
        render(
            <OwnRateDialog
                organizationId="org_1"
                businessName="Green Leaf Gym"
                onOpenChange={vi.fn()}
                onSaved={vi.fn()}
            />,
        );
        expect(
            await dialog().findByText(/hasn't paid for a plan yet/),
        ).toBeTruthy();
        expect(dialog().queryByLabelText("Rate (%)")).toBeNull();
    });
});

describe("the own rate on the Team card", () => {
    it("shows the rate with Set and End to commission:rates", async () => {
        actions.readOwnRateAction.mockResolvedValue({
            ok: true,
            data: summary({ current: ownRate }),
        });
        render(
            <TeamCard
                organizationId="org_1"
                team={{
                    status: "ok",
                    data: { members: [], count: 0, invitesOpen: 0 },
                }}
                accountManager={accountManager}
                canAssign={false}
                canSeeRate
                canSetRate
            />,
        );
        expect(
            await screen.findByText((text) =>
                text.startsWith(`Own rate ${rateLabel(RATE)} from 10 Sep`),
            ),
        ).toBeTruthy();
        expect(
            screen.getByRole("button", { name: "Set commission…" }),
        ).toBeTruthy();
        expect(
            screen.getByRole("button", { name: "End own rate…" }),
        ).toBeTruthy();
    });

    it("team:pay alone sees the line but can't change it", async () => {
        actions.readOwnRateAction.mockResolvedValue({
            ok: true,
            data: summary({ current: ownRate }),
        });
        render(
            <TeamCard
                organizationId="org_1"
                team={{
                    status: "ok",
                    data: { members: [], count: 0, invitesOpen: 0 },
                }}
                accountManager={accountManager}
                canAssign={false}
                canSeeRate
            />,
        );
        expect(
            await screen.findByText(/^Own rate .* from 10 Sept?$/),
        ).toBeTruthy();
        expect(
            screen.queryByRole("button", { name: "Set commission…" }),
        ).toBeNull();
        expect(
            screen.queryByRole("button", { name: "End own rate…" }),
        ).toBeNull();
    });

    it("anyone else is never sent it and never sees the number", () => {
        render(
            <TeamCard
                organizationId="org_1"
                team={{
                    status: "ok",
                    data: { members: [], count: 0, invitesOpen: 0 },
                }}
                accountManager={accountManager}
                canAssign
            />,
        );
        expect(actions.readOwnRateAction).not.toHaveBeenCalled();
        expect(screen.queryByText(/Own rate/)).toBeNull();
        expect(screen.queryByText(rateLabel(RATE))).toBeNull();
        expect(
            screen.queryByRole("button", { name: "Set commission…" }),
        ).toBeNull();
    });
});

describe("Set commission… elsewhere", () => {
    it("is on each business row of a teammate's page, for commission:rates only", () => {
        const business = {
            organizationId: "org_1",
            name: "Green Leaf Gym",
            slug: "green-leaf",
            kind: "ASSIGNED",
            source: "ASSIGNED",
            since: "2026-08-15T06:00:00.000Z",
        } as never;
        const { rerender } = render(
            <MemberBusinesses
                platformAdminId="pa_asha"
                businesses={[business]}
                self={false}
                canLog={false}
                canOpen
            />,
        );
        expect(
            screen.queryByRole("button", { name: "Set commission…" }),
        ).toBeNull();
        rerender(
            <MemberBusinesses
                platformAdminId="pa_asha"
                businesses={[business]}
                self={false}
                canLog={false}
                canOpen
                canSetRate
            />,
        );
        fireEvent.click(
            screen.getByRole("button", { name: "Set commission…" }),
        );
        expect(screen.getByRole("dialog")).toBeTruthy();
        expect(actions.readOwnRateAction).toHaveBeenCalledWith("org_1");
    });

    it("the Rates sheet lists businesses' own rates", () => {
        const rates: RatesView = {
            current: { BROUGHT_IN: null, ASSIGNED: null },
            upcoming: [],
            history: [],
            ownRates: [
                {
                    id: "bcr_1",
                    organizationId: "org_1",
                    businessName: "Green Leaf Gym",
                    platformAdminId: "pa_asha",
                    managerName: "Asha",
                    basisPoints: RATE,
                    earnsFrom: "2026-09-09T18:30:00.000Z",
                    until: "2026-09-30T18:30:00.000Z",
                    earnsFromDay: "2026-09-10",
                    lastDay: "2026-09-30",
                },
            ],
        };
        render(<RatesSheet rates={rates} open onOpenChange={vi.fn()} />);
        const list = document.querySelector<HTMLElement>("[data-own-rates]");
        if (!list) throw new Error("no own rates list");
        expect(
            within(list).getByRole("link", { name: "Green Leaf Gym" }),
        ).toBeTruthy();
        expect(list.textContent).toContain("for Asha, from 10 Sep");
        expect(list.textContent).toContain("until 30 Sep");
    });
});

describe("own-rate words", () => {
    it("chips with no paid plan are all off; a manager's day after it is on", () => {
        expect(
            earnsFromChips(
                summary({
                    dates: {
                        joined: "2026-08-01",
                        firstPaidPlan: null,
                        managerSince: "2026-08-15",
                    },
                }),
            ).every((c) => c.disabled === "It hasn't paid for a plan yet"),
        ).toBe(true);
        const later = earnsFromChips(
            summary({
                dates: {
                    joined: "2026-08-01",
                    firstPaidPlan: "2026-09-10",
                    managerSince: "2026-10-01",
                },
            }),
        );
        expect(
            later.find((c) => c.label === "Asha took it on")?.disabled,
        ).toBeNull();
    });

    it("a typed day before the first paid plan is refused in the API's words", () => {
        expect(earnsFromProblem(summary(), "2026-09-09", "")).toMatch(
            /^It can earn from 10 Sep.* at the earliest, the day of its first paid plan\.$/,
        );
        expect(earnsFromProblem(summary(), "2026-09-10", "2026-09-01")).toMatch(
            /last day comes before/,
        );
        expect(earnsFromProblem(summary(), "2026-09-10", "")).toBeNull();
    });

    it("the dry run says what stays as it is", () => {
        expect(
            previewWords({
                earnsFromDay: "2026-09-10",
                lastDay: null,
                managerName: "Asha",
                payments: 0,
                amountPaise: 0,
                alreadyPriced: 2,
                replaces: ownRate,
            }),
        ).toMatch(
            /^No payment since 10 Sept? is waiting.*2 already priced at the general rate keep theirs\. It replaces the own rate from 10 Sept?\.$/,
        );
    });

    it("a line priced by an own rate says so", () => {
        const line = {
            basisPoints: RATE,
            ownRate: true,
            businessName: "Green Leaf Gym",
        } satisfies Pick<
            StatementLine,
            "basisPoints" | "ownRate" | "businessName"
        >;
        expect(lineRateWords(line)).toBe(
            `${rateLabel(RATE)} (own rate for Green Leaf Gym)`,
        );
        expect(lineRateWords({ ...line, ownRate: false })).toBe(
            rateLabel(RATE),
        );
    });
});
