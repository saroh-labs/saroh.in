/** @vitest-environment jsdom */
import {
    cleanup,
    fireEvent,
    render,
    screen,
    waitFor,
    within,
} from "@testing-library/react";
import type { AnchorHTMLAttributes, ReactElement, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AdminPermission, StaffIdentity } from "@/lib/control-plane";
import type { StaffInvite, StaffMember, UnassignedBusiness } from "@/lib/staff";

/**
 * The Team screen (DEC-169, admin console U17): the job filter, invites
 * with Resend, the load bar at capacity, Assign… and Share out evenly…
 * on businesses without a manager, the Add a teammate sheet's suggested
 * role, Payouts and the commission card only with `team:pay`, and the
 * no-access panel without `team:read`. Every name here is made up.
 */

const toast = vi.hoisted(() => ({
    showSuccess: vi.fn(),
    showError: vi.fn(),
    showUndo: vi.fn(),
    dismissToasts: vi.fn(),
}));
const managerActions = vi.hoisted(() => ({
    managerCandidatesAction: vi.fn(),
    assignManagerAction: vi.fn(),
    endManagerAction: vi.fn(),
}));
const teamActions = vi.hoisted(() => ({
    amendStaffAction: vi.fn(),
    revokeStaffAction: vi.fn(),
    addTeammateAction: vi.fn(),
    resendInviteAction: vi.fn(),
    withdrawInviteAction: vi.fn(),
    shareOutAction: vi.fn(),
    claimPlatformOwnerAction: vi.fn(),
}));
const identity = vi.hoisted(() => ({
    getStaffIdentity: vi.fn(),
    requireSession: vi.fn(),
}));
const nav = vi.hoisted(() => ({ pathname: "/team" }));
const commission = vi.hoisted(() => ({
    readPayouts: vi.fn(),
    readRates: vi.fn(),
    readEarnings: vi.fn(),
}));

vi.mock("@saroh/ui/toast", () => toast);
vi.mock("@/lib/account-manager-actions", () => managerActions);
vi.mock("@/lib/team-actions", () => teamActions);
vi.mock("@/lib/control-plane", () => ({
    getStaffIdentity: identity.getStaffIdentity,
    // The Payouts page also reads the team to know who is looking.
    getJson: vi.fn(() => Promise.resolve(null)),
}));
vi.mock("@/lib/session", () => ({ requireSession: identity.requireSession }));
vi.mock("@/lib/commission", () => commission);
vi.mock("@/components/team/payouts-tab", () => ({
    PayoutsTab: ({ statement }: { statement: { month: string } }) => (
        <div>Payouts for {statement.month}</div>
    ),
}));
vi.mock("@/components/admin-shell", () => ({
    AdminShell: ({ children }: { children: ReactNode }) => (
        <div data-testid="shell">{children}</div>
    ),
}));
vi.mock("@/components/sign-out-button", () => ({
    SignOutButton: () => <button type="button">Sign out</button>,
}));
vi.mock("@saroh/ui/scroll-x", () => ({
    ScrollX: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
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
    usePathname: () => nav.pathname,
    useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
    useSearchParams: () => new URLSearchParams(),
}));

const { TeamPeople } = await import("./people-table");
const { UnassignedBusinesses } = await import("./unassigned-businesses");
const { AddTeammateSheet } = await import("./add-teammate-sheet");
const { SummaryCards } = await import("./summary-cards");
const { TeamTabs } = await import("./team-tabs");
const { default: TeamLayout } = await import("@/app/team/(tabs)/layout");
const { default: PayoutsPage } = await import("@/app/team/(tabs)/payouts/page");

function member(over: Partial<StaffMember> = {}): StaffMember {
    return {
        platformAdminId: "pa_priya",
        userId: "u_priya",
        email: "priya.sharma@example.com",
        name: "Priya Sharma",
        grantedAt: "2026-09-01T06:00:00.000Z",
        revokedAt: null,
        note: null,
        roles: [
            {
                assignmentId: "ra_1",
                role: "ACCOUNT_MANAGER",
                expiresAt: null,
                assignedAt: "2026-09-01T06:00:00.000Z",
                reason: "Joined",
            },
        ],
        permissions: [],
        profile: {
            worksAs: "ACCOUNT_MANAGER_JOB",
            capacity: 15,
            onCommission: true,
        },
        businesses: 8,
        ...over,
    };
}

