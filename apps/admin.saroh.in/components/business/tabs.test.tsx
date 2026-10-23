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

import {
    MADE_ROLE_CAN,
    mergeHistory,
    paymentSteps,
    roleCan,
    sessionUntil,
} from "@/lib/business-words";
import type { SiteTrackersRow } from "@/lib/businesses";
import type { OverviewWebsite } from "@/lib/overview-words";

import { CloseAccess } from "./close-access";
import { HistoryList } from "./history-list";
import { NotesPanel } from "./notes-panel";
import { SiteTrackers } from "./site-trackers";
import { TeamRows } from "./team-rows";
import { WebsiteTab } from "./website-tab";

/**
 * The business page's Website and payments, Team, Notes and History tabs,
 * and the support session's Close (admin plan U6, R7, R8, R16).
 */

const business = vi.hoisted(() => ({
    siteTrackersAction: vi.fn(),
    closeAccessAction: vi.fn(),
    addNoteAction: vi.fn(),
}));
vi.mock("@/lib/business-actions", () => business);

const people = vi.hoisted(() => ({
    changeMemberRoleAction: vi.fn(),
    removeMemberAction: vi.fn(),
    resendInvitationAction: vi.fn(),
    withdrawInvitationAction: vi.fn(),
    endSessionsAction: vi.fn(),
}));
vi.mock("@/lib/people-actions", () => people);

const toast = vi.hoisted(() => ({
    showSuccess: vi.fn(),
    showError: vi.fn(),
    showUndo: vi.fn(),
    dismissToasts: vi.fn(),
}));
vi.mock("@saroh/ui/toast", () => toast);

beforeEach(() => {
    for (const fn of [
        ...Object.values(business),
        ...Object.values(people),
        ...Object.values(toast),
    ]) {
        fn.mockReset();
    }
    business.siteTrackersAction.mockResolvedValue({ ok: true, data: null });
    business.addNoteAction.mockResolvedValue({ ok: true, data: null });
    people.changeMemberRoleAction.mockResolvedValue({ ok: true, data: null });
});
afterEach(cleanup);

/** The Undo the last toast offered, pressed. */
function pressUndo() {
    const call = toast.showUndo.mock.calls.at(-1);
    if (!call) throw new Error("no Undo was offered");
    (call[1] as () => void)();
}

function lastOf<T>(items: T[]): T {
    const last = items.at(-1);
    if (last === undefined) throw new Error("none found");
    return last;
}

async function giveReason(reason: string) {
    fireEvent.change(await screen.findByLabelText(/Reason/), {
        target: { value: reason },
    });
}

describe("Website and payments: trackers", () => {
    const switchedOff: SiteTrackersRow = {
        id: "site_1",
        name: "Northwind",
        subdomain: "northwind",
        trackersOn: 2,
        switchedOff: {
            at: "2026-10-08T10:00:00.000Z",
            reason: "Pixel account reported for misuse",
            byUserId: "staff_1",
        },
        switchedOffBy: "Asha",
    };

    it('says "Switched off by Saroh" and offers Switch on…, which lights the row and can be undone', async () => {
        render(
            <SiteTrackers
                organizationId="org_1"
                sites={[switchedOff]}
                canSwitch
            />,
        );
        expect(screen.getByText("Switched off by Saroh")).toBeTruthy();
        fireEvent.click(screen.getByRole("button", { name: "Switch on…" }));
        await giveReason("Owner fixed the account");
        fireEvent.click(screen.getByRole("button", { name: "Switch back on" }));

        await waitFor(() => expect(toast.showUndo).toHaveBeenCalled());
        expect(toast.showUndo.mock.calls[0]?.[0]).toBe(
            "Trackers switched back on for Northwind.",
        );
        expect(
            document
                .querySelector('[data-site="site_1"]')
                ?.hasAttribute("data-just-changed"),
        ).toBe(true);

        pressUndo();
        await waitFor(() =>
            expect(business.siteTrackersAction).toHaveBeenCalledTimes(2),
        );
        expect(business.siteTrackersAction.mock.calls[1]?.[2]).toMatchObject({
            reason: "Undo: Owner fixed the account",
            switchOn: false,
        });
    });

    it("says Allowed and None set up for a site with no trackers", () => {
        render(
            <SiteTrackers
                organizationId="org_1"
                sites={[
                    {
                        ...switchedOff,
                        trackersOn: 0,
                        switchedOff: null,
                        switchedOffBy: null,
                    },
                ]}
                canSwitch
            />,
        );
        expect(screen.getByText("Allowed")).toBeTruthy();
        expect(screen.getByText(/None set up/)).toBeTruthy();
        expect(
            screen.getByRole("button", { name: "Switch off…" }),
        ).toBeTruthy();
    });
});

