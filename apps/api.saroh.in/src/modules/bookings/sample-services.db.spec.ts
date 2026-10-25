/**
 * A trade starter's samples against a real Postgres (#1193, DEC-189):
 *
 * - no public read shows or books a sample before it is kept — the booking
 *   page, booking it by id, the Timetable, On today, the Book page's
 *   default sections and the template context — even one somehow shown on
 *   the booking page, since each reader also filters on `NOT_SAMPLE`;
 * - Keep shows it and changes nothing else; Keep all keeps every one;
 * - the first edit of a sample keeps it too.
 *
 * Runs in the integration project (TEST_DATABASE_URL).
 */
import { GoneException, NotFoundException } from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { defaultModuleSections } from "../sites/module-page-sections";
import { buildTemplateContext } from "../sites/site-template";
import { BookingsService } from "./bookings.service";
import { publicBookingPage } from "./public-booking-page";
import { PublicTimetableService } from "./public-timetable";
import { PublicTodayService } from "./public-today";
import { FixedWindowRateLimiter } from "./rate-limiter";
import { loadBookableService } from "./reservation";

const bookings = new BookingsService();

let seq = 0;
const uniq = (label: string) => `${label}-${process.pid}-${++seq}`;

const WEEK = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"].map((day) => ({
    day,
    open: "00:00",
    close: "23:59",
    closed: false,
}));

/** A business with a published site, a counter and Bookings on. */
async function business(): Promise<OrganizationContext & { siteId: string }> {
    const org = await prisma.organization.create({
        data: { name: "Noor Salon", slug: uniq("s189-org") },
    });
    await prisma.businessProfile.create({
        data: { organizationId: org.id, timezone: "UTC" },
    });
    await prisma.store.create({
        data: {
            name: "Main",
            slug: uniq("s189-store"),
            organizationId: org.id,
            settings: { create: { kind: "SHOP", openingHours: WEEK } },
        },
    });
    for (const moduleKey of ["CRM", "APPOINTMENTS"] as const) {
        await prisma.organizationModule.create({
            data: { organizationId: org.id, moduleKey, status: "ENABLED" },
        });
    }
    const site = await prisma.site.create({
        data: { organizationId: org.id, name: "Noor", slug: uniq("s189-site") },
    });
    const publication = await prisma.publication.create({
        data: {
            siteId: site.id,
            organizationId: org.id,
            snapshot: {},
            templateId: "blank",
            templateVersion: 1,
        },
    });
    await prisma.site.update({
        where: { id: site.id },
        data: { currentPublicationId: publication.id },
    });
    return {
        organizationId: org.id,
        userId: "user_owner",
        role: "OWNER",
        siteId: site.id,
    };
}

/** A sample class bookable all day, every day. */
async function sample(
    organizationId: string,
    name: string,
    extra: { showOnBookingPage?: boolean } = {},
) {
    return (
        await prisma.service.create({
            data: {
                organizationId,
                name,
                durationMinutes: 60,
                capacity: 4,
                priceCents: 50_000,
                currency: "INR",
                timezone: "UTC",
                isSample: true,
                showOnBookingPage: extra.showOnBookingPage ?? false,
                availabilityRules: {
                    create: [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
                        organizationId,
                        dayOfWeek,
                        startMinute: 60,
                        endMinute: 23 * 60,
                    })),
                },
            },
        })
    ).id;
}

/** What every public reader says about the business, as ids and names. */
async function publicReads(ctx: { organizationId: string; siteId: string }) {
    const limiter = () => new FixedWindowRateLimiter(1_000);
    // Fresh readers each time: they keep their answers for a while.
    const [page, timetable, today, sections, context] = await Promise.all([
        publicBookingPage(ctx.siteId),
        new PublicTimetableService(limiter()).read(ctx.siteId, [], "visitor"),
        new PublicTodayService(limiter()).read(ctx.siteId, "visitor"),
        defaultModuleSections(prisma as never, {
            organizationId: ctx.organizationId,
            siteId: ctx.siteId,
            siteName: "Noor",
            kind: "BOOK",
        }),
        buildTemplateContext(ctx.organizationId, { siteId: ctx.siteId }),
    ]);
    return {
        page: page.services.map((s) => s.id),
        timetable: timetable.sessions.map((s) => s.serviceId),
        today: today.appointments,
        sections: JSON.stringify(sections),
        context: context.serviceIds,
    };
}

