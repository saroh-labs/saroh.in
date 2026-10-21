import type { Prisma } from "@prisma/client";

import type { Db } from "../helpers";
import { bookingRows, planBookings, upsertServices } from "./appointments";
import type { BillingContext } from "./billing";
import { planPacks } from "./billing";
import { planLeads, upsertPipeline } from "./crm";
import {
    DK_CATEGORIES,
    DK_ENQUIRIES,
    DK_FOOTER,
    DK_LEADS,
    DK_NAME,
    DK_NAMES,
    DK_PACKS,
    DK_PATHS,
    DK_PIPELINE,
    DK_PLANS,
    DK_PRODUCTS,
    DK_QR,
    DK_SAC,
    DK_SERVICE,
    DK_SERVICES,
    DK_SITE,
    DK_SPEC,
    DK_STAFF,
    DK_TIMELINE,
} from "./desk42-data";
import { DK_POSTS } from "./desk42-posts";
import { addMinutes, earliest, istAt } from "./people";
import type {
    Business,
    GstInvoiceSpec,
    MemberSpec,
    VerticalContext,
} from "./vertical";
import {
    asGst,
    bump,
    clearVolume,
    createInChunks,
    DAY,
    makeCast,
    planMemberships,
    planShop,
    requireStates,
    rngFor,
    setServiceGst,
    settleOldLeads,
    setupBusiness,
    upsertProducts,
    upsertStaff,
    writeGstInvoices,
    writePlans,
    writePosts,
    writeQrCodes,
    writeShop,
    writeTraffic,
    writeVerticalSite,
} from "./vertical";

export { DK_NAME } from "./desk42-data";

const LEADS = 22;
const FORM_LEADS = 14;
const OTHERS = 124;

/** Contacts in the CRM: the membership enquiries, then members and visitors. */
export const DK_PEOPLE = LEADS + OTHERS;

/**
 * The diary's shape. `showAhead` is what the demo shows booked ahead (a day
 * pass, the room, the booth), so it is there on every day the seed runs
 * rather than when the draws allow it.
 */
export const DK_DIARY = {
    target: 340,
    fromDay: -90,
    toDay: 14,
    prospects: Array.from({ length: LEADS }, (_, i) => i),
    prospectServices: [DK_SERVICE.tour],
    weekdayWeights: [0, 1.1, 1.15, 1.1, 1.05, 0.95, 0.45],
    showAhead: [DK_SERVICE.dayPass, DK_SERVICE.room, DK_SERVICE.booth],
};

/** The booth opening (about ten weeks back) and the November events. */
const extraTraffic = () => {
    const booth = bump(-68, 0.4, 8);
    const backup = bump(-29, 0.15, 5);
    const events = bump(-6, 0.3, 6);
    return (d: number) => booth(d) + backup(d) + events(d);
};