const rahul = member({
    platformAdminId: "pa_rahul",
    userId: "u_rahul",
    email: "rahul.verma@example.com",
    name: "Rahul Verma",
    profile: {
        worksAs: "FINDS_BUSINESSES",
        capacity: 4,
        onCommission: true,
    },
    businesses: 4,
});
const arjun = member({
    platformAdminId: "pa_arjun",
    userId: "u_arjun",
    email: "arjun.rao@example.com",
    name: "Arjun Rao",
    roles: [
        {
            assignmentId: "ra_3",
            role: "OPERATIONS",
            expiresAt: "2026-12-31T18:29:59.000Z",
            assignedAt: "2026-09-01T06:00:00.000Z",
            reason: "Runs the machinery",
        },
    ],
    profile: { worksAs: "OTHER", capacity: null, onCommission: false },
    businesses: 0,
});
const kavya: StaffInvite = {
    id: "inv_kavya",
    email: "kavya.nair@example.com",
    name: "Kavya Nair",
    roles: ["ACCOUNT_MANAGER"],
    worksAs: "ACCOUNT_MANAGER_JOB",
    onCommission: true,
    state: "waiting",
    expiresAt: "2026-10-24T06:00:00.000Z",
    sentAt: "2026-10-17T06:00:00.000Z",
    sendCount: 1,
    invitedBy: { userId: "u_owner", name: "Meera" },
    createdAt: "2026-10-17T06:00:00.000Z",
};

/** The element for a selector; fails the test when it isn't there. */
function $(selector: string): HTMLElement {
    const el = document.querySelector<HTMLElement>(selector);
    if (!el) throw new Error(`nothing matches ${selector}`);
    return el;
}

/** The label around a control. */
function $label(control: HTMLElement): HTMLElement {
    const label = control.closest("label");
    if (!label) throw new Error("no label around the control");
    return label;
}

const people = () =>
    within(screen.getByRole("list", { name: "People on the team" }));

const staff = (permissions: AdminPermission[]): StaffIdentity => ({
    userId: "u_me",
    email: "me@example.com",
    roles: ["SUPPORT"],
    permissions,
    viaBootstrap: false,
});

beforeEach(() => {
    vi.clearAllMocks();
    nav.pathname = "/team";
    managerActions.managerCandidatesAction.mockResolvedValue({
        ok: true,
        data: [
            {
                platformAdminId: "pa_rahul",
                name: "Rahul Verma",
                businesses: 3,
                capacity: 25,
                current: false,
            },
        ],
    });
    identity.requireSession.mockResolvedValue({
        user: { email: "me@example.com" },
    });
});
afterEach(cleanup);

describe("Teammates: the people", () => {
    it("filters by job, one chip at a time, with counts", () => {
        render(
            <TeamPeople
                members={[member(), rahul, arjun]}
                invites={[kavya]}
                canGrant={false}
            />,
        );
        expect(people().getAllByRole("listitem")).toHaveLength(4);

        fireEvent.click(
            screen.getByRole("radio", { name: /^Account managers/ }),
        );
        expect(
            people()
                .getAllByRole("listitem")
                .map((li) => li.getAttribute("data-person")),
        ).toEqual(["pa_priya", "invite:inv_kavya"]);

        fireEvent.click(
            screen.getByRole("radio", { name: /^Find new businesses/ }),
        );
        expect(people().getByText("Rahul Verma")).toBeTruthy();
        expect(people().queryByText("Priya Sharma")).toBeNull();

        fireEvent.click(screen.getByRole("radio", { name: /^Something else/ }));
        expect(people().getByText("Arjun Rao")).toBeTruthy();
        // A role's end date stays on it.
        expect(people().getByText(/Operations · until/)).toBeTruthy();
    });

    it("shows an invite as Invited, with Resend that sends it again with a reason", async () => {
        teamActions.resendInviteAction.mockResolvedValue({
            ok: true,
            data: { emailed: true, expiresAt: "2026-10-26T06:00:00.000Z" },
        });
        render(<TeamPeople members={[member()]} invites={[kavya]} canGrant />);
        const row = $('[data-person="invite:inv_kavya"]');
        expect(within(row).getByText("Invited")).toBeTruthy();
        fireEvent.click(within(row).getByRole("button", { name: "Resend…" }));
        const dialog = await screen.findByRole("dialog");
        fireEvent.change(within(dialog).getByRole("textbox"), {
            target: { value: "Their link ran out" },
        });
        fireEvent.click(
            within(dialog).getByRole("button", { name: "Send again" }),
        );
        await waitFor(() =>
            expect(teamActions.resendInviteAction).toHaveBeenCalledWith(
                "inv_kavya",
                {
                    reason: "Their link ran out",
                    idempotencyKey: expect.any(String) as unknown,
                },
            ),
        );
        await waitFor(() =>
            expect(toast.showSuccess).toHaveBeenCalledWith(
                expect.stringMatching(/^Invite sent again to kavya/),
            ),
        );
    });

    it("keeps Change and Revoke for each teammate, only for staff:grant", () => {
        const { rerender } = render(
            <TeamPeople members={[member()]} invites={[]} canGrant />,
        );
        expect(people().getByRole("button", { name: "Change" })).toBeTruthy();
        expect(people().getByRole("button", { name: "Revoke" })).toBeTruthy();
        rerender(
            <TeamPeople members={[member()]} invites={[]} canGrant={false} />,
        );
        expect(people().queryByRole("button")).toBeNull();
    });

    it("fills the load bar at capacity and says full", () => {
        render(
            <TeamPeople
                members={[member(), rahul]}
                invites={[]}
                canGrant={false}
            />,
        );
        const full = within($('[data-person="pa_rahul"]')).getByRole(
            "progressbar",
        );
        expect(full.getAttribute("aria-valuenow")).toBe("4");
        expect(full.getAttribute("aria-valuemax")).toBe("4");
        expect(full.getAttribute("aria-label")).toBe("4 of 4 businesses, full");

        const room = within($('[data-person="pa_priya"]')).getByRole(
            "progressbar",
        );
        expect(room.getAttribute("aria-label")).toBe("8 of 15 businesses");
    });

    it("draws the same people as cards", () => {
        render(
            <TeamPeople
                members={[member()]}
                invites={[kavya]}
                canGrant={false}
            />,
        );
        fireEvent.click(screen.getByRole("radio", { name: "Cards" }));
        expect(
            screen.getByRole("article", { name: "Priya Sharma" }),
        ).toBeTruthy();
        expect(
            screen.getByRole("article", { name: "Kavya Nair" }),
        ).toBeTruthy();
    });

    it("lists revoked people apart", () => {
        render(
            <TeamPeople
                members={[
                    member(),
                    member({
                        platformAdminId: "pa_old",
                        name: "Dev Old",
                        revokedAt: "2026-10-01T06:00:00.000Z",
                    }),
                ]}
                invites={[]}
                canGrant={false}
            />,
        );
        expect(screen.getByText("No longer on the team")).toBeTruthy();
        expect(people().queryByText("Dev Old")).toBeNull();
    });
});

