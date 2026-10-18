import type { Prisma } from "@prisma/client";

import type { SeedSection, SeedSite } from "../data";
import type { Db } from "../helpers";
import { listProductAt, setStockLevel, writeSite } from "../helpers";
import { seedPlanId } from "../pricing";
import { seedStandInPaymentProvider } from "../stand-in-providers";
import { gstin } from "./bakery";
import { TIMEZONE } from "./data";
import type {
    DocLine,
    DocSpec,
    DsWorld,
    PlacedProduct,
} from "./diary-shop-plan";
import {
    dsId,
    financialYear,
    localIso,
    PAST_DAYS,
    planDiaryShop,
    rupees,
} from "./diary-shop-plan";
import type { DsBusiness, DsSiteSection } from "./diary-shop-types";
import { istAt, minuteOf } from "./people";
import { createRng } from "./random";

/**
 * Write a diary-and-counter business (Gulmohar Salon & Bridal, Stride Physio)
 * from its fixture: owned by `demo@saroh.dev`, with a desk login as a
 * Member, a published site with its journal, the services and who takes
 * them, packs and memberships, a counter's catalogue with photos and stock.
 *
 * STRUCTURE — the business, team, modules, storefront, site, services,
 * staff and their weeks, booking rules, packs, plans and products — is
 * upserted on seeded ids. VOLUME — everything `planDiaryShop` dates from
 * `now` — is cleared and written again each run, so a re-run inside the same
 * half hour writes the same rows. Posts are written once and kept.
 */

const CURRENCY = "INR";

export interface DiaryShopContext {
    prisma: Db;
    now: Date;
    demoUserId: string;
    deskUserId: string;
}

