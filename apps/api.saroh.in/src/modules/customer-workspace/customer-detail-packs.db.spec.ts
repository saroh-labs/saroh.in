/**
 * Round-2 C7 against a real Postgres: a customer's class packs on Customer
 * Detail — classes left derived from the redemptions not given back
 * (ADR-007), the days given, how it was paid, and the classes spent from
 * it, latest first, with what became of each. Only this business's, only
 * this person's. Runs in the integration project (TEST_DATABASE_URL).
 */
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import type { ModuleAvailabilityService } from "../capabilities/module-availability.service";
import { readContactPacks } from "./customer-detail-packs";
import { CustomerDetailService } from "./customer-detail.service";

const tag = `${process.pid}-${Date.now()}`;
const DAY = 86_400_000;

const availability = {
    listViews: jest.fn().mockResolvedValue(
        ["CRM", "APPOINTMENTS", "CLASS_PACKS", "PAYMENTS"].map((key) => ({
            key,
            readiness: "ACTIVE",
        })),
    ),
} as unknown as ModuleAvailabilityService;
const details = new CustomerDetailService(availability);

let ctx: OrganizationContext;
let asha = "";
let ravi = "";
let spin = "";
let packId = "";
let live = "";
let lapsed = "";

async function booking(contactId: string, startAt: Date, status: string) {
    return prisma.booking.create({
        data: {
            organizationId: ctx.organizationId,
            serviceId: spin,
            contactId,
            startAt,
            endAt: new Date(startAt.getTime() + 3_600_000),
            timezone: "UTC",
            status,
            snapshot: {},
        },
    });
}

async function purchase(
    contactId: string,
    expiresAt: Date,
    createdAt: Date,
    paidBy: string | null,
) {
    return prisma.packPurchase.create({
        data: {
            organizationId: ctx.organizationId,
            packId,
            contactId,
            credits: 10,
            price: "3000",
            currency: "INR",
            expiresAt,
            createdAt,
            paidBy,
        },
    });
}

async function redeem(
    purchaseId: string,
    bookingId: string,
    reversedAt: Date | null = null,
) {
    await prisma.packRedemption.create({
        data: {
            organizationId: ctx.organizationId,
            purchaseId,
            bookingId,
            reversedAt,
        },
    });
}

beforeAll(async () => {
    const owner = await prisma.user.create({
        data: { email: `c7-owner-${tag}@example.com` },
    });
    const org = await prisma.organization.create({
        data: { name: "Pulse C7", slug: `c7-${tag}` },
    });
    ctx = { organizationId: org.id, userId: owner.id, role: "OWNER" };
    const contact = (email: string, firstName: string) =>
        prisma.contact.create({
            data: { organizationId: org.id, email, firstName },
        });
    asha = (await contact(`c7-asha-${tag}@example.com`, "Asha")).id;
    ravi = (await contact(`c7-ravi-${tag}@example.com`, "Ravi")).id;
    spin = (
        await prisma.service.create({
            data: {
                organizationId: org.id,
                name: "Spin",
                durationMinutes: 60,
                capacity: 12,
                timezone: "UTC",
                status: "ACTIVE",
            },
        })
    ).id;
    packId = (
        await prisma.classPack.create({
            data: {
                organizationId: org.id,
                name: "10 classes",
                credits: 10,
                validityDays: 60,
                price: "3000",
                currency: "INR",
            },
        })
    ).id;

    const now = Date.now();
    live = (
        await purchase(
            asha,
            new Date(now + 20 * DAY),
            new Date(now - 30 * DAY),
            "UPI",
        )
    ).id;
    lapsed = (
        await purchase(
            asha,
            new Date(now - 5 * DAY),
            new Date(now - 90 * DAY),
            null,
        )
    ).id;
    // Three used on the live one, a fourth given back, one late cancel
    // that stays spent: 10 − 3 = 7 left.
    const came = await booking(asha, new Date(now - 10 * DAY), "CONFIRMED");
    await prisma.booking.update({
        where: { id: came.id },
        data: { outcome: "ATTENDED" },
    });
    await redeem(live, came.id);
    await redeem(
        live,
        (await booking(asha, new Date(now + 2 * DAY), "CONFIRMED")).id,
    );
    await redeem(
        live,
        (await booking(asha, new Date(now - 3 * DAY), "CANCELLED")).id,
    );
    await redeem(
        live,
        (await booking(asha, new Date(now - 6 * DAY), "CANCELLED")).id,
        new Date(now - 7 * DAY),
    );
    await prisma.packExtension.create({
        data: {
            organizationId: org.id,
            purchaseId: live,
            days: 14,
            reason: "Knee injury",
            expiresBefore: new Date(now + 6 * DAY),
            expiresAfter: new Date(now + 20 * DAY),
        },
    });
    // Someone else's pack, in the same business.
    await purchase(ravi, new Date(now + 40 * DAY), new Date(now), "CASH");
});

describe("Customer Detail's class packs (C7, DB)", () => {
    it("derives what is left, newest purchase first, with the classes spent", async () => {
        const read = await readContactPacks(prisma, ctx.organizationId, asha);

        expect(read.rows.map((r) => r.id)).toEqual([live, lapsed]);
        const [first, second] = read.rows;
        expect(first).toEqual(
            expect.objectContaining({
                credits: 10,
                used: 3,
                left: 7,
                standing: "ACTIVE",
                price: "3000.00",
                paidBy: "UPI",
                pack: { id: packId, name: "10 classes", kind: "CLASSES" },
            }),
        );
        expect(first.extensions).toEqual([
            expect.objectContaining({ days: 14, reason: "Knee injury" }),
        ]);
        // Latest first; the given-back one stays listed, as a credit back.
        expect(first.uses.map((u) => u.state)).toEqual([
            "BOOKED",
            "LATE_CANCEL",
            "CREDIT_BACK",
            "CAME",
        ]);
        expect(first.uses[0].service).toEqual({ id: spin, name: "Spin" });
        expect(second).toEqual(
            expect.objectContaining({
                left: 10,
                standing: "EXPIRED",
                paidBy: null,
                uses: [],
            }),
        );
        // Only the live purchase counts; the lapsed one's 10 are gone.
        expect(read.classesLeft).toBe(7);
        expect(read.nextExpiry).toBe(first.expiresAt);
    });

    it("puts them on the detail read, and none of another person's", async () => {
        const detail = await details.detail(ctx, asha);

        expect(detail.packs?.rows).toHaveLength(2);
        expect(detail.stats.classesLeft).toEqual(
            expect.objectContaining({ total: 7, packs: 7 }),
        );
        const other = await details.detail(ctx, ravi);
        expect(other.packs?.rows).toHaveLength(1);
        expect(other.packs?.rows[0].paidBy).toBe("CASH");
    });
});