export async function seedDesk42(
    ctx: VerticalContext,
): Promise<{ id: string; name: string; prefix: string }> {
    const { prisma, now } = ctx;
    const b = await setupBusiness(ctx, DK_SPEC);
    const { sid, orgId } = b;

    const services = await upsertServices(prisma, {
        orgId,
        services: DK_SERVICES,
        serviceId: (i) => sid("service", i),
        ruleId: (i, k) => sid("rule", i, k),
        createdAt: b.createdAt,
    });
    const staffIds = await upsertStaff(prisma, b, DK_STAFF, services);
    const pipelineId = sid("pipeline");
    const stageIds = await upsertPipeline(prisma, {
        orgId,
        pipelineId,
        stageId: (i) => sid("stage", i),
        name: DK_PIPELINE.name,
        stages: DK_PIPELINE.stages,
    });

    await clearVolume(prisma, b);

    const { siteId, formId } = await writeVerticalSite(prisma, b, {
        now,
        site: DK_SITE,
        footer: DK_FOOTER,
        pipelineId,
        services,
    });
    await setServiceGst(
        prisma,
        services,
        DK_SERVICES.map((s) => ({ sac: s.sac, rate: 18, shown: s.shown })),
        siteId,
    );
    const posts = await writePosts(prisma, b, {
        now,
        siteId,
        posts: DK_POSTS,
        authors: {
            "Rhea Deshpande": b.users.rhea,
            "Omkar Pawar": b.users.omkar,
        },
    });
    const products = await upsertProducts(
        prisma,
        b,
        DK_CATEGORIES,
        DK_PRODUCTS,
    );
    const extra = extraTraffic();
    const qrIds = await writeQrCodes(prisma, b, {
        now,
        siteId,
        codes: DK_QR,
        weekendFactor: 0.4,
        dayWeight: (d) => 1 + extra(d),
    });

    // --- people: membership enquiries first, then members and visitors
    const people = makeCast(
        rngFor(sid(""), "people"),
        LEADS + OTHERS,
        DK_NAMES,
    );
    const contacts = people.map((person, i) => ({
        id: sid("contact", i),
        person,
        name: `${person.first} ${person.last}`,
        email: person.email,
    }));
    const regulars = people.map((_, i) => i).filter((i) => i >= LEADS);
    const team = [b.users.owner, b.users.rhea, b.users.omkar];
    const seen: { contact: number; at: Date }[] = [];

    // --- leads
    const leadRng = rngFor(sid(""), "leads");
    const form = { id: formId(6, 4), name: "Membership enquiry" };
    const specs = Array.from({ length: LEADS }, (_, i) => {
        const template = DK_LEADS[i % DK_LEADS.length];
        const createdAt = earliest(
            istAt(now, -leadRng.int(1, 75), leadRng.int(9 * 60, 21 * 60)),
            addMinutes(now, -120),
        );
        return {
            contactId: contacts[i].id,
            title: `${template.title} — ${people[i].company ?? contacts[i].name}`,
            value: i < FORM_LEADS ? null : template.value,
            formId: i < FORM_LEADS ? form.id : null,
            createdAt,
        };
    });
    const { leads, activities } = planLeads(leadRng, specs, {
        now,
        orgId,
        pipelineId,
        stageIds,
        stageNames: DK_PIPELINE.stages,
        actorUserIds: [b.users.rhea, b.users.rhea, b.users.omkar],
        notes: DK_TIMELINE.notes,
        tasks: DK_TIMELINE.tasks,
        wonShare: 0.5,
        lostShare: 0.15,
        leadId: (n) => sid("lead", n),
        activityId: (n, k) => sid("activity", n, k),
    });
    settleOldLeads(
        leadRng,
        { leads, activities },
        {
            now,
            days: 25,
            stageIds,
            stageNames: DK_PIPELINE.stages,
            actor: b.users.rhea,
            wonShare: 0.45,
            lostShare: 0.25,
            activityId: (n, k) => sid("activity", n, k),
        },
    );
    specs.forEach((s, i) => seen.push({ contact: i, at: s.createdAt }));
    const submissions: Prisma.SubmissionCreateManyInput[] = specs
        .slice(0, FORM_LEADS)
        .map((s, i) => ({
            id: sid("submission", i),
            organizationId: orgId,
            formId: form.id,
            contactId: contacts[i].id,
            leadId: sid("lead", i),
            data: {
                name: contacts[i].name,
                email: contacts[i].email,
                phone: people[i].phone,
                ...(people[i].company ? { company: people[i].company } : {}),
                team: DK_ENQUIRIES[i % DK_ENQUIRIES.length].team,
                message: DK_ENQUIRIES[i % DK_ENQUIRIES.length].message,
            },
            createdAt: s.createdAt,
        }));

    // --- the diary: day passes, the room, the booth, tours
    const planned = planBookings(rngFor(sid(""), "bookings"), {
        ...DK_DIARY,
        now,
        services: DK_SERVICES,
        contacts: people.length,
    });
    const diary = bookingRows(planned, {
        now,
        orgId,
        services,
        contacts: contacts.map((c) => ({
            id: c.id,
            name: c.name,
            email: c.email,
            phone: c.person.phone,
        })),
        staffUserIds: [b.users.omkar, b.users.rhea],
        bookingId: (n) => sid("booking", n),
        eventId: (n, kind) => sid("bookingevent", n, kind),
    });
    for (const p of diary.placed)
        seen.push({ contact: p.contact, at: p.createdAt });

    const billing: BillingContext = {
        now,
        orgId,
        id: (...parts) => sid(...parts),
        rng: (concern) => rngFor(sid(""), concern),
        services,
        contacts: contacts.map((c) => ({
            id: c.id,
            name: c.name,
            email: c.email,
            phone: c.person.phone,
            company: c.person.company,
        })),
        pool: regulars,
        staff: [b.users.omkar, b.users.rhea],
        invoicing: true,
        seller: {
            sellerName: DK_NAME,
            sellerLegalName: b.seller.sellerLegalName,
            sellerEmail: b.seller.sellerEmail,
            sellerAddress: b.seller.sellerAddress,
        },
    };
    // Flexi 10: ten day passes, spent on the buyer's own bookings.
    const packs = planPacks(billing, DK_PACKS, diary.placed, b.createdAt);
    seen.push(...packs.seen);
    const redeemed = new Set(packs.redemptions.map((r) => r.bookingId));

    // Paid online at booking: each confirmed paid booking has its tax invoice.
    const invoices: GstInvoiceSpec[] = [];
    const payRng = rngFor(sid(""), "booking-pay");
    const bookings = diary.bookings.map((row, n) => {
        const fixture = DK_SERVICES[planned[n].service];
        const bookingId = String(row.id);
        const paidOnline =
            fixture.priceCents !== null &&
            !redeemed.has(bookingId) &&
            row.status === "CONFIRMED";
        const createdAt = row.createdAt as Date;
        if (paidOnline && fixture.priceCents !== null) {
            const at = addMinutes(createdAt, 1);
            invoices.push({
                id: sid("invoice", "booking", n),
                contact: planned[n].contact,
                createdAt: at,
                issuedAt: at,
                dueAt: at,
                lines: [
                    {
                        description: `${fixture.name} · ${dayLabel(row.startAt as Date)}`,
                        quantity: 1,
                        unitPaise: fixture.priceCents,
                        sac: DK_SAC,
                        rate: 18,
                    },
                ],
                source: "BOOKING",
                bookingId,
                createdByUserId: null,
                paid: {
                    at,
                    method: payRng.chance(0.75) ? "UPI" : "CARD",
                    reference: `pay_${payRng.int(10_000_000, 99_999_999).toString(36)}${payRng.int(10_000_000, 99_999_999).toString(36)}`,
                },
                voided: null,
            });
        }
        return {
            ...row,
            staffId:
                planned[n].service === DK_SERVICE.tour ? staffIds.rhea : null,
            bookedOnline: true,
            paidWith: redeemed.has(bookingId)
                ? "PACK"
                : paidOnline
                  ? "PAID"
                  : null,
            sourceCode:
                planned[n].service !== DK_SERVICE.tour && payRng.chance(0.1)
                    ? qrIds[0]
                    : null,
        };
    });
    invoices.push(
        ...packs.invoices.map((spec) =>
            asGst(spec, DK_SAC, (line) =>
                line.replace(/ · \d+ class(es)?$/, " · 10 day passes"),
            ),
        ),
    );

    // --- memberships
    const memberRng = rngFor(sid(""), "members");
    const pool = [...regulars];
    const take = () => pool.splice(memberRng.int(0, pool.length - 1), 1)[0];
    const members: MemberSpec[] = [];
    const active: [number, number][] = [
        [0, 14],
        [1, 12],
        [2, 10],
    ];
    for (const [plan, count] of active) {
        for (let k = 0; k < count; k++) {
            const fate =
                (plan === 0 || plan === 2) && k === 0
                    ? "FAILED"
                    : plan === 0 && k === 1
                      ? "ENDING"
                      : plan === 1 && k === 0
                        ? "PAUSED"
                        : "ACTIVE";
            members.push({
                plan,
                contact: take(),
                fate,
                startDaysAgo:
                    fate === "FAILED"
                        ? 30 * memberRng.int(1, 8) + 12
                        : memberRng.int(12, 480),
                slow: memberRng.chance(0.1),
            });
        }
    }
    const ended: [number, number][] = [
        [0, 10],
        [1, 5],
        [2, 6],
    ];
    for (const [plan, count] of ended) {
        for (let k = 0; k < count; k++) {
            const startDaysAgo = memberRng.int(70, 480);
            members.push({
                plan,
                contact: take(),
                fate: "CANCELLED",
                startDaysAgo,
                endDaysAgo: memberRng.int(3, startDaysAgo - 40),
            });
        }
    }
    const memberships = planMemberships(memberRng, b, {
        now,
        plans: DK_PLANS,
        members,
        contacts,
        staff: [b.users.rhea, b.users.owner],
        planCreatedAt: b.createdAt,
    });
    seen.push(...memberships.seen);
    invoices.push(...memberships.invoices);
    const memberIndexes = members.map((m) => m.contact);

    // --- the café, lockers, printing and merch
    const shop = planShop(rngFor(sid(""), "shop"), b, {
        now,
        count: 110,
        days: 92,
        products,
        contacts,
        buyers: [...memberIndexes, ...pool],
        weekdayWeights: [0, 1.1, 1.1, 1.1, 1.05, 1, 0.5],
        dayWeight: (d) => 1 + extra(d) * 0.3,
        openMinute: 8 * 60 + 30,
        closeMinute: 19 * 60,
        lineWeights: [55, 35, 10],
        orderPrefix: "BC-",
        staff: team,
        qr: { ids: [qrIds[1]], share: 0.3 },
    });
    seen.push(...shop.seen);

    // --- contacts, from the first thing each did
    const contactRng = rngFor(sid(""), "contacts");
    const firstSeen = people.map(() =>
        istAt(now, -contactRng.int(10, 500), contactRng.int(10 * 60, 19 * 60)),
    );
    for (const s of seen) {
        firstSeen[s.contact] = earliest(
            firstSeen[s.contact],
            new Date(s.at.getTime() - (s.contact < FORM_LEADS ? 0 : DAY)),
        );
    }
    const sources = [
        "WALK_IN",
        "GOOGLE",
        "INSTAGRAM",
        "REFERRAL",
        "WEBSITE",
        "QR",
    ];
    await createInChunks(
        contacts.map((c, i) => ({
            id: c.id,
            organizationId: orgId,
            email: c.email,
            firstName: c.person.first,
            lastName: c.person.last,
            phone: c.person.phone,
            company: c.person.company,
            source:
                i < FORM_LEADS
                    ? "WEBSITE"
                    : contactRng.weighted(sources, (s) =>
                          s === "GOOGLE" ? 3 : 1,
                      ),
            createdAt: earliest(firstSeen[i], now),
            updatedAt: earliest(firstSeen[i], now),
        })),
        (data) => prisma.contact.createMany({ data }),
    );

    const notes = memberNotes(b, now, memberIndexes, firstSeen);
    await prisma.lead.createMany({ data: leads });
    await prisma.activity.createMany({ data: activities });
    await prisma.submission.createMany({ data: submissions });
    await writePlans(prisma, memberships.plans);
    await createInChunks(memberships.subscriptions, (data) =>
        prisma.customerSubscription.createMany({ data }),
    );
    // The pack and what it covers are catalogue: upserted, like the plans.
    for (const pack of packs.packs) {
        await prisma.classPack.upsert({
            where: { id: pack.id },
            update: {
                name: pack.name,
                description: pack.description,
                credits: pack.credits,
                validityDays: pack.validityDays,
                price: pack.price,
                status: pack.status,
            },
            create: pack,
        });
    }
    await prisma.classPackService.deleteMany({
        where: { packId: { in: packs.packs.map((p) => String(p.id)) } },
    });
    await prisma.classPackService.createMany({ data: packs.packServices });
    await createInChunks(bookings, (data) =>
        prisma.booking.createMany({ data }),
    );
    const events = diary.events.map((e) => {
        const by = packs.bookedBy.get(e.bookingId);
        return e.type === "BOOKED" && by ? { ...e, actorUserId: by } : e;
    });
    await createInChunks(events, (data) =>
        prisma.bookingEvent.createMany({ data }),
    );
    await prisma.packPurchase.createMany({ data: packs.purchases });
    await prisma.packRedemption.createMany({ data: packs.redemptions });
    await writeShop(prisma, shop);
    const written = await writeGstInvoices(
        prisma,
        b,
        DK_SPEC.gst.prefix,
        contacts,
        invoices,
    );
    await createInChunks(notes, (data) =>
        prisma.contactNote.createMany({ data }),
    );
    const traffic = await writeTraffic(prisma, b, {
        now,
        days: 92,
        paths: DK_PATHS,
        trendBase: 55,
        trendSlope: 0.08,
        weekendFactor: 0.45,
        dayWeight: extra,
    });

    console.log(
        `[showcase] ${DK_NAME}: ${people.length} contacts, ${leads.length} leads, ` +
            `${bookings.length} bookings, ${packs.purchases.length} Flexi 10 packs, ` +
            `${memberships.subscriptions.length} memberships, ${shop.orders.length} orders, ` +
            `${written.issued} invoices issued, ${posts} posts, ${traffic} traffic rows`,
    );
    return { id: orgId, name: DK_NAME, prefix: sid("") };
}