export async function seedDiaryShop(
    ctx: DiaryShopContext,
    biz: DsBusiness,
): Promise<{ id: string; name: string; prefix: string }> {
    const { prisma, now, demoUserId, deskUserId } = ctx;
    const sid = (...parts: (string | number)[]) => dsId(biz.key, ...parts);
    const orgId = sid("org");
    const storeId = sid("store");
    const createdAt = istAt(now, -biz.sinceDays, 10 * 60);

    // --- the business, its standing, team, modules and plan ----------------------
    await prisma.organization.upsert({
        where: { slug: biz.slug },
        update: { name: biz.name },
        create: { id: orgId, name: biz.name, slug: biz.slug, createdAt },
    });
    const profile = {
        legalName: biz.legalName,
        country: "India",
        taxId: biz.gst ? gstin(biz.gst.state, biz.gst.pan) : null,
        contactEmail: biz.contactEmail,
        timezone: TIMEZONE,
        gstRegistered: biz.gst !== null,
        gstState: biz.gst?.state ?? null,
        ...biz.address,
        invoicePrefix: biz.gst?.prefix ?? null,
        phone: biz.phoneE164,
    };
    await prisma.businessProfile.upsert({
        where: { organizationId: orgId },
        update: profile,
        create: { id: sid("profile"), organizationId: orgId, ...profile },
    });
    const membershipIds: Record<string, string> = {};
    for (const [userId, role, key] of [
        [demoUserId, "OWNER", "demo"],
        [deskUserId, "MEMBER", "desk"],
    ] as const) {
        const m = await prisma.membership.upsert({
            where: { organizationId_userId: { organizationId: orgId, userId } },
            update: { role },
            create: {
                id: sid("membership", key),
                organizationId: orgId,
                userId,
                role,
            },
            select: { id: true },
        });
        membershipIds[key] = m.id;
    }
    for (const moduleKey of biz.modules) {
        await prisma.organizationModule.upsert({
            where: {
                organizationId_moduleKey: { organizationId: orgId, moduleKey },
            },
            update: { status: "ENABLED" },
            create: {
                id: sid("module", moduleKey.toLowerCase()),
                organizationId: orgId,
                moduleKey,
                status: "ENABLED",
                enabledAt: createdAt,
                enabledByUserId: demoUserId,
            },
        });
        const flagKey = `MODULE_${moduleKey}`;
        await prisma.featureFlagOverride.upsert({
            where: {
                flagKey_organizationId: { flagKey, organizationId: orgId },
            },
            update: { enabled: true },
            create: {
                id: sid("flagoverride", moduleKey.toLowerCase()),
                flagKey,
                organizationId: orgId,
                enabled: true,
            },
        });
    }
    const planId = await seedPlanId(prisma, now);
    await prisma.subscription.upsert({
        where: { organizationId: orgId },
        update: { planId, status: "ACTIVE" },
        create: {
            id: sid("subscription"),
            organizationId: orgId,
            planId,
            status: "ACTIVE",
            currentPeriodEnd: istAt(now, 30, 9 * 60),
        },
    });
    // Online payment on the booking page; placeholders on this machine only.
    await seedStandInPaymentProvider(prisma, {
        id: sid("payments", "razorpay"),
        organizationId: orgId,
        provider: "RAZORPAY",
    });

    // --- the storefront: the counter, and where treatments are sold ---------------
    await prisma.store.upsert({
        where: { id: storeId },
        update: { name: biz.name, organizationId: orgId, deletedAt: null },
        create: {
            id: storeId,
            organizationId: orgId,
            name: biz.name,
            description: biz.storeDescription,
            createdAt,
        },
    });
    await prisma.storeOwner.upsert({
        where: { storeId_userId: { storeId, userId: demoUserId } },
        update: { role: "OWNER" },
        create: {
            id: sid("storeowner"),
            storeId,
            userId: demoUserId,
            role: "OWNER",
        },
    });
    const settings = {
        currency: CURRENCY,
        timezone: TIMEZONE,
        kind: "SHOP",
        address: biz.storeAddress,
        openingHours: biz.openingHours.map((d) => ({ ...d })),
        collectionEnabled: true,
        shippingEnabled: false,
        taxEnabled: biz.gst !== null,
    };
    await prisma.storeSettings.upsert({
        where: { storeId },
        update: settings,
        create: { id: sid("storesettings"), storeId, ...settings },
    });
    await prisma.storeFeatures.upsert({
        where: { storeId },
        update: { ecommerceEnabled: false, blogsEnabled: true },
        create: {
            id: sid("storefeatures"),
            storeId,
            ecommerceEnabled: false,
            blogsEnabled: true,
        },
    });

    // Volume first, so nothing below trips over last run's rows.
    await clearVolume(prisma, sid(""));

    // --- the site, then the services it offers ------------------------------------
    const svcIndex = new Map(biz.services.map((s, i) => [s.key, i]));
    const toSeedSection = (s: DsSiteSection): SeedSection => {
        const section: Record<string, unknown> = {
            type: s.type,
            content: s.content,
        };
        if (s.type === "servicesList") {
            section.services = (s.services ?? []).map((k) => {
                const i = svcIndex.get(k);
                if (i === undefined)
                    throw new Error(`${biz.name}: no service "${k}"`);
                return i;
            });
        }
        if (s.form) section.form = s.form;
        // The contract parses every section on write (`writeSite`).
        return section as unknown as SeedSection;
    };
    const site: SeedSite = {
        slug: biz.slug,
        name: biz.name,
        subdomain: biz.slug,
        published: true,
        createdDaysAgo: biz.site.createdDaysAgo,
        pages: biz.site.pages.map((p) => ({
            path: p.path,
            title: p.title,
            isHome: p.isHome,
            sections: p.sections.map(toSeedSection),
        })),
    };
    const siteId = await writeSite(prisma, {
        fixture: site,
        orgId,
        userId: demoUserId,
        now,
        ids: {
            site: sid("site"),
            page: (p) => sid("page", p),
            pageVersion: (p) => sid("pageversion", p),
            section: (p, n) => sid("section", p, n),
            sectionKey: (p, n) => sid("sectionkey", p, n),
            // One enquiry form on the site: its entries name it.
            form: () => sid("form", "enquiry"),
            publication: sid("publication"),
        },
        pipelineId: null,
        serviceId: (i) => sid("service", biz.services[i].key),
        footer: { format: "text", value: biz.site.footer },
    });
    for (let i = 0; i < biz.services.length; i++) {
        const s = biz.services[i];
        const data = {
            name: s.name,
            description: s.description,
            durationMinutes: s.minutes,
            bufferBeforeMinutes: s.buffer ?? 0,
            bufferAfterMinutes: s.buffer ?? 0,
            capacity: 1,
            priceCents: s.pricePaise,
            currency: CURRENCY,
            gstRate: biz.gst ? String(biz.gst.serviceRateBps / 100) : "0",
            sacCode: biz.gst?.sac ?? biz.sac,
            gstPriceMode: biz.gst ? "INCLUDED" : null,
            status: "ACTIVE",
            deletedAt: null,
            locationType: s.locationType,
            meetingUrl: s.meetingUrl,
            visits: s.visits,
            depositMode: s.depositMode,
            showOnBookingPage: s.shown,
            siteId: s.shown ? siteId : null,
        };
        await prisma.service.upsert({
            where: { id: sid("service", s.key) },
            update: data,
            create: {
                id: sid("service", s.key),
                organizationId: orgId,
                timezone: TIMEZONE,
                // A minute apart, in fixture order: the booking page lists
                // services by when they were made.
                createdAt: new Date(createdAt.getTime() + i * 60_000),
                ...data,
            },
        });
    }

    // --- who is on the diary, what each takes, their weeks, the rules ------------
    const staffIds = biz.staff.map((s) => sid("staff", s.key));
    for (let i = 0; i < biz.staff.length; i++) {
        const s = biz.staff[i];
        const membershipId =
            s.key === biz.ownerStaff
                ? membershipIds.demo
                : s.key === biz.desk.staff
                  ? membershipIds.desk
                  : null;
        const data = {
            name: s.name,
            title: s.title,
            status: "ACTIVE",
            archivedAt: null,
            membershipId,
        };
        await prisma.staffMember.upsert({
            where: { id: staffIds[i] },
            update: data,
            create: {
                id: staffIds[i],
                organizationId: orgId,
                ...data,
                createdAt,
            },
        });
    }
    await prisma.staffService.deleteMany({
        where: { staffId: { in: staffIds } },
    });
    await prisma.staffHours.deleteMany({
        where: { staffId: { in: staffIds } },
    });
    await prisma.staffService.createMany({
        data: biz.staff.flatMap((s, i) =>
            s.services.map((k) => ({
                id: sid("staffservice", s.key, k),
                organizationId: orgId,
                staffId: staffIds[i],
                serviceId: sid("service", k),
                createdAt,
            })),
        ),
    });
    await prisma.staffHours.createMany({
        data: biz.staff.flatMap((s, i) =>
            s.hours.flatMap((w, k) =>
                w.days.map((dayOfWeek) => ({
                    id: sid("staffhours", s.key, k, dayOfWeek),
                    organizationId: orgId,
                    staffId: staffIds[i],
                    dayOfWeek,
                    startMinute: minuteOf(w.from),
                    endMinute: minuteOf(w.to),
                    createdAt,
                })),
            ),
        ),
    });
    await prisma.bookingRules.upsert({
        where: { organizationId: orgId },
        update: { ...biz.rules },
        create: {
            id: sid("bookingrules"),
            organizationId: orgId,
            ...biz.rules,
            createdAt,
        },
    });

    // --- packs and memberships: the catalogue ---------------------------------------
    const rate = biz.gst ? String(biz.gst.serviceRateBps / 100) : null;
    const code = biz.gst?.sac ?? null;
    for (const pack of biz.packs) {
        const data = {
            name: pack.name,
            description: pack.description,
            credits: pack.credits,
            validityDays: pack.validityDays,
            price: rupees(pack.pricePaise),
            currency: CURRENCY,
            status: "ACTIVE",
            kind: "ONE_TO_ONE",
            gstRate: rate,
            sacCode: code,
        };
        await prisma.classPack.upsert({
            where: { id: sid("pack", pack.key) },
            update: data,
            create: {
                id: sid("pack", pack.key),
                organizationId: orgId,
                ...data,
                createdAt,
            },
        });
    }
    await prisma.classPackService.deleteMany({
        where: { packId: { in: biz.packs.map((p) => sid("pack", p.key)) } },
    });
    await prisma.classPackService.createMany({
        data: biz.packs.flatMap((p) =>
            p.services.map((k) => ({
                packId: sid("pack", p.key),
                serviceId: sid("service", k),
                organizationId: orgId,
            })),
        ),
    });
    for (const plan of biz.plans) {
        const data = {
            name: plan.name,
            description: plan.description,
            price: rupees(plan.pricePaise),
            currency: CURRENCY,
            interval: "MONTH",
            classesPerMonth: plan.classesPerMonth,
            status: "ACTIVE",
            gstRate: rate,
            sacCode: code,
        };
        await prisma.subscriptionPlan.upsert({
            where: { id: sid("plan", plan.key) },
            update: data,
            create: {
                id: sid("plan", plan.key),
                organizationId: orgId,
                ...data,
                createdAt,
            },
        });
    }

    // --- the counter's catalogue -------------------------------------------------------
    const placed = await writeCatalogue(prisma, biz, { orgId, storeId, now });

    // --- the dated world -------------------------------------------------------------------
    const world = planDiaryShop(
        { biz, now, orgId, storeId, ownerUserId: demoUserId, deskUserId },
        placed,
    );
    await writeWorld(prisma, biz, orgId, world);
    await writePosts(prisma, biz, { orgId, siteId, now, authorId: demoUserId });
    await writeAnalytics(prisma, biz, { orgId, now, world });

    console.log(
        `[showcase] ${biz.name}: ${world.contacts.length} contacts, ${world.bookings.length} bookings, ` +
            `${world.orders.length} orders, ${world.purchases.length} packs, ` +
            `${world.subscriptions.length} memberships, ${world.docs.length} invoices, ` +
            `${biz.posts.length} posts`,
    );
    return { id: orgId, name: biz.name, prefix: sid("") };
}

