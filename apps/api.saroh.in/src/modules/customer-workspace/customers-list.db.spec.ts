/**
 * The Customers list (DEC-041, C3) against a real Postgres: who is a
 * customer, "Spent" agreeing with Customer Detail, the chips and their
 * counts, search, "Bought at", paging, the paying store customers the list
 * can't show yet, and what each role's rows carry. Runs in the integration
 * project (TEST_DATABASE_URL).
 */
import { prisma } from "@saroh/database";

import { analyzeAsOwner } from "../../../test/analyze";

import type { OrganizationContext } from "../../common/types/organization-context";
import type { ModuleAvailabilityService } from "../capabilities/module-availability.service";
import {
    reservedAccountEmail,
    reservedMergedEmail,
    reservedRemovedEmail,
} from "../contacts/contact-email";
import { CustomerDetailService } from "./customer-detail.service";
import { CustomerWorkspaceService } from "./customer-workspace.service";
import { CustomersListService } from "./customers-list.service";

const tag = `${process.pid}-${Date.now()}`;

const availability = {
    listViews: jest.fn().mockResolvedValue(
        ["CRM", "COMMERCE", "APPOINTMENTS", "PAYMENTS"].map((key) => ({
            key,
            readiness: "ACTIVE",
        })),
    ),
} as unknown as ModuleAvailabilityService;

const list = new CustomersListService();
const details = new CustomerDetailService(availability);
const workspace = new CustomerWorkspaceService(availability);

let seq = 0;
const next = () => `${tag}-${++seq}`;

async function makeOrg(name: string) {
    const org = await prisma.organization.create({
        data: { name, slug: `list-${next()}` },
    });
    return org.id;
}

async function makeStore(organizationId: string, name: string) {
    return (
        await prisma.store.create({
            data: { name, slug: `list-store-${next()}`, organizationId },
        })
    ).id;
}

async function makeContact(
    organizationId: string,
    data: {
        email?: string;
        firstName?: string;
        lastName?: string;
        phone?: string;
    } = {},
) {
    return (
        await prisma.contact.create({
            data: {
                organizationId,
                email: data.email ?? `c-${next()}@example.com`,
                firstName: data.firstName,
                lastName: data.lastName,
                phone: data.phone,
            },
        })
    ).id;
}

async function makeStoreCustomer(
    organizationId: string,
    storeId: string,
    email: string,
    firstName?: string,
) {
    return (
        await prisma.customer.create({
            data: { storeId, organizationId, email, firstName },
        })
    ).id;
}

async function makeOrder(
    organizationId: string,
    storeId: string,
    customerId: string,
    data: {
        total: string;
        paymentStatus?: string;
        status?: string;
        createdAt?: Date;
        shipping?: string;
    },
) {
    return (
        await prisma.order.create({
            data: {
                storeId,
                organizationId,
                customerId,
                orderId: `ORD-${next()}`,
                subtotal: data.total,
                shipping: data.shipping ?? "0",
                total: data.total,
                currency: "INR",
                paymentStatus: data.paymentStatus ?? "PAID",
                status: data.status ?? "DELIVERED",
                createdAt: data.createdAt,
            },
        })
    ).id;
}

async function paidInvoice(
    organizationId: string,
    contactId: string,
    total: string,
    extra: { orderId?: string; kind?: string; status?: string } = {},
) {
    await prisma.invoice.create({
        data: {
            organizationId,
            contactId,
            orderId: extra.orderId,
            kind: extra.kind ?? "INVOICE",
            status: extra.status ?? "PAID",
            number: `INV-${next()}`,
            currency: "INR",
            subtotal: total,
            total,
            paidAt: new Date(),
        },
    });
}

function ownerCtx(organizationId: string, userId: string): OrganizationContext {
    return { organizationId, userId, role: "OWNER" };
}

