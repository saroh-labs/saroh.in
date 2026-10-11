/**
 * What a location's read says the caller may do there, against the writes
 * themselves, on a real Postgres (UX audit, 10 Oct 2026).
 *
 * One person per location role, joined to the team as a location
 * invitation joins them (`joinTeamFromStorefront`), plus the owner and a
 * Member. For each, `GET stores/:id` is read and then every write it
 * speaks of is tried: the rename (`PUT stores/:id`), a new order with
 * nothing paid, a new order paid in cash, and a status change. What the
 * read said and what happened must be the same thing, at the location they
 * work at and at one they don't.
 *
 * Runs in the integration project (TEST_DATABASE_URL), which empties the
 * tables after each file. ORG_AUTHORIZATION is on, as it is in production.
 */
import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { prisma } from "@saroh/database";
import { createMemoryStorage } from "@saroh/object-storage";

import type { FeatureFlagService } from "../feature-flags/feature-flags.service";
import { MediaService } from "../media/media.service";
import type { CreateOrderDto } from "../orders/dto";
import { OrdersService } from "../orders/orders.service";
import { joinTeamFromStorefront } from "../organizations/storefront-team-role";
import { ProductsService } from "../products/products.service";

import { LocationLogoService } from "./location-logo.service";
import type { LocationAbilities } from "./stores.service";
import { StoresService } from "./stores.service";

const tag = `locabil-${process.pid}-${Date.now()}`;
const flags = {
    isEnabled: () => Promise.resolve(true),
} as unknown as FeatureFlagService;
const stores = new StoresService(flags);
const products = new ProductsService(stores);
const orders = new OrdersService(stores);
const locations = new LocationLogoService(
    stores,
    new MediaService(
        createMemoryStorage({ publicBaseUrl: "https://media.saroh.test" }),
    ),
);

type LocationRole = "ADMIN" | "MANAGER" | "EDITOR" | "VIEWER";

let orgId = "";
let ownerId = "";
let memberId = "";
const hill = { id: "", product: "" };
const market = { id: "", product: "" };
const people = {} as Record<LocationRole, string>;

async function storefront(name: string, slug: string, into: typeof hill) {
    into.id = (
        await stores.createForUser(ownerId, orgId, {
            name,
            slug: `${tag}-${slug}`,
        })
    ).id;
    await prisma.storeSettings.upsert({
        where: { storeId: into.id },
        create: {
            storeId: into.id,
            currency: "INR",
            fulfilmentTypes: ["PICKUP"],
            collectionEnabled: true,
        },
        update: { currency: "INR", fulfilmentTypes: ["PICKUP"] },
    });
    into.product = (
        await products.create(into.id, ownerId, {
            name: `${name} loaf`,
            price: "180",
        })
    ).id;
}

/** Someone invited to Hill Road at a location role. */
async function onHill(role: LocationRole): Promise<string> {
    const userId = (
        await prisma.user.create({
            data: { email: `${tag}-${role.toLowerCase()}@example.com` },
        })
    ).id;
    await prisma.$transaction(async (tx) => {
        await tx.storeMembers.create({
            data: { storeId: hill.id, userId, role },
        });
        await joinTeamFromStorefront(tx, {
            organizationId: orgId,
            userId,
            store: { id: hill.id, name: "Hill Road" },
            source: "invite",
            actorUserId: userId,
        });
    });
    return userId;
}

/**
 * Whether the write's guard let this person through. A 403, or the 404 a
 * location they can't write answers with, is the guard saying no. Anything
 * else (the order's own rules about what step may follow which) is past
 * the guard, which is all the read speaks of.
 */
async function tried(run: () => Promise<unknown>): Promise<boolean> {
    try {
        await run();
        return true;
    } catch (error) {
        return !(
            error instanceof ForbiddenException ||
            error instanceof NotFoundException
        );
    }
}

const order = (
    store: typeof hill,
    payment: CreateOrderDto["payment"],
): CreateOrderDto =>
    ({
        items: [{ productId: store.product, quantity: 1 }],
        fulfilment: "PICKUP",
        walkIn: { name: "Asha" },
        payment,
    }) as CreateOrderDto;