const green: UnassignedBusiness = {
    organizationId: "org_green",
    name: "Green Valley Clinic",
    slug: "green-valley",
    paying: true,
    createdAt: "2026-10-02T06:00:00.000Z",
};
const sunrise: UnassignedBusiness = {
    organizationId: "org_sunrise",
    name: "Sunrise Tuition",
    slug: "sunrise",
    paying: false,
    createdAt: "2026-09-14T06:00:00.000Z",
};

describe("Businesses without a manager", () => {
    it("lists paying ones first and assigns from the picker, keeping the row lit", async () => {
        managerActions.assignManagerAction.mockResolvedValue({
            ok: true,
            data: {
                manager: {
                    platformAdminId: "pa_rahul",
                    name: "Rahul Verma",
                    kind: "ASSIGNED",
                    source: "ASSIGNED",
                    since: "2026-10-19T06:00:00.000Z",
                },
                previous: null,
            },
        });
        render(
            <UnassignedBusinesses
                businesses={[sunrise, green]}
                total={2}
                canAssign
            />,
        );
        const list = within(
            screen.getByRole("list", { name: "Businesses without a manager" }),
        );
        expect(
            list.getAllByRole("listitem").map((li) => li.dataset.business),
        ).toEqual(["org_green", "org_sunrise"]);

        const row = $('[data-business="org_green"]');
        fireEvent.click(within(row).getByRole("button", { name: "Assign…" }));
        const dialog = await screen.findByRole("dialog");
        await within(dialog).findByRole("combobox");
        fireEvent.change(within(dialog).getByRole("textbox"), {
            target: { value: "Rahul covers Hisar" },
        });
        fireEvent.click(
            within(dialog).getByRole("button", {
                name: "Assign account manager",
            }),
        );
        await waitFor(() =>
            expect(managerActions.assignManagerAction).toHaveBeenCalledWith(
                "org_green",
                {
                    platformAdminId: "pa_rahul",
                    reason: "Rahul covers Hisar",
                    idempotencyKey: expect.any(String) as unknown,
                },
            ),
        );
        await waitFor(() =>
            expect(within(row).getByText("Now with Rahul Verma")).toBeTruthy(),
        );
        expect(row.hasAttribute("data-just-changed")).toBe(true);
        expect(toast.showSuccess).toHaveBeenCalledWith(
            "Rahul Verma now looks after this business.",
            expect.any(String),
        );
    });

    it("shares them all out evenly with a reason", async () => {
        teamActions.shareOutAction.mockResolvedValue({
            ok: true,
            data: {
                assigned: [
                    {
                        organizationId: "org_green",
                        platformAdminId: "pa_rahul",
                    },
                ],
                left: 1,
            },
        });
        render(
            <UnassignedBusinesses
                businesses={[green, sunrise]}
                total={2}
                canAssign
            />,
        );
        fireEvent.click(
            screen.getByRole("button", { name: "Share out evenly…" }),
        );
        const dialog = await screen.findByRole("dialog");
        expect(
            within(dialog).getByText(/Each of the 2 businesses/),
        ).toBeTruthy();
        fireEvent.change(within(dialog).getByRole("textbox"), {
            target: { value: "Monday share-out" },
        });
        fireEvent.click(
            within(dialog).getByRole("button", { name: "Share them out" }),
        );
        await waitFor(() =>
            expect(teamActions.shareOutAction).toHaveBeenCalledWith({
                reason: "Monday share-out",
                idempotencyKey: expect.any(String) as unknown,
            }),
        );
        await waitFor(() =>
            expect(toast.showSuccess).toHaveBeenCalledWith(
                "1 business shared out.",
                "1 business still without a manager: everyone else is full.",
            ),
        );
    });

    it("offers no Assign or Share out to staff who may only see", () => {
        render(
            <UnassignedBusinesses
                businesses={[green]}
                total={1}
                canAssign={false}
            />,
        );
        expect(screen.queryByRole("button")).toBeNull();
        expect(screen.getByText("Green Valley Clinic")).toBeTruthy();
    });

    it("says in one line when every business has a manager", () => {
        render(<UnassignedBusinesses businesses={[]} total={0} canAssign />);
        expect(screen.getByText("Every business has a manager.")).toBeTruthy();
        expect(
            screen.queryByRole("button", { name: "Share out evenly…" }),
        ).toBeNull();
    });
});