/** Everything dated, children first. Rows added by hand have no seed id. */
async function clearVolume(prisma: Db, prefix: string) {
    const where = { id: { startsWith: prefix } };
    await prisma.paymentAttempt.deleteMany({ where });
    await prisma.paymentIntent.deleteMany({ where });
    await prisma.invoiceLine.deleteMany({ where });
    await prisma.invoice.deleteMany({ where });
    await prisma.packRedemption.deleteMany({ where });
    await prisma.productReview.deleteMany({ where });
    await prisma.reviewInvitation.deleteMany({ where });
    await prisma.contactAttention.deleteMany({
        where: { OR: [where, { contactId: { startsWith: prefix } }] },
    });
    await prisma.contactNote.deleteMany({ where });
    await prisma.bookingEvent.deleteMany({ where });
    await prisma.booking.deleteMany({ where });
    await prisma.orderItem.deleteMany({ where });
    await prisma.order.deleteMany({ where });
    await prisma.customerIdentityLink.deleteMany({ where });
    await prisma.customer.deleteMany({ where });
    await prisma.packPurchase.deleteMany({ where });
    await prisma.customerSubscription.deleteMany({ where });
    await prisma.submission.deleteMany({ where });
    await prisma.contact.deleteMany({ where });
    await prisma.staffTimeOff.deleteMany({ where });
    await prisma.businessClosure.deleteMany({ where });
    await prisma.analyticsDailyAggregate.deleteMany({ where });
}

