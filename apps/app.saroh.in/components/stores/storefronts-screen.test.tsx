import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SiteSelling } from "@/lib/sites/sells-from";
import type { LocationPeople } from "@/lib/stores/people";
import type {
    StorefrontSettings,
    StorefrontSummary,
} from "@/lib/stores/storefronts";

import { StorefrontsScreen } from "./storefronts-screen";

/** The address's `?section=`, as each test sets it. */
const address = vi.hoisted(() => ({ section: null as string | null }));

vi.mock("next/navigation", () => ({
    useRouter: () => ({ refresh: vi.fn(), replace: vi.fn() }),
    useSearchParams: () =>
        new URLSearchParams(
            address.section ? `section=${address.section}` : "",
        ),
}));
vi.mock("@/lib/stores/storefront-actions", () => ({
    closeStorefront: vi.fn(),
    updateStorefront: vi.fn(),
}));
vi.mock("@/lib/members/actions", () => ({
    inviteMember: vi.fn(),
    removeMember: vi.fn(),
    revokeInvitation: vi.fn(),
    updateMemberRole: vi.fn(),
}));

beforeEach(() => {
    address.section = null;
});

/**
 * Sell › Location (DEC-069, L9; the 9 Oct audit, tabs from the owner): the
 * page is titled with the location's name, says what it still needs above
 * its tabs, and splits its parts by job into tabs: The place, Payments,
 * Delivery, Customers, People, Pause or close, the open one in `?section=`.
 * Identifiers stay storefront; the words don't. Made-up names only.
 */

const hill: StorefrontSettings = {
    id: "st_hill",
    name: "Hill Road",
    orderCount: 3,
    kind: "SHOP",
    paused: false,
    currency: "INR",
    currencyLocked: true,
    taxEnabled: false,
    taxRate: "0.00",
    shippingEnabled: false,
    freeShippingThreshold: null,
    unfulfilled: 0,
    address: "12 Hill Road\nBandra",
    openingHours: null,
    collectionEnabled: true,
    fulfilmentTypes: ["PICKUP"],
    tipsEnabled: false,
    guestCheckout: true,
    pausedAt: null,
    linkSameEmailCustomers: false,
    checkoutProvider: null,
    effectiveProvider: null,
    providers: [],
};
const summary = (s: StorefrontSettings): StorefrontSummary => ({
    id: s.id,
    name: s.name,
    orderCount: s.orderCount,
    kind: s.kind,
    paused: s.paused,
});
const online: StorefrontSettings = {
    ...hill,
    id: "st_online",
    name: "Rye Online",
    kind: "ONLINE",
    address: null,
    orderCount: 0,
    currencyLocked: false,
    fulfilmentTypes: [],
};

const site = (sellsFromId: string | null, products = 2): SiteSelling => ({
    siteId: "site_1",
    origin: "https://rye.saroh.app",
    sellsFrom: {
        storefront: sellsFromId ? { id: sellsFromId, name: "It" } : null,
        choices: sellsFromId ? [{ id: sellsFromId, name: "It", products }] : [],
    },
});

const screen = (
    props: Partial<Parameters<typeof StorefrontsScreen>[0]> = {},
    section: string | null = null,
) => {
    address.section = section;
    return renderToStaticMarkup(
        <StorefrontsScreen
            businessName="Rye & Co."
            storefronts={[summary(hill)]}
            selected={hill}
            canCreate
            canEdit
            canClose
            {...props}
        />,
    );
};

