/**
 * Round-2 E13 against a real Postgres: a pack's kind (and its lock once
 * sold), first pack only, how a sale was paid, extensions, the activity log,
 * and Pack Detail's reads. Runs in the integration project
 * (TEST_DATABASE_URL).
 */
import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
} from "@nestjs/common";
import { prisma } from "@saroh/database";

import { giveBusinessDetails } from "../../../test/business-details";
import type { OrganizationContext } from "../../common/types/organization-context";
import { offeredCredit } from "../bookings/booking-credit";
import { InvoicesService } from "../invoices/invoices.service";
import { resolveCapabilities } from "../organizations/organization-policy";
import { ClassPacksService } from "./class-packs.service";
import { FIRST_PACK_ONLY } from "./first-pack";
import { KIND_LOCKED } from "./pack-kind";

const packs = new ClassPacksService(new InvoicesService());

const DAY = 86_400_000;
let owner: OrganizationContext;
let deskReader: OrganizationContext;
let elsewhere: OrganizationContext;
let hiit: string; // a class: twenty at once
let pt: string; // one-to-one: one at a time
let people = 0;
let made = 0;

async function person(): Promise<string> {
    people += 1;
    return (
        await prisma.contact.create({
            data: {
                organizationId: owner.organizationId,
                email: `e13-${people}-${process.pid}@example.com`,
                firstName: `Holder${people}`,
            },
        })
    ).id;
}

async function service(name: string, capacity: number): Promise<string> {
    return (
        await prisma.service.create({
            data: {
                organizationId: owner.organizationId,
                name,
                durationMinutes: 60,
                capacity,
                timezone: "UTC",
                status: "ACTIVE",
            },
        })
    ).id;
}

async function classesPack(over: Record<string, unknown> = {}) {
    made += 1;
    return packs.createPack(owner, {
        name: `Classes ${made}`,
        credits: 5,
        validityDays: 60,
        price: "2200",
        currency: "INR",
        serviceIds: [hiit],
        ...over,
    });
}

async function ptPack(over: Record<string, unknown> = {}) {
    made += 1;
    return packs.createPack(owner, {
        name: `PT ${made}`,
        credits: 5,
        validityDays: 90,
        price: "5500",
        currency: "INR",
        serviceIds: [pt],
        kind: "ONE_TO_ONE",
        ...over,
    });
}

async function booking(
    serviceId: string,
    contactId: string,
    startAt: Date,
    status = "CONFIRMED",
) {
    return prisma.booking.create({
        data: {
            organizationId: owner.organizationId,
            serviceId,
            contactId,
            startAt,
            endAt: new Date(startAt.getTime() + 3_600_000),
            timezone: "UTC",
            status,
            snapshot: {},
            bookerEmail: "holder@example.com",
        },
    });
}

/** The error a call is refused with. */
async function refusal(call: Promise<unknown>): Promise<Error> {
    try {
        await call;
    } catch (e) {
        return e as Error;
    }
    throw new Error("expected a refusal");
}

function message(e: Error): string {
    const res = (e as ConflictException).getResponse?.() as
        { message?: string } | string;
    return typeof res === "string" ? res : (res?.message ?? e.message);
}

beforeAll(async () => {
    const org = await prisma.organization.create({
        data: { name: "Pulse E13", slug: `e13-${process.pid}` },
    });
    await giveBusinessDetails(org.id);
    const neha = await prisma.user.create({
        data: { email: `e13-neha-${process.pid}@example.com`, name: "Neha" },
    });
    await prisma.membership.create({
        data: { organizationId: org.id, userId: neha.id, role: "OWNER" },
    });
    owner = { organizationId: org.id, userId: neha.id, role: "OWNER" };
    const desk = await prisma.user.create({
        data: { email: `e13-desk-${process.pid}@example.com`, name: "Desk" },
    });
    // Reads packs, and nothing about payments or invoices.
    deskReader = {
        organizationId: org.id,
        userId: desk.id,
        role: "MEMBER",
        roleKey: "front-desk",
        actions: resolveCapabilities("front-desk", ["pack:read"]),
    };
    const other = await prisma.organization.create({
        data: { name: "Other E13", slug: `e13-other-${process.pid}` },
    });
    await giveBusinessDetails(other.id);
    elsewhere = { organizationId: other.id, userId: neha.id, role: "OWNER" };
    hiit = await service("HIIT", 20);
    pt = await service("Personal training", 1);
});