describe("Add a teammate", () => {
    const roleBox = (name: string) =>
        screen.getByRole("checkbox", { name: new RegExp(`^${name}`) });

    it("suggests Account manager for both sales jobs and Support for anything else", () => {
        render(<AddTeammateSheet onOpenChange={vi.fn()} />);
        // Account manager is the first job, and its role is ticked.
        expect((roleBox("Account manager") as HTMLInputElement).checked).toBe(
            true,
        );
        expect(
            within($label(roleBox("Account manager"))).getByText(
                "Suggested for their job",
            ),
        ).toBeTruthy();

        fireEvent.click(screen.getByRole("radio", { name: /^Something else/ }));
        expect((roleBox("Support") as HTMLInputElement).checked).toBe(true);
        expect((roleBox("Account manager") as HTMLInputElement).checked).toBe(
            false,
        );

        fireEvent.click(
            screen.getByRole("radio", { name: /^Finds new businesses/ }),
        );
        expect((roleBox("Account manager") as HTMLInputElement).checked).toBe(
            true,
        );
    });

    it("keeps the roles the operator ticked by hand", () => {
        render(<AddTeammateSheet onOpenChange={vi.fn()} />);
        fireEvent.click(roleBox("Billing"));
        fireEvent.click(screen.getByRole("radio", { name: /^Something else/ }));
        expect((roleBox("Billing") as HTMLInputElement).checked).toBe(true);
        expect((roleBox("Account manager") as HTMLInputElement).checked).toBe(
            true,
        );
    });

    it("sends everything Grant access did, plus the job, with one key", async () => {
        teamActions.addTeammateAction.mockResolvedValue({
            ok: true,
            data: {
                kind: "invited",
                emailed: true,
                expiresAt: "2026-10-26T06:00:00.000Z",
            },
        });
        const onOpenChange = vi.fn();
        render(<AddTeammateSheet onOpenChange={onOpenChange} />);
        fireEvent.change(screen.getByLabelText("Full name"), {
            target: { value: "Kavya Nair" },
        });
        fireEvent.change(screen.getByLabelText(/^Work email/), {
            target: { value: "kavya.nair@example.com" },
        });
        fireEvent.change(
            screen.getByLabelText("Reason (kept in the audit trail)"),
            { target: { value: "Joining for the north" } },
        );
        fireEvent.click(screen.getByRole("button", { name: "Add teammate" }));
        await waitFor(() =>
            expect(teamActions.addTeammateAction).toHaveBeenCalledWith({
                name: "Kavya Nair",
                email: "kavya.nair@example.com",
                worksAs: "ACCOUNT_MANAGER_JOB",
                roles: ["ACCOUNT_MANAGER"],
                onCommission: true,
                expiresAt: undefined,
                reason: "Joining for the north",
                idempotencyKey: expect.any(String) as unknown,
            }),
        );
        await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
        expect(toast.showSuccess).toHaveBeenCalledWith(
            "Invite sent to kavya.nair@example.com.",
            expect.any(String),
        );
    });

    it("asks for a name, an email, a role and a reason before sending", () => {
        render(<AddTeammateSheet onOpenChange={vi.fn()} />);
        fireEvent.click(roleBox("Account manager"));
        fireEvent.click(screen.getByRole("button", { name: "Add teammate" }));
        expect(screen.getByText("Give their name.")).toBeTruthy();
        expect(
            screen.getByText("Give the email they'll sign in with."),
        ).toBeTruthy();
        expect(screen.getByText("Tick at least one role.")).toBeTruthy();
        expect(screen.getByText("Say why, in a few words.")).toBeTruthy();
        expect(teamActions.addTeammateAction).not.toHaveBeenCalled();
    });
});