describe("Customers list (DB)", () => {
    let ownerId = "";
    let memberId = "";
    let org = "";
    let otherOrg = "";
    let market = "";
    let online = "";
    let ctx: OrganizationContext;
    let member: OrganizationContext;

    // People
    let asha = ""; // two paid orders (one refunded), a paid plan invoice, a sensitive note
    let ravi = ""; // one open order at the online storefront, offers yes
    let meera = ""; // signs in on the site, never paid
    let kiran = ""; // account's separate contact, placeholder email
    let known = ""; // CRM contact holding an unlinked paying customer's email
    let crmOnly = ""; // a lead, never paid
    let tombstone = "";
    let removed = "";
    let unlinkedCustomer = "";

    beforeAll(async () => {
        ownerId = (
            await prisma.user.create({
                data: { email: `list-owner-${tag}@example.com` },
            })
        ).id;
        memberId = (
            await prisma.user.create({
                data: { email: `list-member-${tag}@example.com` },
            })
        ).id;
        org = await makeOrg("Rye & Co.");
        otherOrg = await makeOrg("Elsewhere");
        ctx = ownerCtx(org, ownerId);
        member = { organizationId: org, userId: memberId, role: "MEMBER" };
        market = await makeStore(org, "Hill Road");
        online = await makeStore(org, "Online");

        // Asha: linked store customer at Hill Road with a paid order (450,
        // delivery included) and its own paid invoice, a refunded order, and
        // a paid subscription invoice of 1600, plus a credit note.
        asha = await makeContact(org, {
            email: "asha@example.com",
            firstName: "Asha",
            lastName: "Rao",
            phone: "+91 98450 12345",
        });
        const ashaStore = await makeStoreCustomer(
            org,
            market,
            "asha@example.com",
            "Asha",
        );
        await workspace.link(ctx, asha, ashaStore);
        const paidOrder = await makeOrder(org, market, ashaStore, {
            total: "450",
            shipping: "50",
            createdAt: new Date("2026-09-01T10:00:00Z"),
        });
        await paidInvoice(org, asha, "450", { orderId: paidOrder });
        await makeOrder(org, market, ashaStore, {
            total: "300",
            paymentStatus: "REFUNDED",
            createdAt: new Date("2026-09-10T10:00:00Z"),
        });
        await paidInvoice(org, asha, "1600");
        await paidInvoice(org, asha, "100", { kind: "CREDIT_NOTE" });
        const plan = await prisma.subscriptionPlan.create({
            data: {
                organizationId: org,
                name: "Bread club",
                price: "1600",
                currency: "INR",
                interval: "MONTH",
            },
        });
        const now = new Date();
        await prisma.customerSubscription.create({
            data: {
                organizationId: org,
                planId: plan.id,
                contactId: asha,
                price: "1600",
                currency: "INR",
                interval: "MONTH",
                timezone: "Asia/Kolkata",
                anchorAt: now,
                currentPeriodStart: now,
                currentPeriodEnd: new Date(now.getTime() + 30 * 86400000),
            },
        });
        await prisma.contactAttention.create({
            data: {
                organizationId: org,
                contactId: asha,
                kind: "MEDICAL",
                label: "Pregnant",
                sensitive: true,
            },
        });

        // Ravi: an open order online, and yes to offers.
        ravi = await makeContact(org, {
            email: "ravi@example.com",
            firstName: "Ravi",
        });
        const raviStore = await makeStoreCustomer(
            org,
            online,
            "ravi@example.com",
        );
        await workspace.link(ctx, ravi, raviStore);
        await makeOrder(org, online, raviStore, {
            total: "200",
            status: "PROCESSING",
            createdAt: new Date("2026-09-20T10:00:00Z"),
        });
        await prisma.consent.create({
            data: {
                organizationId: org,
                contactId: ravi,
                channel: "WHATSAPP",
                status: "GRANTED",
            },
        });
        await prisma.contactAttention.create({
            data: {
                organizationId: org,
                contactId: ravi,
                kind: "ALLERGY",
                label: "Sesame",
            },
        });

        // Meera signs in and has never paid.
        meera = await makeContact(org, {
            email: "meera@example.com",
            firstName: "Meera",
        });
        await prisma.customerAccount.create({
            data: {
                organizationId: org,
                contactId: meera,
                email: "meera@example.com",
                emailVerifiedAt: new Date(),
            },
        });

        // Kiran: the separate contact a sign-in made (DEC-049) because
        // `known` already held the email, unverified.
        known = await makeContact(org, {
            email: "kiran@example.com",
            firstName: "Kiran",
        });
        const kiranRow = await prisma.contact.create({
            data: { organizationId: org, email: `tmp-${next()}@example.com` },
        });
        kiran = kiranRow.id;
        await prisma.contact.update({
            where: { id: kiran },
            data: { email: reservedAccountEmail(kiran) },
        });
        await prisma.customerAccount.create({
            data: {
                organizationId: org,
                contactId: kiran,
                email: "kiran@example.com",
                emailVerifiedAt: new Date(),
            },
        });

        // A paying store customer whose email `known` holds: C2 left them.
        unlinkedCustomer = await makeStoreCustomer(
            org,
            market,
            "Kiran@Example.com",
            "Kiran",
        );
        await makeOrder(org, market, unlinkedCustomer, {
            total: "120",
            createdAt: new Date("2026-09-15T10:00:00Z"),
        });

        crmOnly = await makeContact(org, { firstName: "Lead" });

        // A tombstone and a removed contact, each with money on them.
        const t = await makeContact(org, { firstName: "Old" });
        await prisma.contact.update({
            where: { id: t },
            data: {
                email: reservedMergedEmail(t),
                firstName: null,
                phone: null,
                // What C9's merge writes: the pointer is what marks it.
                mergedIntoId: crmOnly,
                mergedAt: new Date(),
            },
        });
        tombstone = t;
        await paidInvoice(org, tombstone, "999");
        const r = await makeContact(org, { firstName: "Gone" });
        await prisma.contact.update({
            where: { id: r },
            data: { email: reservedRemovedEmail(r), firstName: null },
        });
        removed = r;
        await paidInvoice(org, removed, "999");

        // Another business's paying customer.
        const theirs = await makeContact(otherOrg, {
            email: "asha@example.com",
            firstName: "Asha",
        });
        await paidInvoice(otherOrg, theirs, "5000");
    });

    const idsOf = (page: { rows: { contactId: string }[] }) =>
        page.rows.map((r) => r.contactId).sort();

    it("lists who paid or signs in, never a lead, a tombstone, a removed contact or another business's", async () => {
        const page = await list.list(ctx, {});
        expect(idsOf(page)).toEqual([asha, kiran, meera, ravi].sort());
        expect(page.everyone).toBe(4);
        expect(page.total).toBe(4);
        expect(idsOf(page)).not.toContain(crmOnly);
        expect(idsOf(page)).not.toContain(tombstone);
        expect(idsOf(page)).not.toContain(removed);
        expect(idsOf(page)).not.toContain(known);
    });

    it("says Spent as Customer Detail does: order and its invoice once, refunds and credit notes out", async () => {
        const page = await list.list(ctx, { q: "asha" });
        const row = page.rows.find((r) => r.contactId === asha);
        const detail = await details.detail(ctx, asha);
        expect(row?.spent).toEqual([{ currency: "INR", amount: "2050.00" }]);
        expect(row?.spent).toEqual(detail.stats.spent);
    });

    it("gives each chip its count under the search and storefront, not the chip", async () => {
        const page = await list.list(ctx, { chip: "returning" });
        expect(page.counts).toEqual({
            all: 4,
            returning: 1,
            subscribers: 1,
            open: 1,
            offers: 1,
            attention: 2,
        });
        expect(idsOf(page)).toEqual([asha]);
        expect(page.total).toBe(1);

        expect(idsOf(await list.list(ctx, { chip: "open" }))).toEqual([ravi]);
        expect(idsOf(await list.list(ctx, { chip: "offers" }))).toEqual([ravi]);
        expect(idsOf(await list.list(ctx, { chip: "subscribers" }))).toEqual([
            asha,
        ]);
    });

    it("leaves a sensitive entry out of a Member's tags and Needs attention count", async () => {
        const mine = await list.list(member, { chip: "attention" });
        expect(idsOf(mine)).toEqual([ravi]);
        expect(mine.counts.attention).toBe(1);

        const all = await list.list(member, { q: "asha" });
        const row = all.rows[0];
        expect(row.attention).toEqual([]);
        expect(row.hiddenSensitiveCount).toBe(1);

        const owner = await list.list(ctx, { q: "asha" });
        expect(owner.rows[0].attention).toEqual([
            { kind: "MEDICAL", label: "Pregnant", sensitive: true },
        ]);
    });

    it("finds a person by the digits of their phone, for a Member too", async () => {
        const page = await list.list(member, { q: "98450" });
        expect(idsOf(page)).toEqual([asha]);
        expect(page.rows[0].phone).toBe("+91 98450 12345");
    });

    it("sends no Spent at all, not zeros, to a role without both order:read and invoice:read", async () => {
        const page = await list.list(member, {});
        expect(page.sees.spent).toBe(false);
        for (const row of page.rows) expect(row).not.toHaveProperty("spent");
        expect(page.counts).not.toHaveProperty("subscribers");
        await expect(list.list(member, { sort: "spent" })).rejects.toThrow(
            /may not perform/,
        );
    });

    it("shows a signed-in customer who never paid, with their account's email", async () => {
        const page = await list.list(ctx, { sort: "name" });
        const m = page.rows.find((r) => r.contactId === meera);
        expect(m).toMatchObject({ signsIn: true, spent: [] });
        expect(m?.orders).toMatchObject({ count: 0, lastAt: null });

        const k = page.rows.find((r) => r.contactId === kiran);
        expect(k?.email).toBe("kiran@example.com");
        expect(k?.signsIn).toBe(true);
        expect(k?.possibleDuplicate).toBe(true);
        expect(m?.possibleDuplicate).toBe(false);
    });

    it("searches the account's email of a separate contact, never the placeholder", async () => {
        expect(idsOf(await list.list(ctx, { q: "kiran@example" }))).toEqual([
            kiran,
        ]);
        expect(idsOf(await list.list(ctx, { q: "account.invalid" }))).toEqual(
            [],
        );
        expect(idsOf(await list.list(ctx, { q: "removed.invalid" }))).toEqual(
            [],
        );
    });

    it("names the paying store customer it can't show, and shows them once linked", async () => {
        const before = await list.list(ctx, {});
        expect(before.unlinkedPaying).toBe(1);
        const sheet = await list.unlinked(ctx, {});
        expect(sheet.total).toBe(1);
        expect(sheet.rows[0]).toMatchObject({
            customerId: unlinkedCustomer,
            name: "Kiran",
            storefront: { id: market, name: "Hill Road" },
            holder: { contactId: known, name: "Kiran" },
            paidOrders: 1,
        });
        expect((await list.list(ctx, { store: online })).unlinkedPaying).toBe(
            0,
        );

        await workspace.link(ctx, known, unlinkedCustomer);
        const after = await list.list(ctx, {});
        expect(after.unlinkedPaying).toBe(0);
        const row = after.rows.find((r) => r.contactId === known);
        expect(row?.orders?.count).toBe(1);
        await prisma.customerIdentityLink.deleteMany({
            where: { contactId: known },
        });
    });

    it("leaves out a payer with no usable email, whom no link can come for (review C-4)", async () => {
        const blank = await makeStoreCustomer(org, online, "  ", "Walk-in");
        await makeOrder(org, online, blank, { total: "80" });
        const anonymised = await makeStoreCustomer(
            org,
            online,
            `gone-${next()}@removed.invalid`,
        );
        await makeOrder(org, online, anonymised, { total: "90" });
        // Another business's paying store customer, never linked, is never
        // counted here (review C-2).
        const elsewhere = await makeStore(otherOrg, "Elsewhere shop");
        const theirs = await makeStoreCustomer(
            otherOrg,
            elsewhere,
            `theirs-${next()}@example.com`,
        );
        await makeOrder(otherOrg, elsewhere, theirs, { total: "70" });

        expect((await list.list(ctx, {})).unlinkedPaying).toBe(1);
        const sheet = await list.unlinked(ctx, {});
        expect(sheet.rows.map((r) => r.customerId)).toEqual([unlinkedCustomer]);

        await prisma.order.deleteMany({
            where: { customerId: { in: [blank, anonymised, theirs] } },
        });
        await prisma.customer.deleteMany({
            where: { id: { in: [blank, anonymised, theirs] } },
        });
    });

    it("narrows to who bought at a storefront, and refuses another business's", async () => {
        expect(idsOf(await list.list(ctx, { store: online }))).toEqual([ravi]);
        const market_ = await list.list(ctx, { store: market });
        expect(idsOf(market_)).toEqual([asha]);
        expect(market_.counts.all).toBe(1);
        expect(market_.storefronts?.map((s) => s.name)).toEqual([
            "Hill Road",
            "Online",
        ]);
        const theirs = await makeStore(otherOrg, "Their shop");
        await expect(list.list(ctx, { store: theirs })).rejects.toThrow(
            "Storefront not found",
        );
        await expect(list.unlinked(ctx, { store: theirs })).rejects.toThrow(
            "Storefront not found",
        );
    });

    it("sorts by last order, spent and name", async () => {
        const last = await list.list(ctx, {});
        expect(last.sort).toBe("last");
        expect(last.rows.map((r) => r.contactId).slice(0, 2)).toEqual([
            ravi,
            asha,
        ]);
        const spent = await list.list(ctx, { sort: "spent" });
        expect(spent.rows[0].contactId).toBe(asha);
        const name = await list.list(ctx, { sort: "name" });
        expect(name.rows.map((r) => r.name)).toEqual([
            "Asha Rao",
            null, // Kiran's separate contact has no name; sorts by its email
            "Meera",
            "Ravi",
        ]);
        expect(name.rows[1].email).toBe("kiran@example.com");
        expect(last.rows[0].orders?.lastStorefront).toEqual({
            id: online,
            name: "Online",
        });
    });
});