/** "Tue 13 Oct", in Kolkata. */
function dayLabel(at: Date): string {
    const local = new Date(at.getTime() + 330 * 60_000);
    const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][
        local.getUTCDay()
    ];
    const month = [
        "Jan",
        "Feb",
        "Mar",
        "Apr",
        "May",
        "Jun",
        "Jul",
        "Aug",
        "Sep",
        "Oct",
        "Nov",
        "Dec",
    ][local.getUTCMonth()];
    const hh = String(local.getUTCHours()).padStart(2, "0");
    const mm = String(local.getUTCMinutes()).padStart(2, "0");
    return `${day} ${local.getUTCDate()} ${month}, ${hh}:${mm}`;
}

/** What the front desk has written down about members. */
function memberNotes(
    b: Business,
    now: Date,
    members: readonly number[],
    firstSeen: readonly Date[],
): Prisma.ContactNoteCreateManyInput[] {
    const bodies = [
        "Desk 7, by the window. Brings a second monitor — gave a power strip.",
        "Virtual office: GST certificate uses our address. Invoices in the company name, GSTIN on file.",
        "Locker 14 (large). Lost the key once in August — ₹300 charged.",
        "Courier from the Income Tax department received for them; scanned and emailed the same day.",
        "Works US hours on Tuesdays and Thursdays — key card enabled for 24×7.",
        "Wants the Sahyadri Room every Friday 4–6 for a client review. Book two slots each week.",
        "Pausing for November — travelling to Goa for a project. Resume on the 1st.",
        "Asked about moving from hot desk to a dedicated desk when desk 12 frees up.",
        "Records the podcast in the booth on Thursdays. Prefers the 7 pm slot.",
        "Prefers invoices on email to accounts@ their company, not to her personal email.",
        "Brings a guest most Mondays (co-founder). Reminded about the two-hour rule.",
        "Café tab: added to the monthly invoice, as agreed.",
    ];
    const rng = rngFor(b.sid(""), "notes");
    return bodies.map((body, k) => {
        const contact = members[(k * 3) % members.length];
        const at = earliest(
            addMinutes(firstSeen[contact], rng.int(2 * 24 * 60, 30 * 24 * 60)),
            addMinutes(now, -(k + 1) * 6 * 60),
        );
        const by = k % 3 === 0 ? b.users.rhea : b.users.omkar;
        return {
            id: b.sid("note", k),
            organizationId: b.orgId,
            contactId: b.sid("contact", contact),
            body,
            createdByUserId: by,
            updatedByUserId: by,
            createdAt: at,
            updatedAt: at,
        };
    });
}