describe("Website and payments: sites and payments", () => {
    const site = {
        id: "site_1",
        name: "Northwind",
        published: true,
        addresses: [
            {
                kind: "web-address" as const,
                url: "https://northwind.saroh.app",
            },
        ],
    };
    const website = (over: Partial<OverviewWebsite>) => ({
        status: "ok" as const,
        data: {
            sites: [site],
            payments: [],
            published: 1,
            paymentsConnected: false,
            ...over,
        },
    });

    it("with no payments, says only the business can connect, and offers Copy steps", () => {
        render(
            <WebsiteTab
                businessName="Northwind"
                website={website({})}
                trackers={null}
            />,
        );
        const payments = document.querySelector('[data-row="payments"]');
        if (!(payments instanceof HTMLElement)) throw new Error("no row");
        expect(within(payments).getByText("Not connected")).toBeTruthy();
        expect(
            within(payments).getByText(
                "Only the business can connect Razorpay or Cashfree.",
            ),
        ).toBeTruthy();
        expect(
            within(payments).getByRole("button", { name: /Copy steps/ }),
        ).toBeTruthy();
        // The published site links out and needs nothing from them.
        const live = screen.getByRole("link", {
            name: /northwind\.saroh\.app/,
        });
        expect(live.getAttribute("target")).toBe("_blank");
        expect(live.getAttribute("rel")).toBe("noopener noreferrer");
        expect(
            screen.getAllByRole("button", { name: /Copy steps/ }),
        ).toHaveLength(1);
    });

    it("with payments connected, offers no steps", () => {
        render(
            <WebsiteTab
                businessName="Northwind"
                website={website({
                    payments: [
                        {
                            provider: "RAZORPAY",
                            connected: true,
                            needsAttention: false,
                        },
                    ],
                })}
                trackers={null}
            />,
        );
        expect(screen.getByText("Connected")).toBeTruthy();
        expect(screen.getByText("Through Razorpay")).toBeTruthy();
        expect(screen.queryByRole("button", { name: /Copy steps/ })).toBeNull();
    });

    it("a site not published says only they can publish it, with steps", () => {
        render(
            <WebsiteTab
                businessName="Northwind"
                website={website({
                    sites: [{ ...site, published: false, addresses: [] }],
                })}
                trackers={null}
            />,
        );
        expect(screen.getByText("Not published")).toBeTruthy();
        expect(
            screen.getAllByRole("button", { name: /Copy steps/ }),
        ).toHaveLength(2);
    });

    it("no site yet is the empty card, and a failed read says so", () => {
        const { unmount } = render(
            <WebsiteTab
                businessName="Northwind"
                website={website({ sites: [] })}
                trackers={null}
            />,
        );
        expect(screen.getByText("No website yet.")).toBeTruthy();
        unmount();
        render(
            <WebsiteTab
                businessName="Northwind"
                website={{ status: "failed" }}
                trackers={null}
            />,
        );
        expect(screen.getByText("Website could not be loaded")).toBeTruthy();
    });

    it("the steps to send name the business and where to go, and never a key", () => {
        const steps = paymentSteps("Northwind", null);
        expect(steps).toContain("Hi Northwind,");
        expect(steps).toContain("Settings › Providers");
        expect(steps).not.toMatch(/rzp_|secret/i);
    });
});

describe("Team", () => {
    it("shows each person's role and what it can do, and no email it wasn't given", () => {
        render(
            <TeamRows
                organizationId="org_1"
                businessName="Northwind"
                members={[
                    { key: "m1", name: "Asha Rao", role: "OWNER" },
                    { key: "m2", name: "Ravi Menon", role: "ADMIN" },
                    { key: "m3", name: null, role: "front-desk" },
                ]}
                canChange
            />,
        );
        expect(screen.getByText("Asha Rao")).toBeTruthy();
        expect(screen.getByText(roleCan("OWNER"))).toBeTruthy();
        expect(screen.getByText(roleCan("ADMIN"))).toBeTruthy();
        expect(screen.getByText(MADE_ROLE_CAN)).toBeTruthy();
        expect(screen.getByText("No name given")).toBeTruthy();
        expect(screen.queryByText(/@/)).toBeNull();
        // Without a session there is no one to act on: no controls.
        expect(screen.queryByRole("button")).toBeNull();
    });

    it("inside a session: the email it was given, Change role… with Undo, and Remove…", async () => {
        render(
            <TeamRows
                organizationId="org_1"
                businessName="Northwind"
                members={[
                    {
                        key: "m2",
                        userId: "user_2",
                        name: "Ravi Menon",
                        email: "ravi@example.com",
                        emailVerified: false,
                        role: "ADMIN",
                    },
                ]}
                canChange
            />,
        );
        expect(
            screen.getByText(/ravi@example\.com · not verified/),
        ).toBeTruthy();
        expect(screen.getByRole("button", { name: "Remove…" })).toBeTruthy();

        fireEvent.click(screen.getByRole("button", { name: "Change role…" }));
        const select =
            await screen.findByLabelText<HTMLSelectElement>("New role");
        expect(Array.from(select.options).map((o) => o.textContent)).toContain(
            `Member: ${roleCan("MEMBER")}`,
        );
        fireEvent.change(select, { target: { value: "MEMBER" } });
        await giveReason("Moved to the front desk");
        fireEvent.click(
            lastOf(screen.getAllByRole("button", { name: "Change role" })),
        );

        await waitFor(() => expect(toast.showUndo).toHaveBeenCalled());
        expect(toast.showUndo.mock.calls[0]?.[0]).toBe(
            "Ravi Menon is now Member.",
        );
        expect(
            document
                .querySelector('[data-member="m2"]')
                ?.hasAttribute("data-just-changed"),
        ).toBe(true);
        pressUndo();
        await waitFor(() =>
            expect(people.changeMemberRoleAction).toHaveBeenCalledTimes(2),
        );
        expect(people.changeMemberRoleAction.mock.calls[1]?.[2]).toMatchObject({
            role: "ADMIN",
            reason: "Undo: Moved to the front desk",
        });
    });

    it("an empty team is the empty card", () => {
        render(
            <TeamRows
                organizationId="org_1"
                businessName="Northwind"
                members={[]}
                canChange
            />,
        );
        expect(screen.getByText("No team yet.")).toBeTruthy();
    });
});

