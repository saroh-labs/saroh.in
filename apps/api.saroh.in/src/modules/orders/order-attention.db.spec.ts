/**
 * Needs attention on orders (B15), and who sees the customer's own phone and
 * email on an order (review #19), against a real Postgres.
 *
 * Three callers, as the permission matrix draws them:
 * - the owner: sensitive entries too, and the customer's phone and email;
 * - a Member at the counter (`order:stage`, `contact:read`, no
 *   `contact:write`): non-sensitive entries, phone and email;
 * - a custom kitchen role (`order:stage` alone): non-sensitive entries, the
 *   delivery phone, and never the customer's own phone or email.
 *
 * Runs in the integration project (TEST_DATABASE_URL).
 */
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { resolveCapabilities } from "../organizations/organization-policy";
import { OrderKitchenService } from "./order-kitchen.service";
import type { OrderListCaller, OrderListQuery } from "./order-list";
import { listOrderRows } from "./order-list";
import { quickViewOf } from "./order-row";

const NOW = new Date("2026-09-27T06:30:00.000Z");
const kitchenService = new OrderKitchenService();

let orgId: string;
let otherOrgId: string;
let store: string;
let owner: OrganizationContext;
let member: OrganizationContext;
let packer: OrganizationContext;
let sesame: string;
let sesameAtOther: string;

/** Customer id → order id, by name. */
const orders: Record<string, string> = {};
const customers: Record<string, string> = {};
const contacts: Record<string, string> = {};
let seq = 0;

async function person(
    name: string,
    entries: {
        kind: "ALLERGY" | "MEDICAL" | "ACCESS" | "OTHER";
        label: string;
        detail?: string;
        sensitive?: boolean;
        allergenId?: string;
        status?: "ACTIVE" | "SUGGESTED";
    }[],
    linked = true,
): Promise<void> {
    seq += 1;
    const customer = await prisma.customer.create({
        data: {
            storeId: store,
            organizationId: orgId,
            email: `${name.toLowerCase()}@example.in`,
            firstName: name,
            phone: `+9198450000${String(seq).padStart(2, "0")}`,
        },
    });
    customers[name] = customer.id;
    if (linked) {
        const contact = await prisma.contact.create({
            data: {
                organizationId: orgId,
                email: `${name.toLowerCase()}@example.in`,
                firstName: name,
            },
        });
        contacts[name] = contact.id;
        await prisma.customerIdentityLink.create({
            data: {
                organizationId: orgId,
                contactId: contact.id,
                customerId: customer.id,
            },
        });
        for (const e of entries) {
            await prisma.contactAttention.create({
                data: {
                    organizationId: orgId,
                    contactId: contact.id,
                    kind: e.kind,
                    label: e.label,
                    detail: e.detail ?? null,
                    sensitive: e.sensitive ?? false,
                    allergenId: e.allergenId ?? null,
                    status: e.status ?? "ACTIVE",
                },
            });
        }
    }
    const order = await prisma.order.create({
        data: {
            storeId: store,
            organizationId: orgId,
            orderId: `B15-${String(seq).padStart(4, "0")}`,
            customerId: customer.id,
            subtotal: "250.00",
            total: "250.00",
            currency: "INR",
            status: "PENDING",
            paymentStatus: "PAID",
            stage: "NEW",
            fulfilment: "LOCAL_DELIVERY",
            deliveryName: name,
            deliveryPhone: "+919900000001",
            deliveryLine1: "12 Hill Road",
            deliveryCity: "Bengaluru",
            createdAt: new Date(NOW.getTime() - seq * 60_000),
        },
    });
    orders[name] = order.id;
}

const list = (caller: OrderListCaller, query: OrderListQuery = {}) =>
    listOrderRows(orgId, query, caller, NOW);
const asOwner: () => OrderListCaller = () => ({
    money: true,
    contact: true,
    viewer: owner,
});
const asMember: () => OrderListCaller = () => ({
    money: false,
    contact: true,
    viewer: member,
});
const asPacker: () => OrderListCaller = () => ({
    money: false,
    contact: false,
    viewer: packer,
});

async function rowOf(caller: OrderListCaller, name: string) {
    const page = await list(caller);
    const row = page.rows.find((r) => r.id === orders[name]);
    if (!row) throw new Error(`no row for ${name}`);
    return row;
}

async function namesFiltered(caller: OrderListCaller, attention: boolean) {
    const page = await list(caller, { attention });
    const byOrder = new Map(Object.entries(orders).map(([n, id]) => [id, n]));
    return page.rows.map((r) => byOrder.get(r.id)).sort();
}