/** Every write the read speaks of, tried as this person at this location. */
async function happens(
    userId: string,
    store: typeof hill,
    name: string,
): Promise<LocationAbilities> {
    const edit = await tried(() =>
        locations.update(userId, store.id, { name }),
    );
    const takeOrders = await tried(() =>
        orders.create(store.id, userId, order(store, { kind: "LATER" })),
    );
    const takePayments = await tried(() =>
        orders.create(
            store.id,
            userId,
            order(store, { kind: "CASH", received: "180" }),
        ),
    );
    // An order of the owner's to change: its status, never its payment.
    const made = await orders.create(
        store.id,
        ownerId,
        order(store, { kind: "LATER" }),
    );
    const changeOrders = await tried(() =>
        orders.updateStatus(store.id, made.id, userId, {
            status: "PROCESSING",
        }),
    );
    return { edit, takeOrders, takePayments, changeOrders };
}

/** What the location's read says, or nothing at all for a 404. */
async function said(
    userId: string,
    store: typeof hill,
): Promise<LocationAbilities | null> {
    try {
        return (await locations.read(userId, store.id)).abilities;
    } catch (error) {
        if (error instanceof NotFoundException) return null;
        throw error;
    }
}

const NOTHING: LocationAbilities = {
    edit: false,
    takeOrders: false,
    takePayments: false,
    changeOrders: false,
};

beforeAll(async () => {
    ownerId = (
        await prisma.user.create({
            data: { email: `${tag}-owner@example.com` },
        })
    ).id;
    orgId = (
        await prisma.organization.create({
            data: { name: "Northwind Bakes", slug: `${tag}-org` },
        })
    ).id;
    await prisma.membership.create({
        data: { organizationId: orgId, userId: ownerId, role: "OWNER" },
    });
    await storefront("Hill Road", "hill", hill);
    await storefront("Market", "market", market);
    for (const role of ["ADMIN", "MANAGER", "EDITOR", "VIEWER"] as const) {
        people[role] = await onHill(role);
    }
    memberId = (
        await prisma.user.create({
            data: { email: `${tag}-member@example.com` },
        })
    ).id;
    await prisma.membership.create({
        data: { organizationId: orgId, userId: memberId, role: "MEMBER" },
    });
});

describe("what a location's read says its people may do (real database)", () => {
    it.each(["ADMIN", "MANAGER", "EDITOR"] as const)(
        "a location %s renames it and takes and changes its orders, never the money",
        async (role) => {
            const read = await said(people[role], hill);
            expect(read).toEqual({
                edit: true,
                takeOrders: true,
                takePayments: false,
                changeOrders: true,
            });
            expect(await happens(people[role], hill, "Hill Road")).toEqual(
                read,
            );
        },
    );

    it("a location Viewer is told nothing can be changed, and nothing can", async () => {
        const read = await said(people.VIEWER, hill);
        expect(read).toEqual(NOTHING);
        expect(await happens(people.VIEWER, hill, "Hill Road")).toEqual(read);
    });

    it("at a location they don't work at, each is told and can do nothing", async () => {
        for (const role of ["ADMIN", "VIEWER"] as const) {
            // The team role reads every location; it writes only its own.
            const read = await said(people[role], market);
            expect(read).toEqual(NOTHING);
            expect(await happens(people[role], market, "Market")).toEqual(
                NOTHING,
            );
        }
    });

    it("the owner is told all of it, and all of it goes through", async () => {
        const read = await said(ownerId, hill);
        expect(read).toEqual({
            edit: true,
            takeOrders: true,
            takePayments: true,
            changeOrders: true,
        });
        expect(await happens(ownerId, hill, "Hill Road")).toEqual(read);
    });

    it("a Member is told nothing can be changed, and nothing can", async () => {
        const read = await said(memberId, hill);
        expect(read).toEqual(NOTHING);
        expect(await happens(memberId, hill, "Hill Road")).toEqual(read);
    });

    it("a rename by a location Editor is saved", async () => {
        await locations.update(people.EDITOR, hill.id, { name: "Hill Rd" });
        const store = await prisma.store.findUnique({
            where: { id: hill.id },
            select: { name: true },
        });
        expect(store?.name).toBe("Hill Rd");
    });
});