// --- Check ------------------------------------------------------------------

export interface Desk42Counts {
    bookings: string;
    memberships: string;
    failedRenewals: number;
    flexiPacks: string;
    orders90: number;
    moneyEvents90: number;
    payingContacts: number;
    products: string;
    posts: string;
}

type Row = Record<string, unknown>;
const one = (rows: Row[]) => Number(rows[0]?.n ?? 0);

/** Every state the coworking demo shows; the run stops if one is missing. */
export async function checkDesk42(
    prisma: Db,
    orgId: string,
    now: Date,
): Promise<Desk42Counts> {
    const at = now.toISOString();
    const since = new Date(now.getTime() - 90 * DAY).toISOString();
    const where = { organizationId: orgId };
    const byService = await prisma.$queryRaw<Row[]>`
        SELECT s.name, COUNT(*) AS n,
               COUNT(*) FILTER (WHERE b."startAt" > ${at}::timestamp AND b.status = 'CONFIRMED') AS upcoming,
               COUNT(*) FILTER (WHERE b."paidWith" = 'PACK') AS pack
        FROM "Booking" b JOIN "Service" s ON s.id = b."serviceId"
        WHERE b."organizationId" = ${orgId} GROUP BY s.name ORDER BY s.name`;
    const subs = await prisma.customerSubscription.groupBy({
        by: ["status"],
        where,
        _count: true,
    });
    const status: Record<string, number | undefined> = Object.fromEntries(
        subs.map((s) => [s.status, s._count]),
    );
    const [productCount, variantCount] = await Promise.all([
        prisma.product.count({ where }),
        prisma.productVariant.count({ where: { product: where } }),
    ]);
    const postRows = await prisma.$queryRaw<Row[]>`
        SELECT pc.name, COUNT(*) AS n, bool_and(p.content LIKE '%<img%') AS pictured
        FROM "Post" p JOIN "PostCategory" pc ON pc.id = p."categoryId"
        JOIN "Site" s ON s.id = p."siteId"
        WHERE s."organizationId" = ${orgId} AND p."currentPublicationId" IS NOT NULL
        GROUP BY pc.name ORDER BY pc.name`;
    const counts: Desk42Counts = {
        bookings: byService
            .map(
                (r) =>
                    `${String(r.name).split(" —")[0]} ${Number(r.n)} (${Number(r.upcoming)} ahead)`,
            )
            .join(", "),
        memberships: subs
            .map((s) => `${s._count} ${s.status.toLowerCase()}`)
            .join(", "),
        failedRenewals: one(
            await prisma.$queryRaw<Row[]>`
            SELECT COUNT(*) AS n FROM "CustomerSubscription" cs
            JOIN LATERAL (
                SELECT i.* FROM "Invoice" i
                WHERE i."subscriptionId" = cs.id AND i.status <> 'VOID'
                ORDER BY i."periodStart" DESC LIMIT 1
            ) latest ON true
            WHERE cs."organizationId" = ${orgId} AND cs.status = 'ACTIVE'
              AND latest.status = 'ISSUED' AND latest."dueAt" < ${at}::timestamp
              AND latest."createdByUserId" IS NULL`,
        ),
        flexiPacks: `${await prisma.packPurchase.count({ where })} sold, ${await prisma.packRedemption.count({ where: { ...where, reversedAt: null } })} passes spent`,
        orders90: await prisma.order.count({
            where: { ...where, createdAt: { gte: new Date(since) } },
        }),
        moneyEvents90: one(
            await prisma.$queryRaw<Row[]>`
            SELECT (SELECT COUNT(*) FROM "Order" WHERE "organizationId" = ${orgId}
                      AND "createdAt" >= ${since}::timestamp)
                 + (SELECT COUNT(*) FROM "Invoice" WHERE "organizationId" = ${orgId}
                      AND "issuedAt" >= ${since}::timestamp)
                 + (SELECT COUNT(*) FROM "Booking" WHERE "organizationId" = ${orgId}
                      AND "paidWith" = 'PACK' AND "createdAt" >= ${since}::timestamp) AS n`,
        ),
        payingContacts: one(
            await prisma.$queryRaw<Row[]>`
            SELECT COUNT(DISTINCT c) AS n FROM (
                SELECT "contactId" AS c FROM "Invoice"
                WHERE "organizationId" = ${orgId} AND status = 'PAID'
                UNION
                SELECT l."contactId" FROM "CustomerIdentityLink" l
                JOIN "Order" o ON o."customerId" = l."customerId"
                WHERE l."organizationId" = ${orgId} AND o."paymentStatus" = 'PAID'
            ) x`,
        ),
        products: `${productCount} products, ${variantCount} variants`,
        posts: postRows
            .map((r) => `${Number(r.n)} ${String(r.name).toLowerCase()}`)
            .join(", "),
    };
    const upcoming = (name: string) =>
        byService.some(
            (r) => String(r.name).startsWith(name) && Number(r.upcoming) > 0,
        );
    const postCounts = postRows.map((r) => Number(r.n));
    requireStates(DK_NAME, {
        "day passes ahead": upcoming("Day pass"),
        "the meeting room booked ahead": upcoming("The Sahyadri Room"),
        "the booth booked ahead": upcoming("Call & podcast booth"),
        "day passes paid from a Flexi 10": byService.some(
            (r) => Number(r.pack) > 0,
        ),
        "memberships on the go":
            (status.ACTIVE ?? 0) + (status.PAUSED ?? 0) >= 34,
        "members who left": (status.CANCELLED ?? 0) >= 18,
        "a paused membership": (status.PAUSED ?? 0) >= 1,
        "a failed renewal": counts.failedRenewals >= 1,
        "a membership ending at the period's end":
            (await prisma.customerSubscription.count({
                where: { ...where, cancelAtPeriodEnd: true },
            })) >= 1,
        "about 150 sales a month": counts.moneyEvents90 >= 420,
        "about 100 paying customers": counts.payingContacts >= 95,
        "at most 25 products": productCount <= 25,
        "café drinks by size": variantCount >= 10,
        "24–30 posts, 8 in each category, each with a picture":
            postCounts.length === 3 &&
            postCounts.every((n) => n >= 8) &&
            postCounts.reduce((s, n) => s + n, 0) >= 24 &&
            postRows.every((r) => r.pictured === true),
        "site traffic":
            (await prisma.analyticsDailyAggregate.count({ where })) > 150,
        "QR scans": (await prisma.qrScanDay.count({ where })) > 50,
    });
    return counts;
}