beforeAll(async () => {
    const org = await prisma.organization.create({
        data: { name: "Kavi Dental", slug: `b15-attention-${process.pid}` },
    });
    orgId = org.id;
    store = (
        await prisma.store.create({
            data: {
                name: "Indiranagar",
                slug: `b15-store-${process.pid}`,
                organizationId: orgId,
            },
        })
    ).id;
    sesame = (
        await prisma.storeAllergen.create({
            data: { organizationId: orgId, name: "Sesame" },
        })
    ).id;
    // The same allergen, typed again: an order is matched on both.
    sesameAtOther = (
        await prisma.storeAllergen.create({
            data: { organizationId: orgId, name: "sesame", position: 1 },
        })
    ).id;

    owner = { organizationId: orgId, userId: "user_owner", role: "OWNER" };
    member = {
        organizationId: orgId,
        userId: "user_member",
        role: "MEMBER",
        actions: resolveCapabilities("MEMBER"),
    };
    packer = {
        organizationId: orgId,
        userId: "user_packer",
        role: "MEMBER",
        roleKey: "packer",
        actions: resolveCapabilities("packer", ["org:read", "order:stage"]),
    };

    await person("Asha", [
        { kind: "MEDICAL", label: "Pregnant", sensitive: true },
        {
            kind: "ALLERGY",
            label: "Sesame",
            detail: "Allergic to sesame",
            allergenId: sesame,
        },
    ]);
    await person("Bea", [
        { kind: "MEDICAL", label: "Blood thinners", sensitive: true },
    ]);
    await person("Cai", [], false);
    await person("Dev", [
        { kind: "ACCESS", label: "Anxious patient", status: "SUGGESTED" },
    ]);

    // Another business's person with the same email: never read here.
    const other = await prisma.organization.create({
        data: { name: "Elsewhere", slug: `b15-other-${process.pid}` },
    });
    otherOrgId = other.id;
    const theirs = await prisma.contact.create({
        data: {
            organizationId: otherOrgId,
            email: "cai@example.in",
            firstName: "Cai",
        },
    });
    await prisma.contactAttention.create({
        data: {
            organizationId: otherOrgId,
            contactId: theirs.id,
            kind: "ALLERGY",
            label: "Peanuts",
        },
    });
});

describe("the Orders list's attention (B15)", () => {
    it("the owner sees every active entry, Allergy first, sensitive too", async () => {
        const row = await rowOf(asOwner(), "Asha");
        expect(row.attention?.map((a) => `${a.kind}: ${a.label}`)).toEqual([
            "ALLERGY: Sesame",
            "MEDICAL: Pregnant",
        ]);
        expect((await rowOf(asOwner(), "Bea")).attention).toEqual([
            expect.objectContaining({
                kind: "MEDICAL",
                label: "Blood thinners",
            }),
        ]);
    });

    it("without the sensitive permission a Medical entry is absent, not hidden", async () => {
        const asha = await rowOf(asMember(), "Asha");
        expect(asha.attention).toEqual([
            {
                id: expect.any(String),
                kind: "ALLERGY",
                label: "Sesame",
                detail: "Allergic to sesame",
                source: "STAFF",
            },
        ]);
        expect(JSON.stringify(asha)).not.toContain("Pregnant");
        // A sensitive-only person has no tag for them.
        expect((await rowOf(asMember(), "Bea")).attention).toEqual([]);
    });

    it("the kitchen sees the allergy, even without contact:read", async () => {
        const asha = await rowOf(asPacker(), "Asha");
        expect(asha.attention?.map((a) => a.label)).toEqual(["Sesame"]);
    });

    it("an unlinked customer, and a suggestion not yet confirmed, have none", async () => {
        expect((await rowOf(asOwner(), "Cai")).attention).toEqual([]);
        expect((await rowOf(asOwner(), "Dev")).attention).toEqual([]);
    });

    it("rows listed without a caller carry no attention field", async () => {
        const page = await list({ money: true, contact: true });
        expect(page.rows.every((r) => !("attention" in r))).toBe(true);
    });

    it("the filter keeps the orders with an entry this caller may see", async () => {
        expect(await namesFiltered(asOwner(), true)).toEqual(["Asha", "Bea"]);
        expect(await namesFiltered(asOwner(), false)).toEqual(["Cai", "Dev"]);
        // A sensitive-only entry doesn't match for anyone else.
        expect(await namesFiltered(asMember(), true)).toEqual(["Asha"]);
        expect(await namesFiltered(asMember(), false)).toEqual([
            "Bea",
            "Cai",
            "Dev",
        ]);
        expect(await namesFiltered(asPacker(), true)).toEqual(["Asha"]);
    });

    it("the tab counts follow the filter", async () => {
        const page = await list(asMember(), { attention: true });
        expect(page.counts.all).toBe(1);
    });

    it("the tag goes when the entry is removed", async () => {
        const entry = await prisma.contactAttention.findFirstOrThrow({
            where: { contactId: contacts.Bea },
        });
        await prisma.contactAttention.update({
            where: { id: entry.id },
            data: { removedAt: NOW },
        });
        try {
            expect((await rowOf(asOwner(), "Bea")).attention).toEqual([]);
            expect(await namesFiltered(asOwner(), true)).toEqual(["Asha"]);
        } finally {
            await prisma.contactAttention.update({
                where: { id: entry.id },
                data: { removedAt: null },
            });
        }
    });

    it("the customer's own phone and email only with contact:read", async () => {
        const kitchen = await rowOf(asPacker(), "Asha");
        expect(kitchen.customer).toEqual({
            id: customers.Asha,
            name: "Asha",
        });
        const counter = await rowOf(asMember(), "Asha");
        expect(counter.customer).toMatchObject({
            email: "asha@example.in",
            phone: expect.stringMatching(/^\+91/),
        });
    });
});

