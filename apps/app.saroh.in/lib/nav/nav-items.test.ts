import { describe, expect, it } from "vitest";

import type { NavGroup, NavRole } from "@/components/shared/nav-items";
import {
    NAV_GROUPS,
    SETTINGS_PAGES,
    filterNavGroups,
    filterNavGroupsByRole,
    isNavChildCurrent,
    isNavItemActive,
    isNavSectionActive,
    mayOpenSettingsPage,
    navCan,
    navCountFor,
    navFor,
    navPathname,
    navRoleCan,
    navRowsForModule,
    settingsPagesFor,
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
    // The diary and the people on it (DEC-020): a Member holds booking:read
    // and contact:read, what APPOINTMENTS and CRM ask for.
    MEMBER: ["WEBSITE", "APPOINTMENTS", "CRM"],
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

    it("offers memberships, invoices, courses and packs to owners and admins only", () => {
        // ADR-007: who owes what is not in the Member floor, and a Reviewer
        // checks a website, not the books.
        for (const action of [
            "subscription:read",
            "invoice:read",
            "course:read",
            "pack:read",
        ] as const) {
            expect(navRoleCan("OWNER", action)).toBe(true);
            expect(navRoleCan("ADMIN", action)).toBe(true);
            expect(navRoleCan("MEMBER", action)).toBe(false);
            expect(navRoleCan("REVIEWER", action)).toBe(false);
        }
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

/** The settings tabs an actor is offered, by address. */
const tabsFor = (actor: Parameters<typeof settingsPagesFor>[0]) =>
    settingsPagesFor(actor).map((page) => page.href);

describe("what each role is offered", () => {
    it("offers an owner the whole workspace", () => {
        const offered = hrefs(
            navFor({
                role: "OWNER",
                moduleKeys: AVAILABLE_TO.OWNER,
                sites: SITES,
            }),
        );
        // Settings is one rail row; its pages are the settings screen's tabs,
        // and Notifications is in the top bar (2026-09-25).
        expect(offered).toContain("/settings");
        expect(offered).not.toContain("/notifications");
        expect(tabsFor({ role: "OWNER" })).toEqual([
            "/settings/organization",
            "/settings/people",
            "/settings/modules",
            "/settings/billing",
            "/settings/profile",
            "/settings/activity",
            "/settings/providers",
        ]);
        expect(offered).toContain("/sites/site_1");
        expect(offered).toContain("/sites/site_2");
    });

    it("offers Sell › Stock only while the business tracks stock (#527)", () => {
        const offered = (stockTracked: boolean | null) =>
            hrefs(
                navFor({
                    role: "OWNER",
                    moduleKeys: AVAILABLE_TO.OWNER,
                    stockTracked,
                }),
            );
        expect(offered(true)).toContain("/commerce/stock");
        // Unknown fails open, like the rest of the nav.
        expect(offered(null)).toContain("/commerce/stock");
        expect(offered(false)).not.toContain("/commerce/stock");
        expect(offered(false)).toContain("/commerce/products");
        // A role that can't read the catalogue can't read stock either.
        expect(
            hrefs(
                navFor({
                    role: "MEMBER",
                    actions: ["order:stage"],
                    moduleKeys: AVAILABLE_TO.OWNER,
                    stockTracked: true,
                }),
            ),
        ).not.toContain("/commerce/stock");
    });

    it("offers a Storefront team holder Sell with Orders alone (DEC-074)", () => {
        const storefrontTeam = [
            "org:read",
            "member:read",
            "module:read",
            "media:read",
            "store:read",
            "product-review:read",
            "order:stage",
        ];
        const groups = navFor({
            role: "MEMBER",
            roleKey: "storefront-team",
            actions: storefrontTeam,
            moduleKeys: AVAILABLE_TO.OWNER,
            stockTracked: true,
        });
        const offered = hrefs(groups);
        expect(offered).toContain("/commerce/orders");
        for (const other of [
            "/commerce/products",
            "/commerce/stock",
            "/commerce/storefronts",
            "/commerce",
        ]) {
            expect(offered).not.toContain(other);
        }
        // Sell lands on Orders, not on the Storefronts it no longer offers.
        const sell = groups
            .flatMap((g) => g.items)
            .find((i) => i.label === "Sell");
        expect(sell?.href).toBe("/commerce/orders");
        expect(sell?.children?.map((c) => c.href)).toEqual([
            "/commerce/orders",
        ]);
        // The same permissions in any other role keep Sell as it was.
        expect(
            hrefs(
                navFor({
                    role: "MEMBER",
                    roleKey: "front-desk",
                    actions: storefrontTeam,
                    moduleKeys: AVAILABLE_TO.OWNER,
                    stockTracked: true,
                }),
            ),
        ).toContain("/commerce/products");
    });

    it("offers a new site only to a business that has none (ADR-006)", () => {
        const offeredWith = (sites: typeof SITES) =>
            hrefs(
                navFor({
                    role: "OWNER",
                    moduleKeys: AVAILABLE_TO.OWNER,
                    sites,
                }),
            );
        expect(offeredWith([])).toContain("/sites/new");
        expect(offeredWith([SITES[0]])).not.toContain("/sites/new");
        // A business that already has two keeps both, and still makes no more.
        expect(offeredWith(SITES)).not.toContain("/sites/new");
    });

    it("names the row Locations only once there are several (ADR-010, DEC-069)", () => {
        const label = (storefronts?: number | null) =>
            navFor({
                role: "OWNER",
                moduleKeys: AVAILABLE_TO.OWNER,
                storefronts,
            })
                .flatMap((g) => g.items)
                .flatMap((i) => [i, ...(i.children ?? [])])
                .find((row) => row.href === "/commerce/locations")?.label;
        expect(label()).toBe("Location");
        expect(label(null)).toBe("Location");
        expect(label(1)).toBe("Location");
        expect(label(2)).toBe("Locations");
    });

    it("does not offer a member what it would be refused", () => {
        const offered = hrefs(
            navFor({
                role: "MEMBER",
                moduleKeys: AVAILABLE_TO.MEMBER,
                sites: SITES,
            }),
        );
        expect(offered).toContain("/settings");
        expect(tabsFor({ role: "MEMBER" })).toEqual([
            "/settings/people",
            "/settings/modules",
            "/settings/profile",
        ]);
        expect(navCan({ role: "MEMBER" }, "notification:read")).toBe(false);
        // A member reads sites and authors none.
        expect(offered).not.toContain("/sites/new");
        expect(offered).not.toContain("/sites/site_1");
        expect(offered).toContain("/sites/site_1/review");
    });

    it("offers a member the diary and its people, not leads or money", () => {
        const offered = hrefs(
            navFor({
                role: "MEMBER",
                moduleKeys: AVAILABLE_TO.MEMBER,
                sites: SITES,
            }),
        );
        expect(offered).toContain("/bookings");
        expect(offered).toContain("/contacts");
        expect(offered).not.toContain("/leads");
        expect(offered).not.toContain("/pipeline");
        expect(offered).not.toContain("/billing/invoices");
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

    it("offers Home › Calendar to everyone who reads the business, not a reviewer", () => {
        for (const role of ["OWNER", "ADMIN", "MEMBER"] as const) {
            expect(
                hrefs(navFor({ role, moduleKeys: AVAILABLE_TO[role] })),
            ).toContain("/calendar");
        }
        expect(
            hrefs(
                navFor({ role: "REVIEWER", moduleKeys: AVAILABLE_TO.REVIEWER }),
            ),
        ).not.toContain("/calendar");
        // A role the business invented follows its own permissions.
        expect(
            hrefs(
                navFor({
                    role: "MEMBER",
                    actions: ["site:read"],
                    moduleKeys: null,
                }),
            ),
        ).not.toContain("/calendar");
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
        expect(offered).toContain("/sites/site_1/pages");
        expect(offered).toContain("/sites/site_1");
        expect(offered).toContain("/sites/site_1/posts");
        expect(offered).toContain("/sites/site_1/settings");
    });

    it("is left out of the rail, where Website is one row", () => {
        // The rail and the drawer ask without sites; only the palette hangs
        // them. A merchant who can create a site is offered it on the Website
        // screen, not as a child row.
        const website = navFor({ role: "OWNER", moduleKeys: ["WEBSITE"] })
            .flatMap((g) => g.items)
            .find((i) => i.href === "/sites");
        expect(website).toBeDefined();
        expect(website?.children ?? []).toHaveLength(0);
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
            "/settings",
        );
        expect(
            hrefs(filterNavGroupsByRole(NAV_GROUPS, "REVIEWER")),
        ).not.toContain("/settings");
    });

    it("shows the full nav to every role when availability is unknown", () => {
        // `null` is "we could not find out", and it must not empty the shell.
        for (const role of ROLES) {
            const groups = navFor({ role, moduleKeys: null, sites: [] });
            expect(hrefs(groups)).toContain("/sites");
        }
    });
});

/**
 * Roles a business invents. The rail renders what the API allows, because a
 * map compiled into the frontend only knows the four roles that ship.
 */
describe("navFor — an invented role", () => {
    const sites: { id: string; name: string }[] = [];
    const hrefsOf = (groups: ReturnType<typeof navFor>) =>
        groups.flatMap((g) => g.items.map((i) => i.href));

    it("uses the actor's own permissions over their built-in role", () => {
        // `role` is MEMBER — what an invented role maps to — but this business
        // granted the role the roster and the modules screen, and neither the
        // business details nor the providers.
        const hrefs = hrefsOf(
            navFor({
                role: "MEMBER",
                actions: ["member:read", "module:read"],
                moduleKeys: null,
                sites,
            }),
        );
        expect(hrefs).toContain("/settings");
        expect(
            tabsFor({
                role: "MEMBER",
                actions: ["member:read", "module:read"],
            }),
        ).toEqual([
            "/settings/people",
            "/settings/modules",
            "/settings/profile",
        ]);
    });

    it("can offer MORE than the floor the role maps to", () => {
        const hrefs = hrefsOf(
            navFor({
                role: "MEMBER",
                actions: ["org:settings:read", "member:read"],
                moduleKeys: null,
                sites,
            }),
        );
        // Business details is OWNER/ADMIN in the shipped map. A business may
        // grant it to a role it invented, and the tabs have to follow.
        expect(hrefs).toContain("/settings");
        expect(
            tabsFor({
                role: "MEMBER",
                actions: ["org:settings:read", "member:read"],
            }),
        ).toEqual([
            "/settings/organization",
            "/settings/people",
            "/settings/profile",
        ]);
    });

    it("falls back to the role map when permissions were not loaded", () => {
        const withNull = navFor({
            role: "OWNER",
            actions: null,
            moduleKeys: null,
            sites,
        });
        const without = navFor({ role: "OWNER", moduleKeys: null, sites });
        expect(withNull).toEqual(without);
    });
});

/**
 * Orders across the business are gated on `order:read` or `order:stage`
 * (DEC-024: a Member moves kitchen stages, and gets the kitchen's view of the
 * list). The rail has to agree with the API, or someone clicks a row that
 * answers them with a refusal.
 */
describe("Sell → Orders is offered to roles that read orders or move them", () => {
    const childHrefs = (groups: ReturnType<typeof navFor>) =>
        groups.flatMap((g) =>
            g.items.flatMap((i) => (i.children ?? []).map((c) => c.href)),
        );
    const sites: { id: string; name: string }[] = [];

    it.each(["OWNER", "ADMIN", "MEMBER"] as const)(
        "offers it to %s",
        (role) => {
            expect(
                childHrefs(navFor({ role, moduleKeys: null, sites })),
            ).toContain("/commerce/orders");
        },
    );

    it("does not offer it to a REVIEWER", () => {
        expect(
            childHrefs(navFor({ role: "REVIEWER", moduleKeys: null, sites })),
        ).not.toContain("/commerce/orders");
    });

    it("offers it to a Member through order:stage alone", () => {
        const hrefs = childHrefs(
            navFor({
                role: "MEMBER",
                actions: ["org:read", "store:read", "order:stage"],
                moduleKeys: null,
                sites,
            }),
        );
        expect(hrefs).toContain("/commerce/orders");
    });

    it("does not offer it to an invented role with neither", () => {
        const hrefs = childHrefs(
            navFor({
                role: "MEMBER",
                actions: ["store:read"],
                moduleKeys: null,
                sites,
            }),
        );
        expect(hrefs).not.toContain("/commerce/orders");
    });

    it("offers it to an invented role that was granted it", () => {
        const hrefs = childHrefs(
            navFor({
                role: "MEMBER",
                actions: ["order:read", "store:read"],
                moduleKeys: null,
                sites,
            }),
        );
        expect(hrefs).toContain("/commerce/orders");
    });
});

describe("the storefront rows follow store:read", () => {
    const childHrefs = (groups: ReturnType<typeof navFor>) =>
        groups.flatMap((g) =>
            g.items.flatMap((i) => (i.children ?? []).map((c) => c.href)),
        );
    const sites: { id: string; name: string }[] = [];
    // Customers follows contact:read (matrix W-1, B16), below.
    const storefront = ["/commerce/products", "/commerce/locations"];

    it("still offers products and the storefront to a Member, whose floor includes it", () => {
        const hrefs = childHrefs(
            navFor({ role: "MEMBER", moduleKeys: null, sites }),
        );
        expect(hrefs).toContain("/commerce/products");
        expect(hrefs).toContain("/commerce/locations");
    });

    it("offers a store:read role both storefront rows", () => {
        const hrefs = childHrefs(
            navFor({
                role: "MEMBER",
                actions: ["store:read"],
                moduleKeys: null,
                sites,
            }),
        );
        for (const h of storefront) expect(hrefs).toContain(h);
    });

    it("hides them from an invented role granted orders but not storefronts", () => {
        const hrefs = childHrefs(
            navFor({
                role: "MEMBER",
                actions: ["order:read"],
                moduleKeys: null,
                sites,
            }),
        );
        expect(hrefs).toContain("/commerce/orders");
        for (const h of storefront) expect(hrefs).not.toContain(h);
    });
});

describe("each Sell row follows its own read (matrix W-1, B16)", () => {
    const childHrefs = (groups: ReturnType<typeof navFor>) =>
        groups.flatMap((g) =>
            g.items.flatMap((i) => (i.children ?? []).map((c) => c.href)),
        );
    const sites: { id: string; name: string }[] = [];

    it("offers Customers on contact:read, a Member's floor included", () => {
        // The list is the business's contacts (DEC-041); the API serves it
        // to `contact:read`, and leaves its order columns to `order:read`.
        expect(
            childHrefs(navFor({ role: "MEMBER", moduleKeys: null, sites })),
        ).toContain("/commerce/customers");
        expect(
            childHrefs(
                navFor({
                    role: "MEMBER",
                    actions: ["store:read", "order:stage", "contact:read"],
                    moduleKeys: null,
                    sites,
                }),
            ),
        ).toContain("/commerce/customers");
    });

    it("withholds Customers from a role without contact:read, whatever else it holds", () => {
        expect(
            childHrefs(
                navFor({
                    role: "MEMBER",
                    actions: ["store:read", "order:read", "order:create"],
                    moduleKeys: null,
                    sites,
                }),
            ),
        ).not.toContain("/commerce/customers");
    });

    it("offers Customers without storefronts to a role that only reads contacts", () => {
        const hrefs = childHrefs(
            navFor({
                role: "MEMBER",
                actions: ["contact:read"],
                moduleKeys: null,
                sites,
            }),
        );
        expect(hrefs).toContain("/commerce/customers");
        expect(hrefs).not.toContain("/commerce/products");
        expect(hrefs).not.toContain("/commerce/orders");
    });

    it.each(["OWNER", "ADMIN"] as const)("offers Customers to %s", (role) => {
        expect(childHrefs(navFor({ role, moduleKeys: null, sites }))).toContain(
            "/commerce/customers",
        );
    });

    it("fails open for an actor it cannot judge", () => {
        expect(
            childHrefs(navFor({ role: null, moduleKeys: null, sites })),
        ).toContain("/commerce/customers");
    });

    it("gives a Reviewer no Sell group at all: they hold none of its reads", () => {
        for (const actions of [undefined, ["site:read", "site:comment"]]) {
            const groups = navFor({
                role: "REVIEWER",
                actions,
                moduleKeys: null,
                sites,
            });
            expect(
                groups.flatMap((g) => g.items.map((i) => i.label)),
            ).not.toContain("Sell");
        }
    });
});

describe("Sell → Discounts follows discount:read", () => {
    const childHrefs = (groups: ReturnType<typeof navFor>) =>
        groups.flatMap((g) =>
            g.items.flatMap((i) => (i.children ?? []).map((c) => c.href)),
        );
    const sites: { id: string; name: string }[] = [];

    it.each(["OWNER", "ADMIN"] as const)("offers it to %s", (role) => {
        expect(childHrefs(navFor({ role, moduleKeys: null, sites }))).toContain(
            "/commerce/discounts",
        );
    });

    it("withholds it from a Member, who cannot read codes", () => {
        expect(
            childHrefs(navFor({ role: "MEMBER", moduleKeys: null, sites })),
        ).not.toContain("/commerce/discounts");
    });

    it("follows an invented role's own permissions", () => {
        const hrefs = childHrefs(
            navFor({
                role: "MEMBER",
                actions: ["discount:read"],
                moduleKeys: null,
                sites,
            }),
        );
        expect(hrefs).toContain("/commerce/discounts");
    });
});

describe("isNavChildCurrent", () => {
    it("keeps a row lit on the pages beneath it", () => {
        expect(
            isNavChildCurrent("/commerce/products/p_1", "/commerce/products"),
        ).toBe(true);
    });

    it("does not light a row whose address only starts the same", () => {
        expect(
            isNavChildCurrent("/commerce/productsx", "/commerce/products"),
        ).toBe(false);
    });

    it("lets the deepest sibling win, so only one row is current", () => {
        const siblings = [{ href: "/sites/s1" }, { href: "/sites/s1/posts" }];
        expect(
            isNavChildCurrent("/sites/s1/posts/new", "/sites/s1", siblings),
        ).toBe(false);
        expect(
            isNavChildCurrent(
                "/sites/s1/posts/new",
                "/sites/s1/posts",
                siblings,
            ),
        ).toBe(true);
    });

    it("never lights a label row", () => {
        expect(isNavChildCurrent("/sites", undefined)).toBe(false);
    });
});

describe("Payments (ADR-007)", () => {
    it("offers an owner with Payments on Payments › Invoices", () => {
        const offered = hrefs(
            navFor({ role: "OWNER", moduleKeys: AVAILABLE_TO.OWNER }),
        );
        expect(offered).toContain("/billing/invoices");
    });

    it("puts Subscriptions beside Invoices; Plans is a tab, not a row (D3)", () => {
        const groups = navFor({
            role: "OWNER",
            moduleKeys: AVAILABLE_TO.OWNER,
        });
        const offered = hrefs(groups);
        expect(offered).toContain("/billing/subscriptions");
        expect(offered).not.toContain("/billing/plans");
        // A plan's own page lights Subscriptions, whose tab it is.
        const here = navPathname("/billing/plans/p_1", groups);
        expect(here).toBe("/billing/subscriptions");
        const siblings = [
            { href: "/billing/subscriptions" },
            { href: "/billing/invoices" },
        ];
        expect(
            isNavChildCurrent(here, "/billing/subscriptions", siblings),
        ).toBe(true);
        expect(isNavChildCurrent(here, "/billing/invoices", siblings)).toBe(
            false,
        );
    });

    it("marks Payments on every Payments page, Invoices included", () => {
        const payments = navFor({
            role: "OWNER",
            moduleKeys: AVAILABLE_TO.OWNER,
        })
            .flatMap((g) => g.items)
            .find((i) => i.label === "Payments");
        const href = payments?.href ?? "";
        expect(href).toBe("/billing");
        for (const page of [
            "/billing/subscriptions",
            "/billing/plans",
            "/billing/invoices/inv_1",
        ]) {
            expect(isNavItemActive(page, href)).toBe(true);
        }
    });

    it("offers Payments to no one without it, and Invoices a row of their own (DEC-070)", () => {
        const groups = navFor({
            role: "OWNER",
            moduleKeys: ["COMMERCE", "CRM"],
        });
        const items = groups.flatMap((g) => g.items);
        expect(items.map((i) => i.label)).not.toContain("Payments");
        expect(hrefs(groups)).not.toContain("/billing/subscriptions");
        // A top-level row, not a page under a section.
        const invoices = items.find((i) => i.label === "Invoices");
        expect(invoices?.href).toBe("/billing/invoices");
        expect(invoices?.children).toBeUndefined();
        expect(
            isNavItemActive("/billing/invoices/inv_1", "/billing/invoices"),
        ).toBe(true);
    });

    it("keeps Invoices under Payments while it's on, with no second row", () => {
        const items = navFor({
            role: "OWNER",
            moduleKeys: AVAILABLE_TO.OWNER,
        }).flatMap((g) => g.items);
        expect(items.map((i) => i.label)).not.toContain("Invoices");
        const payments = items.find((i) => i.label === "Payments");
        expect(payments?.children?.map((c) => c.href)).toContain(
            "/billing/invoices",
        );
    });

    it("gives a site for my work no Invoices row of its own; Payments still holds it (UX-074)", () => {
        const off = navFor({
            role: "OWNER",
            moduleKeys: ["WEBSITE", "CRM"],
            kind: "WORK",
        });
        expect(hrefs(off)).not.toContain("/billing/invoices");
        // A business and Just me keep it.
        for (const kind of ["BUSINESS", "SOLO", undefined]) {
            expect(
                hrefs(navFor({ role: "OWNER", moduleKeys: ["CRM"], kind })),
            ).toContain("/billing/invoices");
        }
        // Once Payments is on, its Invoices is there for a site too.
        expect(
            hrefs(
                navFor({
                    role: "OWNER",
                    moduleKeys: AVAILABLE_TO.OWNER,
                    kind: "WORK",
                }),
            ),
        ).toContain("/billing/invoices");
    });

    it("gives a business with no modules on its Invoices row", () => {
        const offered = hrefs(navFor({ role: "OWNER", moduleKeys: [] }));
        expect(offered).toContain("/billing/invoices");
    });

    it("shows Payments' own Invoices, not the stand-in row, while availability is unknown", () => {
        const items = navFor({ role: "OWNER", moduleKeys: null }).flatMap(
            (g) => g.items,
        );
        expect(items.filter((i) => i.label === "Invoices")).toHaveLength(0);
        expect(items.map((i) => i.label)).toContain("Payments");
    });

    it("does not offer the Invoices row to a role without invoice:read", () => {
        const offered = hrefs(
            navFor({ role: "MEMBER", moduleKeys: ["WEBSITE", "CRM"] }),
        );
        expect(offered).not.toContain("/billing/invoices");
    });

    it("does not offer a member invoices, even where Payments is on", () => {
        const offered = hrefs(
            navFor({ role: "MEMBER", moduleKeys: ["PAYMENTS", "WEBSITE"] }),
        );
        expect(offered).not.toContain("/billing/invoices");
    });

    it("drops the section when every page in it is refused, rather than an empty heading", () => {
        // An invented role in a business with Payments on, granted payments
        // but no invoices: Payments would be a row that opens onto nothing.
        const groups = navFor({
            role: "MEMBER",
            actions: ["payment:read"],
            moduleKeys: ["PAYMENTS"],
        });
        const labels = groups.flatMap((g) => g.items.map((i) => i.label));
        expect(labels).not.toContain("Payments");
    });

    it("keeps Website when a business has no sites yet", () => {
        const groups = navFor({
            role: "OWNER",
            moduleKeys: ["WEBSITE"],
            sites: [],
        });
        expect(hrefs(groups)).toContain("/sites");
    });

    it("lets owners and admins make an invoice from the command menu", () => {
        expect(navRoleCan("OWNER", "invoice:write")).toBe(true);
        expect(navRoleCan("ADMIN", "invoice:write")).toBe(true);
        expect(navRoleCan("MEMBER", "invoice:write")).toBe(false);
    });
});

describe("Courses (ADR-007), its own module", () => {
    it("offers an owner Courses once the Courses module is on", () => {
        expect(
            hrefs(
                navFor({
                    role: "OWNER",
                    moduleKeys: ["APPOINTMENTS", "COURSES"],
                }),
            ),
        ).toContain("/courses");
    });

    it("leaves it out where only Appointments is on", () => {
        expect(
            hrefs(navFor({ role: "OWNER", moduleKeys: ["APPOINTMENTS"] })),
        ).not.toContain("/courses");
    });

    it("does not offer it to a member, who may not read courses", () => {
        expect(
            hrefs(
                navFor({
                    role: "MEMBER",
                    moduleKeys: ["APPOINTMENTS", "COURSES"],
                }),
            ),
        ).not.toContain("/courses");
    });
});

describe("Class packs (ADR-007), a page under Bookings", () => {
    it("offers an owner Class packs where Class packs is on, after Courses", () => {
        const offered = hrefs(
            navFor({
                role: "OWNER",
                moduleKeys: ["APPOINTMENTS", "COURSES", "CLASS_PACKS"],
            }),
        );
        expect(offered).toContain("/class-packs");
        expect(offered.indexOf("/class-packs")).toBe(
            offered.indexOf("/courses") + 1,
        );
    });

    it("sits in the Bookings section beside Calendar and Services", () => {
        const bookings = navFor({
            role: "OWNER",
            moduleKeys: ["APPOINTMENTS", "CLASS_PACKS"],
        })
            .flatMap((g) => g.items)
            .find((i) => i.label === "Bookings");
        expect(bookings?.children?.map((c) => c.href)).toEqual([
            "/bookings",
            "/services",
            "/bookings/availability",
            "/class-packs",
        ]);
    });

    it("lights Availability alone on its page, and Calendar on the rest", () => {
        const kids = [
            { href: "/bookings" },
            { href: "/bookings/availability" },
        ];
        expect(
            isNavChildCurrent("/bookings/availability", "/bookings", kids),
        ).toBe(false);
        expect(
            isNavChildCurrent(
                "/bookings/availability",
                "/bookings/availability",
                kids,
            ),
        ).toBe(true);
        expect(isNavChildCurrent("/bookings/all", "/bookings", kids)).toBe(
            true,
        );
    });

    it("marks Class packs on its purchases and editor pages", () => {
        for (const page of [
            "/class-packs",
            "/class-packs/purchases",
            "/class-packs/pk_1/edit",
        ]) {
            expect(isNavItemActive(page, "/class-packs")).toBe(true);
        }
        expect(isNavItemActive("/class-packs", "/bookings")).toBe(false);
    });

    it("leaves it out with Class packs off, Appointments on or not (E12)", () => {
        expect(
            hrefs(navFor({ role: "OWNER", moduleKeys: ["APPOINTMENTS"] })),
        ).not.toContain("/class-packs");
    });

    it("leaves it out without Appointments", () => {
        expect(
            hrefs(navFor({ role: "OWNER", moduleKeys: ["COMMERCE"] })),
        ).not.toContain("/class-packs");
    });

    it("does not offer it to a member, who may not read packs", () => {
        expect(
            hrefs(navFor({ role: "MEMBER", moduleKeys: ["APPOINTMENTS"] })),
        ).not.toContain("/class-packs");
    });

    it("lets owners and admins make and sell a pack from the command menu", () => {
        expect(navRoleCan("OWNER", "pack:write")).toBe(true);
        expect(navRoleCan("ADMIN", "pack:write")).toBe(true);
        expect(navRoleCan("MEMBER", "pack:write")).toBe(false);
        expect(navRoleCan("REVIEWER", "pack:write")).toBe(false);
        for (const role of ["OWNER", "ADMIN"] as const) {
            expect(navRoleCan(role, "pack:sell")).toBe(true);
        }
        // Whether a Member sells packs is F18's (matrix Q1).
        expect(navRoleCan("MEMBER", "pack:sell")).toBe(false);
        expect(navRoleCan("REVIEWER", "pack:sell")).toBe(false);
    });

    it("offers Sell a pack to a role the business made to sell, not to make (E26)", () => {
        const seller = {
            role: "MEMBER" as const,
            actions: ["pack:read", "pack:sell"],
        };
        expect(navCan(seller, ["pack:sell", "pack:write"])).toBe(true);
        expect(navCan(seller, "pack:write")).toBe(false);
    });
});

describe("Bookings, a section across two modules", () => {
    const bookingsOf = (groups: NavGroup[]) =>
        groups.flatMap((g) => g.items).find((i) => i.label === "Bookings");

    it("replaces the four rows it used to be", () => {
        const labels = navFor({
            role: "OWNER",
            moduleKeys: ["APPOINTMENTS", "COURSES"],
        }).flatMap((g) => g.items.map((i) => i.label));
        expect(labels).toContain("Bookings");
        for (const gone of ["Schedule", "Services", "Courses", "Class packs"]) {
            expect(labels).not.toContain(gone);
        }
    });

    it("keeps every address it holds", () => {
        const offered = hrefs(
            navFor({
                role: "OWNER",
                moduleKeys: ["APPOINTMENTS", "COURSES", "CLASS_PACKS"],
            }),
        );
        for (const href of [
            "/bookings",
            "/services",
            "/courses",
            "/class-packs",
        ]) {
            expect(offered).toContain(href);
        }
    });

    it("lands on Courses where only Courses is on", () => {
        const bookings = bookingsOf(
            navFor({ role: "OWNER", moduleKeys: ["COURSES"] }),
        );
        expect(bookings?.href).toBe("/courses");
        expect(bookings?.children?.map((c) => c.href)).toEqual(["/courses"]);
    });

    it("is not offered at all without Appointments or Courses", () => {
        expect(
            bookingsOf(navFor({ role: "OWNER", moduleKeys: ["COMMERCE"] })),
        ).toBeUndefined();
    });

    it("marks Bookings on its pages outside /bookings", () => {
        const bookings = bookingsOf(
            navFor({
                role: "OWNER",
                moduleKeys: ["APPOINTMENTS", "COURSES", "CLASS_PACKS"],
            }),
        );
        if (!bookings) throw new Error("Bookings missing");
        for (const page of [
            "/bookings",
            "/services/s_1",
            "/courses",
            "/class-packs/purchases",
        ]) {
            expect(isNavSectionActive(page, bookings)).toBe(true);
        }
        expect(isNavSectionActive("/commerce/orders", bookings)).toBe(false);
    });

    it("tells Modules which rows Appointments, Courses, Class packs and Payments own", () => {
        expect(navRowsForModule("APPOINTMENTS")).toEqual([
            "Calendar",
            "Services",
            "Availability",
        ]);
        expect(navRowsForModule("COURSES")).toEqual(["Courses"]);
        expect(navRowsForModule("CLASS_PACKS")).toEqual(["Class packs"]);
        // Invoices keep a row of their own with Payments off (DEC-070).
        expect(navRowsForModule("PAYMENTS")).toEqual([
            "Payments",
            "Subscriptions",
        ]);
    });
});

describe("navCountFor", () => {
    it("reads unread for Notifications and the Home model for the rest", () => {
        expect(navCountFor("/notifications", { "/notifications": 9 }, 2)).toBe(
            2,
        );
        expect(navCountFor("/leads", { "/leads": 4 }, 2)).toBe(4);
        expect(navCountFor("/leads", undefined, 2)).toBe(0);
        expect(navCountFor(undefined, { "/leads": 4 }, 2)).toBe(0);
    });
});

describe("the person page sits in the section that holds people (#869)", () => {
    const groupsWith = (moduleKeys: string[]) =>
        navFor({ role: "OWNER", moduleKeys });

    it("is Contacts, where the business sells too", () => {
        const groups = groupsWith(["CRM", "COMMERCE"]);
        expect(navPathname("/contacts/c_1", groups)).toBe("/contacts");
    });

    it("is Contacts where it takes bookings and sells nothing", () => {
        const groups = groupsWith(["CRM", "APPOINTMENTS"]);
        expect(navPathname("/contacts/c_1", groups)).toBe("/contacts");
    });

    it("is Sell › Customers where the rail has no Contacts", () => {
        const groups = groupsWith(["COMMERCE"]);
        expect(navPathname("/contacts/c_1", groups)).toBe(
            "/commerce/customers",
        );
    });

    it("leaves every other address as it is", () => {
        const groups = groupsWith(["CRM", "COMMERCE"]);
        expect(navPathname("/commerce/orders/o_1", groups)).toBe(
            "/commerce/orders/o_1",
        );
        expect(navPathname("/contacts", groups)).toBe("/contacts");
    });
});

describe("settings tabs — owner only, and everyone's", () => {
    it("keeps Plan and billing to the owner, by role", () => {
        // An admin holds org:settings:read and every other business tab, and
        // is still not offered what Saroh charges the business.
        expect(tabsFor({ role: "ADMIN" })).not.toContain("/settings/billing");
        expect(tabsFor({ role: "ADMIN" })).toContain("/settings/organization");
        expect(tabsFor({ role: "OWNER" })).toContain("/settings/billing");
        // Resolved permissions do not make an invented role the owner.
        expect(
            tabsFor({
                role: "MEMBER",
                actions: ["org:settings:read", "billing:read"],
            }),
        ).not.toContain("/settings/billing");
    });

    it("still needs the page's action as well as the role", () => {
        const billing = SETTINGS_PAGES.find(
            (page) => page.href === "/settings/billing",
        );
        expect(billing).toBeDefined();
        if (!billing) return;
        expect(
            mayOpenSettingsPage(
                { role: "OWNER", actions: ["member:read"] },
                billing,
            ),
        ).toBe(false);
        expect(
            mayOpenSettingsPage(
                { role: "OWNER", actions: ["org:settings:read"] },
                billing,
            ),
        ).toBe(true);
    });

    it("fails open on a role it does not know, as the rail does", () => {
        expect(tabsFor({ role: null })).toContain("/settings/billing");
    });

    it("offers Your profile to everyone, a reviewer included", () => {
        for (const role of ROLES) {
            expect(tabsFor({ role })).toContain("/settings/profile");
        }
        expect(tabsFor({ role: "REVIEWER" })).toEqual(["/settings/profile"]);
        // An invented role granted nothing of the business still has itself.
        expect(tabsFor({ role: "MEMBER", actions: [] })).toEqual([
            "/settings/profile",
        ]);
    });

    it("lists the tabs in the design's order", () => {
        expect(SETTINGS_PAGES.map((page) => page.label)).toEqual([
            "Business",
            "Team",
            "Modules",
            "Plan and billing",
            "Your profile",
            "Activity",
            "Providers",
        ]);
    });

    it("offers Activity to whoever the API lets read the audit stream", () => {
        expect(tabsFor({ role: "ADMIN" })).toContain("/settings/activity");
        expect(tabsFor({ role: "MEMBER" })).not.toContain("/settings/activity");
        // The design gates it on reading settings; the API does not, so
        // reading settings alone is not enough.
        expect(
            tabsFor({ role: "MEMBER", actions: ["org:settings:read"] }),
        ).not.toContain("/settings/activity");
        expect(tabsFor({ role: "MEMBER", actions: ["audit:read"] })).toContain(
            "/settings/activity",
        );
    });
});