/** What a person reads: the text, not the ids and classes. */
const text = (html: string) =>
    html
        .replace(/<[^>]+>/g, " ")
        .replace(/&#x27;/g, "'")
        .replace(/&amp;/g, "&")
        .replace(/&quot;/g, '"')
        .replace(/\s+/g, " ");

/** The open tab's panel, without the page above it. */
const panel = (html: string) => html.slice(html.indexOf('role="tabpanel"'));

const h1 = (html: string) =>
    text(/<h1[^>]*>(.*?)<\/h1>/.exec(html)?.[1] ?? "").trim();

/** The tabs' names, in order, and which one is open. */
const tabsOf = (html: string) => ({
    names: Array.from(
        html.matchAll(/<button[^>]*role="tab"[^>]*>(.*?)<\/button>/g),
        (m: RegExpMatchArray) => text(String(m[1])).trim(),
    ),
    open: text(
        /<button[^>]*aria-selected="true"[^>]*>(.*?)<\/button>/.exec(
            html,
        )?.[1] ?? "",
    ).trim(),
});

describe("StorefrontsScreen as a location's own page", () => {
    it("is titled with the location's name; the crumb keeps the word", () => {
        const html = screen();
        expect(h1(html)).toBe("Hill Road");
        expect(html).toMatch(/aria-label="Breadcrumb"[^]*Sell[^]*Location/);
        // The line under it: a place customers visit, by its address.
        expect(text(html)).toContain("Customers visit · 12 Hill Road");
        expect(text(html)).toContain("New location");
    });

    it("a No counter location says what it is for under its name", () => {
        const t = text(
            screen({ storefronts: [summary(online)], selected: online }),
        );
        expect(t).toContain("No counter · stock for online orders");
    });

    it("tabs by job, Pause or close last, The place open, and no Behaviour", () => {
        const html = screen();
        expect(tabsOf(html)).toEqual({
            names: [
                "The place",
                "Payments",
                "Delivery",
                "Customers",
                "People",
                "Pause or close",
            ],
            open: "The place",
        });
        expect(html).toContain('role="tablist"');
        expect(html).toMatch(
            /role="tabpanel"[^>]*aria-labelledby="location-tab-the-place"|aria-labelledby="location-tab-the-place"[^>]*role="tabpanel"/,
        );
        const t = text(html);
        // Only the open tab is drawn.
        expect(t).toContain("Location name");
        expect(t).not.toContain("Online payments");
        expect(t).not.toContain("Behaviour");
        expect(t).not.toContain("How orders leave");
        // The scroll list is gone with the tabs.
        expect(html).not.toContain('aria-label="On this page"');
    });

    it("opens the tab the address names, and The place for one it doesn't", () => {
        expect(tabsOf(screen({}, "delivery")).open).toBe("Delivery");
        expect(screen({}, "delivery")).toContain('id="delivery-pickup"');
        expect(tabsOf(screen({}, "nonsense")).open).toBe("The place");
        // A tab the page doesn't offer falls back too.
        expect(
            tabsOf(
                screen({ canEdit: false, canClose: false }, "pause-or-close"),
            ).open,
        ).toBe("The place");
    });

    it("keeps the title and the readiness card above every tab", () => {
        for (const section of [
            null,
            "payments",
            "delivery",
            "customers",
            "people",
            "pause-or-close",
        ]) {
            const html = screen({}, section);
            expect(h1(html)).toBe("Hill Road");
            expect(html).toContain('data-testid="location-readiness"');
        }
    });

    it("asks Do customers come here?, answered Yes or No", () => {
        const t = text(screen());
        expect(t).toContain("Do customers come here?");
        expect(t).toContain("Yes, they visit");
        expect(t).toContain("No, online only");
        expect(t).toContain("Location address");
        expect(t).toContain("Opening hours");
        expect(t).toContain("Name the place, like “Hill Road”.");
    });

    it("a No counter location asks no address or hours", () => {
        const t = text(
            screen({ storefronts: [summary(online)], selected: online }),
        );
        expect(t).not.toContain("Location address");
        expect(t).not.toContain("Opening hours");
    });

    it("no counter with Pick-up still on: offers turning it off right there", () => {
        const t = text(
            screen({
                storefronts: [summary(online)],
                selected: { ...online, fulfilmentTypes: ["PICKUP"] },
            }),
        );
        expect(t).toContain("Pick-up is still on");
        expect(t).toContain("Turn Pick-up off");
        // Not offered when it is off, or to a role that can't change it.
        expect(
            text(screen({ storefronts: [summary(online)], selected: online })),
        ).not.toContain("Turn Pick-up off");
        expect(
            text(
                screen({
                    storefronts: [summary(online)],
                    selected: { ...online, fulfilmentTypes: ["PICKUP"] },
                    canEdit: false,
                }),
            ),
        ).not.toContain("Turn Pick-up off");
    });

    it("says no merchant-visible storefront, in any state", () => {
        for (const html of [
            screen(),
            screen({ site: site("st_hill") }),
            screen({ site: null }),
            screen({
                storefronts: [summary(hill), summary(online)],
                selected: online,
                site: site("st_online"),
            }),
            screen({ storefronts: [], selected: null }),
            screen({ selected: null }),
            screen({ canEdit: false, canClose: false }),
            screen({}, "payments"),
            screen({}, "delivery"),
            screen({}, "customers"),
            screen({}, "pause-or-close"),
        ]) {
            expect(text(html)).not.toMatch(/storefront/i);
            expect(text(html)).not.toMatch(/online store/i);
        }
    });

    it("has no selling line in The place: the readiness card says it", () => {
        for (const html of [
            screen({ site: site("st_hill", 0) }),
            screen({
                storefronts: [summary(online)],
                selected: online,
                site: site("st_hill"),
            }),
        ]) {
            expect(html).not.toContain('data-testid="location-selling"');
            expect(text(html)).not.toContain("isn't live yet");
        }
    });

    it("several locations: the list, and the chosen one's name as the title", () => {
        const html = screen({
            storefronts: [summary(hill), summary(online)],
            selected: online,
            site: site("st_online"),
        });
        expect(h1(html)).toBe("Rye Online");
        expect(text(html)).toContain("2 locations");
        expect(html).toMatch(/aria-label="Breadcrumb"[^]*Locations/);
    });

    it("The place says what is saved of the description and logo, with Edit to their page", () => {
        const html = screen({
            details: { description: "Sourdough since 2019", logo: null },
        });
        const t = text(panel(html));
        expect(t).toContain(
            "Description and logo Description added, no logo yet Edit",
        );
        expect(html).toContain('href="/commerce/locations/st_hill/details"');
        expect(html).toContain('aria-label="Edit description and logo"');
        expect(t).not.toContain("Web address");
        expect(
            text(panel(screen({ details: { description: null, logo: null } }))),
        ).toContain("No description or logo yet");
    });

    it("leaves the row out when they couldn't be read, rather than say none", () => {
        const t = text(panel(screen()));
        expect(t).not.toContain("Description and logo");
        expect(t).not.toContain("No description");
    });

    it("has no loose buttons under The place: people are a tab (10 Oct)", () => {
        const html = screen({
            details: { description: null, logo: null },
        });
        expect(text(html)).not.toContain("People who work here");
        expect(html).not.toContain("/people");
        // One link to the details page: the row's Edit.
        expect(html.match(/\/details"/g)).toHaveLength(1);
    });

    it("no location yet: says so, and offers Add a location", () => {
        const html = screen({ storefronts: [], selected: null });
        expect(text(html)).toContain("No location yet");
        expect(text(html)).toContain("Add a location");
        expect(h1(html)).toBe("Location");
    });

    it("a location that couldn't be read keeps its name and offers Try again", () => {
        const html = screen({ selected: null, chosenId: hill.id });
        expect(h1(html)).toBe("Hill Road");
        expect(text(html)).toContain("This location could not be loaded");
        expect(text(html)).toContain("Try again");
        expect(html).not.toContain('role="tablist"');
    });
});

describe("the People tab", () => {
    const people: LocationPeople = {
        members: [
            {
                userId: "u_owner",
                name: "Asha Rao",
                email: "asha.rao@example.com",
                role: "OWNER",
                kind: "owner",
            },
            {
                userId: "u_dev",
                name: "Dev Shah",
                email: "dev.shah@example.com",
                role: "EDITOR",
                kind: "member",
            },
        ],
        invitations: [
            {
                id: "inv_1",
                email: "mira.sen@example.com",
                role: "VIEWER",
                status: "PENDING",
                expiresAt: "2026-10-20T00:00:00.000Z",
                createdAt: "2026-10-10T00:00:00.000Z",
            },
        ],
        canManage: true,
        canInvite: true,
    };

    it("shows the roster on the location's own page, with the one line about Team", () => {
        const html = screen({ people }, "people");
        expect(tabsOf(html).open).toBe("People");
        const t = text(panel(html));
        expect(t).toContain(
            "Who can work on Hill Road's catalogue, orders and customers. Everyone here is also on your team, under Team.",
        );
        expect(t).toContain("Asha Rao asha.rao@example.com Owner");
        expect(t).toContain("Dev Shah dev.shah@example.com");
        expect(t).toContain("Invited mira.sen@example.com Invited as viewer");
        expect(t).toContain("Invite someone");
        // Read first: no open invite form on the tab.
        expect(panel(html)).not.toContain("<input");
    });

    it("a roster that couldn't be read fails on its own tab, not the page", () => {
        const html = screen({ people: null }, "people");
        expect(h1(html)).toBe("Hill Road");
        expect(html).toContain('role="tablist"');
        const t = text(panel(html));
        expect(t).toContain("The people here could not be loaded");
        expect(t).toContain("Try again");
        expect(panel(html)).toContain('role="alert"');
        // The other tabs are untouched by it.
        expect(text(screen({ people: null }))).toContain("Location name");
    });
});

describe("the readiness card", () => {
    it("a No counter location: done first, then each step with its one link", () => {
        const html = screen({
            storefronts: [summary(online)],
            selected: {
                ...online,
                fulfilmentTypes: ["SHIPPING"],
                siteShop: true,
            },
            site: site(null),
        });
        const t = text(html);
        expect(t).toContain("Ready for online orders 1 of 3");
        // Goal gradient: the done step comes first.
        expect(t.indexOf("Shipping on")).toBeLessThan(
            t.indexOf("Take payments online"),
        );
        expect(html).toMatch(
            /href="\/settings\/providers"[^>]*>Connect a provider/,
        );
        expect(html).toMatch(
            /href="\/sites\/site_1\/settings#sells-from"[^>]*>Turn on your shop/,
        );
    });

    it("folds to one quiet line once everything is done, keeping the shop's link", () => {
        const html = screen({
            storefronts: [summary(online)],
            selected: {
                ...online,
                fulfilmentTypes: ["LOCAL_DELIVERY"],
                effectiveProvider: "RAZORPAY",
                providers: [{ provider: "RAZORPAY", status: "CONNECTED" }],
            },
            site: site("st_online"),
        });
        expect(html).toContain('data-testid="location-ready"');
        expect(html).not.toContain('data-testid="location-readiness"');
        expect(text(html)).toContain("Ready for online orders");
        expect(html).toContain('href="https://rye.saroh.app/shop"');
    });

    it("a counter the shop sells from counts both, and links the live shop", () => {
        const html = screen({ site: site("st_hill") });
        expect(text(html)).toContain("Ready for the counter and online orders");
        expect(html).toContain('href="https://rye.saroh.app/shop"');
    });

    it("a counter that sells in person counts its address and hours, and says so", () => {
        const t = text(screen({ site: site("st_online") }));
        expect(t).toContain(
            "Ready for the counter 1 of 2 · Sells in person only",
        );
        expect(t).toContain("Address on receipts");
        expect(t).toContain("Save its opening hours");
        // The website couldn't be read: nothing said about selling.
        expect(text(screen())).not.toContain("Sells in person only");
    });

    it("a location past the plan's limit (#800) is not ready, and says why", () => {
        const t = text(screen({ notTakingOrders: [hill.id] }));
        expect(t).toContain("Not taking orders on your plan");
        expect(t).toContain("See Plan and billing");
    });

    it("a paused location counts its pause as a step left", () => {
        const paused = { ...hill, pausedAt: "2026-10-01T00:00:00Z" };
        expect(text(screen({ selected: paused }))).toContain(
            "Paused: customers can't pay here",
        );
        expect(text(screen({ selected: paused }, "pause-or-close"))).toContain(
            "Resume location",
        );
    });
});

describe("Payments", () => {
    it("says Not connected and links to connect one", () => {
        const html = screen({}, "payments");
        expect(text(html)).toContain("Online payments Not connected");
        expect(html).toMatch(/href="\/settings\/providers"/);
    });

    it("currency: no Editable pill; Locked only once it locks", () => {
        const unlocked = text(
            screen(
                { storefronts: [summary(online)], selected: online },
                "payments",
            ),
        );
        expect(unlocked).not.toContain("Editable");
        expect(unlocked).not.toContain("Locked");
        expect(unlocked).toContain("Locks after the first order.");
        expect(text(screen({}, "payments"))).toContain(
            "Locked by the 3 orders taken here",
        );
    });

    it("lists the providers only when there is a choice to make here", () => {
        const one = text(
            screen(
                {
                    selected: {
                        ...hill,
                        effectiveProvider: "RAZORPAY",
                        providers: [
                            { provider: "RAZORPAY", status: "CONNECTED" },
                        ],
                    },
                },
                "payments",
            ),
        );
        expect(one).toContain("Checkout here charges through Razorpay.");
        expect(one).not.toContain("In use here");
        const two = text(
            screen(
                {
                    selected: {
                        ...hill,
                        providers: [
                            { provider: "RAZORPAY", status: "CONNECTED" },
                            { provider: "CASHFREE", status: "CONNECTED" },
                        ],
                    },
                },
                "payments",
            ),
        );
        expect(two).toContain("Choose one");
        expect(two).toContain("Use here");
    });
});

describe("Delivery", () => {
    const delivery = (
        props: Partial<Parameters<typeof StorefrontsScreen>[0]>,
    ) => screen(props, "delivery");
    const summaryOf = (html: string, way: string) =>
        text(
            new RegExp(
                `data-testid="delivery-${way}-summary"[^>]*>(.*?)</span>`,
            ).exec(html)?.[1] ?? "",
        ).trim();

    it("reads first: a sentence per way, with Edit, and no open fields", () => {
        const html = delivery({
            selected: {
                ...hill,
                fulfilmentTypes: ["PICKUP", "LOCAL_DELIVERY", "SHIPPING"],
                siteShop: true,
                localDeliveryFee: "40.00",
                freeShippingThreshold: "999.00",
                lateAfterMinutes: {
                    PICKUP: 120,
                    LOCAL_DELIVERY: 1440,
                    SHIPPING: 2880,
                },
            },
        });
        expect(summaryOf(html, "local_delivery")).toBe(
            "₹40 · free over ₹999 · late after 24 h",
        );
        expect(summaryOf(html, "shipping")).toBe("Free · late after 2 days");
        expect(summaryOf(html, "pickup")).toBe("Free · late after 2 h");
        expect(html).not.toContain("<input");
        expect(html).not.toContain('role="switch"');
        expect(html.match(/>Edit</g)).toHaveLength(3);
        expect(text(html)).toContain("Your website checkout offers these.");
        expect(text(html)).toContain(
            "Bookings and digital products need none of these.",
        );
    });

    it("a way that is off says Off", () => {
        const html = delivery({
            selected: { ...hill, fulfilmentTypes: ["PICKUP"] },
        });
        expect(summaryOf(html, "shipping")).toBe("Off");
    });

    it("Pick-up where customers can't visit: Not offered, and the way to a counter", () => {
        const html = delivery({
            storefronts: [summary(online)],
            selected: online,
        });
        const t = text(html);
        expect(summaryOf(html, "pickup")).toBe("Not offered");
        expect(t).toContain("Customers can't visit this location.");
        expect(t).toContain("Add an address");
        // No Edit for it: there is nothing it could be turned on to.
        expect(html.match(/>Edit</g)).toHaveLength(2);
        // The 35-word warning is gone.
        expect(t).not.toContain("Choose Customers visit and add the address");
    });

    it("Pick-up saved on where customers can't visit: says so, and offers Turn off", () => {
        const html = delivery({
            storefronts: [summary(online)],
            selected: { ...online, fulfilmentTypes: ["PICKUP"] },
        });
        expect(text(html)).toContain(
            "Not on your website: customers can't visit this location.",
        );
        expect(text(html)).toContain("Turn off");
    });

    it("no fee to say while the online shop is closed", () => {
        const html = delivery({
            selected: {
                ...hill,
                fulfilmentTypes: ["SHIPPING"],
                shippingFee: "60.00",
            },
        });
        expect(summaryOf(html, "shipping")).toBe("On · late after 2 days");
        expect(text(html)).not.toContain("Your website checkout offers these");
    });

    it("the free-over amount isn't a way of its own", () => {
        const t = text(
            delivery({
                selected: {
                    ...hill,
                    fulfilmentTypes: ["LOCAL_DELIVERY"],
                    freeShippingThreshold: "999.00",
                    siteShop: true,
                },
            }),
        );
        expect(t).not.toContain("Free delivery over");
    });

    it("keeps the late-after anchor Orders' notice links to", () => {
        expect(delivery({})).toContain('id="late-after"');
    });

    it("read-only: the sentences, without Edit or Turn off", () => {
        const html = delivery({
            canEdit: false,
            storefronts: [summary(online)],
            selected: { ...online, fulfilmentTypes: ["PICKUP", "SHIPPING"] },
        });
        expect(html).not.toContain(">Edit<");
        expect(html).not.toContain(">Turn off<");
        expect(text(html)).not.toContain("Add an address");
    });

    it("the other Location tabs draw no card or visible title", () => {
        for (const section of [
            null,
            "payments",
            "customers",
            "pause-or-close",
        ]) {
            const html = screen({}, section);
            expect(panel(html)).not.toMatch(/rounded-xl/);
            expect(html).toMatch(/<h2[^>]*class="sr-only"/);
        }
    });
});

describe("roles", () => {
    it("read-only: says so, and offers no Save, Pause or in-page fixes", () => {
        const html = screen({ canEdit: false, canClose: false });
        const t = text(html);
        expect(t).toContain(
            "Your role can read these settings but not change them.",
        );
        expect(t).not.toContain("Save hours");
        expect(t).not.toContain("Set hours");
        expect(tabsOf(html).names).not.toContain("Pause or close");
    });
});