describe("the order read's attention and contact (B15, review #19)", () => {
    it("the owner: sensitive entries, the phone and the email", async () => {
        const read = await kitchenService.read(owner, orders.Asha);
        expect(read.customer).toMatchObject({
            email: "asha@example.in",
            phone: expect.stringMatching(/^\+91/),
            contactId: contacts.Asha,
        });
        expect(read.attention?.hiddenSensitiveCount).toBe(0);
        expect(read.attention?.entries.map((e) => e.label)).toEqual([
            "Sesame",
            "Pregnant",
        ]);
    });

    it("the counter: the allergy with every allergen it matches, and a count of what it can't see", async () => {
        const read = await kitchenService.read(member, orders.Asha);
        // contact:read gives the phone and the email (a Member holds it).
        expect(read.customer?.phone).toMatch(/^\+91/);
        expect(read.customer?.email).toMatch(/@example\.in$/);
        expect(read.attention).toEqual({
            entries: [
                expect.objectContaining({
                    kind: "ALLERGY",
                    label: "Sesame",
                    sensitive: false,
                    allergen: { id: sesame, name: "Sesame" },
                    matchAllergens: expect.arrayContaining([
                        { id: sesame, name: "Sesame" },
                        { id: sesameAtOther, name: "sesame" },
                    ]),
                }),
            ],
            hiddenSensitiveCount: 1,
        });
        expect(JSON.stringify(read)).not.toContain("Pregnant");
    });

    it("the kitchen without contact:read: the delivery phone, never the customer's own", async () => {
        const read = await kitchenService.read(packer, orders.Asha);
        expect(read.customer?.phone).toBeNull();
        expect(read.customer).not.toHaveProperty("email");
        expect(read.deliveryAddress?.phone).toBe("+919900000001");
        expect(read.money).toBeNull();
        expect(read.attention?.entries.map((e) => e.label)).toEqual(["Sesame"]);
        expect(JSON.stringify(read)).not.toContain("asha@example.in");
    });

    it("the quick view says no more of the customer than the row", async () => {
        const read = await kitchenService.read(packer, orders.Asha);
        const quick = quickViewOf(read, { contact: false });
        expect(quick.customer?.phone).toBeNull();
        expect(quick.customer).not.toHaveProperty("email");
        expect(quick.deliveryAddress?.phone).toBe("+919900000001");
        expect(quick.attention?.entries.map((e) => e.label)).toEqual([
            "Sesame",
        ]);
    });

    it("a customer linked to two people carries both people's entries", async () => {
        const second = await prisma.contact.create({
            data: {
                organizationId: orgId,
                email: "asha.work@example.in",
                firstName: "Asha",
            },
        });
        await prisma.customerIdentityLink.create({
            data: {
                organizationId: orgId,
                contactId: second.id,
                customerId: customers.Asha,
            },
        });
        await prisma.contactAttention.create({
            data: {
                organizationId: orgId,
                contactId: second.id,
                kind: "ACCESS",
                label: "Wheelchair",
            },
        });
        try {
            const read = await kitchenService.read(member, orders.Asha);
            expect(read.attention?.entries.map((e) => e.label)).toEqual([
                "Sesame",
                "Wheelchair",
            ]);
            expect(
                (await rowOf(asMember(), "Asha")).attention?.map(
                    (a) => a.label,
                ),
            ).toEqual(["Sesame", "Wheelchair"]);
        } finally {
            await prisma.contact.delete({ where: { id: second.id } });
        }
    });

    it("an unlinked customer reads an empty list, never another business's entry", async () => {
        const read = await kitchenService.read(owner, orders.Cai);
        expect(read.attention).toEqual({
            entries: [],
            hiddenSensitiveCount: 0,
        });
    });
});