describe("how a sale was paid (E13)", () => {
    it("sells with paidBy=UPI, and the Sales read shows the method, amount and seller", async () => {
        const pack = await classesPack();
        const who = await person();
        const sold = await packs.sell(owner, pack.id, {
            contactId: who,
            paidBy: "UPI",
        });
        expect(sold.paidBy).toBe("UPI");

        const sales = await packs.listSales(deskReader, pack.id);
        expect(sales).toHaveLength(1);
        expect(sales[0]).toMatchObject({
            purchaseId: sold.id,
            contact: { id: who },
            price: "2200.00",
            currency: "INR",
            paidBy: "UPI",
            soldBy: { kind: "TEAM", name: "Neha" },
            // pack:read covers the money; the invoice link needs invoice:read.
            invoiceId: null,
        });
        expect((await packs.listSales(owner, pack.id))[0]!.invoiceId).toBe(
            sold.invoiceId,
        );
    });

    it("a sale with no payment is NONE, and one from an older app records none", async () => {
        const pack = await classesPack();
        await packs.sell(owner, pack.id, {
            contactId: await person(),
            paidBy: "NONE",
        });
        await packs.sell(owner, pack.id, { contactId: await person() });
        const methods = (await packs.listSales(owner, pack.id)).map(
            (s) => s.paidBy,
        );
        expect(methods.sort()).toEqual(["NONE", null].sort());
    });
});

describe("extensions (default 46)", () => {
    it("extends by 14 days: the use-by date moves, and it is logged", async () => {
        const pack = await classesPack();
        const sold = await packs.sell(owner, pack.id, {
            contactId: await person(),
        });
        const before = new Date(sold.expiresAt).getTime();

        const holder = await packs.extend(owner, sold.id, {
            days: 14,
            reason: "Away for work in August",
        });
        expect(new Date(holder.expiresAt).getTime() - before).toBe(14 * DAY);
        expect(holder.extendedDays).toBe(14);
        expect(holder.extensions).toEqual([
            expect.objectContaining({
                days: 14,
                reason: "Away for work in August",
                by: { userId: owner.userId, name: "Neha" },
            }),
        ]);
        const { events } = await packs.listEvents(owner, pack.id, {});
        expect(events[0]).toMatchObject({
            kind: "EXTENDED",
            holder: { purchaseId: sold.id },
            details: { days: 14, reason: "Away for work in August" },
            actor: { kind: "TEAM", name: "Neha" },
        });
    });

    it("refuses 31 days (400) and a pack with nothing left (409)", async () => {
        const pack = await classesPack({ credits: 1 });
        const who = await person();
        const sold = await packs.sell(owner, pack.id, { contactId: who });
        expect(
            await refusal(
                packs.extend(owner, sold.id, { days: 31, reason: "Long" }),
            ),
        ).toBeInstanceOf(BadRequestException);

        const b = await booking(hiit, who, new Date(Date.now() + 2 * DAY));
        await packs.useOnBooking(owner, b.id, { packPurchaseId: sold.id });
        const e = await refusal(
            packs.extend(owner, sold.id, { days: 7, reason: "Late" }),
        );
        expect(e).toBeInstanceOf(ConflictException);
        expect(message(e)).toBe("Nothing left to extend");
        expect(
            await prisma.packExtension.count({
                where: { purchaseId: sold.id },
            }),
        ).toBe(0);
    });

    it("extends an expired pack, as long as the new date is still to come", async () => {
        const pack = await classesPack();
        const sold = await packs.sell(owner, pack.id, {
            contactId: await person(),
        });
        // It ran out five days ago.
        await prisma.packPurchase.update({
            where: { id: sold.id },
            data: { expiresAt: new Date(Date.now() - 5 * DAY) },
        });
        expect(
            await refusal(
                packs.extend(owner, sold.id, { days: 3, reason: "Too few" }),
            ),
        ).toBeInstanceOf(BadRequestException);
        const holder = await packs.extend(owner, sold.id, {
            days: 10,
            reason: "Was ill",
        });
        expect(holder.standing).toBe("ACTIVE");
    });

    it("another business's purchase is a 404", async () => {
        const pack = await classesPack();
        const sold = await packs.sell(owner, pack.id, {
            contactId: await person(),
        });
        await expect(
            packs.extend(elsewhere, sold.id, { days: 7, reason: "No" }),
        ).rejects.toMatchObject({ status: 404 });
    });
});