async function writeCatalogue(
    prisma: Db,
    biz: DsBusiness,
    a: { orgId: string; storeId: string; now: Date },
): Promise<PlacedProduct[]> {
    const { orgId, storeId, now } = a;
    const sid = (...parts: (string | number)[]) => dsId(biz.key, ...parts);
    const categoryId: Record<string, string> = {};
    for (const c of biz.categories) {
        const row = await prisma.category.upsert({
            where: {
                organizationId_slug: { organizationId: orgId, slug: c.key },
            },
            update: { name: c.name },
            create: {
                id: sid("category", c.key),
                organizationId: orgId,
                name: c.name,
                slug: c.key,
            },
        });
        categoryId[c.key] = row.id;
    }
    const optionId: Record<string, string> = {};
    const valueId = new Map<string, string>();
    for (let i = 0; i < biz.options.length; i++) {
        const o = biz.options[i];
        const row = await prisma.productOption.upsert({
            where: {
                organizationId_name: { organizationId: orgId, name: o.name },
            },
            update: { position: i },
            create: {
                id: sid("option", o.key),
                organizationId: orgId,
                name: o.name,
                position: i,
            },
        });
        optionId[o.key] = row.id;
        for (let j = 0; j < o.values.length; j++) {
            const value = o.values[j];
            const v = await prisma.productOptionValue.upsert({
                where: { optionId_value: { optionId: row.id, value } },
                update: { position: j },
                create: {
                    id: sid("optionvalue", o.key, j),
                    optionId: row.id,
                    organizationId: orgId,
                    value,
                    position: j,
                },
            });
            valueId.set(`${o.key}:${value}`, v.id);
        }
    }

    const placed: PlacedProduct[] = [];
    for (let i = 0; i < biz.products.length; i++) {
        const p = biz.products[i];
        const productId = sid("product", i);
        const data = {
            name: p.name,
            description: paragraphs(p.description),
            price: p.price,
            mrp: p.mrp,
            currency: CURRENCY,
            status: "PUBLISHED",
            categoryId: categoryId[p.category] ?? null,
            optionId: p.option ? (optionId[p.option] ?? null) : null,
            howToUse: p.howToUse,
            materials: p.materials,
            keyPoints: p.keyPoints,
            madeHere: false,
            maker: p.maker,
            madeIn: p.madeIn,
            gstRate: biz.gst ? String(p.gstRate) : null,
            hsnCode: biz.gst ? p.hsnCode : null,
            gstPriceMode: biz.gst ? "INCLUDED" : null,
            image: p.images.at(0)?.url ?? null,
            shopFields: {
                howToUse: true,
                materials: true,
                keyPoints: true,
                maker: true,
            },
        };
        await prisma.product.upsert({
            where: { id: productId },
            update: data,
            create: {
                id: productId,
                storeId,
                organizationId: orgId,
                slug: p.slug,
                createdAt: istAt(now, -(140 - i * 2), 11 * 60),
                ...data,
            },
        });
        // Photos rewritten whole, in order; the first is the cover.
        await prisma.productVariant.updateMany({
            where: { productId },
            data: { imageId: null },
        });
        await prisma.product.update({
            where: { id: productId },
            data: { seoImageId: null },
        });
        await prisma.productImage.deleteMany({ where: { productId } });
        const imageIds = p.images.map((_, k) => sid("image", i, k));
        await prisma.productImage.createMany({
            data: p.images.map((img, k) => ({
                id: imageIds[k],
                productId,
                organizationId: orgId,
                url: img.url,
                alt: img.alt,
                width: img.width,
                height: img.height,
                position: k,
                creditName: img.creditName,
                creditUrl: img.creditUrl,
            })),
        });

        if (p.variants.length === 0) {
            await prisma.stockLevel.deleteMany({
                where: { storeId, productId, variantId: { not: null } },
            });
            await listProductAt(prisma, {
                id: sid("listing", i),
                orgId,
                storeId,
                productId,
            });
            const stock = p.stock ?? { onHand: 0, warnAt: 3 };
            const stockLevelId = await setStockLevel(prisma, {
                id: sid("stocklevel", i),
                orgId,
                storeId,
                productId,
                onHand: stock.onHand,
                promised: 0,
                lowStockAlert: stock.warnAt,
            });
            placed.push({
                productId,
                variantIds: [],
                stockLevelId,
                variantStock: [],
            });
            continue;
        }
        await prisma.stockLevel.deleteMany({
            where: { storeId, productId, variantId: null },
        });
        const variantIds: string[] = [];
        for (let j = 0; j < p.variants.length; j++) {
            const v = p.variants[j];
            const variantId = sid("variant", i, j);
            const vdata = {
                sku: v.sku,
                title: v.title,
                price: v.price,
                mrp: v.mrp,
                position: j,
                image: v.image ?? null,
                optionValueId: p.option
                    ? (valueId.get(`${p.option}:${v.title}`) ?? null)
                    : null,
                imageId:
                    v.imageIndex === null
                        ? null
                        : (imageIds.at(v.imageIndex) ?? null),
            };
            await prisma.productVariant.upsert({
                where: { id: variantId },
                update: vdata,
                create: { id: variantId, productId, ...vdata },
            });
            variantIds.push(variantId);
        }
        await listProductAt(prisma, {
            id: sid("listing", i),
            orgId,
            storeId,
            productId,
            variants: variantIds.map((variantId, j) => ({
                id: sid("listingvariant", i, j),
                variantId,
            })),
        });
        const variantStock: string[] = [];
        for (let j = 0; j < p.variants.length; j++) {
            const v = p.variants[j];
            variantStock.push(
                await setStockLevel(prisma, {
                    id: sid("stocklevel", i, j),
                    orgId,
                    storeId,
                    productId,
                    variantId: variantIds[j],
                    onHand: v.stock.onHand,
                    promised: 0,
                    lowStockAlert: v.stock.warnAt,
                }),
            );
        }
        placed.push({
            productId,
            variantIds,
            stockLevelId: null,
            variantStock,
        });
    }
    return placed;
}

