/**
 * GST on membership plans, class packs and courses (12 Oct 2026), against a
 * real Postgres: the three new columns on each, a plan's renewal, a pack
 * sale and a course enrolment where the business adds GST to its prices,
 * the desk's refusal with its rate ask, and the missing-rates read.
 *
 * The sums, written out. The business is in Karnataka (29), so a line's
 * GST is split CGST + SGST:
 *
 *   plan   ₹2,000 at 18% added → ₹2,360 to pay = ₹2,000 + ₹180 + ₹180
 *   pack   ₹4,500 at 18% added → ₹5,310 to pay = ₹4,500 + ₹405 + ₹405
 *   course ₹8,000 at 5% added  → ₹8,400 to pay = ₹8,000 + ₹200 + ₹200
 *   plan   ₹2,000 at 18% included → ₹2,000 to pay = ₹1,694.92 + ₹152.54 + ₹152.54
 *
 * Runs in the integration project (TEST_DATABASE_URL). Nothing here talks
 * to a payment provider.
 */
import { ConflictException } from "@nestjs/common";
import { prisma } from "@saroh/database";

import { giveBusinessDetails } from "../../../test/business-details";
import type { OrganizationContext } from "../../common/types/organization-context";
import { BookingsService } from "../bookings/bookings.service";
import { ClassPacksService } from "../class-packs/class-packs.service";
import { CoursesService } from "../courses/courses.service";
import { SubscriptionsService } from "../subscriptions/subscriptions.service";
import { GST_RATE_MISSING } from "./gst-rate-required";
import { GstRatesService } from "./gst-rates.service";
import { InvoicesService } from "./invoices.service";

const invoices = new InvoicesService();
const subscriptions = new SubscriptionsService(invoices);
const packs = new ClassPacksService(invoices);
const courses = new CoursesService(new BookingsService(), invoices);
const rates = new GstRatesService();

const tag = `${process.pid}-${Date.now()}`;
const GSTIN = "29ABCDE1234F1Z5";
const DAY = 86_400_000;
let seq = 0;

/** A business of its own per test, so one test's choice never reaches another. */
async function business(
    gst: "ADDED" | "INCLUDED" | "NOT_REGISTERED",
): Promise<OrganizationContext> {
    seq += 1;
    const org = await prisma.organization.create({
        data: { name: "Pulse Studio", slug: `gst-ppc-${tag}-${seq}` },
    });
    const user = await prisma.user.create({
        data: { email: `gst-ppc-${tag}-${seq}@example.com` },
    });
    await prisma.businessProfile.create({
        data: {
            organizationId: org.id,
            timezone: "UTC",
            ...(gst === "NOT_REGISTERED"
                ? { gstRegistered: false }
                : {
                      gstRegistered: true,
                      taxId: GSTIN,
                      gstState: "29",
                      gstPriceMode: gst,
                  }),
        },
    });
    await giveBusinessDetails(org.id);
    return { organizationId: org.id, userId: user.id, role: "OWNER" };
}

async function contact(owner: OrganizationContext): Promise<string> {
    seq += 1;
    return (
        await prisma.contact.create({
            data: {
                organizationId: owner.organizationId,
                email: `member${seq}-${tag}@example.com`,
                firstName: "Asha",
                lastName: "Rao",
            },
        })
    ).id;
}

/** A plan on sale at ₹2,000 a month, written as its editor's publish leaves it. */
async function plan(
    owner: OrganizationContext,
    gst: { gstRate?: string; sacCode?: string; gstPriceMode?: string } = {},
): Promise<string> {
    seq += 1;
    return (
        await prisma.subscriptionPlan.create({
            data: {
                organizationId: owner.organizationId,
                name: `Gym monthly ${seq}`,
                price: "2000",
                currency: "INR",
                interval: "MONTH",
                status: "ACTIVE",
                ...gst,
            },
        })
    ).id;
}