describe("the kind (default 45)", () => {
    it("refuses changing the kind after a sale (409), and allows it before", async () => {
        const unsold = await classesPack();
        const changed = await packs.updatePack(owner, unsold.id, {
            kind: "ONE_TO_ONE",
        });
        expect(changed.kind).toBe("ONE_TO_ONE");

        const pack = await classesPack();
        await packs.sell(owner, pack.id, { contactId: await person() });
        const e = await refusal(
            packs.updatePack(owner, pack.id, { kind: "ONE_TO_ONE" }),
        );
        expect(e).toBeInstanceOf(ConflictException);
        expect(message(e)).toBe(KIND_LOCKED);
        expect((await packs.getPack(owner, pack.id)).kind).toBe("CLASSES");
    });

    it("publishing a pending kind change of a sold pack is a 409, and the published pack is unchanged", async () => {
        const pack = await classesPack();
        await packs.sell(owner, pack.id, { contactId: await person() });
        const editor = await packs.getPackEditor(owner, pack.id);
        // Autosave keeps it, with a warning in problems.
        const saved = await packs.savePackDraft(owner, pack.id, {
            revision: editor.revision,
            kind: "ONE_TO_ONE",
            price: "2500",
        });
        expect(saved.problems).toContainEqual({
            field: "kind",
            message: KIND_LOCKED,
        });
        const e = await refusal(
            packs.publishPack(owner, pack.id, saved.revision),
        );
        expect(e).toBeInstanceOf(ConflictException);
        const live = await packs.getPack(owner, pack.id);
        expect(live).toMatchObject({ kind: "CLASSES", price: "2200.00" });
        expect(live.hasPendingChanges).toBe(true);
    });

    it("a one-to-one pack isn't offered for a class, and a Classes pack isn't for one-to-one", async () => {
        const who = await person();
        const onePT = await packs.sell(
            owner,
            (await ptPack({ serviceIds: [pt, hiit] })).id,
            {
                contactId: who,
            },
        );
        const classes = await packs.sell(
            owner,
            (await classesPack({ serviceIds: [hiit, pt] })).id,
            {
                contactId: who,
            },
        );

        // New booking's list, per service.
        const forClass = await packs.listPurchases(owner, {
            contactId: who,
            serviceId: hiit,
        });
        expect(forClass.map((p) => p.id)).toEqual([classes.id]);
        const forPT = await packs.listPurchases(owner, {
            contactId: who,
            serviceId: pt,
        });
        expect(forPT.map((p) => p.id)).toEqual([onePT.id]);

        // The desk spending it on a class.
        const cls = await booking(hiit, who, new Date(Date.now() + 3 * DAY));
        const e = await refusal(
            packs.useOnBooking(owner, cls.id, { packPurchaseId: onePT.id }),
        );
        expect(message(e)).toBe("That class pack does not cover this service.");
        const spent = await packs.useOnBooking(owner, cls.id, {});
        expect(spent.purchase.id).toBe(classes.id);

        // The customer's credit online (A10) offers the same pack.
        const start = new Date(Date.now() + 4 * DAY);
        const offer = await offeredCredit(prisma, {
            organizationId: owner.organizationId,
            contactId: who,
            service: { id: pt, capacity: 1, timezone: "UTC", visits: 1 },
            startAt: start,
        });
        expect(offer).toMatchObject({ kind: "PACK", id: onePT.id });
        const forAClass = await offeredCredit(prisma, {
            organizationId: owner.organizationId,
            contactId: who,
            service: { id: hiit, capacity: 20, timezone: "UTC", visits: 1 },
            startAt: start,
        });
        expect(forAClass).toMatchObject({ kind: "PACK", id: classes.id });
    });
});

