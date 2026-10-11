/**
 * What a location's read says the caller may do there (`abilities`), against
 * what the guards decide (UX audit, 10 Oct 2026). Prisma and the flag are
 * doubles, so nothing touches a database.
 *
 * Two things are pinned. The matrix: a location Admin, Manager or Editor
 * edits the location and takes and changes its orders, never the money
 * (DEC-106); a Viewer does none of it. And the agreement: for every kind
 * of caller, each answer equals the guard's own function called the way
 * the write calls it, so the app can never be told something the write
 * would refuse.
 */
jest.mock("@saroh/database", () => ({
    prisma: {
        store: { findFirst: jest.fn(), findUnique: jest.fn() },
        membership: { findUnique: jest.fn() },
        organizationRole: { findUnique: jest.fn() },
        storeOwner: { findUnique: jest.fn() },
        storeMembers: { findUnique: jest.fn() },
        // `assertMemberNotPaused` asks the plan nothing when it has no row.
        organizationSubscription: { findUnique: jest.fn() },
    },
}));
jest.mock("../organizations/member-paused", () => ({
    assertMemberNotPaused: jest.fn().mockResolvedValue(undefined),
}));

import { prisma } from "@saroh/database";

import type { FeatureFlagService } from "../feature-flags/feature-flags.service";
import type { LocationAbilities } from "./stores.service";
import { StoresService } from "./stores.service";

const storeFindFirst = prisma.store.findFirst as jest.Mock;
const membershipFindUnique = prisma.membership.findUnique as jest.Mock;
const roleFindUnique = prisma.organizationRole.findUnique as jest.Mock;
const ownerFindUnique = prisma.storeOwner.findUnique as jest.Mock;
const memberFindUnique = prisma.storeMembers.findUnique as jest.Mock;

/**
 * What a location invitation's business role holds (`@saroh/database`,
 * which is a double here): the storefronts and the kitchen's view of an
 * order, and no order write of its own.
 */
const STOREFRONT_TEAM_ACTIONS = [
    "org:read",
    "member:read",
    "module:read",
    "media:read",
    "store:read",
    "product-review:read",
    "order:stage",
] as const;

const STORE = "store_1";
const USER = "user_1";

interface Caller {
    /** Their role in the business; null is nobody on the team. */
    business?: string | null;
    /** What a role the business made holds. */
    stored?: readonly string[];
    /** Their role at this location. */
    location?: "ADMIN" | "MANAGER" | "EDITOR" | "VIEWER" | null;
    /** A `StoreOwner` row from the older model. */
    owner?: boolean;
}

function given(caller: Caller) {
    storeFindFirst.mockResolvedValue({ id: STORE, organizationId: "org_1" });
    membershipFindUnique.mockResolvedValue(
        caller.business
            ? {
                  id: "m_1",
                  role: caller.business,
                  extraActions: [],
                  organization: { lifecycleStatus: "ACTIVE" },
              }
            : null,
    );
    roleFindUnique.mockResolvedValue(
        caller.stored ? { actions: caller.stored } : null,
    );
    ownerFindUnique.mockResolvedValue(caller.owner ? { id: "o_1" } : null);
    memberFindUnique.mockResolvedValue(
        caller.location ? { role: caller.location } : null,
    );
}

const service = (orgPath: boolean) =>
    new StoresService({
        isEnabled: jest.fn().mockResolvedValue(orgPath),
    } as unknown as FeatureFlagService);

/** Someone a location invitation put on the team, at a location role. */
const onLocation = (location: Caller["location"]): Caller => ({
    business: "storefront-team",
    stored: STOREFRONT_TEAM_ACTIONS,
    location,
});

const NOTHING: LocationAbilities = {
    edit: false,
    takeOrders: false,
    takePayments: false,
    changeOrders: false,
};
/** A location role that writes: the place and its orders, never money. */
const NO_MONEY: LocationAbilities = {
    edit: true,
    takeOrders: true,
    takePayments: false,
    changeOrders: true,
};
const EVERYTHING: LocationAbilities = {
    edit: true,
    takeOrders: true,
    takePayments: true,
    changeOrders: true,
};

beforeEach(() => jest.clearAllMocks());