/** A service that takes bookings all day, for a pack and a course to cover. */
async function service(owner: OrganizationContext): Promise<string> {
    const made = await prisma.service.create({
        data: {
            organizationId: owner.organizationId,
            name: "Vinyasa",
            durationMinutes: 60,
            capacity: 10,
            timezone: "UTC",
            status: "ACTIVE",
            currency: "INR",
        },
    });
    await prisma.availabilityRule.createMany({
        data: Array.from({ length: 7 }, (_, dayOfWeek) => ({
            organizationId: owner.organizationId,
            serviceId: made.id,
            dayOfWeek,
            startMinute: 0,
            endMinute: 1440,
        })),
    });
    return made.id;
}

/** A pack on sale at ₹4,500 for ten classes. */
async function pack(
    owner: OrganizationContext,
    gst: { gstRate?: string; sacCode?: string; gstPriceMode?: string } = {},
): Promise<string> {
    seq += 1;
    return (
        await prisma.classPack.create({
            data: {
                organizationId: owner.organizationId,
                name: `10 classes ${seq}`,
                credits: 10,
                validityDays: 60,
                price: "4500",
                currency: "INR",
                status: "ACTIVE",
                ...gst,
            },
        })
    ).id;
}

/** 09:00 UTC, `days` from now. */
function slot(days: number): string {
    const d = new Date(Date.now() + days * DAY);
    d.setUTCHours(9, 0, 0, 0);
    return d.toISOString();
}

/** An open course at ₹8,000 with two sessions to come. */
async function course(
    owner: OrganizationContext,
    gst: { gstRate?: string | null; sacCode?: string } = {},
): Promise<string> {
    const made = await courses.create(owner, {
        serviceId: await service(owner),
        name: "Beginners' flow",
        price: "8000",
        seats: 5,
        status: "OPEN",
        sessions: [slot(7), slot(14)],
        ...gst,
    });
    return made.id;
}

/** An invoice with its lines, as the paper froze them. */
const paper = (where: Record<string, unknown>) =>
    prisma.invoice.findFirstOrThrow({
        where: { kind: "INVOICE", ...where },
        orderBy: { issuedAt: "asc" },
        include: { lines: { orderBy: { position: "asc" } } },
    });

/** A line's money and tax columns, as strings. */
const sums = (line: {
    unitPrice: { toString(): string };
    amount: { toString(): string };
    gstRate: { toString(): string } | null;
    taxableValue: { toString(): string } | null;
    cgst: { toString(): string };
    sgst: { toString(): string };
    igst: { toString(): string };
    hsnSac: string | null;
    gstPriceMode: string | null;
}) => ({
    unitPrice: Number(line.unitPrice).toFixed(2),
    amount: Number(line.amount).toFixed(2),
    gstRate: line.gstRate === null ? null : Number(line.gstRate).toFixed(2),
    taxableValue:
        line.taxableValue === null
            ? null
            : Number(line.taxableValue).toFixed(2),
    cgst: Number(line.cgst).toFixed(2),
    sgst: Number(line.sgst).toFixed(2),
    igst: Number(line.igst).toFixed(2),
    hsnSac: line.hsnSac,
    gstPriceMode: line.gstPriceMode,
});