async function writeWorld(
    prisma: Db,
    biz: DsBusiness,
    orgId: string,
    w: DsWorld,
) {
    const chunks = async <T>(
        rows: T[],
        write: (data: T[]) => Promise<unknown>,
    ) => {
        for (let k = 0; k < rows.length; k += 1000)
            await write(rows.slice(k, k + 1000));
    };
    await prisma.businessClosure.createMany({ data: w.closures });
    await prisma.staffTimeOff.createMany({ data: w.timeOff });
    await chunks(w.contacts, (data) => prisma.contact.createMany({ data }));
    await chunks(w.customers, (data) => prisma.customer.createMany({ data }));
    await chunks(w.links, (data) =>
        prisma.customerIdentityLink.createMany({ data }),
    );
    await prisma.packPurchase.createMany({ data: w.purchases });
    await chunks(w.subscriptions, (data) =>
        prisma.customerSubscription.createMany({ data }),
    );
    await chunks(w.orders, (data) => prisma.order.createMany({ data }));
    await chunks(w.items, (data) => prisma.orderItem.createMany({ data }));
    await chunks(w.bookings, (data) => prisma.booking.createMany({ data }));
    await chunks(w.events, (data) => prisma.bookingEvent.createMany({ data }));
    await chunks(w.redemptions, (data) =>
        prisma.packRedemption.createMany({ data }),
    );
    await prisma.reviewInvitation.createMany({ data: w.invitations });
    await prisma.productReview.createMany({ data: w.reviews });
    await prisma.contactAttention.createMany({ data: w.attention });
    await prisma.contactNote.createMany({ data: w.notes });
    await prisma.submission.createMany({ data: w.submissions });
    await writeDocuments(prisma, biz, orgId, w.docs);
    await chunks(w.intents, (data) =>
        prisma.paymentIntent.createMany({ data }),
    );
    await chunks(w.attempts, (data) =>
        prisma.paymentAttempt.createMany({ data }),
    );
    // What open orders hold, on each shelf.
    for (const [stockLevelId, qty] of Array.from(w.held.entries())) {
        await prisma.stockLevel.update({
            where: { id: stockLevelId },
            data: { promised: qty },
        });
    }
}