describe("first pack only", () => {
    it("refuses someone who held a pack of its kind before: 409 'Only for a first pack'", async () => {
        const who = await person();
        await packs.sell(owner, (await classesPack()).id, { contactId: who });
        const intro = await classesPack({
            name: "First 3 classes",
            credits: 3,
            validityDays: 21,
            firstPackOnly: true,
        });
        const e = await refusal(
            packs.sell(owner, intro.id, { contactId: who }),
        );
        expect(e).toBeInstanceOf(ConflictException);
        expect(message(e)).toBe(FIRST_PACK_ONLY);

        // A one-to-one pack isn't a pack of its kind.
        const other = await person();
        await packs.sell(owner, (await ptPack()).id, { contactId: other });
        await expect(
            packs.sell(owner, intro.id, { contactId: other }),
        ).resolves.toMatchObject({ pack: { id: intro.id } });
    });

    it("sells it once when two desks sell it to the same person at once", async () => {
        const intro = await classesPack({ firstPackOnly: true });
        const who = await person();
        const results = await Promise.allSettled([
            packs.sell(owner, intro.id, { contactId: who }),
            packs.sell(owner, intro.id, { contactId: who }),
        ]);
        expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
        expect(
            await prisma.packPurchase.count({ where: { contactId: who } }),
        ).toBe(1);
    });
});

