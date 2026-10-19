/** @vitest-environment jsdom */
import {
    cleanup,
    fireEvent,
    render,
    screen,
    waitFor,
    within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AdminPermission } from "@/lib/control-plane";
import type {
    MemberActivity as Entry,
    MemberProfile as Profile,
    TeamMember,
} from "@/lib/team-member-words";
import { memberAccessOf } from "@/lib/team-member-words";

const memberActions = vi.hoisted(() => ({
    saveMemberProfileAction: vi.fn(),
    logBusinessContactAction: vi.fn(),
}));
vi.mock("@/lib/team-member-actions", () => memberActions);

const leadActions = vi.hoisted(() => ({
    logLeadContactAction: vi.fn(),
}));
vi.mock("@/lib/saroh-lead-actions", () => leadActions);

const toast = vi.hoisted(() => ({
    showSuccess: vi.fn(),
    showError: vi.fn(),
    showUndo: vi.fn(),
    dismissToasts: vi.fn(),
}));
vi.mock("@saroh/ui/toast", () => toast);

const router = vi.hoisted(() => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
}));
const nav = vi.hoisted(() => ({ pathname: "/team/pa_priya" }));
vi.mock("next/navigation", () => ({
    useRouter: () => router,
    usePathname: () => nav.pathname,
    useSearchParams: () => new URLSearchParams(),
}));

const { MemberActivity } = await import("./member-activity");
const { MemberBody } = await import("./member-body");
const { MemberBusinesses } = await import("./member-businesses");
const { MemberCounts } = await import("./member-header");
const { MemberLink } = await import("./member-link");
const { MemberProfile } = await import("./member-profile");
const { MemberTabs } = await import("./member-tabs");

const clipboard = { writeText: vi.fn(() => Promise.resolve()) };

beforeEach(() => {
    Object.defineProperty(navigator, "clipboard", {
        value: clipboard,
        configurable: true,
    });
});

afterEach(() => {
    cleanup();
    vi.clearAllMocks();
});

const SITE = "https://www.example.com";

function profile(overrides: Partial<Profile> = {}): Profile {
    return {
        platformAdminId: "pa_priya",
        exists: true,
        worksAs: "ACCOUNT_MANAGER_JOB",
        workEmail: "priya.sharma@example.com",
        phone: "+91 90000 00010",
        city: "Rohtak",
        languages: ["Hindi", "English"],
        joinedOn: "2026-09-01",
        reportsToPlatformAdminId: "pa_meera",
        engagement: "FREELANCE",
        capacity: 12,
        managerCode: "PRYA2345",
        onCommission: true,
        emergencyContact: "Asha Sharma, +91 90000 00011",
        taxIdSet: false,
        updatedAt: "2026-10-01T00:00:00.000Z",
        ...overrides,
    };
}

function member(overrides: Partial<TeamMember> = {}): TeamMember {
    return {
        platformAdminId: "pa_priya",
        userId: "u_priya",
        name: "Priya Sharma",
        email: "priya.sharma@example.com",
        grantedAt: "2026-09-01T00:00:00.000Z",
        revokedAt: null,
        note: null,
        self: false,
        roles: [
            {
                role: "ACCOUNT_MANAGER",
                expiresAt: null,
                assignedAt: "2026-09-01T00:00:00.000Z",
            },
        ],
        profile: profile(),
        reportsTo: { platformAdminId: "pa_meera", name: "Meera Rao" },
        businesses: [
            {
                organizationId: "org_leafy",
                name: "Leafy Cafe",
                slug: "leafy-cafe",
                source: "LINK",
                kind: "BROUGHT_IN",
                since: "2026-09-12T00:00:00.000Z",
            },
            {
                organizationId: "org_bloom",
                name: "Bloom Salon",
                slug: "bloom-salon",
                source: "ASSIGNED",
                kind: "ASSIGNED",
                since: "2026-10-02T00:00:00.000Z",
            },
        ],
        leads: [],
        counts: {
            businesses: 2,
            broughtIn: 1,
            openLeads: 0,
            overdueFollowUps: 0,
            wonThisMonth: 1,
        },
        activity: [
            {
                id: "role:r1",
                type: "role-given",
                at: "2026-09-01T00:00:00.000Z",
                role: "ACCOUNT_MANAGER",
                expiresAt: null,
            },
        ],
        ...overrides,
    };
}

