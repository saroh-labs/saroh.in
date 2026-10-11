/**
 * The palette's search against a real Postgres (10 Oct 2026): each kind of
 * thing is found in the caller's own business and never in another's, a
 * role finds only the kinds it may read, a Calendar only person only their
 * own diary's bookings, and merged or removed people are left out.
 *
 * Runs in the integration project (TEST_DATABASE_URL).
 */
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { CALENDAR_ONLY_ROLE_KEY } from "../organizations/calendar-only-role";
import type { OrgAction } from "../organizations/organization-actions";
import { SearchService } from "./search.service";

let n = 0;
const uniq = (p: string) => `${p}-${process.pid}-${++n}`;
const search = new SearchService();

const EVERY_READ: OrgAction[] = [
    "contact:read",
    "lead:read",
    "order:read",
    "store:read",
    "service:read",
    "booking:read",
    "invoice:read",
    "subscription:read",
];

interface Business {
    organizationId: string;
    userId: string;
    ids: {
        contact: string;
        product: string;
        service: string;
        booking: string;
        invoice: string;
        subscription: string;
    };
}

/** A business where everything is named after one word: "saffron". */
async function business(name: string): Promise<Business> {
    const org = await prisma.organization.create({
        data: { name, slug: uniq("search") },
    });
    const organizationId = org.id;
    const user = await prisma.user.create({
        data: { email: `${uniq("owner")}@example.com`, name: "Priya" },
    });
    await prisma.membership.create({
        data: { organizationId, userId: user.id, role: "OWNER" },
    });
    const contact = await prisma.contact.create({
        data: {
            organizationId,
            email: `${uniq("saffron")}@example.com`,
            firstName: "Saffron",
            lastName: "Rao",
            phone: "+919811122233",
        },
    });
    const store = await prisma.store.create({
        data: { name: "Hill Road", slug: uniq("hill"), organizationId },
    });
    const product = await prisma.product.create({
        data: {
            organizationId,
            storeId: store.id,
            name: "Saffron loaf",
            slug: uniq("saffron-loaf"),
            price: "240",
        },
    });
    const service = await prisma.service.create({
        data: {
            organizationId,
            name: "Saffron facial",
            durationMinutes: 45,
            timezone: "Asia/Kolkata",
        },
    });
    const booking = await prisma.booking.create({
        data: {
            organizationId,
            serviceId: service.id,
            contactId: contact.id,
            startAt: new Date("2026-10-12T04:00:00.000Z"),
            endAt: new Date("2026-10-12T04:45:00.000Z"),
            timezone: "Asia/Kolkata",
            status: "CONFIRMED",
            snapshot: {},
        },
    });
    const invoice = await prisma.invoice.create({
        data: {
            organizationId,
            number: uniq("INV"),
            status: "ISSUED",
            currency: "INR",
            subtotal: "1200",
            total: "1200",
            billToName: "Saffron Rao",
        },
    });
    const plan = await prisma.subscriptionPlan.create({
        data: {
            organizationId,
            name: "Saffron box",
            price: "1200",
            currency: "INR",
            interval: "MONTH",
        },
    });
    const subscription = await prisma.customerSubscription.create({
        data: {
            organizationId,
            planId: plan.id,
            contactId: contact.id,
            price: "1200",
            currency: "INR",
            interval: "MONTH",
            timezone: "Asia/Kolkata",
            anchorAt: new Date("2026-09-01T00:00:00.000Z"),
            currentPeriodStart: new Date("2026-10-01T00:00:00.000Z"),
            currentPeriodEnd: new Date("2026-11-01T00:00:00.000Z"),
        },
    });
    return {
        organizationId,
        userId: user.id,
        ids: {
            contact: contact.id,
            product: product.id,
            service: service.id,
            booking: booking.id,
            invoice: invoice.id,
            subscription: subscription.id,
        },
    };
}

function as(
    b: Business,
    actions: OrgAction[] = EVERY_READ,
    over: Partial<OrganizationContext> = {},
): OrganizationContext {
    return {
        organizationId: b.organizationId,
        userId: b.userId,
        role: "MEMBER",
        actions: new Set(actions),
        ...over,
    };
}

describe("search (real database)", () => {
    let rye: Business;
    let pulse: Business;

    beforeAll(async () => {
        rye = await business("Rye & Co");
        pulse = await business("Pulse Fitness");
    });

    it("finds every kind of thing in the caller's business, and nothing of another's", async () => {
        const { hits } = await search.search(as(rye), "saffron");

        const found = (kind: string) =>
            hits.filter((h) => h.kind === kind).map((h) => h.id);
        expect(found("contact")).toEqual([rye.ids.contact]);
        expect(found("product")).toEqual([rye.ids.product]);
        expect(found("service")).toEqual([rye.ids.service]);
        expect(found("booking")).toEqual([rye.ids.booking]);
        expect(found("invoice")).toEqual([rye.ids.invoice]);
        expect(found("subscription")).toEqual([rye.ids.subscription]);

        const theirs = new Set(Object.values(pulse.ids));
        expect(hits.filter((h) => theirs.has(h.id))).toEqual([]);
    });

    it("a role finds only the kinds it may read", async () => {
        const { hits } = await search.search(
            as(rye, ["booking:read", "service:read"]),
            "saffron",
        );
        expect([...new Set(hits.map((h) => h.kind))].sort()).toEqual([
            "booking",
            "service",
        ]);

        // And with no read at all, nothing.
        expect((await search.search(as(rye, []), "saffron")).hits).toEqual([]);
    });

    it("a Calendar only person finds their own diary's bookings, never everyone's", async () => {
        const scoped = as(rye, ["booking:read"], {
            roleKey: CALENDAR_ONLY_ROLE_KEY,
        });
        // Not on the diary yet: no bookings.
        expect((await search.search(scoped, "saffron")).hits).toEqual([]);

        // On the diary, taking another service: still not this booking.
        const membership = await prisma.membership.findUniqueOrThrow({
            where: {
                organizationId_userId: {
                    organizationId: rye.organizationId,
                    userId: rye.userId,
                },
            },
        });
        const staff = await prisma.staffMember.create({
            data: {
                organizationId: rye.organizationId,
                name: "Priya",
                membershipId: membership.id,
            },
        });
        expect((await search.search(scoped, "saffron")).hits).toEqual([]);

        // Put on the booking: now it is theirs to find.
        await prisma.booking.update({
            where: { id: rye.ids.booking },
            data: { staffId: staff.id },
        });
        expect(
            (await search.search(scoped, "saffron")).hits.map((h) => h.id),
        ).toEqual([rye.ids.booking]);
    });

    it("finds a person by their phone, and leaves a removed or merged one out", async () => {
        const byPhone = await search.search(
            as(rye, ["contact:read"]),
            "9811122233",
        );
        expect(byPhone.hits.map((h) => h.id)).toEqual([rye.ids.contact]);

        await prisma.contact.update({
            where: { id: rye.ids.contact },
            data: { removedAt: new Date() },
        });
        expect(
            (await search.search(as(rye, ["contact:read"]), "saffron")).hits,
        ).toEqual([]);
    });
});