describe("Customers list paging (DB)", () => {
    it("pages 120 customers 50 at a time, with the total and counts", async () => {
        const user = await prisma.user.create({
            data: { email: `list-pager-${tag}@example.com` },
        });
        const org = await makeOrg("Paging");
        const ctx = ownerCtx(org, user.id);
        await prisma.contact.createMany({
            data: Array.from({ length: 120 }, (_, i) => ({
                organizationId: org,
                email: `p${String(i).padStart(3, "0")}@example.com`,
                firstName: `P${String(i).padStart(3, "0")}`,
            })),
        });
        const contacts = await prisma.contact.findMany({
            where: { organizationId: org },
            select: { id: true },
        });
        await prisma.invoice.createMany({
            data: contacts.map((c, i) => ({
                organizationId: org,
                contactId: c.id,
                status: "PAID",
                number: `PG-${i}`,
                currency: "INR",
                subtotal: "100",
                total: "100",
            })),
        });

        const first = await list.list(ctx, { sort: "name" });
        expect(first.rows).toHaveLength(50);
        expect(first.total).toBe(120);
        expect(first.counts.all).toBe(120);
        expect(first.rows[0].name).toBe("P000");
        const third = await list.list(ctx, { sort: "name", page: 3 });
        expect(third.rows).toHaveLength(20);
        expect(third.rows[19].name).toBe("P119");
        const seen = new Set(
            [
                ...first.rows,
                ...(await list.list(ctx, { sort: "name", page: 2 })).rows,
                ...third.rows,
            ].map((r) => r.contactId),
        );
        expect(seen.size).toBe(120);
    });

    it("answers the first page of 5,000 customers inside the budget", async () => {
        const user = await prisma.user.create({
            data: { email: `list-scale-${tag}@example.com` },
        });
        const org = await makeOrg("Scale");
        const ctx = ownerCtx(org, user.id);
        const store = await makeStore(org, "Scale shop");
        const n = 5000;
        await prisma.contact.createMany({
            data: Array.from({ length: n }, (_, i) => ({
                organizationId: org,
                email: `s${i}@example.com`,
                firstName: `S${i}`,
                phone: `98${String(i).padStart(8, "0")}`,
            })),
        });
        await prisma.customer.createMany({
            data: Array.from({ length: n }, (_, i) => ({
                organizationId: org,
                storeId: store,
                email: `s${i}@example.com`,
            })),
        });
        const [contacts, customers] = await Promise.all([
            prisma.contact.findMany({
                where: { organizationId: org },
                select: { id: true, email: true },
            }),
            prisma.customer.findMany({
                where: { organizationId: org },
                select: { id: true, email: true },
            }),
        ]);
        const customerByEmail = new Map(customers.map((c) => [c.email, c.id]));
        await prisma.customerIdentityLink.createMany({
            data: contacts.map((c) => ({
                organizationId: org,
                contactId: c.id,
                customerId: customerByEmail.get(c.email) as string,
                reason: "BACKFILL" as const,
            })),
        });
        await prisma.order.createMany({
            data: customers.flatMap((c, i) =>
                Array.from({ length: 1 + (i % 3) }, (_, k) => ({
                    organizationId: org,
                    storeId: store,
                    customerId: c.id,
                    orderId: `S-${i}-${k}`,
                    subtotal: "250",
                    total: "250",
                    currency: "INR",
                    paymentStatus: "PAID",
                    status:
                        k === 0 && i % 10 === 0 ? "PROCESSING" : "DELIVERED",
                })),
            ),
        });

        // What autovacuum does after a bulk load: without statistics the
        // planner guesses a handful of rows and nests loops over 5,000. As
        // the owner: under TEST_RLS the suite's role may not analyze, and its
        // ANALYZE was silently skipped (test/analyze.ts).
        analyzeAsOwner();
        const [stats] = await prisma.$queryRaw<{ rows: number }[]>`
            SELECT reltuples::int AS rows FROM pg_class
            WHERE oid = '"Contact"'::regclass`;
        expect(stats.rows).toBeGreaterThanOrEqual(n);

        const started = Date.now();
        const page = await list.list(ctx, {});
        const took = Date.now() - started;
        const search = Date.now();
        await list.list(ctx, { q: "98000" });
        const searchTook = Date.now() - search;
        // Recorded for the PR (about 90ms each locally); the budget is
        // generous for CI's cold Postgres.
        console.info(
            `customers list: first page of ${n} in ${took}ms; phone search in ${searchTook}ms`,
        );
        expect(page.rows).toHaveLength(50);
        expect(page.everyone).toBe(n);
        expect(page.counts.open).toBe(n / 10);
        expect(took).toBeLessThan(1500);
        expect(searchTook).toBeLessThan(1500);
    });
});