const PLATFORM_OWNER: AdminPermission[] = [
    "team:read",
    "team:write",
    "team:pay",
    "accounts:read",
    "saroh-leads:read",
    "saroh-leads:write",
];
const ACCOUNT_MANAGER: AdminPermission[] = [
    "accounts:read",
    "saroh-leads:read",
    "saroh-leads:write",
];
const SUPPORT: AdminPermission[] = [
    "team:read",
    "accounts:read",
    "saroh-leads:read",
    "saroh-leads:write",
];

describe("Profile", () => {
    it("marks what's missing, and counts it", () => {
        const { container } = render(
            <MemberProfile
                member={member({
                    profile: profile({ phone: null, emergencyContact: null }),
                })}
                pay={false}
                canEdit={false}
                teammates={[]}
            />,
        );
        expect(screen.getByText("2 missing")).toBeTruthy();
        const missing = [...container.querySelectorAll("[data-missing]")].map(
            (row) => row.getAttribute("data-row"),
        );
        expect(missing).toEqual(["phone", "emergencyContact"]);
        expect(screen.getAllByText("Missing")).toHaveLength(2);
        // No team:pay: no tax id row, and no Edit details without team:write.
        expect(screen.queryByText("Tax id (PAN)")).toBeNull();
        expect(
            screen.queryByRole("button", { name: "Edit details…" }),
        ).toBeNull();
    });

    it("shows the tax id only to Platform owner and Billing, never whole", () => {
        render(
            <MemberProfile
                member={member({
                    profile: profile({ taxIdSet: true, taxIdLast4: "234F" }),
                })}
                pay
                canEdit
                teammates={[]}
            />,
        );
        expect(screen.getByText("Tax id (PAN)")).toBeTruthy();
        expect(screen.getByText("Ends 234F")).toBeTruthy();
        expect(screen.queryByText(/missing/)).toBeNull();
        expect(
            screen.getByRole("button", { name: "Edit details…" }),
        ).toBeTruthy();
    });

    it("marks every detail missing before the first save", () => {
        render(
            <MemberProfile
                member={member({
                    profile: profile({
                        exists: false,
                        worksAs: null,
                        workEmail: null,
                        phone: null,
                        city: null,
                        languages: [],
                        joinedOn: null,
                        reportsToPlatformAdminId: null,
                        engagement: null,
                        capacity: null,
                        managerCode: null,
                        onCommission: false,
                        emergencyContact: null,
                    }),
                    reportsTo: null,
                })}
                pay={false}
                canEdit={false}
                teammates={[]}
            />,
        );
        expect(screen.getByText("11 missing")).toBeTruthy();
        expect(
            screen.getByText("Nothing is on file for Priya Sharma yet."),
        ).toBeTruthy();
    });
});

