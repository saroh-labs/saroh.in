import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { OrganizationMember } from "@/lib/organizations/members";

import { TeamScreen } from "./team-screen";

// Hoisted above the imports by vitest, so the screen sees these.
vi.mock("next/navigation", () => ({
    useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
    useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/organizations/member-actions", () => ({
    inviteMember: vi.fn(),
    removeMember: vi.fn(),
    revokeInvitation: vi.fn(),
    updateMemberRole: vi.fn(),
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

function renderPeople(members: OrganizationMember[]) {
    return renderToString(
        createElement(TeamScreen, {
            organizationName: "Rye Bakery",
            members,
            invitations: [],
            sites: [],
            canManage: true,
            canEditRoles: true,
            roles: [],
            catalogue: null,
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
