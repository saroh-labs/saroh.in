import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { OrganizationMember } from "@/lib/organizations/members";
import type { RoleCatalogue } from "@/lib/organizations/roles";

import { TeamScreen } from "./team-screen";

// Hoisted above the imports by vitest, so the screen sees these.
const nav = vi.hoisted(() => ({ search: new URLSearchParams() }));
vi.mock("next/navigation", () => ({
    useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
    useSearchParams: () => nav.search,
}));
vi.mock("@/lib/organizations/member-actions", () => ({
    inviteMember: vi.fn(),
    removeMember: vi.fn(),
    revokeInvitation: vi.fn(),
    updateMemberRole: vi.fn(),
    setMemberExtraActions: vi.fn(),
}));

function member(
    over: Partial<OrganizationMember> & Pick<OrganizationMember, "userId">,
): OrganizationMember {
    return {
        name: null,
        email: `${over.userId}@example.com`,
        role: "MEMBER",
        siteIds: [],
        isSelf: false,
        lastActiveAt: null,
        ...over,
    };
}

function renderPeople(
    members: OrganizationMember[],
    catalogue: RoleCatalogue | null = null,
) {
    return renderToString(
        createElement(TeamScreen, {
            organizationName: "Rye Bakery",
            members,
            invitations: [],
            sites: [],
            canManage: true,
            canEditRoles: true,
            roles: [],
            catalogue,
            myActions: null,
        }),
    );
}

describe("TeamScreen People (F15)", () => {
    const members = [
        member({ userId: "u1", name: "Asha", role: "OWNER", isSelf: true }),
        member({ userId: "u2", name: "Ravi", role: "ADMIN" }),
        member({ userId: "u3", name: "Meera" }),
    ];

    it("has no Extra permissions column, because nothing grants one yet", () => {
        const html = renderPeople(members);
        // The roster rendered — its xl header and every person.
        expect(html).toContain("Person");
        expect(html).toContain("Ravi");
        expect(html).toContain("Meera");
        expect(html).not.toContain("Extra permissions");
        // No row says "none" for a column that isn't there.
        expect(html).not.toContain(">None<");
        expect(html).not.toContain("—</span>");
    });

    it("lays the wide roster out in three columns: person, role, actions", () => {
        const html = renderPeople(members);
        expect(html).toContain(
            "xl:grid-cols-[minmax(170px,1.3fr)_112px_150px]",
        );
        expect(html).not.toContain("_112px_minmax(0,1fr)_150px");
    });
});

describe("TeamScreen People: extra permissions (F17)", () => {
    const catalogue: RoleCatalogue = {
        groups: ["sell"],
        capabilities: [
            { action: "order:refund", group: "sell", label: "Refund orders" },
        ],
    };
    const people = (extras: string[]) => [
        member({ userId: "u1", name: "Asha", role: "OWNER", isSelf: true }),
        member({ userId: "u3", name: "Meera", extraActions: extras }),
    ];

    it("shows the column once one person has an extra, with its name", () => {
        const html = renderPeople(people(["order:refund"]), catalogue);
        expect(html).toContain("Extra permissions");
        expect(html).toContain("Refund orders");
        expect(html).toContain(
            "xl:grid-cols-[minmax(170px,1.3fr)_112px_minmax(0,210px)_150px]",
        );
        // Everyone else says none, in words for a screen reader.
        expect(html).toContain("No extra permissions");
        // Never a code.
        expect(html).not.toContain("order:refund");
    });

    it("hides the column again when the last extra is removed", () => {
        const html = renderPeople(people([]), catalogue);
        expect(html).not.toContain("Extra permissions");
        expect(html).toContain(
            "xl:grid-cols-[minmax(170px,1.3fr)_112px_150px]",
        );
    });

    it("names the Edit button for the role and the permissions", () => {
        const html = renderPeople(people([]), catalogue);
        expect(html).toContain("role and permissions");
    });
});

describe("TeamScreen: who may change what", () => {
    const people = [
        member({ userId: "u1", name: "Asha", role: "OWNER" }),
        member({ userId: "u2", name: "Suresh", isSelf: true }),
    ];
    const render = (view: string) => {
        nav.search = new URLSearchParams(view ? { view } : {});
        try {
            return renderToString(
                createElement(TeamScreen, {
                    organizationName: "Rye Bakery",
                    members: people,
                    invitations: [],
                    sites: [],
                    // A custom role holding member:role:update only.
                    canManage: false,
                    canEditRoles: true,
                    roles: [],
                    catalogue: null,
                    myActions: null,
                }),
            );
        } finally {
            nav.search = new URLSearchParams();
        }
    };

    it("doesn't call Roles read-only for someone who may edit roles", () => {
        expect(render("roles")).not.toContain(
            "Only owners and admins can change this",
        );
    });

    it("still says People is theirs to ask about", () => {
        expect(render("")).toContain(
            "Only owners and admins can change this. Ask Asha",
        );
    });
});

describe("TeamScreen at the plan's team limit (UX-028)", () => {
    const people = [
        member({ userId: "u1", name: "Asha", role: "OWNER", isSelf: true }),
    ];
    const invite = {
        id: "inv_1",
        email: "meera@example.com",
        role: "MEMBER" as const,
        roleKey: "MEMBER",
        siteIds: [],
        status: "PENDING",
        expiresAt: "2026-10-14T00:00:00.000Z",
        createdAt: "2026-10-07T00:00:00.000Z",
    };
    const renderAt = (teamLimit: {
        full: boolean;
        why: string;
        reviewersFull?: boolean;
    }) =>
        renderToString(
            createElement(TeamScreen, {
                organizationName: "Rye Bakery",
                members: people,
                invitations: [invite] as never,
                sites: [],
                canManage: true,
                canEditRoles: true,
                roles: [],
                catalogue: null,
                myActions: null,
                teamLimit,
            }),
        );

    it("says what the cap counts, owner and waiting invites included", () => {
        const html = renderAt({ full: true, why: "Team is full" });
        expect(html).toContain("Just you · 1 invite waiting");
    });

    it("still invites someone view-only while seats are full", () => {
        expect(renderAt({ full: true, why: "Team is full" })).toContain(
            "Invite someone view-only",
        );
        expect(
            renderAt({ full: true, why: "Team is full", reviewersFull: true }),
        ).toContain("Team is full");
        expect(renderAt({ full: false, why: "" })).toContain("Invite someone");
    });
});

// DEC-105: the line counts seats by what each person can do, as the API
// says, and view-only people apart.
describe("TeamScreen seats and view-only people (DEC-105)", () => {
    it("counts a view-only custom role apart from the seats", () => {
        const html = renderToString(
            createElement(TeamScreen, {
                organizationName: "Rye Bakery",
                members: [
                    member({
                        userId: "u1",
                        name: "Asha",
                        role: "OWNER",
                        isSelf: true,
                        usesSeat: true,
                    }),
                    member({
                        userId: "u2",
                        name: "Kiran",
                        roleKey: "looker",
                        usesSeat: false,
                    }),
                    member({
                        userId: "u3",
                        name: "Dev",
                        roleKey: "front-desk",
                        usesSeat: true,
                    }),
                ],
                invitations: [],
                sites: [],
                canManage: true,
                canEditRoles: true,
                roles: [],
                catalogue: null,
                myActions: null,
                teamLimit: { full: false, why: "" },
            }),
        );
        expect(html).toContain(
            "2 people including you · 1 view-only person, no seat",
        );
    });
});