describe("Close support access", () => {
    it('says "Open until hh:mm" in India\'s time', () => {
        render(
            <CloseAccess
                organizationId="org_1"
                until="2026-10-19T09:00:00.000Z"
            />,
        );
        expect(screen.getByText("Open until 14:30")).toBeTruthy();
        expect(
            screen.getByRole("button", { name: "Close support access" }),
        ).toBeTruthy();
    });

    it("says nothing about a time it doesn't know", () => {
        render(<CloseAccess organizationId="org_1" />);
        expect(screen.queryByText(/Open until/)).toBeNull();
        expect(sessionUntil("not a date")).toBeNull();
    });
});

describe("History", () => {
    const activity = [
        {
            id: "a1",
            action: "organization.created",
            actorUserId: "user_1",
            actor: "Asha Rao",
            targetType: null,
            outcome: "SUCCESS",
            createdAt: "2026-09-27T05:45:00.000Z",
        },
        {
            id: "a2",
            action: "site.published",
            actorUserId: "system:publisher",
            actor: null,
            targetType: null,
            outcome: "SUCCESS",
            createdAt: "2026-10-16T08:32:00.000Z",
        },
    ];
    const staff = [
        {
            id: "s1",
            action: "member.role.changed",
            actorUserId: "staff_1",
            actor: "Sam",
            reason: "Runs the front desk",
            outcome: "SUCCESS",
            createdAt: "2026-10-12T04:10:00.000Z",
        },
    ];

    it("merges the business's own activity and staff actions, newest first", () => {
        const rows = mergeHistory(activity, staff);
        expect(rows.map((r) => r.id)).toEqual([
            "business-a2",
            "staff-s1",
            "business-a1",
        ]);
        expect(rows[1]).toMatchObject({
            source: "staff",
            detail: "Sam · “Runs the front desk”",
        });
        expect(rows[0]?.detail).toBe("Saroh, automatically");

        render(<HistoryList rows={rows} />);
        const items = screen.getAllByRole("listitem");
        expect(items.map((li) => li.getAttribute("data-source"))).toEqual([
            "business",
            "staff",
            "business",
        ]);
        expect(
            within(lastOf(items.slice(0, 2))).getByText("Saroh's team"),
        ).toBeTruthy();
    });

    it("empty history is the empty card", () => {
        render(<HistoryList rows={[]} />);
        expect(screen.getByText("No history yet.")).toBeTruthy();
    });

    it("a side that couldn't be read is named, never shown as nothing", () => {
        render(<HistoryList rows={[]} missing={["what Saroh's team did"]} />);
        expect(
            screen.getByText(/Couldn't load what Saroh's team did/),
        ).toBeTruthy();
        expect(screen.queryByText("No history yet.")).toBeNull();
    });
});

describe("Notes", () => {
    it("empty notes are the empty card, with a way to add one", () => {
        render(<NotesPanel organizationId="org_1" notes={[]} canWrite />);
        expect(screen.getByText("No notes yet.")).toBeTruthy();
        expect(screen.getByLabelText("Add a note")).toBeTruthy();
    });

    it("adding a note says so", async () => {
        render(<NotesPanel organizationId="org_1" notes={[]} canWrite />);
        fireEvent.change(screen.getByLabelText("Add a note"), {
            target: { value: "Asked why Bookings is missing" },
        });
        fireEvent.click(screen.getByRole("button", { name: "Save note" }));
        await waitFor(() =>
            expect(toast.showSuccess).toHaveBeenCalledWith(
                "Note added.",
                expect.any(String),
            ),
        );
        expect(business.addNoteAction).toHaveBeenCalledWith(
            "org_1",
            "Asked why Bookings is missing",
        );
    });
});
