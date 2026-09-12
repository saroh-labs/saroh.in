import { describe, expect, it } from "vitest";

import type { NavGroup, NavRole } from "@/components/shared/nav-items";
import {
    NAV_GROUPS,
    filterNavGroups,
    filterNavGroupsByRole,
    navFor,
    navRoleCan,
} from "@/components/shared/nav-items";

/**
 * What each role is OFFERED (#313).
 *
 * The rail is not a permission boundary — every destination authorizes itself
 * on the server, and typing an address still meets the same refusal. It is a
 * description of the workspace someone has, and it was describing one they did
 * not: a REVIEWER invited to look at one website was offered Notifications,
 * Organization, People, Modules and Providers, four of which answer "you do not
 * have access to this" and one of which answered with the payment and messaging
 * providers the business runs on.
 *
 * These tests are a mirror of `organization-policy.ts`, so they are also the
 * place a drift shows up: if a role gains or loses an action in the API, the
 * expectations here are what force someone to look at the navigation too.
 */

const SITES = [
    { id: "site_1", name: "Northwind Supply" },
    { id: "site_2", name: "Monsoon Stock-Up" },
];

/** Every href a role is offered, at any depth. */
function hrefs(groups: NavGroup[]): string[] {
    const out: string[] = [];
    const walk = (
        children: readonly { href?: string; children?: readonly unknown[] }[],
    ) => {
        for (const child of children) {
            if (child.href) out.push(child.href);
            if (child.children) {
                walk(
                    child.children as readonly {
                        href?: string;
                        children?: readonly unknown[];
                    }[],
                );
            }
        }
    };
    for (const group of groups) {
        for (const item of group.items) {
            out.push(item.href);
            if (item.children) walk(item.children);
        }
    }
    return out;
}

/**
 * The module keys the API would hand each role.
 *
 * Availability is computed PER ACTOR on the server — a module names the action
 * it needs, and a role without it gets no key (#274). So this is not "every
 * module the business bought": for a reviewer, whose only power is reading a
 * site, WEBSITE is the only module that can come back at all.
 *
 * Which is the division of labour these tests describe. Module availability
 * answers "does this business have this capability, and may this person use
 * it"; the role filter answers "may this person open THIS destination", for the
 * core chrome that no module gates. Neither can answer the other's question,
 * and the nav needs both.
 */
const AVAILABLE_TO = {
    OWNER: [
        "WEBSITE",
        "CRM",
        "APPOINTMENTS",
        "COMMERCE",
        "PAYMENTS",
        "COMMUNICATIONS",
        "AUTOMATIONS",
        "INSIGHTS",
    ],
    ADMIN: ["WEBSITE", "CRM", "APPOINTMENTS", "COMMERCE", "INSIGHTS"],
    MEMBER: ["WEBSITE"],
    REVIEWER: ["WEBSITE"],
} as const;

const ROLES: readonly NavRole[] = ["OWNER", "ADMIN", "MEMBER", "REVIEWER"];

describe("navRoleCan", () => {
    it("gives an owner and an admin everything the nav asks about", () => {
        for (const role of ["OWNER", "ADMIN"] as const) {
            expect(navRoleCan(role, "site:create")).toBe(true);
            expect(navRoleCan(role, "provider:read")).toBe(true);
            expect(navRoleCan(role, "notification:read")).toBe(true);
        }
    });

    it("holds a member to the read-only floor", () => {
        // The policy's READ_ONLY_ACTIONS: the org, its roster, its modules and
        // its sites. Not its notifications, and not its providers.
        expect(navRoleCan("MEMBER", "site:read")).toBe(true);
        expect(navRoleCan("MEMBER", "member:read")).toBe(true);
        expect(navRoleCan("MEMBER", "module:read")).toBe(true);
        expect(navRoleCan("MEMBER", "site:create")).toBe(false);
        expect(navRoleCan("MEMBER", "section:write")).toBe(false);
        expect(navRoleCan("MEMBER", "notification:read")).toBe(false);
        expect(navRoleCan("MEMBER", "provider:read")).toBe(false);
    });

    it("holds a reviewer to one thing: reading a site", () => {
        // Narrower than MEMBER rather than beneath it (#276). The roster, the
        // modules and the org's own settings are not what inviting someone to
        // check your copy means.
        expect(navRoleCan("REVIEWER", "site:read")).toBe(true);
        expect(navRoleCan("REVIEWER", "member:read")).toBe(false);
        expect(navRoleCan("REVIEWER", "module:read")).toBe(false);
        expect(navRoleCan("REVIEWER", "org:settings:read")).toBe(false);
        expect(navRoleCan("REVIEWER", "section:write")).toBe(false);
    });

    it("fails open when the role is not known", () => {
        // A chrome that empties itself because one read failed is worse than
        // one that offers a destination the server then refuses — the same
        // convention `filterNavGroups` uses for unknown module availability.
        for (const action of ["site:create", "provider:read"] as const) {
            expect(navRoleCan(null, action)).toBe(true);
        }
    });
});