interface TaxedLine extends DocLine {
    amount: number;
    taxable: number;
    cgst: number;
    sgst: number;
}

/** GST inside an inclusive line: taxable rounded to the paisa, odd paisa to CGST. */
function taxLine(l: DocLine): TaxedLine {
    const amount = l.quantity * l.unitPaise;
    const bps = l.rateBps ?? 0;
    const taxable =
        bps <= 0 ? amount : Math.round((amount * 10_000) / (10_000 + bps));
    const tax = amount - taxable;
    const sgst = Math.floor(tax / 2);
    return { ...l, amount, taxable, cgst: tax - sgst, sgst };
}

/**
 * Number every document in its series in the order it was issued, then write
 * the invoices, their lines and each series' counter. A registered business
 * issues tax invoices (GS/26-27/0001…); one that is not issues receipts on
 * the plain series (INV-0001…). One issued by hand keeps its number; the seed
 * refuses rather than hand the same number out twice.
 */
async function writeDocuments(
    prisma: Db,
    biz: DsBusiness,
    orgId: string,
    docs: DocSpec[],
) {
    const prefix = dsId(biz.key, "");
    const gst = biz.gst;
    const seriesOf = (at: Date) =>
        gst ? `${gst.prefix}/${financialYear(at.getTime())}` : "INV";
    const numberOf = (series: string, n: number) =>
        gst
            ? `${series}/${String(n).padStart(4, "0")}`
            : `${series}-${String(n).padStart(4, "0")}`;
    const ordered = [...docs].sort(
        (a, b) =>
            a.issuedAt.getTime() - b.issuedAt.getTime() ||
            a.id.localeCompare(b.id),
    );
    const last = new Map<string, number>();
    const numbers = new Map<string, string>();
    for (const d of ordered) {
        const series = seriesOf(d.issuedAt);
        const n = (last.get(series) ?? 0) + 1;
        last.set(series, n);
        numbers.set(d.id, numberOf(series, n));
    }
    const byHand = await prisma.invoice.findMany({
        where: {
            organizationId: orgId,
            number: { not: null },
            NOT: { id: { startsWith: prefix } },
        },
        select: { number: true },
    });
    const handLast = new Map<string, number>();
    for (const { number } of byHand) {
        const m = /^(.*)[/-](\d+)$/.exec(number ?? "");
        if (!m) continue;
        const n = Number(m[2]);
        if (n <= (last.get(m[1]) ?? 0)) {
            throw new Error(
                `${biz.name} has an invoice issued by hand (${number}) that holds a number ` +
                    `the showcase needs. Run db:seed:reset, then seed again.`,
            );
        }
        handLast.set(m[1], Math.max(n, handLast.get(m[1]) ?? 0));
    }
    const printed = {
        sellerGstin: gst ? gstin(gst.state, gst.pan) : null,
        sellerState: gst?.state ?? null,
        sellerAddress: biz.addressPrinted,
        sellerName: biz.name,
        sellerLegalName: biz.legalName,
        sellerEmail: biz.contactEmail,
    };
    const invoices: Prisma.InvoiceCreateManyInput[] = [];
    const lines: Prisma.InvoiceLineCreateManyInput[] = [];
    for (const d of docs) {
        const taxed = d.lines.map(taxLine);
        const sum = (pick: (l: TaxedLine) => number) =>
            taxed.reduce((s, l) => s + pick(l), 0);
        const total = sum((l) => l.amount);
        const cgst = gst ? sum((l) => l.cgst) : 0;
        const sgst = gst ? sum((l) => l.sgst) : 0;
        const tax = cgst + sgst;
        invoices.push({
            id: d.id,
            organizationId: orgId,
            number: numbers.get(d.id) ?? null,
            status: d.status,
            kind: "INVOICE",
            source: d.source,
            bookingId: d.bookingId,
            orderId: d.orderId,
            packPurchaseId: d.packPurchaseId,
            subscriptionId: d.subscriptionId,
            periodStart: d.period?.start ?? null,
            periodEnd: d.period?.end ?? null,
            contactId: d.contactId,
            billToName: d.billToName,
            billToEmail: d.billToEmail,
            ...printed,
            placeOfSupply: gst?.state ?? null,
            taxType: gst ? "INTRA" : null,
            cgst: rupees(cgst),
            sgst: rupees(sgst),
            igst: "0.00",
            currency: CURRENCY,
            subtotal: rupees(total - tax),
            tax: rupees(tax),
            total: rupees(total),
            issuedAt: d.issuedAt,
            dueAt: d.dueAt,
            paidAt: d.paidAt,
            paymentMethod: d.paymentMethod,
            paymentReference: d.paymentReference,
            paymentNote: d.paymentNote,
            createdByUserId: d.createdByUserId,
            createdAt: d.createdAt,
            updatedAt: d.paidAt ?? d.issuedAt,
        });
        taxed.forEach((l, position) => {
            lines.push({
                id: `${d.id}_line_${position}`,
                organizationId: orgId,
                invoiceId: d.id,
                position,
                description: l.description,
                quantity: l.quantity,
                unitPrice: rupees(l.unitPaise),
                amount: rupees(l.amount),
                discount: "0.00",
                hsnSac: l.code,
                gstRate:
                    gst && l.rateBps !== null ? String(l.rateBps / 100) : null,
                taxableValue: gst ? rupees(l.taxable) : null,
                cgst: rupees(gst ? l.cgst : 0),
                sgst: rupees(gst ? l.sgst : 0),
                igst: "0.00",
                orderItemId: l.orderItemId ?? null,
            });
        });
    }
    for (let k = 0; k < invoices.length; k += 1000) {
        await prisma.invoice.createMany({ data: invoices.slice(k, k + 1000) });
    }
    for (let k = 0; k < lines.length; k += 1000) {
        await prisma.invoiceLine.createMany({ data: lines.slice(k, k + 1000) });
    }
    const series = Array.from(
        new Set([...Array.from(last.keys()), ...Array.from(handLast.keys())]),
    );
    await prisma.invoiceSequence.deleteMany({
        where: { organizationId: orgId, series: { notIn: series } },
    });
    const current = new Map(
        (
            await prisma.invoiceSequence.findMany({
                where: { organizationId: orgId },
                select: { series: true, lastNumber: true },
            })
        ).map((s) => [s.series, s.lastNumber]),
    );
    for (const s of series) {
        const lastNumber = Math.max(last.get(s) ?? 0, handLast.get(s) ?? 0);
        if (current.get(s) === lastNumber) continue;
        await prisma.invoiceSequence.upsert({
            where: {
                organizationId_series: { organizationId: orgId, series: s },
            },
            update: { lastNumber },
            create: { organizationId: orgId, series: s, lastNumber },
        });
    }
}