/** The refusal: a 409 naming the item with no rate. */
async function missingRate(
    work: Promise<unknown>,
    item: { kind: string; id: string },
): Promise<void> {
    const err = await work.then(
        () => null,
        (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(ConflictException);
    expect((err as ConflictException).getResponse()).toMatchObject({
        details: { reason: GST_RATE_MISSING, items: [item] },
    });
}

/** Move the renewal job's clock just past the period's end, and renew. */
async function renew(subscriptionId: string) {
    const row = await prisma.customerSubscription.findUniqueOrThrow({
        where: { id: subscriptionId },
    });
    const outcome = await subscriptions.renewOne(
        subscriptionId,
        new Date(row.currentPeriodEnd.getTime() + 3_600_000),
    );
    return { outcome, periodStart: row.currentPeriodEnd };
}

describe("the columns", () => {
    it("a plan, a pack and a course start with no rate, no SAC code and the business's way", async () => {
        const owner = await business("NOT_REGISTERED");
        const planRow = await prisma.subscriptionPlan.findUniqueOrThrow({
            where: { id: await plan(owner) },
        });
        const packRow = await prisma.classPack.findUniqueOrThrow({
            where: { id: await pack(owner) },
        });
        const courseRow = await prisma.course.findUniqueOrThrow({
            where: { id: await course(owner) },
        });
        for (const row of [planRow, packRow, courseRow]) {
            expect(row.gstRate).toBeNull();
            expect(row.sacCode).toBeNull();
            expect(row.gstPriceMode).toBeNull();
        }
    });

    it("keep a rate to two places (0.25%, and 0 for exempt), a SAC code and the item's own choice", async () => {
        const owner = await business("INCLUDED");
        const planId = await plan(owner, {
            gstRate: "0.25",
            sacCode: "999723",
            gstPriceMode: "ADDED",
        });
        const packId = await pack(owner, { gstRate: "0" });
        const courseId = await course(owner, {
            gstRate: "18",
            sacCode: "999293",
        });
        const planRow = await prisma.subscriptionPlan.findUniqueOrThrow({
            where: { id: planId },
        });
        expect(Number(planRow.gstRate)).toBe(0.25);
        expect(planRow.sacCode).toBe("999723");
        expect(planRow.gstPriceMode).toBe("ADDED");
        const packRow = await prisma.classPack.findUniqueOrThrow({
            where: { id: packId },
        });
        // Exempt is a rate, never "not set".
        expect(packRow.gstRate).not.toBeNull();
        expect(Number(packRow.gstRate)).toBe(0);
        const read = await courses.get(owner, courseId);
        expect(read).toMatchObject({
            gstRate: "18",
            sacCode: "999293",
            gstPriceMode: null,
        });
        // And the plan's read writes the rate the one way.
        expect(await subscriptions.getPlan(owner, planId)).toMatchObject({
            gstRate: "0.25",
            sacCode: "999723",
            gstPriceMode: "ADDED",
        });
    });
});

describe("a plan's renewal where GST is added", () => {
    it("the first invoice and every renewal are ₹2,360: ₹2,000 + ₹180 + ₹180", async () => {
        const owner = await business("ADDED");
        const planId = await plan(owner, { gstRate: "18", sacCode: "999723" });
        const sub = await subscriptions.subscribe(owner, {
            contactId: await contact(owner),
            planId,
        });
        // The subscription keeps the price that was typed.
        expect(sub.price).toBe("2000.00");

        const first = await paper({ subscriptionId: sub.id });
        expect(Number(first.total).toFixed(2)).toBe("2360.00");
        expect(sums(first.lines[0])).toEqual({
            unitPrice: "2360.00",
            amount: "2360.00",
            gstRate: "18.00",
            taxableValue: "2000.00",
            cgst: "180.00",
            sgst: "180.00",
            igst: "0.00",
            hsnSac: "999723",
            gstPriceMode: "ADDED",
        });

        const { outcome, periodStart } = await renew(sub.id);
        expect(outcome).toBe("renewed");
        const renewal = await paper({ subscriptionId: sub.id, periodStart });
        expect(renewal.id).not.toBe(first.id);
        expect(renewal.status).toBe("ISSUED");
        expect(renewal.sellerGstin).toBe(GSTIN);
        expect(Number(renewal.total).toFixed(2)).toBe("2360.00");
        expect(sums(renewal.lines[0])).toEqual({
            unitPrice: "2360.00",
            amount: "2360.00",
            gstRate: "18.00",
            taxableValue: "2000.00",
            cgst: "180.00",
            sgst: "180.00",
            igst: "0.00",
            hsnSac: "999723",
            gstPriceMode: "ADDED",
        });
        // Still on the typed price: the next renewal is worked out again.
        expect(
            Number(
                (
                    await prisma.customerSubscription.findUniqueOrThrow({
                        where: { id: sub.id },
                    })
                ).price,
            ).toFixed(2),
        ).toBe("2000.00");
    });

    it("a rate set after someone joined reaches their next renewal, and the invoice already issued is not touched", async () => {
        // They joined while the plan had no rate and the business charged
        // no GST: a ₹2,000 receipt.
        const owner = await business("NOT_REGISTERED");
        const planId = await plan(owner);
        const sub = await subscriptions.subscribe(owner, {
            contactId: await contact(owner),
            planId,
        });
        const before = await paper({ subscriptionId: sub.id });
        expect(Number(before.total).toFixed(2)).toBe("2000.00");
        expect(before.lines[0].gstRate).toBeNull();

        // The business registers, adds GST to its prices, and chooses the
        // plan's rate from the missing-rates sheet.
        await prisma.businessProfile.update({
            where: { organizationId: owner.organizationId },
            data: {
                gstRegistered: true,
                taxId: GSTIN,
                gstState: "29",
                gstPriceMode: "ADDED",
            },
        });
        await rates.set(owner, {
            items: [{ kind: "PLAN", id: planId, rate: "18" }],
        });

        const { outcome, periodStart } = await renew(sub.id);
        expect(outcome).toBe("renewed");
        const renewal = await paper({ subscriptionId: sub.id, periodStart });
        expect(Number(renewal.total).toFixed(2)).toBe("2360.00");
        expect(sums(renewal.lines[0])).toMatchObject({
            taxableValue: "2000.00",
            cgst: "180.00",
            sgst: "180.00",
            gstRate: "18.00",
            gstPriceMode: "ADDED",
        });

        // The first invoice: the same row, to the column.
        const after = await paper({ id: before.id });
        expect(after).toEqual(before);
    });

    it("a renewal with no rate on the plan goes out exactly as before, and is never refused", async () => {
        // Registered and adding GST, and nobody has chosen the plan's rate.
        // The member joined before the business registered.
        const owner = await business("NOT_REGISTERED");
        const planId = await plan(owner);
        const sub = await subscriptions.subscribe(owner, {
            contactId: await contact(owner),
            planId,
        });
        await prisma.businessProfile.update({
            where: { organizationId: owner.organizationId },
            data: {
                gstRegistered: true,
                taxId: GSTIN,
                gstState: "29",
                gstPriceMode: "ADDED",
            },
        });
        const { outcome, periodStart } = await renew(sub.id);
        expect(outcome).toBe("renewed");
        const renewal = await paper({ subscriptionId: sub.id, periodStart });
        expect(Number(renewal.total).toFixed(2)).toBe("2000.00");
        expect(renewal.lines[0].gstRate).toBeNull();
        expect(renewal.lines[0].gstPriceMode).toBeNull();
        // And the plan is in the missing-rates read, with who renews on it.
        const missing = await rates.missing(owner);
        expect(missing.items).toEqual([
            {
                kind: "PLAN",
                id: planId,
                name: expect.stringContaining("Gym monthly"),
                priceCents: 200_000,
                currency: "INR",
                canSet: true,
                members: [{ count: 1, price: "2000.00", currency: "INR" }],
            },
        ]);
    });

    it("where prices include GST the member pays the same ₹2,000 and the paper shows the split", async () => {
        const owner = await business("INCLUDED");
        const planId = await plan(owner, { gstRate: "18" });
        const sub = await subscriptions.subscribe(owner, {
            contactId: await contact(owner),
            planId,
        });
        const { periodStart } = await renew(sub.id);
        const renewal = await paper({ subscriptionId: sub.id, periodStart });
        expect(Number(renewal.total).toFixed(2)).toBe("2000.00");
        expect(sums(renewal.lines[0])).toEqual({
            unitPrice: "2000.00",
            amount: "2000.00",
            gstRate: "18.00",
            taxableValue: "1694.92",
            cgst: "152.54",
            sgst: "152.54",
            igst: "0.00",
            hsnSac: null,
            gstPriceMode: "INCLUDED",
        });
    });
});

describe("the desk is asked for a rate nobody chose", () => {
    it("subscribing is refused naming the plan, nothing is written, and once the rate is saved the same sale goes through", async () => {
        const owner = await business("ADDED");
        const planId = await plan(owner);
        const contactId = await contact(owner);
        await missingRate(
            subscriptions.subscribe(owner, { contactId, planId }),
            {
                kind: "PLAN",
                id: planId,
            },
        );
        expect(
            await prisma.customerSubscription.count({
                where: { organizationId: owner.organizationId },
            }),
        ).toBe(0);
        expect(
            await prisma.invoice.count({
                where: { organizationId: owner.organizationId },
            }),
        ).toBe(0);

        await rates.set(owner, {
            items: [{ kind: "PLAN", id: planId, rate: "18" }],
        });
        const sub = await subscriptions.subscribe(owner, { contactId, planId });
        const first = await paper({ subscriptionId: sub.id });
        expect(Number(first.total).toFixed(2)).toBe("2360.00");
        // The save is in the plan's history, and moved its editor's revision.
        const events = await subscriptions.planEvents(owner, planId, {});
        expect(events.events[0]).toMatchObject({
            kind: "PRICE_CHANGED",
            changes: { gstRate: [null, "18"] },
        });
        expect(
            (await subscriptions.getPlanEditor(owner, planId)).revision,
        ).toBe(1);
    });

    it("a business that is not registered is never asked, for a plan, a pack or a course", async () => {
        const owner = await business("NOT_REGISTERED");
        const contactId = await contact(owner);
        await expect(
            subscriptions.subscribe(owner, {
                contactId,
                planId: await plan(owner),
            }),
        ).resolves.toBeDefined();
        await expect(
            packs.sell(owner, await pack(owner), { contactId }),
        ).resolves.toBeDefined();
        await expect(
            courses.enrol(owner, await course(owner), { contactId }),
        ).resolves.toBeDefined();
        expect((await rates.missing(owner)).items).toEqual([]);
    });
});

describe("a pack sold where GST is added", () => {
    it("is refused with no rate; with 18% it is ₹5,310: ₹4,500 + ₹405 + ₹405, on the purchase and its invoice", async () => {
        const owner = await business("ADDED");
        const packId = await pack(owner);
        const contactId = await contact(owner);
        await missingRate(packs.sell(owner, packId, { contactId }), {
            kind: "PACK",
            id: packId,
        });
        expect(
            await prisma.packPurchase.count({
                where: { organizationId: owner.organizationId },
            }),
        ).toBe(0);

        await rates.set(owner, {
            items: [{ kind: "PACK", id: packId, rate: "18" }],
        });
        const sold = await packs.sell(owner, packId, {
            contactId,
            paidBy: "UPI",
        });
        expect(sold.price).toBe("5310.00");
        const invoice = await paper({ packPurchaseId: sold.id });
        expect(Number(invoice.total).toFixed(2)).toBe("5310.00");
        expect(sums(invoice.lines[0])).toEqual({
            unitPrice: "5310.00",
            amount: "5310.00",
            gstRate: "18.00",
            taxableValue: "4500.00",
            cgst: "405.00",
            sgst: "405.00",
            igst: "0.00",
            hsnSac: null,
            gstPriceMode: "ADDED",
        });
        // The pack itself still says what was typed.
        expect((await packs.getPack(owner, packId)).price).toBe("4500.00");
    });
});

describe("a course enrolment where GST is added", () => {
    it("is refused with no rate; with 5% it is ₹8,400: ₹8,000 + ₹200 + ₹200, on the enrolment and its invoice", async () => {
        const owner = await business("ADDED");
        const courseId = await course(owner);
        const contactId = await contact(owner);
        await missingRate(courses.enrol(owner, courseId, { contactId }), {
            kind: "COURSE",
            id: courseId,
        });
        expect(
            await prisma.courseEnrollment.count({
                where: { organizationId: owner.organizationId },
            }),
        ).toBe(0);
        expect(
            await prisma.booking.count({
                where: { organizationId: owner.organizationId },
            }),
        ).toBe(0);

        await rates.set(owner, {
            items: [{ kind: "COURSE", id: courseId, rate: "5" }],
        });
        const enrolment = await courses.enrol(owner, courseId, { contactId });
        expect(enrolment.price).toBe("8400.00");
        const invoice = await paper({ courseEnrollmentId: enrolment.id });
        expect(Number(invoice.total).toFixed(2)).toBe("8400.00");
        expect(sums(invoice.lines[0])).toEqual({
            unitPrice: "8400.00",
            amount: "8400.00",
            gstRate: "5.00",
            taxableValue: "8000.00",
            cgst: "200.00",
            sgst: "200.00",
            igst: "0.00",
            hsnSac: null,
            gstPriceMode: "ADDED",
        });
        // Both sessions were booked with it.
        expect(
            await prisma.booking.count({
                where: { courseEnrollmentId: enrolment.id },
            }),
        ).toBe(2);
    });
});

describe("the missing-rates read", () => {
    it("lists a priced plan, pack and course on sale with no rate, and leaves out a draft, an exempt one and one with a rate", async () => {
        const owner = await business("INCLUDED");
        const planId = await plan(owner);
        const packId = await pack(owner);
        const courseId = await course(owner);
        // Not listed: has a rate, is exempt, or isn't on sale.
        await plan(owner, { gstRate: "18" });
        await pack(owner, { gstRate: "0" });
        await prisma.subscriptionPlan.create({
            data: {
                organizationId: owner.organizationId,
                name: `Draft plan ${++seq}`,
                price: "999",
                currency: "INR",
                interval: "MONTH",
                status: "DRAFT",
            },
        });
        await prisma.classPack.create({
            data: {
                organizationId: owner.organizationId,
                name: `Archived pack ${++seq}`,
                credits: 5,
                validityDays: 30,
                price: "1500",
                currency: "INR",
                status: "ARCHIVED",
            },
        });

        const missing = await rates.missing(owner);
        expect(missing.registered).toBe(true);
        expect(missing.priceMode).toBe("INCLUDED");
        expect(missing.items.map((i) => [i.kind, i.id])).toEqual([
            ["PLAN", planId],
            ["PACK", packId],
            ["COURSE", courseId],
        ]);

        // Choosing them empties the list.
        await rates.set(owner, {
            items: [
                { kind: "PLAN", id: planId, rate: "18" },
                { kind: "PACK", id: packId, rate: "18" },
                { kind: "COURSE", id: courseId, rate: "0" },
            ],
        });
        expect((await rates.missing(owner)).items).toEqual([]);
    });

    it("keeps listing an archived plan while anyone is still on it: their renewals are tax invoices", async () => {
        const owner = await business("NOT_REGISTERED");
        const planId = await plan(owner);
        await subscriptions.subscribe(owner, {
            contactId: await contact(owner),
            planId,
        });
        await subscriptions.setPlanStatus(owner, planId, "ARCHIVED");
        const emptyArchived = await plan(owner);
        await subscriptions.setPlanStatus(owner, emptyArchived, "ARCHIVED");
        await prisma.businessProfile.update({
            where: { organizationId: owner.organizationId },
            data: { gstRegistered: true, taxId: GSTIN, gstState: "29" },
        });
        const missing = await rates.missing(owner);
        expect(missing.items.map((i) => i.id)).toEqual([planId]);
    });
});