describe("what each role is offered", () => {
    it("offers an owner the whole workspace", () => {
        const offered = hrefs(
            navFor({
                role: "OWNER",
                moduleKeys: AVAILABLE_TO.OWNER,
                sites: SITES,
            }),
        );
        expect(offered).toContain("/settings/providers");
        expect(offered).toContain("/notifications");
        expect(offered).toContain("/sites/new");
        expect(offered).toContain("/sites/site_1");
    });

    it("does not offer a member what it would be refused", () => {
        const offered = hrefs(
            navFor({
                role: "MEMBER",
                moduleKeys: AVAILABLE_TO.MEMBER,
                sites: SITES,
            }),
        );
        expect(offered).toContain("/settings/people");
        expect(offered).toContain("/settings/modules");
        expect(offered).not.toContain("/notifications");
        expect(offered).not.toContain("/settings/providers");
        expect(offered).not.toContain("/settings/organization");
        // A member reads sites and authors none.
        expect(offered).not.toContain("/sites/new");
        expect(offered).not.toContain("/sites/site_1");
        expect(offered).toContain("/sites/site_1/review");
    });

    it("offers a reviewer their site and nothing about the business", () => {
        const offered = hrefs(
            navFor({
                role: "REVIEWER",
                moduleKeys: AVAILABLE_TO.REVIEWER,
                sites: [SITES[0]],
            }),
        );
        expect(offered).toEqual([
            "/",
            "/sites",
            "/sites/site_1/review",
            "/sites/site_1/posts",
        ]);
    });

    it("leaves no heading standing over nothing", () => {
        const groups = navFor({
            role: "REVIEWER",
            moduleKeys: AVAILABLE_TO.REVIEWER,
            sites: SITES,
        });
        // "Workspace" held five destinations, all of them refused. A heading
        // over an empty list names something the reader does not have.
        expect(groups.map((g) => g.label)).toEqual([undefined, "Presence"]);
        for (const group of groups)
            expect(group.items.length).toBeGreaterThan(0);
    });
});

describe("the site tree", () => {
    it("takes an author to the three places the work happens", () => {
        const offered = hrefs(
            navFor({
                role: "ADMIN",
                moduleKeys: ["WEBSITE"],
                sites: [SITES[0]],
            }),
        );
        expect(offered).toContain("/sites/site_1");
        expect(offered).toContain("/sites/site_1/posts");
        expect(offered).toContain("/sites/site_1/settings");
    });

    it("takes a reader to the screen built for reading", () => {
        const offered = hrefs(
            navFor({
                role: "REVIEWER",
                moduleKeys: ["WEBSITE"],
                sites: [SITES[0]],
            }),
        );
        // `/sites/:id` is the editor and redirects them here anyway, so "Pages"
        // was a label for a screen they never saw. Settings is left out for the
        // opposite reason: it opens, and then says they may change nothing.
        expect(offered).toContain("/sites/site_1/review");
        expect(offered).not.toContain("/sites/site_1");
        expect(offered).not.toContain("/sites/site_1/settings");
    });

    it("names an untitled site rather than showing a blank row", () => {
        const groups = navFor({
            role: "OWNER",
            moduleKeys: ["WEBSITE"],
            sites: [{ id: "s", name: "   " }],
        });
        const website = groups
            .flatMap((g) => g.items)
            .find((i) => i.href === "/sites");
        expect(website?.children?.at(0)?.label).toBe("Untitled site");
    });
});

describe("what the two filters each answer", () => {
    it("keeps role and availability separate", () => {
        // A business with no modules yet still has an owner who may reach
        // Settings; a business with every module still has a reviewer who may
        // not. Neither filter can answer the other's question.
        const noModules = filterNavGroups(NAV_GROUPS, []);
        expect(hrefs(filterNavGroupsByRole(noModules, "OWNER"))).toContain(
            "/settings/modules",
        );
        expect(
            hrefs(filterNavGroupsByRole(NAV_GROUPS, "REVIEWER")),
        ).not.toContain("/settings/modules");
    });

    it("shows the full nav to every role when availability is unknown", () => {
        // `null` is "we could not find out", and it must not empty the shell.
        for (const role of ROLES) {
            const groups = navFor({ role, moduleKeys: null, sites: [] });
            expect(hrefs(groups)).toContain("/sites");
        }
    });
});