describe("Businesses", () => {
    it("shows how each came in, and since when", () => {
        render(
            <MemberBusinesses
                platformAdminId="pa_priya"
                businesses={member().businesses}
                self={false}
                canLog={false}
                canOpen
            />,
        );
        const rows = within(
            screen.getByRole("list", { name: "Businesses they look after" }),
        ).getAllByRole("listitem");
        expect(within(rows[0]).getByText(/^Their link · since/)).toBeTruthy();
        expect(
            within(rows[0]).getByText("It signed up through their link."),
        ).toBeTruthy();
        expect(within(rows[1]).getByText(/^Assigned · since/)).toBeTruthy();
        expect(
            within(rows[1]).getByText("It was given to them by Saroh's team."),
        ).toBeTruthy();
        expect(
            within(rows[0]).getByRole("link", { name: "Leafy Cafe" }),
        ).toHaveProperty(
            "href",
            expect.stringContaining("/businesses/org_leafy"),
        );
        // Not their own page: no Log a call.
        expect(screen.queryByRole("button", { name: "Log a call" })).toBeNull();
    });

    it("names a business without a link for a reader who can't open it", () => {
        render(
            <MemberBusinesses
                platformAdminId="pa_priya"
                businesses={member().businesses}
                self
                canLog
                canOpen={false}
            />,
        );
        expect(screen.queryByRole("link", { name: "Leafy Cafe" })).toBeNull();
        expect(screen.getByText("Leafy Cafe")).toBeTruthy();
        expect(
            screen.getAllByRole("button", { name: "Log a call" }),
        ).toHaveLength(2);
    });
});

describe("Activity", () => {
    it("Log a call adds the call to the top of Activity", async () => {
        memberActions.logBusinessContactAction.mockResolvedValue({
            ok: true,
            data: {
                id: "c_new",
                kind: "CALL",
                happenedAt: "2026-10-19T10:00:00.000Z",
                minutes: 15,
                summary: "Set up online orders",
                feedback: null,
                by: "Priya Sharma",
            },
        });
        const me = member({ self: true });
        render(
            <MemberActivity
                platformAdminId="pa_priya"
                activity={me.activity}
                businesses={me.businesses}
                leads={me.leads}
                canLog
            />,
        );
        const list = () =>
            within(screen.getByRole("list", { name: "What they did" }));
        expect(list().getAllByRole("listitem")).toHaveLength(1);

        fireEvent.click(screen.getByRole("button", { name: "Log a call" }));
        const sheet = await screen.findByRole("dialog");
        expect(within(sheet).queryByText("Next follow-up")).toBeNull();
        fireEvent.change(within(sheet).getByLabelText("What was said"), {
            target: { value: "Set up online orders" },
        });
        fireEvent.change(within(sheet).getByLabelText(/Minutes/), {
            target: { value: "15" },
        });
        fireEvent.click(within(sheet).getByRole("button", { name: "Log it" }));

        await waitFor(() =>
            expect(list().getAllByRole("listitem")).toHaveLength(2),
        );
        expect(memberActions.logBusinessContactAction).toHaveBeenCalledWith(
            expect.objectContaining({
                organizationId: "org_leafy",
                platformAdminId: "pa_priya",
                kind: "CALL",
                summary: "Set up online orders",
                minutes: 15,
            }),
        );
        const first = list().getAllByRole("listitem")[0];
        expect(within(first).getByText("Logged a call")).toBeTruthy();
        expect(
            within(first).getByText(
                "Leafy Cafe · 15 min · Set up online orders",
            ),
        ).toBeTruthy();
        expect(toast.showSuccess).toHaveBeenCalledWith(
            "Logged with Leafy Cafe",
        );
        expect(router.refresh).toHaveBeenCalled();
    });

    it("offers no Log a call on someone else's page", () => {
        const access = memberAccessOf(member(), SUPPORT);
        expect(access.logCall).toBe(false);
        const entries: Entry[] = member().activity;
        render(
            <MemberActivity
                platformAdminId="pa_priya"
                activity={entries}
                businesses={member().businesses}
                leads={[]}
                canLog={access.logCall}
            />,
        );
        expect(screen.queryByRole("button", { name: "Log a call" })).toBeNull();
        expect(screen.getByText("Given the Account manager role")).toBeTruthy();
    });
});