describe("Payouts and commission need team:pay", () => {
    it("leaves the commission card out without team:pay", () => {
        const { rerender } = render(
            <SummaryCards
                members={[member()]}
                invites={[kavya]}
                unassigned={3}
                canPay={false}
            />,
        );
        expect(screen.queryByText("Commission this month")).toBeNull();
        expect(screen.getByText("Businesses without a manager")).toBeTruthy();
        expect(screen.getByText("1 invite waiting")).toBeTruthy();
        rerender(
            <SummaryCards
                members={[member()]}
                invites={[]}
                unassigned={3}
                canPay
            />,
        );
        expect(screen.getByText("Commission this month")).toBeTruthy();
    });

    it("leaves the Payouts tab out without team:pay", () => {
        const { rerender } = render(<TeamTabs permissions={["team:read"]} />);
        expect(screen.getByRole("link", { name: "Teammates" })).toBeTruthy();
        expect(
            screen.getByRole("link", { name: "Console roles" }),
        ).toBeTruthy();
        expect(screen.queryByRole("link", { name: "Payouts" })).toBeNull();
        rerender(<TeamTabs permissions={["team:read", "team:pay"]} />);
        expect(screen.getByRole("link", { name: "Payouts" })).toBeTruthy();
    });

    it("answers /team/payouts without team:pay with the no-access panel", async () => {
        identity.getStaffIdentity.mockResolvedValue(staff(["team:read"]));
        const params = { searchParams: Promise.resolve({}) };
        render((await PayoutsPage(params)) as ReactElement);
        expect(screen.getByText("Not authorized")).toBeTruthy();
        expect(commission.readPayouts).not.toHaveBeenCalled();

        cleanup();
        identity.getStaffIdentity.mockResolvedValue(
            staff(["team:read", "team:pay"]),
        );
        commission.readPayouts.mockResolvedValue({
            month: "2026-10",
            current: true,
            totals: {
                duePaise: 0,
                paidPaise: 0,
                waitingPaise: 0,
                newBusinesses: 0,
            },
            people: [],
        });
        render((await PayoutsPage(params)) as ReactElement);
        expect(screen.getByText("Payouts for 2026-10")).toBeTruthy();
        // No rates sheet without commission:rates.
        expect(commission.readRates).not.toHaveBeenCalled();
    });
});

describe("/team needs team:read", () => {
    it("shows the no-access panel inside the shell without it", async () => {
        identity.getStaffIdentity.mockResolvedValue(
            staff(["leads:read" as AdminPermission]),
        );
        render((await TeamLayout({ children: <p>tab</p> })) as ReactElement);
        expect(screen.getByTestId("shell")).toBeTruthy();
        expect(screen.getByText("Not authorized")).toBeTruthy();
        expect(screen.queryByText("tab")).toBeNull();
    });

    it("draws the header and tabs with it, and Add a teammate only for staff:grant", async () => {
        identity.getStaffIdentity.mockResolvedValue(staff(["team:read"]));
        render((await TeamLayout({ children: <p>tab</p> })) as ReactElement);
        expect(screen.getByRole("heading", { name: "Team" })).toBeTruthy();
        expect(screen.getByText("tab")).toBeTruthy();
        expect(
            screen.queryByRole("button", { name: "Add a teammate" }),
        ).toBeNull();

        cleanup();
        identity.getStaffIdentity.mockResolvedValue(
            staff(["team:read", "staff:grant"]),
        );
        render((await TeamLayout({ children: <p>tab</p> })) as ReactElement);
        expect(
            screen.getByRole("button", { name: "Add a teammate" }),
        ).toBeTruthy();
    });
});