describe("samples stay off every public read until kept (DEC-189)", () => {
    it("hidden samples: nothing public, and booking one by id is refused", async () => {
        const ctx = await business();
        const id = await sample(ctx.organizationId, "Blow-dry");
        const reads = await publicReads(ctx);
        expect(reads.page).not.toContain(id);
        expect(reads.timetable).not.toContain(id);
        expect(reads.today).toBe(false);
        expect(reads.sections).not.toContain(id);
        expect(reads.context).not.toContain(id);
        await expect(
            loadBookableService(id, { bookingPage: true }),
        ).rejects.toBeInstanceOf(GoneException);
    });

    it("a sample somehow ticked for the booking page is still left off", async () => {
        const ctx = await business();
        const id = await sample(ctx.organizationId, "Hair spa", {
            showOnBookingPage: true,
        });
        const reads = await publicReads(ctx);
        expect(reads.page).not.toContain(id);
        expect(reads.timetable).not.toContain(id);
        expect(reads.today).toBe(false);
        expect(reads.sections).not.toContain(id);
        expect(reads.context).not.toContain(id);
        await expect(
            loadBookableService(id, { bookingPage: true }),
        ).rejects.toBeInstanceOf(GoneException);
    });

    it("Keep shows it everywhere, and changes nothing else", async () => {
        const ctx = await business();
        const id = await sample(ctx.organizationId, "Classic manicure");
        const before = await prisma.service.findUniqueOrThrow({
            where: { id },
        });
        const kept = await bookings.keepService(ctx, id);
        expect(kept).toMatchObject({
            id,
            isSample: false,
            showOnBookingPage: true,
            name: before.name,
            priceCents: before.priceCents,
            durationMinutes: before.durationMinutes,
        });
        const reads = await publicReads(ctx);
        expect(reads.page).toContain(id);
        expect(reads.timetable).toContain(id);
        expect(reads.today).toBe(true);
        expect(reads.context).toContain(id);
        await expect(
            loadBookableService(id, { bookingPage: true }),
        ).resolves.toBeTruthy();
    });

    it("Keep all keeps every sample, and only this business's", async () => {
        const ctx = await business();
        const rival = await business();
        const ours = [
            await sample(ctx.organizationId, "Men's haircut"),
            await sample(ctx.organizationId, "Beard trim"),
        ];
        const theirs = await sample(rival.organizationId, "Facial");
        await expect(bookings.keepAllSamples(ctx)).resolves.toEqual({
            kept: 2,
        });
        const rows = await prisma.service.findMany({
            where: { id: { in: [...ours, theirs] } },
            select: { id: true, isSample: true, showOnBookingPage: true },
        });
        for (const row of rows) {
            expect(row).toMatchObject(
                row.id === theirs
                    ? { isSample: true, showOnBookingPage: false }
                    : { isSample: false, showOnBookingPage: true },
            );
        }
        await expect(bookings.keepAllSamples(ctx)).resolves.toEqual({
            kept: 0,
        });
    });

    it("Keep on another business's service is a 404", async () => {
        const ctx = await business();
        const rival = await business();
        const theirs = await sample(rival.organizationId, "Facial");
        await expect(bookings.keepService(ctx, theirs)).rejects.toBeInstanceOf(
            NotFoundException,
        );
    });

    it("the first edit of a sample keeps it, and a save that hides it stays hidden", async () => {
        const ctx = await business();
        const edited = await sample(ctx.organizationId, "Root touch-up");
        await expect(
            bookings.updateService(ctx, edited, { priceCents: 60_000 }),
        ).resolves.toMatchObject({
            isSample: false,
            showOnBookingPage: true,
            priceCents: 60_000,
        });
        const hidden = await sample(ctx.organizationId, "Keratin");
        await expect(
            bookings.updateService(ctx, hidden, { showOnBookingPage: false }),
        ).resolves.toMatchObject({
            isSample: false,
            showOnBookingPage: false,
        });
    });
});