describe("StoresService.abilities, on the organization path", () => {
    it.each(["ADMIN", "MANAGER", "EDITOR"] as const)(
        "a location %s edits the location and takes and changes its orders, never the money",
        async (role) => {
            given(onLocation(role));
            await expect(service(true).abilities(STORE, USER)).resolves.toEqual(
                NO_MONEY,
            );
        },
    );

    it("a location Viewer does none of it", async () => {
        given(onLocation("VIEWER"));
        await expect(service(true).abilities(STORE, USER)).resolves.toEqual(
            NOTHING,
        );
    });

    it("someone on the team with no role at this location does none of it", async () => {
        given(onLocation(null));
        await expect(service(true).abilities(STORE, USER)).resolves.toEqual(
            NOTHING,
        );
    });

    it("the business's owner and admin do all of it", async () => {
        for (const business of ["OWNER", "ADMIN"]) {
            given({ business });
            await expect(service(true).abilities(STORE, USER)).resolves.toEqual(
                EVERYTHING,
            );
        }
    });

    it("a Member, who stages orders and changes nothing, does none of it", async () => {
        given({ business: "MEMBER" });
        await expect(service(true).abilities(STORE, USER)).resolves.toEqual(
            NOTHING,
        );
    });

    it("a made role with order:create takes orders and their money, and still can't edit the location", async () => {
        given({
            business: "counter",
            stored: ["store:read", "order:read", "order:create"],
        });
        await expect(service(true).abilities(STORE, USER)).resolves.toEqual({
            edit: false,
            takeOrders: true,
            takePayments: true,
            changeOrders: false,
        });
    });

    it("a location Editor whose business role carries order:create takes the money too", async () => {
        given({
            business: "counter",
            stored: [...STOREFRONT_TEAM_ACTIONS, "order:create"],
            location: "EDITOR",
        });
        await expect(service(true).abilities(STORE, USER)).resolves.toEqual(
            EVERYTHING,
        );
    });

    it("a StoreOwner row is no way to the money here", async () => {
        given({ owner: true });
        await expect(service(true).abilities(STORE, USER)).resolves.toEqual(
            NO_MONEY,
        );
    });
});

describe("StoresService.abilities, on the older per-location path", () => {
    it("the location's owner does all of it, money included", async () => {
        given({ owner: true });
        await expect(service(false).abilities(STORE, USER)).resolves.toEqual(
            EVERYTHING,
        );
    });

    it("a location Editor writes, without the money", async () => {
        given({ location: "EDITOR" });
        await expect(service(false).abilities(STORE, USER)).resolves.toEqual(
            NO_MONEY,
        );
    });

    it("a location Viewer does none of it", async () => {
        given({ location: "VIEWER" });
        await expect(service(false).abilities(STORE, USER)).resolves.toEqual(
            NOTHING,
        );
    });
});

describe("StoresService.abilities never disagrees with the guards", () => {
    const callers: [string, Caller][] = [
        ["nobody", {}],
        ["owner", { business: "OWNER" }],
        ["admin", { business: "ADMIN" }],
        ["member", { business: "MEMBER" }],
        ["reviewer", { business: "REVIEWER" }],
        ["location admin", onLocation("ADMIN")],
        ["location manager", onLocation("MANAGER")],
        ["location editor", onLocation("EDITOR")],
        ["location viewer", onLocation("VIEWER")],
        ["on the team, off the location", onLocation(null)],
        ["store owner row", { owner: true }],
        [
            "made role with order:edit",
            { business: "floor", stored: ["store:read", "order:edit"] },
        ],
        [
            "made role with store:write",
            { business: "keeper", stored: ["store:read", "store:write"] },
        ],
    ];

    for (const orgPath of [true, false]) {
        it.each(callers)(
            `%s (organization path ${orgPath ? "on" : "off"})`,
            async (_name, caller) => {
                given(caller);
                const stores = service(orgPath);
                const said = await stores.abilities(STORE, USER);
                // Each asked as its write asks it: `PUT stores/:id`
                // (`LocationLogoService.update`), `OrdersService.create`
                // with and without a payment, and `updateStatus`.
                const guards: LocationAbilities = {
                    edit:
                        (await stores.writableOrganization(STORE, USER)) !==
                        null,
                    takeOrders:
                        (await stores.orderWriteOrganization(
                            STORE,
                            USER,
                            "order:create",
                            { money: false },
                        )) !== null,
                    takePayments:
                        (await stores.orderWriteOrganization(
                            STORE,
                            USER,
                            "order:create",
                            { money: true },
                        )) !== null,
                    changeOrders:
                        (await stores.orderWriteOrganization(
                            STORE,
                            USER,
                            "order:edit",
                        )) !== null,
                };
                expect(said).toEqual(guards);
            },
        );
    }

    it("a location that isn't there says nothing can be done", async () => {
        storeFindFirst.mockResolvedValue(null);
        await expect(service(true).abilities(STORE, USER)).resolves.toEqual(
            NOTHING,
        );
    });
});