/**
 * The journal: its categories and posts, each published as the API's
 * publish writes it (`posts.service.ts`), with its category and author. A
 * post already live keeps its publication — a Publication is append-only.
 */
async function writePosts(
    prisma: Db,
    biz: DsBusiness,
    a: { orgId: string; siteId: string; now: Date; authorId: string },
) {
    const sid = (...parts: (string | number)[]) => dsId(biz.key, ...parts);
    const author = await prisma.user.findUnique({
        where: { id: a.authorId },
        select: { name: true },
    });
    const categories = new Map<
        string,
        { id: string; name: string; slug: string }
    >();
    for (const [slug, name] of Object.entries(biz.postCategories)) {
        const row = await prisma.postCategory.upsert({
            where: { siteId_slug: { siteId: a.siteId, slug } },
            update: { name },
            create: {
                id: sid("postcategory", slug),
                siteId: a.siteId,
                name,
                slug,
            },
        });
        categories.set(slug, { id: row.id, name, slug });
    }
    for (const p of biz.posts) {
        const category = categories.get(p.category);
        if (!category)
            throw new Error(`${biz.name}: no post category "${p.category}"`);
        const publishedAt = istAt(
            a.now,
            -p.daysAgo,
            10 * 60 + (p.slug.length % 6) * 10,
        );
        const data = {
            title: p.title,
            excerpt: p.excerpt,
            content: p.body,
            image: p.image.url,
            categoryId: category.id,
            status: "PUBLISHED",
            featured: false,
        };
        const post = await prisma.post.upsert({
            where: { siteId_slug: { siteId: a.siteId, slug: p.slug } },
            update: data,
            create: {
                id: sid("post", p.slug),
                siteId: a.siteId,
                authorId: a.authorId,
                slug: p.slug,
                publishedAt,
                createdAt: new Date(publishedAt.getTime() - 2 * 86_400_000),
                ...data,
            },
        });
        if (post.currentPublicationId) continue;
        const at = post.publishedAt ?? publishedAt;
        const path = `/blog/${p.slug}`;
        const publication = await prisma.publication.create({
            data: {
                id: sid("postpub", p.slug),
                siteId: a.siteId,
                organizationId: a.orgId,
                postId: post.id,
                path,
                snapshot: {
                    post: {
                        title: p.title,
                        slug: p.slug,
                        excerpt: p.excerpt,
                        content: p.body,
                        image: p.image.url,
                        featured: false,
                        category: { name: category.name, slug: category.slug },
                        author: author?.name ?? null,
                        publishedAt: at.toISOString(),
                    },
                    path,
                    publishedAt: at.toISOString(),
                },
                templateId: "post",
                templateVersion: 1,
                publishedByUserId: a.authorId,
                publishedAt: at,
            },
        });
        await prisma.post.update({
            where: { id: post.id },
            data: { currentPublicationId: publication.id, publishedAt: at },
        });
    }
}

