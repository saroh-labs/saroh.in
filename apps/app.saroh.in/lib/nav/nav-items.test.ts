import { describe, expect, it } from "vitest";

import type {
    NavGroup,
    NavRole,
} from "@/components/shared/navigation/nav-items";
import {
    MEMBERSHIP_PLANS_HREF,
    NAV_GROUPS,
    NOTIFICATIONS_NAV,
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
} from "@/components/shared/navigation/nav-items";

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

/** `hrefs`, for describes that name their own `hrefs`. */
const allHrefs = hrefs;

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

    it("gives a member the bell for their own alerts, never a reviewer (DEC-170)", () => {
        expect(navRoleCan("MEMBER", "notification:read-own")).toBe(true);
        expect(navRoleCan("MEMBER", NOTIFICATIONS_NAV.action)).toBe(true);
        expect(navRoleCan("REVIEWER", NOTIFICATIONS_NAV.action)).toBe(false);
        for (const role of ["OWNER", "ADMIN"] as const) {
            expect(navRoleCan(role, "notification:read-own")).toBe(true);
        }
        // An invented role with only its own alerts still has the bell.
        expect(
            navCan(
                { role: "MEMBER", actions: ["notification:read-own"] },
                NOTIFICATIONS_NAV.action,
            ),
        ).toBe(true);
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
            "/settings/share",
            "/settings/activity",
            "/settings/integrations",
            "/settings/developers",
            "/settings/data",
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

    it("offers a Storefront team holder Orders alone of what was Sell (DEC-074)", () => {
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
        expect(offered).not.toContain("/commerce/locations");
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
            // They read the website, so its QR codes too: to see, not change.
            "/settings/share",
            "/settings/developers",
        ]);
        expect(navCan({ role: "MEMBER" }, "notification:read")).toBe(false);
        // A member reads sites and authors none.
        expect(offered).not.toContain("/sites/new");
        // Review opens the editor, read-only (DEC-200).
        expect(offered).toContain("/sites/site_1");
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
            "/sites/site_1",
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
        // The last group (Setup) held destinations all of them refused. A heading
        // over an empty list names something the reader does not have.
        expect(groups.map((g) => g.label)).toEqual(["Today", "Online"]);
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
        // Review is the editor, read-only (DEC-200); no "Pages". Settings is
        // left out: it opens, and then says they may change nothing.
        expect(offered).toContain("/sites/site_1");
        expect(offered).not.toContain("/sites/site_1/pages");
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
            "/settings/developers",
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
            "/settings/developers",
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
    // Every row is its own since the regroup (DEC-262): rows at any depth.
    const childHrefs = (groups: ReturnType<typeof navFor>) => allHrefs(groups);
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
    // Every row is its own since the regroup (DEC-262): rows at any depth.
    const childHrefs = (groups: ReturnType<typeof navFor>) => allHrefs(groups);
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
    // Every row is its own since the regroup (DEC-262): rows at any depth.
    const childHrefs = (groups: ReturnType<typeof navFor>) => allHrefs(groups);
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
    // Every row is its own since the regroup (DEC-262): rows at any depth.
    const childHrefs = (groups: ReturnType<typeof navFor>) => allHrefs(groups);
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

    it("puts Memberships beside Invoices and Membership plans under What you offer (DEC-262)", () => {
        const groups = navFor({
            role: "OWNER",
            moduleKeys: AVAILABLE_TO.OWNER,
        });
        const money = groups.find((g) => g.label === "Money");
        expect(money?.items.map((i) => i.label)).toEqual([
            "Invoices",
            "Memberships",
        ]);
        const offer = groups.find((g) => g.label === "What you offer");
        expect(
            offer?.items.find((i) => i.label === "Membership plans")?.href,
        ).toBe(MEMBERSHIP_PLANS_HREF);
        // A plan's own page lights Membership plans, and only it.
        const here = navPathname("/billing/plans/p_1", groups);
        expect(here).toBe(MEMBERSHIP_PLANS_HREF);
        const rows = groups.flatMap((g) => g.items);
        const lit = rows.filter((r) => isNavSectionActive(here, r, rows));
        expect(lit.map((r) => r.label)).toEqual(["Membership plans"]);
        const list = rows.filter((r) =>
            isNavSectionActive("/billing/subscriptions", r, rows),
        );
        expect(list.map((r) => r.label)).toEqual(["Memberships"]);
    });

    it("offers Memberships to no one without Payments, and Invoices still (DEC-070)", () => {
        const groups = navFor({
            role: "OWNER",
            moduleKeys: ["COMMERCE", "CRM"],
        });
        const items = groups.flatMap((g) => g.items);
        expect(hrefs(groups)).not.toContain("/billing/subscriptions");
        const invoices = items.filter((i) => i.label === "Invoices");
        expect(invoices).toHaveLength(1);
        expect(invoices[0]?.href).toBe("/billing/invoices");
        expect(
            isNavItemActive("/billing/invoices/inv_1", "/billing/invoices"),
        ).toBe(true);
    });

    it("draws one Invoices row while Payments is on", () => {
        const items = navFor({
            role: "OWNER",
            moduleKeys: AVAILABLE_TO.OWNER,
        }).flatMap((g) => g.items);
        expect(items.filter((i) => i.label === "Invoices")).toHaveLength(1);
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

    it("draws one Invoices row while availability is unknown", () => {
        const items = navFor({ role: "OWNER", moduleKeys: null }).flatMap(
            (g) => g.items,
        );
        expect(items.filter((i) => i.label === "Invoices")).toHaveLength(1);
        expect(items.map((i) => i.label)).toContain("Memberships");
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

    it("drops Money when every row in it is refused, rather than an empty heading", () => {
        // An invented role in a business with Payments on, granted payments
        // but no invoices or memberships.
        const groups = navFor({
            role: "MEMBER",
            actions: ["payment:read"],
            moduleKeys: ["PAYMENTS"],
        });
        expect(groups.map((g) => g.label)).not.toContain("Money");
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

describe("Class packs (ADR-007), under What you offer", () => {
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

    it("sits under What you offer beside Services and Courses (DEC-262)", () => {
        const offer = navFor({
            role: "OWNER",
            moduleKeys: ["APPOINTMENTS", "COURSES", "CLASS_PACKS"],
        }).find((g) => g.label === "What you offer");
        expect(offer?.items.map((i) => i.href)).toEqual([
            "/services",
            "/courses",
            "/class-packs",
        ]);
    });

    it("lights Hours and time off alone on its page, and the diary on the rest", () => {
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

describe("one home per thing (DEC-262)", () => {
    const EVERY = [
        "WEBSITE",
        "CRM",
        "APPOINTMENTS",
        "COURSES",
        "CLASS_PACKS",
        "COMMERCE",
        "PAYMENTS",
        "INSIGHTS",
    ];
    const ownerGroups = () =>
        navFor({ role: "OWNER", moduleKeys: EVERY, stockTracked: true });

    it("groups the rows by the merchant's question, daily work first", () => {
        expect(
            ownerGroups().map((g) => [g.label, g.items.map((i) => i.label)]),
        ).toEqual([
            ["Today", ["Home", "Business calendar", "Orders", "Bookings"]],
            ["People", ["Customers", "Leads", "Contacts"]],
            ["Money", ["Invoices", "Memberships"]],
            [
                "What you offer",
                [
                    "Products",
                    "Stock",
                    "Services",
                    "Courses",
                    "Class packs",
                    "Membership plans",
                    "Discount codes",
                ],
            ],
            ["Online", ["Website", "Social"]],
            ["Insights", ["Insights"]],
            ["Setup", ["Location", "Hours and time off", "Settings"]],
        ]);
    });

    it("draws each row once, with no sections in the rail", () => {
        const rows = ownerGroups().flatMap((g) => g.items);
        expect(new Set(rows.map((r) => r.href)).size).toBe(rows.length);
        expect(rows.filter((r) => r.children?.length)).toEqual([]);
    });

    it("keeps every address it held", () => {
        const offered = hrefs(ownerGroups());
        for (const href of [
            "/bookings",
            "/services",
            "/courses",
            "/class-packs",
            "/bookings/availability",
            "/commerce/orders",
            "/commerce/products",
            "/commerce/stock",
            "/commerce/customers",
            "/commerce/discounts",
            "/commerce/locations",
            "/billing/subscriptions",
            "/billing/invoices",
            "/contacts",
            "/leads",
        ]) {
            expect(offered).toContain(href);
        }
    });

    it("lights only the deepest row: Hours and time off, not Bookings", () => {
        const rows = ownerGroups().flatMap((g) => g.items);
        const lit = (path: string) =>
            rows
                .filter((r) => isNavSectionActive(path, r, rows))
                .map((r) => r.label);
        expect(lit("/bookings/availability")).toEqual(["Hours and time off"]);
        expect(lit("/bookings/all")).toEqual(["Bookings"]);
        expect(lit("/services/s_1")).toEqual(["Services"]);
        expect(lit("/class-packs/purchases")).toEqual(["Class packs"]);
    });

    it("tells Modules which rows each module owns", () => {
        expect(navRowsForModule("APPOINTMENTS")).toEqual([
            "Bookings",
            "Services",
            "Hours and time off",
        ]);
        expect(navRowsForModule("COURSES")).toEqual(["Courses"]);
        expect(navRowsForModule("CLASS_PACKS")).toEqual(["Class packs"]);
        expect(navRowsForModule("COMMERCE")).toEqual([
            "Orders",
            "Products",
            "Stock",
            "Discount codes",
            "Location",
        ]);
        expect(navRowsForModule("CRM")).toEqual(["Leads", "Contacts"]);
        // Invoices keep a row of their own with Payments off (DEC-070).
        expect(navRowsForModule("PAYMENTS")).toEqual([
            "Memberships",
            "Membership plans",
        ]);
    });

    it("offers Leads to whoever reads the pipeline, landing on the board", () => {
        const board = navFor({
            role: "MEMBER",
            actions: ["pipeline:read"],
            moduleKeys: ["CRM"],
        })
            .flatMap((g) => g.items)
            .find((i) => i.label === "Leads");
        expect(board?.href).toBe("/pipeline");
        const owner = ownerGroups().flatMap((g) => g.items);
        expect(owner.find((i) => i.label === "Leads")?.href).toBe("/leads");
        expect(owner.map((i) => i.label)).not.toContain("Pipeline");
        expect(navPathname("/pipeline", ownerGroups())).toBe("/leads");
    });
});

describe("Customers, whenever the business takes money (DEC-264)", () => {
    const offered = (moduleKeys: string[] | null) =>
        hrefs(navFor({ role: "OWNER", moduleKeys }));

    it.each(["COMMERCE", "PAYMENTS", "APPOINTMENTS", "COURSES", "CLASS_PACKS"])(
        "is offered with %s on",
        (key) => {
            expect(offered([key])).toContain("/commerce/customers");
        },
    );

    it("is offered to a gym with Sell off", () => {
        expect(offered(["APPOINTMENTS", "PAYMENTS", "CLASS_PACKS"])).toContain(
            "/commerce/customers",
        );
    });

    it("is not offered where nothing takes money, and fails open on unknown", () => {
        expect(offered(["WEBSITE", "CRM"])).not.toContain(
            "/commerce/customers",
        );
        expect(offered([])).not.toContain("/commerce/customers");
        expect(offered(null)).toContain("/commerce/customers");
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

    it("is Customers where the rail has no Contacts", () => {
        const groups = groupsWith(["COMMERCE"]);
        expect(navPathname("/contacts/c_1", groups)).toBe(
            "/commerce/customers",
        );
    });

    it("is the one the person came from (DEC-264)", () => {
        const groups = groupsWith(["CRM", "COMMERCE"]);
        expect(
            navPathname("/contacts/c_1", groups, "/commerce/customers"),
        ).toBe("/commerce/customers");
        expect(navPathname("/contacts/c_1", groups, "/contacts")).toBe(
            "/contacts",
        );
        // Somewhere else: the first home the rail holds.
        expect(navPathname("/contacts/c_1", groups, "/bookings")).toBe(
            "/contacts",
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
    it("offers Plan and billing to whoever the API reads it to: billing:read", () => {
        // Owner and Admin by default, as the API's own map has it.
        expect(tabsFor({ role: "OWNER" })).toContain("/settings/billing");
        expect(tabsFor({ role: "ADMIN" })).toContain("/settings/billing");
        expect(tabsFor({ role: "MEMBER" })).not.toContain("/settings/billing");
        expect(tabsFor({ role: "REVIEWER" })).not.toContain(
            "/settings/billing",
        );
        // By permission, never the role's name: a role the business made
        // that holds it is offered the tab, and an owner's stale list
        // without it is not.
        expect(
            tabsFor({ role: "MEMBER", actions: ["billing:read"] }),
        ).toContain("/settings/billing");
        expect(
            tabsFor({ role: "OWNER", actions: ["org:settings:read"] }),
        ).not.toContain("/settings/billing");
    });

    it("keeps Your data to the owner, by role, as the API does", () => {
        const data = SETTINGS_PAGES.find(
            (page) => page.href === "/settings/data",
        );
        expect(data).toBeDefined();
        if (!data) return;
        expect(tabsFor({ role: "ADMIN" })).not.toContain("/settings/data");
        expect(tabsFor({ role: "OWNER" })).toContain("/settings/data");
        // It still needs the page's action as well as the role.
        expect(
            mayOpenSettingsPage(
                { role: "OWNER", actions: ["member:read"] },
                data,
            ),
        ).toBe(false);
        expect(
            mayOpenSettingsPage(
                { role: "OWNER", actions: ["org:settings:read"] },
                data,
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
        // A reviewer may see the website, so its QR codes too (Share), to
        // look at and download; Your profile still comes first, so that is
        // where `/settings` opens for them.
        expect(tabsFor({ role: "REVIEWER" })).toEqual([
            "/settings/profile",
            "/settings/share",
        ]);
        // An invented role granted nothing of the business still has itself,
        // and its own AI assistant.
        expect(tabsFor({ role: "MEMBER", actions: [] })).toEqual([
            "/settings/profile",
            "/settings/developers",
        ]);
    });

    it("lists the tabs in the design's order", () => {
        expect(SETTINGS_PAGES.map((page) => page.label)).toEqual([
            "Business",
            "Team",
            "Modules",
            "Plan and billing",
            "Your profile",
            "Share",
            "Activity",
            "Integrations",
            "API and AI apps",
            "Your data",
        ]);
    });

    it("opens Providers to anyone whose Google Calendar is switched on (DEC-233)", () => {
        expect(tabsFor({ role: "MEMBER" })).not.toContain(
            "/settings/integrations",
        );
        expect(
            tabsFor({ role: "MEMBER", switches: ["google-calendar"] }),
        ).toContain("/settings/integrations");
        expect(tabsFor({ role: "OWNER" })).toContain("/settings/integrations");
    });

    it("offers API and AI apps to every member but a Reviewer (plan 2026-11-10-001)", () => {
        for (const role of ["OWNER", "ADMIN", "MEMBER"] as const) {
            expect(tabsFor({ role })).toContain("/settings/developers");
        }
        expect(tabsFor({ role: "REVIEWER" })).not.toContain(
            "/settings/developers",
        );
        // By role, whatever the actions say.
        expect(
            tabsFor({ role: "REVIEWER", actions: ["org:read"] }),
        ).not.toContain("/settings/developers");
    });

    it("offers Share to whoever may see the website", () => {
        for (const role of ROLES) {
            expect(tabsFor({ role })).toContain("/settings/share");
        }
        expect(tabsFor({ role: "MEMBER", actions: ["site:read"] })).toContain(
            "/settings/share",
        );
        expect(
            tabsFor({ role: "MEMBER", actions: ["order:read"] }),
        ).not.toContain("/settings/share");
    });

    it("keeps Your data to the owner (DEC-120)", () => {
        expect(tabsFor({ role: "OWNER" })).toContain("/settings/data");
        expect(tabsFor({ role: "ADMIN" })).not.toContain("/settings/data");
        expect(
            tabsFor({ role: "MEMBER", actions: ["org:settings:read"] }),
        ).not.toContain("/settings/data");
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