describe("Pack Detail's reads", () => {
    it("gives the overview: holders, classes left, running out, lost, and sales this month", async () => {
        const pack = await classesPack({ credits: 5 });
        const a = await person();
        const b = await person();
        const c = await person();
        const sa = await packs.sell(owner, pack.id, { contactId: a });
        await packs.sell(owner, pack.id, { contactId: b });
        const sc = await packs.sell(owner, pack.id, { contactId: c });
        // a's runs out in 5 days; c's ran out with 5 unused.
        await prisma.packPurchase.update({
            where: { id: sa.id },
            data: { expiresAt: new Date(Date.now() + 5 * DAY) },
        });
        await prisma.packPurchase.update({
            where: { id: sc.id },
            data: { expiresAt: new Date(Date.now() - DAY) },
        });
        const b1 = await booking(hiit, a, new Date(Date.now() + 2 * DAY));
        await packs.useOnBooking(owner, b1.id, { packPurchaseId: sa.id });

        const { overview } = await packs.getPack(deskReader, pack.id);
        expect(overview).toEqual({
            holders: 2,
            creditsLeft: 9,
            runningOut: 1,
            lostToExpiry: 5,
            sold: 3,
            soldThisMonth: 3,
            takings: [{ currency: "INR", amount: "6600.00" }],
            takingsThisMonth: [{ currency: "INR", amount: "6600.00" }],
        });

        const holders = await packs.listHolders(deskReader, pack.id);
        expect(holders.map((h) => h.standing)).toEqual([
            "ACTIVE",
            "ACTIVE",
            "EXPIRED",
        ]);
        // Soonest to end first among the live ones.
        expect(holders[0]).toMatchObject({
            purchaseId: sa.id,
            left: 4,
            used: 1,
            price: "2200.00",
        });
    });

    it("lists this week's uses with what became of each", async () => {
        const pack = await classesPack();
        const who = await person();
        const sold = await packs.sell(owner, pack.id, { contactId: who });
        // Starts of this week in UTC (the business's zone falls back to its
        // first service's, UTC here).
        const now = new Date();
        const monday = new Date(
            Date.UTC(
                now.getUTCFullYear(),
                now.getUTCMonth(),
                now.getUTCDate() - ((now.getUTCDay() + 6) % 7),
                9,
            ),
        );
        const came = await booking(hiit, who, monday);
        const back = await booking(
            hiit,
            who,
            new Date(monday.getTime() + 3600_000 * 2),
        );
        const late = await booking(
            hiit,
            who,
            new Date(monday.getTime() + 3600_000 * 4),
        );
        const lastWeek = await booking(
            hiit,
            who,
            new Date(monday.getTime() - 2 * DAY),
        );
        for (const b of [came, back, late, lastWeek]) {
            await packs.useOnBooking(owner, b.id, { packPurchaseId: sold.id });
        }
        await prisma.booking.update({
            where: { id: came.id },
            data: { outcome: "ATTENDED" },
        });
        await packs.removeFromBooking(owner, back.id);
        await prisma.booking.update({
            where: { id: late.id },
            data: { status: "CANCELLED", cancelledAt: new Date() },
        });

        const used = await packs.listUsed(owner, pack.id, {});
        expect(used.from).toBe(
            monday.toISOString().slice(0, 10) + "T00:00:00.000Z",
        );
        expect(used.uses.map((u) => [u.bookingId, u.state])).toEqual([
            [came.id, "CAME"],
            [back.id, "CREDIT_BACK"],
            [late.id, "LATE_CANCEL"],
        ]);
        expect(used.uses[0]).toMatchObject({
            service: { id: hiit, name: "HIIT" },
            contact: { id: who },
        });

        const asked = await packs.listUsed(owner, pack.id, {
            from: new Date(monday.getTime() - 7 * DAY).toISOString(),
            to: monday.toISOString(),
        });
        expect(asked.uses.map((u) => u.bookingId)).toEqual([lastWeek.id]);
        await expect(
            packs.listUsed(owner, pack.id, {
                from: monday.toISOString(),
                to: new Date(monday.getTime() + 90 * DAY).toISOString(),
            }),
        ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("keeps an activity log: created, sold, changed, archived, restored, newest first", async () => {
        const pack = await classesPack();
        const who = await person();
        await packs.sell(owner, pack.id, { contactId: who, paidBy: "CASH" });
        await packs.updatePack(owner, pack.id, { price: "2500" });
        await packs.setPackStatus(owner, pack.id, "ARCHIVED");
        await packs.setPackStatus(owner, pack.id, "ACTIVE");

        const page = await packs.listEvents(deskReader, pack.id, {});
        expect(page.earlierUnrecorded).toBe(false);
        expect(page.events.map((e) => e.kind)).toEqual([
            "RESTORED",
            "ARCHIVED",
            "CHANGED",
            "SOLD",
            "CREATED",
        ]);
        expect(page.events[2]!.details).toEqual({
            price: ["2200.00", "2500.00"],
        });
        expect(page.events[3]).toMatchObject({
            details: { price: "2200.00", paidBy: "CASH" },
            holder: { contactId: who },
        });

        // Paged by the last event's id.
        const first = await packs.listEvents(owner, pack.id, { limit: 2 });
        const rest = await packs.listEvents(owner, pack.id, {
            cursor: first.nextCursor!,
        });
        expect([...first.events, ...rest.events].map((e) => e.id)).toEqual(
            page.events.map((e) => e.id),
        );
    });

    it("says earlier changes weren't recorded for a pack made before the log", async () => {
        const old = await prisma.classPack.create({
            data: {
                organizationId: owner.organizationId,
                name: "From before E13",
                credits: 5,
                validityDays: 60,
                price: "2000",
                currency: "INR",
            },
        });
        const page = await packs.listEvents(owner, old.id, {});
        expect(page).toEqual({
            events: [],
            nextCursor: null,
            earlierUnrecorded: true,
        });
    });

    it("keeps a sale's event, without a name, when its buyer is deleted", async () => {
        const pack = await classesPack();
        const who = await person();
        await packs.sell(owner, pack.id, { contactId: who });
        await prisma.contact.delete({ where: { id: who } });
        const { events } = await packs.listEvents(owner, pack.id, {});
        expect(events[0]).toMatchObject({ kind: "SOLD", holder: null });
    });

    it("refuses every read without pack:read (403), and another business's pack is a 404", async () => {
        const pack = await classesPack();
        const reviewer: OrganizationContext = { ...owner, role: "REVIEWER" };
        expect(
            await refusal(packs.listHolders(reviewer, pack.id)),
        ).toBeInstanceOf(ForbiddenException);
        expect(
            await refusal(packs.listSales(reviewer, pack.id)),
        ).toBeInstanceOf(ForbiddenException);
        await expect(packs.listSales(elsewhere, pack.id)).rejects.toMatchObject(
            { status: 404 },
        );
        await expect(packs.getPack(elsewhere, pack.id)).rejects.toMatchObject({
            status: 404,
        });
    });
});
