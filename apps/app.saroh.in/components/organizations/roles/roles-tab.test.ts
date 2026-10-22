import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { Role, RoleCatalogue } from "@/lib/organizations/roles";

import { aboveRoleNote, NOT_YOURS_TO_GIVE, viewerHolds } from "./role-reach";
import { RolesTab } from "./roles-tab";

vi.mock("next/navigation", () => ({
    useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));
vi.mock("@/lib/organizations/role-actions", () => ({
    createRole: vi.fn(),
    deleteRole: vi.fn(),
    updateRole: vi.fn(),
}));

const CATALOGUE: RoleCatalogue = {
    groups: ["team", "sell", "money"],
    capabilities: [
        {
            action: "member:role:update",
            group: "team",
            label: "Change what a role can do",
        },
        { action: "order:read", group: "sell", label: "See orders" },
        { action: "store:write", group: "sell", label: "Change locations" },
        {
            action: "payment:manage",
            group: "money",
            label: "Manage payments",
        },
    ],
};

/** The plan's Manager: may edit roles, holds no money. */
const MANAGER_ACTIONS = ["member:role:update", "order:read", "store:write"];

function invented(key: string, label: string, actions: string[]): Role {
    return {
        key,
        label,
        actions,
        ringTone: "neutral",
        system: false,
        members: 0,
    };
}

/** Renders Roles with `first` open (the first invented role is shown). */
function render(first: Role, myActions: string[] | null) {
    return renderToString(
        createElement(RolesTab, {
            roles: [first],
            catalogue: CATALOGUE,
            canEdit: true,
            myActions,
            organizationName: "Rye Bakery",
            builtInBlurb: {},
            builtInPlain: {},
        }),
    );
}

/** The switch for one permission on the open role, as rendered. */
function switchFor(html: string, roleKey: string, action: string): string {
    const id = `perm-${roleKey}-${action}`;
    const match = new RegExp(`<button[^>]*id="${id}"[^>]*>`).exec(html);
    if (!match) throw new Error(`no switch for ${action}`);
    return match[0];
}

describe("RolesTab within reach (F19)", () => {
    it("reads a role the viewer may change, and offers Edit role", () => {
        const html = render(
            invented("counter", "Counter", ["order:read"]),
            MANAGER_ACTIONS,
        );
        // The panel is read: its switches show what is saved. Changing
        // them, and the name, is the side sheet Edit role opens, where a
        // permission the viewer lacks is locked with the reason.
        for (const action of ["order:read", "store:write", "payment:manage"]) {
            expect(switchFor(html, "counter", action)).toContain('disabled=""');
        }
        expect(html).toContain("Edit role");
        expect(html).toContain("Remove role");
        expect(html).not.toContain('id="role-name-counter"');
        expect(NOT_YOURS_TO_GIVE).toBe(
            "You don't have this yourself, so you can't give it.",
        );
    });

    it("shows a role above the viewer read-only, saying what it has that they don't", () => {
        const html = render(
            invented("senior", "Senior", ["order:read", "payment:manage"]),
            MANAGER_ACTIONS,
        );
        for (const action of ["order:read", "store:write", "payment:manage"]) {
            expect(switchFor(html, "senior", action)).toContain('disabled=""');
        }
        expect(html).not.toContain("Edit role");
        expect(html).not.toContain("Remove role");
        expect(html).toContain(
            aboveRoleNote(["Manage payments"]).replace(/'/g, "&#x27;"),
        );
    });

    it("holds nothing back from an Owner or Admin, or when the viewer is unknown", () => {
        for (const mine of [null, MANAGER_ACTIONS.concat("payment:manage")]) {
            const html = render(
                invented("senior", "Senior", ["order:read", "payment:manage"]),
                mine,
            );
            // Nothing it has is beyond them, so it is theirs to edit.
            expect(html).toContain("Edit role");
            expect(html).toContain("Remove role");
        }
    });
});

describe("changing the Saroh plan is the owner's alone (DEC-131, amended 2026-10-11)", () => {
    // The API's catalogue is what a role may be given, so it lists reading
    // the plan and never changing it (`grantableCapabilities`).
    const PLAN_CATALOGUE: RoleCatalogue = {
        groups: ["money"],
        capabilities: [
            {
                action: "billing:read",
                group: "money",
                label: "See the Saroh plan and invoices",
            },
        ],
    };
    const open = (role: Role, myActions: string[] | null) =>
        renderToString(
            createElement(RolesTab, {
                roles: [role],
                catalogue: PLAN_CATALOGUE,
                canEdit: true,
                myActions,
                organizationName: "Rye Bakery",
                builtInBlurb: {},
                builtInPlain: {},
            }),
        );

    it("offers a made-up role reading the plan, and no switch for changing it", () => {
        const html = open(invented("finance", "Finance", ["billing:read"]), [
            "member:role:update",
            "billing:read",
            "billing:manage",
        ]);
        expect(switchFor(html, "finance", "billing:read")).toContain(
            'aria-checked="true"',
        );
        expect(html).not.toContain("perm-finance-billing:manage");
        expect(html).not.toContain("Change the Saroh plan");
    });

    it("ticks reading the plan for the Admin, and shows no tick for changing it", () => {
        const admin: Role = {
            key: "ADMIN",
            label: "Admin",
            // As `GET …/roles` lists the built-in: no `billing:manage`.
            actions: ["member:role:update", "billing:read"],
            ringTone: "clay",
            system: true,
            members: 1,
        };
        const html = open(admin, null);
        expect(switchFor(html, "ADMIN", "billing:read")).toContain(
            'aria-checked="true"',
        );
        expect(html).not.toContain("perm-ADMIN-billing:manage");
        expect(html).not.toContain("Change the Saroh plan");
    });
});

describe("viewerHolds", () => {
    it("answers from the viewer's actions, and yes to everything when unknown", () => {
        expect(viewerHolds(["order:read"])("order:read")).toBe(true);
        expect(viewerHolds(["order:read"])("payment:manage")).toBe(false);
        expect(viewerHolds(null)("payment:manage")).toBe(true);
    });

    it("names what a role above the viewer has, in the owner's words", () => {
        expect(aboveRoleNote(["Manage payments", "See invoices"])).toBe(
            "This role can do things you can't (Manage payments, See invoices), so only someone who can do all of them may change it.",
        );
        expect(aboveRoleNote([])).toBe(
            "This role can do things you can't, so only someone who can do all of them may change it.",
        );
    });
});

describe("RolesTab where the plan leaves roles of your own off (UX-030)", () => {
    const lock = {
        line: "Roles of your own come with Plan B.",
        cta: "See Plan B",
        href: "/settings/billing/plans?plan=b",
    };
    const renderLocked = (rolesLock: typeof lock | null) =>
        renderToString(
            createElement(RolesTab, {
                roles: [invented("clerk", "Clerk", [])],
                catalogue: CATALOGUE,
                canEdit: true,
                myActions: null,
                organizationName: "Rye Bakery",
                builtInBlurb: {},
                builtInPlain: {},
                rolesLock,
            }),
        );

    it("puts the way up where New role was, rather than a refused dialog", () => {
        const html = renderLocked(lock);
        expect(html).toContain("Roles of your own come with Plan B.");
        expect(html).toContain('href="/settings/billing/plans?plan=b"');
        expect(html).toContain("See Plan B");
        expect(html).not.toContain("New role");
    });

    it("offers New role when the plan has them", () => {
        const html = renderLocked(null);
        expect(html).toContain("New role");
        expect(html).not.toContain("Roles of your own come with");
    });
});