describe("Earnings", () => {
    it("is absent without team:pay: no tab, no card", () => {
        render(
            <>
                <MemberTabs
                    platformAdminId="pa_priya"
                    seesLeads
                    pay={memberAccessOf(member(), SUPPORT).pay}
                    counts={{ businesses: 2, openLeads: 0 }}
                />
                <MemberCounts member={member()} />
            </>,
        );
        expect(screen.queryByRole("link", { name: /Earnings/ })).toBeNull();
        expect(screen.queryByText("Earnings due")).toBeNull();
        expect(screen.getByRole("link", { name: /Activity/ })).toBeTruthy();
    });

    it("is there with team:pay", () => {
        render(
            <>
                <MemberTabs
                    platformAdminId="pa_priya"
                    seesLeads
                    pay={memberAccessOf(member(), PLATFORM_OWNER).pay}
                    counts={{ businesses: 2, openLeads: 0 }}
                />
                <MemberCounts member={member()} earnings={null} />
            </>,
        );
        expect(screen.getByRole("link", { name: /Earnings/ })).toHaveProperty(
            "href",
            expect.stringContaining("/team/pa_priya/earnings"),
        );
        expect(screen.getByText("Earnings due")).toBeTruthy();
    });
});

describe("Manager link", () => {
    it("copies the link and the code, and says so", async () => {
        render(
            <MemberLink
                code="PRYA2345"
                siteUrl={SITE}
                isManager
                self={false}
            />,
        );
        expect(screen.getByTestId("manager-link").textContent).toBe(
            "https://www.example.com/?am=PRYA2345",
        );
        fireEvent.click(screen.getByRole("button", { name: "Copy link" }));
        await waitFor(() =>
            expect(clipboard.writeText).toHaveBeenCalledWith(
                "https://www.example.com/?am=PRYA2345",
            ),
        );
        await waitFor(() =>
            expect(toast.showSuccess).toHaveBeenCalledWith(
                "Link copied",
                "https://www.example.com/?am=PRYA2345",
            ),
        );

        fireEvent.click(screen.getByRole("button", { name: "Copy code" }));
        await waitFor(() =>
            expect(clipboard.writeText).toHaveBeenCalledWith("PRYA2345"),
        );
        await waitFor(() =>
            expect(toast.showSuccess).toHaveBeenCalledWith(
                "Code copied",
                "PRYA2345",
            ),
        );
    });

    it("says when there is no code yet", () => {
        render(
            <MemberLink code={null} siteUrl={SITE} isManager self={false} />,
        );
        expect(screen.queryByRole("button", { name: "Copy link" })).toBeNull();
        expect(
            screen.getByText(/They get a link and a code once/),
        ).toBeTruthy();
    });
});

describe("Who may open the page", () => {
    it("shows an Account manager the no-access panel on someone else's page", () => {
        // The API refused the read: the page has nothing to draw.
        render(
            <MemberBody
                member={null}
                email="asha.manager@example.com"
                access={{ editProfile: false, pay: false, logCall: false }}
                siteUrl={SITE}
                backToTeam={false}
            >
                <p>Tab</p>
            </MemberBody>,
        );
        expect(screen.getByText("Not authorized")).toBeTruthy();
        expect(screen.queryByText("Tab")).toBeNull();
        expect(screen.queryByRole("button", { name: "Copy link" })).toBeNull();
    });

    it("opens an Account manager's own page, with Log a call and no Earnings", () => {
        nav.pathname = "/team/pa_priya";
        const mine = member({ self: true });
        const access = memberAccessOf(mine, ACCOUNT_MANAGER);
        expect(access).toEqual({
            editProfile: false,
            pay: false,
            logCall: true,
        });
        render(
            <MemberBody
                member={mine}
                email="priya.sharma@example.com"
                access={access}
                siteUrl={SITE}
                backToTeam={false}
            >
                <p>Tab</p>
            </MemberBody>,
        );
        expect(screen.queryByText("Not authorized")).toBeNull();
        expect(screen.getByText("Tab")).toBeTruthy();
        expect(screen.getByRole("button", { name: "Copy link" })).toBeTruthy();
        expect(screen.queryByRole("link", { name: /Earnings/ })).toBeNull();
        expect(screen.queryByRole("link", { name: "‹ Team" })).toBeNull();
        expect(screen.getByRole("link", { name: /Businesses/ })).toBeTruthy();
    });
});
