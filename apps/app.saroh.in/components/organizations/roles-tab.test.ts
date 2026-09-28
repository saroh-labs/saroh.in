import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { Role, RoleCatalogue } from "@/lib/organizations/roles";

import {
    aboveRoleNote,
    NOT_YOURS_TO_GIVE,
    RolesTab,
    viewerHolds,
} from "./roles-tab";

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
        { action: "store:write", group: "sell", label: "Change storefronts" },
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
    it("locks a permission the viewer doesn't hold, with the reason", () => {
        const html = render(
            invented("counter", "Counter", ["order:read"]),
            MANAGER_ACTIONS,
        );
        expect(switchFor(html, "counter", "payment:manage")).toContain(
            'disabled=""',
        );
        expect(html).toContain(NOT_YOURS_TO_GIVE.replace(/'/g, "&#x27;"));
        // What they hold stays theirs to give or take away.
        expect(switchFor(html, "counter", "store:write")).not.toContain(
            'disabled=""',
        );
        expect(switchFor(html, "counter", "order:read")).not.toContain(
            'disabled=""',
        );
        // And the role itself can be renamed.
        expect(html).toContain('id="role-name-counter"');
    });

    it("shows a role above the viewer read-only, saying what it has that they don't", () => {
        const html = render(
            invented("senior", "Senior", ["order:read", "payment:manage"]),
            MANAGER_ACTIONS,
        );
        for (const action of ["order:read", "store:write", "payment:manage"]) {
            expect(switchFor(html, "senior", action)).toContain('disabled=""');
        }
        expect(html).not.toContain('id="role-name-senior"');
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
            expect(switchFor(html, "senior", "payment:manage")).not.toContain(
                'disabled=""',
            );
            expect(html).not.toContain(
                NOT_YOURS_TO_GIVE.replace(/'/g, "&#x27;"),
            );
        }
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