/**
 * Insights' daily rollups (`analytics.service.ts` reads only these): site
 * views and visitors by day and by page, enquiries from the form's entries,
 * paid orders from the Order table — so the totals agree with the lists a
 * viewer clicks through to. Views follow the week, the season and the
 * bookings made on the site (a booking is a visit or three), and grow
 * slowly over the three months.
 */
async function writeAnalytics(
    prisma: Db,
    biz: DsBusiness,
    a: { orgId: string; now: Date; world: DsWorld },
) {
    const sid = (...parts: (string | number)[]) => dsId(biz.key, ...parts);
    const rng = createRng(0x5eed ^ (biz.key.length * 7919));
    const today = Date.UTC(
        a.now.getUTCFullYear(),
        a.now.getUTCMonth(),
        a.now.getUTCDate(),
    );
    const rows: Prisma.AnalyticsDailyAggregateCreateManyInput[] = [];
    const days = PAST_DAYS - 2;
    for (let i = 0; i < days; i++) {
        const date = new Date(today - (days - 1 - i) * 86_400_000);
        const iso = date.toISOString().slice(0, 10);
        const weekday = date.getUTCDay();
        const weekend = weekday === 0 || weekday === 6;
        const season = biz.diary.season(
            localIso(date.getTime() + 6 * 3_600_000),
        );
        const online = a.world.onlineByDay.get(iso) ?? 0;
        const base =
            biz.analytics.base *
            (1 + (biz.analytics.growth * i) / days) *
            (weekend ? biz.analytics.weekend : 1) *
            season *
            (0.82 + 0.36 * rng.next());
        const views = Math.max(
            12,
            Math.round(base + online * (18 + rng.int(0, 14))),
        );
        const visitors = Math.round(views * (0.6 + 0.12 * rng.next()));
        const row = (
            k: string,
            type: string,
            dimension: string,
            value: string,
            count: number,
            unique: number,
        ) => {
            if (count <= 0) return;
            rows.push({
                id: sid("agg", iso, k),
                organizationId: a.orgId,
                siteId: "",
                date,
                type,
                dimension,
                dimensionValue: value,
                count,
                uniqueCount: unique,
                createdAt: date,
                updatedAt: date,
            });
        };
        row("views", "site.view", "", "", views, visitors);
        row(
            "enquiries",
            "enquiry.submitted",
            "",
            "",
            a.world.entriesByDay.get(iso) ?? 0,
            0,
        );
        row("orders", "order.paid", "", "", a.world.paidByDay.get(iso) ?? 0, 0);
        let assigned = 0;
        const perPath = biz.analytics.paths.map((p) => {
            const count = Math.floor(
                views * p.weight * (0.85 + 0.3 * rng.next()),
            );
            return { path: p.path, count };
        });
        for (const p of perPath) assigned += p.count;
        // The home page takes what is left, so the pages add up to the views.
        const home = perPath.find((p) => p.path === "/");
        if (home) home.count = Math.max(0, home.count + views - assigned);
        for (const p of perPath) {
            row(
                `path${p.path.replace(/\W+/g, "-")}`,
                "site.view",
                "path",
                p.path,
                p.count,
                Math.min(p.count, Math.max(1, Math.round(p.count * 0.72))),
            );
        }
    }
    await prisma.analyticsDailyAggregate.createMany({ data: rows });
}

/** A description as HTML paragraphs — what the editor writes. */
function paragraphs(text: string): string {
    return text
        .split(/\n\s*\n/)
        .map((para) => para.trim())
        .filter(Boolean)
        .map(
            (para) =>
                `<p>${para.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>`,
        )
        .join("");
}
